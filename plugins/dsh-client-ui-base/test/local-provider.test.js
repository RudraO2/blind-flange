/**
 * Tests for the `local` model plane: the SSE parser (`sse.js`) and the provider
 * that reads llama-swap with it (`local-provider.js`).
 *
 * None of this needs a GPU, llama-swap, a downloaded model, or a network. The
 * parser is exercised as a pure function and the provider against a real
 * loopback HTTP server that replays byte sequences — so the framing, the
 * chunk-boundary handling and the three failure modes are all covered on a
 * machine that has none of the runtime installed.
 *
 * The byte sequences are shaped after what llama-swap's own client parses and
 * what llama.cpp's server documents emitting, not invented. See the header of
 * `sse.js` for the six behaviours and where each came from.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
	buildRequestBody,
	DEFAULT_LOCAL_MODEL,
	LocalModelProvider,
	toChatMessages,
} from "../lib/model-plane/local-provider.js";
import { createModelProvider, ModelProviderError } from "../lib/model-plane/model-provider.js";
import { createSseParser } from "../lib/model-plane/sse.js";

/** Drain an async generator into an array. */
async function collect(iterable) {
	const out = [];
	for await (const item of iterable) out.push(item);
	return out;
}

/** One SSE data line, as llama-server frames it. */
function dataLine(payload) {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/** A content delta chunk. */
function textChunk(text) {
	return dataLine({ choices: [{ index: 0, delta: { content: text } }] });
}

/**
 * Start a loopback server that writes `script` (a list of strings) to the
 * response body, then resolve with its base URL and a stop function. Writing in
 * separate chunks is the point: it reproduces payloads split across reads.
 */
async function startStubServer(handler) {
	const server = createServer(handler);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	return {
		endpoint: `http://127.0.0.1:${port}`,
		async stop() {
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

/** A server that streams `chunks` as an event stream, recording the request body it received. */
async function startStreamServer(chunks) {
	const received = {};
	const stub = await startStubServer((req, res) => {
		let raw = "";
		req.on("data", (piece) => {
			raw += piece;
		});
		req.on("end", () => {
			received.path = req.url;
			try {
				received.body = JSON.parse(raw);
			} catch {
				received.body = raw;
			}
			res.writeHead(200, { "content-type": "text/event-stream" });
			for (const chunk of chunks) res.write(chunk);
			res.end();
		});
	});
	return { ...stub, received };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

test("the SSE parser reads content deltas in order", () => {
	const parser = createSseParser();
	const pieces = [...parser.push(textChunk("Hello")), ...parser.push(textChunk(" world"))];
	assert.deepEqual(
		pieces.map((p) => p.text),
		["Hello", " world"],
	);
});

test("the SSE parser tolerates a payload split across two reads", () => {
	const parser = createSseParser();
	const whole = textChunk("split me");
	const cut = Math.floor(whole.length / 2);
	// Nothing completes on the first half — that is the property under test.
	assert.deepEqual(parser.push(whole.slice(0, cut)), []);
	const pieces = parser.push(whole.slice(cut));
	assert.deepEqual(pieces, [{ type: "text", text: "split me" }]);
});

test("the SSE parser ignores keep-alive comment lines — llama.cpp pings during a long prefill", () => {
	const parser = createSseParser();
	// A parser that treats `:` as payload fails here, and it fails at exactly
	// the moment a slow first prompt makes it look like the model hung.
	const pieces = parser.push(`: ping\n\n:\n${textChunk("after the ping")}`);
	assert.deepEqual(pieces, [{ type: "text", text: "after the ping" }]);
});

test("the SSE parser treats [DONE] as the terminator, not as JSON", () => {
	const parser = createSseParser();
	parser.push(textChunk("done soon"));
	assert.equal(parser.finished, false);
	const pieces = parser.push("data: [DONE]\n\n");
	assert.deepEqual(pieces, [{ type: "done" }]);
	assert.equal(parser.finished, true);
});

test("the SSE parser accepts both reasoning field spellings and keeps them apart from text", () => {
	const parser = createSseParser();
	const pieces = [
		...parser.push(dataLine({ choices: [{ delta: { reasoning_content: "thinking a" } }] })),
		...parser.push(dataLine({ choices: [{ delta: { reasoning: "thinking b" } }] })),
		...parser.push(textChunk("the answer")),
	];
	assert.deepEqual(pieces, [
		{ type: "reasoning", text: "thinking a" },
		{ type: "reasoning", text: "thinking b" },
		{ type: "text", text: "the answer" },
	]);
});

test("the SSE parser skips chunks carrying neither content nor reasoning", () => {
	const parser = createSseParser();
	// The role-only opening chunk, which every OpenAI-compatible server sends.
	assert.deepEqual(parser.push(dataLine({ choices: [{ delta: { role: "assistant" } }] })), []);
	assert.deepEqual(parser.push(dataLine({ id: "x", object: "chat.completion.chunk" })), []);
});

test("the SSE parser survives a malformed payload without failing the turn", () => {
	const parser = createSseParser();
	assert.deepEqual(parser.push("data: {not json at all\n\n"), []);
	assert.deepEqual(parser.push(textChunk("still fine")), [{ type: "text", text: "still fine" }]);
});

test("the SSE parser finishes on a finish_reason even with no [DONE] to follow", () => {
	const parser = createSseParser();
	const pieces = parser.push(dataLine({ choices: [{ delta: {}, finish_reason: "stop" }] }));
	assert.deepEqual(pieces, [{ type: "done", finishReason: "stop" }]);
	assert.equal(parser.finished, true);
});

test("the SSE parser handles CRLF framing and flushes a trailing partial line", () => {
	const parser = createSseParser();
	assert.deepEqual(parser.push(`data: ${JSON.stringify({ choices: [{ delta: { content: "crlf" } }] })}\r\n`), [
		{ type: "text", text: "crlf" },
	]);
	// A body that closes without a final newline still yields its last line.
	parser.push(`data: ${JSON.stringify({ choices: [{ delta: { content: "tail" } }] })}`);
	assert.deepEqual(parser.flush(), [{ type: "text", text: "tail" }]);
});

// ---------------------------------------------------------------------------
// Request shaping
// ---------------------------------------------------------------------------

test("harness messages flatten to chat messages, including a tool result's payload", () => {
	const chat = toChatMessages([
		{ role: "system", content: "be terse" },
		{ role: "user", content: [{ type: "text", text: "sum 1 to 10" }] },
		{ role: "assistant", content: [{ type: "text", text: "running it" }] },
		{ role: "user", source: { kind: "tool" }, content: [{ type: "tool-result", content: [{ type: "text", text: "55" }] }] },
		{ role: "user", content: [] },
	]);
	assert.deepEqual(chat, [
		{ role: "system", content: "be terse" },
		{ role: "user", content: "sum 1 to 10" },
		{ role: "assistant", content: "running it" },
		// The tool's output has to reach the model — it is the outcome it asked for.
		{ role: "user", content: "55" },
	]);
});

test("images attach to the last user message as data-url parts", () => {
	const chat = toChatMessages([{ role: "user", content: "what is on this page?" }], [
		{ mediaType: "image/png", base64: "AAAA" },
	]);
	assert.equal(chat.length, 1);
	assert.deepEqual(chat[0].content, [
		{ type: "text", text: "what is on this page?" },
		{ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
	]);
});

test("an image with no user message to attach to still produces a well-formed request", () => {
	const chat = toChatMessages([], [{ mediaType: "image/jpeg", base64: "BBBB" }]);
	assert.equal(chat.length, 1);
	assert.equal(chat[0].role, "user");
	assert.deepEqual(chat[0].content, [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,BBBB" } }]);
});

test("a schema becomes a strict json_schema response format — the reason a 1.5B can be relied on", () => {
	const schema = { type: "object", properties: { command: { type: "string" } }, required: ["command"] };
	const body = buildRequestBody({ messages: [], schema, schemaName: "pwsh_call" }, "bf-coder");
	assert.deepEqual(body.response_format, {
		type: "json_schema",
		json_schema: { name: "pwsh_call", strict: true, schema },
	});
});

test("the request defaults to streaming and temperature 0, so a demo can be rehearsed", () => {
	const body = buildRequestBody({ messages: [] }, "bf-coder");
	assert.equal(body.stream, true);
	assert.equal(body.temperature, 0);
	assert.equal(body.model, "bf-coder");
	assert.equal("response_format" in body, false);
});

test("an explicit model on the request overrides the provider default", () => {
	const body = buildRequestBody({ messages: [], model: "bf-vision" }, "bf-coder");
	assert.equal(body.model, "bf-vision");
});

// ---------------------------------------------------------------------------
// The provider, against a real loopback server
// ---------------------------------------------------------------------------

test("the local provider streams a turn and posts to the OpenAI-compatible path", async () => {
	const stub = await startStreamServer([textChunk("5050"), textChunk(" PASS"), "data: [DONE]\n\n"]);
	try {
		const provider = new LocalModelProvider({ endpoint: stub.endpoint, defaultModel: "bf-coder" });
		const pieces = await collect(provider.answer({ messages: [{ role: "user", content: "sum 1 to 100" }] }));
		assert.deepEqual(pieces, [
			{ type: "text", text: "5050" },
			{ type: "text", text: " PASS" },
		]);
		assert.equal(stub.received.path, "/v1/chat/completions");
		assert.equal(stub.received.body.model, "bf-coder");
		assert.equal(stub.received.body.stream, true);
	} finally {
		await stub.stop();
	}
});

test("the local provider stops at [DONE] and does not yield the terminator", async () => {
	const stub = await startStreamServer([textChunk("first"), "data: [DONE]\n\n", textChunk("never read")]);
	try {
		const provider = new LocalModelProvider({ endpoint: stub.endpoint });
		const pieces = await collect(provider.answer({ messages: [{ role: "user", content: "x" }] }));
		assert.deepEqual(pieces, [{ type: "text", text: "first" }]);
	} finally {
		await stub.stop();
	}
});

test("a chunk boundary in the middle of a payload does not lose or duplicate text", async () => {
	const whole = textChunk("do not tear me");
	const cut = 12;
	const stub = await startStreamServer([whole.slice(0, cut), whole.slice(cut), "data: [DONE]\n\n"]);
	try {
		const provider = new LocalModelProvider({ endpoint: stub.endpoint });
		const pieces = await collect(provider.answer({ messages: [{ role: "user", content: "x" }] }));
		assert.deepEqual(pieces, [{ type: "text", text: "do not tear me" }]);
	} finally {
		await stub.stop();
	}
});

test("llama-swap unreachable is a named failure, not a hang or an empty answer", async () => {
	// Port 1 on loopback refuses immediately, so this asserts the message rather
	// than waiting on a timeout.
	const provider = new LocalModelProvider({ endpoint: "http://127.0.0.1:1" });
	await assert.rejects(() => collect(provider.answer({ messages: [{ role: "user", content: "x" }] })), (error) => {
		assert.ok(error instanceof ModelProviderError);
		assert.match(error.message, /could not reach llama-swap/);
		assert.match(error.message, /llama-swap --config/);
		return true;
	});
});

test("an unknown model id says so, rather than reporting a generic 404", async () => {
	const stub = await startStubServer((req, res) => {
		res.writeHead(404, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: "model not found" }));
	});
	try {
		const provider = new LocalModelProvider({ endpoint: stub.endpoint, defaultModel: "bf-nope" });
		await assert.rejects(() => collect(provider.answer({ messages: [{ role: "user", content: "x" }] })), (error) => {
			assert.match(error.message, /does not have a model called "bf-nope"/);
			assert.match(error.message, /models:/);
			return true;
		});
	} finally {
		await stub.stop();
	}
});

test("an out-of-memory failure is recognised and points at the escape hatch", async () => {
	const stub = await startStubServer((req, res) => {
		res.writeHead(500, { "content-type": "application/json" });
		// llama-server reports allocation failure in the body, not the status —
		// and on 3.7 GB of VRAM this is the likeliest failure of the three.
		res.end(JSON.stringify({ error: { message: "vk::Device::allocateMemory: ErrorOutOfDeviceMemory" } }));
	});
	try {
		const provider = new LocalModelProvider({ endpoint: stub.endpoint, defaultModel: "bf-vision" });
		await assert.rejects(() => collect(provider.answer({ messages: [{ role: "user", content: "x" }] })), (error) => {
			assert.match(error.message, /ran out of GPU memory/);
			assert.match(error.message, /--parallel 1/);
			assert.match(error.message, /replay/);
			return true;
		});
	} finally {
		await stub.stop();
	}
});

test("residency reads /running, and a failure there never breaks a turn", async () => {
	const running = [{ model: "bf-coder", state: "ready", ttl: 300, name: "coder" }];
	const stub = await startStubServer((req, res) => {
		if (req.url === "/running") {
			res.writeHead(200, { "content-type": "application/json" });
			res.end(JSON.stringify({ running }));
			return;
		}
		res.writeHead(404).end();
	});
	try {
		const provider = new LocalModelProvider({ endpoint: stub.endpoint });
		assert.deepEqual(await provider.running(), running);
	} finally {
		await stub.stop();
	}
	// Server gone: residency is decoration and must degrade to empty, not throw.
	const offline = new LocalModelProvider({ endpoint: "http://127.0.0.1:1" });
	assert.deepEqual(await offline.running(), []);
});

test("createModelProvider now returns a real local provider, and remote still fails loud", async () => {
	assert.ok(createModelProvider("local") instanceof LocalModelProvider);
	assert.equal(createModelProvider("local").defaultModel, process.env.BF_LOCAL_MODEL ?? DEFAULT_LOCAL_MODEL);
	await assert.rejects(() => collect(createModelProvider("remote").answer({ messages: [] })), ModelProviderError);
});
