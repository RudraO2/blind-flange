# Installing the Blind Flange profile

How Blind Flange is assembled on a machine. Everything here goes through the harness's own
supported paths — a profile dependency and a patch row. **No harness source file is ever
edited** (NFR5).

## One command (Story 6.1)

```sh
npm start
```

From the repository root, on a clean clone. `scripts/start.mjs` performs every step in this
file — prerequisites, the pinned harness, the plugin package in both profiles, the patch
layers, the task-type presets and the settings keys — and then starts the web profile. It is
idempotent, so it is also how you pick up an edit made under `profile/`. `npm run setup` does
all of it except the start.

**The profile's own files are now tracked**, which they were not before Story 6.1: the
`~/.dsh` tree is still never committed, but the parts of it this project authors live under
`profile/` in the repository and are copied out by the start command.

| Tracked source | Written to |
|---|---|
| `profile/web/cordis.patch.yml` | `$DSH_HOME/profiles/web/cordis.patch.yml` |
| `profile/headless/cordis.patch.yml` | `$DSH_HOME/profiles/headless/cordis.patch.yml` |
| `profile/agent-presets/{document,drawing,calculation,code-task}/` | `$DSH_HOME/.agent-presets/` |
| `profile/settings.yaml` | merged into `$DSH_HOME/settings.yaml` |
| *(generated)* | `$DSH_HOME/storages/workspace.json`, **only when it does not already exist** |

The patch layers and the presets are **copied over** whatever is there — edit the repository
copy, not the profile's. `settings.yaml` is the exception and is **merged**: the same file
holds the operator's own settings (`ui-theme.preference` above all), so every key this project
owns is enforced and every key it does not own is left alone.

**The workspace registry is seeded, and this is not cosmetic.** The composer refuses to start
a session until a workspace is chosen — a fresh home has none, and the placeholder reads
"Choose a workspace to start" — so without a seed the documented command stops one click short
of the first demo beat. `scripts/start.mjs` writes one workspace pointing at the checkout, in
the shape the harness's own domain spec declares (`name: workspace`, `version: 2`;
`packages/workspace/workspace/src/spec.ts`), through the same `json` storage backend the web
profile already configures. It is written **only when the file is absent**: an operator's own
workspace list is theirs, and a re-run on an installed machine leaves it untouched. Verified
28 August 2026 on a fresh `DSH_HOME` — the composer opened ready, on the `document` preset,
with the workspace already selected.

`$DSH_HOME` defaults to `~/.dsh` and is honoured if set, which is how a cold start can be
proved without disturbing an existing install.

**The rest of this file is the explanation**, kept because it says *why* each row exists and
how to do the same work by hand. It is no longer the installation procedure.

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

## Story 2.2: the egress monitor shows a counted zero

No profile change. The egress monitor rides the `bf-base` insert row from step 3 —
both seats and the conversation view are registered by
`plugins/dsh-client-ui-base`'s client half.

- **Host half** (`lib/index.js`): the `tools/pre-execute` denial waterfall from Story 2.1
  now also appends an `egress/denied` session event (`{ tool, target }`) whenever it refuses
  a call. Story 2.1 leaned on the harness's own `tool/call` record for the audit trail, but
  that event is written for every call, allowed or denied — it cannot be counted as a
  denial. `egress/denied` is the distinct marker the monitor folds. It carries the same
  persistence read-path caveat as the router's `router/routed` event and does not bite
  Phase 0's fresh-session `replay` demo.
- **Client half** (`lib/client.js`): a `bf-egress` conversation view folds every
  `egress/denied` event and reports `count` as the number of those nodes — the on-screen
  zero is a count, never a literal (FR15). The compact chip takes
  `conversation.session.header.utilities` (list, additive — it sits beside Story 3.2's
  provider pill); the full panel takes `shell.overlay` (list, root) and renders only when
  the chip opens it. `StateDot` carries the green→red state through `--dsw-*` tokens; the
  panel's surface uses only `ui-theme` background/border/shadow tokens. This is the rebuild
  of the 27 August spike's hand-rolled monitor (UX-DR7) — the spike's own
  `@blind-flange/dsh-client-ui-egress` package and any `bf-egress-monitor` patch row stay
  retired (step 5).

**Checking it worked:**

```sh
dsh --profile web --dump-config | grep -c "bf-egress-monitor"   # 0 — the spike row is gone
```

