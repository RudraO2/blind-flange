---
title: 'The first turn classifies on what was actually asked'
type: 'bugfix'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
review_loop_iteration: 0
context: []
---

# The first turn classifies on what was actually asked

## Intent

**Problem:** On a freshly created session, the router's classifier read `decision.messages` from the far end of the `agent/pre-step` waterfall instead of the event's own payload, so the first turn's request text was not reliably available — it classified as the `document` fallback instead of the actual task type, and turns two and three could read a stale, previous turn's text instead of their own.

**Approach:** Read `messages` directly from the `agent/pre-step` event's own payload (`Inbox.claim()`'s turn-scoped batch, verified from the harness source at `packages/core/agent-loop/src/agent.ts` and `packages/core/agent/src/inbox.ts`) instead of `decision.messages` returned by `next()`. Also record an explicit `noRequestText` flag on the `router/classified` event so a genuine absence of request text is visible in the session record rather than indistinguishable from an ordinary no-rule-matched fallback.

## Suggested Review Order

**The fix — reading the event's own payload, not the waterfall's resolved decision**

- The actual bug: classification sourced from `decision.messages`, the end of the `next()` chain, not the event payload.
  [`index.js:385`](../../plugins/dsh-client-ui-base/lib/index.js#L385)

- Why the payload's `messages` is the correct source — traced to the harness's own `Inbox.claim()` semantics.
  [`index.js:47`](../../plugins/dsh-client-ui-base/lib/index.js#L47)

- `classifyAndRoute` now takes the turn-scoped batch directly; docblock records the invariant it depends on.
  [`index.js:212`](../../plugins/dsh-client-ui-base/lib/index.js#L212)

**No-request-text visibility (AC3)**

- `noRequestText: text === ""` recorded alongside the classification, distinct from an ordinary fallback.
  [`index.js:231`](../../plugins/dsh-client-ui-base/lib/index.js#L231)

**Regression coverage (AC4)**

- First-turn P&ID prompt classifies as `drawing` even when `next()`'s decision carries no messages — the exact failure mode this story replaces.
  [`index.test.js:515`](../../plugins/dsh-client-ui-base/test/index.test.js#L515)

- Three turns, three task types, each fed a decoy `decision.messages` from another turn — proves no turn reads another turn's text.
  [`index.test.js:534`](../../plugins/dsh-client-ui-base/test/index.test.js#L534)

- Empty request text is recorded as `noRequestText: true`, not folded silently into the fallback.
  [`index.test.js:567`](../../plugins/dsh-client-ui-base/test/index.test.js#L567)

- An ordinary fallback (text present, no rule matched) is not confused with `noRequestText`.
  [`index.test.js:582`](../../plugins/dsh-client-ui-base/test/index.test.js#L582)
