# What does a swap cost, and is Vulkan fast enough on Turing?

Type: prototype
Status: resolved
Blocked by: 06

## Answer

Measured 30 August 2026. Harness: `.scratch/local-inference-lanes/measure-swap.ps1`, plus
`llama-bench` for placement and throughput.

### Vulkan on Turing is not a bottleneck

The licence finding forced Vulkan over CUDA and the fear was that it would cost performance. It
does not. `llama-bench --device Vulkan1 -ngl 99`:

| model | prefill | generation |
|---|---|---|
| Qwen2.5-Coder-1.5B Q4_K_M | 870 tok/s | **104 tok/s** |
| Qwen3-VL-2B Q4_K_M | 1006 tok/s | **95 tok/s** |

The speed budget assumed roughly 40 tok/s. The real number is 2.5× that, and it confirms the
models are genuinely on the discrete card rather than falling back to CPU. **The licence-driven
choice of Vulkan costs nothing measurable.**

### Swap cost

End-to-end through llama-swap's HTTP endpoint, so these include request overhead and prefill:

```
coder  COLD  (process start + weights + shader compile)   8.53s
vision COLD  (evicts the coder, new architecture)        20.92s
coder  WARM  (reload from the OS page cache)              3.94s
coder  RESIDENT (no swap)                                 0.98s
vision WARM  (evicts the coder again)                     4.80s
```

**A warm swap costs about 3 seconds** (3.94s warm minus 0.98s resident). Both GGUFs total ~2.5 GB
against 15.4 GB of RAM, so they stay in the page cache and a swap is a PCIe upload rather than a
disk read — as predicted.

**Cold is a one-time cost, and the vision model's 20.9s is Vulkan shader compilation**, cached by
the driver afterwards. This is the Vulkan equivalent of the PTX JIT ticket 02 warned about. It
must be paid before a demo, not during one: **warm both models once at startup.**

### The residency policy

Unchanged from ticket 02's finding and it needs no code: llama-swap holds one model at a time by
default, and 3 seconds of warm swap fits inside the ~3.4s the OCR pass takes to produce its first
findings. The swap is covered by work the user can already see progressing.

### What could not be measured, and what to use instead

`nvidia-smi` reports Vulkan process memory as ~0 on Windows WDDM — it showed 143 MiB used while a
model was demonstrably generating at 104 tok/s on Vulkan1. **The VRAM headroom question is
therefore still open**, and the way to answer it is `llama-server`'s own load log rather than
`nvidia-smi`. Practically it matters less than expected: one model at a time, ~1.05 GiB of weights
each, one slot of 8192-token KV, against 3.7 GB. There is room.

The `--parallel 1` fix (see ticket 06) was found here and is the single most important
configuration change: left at its default the server took four times the KV cache asked for.

## Question

Two things were settled by research and one was not. Ticket 02 found that **one model at a time
is llama-swap's default**, so the residency policy needs no configuration and the "do both fit"
question is no longer load-bearing. Ticket 04 forced the **Vulkan** backend for licence reasons
rather than performance ones, and nobody has measured it on this card.

So what remains is measurement:

- **Tokens per second per model on the Vulkan backend.** The ten-second speed budget assumes
  roughly 40. If Vulkan on Turing is far off CUDA, that budget breaks and the fallback
  conversation in the map's fog opens up.
- Peak VRAM per model with its KV cache at the context length the lane actually needs.
  Remember `--fit` is on by default and will silently rewrite unset `-c`/`-ngl` — set both
  explicitly, then verify what actually got used.
- The 424 MiB `mmproj` projector is GPU-offloaded at startup whether or not an image is sent.
  Measure with and without `--no-mmproj-offload` and decide.
- Warm swap time: load A, load B (evicting A), load A again. The second load of A is the number
  that matters, because mmap plus the OS page cache should make it a PCIe upload rather than a
  disk read. With 15.4 GB of RAM and ~3 GB of weights, both files should stay cached.
- Cold swap time too, so the first request after a boot is not a surprise on stage.
- Generation throughput in tokens per second for each model, since the speed budget assumes
  roughly 40.
- What happens on OOM: does llama-swap fail cleanly, and what does the caller see? The provider
  has to surface that as something better than a hang.

Also worth learning here, cheaply: whether a **third** tenant of ~2 GB can coexist at all, since
the teammate's router model may arrive tomorrow wanting the GPU.

The output is a residency policy stated in one paragraph, and the llama-swap config that
implements it.
