---
title: 'A stored session still opens'
type: 'fix'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# A stored session still opens

## Intent

**Problem:** Story 3.9 asks that a session log carrying our three plugin-owned event types
(`egress/denied`, `router/classified`, `router/routed`) still reopens in the web client. The
harness's persistence read path (`@deepseek-ai/dsh-session-persistence`) refuses any stored
event type outside `@deepseek-ai/dsh-session`'s exported `KNOWN_SESSION_EVENT_TYPES` Set unless
the event is marked `ignorable`, and `Session.append` gives no way to set that flag — so a
reopened session containing any of the three throws `SessionFormatUnsupportedError` and the
composer never becomes usable.

**Approach:** Path 1 from the story's own guidance, and it held. `session-events/known-types.js`
adds a `registerKnownSessionEventTypes()` function that reaches the profile's installed copy of
`@deepseek-ai/dsh-session` — via `createRequire` anchored at
`~/.dsh/profiles/node_modules/@deepseek-ai/dsh-session/package.json`, because a bare
`import "@deepseek-ai/dsh-session"` from this symlink-mounted plugin resolves from this repo's
own on-disk path and fails with `ERR_MODULE_NOT_FOUND` (the same wall `model-plane/llm-adapter.js`
hit for `@deepseek-ai/dsh-llm`) — and adds the three type names to its mutable
`KNOWN_SESSION_EVENT_TYPES` Set. Verified directly (a real-harness test in both
`test/known-types.test.js` and `test/index.test.js`) that `require(esm)` and the persistence
package's own native `import` of the same file share one Set instance, so the mutation is visible
where the guard actually runs. `index.js`'s `apply()` calls it first, unconditionally, before the
egress waterfall — coupling to a harness internal rather than a published contract (NFR6), so it
never throws into the caller: a failure to reach or reach into the package is reported by name to
`console.error` and left there, per the story's "fails loudly" acceptance criterion. The three doc
comments in `index.js` that claimed the caveat "does not bite Phase 0" are corrected to point at
this fix instead.

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/lib/session-events/known-types.js`](../../plugins/dsh-client-ui-base/lib/session-events/known-types.js) — the fix itself: why the harness internal has to be reached this way, and the loud-failure contract.
2. [`plugins/dsh-client-ui-base/lib/index.js`](../../plugins/dsh-client-ui-base/lib/index.js) — the `apply()` call site (first, unconditional) and the corrected doc comments on `EGRESS_DENIED_EVENT`, `CLASSIFIED_EVENT` and `ROUTED_EVENT`.
3. [`plugins/dsh-client-ui-base/test/known-types.test.js`](../../plugins/dsh-client-ui-base/test/known-types.test.js) — unit coverage (resolver failure, malformed export, success, idempotency) plus a real-installed-harness test proving the mutation lands where `dsh-session-persistence` actually reads it.
4. [`plugins/dsh-client-ui-base/test/index.test.js`](../../plugins/dsh-client-ui-base/test/index.test.js) — the new `apply()`-level real-harness test confirming mount-time registration end to end.
