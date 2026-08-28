# Product brief — Blind Flange, Phase 0

**Written** 27 August 2026 · **Author** Mary (analyst) · **Status** ready for epics and stories

This brief covers **only** the prototype for the IIT Madras BS internal hackathon round.
It is not the Grand Finale plan. `blind-flange.html` §17 describes a six-lane, six-person
build running to December; producing a backlog that size here would be a failure, however
good the backlog.

Elicitation was not re-run as a separate skill — the conversation of 27 August covered it,
and at four days a second pass would be waste. The inputs are `docs/bmad-input-brief.md`,
`HANDOFF.md`, `CONTEXT.md`, `docs/licence-policy.md`, ADRs 0001–0004,
`docs/deepseek-harness-notes.md`, and the SIH26117 problem statement text.

## The product

A sovereign, air-gapped agentic AI workbench for confidential industrial knowledge work,
built on open-weight models. SIH26117, filed by Mangalore Refinery and Petrochemicals
Limited. Codename **Blind Flange** — the plate bolted over a line to positively isolate it.

## What we are actually building, and by when

One vertical slice, end to end, ugly where it does not show and real where it does.

- **Four days.** Deadline about 31 August 2026.
- **One person.** The five other team members are not contributing to this round.
- **Model inference is replayed** (ADR-0001), disclosed on screen. Real local inference on
  the 4 GB GTX 1650 is a stretch goal for day 4, attempted only if everything else is done.
- **Four deliverables, because the round format is still unannounced:** a repo link, an app
  that runs from a cold clone, a recorded video, and a live demo. Build so all four are
  satisfied.

## Who is judging, and what actually wins

Students and traditional professors — not refinery engineers, not MRPL procurement. They do
not know P&IDs, Miniratna procurement, or import substitution. They **do** know ChatGPT and
Ollama.

Consequences that should drive every copy decision:

- The hook is not "MRPL needs sovereignty." It is **"you cannot paste a confidential drawing
  into ChatGPT, and here is what that costs you."**
- **The first thirty seconds decide it.** Three minutes is the ceiling; past that is
  confusion, not credit.
- Competing statements have visually obvious outputs. Ours is boring on a slide and
  dramatic in a demo. The drama has to be *shown*, not argued.
- The licence argument (Apache-2.0/MIT only) is devastating with MRPL and boring to a
  professor. Load it for Q&A; do not lead with it.

## Positioning: the answer to "you're just running models locally"

The problem statement asks for eight things. Local model serving is one.

| What MRPL asked for | Ollama + Open WebUI | Blind Flange |
|---|---|---|
| Run open-weight models on-prem | yes | yes |
| Multiple models, auto-picked per task | no — a dropdown | router, scores on screen |
| New models addable without redesign | partial | one registry file drives router, loader, UI, licence check, attestation |
| Agent: plan, tools, sandbox, iterate | no | harness, plugins, visible fan-out |
| Scanned PDFs, handwriting, drawings | no | ingestion lane + provenance crops |
| Real deliverables — Word/Excel/PPT, code, calcs | no — chat bubbles | deliverable factory |
| Grounded in org manuals and SOPs | partial | local KB, cited to page *and region* |
| Proof of zero egress | no | egress monitor + canary + attestation |

**The line: "Ollama runs a model. It doesn't do the work."** And when pressed — *so is
ChatGPT just running a model; running it is the commodity, the product is everything around
it.* Agent = Model + Harness.

### Disclosing the foundation

We build on DeepSeek Harness (MIT). This audience may read that as copying. **Concealment is
what makes it fatal; disclosure makes it ordinary engineering.** Say it first, in our own
words, on a slide — their brand guidelines explicitly bless "built on DeepSeek Harness" —
then name what is ours: the router, the model plane, the egress monitor and canary, the
provenance lane, the deliverable factory. Pair it with the licence argument that is already
the pitch's differentiator. A judge who was told is impressed; a judge who finds out is lost.

## Scope

### P0 — must ship

MRPL's "Expected Solution" paragraph is a checklist. It is the scope.

