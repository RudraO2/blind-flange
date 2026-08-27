# DeepSeek Harness — verified notes

Everything here was read from source on **27 August 2026**, from a shallow clone at
`C:\Users\rpxi1\src\deepseek-harness` (outside OneDrive, deliberately — the monorepo would
thrash sync). Facts are marked **verified** (read from the repo) or **unverified** (not yet
run on this machine). Do not upgrade an unverified line without checking it yourself.

Upstream: `deepseek-ai/deepseek-harness`, default branch `master`, opened 13 Aug 2026.
Published CLI package: `@deepseek-ai/dsh`, version **0.1.1-rc.2**.

## Licences — verified

Read from the `LICENSE` file at the pinned ref, not from a README or a summary, per
`docs/licence-policy.md`.

| Component | Licence | How verified |
|---|---|---|
| `deepseek-ai/deepseek-harness` | **MIT** (Copyright (c) 2026 DeepSeek) | `LICENSE` at `master`, 27 Aug 2026 |
| `cordiverse/cordis` (framework underneath) | **MIT** (Copyright (c) 2021-present Shigma) | `LICENSE` at `main`, 27 Aug 2026 |
| `@deepseek-ai/dsh` (npm package) | MIT | `license` field in `apps/cli/package.json` |

Both pass the Apache-2.0/MIT-only constraint. `THIRD_PARTY_NOTICES.md` in the repo root
discloses transitive dependency licences and has **not** been audited yet — do that before
the licence claim goes in front of MRPL.

## Branding — verified, and it constrains us

`BRAND_GUIDELINES.md` says, in summary:

- **Do not** put "DeepSeek Harness" in the project *name* — it is a registered trademark.
  "Blind Flange" is unaffected.
- **Do** describe the relationship truthfully: *"built on DeepSeek Harness"* is explicitly
  blessed. Use that line; it is a credibility asset, not a disclosure burden.
- Do not use their logos in a way implying endorsement.
- MIT still requires the copyright notice be retained in the source.

The UI's brand mark is itself a slot (`conversation.hero.brand.mark`) served by a separate
package (`packages/client/ui-brand-official`), so rebranding is a plugin swap, not a fork.

## What it is

An agent harness built on **Cordis**, whose organising claim is *everything is a plugin* —
including the model adapter, tool registry, session log, and the agent loop itself. There is
no privileged core; you extend it by mounting a plugin beside the others, and registrations
are reversible effects that unwind when the plugin unloads.

**Developer preview.** The README says, in bold: *"THERE WILL BE COMPATIBILITY-BREAKING
CHANGES."* Pin the version. This is the standing risk named in ADR-0003.

### Profiles and bundles

A running `dsh` is a plugin tree composed at boot from ordered layers.

- A **profile** is a named composition in the Harness home; `web` and `headless` ship as
  templates. It lists bundles, holds out-of-tree plugins it installs, and keeps the user's
  own `cordis.patch.yml`.
- A **bundle** distributes Cordis config rows plus the code they mount.
- `dsh-base` is the first layer of every profile. `dsh-web-app` adds the browser app.
- Layer order: each bundle in profile order → profile's `cordis.patch.yml` → home-level one
  → any `--patch` overlay. A patch targets a row by id and replaces its config, or inserts
  new rows.

Inspect the real tree with `dsh --profile web --dump-config`. **Out-of-tree plugins are a
first-class concept**, which means Blind Flange's panels may not require a source fork.

## Running it — verified on this laptop, 27 Aug 2026

```sh
npm install -g @deepseek-ai/dsh   # 511 packages, ~2 min
dsh web --no-open                 # serves http://127.0.0.1:3080
```

`npx @deepseek-ai/dsh --help` did **not** complete inside 7 minutes — use the global install
instead. Once installed, `dsh web` starts in seconds and prints one line:
`dsh web: http://127.0.0.1:3080`.

From a checkout: `pnpm install && pnpm run build && pnpm dsh web` (not attempted).

**Engine warning at install:** `@earendil-works/pi-ai@0.82.1` wants Node `>=22.19.0`; this
machine has **v22.15.0**. Install succeeded and the app runs, but upgrade Node before
relying on anything in that provider path.

### Zero external egress — verified with a real capture

