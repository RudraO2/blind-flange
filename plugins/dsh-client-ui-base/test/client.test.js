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
		// Standard browser globals the seal control's hold gesture uses. The vm
		// context is a stand-in for a browser, so it has to carry the ones the
		// client half actually reaches for — a missing global here is a
		// ReferenceError at render, not a graceful degradation.
		setInterval,
		clearInterval,
		setTimeout,
		clearTimeout,
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
		useRef: (initial) => ({ current: initial }),
		useState: (initial) => [initial, () => {}],
		useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
	},
	"@deepseek-ai/dsh-client-ui-primitives": {
		IconAgentPresetOutline16: () => {},
		Pill: (props) => ({ type: "Pill", props }),
		StateDot: (props) => ({ type: "StateDot", props }),
		Menu: (props) => ({ type: "Menu", props }),
		Button: (props) => ({ type: "Button", props }),
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
 *
 * `ctx.inject(names, run)` mirrors Cordis, as the host-half stub does: it runs
 * `run` with a context carrying the named services, and does not run it at all
 * when one is missing. Pass `connection: false` to stand in for a client with
 * no host transport — the canary button's seat disappears and every other seat
 * survives (Story 2.3).
 */
function stubSlots({ sessions, connection, sealed = true } = {}) {
	const canaryCalls = [];
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
	const connectionService = connection === undefined
		? {
			rpc: {
				call: (channel, endpoint, payload) => {
					canaryCalls.push({ channel, endpoint, payload });
					if (channel === "/bf-seal") {
						// `open`/`close` answer with the state they were asked for, the
						// way the host does — the client must render what it is told,
						// never what its own button hoped for.
						const answer = endpoint === "get" ? sealed : endpoint === "close";
						return Promise.resolve({ ok: true, value: { sealed: answer } });
					}
					return Promise.resolve({
						ok: true,
						value: { outcome: "refused", sealed: true, target: "https://example.com", detail: "denied" },
					});
				},
			},
		}
		: connection;
	ctx.inject = (names, run) => {
		if (names.some((name) => name === "connection" && connectionService === false)) return;
		run({ ...ctx, connection: connectionService });
	};
	return { ctx, injectedNames, registered, conversationViews, conversationEvents, canaryCalls };
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
		// Two seats in the composer tool row: the upload control and the canary.
		// Left to right they read "give it a document, then prove nothing left the
		// box", which is also the order the demo does them in.
		"conversation.input.right",
		"conversation.input.right",
		// Three chips in the session header: the provider disclosure, the egress
		// monitor, and residency — which models are in VRAM right now. That last one
		// is the only surface showing it; the routing chip shows scores and the
		// approval note carries the rest of the trace.
		"conversation.session.header.utilities",
		"conversation.session.header.utilities",
		"conversation.session.header.utilities",
		// Story 4.5's crop viewer — a whole tab, not a chip.
		"conversation.view",
		// Two overlay seats: the egress panel, and the band that takes space at
		// the top of the window for as long as the seal is open.
		"shell.overlay",
		"shell.overlay",
		"sidebar.brand.mark",
	// The wordmark beside it: the shipped fallback reads "DSH Local Build" with
	// the harness's build hash, which is the wrong product name sitting directly
	// beside our own mark for the whole demo.
	"sidebar.brand.name",
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

test("the hero seat renders the mark, the name and the tagline as real text", () => {
	// The shipped headline reads "Into the Unknown" and has no seat: it is a
	// locale string, ui-conversation takes no config, and locale.register throws
	// on a namespace/locale pair that already exists. So the words are rendered
	// here and the shipped node is hidden by a stylesheet - CSS hides, it never
	// fabricates text, so the name stays selectable and readable aloud.
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const hero = registered.find((call) => call.options.name === "conversation.hero.brand.mark");
	const flat = JSON.stringify(hero.component({ size: 20, className: "hero-mark" }));
	assert.match(flat, /Faraday/);
	assert.match(flat, /Into the Unknown/);
	assert.match(flat, /--dsw-alias-label-secondary/, "the tagline takes a theme token, not a colour of ours");
	assert.doesNotMatch(flat, /fontSize":"[0-9]+px/, "the lockup sizes against the headline, not in px");
});

test("the sidebar mark is still the bare mark, in currentColor", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const side = registered.find((call) => call.options.name === "sidebar.brand.mark");
	const svg = side.component({ size: 20, className: "side-mark" });
	assert.equal(svg.type, "svg");
	assert.equal(svg.props.viewBox, "273 215 722 722", "the viewBox is cropped to the artwork, not the exported canvas");
	const paths = svg.props.children.props.children;
	assert.ok(Array.isArray(paths) && paths.length > 0);
	for (const path of paths) {
		assert.equal(path.props.fill, "currentColor", "the mark takes the theme foreground, never a colour of ours");
	}
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
	assert.ok(conversationViews.some((v) => v.target === "bf-routing"));
	const def = conversationEvents.find((d) => d.kind === "bf-routing");
	assert.ok(def, "no bf-routing event Definition registered");
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
	const builder = conversationViews.find((v) => v.target === "bf-routing").create();
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
	const builder = conversationViews.find((v) => v.target === "bf-routing").create();
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

/* ---- Egress monitor (Story 2.2) ---- */

/**
 * A `ctx.sessions` stub exposing a `bf-egress` view snapshot, and a `list`
 * store whose `current` points at the one session, so both the session-scoped
 * chip and the root-scoped panel can resolve it.
 * @param snapshot - the folded egress snapshot, or null for "view not ready".
 */
function stubEgressSessions(snapshot) {
	const session = {
		subscribe: () => () => {},
		getSnapshot: () => ({
			views: { get: (target) => (target === "bf-egress" ? snapshot ?? undefined : undefined) },
		}),
	};
	return {
		binding: () => ({ session }),
		list: { subscribe: () => () => {}, getSnapshot: () => ({ current: "s-1" }) },
	};
}

test("registers the bf-egress conversation view and the egress/denied event Definition", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, conversationViews, conversationEvents } = stubSlots();
	exports.apply(ctx);
	assert.ok(conversationViews.some((v) => v.target === "bf-egress"), "no bf-egress view registered");
	const def = conversationEvents.find((d) => d.kind === "bf-egress");
	assert.ok(def, "no egress/denied event Definition registered");
	assert.equal(def.match({ type: "egress/denied", seq: 4 }).id, "4");
	assert.equal(def.match({ type: "tool/call", seq: 5 }), null);
	const node = def.buildViewNode({
		key: "k", id: "4", state: { tool: "web_fetch", target: "https://example.com" },
		start: { event: { seq: 4 } },
	});
	assert.equal(node.target, "bf-egress");
	assert.equal(node.data.tool, "web_fetch");
});

test("Story 2.4: the denial Definition keeps the log's own timestamp and sequence number", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, conversationEvents } = stubSlots();
	exports.apply(ctx);
	const def = conversationEvents.find((d) => d.kind === "bf-egress");
	// The harness stamps `time` (unix epoch ms) and `seq` on the event envelope;
	// the audit line reads those rather than taking a clock reading at render.
	const state = def.start(undefined, {
		event: { type: "egress/denied", seq: 7, time: 1787918400000, data: { tool: "bf_canary", target: "https://example.com/" } },
	});
	assert.equal(state.tool, "bf_canary");
	assert.equal(state.target, "https://example.com/");
	assert.equal(state.time, 1787918400000);
	assert.equal(state.seq, 7);
	// A record with no envelope time is reported as missing, never invented.
	const undated = def.start(undefined, { event: { type: "egress/denied", seq: 8, data: { tool: "web_fetch", target: "a" } } });
	assert.equal(undated.time, null);
});