1. **Model auto-selection across at least two task types**, with the decision visible —
   routing chip expanding to classifier scores and the models that were filtered out.
2. **An agentic task end to end** — scanned inspection report in, key findings out, approval
   note rendered as a real `.docx` with a provenance footer.
3. **A coding task run and verified in a sandbox.**
4. **A multimodal task** — scanned document understanding, with provenance crops showing the
   pixel region a finding was read from. Same artefact as (2); it does double duty.
5. **A visible network monitor proving no external calls**, plus the canary button that
   fires a deliberate outbound attempt and shows it blocked and audited.

Plus, not from the checklist but required by ADR-0001:

6. **The active model provider is always visible.** Replay is labelled as replay. Honesty is
   the feature, not a caveat.

And one the checklist assumes rather than states:

7. **Strip and re-point the harness.** Adopting it via ADR-0004 is not "add panels to a
   stock install." The shipped default profile is a general cloud coding agent, and several
   of its rows directly contradict the product. These are **sovereignty-critical, not
   cosmetic** — a judge who opens the tool list and finds web search has ended the pitch.

   Verified in the default `dsh-base` profile on 27 Aug 2026:

   | Shipped row / package | Why it must go or change |
   |---|---|
   | `web-search-deepseek` | A model-callable **web search tool**. An outbound network capability inside an air-gapped product. Remove. |
   | `llm-deepseek`, `llm-pi-ai` | Cloud model adapters. Remove; the fleet is local only. |
   | `@anthropic-ai`, `@aws-sdk`, `@google`, `@mistralai`, `openai` in the profile tree | Cloud SDKs. Should not be resolvable in a sealed build. |
   | System prompt persona — *"You are a coding agent powered by the {{model}} model"* | Wrong product identity. Ours is an industrial knowledge-work workbench. |
   | "Standard mode" agent presets | Replace with our task types — document, drawing, calculation, code. |
   | Model registry / provider list | Re-point at our `registry/models.yaml` fleet with the `license:` field and the loader that refuses non-permissive weights. |
   | Terminology throughout the UI | Must match `CONTEXT.md`, including the `_Avoid_` lists. |

   Removal is done by `disabled: true` rows and insert removals in the profile's
   `cordis.patch.yml`, not by editing harness source — that keeps ADR-0004's "extend, do not
   fork" intact.

   **This is also a demo beat.** Open the tool list and the model list in front of the panel:
   no network tools, no cloud providers, only local models each carrying a permissive
   licence. That is the sovereignty claim made checkable in ten seconds, and it is the
   strongest available answer to "did you just download someone's app?" — because a stock
   install visibly does not behave like this.

### Probably close to free — verify on day 1 before scoping

The harness already ships working code for several of these. This is the single biggest
lever on the four days, and it should be checked before any of it is planned as build work:

- `dsh-client-ui-subagent` + the `ctx.subagents` seam → the fan-out gauge
- `ctx.sandbox` / `dsh-bash-sandbox` + the tool registry → P0 item 3, the sandboxed coding task
- `dsh-client-ui-deliverables`, `ui-jobs`, `ui-trajectory` → surfaces for P0 item 2

### P1 — after P0 is green

- **Rebranding pass.** Logo, wordmark, hero text, tab title, favicon, package scope, config
  paths, and the copy on every shipped surface. Deliberately after the functionality
  (ADR-0004): a renamed shell with none of our panels in it *is* the reskin we are accused
  of. Note the split — P0 item 7 changes what the product **does**; this changes what it
  **looks like**. Both are required for it to read as ours, and they are separate epics.
- Replace the DeepSeek API-key onboarding modal with local/replay provider onboarding.
- Boot sequence, kiosk launch (`chrome --app=...`), one-click `.bat` launcher.
- Real local inference on the 1650.

### Cut, and said out loud in the pitch

Stating the cut line is part of the pitch, not an admission.

- No fine-tuning. No custom inference engine. No 120B-class model — the statement itself
  permits a smaller model when venue hardware is absent.