In the running app: the composer header carries an "Egress 0" pill with a green dot on a
fresh session; clicking it opens the panel below that chip, reading a counted zero. Firing
the canary (Story 2.3) is what first makes it non-zero and red. Screenshots in both themes at
`docs/screenshots/2-2-egress-monitor-{light,dark}.png` — taken before Story 2.4 moved the panel
up under the header chip and gave it the audit list.

## Story 2.3: the canary proves the zero is enforced

No profile change. The canary rides the `bf-base` insert row from step 3 — the tool, the RPC
channel and the button are all registered by `plugins/dsh-client-ui-base`.

- **Host half** (`lib/egress/canary.js`, wired in `lib/index.js`): a real tool, `bf_canary`,
  whose body calls `fetch` against `https://example.com/blind-flange-canary` (IANA's reserved
  documentation domain — a name that exists and belongs to nobody). Its name is in the same
  `NETWORK_TOOL_NAMES` deny-list as `web_search` and `web_fetch`, so the Story 2.1 waterfall
  refuses it before the body runs and appends the same `egress/denied` event Story 2.2 counts.
  Beside it, a loopback-only RPC channel `/bf-canary` with one endpoint, `fire`: it resolves
  the session's live agent through `ctx.agents.get` and dispatches the tool through
  `ctx.tools.execute` — the ordinary pipeline, so the denial is the ordinary denial. Nothing on
  this path appends an event or moves a panel itself.
- **Client half** (`lib/client.js`): a `Pill` in `conversation.input.right` (list, session) —
  the composer tool row, left of the send button — reading "Canary". It posts to `/bf-canary`
  and reports what came back in its own tooltip; the count it makes move is read by the egress
  monitor from the session log, not handed to it. Registered behind a nested
  `ctx.inject(["connection"])` so a client with no host transport loses the button and keeps
  the other seven seats.

  The first cut used `Button` with `variant: "toolbar"`. It looked right in dark and resolved to
  a translucent dark fill under near-black text in light — the "pasted on" failure UX-DR2 exists
  to prevent, and nothing in the shipped app uses that variant. `Pill` is what the routing chip
  and the egress chip already use, and it is correct in both themes.

**The canary is model-visible, and that is a deviation from Story 1.2.** Verified on
28 August 2026 by logging the assembled `GenerateOptions.tools` for a real turn: the list is
`ask_user_question, bf_canary, create_goal, edit, …`. `ToolRuntime.register` has no
"hidden tool" flag — every registered tool is visible in its scope, and a plain-context
registration lands in the global layer — so a canary that is a real tool is a tool in the list.
Recorded rather than smoothed over:

- Story 1.2's criterion is "no other tool in the list is capable of an outbound network call".
  `bf_canary` is capable, by design; that capability is the whole of Story 2.3's first
  criterion, and a canary the seal could never have let through would prove nothing.
- The alternatives were worse. Dispatching an *unregistered* name still runs the waterfall
  (policy listeners see every name that reaches the registry) and would keep the list clean —
  but then nothing real sits behind the button, which is the failure NFR8 names.
  `ctx.tools.restrict({ deny: ['bf_canary'] })` removes it from a scope's view, but a
  restricted-away name is absent from that scope's dispatch too, so it would disarm the canary
  along with hiding it.
- The exposure is bounded: the waterfall denies `bf_canary` for **any** caller, model included
  (`test/index.test.js`), and under the `replay` provider the model emits no tool calls at all,
  so a demo's opening zero cannot be spent by the model reaching for it.

Whether Story 1.2's wording should be amended to name the canary as its one deliberate
exception is a plan decision, not a point-of-use one. It is flagged here rather than decided.

**Checking it worked:**

In the running app, on a session that has had at least one turn: the composer row carries a
"Canary" chip beside the routing chip. Press it — the chip takes a red state dot and reads
"Canary denied. The attempt was refused by egress denial and written to the audit log.", the
header pill goes from "Egress 0" (green) to "Egress 1" (red), and opening it lists that
denial — timestamp, `bf_canary`, `https://example.com/blind-flange-canary` (Story 2.4; before
that story the panel carried a single `Last:` line). Press it again and the count is 2.
Screenshots in both themes at `docs/screenshots/2-3-canary-{light,dark}.png`.

The button is present on the hero composer too, before the first turn, but firing it there
fails with "The canary could not be fired": a session with no live agent has nowhere to record
the denial, and a denial nobody can see is the silence this button exists to replace.

## Story 2.4: the audit log can be read on screen