test("the bf-egress view builder counts denial nodes — the zero is a count, not a literal", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, conversationViews } = stubSlots();
	exports.apply(ctx);
	const builder = conversationViews.find((v) => v.target === "bf-egress").create();
	// No events: a counted zero.
	assert.equal(builder.empty.count, 0);
	assert.equal(builder.replace({ nodes: [] }).count, 0);
	// Two denials in the log: count is two, latest detail is the higher-seq one.
	const s1 = builder.replace({
		nodes: [
			{ key: "3", anchorSeq: 3, data: { kind: "denied", tool: "web_search", target: "a" } },
			{ key: "9", anchorSeq: 9, data: { kind: "denied", tool: "web_fetch", target: "b" } },
		],
	});
	assert.equal(s1.count, 2);
	assert.equal(s1.latest.target, "b");
	// A fresh denial arriving as an upsert increments; a replayed key does not double-count.
	assert.equal(builder.apply({ upserts: [{ key: "12", anchorSeq: 12, data: { kind: "denied", tool: "web_fetch", target: "c" } }] }).count, 3);
	assert.equal(builder.apply({ upserts: [{ key: "12", anchorSeq: 12, data: { kind: "denied", tool: "web_fetch", target: "c" } }] }).count, 3);
});

test("Story 2.4: the bf-egress view lists denials in the order the log wrote them", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, conversationViews } = stubSlots();
	exports.apply(ctx);
	const builder = conversationViews.find((v) => v.target === "bf-egress").create();
	// Compared by length and by joined seq below, not with deepEqual: the browser
	// half runs in a `vm` realm, so its arrays fail a strict deep-equality check
	// against arrays built here however identical their contents.
	assert.equal(builder.empty.entries.length, 0);
	// Delivered out of order; ordered by the log's sequence number, oldest first.
	const listed = builder.replace({
		nodes: [
			{ key: "9", anchorSeq: 9, data: { kind: "denied", tool: "bf_canary", target: "https://example.com/", time: 1787918460000, seq: 9 } },
			{ key: "3", anchorSeq: 3, data: { kind: "denied", tool: "web_search", target: "MRPL", time: 1787918400000, seq: 3 } },
		],
	});
	assert.equal(listed.entries.map((entry) => entry.seq).join(","), "3,9");
	assert.equal(listed.entries[0].tool, "web_search");
	assert.equal(listed.entries[0].time, 1787918400000);
	assert.equal(listed.count, listed.entries.length);
	// A later denial lands at the end of the list without a restart or a reload.
	const after = builder.apply({
		upserts: [{ key: "14", anchorSeq: 14, data: { kind: "denied", tool: "web_fetch", target: "https://mrpl.example/x", time: 1787918520000, seq: 14 } }],
	});
	assert.equal(after.entries.map((entry) => entry.seq).join(","), "3,9,14");
	assert.equal(after.latest.target, "https://mrpl.example/x");
});

