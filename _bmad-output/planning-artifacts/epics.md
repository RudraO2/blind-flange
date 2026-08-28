---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - _bmad-output/planning-artifacts/product-brief.md
  - CONTEXT.md
  - docs/licence-policy.md
  - docs/adr/0001-pluggable-model-plane-with-replay-provider.md
  - docs/adr/0002-build-the-panels-before-the-inference.md
  - docs/adr/0003-adopt-deepseek-harness.md
  - docs/adr/0004-extend-the-harness-web-client-rather-than-build-a-frontend.md
  - docs/adr/0005-tesseract-for-ingestion-and-a-widened-permissive-allow-list.md
  - docs/deepseek-harness-notes.md
  - HANDOFF.md
---

# Blind Flange — Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Blind Flange Phase 0,
decomposing the requirements into implementable stories.

**No PRD exists and none will be written.** For a four-day solo build the product brief
carries the scope, and `docs/deepseek-harness-notes.md` plus ADRs 0001–0004 carry the
architecture. Requirements below are extracted from those documents and each is traceable
to its source. `.scratch/phase-0-spine/spec.md` was deliberately excluded to avoid a
competing capability numbering scheme.

**Budget: four days, one person, deadline 31 August 2026.** Everything here is sized
against that. P1 items are written down so that cutting them is a decision rather than an
omission.

**Sequencing decision, taken 27 August 2026.** All twenty P0 requirements are planned, with
no cuts pre-decided. This was chosen over ordering the stories so that any stopping point
still yields a coherent demo. The risk was named at the time — twenty requirements against
four solo days, with day 1 partly spent verifying what the harness gives free — and accepted
deliberately. If the clock runs out, the cut happens against the real state of the build,
not against a guess made before day 1. FR13 (sandboxed coding task) is a must-have at
normal priority, not deferred, because MRPL's checklist asks for it by name.

## Requirements Inventory

### Functional Requirements

**Router and model selection**

FR1: [P0] The router classifies an incoming request into one of the declared task types — document, drawing, calculation, code.
FR2: [P0] The router scores every fleet member against the classified task type and selects the highest-scoring eligible member. The decision is emitted as structured data, not prose, because a panel renders it.
FR3: [P0] The routing chip shows which fleet member answered, and expands to show the classified task type, the per-member scores, and the members that were filtered out along with the reason.
FR4: [P0] When the task type changes within a single session, the selected fleet member changes without user action, and the change is visible on the chip.

**Fleet registry and licence enforcement**

FR5: [P0] One registry file declares each fleet member with name, licence, size, context, modalities and capabilities; that single file drives router scoring, the loader, the UI model list and the licence check.
FR6: [P0] The loader refuses to load any fleet member whose licence falls outside the Apache-2.0 / MIT allow-list. A refusal, not a warning.

**Model plane**

FR7: [P0] Every model call goes through one `ModelProvider` interface with `replay`, `local` and `remote` implementations, selected by configuration and never by a code path.
FR8: [P0] The active provider is visible on screen at all times, and `replay` is labelled as replay.

**Ingestion and provenance**

FR9: [P0] A scanned PDF or image is ingested and yields extracted text where each extracted claim carries the page number and the bounding box it came from.
FR10: [P0] Clicking a finding shows the cropped image region that finding was read from.

**Agentic run and deliverables**

FR11: [P0] A scanned inspection report is carried through the harness agent loop, with real tool calls, to produce key findings and then an approval note.
FR12: [P0] The approval note renders as a real `.docx` carrying a titleblock, reference number, cited clauses, a signature block, and a provenance footer with a content hash. It opens clean in LibreOffice and in Word.
FR13: [P0] A coding task is executed and verified inside the harness sandbox, and both the run and its result are visible in the UI.
FR14: [P0] Sub-agents currently spawned and working are visible on a fan-out gauge while an agentic run is in flight.

**Sovereignty proof**

FR15: [P0] An always-on egress monitor displays outbound attempts and a counter. Zero is a measured state, never a hardcoded literal.
FR16: [P0] A canary button fires a deliberate outbound call. It is denied, the monitor turns red, and an audit line records the denial.
FR17: [P0] Blocked egress attempts and tool calls are written to an append-only session log that can be shown on screen.

**Harness behaviour**

FR18: [P0] The shipped web-search tool, the cloud model adapters (`llm-deepseek`, `llm-pi-ai`) and the cloud SDK packages are disabled, so that no network-capable tool and no cloud provider appears in the tool list or the model list.
FR19: [P0] The system prompt persona, the agent presets and the UI terminology are replaced with Blind Flange's identity, its four task types, and `CONTEXT.md` vocabulary.

**Delivery**

FR20: [P0] One documented command brings the application up from a cold clone on a second machine and reaches the first demo beat.
FR21: [P1] The shipped DeepSeek API-key onboarding modal is replaced with onboarding for our own local and replay providers.
FR22: [P0] The brand mark, the browser tab title and the favicon are ours. Split out of the identity pass and promoted to P0 because these three appear in every screenshot, every both-theme verification shot and the recorded run, from day one onward — and `conversation.hero.brand.mark` is a single slot, so the swap is one plugin registration.
FR23: [P1] The remainder of the identity pass — wordmark, hero text, package scope, config paths and the copy on every shipped surface.

### NonFunctional Requirements