No profile change. The audit surface is the egress monitor's own panel, already riding the
`bf-base` insert row from step 3.

- **Host half:** none. The denial event the waterfall already appends carries the tool and the
  target, and the harness's `SessionEvent` envelope carries `seq` (monotonic) and `time` (unix
  epoch milliseconds) on every record. The audit line reads the log's own timestamp rather than
  a second clock reading taken when the panel rendered, so nothing new is written to the log for
  this story.
- **Client half** (`lib/client.js`): the `bf-egress` conversation view now reports `entries`
  alongside `count` — every folded `egress/denied` node, ordered by the log's sequence number,
  so they read in the order they were written however they were delivered. The panel lists them
  under an "Audit log — oldest first" heading: local clock reading, tool, refused target, with
  the ISO 8601 stamp and the whole sentence on the row's `title`. A record missing a field is
  named as missing ("no timestamp recorded", "unrecorded target") rather than filled in.
- **The panel moved.** Story 2.2 anchored this card bottom-right, which was fine while it was
  three lines tall; the audit list makes it tall enough to cover the canary button in the
  composer row — the one control an evaluator presses *while* watching the panel. It now opens
  below the session header (`top: 88px`), where the chip that opens it lives. The list is capped
  at `maxHeight: 168px` and scrolls, so the card cannot grow back down into the composer. That
  cap holds three entries, so the list scrolls itself to the end whenever an entry arrives —
  otherwise the fourth denial onwards renders below the fold, which is precisely the line
  someone pressing the canary is watching for.
- **Why this panel and not a new seat:** an evaluator who asks "show me" is already looking at
  the monitor, and a second surface folding the same events would be two places to keep in step.
  No new slot is registered for this story.

**Checking it worked:**

In the running app: fire the canary two or three times, then open the "Egress N" pill. Each
denial is listed with its timestamp, `bf_canary`, and the target it was refused, oldest at the
top. Leave the panel open and fire again — the new line appears in place and is scrolled into
view, with no reload: the panel is subscribed to the same session view the count comes from.
Verified 28 August 2026 on a running `dsh web` at five denials, including across a page reload
(the stored log replays the denials back).
Screenshots in both themes at `docs/screenshots/2-4-audit-log-{light,dark}.png`.

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

## Story 5.2: helper agents are visible while they work

Surveyed from the installed harness source on 28 Aug 2026: `ui-jobs` (background-job badge
at `conversation.session.header.actions`) and `ui-subagent` (descendant-count breadcrumb at
`conversation.session.header.lineage`) are already mounted and read real session state — a
`jobsBySession` mirror folded from `session/jobs` frames, and `subagentsByParent` through the
standard `useSessions` hook. What was off is the model-facing tools that give a real agent
something to drive them: `tool-jobs`, `tool-subagent`, and `tool-subagent-control` all carry
`disabled: true` from `@deepseek-ai/dsh-base, patched by @deepseek-ai/dsh-web-app` — the
harness's own patching, not Epic 1's sealing (subagent delegation and background-job control
make no outbound network call). No new component was built, per the epic's own instruction.

Append to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: tool-jobs
  disabled: false

- id: tool-subagent
  disabled: false

- id: tool-subagent-control
  disabled: false
