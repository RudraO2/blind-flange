# HANDOFF — read this first in a new session

## What this project is

Smart India Hackathon 2026, problem statement **SIH26117**.

- **Title:** Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work
- **Organisation:** Mangalore Refinery and Petrochemicals Limited (MRPL), ONGC subsidiary, Miniratna CPSE
- **Theme:** Smart Automation · **Category:** Software
- **Idea submission deadline:** 20 September 2026, via SPOC, PDF only, 6 slides max
- **Internal hackathon:** September 2026, IIT Madras BS Degree Programme template, 9 slides
- **Grand Finale:** December 2026, 36 hours
- **Team:** 6 members, minimum 1 female
- **Proposed codename:** Blind Flange (the plate bolted over a line to positively isolate it — the physical air gap)

MRPL filed three problem statements this cycle and all three are import-substitution plays
(this one, an indigenous MILP solver vs CPLEX/Gurobi/Xpress, an indigenous H2S dosimeter).
Pitch to licence terms, deployability by their own IT, and audit evidence — not benchmark charts.

## Files here

| File | What it is |
|---|---|
| `blind-flange.html` | Source of the full build plan artifact. 21 sections. Edit and republish to the URL below. |
| `DECK-CONTENT.md` | Paste-ready copy for all 9 slides of the internal hackathon deck. |
| `SIH_PPT_Template_IITMBS.pptx` | The institute's template. 9 slides, 16:9. |

## The artifact

**https://claude.ai/code/artifact/b473557c-9051-4b97-aa83-6495a28c603d**

To update it: edit `blind-flange.html`, then call Artifact with that file path **and** `url`
set to the link above. Publishing without `url` from a new conversation creates a *separate*
artifact instead of updating this one.

Favicon is 🔩 — keep it stable across redeploys.

## Section map of the artifact

```
00 Start here (plain language)     11 Harness & fan-out
01 The read                        12 Ingestion & knowledge
02 Requirement register            13 Deliverable factory
03 The client (MRPL)               14 Sovereignty proof
04 The rubric                      15 Security & governance
05 The deck, slide by slide        16 Hardware & VRAM
06 System architecture             17 Demo script
07 Model plane                     18 Build plan & roles
08 The router                      19 Risks & the cut line
09 Residency & stickiness          20 Glossary
10 Agent runtime                   ▪  Sources
```

## Where we are — prototype phase

The PPT round is **done**. The deck was built from `DECK-CONTENT.md`; the explainer video
in `videos/` is finished output and nothing reads back from it. Both are behind us.

Now: build the **prototype** that wins the IITM BS internal round. Scope is §17 **Phase 0**,
"Prove the spine" — one vertical slice, end to end.

**Method is BMAD**, start to end — BMad Method v6.11.0, module `bmm`, installed 27 Aug 2026
into `_bmad/` with 49 skills in `.claude/skills/`. Run `bmad-help` if unsure what comes next.
Before any BMAD planning skill, read **`docs/bmad-input-brief.md`**: constraints, source
material in reading order, and the list of what is genuinely still open.

Matt Pocock's skills are installed at user level but **stood down for this project** — see
`CLAUDE.md`. `.scratch/phase-0-spine/spec.md` is a pre-BMAD draft: input, not authority.

Three decisions were made on 27 Aug 2026 that the artifact does not yet reflect:

- **ADR-0001** — pluggable model plane. The only GPU is this laptop's GTX 1650 Max-Q, 4 GB,
  and nothing better is coming. Every model call goes through one `ModelProvider` with
  `replay` / `local` / `remote` behind it. The live demo runs `replay` and *says so*, then
  plays a recorded `local` run with the cable pulled as the sovereignty proof. `remote` is
  never active during a demo or a recording.
- **ADR-0002** — panels before inference. Every differentiator (routing explainer,
  provenance crops, egress monitor, canary, fan-out, `.docx` factory) needs no large model.
  Build those first; inference is a swappable dependency. This is what answers "why not
  just Ollama with Open WebUI?" — and it has to answer it visually, in thirty seconds.
- **ADR-0003** — DeepSeek Harness adopted as the runtime, not just its plugin pattern. MIT,
  verified by reading `LICENSE` in `deepseek-ai/deepseek-harness` on 27 Aug 2026. This
  closes the October harness gate early. It is a developer preview two weeks old, so build
  against our own plugin contracts and pin the version; the fallback stays our own loop.

Licence policy is now written down as a hard constraint: `docs/licence-policy.md`.
Fold all of this into `blind-flange.html` when you next touch it.

**Round format is still unannounced** — live demo, recorded video, code submission, or just
a repo link. Build so all four are satisfied: a working repo, a `make demo` that runs from a
cold clone, and a recorded offline run.

## Decisions already made — do not reopen

- Own thin frontend, not Open WebUI. The routing explainer, provenance crops and egress
  monitor do not exist in any off-the-shelf shell and they are the differentiators.
- Fleet constrained to Apache-2.0 / MIT licences only. The loader refuses anything else.
- No fine-tuning. No custom inference engine. No 120B-class model (R11 excuses it).
- No full P&ID connectivity-graph extraction — scope is symbol and tag inventory plus
  region Q&A, and the limit is stated out loud in the pitch.
- Dense to MoE with expert offload is the answer to the mid-range GPU, not "pick a smaller model".
- DeepSeek Harness adopted as the runtime (ADR-0003, MIT). Supersedes the earlier position
  that only the plugin *pattern* was adopted and the runtime gated to October.
- Model plane is pluggable: `replay` / `local` / `remote` behind one interface (ADR-0001).
  No cloud GPU during any demo or recording — renting inverts the sovereignty claim.
- Panels before inference (ADR-0002). The harness and frontend are the differentiators;
  token generation is the least differentiating component in the whole architecture.

## The three demo moments that win it

1. Pull the network cable, keep working.
2. Same session, different task type, routing chip changes model automatically — open the
   panel and show the scores.
3. Press the canary button: a deliberate outbound call gets blocked, the monitor turns red,
   the audit log records it. Silence proves nothing until the alarm is shown to work.