test("the egress chip reads a counted zero and a green dot with no attempts", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sessions: stubEgressSessions({ count: 0, latest: null }) });
	exports.apply(ctx);
	const chip = registered.find((call) => call.options.id === "bf-egress-chip");
	assert.ok(chip, "the egress chip took no seat");
	assert.equal(chip.options.name, "conversation.session.header.utilities");
	const rendered = chip.component({ sessionId: "s-1" });
	assert.equal(rendered.type, healthyHostModules["@deepseek-ai/dsh-client-ui-primitives"].Pill);
	const flat = JSON.stringify(rendered.props.children);
	assert.match(flat, /Egress 0/);
	assert.match(flat, /"state":"done"/);
	assert.equal(rendered.props.active, false);
});

test("the egress chip turns red and names the count once something is denied", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({
		sessions: stubEgressSessions({ count: 2, latest: { tool: "web_fetch", target: "https://example.com" } }),
	});
	exports.apply(ctx);
	const chip = registered.find((call) => call.options.id === "bf-egress-chip");
	const rendered = chip.component({ sessionId: "s-1" });
	assert.match(JSON.stringify(rendered.props.children), /Egress 2/);
	assert.match(JSON.stringify(rendered.props.children), /"state":"error"/);
	assert.equal(rendered.props.active, true);
});

test("the egress panel is hidden until the chip opens it, then shows the counted state", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({
		sessions: stubEgressSessions({
			count: 1,
			entries: [{ tool: "web_search", target: "MRPL", time: 1787918400000, seq: 3 }],
			latest: { tool: "web_search", target: "MRPL", time: 1787918400000, seq: 3 },
		}),
	});
	exports.apply(ctx);
	const panel = registered.find((call) => call.options.id === "bf-egress-panel");
	assert.ok(panel, "the egress panel took no seat");
	assert.equal(panel.options.name, "shell.overlay");
	// Closed by default.
	assert.equal(panel.component({}), null);
	// The chip's click toggles the shared open store.
	const chip = registered.find((call) => call.options.id === "bf-egress-chip");
	chip.component({ sessionId: "s-1" }).props.onClick();
	const opened = panel.component({});
	assert.equal(opened.type, "section");
	assert.equal(opened.props["aria-label"], "Egress monitor");
	const flat = JSON.stringify(opened.props.children);
	assert.match(flat, /1 outbound attempt denied/);
	assert.match(flat, /web_search/);
	// Only theme tokens on the surface — no hand-rolled hex.
	assert.match(opened.props.style.background, /var\(--dsw-/);
	assert.match(opened.props.style.border, /var\(--dsw-/);
	assert.doesNotMatch(JSON.stringify(opened.props.style), /#[0-9a-fA-F]{3,}/);
});

test("the egress panel says the zero is counted, not printed, when nothing has been denied", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sessions: stubEgressSessions({ count: 0, entries: [], latest: null }) });
	exports.apply(ctx);
	const panel = registered.find((call) => call.options.id === "bf-egress-panel");
	const chip = registered.find((call) => call.options.id === "bf-egress-chip");
	chip.component({ sessionId: "s-1" }).props.onClick();
	const flat = JSON.stringify(panel.component({}).props.children);
	assert.match(flat, /counted from the denial log/);
	// Nothing denied, so no audit list and no empty scaffolding for one.
	assert.doesNotMatch(flat, /Audit log/);
});

/* ---- The audit log on screen (Story 2.4) ---- */

/**
 * Open the audit surface for a given folded snapshot and return the rendered
 * panel. The panel is a pure function of that snapshot, which the view builder
 * produces from the log (asserted separately above).
 * @param snapshot - the folded `bf-egress` snapshot.
 */
