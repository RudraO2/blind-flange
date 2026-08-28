# Sprint Change Proposal — 28 August 2026 (second)

**Project:** Blind Flange (SIH26117) · **Raised by:** Rpxi1 · **Scope classification:** Moderate
(two stories added, build order changed; no replan)

Supersedes nothing. The first proposal of 28 Aug 2026
(`sprint-change-proposal-2026-08-28.md`) stands.

---

## 1. Issue summary

Two defects were found during Story 5.2 and Story 5.4 verification and filed in
`_bmad-output/implementation-artifacts/deferred-work.md`. Both are correctness failures on the
demo's centrepiece, and neither is deferrable.

### Defect A — a stored session cannot be reopened

We append **three** plugin-owned event types to the harness session log:

| Event | Story | File |
|---|---|---|
| `egress/denied` | 2.1, 2.3 | `plugins/dsh-client-ui-base/lib/index.js` |
| `router/classified` | 3.5 | same |
| `router/routed` | 3.6 | same |

The harness's persistence **read** path refuses any log containing a type outside its own
vocabulary:

> `session "…" contains event type "router/classified" (seq 6) unknown to this harness and not
> marked ignorable; refusing to interpret the log`

Story 5.2's verification found the consequence is worse than lost history: **the composer stays
disabled** once history fails to load, so the session cannot be used at all. Every session
created since Story 3.5 landed is dead on reload.

Our own source comments rationalise this as *"does not bite Phase 0, where the demo runs on
`replay` and sessions are created fresh, not resumed from disk."* Story 5.2 disproved that. One
browser refresh during the demo destroys the session, and Story 6.5 records a run that then
cannot be reopened.

**Scope correction:** this was initially read as an Epic 3 problem. It is not. `egress/denied`
carries the identical defect, so Epic 2's sovereignty proof — the counted zero, the canary, and
the audit list — is equally affected.

### Defect B — the first turn of every fresh session misclassifies

`router/classified` is appended from `agent/pre-step`, whose `seq` lands **before** the turn's
`user/message` event. On the first turn of a session the classifier therefore reads empty text
and falls back to the `document` task type with `matchedRuleCount: 0`. Turns two and three
classify correctly.

Evidence, from the Story 3.7 build: a clear P&ID prompt classified as `document` on turn one;
`code` and `drawing` classified correctly on the two turns after it.

The first prompt an evaluator types routes wrong, on the demonstrable the problem statement names
twice. Story 3.8's reclassification depends on the same path.

---

## 2. Impact analysis

### Epic impact

- **Epic 2 — complete, but its artefact is unreadable.** No story is reopened; Defect A is fixed
  once, centrally, and Epic 2 benefits.
- **Epic 3 — complete, gains two stories.** 3.5/3.6 wrote the events; 3.7 reads them; 3.8 depends
  on classification being right. The fix belongs here rather than in a new epic.
- **Epic 5 — unaffected.** 5.4 stays at `review` on its own separate LibreOffice gap.
- **Epic 6 — 6.5 depends on Defect A.** A recorded offline run that cannot be reopened is not a
  deliverable.

### Artifact conflicts

- **Epics:** two stories added; the Build order section updated.
- **Architecture / ADRs:** none. No ADR asserted that plugin-owned event types were persistable.
- **PRD:** none. This project has no PRD; `product-brief.md` stands in and its P0 set is
  unaffected — both defects are correctness inside stories already accepted.
- **Source comments:** three doc comments in `lib/index.js` state the caveat "does not bite
  Phase 0". That is now known false and is corrected as part of Story 3.9.

### Technical impact

Confined to `plugins/dsh-client-ui-base/lib/index.js` and whatever the chosen fix requires of
`client.js`'s readers.

**A registration surface does not exist.** The harness's generated catalogue says so plainly:

> Downstream (out-of-repo) plugin events are outside this list by construction; a registration
> surface for them is deferred until such a consumer exists.

