/**
 * Bridges our own `ModelProvider` contract (model-provider.js) onto the
 * harness's `ctx.llm.registerAdapter(providers, adapter)` seam.
 *
 * Deliberately does NOT import `@deepseek-ai/dsh-llm` to get its `LlmAdapter`
 * base class. Two things were verified directly against the installed
 * harness (0.1.1-rc.2) on 28 August 2026, the day-one timebox for this seam:
 *
 * 1. `registerAdapter` never does an `instanceof` check — every method it
 *    calls (`providerInfo`, `providerRetryPolicy`, `prepareCall`, `stream`)
 *    is duck-typed, so a plain object implementing them registers exactly
 *    like a real `LlmAdapter` subclass would.
 * 2. This plugin is mounted through a `link:` row in the profile's
 *    `package.json`, i.e. loaded through a symlink. Node resolves bare
 *    specifiers from a symlinked module's REAL on-disk path, which is this
 *    repo — not the profile's `node_modules` the harness's own packages live
 *    in — so `import "@deepseek-ai/dsh-llm"` from here fails with
 *    `ERR_MODULE_NOT_FOUND` even though the harness process has that package
 *    loaded and working.
 *
 * Duck-typing sidesteps both: the contract stays ours (CONTEXT.md "Plugin
 * contract" — "the harness is an implementation of them"), and there is
 * nothing here for the symlink to break.
 */

import {
	CODE_LANE_SYSTEM_PROMPT,
	clearPrediction,
	describeVerdict,
	parseProgram,
	pendingPrediction,
	PYTHON_PROGRAM_SCHEMA,
	PYTHON_PROGRAM_SCHEMA_NAME,
	pythonCommand,
	rememberPrediction,
	SANDBOX_TOOL_NAME,
	sandboxHasReported,
	sandboxOutput,
	servesTaskType,
	verdictFor,
} from "../lanes/code.js";
import { announceRefusals, loadFleet } from "../registry/loader.js";
import { currentTaskType, runtimeModelForCurrentTurn } from "../router/dispatch.js";
import { recordTool } from "../trace/turn.js";

/** Exact model identity this adapter reports; nothing here validates against a catalog (advisory only, per the harness's own contract). */
async function resolveModel(provider, model) {
	return { provider, id: model, name: model };
}

/**
 * The fleet from `registry/models.yaml`, shaped as the harness's model list
 * entries and attributed to `provider`. This is what makes Story 3.3's "a new
 * member added to that file appears in the UI model list" true: the list is
 * read from the registry on every call, never from a second copy here.
 *
 * `licence`, `context`, `modalities` and `capabilities` ride along as advisory
 * fields — the harness duck-types model entries and does not validate them, and
 * the router (Stories 3.5-3.6) reads the same shape. The licence loader (Story
 * 3.4) drops disallowed-licence members before they reach here, so an
 * unrunnable model is never choosable; a registry read failure yields an empty
 * list rather than breaking the picker.
 * @param {string} provider - the provider token this adapter serves under.
 */
function fleetModels(provider) {
	try {
		return loadFleet().loaded.map((member) => ({
			provider,
			id: member.name,
			name: member.name,
			role: member.role,
			licence: member.licence,
			context: member.context,
			modalities: member.modalities,
			capabilities: member.capabilities,
		}));
	} catch (error) {
		console.warn(`@blind-flange/dsh-client-ui-base: fleet registry not listed — ${error.message}`);
		return [];
	}
}

/**
 * Streams one turn from `modelProvider`, translated into the harness's chunk
 * vocabulary. Consecutive `text` pieces accumulate into one streamed text
 * block, closed by the next tool-call piece or end of stream; each
 * `tool-call` piece (Story 5.1) is its own block, opened and closed
 * immediately since a replayed call is never fragmentary. At most one block
 * is ever open at a time, so block-start/block-end stay paired even when
 * `modelProvider.answer()` throws mid-stream — the open text block, if any,
 * is closed in the `catch` before the terminal `error` finish chunk. Finish
 * reason is `tool-calls` whenever any tool-call block was emitted, `stop`
 * otherwise (StreamChunk contract, `packages/llm/llm/src/types.ts`).
 * @param {import("./model-provider.js").ModelProvider} modelProvider
 * @param {{ messages: unknown[] }} options
 */
