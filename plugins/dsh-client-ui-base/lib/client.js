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
				return;
			}
			const missing = REQUIRED_JSX_EXPORTS.filter((name) => jsxRuntime?.[name] === undefined);
			if (missing.length > 0) {
				console.error(
					`@blind-flange/dsh-client-ui-base: the host's react/jsx-runtime is missing ${missing.join(", ")} — Blind Flange panels will not render correctly`,
				);
			}
		}

		/**
		 * Client plugin body. Checks the React seam, then takes the
		 * `conversation.hero.brand.mark` slot — `single`, so occupying it
		 * replaces whatever the host registered there (the DeepSeek whale) — and
		 * `sidebar.brand.mark`, the collapsed-rail seat: with
		 * `@deepseek-ai/dsh-client-ui-brand-official` disabled (`cordis.patch.yml`,
		 * `id: ui-brand-official`) nothing else fills it, and ui-layout falls back
		 * to its own built-in whale rather than rendering nothing, so we take it
		 * too rather than leave that fallback showing.
		 *
		 * `sidebar.brand.mark` is not in the verified seat table in
		 * `docs/deepseek-harness-notes.md` — nothing in this repo confirms which
		 * package declares it (its one known filler, `ui-brand-official`, is the
		 * one we've disabled). Confirmed empirically instead, by screenshot
		 * (`docs/screenshots/1-5-brand-mark-*.png`): re-verify by source if a
		 * harness upgrade ever changes ui-layout's rail rendering.
		 * @param ctx - client root context, carrying the `slots` service
		 * declared in `exports.inject` below.
		 */
		function apply(ctx) {
			checkHostReactSeam();
			const disposeSidebarMark = ctx.slots.inject("sidebar.brand.mark", function* () {
				yield ctx.slots.register({ name: "sidebar.brand.mark" }, BlindFlangeMark);
			});
			const disposeHeroMark = ctx.slots.inject("conversation.hero.brand.mark", function* () {
				yield ctx.slots.register({ name: "conversation.hero.brand.mark" }, BlindFlangeMark);
			});
			return () => {
				disposeSidebarMark();
				disposeHeroMark();
			};
		}

		/** Cordis services this plugin needs from the client root context. */
		const inject = ["slots"];

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
