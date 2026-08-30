/**
 * Tests for the base plugin's host half: the favicon route and the index.html
 * title/favicon swap (Story 1.5), both reached through `ctx.webServer`'s own
 * extension points (`register`, `tapIndex`) rather than any harness file
 * edit, plus the egress denial waterfall (Story 2.1) registered on
 * `tools/pre-execute`, plus the model plane adapter registration (Story 3.1)
 * on `ctx.llm`, plus the router's classifier (Story 3.5) and fleet scorer
 * (Story 3.6) on `agent/pre-step`, plus registering our session event types
 * into the harness's persistence vocabulary at mount (Story 3.9).
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { isSealed, setSealed } from "../lib/egress/seal.js";
import { fileURLToPath } from "node:url";
import { apply, inject } from "../lib/index.js";
import { loadFleet } from "../lib/registry/loader.js";
import { clearRoutingDecision, resolveRuntimeModel, runtimeModelForCurrentTurn } from "../lib/router/dispatch.js";
import { scoreFleet } from "../lib/router/score.js";
import { OUR_SESSION_EVENT_TYPES } from "../lib/session-events/known-types.js";

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * A stub host context that records what got registered on `webServer` and
 * captures the `tools/pre-execute` listener, mirroring the real host's
 * shape closely enough for these tests.
 *
 * `ctx.inject(names, run)` mirrors Cordis: it runs `run` with a context
 * carrying the named services, and does not run it at all when one is
 * missing. Pass `webServer: false` to stand in for the `headless` profile,
 * where there is no web server to wait for; pass `llm: false` for a profile
 * with no model seam mounted at all; pass `tools: false` or `connection: false`
 * for a profile with no tool registry or no browser transport, where the tools
 * have nothing to register into and the seal still holds.
 *
 * `llmService.registerAdapter` mirrors the real (duck-typed) contract closely
 * enough for these tests: it records the call and returns a disposer, exactly
 * like `LlmRuntime.registerAdapter` — see `llm-adapter.js` for why the real
 * adapter object needs no `instanceof` relationship to anything the harness
 * ships.
 */
function stubHostCtx({ webServer = true, llm = true, tools = true, connection = true, agent } = {}) {
	const routes = [];
	const taps = [];
	const registeredAdapters = [];
	const registeredTools = [];
	const dispatchedCalls = [];
	const rpcChannels = [];
	let preExecuteListener;
	let preStepListener;
	const webServerService = {
		register: (route) => {
			routes.push(route);
			return () => {};
		},
		tapIndex: (transform) => {
			taps.push(transform);
			return () => {};
		},
	};
	const llmService = {
		registerAdapter: (providers, adapter) => {
			registeredAdapters.push({ providers, adapter });
			return () => {};
		},
	};
	// A tool registry that records registrations and runs a dispatched call
	// through the plugin's own `tools/pre-execute` listener, exactly as the
	// harness does: policy first, tool body only on `allow`.
	const toolsService = {
		register: (definition) => {
			registeredTools.push(definition);
			return () => {};
		},
		execute: async (exec) => {
			dispatchedCalls.push(exec);
			const decision = await preExecuteListener(exec, () => ({ kind: "allow" }));
			if (decision.kind !== "allow") {
				return { isError: true, error: { message: decision.reason }, content: [] };
			}
			const definition = registeredTools.find((tool) => tool.name === exec.name);
			if (definition === undefined) {
				return { isError: true, error: { message: `unknown tool "${exec.name}"` }, content: [] };
			}
			const value = await definition.execute(exec.arguments, exec);
			return { isError: false, value, content: definition.output.render(exec.arguments, value) };
		},
	};
	const agentsService = { get: (sessionId) => (agent !== undefined && sessionId === "s1" ? agent : undefined) };
	const connectionService = {
		rpc: {
			handle: (channel, handler, options) => {
				rpcChannels.push({ channel, handler, options });
				return async () => {};
			},
		},
	};
	const base = {
		effect: (run) => run(),
		on: (name, fn) => {
			if (name === "tools/pre-execute") preExecuteListener = fn;
			if (name === "agent/pre-step") preStepListener = fn;
		},
		inject: (names, run) => {
			if (names.some((name) => name === "webServer" && !webServer)) return;
			if (names.some((name) => name === "llm" && !llm)) return;
			if (names.some((name) => name === "tools" && !tools)) return;
			if (names.some((name) => name === "connection" && !connection)) return;
			run({
				...base,
				webServer: webServerService,
				llm: llmService,
				tools: toolsService,
				agents: agentsService,
				connection: connectionService,
			});
		},
	};
	return {
		routes,
		taps,
		registeredAdapters,
		registeredTools,
		dispatchedCalls,
		rpcChannels,
		get preExecuteListener() {
			return preExecuteListener;
		},
		get preStepListener() {
			return preStepListener;
		},
		ctx: base,
	};
}

/** Run every recorded tap over `html`, in registration order — mirrors `WebServer.renderIndex`. */
function renderThroughTaps(taps, html) {
	return taps.reduce((out, transform) => transform(out), html);
}

test("gates nothing on a service, so every profile that mounts it is sealed", () => {
	// `inject` is a hard gate in Cordis: a service that never appears means
	// `apply` never runs. Naming `webServer` here would leave the headless
	// profile — which has none — with no egress denial at all.
	assert.deepEqual(inject, []);
});