NFR1: Apache-2.0, MIT, BSD-2-Clause and BSD-3-Clause only, across model weights, every runtime dependency, and the harness. Verified by reading the `LICENSE` file at the version being pinned — not a README, not a summary. The allow-list was widened from two licences to four on 28 August 2026 by ADR-0005; widening it again is an ADR-level decision, never a judgement call made at the point of use.
NFR2: Offline by construction. No component reaches the network at runtime and every model artefact is pre-staged. A blocked call must fail fast; a hang looks like a crash on stage.
NFR3: No external URL may enter the frontend bundle. A build check fails on `http` in the built output, not merely in source.
NFR4: Runs within the fixed hardware envelope — MSI GF63, i5-11260H, 15.7 GB RAM, GTX 1650 Max-Q with 4 GB VRAM. No cloud GPU during any demo or recording.
NFR5: Extend, do not fork. Harness changes are made through profile `cordis.patch.yml` rows and out-of-tree plugin packages, never by editing harness source.
NFR6: `@deepseek-ai/dsh` is pinned at `0.1.1-rc.2`. Our code targets our own plugin contracts, so the harness stays one implementation behind them.
NFR7: The harness orchestrates in Node; Python services do all machine learning behind local HTTP. No objects cross that line.
NFR8: Every panel is driven by a real event. Only token generation is replayed — the firewall, the canary, the `.docx` generation and the router scoring are real. A panel that animates without a real event behind it is a bug, not a shortcut.
NFR9: The demo hook lands inside thirty seconds and the whole demo stays under three minutes.
NFR10: All four delivery formats are satisfied, because the round format is unannounced — a repo link, an app that runs from a cold clone, a recorded video, and a live demo.
NFR11: The dependency on DeepSeek Harness is disclosed first and in our own words. The MIT copyright notice is retained in source.
NFR12: Budget is four days and one person, against a deadline of 31 August 2026.

### Additional Requirements

Extracted from `docs/deepseek-harness-notes.md` and ADRs 0003/0004, which stand in for an
architecture document.

- **Starter template.** There is no conventional greenfield starter. The starting point is a global install of `@deepseek-ai/dsh@0.1.1-rc.2` plus the shipped `web` profile. Epic 1 Story 1 is profile-and-plugin scaffolding against that, not a framework scaffold.
- **Plugin installation path.** A plugin is a dependency in `~/.dsh/profiles/web/package.json` (the profile is its own pnpm workspace, `nodeLinker: hoisted`) plus an insert row in that profile's `cordis.patch.yml`. Dropping packages into `~/.dsh/profiles/node_modules/` was a spike shortcut and must be migrated off.
- **Client plugin format.** `window.__ModuleLoader__.load({ id, factory })`. React is resolved from the host through `require('react/jsx-runtime')`, so a plugin ships no React of its own and needs no bundler.
- **Extension points, verified from `docs/architecture.md` in the clone.** `ctx.llm.registerAdapter` for the model plane; `ctx.tools.register` / `defineTool` for the canary, the `.docx` render and calculations; a `tools/pre-execute` waterfall returning `{ kind: 'deny' }` for egress denial; `session/event` to JSONL for the audit log, replayable via `sessions.create(id, { seed })`; `ctx.subagents` plus `dsh-tool-subagent` for fan-out; `ask` returned from `tools/pre-execute` and answered via `ctx.approval` for the approval gate; `ctx.sandbox` via `dsh-bash-sandbox` for sandboxed execution.
- **Model-visible means logged.** A runtime invariant requires anything reaching a model request to be reconstructable from the session log. A new model-visible input therefore requires a new session event in `SessionEventMap`.
- **Day-1 scope levers — verify before planning build work.** `dsh-client-ui-subagent` and `ctx.subagents` may give the fan-out gauge nearly free; `ctx.sandbox` / `dsh-bash-sandbox` may give the sandboxed coding task nearly free; `dsh-client-ui-deliverables`, `ui-jobs` and `ui-trajectory` may give the deliverable surfaces nearly free. This is the single biggest lever on four days.
- **Persistence is probably already solved.** The harness ships its own session persistence. Verify whether SQLite or Postgres is needed at all before either is planned.
- **Two onboarding modals stand between a cold start and the demo.** The Internal Testing Notice is dismissed by `ui-onboarding.welcomeNoticeVersion` in `~/.dsh/settings.yaml`, which can ship with the profile. The API-key modal is driven by there being no configured provider and may disappear once ours is registered — verify, do not assume.
- **Node version.** This machine runs v22.15.0; `@earendil-works/pi-ai` wants `>=22.19.0`. Upgrade Node before trusting that provider path, or remove it — FR18 removes it anyway.
- **`THIRD_PARTY_NOTICES.md` is unaudited.** The Apache-2.0/MIT-only claim must not be put in front of MRPL until it is.
- **The external-URL grep has only been run against source.** It must be re-run against the built `dist/` bundle.
- **Cordis learning risk is concentrated in three seams.** Slot registration is proven. The `LlmAdapter`, the tool registry and the subagent seam are not. Attempt the replay `LlmAdapter` first; if it resists by the end of day 1, fall back to our own loop behind the same contract.

### UX Design Requirements

No UX specification exists. These are extracted from ADR-0004's consequences, the verified
slot table in `docs/deepseek-harness-notes.md`, and the non-negotiable UI rules in
`CLAUDE.md`.

UX-DR1: All custom UI is built from `@deepseek-ai/dsh-client-ui-primitives` and the `ui-theme` tokens. No hand-rolled hex colours, radii, spacing, shadows or font stacks.
UX-DR2: Every panel renders correctly in both light and dark. The theme is user-selectable in Settings, so a component that only works in one is unfinished. Verification is a screenshot of the surface in both themes.
UX-DR3: Every new surface takes a declared slot. Never register into `root` — a dynamically registered entry there gets a lower priority than the shipped one, which makes it win, shadowing ui-layout's AppFrame and destroying every seat inside it.
UX-DR4: Slot assignments. Routing chip → `conversation.input.model` (single, replaces the stock model picker). Egress chip → `conversation.session.header.utilities` (list). Egress full panel → `shell.overlay` (list, root). Canary button → `conversation.input.right` (list). Provenance crop viewer → `conversation.view` (list). Deliverable view → `conversation.view` (list). Brand mark → `conversation.hero.brand.mark` (single).
UX-DR5: Each component matches the density, typography and border conventions of the surface it sits on. A control in the composer row looks like the controls already in that row.
UX-DR6: Restraint over decoration. This is industrial control software, not a landing page. A colourful mess hands a judge the "they just skinned an existing tool" conclusion.
UX-DR7: The egress monitor built during the 27 August spike uses hand-written greens and a hand-rolled pill, and reads as pasted on. It is rewritten against the primitives before it ships. It is the counter-example the rule exists to prevent.
UX-DR8: All UI copy uses `CONTEXT.md` vocabulary and honours its `_Avoid_` lists — fleet, router, routing chip, canary, egress monitor, deliverable factory, provenance crop, model plane, replay, fan-out gauge.
UX-DR9: The provider disclosure surface must read as rigour rather than as a caveat. How `replay` is surfaced is an open design question, not a solved one.
UX-DR10: Every font, icon and script is self-hosted. This is a UI build obligation as well as the build check in NFR3.