function openAuditSurface(snapshot) {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sessions: stubEgressSessions(snapshot) });
	exports.apply(ctx);
	const panel = registered.find((call) => call.options.id === "bf-egress-panel");
	const chip = registered.find((call) => call.options.id === "bf-egress-chip");
	chip.component({ sessionId: "s-1" }).props.onClick();
	return panel.component({});
}

/** Two recorded denials, oldest first, as the view builder orders them. */
const AUDIT_ENTRIES = [
	{ tool: "web_search", target: "MRPL inspection standards", time: 1787918400000, seq: 3 },
	{ tool: "bf_canary", target: "https://example.com/", time: 1787918460000, seq: 9 },
];

test("Story 2.4: the audit surface lists each denial with timestamp, tool and refused target", () => {
	const opened = openAuditSurface({ count: 2, entries: AUDIT_ENTRIES, latest: AUDIT_ENTRIES[1] });
	const flat = JSON.stringify(opened.props.children);
	assert.match(flat, /Audit log/);
	// The tool and the refused target, per entry.
	assert.match(flat, /web_search/);
	assert.match(flat, /MRPL inspection standards/);
	assert.match(flat, /bf_canary/);
	assert.match(flat, /https:\/\/example\.com\//);
	// The timestamp, from the log's own record: readable clock on the line,
	// unambiguous ISO stamp in the title.
	assert.match(flat, new RegExp(new Date(1787918400000).toLocaleTimeString().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
	assert.match(flat, /2026-08-28T\d{2}:00:00\.000Z/);
	// The list is reachable by name for a screen reader, and nothing is invented.
	assert.match(flat, /"aria-label":"Audit log — denied outbound attempts"/);
	assert.doesNotMatch(flat, /unrecorded/);
});

test("Story 2.4: audit entries appear in the order they were written", () => {
	const opened = openAuditSurface({ count: 2, entries: AUDIT_ENTRIES, latest: AUDIT_ENTRIES[1] });
	const flat = JSON.stringify(opened.props.children);
	assert.ok(flat.indexOf("web_search") < flat.indexOf("bf_canary"), "the older denial did not render first");
});

test("Story 2.4: a new denial appears on the open surface without a restart", () => {
	// The panel subscribes to the session's bf-egress view, so a denial folded
	// into that view after the surface was opened renders on the next snapshot.
	const before = openAuditSurface({ count: 1, entries: [AUDIT_ENTRIES[0]], latest: AUDIT_ENTRIES[0] });
	assert.doesNotMatch(JSON.stringify(before.props.children), /bf_canary/);
	const after = openAuditSurface({ count: 2, entries: AUDIT_ENTRIES, latest: AUDIT_ENTRIES[1] });
	const flat = JSON.stringify(after.props.children);
	assert.match(flat, /bf_canary/);
	assert.match(flat, /2 outbound attempts denied/);
});

test("Story 2.4: a denial with no recorded timestamp is named as missing, never filled in", () => {
	const opened = openAuditSurface({
		count: 1,
		entries: [{ tool: "web_fetch", target: "", time: null, seq: 4 }],
		latest: { tool: "web_fetch", target: "", time: null, seq: 4 },
	});
	const flat = JSON.stringify(opened.props.children);
	assert.match(flat, /no timestamp recorded/);
	assert.match(flat, /unrecorded target/);
});

test("Story 2.4: a fresh denial is scrolled into view rather than landing below the fold", () => {
	// The list is oldest-first inside a capped box, so the fourth entry onwards
	// renders below the fold — exactly the entry an evaluator pressing the canary
	// is watching for. The panel scrolls the box to the end on every new entry.
	const listBox = { scrollTop: 0, scrollHeight: 420, clientHeight: 168 };
	const effects = [];
	const hostModules = (specifier) => {
		if (specifier === "react") {
			return {
				...healthyHostModules.react,
				// The panel's one ref is the audit list's box.
				useRef: () => ({ current: listBox }),
				useEffect: (run, deps) => effects.push({ run, deps }),
			};
		}
		return healthyHostModules[specifier];
	};
	const { exports } = loadClientHalf(hostModules);
	const entries = [
		...AUDIT_ENTRIES,
		{ tool: "bf_canary", target: "https://example.com/", time: 1787918520000, seq: 14 },
		{ tool: "bf_canary", target: "https://example.com/", time: 1787918580000, seq: 19 },
	];
	const { ctx, registered } = stubSlots({ sessions: stubEgressSessions({ count: 4, entries, latest: entries[3] }) });
	exports.apply(ctx);
	const panel = registered.find((call) => call.options.id === "bf-egress-panel");
	const chip = registered.find((call) => call.options.id === "bf-egress-chip");
	chip.component({ sessionId: "s-1" }).props.onClick();
	panel.component({});
	const scrollEffect = effects.find((entry) => Array.isArray(entry.deps) && entry.deps[0] === entries.length);
	assert.ok(scrollEffect, "the panel registered no effect keyed to the entry count");
	scrollEffect.run();
	assert.equal(listBox.scrollTop, listBox.scrollHeight);
});

test("Story 2.4: the audit surface sets no hand-rolled colour of its own", () => {
	const opened = openAuditSurface({ count: 2, entries: AUDIT_ENTRIES, latest: AUDIT_ENTRIES[1] });
	const flat = JSON.stringify(opened);
	// Every colour on the surface is a --dsw-* theme token, so it reads
	// correctly in light and dark alike (UX-DR1/UX-DR2).
	assert.doesNotMatch(flat, /#[0-9a-fA-F]{3,}/);
	assert.doesNotMatch(flat, /rgb\(|hsl\(/);
	assert.match(flat, /var\(--dsw-alias-label-secondary\)/);
});

test("puts the tab title back when the harness rewrites it after hydration", () => {
	// dsh-client-ui-renderer renders DocumentTitle with a hard-coded productTitle and
	// sets document.title from a useEffect, so the host-side tapIndex swap loses to
	// hydration. There is no row to disable and no config key.
	const { exports, document } = loadClientHalf((specifier) => healthyHostModules[specifier], {
		initialTitle: "DeepSeek Harness",
	});
	exports.apply(stubSlots().ctx);
	assert.equal(document.title, "Faraday");
});

test("keeps the session title and replaces only the product half", () => {
	const { exports, document } = loadClientHalf((specifier) => healthyHostModules[specifier], {
		initialTitle: "Inspection report — DeepSeek Harness",
	});
	exports.apply(stubSlots().ctx);
	assert.equal(document.title, "Inspection report — Faraday");
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

/* -------------------------------------------------------------------------
 * The canary button (Story 2.3)
 * ---------------------------------------------------------------------- */

/** The shipped primitives the canary renders through, by identity. */
const PRIMITIVES = healthyHostModules["@deepseek-ai/dsh-client-ui-primitives"];

/** Find the registered canary seat, or undefined. */
function findCanary(registered) {
	return registered.find((call) => call.options.name === "conversation.input.right");
}

test("takes conversation.input.right, the composer tool row before the send button", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, injectedNames, registered } = stubSlots();
	exports.apply(ctx);
	assert.ok(injectedNames.includes("conversation.input.right"));
	const canary = findCanary(registered);
	assert.equal(canary.options.id, "bf-canary");
	assert.equal(typeof canary.options.inject, "function");
	// Compared field-wise, not with deepEqual: the browser half runs in a `vm`
	// realm, so an object it builds has a different prototype than one here.
	assert.equal(canary.options.inject("s1").sessionId, "s1");
});

test("a client with no host transport loses the canary and keeps every other seat", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ connection: false });
	exports.apply(ctx);
	assert.equal(findCanary(registered), undefined);
	assert.equal(registered.length, 10, "the other seats must survive a missing transport");
});

test("pressing it posts to the host's loopback canary channel for this session", async () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered, canaryCalls } = stubSlots();
	exports.apply(ctx);
	const element = findCanary(registered).component({ sessionId: "s1" });
	await element.props.onClick();
	// Filtered by channel: mounting also reads the seal once over /bf-seal, and
	// this assertion is about the canary's own post.
	const fired = canaryCalls.filter((call) => call.channel === "/bf-canary");
	assert.equal(fired.length, 1);
	assert.equal(fired[0].endpoint, "fire");
	assert.equal(fired[0].payload.sessionId, "s1");
});

test("it is a shipped Pill, like the chips beside it, reading 'Canary'", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const element = findCanary(registered).component({ sessionId: "s1" });
	assert.equal(element.type, PRIMITIVES.Pill, "the canary must be a shipped primitive, not a hand-rolled control");
	assert.equal(element.props.active, false, "idle is the resting pill, not the emphasised one");
	assert.ok(element.props.children.props.children.includes("Canary"));
	assert.equal(element.props.children.props.children[0], null, "idle shows no state dot");
	assert.match(element.props.title, /attempt a real outbound connection/);
});

