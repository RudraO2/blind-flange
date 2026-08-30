# Ticket 06: fetch the runtime and the weights.
# Vulkan build, not CUDA (licence — see issues/04). GGUFs from Qwen's own repos only
# (ggml-org and bartowski declare no licence at all).
# Everything lands on D: — 238 GB free there against 44 GB on C:.

$ErrorActionPreference = "Stop"
$root = "D:\ai"
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

Write-Host ""
Write-Host "=== what landed ==="
Get-ChildItem "$root\models" | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB,1)}} | Format-Table -AutoSize
Get-ChildItem -Recurse "$root\llama-swap" -Filter *.exe | Select-Object -ExpandProperty FullName
Get-ChildItem -Recurse "$root\llama.cpp" -Filter llama-server.exe | Select-Object -ExpandProperty FullName
Get-ChildItem -Recurse "$root\llama.cpp" -Filter "LICENSE*" | Select-Object -ExpandProperty FullName
Write-Host "DONE"