/**
 * The runtime model this turn should be answered by, from the router's decision.
 *
 * Resolved here because this is the last point before the provider is called and
 * the first point where the decision and the fleet are both reachable. Never
 * throws and never blocks a turn: a dispatch that cannot resolve leaves `model`
 * undefined, and the provider falls back to its configured default. The reason
 * is logged rather than swallowed, because a silent fallback looks exactly like
 * a routing decision.
 *
 * `replay` ignores `model` entirely, so this is inert under the replay provider
 * and its tests are unaffected.
 */
function dispatchForTurn() {
	try {
		const dispatch = runtimeModelForCurrentTurn(loadFleet().loaded);
		if (dispatch.runtimeId === null && dispatch.reason !== "no-routing-decision") {
			console.warn(
				`@blind-flange/dsh-client-ui-base: routing decision not dispatched (${dispatch.reason}` +
					`${dispatch.member ? `, member "${dispatch.member}"` : ""}) — falling back to the provider's default model`,
			);
		}
		return dispatch;
	} catch (error) {
		console.warn(`@blind-flange/dsh-client-ui-base: dispatch not resolved — ${error instanceof Error ? error.message : String(error)}`);
		return { runtimeId: null, member: null, reason: "dispatch-failed" };
	}
}

/**
 * Read the model's schema-constrained reply out of a stream of pieces.
 * @param {AsyncGenerator<{ type: string, text?: string }>} pieces
 */
async function drainText(pieces) {
	let text = "";
	for await (const piece of pieces) {
		if (piece.type === "text") text += piece.text;
	}
	return text;
}

/**
 * The coding lane's two steps, as harness pieces.
 *
 * **Step one** asks the model for `{ code, description, expected }` under a
 * schema, remembers the prediction, and emits a `tool-call` for the sandbox. The
 * harness dispatches that call for real — through `tools/pre-execute`, so the
 * egress seal inspects the program exactly as it would any other command — and
 * calls back with the result.
 *
 * **Step two** compares what the sandbox printed against what the model
 * predicted *before* running, and states the verdict as the first thing in the
 * reply. That line is ours, computed by `verdictFor`; the prose after it is the
 * model's. Which means a judge reading the answer can tell what was measured
 * from what was narrated.
 *
 * Falls back to a plain turn whenever the lane cannot proceed — a reply that is
 * not usable JSON, a multi-line program, a missing prediction. A coding answer
 * without a sandbox run is a worse answer, not a broken product.
 * @param {import("./model-provider.js").ModelProvider} modelProvider
 * @param {{ messages: unknown[] }} options
 * @param {{ runtimeId: string | null }} dispatch
 */
async function* codeLanePieces(modelProvider, options, dispatch) {
	const model = dispatch.runtimeId ?? undefined;

	if (sandboxHasReported(options.messages)) {
		const prediction = pendingPrediction();
		if (prediction === null) {
			yield* modelProvider.answer({ messages: options.messages, model });
			return;
		}
		const result = verdictFor(prediction.expected, sandboxOutput(options.messages));
		clearPrediction();
		// Recorded here rather than when the call was emitted, because this is the
		// first point the outcome is known — and an audit trail listing a sandbox
		// run without saying what it produced is the half of the record that
		// matters least. Without this a coding-lane approval note would name only
		// the tools we dispatch ourselves and under-report its own work.
		recordTool(SANDBOX_TOOL_NAME, { outcome: `${result.verdict.toLowerCase()} — the sandbox computed ${result.actual || "nothing"}` });
		yield { type: "text", text: `${describeVerdict(result)}\n\n` };
		yield* modelProvider.answer({ messages: options.messages, model });
		return;
	}

	const reply = await drainText(
		modelProvider.answer({
			model,
			schema: PYTHON_PROGRAM_SCHEMA,
			schemaName: PYTHON_PROGRAM_SCHEMA_NAME,
			maxTokens: CODE_LANE_MAX_TOKENS,
			messages: [{ role: "system", content: CODE_LANE_SYSTEM_PROMPT }, ...options.messages],
		}),
	);

	let program;
	let command;
	try {
		program = parseProgram(reply);
		command = pythonCommand(program.code);
	} catch (error) {
		console.warn(`@blind-flange/dsh-client-ui-base: coding lane fell back to a plain turn — ${error.message}`);
		yield* modelProvider.answer({ messages: options.messages, model });
		return;
	}

	rememberPrediction(program);
	yield { type: "text", text: `${program.description}\n\nPredicted result: ${program.expected}\n\n` };
	yield {
		type: "tool-call",
		id: `bf-code-lane-${Date.now()}`,
		name: SANDBOX_TOOL_NAME,
		arguments: JSON.stringify({ command, description: program.description }),
	};
}

