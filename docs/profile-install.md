# Installing the Blind Flange profile

How Blind Flange is assembled on a machine. Everything here goes through the harness's own
supported paths — a profile dependency and a patch row. **No harness source file is ever
edited** (NFR5).

The `~/.dsh` profile is not in this repository and never will be, so this file is the record
that makes it reproducible. Epic 6 turns it into one command.

## Versions

| Component | Version | Status |
|---|---|---|
| `@deepseek-ai/dsh` | `0.1.1-rc.2` | **Pinned.** The harness is a developer preview whose README promises compatibility-breaking changes (NFR6). Install it with the exact version; never `@latest`. The same string is recorded in `plugins/dsh-client-ui-base/package.json` under `blindFlange.harnessVersion`. |
| Node | `22.15.0` | **Minimum, not pinned.** What this machine runs and what the plugin was verified against; a second machine needs `>=22.15.0`. `@earendil-works/pi-ai` wants `>=22.19.0`, but that provider is removed in Story 1.3, so the gap closes by deletion rather than by an upgrade. |
| pnpm | `10.11.0` | **Minimum, not pinned.** `dsh plugin` forwards to whatever pnpm is on `PATH` and fails with a clear message if there is none. |

Check both before starting — a missing pnpm fails halfway through step 2 and leaves a
half-built profile:

```sh
node -v     # >= 22.15.0
pnpm -v     # >= 10.11.0
```

**Licence scope.** Three packages have been verified by reading `LICENSE` at the pinned ref,
on 27 August 2026: the harness (`deepseek-ai/deepseek-harness`, MIT), Cordis
(`cordiverse/cordis`, MIT) and the published CLI `@deepseek-ai/dsh` (MIT). That is the three
we install directly, **not** the roughly 511 packages the global install pulls in. The
transitive tree is disclosed in the harness's own `THIRD_PARTY_NOTICES.md` and is **not yet
audited** — Story 6.4 closes that, and the Apache-2.0/MIT/BSD-only claim must not go in front
of MRPL until it has. See `licence-policy.md`.

## Steps

1. **Install the harness CLI globally at the pinned version.**

   ```sh
   npm install -g @deepseek-ai/dsh@0.1.1-rc.2
   ```

   Roughly 511 packages and two minutes. Do not use `npx` — it did not complete in seven
   minutes on this machine.

2. **Install the Blind Flange plugin package into the web profile.** Run this from the
   repository root:

   ```sh
   dsh plugin --profile web add "link:$(pwd)/plugins/dsh-client-ui-base"
   ```

   On Windows use forward slashes in the path even in PowerShell — the spec is passed through
   to pnpm, which reads a backslash path as an escape. The installed dependency should read
   `link:C:/Users/.../plugins/dsh-client-ui-base`.

   `dsh plugin` initialises the profile on first use, forwards the rest to pnpm inside
   `~/.dsh/profiles/web`, then reconciles the profile's bundle list. It prints

   > `@blind-flange/dsh-client-ui-base declares no dsh.bundle — installed as a plain
   > dependency, not a profile layer`

   which is the expected and correct outcome: our client plugins are mounted by the patch row
   in step 3, not by joining the bundle stack.

   **Use `link:`, not `file:`.** With `file:` pnpm copies the package into its store, so every
   edit to a plugin source file needs a reinstall before it reaches the browser. `link:` points
   the profile at the working copy, which is what a four-day build needs.

   The cost of `link:` is an absolute path in `~/.dsh/profiles/web/package.json`. Moving or
   re-cloning the repository breaks it silently — the plugin simply stops being served. Re-run
   this step after any move, and expect to run it as written on a second machine.

3. **Mount it.** `~/.dsh/profiles/web/cordis.patch.yml` is the user patch layer, applied after
   every bundle layer. **Append** this array element; keep any entries already there.

   ```yaml
   - insert:
       - id: bf-base
         name: '@blind-flange/dsh-client-ui-base'
   ```

4. **Suppress the Internal Testing Notice.** Merge this key into `~/.dsh/settings.yaml` — the
   file also holds the operator's own settings, so do not overwrite it:

   ```yaml
   ui-onboarding:
     welcomeNoticeVersion: 2026-08-13.1
   ```

   The same file records the theme last chosen in Settings (`ui-theme.preference`, one of
   `light`, `dark` or `system`). Both themes are honoured, so every panel we build has to
   render correctly in either.

   The API-key modal is a separate problem and is not suppressed by this — see Story 1.3.

