/**
 * Tests for the base plugin's host half: the favicon route and the index.html
 * title/favicon swap (Story 1.5), both reached through `ctx.webServer`'s own
 * extension points (`register`, `tapIndex`) rather than any harness file
 * edit, plus the egress denial waterfall (Story 2.1) registered on
 * `tools/pre-execute`, plus the model plane adapter registration (Story 3.1)
 * on `ctx.llm`, plus the router's classifier (Story 3.5) and fleet scorer
 * (Story 3.6) on `agent/pre-step`.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { apply, inject } from "../lib/index.js";

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
 * for a profile with no tool registry or no browser transport, where the canary
 * (Story 2.3) has nothing to register into and the seal still holds.
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
	assert.ok(rendered.includes("<title>Blind Flange</title>"), "title was not swapped");
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
	assert.match(warnings[0], /egress denial not recorded/);
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
	const decision = await host.preStepListener({ agent, turn: 1, step: 1 }, async () => ({ kind: "enter", messages }));

	assert.deepEqual(decision, { kind: "enter", messages }, "the listener must pass the loop's decision through unchanged");
	assert.equal(agent.events.length, 2);
	assert.equal(agent.events[0].type, "router/classified");
	assert.equal(agent.events[0].data.taskType, "code");
	assert.equal(agent.events[0].data.turn, 1);
	assert.equal(typeof agent.events[0].data.scores.document, "number");
});

test("scores the licence-checked fleet against the classified task type and records the routing decision (Story 3.6)", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);

	const agent = stubAgent();
	const messages = [{ role: "user", content: [{ type: "text", text: "Refactor this Python function and add unit tests" }] }];
	await host.preStepListener({ agent, turn: 2, step: 1 }, async () => ({ kind: "enter", messages }));

	const routed = agent.events.find((event) => event.type === "router/routed");
	assert.ok(routed, "no router/routed event recorded");
	assert.equal(routed.data.taskType, "code");
	assert.equal(routed.data.turn, 2);
	assert.equal(routed.data.selected, "Qwen/Qwen2.5-Coder-7B-Instruct");
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
		const decision = await host.preStepListener({ agent, turn: 1, step: 1 }, async () => ({ kind: "enter", messages }));
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
	await host.preStepListener(
		{ agent, turn: 1, step: 1 },
		async () => ({ kind: "enter", messages: [{ role: "user", content: [{ type: "text", text: "read the inspection report and summarise the findings" }] }] }),
	);
	// Turn 2, same session, no operator action between: a coding task.
	await host.preStepListener(
		{ agent, turn: 2, step: 1 },
		async () => ({ kind: "enter", messages: [{ role: "user", content: [{ type: "text", text: "refactor this Python function and add unit tests" }] }] }),
	);

	const routed = agent.events.filter((event) => event.type === "router/routed");
	assert.equal(routed.length, 2, "one routing decision per turn");
	assert.equal(routed[0].data.taskType, "document");
	assert.equal(routed[0].data.selected, "Qwen/Qwen2.5-VL-7B-Instruct");
	assert.equal(routed[1].data.taskType, "code");
	assert.equal(routed[1].data.selected, "Qwen/Qwen2.5-Coder-7B-Instruct");
	assert.notEqual(routed[0].data.selected, routed[1].data.selected);
	assert.equal(routed[1].data.turn, 2);
});

test("does not re-classify a tool-loop continuation step", async () => {
	const host = stubHostCtx({ webServer: false });
	apply(host.ctx);
	const agent = stubAgent();
	const messages = [{ role: "user", content: [{ type: "text", text: "read the inspection report" }] }];
	await host.preStepListener({ agent, turn: 1, step: 2 }, async () => ({ kind: "enter", messages }));
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
		const decision = await host.preStepListener({ agent: brokenAgent, turn: 1, step: 1 }, async () => ({ kind: "enter", messages }));
		assert.equal(decision.kind, "enter");
	} finally {
		console.warn = originalWarn;
	}
	assert.equal(warnings.length, 1);
	assert.match(warnings[0], /not classified/);
});

/* -------------------------------------------------------------------------
 * The canary (Story 2.3)
 *
 * These are the integration half — that the canary is denied by *the same*
 * waterfall that denies any other attempt, and recorded in the same shape.
 * The tool body and the RPC handler are tested on their own in
 * `canary.test.js`.
 * ---------------------------------------------------------------------- */