test("a denied canary reads as denied and shows the same red the monitor shows", () => {
	const { exports } = loadClientHalf(hostModulesWithSeatedState("refused"));
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const element = findCanary(registered).component({ sessionId: "s1" });
	const dot = element.props.children.props.children[0];
	assert.equal(dot.type, PRIMITIVES.StateDot);
	assert.equal(dot.props.state, "error");
	assert.match(element.props.title, /Denied by Faraday/);
	assert.match(element.props.title, /written to the audit log/);
});

test("a call stopped outside the application is not reported as our denial", () => {
	// The seal was open, the call genuinely left this process, and a host
	// firewall discarded it. Red, because an attempt was stopped — but the
	// sentence must not claim Faraday stopped it or wrote a record, because
	// our waterfall never ran and the counter beside this button will not move.
	const { exports } = loadClientHalf(hostModulesWithSeatedState("stoppedOutside"));
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const element = findCanary(registered).component({ sessionId: "s1" });
	assert.equal(element.props.children.props.children[0].props.state, "error");
	assert.match(element.props.title, /outside this application/);
	assert.doesNotMatch(element.props.title, /Denied by Faraday/);
});

test("a canary that reached the internet says so on the button itself", () => {
	// The one outcome that must be legible from the back of the room without
	// hovering anything, so it is the one outcome named on the label.
	const { exports } = loadClientHalf(hostModulesWithSeatedState("reached"));
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);
	const element = findCanary(registered).component({ sessionId: "s1" });
	assert.equal(element.props.children.props.children[0].props.state, "warning");
	assert.match(element.props.title, /REACHED the internet/);
	assert.ok(element.props.children.props.children.includes("Canary — got out"));
});

