---
title: 'Router classifies a request into a task type'
type: 'feature'
created: '2026-08-28'
status: 'done'
review_loop_iteration: 0
route: 'one-shot'
context: []
---

# Router classifies a request into a task type

## Intent

**Problem:** The operator should never pick a model, but the router has nothing to route on yet — no notion of what kind of job an incoming request is.

**Approach:** A keyword classifier (`lib/router/classify.js`) resolves each request to exactly one of `document`, `drawing`, `calculation`, `code`, returning structured data (per-type scores, matched rule names, fallback/tie flags) with a deterministic tie-break. An `agent/pre-step` listener in the base plugin classifies the first step of every turn and appends the result to the session log as a `router/classified` event. No scoring of the fleet, no UI — those are Stories 3.6 and 3.7.

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/lib/router/classify.js`](../../plugins/dsh-client-ui-base/lib/router/classify.js) — the classifier: task types, rule sets, tie-break, fallback, structured output shape.
2. [`plugins/dsh-client-ui-base/lib/index.js`](../../plugins/dsh-client-ui-base/lib/index.js) — the `agent/pre-step` wiring: classify once per turn (step 1), append `router/classified`, swallow failures. Note the comment on the persistence read-path limitation of plugin-owned event types.
3. [`plugins/dsh-client-ui-base/test/router.test.js`](../../plugins/dsh-client-ui-base/test/router.test.js) and [`test/index.test.js`](../../plugins/dsh-client-ui-base/test/index.test.js) — coverage of the four task types, structured output, determinism, and the pre-step integration.
