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

   **Run it from the main checkout.** `$(pwd)` is baked into the profile, so running this from
   inside a git worktree points the profile at that worktree; deleting the worktree later leaves
   a dangling symlink and the plugin stops loading with no error anyone would connect to the
   cause. This happened once, on 28 Aug 2026. Verify with:

   ```bash
   ls ~/.dsh/profiles/web/node_modules/@blind-flange/dsh-client-ui-base/   # must list lib/
   dsh --profile web --dump-config | grep bf-base                          # must print the row
   ```

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

## Story 1.5: our mark, our tab title, our favicon

Append to `~/.dsh/profiles/web/cordis.patch.yml` (see the file's own comment for why):

```yaml
- id: ui-brand-official
  disabled: true
```

`@deepseek-ai/dsh-client-ui-brand-official` is the plugin behind the DeepSeek whale, and it
turns out to fill **two** places, not one: the hero (`conversation.hero.brand.mark`) and the
collapsed sidebar rail icon (`sidebar.brand.mark`, a slot `ui-brand-official` itself declares —
it is not in the verified seat table because nothing declares it independently). Registering our
own mark into `conversation.hero.brand.mark` alone, with `ui-brand-official` still active, does
nothing visible: dynamically-registered (out-of-tree) entries get a **lower** priority than a
shipped one for a `single` slot — the same rule the harness notes call out for the literal `root`
slot, just true more generally. Disabling the row is what actually clears both seats. Confirmed
empirically, not from documentation: with the row disabled but our plugin *not yet* registering
into `sidebar.brand.mark`, that rail icon still showed a whale — ui-layout's own built-in
fallback for an unfilled slot, not `ui-brand-official`'s. Take both slots, or one keeps the
whale.

No new patch row is needed for the plugin package itself — this rides the `bf-base` insert row
already mounted in step 3. Two new extension points on the same package:

- **Host half** (`lib/index.js`): `ctx.webServer.register()` claims an exact route,
  `/blind-flange/favicon.svg`, serving `lib/favicon.svg`; `ctx.webServer.tapIndex()` swaps the
  shipped `<title>DeepSeek Harness</title>` for `<title>Blind Flange</title>` and the favicon
  `<link>` href for our route. Both are the harness's own documented escape hatches for the
  built `dsh-web-frontend/dist/index.html` — no file under that dist is touched (NFR5).
- **Client half** (`lib/client.js`): `ctx.slots.register(..., BlindFlangeMark)` into both
  `conversation.hero.brand.mark` and `sidebar.brand.mark`. `BlindFlangeMark` fills with
  `currentColor`, not a literal hex, so it renders correctly in both themes without its own
  media query — confirmed by screenshot, not assumed (`docs/screenshots/1-5-brand-mark-*.png`).

The DeepSeek Harness and Cordis MIT copyright notices are retained in `THIRD_PARTY_NOTICES.md`
at the repo root (NFR11).

**Checking it worked:**

```sh
curl -s http://127.0.0.1:3080/blind-flange/favicon.svg   # our svg, 200
curl -s http://127.0.0.1:3080/ | grep -o '<title>[^<]*</title>'   # <title>Blind Flange</title>
dsh --profile web --dump-config | grep -A1 "id: ui-brand-official"   # disabled: true
```

In the running app: the browser tab reads "Blind Flange" and shows our favicon; the flange mark
appears both in the collapsed sidebar rail and in the hero at the top of the conversation; the
whale appears nowhere.

## Story 3.1: the replay provider answers a turn

`ctx.llm.registerAdapter` (dsh-llm's model seam) was the riskiest unknown in the project
(epics.md, Epic 3). It works, verified against the installed harness (`0.1.1-rc.2`) on 28
August 2026, day one of four — no fallback to our own agent loop was needed.

**The registration contract is duck-typed.** `LlmRuntime.registerAdapter` never does an
`instanceof` check on the adapter it is handed — it only calls `providerInfo`,
`providerRetryPolicy`, `prepareCall` and `stream` — and this plugin is mounted through a
`link:` row, i.e. loaded through a symlink. Node resolves a bare specifier from a symlinked
module's REAL on-disk path, which is this repo, not the profile's `node_modules` the
harness's own `@deepseek-ai/dsh-llm` lives in — so `import "@deepseek-ai/dsh-llm"` from inside
`plugins/dsh-client-ui-base` fails with `ERR_MODULE_NOT_FOUND` even though the harness process
importing the plugin has that package loaded and working. Confirmed both ways directly against
the installed harness before writing any plugin code:

```sh
# from the plugin's real path — fails
node -e "import('@deepseek-ai/dsh-llm').then(()=>console.log('OK')).catch(e=>console.log('FAIL',e.code))"
# → FAIL ERR_MODULE_NOT_FOUND

# a plain object satisfying providerInfo/providerRetryPolicy/prepareCall/stream, no
# LlmAdapter subclass, no dsh-llm import — registers and streams a turn to completion
```

So `plugins/dsh-client-ui-base/lib/model-plane/llm-adapter.js` never imports
`@deepseek-ai/dsh-llm`; it hands `ctx.llm.registerAdapter` a plain object. This is also just
what CONTEXT.md's "Plugin contract" already says: the contract is ours, the harness is a
(duck-typed, it turns out) implementation of it.

**Our own `ModelProvider` contract** (`model-plane/model-provider.js`) sits behind that bridge:
`replay`, `local`, `remote`, selected by name in one lookup table, never a code path (FR7).
`replay` is implemented — it answers from `model-plane/replay-cache.json`, authored by hand
per ADR-0001's 28 August 2026 amendment, in the same shape (an ordered list of blocks per
turn) a captured cache would use. `local` (llama.cpp on the 1650, ADR-0001's day-4 stretch
goal) and `remote` (dev-only, never in a demo) are declared but fail loud when selected — there
is nothing to implement them against yet.

**Which provider a session actually uses is `agent-default-model`**, a shipped Cordis row that
otherwise points every new session at `deepseek-official` — the adapter Story 1.3 already
disabled, which is why `dsh --profile headless "say hello"` failed with `NO_ADAPTER` before
this story. Append to both `~/.dsh/profiles/web/cordis.patch.yml` and
`~/.dsh/profiles/headless/cordis.patch.yml`:

```yaml
- id: agent-default-model
  config:
    provider: replay
    model: replay-authored-v1
```

**Checking it worked**, verified 28 August 2026:

```sh
dsh --profile headless "say hello"
```

Before this row: `dsh: NO_ADAPTER: no adapter registered for provider "deepseek-official"`.
After it: an authored line from `replay-cache.json`, printed to the terminal — a real running
harness process, a real turn, served from replay. No UI surface is added by this story, so the
Standing acceptance criteria's screenshot requirement does not apply.

## Story 3.3: the fleet is declared in one registry file

`registry/models.yaml` at the repo root declares the fleet (CONTEXT.md "Fleet"). It is read
by `plugins/dsh-client-ui-base/lib/registry/fleet.js` — the one seam the UI model list, the
router (Stories 3.5-3.6) and the licence loader (Story 3.4) all go through.

**No profile change is needed.** The list rides the `bf-base` row and the replay adapter that
Story 3.1 already mounted: `llm-adapter.js`'s `listModels()` returns the registry, filtered to
the licence allow-list, so the harness's own model picker (the "Select model" control in the
composer) shows the three permissive fleet members after a restart. `Qwen/Qwen2.5-3B-Instruct`
is in the file under the Qwen Research Licence — declared only so Story 3.4's loader can refuse
it — and is filtered out of the list until that loader lands.