test("it refuses a second press while one is in flight", async () => {
	const { exports } = loadClientHalf(hostModulesWithSeatedState("firing"));
	const { ctx, registered, canaryCalls } = stubSlots();
	exports.apply(ctx);
	const element = findCanary(registered).component({ sessionId: "s1" });
	assert.equal(element.props.disabled, true);
	await element.props.onClick();
	const fired = canaryCalls.filter((call) => call.channel === "/bf-canary");
	assert.equal(fired.length, 0, "a press while firing must not post again");
});

test("it sets no colour of its own — the state dot carries it through theme tokens", () => {
	const source = readFileSync(join(packageDir, "lib", "client.js"), "utf8");
	const canarySection = source.slice(source.indexOf("function buildCanaryButton"), source.indexOf("function holdTabTitle"));
	assert.doesNotMatch(canarySection, /#[0-9a-fA-F]{3,8}\b/, "the canary must not hand-roll a hex colour");
	assert.doesNotMatch(canarySection, /rgba?\(/, "the canary must not hand-roll a colour");
});

/* ---------------------------------------------------------------------------
 * The seal, on screen
 *
 * The host half decides; these cover what the operator sees, and the one thing
 * this surface must never be able to do — show "sealed" while the machine is
 * open.
 * ------------------------------------------------------------------------- */

/** Let the seal's mount-time read of the host resolve before rendering. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

test("the open-seal band takes no space while the seal is closed", async () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sealed: true });
	exports.apply(ctx);
	await settled();
	const band = registered.find((call) => call.options.id === "bf-seal-band");
	assert.ok(band, "the band took no seat");
	assert.equal(band.options.name, "shell.overlay");
	assert.equal(band.component({}), null, "the resting state is silent, not a green reassurance");
});

test("an open seal changes the shape of the application, not just a colour", async () => {
	// A control that changes only itself is not telling the truth about what it
	// did. The band takes space at the top of the window for as long as the seal
	// is open, and carries the way back.
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sealed: false });
	exports.apply(ctx);
	await settled();
	const rendered = registered.find((call) => call.options.id === "bf-seal-band").component({});
	assert.notEqual(rendered, null, "an open seal must not be possible to miss");
	const flat = JSON.stringify(rendered);
	assert.match(flat, /The egress seal is open/);
	assert.match(flat, /Close the seal/);
	assert.doesNotMatch(flat, /Dismiss/, "the one state nobody should forget they are in must not be dismissable");
});

test("the band sets no hand-rolled colour of its own", async () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sealed: false });
	exports.apply(ctx);
	await settled();
	const flat = JSON.stringify(registered.find((call) => call.options.id === "bf-seal-band").component({}));
	assert.doesNotMatch(flat, /#[0-9a-fA-F]{3,8}/, "colours come from ui-theme tokens, never from us (UX-DR7)");
	assert.ok(!flat.includes("rgb(") && !flat.includes("hsl("), "no hand-rolled colour functions either");
});

test("the chip stops showing a count while the seal is open", async () => {
	// A number that keeps reading "0" with enforcement off would be the most
	// misleading thing on the screen: true, and understood as its opposite.
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sealed: false, sessions: stubEgressSessions({ count: 0, latest: null }) });
	exports.apply(ctx);
	await settled();
	const chip = registered.find((call) => call.options.id === "bf-egress-chip").component({ sessionId: "s-1" });
	const flat = JSON.stringify(chip.props.children);
	assert.match(flat, /Egress — open/);
	assert.doesNotMatch(flat, /Egress 0/);
	assert.match(chip.props.title, /the seal is OPEN/);
});

test("closing the seal from the band posts close, and the client renders the host's answer", async () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered, canaryCalls } = stubSlots({ sealed: false });
	exports.apply(ctx);
	await settled();
	const band = registered.find((call) => call.options.id === "bf-seal-band");
	const button = band.component({}).props.children.props.children[2];
	await button.props.onClick();
	await settled();

	const posted = canaryCalls.filter((call) => call.channel === "/bf-seal");
	assert.equal(posted[posted.length - 1].endpoint, "close");
	assert.equal(band.component({}), null, "the band goes when the host says the seal is closed");
});

/**
 * The seal control, rendered. The panel is closed until the chip opens it, so
 * this opens it the way a user does rather than reaching past the store.
 */
function sealControl(registered) {
	registered.find((call) => call.options.id === "bf-egress-chip").component({ sessionId: "s-1" }).props.onClick();
	const panel = registered.find((call) => call.options.id === "bf-egress-panel").component({});
	assert.ok(panel, "the panel did not open");
	const seat = panel.props.children.find((child) => child && child.props && child.props.sessionId !== undefined);
	assert.ok(seat, "the seal control is not in the panel");
	// The panel yields the component and its props; render it here.
	return seat.type(seat.props);
}

/** The switch itself: the `role="switch"` button inside the seal control. */
function sealSwitch(registered) {
	const control = sealControl(registered);
	const row = control.props.children[0];
	const found = row.props.children.find((child) => child && child.props && child.props.role === "switch");
	assert.ok(found, "the seal control has no switch in it");
	return found;
}

test("one press of the switch opens the seal", async () => {
	// It was a press-and-hold. The hold had no pointer capture, so a small drag
	// cancelled it silently and the control was indistinguishable from a broken
	// button. What makes opening safe is that the seal is closed at boot, never
	// persisted open, recorded when it changes, and banded across the window
	// while it lasts - none of which depends on the gesture.
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered, canaryCalls } = stubSlots({ sessions: stubEgressSessions({ count: 0, latest: null }) });
	exports.apply(ctx);
	await settled();

	await sealSwitch(registered).props.onClick();
	await settled();

	const posted = canaryCalls.filter((call) => call.channel === "/bf-seal");
	assert.equal(posted[posted.length - 1].endpoint, "open");
});

test("the switch reports its state to a screen reader, and Space throws it", async () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered, canaryCalls } = stubSlots({ sessions: stubEgressSessions({ count: 0, latest: null }) });
	exports.apply(ctx);
	await settled();

	const control = sealSwitch(registered);
	assert.equal(control.props["aria-checked"], "false", "a closed seal is an unchecked switch");
	assert.equal(control.props["aria-label"], "Network seal");

	let prevented = false;
	await control.props.onKeyDown({ key: " ", preventDefault: () => { prevented = true; } });
	await settled();
	assert.equal(prevented, true, "Space must not also scroll the panel");
	const posted = canaryCalls.filter((call) => call.channel === "/bf-seal");
	assert.equal(posted[posted.length - 1].endpoint, "open");
});

