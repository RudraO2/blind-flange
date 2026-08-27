# SIH26117 — Internal Hackathon Deck, paste-ready copy

Template: `SIH_PPT_Template_IITMBS.pptx` — 9 slides, 16:9, IIT Madras BS Degree Programme, Round 3.
Only `[ ... ]` fields need filling by the team. Everything else is final copy.

**Before submitting:** delete the blue "HOW TO USE THIS SLIDE" boxes on every slide.

---

## SLIDE 1 — Title

| Field | Value |
|---|---|
| Problem Statement Title | Sovereign On-Premise Agentic AI Workbench using Open-Weight Multimodal LLMs for Confidential Industrial Work |
| Problem Statement ID | SIH26117 |
| Theme | Smart Automation |
| Category | Software |
| Team Name | `[ your registered team name ]` |
| Team Leader | `[ full name ]` |
| Institute | IIT Madras BS Degree Programme |

Copy the title character-for-character. Evaluators cross-check it against the portal list.

---

## SLIDE 2 — Section 01 · Team Details

| Member | Name | Role / Contribution |
|---|---|---|
| Team Leader | `[ full name ]` | Architecture & model serving |
| Member 2 | `[ full name ]` | Task router & agent orchestration |
| Member 3 | `[ full name ]` | Document ingestion & knowledge base |
| Member 4 | `[ full name ]` | Tooling, sandbox & document generation |
| Member 5 | `[ full name ]` | Frontend & interaction design |
| Member 6 | `[ full name ]` | Security, air-gap enforcement & deployment |

All six rows must be filled. Minimum one female member is mandatory for SIH.

---

## SLIDE 3 — Section 02 · Idea / Approach / Proposed Solution

**1. The Problem**

Refineries and PSUs produce confidential knowledge work every day: P&IDs, inspection reports,
approval notes, vendor negotiations. Policy forbids sending any of it to cloud AI. So staff
either do the work by hand, or quietly paste confidential material into public tools anyway.

**2. Our Solution**

An air-gapped AI workbench running on the organisation's own GPU server. Several open-weight
models run together and a classifier picks the right one for each task. It plans multi-step
work, uses local tools, reads scanned drawings and handwriting, and delivers a finished Word,
Excel or PowerPoint file, or tested code.

**3. What Makes It Different**

Model selection is inspectable configuration, not a dropdown. The output is a signed file,
not a chat reply. And we prove the air gap by blocking a deliberate outbound call live,
instead of claiming a zero.

---

## SLIDE 4 — Section 03 · Novelty and Uniqueness

**EXISTING SOLUTIONS**

1. Cloud assistants (ChatGPT, Claude, Copilot) — capable, but the data leaves the premises,
   so company policy bars them outright.
2. Self-hosted chat shells (Open WebUI, AnythingLLM, LibreChat) — private, but a manual model
   picker rather than automatic selection, chat-only output, and no proof of isolation.
3. Enterprise RAG and search platforms — strong retrieval, but not agentic, produce no
   deliverables, and assume cloud components somewhere in the stack.

**WHAT'S GENUINELY NEW**

1. Explainable routing — a classifier plus a capability scorer that prices the model switch,
   wake time and cache rebuild included, and renders the whole decision on screen.
2. The GPU as a scheduler budget — spare video memory becomes parallel sub-agents on the model
   already loaded, turning idle silicon into measured throughput.
3. Adversarial sovereignty proof — a canary that deliberately attempts an outbound call, so
   the audience watches the firewall block it and the audit log record it.

---

## SLIDE 5 — Section 04 · Technical Approach

**PROCESS FLOW**

```
[ Scan / query ] -> [ Parse & retrieve ] -> [ Route · plan · verify ] -> [ .docx / .xlsx / code ] -> [ Engineer + audit ]
```

**TECH STACK**

- **Frontend:** React, all assets self-hosted with zero external URLs. Routing explainer,
  provenance viewer, live egress monitor.
- **Backend:** Python and FastAPI. LangGraph agent loop. Our own plugin contracts for
  models, tools and renderers.
- **Documents:** Docling for layout and OCR, with a vision-model fallback for handwriting
  and drawings. python-docx, python-pptx and openpyxl render the output files.
- **Data:** PostgreSQL for agent state and hash-chained audit. Qdrant for hybrid dense and
  keyword search. A plain filesystem vault for source files and generated documents.
- **AI/ML core:** Open-weight fleet — general reasoning, coder, vision-document, embedder,
  reranker — served by vLLM on a server or llama.cpp on a workstation, both behind one
  OpenAI-compatible interface.
- **Hosting / deployment:** Single on-premise GPU workstation or server. Code executed in a
  network-isolated container. OS firewall default-deny egress. Offline wheelhouse install.

Place the six-plane architecture diagram beside the process flow.
If the Phase 0 slice is running by submission date, add one line saying so — "prototype
already built" is disproportionately persuasive at internal-round stage.

---

## SLIDE 6 — Section 05 · Feasibility and Viability

**POTENTIAL CHALLENGES**