A full page load was captured in DevTools: **73 requests, every one to `127.0.0.1:3080`
or a `data:` URI. Zero external.** No font CDN, no icon CDN, no telemetry ping, no
analytics. The favicon, the manifest, the CSS, the vendor bundle and all 47 client plugins
are served from loopback.

A source grep of `packages/client` and `apps/web` agrees: the only absolute URLs are
`www.w3.org` SVG *namespace strings* (not fetches), test fixtures (`example.com`,
`acme.test`), `127.0.0.1`/`localhost`, and `api.deepseek.com` / `deepseek.com` belonging to
the DeepSeek provider adapter and its doc links — none of which fire unless that provider is
configured.

This clears the risk §14 of `blind-flange.html` calls "the one that will actually bite you."
Still to do before the claim is made in front of MRPL: re-run the grep against the **built**
`dist/` bundle, not just source.

### What ships out of the box

Dark theme, collapsible left sidebar (New Session, Workspaces, Settings), a hero with brand
mark and workspace/agent-preset pickers, a composer with attachment and command menus.
It looks professional — better than a solo four-day frontend.

Settings dialog has four tabs — **General** (agent preset, permission mode, language,
Light/Dark/System, enter behaviour), **Models**, **Plugins**, **Agent presets** — plus an
"Open configuration file" button. Plugin management is a first-class UI surface.

**Language:** the General tab has a language selector, and the repo carries `*.i18n.yaml`
plus `.zh` variants throughout. i18n infrastructure exists; Indian languages are not shipped
but the machinery is there.

### Two onboarding modals block the first screen

Both appear on a fresh profile and **both must be dealt with before any demo**:

1. **"Internal Testing Notice"** — a developer-preview disclaimer. Dismissed with *Continue*.
2. **"Add an API key to get started — Configure the official DeepSeek provider."** Dismissed
   with *Configure later*.

The second one is a cloud-provider onboarding prompt, which is exactly the wrong first
impression for an air-gapped pitch. Replacing it with our own local/replay provider
onboarding is a required task, not a nice-to-have.

### The client loads UI plugins over HTTP — out-of-tree UI is supported

The capture shows the client fetching each UI package separately:

```
GET /plugins/@deepseek-ai/dsh-client-ui-layout/client.js?rev=abdb7f55acba
GET /plugins/@deepseek-ai/dsh-client-ui-model-selection/client.js?rev=639da97bfe66
GET /plugins/@deepseek-ai/dsh-client-ui-subagent/client.js?rev=0bb1ff842ae8
GET /plugins/@deepseek-ai/dsh-client-ui-deliverables/client.js?rev=13a78ee19f2e
GET /plugins/@deepseek-ai/dsh-client-ui-brand-official/client.js?rev=c426d52ce216
```

47 of them. The shell is assembled at runtime from plugin bundles served by the host, which
strongly implies our own `@blind-flange/*` client plugin is served the same way — **no fork
of the web app required**. Confirm by actually shipping one before committing.

Server surface: `POST /api/*` (`host.describe`, `settings.describe`, `settings.mutate`,
`llm.providers`, `session.list`, `workspace.list`, `agentPreset.list`, `credentials.describe`,
`dynamicCordisRunner/inventory`) plus `GET /plugins/events` for the event stream.

Note the shipped plugin names that overlap our differentiators almost exactly:
`ui-model-selection`, `ui-subagent`, `ui-deliverables`, `ui-trajectory`, `ui-jobs`,
`ui-workflow-run`, `ui-brand-official`.

## The web client is React — verified

This was the decisive check.

- `apps/web` is a **Vite + React 18** app (`@vitejs/plugin-react`, `@types/react ~18.3.1`).
- `packages/client/` — **252 `.tsx` files, zero `.vue` files**; 35 client packages declare a
  `react` dependency, none declare `vue`.

So adopting the harness UI does **not** cost us the React decision. It is the same stack we
would have chosen, already assembled.

## The slot registry — how our panels get in

`packages/client/ui-slots` is a typed slot registry. One call —
`register({ name, children?, store?, inject?, ... }, Component)` — contributes a React
component into a declared slot, declares its child slots, and declares a store seat.
Registration is validated at load time; a disposer collapses the entry and its children.