`Session.append(type, data, opts)` accepts only `sourceEventSeqs` and `surfaceOp` — there is no
way for a writer to set the `ignorable` marker the reader honours.

**But the vocabulary itself is reachable and mutable.** Verified 28 Aug 2026 from the web
profile:

```
require('@deepseek-ai/dsh-session').KNOWN_SESSION_EVENT_TYPES
→ Set, 48 types, mutable
```

---

## 3. Recommended approach

**Option 1 — Direct adjustment. Selected.** Two new stories in Epic 3, placed next in the build
order.

- Effort: **Low to medium.** Defect B is a small change to where the classifier reads its text.
  Defect A is either ~10 lines or a store migration, depending on which path holds — the story is
  timeboxed to find out.
- Risk: **Low.** No completed acceptance criterion is invalidated; both stories make already-
  accepted stories actually work.

**Option 2 — Rollback of 3.5/3.6. Rejected.** The routing chip is the headline demonstrable and
the events are how it is fed. Removing them removes Epic 3's reason to exist.

**Option 3 — MVP review. Rejected.** Nothing needs cutting. This is repair, not scope.

### The two paths for Defect A, in order

**Path 1 — add our three types to the harness's vocabulary at mount.** Import
`KNOWN_SESSION_EVENT_TYPES` and add `egress/denied`, `router/classified`, `router/routed` before
any session is read. Small, reversible, and touches no reader.

The cost is honest coupling: this is a harness internal, not a published contract, and NFR6 says
we build against our own contracts. It is not forbidden — NFR5 forbids *editing harness source*,
and adding to a set we import at runtime is not that — but it must fail loudly rather than
silently if a harness upgrade removes the export.

**Path 2 — stop persisting plugin-owned types.** Keep the routing and denial records in a store
we own and have the panels read from there. Clean and upgrade-proof, but it touches every reader
in `client.js` and is a day of work we do not obviously have.

**Try Path 1 first, timeboxed. If it does not hold, take Path 2 and say so.** Path 1 is minutes;
discovering it works costs almost nothing, and it unblocks Epic 2, Epic 3 and Story 6.5 at once.

---

## 4. Detailed change proposals

### 4.1 — New Story 3.9

Placed after 3.8 in `epics.md`. Full text in the epics file; the acceptance criteria require a
stored session to reopen with all three event types present, the composer to remain usable, the
chosen path to be recorded with its reasoning, and the three false "does not bite Phase 0" source
comments corrected.

### 4.2 — New Story 3.10

Placed after 3.9. Acceptance criteria require the first turn of a fresh session to classify on
the actual request text, verified by the P&ID prompt that currently fails, and a regression test
that would fail against today's ordering.

### 4.3 — Build order updated

**OLD**

```
**3 → 2 → 5 → 4.5 → 6**
```

**NEW**

```
**3.9 → 3.10 → 4.5 → 6**
```

with Epics 2, 3 and 5 recorded as otherwise complete, and Story 5.4's LibreOffice close-out
noted as an outstanding item that is not a story.

### 4.4 — `deferred-work.md` annotated

Both entries are marked promoted, naming the story that now owns them, so a later build chat does
not re-defer what has already been escalated.

---

## 5. Implementation handoff

**Scope: Moderate.** Two stories and a build-order change. No PM or Architect involvement; no ADR
affected.

| Deliverable | Owner | Status |
|---|---|---|
| Stories 3.9 and 3.10 in `epics.md` | this session | to apply |
| Build order updated | this session | to apply |
| `sprint-status.yaml` entries | this session | to apply |
| `deferred-work.md` annotations | this session | to apply |
| Building 3.9, then 3.10 | next build chats | queued |

**Success criteria**

1. A session containing all three plugin-owned event types reopens, with its history and a usable
   composer.
2. The first turn of a fresh session classifies on the request text, not the `document` fallback.
3. Whichever path Story 3.9 takes is recorded with its reasoning, and fails loudly rather than
   silently if the harness changes underneath it.
4. The three source comments claiming the defect "does not bite Phase 0" are gone.
