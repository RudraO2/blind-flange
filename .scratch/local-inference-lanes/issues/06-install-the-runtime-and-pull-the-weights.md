# Install the runtime and pull the weights

Type: task
Status: resolved
Blocked by: 02, 03, 04

## Question

Nothing to decide. The discussion downstream cannot proceed until llama-swap, `llama-server` and
both models are actually on this machine, because every remaining question is a measurement.

Do, driven by the answers to 02, 03 and 04:

- Install llama-swap and the prebuilt Windows CUDA `llama-server`. Put the binaries somewhere
  gitignored — they are large and third-party.
- Pull the GGUFs to `D:` (238 GB free there; 44 GB on `C:`): `Qwen3-VL-2B-Instruct` plus its
  vision-encoder file, and `Qwen2.5-Coder-1.5B-Instruct`.
- Write the llama-swap config with both models declared, and add a third commented-out entry
  showing where a CPU-only router model would go (`-ngl 0`) so the teammate can see the slot.
- Confirm each model answers a trivial prompt through llama-swap's endpoint directly, by hand,
  before any of our code is involved.

**Weights are pulled over the network.** That is setup-time, not demo-time, and the sovereignty
claim is about runtime — but do it now, disclose it, and never let a pull happen during a demo.

## Answer

Done 30 August 2026. The fetch is scripted and idempotent at
`.scratch/local-inference-lanes/fetch-runtime.ps1` — it skips anything already present, so it
doubles as the setup step for a second machine (Story 6.3).

**Installed, all on `D:` (238 GB free there against 44 GB on `C:`):**

| what | where | size |
|---|---|---|
| llama-swap `v251` | `D:\ai\llama-swap\llama-swap.exe` | 12.8 MB |
| llama.cpp `b10687`, **Vulkan** build | `D:\ai\llama.cpp\llama-server.exe` | 33.3 MB archive |
| `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` | `D:\ai\models\` | 1065.6 MB |
| `Qwen3VL-2B-Instruct-Q4_K_M.gguf` | `D:\ai\models\` | 1056.1 MB |
| `mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf` | `D:\ai\models\` | 424.4 MB |

`LICENSE-LLVM-OpenMP` ships inside the llama.cpp archive as ticket 04 predicted, and needs copying
into `docs/licence-evidence/` as the audit's evidence path. The exe inside the llama-swap zip is
`llama-swap.exe`, confirming the goreleaser default ticket 02 could not verify.

**Config:** `D:\ai\llama-swap\config.yaml`, heavily commented with the reasoning. Run with
`.\llama-swap.exe --config .\config.yaml --listen 127.0.0.1:8080`.

### Three things found during bring-up that the research could not have told us

1. **This box has TWO Vulkan devices, and llama.cpp picks the wrong one by default.**
   `llama-server --list-devices` reports `Vulkan0: AMD Radeon(TM) Graphics (8122 MiB)` — the
   Ryzen 4600H's iGPU on shared system RAM — and `Vulkan1: NVIDIA GeForce GTX 1650 Ti (4149 MiB)`.
   Vulkan0 enumerates first and wins by default, which would silently put every lane model on
   shared DDR4 at a fraction of the bandwidth. **`--device Vulkan1` is mandatory on every model.**

   This is also good news for the router: there are ~8 GB of iGPU-addressable memory sitting
   unused, which is a better home for the teammate's router model than the CPU — still parallel
   hardware, and it never touches the discrete card. The config carries a commented `bf-router`
   entry saying exactly that.

2. **`--parallel` defaults to auto and chose 4 slots**, so `--ctx-size 8192` became 8192 tokens
   of KV cache *per slot* — four times what was asked for, on a card with none to spare.
   `--parallel 1` is now set explicitly on both models. This is the "it sizes itself and takes
   your budget" behaviour ticket 03 flagged, in its real form.

3. **`nvidia-smi` cannot measure VRAM for a Vulkan process on Windows WDDM.** It reported 143 MiB
   used while a model was demonstrably generating on Vulkan1. Do not use it to size the budget —
   use `llama-bench` to confirm placement and `llama-server`'s own load log for allocations.

**Verified by hand before any of our code was involved:** both models answer real prompts through
`http://127.0.0.1:8080/v1/chat/completions`. The coder wrote correct PowerShell; the vision model
correctly described what a blind flange is used for in a refinery. `GET /running` reports
residency and returns `{"running":[]}` when idle, exactly as ticket 02 predicted.
