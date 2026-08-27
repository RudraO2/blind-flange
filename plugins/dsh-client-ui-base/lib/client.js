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
 * This story mounts the seam and nothing else — no slot is taken and no
 * component is registered. What it does do is check that the host supplied the
 * React seam every later panel depends on, so a broken seam is reported here,
 * by package name, instead of surfacing as an obscure failure inside the
 * routing chip or the egress monitor.
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
		 * Client plugin body. Registers nothing yet; later stories take their
		 * declared slots from here.
		 */
		function apply() {
			checkHostReactSeam();
		}

		exports.apply = apply;
		return module.exports;
	},
});