Slots are `single` (occupying replaces the incumbent) or `list` (additive), scoped `root`
or `session`.

### Declared seats — verified from source

From `packages/client/ui-layout/src/client/index.ts`:

| Slot | Kind | Scope |
|---|---|---|
| `sidebar` | single | root |
| `details` | single | session |
| `shell.overlay` | list | root |

From `packages/client/ui-conversation/src/client/contract/slots.ts`:

| Slot | Kind | Scope |
|---|---|---|
| `conversation.session` | single | session |
| `conversation.session.header` | single | session |
| `conversation.session.header.actions` | list | session |
| `conversation.session.header.utilities` | list | session |
| `conversation.view` | list | session |
| `conversation.message.images` | single | session |
| `conversation.details.tool` | single | session |
| `conversation.hero.workspace` | single | root |
| `conversation.hero.brand.mark` | single | root |
| `conversation.hero.agentPreset` | single | root |
| `conversation.input.dock` | list | session |
| `conversation.composer.dock` | list | session |
| `conversation.input.left` | list | session |
| `conversation.input.right` | list | session |
| `conversation.input.plan` | single | session |
| `conversation.input.model` | single | session |

Also `conversation.input.overlay` (list, session) from `ui-input-trigger`.

**Do not register into `root`.** The source comment is explicit: `root` is a single slot
occupied by ui-layout's AppFrame, and a dynamically registered entry gets a *lower* priority
than the shipped one, which makes it win — shadowing the frame and destroying every seat
inside it. For an app-wide floating surface use `shell.overlay`.

### Candidate mapping for Blind Flange — proposed, not yet built

| Differentiator | Candidate seat |
|---|---|
| Routing chip / explainer | `conversation.input.model` (single) — replaces the stock model picker |
| Egress monitor | `conversation.session.header.utilities` (list) for the chip; `shell.overlay` for the full panel |
| Canary button | `conversation.input.right` (list) |
| Provenance crops | `conversation.view` (list — a whole tab) or `details` |
| Deliverable factory view | `conversation.view` (list) |
| Rebrand | `conversation.hero.brand.mark` (single) |

## Non-UI extension points — verified from `docs/architecture.md`

| Blind Flange piece | Mechanism |
|---|---|
| Model plane: replay / local / remote (ADR-0001) | `LlmAdapter` subclass via `registerAdapter` on `ctx.llm`; shipped examples `dsh-llm-deepseek`, `dsh-llm-pi-ai` |
| Canary tool, `.docx` render, calc | `ctx.tools.register()` / `defineTool` |
| Egress policy denial | `tools/pre-execute` waterfall returning `{ kind: 'deny' }` |
| Audit log | `session/event` → JSONL; replay via `sessions.create(id, { seed })` |
| Fan-out / sub-agents | `ctx.subagents` provider registry + `dsh-tool-subagent`; experimental Agent Teams on `ctx.agentTeams` |
| Approval gate | return `ask` from `tools/pre-execute`, answer via `ctx.approval` |
| Sandboxed code execution | `ctx.sandbox` backend via `dsh-bash-sandbox` |

Core services: `ctx.sessions`, `ctx.systemPrompt`, `ctx.tools`, `ctx.agents`, `ctx.agentLoop`,
`ctx.llm`.

Turn flow: `turn/start → agent/pre-step → step/start → agent/request → llm/stream →
assistant/chunk* → assistant/message → tool/call* → tools/pre-execute → tools/execute →
tools/post-execute → tool/result* → step/end → agent/turn-stopping → turn/end`.

**Model-visible means logged** — anything reaching a model request must be reconstructable
from the session log, enforced by a runtime invariant. A new model-visible input requires a
new session event (`SessionEventMap`).

## Docs worth reading before building

Inside the clone:

- `docs/architecture.md` — the system and extension-point map
- `docs/cookbook/extension-cookbook.md` — plugin shapes and the feature→mechanism table
- `docs/cookbook/adding-a-tool.md` — source of truth for tool definitions
- `docs/cookbook/adding-an-llm-adapter.md` — the replay provider path
- `docs/cookbook/adding-a-conversation-node.md` — chat rows
- `docs/cookbook/adding-a-settings-card.md`
- `docs/cookbook/adding-a-package.md`
- `docs/cordis-primer.md`, `docs/cordis-tutorial/` — Cordis itself
- `packages/client/ui-slots/README.md` — the slot registry contract

