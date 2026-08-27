# BMAD input brief — read this before any BMAD planning skill

Written 27 August 2026 to make BMAD's discovery phase sharp. It gives you the **constraints
and the source material**, deliberately not the product decisions — those are what the
elicitation is for. Do not treat this as a substitute for asking.

## What is being built

A prototype of **Blind Flange** for the IIT Madras BS internal hackathon round, September
2026. Solo build, one person with Claude Code, roughly nine days from 27 August.

Blind Flange is a sovereign, air-gapped agentic AI workbench for confidential industrial
work, built on open-weight multimodal models. Smart India Hackathon 2026 problem statement
**SIH26117**, filed by Mangalore Refinery and Petrochemicals Limited (MRPL).

## Source material, in the order worth reading

| File | What it holds | How to treat it |
|---|---|---|
| `HANDOFF.md` | Project brief, closed decisions, the three demo moments | Authoritative |
| `CONTEXT.md` | The project's shared vocabulary, with terms to avoid | Use these words |
| `docs/licence-policy.md` | The hard licence constraint and how it is enforced | Non-negotiable |
| `docs/adr/` | Three recorded decisions: model plane, panels-first, harness | Do not reopen |
| `blind-flange.html` | The full 21-section build plan. §17 build plan, §18 demo script, §19 risk register, §07 model plane, §08 router | Deep reference — large, read the section you need |
| `.scratch/phase-0-spine/spec.md` | An earlier attempt at a Phase 0 spec, written before BMAD | **Input, not authority** — supersede it if planning goes elsewhere |
| `DECK-CONTENT.md` | The pitch copy that has already been presented | Claims already made in public — stay consistent |

## Immovable constraints

These are not up for elicitation. Challenge them only if you can show a contradiction.

1. **Licences: Apache-2.0 and MIT only.** Weights, dependencies, harness, everything. The
   reasoning is in `docs/licence-policy.md` and it is the client-facing differentiator, not
   an engineering preference.
2. **Offline by construction.** No component may reach the network at runtime. Every model
   artefact pre-staged. A blocked call is a hang, and a hang looks like a crash on stage.
3. **Hardware is fixed and small.** MSI GF63 laptop: i5-11260H, 15.7 GB RAM, GTX 1650 Max-Q
   with **4 GB VRAM**. No better GPU is coming. No cloud GPU during any demo or recording —
   renting inverts the project's central claim.
4. **DeepSeek Harness is the runtime** (ADR-0003), MIT, Node.js, developer preview. Built
   against our own plugin contracts so it stays swappable. Hard boundary: harness
   orchestrates, Python services do all ML behind local HTTP, no objects cross the line.
5. **Own thin frontend.** Not Open WebUI. The routing explainer, provenance crops and egress
   monitor do not exist in any off-the-shelf shell, and they are the differentiators.
6. **Panels before inference** (ADR-0002). Every differentiator needs no large model.
7. **Scope exclusions already agreed:** no fine-tuning, no custom inference engine, no
   120B-class model, no full P&ID connectivity-graph extraction (symbol and tag inventory
   plus region Q&A only, and the limit is stated out loud in the pitch).

## What actually wins this round — the real success criterion

Judged fast, on a short live impression, against problem statements with visually obvious
outputs. The question that kills this project is **"why not just use Ollama with Open
WebUI?"** and it must be answered visually within thirty seconds, not argued.

The five things no off-the-shelf shell has:

- a routing explainer showing the classifier's live scores, changing model mid-session
- provenance crops — click a finding, see the pixel region it was read from
- an egress monitor with a canary button that proves the zero is enforced
- a fan-out gauge showing sub-agents spawning as plugins
- a deliverable factory producing a signed `.docx`, not a chat reply

## Genuinely open — dig here

This is where elicitation earns its keep. None of these are decided:

- **Round format is unannounced.** Live demo, recorded video, code submission, or just a
  repo link — nobody has said. What is the cheapest build that satisfies all four?
- **Frontend stack.** The deck says React; nothing is built, so it is still open. What
  makes three live panels cheap to build and impossible to look amateur?
- **What "the demo" actually is** at 4 GB VRAM. Which of the twelve beats in §18 survive
  into a first prototype, and in what order?
- **How honest replay mode is surfaced.** ADR-0001 says the active provider is always
  visible. What does that look like so it reads as rigour rather than as a caveat?
- **Persistence.** Postgres via Docker, or SQLite, for agent state in a nine-day build.
- **Which document lane to demo.** A scanned inspection report is the §18 choice, but the
  drawing lane may be more visually striking to a judging panel.
- **What is cut.** Nine days, one person. The cut has to happen; it should happen on
  purpose and early, in planning, not at 2am in September.

## A caution about scope

The full build plan in §17 runs from August to a December Grand Finale across six lanes and
six people. **The internal round is Phase 0 only** — one vertical slice, end to end, ugly
where it does not show and real where it does. Planning that produces a Grand-Finale-sized
backlog has failed, however good the backlog is.
