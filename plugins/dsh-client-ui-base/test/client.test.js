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

/**
 * Every module the slot builders resolve, once the React seam is healthy.
 * `react.useState` echoes its initial value, so a component reads as
 * "still loading" unless a test overrides `useState` to seat a value.
 */
const healthyHostModules = {
	"react/jsx-runtime": healthyJsxRuntime,
	react: {
		useEffect: () => {},
		useState: (initial) => [initial, () => {}],
		useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
	},
	"@deepseek-ai/dsh-client-ui-primitives": {
		IconAgentPresetOutline16: () => {},
		Pill: (props) => ({ type: "Pill", props }),
		StateDot: (props) => ({ type: "StateDot", props }),
		Menu: (props) => ({ type: "Menu", props }),
	},
};

/**
 * A `ctx.sessions` stub whose one session exposes a `bf-routing` conversation
 * view snapshot carrying `decision` (or no decision when `decision` is null).
 */
function stubSessions(decision) {
	const session = {
		subscribe: () => () => {},
		getSnapshot: () => ({
			views: {
				get: (target) =>
					target === "bf-routing" ? { decision: decision ?? null } : undefined,
			},
		}),
	};
	return { binding: () => ({ session }) };
}

/** A routing decision shaped like the host's `router/routed` event data. */
const ROUTING_DECISION_FIXTURE = {
	taskType: "drawing",
	tied: false,
	allZero: false,
	selected: "Qwen/Qwen2.5-VL-7B-Instruct",
	scored: [
		{
			name: "Qwen/Qwen2.5-VL-7B-Instruct",
			score: 5,
			matched: [
				{ capability: "drawing-understanding", points: 3 },
				{ capability: "visual-grounding", points: 2 },
			],
		},
	],
	excluded: [
		{
			name: "Qwen/Qwen2.5-7B-Instruct",
			reason: {
				code: "modality-missing",
				detail:
					'task type "drawing" needs a member that accepts image input; "Qwen/Qwen2.5-7B-Instruct" declares modalities [text]',
			},
		},
	],
};

/** Turn 1: a document task routes to the vision-document member. */
const TURN_1_DECISION = {
	taskType: "document",
	tied: false,
	allZero: false,
	selected: "Qwen/Qwen2.5-VL-7B-Instruct",
	scored: [
		{ name: "Qwen/Qwen2.5-VL-7B-Instruct", score: 4, matched: [{ capability: "document-understanding", points: 3 }] },
		{ name: "Qwen/Qwen2.5-7B-Instruct", score: 2, matched: [{ capability: "general-reasoning", points: 1 }] },
	],
	excluded: [],
};

/** Turn 2, same session: a coding task routes to the coder member — no user action between. */
const TURN_2_DECISION = {
	taskType: "code",
	tied: false,
	allZero: false,
	selected: "Qwen/Qwen2.5-Coder-7B-Instruct",
	scored: [
		{ name: "Qwen/Qwen2.5-Coder-7B-Instruct", score: 6, matched: [{ capability: "code-generation", points: 3 }, { capability: "code-reasoning", points: 2 }] },
		{ name: "Qwen/Qwen2.5-7B-Instruct", score: 1, matched: [{ capability: "general-reasoning", points: 1 }] },
	],
	excluded: [],
};

/** Host modules with `useState` forced to seat `seated` on its first call, then echo. */
function hostModulesWithSeatedState(seated) {
	let first = true;
	return (specifier) => {
		if (specifier === "react") {
			return {
				useEffect: () => {},
				useState: (initial) => {
					if (first) {
						first = false;
						return [seated, () => {}];
					}
					return [initial, () => {}];
				},
			};
		}
		return healthyHostModules[specifier];
	};
}

/**
 * A stub `ctx.slots` recording every `inject` name and every `register` call.
 *
 * `slots.inject` takes either a generator that yields its register calls
 * (Story 1.5's brand marks) or a plain factory that returns a dispose
 * (Story 1.4's task-type picker). Both shapes are in `apply`, so the stub
 * drains a generator and passes a plain return through.
 */
function stubSlots({ sessions } = {}) {
	const injectedNames = [];
	const registered = [];
	const conversationViews = [];
	const conversationEvents = [];
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
	const ctx = {
		slots,
		conversationViews: {
			register: (definition) => {
				conversationViews.push(definition);
				return () => {};
			},
		},
		conversationEvents: {
			register: (definition) => {
				conversationEvents.push(definition);
				return () => {};
			},
		},
		sessions: sessions ?? { binding: () => undefined },
	};
	return { ctx, injectedNames, registered, conversationViews, conversationEvents };
}

test("registers under the package name so the served bundle and the manifest agree", () => {
	const { id } = loadClientHalf(() => healthyJsxRuntime);
	assert.equal(id, manifest.name);
});

test("declares the client services the host must supply to apply", () => {
	const { exports } = loadClientHalf(() => healthyJsxRuntime);
	assert.deepEqual(Array.from(exports.inject), [
		"slots",
		"conversationEvents",
		"conversationViews",
		"sessions",
	]);
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
		"conversation.input.model",
		"conversation.session.header.utilities",
		"sidebar.brand.mark",
	]);
});

