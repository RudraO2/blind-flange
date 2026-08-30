/**
 * Tests for the canary (Story 2.3): the tool whose body genuinely reaches for
 * the network, and the loopback RPC handler the composer button fires it
 * through.
 *
 * The point of most of these is the story's first criterion — "a real outbound
 * connection is attempted — not simulated". A button that appended an
 * `egress/denied` event by hand would pass every visible check and prove
 * nothing, so what is asserted here is that the tool body reaches a real
 * `fetch` with the configured target, and that the handler's only route to a
 * recorded denial runs through the ordinary `tools.execute` pipeline.
 *
 *     node --test plugins/dsh-client-ui-base/test/*.test.js
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
	CANARY_CHANNEL,
	CANARY_ENDPOINT,
	CANARY_TIMEOUT_MS,
	CANARY_TOOL_NAME,
	createCanaryRpcHandler,
	createCanaryTool,
	DEFAULT_CANARY_TARGET,
} from "../lib/egress/canary.js";

const TARGET = "https://example.com/blind-flange-canary";

/** A `ctx.tools` stub recording dispatches and answering with a fixed result. */
function stubTools(result) {
	const calls = [];
	return {
		calls,
		execute: (exec) => {
			calls.push(exec);
			return Promise.resolve(result);
		},
	};
}

/** A denial, shaped the way the harness materialises a `{ kind: 'deny' }` verdict. */
const DENIED = { isError: true, error: { message: "Blind Flange denies outbound network access" }, content: [] };

test("the default target is a real address, not a placeholder the seal would never be tested against", () => {
	const url = new URL(DEFAULT_CANARY_TARGET);
	assert.equal(url.protocol, "https:");
	assert.equal(url.hostname, "example.com");
});

test("the tool body actually calls fetch — the attempt is real, not simulated", async () => {
	const attempts = [];
	const tool = createCanaryTool(TARGET, (url, init) => {
		attempts.push({ url, init });
		return Promise.resolve({ status: 204 });
	});
	const value = await tool.execute({}, { signal: undefined });
	assert.equal(attempts.length, 1, "the canary must reach a real outbound call, not fake one");
	assert.equal(attempts[0].url, TARGET);
	assert.equal(attempts[0].init.method, "GET");
	assert.deepEqual(value, { target: TARGET, status: 204 });
});

test("the caller's cancellation still stops the attempt, alongside the deadline", async () => {
	// The signal handed to fetch is no longer the caller's own object — it is
	// the caller's cancellation composed with CANARY_TIMEOUT_MS, so that a call
	// a host firewall discards in silence still ends. What has to hold is the
	// behaviour, not the identity: aborting the caller's signal must still abort
	// the attempt.
	const attempts = [];
	const controller = new AbortController();
	const tool = createCanaryTool(TARGET, (url, init) => {
		attempts.push(init);
		return Promise.resolve({ status: 200 });
	});
	await tool.execute({}, { signal: controller.signal });

	const forwarded = attempts[0].signal;
	assert.ok(forwarded instanceof AbortSignal);
	assert.equal(forwarded.aborted, false);
	controller.abort();
	assert.equal(forwarded.aborted, true, "the caller must still be able to cancel the attempt");
});

test("an explicit target argument overrides the configured one", async () => {
	const attempts = [];
	const tool = createCanaryTool(TARGET, (url) => {
		attempts.push(url);
		return Promise.resolve({ status: 200 });
	});
	await tool.execute({ target: "https://example.net/elsewhere" }, {});
	assert.equal(attempts[0], "https://example.net/elsewhere");
});

test("the definition carries everything ToolRuntime.register demands", () => {
	const tool = createCanaryTool(TARGET, () => Promise.resolve({ status: 200 }));
	assert.equal(tool.name, CANARY_TOOL_NAME);
	assert.equal(typeof tool.description, "string");
	assert.equal(tool.parameters.type, "object");
	assert.equal(typeof tool.output, "object");
	assert.equal(tool.output.schema.type, "object");
	assert.equal(typeof tool.output.render, "function");
	assert.equal(typeof tool.execute, "function");
	const content = tool.output.render({}, { target: TARGET, status: 200 });
	assert.equal(content[0].type, "text");
	assert.match(content[0].text, /Egress denial did not refuse this call/);
});

test("firing dispatches the canary through tools.execute, carrying the session's agent", async () => {
	const agent = { session: { append: () => {} } };
	const tools = stubTools(DENIED);
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => agent }, target: TARGET });
	const result = await handler(CANARY_ENDPOINT, { sessionId: "s1" }, undefined);

	assert.equal(tools.calls.length, 1);
	const exec = tools.calls[0];
	assert.equal(exec.name, CANARY_TOOL_NAME, "the canary must go through the ordinary tool pipeline");
	assert.equal(exec.agent, agent, "without the agent the denial lands nowhere the monitor can read");
	assert.deepEqual(exec.arguments, { target: TARGET });
	assert.equal(typeof exec.callId, "string");
	assert.deepEqual(result, {
		ok: true,
		value: { outcome: "refused", sealed: true, target: TARGET, detail: DENIED.error.message },
	});
});

