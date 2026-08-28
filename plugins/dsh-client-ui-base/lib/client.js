/**
 * Blind Flange base plugin, browser half.
 *
 * Written directly in the host loader's module format, so this package ships no
 * React and needs no bundler: `require` inside the factory resolves
 * `react/jsx-runtime` and every `@deepseek-ai/dsh-client-*` package from the
 * host at load time.
 *
 * Deliberately not an ES module, despite `"type": "module"` in the manifest.
 * The host serves this file as a raw bundle to the browser's module loader and
 * never `import`s it, so it is written as the loader's own format — a top-level
 * `window.__ModuleLoader__.load(...)` call with a CommonJS-shaped factory. Only
 * `exports["./client"]` points here, and only the host reads that.
 *
 * Story 1.1 mounted the seam and took no slot. Story 1.5 is the first
 * occupant: the Blind Flange mark in `conversation.hero.brand.mark` and
 * `sidebar.brand.mark`, the two places the DeepSeek whale used to render (see
 * `apply` below for why both, not just the one AC1 names). What Story 1.1 did
 * do is check that the host supplied the React seam every later panel depends
 * on, so a broken seam is reported here, by package name, instead of
 * surfacing as an obscure failure inside the routing chip or the egress
 * monitor — kept as-is below.
 *
 * Story 1.4 takes this package's first slot: `conversation.hero.agentPreset`.
 * The host's own agent-preset roster always includes its four shipped presets
 * (`standard`/`code`/`minimal`/`cordis`) alongside ours — `dsh-agent-presets`
 * hard-codes its shipped root into every deployment's resolved config, so a
 * profile patch cannot remove them (verified against a running `dsh web`,
 * 28 Aug 2026: `agentPreset.list` names all four no matter what this profile's
 * `cordis.patch.yml` configures). This component is a task-type picker rather
 * than a wrapper around the host's own hero chip: it reads the same roster
 * over the same host RPCs and shows only the presets Blind Flange authored
 * (`trust: 'user'`), so "Standard mode" and its shipped siblings never appear
 * here even though the host still lists them elsewhere (Settings > Agent
 * presets, unavoidably, for the same reason). Picking one sets the deployment
 * default via `settings.update`, the same write the host's own Settings row
 * makes — a real host mutation, not a local-only toggle.
 */