```

The same three rows are appended to `~/.dsh/profiles/headless/cordis.patch.yml`, so a headless
run exercises the identical real dispatch the web profile's UI renders.

`plugins/dsh-client-ui-base/lib/model-plane/replay-cache.json` carries a new two-turn authored
entry (`match: "use a helper agent"`) demonstrating the wiring: the parent turn calls the real
`subagent` tool (provider `spawn`, `backgroundMode: continuable`) with an authored `prompt`,
omitting `run_in_background` so the tool's own continuable-mode default backgrounds the call
rather than blocking — the parent's closing text names it as running rather than waiting on
it. A second entry (`match: "corrosion-under-insulation finding"`) answers the child session's
own turn, matched on the exact `prompt` argument text the parent's tool call sends it (the
child's initial message carries `source: { kind: "user" }`, which the replay provider's
genuine-human-message check accepts — see `dsh-subagent-in-process-driver`).

**Checking it worked**, verified 28 August 2026 via `dsh --profile headless` (the fastest way
to exercise real dispatch without a browser) and confirmed against the web UI:

```sh
dsh --profile headless "Use a helper agent to double-check the corrosion finding on E-1104A while you draft the recommendation."
# -> Helper agent is running in the background on the corrosion check. I'll let you know what
#    it finds; meanwhile the relief-valve certification gap (PSV-2207A) still needs a bench
#    test scheduled.
```

The run wrote a second session directory under the caller's session store with
`"origin":"subagent"`, `"parentSession"`, `"delegationDepth":1` — a real `ctx.subagents`
child, not a fabricated one. Opening that same session afterwards in the web UI's session
list shows the shipped `ui-subagent` breadcrumb reading "1 subagent"; expanding it lists
"Double-check E-1104A corrosion finding — continuable · not running", pulling the
`description` straight from the authored tool-call arguments. The "not running" status *is*
the gauge's resting state for a settled continuable child — the descendant count itself is a
lineage total, not a live tally, matching `ui-subagent`'s own documented design (see its
README: "shows ongoing activity when any counted descendant is running", not a count that
zeroes). Screenshots in both themes at
`docs/screenshots/5-2-fanout-gauge-{light,dark}.png`.

A pre-existing, unrelated defect surfaced during verification: every session in this profile's
store predating this story fails to load its chat history with `SessionFormatUnsupportedError:
... contains event type "router/classified" (seq 6) unknown to this harness`, and the
composer stays disabled on any session whose history failed to load this way. Not caused by
this change — it predates Story 5.2 by at least an hour of session timestamps — and out of
scope to fix here; recorded in `_bmad-output/implementation-artifacts/deferred-work.md`.

## Story 5.3: a coding task runs and is verified in the sandbox

Surveyed from the installed harness source, per the epic's own table: `sandbox` (local),
`sandbox-policy` and `pwsh-sandbox` are already active — the Windows executor, since
`dsh-bash-sandbox`'s `disabled` expression is true on win32 and never loads on this build
machine. Only the model-facing tool, `tool-pwsh`, carried `disabled: true` from
`@deepseek-ai/dsh-base`. Enabling it is what gives a real agent something to run through
`ctx.sandbox` — the shipped terminal card already renders the run and its result, success or
failure, so no new panel was built.

Append to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- id: tool-pwsh
  disabled: false
```

The same row is appended to `~/.dsh/profiles/headless/cordis.patch.yml`, so a headless run
exercises the identical real sandboxed execution the web profile's UI renders.

**The network seal extends to the sandbox's shell.** `pwsh` cannot be denied by name the way
`web_search`/`web_fetch` are — a coding task needs it to run for ordinary, non-network
commands. `plugins/dsh-client-ui-base/lib/index.js`'s `tools/pre-execute` waterfall now also
inspects a `pwsh` call's `command` argument text against `NETWORK_PWSH_PATTERN` — matching
`Invoke-WebRequest`/`iwr`, `Invoke-RestMethod`/`irm`, `curl`, `wget`, `Start-BitsTransfer`,
`Test-NetConnection`, and the raw-socket/HTTP-client .NET types (`Net.Sockets.TcpClient` and
its siblings, `Net.WebClient`, `Net.Http.HttpClient`, `Net.Dns`) a script could reach for
instead of a cmdlet — and denies+records only those calls, on the same `egress/denied` event
the monitor already counts (Story 2.2) and through the same waterfall the canary is denied by
(Story 2.3). This is the same deliberately simple deny-by-pattern policy Phase 0 already
accepts for the network-named tools, applied to command text because `pwsh` carries both
network and non-network commands under one name; a determined script can still evade a text
match, which is a known Phase 0 limitation, not an oversight.

`plugins/dsh-client-ui-base/lib/model-plane/replay-cache.json` carries three new authored
entries demonstrating each criterion — the replay provider only supplies the model's half; the
harness dispatches the real `pwsh` tool call against the real sandbox for all three:

- `match: "run a coding task in the sandbox"` — a real, successful command (`(1..10 |
  Measure-Object -Sum).Sum`).
- `match: "run a task that will fail"` — a real, deliberately failing command (`exit 7`).
- `match: "reach the internet from the sandbox"` — a real `Invoke-WebRequest` call, denied by
  the extended waterfall above.

**Checking it worked**, verified 28 August 2026 via `dsh --profile headless` and confirmed
against the web UI:

```sh
dsh --profile headless "run a coding task in the sandbox"
# -> The sandbox ran that and returned 55 — a real coding task executed and verified inside
#    ctx.sandbox, not simulated.
```