test("registers the canary as a real tool, not a private code path", () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const canary = host.registeredTools.find((tool) => tool.name === "bf_canary");
	assert.ok(canary, "no canary tool registered");
	assert.equal(typeof canary.execute, "function");
});

test("registers the report-findings tool (Story 5.1), unconditionally like the canary", () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const findingsTool = host.registeredTools.find((tool) => tool.name === "bf_report_findings");
	assert.ok(findingsTool, "no report-findings tool registered");
	assert.equal(typeof findingsTool.execute, "function");
});

test("registers the canary channel loopback-only", () => {
	const host = stubHostCtx();
	apply(host.ctx);
	assert.equal(host.rpcChannels.length, 1);
	assert.equal(host.rpcChannels[0].channel, "/bf-canary");
	assert.equal(host.rpcChannels[0].options.authority, "loopback");
});

test("the canary is denied by the same waterfall that denies any other attempt", async () => {
	const host = stubHostCtx();
	apply(host.ctx);
	const decision = await host.preExecuteListener({ name: "bf_canary", arguments: { target: "https://example.com/x" } }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(decision.kind, "deny");
	assert.match(decision.reason, /https:\/\/example\.com\/x/);
});

test("firing the canary records a denial in the same shape as any other denial", async () => {
	const agent = stubAgent();
	const host = stubHostCtx({ agent });
	apply(host.ctx);
	const result = await host.rpcChannels[0].handler("fire", { sessionId: "s1" }, undefined);

	assert.equal(result.ok, true);
	assert.equal(result.value.denied, true, "the canary must be refused, not allowed");
	assert.equal(agent.events.length, 1);
	assert.equal(agent.events[0].type, "egress/denied");
	assert.equal(agent.events[0].data.tool, "bf_canary");
	assert.equal(agent.events[0].data.target, "https://example.com/blind-flange-canary");
});

test("the tool body never runs while the seal holds — the denial comes before the attempt", async () => {
	const agent = stubAgent();
	const host = stubHostCtx({ agent });
	const originalFetch = globalThis.fetch;
	let reached = false;
	globalThis.fetch = () => {
		reached = true;
		return Promise.resolve({ status: 200 });
	};
	try {
		apply(host.ctx);
		await host.rpcChannels[0].handler("fire", { sessionId: "s1" }, undefined);
	} finally {
		globalThis.fetch = originalFetch;
	}
	assert.equal(reached, false, "pre-execute must deny before the canary's fetch runs");
});

test("each press adds one denial, so the monitor's counter increments", async () => {
	const agent = stubAgent();
	const host = stubHostCtx({ agent });
	apply(host.ctx);
	await host.rpcChannels[0].handler("fire", { sessionId: "s1" }, undefined);
	await host.rpcChannels[0].handler("fire", { sessionId: "s1" }, undefined);
	assert.equal(agent.events.filter((event) => event.type === "egress/denied").length, 2);
});

test("the canary target is a config value, not a code change", async () => {
	const agent = stubAgent();
	const host = stubHostCtx({ agent });
	apply(host.ctx, { canary: { target: "https://example.net/probe" } });
	await host.rpcChannels[0].handler("fire", { sessionId: "s1" }, undefined);
	assert.equal(agent.events[0].data.target, "https://example.net/probe");
});

test("a profile with no tool registry still gets the egress denial waterfall", async () => {
	const host = stubHostCtx({ tools: false });
	apply(host.ctx);
	assert.deepEqual(host.registeredTools, []);
	assert.deepEqual(host.rpcChannels, []);
	const decision = await host.preExecuteListener({ name: "web_fetch", arguments: { url: "https://example.com" } }, () => {
		throw new Error("next() must not be called for a denied tool");
	});
	assert.equal(decision.kind, "deny");
});

test("a profile with no browser transport registers the tools but no canary channel", () => {
	const host = stubHostCtx({ connection: false });
	apply(host.ctx);
	assert.ok(host.registeredTools.some((tool) => tool.name === "bf_canary"));
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