## Out-of-tree UI plugin — PROVEN, 27 Aug 2026

A working plugin was built and rendered. **No fork, no source build, no toolchain.**

Source kept at `C:\Users\rpxi1\src\bf-plugins\ui-egress` (three files, hand-written):

```
package.json      name @blind-flange/dsh-client-ui-egress, type module,
                  exports "." -> lib/index.js and "./client" -> lib/client.js,
                  and the mounting field:
                    "dsh": { "client": { "inject": ["@deepseek-ai/dsh-client-runtime"],
                                         "platform": "web" } }
lib/index.js      host half: `export function apply() {}`
lib/client.js     browser half, written directly in the loader's bundle format
```

The browser half needs **no bundler**. The shipped format is plain:

```js
window.__ModuleLoader__.load({
  id: "@blind-flange/dsh-client-ui-egress",
  factory: (require) => {
    var module = { exports: {} }; var exports = module.exports
    let jsxr = require("react/jsx-runtime")     // React comes from the host
    function EgressMonitor() { /* jsxr.jsx(...) */ }
    exports.inject = ["slots"]
    exports.apply = (ctx) => {
      ctx.slots.inject("shell.overlay", () => {
        const dispose = ctx.slots.register(
          { name: "shell.overlay", id: "bf-egress-monitor", order: 10 }, EgressMonitor)
        return () => dispose()
      })
    }
    return module.exports
  },
})
```

`require()` inside the factory resolves `react/jsx-runtime` and any
`@deepseek-ai/dsh-client-*` package from the host — so a plugin ships no React of its own.
Writing JSX by hand as `jsx(tag, { style, children })` works fine; add tsdown later only if
the ergonomics start to hurt.

### Installing one

1. Put the package at `~/.dsh/profiles/node_modules/<scope>/<name>/`.
2. Add an insert row to `~/.dsh/profiles/web/cordis.patch.yml`:

```yaml
- insert:
    - id: bf-egress-monitor
      name: '@blind-flange/dsh-client-ui-egress'
```

3. Restart `dsh web`.

Dropping it into `node_modules` directly is a **spike shortcut**. The supported path is a
dependency in `~/.dsh/profiles/web/package.json` (the profile is its own pnpm workspace,
`nodeLinker: hoisted`) — switch to that before this is a real repo.

### Result

The overlay rendered bottom-right on first load, styled, and the capture shows it served
like any first-party plugin:

```
GET http://127.0.0.1:3080/plugins/@blind-flange/dsh-client-ui-egress/client.js?rev=313284372e0f [200]
```

Loopback, revision-hashed, sitting among the 47 shipped plugins. **Extend, do not fork.**

## Suppressing the onboarding modals

`~/.dsh/settings.yaml` records the dismissal:

```yaml
ui-onboarding:
  welcomeNoticeVersion: 2026-08-13.1
ui-theme:
  preference: light
```

The Internal Testing Notice stays dismissed once that key is set — ship the file with the
profile. The **API-key modal still reappears on reload** and has not been suppressed yet;
it is driven by there being no configured provider, so registering our own local/replay
provider is likely to remove it as a side effect. Verify, don't assume.

## Open questions

Closed by the 27 Aug spike: it installs and runs; the UI is good enough to demo; the
frontend makes zero external calls; an out-of-tree UI plugin works. Still open:

1. How steep is Cordis for the *harder* extension points? The slot registration was easy.
   The `LlmAdapter` (replay provider), the tool registry and the subagent seam are not yet
   attempted, and `ui-slots/README.md` is dense with type-level machinery (four-share props,
   store seats, chain-kind slots, declaration epochs).
2. Suppressing or replacing the API-key modal — see above.
3. Re-run the external-URL grep against the built `dist/` bundle, not just source.
4. `THIRD_PARTY_NOTICES.md` licence audit — not started. Required before the Apache/MIT-only
   claim is made to MRPL.
5. Node is v22.15.0; `pi-ai` wants >=22.19.0. Upgrade before trusting that provider path.
6. Move the plugin from `node_modules` to a profile dependency.
