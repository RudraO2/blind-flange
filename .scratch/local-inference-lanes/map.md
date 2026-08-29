# Map: the coding and document lanes run on real local models

Label: `wayfinder:map`
Charted: 30 August 2026
Branch: `feat/local-inference-lanes`

## Destination

A spec that can be built tonight: the `code` and `document` lanes answered by real
open-weight models running on this machine's GTX 1650 Ti, with the reasoning carried
inside the deliverable and a small evaluation table beside it.

## Notes

**Domain**: Blind Flange (SIH26117). Read `CONTEXT.md` for vocabulary — fleet, router,
model plane, replay, residency, deliverable factory, provenance crop. Read `HANDOFF.md`
for what is closed. `docs/licence-policy.md` is a hard gate: `npm run licence-audit` is
part of `npm test` and fails on an undecided licence.

**Skills every session should consult**: `grilling`, `domain-modeling`. `tdd` when
building. Matt Pocock's skills are the process for this effort by explicit user override
of `CLAUDE.md`'s stand-down.

**Standing preferences for this effort**:

- **Speed over quality.** This is a prototype. A fast adequate answer beats a slow good
  one, provided the path is the real path and not a shortcut that cannot grow up.
- **Touch zero lines of `lib/router/classify.js` and `lib/router/score.js`.** A teammate
  is rewriting the router tomorrow, unsupervised and uncoordinated. The execution layer
  reads the `router/routed` session event and nothing else.
- **Do not build a residency manager.** llama-swap owns loading, eviction and residency.
  Our code reads what it reports and displays it.
- **The hardware is the spec.** 3784 MiB free VRAM, 15.4 GB RAM, Ryzen 5 4600H, 238 GB
  free on `D:`. Every design claim gets checked against those numbers, not against a
  spec-ideal box.

## Decisions so far

<!-- the index: one line per closed ticket, then zoom the link for the detail -->

- [The destination and the VRAM budget](issues/01-the-destination-and-the-vram-budget.md):
  the full charting record — the deadline, the fleet, the licence trap, the seam with the
  teammate, and the fourteen decisions taken on 30 August 2026.
- [How do llama-swap and llama-server get onto this box](issues/02-how-do-llama-swap-and-llama-server-get-onto-this-box.md):
  llama-swap `v251`, llama.cpp nightly `b10687`, no compilation. **One model at a time is
  llama-swap's default**, so the residency policy is an absence of configuration. `GET /running`
  is what the residency surface reads. The SSE parser has to tolerate `:` comment pings.
- [Can llama-server serve Qwen3-VL-2B, and force valid tool calls](issues/03-can-llama-server-serve-qwen3-vl-and-force-valid-tool-calls.md):
  yes to both. `-m` plus `--mmproj`, image as an OpenAI `image_url` data URL, and **text-only
  pays no vision compute**. Native `tools` with `tool_choice: required` and
  `parallel_tool_calls: false`; `grammar` and `tools` cannot be combined. **`--fit` is on by
  default and will silently rewrite unset `-c`/`-ngl`** on a 3.7 GB card.
- [How fast can the ingestion service read a page](issues/05-how-fast-can-the-ingestion-service-read-a-page.md):
  **the DPI lever does not work** — rendering is 0.6s of 15s and RapidOCR caps its own working
  image at 2000px anyway, so 300 dpi rasterises pixels it then discards. Render at 200 dpi, turn
  `use_cls` off, leave batch size and thread count alone, **pre-warm the engine at startup** (ORT
  re-optimises per input shape and that is where the seconds went), stream per page. **~3.4s to
  first findings, ~6.7s complete.**
- [Install the runtime and pull the weights](issues/06-install-the-runtime-and-pull-the-weights.md):
  done, on `D:`, scripted idempotently. **This box has two Vulkan devices and llama.cpp picks the
  wrong one by default** — `--device Vulkan1` is mandatory, and the iGPU's ~8 GB is a better home
  for the router than the CPU. **`--parallel` defaults to 4 slots**, quadrupling the KV cache;
  `--parallel 1` is now explicit. `nvidia-smi` cannot see Vulkan VRAM on WDDM.
