# Sprint Change Proposal — 28 August 2026

**Project:** Blind Flange (SIH26117) · **Raised by:** Rpxi1 · **Scope classification:** Moderate
(backlog reorganisation, no replan)

---

## 1. Issue summary

The project owner, reviewing the running workbench for the first time, reported the surface
"drifting a little bit every single time" from the SIH26117 problem statement, and re-supplied
that statement.

The instinct was correct and resolves to one concrete defect plus one sequencing problem.

**The defect.** Story 1.4 shipped a **task-type picker** into the hero at
`conversation.hero.agentPreset` — a dropdown from which the operator chooses document, drawing,
calculation or code. The problem statement says the opposite, twice:

> ...support multiple open weight models at once and **automatically pick the right one** for a
> given task based on what that task needs, a coding request handled differently from a document
> summary request.

> A working local deployment... that shows **model auto selection** across at least two different
> task types.

A control that asks the operator to classify the task is the human doing the router's job. An
evaluator who sees it concludes the routing is manual, which deletes the differentiator the whole
entry rests on.

**How it happened.** Story 1.4's acceptance criterion reads *"Given the agent preset picker, When
it is opened, Then the presets are the four task types... and 'Standard mode' and the other
shipped presets are gone."* That is a **sealing** criterion — it is satisfied by the roster
containing ours and not DeepSeek's. The implementation read it as a mandate to build a prominent
chooser. The plan was not wrong; the implementation over-read it.

**Evidence.** Confirmed in the running application at `http://127.0.0.1:3080` and in
`plugins/dsh-client-ui-base/lib/client.js`, where `buildAgentPresetPicker` renders a `Menu` whose
`onSelect` writes the deployment default through `settings.update`.

**The collision, which is worse than the redundancy.** Story 3.7 places the routing chip at
`conversation.input.model` — a **different slot**. The two would not have replaced one another;
they would have shipped side by side, one manual control and one automatic indicator, making
contradictory claims about the same decision on the same screen. Story 3.8 ("the model changes by
itself when the task type changes") would have been demonstrated on a screen that also contains a
dropdown for changing it by hand.

**The sequencing problem.** 10 of 33 stories are done with three days to the 31 August deadline.
Five of those ten are Epic 1, two of which (1.4, 1.5) are branding. The two epics carrying three
of the problem statement's five Expected Solution demonstrables — Epic 3 (auto-selection, 8
stories) and Epic 5 (agentic run to a Word deliverable, 4 stories) — have not started.

---

## 2. Impact analysis

### Coverage against the Expected Solution

The problem statement names exactly five demonstrables. Mapped against the backlog:

| Expected Solution item | Epic | State |
|---|---|---|
| Model auto-selection across ≥2 task types | Epic 3 | **0 of 8** |
| Agentic task end to end → Word file | Epic 5 | **0 of 4** |
| Coding task run and verified in a sandbox | Story 5.3 | **not started** |
| Multimodal / scanned-document understanding | Epic 4 | 4 of 5 ✅ |
| Logs or monitor proving no external calls | Epic 2 | 1 of 4 |

**Remaining work carrying a demonstrable: 16 stories.** Remaining work carrying none: 7
(Epic 6's five, Epic 7's two).

### Epic impact

- **Epic 1 — complete, one story reopens.** 1.4's implementation is corrected, not rebuilt. Its
  sealing criteria still hold and its screenshots remain valid for the mark. 1.5 reopens for an
  unrelated defect (below).
- **Epic 3 — unchanged in content, promoted in order.** Gains a clarifying note that the hero
  component is now its downstream display surface.
- **Epic 6 — trimmed to 6.1, 6.4, 6.5.** 6.2 and 6.3 deferred.
- **Epic 7 — deferred, with one acceptance criterion rescued into 6.1.**

### Artifact conflicts

- **PRD:** none. This project deliberately has no PRD;
  `_bmad-output/planning-artifacts/product-brief.md` stands in, and its P0 set is unaffected —
  every change here is to sequencing and to one implementation, not to scope.
- **Epics:** `epics.md` requires edits to Story 1.4, Epic 3's preamble, Epic 6, Epic 7, and the
  addition of a build-order note.
- **Architecture:** none. `docs/adr/` is untouched; no ADR asserted a manual task-type control.
- **UI/UX:** the hero slot `conversation.hero.agentPreset` changes from an interactive `Menu` to
  a read-only indicator. `conversation.input.model` is unaffected and still belongs to 3.7.
- **Tracker:** `sprint-status.yaml` gains a `deferred` state for the cut stories.

### Technical impact

Confined to `plugins/dsh-client-ui-base/lib/client.js` and its tests. `buildAgentPresetPicker`
already reads the preset roster over the host's own RPCs — the machinery Story 3.8 needs to
*write* the active preset when the router reclassifies. Removing the `Menu` and the
`settings.update` write leaves that read path intact, so the correction **advances** Epic 3 rather
than discarding work.

---

## 3. Recommended approach

**Option 1 — Direct adjustment. Selected.**

- Effort: **Low.** One component loses its interaction; two stories are deferred; one acceptance
  criterion moves between stories.
- Risk: **Low.** No completed acceptance criterion is invalidated. Story 1.4's sealing criteria
  and Story 1.5's mark are untouched.

**Option 2 — Rollback of Story 1.4. Rejected.** Reverting would restore the host's own agent
preset chip, which lists "Standard mode" and the three other shipped presets — breaking 1.4's
sealing criterion and putting DeepSeek's vocabulary back in the hero. The picker's read path is
also the substrate Story 3.8 needs. Rollback costs more and returns less.

**Option 3 — MVP review. Rejected as unnecessary.** The P0 set is achievable. What was wrong is
the order in which it is being built, and one implementation. Reducing scope now would cut
capability to protect polish, which is backwards.