test("registers the provider disclosure into conversation.session.header.utilities", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, injectedNames, registered } = stubSlots();
	exports.apply(ctx);
	assert.ok(injectedNames.includes("conversation.session.header.utilities"));
	const disclosure = registered.find(
		(call) => call.options.name === "conversation.session.header.utilities",
	);
	assert.equal(disclosure.options.id, "bf-provider-disclosure");
	assert.equal(typeof disclosure.component, "function");
});

test("the provider disclosure renders nothing until the llm.providers lookup resolves", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const disclosure = registered.find(
		(call) => call.options.name === "conversation.session.header.utilities",
	);
	// useState echoes its initial (null), i.e. the lookup has not resolved.
	assert.equal(disclosure.component(), null);
});

test("the provider disclosure says 'replay' in plain words and calls the responses authored, not captured", () => {
	const { exports } = loadClientHalf(hostModulesWithSeatedState("replay"));
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const disclosure = registered.find(
		(call) => call.options.name === "conversation.session.header.utilities",
	);
	const pill = disclosure.component();
	assert.equal(pill.type, healthyHostModules["@deepseek-ai/dsh-client-ui-primitives"].Pill);
	const span = pill.props.children;
	assert.equal(span.type, "span");
	assert.match(JSON.stringify(span.props.children), /Replay/);
	assert.match(JSON.stringify(span.props.children), /authored/i);
	// The wording must not imply the responses were captured from a live run.
	assert.doesNotMatch(span.props.title, /captured from|recorded from a live/i);
	assert.match(span.props.title, /authored by hand/i);
	// A deliberate operating mode, not a warning or an apology (UX-DR9).
	assert.doesNotMatch(span.props.title, /warning|caution|sorry|apolog|unfortunately/i);
});

test("the provider disclosure names an unrecognised provider rather than guessing its story", () => {
	const { exports } = loadClientHalf(hostModulesWithSeatedState("local"));
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const disclosure = registered.find(
		(call) => call.options.name === "conversation.session.header.utilities",
	);
	const span = disclosure.component().props.children;
	assert.match(JSON.stringify(span.props.children), /Local/);
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
	const start = source.indexOf("function buildTaskTypeIndicator");
	const end = source.indexOf("function buildProviderDisclosure");
	assert.ok(start >= 0 && end > start, "could not locate the task-type builder in the source");
	const builder = source.slice(start, end);
	assert.doesNotMatch(builder, /Menu/, "the hero seat must not render a Menu");
	assert.doesNotMatch(builder, /settings\.update/, "the hero seat must not set the task type");
	assert.doesNotMatch(builder, /onSelect|onClick/, "the hero seat must not be interactive");
});

test("registers the routing chip into conversation.input.model, replacing the stock picker", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, injectedNames, registered } = stubSlots();
	exports.apply(ctx);
	assert.ok(injectedNames.includes("conversation.input.model"));
	const chip = registered.find((call) => call.options.name === "conversation.input.model");
	assert.equal(chip.options.id, "bf-routing-chip");
	assert.equal(typeof chip.component, "function");
	// The seat is `single`, so the profile disables ui-model-selection — the doc
	// records that; here we assert the inject factory carries the sessionId.
	assert.equal(chip.options.inject("s-1").sessionId, "s-1");
});

test("registers the bf-routing conversation view and the router/routed event Definition", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, conversationViews, conversationEvents } = stubSlots();
	exports.apply(ctx);
	assert.equal(conversationViews.length, 1);
	assert.equal(conversationViews[0].target, "bf-routing");
	assert.equal(conversationEvents.length, 1);
	const def = conversationEvents[0];
	assert.equal(def.kind, "bf-routing");
	assert.equal(def.target, "bf-routing");
	const m = def.match({ type: "router/routed", seq: 7 });
	assert.equal(m.id, "7");
	assert.equal(m.role, "start");
	assert.equal(def.match({ type: "assistant/message", seq: 8 }), null);
	// start() adopts the event data as the Context state; buildViewNode carries it.
	const node = def.buildViewNode({
		key: "k", id: "7", state: { taskType: "code" }, start: { event: { seq: 7 } },
	});
	assert.equal(node.target, "bf-routing");
	assert.equal(node.anchorSeq, 7);
	assert.equal(node.data.taskType, "code");
});

test("the bf-routing view builder keeps the highest-seq routing decision", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, conversationViews } = stubSlots();
	exports.apply(ctx);
	const builder = conversationViews[0].create();
	assert.equal(builder.empty.decision, null);
	const first = { anchorSeq: 3, data: { taskType: "document" } };
	const second = { anchorSeq: 9, data: { taskType: "code" } };
	assert.equal(builder.replace({ nodes: [first, second] }).decision.taskType, "code");
	// A later (higher-seq) turn wins; an older upsert never supersedes it.
	assert.equal(
		builder.apply({ upserts: [{ anchorSeq: 2, data: { taskType: "drawing" } }] }).decision.taskType,
		"code",
	);
	assert.equal(
		builder.apply({ upserts: [{ anchorSeq: 12, data: { taskType: "calculation" } }] }).decision.taskType,
		"calculation",
	);
});

