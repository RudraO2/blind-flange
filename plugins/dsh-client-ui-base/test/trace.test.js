/**
 * Tests for the residency channel (`trace/rpc.js`) and the turn state it reads
 * (`trace/turn.js`).
 *
 * The thing worth being strict about is the difference between "nothing is
 * loaded" and "nothing is answering". llama-swap returns an empty list when it is
 * up and idle, so a panel that treats empty as broken would cry wolf every time
 * a model timed out, and one that treats unreachable as idle would show a
 * comfortable "VRAM idle" while the inference runtime was dead. Those are the two
 * states a demo most needs told apart.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { clearRoutingDecision, recordRoutingDecision } from "../lib/router/dispatch.js";
import { createTraceRpcHandler, TRACE_ENDPOINT } from "../lib/trace/rpc.js";
import { clearTurn, imagesThisTurn, recordImages, recordTool, toolsRunThisTurn } from "../lib/trace/turn.js";

/** A stub llama-swap: `/running` answers `running`, `/health` answers 200. */
async function startStub(running, { health = true } = {}) {
	const server = createServer((req, res) => {
		if (req.url === "/running") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ running }));
			return;
		}
		if (req.url === "/health") {
			res.writeHead(health ? 200 : 503).end(health ? "OK" : "");
			return;
		}
		res.writeHead(404).end();
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		endpoint: `http://127.0.0.1:${server.address().port}`,
		async stop() {
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

const READY = [{ model: "bf-coder", state: "ready", ttl: 300, name: "Faraday — coder (1.5B)", cmd: "D:/ai/... --model x.gguf", proxy: "" }];

test("turn state records how the text was obtained and what ran, in order", () => {
	clearTurn();
	assert.equal(imagesThisTurn(), 0);
	assert.deepEqual(toolsRunThisTurn(), []);

	recordImages(3);
	recordTool("bf_report_findings", { outcome: "3 lines", seconds: 7.4 });
	recordTool("pwsh", { outcome: "agrees — the sandbox computed 5050" });

	assert.equal(imagesThisTurn(), 3);
	assert.deepEqual(
		toolsRunThisTurn().map((tool) => tool.name),
		["bf_report_findings", "pwsh"],
	);
	clearTurn();
});

test("the channel reports what is resident, dropping the fields that would mislead", async () => {
	const stub = await startStub(READY);
	clearTurn();
	clearRoutingDecision();
	try {
		const handle = createTraceRpcHandler({ endpoint: stub.endpoint, providerName: "local" });
		const result = await handle(TRACE_ENDPOINT);
		assert.equal(result.ok, true);
		assert.equal(result.value.runtimeReachable, true);
		assert.deepEqual(result.value.residency, [
			{ model: "bf-coder", state: "ready", name: "Faraday — coder (1.5B)", ttl: 300 },
		]);
		// `cmd` carries absolute weights paths that are noise on screen, and `proxy`
		// is llama-swap's *configured* value — the empty string whenever the config
		// relies on its ${PORT} default, so rendering it would look like a missing
		// address rather than an absent setting.
		assert.equal("cmd" in result.value.residency[0], false);
		assert.equal("proxy" in result.value.residency[0], false);
		assert.equal(result.value.providerName, "local");
	} finally {
		await stub.stop();
	}
});

test("nothing loaded and nothing answering are different states", async () => {
	// llama-swap returns [] when it is up and idle. A panel that treated empty as
	// broken would cry wolf every time a model's TTL expired.
	const idle = await startStub([]);
	try {
		const result = await createTraceRpcHandler({ endpoint: idle.endpoint })(TRACE_ENDPOINT);
		assert.deepEqual(result.value.residency, []);
		assert.equal(result.value.runtimeReachable, true, "up and idle must not read as unreachable");
	} finally {
		await idle.stop();
	}

	// And the inverse: a comfortable "VRAM idle" while the runtime is dead is the
	// worse of the two mistakes, because it hides the reason nothing works.
	const dead = await createTraceRpcHandler({ endpoint: "http://127.0.0.1:1" })(TRACE_ENDPOINT);
	assert.deepEqual(dead.value.residency, []);
	assert.equal(dead.value.runtimeReachable, false);
});

test("a runtime answering /running but failing /health is reported unreachable", async () => {
	const sick = await startStub([], { health: false });
	try {
		const result = await createTraceRpcHandler({ endpoint: sick.endpoint })(TRACE_ENDPOINT);
		assert.equal(result.value.runtimeReachable, false);
	} finally {
		await sick.stop();
	}
});

test("the turn summary carries the route and the dispatch reason, not the whole decision", async () => {
	const stub = await startStub(READY);
	clearTurn();
	try {
		recordRoutingDecision(
			{ taskType: "code", scored: [], excluded: [], selected: "Qwen/Qwen3-4B", tied: false, allZero: false },
			1,
		);
		recordImages(1);
		recordTool("pwsh", { outcome: "agrees" });

		const result = await createTraceRpcHandler({ endpoint: stub.endpoint, providerName: "local" })(TRACE_ENDPOINT);
		assert.equal(result.value.taskType, "code");
		assert.equal(result.value.selected, "Qwen/Qwen3-4B");
		assert.equal(result.value.runtimeId, "bf-coder");
		assert.equal(result.value.dispatchReason, "routed");
		assert.equal(result.value.images, 1);
		assert.deepEqual(result.value.tools, [{ name: "pwsh", outcome: "agrees", seconds: undefined }]);

		// A summary, not a duplicate. The routing chip beside this one already
		// carries every score and every exclusion, and two places holding the same
		// data is two places to keep right.
		assert.equal("scored" in result.value, false);
		assert.equal("excluded" in result.value, false);
	} finally {
		clearRoutingDecision();
		clearTurn();
		await stub.stop();
	}
});

test("the channel never reports an egress number, from any source", async () => {
	// FR15 requires the counted zero to be a count of egress/denied events, and the
	// egress monitor already does that. A second path to the one number this
	// product's claim rests on is a second thing to be wrong. Asserted so nobody
	// adds a convenient counter here later.
	const stub = await startStub(READY);
	try {
		const result = await createTraceRpcHandler({ endpoint: stub.endpoint })(TRACE_ENDPOINT);
		assert.doesNotMatch(JSON.stringify(result.value).toLowerCase(), /egress|denied/);
	} finally {
		await stub.stop();
	}
});

test("an unknown endpoint is refused", async () => {
	const result = await createTraceRpcHandler({ endpoint: "http://127.0.0.1:1" })("unload-everything");
	assert.equal(result.ok, false);
	assert.equal(result.error.code, "unknown-command");
});
