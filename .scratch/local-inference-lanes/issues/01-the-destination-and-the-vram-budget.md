# The destination and the VRAM budget

Type: grilling
Status: resolved
Blocked by: —

## Question

What is this effort finding its way to, what models can physically run on this machine, and
where is the boundary between this work and the teammate's routing work?

## Answer

Resolved by grilling on 30 August 2026. Twenty-two questions over four rounds.

### The frame

The IITM BS internal round is due **1 September 2026**. Recorded here as the 31st during charting,
because that is what `HANDOFF.md` and `CLAUDE.md` say; corrected by the user on 30 August. Those
two files are still wrong and are the first thing a new session reads, so the error propagates
until someone fixes them. Phase 0 is done and green
(epics 1-5 and 8, epic 6 all but 6.3). What is real: the egress seal, the canary, the licence
gate, the keyword classifier and capability scorer, the routing chip, the RapidOCR ingestion
service, the `.docx` factory, and `pwsh` sandbox execution. What is canned: **every token the
model appears to generate** — `replay-provider.js` substring-matches a hand-authored
`replay-cache.json`.

This effort replaces the token generation in two lanes and nothing else.

### Measured hardware, not assumed

```
GPU     GTX 1650 Ti, 4096 MiB total, 3784 MiB free (the Ryzen's integrated
        Radeon drives the display, so the discrete GPU is almost entirely free)
RAM     15.4 GB
Disk    238 GB free on D:
CPU     AMD Ryzen 5 4600H, 6 cores
State   no ollama, no llama-server; Python 3.13 present
```

`HANDOFF.md` and ADR-0001 both record the GPU as a "GTX 1650 Max-Q". It is a **1650 Ti**.

### The fleet that actually fits

| lane | model | licence | ~Q4 size |
|---|---|---|---|
| `code`, `calculation` | `Qwen2.5-Coder-1.5B-Instruct` | Apache-2.0 | ~1.0 GB |
| `document`, `drawing` | `Qwen3-VL-2B-Instruct` | Apache-2.0 | ~1.3 GB + ~0.7 GB vision encoder |

**The licence trap:** `Qwen2.5-Coder-3B-Instruct` is *not* Apache-2.0 — its licence restricts
use to research or evaluation only, the same Qwen Research Licence the loader already refuses
by name. The Coder family is Apache-2.0 at 0.5B, 1.5B, 7B, 14B and 32B, and **3B is the
exception**. The obvious "small coder" pick is the one banned model. Worth adding to
`registry/models.yaml` as a second deliberate refusal case beside `Qwen2.5-3B-Instruct`.

Qwen3-VL 2B and 8B are Apache-2.0 —
https://github.com/lablab-ai/community-content/blob/main/technologies/qwen/qwen3-vl.mdx

**Two models is a requirement, not a preference.** `Qwen3-VL-2B` could serve both lanes alone,
which would delete residency entirely — but the problem statement requires demonstrating model
auto-selection across at least two task types, and one model leaves the router nothing to
select. The coder being *text-only* is therefore a feature: the existing
`requires: { modality: "image" }` gate in `score.js` produces a genuine exclusion reason for
the chip rather than a decorative one.

### MoE is dead on this machine

`HANDOFF.md` records expert offload as the answer to a mid-range GPU. The smallest useful MoE
coder is Qwen3-Coder-30B-A3B at roughly 17 GB quantised to Q4, which must sit in system RAM
even with experts offloaded, against 15.4 GB total including Windows. Dense small models only.

### Residency: don't build it

**llama-swap** (MIT, Go, single binary, one YAML) already does load-on-demand, VRAM-aware
eviction and residency reporting behind one OpenAI-compatible endpoint. It drives
`llama-server` processes. Chosen over Ollama for control and for a config file that reads as
evidence. https://llama-swap.wiki/

Swapping is cheap because GGUF files are mmapped and stay in the OS page cache — with 15 GB of
RAM and ~3 GB of weights, a swap is a PCIe upload, not a disk read. Two further covers for the
latency: the router classifies at **step 1**, so the needed model is known before it is needed;
and in the document lane RapidOCR runs on the CPU first, which is several free seconds.

**Show the swap, don't hide it.** A visible "evicting the coder, loading the vision model" line
is direct evidence that routing is real rather than a chip that changes colour. The residency
problem and the explainability requirement are answered by the same surface.

### The seam with the teammate

They build the router tomorrow, unsupervised, with no coordination possible tonight. They
intend a multimodal, tool-calling, possibly MoE router model.

