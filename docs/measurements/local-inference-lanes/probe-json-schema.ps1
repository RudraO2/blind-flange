# Ticket 03, follow-up: native tool calling did not parse on the 1.5B. Test the alternative.
#
# What happened in probe-tool-calling.ps1: the model DID see the tools — it named `pwsh` and
# used the right argument keys — but wrapped the call in a ```json fence instead of the
# <tool_call> tags its own Qwen template specifies, and llama-server therefore returned it as
# prose in `content` with no `tool_calls` array. `tool_choice: "required"` did not force the
# grammar.
#
# So: does `response_format: json_schema` hold a 1.5B to a shape we can rely on? If yes, the
# lane drives the model with a schema and constructs the tool call itself — deterministic, and
# it does not depend on llama.cpp recognising a template as tool-capable.

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8080"

function Show-Attempt {
	param([string]$Label, [hashtable]$Body)
	Write-Host "`n=== $Label ==="
	$json = $Body | ConvertTo-Json -Depth 12 -Compress
	$t0 = Get-Date
	try {
		$r = Invoke-RestMethod -Method Post "$base/v1/chat/completions" -ContentType "application/json" -Body $json -TimeoutSec 600
	} catch {
		Write-Host "    REJECTED by server: $($_.Exception.Message)"
		$stream = $_.Exception.Response
		return $null
	}
	$secs = ((Get-Date) - $t0).TotalSeconds
	$msg = $r.choices[0].message
	$calls = @($msg.tool_calls)
	Write-Host ("    {0:N2}s  finish={1}  tool_calls={2}" -f $secs, $r.choices[0].finish_reason, ($calls | Where-Object { $_ }).Count)
	if ($msg.content) { Write-Host "    content: $(($msg.content -replace '\s+',' ').Trim())" }
	if ($calls | Where-Object { $_ }) {
		foreach ($c in $calls) { Write-Host "    CALL $($c.function.name) -> $($c.function.arguments)" }
	}
	return $msg
}

$task = "Compute the sum of the integers from 1 to 100. Then verify it with an assertion that prints PASS if correct and FAIL otherwise. Return one PowerShell command that does both."

# ---- attempt A: tool_choice given as an explicit object rather than the string "required"
$toolDef = @(
	@{
		type = "function"
		function = @{
			name = "pwsh"
			description = "Run a PowerShell command in the sandbox."
			parameters = @{
				type = "object"
				properties = @{
					command     = @{ type = "string" }
					description = @{ type = "string" }
				}
				required = @("command", "description")
			}
		}
	}
)
Show-Attempt "A: tool_choice as an object" @{
	model = "bf-coder"; temperature = 0; max_tokens = 300
	messages = @(@{ role = "user"; content = $task })
	tools = $toolDef
	tool_choice = @{ type = "function"; function = @{ name = "pwsh" } }
} | Out-Null

# ---- attempt B: json_schema response format, no tools at all
$schema = @{
	type = "object"
	properties = @{
		command     = @{ type = "string"; description = "A single PowerShell command." }
		description = @{ type = "string"; description = "One line describing what it does." }
	}
	required = @("command", "description")
	additionalProperties = $false
}
$msg = Show-Attempt "B: response_format json_schema" @{
	model = "bf-coder"; temperature = 0; max_tokens = 300
	messages = @(
		@{ role = "system"; content = "You emit only JSON matching the schema. No prose, no code fences." }
		@{ role = "user"; content = $task }
	)
	response_format = @{
		type = "json_schema"
		json_schema = @{ name = "pwsh_call"; strict = $true; schema = $schema }
	}
}

if ($msg -and $msg.content) {
	Write-Host "`n--- does B parse, and does the command actually run? ---"
	try {
		$parsed = $msg.content | ConvertFrom-Json
		Write-Host "    VALID JSON against the schema."
		Write-Host "    command:     $($parsed.command)"
		Write-Host "    description: $($parsed.description)"
		$out = & pwsh -NoProfile -Command $parsed.command 2>&1 | Out-String
		Write-Host "    sandbox output: $($out.Trim())"
		if ($out -match 'PASS') {
			Write-Host "    >>> the model wrote an assertion and it PASSED — this is story 5.3's real version."
		} else {
			Write-Host "    >>> ran, but no PASS in the output. Model quality, not plumbing."
		}
	} catch {
		Write-Host "    content did not parse as JSON: $($_.Exception.Message)"
	}
}
