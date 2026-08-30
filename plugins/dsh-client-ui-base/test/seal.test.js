/**
 * Tests for the seal (`lib/egress/seal.js`).
 *
 * The seal is the switch that makes the egress claim checkable. Before it, the
 * denial waterfall refused everything unconditionally and the only evidence of
 * a refusal was our own panel turning red — a loop nobody outside this codebase
 * can inspect. What is asserted here is the part that opens that loop safely:
 * that it is closed until someone deliberately opens it, that a restart closes
 * it again, and that both directions leave a record.
 *
 *     node --test plugins/dsh-client-ui-base/test/*.test.js
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
	createSealRpcHandler,
	isSealed,
	SEAL_CHANNEL,
	SEAL_ENDPOINTS,
	SEAL_EVENT,
	setSealed,
} from "../lib/egress/seal.js";

/** An agent whose session records what was appended to it. */
function stubAgent() {
	const events = [];
	return { events, session: { append: (type, data) => events.push({ type, data }) } };
}

/** Put the module back to its boot state; it is process-wide by design. */
function reset() {
	setSealed(true);
}

test("the seal is closed before anything asks — the safe state is the default, not a setting", () => {
	reset();
	assert.equal(isSealed(), true);
});

test("`get` reports the state and changes nothing", async () => {
	reset();
	const handler = createSealRpcHandler({ agents: { get: () => stubAgent() } });
	const result = await handler("get", { sessionId: "s1" });
	assert.deepEqual(result, { ok: true, value: { sealed: true } });
	assert.equal(isSealed(), true);
});

test("opening the seal takes effect and is recorded against the session it was done in", async () => {
	reset();
	const agent = stubAgent();
	const handler = createSealRpcHandler({ agents: { get: () => agent } });
	const result = await handler("open", { sessionId: "s1" });

	assert.equal(result.value.sealed, false);
	assert.equal(isSealed(), false, "the seal must actually open, not merely report that it did");
	assert.equal(agent.events.length, 1, "an opening that left no trace would make every zero unfalsifiable");
	assert.equal(agent.events[0].type, SEAL_EVENT);
	assert.equal(agent.events[0].data.sealed, false);
	assert.equal(agent.events[0].data.changed, true);
	reset();
});

test("closing it again is recorded too — the log is not a list of this system's own successes", async () => {
	reset();
	const agent = stubAgent();
	const handler = createSealRpcHandler({ agents: { get: () => agent } });
	await handler("open", { sessionId: "s1" });
	await handler("close", { sessionId: "s1" });

	assert.equal(isSealed(), true);
	assert.equal(agent.events.length, 2);
	assert.equal(agent.events[1].data.sealed, true);
});

test("a press that changes nothing is still recorded, marked as changing nothing", async () => {
	// Deciding on the operator's behalf which of their actions are worth writing
	// down is how an audit trail stops being one.
	reset();
	const agent = stubAgent();
	const handler = createSealRpcHandler({ agents: { get: () => agent } });
	await handler("close", { sessionId: "s1" });
	assert.equal(agent.events.length, 1);
	assert.equal(agent.events[0].data.changed, false);
});

test("a seal change with no reachable session still takes effect", async () => {
	// The seal and the record are not the same guarantee. Failing the change
	// because the log was unreachable would leave the operator's intent and the
	// machine's behaviour disagreeing, which is worse than a gap in one list.
	reset();
	const handler = createSealRpcHandler({ agents: { get: () => undefined } });
	const result = await handler("open", { sessionId: "gone" });
	assert.equal(result.ok, true);
	assert.equal(isSealed(), false);
	reset();
});

test("an append failure does not fail the change", async () => {
	reset();
	const agents = {
		get: () => ({
			session: {
				append: () => {
					throw new Error("log unavailable");
				},
			},
		}),
	};
	const handler = createSealRpcHandler({ agents });
	const result = await handler("open", { sessionId: "s1" });
	assert.equal(result.ok, true);
	assert.equal(isSealed(), false);
	reset();
});

test("an unknown endpoint is refused rather than guessed at", async () => {
	reset();
	const handler = createSealRpcHandler({ agents: { get: () => stubAgent() } });
	const result = await handler("unseal-everything", { sessionId: "s1" });
	assert.equal(result.ok, false);
	assert.equal(result.error.code, "unknown-command");
	assert.equal(isSealed(), true, "an unrecognised command must never change the seal");
});

test("the channel is a single path segment, which is all the harness's channel pattern allows", () => {
	assert.match(SEAL_CHANNEL, /^\/[A-Za-z0-9._~-]+$/);
	assert.deepEqual(SEAL_ENDPOINTS, ["get", "open", "close"]);
});