### FR Coverage Map

Every functional requirement maps to exactly one epic. 23 of 23 covered, none duplicated.

| FR | Epic | What it lands as |
|---|---|---|
| FR1 | Epic 3 | Task-type classification |
| FR2 | Epic 3 | Per-member scoring and selection, emitted as data |
| FR3 | Epic 3 | Routing chip, expanding to scores and exclusions |
| FR4 | Epic 3 | Model changes mid-session on a task-type change |
| FR5 | Epic 3 | `registry/models.yaml` as the one source |
| FR6 | Epic 3 | Loader refuses a non-allow-listed licence |
| FR7 | Epic 3 | `ModelProvider` with replay / local / remote |
| FR8 | Epic 3 | Active provider always visible |
| FR9 | Epic 4 | RapidOCR ingestion, text with page and bounding box |
| FR10 | Epic 4 | Provenance crop viewer |
| FR11 | Epic 5 | Agent loop, real tool calls, report to approval note |
| FR12 | Epic 5 | `.docx` deliverable factory with provenance footer |
| FR13 | Epic 5 | Sandboxed coding task, run and result visible |
| FR14 | Epic 5 | Fan-out gauge |
| FR15 | Epic 2 | Egress monitor, measured zero |
| FR16 | Epic 2 | Canary, denial, red state |
| FR17 | Epic 2 | Append-only audit log, shown on screen |
| FR18 | Epic 1 | Web search tool, cloud adapters and cloud SDKs disabled |
| FR19 | Epic 1 | Persona, agent presets and terminology re-pointed |
| FR20 | Epic 6 | Cold-clone start, on this machine and the second one |
| FR21 | Epic 7 | Local / replay provider onboarding replaces the API-key modal |
| FR22 | Epic 1 | Brand mark, tab title, favicon |
| FR23 | Epic 7 | Remainder of the identity pass |

## Epic List

Seven epics. **Build order is 1 → 7. Demo order is different and starts at Epic 2** — these
are two lists and merging them for tidiness was a mistake caught in review. See "Build order
is not demo order" below.

### Epic 1: The sealed workbench

Someone opens Blind Flange and gets an industrial workbench that is visibly ours and visibly
sealed. No web search tool. No cloud model providers. No API-key prompt. Our mark at the top
of the screen. The tool list and the model list can be opened and audited in ten seconds, and
a stock install visibly does not behave this way.

**FRs covered:** FR18, FR19, FR22

**Implementation notes.** This epic also carries the scaffolding every later epic mounts
through — the `@blind-flange/*` plugin package, its dependency row in
`~/.dsh/profiles/web/package.json`, and the insert row in that profile's `cordis.patch.yml`.
That work gets its own story with real acceptance criteria rather than living as a footnote.
Removal is done by `disabled: true` rows and insert removals, never by editing harness source
(NFR5). The Internal Testing Notice is suppressed by shipping
`ui-onboarding.welcomeNoticeVersion` in the profile's `settings.yaml`. The brand mark is a
single-slot swap at `conversation.hero.brand.mark`; the full identity pass stays in Epic 7.

### Epic 2: Proof that nothing leaves the machine

The egress monitor reads zero. The operator presses the canary. One deliberate outbound call
is attempted, denied, the monitor turns red, and a line lands in the audit log that can be
shown on screen. Silence proves nothing; this epic is what turns an absence into evidence.

**FRs covered:** FR15, FR16, FR17

**Implementation notes.** Needs no model of any kind — this is ADR-0002 in its purest form.
Denial is a `tools/pre-execute` waterfall returning `{ kind: 'deny' }`; the audit log is
`session/event` to JSONL. Zero must be counted, not printed (FR15). The egress monitor written
during the 27 August spike is rewritten against `ui-primitives` and theme tokens before it
ships (UX-DR7) — it is the counter-example the UI rules exist to prevent. Chip takes
`conversation.session.header.utilities`, full panel takes `shell.overlay`, canary button takes
`conversation.input.right`.

### Epic 3: Model choice you can audit

The operator never picks a model. The system classifies the task, scores every fleet member,
picks one, and shows its working — the scores, the task type, and who was filtered out and
why. Every member carries a permissive licence and the loader refuses anything else. The
active provider is on screen at all times, and replay is labelled replay.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8

**Implementation notes.** Eight requirements in one epic because they all run through the same
three artefacts — `registry/models.yaml`, the router, and one chip component at
`conversation.input.model`. Splitting them would mean three separate passes over the same
files. **The riskiest unknown in the project sits here:** the `LlmAdapter` seam via
`ctx.llm.registerAdapter` is unproven. Story 3.1 is the replay adapter attempt, taken on day 1,
with ADR-0001's fallback — our own loop behind the same contract — as an explicit decision
point rather than a discovery made on day 3.

### Epic 4: Reading a scan, with the evidence attached

An operator drops in a scanned inspection report. Text comes out, and every extracted claim
carries the page and the region it was read from. Clicking a finding shows the cropped image
region — provenance meaning page *and region*, never just a filename.

**FRs covered:** FR9, FR10

