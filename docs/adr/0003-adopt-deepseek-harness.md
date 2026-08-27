# Adopt DeepSeek Harness as the agent runtime

Blind Flange needs an agent runtime whose model adapter, tool registry and agent loop are
all replaceable, because the model plane is pluggable by ADR-0001 and the whole pitch rests
on the fleet being swappable configuration rather than code. DeepSeek Harness is built on
exactly that principle — everything is a plugin — and it is MIT, verified by reading
`LICENSE` in `deepseek-ai/deepseek-harness` on 27 August 2026 rather than trusting a
summary. So we adopt it as the runtime, not merely its plugin pattern.

## Status

accepted — supersedes the position recorded in `HANDOFF.md` that the runtime decision was
gated to October 2026. §17 Phase 3 lists a "harness gate: evaluate DeepSeek Harness against
your own plugin contracts and decide adopt-or-own". That gate is closed early, by decision,
because the internal round needs the plugin architecture visible now.

## Considered alternatives

Writing our own agent loop against our own seven plugin contracts. Still the fallback, and
§19 already names it as the cut line: identical contracts, identical pitch. Rejected as the
primary because it spends the scarcest resource — days before the internal round — on
scaffolding a permissively-licensed runtime already provides.

## Consequences

**It is a developer preview, open-sourced 13 August 2026.** Two weeks old at adoption. It
will change under us. The mitigation stands unchanged from §19: build against our own plugin
contracts, with the harness as one implementation behind them, so the fallback to our own
loop stays a swap rather than a rewrite. Pin the version.

**It is Node.js, and the ML stack is Python.** §19 names this risk directly: a two-language
mess. The boundary is therefore hard and non-negotiable — the harness orchestrates, Python
services do all machine learning behind local HTTP, and no objects cross the line. The cut
line if it goes wrong is a single-language Python loop.

**The plugin tree is a demo asset, not just an architecture.** Sub-agents spawning as visible
plugins is the thing a chat box cannot show, which is what ADR-0002 says wins this round.