test("the routing chip names the selected fleet member and expands to the working", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sessions: stubSessions(ROUTING_DECISION_FIXTURE) });
	exports.apply(ctx);
	const chip = registered.find((call) => call.options.name === "conversation.input.model");
	const rendered = chip.component({ sessionId: "s-1", locked: false });
	const primitives = healthyHostModules["@deepseek-ai/dsh-client-ui-primitives"];
	// With a decision and no lock, the chip is a Menu whose anchor is the Pill.
	assert.equal(rendered.type, primitives.Menu);
	assert.equal(rendered.props.side, "top");
	assert.equal(rendered.props.selectedId, "bf-r-score:Qwen/Qwen2.5-VL-7B-Instruct");
	const flat = JSON.stringify(rendered.props.items);
	assert.match(flat, /drawing/); // the classified task type
	assert.match(flat, /score 5/); // the per-member score
	assert.match(flat, /drawing-understanding \+3/); // the working behind the score
	assert.match(flat, /Filtered out before scoring/);
	assert.match(flat, /modality-missing|accepts image input/); // the exclusion reason
	// The trigger names the fleet member (org prefix dropped for the compact surface).
	const anchorChildren = JSON.stringify(rendered.props.anchor.props.children);
	assert.match(anchorChildren, /Qwen2\.5-VL-7B-Instruct/);
});

test("Story 3.8: a later turn's routing decision supersedes the earlier one in the bf-routing view", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, conversationViews } = stubSlots();
	exports.apply(ctx);
	const builder = conversationViews[0].create();
	// Turn 1 lands first (lower seq), then turn 2 in the same session (higher seq).
	builder.apply({ upserts: [{ anchorSeq: 4, data: TURN_1_DECISION }] });
	const afterTurn2 = builder.apply({ upserts: [{ anchorSeq: 8, data: TURN_2_DECISION }] });
	assert.equal(afterTurn2.decision.taskType, "code");
	assert.equal(afterTurn2.decision.selected, "Qwen/Qwen2.5-Coder-7B-Instruct");
	// A late-arriving lower-seq node (e.g. out-of-order delivery) must not regress it.
	const stillTurn2 = builder.apply({ upserts: [{ anchorSeq: 5, data: TURN_1_DECISION }] });
	assert.equal(stillTurn2.decision.selected, "Qwen/Qwen2.5-Coder-7B-Instruct");
});

test("Story 3.8: the routing chip follows the view to the new member and new scores, with no user action", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	// The chip is a pure function of the current bf-routing snapshot; the view
	// builder swaps that snapshot per turn (asserted above). Render it against
	// each turn's decision and confirm it tracks — trigger and expanded working.
	function renderChipFor(decision) {
		const { ctx, registered } = stubSlots({ sessions: stubSessions(decision) });
		exports.apply(ctx);
		const chip = registered.find((call) => call.options.name === "conversation.input.model");
		return chip.component({ sessionId: "s-1", locked: false });
	}

	const turn1 = renderChipFor(TURN_1_DECISION);
	assert.equal(turn1.props.selectedId, "bf-r-score:Qwen/Qwen2.5-VL-7B-Instruct");
	assert.match(JSON.stringify(turn1.props.anchor.props.children), /Qwen2\.5-VL-7B-Instruct/);
	assert.match(JSON.stringify(turn1.props.items), /document/);

	const turn2 = renderChipFor(TURN_2_DECISION);
	assert.equal(turn2.props.selectedId, "bf-r-score:Qwen/Qwen2.5-Coder-7B-Instruct");
	assert.match(JSON.stringify(turn2.props.anchor.props.children), /Qwen2\.5-Coder-7B-Instruct/);
	const turn2Items = JSON.stringify(turn2.props.items);
	assert.match(turn2Items, /"text":"code"/); // the newly classified task type row
	assert.match(turn2Items, /score 6/); // the new per-member score
	assert.match(turn2Items, /code-generation \+3/); // the working behind it
	assert.doesNotMatch(turn2Items, /VL-7B/); // the previous member is gone
});

test("the routing chip shows a quiet indicator before the first turn records a decision", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sessions: stubSessions(null) });
	exports.apply(ctx);
	const chip = registered.find((call) => call.options.name === "conversation.input.model");
	const rendered = chip.component({ sessionId: "s-1", locked: false });
	// No decision yet: a bare non-interactive Pill, no Menu, no open handler.
	assert.equal(rendered.type, healthyHostModules["@deepseek-ai/dsh-client-ui-primitives"].Pill);
	assert.equal(rendered.props.onClick, undefined);
	assert.match(JSON.stringify(rendered.props.children), /Auto-routing/);
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