**Implementation notes.** **This is the largest build on the board despite carrying the fewest
requirement numbers, and it is the top schedule risk.** Underneath two FRs sit a Python
service, OCR, a cross-language contract for passing bounding boxes over local HTTP (NFR7), and
a crop viewer that maps a box on a page image back to a rendered region. Ingestion is
RapidOCR, not Docling and no longer Tesseract — PP-OCRv6 on ONNX Runtime returns line-level
boxes with confidences, which is FR9's criterion almost verbatim. **Changed 28 Aug 2026 by the
amendment to ADR-0005**: Tesseract was proved out first (Story 4.2) and worked, but mangled the
reference numbers and equipment tags an inspection report is made of, and a cited finding with a
wrong reference is worse than none. That amendment also records the one open licence question
the swap introduced, which Story 6.4 must close. Page rendering is `pypdfium2`;
**PyMuPDF is AGPL-3.0 and must not be used**. Story 4.1 commits the synthetic sample page every
later story runs against; Story 4.2 is a timeboxed proof that OCR returns boxes on this
laptop, before any other work in this epic. If it slips, the crop slips —
**no pre-baked fixture**, because a panel that animates without a real event behind it is a
bug, not a shortcut (ADR-0002, NFR8).

### Epic 5: Real work, real deliverable

The workbench does the work instead of talking about it. The agent runs on the report, helper
agents spawn and are visible while they work, a coding task executes inside the sandbox, and
the output is a real `.docx` — titleblock, reference number, cited clauses, signature block,
provenance footer with a content hash — that opens clean in LibreOffice and Word.

**FRs covered:** FR11, FR12, FR13, FR14

**Implementation notes.** The sandboxed coding task is folded in here rather than given its own
epic: it is the same user outcome, which is the workbench producing real output rather than
chat. `ctx.sandbox` via `dsh-bash-sandbox`, `ctx.subagents` for fan-out, `defineTool` for the
`.docx` render. All three may be close to free from shipped harness code — that is the day-1
verification, and it is the single biggest lever on the remaining days.

### Epic 6: It runs on someone else's machine

A judge handed nothing but a repo link gets the same application. One documented command from
a cold clone reaches the first demo beat, the built bundle contains no external URL, and a
recorded offline run exists so the round is satisfied whichever format it turns out to be.

**FRs covered:** FR20

**Implementation notes.** FR20 splits into two acceptance criteria, because they need different
evidence: runs from a clean directory on this machine (testable immediately), and runs on
hardware that is not this laptop (testable on the teammate's machine, same 4 GB GPU class,
confirmed available 28 August 2026). Also carries the build check that fails on `http` in the
**built** output rather than in source (NFR3) — the existing grep has only ever been run
against source — and the `THIRD_PARTY_NOTICES.md` audit that NFR1 depends on.

### Epic 7: The identity pass — P1

Wordmark, hero text, package scope, config paths and the copy on every shipped surface become
ours, and the DeepSeek API-key onboarding modal is replaced with onboarding for our own local
and replay providers.

**FRs covered:** FR21, FR23

**Implementation notes.** Deliberately last, per ADR-0004: a renamed shell with none of our
panels in it *is* the reskin we are accused of. This is the designated cut if the clock runs
out — which is survivable precisely because the three identity items that appear in every
screenshot (mark, tab title, favicon) were pulled forward into Epic 1 as FR22.

### Build order is not demo order

Two separate lists. Merging them was tidy and wrong.

**Build order:** 1, 2, 3, 4, 5, 6, 7. Epic 1 first because every later epic mounts through its
plugin scaffolding.

**Demo order:** Epic 2 opens — egress monitor at zero, canary pressed, red, audit line. Three
seconds, no explanation needed, and it lands with an audience that has never seen a P&ID. Then
Epic 3's routing chip changing model by itself. Then Epic 5's `.docx`.

Epic 1's tool-list audit — opening the tool list and the model list to show no network tools
and no cloud providers — is **sovereignty-critical to build and a Q&A beat to show**. It is
devastating to an MRPL reviewer and invisible to a student judge, exactly like the licence
argument the brief already says to hold for Q&A rather than lead with.

---

## Standing acceptance criteria

These apply to **every** story below and are not repeated in each one. A story is not done
until they hold.

**Given** any story that adds or changes a user-visible surface
**When** it is called done
**Then** the surface has been screenshotted in both light and dark themes
**And** it is built from `@deepseek-ai/dsh-client-ui-primitives` and `ui-theme` tokens, with no
hand-rolled hex colours, radii, spacing, shadows or font stacks (UX-DR1, UX-DR2)
**And** it occupies a declared slot, never `root` (UX-DR3)
**And** its copy uses `CONTEXT.md` vocabulary and avoids the terms listed there under `_Avoid_`
(UX-DR8)

**Given** any story at all
**When** it is called done
**Then** no harness source file has been edited — changes are `cordis.patch.yml` rows and
out-of-tree plugin packages only (NFR5)
**And** any new dependency has been checked against `docs/licence-policy.md` before it was added
(NFR1)
**And** the work is committed with a Conventional Commits subject and pushed (repo convention)
**And** every panel it touches is driven by a real event, never an animation without one (NFR8)

---

## Epic 1: The sealed workbench

Someone opens Blind Flange and gets an industrial workbench that is visibly ours and visibly
sealed. No web search tool, no cloud model providers, no API-key prompt, and our mark at the
top of the screen.

### Story 1.1: The Blind Flange plugin package mounts in the web profile

As the developer building this workbench,
I want our own plugin package mounted through the profile's supported installation path,
So that every panel in every later epic has somewhere real to mount, and the spike's shortcut
does not become the architecture.

**Acceptance Criteria:**

**Given** a machine with `@deepseek-ai/dsh` installed at the pinned version `0.1.1-rc.2`
**When** `dsh web` is started
**Then** `@blind-flange/dsh-client-ui-*` is served from `/plugins/@blind-flange/...` alongside
the shipped plugins
**And** the package is a dependency in `~/.dsh/profiles/web/package.json`, **not** dropped into
`~/.dsh/profiles/node_modules/`
**And** it is mounted by an insert row in that profile's `cordis.patch.yml`
**And** `dsh --profile web --dump-config` shows the row in the resolved tree

