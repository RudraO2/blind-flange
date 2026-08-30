# Ticket 06: fetch the runtime and the weights.
# Vulkan build, not CUDA (licence — see issues/04). GGUFs from Qwen's own repos only
# (ggml-org and bartowski declare no licence at all).
# The runtime root defaults to D:i where a D: drive exists (238 GB free there
# against 44 GB on C:) and to LOCALAPPDATA where it does not; pass -Root to override.

param(
	# Where the runtime and the weights land. 2.5 GB, so it goes on the roomiest
	# drive rather than wherever the checkout happens to be. D:\ai is this team's
	# machines; anything without a D: falls back to LOCALAPPDATA, because a path
	# baked into a committed script is one of the ways Story 6.3 fails.
	[string]$Root = $(if (Test-Path "D:\") { "D:\ai" } else { Join-Path $env:LOCALAPPDATA "faraday-runtime" })
)

$ErrorActionPreference = "Stop"
$root = $Root
Write-Host "runtime root: $root"
New-Item -ItemType Directory -Force -Path "$root\dl", "$root\models" | Out-Null

$targets = @(
	@{ name = "llama-swap v251";      url = "https://github.com/mostlygeek/llama-swap/releases/download/v251/llama-swap_251_windows_amd64.zip"; out = "$root\dl\llama-swap_251_windows_amd64.zip" }
	@{ name = "llama.cpp b10687 vulkan"; url = "https://github.com/ggml-org/llama.cpp/releases/download/b10687/llama-b10687-bin-win-vulkan-x64.zip"; out = "$root\dl\llama-b10687-bin-win-vulkan-x64.zip" }
	@{ name = "coder Q4_K_M";         url = "https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"; out = "$root\models\qwen2.5-coder-1.5b-instruct-q4_k_m.gguf" }
	@{ name = "vision Q4_K_M";        url = "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/Qwen3VL-2B-Instruct-Q4_K_M.gguf"; out = "$root\models\Qwen3VL-2B-Instruct-Q4_K_M.gguf" }
	@{ name = "vision mmproj Q8_0";   url = "https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF/resolve/main/mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf"; out = "$root\models\mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf" }
)

foreach ($t in $targets) {
	if (Test-Path $t.out) {
		Write-Host "SKIP  $($t.name) — already at $($t.out)"
		continue
	}
	Write-Host "GET   $($t.name)"
	# -L follows the CDN redirect Hugging Face issues for resolve/ paths.
	& curl.exe -L --fail --retry 3 --retry-delay 2 -o $t.out $t.url
	if ($LASTEXITCODE -ne 0) { throw "failed: $($t.name) ($($t.url))" }
	$mb = [math]::Round((Get-Item $t.out).Length / 1MB, 1)
	Write-Host "OK    $($t.name) — $mb MB"
}

Write-Host ""
Write-Host "=== extracting ==="
Expand-Archive -Force -Path "$root\dl\llama-swap_251_windows_amd64.zip"   -DestinationPath "$root\llama-swap"
# Both llama.cpp zips would go to the SAME directory; with the Vulkan build there is no
# second (cudart) archive to merge in, which is one of the reasons it is the easier path.
Expand-Archive -Force -Path "$root\dl\llama-b10687-bin-win-vulkan-x64.zip" -DestinationPath "$root\llama.cpp"

# The model table. Reconstructed and committed on 30 August 2026 — it used to
# exist only on the machine that wrote it, which is exactly the failure Story 6.3
# is meant to catch. Copied rather than generated so the reasoning in its comments
# travels with it.
$config = Join-Path $PSScriptRoot "..\..\runtime\llama-swap.config.yaml"
if (-not (Test-Path $config)) { throw "missing runtime\llama-swap.config.yaml — run this from the repo checkout" }
# Which Vulkan device is the discrete card is NOT portable — the two team laptops
# enumerate it in opposite order (see the config's own header). Read it rather than
# assume it: a wrong index still answers, on the iGPU, at a fraction of the speed.
$devices = & "$root\llama.cpp\llama-server.exe" --list-devices 2>&1 | Out-String
$discrete = $null; $igpu = $null
foreach ($line in ($devices -split "`n")) {
	if ($line -match '(Vulkan\d+):\s*(.+?)\s*\(') {
		$id = $Matches[1]; $desc = $Matches[2]
		if ($desc -match 'NVIDIA|Radeon RX|Arc') { $discrete = $id } else { $igpu = $id }
		Write-Host "      $id = $desc"
	}
}
if ($null -eq $discrete) { throw "no discrete GPU found in --list-devices; set --device by hand in $root\llama-swap\config.yaml" }
Write-Host "      discrete = $discrete$(if ($igpu) { ", igpu = $igpu" })"

(Get-Content -Raw $config).Replace('__RUNTIME_ROOT__', ($root -replace '\\','/')).Replace('__DISCRETE_GPU__', $discrete).Replace('__IGPU__', $(if ($igpu) { $igpu } else { 'Vulkan0' })) |
	Set-Content -NoNewline -Path "$root\llama-swap\config.yaml"
Write-Host "OK    config.yaml -> $root\llama-swap\config.yaml (lanes pinned to $discrete)"

Write-Host ""
Write-Host "=== what landed ==="
Get-ChildItem "$root\models" | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize
Get-ChildItem -Recurse "$root\llama-swap" -Filter *.exe | Select-Object -ExpandProperty FullName
Get-ChildItem -Recurse "$root\llama.cpp" -Filter llama-server.exe | Select-Object -ExpandProperty FullName
Get-ChildItem -Recurse "$root\llama.cpp" -Filter "LICENSE*" | Select-Object -ExpandProperty FullName
Write-Host "DONE"
