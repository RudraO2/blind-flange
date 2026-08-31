# Phase 0 — Prove the spine

The vertical slice that wins the IITM BS internal hackathon round. One complete path
through every layer, ugly where it doesn't show, real where it does.

**Source of truth:** `blind-flange.html` §17 Phase 0 and §18 demo script. This spec adapts
that plan to the hardware and round we actually face — see ADR-0001 (pluggable model plane)
and ADR-0002 (panels before inference).

**Deadline:** internal round, September 2026. Working target 5 September, per §17.
**Built by:** one person with Claude Code.
**Hardware:** MSI GF63, i5-11260H, 15.7 GB RAM, GTX 1650 Max-Q 4 GB VRAM.

## The one sentence

A user drops a scanned inspection report into Blind Flange, watches the router pick the
vision model and say why, reads findings each anchored to the pixel region it came from,
asks for an approval note, and gets a signed `.docx` — with an egress monitor showing zero
outbound traffic the whole time, and a canary button that proves the zero is enforced.

## What must be real

Everything except token generation. Real orchestration, real tool calls, real documents,
real firewall, real events driving every panel. Token generation is swappable per ADR-0001.

An animating panel with no real event behind it is a bug, not a shortcut.

## Capabilities

**C1 — Model plane.** One `ModelProvider` interface, three implementations: `replay`,
`local` (llama.cpp + CUDA on the 1650), `remote`. Selected by config. The active provider
is always visible in the UI. Model registry is YAML — adding a model is configuration, not
code (§18's 09:30 beat).

**C2 — Router.** Classifies an incoming request into a task type and scores each fleet
member against it. Scores are data, not prose, because the panel renders them.

**C3 — Routing explainer panel.** Shows the chosen model as a chip; expands into the
per-model scores and the classified task type. Must visibly change when task type changes
inside one session — that is demo beat 07:00 and it is the answer to "why not Open WebUI".

**C4 — Ingestion with provenance.** A scanned PDF or image goes in; text comes out with,
for each extracted claim, the page number and bounding box it came from. Docling for
layout and OCR.

**C5 — Provenance crop viewer.** Click a finding, see the cropped image region it was read
from, highlighted in place. Demo beat 02:00.

**C6 — Agent loop with a tool call.** Plan → user edits a step → approve → execute. At
least one real tool call and at least one visible HITL gate. Sub-agent spawns are surfaced
in a fan-out indicator.

**C7 — Deliverable factory.** Produces a real `.docx`: titleblock, reference number, cited
clauses, signature block, AI-drafted footer carrying a content hash. Opens correctly in
LibreOffice and Word.

**C8 — Egress monitor.** Live panel of outbound attempts, external counter visible.
Host firewall on default-deny. Zero must be the honest state, not a hardcoded zero.

**C9 — Canary.** A button that deliberately attempts an outbound connection. The firewall
drops it, the monitor flashes red, the audit log records it. Demo beat 10:30, and the
single most important thing in the build — silence proves nothing until the alarm is shown
to work.

**C10 — Frontend shell.** Chat, workspace, artefact preview, and the three hero panels
(routing, egress, provenance). Every asset self-hosted; a build-time check fails if any
external URL appears in the bundle (§19).

**C11 — `make demo`.** One command brings the whole thing up from a cold clone. Must work
on a second machine, because §19 says a projector will fail and a laptop might too.

## Acceptance — the round is winnable when

1. Cable physically unplugged, the app keeps working end to end.
2. A bad scan produces findings, each one clicking through to its own page crop.
3. Task type changes mid-session and the routing chip changes model, scores visible.
4. An approval note comes out as a `.docx` that opens clean in LibreOffice.
5. The canary fires, is blocked, turns the monitor red, and lands in the audit log.
6. A cold clone on another machine runs `make demo` and reaches beat 1.

## Explicitly out of scope for Phase 0

Per §17 these are Phase 3 and later. Do not build them now.

- Qdrant, hybrid search, reranking (C4 provenance is enough for the round)
- Full P&ID connectivity graph — past the cut line permanently, symbol and tag inventory only
- RBAC, classification tiers, hash-chained audit (a flat audit log is enough)
- Dual-LLM injection defence and the planted-injection beat
- Sandboxed `pytest` verify-and-retry loop
- Registry hot-reload without restart
- The residency-ladder benchmark — meaningless to measure at 4 GB; revisit if hardware changes
- Fine-tuning, custom inference engines, any 120B-class model

## Standing constraints

- Licences: Apache-2.0 and MIT only. The loader refuses anything else.
- Offline: every model artefact pre-staged, offline env vars set, no library may download
  on first use. A blocked call is a hang, and a hang looks like a crash on stage.
- `remote` provider is never active during a demo or a recording.
- Use `CONTEXT.md` vocabulary in code, commits, and UI copy.

## Open questions — not blockers, decide as you hit them

- Round format is unannounced: live demo, recorded video, code submission, or repo link.
  Build so all four are satisfied — a working repo, a `make demo`, and a recorded run.
- Which frontend stack. Deck says React; nothing has been built, so it is still open.
- Postgres via Docker versus SQLite for Phase 0 agent state.