Verified 28 August 2026, `dsh web` running: the "Select model" menu lists
`Qwen/Qwen2.5-7B-Instruct`, `Qwen/Qwen2.5-Coder-7B-Instruct` and `Qwen/Qwen2.5-VL-7B-Instruct`
under "Blind Flange (replay)", and nothing else. Screenshots in both themes at
`docs/screenshots/3-3-model-list-{light,dark}.png`.

Each licence in the file was re-verified by reading the licence text in the model repository
at the exact `revision` pinned there (NFR1); see `docs/licence-policy.md`.

```sh
curl -s http://127.0.0.1:3080/api/llm.models -X POST -H "Content-Type: application/json" \
  -d '{"type":"client-request","rpcId":"t","method":"llm.models","payload":{}}'
# -> one group "Blind Flange (replay)" with the three permissive members
```

## Story 3.7: the routing chip replaces the stock model picker

`conversation.input.model` is a `single` slot — one occupant, and taking it means
rendering the whole model affordance yourself. `plugins/dsh-client-ui-base`'s client half
registers the routing chip there. For it to *replace* the stock picker rather than sit
beside it, the shipped picker's row is disabled. Append to
`~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: ui-model-selection
  disabled: true
```

`@deepseek-ai/dsh-client-ui-model-selection` is the plugin behind both the composer
model seat and the `/model` popup command; disabling the row removes both. Blind Flange
picks the model by classifier score, not by a menu (CONTEXT.md "Router"), so an operator
control that sets the model contradicts the workbench's own claim — the same reasoning
that turned the Story 1.4 hero chip from a dropdown into an indicator.