test("apply() registers our session event types into the real installed harness's vocabulary (Story 3.9)", (t) => {
	const packageJsonPath = join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh-session", "package.json");
	if (!existsSync(packageJsonPath)) {
		t.skip("no @deepseek-ai/dsh-session installed under ~/.dsh/profiles on this machine");
		return;
	}
	const requireFromProfile = createRequire(packageJsonPath);
	const dshSession = requireFromProfile("@deepseek-ai/dsh-session");
	const stub = stubHostCtx({ webServer: false });
	apply(stub.ctx);
	for (const type of OUR_SESSION_EVENT_TYPES) {
		assert.ok(
			dshSession.KNOWN_SESSION_EVENT_TYPES.has(type),
			`expected apply() to have registered ${type} into the harness's KNOWN_SESSION_EVENT_TYPES`,
		);
	}
});

test("registers the egress denial waterfall in a profile with no web server", () => {
	const stub = stubHostCtx({ webServer: false });
	apply(stub.ctx);
	assert.equal(typeof stub.preExecuteListener, "function", "no tools/pre-execute listener registered");
	const verdict = stub.preExecuteListener({ name: "web_fetch", arguments: '{"url":"https://example.com"}' }, () => ({ kind: "allow" }));
	assert.equal(verdict.kind, "deny");
	assert.deepEqual(stub.routes, [], "a profile with no web server must register no routes");
	assert.deepEqual(stub.taps, [], "a profile with no web server must tap no index.html");
});

test("registers an exact favicon route serving our svg, not the harness's", () => {
	const { ctx, routes } = stubHostCtx();
	apply(ctx);
	const favicon = routes.find((route) => route.path === "/blind-flange/favicon.svg");
	assert.ok(favicon, "no route registered at /blind-flange/favicon.svg");
	assert.equal(favicon.kind, "exact");

	const ourSvg = readFileSync(join(packageDir, "lib", "favicon.svg"), "utf8");
	let written;
	let headed;
	const res = {
		writeHead: (status, headers) => {
			headed = { status, headers };
		},
		end: (body) => {
			written = body;
		},
	};
	favicon.handler({ method: "GET" }, res);
	assert.equal(headed.status, 200);
	assert.equal(headed.headers["content-type"], "image/svg+xml");
	assert.equal(written.toString("utf8"), ourSvg);
});

test("rejects a non-GET/HEAD request to the favicon route", () => {
	const { ctx, routes } = stubHostCtx();
	apply(ctx);
	const favicon = routes.find((route) => route.path === "/blind-flange/favicon.svg");
	let status;
	favicon.handler({ method: "POST" }, { writeHead: (code) => (status = code), end: () => {} });
	assert.equal(status, 405);
});

test("a HEAD request to the favicon route gets 200 and no body", () => {
	const { ctx, routes } = stubHostCtx();
	apply(ctx);
	const favicon = routes.find((route) => route.path === "/blind-flange/favicon.svg");
	let headed;
	let written;
	favicon.handler(
		{ method: "HEAD" },
		{
			writeHead: (status, headers) => {
				headed = { status, headers };
			},
			end: (body) => {
				written = body;
			},
		},
	);
	assert.equal(headed.status, 200);
	assert.equal(written, undefined);
});

test("taps index.html to swap the shipped title and favicon link for ours", () => {
	const { ctx, taps } = stubHostCtx();
	apply(ctx);
	const shipped = '<head><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><title>DeepSeek Harness</title></head>';
	const rendered = renderThroughTaps(taps, shipped);
	assert.ok(rendered.includes("<title>Faraday</title>"), "title was not swapped");
	assert.ok(!rendered.includes("DeepSeek Harness"), "the DeepSeek Harness title text is still present");
	assert.ok(rendered.includes('href="/blind-flange/favicon.svg"'), "favicon href was not swapped");
});

test("warns instead of silently doing nothing when the shipped title string isn't found", () => {
	const { ctx, taps } = stubHostCtx();
	apply(ctx);
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args.join(" "));
	try {
		const drifted = '<head><link rel="icon" type="image/svg+xml" href="/favicon.svg" /><title>Some Future Title</title></head>';
		const rendered = renderThroughTaps(taps, drifted);
		assert.ok(rendered.includes("Some Future Title"), "html should pass through unchanged when the search string is missing");
		assert.equal(warnings.length, 1);
		assert.match(warnings[0], /tab title/);
	} finally {
		console.warn = originalWarn;
	}
});

test("denies web_search before the tool body would run", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const next = () => {
		throw new Error("next() must not be called for a denied tool");
	};
	const decision = await host.preExecuteListener(
		{ name: "web_search", arguments: '{"queries":["MRPL sovereign AI"]}' },
		next,
	);
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /web_search/);
	assert.match(decision.reason, /MRPL sovereign AI/);
});

test("denies web_fetch and names the URL it tried to reach", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener(
		{ name: "web_fetch", arguments: '{"url":"https://example.com"}' },
		() => {
			throw new Error("next() must not be called for a denied tool");
		},
	);
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /https:\/\/example\.com/);
});

test("falls back to the raw arguments when they do not parse as JSON", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener({ name: "web_fetch", arguments: "not json" }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /not json/);
});

test("allows a tool that cannot reach the network", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const allow = { kind: "allow" };
	const decision = await host.preExecuteListener({ name: "read_file", arguments: "{}" }, () => allow);
	assert.equal(decision, allow);
});

test("records a distinct egress/denied event on the session log when it denies (Story 2.2)", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const agent = stubAgent();
	const decision = await host.preExecuteListener(
		{ name: "web_fetch", arguments: '{"url":"https://example.com"}', agent },
		() => {
			throw new Error("next() must not be called for a denied tool");
		},
	);
	assert.equal(decision.kind, "deny");
	assert.equal(agent.events.length, 1);
	assert.equal(agent.events[0].type, "egress/denied");
	assert.equal(agent.events[0].data.tool, "web_fetch");
	assert.equal(agent.events[0].data.target, "https://example.com");
});