**Given** the plugin package
**When** its client half is inspected
**Then** it ships no React of its own, resolving `react/jsx-runtime` from the host through the
`window.__ModuleLoader__.load({ id, factory })` format
**And** the pinned harness version is recorded in the repo so a rebuild is reproducible

### Story 1.2: No network-capable tool appears in the tool list

As an evaluator auditing this workbench,
I want the tool list to contain nothing that can reach the network,
So that the air-gap claim is checkable in ten seconds rather than argued.

**Acceptance Criteria:**

**Given** a running `dsh web` with our profile
**When** the tool list is opened
**Then** `web-search-deepseek` does not appear
**And** no other tool in the list is capable of an outbound network call

**Given** the profile configuration
**When** the removal is inspected
**Then** it was done with a `disabled: true` row or an insert removal in `cordis.patch.yml`
**And** no file under the harness install was modified

### Story 1.3: No cloud model provider appears in the model list

As an evaluator auditing this workbench,
I want the model list to contain only local fleet members,
So that "sovereign" is visible in the product rather than claimed on a slide.

**Acceptance Criteria:**

**Given** a running `dsh web` with our profile
**When** the model list and provider list are opened
**Then** `llm-deepseek` and `llm-pi-ai` do not appear
**And** no cloud provider adapter is mounted in the resolved plugin tree

**Given** the built profile tree
**When** it is inspected for cloud SDKs
**Then** `@anthropic-ai`, `@aws-sdk`, `@google`, `@mistralai` and `openai` are not resolvable
**And** the behaviour of the shipped API-key onboarding modal after this change is recorded —
whether it disappears or persists — since Epic 7 depends on the answer

### Story 1.4: The workbench introduces itself as Blind Flange

As an operator opening this tool,
I want it to describe itself as an industrial knowledge-work workbench with our task types,
So that it does not read as a general coding agent wearing a different hat.

**Acceptance Criteria:**

**Given** the system prompt in the resolved configuration
**When** it is read
**Then** it describes Blind Flange as a sovereign industrial knowledge-work workbench
**And** it no longer contains "You are a coding agent powered by the {{model}} model"

**Given** the agent preset picker
**When** it is opened
**Then** the presets are the four task types — document, drawing, calculation, code
**And** "Standard mode" and the other shipped presets are gone

**Given** any shipped UI surface carrying terminology we own
**When** its copy is read
**Then** it uses `CONTEXT.md` terms — fleet, router, routing chip, canary, egress monitor,
deliverable factory, provenance crop, model plane, replay, fan-out gauge
**And** it does not use the synonyms listed under `_Avoid_`

### Story 1.5: Our mark, our tab title, our favicon

As anyone looking at a screenshot, a recording or the live app,
I want Blind Flange's identity at the top of the screen,
So that nothing we produce carries someone else's logo.

**Acceptance Criteria:**

**Given** the running app
**When** the hero is rendered
**Then** the Blind Flange mark occupies `conversation.hero.brand.mark` and the DeepSeek whale
does not appear
**And** the browser tab title reads Blind Flange
**And** the favicon is ours

**Given** the source tree
**When** it is inspected for licence compliance
**Then** the MIT copyright notice for DeepSeek Harness is retained (NFR11)
**And** "DeepSeek Harness" does not appear in the project name, per their brand guidelines

---

## Epic 2: Proof that nothing leaves the machine

The monitor reads zero, the canary is pressed, the call is denied, the monitor turns red, and
a line lands in the audit log.

### Story 2.1: Outbound attempts are denied and recorded

As the operator of an air-gapped workbench,
I want every outbound network attempt to be refused and written down,
So that the refusal is a fact in a log rather than a claim on a panel.

**Acceptance Criteria:**

**Given** a tool that attempts an outbound network connection
**When** it is invoked
**Then** the `tools/pre-execute` waterfall returns `{ kind: 'deny' }` and the call does not
proceed
**And** the attempt fails fast rather than hanging — a hang looks like a crash on stage (NFR2)

**Given** a denied attempt
**When** the session log is read
**Then** a `session/event` record has been appended to JSONL carrying the timestamp, the tool,
and the target that was refused
**And** the log is append-only

### Story 2.2: The egress monitor shows a counted zero

As an evaluator watching this demo,
I want a live panel showing outbound attempts,
So that the zero I am being shown is measured rather than printed.

**Acceptance Criteria:**

**Given** a session with no outbound attempts
**When** the egress monitor is displayed
**Then** the counter reads zero
**And** that zero is derived from counting denial events, not written as a literal anywhere in
the source

**Given** the monitor
**When** it is mounted
**Then** the compact chip occupies `conversation.session.header.utilities` and the full panel
occupies `shell.overlay`

**Given** the egress monitor written during the 27 August spike
**When** this story is done
**Then** it has been rewritten against the shipped primitives and theme tokens, and its
hand-written greens and hand-rolled pill are gone (UX-DR7)

### Story 2.3: The canary proves the zero is enforced

As an evaluator who does not trust a quiet panel,
I want a button that deliberately tries to call out,
So that I can watch the block happen instead of taking silence as evidence.

**Acceptance Criteria:**

**Given** the canary button at `conversation.input.right`
**When** it is pressed
**Then** a real outbound connection is attempted — not simulated
**And** it is denied by the same waterfall that denies any other attempt
**And** the egress monitor turns red

**Given** a fired canary
**When** the audit log is read
**Then** the denial is recorded with the same shape as any other denial
**And** the monitor's counter has incremented

### Story 2.4: The audit log can be read on screen

As an evaluator asking "show me",
I want the log visible in the application,
So that the evidence does not require a terminal.

**Acceptance Criteria:**

**Given** a session with at least one denied attempt
**When** the audit surface is opened
**Then** each denial is listed with timestamp, tool and refused target
**And** entries appear in the order they were written
**And** the surface reflects new denials without a restart