5. **Retire the 27 August spike, if this machine carries it.** The spike copied a plugin
   straight into the shared profile store instead of installing it. Remove the directory and
   any `bf-egress-monitor` row in `cordis.patch.yml`:

   ```sh
   rm -rf ~/.dsh/profiles/node_modules/@blind-flange
   ```

   Nothing depends on it. The egress monitor is rebuilt from the UI primitives in Epic 2; the
   spike's hand-written colours are the counter-example our UI rules exist to prevent.

6. **Remove the cloud providers.** Story 1.3. The only two LLM adapter rows in the resolved
   tree are `llm-deepseek` (the deepseek-official provider) and `llm-pi-ai` (the Earendil
   pi-ai multi-vendor gateway). Disable both in `cordis.patch.yml`:

   ```yaml
   - id: llm-deepseek
     disabled: true

   - id: llm-pi-ai
     disabled: true
   ```

   Verified after restart, 28 August 2026:

   - `dsh --profile web --dump-config` shows both rows with `disabled: true`, and no other
     `llm-*` row is a provider adapter (`llm`, `llm-retry`, `session-title-llm` are framework
     glue, not adapters).
   - Settings → Models renders with an empty provider list — no `deepseek-official`, no other
     provider — `Add provider` and `Add a custom provider` present but inert.
   - **The "Add an API key" modal no longer appears on load.** It disappeared as a side effect
     of there being no provider left to configure, exactly as `deepseek-harness-notes.md`
     guessed. Epic 7's local/replay provider onboarding replaces the gap this leaves, not the
     modal itself.
   - **`@anthropic-ai`, `@aws-sdk`, `@google`, `@mistralai` and `openai` are still resolvable**,
     and disabling the two rows cannot change that. `node -e "require.resolve('openai')"` from
     inside `~/.dsh/profiles/web` resolves to
     `%APPDATA%/npm/node_modules/@deepseek-ai/dsh/node_modules/openai/index.js` — the
     **global `dsh` package's own install**, not this profile and not
     `~/.dsh/profiles/node_modules`. Those five SDKs are transitive dependencies of
     `dsh-llm-pi-ai` bundled into the harness's own global install at `npm install -g` time.
     Removing them means deleting files under `$(npm root -g)/@deepseek-ai/dsh`, which is
     exactly the harness install NFR5 forbids touching. Disabling the plugin rows means no code
     path ever `require()`s them at runtime — nothing they contain executes and no network call
     they could make ever fires — but static `require.resolve()` still finds the files on disk.
     Sovereignty holds in behaviour; it does not hold in a filesystem grep of the global
     install, and no in-profile change can make it hold there.

7. **Introduce the workbench as Blind Flange.** Story 1.4. Three parts, none of them a
   harness-source edit:

   - **Four task-type presets**, authored (not shipped) at
     `~/.dsh/.agent-presets/{document,drawing,calculation,code-task}/`, each an
     `agent.cordis.yml` + `preset.yml` pair. `document`, `drawing` and `calculation` are the
     sealed `standard` composition (Story 1.2's copy, tool-web disabled) under a new persona;
     `code-task` is the sealed `code`/PTC composition under the same treatment. **The fourth
     directory is `code-task`, not `code`** — `code` is a shipped preset id
     (`dsh-agent-presets` scans its own shipped root first and a same-id authored preset is
     always shadowed by it, never the other way around), so an authored preset named `code`
     is invisible from `agentPreset.list`. Only the `preset.yml` **name** needs to read "Code";
     the directory name is never shown. Each `agent.cordis.yml`'s `persona` row reads:

     ```yaml
     - id: persona
       name: '@deepseek-ai/dsh-persona'
       config:
         text: >-
           You are Blind Flange, a sovereign industrial knowledge-work workbench running
           entirely offline on the {{model}} model within the DeepSeek Harness. Your working
           directory is {{cwd}}. This session handles <task-type clause>.
     ```

   - **The deployment default.** Merge into `~/.dsh/settings.yaml` (same file Step 4 already
     touches — do not overwrite):

     ```yaml
     agent-presets:
       default: document
     ```

   - **The host-level persona**, appended to `cordis.patch.yml`, so a rosterless session and
     `dsh --profile web --dump-config` both stop reading "You are a coding agent powered by the
     {{model}} model":

     ```yaml
     - id: system-prompt
       config:
         persona: >-
           You are Blind Flange, a sovereign industrial knowledge-work workbench running
           entirely offline on the {{model}} model within the DeepSeek Harness. Your working
           directory is {{cwd}}.
     ```

   **What this cannot reach.** `dsh-agent-presets` hard-codes its shipped preset root into
   every deployment's resolved config (`apps/cli/src/profile-boot.ts`'s `composeProfile`
   overwrites the `agent-presets` row's `roots` with the shipped path on every boot, patch or
   no patch) — verified against a running `dsh web`, 28 August 2026: `agentPreset.list` names
   `standard`/`code`/`minimal`/`cordis` (their shipped Chinese display names) no matter what
   this profile configures. No profile-level change removes them. `plugins/dsh-client-ui-base`'s
   client half works around this for the one surface that matters most — it takes the
   `conversation.hero.agentPreset` slot and shows only `trust: 'user'` presets, so the
   new-session picker reads as four Blind Flange task types with nothing else in the list.
   Settings → Agent presets (the management section) still lists all eight — the four shipped
   plus the four Blind Flange ones — unavoidably, since it is the host's own component reading
   the same unfiltered roster.