test("an allowed tool records no egress/denied event", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const agent = stubAgent();
	await host.preExecuteListener({ name: "read_file", arguments: "{}", agent }, () => ({ kind: "allow" }));
	assert.deepEqual(agent.events, []);
});

test("still denies fast when no session is reachable to record the denial", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener({ name: "web_search", arguments: '{"queries":["x"]}' }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(decision.kind, "deny");
});

test("a session-append failure does not stop the denial", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args.join(" "));
	try {
		const brokenAgent = { session: { append: () => { throw new Error("log unavailable"); } } };
		const decision = await host.preExecuteListener(
			{ name: "web_fetch", arguments: '{"url":"https://example.com"}', agent: brokenAgent },
			() => {
				throw new Error("next() must not be called for a denied tool");
			},
		);
		assert.equal(decision.kind, "deny");
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /egress event not recorded/);
});

test("registers the replay adapter under the 'replay' route by default (Story 3.1)", () => {
	const host = stubHostCtx();
	apply(host.ctx);
	assert.equal(host.registeredAdapters.length, 1);
	assert.deepEqual(host.registeredAdapters[0].providers, ["replay"]);
	assert.equal(typeof host.registeredAdapters[0].adapter.stream, "function");
});

test("model plane provider is a config value, not a code path", () => {
	const host = stubHostCtx();
	apply(host.ctx, { modelPlane: { provider: "local" } });
	assert.deepEqual(host.registeredAdapters[0].providers, ["local"]);
});

test("mounts no model plane adapter in a profile with no llm service", () => {
	const host = stubHostCtx({ llm: false });
	apply(host.ctx);
	assert.deepEqual(host.registeredAdapters, []);
});

test("warns and skips registration instead of crashing on an unknown modelPlane.provider", () => {
	const host = stubHostCtx();
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args.join(" "));
	try {
		assert.doesNotThrow(() => apply(host.ctx, { modelPlane: { provider: "nonexistent" } }));
	} finally {
		console.warn = originalWarn;
	}
	assert.deepEqual(host.registeredAdapters, []);
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /model plane not mounted/);
});

/** A fake agent whose session records every appended event. */
function stubAgent() {
	const events = [];
	return {
		events,
		session: {
			append: (type, data) => {
				events.push({ type, data });
				return { type, data };
			},
		},
	};
}

test("classifies the request entering a fresh turn and records it on the session log (Story 3.5)", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	assert.equal(typeof host.preStepListener, "function", "no agent/pre-step listener registered");

	const agent = stubAgent();
	const messages = [{ role: "user", content: [{ type: "text", text: "Refactor this Python function and add unit tests" }] }];
	const decision = await host.preStepListener({ agent, turn: 1, step: 1, messages }, async () => ({ kind: "enter", messages }));

	assert.deepEqual(decision, { kind: "enter", messages }, "the listener must pass the loop's decision through unchanged");
	assert.equal(agent.events.length, 2);
	assert.equal(agent.events[0].type, "router/classified");
	assert.equal(agent.events[0].data.taskType, "code");
	assert.equal(agent.events[0].data.turn, 1);
	assert.equal(agent.events[0].data.noRequestText, false);
	assert.equal(typeof agent.events[0].data.scores.document, "number");
});

test("scores the licence-checked fleet against the classified task type and records the routing decision (Story 3.6)", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);

	const agent = stubAgent();
	const messages = [{ role: "user", content: [{ type: "text", text: "Refactor this Python function and add unit tests" }] }];
	await host.preStepListener({ agent, turn: 2, step: 1, messages }, async () => ({ kind: "enter", messages }));

	const routed = agent.events.find((event) => event.type === "router/routed");
	assert.ok(routed, "no router/routed event recorded");
	assert.equal(routed.data.taskType, "code");
	assert.equal(routed.data.turn, 2);
	assert.equal(routed.data.selected, "Qwen/Qwen2.5-Coder-1.5B-Instruct");
	assert.ok(Array.isArray(routed.data.scored) && routed.data.scored.length > 0);
	assert.ok(routed.data.scored.every((entry) => typeof entry.score === "number"));
	assert.ok(Array.isArray(routed.data.excluded));
});

test("a scoring failure is swallowed and does not suppress the classification already recorded", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args.join(" "));
	try {
		let call = 0;
		const agent = {
			events: [],
			session: {
				// first append (router/classified) succeeds, second (router/routed) throws
				append: (type, data) => {
					call += 1;
					if (call === 2) throw new Error("session log unavailable");
					agent.events.push({ type, data });
					return { type, data };
				},
			},
		};
		const messages = [{ role: "user", content: [{ type: "text", text: "calculate the pressure drop" }] }];
		const decision = await host.preStepListener({ agent, turn: 1, step: 1, messages }, async () => ({ kind: "enter", messages }));
		assert.equal(decision.kind, "enter");
		assert.equal(agent.events.length, 1);
		assert.equal(agent.events[0].type, "router/classified");
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /fleet not scored/);
});

