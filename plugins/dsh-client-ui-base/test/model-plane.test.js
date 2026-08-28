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
import { createReportFindingsTool } from "../lib/findings/tool.js";
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

/** A `createToolResultMessage`-shaped message (message.ts), without importing the harness's helper. */
function toolResult(toolCallId, json) {
	return {
		role: "user",
		source: { kind: "tool", callId: toolCallId },
		content: [{ type: "tool-result", toolCallId, content: [{ type: "text", text: JSON.stringify(json) }] }],
	};
}

/** A plain user text message — deliberately without a `source` field, matching the shape the harness hands adapters on a fresh turn. */
function userText(text) {
	return { role: "user", content: [{ type: "text", text }] };
}

test("ReplayModelProvider steps through a scripted entry as tool results accumulate, without re-matching each time (Story 5.1)", async () => {
	const dir = mkdtempSync(join(tmpdir(), "bf-replay-cache-"));
	const cachePath = join(dir, "replay-cache.json");
	try {
		writeFileSync(
			cachePath,
			JSON.stringify([
				{
					match: "scripted",
					steps: [
						{ blocks: [{ type: "text", text: "step zero" }] },
						{ blocks: [{ type: "text", text: "step one" }] },
						{ blocks: [{ type: "text", text: "step two" }] },
					],
				},
				{ match: null, blocks: [{ type: "text", text: "fallback" }] },
			]),
		);
		const provider = new ReplayModelProvider(cachePath);
		const trigger = userText("run the scripted flow");

		const first = await collect(provider.answer({ messages: [trigger] }));
		assert.equal(first[0].text, "step zero");

		// One tool round trip completed: same trigger, one tool-result message appended.
		const second = await collect(
			provider.answer({ messages: [trigger, { role: "assistant", content: [], source: { kind: "model", provider: "replay", model: "m" } }, toolResult("c1", { ok: true })] }),
		);
		assert.equal(second[0].text, "step one");

		const third = await collect(
			provider.answer({
				messages: [
					trigger,
					{ role: "assistant", content: [], source: { kind: "model", provider: "replay", model: "m" } },
					toolResult("c1", { ok: true }),
					{ role: "assistant", content: [], source: { kind: "model", provider: "replay", model: "m" } },
					toolResult("c2", { ok: true }),
				],
			}),
		);
		assert.equal(third[0].text, "step two");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ReplayModelProvider clamps to the last step rather than throwing when the turn runs longer than the script", async () => {
	const dir = mkdtempSync(join(tmpdir(), "bf-replay-cache-"));
	const cachePath = join(dir, "replay-cache.json");
	try {
		writeFileSync(cachePath, JSON.stringify([{ match: "scripted", steps: [{ blocks: [{ type: "text", text: "only step" }] }] }]));
		const provider = new ReplayModelProvider(cachePath);
		const trigger = userText("run the scripted flow");
		const chunks = await collect(
			provider.answer({
				messages: [trigger, { role: "assistant", content: [] }, toolResult("c1", {}), { role: "assistant", content: [] }, toolResult("c2", {})],
			}),
		);
		assert.equal(chunks[0].text, "only step");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ReplayModelProvider emits a tool-call piece with the exact authored name and arguments", async () => {
	const dir = mkdtempSync(join(tmpdir(), "bf-replay-cache-"));
	const cachePath = join(dir, "replay-cache.json");
	try {
		writeFileSync(
			cachePath,
			JSON.stringify([{ match: "scripted", steps: [{ blocks: [{ type: "tool-call", name: "create_goal", arguments: { objective: "do the thing" } }] }] }]),
		);
		const provider = new ReplayModelProvider(cachePath);
		const chunks = await collect(provider.answer({ messages: [userText("run scripted")] }));
		assert.equal(chunks.length, 1);
		assert.equal(chunks[0].type, "tool-call");
		assert.equal(chunks[0].name, "create_goal");
		assert.equal(typeof chunks[0].id, "string");
		assert.deepEqual(JSON.parse(chunks[0].arguments), { objective: "do the thing" });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ReplayModelProvider resolves $GOAL_ID/$GOAL_REVISION from the most recent create_goal-shaped tool result", async () => {
	const dir = mkdtempSync(join(tmpdir(), "bf-replay-cache-"));
	const cachePath = join(dir, "replay-cache.json");
	try {
		writeFileSync(
			cachePath,
			JSON.stringify([
				{
					match: "scripted",
					steps: [
						{ blocks: [{ type: "tool-call", name: "create_goal", arguments: { objective: "x" } }] },
						{ blocks: [{ type: "tool-call", name: "update_goal", arguments: { goal_id: "$GOAL_ID", revision: "$GOAL_REVISION", action: "complete" } }] },
					],
				},
			]),
		);
		const provider = new ReplayModelProvider(cachePath);
		const trigger = userText("run scripted");
		const created = toolResult("c1", { goal: { id: "goal-abc", revision: 3, objective: "x", phase: "active", roundsStarted: 0, maxGoalRounds: 25 }, activation: "armed" });
		const chunks = await collect(provider.answer({ messages: [trigger, { role: "assistant", content: [] }, created] }));
		assert.equal(chunks[0].type, "tool-call");
		assert.equal(chunks[0].name, "update_goal");
		assert.deepEqual(JSON.parse(chunks[0].arguments), { goal_id: "goal-abc", revision: 3, action: "complete" });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("ReplayModelProvider ignores plugin-injected 'user'-role context that lands after the real message (regression, verified against a real session log 28 Aug 2026)", async () => {
	// The harness appends a runtime-context snapshot and a skill catalog as
	// their own role:"user" messages AFTER the operator's own message, not
	// before it. A naive "last user-role message" scan picks the skill
	// catalog instead of the request — this is Story 5.1's original bug.
	const messages = [
		{
			role: "user",
			content: [{ type: "text", text: "Turn the ingested inspection report into key findings." }],
			source: { kind: "user", rpcId: "x" },
		},
		{
			role: "user",
			content: [{ type: "text", text: "Current runtime context…" }],
			source: { kind: "plugin", plugin: "@deepseek-ai/dsh-system-prompt", form: "snapshot" },
		},
		{
			role: "user",
			content: [{ type: "text", text: "Available skills…" }],
			source: { kind: "skill-catalog", form: "catalog" },
		},
	];
	const chunks = await collect(createModelProvider("replay").answer({ messages }));
	const toolCall = chunks.find((c) => c.type === "tool-call");
	assert.ok(toolCall, "the scripted entry must be picked, not the match:null fallback");
	assert.equal(toolCall.name, "create_goal");
});

test("ReplayModelProvider does not mistake an auxiliary same-provider call (e.g. session-title generation) for the human trigger", async () => {
	// This adapter also serves purpose-specific calls (GenerateOptions.purpose)
	// that carry no genuine human message at all — just a plugin-authored
	// request embedding the original text as data. That embedded text must not
	// itself trigger a scripted multi-step entry.
	const messages = [
		{
			role: "user",
			content: [{ type: "text", text: 'Generate the session title from this JSON array of human messages:\n[{"seq":9,"text":"Turn the ingested inspection report into key findings."}]' }],
			source: { kind: "dsh-session-title-llm" },
		},
	];
	const chunks = await collect(createModelProvider("replay").answer({ messages }));
	assert.equal(chunks.length, 1);
	assert.equal(chunks[0].type, "text");
	assert.match(chunks[0].text, /authored replay response/, "an auxiliary call with no genuine human message must land on the match:null fallback");
});

test("ReplayModelProvider ignores a tool-result message when computing the trigger text, so the original request still matches", async () => {
	const dir = mkdtempSync(join(tmpdir(), "bf-replay-cache-"));
	const cachePath = join(dir, "replay-cache.json");
	try {
		writeFileSync(cachePath, JSON.stringify([{ match: "scripted", steps: [{ blocks: [{ type: "text", text: "a" }] }, { blocks: [{ type: "text", text: "b" }] }] }]));
		const provider = new ReplayModelProvider(cachePath);
		const trigger = userText("run the scripted flow please");
		const chunks = await collect(provider.answer({ messages: [trigger, { role: "assistant", content: [] }, toolResult("c1", { unrelated: true })] }));
		assert.equal(chunks[0].text, "b", "stepIndex must advance to 1 and still resolve the same entry");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("the shipped 'key findings' replay entry walks create_goal -> bf_report_findings -> update_goal -> a closing reply, citing real provenance (Story 5.1)", async () => {
	const provider = createModelProvider("replay");
	const adapter = createLlmAdapter(provider, { displayName: "Blind Flange (replay)" });
	const trigger = userText("Turn the ingested inspection report into key findings.");
	let messages = [trigger];

	/** Run one adapter turn, append the assistant message it produced, and return its tool-call block (if any). */
	async function runStep() {
		const chunks = await collect(adapter.stream({ provider: "replay", model: "replay-authored-v1", messages }));
		const blocks = chunks.filter((c) => c.type === "block-end").map((c) => c.block);
		messages = [...messages, { role: "assistant", content: blocks, source: { kind: "model", provider: "replay", model: "replay-authored-v1" } }];
		return blocks.find((block) => block.type === "tool-call");
	}

	// Step 0: create_goal.
	const createCall = await runStep();
	assert.equal(createCall.name, "create_goal");
	const createArgs = JSON.parse(createCall.arguments);
	assert.match(createArgs.objective, /key findings/);
	messages = [...messages, toolResult(createCall.id, { goal: { id: "goal-1", revision: 1, objective: createArgs.objective, phase: "active", roundsStarted: 0, maxGoalRounds: 25 }, activation: "armed" })];

	// Step 1: bf_report_findings — dispatch the REAL tool, exactly as the harness would.
	const findingsCall = await runStep();
	assert.equal(findingsCall.name, "bf_report_findings");
	const findingsResult = await createReportFindingsTool().execute();
	assert.ok(findingsResult.findings.length > 100);
	messages = [...messages, toolResult(findingsCall.id, findingsResult)];

	// Step 2: the key-findings text, citing real page/bbox provenance from the tool result, plus update_goal.
	const chunks2 = await collect(adapter.stream({ provider: "replay", model: "replay-authored-v1", messages }));
	const textBlock = chunks2.filter((c) => c.type === "block-end").map((c) => c.block).find((block) => block.type === "text");
	assert.ok(textBlock, "the findings step must carry a text block, not only the tool call");
	assert.match(textBlock.text, /E-1104A/);
	assert.match(textBlock.text, /PSV-2207A/);
	assert.match(textBlock.text, /page 1/);
	const e1104a = findingsResult.findings.find((f) => f.text.startsWith("Insulation cladding open"));
	assert.ok(textBlock.text.includes(String(e1104a.bbox.left)), "the cited region must match the real tool result's bbox, not a hardcoded guess");
	const updateCall = chunks2.filter((c) => c.type === "block-end").map((c) => c.block).find((block) => block.type === "tool-call");
	assert.equal(updateCall.name, "update_goal");
	assert.deepEqual(JSON.parse(updateCall.arguments), { goal_id: "goal-1", revision: 1, action: "complete" });
	assert.equal(chunks2.at(-1).reason.kind, "tool-calls");
	messages = [...messages, { role: "assistant", content: [textBlock, updateCall], source: { kind: "model", provider: "replay", model: "replay-authored-v1" } }];
	messages = [...messages, toolResult(updateCall.id, { goal: { id: "goal-1", revision: 2, objective: createArgs.objective, phase: "complete", roundsStarted: 0, maxGoalRounds: 25 }, activation: "armed" })];

	// Step 3: the turn ends with a plain closing reply, not another tool call.
	const chunks3 = await collect(adapter.stream({ provider: "replay", model: "replay-authored-v1", messages }));
	assert.equal(chunks3.at(-1).reason.kind, "stop");
	assert.ok(chunks3.some((c) => c.type === "text-delta"));
});

test("the shipped 'helper agent' replay entry delegates through a real subagent tool call, then reports it as running rather than blocking (Story 5.2)", async () => {
	const provider = createModelProvider("replay");
	const trigger = userText("Use a helper agent to double-check the corrosion finding on E-1104A while you draft the recommendation.");

	const first = await collect(provider.answer({ messages: [trigger] }));
	const delegateCall = first.find((c) => c.type === "tool-call");
	assert.ok(delegateCall, "step zero must delegate through the real subagent tool, not answer inline");
	assert.equal(delegateCall.name, "subagent");
	const delegateArgs = JSON.parse(delegateCall.arguments);
	assert.match(delegateArgs.description, /corrosion/i);
	assert.match(delegateArgs.prompt, /corrosion-under-insulation finding recorded against E-1104A/);
	assert.equal(delegateArgs.run_in_background, undefined, "omitted, not forced false — the continuable config's own default is what backgrounds this call (docs/deepseek-harness-notes.md)");

	// One tool round trip completed: the harness's own continuable-mode result lands as the tool result.
	const messages = [
		trigger,
		{ role: "assistant", content: [], source: { kind: "model", provider: "replay", model: "replay-authored-v1" } },
		toolResult(delegateCall.id, { kind: "continuable", subagentId: "child-1" }),
	];
	const second = await collect(provider.answer({ messages }));
	const textBlock = second.find((c) => c.type === "text");
	assert.ok(textBlock, "the turn must close with a plain reply, not another tool call, once delegation is under way");
	assert.match(textBlock.text, /running in the background/);
});

test("the shipped child replay entry answers the exact prompt the helper-agent tool call sends it (Story 5.2)", async () => {
	// The child session's genuine trigger is the tool call's own `prompt` argument
	// (dsh-subagent-in-process-driver hands it to the child as `source: { kind: "user" }`,
	// which `isGenuineHumanMessage` accepts) — so this must match on that exact text,
	// not a paraphrase that could silently drift from the parent's authored arguments.
	const childPrompt =
		"Double-check the corrosion-under-insulation finding recorded against E-1104A in the ingested inspection report: confirm the severity is Major and that the recommended action (strip cladding and UT scan before restart) is consistent with that severity. Reply in two sentences with your assessment.";
	const chunks = await collect(createModelProvider("replay").answer({ messages: [userText(childPrompt)] }));
	assert.equal(chunks.length, 1);
	assert.equal(chunks[0].type, "text");
	assert.match(chunks[0].text, /Major/);
	assert.doesNotMatch(chunks[0].text, /authored replay response/, "must resolve to the authored child entry, not the match:null fallback");
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

test("createLlmAdapter turns a tool-call piece into a matched block-start/tool-call-delta/block-end and a tool-calls finish (Story 5.1)", async () => {
	const provider = {
		async *answer() {
			yield { type: "tool-call", id: "call-1", name: "create_goal", arguments: '{"objective":"x"}' };
		},
	};
	const adapter = createLlmAdapter(provider, { displayName: "Blind Flange (replay)" });
	const chunks = await collect(adapter.stream({ provider: "replay", model: "m", messages: [] }));
	assert.deepEqual(chunks, [
		{ type: "block-start", index: 0, blockType: "tool-call" },
		{ type: "tool-call-delta", index: 0, id: "call-1", name: "create_goal", argumentsDelta: '{"objective":"x"}' },
		{ type: "block-end", index: 0, block: { type: "tool-call", id: "call-1", name: "create_goal", arguments: '{"objective":"x"}' } },
		{ type: "finish", reason: { kind: "tool-calls" } },
	]);
});

test("createLlmAdapter closes the open text block before opening a tool-call block, then opens a fresh text block after", async () => {
	const provider = {
		async *answer() {
			yield { type: "text", text: "before " };
			yield { type: "tool-call", id: "call-1", name: "get_goal", arguments: "{}" };
			yield { type: "text", text: "after" };
		},
	};
	const adapter = createLlmAdapter(provider, { displayName: "Blind Flange (replay)" });
	const chunks = await collect(adapter.stream({ provider: "replay", model: "m", messages: [] }));
	assert.deepEqual(
		chunks.map((c) => c.type),
		["block-start", "text-delta", "block-end", "block-start", "tool-call-delta", "block-end", "block-start", "text-delta", "block-end", "finish"],
	);
	// Three blocks, three distinct indices, in first-seen order (StreamChunk contract).
	assert.deepEqual(
		chunks.filter((c) => c.type === "block-start").map((c) => [c.index, c.blockType]),
		[
			[0, "text"],
			[1, "tool-call"],
			[2, "text"],
		],
	);
	assert.equal(chunks.at(-1).reason.kind, "tool-calls");
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
