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
function loadClientHalf(hostRequire) {
	const errors = [];
	let registered;
	const context = {
		console: { error: (...args) => errors.push(args.map(String).join(" ")) },
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
	return { id: registered.id, exports, errors };
}

/** A host React seam with everything a panel needs. `jsx` returns an inspectable plain object. */
const healthyJsxRuntime = {
	jsx: (type, props) => ({ type, props }),
	jsxs: (type, props) => ({ type, props }),
	Fragment: Symbol("Fragment"),
};

/**
 * A stub `ctx` shaped like the client root context: `slots.inject` runs its
 * generator immediately (no real dependency wait, since this test only checks
 * what got registered) and `slots.register` records the call.
 */
function stubSlotsCtx() {
	const registered = [];
	return {
		registered,
		ctx: {
			slots: {
				inject: (name, generator) => {
					for (const call of generator()) registered.push(call);
				},
				register: (options, Component) => ({ options, Component }),
			},
		},
	};
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
	const { exports, errors } = loadClientHalf((specifier) => {
		assert.equal(specifier, "react/jsx-runtime");
		return healthyJsxRuntime;
	});
	exports.apply(stubSlotsCtx().ctx);
	assert.deepEqual(errors, []);
});

test("names the package and the module when the host cannot resolve react/jsx-runtime", () => {
	const { exports, errors } = loadClientHalf(() => {
		throw new Error("missed the module table");
	});
	exports.apply(stubSlotsCtx().ctx);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /@blind-flange\/dsh-client-ui-base/);
	assert.match(errors[0], /react\/jsx-runtime/);
});

test("names every missing export when the host's react/jsx-runtime is incomplete", () => {
	const { exports, errors } = loadClientHalf(() => ({ jsx: () => {} }));
	exports.apply(stubSlotsCtx().ctx);
	assert.equal(errors.length, 1);
	assert.match(errors[0], /jsxs/);
	assert.match(errors[0], /Fragment/);
});

test("occupies both places the DeepSeek whale used to render: the hero and the sidebar rail", () => {
	const { exports } = loadClientHalf(() => healthyJsxRuntime);
	const { ctx, registered } = stubSlotsCtx();
	exports.apply(ctx);
	const names = registered.map((call) => call.options.name).sort();
	assert.deepEqual(names, ["conversation.hero.brand.mark", "sidebar.brand.mark"]);
});

test("the registered mark renders an svg path with fill=currentColor, not a hand-rolled hex", () => {
	const { exports } = loadClientHalf((specifier) => (specifier === "react/jsx-runtime" ? healthyJsxRuntime : undefined));
	const { ctx, registered } = stubSlotsCtx();
	exports.apply(ctx);
	const hero = registered.find((call) => call.options.name === "conversation.hero.brand.mark");
	const svg = hero.Component({ size: 20, className: "hero-mark" });
	assert.equal(svg.type, "svg");
	assert.equal(svg.props.width, 20);
	assert.equal(svg.props.className, "hero-mark");
	assert.equal(svg.props.children.type, "path");
	assert.equal(svg.props.children.props.fill, "currentColor");
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
