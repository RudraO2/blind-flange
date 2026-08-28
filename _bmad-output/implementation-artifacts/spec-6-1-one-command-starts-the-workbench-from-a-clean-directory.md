---
title: 'One command starts the workbench from a clean directory'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# One command starts the workbench from a clean directory

## Intent

**Problem:** Everything that turns a stock DeepSeek Harness into Blind Flange — both patch layers, the four task-type presets, the two settings keys — lived only in `~/.dsh`, which is never committed. `docs/profile-install.md` made it reproducible by hand, in eleven steps, if you read the whole file. A judge handed the repository link got the instructions, not the application.

**Approach:** The parts of the profile this project authors are now tracked under `profile/`, and `scripts/start.mjs` (Node builtins only — the licence allow-list is not widened for a setup script) writes them out: it checks Node and pnpm, installs the pinned harness only if the machine does not already have exactly that version, links this checkout's plugin package into the `web` and `headless` profiles, copies the patch layers and presets, merges the settings keys this project owns while leaving the operator's own alone, seeds a workspace when the home is brand new, and starts the web profile. `npm start` from the repository root, `$DSH_HOME` honoured throughout, every step idempotent — so it is also how an edit under `profile/` reaches a running install. `README.md` is the judge-facing front door: prerequisites, the command, what the first screen shows, and which single step touches the network.

The workspace seed is the part the plan did not anticipate. The composer will not start a session until a workspace is chosen and a fresh home has none, so without it the documented command stopped one click short of the first demo beat.

## Suggested Review Order

**The command itself**

- The script, top to bottom: prerequisites, the pinned harness, the `link:` install, the copies. Read the header comment first — it says why there are no dependencies.
  [`start.mjs:1`](../../scripts/start.mjs#L1)

- The settings merge. This is the one place that must not overwrite what it finds: every key in the tracked fragment is enforced, every key that is not in it — `ui-theme.preference` above all — is left exactly as it was.
  [`start.mjs:102`](../../scripts/start.mjs#L102)

- The workspace seed, and its one guard: written only when `storages/workspace.json` is absent, because an operator's workspace list is theirs.
  [`start.mjs:183`](../../scripts/start.mjs#L183)

**What it writes**

- The profile, now tracked. The header comment on each patch file says which copy is the source of truth.
  [`profile/web/cordis.patch.yml:1`](../../profile/web/cordis.patch.yml#L1)

- The settings this project owns, and the reason each one exists.
  [`profile/settings.yaml:1`](../../profile/settings.yaml#L1)

**What a judge reads**

- The front door: prerequisites, the command, the first demo beat, and the honest paragraph about the one step that uses the network.
  [`README.md:1`](../../README.md#L1)

- The installation doc, now the explanation rather than the procedure.
  [`docs/profile-install.md:8`](../profile-install.md#L8)

## Verification

Run on a fresh `DSH_HOME` against a `git clone` of this commit into an empty directory, 28 August 2026:

- `npm start` reached a running app at `127.0.0.1:3081` with the tab reading "Blind Flange".
- First screen carried no dialog of any kind: no API-key modal, no Internal Testing Notice.
- The canary was pressed from that first screen and was denied; a session then showed "Egress 1".
- DevTools recorded 73 requests for the page load and the turn — every one to `127.0.0.1:3081` or a `data:` URI. No font, no model, no telemetry.
- Screenshots in both themes: `docs/screenshots/6-1-cold-start-{light,dark}.png`.