test("Story 3.8: a second turn classifying as a different task type routes to a different member, with no user action", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();

	// Turn 1: a document task.
	const turn1Messages = [{ role: "user", content: [{ type: "text", text: "read the inspection report and summarise the findings" }] }];
	await host.preStepListener({ agent, turn: 1, step: 1, messages: turn1Messages }, async () => ({ kind: "enter", messages: turn1Messages }));
	// Turn 2, same session, no operator action between: a coding task.
	const turn2Messages = [{ role: "user", content: [{ type: "text", text: "refactor this Python function and add unit tests" }] }];
	await host.preStepListener({ agent, turn: 2, step: 1, messages: turn2Messages }, async () => ({ kind: "enter", messages: turn2Messages }));

	const routed = agent.events.filter((event) => event.type === "router/routed");
	assert.equal(routed.length, 2, "one routing decision per turn");
	assert.equal(routed[0].data.taskType, "document");
	assert.equal(routed[0].data.selected, "Qwen/Qwen3-VL-2B-Instruct");
	assert.equal(routed[1].data.taskType, "code");
	assert.equal(routed[1].data.selected, "Qwen/Qwen2.5-Coder-1.5B-Instruct");
	assert.notEqual(routed[0].data.selected, routed[1].data.selected);
	assert.equal(routed[1].data.turn, 2);

	// Story 3.8 was only ever true of the routing chip: the decision was recorded
	// and nothing consumed it. This is the half that makes it true of the
	// inference path — the selected member has to resolve to a runtime model the
	// provider can actually be pointed at.
	const dispatch = runtimeModelForCurrentTurn(loadFleet().loaded);
	assert.equal(dispatch.reason, "routed");
	assert.equal(dispatch.member, "Qwen/Qwen2.5-Coder-1.5B-Instruct");
	assert.equal(dispatch.runtimeId, "bf-coder");
});

test("the four task types resolve onto two runtime models, with no change to the router", () => {
	// The whole point of the capability weights in score.js: `code` and
	// `calculation` land on the coder, `document` and `drawing` on the
	// vision-document member, and the drawing lane excludes the text-only coder
	// by the modality gate rather than by a rule anyone wrote.
	const fleet = loadFleet().loaded;
	const routeFor = (taskType) => resolveRuntimeModel(scoreFleet(taskType, fleet).selected, fleet);

	assert.equal(routeFor("code").runtimeId, "bf-coder");
	assert.equal(routeFor("calculation").runtimeId, "bf-coder");
	assert.equal(routeFor("document").runtimeId, "bf-vision");
	assert.equal(routeFor("drawing").runtimeId, "bf-vision");

	const drawing = scoreFleet("drawing", fleet);
	assert.deepEqual(
		drawing.excluded.map((entry) => [entry.name, entry.reason.code]),
		[["Qwen/Qwen2.5-Coder-1.5B-Instruct", "modality-missing"]],
	);
});

test("dispatch degrades to the provider default rather than throwing into a turn", () => {
	const fleet = loadFleet().loaded;
	// A member the router named but the licence gate dropped, or a registry that
	// drifted from the router. Both must be legible, not silent.
	assert.deepEqual(resolveRuntimeModel("Qwen/Qwen2.5-Coder-3B-Instruct", fleet), {
		runtimeId: null,
		member: "Qwen/Qwen2.5-Coder-3B-Instruct",
		reason: "member-not-in-fleet",
	});
	assert.equal(resolveRuntimeModel(null, fleet).reason, "no-selection");
	// A refused member legitimately carries no runtime id, because it never runs.
	assert.equal(resolveRuntimeModel("Qwen/Qwen2.5-3B-Instruct", [{ name: "Qwen/Qwen2.5-3B-Instruct" }]).reason, "member-has-no-runtime-id");

	clearRoutingDecision();
	assert.equal(runtimeModelForCurrentTurn(fleet).reason, "no-routing-decision");
});

/* -------------------------------------------------------------------------
 * Story 3.10: the first turn classifies on what was actually asked.
 *
 * `agent/pre-step`'s own payload carries `messages: claimed` — the harness's
 * `Inbox.claim()` batch for exactly this step (see `lib/index.js`'s file
 * header). These tests give the payload's `messages` and `next()`'s resolved
 * `decision.messages` *different* content, the way the real waterfall can:
 * the payload is always this turn's real claim, `decision.messages` is
 * whatever the rest of the chain (or, before this story, first-turn harness
 * timing) handed back. A listener reading `decision.messages` — the ordering
 * this story replaces — fails every one of these; reading the payload's own
 * `messages` passes all of them.
 * ---------------------------------------------------------------------- */

test("Story 3.10: classifies the first turn's clear drawing-review prompt as drawing, not the document fallback", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();
	// The P&ID prompt recorded in deferred-work.md as currently failing on turn one.
	const messages = [{ role: "user", content: [{ type: "text", text: "Review this P&ID and give me the tag inventory for the line" }] }];
	// Simulate the real first-turn failure this story fixes: `next()`'s
	// resolved decision carries no messages, exactly as the harness was
	// observed to hand back on turn one. Only the event payload's own
	// `messages` — the turn's actual claim — carries the real request.
	await host.preStepListener({ agent, turn: 1, step: 1, messages }, async () => ({ kind: "enter", messages: [] }));

	const classified = agent.events.find((event) => event.type === "router/classified");
	assert.ok(classified, "no router/classified event recorded");
	assert.equal(classified.data.taskType, "drawing", "first turn must classify on its own request text, not the empty decision.messages the old ordering read");
	assert.ok(classified.data.matchedRuleCount > 0, "matchedRuleCount must be greater than zero for a clear drawing-review prompt");
	assert.equal(classified.data.noRequestText, false);
});

