---
title: 'A coding task runs and is verified in the sandbox'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# A coding task runs and is verified in the sandbox

## Intent

**Problem:** The workbench had no way to run a real coding task inside the harness sandbox — `tool-pwsh` shipped `disabled: true`, so the already-mounted terminal-call UI had nothing real to render, and the sandbox's shell was not yet covered by the network seal Story 2.1's canary proved for the other tools.

**Approach:** Enabled `tool-pwsh` in both profiles' `cordis.patch.yml` (no new panel — the shipped terminal card already renders a run, its result, and a failure), then extended the existing `tools/pre-execute` egress-denial waterfall so a `pwsh` call whose command text reaches for the network (`Invoke-WebRequest`, `curl`, a raw socket, etc.) is denied and recorded on the same `egress/denied` event the Egress monitor already counts — without denying `pwsh` calls that don't reach the network, since a coding task needs the tool to run.

## Suggested Review Order

**The network seal, extended to a tool that must also run legitimately**

- The new pattern match and the deny branch it feeds, kept separate from the by-name deny-list because `pwsh` carries both network and non-network commands under one name.
  [`plugins/dsh-client-ui-base/lib/index.js:112`](../../plugins/dsh-client-ui-base/lib/index.js#L112)

- The deny branch itself, on the same waterfall and the same `egress/denied` marker Story 2.2's monitor counts.
  [`plugins/dsh-client-ui-base/lib/index.js:317`](../../plugins/dsh-client-ui-base/lib/index.js#L317)

**Enabling the shipped tool, not building a panel**

- The row flipped in both profiles so a headless run exercises the same real dispatch the web UI renders.
  [`profile-install.md:684`](../../docs/profile-install.md#L684)

**The scripted demonstrations — real dispatch, authored turn text only**

- Three new entries: a real successful command, a real failing command, and a real denied network attempt. The harness dispatches `pwsh` for real in all three; only the model's own text is authored.
  [`replay-cache.json:103`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-cache.json#L103)

**Verified against the real harness, not just the model plane**

- Documents the `dsh --profile headless` runs and the decoded session logs proving the sandbox's own real stdout (`"55\r\n"`), the harness's own `[exit code: 7]` marker, and a genuine `egress/denied` event for the network attempt — none of it authored text.
  [`profile-install.md:721`](../../docs/profile-install.md#L721)

**Tests**

- Allows a `pwsh` call with no network-reaching command, and one with no `command` argument at all.
  [`test/index.test.js:659`](../../plugins/dsh-client-ui-base/test/index.test.js#L659)

- Denies calls that shell out to `Invoke-WebRequest`, `curl`, or open a raw socket, and records the same `egress/denied` shape the monitor counts.
  [`test/index.test.js:670`](../../plugins/dsh-client-ui-base/test/index.test.js#L670)