- No full P&ID connectivity-graph extraction. Symbol and tag inventory plus region Q&A only.
- No multi-user, RBAC, or concurrency in Phase 0. Multi-user is the *deployment story* we
  tell; single-machine is the *demo* we show, and the statement asks for exactly that.
- No live inference during the demo. Replay, disclosed.
- Everything else in `blind-flange.html` §17 beyond Phase 0.

## The demo

Thirty-second hook, three-minute ceiling. The cable-pull is **dropped** — the user judged it
childish for this audience, and the statement asks for "logs or a visible network monitor",
which the canary satisfies more convincingly.

Opening move: the egress monitor reading zero, then the canary pressed — one deliberate
outbound call, blocked, red row, audit line. Then the routing chip changing model by itself
mid-session. Then the scanned report becoming a signed `.docx`.

## Constraints — not negotiable

1. **Permissive licences only** — Apache-2.0, MIT, BSD-2-Clause and BSD-3-Clause as written here,
   widened to eleven enumerated names by ADR-0006 on 28 August 2026 (see `docs/licence-policy.md`)
   — across weights, dependencies and
   harness (`docs/licence-policy.md`). Verified by reading `LICENSE` at the pinned version.
   Widened from two licences to four on 28 Aug 2026 by ADR-0005, which also rejected Docling
   (its models are CDLA-Permissive-2.0) in favour of the Tesseract stack.
2. **Offline by construction.** No component reaches the network at runtime. A blocked call
   is a hang, and a hang looks like a crash on stage.
3. **Hardware is fixed:** MSI GF63, i5-11260H, 15.7 GB RAM, GTX 1650 Max-Q with 4 GB VRAM.
   No cloud GPU during any demo or recording — renting inverts the central claim.
4. **DeepSeek Harness is the runtime** (ADR-0003), extended via plugins, not forked
   (ADR-0004). Harness orchestrates; Python services do ML behind local HTTP.
5. **Panels before inference** (ADR-0002). Only token generation is replayed — the firewall,
   the canary, the `.docx` generation and the router scoring are real. *A panel that animates
   without a real event behind it is a bug, not a shortcut.*
6. **No external URL may enter the frontend bundle.** Self-host every font, icon and script;
   add a build check that fails on `http` in the bundle.

## Risks

| Risk | Mitigation |
|---|---|
| Cordis learning curve on the harder seams — `LlmAdapter`, tools, subagents. Slot registration was easy; these are unproven. | Attempt the replay `LlmAdapter` first, day 1. If it resists by end of day 1, fall back to our own loop behind the same contract. |
| `@deepseek-ai/dsh` is `0.1.1-rc.2`, a developer preview promising breaking changes | Pin the version. Build against our own plugin contracts. |
| Custom panels look bolted on and undo the "one product" impression | Use `ui-primitives` and theme tokens, not hand-rolled colours. Verify light *and* dark. |
| Judges read the harness dependency as copying | Disclose first, on a slide, in our words. See Positioning. |
| Four days, one person, and everything slips | P0 is the client's own checklist. Cut P1 without hesitation. |
| Node is 22.15.0; `pi-ai` wants ≥22.19.0 | Upgrade Node before relying on that provider path. |
| `THIRD_PARTY_NOTICES.md` unaudited while we claim Apache/MIT-only | Audit before the claim is made to MRPL; do not put the claim on a slide until it is done. |

## Still open — for the PM or architect, not for elicitation

- **Persistence:** SQLite versus Postgres for agent state in a four-day build. The harness
  ships its own session persistence; check whether anything more is needed at all.
- **Which document lane leads the demo:** a scanned inspection report (the §18 choice) or the
  drawing lane, which may be more visually striking.
- Whether the profile-as-dependency migration lands in P0 or P1.

## Next steps

1. Break this into epics and stories. Seven P0 items; "strip and re-point the harness" (P0
   item 7) and the rebranding pass are two separate epics — behaviour first, identity after.
2. Day 1, before anything else: verify what the harness gives free (fan-out, sandbox,
   deliverables surfaces) and attempt the replay `LlmAdapter`. Both are scope levers.
3. Build in a fresh session against the stories, with `docs/deepseek-harness-notes.md` as the
   harness reference.
