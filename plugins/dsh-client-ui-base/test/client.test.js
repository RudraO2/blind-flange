/**
 * Tests for the base plugin's browser half.
 *
 * The browser half is written in the host loader's format rather than as an ES
 * module, so it cannot be imported. It is evaluated here in a `vm` context with
 * a stubbed `window.__ModuleLoader__`, which captures the factory and lets both
 * arms of the React-seam check run against a stubbed host `require`.
 *
 * Uses `node:test` and `node:assert` only. This package has no dependencies and
 * is not going to acquire a test framework.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const repoRoot = dirname(dirname(packageDir));
const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

/**
 * Evaluate the browser half and return what it registered with the loader,
 * along with everything it wrote to `console.error`.
 * @param hostRequire - stands in for the host's module table.
 */
function loadClientHalf(hostRequire, { initialTitle = "DeepSeek Harness" } = {}) {
	const errors = [];
	const warnings = [];
	let registered;
	// A `<title>` stand-in the tab-title observer can watch. MutationObserver is
	// deliberately absent unless a test supplies one, so the warning arm is the default.
	const titleElement = { nodeName: "TITLE" };
	const document = {
		title: initialTitle,
		querySelector: (selector) => (selector === "title" ? titleElement : null),
	};
	const context = {
		document,
		console: {
			error: (...args) => errors.push(args.map(String).join(" ")),
			warn: (...args) => warnings.push(args.map(String).join(" ")),
		},
		window: {
			__ModuleLoader__: {
				load: (entry) => {
					registered = entry;
				},
			},
		},
	};
	vm.runInNewContext(readFileSync(join(packageDir, "lib", "client.js"), "utf8"), context, {
		filename: "client.js",
	});
	assert.ok(registered, "the browser half registered nothing with the loader");
	const exports = registered.factory(hostRequire);
	return { id: registered.id, exports, errors, warnings, document };
}

/** A host React seam with everything a panel needs. `jsx` returns an inspectable plain object. */
const healthyJsxRuntime = {
	jsx: (type, props) => ({ type, props }),
	jsxs: (type, props) => ({ type, props }),
	Fragment: Symbol("Fragment"),
};

/** Every module `buildAgentPresetPicker` resolves, once the React seam is healthy. */
const healthyHostModules = {
	"react/jsx-runtime": healthyJsxRuntime,
	react: { useEffect: () => {}, useState: (initial) => [initial, () => {}] },
	"@deepseek-ai/dsh-client-ui-primitives": {
		IconAgentPresetOutline16: () => {},
	},
};

/**
 * A stub `ctx.slots` recording every `inject` name and every `register` call.
 *
 * `slots.inject` takes either a generator that yields its register calls
 * (Story 1.5's brand marks) or a plain factory that returns a dispose
 * (Story 1.4's task-type picker). Both shapes are in `apply`, so the stub
 * drains a generator and passes a plain return through.
 */
function stubSlots() {
	const injectedNames = [];
	const registered = [];
	const slots = {
		inject: (name, factory) => {
			injectedNames.push(name);
			const result = factory();
			if (result && typeof result[Symbol.iterator] === "function") {
				for (const _ of result);
				return () => {};
			}
			return typeof result === "function" ? result : () => {};
		},
		register: (options, component) => {
			registered.push({ options, component });
			return () => {};
		},
	};
	return { ctx: { slots }, injectedNames, registered };
}

test("registers under the package name so the served bundle and the manifest agree", () => {
	const { id } = loadClientHalf(() => healthyJsxRuntime);
	assert.equal(id, manifest.name);
});

test("declares the slots service so the host supplies ctx.slots to apply", () => {
	const { exports } = loadClientHalf(() => healthyJsxRuntime);
	assert.deepEqual(Array.from(exports.inject), ["slots"]);
});

test("says nothing when the host supplies a complete react/jsx-runtime", () => {
	const { exports, errors } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	exports.apply(stubSlots().ctx);
	assert.deepEqual(errors, []);
});

test("names the package and the module when the host cannot resolve react/jsx-runtime", () => {
	const { exports, errors } = loadClientHalf(() => {
		throw new Error("missed the module table");
	});
	exports.apply(stubSlots().ctx);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /@blind-flange\/dsh-client-ui-base/);
	assert.match(errors[0], /react\/jsx-runtime/);
});

test("names every missing export when the host's react/jsx-runtime is incomplete", () => {
	const { exports, errors } = loadClientHalf(() => ({ jsx: () => {} }));
	exports.apply(stubSlots().ctx);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /jsxs/);
	assert.match(errors[0], /Fragment/);
});