- **This branch touches zero lines of `classify.js` and `score.js`.** The execution layer reads
  the `router/routed` session event and nothing else. Whether that event came from 30 regexes or
  from their model, this side does not know and does not care.
- **The router model belongs on the CPU** (`-ngl 0` in the llama-swap config). It runs on every
  turn, so on the GPU it permanently occupies half the budget. Classification is a tiny-output,
  prefill-dominated task; a sub-1B model on six Ryzen cores lands well under a second. Tell them.
- If their router model *is* a good VL model, llama-swap serves routing and the vision lane from
  one loaded instance and the budget gets easier. Design for that, depend on none of it.

### The fourteen decisions

1. **Destination**: a spec, built tonight via Matt Pocock's flow (`/to-spec` → `/to-tickets` →
   `/implement`), not BMAD. Explicit user override of `CLAUDE.md`'s stand-down.
2. **`local` becomes the demo path; `replay` stays as the stage-fright fallback.** One line in
   `profile/web/cordis.patch.yml` switches back. ADR-0001's "no live inference during the demo"
   posture is reversed, and the product brief's cut line needs amending to say so.
3. **The user owns everything downstream of `router/routed`, including dispatch.** The link from
   `selected` to an actual model call does not exist today and was unowned.
4. **Evaluation is a small scored fixture set**, not self-critique: five fixtures per lane, a
   pass/fail assertion each, plus wall-clock latency and swap time.
5. **The document lane uses OCR text, not the page image.** RapidOCR already reads the fixture at
   0.997 confidence on the CPU with zero VRAM. A vision model earns its place only where OCR
   cannot help — drawings, handwriting, layout. This also removes the vision-encoder prefill cost
   from the lane that has to be fast.
6. **A real upload control** in `conversation.input.right`, riding the existing `attachment-local`
   service. `@`-mention already works, but a judge needs to watch a file *arrive*.
7. **llama-swap over Ollama.** Both MIT. Needs llama.cpp prebuilt Windows CUDA binaries; the
   1650 Ti is Turing/SM 7.5, covered by standard CUDA builds, so no compiling.
8. **Widen the existing `ModelProvider` contract** rather than give `local` its own interface:
   add the model id, image blocks, tool JSON-schemas and an abort signal. `replay` ignores the
   new fields. ADR-0001's claim is "everything behind it is a swap, never a rewrite" — a second
   interface would break that claim on its first real use. **Worth an ADR.**
9. **Grammar-constrained sampling for tool calls.** A 1.5B model fumbles free-form tool calling;
   `llama-server` can force output to a JSON schema so it physically cannot emit invalid
   tool-call JSON. Escape hatch if it still wanders: a fixed lane pipeline where the model writes
   prose into slots and never chooses a tool.
10. **Four task types onto two models.** `drawing` → vision model (the modality gate already
    forces it); `calculation` → coder, because a calculation with steps shown is a `pwsh` script
    that prints its working. No router changes needed for either.
11. **Make the two existing demo beats real. Invent nothing.** Both are already scripted in the
    replay cache with real tool execution, a real fixture, real provenance crops, a real `.docx`
    and a recorded demo script that still runs unchanged.
12. **Upload works on an arbitrary file**, which forces wiring the live ingestion service at
    `127.0.0.1:8642` — built and proven, never yet called from the harness. This is the largest
    single piece of work in the day, because the provenance path currently hardcodes two page PNGs.
13. **Upload ingests immediately**, with the OCR pass visible as it happens — which is also the
    window llama-swap needs to load the vision model.
14. **Verification means the model wrote an assertion and it passed**, not exit-zero. Same work
    serves the coding lane's eval metric. **Amended by ticket 08:** the model computes the value
    and *our code* asserts it against the fixture's expected value. A 1.5B gets the computation
    right far more often than it gets a verdict's formatting right, and a metric that greps for
    the word PASS can be satisfied by a program that never ran.

### Speed budget

Extraction must be seconds. `services/ingestion/pdf.py` renders at `RENDER_DPI = 300`; there is
confidence headroom to drop to 150-200 and cut pixel count by half to three-quarters, plus
stream findings per page. Realistic end-to-end for the document lane: OCR 4-6s, swap ~2s hidden
behind it, generation ~5s at the 40-ish tokens/sec a 2B Q4 gets on this GPU. Roughly ten seconds.

### Escape hatch

Timebox the llama-swap bring-up to an hour chosen in advance. If `llama-server` is not answering
a real prompt through the provider by then, switch `profile/web/cordis.patch.yml` back to
`replay`. The lane pipelines, the upload control, the in-output explainability and the eval table
all still work, because none of them depend on which provider answered.