No new patch row is needed for the plugin package — this rides the `bf-base` insert row
from step 3. The client half also registers a conversation view (`bf-routing`) and the
event Definition that folds the router's `router/routed` session events (Story 3.6) into
it, so the chip shows the decision the router actually recorded rather than recomputing
it.

**Checking it worked:**

```sh
dsh --profile web --dump-config | grep -A1 "id: ui-model-selection"   # disabled: true
```

In the running app: run one turn, then the chip at the right end of the composer names
the fleet member the router picked; clicking it expands to the classified task type, the
score per fleet member, and any member filtered out before scoring with its reason.
Screenshots in both themes at `docs/screenshots/3-7-routing-chip-{light,dark}.png`.

## The headless profile

`dsh` is a launcher, not an app: it boots a *profile*, and a profile is a stack of plugin
bundles. `web` stacks `@deepseek-ai/dsh-base` + `dsh-web-app`; `headless` stacks the same base
plus `dsh-headless`, and answers one task on the command line then exits:

```sh
dsh --profile headless "summarise the inspection report"
```

**Mount the plugin there too.** The sovereignty layer is host-side and has nothing to do with
rendering; a workbench whose egress denial only holds in the browser is not sealed. It is also
the honest answer to "why is this in a browser" — the same enforcement runs with no browser
involved.

```sh
dsh plugin --profile headless add "link:$(pwd)/plugins/dsh-client-ui-base"
```

Then write `~/.dsh/profiles/headless/cordis.patch.yml`:

```yaml
- insert:
    - id: bf-base
      name: '@blind-flange/dsh-client-ui-base'

- id: tool-web
  disabled: true

- id: web-search-deepseek
  disabled: true

- id: web
  disabled: true

- id: llm-deepseek
  disabled: true

- id: llm-pi-ai
  disabled: true
```

Two differences from the web profile, both learned the hard way:

1. **`inject` must stay empty in `lib/index.js`.** Cordis treats `inject` as a hard gate — it
   holds the fiber until every named service exists, and one that never appears means `apply`
   never runs, silently. `headless` has no `webServer`. Naming it at the top level would mount
   the egress denial waterfall in the browser and nowhere else. The favicon and title work asks
   for `webServer` through a nested `ctx.inject` inside `apply` instead, and simply never runs
   here.

2. **`tool-web` must be disabled explicitly**, which the web profile does not need. There the
   tool is mounted per agent preset and sealing it meant Blind Flange copies of the presets that
   carried it. `headless` has no presets — `dsh-base` mounts `tool-web` directly — so disabling
   only the `web` service it depends on hangs the boot with
   `dsh-tool-web: pending (waiting for service: web)` instead of removing it.

**Checking it worked:**

```sh
dsh --profile headless --dump-config | grep -A2 "id: bf-base"
dsh --profile headless "say hello"
```

The second command is expected to fail today with
`NO_ADAPTER: no adapter registered for provider "deepseek-official"`. That failure *is* the
proof: the plugin tree loaded clean and every network-reaching adapter is gone, so there is
nothing left to answer with. Headless starts answering once Story 3.1 lands the replay provider.

## Removing it

```sh
dsh plugin --profile web remove @blind-flange/dsh-client-ui-base
```

and delete the insert row. Removal is always a patch-layer edit; nothing under the harness
install is touched, so there is nothing to undo there.