test("Story 3.10: three turns of one session each classify on their own request text, never another turn's and never empty", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();

	const turns = [
		{ text: "Review this P&ID and give me the tag inventory for the line", expected: "drawing" },
		{ text: "calculate the pressure drop across this line", expected: "calculation" },
		{ text: "refactor this Python function and add unit tests", expected: "code" },
	];
	for (const [index, { text }] of turns.entries()) {
		const turn = index + 1;
		const messages = [{ role: "user", content: [{ type: "text", text }] }];
		// `next()` resolves with a decoy — a *different* turn's stale text, the
		// shape of the real bug ("turns two and three see the previous turns'
		// messages"). The fix must never read it.
		const decoy = index === 0 ? [] : [{ role: "user", content: [{ type: "text", text: turns[index - 1].text }] }];
		await host.preStepListener({ agent, turn, step: 1, messages }, async () => ({ kind: "enter", messages: decoy }));
	}

	const classified = agent.events.filter((event) => event.type === "router/classified");
	assert.equal(classified.length, 3);
	assert.deepEqual(
		classified.map((event) => event.data.taskType),
		turns.map((t) => t.expected),
		"each turn must classify on its own request text",
	);
	assert.ok(
		classified.every((event) => event.data.noRequestText === false),
		"no turn may read empty text when its own request text was available",
	);
});

test("Story 3.10: no request text found is recorded on the session, not silently folded into the fallback", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();
	// No user-role message at all in this step's claim.
	const messages = [];
	await host.preStepListener({ agent, turn: 1, step: 1, messages }, async () => ({ kind: "enter", messages }));

	const classified = agent.events.find((event) => event.type === "router/classified");
	assert.ok(classified, "no router/classified event recorded");
	assert.equal(classified.data.taskType, "document", "still falls back so routing can proceed");
	assert.equal(classified.data.matchedRuleCount, 0);
	assert.equal(classified.data.noRequestText, true, "must say explicitly that no request text was found");
});

test("Story 3.10: a fallback with request text present is not confused with no request text found", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();
	// Real text, but it trips no rule in any task type.
	const messages = [{ role: "user", content: [{ type: "text", text: "good morning" }] }];
	await host.preStepListener({ agent, turn: 1, step: 1, messages }, async () => ({ kind: "enter", messages }));

	const classified = agent.events.find((event) => event.type === "router/classified");
	assert.equal(classified.data.taskType, "document");
	assert.equal(classified.data.matchedRuleCount, 0);
	assert.equal(classified.data.noRequestText, false, "text was present, even though no rule matched it");
});

test("does not re-classify a tool-loop continuation step", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();
	const messages = [{ role: "user", content: [{ type: "text", text: "read the inspection report" }] }];
	await host.preStepListener({ agent, turn: 1, step: 2, messages }, async () => ({ kind: "enter", messages }));
	assert.deepEqual(agent.events, [], "step 2 is the same request, not a new one");
});

test("records nothing when the proposed step is rejected", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();
	await host.preStepListener({ agent, turn: 1, step: 1 }, async () => ({ kind: "reject" }));
	assert.deepEqual(agent.events, []);
});

test("a classification failure is swallowed so the turn still proceeds", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const originalWarn = console.warn;
	const warnings = [];
	console.warn = (...args) => warnings.push(args.join(" "));
	try {
		const brokenAgent = {
			session: {
				append: () => {
					throw new Error("session log unavailable");
				},
			},
		};
		const messages = [{ role: "user", content: [{ type: "text", text: "calculate the pressure drop" }] }];
		const decision = await host.preStepListener({ agent: brokenAgent, turn: 1, step: 1, messages }, async () => ({ kind: "enter", messages }));
		assert.equal(decision.kind, "enter");
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /not classified/);
});

/* -------------------------------------------------------------------------
 * The tools this plugin registers, and the channels it answers on.
 *
 * The canary was one of these until 30 August 2026 (ADR-0007). Its integration
 * cover — that an outbound attempt is denied by *the same* waterfall that
 * denies any other, and recorded in the same shape — now sits on the request a
 * user actually makes, above.
 * ---------------------------------------------------------------------- */

test("registers the report-findings tool (Story 5.1), unconditionally", () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const findingsTool = host.registeredTools.find((tool) => tool.name === "bf_report_findings");
	assert.ok(findingsTool, "no report-findings tool registered");
	assert.equal(typeof findingsTool.execute, "function");
});

test("registers the approval-note tool (Story 5.4), unconditionally", () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const approvalNoteTool = host.registeredTools.find((tool) => tool.name === "bf_approval_note");
	assert.ok(approvalNoteTool, "no approval-note tool registered");
	assert.equal(typeof approvalNoteTool.execute, "function");
	assert.equal(typeof approvalNoteTool.presentCall, "function");
});

test("registers the seal, upload and trace channels, all loopback-only", () => {
	const host = stubHostCtx();
	apply(host.ctx);
	// Every one is reachable from a browser on this machine and from nothing that
	// can merely reach the port. The upload channel carries a document the user
	// chose, so a non-loopback authority on it would be a way to push a file into
	// someone else's session; the trace channel reports what is resident in VRAM,
	// which is machine state nobody off this box should be reading; the seal
	// decides whether this machine may reach the network at all, which belongs to
	// the operator at the keyboard. Asserted rather than assumed, for each.
	assert.deepEqual(
		host.rpcChannels.map((entry) => [entry.channel, entry.options.authority]).sort(),
		[
			["/bf-seal", "loopback"],
			["/bf-trace", "loopback"],
			["/bf-upload", "loopback"],
		],
	);
});