## Checking it worked

```sh
dsh --profile web --dump-config     # the bf-base row appears under the cordis.patch.yml layer
dsh web --no-open                   # serves http://127.0.0.1:3080
```

`--dump-config` prints the composed tree with a `# ==` header per layer. The last layer should
end with our row, and **no `bf-egress-monitor` row should appear anywhere**:

```
# == C:\Users\...\.dsh\profiles\web\cordis.patch.yml
- id: bf-base
  name: '@blind-flange/dsh-client-ui-base'
```

With the app running:

- The browser fetches `/plugins/@blind-flange/dsh-client-ui-base/client.js` and gets a 200,
  alongside the shipped plugins. That is the browser half.
- Settings → Plugins → Plugin list shows `ui-base` as Mounted and Enabled. That is the host
  half; the two are checked separately because they can fail independently.
- The console carries no error naming `@blind-flange/...`.

**Confirming no harness file was edited.** The claim is checkable rather than asserted — no
file under the global install should have changed since the profile work started:

```sh
find "$(npm root -g)/@deepseek-ai" -newermt "<the time you started>" | head
```

An empty result is the evidence. The only files any of this writes are
`~/.dsh/profiles/web/package.json`, `~/.dsh/profiles/web/cordis.patch.yml`,
`~/.dsh/settings.yaml`, and pnpm's own `node_modules` inside the profile.

## Story 1.2: sealing the network-capable tool

`web_search` is **not** disabled by a `cordis.patch.yml` row alone. It is registered per agent
preset (`tool-web` in each built-in preset's own `agent.cordis.yml`), a separate composition
mounted once per process — the profile's patch layer never reaches it. Confirmed empirically on
27 Aug: the host tree already ships `tool-web` as `disabled: true`, yet a live session under
Standard mode still advertised "file and web search," because the preset's own copy of the row
carries no `disabled` key and wins for that session.

The fix has two parts:

1. **Per-preset — the part that actually removes the tool.** In Settings → Agent presets,
   **Duplicate** each built-in preset that mounts `tool-web` (Standard, PTC, Creator — Minimal
   never had it) into `~/.dsh/.agent-presets/blind-flange-{standard,ptc,creator}/`. In each
   copy's `agent.cordis.yml`, change the `tool-web` row to:

   ```yaml
   - id: tool-web
     name: '@deepseek-ai/dsh-tool-web'
     disabled: true
   ```

   `disabled: true`, not `config: { search: false }` — the latter leaves the row listed and
   simply empty of tools; the former drops it from the catalog entirely, which is what "does
   not appear in the tool list" requires. Set **Standard mode (sealed)** as the default preset
   (Settings → Agent presets → "Set as default"). `$DSH_HOME/.agent-presets` is the harness's
   own sanctioned path for this — "a preset IS a composition," per the shipped preset file's own
   comments — so this is extension, not a source edit.

2. **Host layer — belt and suspenders.** Append to `~/.dsh/profiles/web/cordis.patch.yml`:

   ```yaml
   - id: web-search-deepseek
     disabled: true

   - id: web
     disabled: true
   ```

   This removes the search-provider plugin and its config surface (the "Add an API key"
   onboarding prompt, the Web search card under Settings → Plugins) even though, by itself, it
   does not touch the preset-scoped tool. Nothing else in the harness hard-depends on the `web`
   service (checked by grep against the clone at `C:\Users\rpxi1\src\deepseek-harness` — only
   the web-search-provider and web-fetch packages inject it).

**Checking it worked:**

```sh
dsh --profile web --dump-config   # web and web-search-deepseek rows both show disabled: true
```

In the running app: Settings → Agent presets shows "Standard mode (sealed)" marked **In use**,
described as having "No network-capable tool." Settings → Plugins → Web search is gone. A new
session under any built-in preset besides the sealed copies would still show it — the sealed
presets are what must stay selected, not a property of the profile as a whole.

## Removing it

```sh
dsh plugin --profile web remove @blind-flange/dsh-client-ui-base
```

and delete the insert row. Removal is always a patch-layer edit; nothing under the harness
install is touched, so there is nothing to undo there.