---

## Epic 3: Model choice you can audit

The system classifies the task, scores the fleet, picks a member, shows its working, refuses a
badly-licensed member, and always says which provider is live.

### Story 3.1: A replay provider answers a turn through the model plane

As the developer with three days and an unproven seam,
I want the replay provider working end to end on day one,
So that the fallback decision is made deliberately rather than discovered on day three.

**Acceptance Criteria:**

**Given** a `ModelProvider` contract of ours with `replay`, `local` and `remote` behind it
**When** a turn is run with `replay` selected by configuration
**Then** the response is served from cached captures and the turn completes
**And** the provider was chosen by configuration, never by a code path (FR7)

**Given** cached responses used by `replay`
**When** their origin is checked
**Then** they are authored entries in the same format a captured cache would use, per the
28 August 2026 amendment to ADR-0001 — real `local` inference is a day-4 stretch goal, so there
is nothing to capture from
**And** replacing an authored entry with a captured one later is a data change, not a code change

**Given** the `ctx.llm.registerAdapter` attempt
**When** it has consumed its day-one timebox without working
**Then** the fallback is taken — our own loop behind the same contract — and the decision is
recorded in the repo rather than left implicit

### Story 3.2: The active provider is always visible, and replay says replay

As an evaluator being shown a demo,
I want the application to tell me which provider is answering,
So that replay reads as rigour rather than as something that was hidden from me.

**Acceptance Criteria:**

**Given** any session
**When** the workbench is on screen
**Then** the active provider is visible without opening a menu
**And** when `replay` is active the surface says replay in plain words
**And** the wording does not imply the responses were captured from a live run — for Phase 0 they
are authored, and the label says so (ADR-0001 amendment, 28 August 2026)

**Given** the disclosure surface
**When** a judge sees it for the first time
**Then** it presents as a deliberate operating mode, not a warning or an apology (UX-DR9)

### Story 3.3: The fleet is declared in one registry file

As an evaluator asking "how do you add a model?",
I want one file that declares the fleet,
So that the answer is configuration rather than a code change.

**Acceptance Criteria:**

**Given** `registry/models.yaml`
**When** it is read
**Then** each fleet member carries name, licence, size, context, modalities and capabilities

**Given** a new member added to that file and nothing else changed
**When** the workbench is restarted
**Then** it appears in the UI model list
**And** it is scored by the router
**And** it is checked by the loader

**Given** the Phase 0 fleet below
**When** the registry is authored
**Then** it declares exactly these members, with these licences

| Member | Role | Licence | Note |
|---|---|---|---|
| `Qwen/Qwen2.5-7B-Instruct` | general reasoner | Apache-2.0 | |
| `Qwen/Qwen2.5-Coder-7B-Instruct` | coder | Apache-2.0 | serves the sandboxed coding task |
| `Qwen/Qwen2.5-VL-7B-Instruct` | vision-document | Apache-2.0 | serves the document and drawing task types |
| `Qwen/Qwen2.5-3B-Instruct` | — | **Qwen Research Licence** | **declared so the loader can refuse it — see Story 3.4** |

**And** each licence has been re-verified by reading the `LICENSE` file in the model repository
at the revision named in the registry, not from a blog post or this table (NFR1)

**Given** Phase 0 runs on `replay` and loads no weights
**When** the registry is questioned
**Then** it is understood to be a declaration that drives the UI list, the router and the licence
gate — the entries are real models with real licences even though no weights are downloaded for
this round
**And** no embedder or reranker is declared, because retrieval is past the Phase 0 cut line and
declaring unused members would mean verifying licences we do not need

### Story 3.4: The loader refuses a fleet member with a disallowed licence

As MRPL's technical reviewer,
I want the licence rule enforced by the software,
So that "we only use permissive licences" is a mechanism rather than a sentence.

**Acceptance Criteria:**

**Given** a fleet member whose `license:` field is outside the allow-list — Apache-2.0, MIT,
BSD-2-Clause, BSD-3-Clause (ADR-0005)
**When** the loader processes the registry
**Then** it refuses to load that member and states the licence that caused the refusal
**And** it is a refusal, not a warning, and the member does not appear in the model list

**Given** `Qwen/Qwen2.5-3B-Instruct` declared in the registry under the Qwen Research Licence
**When** the loader processes the registry
**Then** it is refused and does not appear in the model list, while `Qwen2.5-7B-Instruct`,
`Qwen2.5-Coder-7B-Instruct` and `Qwen2.5-VL-7B-Instruct` load normally

**Given** an evaluator who wants to check the refusal is genuine
**When** they look up the two models
**Then** they find the same family, the same publisher, the same release — Qwen2.5 is Apache-2.0
at 0.5B, 1.5B, 7B, 14B and 32B, and under Alibaba's own licence at 3B and 72B — so the refusal is
verifiable in ten seconds rather than taken on trust

**Given** any other disallowed licence — CDLA-Permissive-2.0, AGPL-3.0, a community licence with
a user cap
**When** it is placed in the registry
**Then** the behaviour is identical, because the gate reads the allow-list rather than a blocklist

### Story 3.5: The router classifies a request into a task type

As an operator,
I want the workbench to work out what kind of job I have given it,
So that I never have to choose a model.

**Acceptance Criteria:**

**Given** an incoming request
**When** the router classifies it
**Then** it resolves to one of document, drawing, calculation or code
**And** the classification is emitted as structured data a panel can render, not as prose (FR2)
**And** the classification event is recorded in the session log, because anything model-visible
must be reconstructable from it

### Story 3.6: The router scores the fleet and picks a member

As an evaluator asking "why that model?",
I want a score per fleet member,
So that the answer is data I can look at rather than a rule I have to trust.

**Acceptance Criteria:**

**Given** a classified task type
**When** the router runs
**Then** every eligible fleet member has a score
**And** the highest-scoring eligible member is selected
**And** members excluded before scoring carry a machine-readable reason for the exclusion