test("a profile with no tool registry still gets the egress denial waterfall", async () => {
	const host = stubHostCtx({ tools: false });
	apply(host.ctx);
	assert.deepEqual(host.registeredTools, []);
	// The upload, trace and seal channels need only `connection` — one attaches a
	// document and calls the ingestion service directly, one reads llama-swap, and
	// the seal is the waterfall's own policy, so a profile that is sealed must be
	// able to say so and to be opened whether or not it has any tools to deny.
	assert.deepEqual(
		host.rpcChannels.map((entry) => entry.channel).sort(),
		["/bf-seal", "/bf-trace", "/bf-upload"],
	);
	const decision = await host.preExecuteListener({ name: "web_fetch", arguments: { url: "https://example.com" } }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(decision.kind, "deny");
});

test("a profile with no browser transport registers the tools but no channels", () => {
	const host = stubHostCtx({ connection: false });
	apply(host.ctx);
	assert.ok(host.registeredTools.some((tool) => tool.name === "bf_report_findings"));
	assert.deepEqual(host.rpcChannels, []);
});

test("names the target out of the parsed arguments the harness actually hands the waterfall", async () => {
	// `tools/pre-execute` receives arguments already materialised as frozen
	// JSON, not the raw model-emitted string. A `JSON.parse` of that object
	// throws, and the recorded target would read as "[object Object]".
	const agent = stubAgent();
	const host = stubHostCtx();
	apply(host.ctx);
	await host.preExecuteListener({ name: "web_fetch", arguments: { url: "https://example.com/parsed" }, agent }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(agent.events[0].data.target, "https://example.com/parsed");
});

test("names the queries out of parsed web_search arguments", async () => {
	const agent = stubAgent();
	const host = stubHostCtx();
	apply(host.ctx);
	await host.preExecuteListener({ name: "web_search", arguments: { queries: ["MRPL", "flange"] }, agent }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(agent.events[0].data.target, "MRPL, flange");
});

/* -------------------------------------------------------------------------
 * Story 5.3: a coding task runs and is verified in the sandbox.
 *
 * `pwsh` cannot be denied by name — a coding task needs it to run — so only a
 * call whose command text reaches for the network is refused, on the same
 * waterfall and recorded on the same egress/denied event.
 * ---------------------------------------------------------------------- */

test("allows a pwsh call with no network-reaching command", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const allow = { kind: "allow" };
	const decision = await host.preExecuteListener({ name: "pwsh", arguments: { command: "(1..10 | Measure-Object -Sum).Sum" } }, () => allow);
	assert.equal(decision, allow);
});

test("denies a pwsh call that shells out to Invoke-WebRequest", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener(
		{ name: "pwsh", arguments: { command: "Invoke-WebRequest -Uri https://example.com" } },
		() => {
			throw new Error("next() must not be called for a denied tool");
		},
	);
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /Invoke-WebRequest/);
});

test("denies a pwsh call that shells out to curl", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener({ name: "pwsh", arguments: { command: "curl https://example.com" } }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(decision.kind, "deny");
});

test("denies a pwsh call that opens a raw socket", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener(
		{ name: "pwsh", arguments: { command: "New-Object System.Net.Sockets.TcpClient('example.com', 80)" } },
		() => {
			throw new Error("next() must not be called for a denied tool");
		},
	);
	assert.equal(decision.kind, "deny");
});

/**
 * The coding lane writes Python (issues/08), and the seal has to know that.
 * Before 30 August 2026 it inspected PowerShell cmdlets and .NET types only, so
 * every one of these would have been permitted while the egress monitor kept
 * reading a counted zero. That is not a determined evasion — it is the first
 * thing a judge poking at the sandbox would reach.
 */
for (const [label, command] of [
	["urllib, the standard library's client", 'python -c "import urllib.request; print(urllib.request.urlopen(\'https://example.com\').read())"'],
	["requests, the one an agent reaches for unprompted", 'python -c "import requests; requests.get(\'https://example.com\')"'],
	["httpx", 'python -c "import httpx; httpx.get(\'https://example.com\')"'],
	["http.client", 'python -c "import http.client as h; h.HTTPSConnection(\'example.com\').request(\'GET\', \'/\')"'],
	["a raw socket", 'python -c "import socket; socket.socket().connect((\'example.com\', 80))"'],
	["socket.create_connection", 'python -c "from socket import create_connection; create_connection((\'example.com\', 80))"'],
	["asyncio's connector", 'python -c "import asyncio; asyncio.open_connection(\'example.com\', 80)"'],
	["smtplib", 'python -c "import smtplib; smtplib.SMTP(\'mail.example.com\')"'],
	["ftplib", 'python -c "import ftplib; ftplib.FTP(\'ftp.example.com\')"'],
	// webbrowser reaches the network without importing anything that looks like it.
	["webbrowser, which imports nothing network-shaped", 'python -c "import webbrowser; webbrowser.open(\'https://example.com\')"'],
	["the py launcher rather than python", 'py -c "import urllib.request"'],
	["python3 on PATH", 'python3 -c "import requests"'],
]) {
	test(`denies a sandbox call that reaches the network from Python: ${label}`, async () => {
		const host = stubHostCtx();
		apply(host.ctx);
		const decision = await host.preExecuteListener({ name: "pwsh", arguments: { command } }, () => {
			throw new Error("next() must not be called for a denied tool");
		});
		assert.equal(decision.kind, "deny", `PERMITTED a Python network call: ${command}`);
		assert.match(decision.reason, /denies outbound network access/);
	});
}

