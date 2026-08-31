# Blind Flange

The shared language for SIH26117 — a sovereign, air-gapped agentic AI workbench for MRPL,
built on open-weight multimodal models. This file is the vocabulary agents and humans both
use. It is deliberately short: only terms whose meaning is specific to *this* project.

General AI jargon (token, VRAM, quantisation, KV cache, prefill/decode, MoE, RAG, reranker,
SBOM, P&ID) carries its ordinary industry meaning here and is not redefined. Come here for
how *we* use words, not for a dictionary of the field.

## The system

**Blind Flange**:
The project codename, and the metaphor the whole pitch hangs on: the plate bolted over a
line to positively isolate it. Physical isolation you can see, not a policy you must trust.
_Avoid_: the workbench, the platform, the tool

**Fleet**:
The set of open-weight models installed on the box — general reasoner, coder, vision-document
model, embedder, reranker. Licence-constrained to Apache-2.0, MIT, BSD-2-Clause and
BSD-3-Clause; the loader refuses anything else. Singular "the fleet", never a list of model
names in prose.
_Avoid_: model zoo, model pool, the models

**Router**:
The component that picks which fleet member answers a given request, by inspectable
classifier score rather than a hard-coded rule. Its visible surface is the routing chip.
_Avoid_: dispatcher, selector, orchestrator

**Routing chip**:
The small UI element showing which model answered and why, expanding into the classifier
scores. One of the three demo moments — the user watches it change model mid-session.
_Avoid_: model badge, indicator

**The seal**:
Whether Blind Flange is denying outbound calls. Closed by default, closed again by a
restart, and opened only from the control in the Sovereignty drawer — which is recorded on
the session log like any other attempt. The seal is what makes the egress monitor an
instrument rather than an assertion: with it open the attempt genuinely leaves the process,
so the same request can be shown refused on a sealed machine and reaching the internet on an
open one. That pair is the calibration.
_Avoid_: the toggle, the switch, egress mode

**Egress monitor**:
The count of outbound attempts and the record of each one. Its resting form is the seal row
at the sidebar foot — one line, always on screen, on the new-session screen as well as inside
a conversation, because the seal is a property of the installation rather than of a
conversation. Its full form is the **Sovereignty drawer**.

**Sovereignty drawer**:
The right-hand panel the seal row opens: the seal and its switch, the egress figures and the
record, then residency and the model plane as collapsed sections, then the export. One
surface answering one question — what is this machine doing, and what has it refused? It
insets the workbench rather than covering it, so it can stay open through a whole demo, and
its width is the operator's to set.
_Avoid_: the egress panel, the sidebar, the details pane

**Deliverable factory**:
The path that carries work through to a signed Word document with its own audit trail, rather
than ending at a chat reply. The reason this is a workbench and not a chatbot.
_Avoid_: export, report generator

**Attached image**:
A picture the operator put on a message — pasted, dropped, or picked from the composer's
attach row. It rides that message, is shown above it in the transcript, and goes to the vision
member as pixels. It is never described to the model in words.
_Avoid_: upload, document, ingested file

**Provenance crop**:
Removed 31 August 2026 (ADR-0008). It meant the image region a cited fact was read from, shown
next to the claim — page *and region*, never just a filename. The OCR service that produced
those regions is gone, and a model cannot give a bounding box that can be checked. The
attached image itself, beside the message that carried it, is what stands in its place. Do not
reintroduce the term for anything weaker than a checkable region.

**Harness**:
The scaffolding around a model that gives it tools, memory, a sandbox and a loop
("Agent = Model + Harness"). Ours is **DeepSeek Harness** (MIT, Node.js) — adopted as the
runtime, not merely its pattern (ADR-0003). Everything in it is a plugin. We still build
against our own plugin contracts so the harness stays one implementation behind them.
_Avoid_: the framework, the runtime (ambiguous — "the harness" means DeepSeek Harness)

**Plugin contract**:
One of our own interfaces that a harness plugin must satisfy. The contracts are ours; the
harness is an implementation of them. This is what keeps the fallback to our own agent loop
a swap rather than a rewrite.

**Model plane**:
Everything behind the `ModelProvider` interface. Callers never know which provider is
live; the UI always shows it. Three providers: **replay** (cached real responses, instant,
what the live demo runs), **local** (llama.cpp on the 1650, genuinely offline, what the
recorded proof runs), **remote** (rented GPU, development only, never in a demo).
_Avoid_: backend, inference layer, the LLM

**Replay**:
Serving stored responses. A demo mode, disclosed out loud, never presented as live inference.
The design is captured responses from real `local` runs — not a mock and not a stub, things
the system actually produced. **For Phase 0** (ADR-0001, 28 August 2026 amendment) there is no
`local` run yet to capture from, so the cache is authored by hand instead; the disclosure says
so rather than implying capture, and an authored entry is a data swap away from a captured one.
_Avoid_: fake mode, mock, demo data

**Fan-out gauge**:
The indicator showing sub-agents currently spawned and working. Makes the harness visible;
a chat box cannot show this.

**Residency**:
Which fleet members are resident in VRAM at a given moment, and how long they stay before
eviction. "Stickiness" is the policy that keeps a model resident across turns of the same
task type.

## Scope words

**The cut line**:
The explicit boundary between what ships and what is named out loud as out of scope
(§19 of the artifact). Stating the cut line is part of the pitch, not an admission.

**Tag inventory**:
What we actually extract from a P&ID — symbol and tag inventory plus region Q&A. Full
connectivity-graph extraction is past the cut line and we say so on the slide.

**Sovereignty proof**:
The demonstrated version of the sovereignty claim: pull the cable and keep working; ask the
workbench to open WhatsApp and watch the attempt refused before it runs and written to the
record. Never the asserted version. The request is the proof precisely because nobody has to
be told what it is for — a button labelled with our own vocabulary proves our vocabulary.
_Avoid_: security story, compliance claim

## Audiences

**The panel**:
SIH evaluators. Score on the rubric in §04.

**The client**:
MRPL — an ONGC subsidiary, Miniratna CPSE. Pitch to licence terms, deployability by their
own IT, and audit evidence. Not benchmark charts.

## Artifacts in this folder

**The deck**:
The 9-slide IIT Madras BS internal hackathon deck. The 6-slide official SIH portal
submission is "the idea PPT", a cut-down of the deck. Neither is source; both are output,
and neither lives in this repository.

**The explainer**:
The recorded walkthrough of an offline run, produced by `npm run record-demo`. Output only —
it is not a source of truth and nothing reads back from it.