- [What does a swap cost, and is Vulkan fast enough](issues/07-what-does-a-swap-cost-and-is-vulkan-fast-enough.md):
  **Vulkan on Turing is 104 tok/s on the coder and 95 on the vision model** — 2.5× the budget's
  assumption, so the licence-forced backend costs nothing. **A warm swap is ~3s**, which the OCR
  pass covers. Cold is 8.5s and 20.9s (Vulkan shader compilation, driver-cached) — warm both
  models at startup, never during a demo.
- [What language should the coding lane ask for](issues/08-what-language-should-the-coding-lane-ask-for.md):
  **Python, and our code decides the verdict.** Over nine attempts each, PowerShell produced
  runnable code **0/9** and Python **6/9**. Three of Python's successes computed correctly but
  ignored the verdict format, so the model prints a value and the lane asserts it. A metric that
  greps the output for "PASS" is theatre — it passed a command the shell never evaluated. **And it
  opens a hole: the egress seal only knows PowerShell cmdlets, so Python network calls would walk
  past it.** Close that in the same commit.
- [Will the licence audit still pass](issues/04-will-the-licence-audit-still-pass.md):
  yes, after two substitutions. **Vulkan build, not CUDA** — the CUDA redistributables carry a
  non-OSI EULA with a field-of-use restriction and cannot be admitted by ADR. **GGUFs from
  `Qwen/…` only** — `ggml-org`'s and `bartowski`'s uploads declare no licence at all. Editing
  `registry/models.yaml` breaks `test/loader.test.js` in the same commit.

## Not yet specified

- **Provenance for an arbitrary uploaded file.** `lib/findings/provenance.js` serves two
  pre-rendered PNGs for the shipped fixture. A file a judge uploads has no pre-rendered
  pages, so crops have to come from somewhere else — render on demand, cache per upload,
  or something else. Sharp enough to worry about, not yet sharp enough to ticket; graduates
  once ticket 06 has measured what rendering a page actually costs.
- **The teammate's router as a VRAM tenant.** They intend a multimodal, tool-calling
  router model and will build it tomorrow with no coordination. If it lands on the GPU it
  takes roughly half the budget. The recommended answer is `-ngl 0` (router on CPU), and
  llama-swap's config absorbs a third tenant without a code change either way — but which
  case is real is unknown until tomorrow.
- **Whether the drawing lane ships at all.** `drawing` classifies today and routes to the
  vision model by the modality gate. Whether a P&ID actually gets sent as an image, and
  what it costs in vision-encoder prefill, is unexamined.
- **How much VRAM headroom actually remains.** Ticket 07 could not measure it: `nvidia-smi`
  reports ~0 for a Vulkan process under Windows WDDM. One model at a time at ~1.05 GiB plus one
  8192-token KV slot against 3.7 GB says there is room, but nobody has read the allocation
  numbers out of `llama-server`'s own load log. Matters most for judging whether the teammate's
  router could share the card after all.
- **llama-swap's statically linked Go modules.** 17 direct requires verified inside the eleven;
  ~65 indirect unverified, and they sit in no tree `licence-audit.mjs` walks. Not a blocker
  tonight, but the licence claim is not honestly "audited" until a `go-licenses` enumeration at
  tag `v251` is committed to `docs/licence-evidence/`.

## Out of scope

- **MoE with expert offload.** `HANDOFF.md` records "dense to MoE with expert offload is
  the answer to the mid-range GPU" as a closed decision. It is not true on this machine:
  the smallest useful MoE coder is ~17 GB at Q4 and has to sit in system RAM, against
  15.4 GB total. Dense small models only. The claim needs correcting on the slide, which is
  a separate effort.
- **Rewriting the router.** The teammate's work, by division of labour.
- **Fine-tuning, a custom inference engine, a 120B-class model.** Already past the cut line
  in `_bmad-output/planning-artifacts/product-brief.md`.
- **Model-judges-model evaluation.** A second inference pass on a GPU with no room for one.