test("denies running Python from a file or module, because the code cannot be inspected first", async () => {
	// tools/pre-execute decides from the call's static shape, before the body
	// runs. `python -c "..."` puts the whole program in the command argument
	// where the pattern can see it; `python script.py` does not, so an agent that
	// wrote a file with tool-fs and then ran it would defeat the seal without
	// even trying. Phase 0 permits the interpreter inline only.
	for (const command of [
		"python fetch_data.py",
		"python .\\scripts\\run.py",
		"python -m http.server 8000",
		// Deliberately free of any network keyword, so this exercises the shape
		// rule rather than accidentally re-testing NETWORK_PYTHON_PATTERN — an
		// earlier fixture said `pip install requests`, which the network pattern
		// caught first and which therefore proved nothing about inspectability.
		"py -m json.tool data.json",
		"cd tmp; python main.py",
	]) {
		const host = stubHostCtx();
		apply(host.ctx);
		const decision = await host.preExecuteListener({ name: "pwsh", arguments: { command } }, () => {
			throw new Error("next() must not be called for a denied tool");
		});
		assert.equal(decision.kind, "deny", `PERMITTED an uninspectable Python invocation: ${command}`);
		assert.match(decision.reason, /cannot inspect|inline only/);
	}
});

/**
 * The launcher routes — "open WhatsApp", in every shape a model reaches for.
 *
 * These are the shapes that were PERMITTED before 30 August 2026, measured
 * against this same listener: the patterns above knew what a network client
 * looks like and nothing about what *opening* something looks like. Nothing
 * further out catches them either — the harness's sandbox states in its own
 * README that it expresses no network or process restrictions, and the Windows
 * ACL backend that confines `tool-pwsh` here restricts writes only.
 *
 * The demo asks the workbench to open WhatsApp and expects to watch it refused.
 * Each of these is a way that request can succeed instead.
 */
test("denies every shape of asking the operating system to open a web address", async () => {
	for (const command of [
		'Start-Process "https://web.whatsapp.com"',
		'Start-Process msedge "https://web.whatsapp.com"',
		"start https://web.whatsapp.com",
		'explorer.exe "https://web.whatsapp.com"',
		'Start-Process "whatsapp://send?text=hi"',
		'cmd /c start "" https://web.whatsapp.com',
		'[System.Diagnostics.Process]::Start("https://web.whatsapp.com")',
		'Invoke-Item "https://web.whatsapp.com"',
		'rundll32 url.dll,FileProtocolHandler "https://web.whatsapp.com"',
		'Start-Process chrome "https://web.whatsapp.com"',
	]) {
		const host = stubHostCtx();
		apply(host.ctx);
		const decision = await host.preExecuteListener({ name: "pwsh", arguments: { command } }, () => {
			throw new Error("next() must not be called for a denied tool");
		});
		assert.equal(decision.kind, "deny", `PERMITTED a launcher route: ${command}`);
		assert.match(decision.reason, /open something outside this application|carried a web address/);
	}
});

test("a denied launcher call lands on the same egress/denied event the monitor counts", async () => {
	const agent = stubAgent();
	const host = stubHostCtx();
	apply(host.ctx);
	await host.preExecuteListener(
		{ name: "pwsh", arguments: { command: 'Start-Process "https://web.whatsapp.com"' }, agent },
		() => {
			throw new Error("next() must not be called for a denied tool");
		},
	);
	// The ledger and the counted zero read this event and nothing else, so a
	// denial the monitor cannot see is a denial that proves nothing.
	assert.equal(agent.events.length, 1);
	assert.equal(agent.events[0].type, "egress/denied");
	assert.equal(agent.events[0].data.tool, "pwsh");
	assert.match(agent.events[0].data.target, /web\.whatsapp\.com/);
});

test("the launcher policy does not deny the cmdlets it shares a prefix with", async () => {
	// `\bstart\b` matches the first half of `Start-Sleep`, which is why the
	// launcher pattern matches whole hyphenated names and leaves a bare `start`
	// to the web-address rule. A seal that stops the sandbox sleeping is a seal
	// that gets switched off.
	for (const command of [
		"Start-Sleep -Seconds 1",
		"Start-Job { 1 + 1 }",
		"Get-Process | Select-Object -First 3",
		'python -c "print(\'chrome is a word, not a launch\')"',
	]) {
		const host = stubHostCtx();
		apply(host.ctx);
		let reached = false;
		const decision = await host.preExecuteListener({ name: "pwsh", arguments: { command } }, () => {
			reached = true;
			return { kind: "allow" };
		});
		assert.ok(reached, `the waterfall did not pass through a benign command: ${command}`);
		assert.equal(decision.kind, "allow");
	}
});

test("the seal does not deny the ordinary sandbox work the coding lane depends on", async () => {
	// A seal that blocks the lane it exists to protect is worse than no seal,
	// because it gets switched off. These are the shapes the coding lane actually
	// emits, plus the interpreter's own harmless forms.
	for (const command of [
		'python -c "print(sum(range(1, 101)))"',
		'python -c "actual = (9.5 - 7.2) / 9.5 * 100; print(round(actual, 1))"',
		"python --version",
		"python -V",
		'python -c "import math, json, statistics; print(math.pi)"',
		"(1..10 | Measure-Object -Sum).Sum",
		"Get-ChildItem -Name",
	]) {
		const host = stubHostCtx();
		apply(host.ctx);
		let reached = false;
		const decision = await host.preExecuteListener({ name: "pwsh", arguments: { command } }, () => {
			reached = true;
			return { kind: "allow" };
		});
		assert.ok(reached, `the waterfall did not pass through a benign command: ${command}`);
		assert.equal(decision.kind, "allow");
	}
});