test("the seal control says what opening it does, at the moment of deciding", async () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({ sessions: stubEgressSessions({ count: 0, latest: null }) });
	exports.apply(ctx);
	await settled();
	const flat = JSON.stringify(sealControl(registered));
	assert.match(flat, /Seal closed/);
	assert.match(flat, /real outbound calls/);
	assert.match(flat, /recorded/, "the operator should learn the act is logged before doing it");
	assert.match(flat, /restarting the workbench closes it again/);
});

test("a call that got out stays on the record after the seal is closed again", async () => {
	// Re-sealing does not un-send it. The panel keeps saying so for the rest of
	// the session, because the alternative is a surface that quietly returns to
	// looking clean after the one event it exists to report.
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots({
		sealed: true,
		sessions: stubEgressSessions({
			count: 0,
			escaped: 1,
			entries: [{ kind: "escaped", tool: "bf_canary", target: "https://example.com/", reached: true, time: 1787918400000, seq: 4 }],
			latest: null,
		}),
	});
	exports.apply(ctx);
	await settled();
	registered.find((call) => call.options.id === "bf-egress-chip").component({ sessionId: "s-1" }).props.onClick();
	const flat = JSON.stringify(registered.find((call) => call.options.id === "bf-egress-panel").component({}));

	assert.match(flat, /1 call reached the internet in this session/);
	assert.match(flat, /Closing the seal does not undo that/);
	assert.match(flat, /Reached the internet/, "the audit line names it too");
});

/* ---------------------------------------------------------------------------
 * The upload control (30 August 2026)
 *
 * Story 8.2 established that the `@` mention picker already exists and that
 * nothing needed installing for it. This does not replace it — it adds the
 * moment a judge watches a file arrive, which naming a path already on disk does
 * not give you.
 * ------------------------------------------------------------------------- */

/** The upload seat, by id, so a reordering of the row does not break these. */
function findUpload(registered) {
	return registered.find((call) => call.options.name === "conversation.input.right" && call.options.id === "bf-upload");
}