test("occupies both places the DeepSeek whale used to render, and the hero's task-type seat", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const names = registered.map((call) => call.options.name).sort();
	assert.deepEqual(names, [
		"conversation.hero.agentPreset",
		"conversation.hero.brand.mark",
		"sidebar.brand.mark",
	]);
});

test("the registered mark renders an svg path with fill=currentColor, not a hand-rolled hex", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const hero = registered.find((call) => call.options.name === "conversation.hero.brand.mark");
	const svg = hero.component({ size: 20, className: "hero-mark" });
	assert.equal(svg.type, "svg");
	assert.equal(svg.props.width, 20);
	assert.equal(svg.props.className, "hero-mark");
	assert.equal(svg.props.children.type, "path");
	assert.equal(svg.props.children.props.fill, "currentColor");
});

test("registers the task-type indicator into conversation.hero.agentPreset once the slot is declared", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, injectedNames, registered } = stubSlots();
	exports.apply(ctx);
	assert.ok(injectedNames.includes("conversation.hero.agentPreset"));
	const indicator = registered.find((call) => call.options.name === "conversation.hero.agentPreset");
	assert.equal(indicator.options.id, "bf-task-type-indicator");
	assert.equal(typeof indicator.component, "function");
});

test("the hero seat holds an indicator, not a control the operator can operate", () => {
	// SIH26117 requires the system to pick the task type automatically. A dropdown here
	// is the human doing the router's job, and it collides with Story 3.7's routing chip.
	// This asserts against the source: the component must not reach for a Menu, and must
	// not write the deployment default back.
	const source = readFileSync(join(packageDir, "lib", "client.js"), "utf8");
	assert.doesNotMatch(source, /Menu/, "the hero seat must not render a Menu");
	assert.doesNotMatch(source, /settings\.update/, "the hero seat must not set the task type");
	assert.doesNotMatch(source, /onSelect|onClick/, "the hero seat must not be interactive");
});

test("puts the tab title back when the harness rewrites it after hydration", () => {
	// dsh-client-ui-renderer renders DocumentTitle with a hard-coded productTitle and
	// sets document.title from a useEffect, so the host-side tapIndex swap loses to
	// hydration. There is no row to disable and no config key.
	const { exports, document } = loadClientHalf((specifier) => healthyHostModules[specifier], {
		initialTitle: "DeepSeek Harness",
	});
	exports.apply(stubSlots().ctx);
	assert.equal(document.title, "Blind Flange");
});

test("keeps the session title and replaces only the product half", () => {
	const { exports, document } = loadClientHalf((specifier) => healthyHostModules[specifier], {
		initialTitle: "Inspection report — DeepSeek Harness",
	});
	exports.apply(stubSlots().ctx);
	assert.equal(document.title, "Inspection report — Blind Flange");
});

test("warns rather than failing silently when there is no MutationObserver to watch with", () => {
	const { exports, warnings } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	exports.apply(stubSlots().ctx);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /MutationObserver/);
	assert.match(warnings[0], /@blind-flange\/dsh-client-ui-base/);
});

test("registers nothing when the host's react seam is broken", () => {
	const { exports } = loadClientHalf(() => {
		throw new Error("missed the module table");
	});
	const { ctx, injectedNames, registered } = stubSlots();
	exports.apply(ctx);
	assert.deepEqual(injectedNames, []);
	assert.deepEqual(registered, []);
});

test("the install document names the package and the insert row it tells you to add", () => {
	const doc = readFileSync(join(repoRoot, "docs", "profile-install.md"), "utf8");
	assert.ok(
		doc.includes(manifest.name),
		`docs/profile-install.md does not name ${manifest.name} — the install steps have drifted from the package`,
	);
	assert.ok(
		doc.includes("id: bf-base"),
		"docs/profile-install.md does not carry the insert row that mounts this package",
	);
});

test("the harness version recorded here matches the harness actually installed", (t) => {
	let installed;
	try {
		const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).trim();
		installed = JSON.parse(
			readFileSync(join(globalRoot, "@deepseek-ai", "dsh", "package.json"), "utf8"),
		).version;
	} catch {
		t.skip("no global @deepseek-ai/dsh on this machine");
		return;
	}
	assert.equal(
		installed,
		manifest.blindFlange.harnessVersion,
		"the installed harness has drifted from the pinned version this plugin was written against",
	);
});