The session log's `tool/result` for that run carries the sandbox's own real stdout (`"55\r\n"`,
`isError: false`) — not an authored value. The failing-task entry's session log carries the
harness's own `[exit code: 7]` marker, and the network-attempt entry's session log carries a
real `egress/denied` event (`{"tool":"pwsh","target":"Invoke-WebRequest -Uri
https://example.com/blind-flange-canary"}`) between the `tool/call` and `tool/result` lines —
none of this is authored text; only the model's turn is.

In the running web app: sending "reach the internet from the sandbox" renders a red "Pwsh ·
Error: Blind Flange denies outbound network access…" card marked "Failed" in the shipped
terminal-call presentation, and the header's "Egress 0" pill becomes "Egress 1" — opening it
lists the denial with the `pwsh` tool name and the full command as the refused target, in the
same audit list Story 2.4 built. Screenshots in both themes at
`docs/screenshots/5-3-sandbox-egress-{light,dark}.png`.

## Story 5.4: the approval note comes out as a signed .docx

Per the epic's own table, this story has no tool to enable and no profile change — `ui-deliverables`
already renders a produced-files row from render intent (a `generic` card whose `kind` is
`edit`, reading `locations[].path` — `packages/client/ui-deliverables/src/client/turn-deliverables.ts`,
verified from source). The whole story is a new tool, `bf_approval_note`
(`plugins/dsh-client-ui-base/lib/deliverables/`), registered unconditionally like the canary
and the report-findings tool.

**Licence decision: zero new dependencies, not an ADR.** The obvious approach — the `docx` npm
package — was tried first and rejected before being added: its transitive tree pulls in ISC
(`inherits`, `minimalistic-assert`), Zlib (`pako`, via `jszip`) and BlueOak-1.0.0 (`sax`), none
of which are on `docs/licence-policy.md`'s allow-list, each verified by reading the actual
package tarball's `LICENSE` file (or, where none is bundled — `hash.js` — the `package.json`
`license` field, the same fallback the policy already accepts for `Qwen2.5-VL-7B-Instruct`).
Widening the allow-list for one dependency is exactly the point-of-use judgement call the policy
forbids, so `plugins/dsh-client-ui-base/lib/deliverables/zip.js` and `docx.js` instead write the
`.docx` (a ZIP of OOXML XML) directly, using only `node:zlib` (`deflateRawSync`, and `crc32` —
built into Node since 20.12) and `node:crypto`. "Find a permissive equivalent" taken to its
limit: the equivalent is zero dependencies. No row was ever added to `licence-policy.md`
because nothing new ships.

The hand-written OOXML avoids named styles (`w:pStyle` referencing a `styles.xml` entry that
does not exist is a common cause of "found unreadable content, do you want to recover" in
Word) — every paragraph carries direct run formatting instead.

**Checking it worked**, verified 28 August 2026 via `dsh --profile headless`:

```sh
dsh --profile headless "generate the approval note"
# -> The approval note is ready — NRC/RVF/APPR-0417, citing both Major findings with the page
#    and region each was read from, signed and provenance-hashed.
```

The real file lands at `deliverables/approval-note-NRC-RVF-APPR-0417.docx` under the session's
cwd — not authored, not a fixture:

- `unzip -t` reports no errors in the compressed data.
- `python-docx` (already present on this machine, used only as an independent OOXML reader —
  never a runtime dependency) opens it and reads back the titleblock, both cited clauses with
  their page-and-region provenance, the signature block, and the footer's content hash.
- Opened in real Microsoft Word via COM automation (`Documents.Open`, `DisplayAlerts` off): no
  repair prompt, 12 paragraphs, footer text intact.
- **LibreOffice: not verified, accepted as a known limitation.** Two install attempts failed on
  this machine: `winget install TheDocumentFoundation.LibreOffice` downloaded the 358 MB MSI,
  then hung for 40+ minutes at near-zero CPU with no installer window ever appearing —
  consistent with a UAC elevation prompt this non-interactive session has no desktop to show,
  not a slow install; a direct `curl` download of the same MSI crawled at roughly 20 KB/s
  (hours to complete) and was abandoned. Killed rather than left running either way. The OOXML
  this story writes is the same public, unextended structure `python-docx`'s own `lxml`-backed
  parser accepted (no proprietary Word-only markup, no named-style references), which is why
  this was accepted for the Phase 0 prototype rather than blocked on further environment
  troubleshooting. Recorded in `_bmad-output/implementation-artifacts/deferred-work.md`;
  re-verify on a machine where an interactive install can complete, or ask a human to open the
  file once and confirm, if a real LibreOffice-side problem is ever observed.