1. A mid-range GPU cannot hold every model at once, and naive loading and unloading costs
   up to a minute per switch.
2. Changing models mid-conversation stalls the session and throws away its working memory.
3. "No external calls" is trivial to assert and hard to prove, and a jury is right to be
   sceptical of the claim.

**MITIGATION STRATEGY**

1. Mixture-of-experts placement puts 30B-class quality in 5 to 7 GB of VRAM. Small helper
   models stay pinned, large models sit warm in host RAM and wake in about a second.
2. Sticky routing with hysteresis, per-conversation-per-model cache reuse, and prewarming
   driven by the agent's own published plan.
3. Layered enforcement at the operating system, a live network monitor, a deliberately
   blocked outbound canary, and a signed attestation listing every component and model
   with its hash.

Replace the numbers above with your own Phase 0 measurements once you have them.

---

## SLIDE 7 — Section 06 · Impact and Benefits

**Social Impact**

Removes the shadow-AI path that puts confidential refinery data into public chatbots today.
Returns engineering hours from routine drafting, and makes decades of SOPs, manuals and
correspondence searchable with citations instead of lost in shared drives.

**Economic Impact**

No per-seat or per-token licence, one-time hardware against a recurring foreign SaaS
dependency. The problem statement itself names refineries, PSUs, defence-linked manufacturing
and government offices, so the same deployment pattern transfers directly across the ONGC
group and beyond.

**Environmental Impact**

Inference on a right-sized local GPU rather than routing every query to a hyperscale
datacentre. A quantised mixture-of-experts model at 5 to 7 GB draws a fraction of the energy
of frontier-scale serving.

> Quantify only what you actually measured, and say it is measured.

---

## SLIDE 8 — Section 07 · Research and References

1. Kwon, W. et al. — *Efficient Memory Management for Large Language Model Serving with
   PagedAttention* — SOSP 2023 — https://arxiv.org/abs/2309.06180
2. Song, Y. et al. (SJTU IPADS) — *PowerInfer: Fast Large Language Model Serving with a
   Consumer-grade GPU* — SOSP 2024 — https://arxiv.org/abs/2312.12456
3. Debenedetti, E. et al. (Google DeepMind / ETH Zurich) — *Defeating Prompt Injections by
   Design (CaMeL)* — 2025 — https://arxiv.org/abs/2503.18813
4. Docling Project, IBM Research — *Docling: An Efficient Open-Source Toolkit for AI-driven
   Document Conversion* — 2025 — https://arxiv.org/abs/2501.17887
5. MRPL — *Problem Statement SIH26117, Smart India Hackathon 2026* — https://sih.gov.in

**Verify author order on each arXiv page before submitting.** A panel member in this field
notices a wrong first author faster than a wrong claim.

**Reserve list**, if a row frees up or for the finale deck:

- *PowerInfer-2: Fast LLM Inference on a Smartphone* — https://arxiv.org/abs/2406.06282
- *XGrammar: Flexible and Efficient Structured Generation Engine for LLMs* — https://arxiv.org/abs/2411.15100
- *When to Reason: Semantic Router for vLLM* — https://arxiv.org/abs/2510.08731
- OpenDataLab — *OmniDocBench*, CVPR 2025 — https://github.com/opendatalab/OmniDocBench
- *Automated inspection of P&ID object recognition using deep learning* — Scientific Reports 2025 — https://www.nature.com/articles/s41598-025-25506-2
- *Automatic Detection and Classification of Symbols in Engineering Drawings* — https://arxiv.org/abs/2204.13277
- *SynthPID: P&ID digitization from Topology-Preserving Synthetic Data* — https://arxiv.org/abs/2604.16513
- OWASP — *LLM Prompt Injection Prevention Cheat Sheet* — https://cheatsheetseries.owasp.org
- MeitY — *IndiaAI Mission*, sovereign foundation-model programme and national compute
- OISD and PESO — Indian petroleum safety standards and the Petroleum Rules SOP

---

## SLIDE 9 — Section 08 · Solution Summary

| Criterion | Summary |
|---|---|
| Problem | Confidential refinery knowledge work cannot use cloud AI, so it is done by hand or quietly leaked into public tools. |
| Proposed Solution | An air-gapped, multi-model agentic AI workbench that produces real documents and tested code on the organisation's own GPU. |
| Novelty / USP | Inspectable model routing, GPU-budgeted parallel agents, and sovereignty proved by a blocked outbound call rather than asserted on a slide. |
| Feasibility | Runs on one mid-range GPU using quantised open-weight models with expert offload. Every component exists today and is permissively licensed. |
| Impact | Closes the shadow-AI leak path and returns engineering hours across refineries, PSUs, defence units and government offices. |

---

## Then cut to six slides for the official SIH portal submission

PDF only. PPT and DOC are rejected. Due 20 September 2026 via your SPOC.

1. Title
2. Problem + Solution (merge slides 3 and 4)
3. Technical Approach (slide 5)
4. Feasibility (slide 6)
5. Impact (slide 7)
6. References (slide 8)