test("two presses never share a call id", async () => {
	const tools = stubTools(DENIED);
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => ({}) }, target: TARGET });
	await handler(CANARY_ENDPOINT, { sessionId: "s1" }, undefined);
	await handler(CANARY_ENDPOINT, { sessionId: "s1" }, undefined);
	assert.notEqual(tools.calls[0].callId, tools.calls[1].callId);
});

test("an omitted seal reading is treated as sealed — a forgetful caller gets the safe answer", async () => {
	const tools = stubTools(DENIED);
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => ({}) }, target: TARGET });
	const result = await handler(CANARY_ENDPOINT, { sessionId: "s1" }, undefined);
	assert.equal(result.value.outcome, "refused");
	assert.equal(result.value.sealed, true);
});

test("with the seal open and the call arriving, the outcome is 'reached' — the alarm can fire", async () => {
	// The calibration case. An instrument that can only ever return one answer
	// is not an instrument, and this is the answer that proves it is measuring
	// rather than asserting: the seal was open, the call went out, it arrived.
	const events = [];
	const agent = { session: { append: (type, data) => events.push({ type, data }) } };
	const tools = stubTools({ isError: false, value: { target: TARGET, status: 200 }, content: [] });
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => agent }, target: TARGET, sealed: () => false });
	const result = await handler(CANARY_ENDPOINT, { sessionId: "s1" }, undefined);

	assert.equal(result.value.outcome, "reached");
	assert.equal(result.value.sealed, false);
	assert.equal(events.length, 1, "a call that got out must be recorded — that is the loudest fact this system has");
	assert.equal(events[0].type, "egress/escaped");
	assert.equal(events[0].data.reached, true);
	assert.equal(events[0].data.target, TARGET);
});

test("with the seal open and the call dying outside, we claim neither the refusal nor the record", async () => {
	// The demo's second beat: our own policy stood aside, the call genuinely
	// left this process, and a host firewall discarded it. Reporting this as a
	// denial — which the pre-seal handler did, because it read any error as one
	// — would have the button assert an audit entry the monitor could not
	// corroborate, because our waterfall never ran and never wrote one.
	const events = [];
	const agent = { session: { append: (type, data) => events.push({ type, data }) } };
	const tools = stubTools({ isError: true, error: { message: "fetch failed" }, content: [] });
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => agent }, target: TARGET, sealed: () => false });
	const result = await handler(CANARY_ENDPOINT, { sessionId: "s1" }, undefined);

	assert.equal(result.value.outcome, "stopped-outside");
	assert.notEqual(result.value.outcome, "refused", "only our own waterfall may be reported as a refusal");
	assert.equal(events[0].type, "egress/escaped");
	assert.equal(events[0].data.reached, false);
	assert.match(events[0].data.detail, /fetch failed/);
});

test("the attempt is bounded, so a silently dropped packet reads as evidence and not as a hang", async () => {
	// A host firewall discards rather than refuses and sends nothing back, so an
	// unbounded fetch waits for minutes. NFR2: a control that spins that long on
	// stage reads as a crash.
	assert.equal(typeof CANARY_TIMEOUT_MS, "number");
	assert.ok(CANARY_TIMEOUT_MS > 0 && CANARY_TIMEOUT_MS <= 5000, "the wait has to be legible, not indefinite");

	let seen;
	const tool = createCanaryTool(TARGET, (_url, init) => {
		seen = init.signal;
		return Promise.resolve({ status: 204 });
	});
	await tool.execute({}, { signal: undefined });
	assert.ok(seen instanceof AbortSignal, "the outbound call must carry a deadline");
});

test("an unknown endpoint on the channel is refused rather than dispatched", async () => {
	const tools = stubTools(DENIED);
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => ({}) }, target: TARGET });
	const result = await handler("something-else", { sessionId: "s1" }, undefined);
	assert.equal(result.ok, false);
	assert.equal(result.error.code, "unknown-command");
	assert.deepEqual(tools.calls, []);
});

test("a fire with no session is refused: a denial nobody can see is the silence this replaces", async () => {
	const tools = stubTools(DENIED);
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => ({}) }, target: TARGET });
	const result = await handler(CANARY_ENDPOINT, {}, undefined);
	assert.equal(result.ok, false);
	assert.deepEqual(tools.calls, []);
});

test("a fire for a session with no live agent is refused rather than dispatched agentless", async () => {
	const tools = stubTools(DENIED);
	const handler = createCanaryRpcHandler({ tools, agents: { get: () => undefined }, target: TARGET });
	const result = await handler(CANARY_ENDPOINT, { sessionId: "gone" }, undefined);
	assert.equal(result.ok, false);
	assert.match(result.error.message, /no live agent/);
	assert.deepEqual(tools.calls, []);
});

test("the channel is a single path segment, which is all the harness's channel pattern allows", () => {
	assert.match(CANARY_CHANNEL, /^\/[A-Za-z0-9._~-]+$/);
});
