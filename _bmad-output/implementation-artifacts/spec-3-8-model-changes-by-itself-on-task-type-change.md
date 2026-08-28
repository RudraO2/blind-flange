---
title: 'The model changes by itself when the task type changes'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The model changes by itself when the task type changes

## Intent

**Problem:** Story 3.8 asks an evaluator to watch, in one session, the router move to a
different fleet member when the next request classifies as a different task type — no control
touched, the routing chip updating to the new member, the new scores in the expanded chip.

**Approach:** Stories 3.5–3.7 already built the mechanism end to end: the host half appends a
fresh `router/routed` session event on step 1 of every turn, the `bf-routing` conversation
view keeps the highest-`anchorSeq` node, and the routing chip at `conversation.input.model`
reads it through `useSyncExternalStore` — so a new turn's decision re-renders the chip with no
functional change needed. This story is the regression cover: cross-turn tests on both halves
(a second turn with a different task type routes to a different member and appends a second
`router/routed` event; the chip follows the view to the new member and new scores), a comment
correction removing an obsolete note that Story 3.8 would drive the hero task-type indicator
(the hero is the new-session screen and is gone by the time a turn reclassifies — the chip is
the surface that moves), and both-theme screenshots of the chip after a task-type change.

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/test/index.test.js`](../../plugins/dsh-client-ui-base/test/index.test.js) — the new host-half test: two turns in one session, `document` → `Qwen2.5-VL-7B-Instruct` then `code` → `Qwen2.5-Coder-7B-Instruct`, two `router/routed` events, different `selected`, no action between.
2. [`plugins/dsh-client-ui-base/test/client.test.js`](../../plugins/dsh-client-ui-base/test/client.test.js) — the two new client-half tests: the `bf-routing` view builder lets a higher-seq turn supersede the earlier decision and an out-of-order lower-seq node cannot regress it; the routing chip tracks the current view snapshot to the new member, the new per-member score, and the new capability working.
3. [`plugins/dsh-client-ui-base/lib/client.js`](../../plugins/dsh-client-ui-base/lib/client.js) — comment-only: file header + `buildTaskTypeIndicator` + `useRoutingDecision` doc blocks now state that the chip is Story 3.8's moving surface and the hero seat is new-session-only (per `@deepseek-ai/dsh-client-ui-agent-preset`'s own `AgentPresetSeat`).
4. [`docs/screenshots/3-8-routing-chip-changed-light.png`](../../docs/screenshots/3-8-routing-chip-changed-light.png) / [`-dark.png`](../../docs/screenshots/3-8-routing-chip-changed-dark.png) — the expanded chip on the coder member after a drawing turn, both themes.