---

## 4. Detailed change proposals

### 4.1 — Story 1.4: the hero shows the task type, it does not choose it

**Section:** Acceptance Criteria, second block.

**OLD**
```
**Given** the agent preset picker
**When** it is opened
**Then** the presets are the four task types — document, drawing, calculation, code
**And** "Standard mode" and the other shipped presets are gone
```

**NEW**
```
**Given** the agent preset roster
**When** it is read
**Then** the presets are the four task types — document, drawing, calculation, code
**And** "Standard mode" and the other shipped presets are gone

**Given** the hero seat `conversation.hero.agentPreset`
**When** it renders
**Then** it *displays* the active task type and offers no way to change it
**And** it is not a dropdown, a menu, or any other control the operator can operate

**Given** the problem statement's requirement that the system pick the model automatically
**When** any surface is reviewed for a task-type or model control
**Then** no such control exists anywhere in the application
```

**Rationale.** The original wording was a sealing criterion and was read as a mandate to build a
chooser. The new wording seals the roster, states plainly that the hero seat is an indicator, and
adds a standing check that no manual control reappears in a later story.

### 4.2 — Epic 3 preamble: name the hero seat as the downstream surface

**Append to the Epic 3 preamble:**

```
Two surfaces show the router's work and neither is a control. `conversation.input.model` carries
the routing chip — the fleet member that answered, and the scores behind it (Story 3.7).
`conversation.hero.agentPreset` carries the classified task type, seated there by Story 1.4 and
corrected on 28 Aug 2026 from a chooser to an indicator. Story 3.8 is what makes both move on
their own. **Nothing in this epic may add a control that lets the operator pick a task type or a
model** — that is the claim the entry is judged on.
```

### 4.3 — Epic 6: trimmed to three stories

**6.1** gains the rescued acceptance criterion from 7.1:

```
**Given** a fresh profile on a machine that has never run this
**When** the workbench is opened for the first time
**Then** no DeepSeek API-key modal appears
**And** the Internal Testing Notice is already dismissed by the
`ui-onboarding.welcomeNoticeVersion` key in the profile's `settings.yaml`
```

**6.2 — deferred.** A static scan for external URLs in the built bundle. Real evidence, but Epic
2's runtime egress monitor and audit log are the demonstrable the problem statement actually asks
for ("through logs or a visible network monitor"), and they are stronger: a measured zero beats a
grep. Revisit if Epic 5 lands early.

**6.3 — deferred.** The problem statement asks for a deployment "demonstrable on a single
workstation or server". A second machine is not required, and the setup risk on borrowed hardware
inside three days outweighs the evidence gained. 6.1's cold-start criterion carries most of the
value.

### 4.4 — Epic 7: deferred entire, one criterion rescued

7.1's API-key-modal criterion moves to 6.1 (above) — it is load-bearing for the air-gap claim on a
fresh install, not polish, and deferring it silently would have been a mistake.

7.2, the remainder of the identity pass, is deferred. It produces none of the five Expected
Solution demonstrables. Epic 1 already delivered the mark, the tab title, the favicon and the
persona; what 7.2 adds is completeness of rebrand, which no evaluation criterion rewards inside
this budget.

**Neither story is deleted.** Both remain in `epics.md` marked deferred with the reason, and
`sprint-status.yaml` records them as `deferred` rather than `backlog`, so the cut is visible
rather than lost.

### 4.5 — Build order

**Append to `epics.md` after the Standing acceptance criteria:**

```
## Build order — set 28 August 2026

Epics are not built in numerical order. The remaining sequence is:

**3 → 2 → 5 → 4.5 → 6**

Epic 3 first because it is eight stories and carries the demonstrable the problem statement names
twice; a large epic started late cannot be recovered. Epic 2's remaining three are small and
carry the sovereignty proof. Epic 5 carries the agentic run and the Word deliverable. 4.5 is the
crop viewer, the last of Epic 4. Epic 6 is delivery and closes the open licence question.

Epic 7 is deferred. Epic 6 is trimmed to 6.1, 6.4 and 6.5.
```

### 4.6 — Defect, Story 1.5 (not a plan change)

The tab title is overwritten after React hydrates.
`@deepseek-ai/dsh-client-ui-renderer` renders `DocumentTitle` beside `renderSlot("root")` with a
hard-coded `const productTitle = "DeepSeek Harness"` and sets `document.title` in a `useEffect`.
The static `tapIndex` swap wins the first paint and loses to hydration.

There is no row to disable and no config key. The fix is a `MutationObserver` on the `<title>`
node from our own client plugin — out-of-tree, no harness source edited (NFR5). Story 1.5 reopens
for this; it is a defect, not a story.

---

## 5. Implementation handoff

**Scope: Moderate.** Backlog reorganisation plus one small implementation correction. No PM or
Architect involvement required; no ADR is affected.

| Deliverable | Owner | Status |
|---|---|---|
| `epics.md` edits 4.1–4.5 | this session | to apply |
| `sprint-status.yaml` deferred states | this session | to apply |
| Hero component: chooser → indicator | this session | to apply |
| Tab-title `MutationObserver` (defect 4.6) | this session | to apply |
| Story 3.1 onward | next build chat | queued |

**Success criteria**

1. No task-type or model control exists anywhere in the running application.
2. The hero seat still displays the active task type and still excludes DeepSeek's shipped
   presets.
3. The tab reads "Blind Flange" after hydration, not only at first paint.
4. `sprint-status.yaml` shows 7.1, 7.2, 6.2 and 6.3 as `deferred`, each with its reason recorded
   in `epics.md`.
5. The next story built is 3.1.
