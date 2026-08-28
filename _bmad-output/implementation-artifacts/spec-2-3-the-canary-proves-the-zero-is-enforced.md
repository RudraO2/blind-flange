---
title: 'The canary proves the zero is enforced'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The canary proves the zero is enforced

## Intent

**Problem:** Story 2.2 gave the egress monitor a counted zero, and a zero counted from nothing
is still an absence. An evaluator who does not trust a quiet panel needs to press something and
watch the block happen: a deliberate outbound attempt that is real rather than staged, refused
by the same waterfall that refuses anything else, recorded in the same shape, with the monitor
turning red and its counter moving.

**Approach:** Host half (`lib/egress/canary.js`, wired in `lib/index.js`): a genuine tool,
`bf_canary`, whose body calls `fetch` against `https://example.com/blind-flange-canary` with
nothing between it and the socket. Its name joins `web_search` and `web_fetch` in
`NETWORK_TOOL_NAMES`, so the Story 2.1 `tools/pre-execute` waterfall refuses it before the body
runs and appends the same `egress/denied` event Story 2.2 folds. Beside it, a loopback-only RPC
channel `/bf-canary` with one endpoint, `fire`: it resolves the session's live agent through
`ctx.agents.get` and dispatches the tool through `ctx.tools.execute` — the ordinary pipeline,
so the denial is the ordinary denial. Nothing on that path appends an event or moves a panel
itself; the number the monitor shows still comes only from the session log (NFR8). Client half
(`lib/client.js`): a `Pill` in `conversation.input.right`, behind a nested
`ctx.inject(["connection"])` so a client with no host transport loses the button and keeps the
other seven seats. Both-theme screenshots at `docs/screenshots/2-3-canary-{light,dark}.png`.

**Decided here, because the plan did not record it:**

- **The canary is a registered tool, and is therefore model-visible.** Verified by logging the
  assembled `GenerateOptions.tools` for a real turn: `ask_user_question, bf_canary, create_goal,
  …`. This is in tension with Story 1.2's "no other tool in the list is capable of an outbound
  network call". It was taken deliberately: `ToolRuntime.register` has no hidden-tool flag, and
  the two alternatives each disarm the canary — an unregistered name still runs the waterfall
  but has nothing real behind it, and `tools.restrict({ deny: [...] })` removes the name from a
  scope's dispatch as well as its view. The exposure is bounded (the waterfall denies the name
  for any caller, model included; under `replay` the model emits no tool calls at all).
  Whether Story 1.2's wording should name the canary as its one deliberate exception is a plan
  decision and is flagged, not decided. Written up in `docs/profile-install.md`.
- **`describeTarget` was reading the wrong shape.** Story 2.1 wrote it against a raw JSON
  argument string, but the harness materialises arguments as parsed frozen JSON before policy
  runs, so every recorded denial target would have been `[object Object]` in production. Fixed
  to read the parsed object first and keep the string branch as a fallback. This is what makes
  the canary's audit line read `bf_canary → https://example.com/blind-flange-canary`.
- **The target is `config.canary.target`,** defaulting to the IANA documentation domain, so
  pointing the canary elsewhere is a `cordis.patch.yml` edit rather than a code change.

**Review:** one subagent (`bmad-build` one-shot's own layer). No findings.

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/lib/egress/canary.js`](../../plugins/dsh-client-ui-base/lib/egress/canary.js) — the real `fetch` body and the RPC handler. The header says why this is a tool rather than a private code path, and why the handler refuses a fire with no live agent instead of dispatching agentless.
2. [`plugins/dsh-client-ui-base/lib/index.js`](../../plugins/dsh-client-ui-base/lib/index.js) — `bf_canary` joins `NETWORK_TOOL_NAMES`; the tool and the `/bf-canary` channel register behind `ctx.inject(["tools"])` and `ctx.inject(["connection","agents","tools"])` so a profile missing either still boots sealed; `describeTarget` rewritten for parsed arguments.
3. [`plugins/dsh-client-ui-base/lib/client.js`](../../plugins/dsh-client-ui-base/lib/client.js) — `buildCanaryButton`, the `conversation.input.right` seat, and the note on why `Button`'s `toolbar` variant was replaced by `Pill`.
4. [`plugins/dsh-client-ui-base/test/canary.test.js`](../../plugins/dsh-client-ui-base/test/canary.test.js) — the tool body actually calls `fetch`; the signal is forwarded; the handler dispatches through `tools.execute` carrying the agent; unknown endpoint, no session and no live agent are all refused rather than dispatched.
5. [`plugins/dsh-client-ui-base/test/index.test.js`](../../plugins/dsh-client-ui-base/test/index.test.js) — the integration half: same waterfall, same recorded shape, the body never runs while the seal holds, each press increments, and the parsed-argument cases `describeTarget` now handles.
6. [`plugins/dsh-client-ui-base/test/client.test.js`](../../plugins/dsh-client-ui-base/test/client.test.js) — the seat, the RPC post, the four phases, the no-transport case, and the assertion that the canary hand-rolls no colour.
7. [`docs/screenshots/2-3-canary-light.png`](../../docs/screenshots/2-3-canary-light.png) / [`-dark.png`](../../docs/screenshots/2-3-canary-dark.png) — the Canary chip with its red dot and a red "Egress 2", both themes.
8. [`docs/profile-install.md`](../../docs/profile-install.md) — new Story 2.3 section: no profile change, the verification steps, and the Story 1.2 tension recorded in full.
