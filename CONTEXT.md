# Blind Flange

The shared language for SIH26117 — a sovereign, air-gapped agentic AI workbench for MRPL,
built on open-weight multimodal models. This file is the vocabulary agents and humans both
use. It is deliberately short: only terms whose meaning is specific to *this* project.

General AI jargon (token, VRAM, quantisation, KV cache, prefill/decode, MoE, RAG, reranker,
SBOM, P&ID) is defined once in §20 Glossary of `blind-flange.html` and is not repeated here.
Go there for those; come here for how *we* use words.

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

**Canary**:
The button that fires a deliberate outbound network call so the user can watch egress denial
block it, the monitor turn red, and the audit log record it. Silence proves nothing; the
canary is what turns an absence into evidence.
_Avoid_: the test call, the network test

**Egress monitor**:
The always-on display of outbound attempts. Pairs with the canary: the monitor is the
instrument, the canary is the calibration.

**Deliverable factory**:
The path that carries work through to a signed Word document with provenance, rather than
ending at a chat reply. The reason this is a workbench and not a chatbot.
_Avoid_: export, report generator

**Provenance crop**:
The image region a cited fact was actually read from, shown next to the claim. Provenance
here always means page *and region*, never just a filename.

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
Serving stored responses captured from real `local` runs. A demo mode, disclosed out loud,
never presented as live inference. Not a mock and not a stub — the responses are things the
system actually produced.
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
The demonstrated version of the sovereignty claim: pull the cable and keep working, fire
the canary and watch it blocked. Never the asserted version.
_Avoid_: security story, compliance claim

## Audiences

**The panel**:
SIH evaluators. Score on the rubric in §04.

**The client**:
MRPL — an ONGC subsidiary, Miniratna CPSE. Pitch to licence terms, deployability by their
own IT, and audit evidence. Not benchmark charts.

## Artifacts in this folder

**The artifact**:
The 21-section build plan at
https://claude.ai/code/artifact/b473557c-9051-4b97-aa83-6495a28c603d, sourced from
`blind-flange.html`. "The artifact" always means this one.

**The deck**:
The 9-slide IIT Madras BS internal hackathon deck. Copy lives in `DECK-CONTENT.md`.
The 6-slide official SIH portal submission is "the idea PPT", a cut-down of the deck.

**The explainer**:
The video in `videos/sovereign-workbench-explainer`, built from this project's context.
Output only — it is not a source of truth and nothing reads back from it.