test("a denied Python network call lands on the same egress/denied event the monitor counts", async () => {
	const agent = stubAgent();
	const host = stubHostCtx();
	apply(host.ctx);
	await host.preExecuteListener(
		{ name: "pwsh", arguments: { command: 'python -c "import requests; requests.get(\'https://example.com\')"' }, agent },
		() => {
			throw new Error("next() must not be called for a denied tool");
		},
	);
	// The counted zero is the number of these events (FR15), so a denial the
	// monitor cannot see is a denial that proves nothing.
	assert.equal(agent.events.length, 1);
	assert.equal(agent.events[0].type, "egress/denied");
	assert.equal(agent.events[0].data.tool, "pwsh");
	assert.match(agent.events[0].data.target, /requests/);
});

test("a denied pwsh call is recorded on the same egress/denied event the monitor counts", async () => {
	const agent = stubAgent();
	const host = stubHostCtx();
	apply(host.ctx);
	await host.preExecuteListener({ name: "pwsh", arguments: { command: "curl https://example.com" }, agent }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(agent.events.length, 1);
	assert.equal(agent.events[0].type, "egress/denied");
	assert.equal(agent.events[0].data.tool, "pwsh");
	assert.match(agent.events[0].data.target, /curl/);
});

test("a pwsh call with no command argument is allowed through to the tool body", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const allow = { kind: "allow" };
	const decision = await host.preExecuteListener({ name: "pwsh", arguments: {} }, () => allow);
	assert.equal(decision, allow);
});

test("records something auditable even for arguments in a shape it has never seen", async () => {
	const agent = stubAgent();
	const host = stubHostCtx();
	apply(host.ctx);
	await host.preExecuteListener({ name: "web_fetch", arguments: { host: "example.com", port: 443 }, agent }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(agent.events[0].data.target, '{"host":"example.com","port":443}');
});

/* ---------------------------------------------------------------------------
 * The seal, seen from the waterfall (`lib/egress/seal.js`)
 *
 * `test/seal.test.js` covers the seal's own behaviour. These are the integration
 * half: that the denial waterfall actually consults it, that an open seal lets
 * the call run rather than pretending to, and that letting it run is recorded as
 * plainly as refusing it would have been.
 * ------------------------------------------------------------------------- */

test("the seal is closed when the plugin mounts, so a fresh boot denies", async () => {
	setSealed(true);
	const host = stubHostCtx();
	apply(host.ctx);
	assert.equal(isSealed(), true);
	const decision = await host.preExecuteListener({ name: "web_fetch", arguments: { url: "https://example.com" } }, () => {
		throw new Error("next() must not be called while the seal is closed");
	});
	assert.equal(decision.kind, "deny");
});

test("with the seal open the call is genuinely allowed to run, not pretended at", async () => {
	setSealed(false);
	try {
		const agent = stubAgent();
		const host = stubHostCtx({ agent });
		apply(host.ctx);
		let reached = false;
		const decision = await host.preExecuteListener(
			{ name: "web_fetch", arguments: { url: "https://example.com" }, agent },
			() => {
				reached = true;
				return { kind: "allow" };
			},
		);
		assert.equal(decision.kind, "allow");
		assert.equal(reached, true, "an open seal must let the waterfall continue, not fake a permit");
	} finally {
		setSealed(true);
	}
});

test("permitting is recorded as loudly as denying — the log is not a list of successes", async () => {
	setSealed(false);
	try {
		const agent = stubAgent();
		const host = stubHostCtx({ agent });
		apply(host.ctx);
		await host.preExecuteListener({ name: "web_fetch", arguments: { url: "https://example.com/x" }, agent }, () => ({
			kind: "allow",
		}));
		assert.equal(agent.events.length, 1);
		assert.equal(agent.events[0].type, "egress/permitted");
		assert.equal(agent.events[0].data.tool, "web_fetch");
		assert.equal(agent.events[0].data.target, "https://example.com/x");
	} finally {
		setSealed(true);
	}
});

test("the open seal covers the sandbox shell too, on the same permitted event", async () => {
	setSealed(false);
	try {
		const agent = stubAgent();
		const host = stubHostCtx({ agent });
		apply(host.ctx);
		const decision = await host.preExecuteListener(
			{ name: "pwsh", arguments: { command: "Invoke-WebRequest https://example.com" }, agent },
			() => ({ kind: "allow" }),
		);
		assert.equal(decision.kind, "allow");
		assert.equal(agent.events[0].type, "egress/permitted");
		assert.match(agent.events[0].data.target, /Invoke-WebRequest/);
	} finally {
		setSealed(true);
	}
});

test("opening the seal over its own channel is what changes the waterfall's answer", async () => {
	// End to end, through the same loopback channel the control posts to: no
	// second mechanism, and no code edit. Before the seal existed, making this
	// call succeed meant deleting a line from NETWORK_TOOL_NAMES and restarting.
	//
	// The call is the demo's own request — "open WhatsApp" — because that is now
	// the calibration (ADR-0007): the same words are refused with the seal closed
	// and permitted with it open, which is what makes the monitor an instrument
	// rather than an assertion. An instrument that can only ever return one
	// answer is not an instrument.
	setSealed(true);
	try {
		const agent = stubAgent();
		const host = stubHostCtx({ agent });
		apply(host.ctx);
		const seal = host.rpcChannels.find((row) => row.channel === "/bf-seal");
		await seal.handler("open", { sessionId: "s1" });

		const decision = await host.preExecuteListener(
			{ name: "pwsh", arguments: { command: 'Start-Process "https://web.whatsapp.com"' }, agent },
			() => ({ kind: "allow" }),
		);
		assert.equal(decision.kind, "allow");
		assert.deepEqual(
			agent.events.map((event) => event.type),
			["egress/seal", "egress/permitted"],
		);
	} finally {
		setSealed(true);
	}
});
