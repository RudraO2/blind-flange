---
title: 'The egress monitor shows a counted zero'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The egress monitor shows a counted zero

## Intent

**Problem:** Story 2.1 denies outbound tool calls and left the audit trail to the harness's
own `tool/call` record. An evaluator still needs an always-on panel showing a *measured*
zero — one derived by counting denials, not printed — with the compact chip in the session
header and the full panel in the shell overlay, and the 27 August spike's hand-rolled monitor
(hand-written greens, a hand-rolled pill) rewritten against the shipped primitives.

**Approach:** Host half (`lib/index.js`): the Story 2.1 `tools/pre-execute` waterfall now
also appends a distinct `egress/denied` session event (`{ tool, target }`) when it refuses a
call — `tool/call` is written for every call, allowed or denied, so it cannot be counted as a
denial. Client half (`lib/client.js`): a registered `bf-egress` conversation view folds every
`egress/denied` event and reports `count` as `nodes.length` — the on-screen zero is the fold's
node count, never a literal (FR15). The compact chip takes
`conversation.session.header.utilities` (list, additive beside Story 3.2's provider pill) and
reads its session's view; the full panel takes `shell.overlay` (list, root), reads
`ctx.sessions.list.current`, and renders only when the chip's module-scoped open store is
toggled on. `StateDot` carries the green→red state through `--dsw-*` tokens (`done` at zero,
`error` once denied — Story 2.3's red); `Pill` and `Button` are shipped primitives; the panel
surface uses only `ui-theme` background/border/shadow tokens. Both-theme screenshots at
`docs/screenshots/2-2-egress-monitor-{light,dark}.png`.

**Accepted review finding:** the panel's `borderRadius: "12px"` is a px literal. `ui-theme`
exposes no radius or spacing token — every shipped primitive (`Pill`, `HoverCard`, `Toast`)
hard-codes `border-radius: 12px` — so matching that value is consistency with the harness, not
a hand-rolled look. Recorded in a code comment; a radius token is an ADR-level `ui-theme`
change, not a point-of-use one.

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/lib/index.js`](../../plugins/dsh-client-ui-base/lib/index.js) — the `tools/pre-execute` handler now appends `egress/denied` (`{ tool, target }`) before returning the denial; wrapped in try/catch so an unreachable session log never blocks the seal. `EGRESS_DENIED_EVENT` carries the same persistence read-path caveat as the router events.
2. [`plugins/dsh-client-ui-base/lib/client.js`](../../plugins/dsh-client-ui-base/lib/client.js) — `createEgressViewBuilder` (count = folded node count, keyed dedup for replay), `egressNodeDefinition`, `createOpenStore`, `buildEgressChip` (`conversation.session.header.utilities`), `buildEgressPanel` (`shell.overlay`, reads `sessions.list.current`). Registration + disposer in `apply`.
3. [`plugins/dsh-client-ui-base/test/index.test.js`](../../plugins/dsh-client-ui-base/test/index.test.js) — `egress/denied` recorded on deny, not on an allowed tool; still denies fast with no session; an append failure does not stop the denial.
4. [`plugins/dsh-client-ui-base/test/client.test.js`](../../plugins/dsh-client-ui-base/test/client.test.js) — the `bf-egress` view builder counts nodes (empty/replace/apply, idempotent replay); chip reads a counted zero + green dot, red + count once denied; panel hidden until the chip opens it, then shows the counted state and theme-token-only surface.
5. [`docs/screenshots/2-2-egress-monitor-light.png`](../../docs/screenshots/2-2-egress-monitor-light.png) / [`-dark.png`](../../docs/screenshots/2-2-egress-monitor-dark.png) — chip "Egress 0" and the open panel, both themes.
6. [`docs/profile-install.md`](../../docs/profile-install.md) — new Story 2.2 section: no profile change (rides `bf-base`), and `--dump-config` must still show zero `bf-egress-monitor` rows.
