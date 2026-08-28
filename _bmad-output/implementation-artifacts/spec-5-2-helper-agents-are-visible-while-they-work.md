---
title: 'Helper agents are visible while they work'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# Helper agents are visible while they work

## Intent

**Problem:** The workbench had no way for a real agent to spawn a helper and have that shown — `tool-jobs`, `tool-subagent` and `tool-subagent-control` all shipped `disabled: true` (the harness's own patching, not Epic 1's sealing), so the already-mounted `ui-jobs` and `ui-subagent` panels had nothing real to render.

**Approach:** Enabled the three disabled tool rows in both profiles' `cordis.patch.yml` and authored a two-turn replay entry (parent delegates through the real `subagent` tool in continuable/background mode; the spawned child answers through a second entry matched on its own prompt) — no new component, per the epic's explicit instruction that the shipped panels already satisfy the acceptance criteria once driven by a real tool.

## Suggested Review Order

**The tool rows that make the shipped panels real**

- Three disabled rows flipped to `disabled: false` — the whole gap the epic's own survey identified.
  [`profile-install.md:630`](../../docs/profile-install.md#L630)

- The same three rows mirrored into the headless profile, so a browser isn't required to exercise real dispatch.
  [`profile-install.md:723`](../../docs/profile-install.md#L723)

**The scripted delegation (parent → real subagent tool → child)**

- The parent's authored turn: a real `tool-call` to `subagent` with an authored `prompt`, `run_in_background` deliberately omitted so continuable mode's own default backgrounds it.
  [`replay-cache.json:66`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-cache.json#L66)

- The child's own entry, matched on the exact `prompt` text the parent's tool call sends it — not a paraphrase, so the two can't silently drift apart.
  [`replay-cache.json:95`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-cache.json#L95)

- Why the child's initial message matches at all: `isGenuineHumanMessage` accepts `source.kind: "user"`, which is exactly what `dsh-subagent-in-process-driver` stamps on a spawned child's first message.
  [`replay-provider.js:60`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-provider.js#L60)

**Verified against the real harness, not just the model plane**

- Documents the `dsh --profile headless` run that produced a real second session with `origin: "subagent"`, and the web UI's `ui-subagent` breadcrumb picking it up unmodified.
  [`profile-install.md:615`](../../docs/profile-install.md#L615)

- The pre-existing, unrelated session-history defect (`router/classified` unknown to the harness) surfaced during that verification, recorded as out of scope for this story.
  [`profile-install.md:679`](../../docs/profile-install.md#L679)

**Tests**

- End-to-end proof at the model-plane level: the real `subagent` tool call fires with the right arguments, and the turn closes on "running in the background" once the (harness-shaped) tool result lands.
  [`model-plane.test.js:304`](../../plugins/dsh-client-ui-base/test/model-plane.test.js#L304)

- The child entry resolves on the exact prompt text, not the `match: null` fallback.
  [`model-plane.test.js:329`](../../plugins/dsh-client-ui-base/test/model-plane.test.js#L329)