In the running web app: the turn's closing message carries the deliverables row (Open,
Show-in-folder) for `deliverables/approval-note-NRC-RVF-APPR-0417.docx`, and the response text
itself also names the path and the content hash — the second is the tool's own `output.render`,
so the path is reachable even if a future harness version changes how the row itself is
rendered (FR12's own degrade-not-lose requirement). Screenshots in both themes at
`docs/screenshots/5-4-approval-note-{light,dark}.png`.

## Story 4.5: clicking a finding shows the crop it was read from

No tool to enable and no profile change. This story is one route on the host half and one seat
in the browser half, both inside the plugin package already installed by step 2.

**The seat is `conversation.view`** — a session-scoped `list` slot whose entries are the view
ring's tabs, rendered one at a time. The crop viewer registers as `bf-provenance`, `order: 20`,
labelled "Provenance", so it sits after the shipped Chat (order 0) and Trajectory (order 10)
tabs rather than replacing either. Registration carries an explicit `label`: ui-conversation
falls back to the entry id when one is missing (`apply.ts`, `viewTabs()`), which would put
`bf-provenance` on screen as the tab's name.

**The route** is `GET /blind-flange/provenance/...`, registered on the same `webServer` service
the favicon route uses, `kind: "prefix"` so one registration serves both paths:

| Path | What it answers |
|---|---|
| `/blind-flange/provenance/findings` | The ingestion capture (`lib/findings/sample-report-findings.json`, the same file the `bf_report_findings` tool reads) plus a page manifest carrying each page's real pixel size |
| `/blind-flange/provenance/pages/<n>` | Page `n` of the report as the real 300 dpi PNG |

The page manifest's `width`/`height` are parsed from each PNG's own IHDR header rather than
recorded as constants, so the pixel space the browser scales its crop in is the page image's
real pixel space. A page the findings cite but whose image is missing comes back
`available: false` and the panel says that finding's region cannot be shown — a visible gap
rather than a silently dropped finding.

**The page images are copies.** `lib/findings/pages/sample-inspection-report-p{1,2}.png` are
byte-identical copies of the Epic 4 fixtures at `services/ingestion/fixtures/`, committed into
the plugin for the same reason the findings capture is: the Python ingestion service is a
separate tree, and reaching across it at runtime would tie this panel to the repository layout
that happens to hold while the profile installs the plugin with `link:`. A test asserts the
copies have not drifted from the fixtures.

**Nothing is pre-cropped.** The crop is cut in the browser: a box the size of the finding's
bounding box, `overflow: hidden`, with the whole page image inside it scaled and offset by that
box's own top-left. Move a bounding box in the capture and the pixels on screen move with it —
if the OCR slips, the crop slips (Story 4.2's acceptance criteria, NFR8). There is no
pre-rendered crop image anywhere in this package.

**Checking it worked**, verified 28 August 2026 against a running `dsh web`:

```sh
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
  http://127.0.0.1:3080/blind-flange/provenance/findings
# -> 200 application/json; charset=utf-8 18438
curl -s -o /dev/null -w "%{http_code} %{content_type} %{size_download}\n" \
  http://127.0.0.1:3080/blind-flange/provenance/pages/1
# -> 200 image/png 2687458
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3080/blind-flange/provenance/pages/9
# -> 404
```

In the app: the Provenance tab lists all 156 findings the ingestion service returned for
`sample-inspection-report.pdf`. Clicking "Insulation cladding open at the channel end.
Corrosion" (a Major finding, page 1, bbox 560, 2048, 814 × 58) renders the crop with the
computed geometry `left: -385.26px; top: -1408.94px; width: 1706.83px` over
`/blind-flange/provenance/pages/1` — the scanned line itself, skew and speckle included, above
a caption reading `Page 1 · region 560, 2048 · 814 × 58 px · OCR confidence 100.0%`, beside a
whole-page locator showing where on the page it sits. Screenshots in both themes at
`docs/screenshots/4-5-provenance-crop-{light,dark}.png`.

One layout note worth keeping: the session body grows with its content and scrolls as a whole
in an active session (`ConversationRoot.module.css`, `.root[data-phase='active'] .viewArea
{ flex: 1 0 auto; min-height: auto }`), and the slot wrapper around a view entry is
`display: contents`. A `height: 100%` on the panel therefore resolves to the content's own
height rather than the viewport's. The findings list caps itself and scrolls instead, and the
crop beside it is `position: sticky`, so the evidence stays on screen while the list is
scrolled. The list column also needs `min-width: 0` — without it the automatic minimum size of
a row of unwrapped text overrides the `flex: 0 0 320px` basis and the list eats the whole panel,
squeezing the crop to zero width. That happened on the first run and is what the screenshots
were re-taken against.

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

- id: tool-jobs
  disabled: false

- id: tool-subagent
  disabled: false

- id: tool-subagent-control
  disabled: false

- id: tool-pwsh
  disabled: false
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

## Story 8.1: the adopted panel plugin

The one plugin in this workbench we did not write. `@changfenhuang/dsh-genui` teaches the model
a ```dsh-ui fence and renders the fenced JSON inline in the reply; Blind Flange writes the key
findings into one, and they arrive as a table instead of a paragraph.

**Installed through the profile's own bundle channel, pinned to an exact version:**

```sh
dsh plugin --profile web add @changfenhuang/dsh-genui@0.9.3
```

`scripts/start.mjs` does this for you and is idempotent — it compares the profile manifest's
dependency against the pin and installs only on a mismatch. No copy of the package enters this
repository and no harness source is touched (NFR5). The row that mounts it comes from the
package's own `cordis.patch.yml`, which is why `profile/web/cordis.patch.yml` says nothing
about it: `dsh plugin add` records the bundle in `~/.dsh/profiles/web/package.json` instead.

**Web only.** The headless profile has no browser to render a fence in, and the plugin's host
half would otherwise add its fence-teaching section to that profile's system prompt for nothing.

**Why 0.9.3 and not the newest release.** 0.9.6 was installed first and rejected on the design
gate: 0.9.4 adds a template drawer with a timed first-run hint, and 0.9.5 adds gamified
achievement toasts — a 🏆 "成就解锁" stack mounted onto `document.body`, outside the slot
registry, that fires on the first rendered fence. On an industrial workbench, mid-demo, in a
language the rest of the product does not speak. There is no configuration switch for either,
patching a third-party plugin to pass a gate is not allowed, and pre-seeding its `localStorage`
would be per-browser state that a cold clone cannot ship. 0.9.3 predates both, and its own
changelog records verification against this project's pinned host, dsh 0.1.1-rc.2.

**The permitted component set is ours, not the plugin's.** The plugin renders some thirty
component types. Blind Flange allows three — `table`, `chart`, `plot` — declared in
`plugins/dsh-client-ui-base/lib/genui/permitted-set.js` and enforced by
`plugins/dsh-client-ui-base/test/genui.test.js`, which parses every fence in the authored
replay cache and fails on a type outside the set, on an `action` key anywhere in the tree (the
event loop back into the model, which no demonstrable needs), and on any `href` or `src`.
The same test checks each row's cited region against the OCR capture, so a table row can never
quietly cite a region Story 4.5's crop viewer cannot show.

**What it mounts, verified on 29 August 2026:** the fence renderer (DOM channel — this host
does not ship the `fence-registry` extension point, and the plugin logs
`[genui] client active; fence-channel=dom`), a `conversation.input.dock` seat that renders
nothing until a spec exists, a `tool.call.toolview` entry keyed to its own `render_ui` tool,
and a `/panel` slash command. It also registers two tools, `render_ui` and `validate_dsh_ui`;
neither is network-capable, so Story 1.2's claim is unaffected.

**Checking it worked**, against a running `dsh web`:

```sh
curl -s -o /dev/null -w "%{http_code}
"   "http://127.0.0.1:3080/plugins/@changfenhuang/dsh-genui/client.js"
# -> 200, served from loopback like every other plugin bundle
```

Then ask for the key findings and watch the reply become a table. In the browser console,
`[genui] client active; fence-channel=dom` is the activation proof; a downloaded `client.js`
alone is not.

**One behaviour worth knowing about.** On boot the client adds `<link rel="prefetch">` hints
for two engine bundles it vendors, `mermaid.js` (3.4 MB) and `three.js` (0.7 MB). Both are
served from loopback, so the egress claim is untouched, and neither is ever executed here —
measured: no script element, no `window.__GenuiAssets__` entry, `window.mermaid`,
`window.THREE` and `window.echarts` all `undefined`. `docs/licence-decisions.json` records all
three engines and the DOMPurify copy inside the mermaid bundle.

**Removing just this one:**

```sh
dsh plugin --profile web remove @changfenhuang/dsh-genui
```

The key findings go back to being a code block in the reply; nothing else changes.

## Story 8.2: the @ mention is already in the box

**Nothing was installed for this story, and that is the finding.** `@` in the composer opens a
searchable list of workspace files and folders on a stock `0.1.1-rc.2` harness, before any
Blind Flange row is applied. It is worth writing down because the obvious next move — adopting a
plugin that adds an `@` picker — makes the workbench worse, and someone will try it again.

**What ships it.** Three rows, all from the `dsh-web-app` bundle, none of them ours:

| Row | Package | Half |
|---|---|---|
| `ui-reference` | `@deepseek-ai/dsh-client-ui-reference` | the browser `@` source ("Unified Web @file and @session reference source") |
| `file-reference-local` | `@deepseek-ai/dsh-file-reference-local` | the host-side workspace index behind it |
| `session-reference` | `@deepseek-ai/dsh-session-reference` | the `@session` half of the same menu |

They register through `ctx.inputTriggers.registerSource`, the same pipeline `/` commands use.
`registerSource` rejects a duplicate `(trigger, name)` pair and nothing else — so a second
plugin claiming `@` under a different source name does not collide, it **coexists**, and both
sets of candidates render in one menu. That is what disqualified `dsh-at-file` (Epic 8's
Rejected table).

**What a mention actually does.** It inserts prompt text, not file content. The host adds one
system-prompt section, verbatim:

> Paths prefixed with @ are files explicitly referenced by the user. Use the read tool when their
> contents are needed; do not claim to have inspected a file before reading it.

So a mention is a pointer. What it can reach is bounded by the `read` tool under the session's
sandbox mode (`read-only` | `workspace-write` | `danger-full-access`, owned by
`dsh-sandbox-policy`), not by the mention. Worth knowing before anyone describes this surface to
MRPL as the confidentiality boundary — it is not; the sandbox mode is.

**Confinement of the picker itself**, which *is* enforced there. `resolveDisplayDirectory` in
`dsh-file-reference-local` resolves the typed directory against the workspace root and returns
`undefined` when `relative()` gives `..` or a `..`-prefixed path, when the result is absolute,
and when any segment on the way is a symlink or not a directory. Measured live on a cold clone:
`@../`, `@../../` and `@C:/Windows/` each offer nothing and close the menu; a bare `@`
immediately afterwards reopens with 20 candidates, which is what makes the three refusals
refusals rather than a stuck menu.

**The demo beat.** On a cold `DSH_HOME` the seeded workspace is the repository checkout, so
`@insp` returns `services/ingestion/fixtures/sample-inspection-report.pdf` first, and picking it
lands an inline chip in the draft. Verified in both themes:
`docs/screenshots/story-8-2-mention-picker-{light,dark}.png` and
`story-8-2-mention-chip-{light,dark}.png`.

**The index, and why it was left alone.** `file-reference-local` takes `maxResults` (20),
`maxEntries` (10,000) and `excludedDirectories` (`.git`, `node_modules`) from the patch layer.
Over this checkout the walk indexes 9,609 entries in 262 ms; 8,847 of them are
`services/ingestion/.venv`, which is gitignored and invisible to every bare query because
`visibleForGlobalQuery` drops dot-prefixed segments. Adding `.venv`, `__pycache__` and
`.pytest_cache` to `excludedDirectories` cuts it to 730 entries in 27 ms — and was deliberately
not done. The sample report is entry #496 in breadth-first walk order, nowhere near the cap, and
it already ranks first for `sample`, `inspection` and `report.pdf`. Write the row if the
checkout ever grows past the cap; do not write it for tidiness.

**Two cosmetic gaps on a cold clone's first screen**, found while doing the above and belonging
to Story 1.5 rather than here. Both brand *mark* seats are ours —
`conversation.hero.brand.mark` and `sidebar.brand.mark` carry the Blind Flange glyph — but:

- `sidebar.brand.name` is an unclaimed declared slot and falls back to a
  `fallbackBrandName` span reading "DSH Local Build", plus a build-revision chip.
- The hero headline reads "Into the Unknown" with a "Preview" badge. It is shipped greeting copy
  (`headlineText`), not a brand slot, so taking it needs a different seat than Story 1.5 used.

## Removing it

```sh
dsh plugin --profile web remove @blind-flange/dsh-client-ui-base
```

and delete the insert row. Removal is always a patch-layer edit; nothing under the harness
install is touched, so there is nothing to undo there.
