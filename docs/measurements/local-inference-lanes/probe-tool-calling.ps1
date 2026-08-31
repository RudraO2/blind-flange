# Ticket 03 verification: will a 1.5B model emit a well-formed tool call?
#
# This is the highest-risk assumption in the spec. The harness's agent loop works by the model
# emitting tool calls; the replay cache never had this problem because the calls were authored
# by hand. Research said native `tools` + `tool_choice: required` + `parallel_tool_calls: false`
# is the answer and that grammar cannot be combined with tools. This proves it on the real model.
#
# Three probes:
#   1. one slot, confirming --parallel 1 took effect (read llama-swap's log alongside this)
#   2. a forced tool call against a schema shaped like our real `pwsh` tool
#   3. the same, streamed, because the adapter translates a stream and tool-call arguments
#      arrive as fragments to concatenate

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8080"

# Shaped after the harness's own pwsh tool: a command plus a human description.
$tools = @(
	@{
		type     = "function"
		function = @{
			name        = "pwsh"
			description = "Run a PowerShell command in the sandbox and return its output."
			parameters  = @{
				type       = "object"
				properties = @{
					command     = @{ type = "string"; description = "The PowerShell command to run." }
					description = @{ type = "string"; description = "One line describing what the command does." }
				}
				required   = @("command", "description")
			}
		}
	}
)

$prompt = "Compute the sum of the integers from 1 to 100, and verify the answer with an assertion that prints PASS or FAIL. Use the sandbox."

Write-Host "=== probe 1: plain turn (confirms one slot + measures resident latency) ==="
$plain = @{
	model = "bf-coder"; max_tokens = 32; temperature = 0
	messages = @(@{ role = "user"; content = "Reply with exactly: ready" })
} | ConvertTo-Json -Depth 6 -Compress
$t0 = Get-Date
$r = Invoke-RestMethod -Method Post "$base/v1/chat/completions" -ContentType "application/json" -Body $plain -TimeoutSec 600
Write-Host ("    {0:N2}s — {1}" -f ((Get-Date) - $t0).TotalSeconds, $r.choices[0].message.content.Trim())

Write-Host "`n=== probe 2: forced tool call, non-streamed ==="
$body = @{
	model                = "bf-coder"
	messages             = @(@{ role = "user"; content = $prompt })
	tools                = $tools
	tool_choice          = "required"
	parallel_tool_calls  = $false
	temperature          = 0
	max_tokens           = 400
} | ConvertTo-Json -Depth 10 -Compress

$t0 = Get-Date
$r = Invoke-RestMethod -Method Post "$base/v1/chat/completions" -ContentType "application/json" -Body $body -TimeoutSec 600
$elapsed = ((Get-Date) - $t0).TotalSeconds
$calls = $r.choices[0].message.tool_calls
Write-Host ("    {0:N2}s   finish_reason={1}   tool_calls={2}" -f $elapsed, $r.choices[0].finish_reason, @($calls).Count)

if (-not $calls) {
	Write-Host "    NO TOOL CALL — content was:"
	Write-Host "    $($r.choices[0].message.content)"
} else {
	foreach ($c in $calls) {
		Write-Host "    name: $($c.function.name)"
		Write-Host "    raw arguments: $($c.function.arguments)"
		try {
			$parsed = $c.function.arguments | ConvertFrom-Json
			Write-Host "    VALID JSON. command = $($parsed.command)"
			Write-Host "                description = $($parsed.description)"
			if ($parsed.command) {
				Write-Host "    --- executing what the model asked for ---"
				$out = & pwsh -NoProfile -Command $parsed.command 2>&1 | Out-String
				Write-Host "    sandbox output: $($out.Trim())"
			}
		} catch {
			Write-Host "    INVALID JSON — this is the failure mode the spec's escape hatch exists for."
		}
	}
}

Write-Host "`n=== probe 3: same, streamed (the path the adapter actually uses) ==="
$streamBody = ($body | ConvertFrom-Json)
$streamBody | Add-Member -NotePropertyName stream -NotePropertyValue $true -Force
$json = $streamBody | ConvertTo-Json -Depth 10 -Compress

# curl so we see raw SSE framing rather than something a client has already normalised.
# Body via a temp file: PowerShell has no heredoc, and inline JSON gets mangled by quoting.
$tmp = Join-Path $env:TEMP "bf-stream-probe.json"
Set-Content -Path $tmp -Value $json -Encoding utf8 -NoNewline
$raw = & curl.exe -s -N -X POST "$base/v1/chat/completions" -H "Content-Type: application/json" --data-binary "@$tmp" 2>&1
Remove-Item $tmp -ErrorAction SilentlyContinue
$lines = ($raw -split "`n")
Write-Host "    SSE lines received: $($lines.Count)"
Write-Host "    comment lines (start with ':'): $((@($lines | Where-Object { $_.TrimStart().StartsWith(':') })).Count)"
Write-Host "    [DONE] sentinel present: $([bool](@($lines | Where-Object { $_ -match '\[DONE\]' })).Count)"
$argFragments = @()
foreach ($line in $lines) {
	if (-not $line.StartsWith("data: ")) { continue }
	$payload = $line.Substring(6).Trim()
	if ($payload -eq "[DONE]") { continue }
	try { $chunk = $payload | ConvertFrom-Json } catch { continue }
	$delta = $chunk.choices[0].delta
	if ($delta.tool_calls) {
		foreach ($tc in $delta.tool_calls) {
			if ($null -ne $tc.function.arguments) { $argFragments += $tc.function.arguments }
		}
	}
}
Write-Host "    tool-call argument fragments: $($argFragments.Count)"
$joined = -join $argFragments
Write-Host "    concatenated: $joined"
try {
	$joined | ConvertFrom-Json | Out-Null
	Write-Host "    concatenation is VALID JSON — the adapter must buffer fragments, confirmed."
} catch {
	Write-Host "    concatenation did NOT parse."
}