**Given** the scoring output
**When** it is inspected
**Then** it is structured data, and no part of the decision exists only as rendered text

### Story 3.7: The routing chip shows the decision and the working

As an evaluator who has seen a model dropdown before,
I want to open the chip and see the scores,
So that the difference from a dropdown is visible rather than explained.

**Acceptance Criteria:**

**Given** a completed turn
**When** the routing chip is displayed at `conversation.input.model`
**Then** it names the fleet member that answered
**And** it has replaced the stock model picker rather than sitting beside it

**Given** the chip
**When** it is expanded
**Then** it shows the classified task type, the per-member scores, and the members filtered out
with the reason each was filtered

### Story 3.8: The model changes by itself when the task type changes

As an evaluator watching one session,
I want the model to change without anyone touching a control,
So that I can see the router working rather than being told about it.

**Acceptance Criteria:**

**Given** an active session where one task type has already been answered
**When** the next request classifies as a different task type
**Then** a different fleet member is selected without any user action
**And** the routing chip visibly updates to the new member
**And** the new scores are available in the expanded chip

---

## Epic 4: Reading a scan, with the evidence attached

A scanned page goes in, findings come out, and each finding clicks through to the pixel region
it was read from.

### Story 4.1: The sample inspection report exists

As the person who has to demo document reading,
I want a scanned-looking inspection report committed to the repository,
So that every later story in this epic has something real to run against, and the demo does not
depend on finding a document on the day.

**Acceptance Criteria:**

**Given** a generator script committed alongside its output
**When** it is run
**Then** it produces a page image of a maintenance or inspection report for a **fictional**
refinery, with fictional plant, equipment tags and personnel
**And** the page is degraded to carry real scan artefacts — slight skew, speckle, uneven contrast,
softened edges — because a clean render makes OCR look easier than it is
**And** it contains typed body text, at least one table, and at least one handwritten annotation

**Given** the produced page
**When** anyone looks at it
**Then** it is unmistakably synthetic sample data and does not present itself as a genuine MRPL
record or any other real organisation's record

**Given** the generator's dependencies
**When** they are checked
**Then** every one is inside the licence allow-list (NFR1)

**Given** the committed sample
**When** the repository is cloned cold
**Then** the sample is present, so Stories 4.2 through 4.5 need no external asset

### Story 4.2: Tesseract returns word boxes on this hardware

As the developer carrying the largest unknown in the build,
I want proof that OCR produces coordinates on this laptop before anything is designed around it,
So that a failure here surfaces on day one rather than on the night before.

**Acceptance Criteria:**

**Given** the sample inspection report exists as a scanned-looking page image in the repository —
a fictional refinery, clearly marked as synthetic sample data, with typed body text and at least
one handwritten annotation, degraded so it carries real scan artefacts (skew, speckle, uneven
contrast)
**And** a timebox agreed before starting
**When** `pytesseract.image_to_data()` is run against it
**Then** the output contains words with `left`, `top`, `width`, `height` and a confidence score
**And** it ran on CPU, with no CUDA path and no VRAM used
**And** the elapsed time and memory used are recorded

**Given** the sample document
**When** anyone looks at it
**Then** it is unmistakably synthetic sample data and does not present itself as a genuine MRPL
record — the company, the plant and the equipment tags are fictional

**Given** the timebox expires without word boxes
**When** the story is closed
**Then** the failure is escalated as a scope decision
**And** **no pre-baked fixture is substituted** — if the OCR slips, the provenance crop slips
(ADR-0002, NFR8)

### Story 4.3: The ingestion service returns text with regions for a scanned image

As an operator,
I want to hand a scanned page to the workbench and get findings back with their coordinates,
So that the reading is done by the system rather than by me.

**Acceptance Criteria:**

**Given** a scanned image submitted to the ingestion service over local HTTP
**When** the service processes it
**Then** it returns findings as JSON, each carrying its bounding box and a confidence (FR9, part
one of two)

**Given** the service
**When** its boundary is inspected
**Then** it is a Python service reached over local HTTP and no objects cross the Node/Python line
(NFR7)
**And** the request and response shapes are written down as a contract, so the harness side can
be built against them without reading the Python

**Given** the service at runtime
**When** the network is observed
**Then** it makes no outbound call, and its models were pre-staged rather than downloaded on
first use (NFR2)

### Story 4.4: The ingestion service accepts a scanned PDF

As an operator,
I want to drop in the inspection report in the form it actually arrives in,
So that I do not have to convert a PDF to images before the workbench will read it.

**Acceptance Criteria:**

**Given** a multi-page scanned PDF submitted to the ingestion service
**When** the service processes it
**Then** each page is rendered to an image with `pypdfium2` and passed through the path built in
Story 4.3
**And** every returned finding carries its **page number** as well as its bounding box, completing
FR9

**Given** the dependency tree of the ingestion service
**When** it is inspected
**Then** **`PyMuPDF` does not appear anywhere in it** — it is AGPL-3.0 and is the default an
agent will reach for unprompted (ADR-0005)
**And** every licence in the tree is inside the allow-list

### Story 4.5: Clicking a finding shows the crop it was read from

As an evaluator being shown a claim,
I want to see the patch of the page it came from,
So that provenance means page and region rather than a filename.

**Acceptance Criteria:**

**Given** a set of findings from an ingested document
**When** a finding is clicked
**Then** the cropped image region it was read from is displayed
**And** the region shown corresponds to the bounding box recorded for that finding

**Given** the crop viewer
**When** it is mounted
**Then** it occupies `conversation.view`
**And** the crop is generated from the real page image, with no pre-rendered fixtures

---

## Epic 5: Real work, real deliverable

The agent runs, helpers spawn visibly, code runs in the sandbox, and a real `.docx` comes out.

### Story 5.1: The agent turns a scanned report into key findings

As an operator,
I want the workbench to run the job end to end,
So that I get findings rather than a conversation about findings.

**Acceptance Criteria:**

