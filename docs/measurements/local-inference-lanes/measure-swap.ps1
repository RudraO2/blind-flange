# Ticket 07: what does a swap cost, and is the Vulkan backend fast enough on Turing?
#
# Sequence: coder cold -> vision cold (evicts coder) -> coder WARM (the number that matters,
# because the GGUF should still be in the OS page cache) -> vision warm.
#
# Discard the first result for each model: the Vulkan backend compiles shaders on first use
# and the driver caches them, the same way the CUDA build would JIT PTX for SM 7.5.
#
# Requires llama-swap already listening on 127.0.0.1:8080.

$ErrorActionPreference = "Stop"
$base = "http://127.0.0.1:8080"

function Get-Vram {
	$line = & nvidia-smi --query-gpu=memory.used,memory.free --format=csv,noheader,nounits
	$parts = ($line -split ',').Trim()
	[pscustomobject]@{ UsedMiB = [int]$parts[0]; FreeMiB = [int]$parts[1] }
}

function Get-Running {
	try { (Invoke-RestMethod "$base/running").running } catch { @() }
}

function Invoke-Turn {
	param([string]$Model, [string]$Prompt, [int]$MaxTokens = 96)

	$body = @{
		model       = $Model
		messages    = @(@{ role = "user"; content = $Prompt })
		max_tokens  = $MaxTokens
		temperature = 0
		stream      = $false
	} | ConvertTo-Json -Depth 5 -Compress

	$peak = 0
	$started = Get-Date

	# Poll VRAM on a background runspace while the request is in flight, so the peak we
	# report is the peak during generation rather than whatever it settled at afterwards.
	$job = Start-Job -ScriptBlock {
		$max = 0
		for ($i = 0; $i -lt 600; $i++) {
			$line = & nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits
			$used = [int]($line.Trim())
			if ($used -gt $max) { $max = $used }
			Start-Sleep -Milliseconds 250
		}
		$max
	}

	try {
		$response = Invoke-RestMethod -Method Post -Uri "$base/v1/chat/completions" `
			-ContentType "application/json" -Body $body -TimeoutSec 900
	} finally {
		Start-Sleep -Milliseconds 400
		Stop-Job $job -ErrorAction SilentlyContinue | Out-Null
		$peak = (Receive-Job $job -ErrorAction SilentlyContinue | Select-Object -Last 1)
		Remove-Job $job -Force -ErrorAction SilentlyContinue | Out-Null
	}

	$elapsed = ((Get-Date) - $started).TotalSeconds
	$completion = $response.usage.completion_tokens
	$prompt_t = $response.usage.prompt_tokens
	$text = $response.choices[0].message.content

	[pscustomobject]@{
		Model            = $Model
		Seconds          = [math]::Round($elapsed, 2)
		PromptTokens     = $prompt_t
		CompletionTokens = $completion
		PeakVramMiB      = $peak
		Reply            = ($text -replace '\s+', ' ').Trim()
	}
}

Write-Host "=== before anything is loaded ==="
Get-Vram | Format-Table -AutoSize
Write-Host "running: $((Get-Running).Count) model(s)`n"

$runs = @(
	@{ label = "coder  COLD (process start + weights + shader compile)"; model = "bf-coder";  prompt = "Write a single line of PowerShell that sums 1 to 10 and prints the result. Code only." }
	@{ label = "vision COLD (evicts the coder)";                        model = "bf-vision"; prompt = "In one sentence: what is a blind flange used for in a refinery?" }
	@{ label = "coder  WARM (reload from page cache)";                   model = "bf-coder";  prompt = "Write a single line of PowerShell that sums 1 to 20 and prints the result. Code only." }
	@{ label = "coder  RESIDENT (no swap)";                              model = "bf-coder";  prompt = "Write a single line of PowerShell that sums 1 to 30 and prints the result. Code only." }
	@{ label = "vision WARM (evicts the coder again)";                   model = "bf-vision"; prompt = "In one sentence: what does a pressure safety valve do?" }
)

$results = @()
foreach ($run in $runs) {
	Write-Host "--- $($run.label)"
	$r = Invoke-Turn -Model $run.model -Prompt $run.prompt
	$tps = if ($r.Seconds -gt 0 -and $r.CompletionTokens) { [math]::Round($r.CompletionTokens / $r.Seconds, 1) } else { 0 }
	$results += [pscustomobject]@{
		Stage    = $run.label
		Seconds  = $r.Seconds
		OutTok   = $r.CompletionTokens
		TokPerS  = $tps
		PeakVram = $r.PeakVramMiB
	}
	Write-Host "    $($r.Seconds)s, $($r.CompletionTokens) tokens, peak $($r.PeakVramMiB) MiB"
	Write-Host "    reply: $($r.Reply.Substring(0, [Math]::Min(140, $r.Reply.Length)))"
	Write-Host "    resident now: $(((Get-Running) | ForEach-Object { "$($_.model)=$($_.state)" }) -join ', ')`n"
}

Write-Host "=== summary ==="
$results | Format-Table -AutoSize
Write-Host @"
Read it like this: TokPerS on the RESIDENT row is the real generation rate — the swap rows
include the load. COLD minus WARM is what the OS page cache is buying. Peak VRAM is against
3784 MiB free at rest.
"@