window.__ModuleLoader__.load({
	id: "@blind-flange/dsh-client-ui-base",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		/** Everything a Blind Flange panel needs from the host's React. */
		const REQUIRED_JSX_EXPORTS = ["jsx", "jsxs", "Fragment"];

		/**
		 * A bolted-shut pipe flange, six holes around a solid plate — the
		 * metaphor the project is named for. `fill="currentColor"` so it
		 * inherits the hero's own text colour rather than a hard-rolled hex,
		 * which is what makes it correct in both themes without a media query.
		 */
		const FLANGE_PATH_D =
			"M 1.5,12 A 10.5,10.5 0 1,0 22.5,12 A 10.5,10.5 0 1,0 1.5,12 Z" +
			"M 10.6,4.5 A 1.4,1.4 0 1,0 13.4,4.5 A 1.4,1.4 0 1,0 10.6,4.5 Z" +
			"M 17.1,8.25 A 1.4,1.4 0 1,0 19.9,8.25 A 1.4,1.4 0 1,0 17.1,8.25 Z" +
			"M 17.1,15.75 A 1.4,1.4 0 1,0 19.9,15.75 A 1.4,1.4 0 1,0 17.1,15.75 Z" +
			"M 10.6,19.5 A 1.4,1.4 0 1,0 13.4,19.5 A 1.4,1.4 0 1,0 10.6,19.5 Z" +
			"M 4.1,15.75 A 1.4,1.4 0 1,0 6.9,15.75 A 1.4,1.4 0 1,0 4.1,15.75 Z" +
			"M 4.1,8.25 A 1.4,1.4 0 1,0 6.9,8.25 A 1.4,1.4 0 1,0 4.1,8.25 Z";

		/**
		 * The Blind Flange mark. Same `size`/`className` shape the host's own
		 * `OfficialBrandMark` takes, since `conversation.hero.brand.mark` is a
		 * `single` slot and this occupies it outright.
		 */
		function BlindFlangeMark({ size, className }) {
			let jsxRuntime;
			try {
				jsxRuntime = require("react/jsx-runtime");
			} catch {
				return null;
			}
			if (typeof jsxRuntime?.jsx !== "function") return null;
			return jsxRuntime.jsx("svg", {
				xmlns: "http://www.w3.org/2000/svg",
				viewBox: "0 0 24 24",
				width: size,
				height: size,
				className,
				"aria-hidden": true,
				focusable: "false",
				children: jsxRuntime.jsx("path", { d: FLANGE_PATH_D, fill: "currentColor", fillRule: "evenodd" }),
			});
		}

		/**
		 * Report anything missing from the host's React seam. Resolution happens
		 * here rather than at factory scope so that an unresolvable module is
		 * reported by name instead of throwing before this check can run.
		 * @returns whether the seam is usable.
		 */
		function checkHostReactSeam() {
			let jsxRuntime;
			try {
				jsxRuntime = require("react/jsx-runtime");
			} catch (error) {
				console.error(
					"@blind-flange/dsh-client-ui-base: the host did not supply react/jsx-runtime — no Blind Flange panel can render",
					error,
				);
				return false;
			}
			const missing = REQUIRED_JSX_EXPORTS.filter((name) => jsxRuntime?.[name] === undefined);
			if (missing.length > 0) {
				console.error(
					`@blind-flange/dsh-client-ui-base: the host's react/jsx-runtime is missing ${missing.join(", ")} — Blind Flange panels will not render correctly`,
				);
				return false;
			}
			return true;
		}

		/** The settings namespace `dsh-agent-presets` reads its `default` field from. */
		const AGENT_PRESET_SETTINGS_NS = "agent-presets";

		let rpcCounter = 0;

		/**
		 * Call one host RPC method over the same wire the client SDK uses, without
		 * requiring this bundler-free package to ship a copy of that SDK.
		 * @param method - dotted RPC method name, e.g. "agentPreset.list".
		 * @param payload - the method's request payload.
		 * @returns the envelope's `result` — `{ ok: true, value }` or `{ ok: false, error }`.
		 */
		function callApi(method, payload) {
			rpcCounter += 1;
			const rpcId = `bf-${Date.now().toString(36)}-${String(rpcCounter)}`;
			return fetch(`/api/${method}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
			})
				.then((response) => response.json())
				.then((body) => body.result)
				.catch((error) => ({ ok: false, error: { message: String(error) } }));
		}

		/**
		 * Build the hero task-type picker component. Built inside a function
		 * (rather than at module scope) so every host module it needs is resolved
		 * once, at mount time, alongside the React seam check.
		 * @returns the component.
		 */
		function buildAgentPresetPicker() {
			const { useEffect, useState } = require("react");
			const { jsx, jsxs, Fragment } = require("react/jsx-runtime");
			const { Button, Menu, IconAgentPresetOutline16, IconChevronDownOutline14 } = require(
				"@deepseek-ai/dsh-client-ui-primitives",
			);

			const INITIAL = { status: "loading", options: [], current: "", open: false, busy: false, error: null };

			/**
			 * The new-session task-type chip: Blind Flange's own agent presets only.
			 * @returns the chip, or null while loading or once the deployment
			 * authors no Blind Flange preset.
			 */
			function AgentPresetPicker() {
				const [state, setState] = useState(INITIAL);

				useEffect(() => {
					let cancelled = false;
					callApi("agentPreset.list", {}).then((result) => {
						if (cancelled) return;
						if (!result.ok) {
							setState((s) => ({ ...s, status: "error", error: result.error?.message ?? "failed to load task types" }));
							return;
						}
						const options = result.value.presets.filter(
							(preset) => preset.trust === "user" && preset.broken === undefined,
						);
						const current = result.value.presets.find((preset) => preset.isDefault)?.id ?? options[0]?.id ?? "";
						setState((s) => ({ ...s, status: "ready", options, current, error: null }));
					});
					return () => {
						cancelled = true;
					};
				}, []);

				if (state.status !== "ready" || state.options.length === 0) return null;

				/**
				 * Persist a picked task type as the deployment default. Running
				 * sessions keep the preset they started on; this only changes what
				 * the NEXT new session gets.
				 * @param id - the preset id chosen.
				 */
				function select(id) {
					if (state.busy || id === state.current) {
						setState((s) => ({ ...s, open: false }));
						return;
					}
					setState((s) => ({ ...s, busy: true, open: false }));
					callApi("settings.update", { ns: AGENT_PRESET_SETTINGS_NS, patch: { default: id } }).then((result) => {
						if (!result.ok) {
							setState((s) => ({ ...s, busy: false, error: result.error?.message ?? "failed to set task type" }));
							return;
						}
						setState((s) => ({ ...s, busy: false, current: id, error: null }));
					});
				}

				const chosen = state.options.find((option) => option.id === state.current);
				const label = chosen?.name ?? state.current;

				return jsx(Menu, {
					open: state.open,
					onClose: () => { setState((s) => ({ ...s, open: false })); },
					items: state.options.map((option) => ({
						id: option.id,
						// Two block-level rows, stacked by default document flow — no
						// hand-rolled flex/gap styling for what plain block stacking
						// already gives for free.
						label: jsxs(Fragment, {
							children: [
								jsx("div", { children: option.name ?? option.id }),
								jsx("div", { children: option.description ?? "" }),
							],
						}),
					})),
					selectedId: state.current,
					onSelect: select,
					align: "start",
					portal: true,
					anchor: jsxs(Button, {
						variant: "ghost",
						size: "sm",
						icon: jsx(IconAgentPresetOutline16, {}),
						title: state.error ?? "Blind Flange task type",
						disabled: state.busy,
						onClick: () => { setState((s) => ({ ...s, open: !s.open })); },
						children: [label, jsx(IconChevronDownOutline14, {})],
					}),
				});
			}

			return AgentPresetPicker;
		}

		/**
		 * Client plugin body. Checks the React seam, then takes three seats.
		 *
		 * Story 1.5's mark goes into `conversation.hero.brand.mark` — `single`,
		 * so occupying it replaces whatever the host registered there (the
		 * DeepSeek whale) — and `sidebar.brand.mark`, the collapsed-rail seat:
		 * with `@deepseek-ai/dsh-client-ui-brand-official` disabled
		 * (`cordis.patch.yml`, `id: ui-brand-official`) nothing else fills it,
		 * and ui-layout falls back to its own built-in whale rather than
		 * rendering nothing, so we take it too rather than leave that fallback
		 * showing.
		 *
		 * `sidebar.brand.mark` is not in the verified seat table in
		 * `docs/deepseek-harness-notes.md` — nothing in this repo confirms which
		 * package declares it (its one known filler, `ui-brand-official`, is the
		 * one we've disabled). Confirmed empirically instead, by screenshot
		 * (`docs/screenshots/1-5-brand-mark-*.png`): re-verify by source if a
		 * harness upgrade ever changes ui-layout's rail rendering.
		 *
		 * Story 1.4's task-type picker goes into `conversation.hero.agentPreset`,
		 * replacing the host's own chip for this deployment.
		 *
		 * A broken React seam aborts all three: every one of them renders
		 * through the host's `react/jsx-runtime`, so registering into a slot
		 * without it would trade one loud console error for three obscure
		 * render failures.
		 * @param ctx - client root context, carrying the `slots` service
		 * declared in `inject` below.
		 */
		function apply(ctx) {
			if (!checkHostReactSeam()) return;
			const AgentPresetPicker = buildAgentPresetPicker();
			const disposeSidebarMark = ctx.slots.inject("sidebar.brand.mark", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, BlindFlangeMark);
			});
			const disposeHeroMark = ctx.slots.inject("conversation.hero.brand.mark", function* () {
				yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, BlindFlangeMark);
			});
			// `conversation.hero.agentPreset` is a child slot the hero declares once
			// it renders, not a standing seam: registering before that declaration
			// exists fails loud ("slot ... is not declared"). `ctx.slots.inject`
			// defers the register/dispose pair until the parent has declared it.
			const disposePresetPicker = ctx.slots.inject("conversation.hero.agentPreset", () => {
				const dispose = ctx.slots.register(
					{ name: "conversation.hero.agentPreset", id: "bf-agent-preset-picker" },
					AgentPresetPicker,
				);
				return () => { dispose(); };
			});
			return () => {
				disposeSidebarMark();
				disposeHeroMark();
				disposePresetPicker?.();
			};
		}

		/** Cordis services this plugin needs from the client root context. */
		const inject = ["slots"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