/**
 * A reply ceiling. A third of the failures during bring-up were the *schema
 * output itself* truncating mid-string because the model rambled past 300
 * tokens — a defect in our request, not in the model.
 */
const CODE_LANE_MAX_TOKENS = 700;

async function* streamImpl(modelProvider, options) {
	const dispatch = dispatchForTurn();
	// The lane that shapes the request is chosen by task type; the model that
	// answers it by dispatch. Both come from the same routing decision.
	const pieces = servesTaskType(currentTaskType())
		? codeLanePieces(modelProvider, options, dispatch)
		: modelProvider.answer({ messages: options.messages, model: dispatch.runtimeId ?? undefined });
	let index = -1;
	let openTextIndex = -1;
	let openText = "";
	let sawToolCall = false;
	try {
		for await (const piece of pieces) {
			if (piece.type === "text") {
				if (piece.text.length === 0) continue;
				if (openTextIndex === -1) {
					index += 1;
					openTextIndex = index;
					yield { type: "block-start", index: openTextIndex, blockType: "text" };
				}
				openText += piece.text;
				yield { type: "text-delta", index: openTextIndex, text: piece.text };
				continue;
			}
			if (piece.type !== "tool-call") continue;
			if (openTextIndex !== -1) {
				yield { type: "block-end", index: openTextIndex, block: { type: "text", text: openText } };
				openTextIndex = -1;
				openText = "";
			}
			sawToolCall = true;
			index += 1;
			const toolIndex = index;
			yield { type: "block-start", index: toolIndex, blockType: "tool-call" };
			yield { type: "tool-call-delta", index: toolIndex, id: piece.id, name: piece.name, argumentsDelta: piece.arguments };
			yield { type: "block-end", index: toolIndex, block: { type: "tool-call", id: piece.id, name: piece.name, arguments: piece.arguments } };
		}
		if (openTextIndex !== -1) {
			yield { type: "block-end", index: openTextIndex, block: { type: "text", text: openText } };
		}
		yield { type: "finish", reason: sawToolCall ? { kind: "tool-calls" } : { kind: "stop" } };
	} catch (error) {
		if (openTextIndex !== -1) {
			yield { type: "block-end", index: openTextIndex, block: { type: "text", text: openText } };
		}
		yield {
			type: "finish",
			reason: { kind: "error", failure: { message: error instanceof Error ? error.message : String(error), code: "MODEL_PROVIDER_ERROR" } },
		};
	}
}

/**
 * @param {import("./model-provider.js").ModelProvider} modelProvider - the selected provider this adapter serves turns from.
 * @param {{ displayName: string }} options
 */
export function createLlmAdapter(modelProvider, { displayName }) {
	// State every licence refusal once, at mount — an error line per refused
	// fleet member naming the licence that caused it (Story 3.4). This is the
	// "not a warning, a refusal" the licence policy requires; `fleetModels`
	// then serves only the members that passed.
	try {
		announceRefusals(loadFleet().refused);
	} catch (error) {
		console.warn(`@blind-flange/dsh-client-ui-base: fleet registry not read for the licence gate — ${error.message}`);
	}

	const stream = (options) => streamImpl(modelProvider, options);
	return {
		providerInfo(provider) {
			return { id: provider, name: displayName };
		},
		providerRetryPolicy() {
			return undefined;
		},
		async listModels(provider) {
			return fleetModels(provider ?? "replay");
		},
		resolveModel,
		async prepareCall(provider, model) {
			return { model: await resolveModel(provider, model), stream };
		},
		stream,
	};
}