test("the upload control takes the composer tool row, before the canary", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);

	const upload = findUpload(registered);
	assert.ok(upload, "no bf-upload registration");
	assert.equal(upload.options.label, "Upload");
	// Left to right the row reads "give it a document, then prove nothing left the
	// box", which is also the order the demo does them in.
	assert.ok(upload.options.order < 0, "the upload control should sort before the canary");
});

test("it is a shipped Pill like the controls beside it, and says which stage it is in", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);

	const element = findUpload(registered).component({});
	assert.equal(element.type, PRIMITIVES.Pill, "the upload control must be a shipped primitive, not a hand-rolled one");
	const flat = JSON.stringify(element.props.children);
	assert.match(flat, /Upload a document/);
	// The file input lives in the tree rather than being created on demand, so the
	// Pill's click handler always has something to open, and it is hidden from
	// assistive technology because the Pill is the control.
	assert.match(flat, /"type":"file"/);
	assert.match(flat, /"aria-hidden":"true"/);
	// Every accepted extension is offered, so the picker does not let a user
	// choose something the OCR path will refuse a second later.
	assert.match(flat, /\.pdf/);
	assert.match(flat, /\.png/);
	assert.match(element.props.title, /nothing leaves the box/i);
});

test("it sets no colour of its own either — the state dot carries it through theme tokens", () => {
	// Same rule as the canary, and the same reason: a hand-rolled colour is what
	// made the 27 Aug egress monitor read as pasted on. Verified in the source
	// because a component test cannot see what a token resolves to.
	const source = readFileSync(join(packageDir, "lib", "client.js"), "utf8");
	const section = source.slice(source.indexOf("function buildUploadButton"), source.indexOf("const CANARY_CHANNEL"));
	assert.ok(section.length > 500, "the upload section was not found — this test is asserting nothing");
	assert.doesNotMatch(section, /#[0-9a-fA-F]{3,8}\b/, "the upload control must not hand-roll a hex colour");
	assert.doesNotMatch(section, /rgba?\(/, "the upload control must not hand-roll a colour");
	// One exception, and it is layout rather than colour: the file input is hidden.
	assert.match(section, /display: "none"/);
});

/* ---------------------------------------------------------------------------
 * The residency chip (30 August 2026)
 *
 * CONTEXT.md "Residency": which fleet members are resident in VRAM at a given
 * moment. The only surface that shows it — the routing chip shows scores and the
 * approval note carries the rest of the trace, so this is the part that adds
 * information rather than repeating it.
 * ------------------------------------------------------------------------- */

function findResidency(registered) {
	return registered.find((call) => call.options.name === "conversation.session.header.utilities" && call.options.id === "bf-residency");
}

test("the residency chip takes a session-header seat, not a composer seat", () => {
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);

	const chip = findResidency(registered);
	assert.ok(chip, "no bf-residency registration");
	assert.equal(chip.options.label, "Residency");
	// It describes the machine's state rather than offering an action, and the
	// header is where this product already puts that — beside the provider
	// disclosure and the egress monitor.
	assert.equal(chip.options.name, "conversation.session.header.utilities");
});

test("with nothing read yet it says the runtime is not answering, rather than looking idle", () => {
	// The worse of the two mistakes: a comfortable "VRAM idle" while llama-swap is
	// dead hides the reason nothing works. Before the first poll resolves there is
	// no trace, and that must read as unknown-and-bad, not as fine.
	const { exports } = loadClientHalf((specifier) => healthyHostModules[specifier]);
	const { ctx, registered } = stubSlots();
	exports.apply(ctx);

	const rendered = findResidency(registered).component({});
	// A Menu whose anchor is the Pill, the same shape as the routing chip.
	assert.equal(rendered.type, PRIMITIVES.Menu);
	const flat = JSON.stringify(rendered.props);
	assert.match(flat, /VRAM/);
	assert.match(flat, /llama-swap is not answering/);
	// It names the escape hatch, because the person reading this chip at the wrong
	// moment needs the one-line fix and not a diagnosis.
	assert.match(flat, /replay/);
});

test("the residency chip sets no colour of its own either", () => {
	// Same rule as the canary and the upload control, same reason: a hand-rolled
	// colour is what made the 27 Aug egress monitor read as pasted on.
	const source = readFileSync(join(packageDir, "lib", "client.js"), "utf8");
	const section = source.slice(source.indexOf("function buildResidencyChip"), source.indexOf("const UPLOAD_CHANNEL"));
	assert.ok(section.length > 1000, "the residency section was not found — this test is asserting nothing");
	assert.doesNotMatch(section, /#[0-9a-fA-F]{3,8}\b/, "the residency chip must not hand-roll a hex colour");
	assert.doesNotMatch(section, /rgba?\(/, "the residency chip must not hand-roll a colour");
});
