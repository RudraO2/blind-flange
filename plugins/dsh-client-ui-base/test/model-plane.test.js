/**
 * Tests for the model plane (Story 3.1): the `ModelProvider` contract
 * (`model-provider.js`), the authored replay cache (`replay-provider.js`),
 * and the duck-typed bridge onto `ctx.llm.registerAdapter` (`llm-adapter.js`).
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLlmAdapter } from "../lib/model-plane/llm-adapter.js";
import { createModelProvider, ModelProviderError } from "../lib/model-plane/model-provider.js";
import { ReplayModelProvider } from "../lib/model-plane/replay-provider.js";

/** Drain an async generator into an array. */
async function collect(iterable) {
	const out = [];
	for await (const item of iterable) out.push(item);
	return out;
}

test("createModelProvider selects by name — the only place ADR-0001's config selection is enforced", () => {
	assert.ok(createModelProvider("replay") instanceof ReplayModelProvider);
	assert.throws(() => createModelProvider("nonexistent"), ModelProviderError);
});

test("local and remote are declared but fail loud instead of answering nothing (day-4 stretch / dev-only)", async () => {
	await assert.rejects(() => collect(createModelProvider("local").answer({ messages: [] })), ModelProviderError);
	await assert.rejects(() => collect(createModelProvider("remote").answer({ messages: [] })), ModelProviderError);
});

test("ReplayModelProvider matches an entry by substring against the last user message", async () => {
	const provider = createModelProvider("replay");
	const request = { messages: [{ role: "user", content: [{ type: "text", text: "hello there" }] }] };
	const chunks = await collect(provider.answer(request));
	assert.ok(chunks.length > 0);
	assert.match(chunks[0].text, /Hello/);
});

test("ReplayModelProvider falls back to the match:null entry when nothing matches", async () => {
	const provider = createModelProvider("replay");
	const request = { messages: [{ role: "user", content: [{ type: "text", text: "something unrelated entirely" }] }] };
	const chunks = await collect(provider.answer(request));
	assert.ok(chunks.length > 0);
	assert.match(chunks[0].text, /authored replay response/);
});

test("ReplayModelProvider throws when the cache has no matching and no fallback entry", async () => {
	const dir = mkdtempSync(join(tmpdir(), "bf-replay-cache-"));
	const cachePath = join(dir, "replay-cache.json");
	try {
		writeFileSync(cachePath, JSON.stringify([{ match: "only-this", blocks: [{ type: "text", text: "x" }] }]));
		const provider = new ReplayModelProvider(cachePath);
		await assert.rejects(
			() => collect(provider.answer({ messages: [{ role: "user", content: [{ type: "text", text: "nothing alike" }] }] })),
			ModelProviderError,
		);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("createLlmAdapter satisfies the duck-typed registerAdapter contract without importing dsh-llm", async () => {
	const stubProvider = {
		async *answer() {
			yield { type: "text", text: "hi " };
			yield { type: "text", text: "there" };
		},
	};
	const adapter = createLlmAdapter(stubProvider, { displayName: "Blind Flange (replay)" });

	assert.deepEqual(adapter.providerInfo("replay"), { id: "replay", name: "Blind Flange (replay)" });
	assert.equal(adapter.providerRetryPolicy("replay"), undefined);

	// listModels now reads the fleet from registry/models.yaml (Story 3.3): the
	// three allowed members, attributed to the provider, with the Qwen Research
	// member filtered out.
	const listed = await adapter.listModels("replay");
	assert.deepEqual(
		listed.map((m) => m.id),
		["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-Coder-7B-Instruct", "Qwen/Qwen2.5-VL-7B-Instruct"],
	);
	assert.ok(listed.every((m) => m.provider === "replay"));

	const prepared = await adapter.prepareCall("replay", "replay-authored-v1");
	assert.deepEqual(prepared.model, { provider: "replay", id: "replay-authored-v1", name: "replay-authored-v1" });

	// The harness dispatches through the object prepareCall() returns, not necessarily
	// through the adapter directly — exercise that exact call path, not just adapter.stream().
	const preparedChunks = await collect(prepared.stream({ provider: "replay", model: "replay-authored-v1", messages: [] }));
	assert.deepEqual(
		preparedChunks.filter((c) => c.type === "text-delta").map((c) => c.text),
		["hi ", "there"],
	);
	assert.deepEqual(preparedChunks.at(-1), { type: "finish", reason: { kind: "stop" } });

	const chunks = await collect(adapter.stream({ provider: "replay", model: "replay-authored-v1", messages: [] }));
	const textDeltas = chunks.filter((c) => c.type === "text-delta").map((c) => c.text);
	assert.deepEqual(textDeltas, ["hi ", "there"]);
	const finish = chunks.at(-1);
	assert.deepEqual(finish, { type: "finish", reason: { kind: "stop" } });
});

test("createLlmAdapter keeps block-start/block-end balanced even when the provider fails mid-stream", async () => {
	const provider = {
		async *answer() {
			yield { type: "text", text: "partial " };
			throw new Error("mid-stream failure");
		},
	};
	const adapter = createLlmAdapter(provider, { displayName: "Blind Flange (replay)" });
	const chunks = await collect(adapter.stream({ provider: "replay", model: "m", messages: [] }));
	assert.equal(chunks.filter((c) => c.type === "block-start").length, 1);
	assert.equal(chunks.filter((c) => c.type === "block-end").length, 1);
	assert.equal(chunks.at(-1).reason.kind, "error");
});

test("createLlmAdapter turns a provider failure into a terminal error finish chunk, not a thrown rejection", async () => {
	const failingProvider = {
		async *answer() {
			throw new Error("boom");
		},
	};
	const adapter = createLlmAdapter(failingProvider, { displayName: "Blind Flange (replay)" });
	const chunks = await collect(adapter.stream({ provider: "replay", model: "m", messages: [] }));
	const finish = chunks.at(-1);
	assert.equal(finish.type, "finish");
	assert.equal(finish.reason.kind, "error");
	assert.match(finish.reason.failure.message, /boom/);
});
