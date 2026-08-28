---
title: 'The routing chip shows the decision and the working'
type: 'feature'
created: '2026-08-28'
status: 'done'
review_loop_iteration: 0
route: 'one-shot'
context: []
---

# The routing chip shows the decision and the working

## Intent

**Problem:** Stories 3.5–3.6 give the router a classified task type and a score per fleet member and record the whole decision as a `router/routed` session event, but nothing surfaces it — an evaluator who has seen a model dropdown before has no way to see that Blind Flange picks by inspectable score rather than by a menu.

**Approach:** The client half of `@blind-flange/dsh-client-ui-base` occupies the `single` slot `conversation.input.model` (the stock `@deepseek-ai/dsh-client-ui-model-selection` picker is disabled in the profile, so the routing chip replaces it rather than sitting beside it). The chip names the fleet member the router picked for the last turn and expands, via the `Menu` primitive, to the working: the classified task type, the score per fleet member with the capability breakdown behind it, and the members filtered out before scoring with the reason each was. The decision is not recomputed in the client — a registered `conversationViews` target (`bf-routing`) folded from the router's own `router/routed` events feeds the chip, so it shows what the router actually recorded (NFR8).

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/lib/client.js`](../../plugins/dsh-client-ui-base/lib/client.js) — the routing view Definition + builder (`bf-routing`), `buildRoutingMenuItems` (task type, per-member scores, exclusions with reasons — all `Menu` primitive chrome, only flex/gap and `--dsw-*` colour tokens inline), `buildRoutingChip` (the `useSyncExternalStore` read of the session's `bf-routing` view; the quiet pre-turn indicator vs. the interactive expanded chip), and the `apply` registration into `conversation.input.model` plus the two conversation registries.
2. [`docs/profile-install.md`](../../docs/profile-install.md) — the Story 3.7 section: the `ui-model-selection` disable row that makes the chip the sole occupant, and how the chip is verified in the running app.
3. [`plugins/dsh-client-ui-base/test/client.test.js`](../../plugins/dsh-client-ui-base/test/client.test.js) — the seat/registry registrations, the highest-seq view-builder fold, and the chip's two render states (named member + expanded working; "Auto-routing" before a decision).
