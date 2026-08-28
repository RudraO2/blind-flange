---
title: 'Router scores the fleet and picks a member'
type: 'feature'
created: '2026-08-28'
status: 'done'
review_loop_iteration: 0
route: 'one-shot'
context: []
---

# Router scores the fleet and picks a member

## Intent

**Problem:** Story 3.5 gives the router a task type but nothing to route on — no per-member score, so "why that model?" would still be a rule an evaluator has to trust rather than data they can inspect.

**Approach:** A pure scorer (`lib/router/score.js`) takes the classified task type and the licence-checked fleet, gives every eligible member an integer score from a per-task capability-weight table, records a machine-readable reason for every member excluded before scoring (currently the modality gate), and selects the highest scorer with fleet-declaration order as the deterministic tie-break. The `agent/pre-step` listener from Story 3.5 is extended to score `loadFleet().loaded` after classifying and append the whole decision to the session log as the plugin-owned `router/routed` event. No UI — the routing chip is Story 3.7.

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/lib/router/score.js`](../../plugins/dsh-client-ui-base/lib/router/score.js) — the scorer: task profiles, the modality exclusion gate, capability-weight scoring, deterministic tie-break, `allZero`/`selected: null` edge behaviour, structured `RoutingDecision` shape.
2. [`plugins/dsh-client-ui-base/lib/index.js`](../../plugins/dsh-client-ui-base/lib/index.js) — `classifyAndRoute`: scores `loadFleet().loaded` after classification, appends `router/routed`, swallows a scoring failure without dropping the classification event that already landed.
3. [`plugins/dsh-client-ui-base/test/score.test.js`](../../plugins/dsh-client-ui-base/test/score.test.js) and [`test/index.test.js`](../../plugins/dsh-client-ui-base/test/index.test.js) — every eligible member scored, exclusion reasons machine-readable, selection + tie-break determinism, and the pre-step integration recording both events.
