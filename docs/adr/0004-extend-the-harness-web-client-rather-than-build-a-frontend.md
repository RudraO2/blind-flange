# Extend the DeepSeek Harness web client rather than build our own frontend

ADR-0002 says build the panels before the inference, and the internal round is four days
away with one person building. A frontend good enough that a judge does not discount it on
sight is two to three of those days if written from scratch, which would leave roughly one
day for the five differentiators that are the entire argument.

DeepSeek Harness ships an official web client — `apps/web`, started with `dsh web`, served
at `http://127.0.0.1:3080`. A spike on 27 August 2026 established, by running it and reading
its source rather than trusting documentation:

- **MIT**, read from `LICENSE` at `deepseek-ai/deepseek-harness@master`. Cordis, the
  framework underneath, is MIT too (`cordiverse/cordis@main`).
- **React 18 + Vite** — 252 `.tsx` files in `packages/client`, zero `.vue`. Adopting it
  costs us nothing on the stack decision already recorded in the deck.
- **Zero external egress.** A full page load captured 73 requests; every one went to
  `127.0.0.1:3080` or a `data:` URI. No font CDN, no icon CDN, no telemetry. This clears the
  hazard §14 names as the one most likely to bite us — an outbound font request on the
  projector with the egress monitor open.
- **A typed slot registry** whose declared seats line up with our panels almost one to one:
  `conversation.input.model` for the routing chip, `shell.overlay` and
  `conversation.session.header.utilities` for the egress monitor, `conversation.input.right`
  for the canary, `conversation.view` for provenance crops and the deliverable factory.
- **Out-of-tree UI plugins work.** A three-file package with no bundler
  (`@blind-flange/dsh-client-ui-egress`) took the `shell.overlay` seat and rendered on first
  load, served as
  `/plugins/@blind-flange/dsh-client-ui-egress/client.js` alongside the 47 shipped ones.

So we adopt the harness's web client and contribute our panels as plugins, rather than
writing a frontend or forking `apps/web`.

## Status

accepted — extends ADR-0003, which adopted the harness as the runtime. That ADR left the
frontend open; `HANDOFF.md` recorded "own thin frontend, not Open WebUI" as closed. This
does not reopen that decision's reasoning. That decision rejected **Open WebUI as the
product** because the differentiators do not exist in it. Here the differentiators are still
ours, written by us, mounted as our own plugins in our own runtime's shell — which is
precisely the "everything is a plugin" architecture ADR-0003 adopted.

## Considered alternatives

**React + Vite + shadcn/ui from scratch.** Still the fallback, and the kill criterion if the
harness fights us. Rejected as primary because it spends the scarcest resource — days before
the internal round — rebuilding chat, sessions, streaming, settings, theming and tool-call
rendering that arrive free and already look professional.

**Forking `apps/web`.** Rejected: the spike proved a fork is unnecessary, and a fork would
strand us on a developer preview that says it will break compatibility.

## Consequences

**The dependency is disclosed, loudly and first.** The audience is students and traditional
professors who may read "used an existing repository" as copying. Concealment is what turns
that into a real problem — a judge who discovers an undisclosed foundation has caught us,
while a judge who was told up front sees ordinary engineering. Their brand guidelines
explicitly bless the phrase *"built on DeepSeek Harness"*, MIT requires the copyright notice
be retained, and the pitch already argues permissive licensing as a differentiator. So the
line goes on a slide in our own words, paired with a clear statement of what is ours: the
router, the model plane, the egress monitor and canary, the provenance lane and the
deliverable factory are our code.

**Rebranding is required, and it is trademark law, not MIT.** MIT permits modification and
redistribution freely. The separate brand guidelines forbid "DeepSeek Harness" in a project
*name* and forbid using their brand assets in a way implying endorsement. So the whale mark,
the wordmark, the "Into the Unknown" hero and the tab title must all be replaced. The brand
is itself a plugin (`ui-brand-official`, seat `conversation.hero.brand.mark`), so this is a
swap rather than surgery.

**Rebranding happens after the functionality, not before.** A renamed shell with none of our
panels in it is indistinguishable from a reskin, which is the accusation we are trying to
avoid. Panels first, then the identity pass over a product that already behaves like ours.

**Our panels must look native.** A control that does not match the host's theme reads as
bolted on and undoes the work. Custom components use the shipped primitives and theme tokens
(`@deepseek-ai/dsh-client-ui-primitives`, `ui-theme`) rather than hand-rolled colours, and
must render correctly in both light and dark.

**Two shipped onboarding modals stand between a cold start and the demo.** The Internal
Testing Notice is dismissed by a key in `~/.dsh/settings.yaml`. The second asks for a
DeepSeek cloud API key — the worst possible first impression for an air-gapped pitch — and
must be replaced by onboarding for our own local and replay providers.

**Pin the version.** `@deepseek-ai/dsh` is `0.1.1-rc.2` and its README says in bold that
compatibility-breaking changes will come. The mitigation is unchanged from ADR-0003: build
against our own plugin contracts, keep the harness as one implementation behind them.

**Profile plugins belong in the profile, not in `node_modules`.** The spike dropped its
package straight into `~/.dsh/profiles/node_modules/` as a shortcut. The supported path is a
dependency of `~/.dsh/profiles/web/package.json`, mounted by an insert row in that profile's
`cordis.patch.yml`. Move to it before the repo is real.

**`THIRD_PARTY_NOTICES.md` has not been audited.** The Apache-2.0/MIT-only claim is
client-facing and enforced by `docs/licence-policy.md`; the harness's transitive dependency
licences must be checked before that claim is made to MRPL.