**Given** an ingested inspection report
**When** the agent run is started
**Then** the harness agent loop executes with at least one real tool call
**And** key findings are produced, each carrying the provenance recorded in Epic 4

**Given** the completed run
**When** the session log is read
**Then** the turn flow is reconstructable from it — every tool call and result is recorded

### Story 5.2: Helper agents are visible while they work

As an evaluator,
I want to see sub-agents spawn and finish,
So that I can see the harness doing something a chat box cannot show.

**Acceptance Criteria:**

**Given** an agent run that spawns sub-agents
**When** the fan-out gauge is displayed
**Then** it shows the sub-agents currently spawned and working
**And** the count is driven by real `ctx.subagents` events, never by a timer or an animation

**Given** the run completes
**When** the gauge is observed
**Then** it returns to its resting state

### Story 5.3: A coding task runs and is verified in the sandbox

As MRPL's evaluator reading their own checklist,
I want a coding task executed in a sandbox,
So that item three of the expected solution is demonstrably met.

**Acceptance Criteria:**

**Given** a coding task given to the workbench
**When** it is executed
**Then** it runs inside the harness sandbox via `ctx.sandbox` / `dsh-bash-sandbox`
**And** the run and its result are visible in the UI

**Given** a task that fails
**When** it is executed
**Then** the failure is surfaced in the UI rather than swallowed

### Story 5.4: The approval note comes out as a signed .docx

As an operator,
I want a real document at the end,
So that the workbench produces work product rather than a chat reply.

**Acceptance Criteria:**

**Given** a completed set of findings
**When** an approval note is requested
**Then** a `.docx` is produced carrying a titleblock, a reference number, the cited clauses, a
signature block, and a provenance footer with a content hash

**Given** the produced file
**When** it is opened
**Then** it opens clean in LibreOffice **and** in Word
**And** the cited clauses trace back to the findings and their provenance

**Given** the render path
**When** it is inspected
**Then** the document is generated by a real tool registered through `defineTool`, not
pre-authored

---

## Epic 6: It runs on someone else's machine

A judge handed nothing but a repo link gets the same application.

### Story 6.1: One command starts the workbench from a clean directory

As a judge who was given only a repo link,
I want one documented command to bring it up,
So that I can see the thing rather than fight the setup.

**Acceptance Criteria:**

**Given** a clean clone in an empty directory on the build machine
**When** the documented start command is run
**Then** the workbench comes up and reaches the first demo beat — egress monitor visible, canary
pressable
**And** the command and its prerequisites are documented in the repo

**Given** the cold start
**When** it runs
**Then** no component downloads a model or a font at first use (NFR2)

### Story 6.2: The built bundle contains no external URL

As an evaluator with the egress monitor open on a projector,
I want certainty that no asset request will leave the machine,
So that the demo cannot be undone by a font CDN.

**Acceptance Criteria:**

**Given** a production build of the client
**When** the build check runs against the **built output**, not the source
**Then** it fails if any `http`-scheme external URL is present
**And** it passes for the current build

**Given** every font, icon and script used by our panels
**When** their origin is checked
**Then** all are self-hosted (UX-DR10)

### Story 6.3: It runs on the second machine

As the person whose laptop might fail on the day,
I want the workbench proven on hardware that is not the build machine,
So that a hardware failure is an inconvenience rather than the end of the round.

**Acceptance Criteria:**

**Given** the teammate's laptop — a second machine in the same 4 GB GPU class, confirmed
available 28 August 2026
**When** a clean clone is started there with the documented command
**Then** it reaches the first demo beat
**And** any difference in behaviour from the build machine is recorded in the repo

### Story 6.4: The licence claim is safe to make

As MRPL's reviewer,
I want the licence claim backed by an audit rather than an assertion,
So that the strongest argument in the pitch survives being checked.

**Acceptance Criteria:**

**Given** `THIRD_PARTY_NOTICES.md` from the pinned harness and our own dependency tree
**When** the audit is run
**Then** every transitive licence is enumerated
**And** anything outside the allow-list is flagged with a decision recorded against it

**Given** the rows added to `docs/licence-policy.md` on 28 August 2026
**When** this story is done
**Then** each has been re-verified by reading the `LICENSE` file at the version actually pinned,
closing the gap that file currently records against itself

### Story 6.5: A recorded offline run exists

As the team facing an unannounced round format,
I want a recording of the demo,
So that a video submission, a projector failure and a live demo are all covered.

**Acceptance Criteria:**

**Given** a working build
**When** the demo is recorded
**Then** the recording shows the three beats in order — canary, routing chip changing model,
`.docx` produced
**And** it runs under three minutes with the hook landing inside thirty seconds (NFR9)
**And** the `remote` provider was not active at any point during the recording (ADR-0001)

---

## Epic 7: The identity pass — P1

The remainder of the rebrand, and onboarding that fits an air-gapped product.

### Story 7.1: Local and replay provider onboarding replaces the API-key modal

As someone opening Blind Flange for the first time,
I want to be asked about local providers,
So that the first screen of an air-gapped product does not ask for a cloud API key.

**Acceptance Criteria:**

**Given** a fresh profile
**When** the workbench is opened for the first time
**Then** the DeepSeek API-key modal does not appear
**And** any onboarding shown offers our own local and replay providers

**Given** the Internal Testing Notice
**When** the profile ships
**Then** it is already dismissed by the `ui-onboarding.welcomeNoticeVersion` key in the
profile's `settings.yaml`

### Story 7.2: The remainder of the identity pass

As a judge forming an impression in the first five seconds,
I want the whole surface to read as one product that is ours,
So that nothing reads as a shell someone else built.

**Acceptance Criteria:**

**Given** every shipped surface
**When** it is reviewed
**Then** the wordmark, hero text, package scope, config paths and shipped copy are ours
**And** no residual DeepSeek Harness branding appears outside the retained MIT copyright notice
**And** the terminology matches `CONTEXT.md` throughout
