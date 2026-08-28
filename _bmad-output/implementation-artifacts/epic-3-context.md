# Epic 3 Context: Model choice you can audit

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

The operator never picks a model. The system classifies the task, scores every fleet member,
picks one, and shows its working — the scores, the task type, and who was filtered out and why.
Every fleet member carries a permissive licence and the loader refuses anything else. The active
provider is on screen at all times, and replay is labelled replay. Two surfaces carry this:
`conversation.input.model` (the routing chip — member and scores) and
`conversation.hero.agentPreset` (the classified task type, new-session only). Neither is a
control the operator can touch — that is the claim the entry is judged on.

## Stories

- Story 3.1: A replay provider answers a turn through the model plane
- Story 3.2: The active provider is always visible and replay says replay
- Story 3.3: The fleet is declared in one registry file
- Story 3.4: The loader refuses a fleet member with a disallowed licence
- Story 3.5: The router classifies a request into a task type
- Story 3.6: The router scores the fleet and picks a member
- Story 3.7: The routing chip shows the decision and the working
- Story 3.8: The model changes by itself when the task type changes
- Story 3.9: A stored session still opens
- Story 3.10: The first turn classifies on what was actually asked

## Requirements & Constraints

- FR1–FR8: classify task type, score the fleet, route without operator input, show the decision
  and its working, refuse a disallowed licence, always show the live provider, label replay as
  replay.
- No story in this epic may add a control that lets the operator pick a task type or a model —
  the system classifies and selects; that is what is being judged.
- Session data persisted by our plugin (routing decisions, egress denials) must survive a reload
  and still drive the same panels — dropping or re-deriving the data is not an acceptable fix
  path for a persistence defect.

## Technical Decisions

- Three `ModelProvider`s behind one contract: `replay` (cached captures, what the demo runs),
  `local` (llama.cpp, genuinely offline), `remote` (dev only, never demoed). Provider chosen by
  configuration, never by a code path.
- Router appends a `router/routed` session event on step 1 of every turn; the `bf-routing`
  conversation view keeps the highest-`anchorSeq` node so a later turn's decision supersedes an
  earlier one without regressing on out-of-order delivery.
- Routing chip at `conversation.input.model` reads the view via `useSyncExternalStore` — new
  turns re-render it with no chip-side change needed once the view updates.
- The hero task-type seat (`conversation.hero.agentPreset`) is new-session-only; by the time a
  turn reclassifies mid-session, the hero is gone and the chip is the surface that moves.
- Plugin-owned session event types (`egress/denied`, `router/classified`, `router/routed`) are
  not in the harness's own vocabulary by default — this is the defect Story 3.9 fixes.

## Cross-Story Dependencies

- Story 3.9 blocks Epic 2's egress monitor and Epic 3's routing chip from surviving a reload,
  and blocks Story 6.5's recorded run from being reopened.
- Story 3.10 shares its root cause with Story 3.8 (`agent/pre-step` sequencing ahead of
  `user/message`) — fixing turn-one classification also matters to reclassification generally.
