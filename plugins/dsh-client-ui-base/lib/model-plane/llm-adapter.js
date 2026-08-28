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

import { allowedFleet } from "../registry/fleet.js";

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
 * the router (Stories 3.5-3.6) reads the same shape. Disallowed-licence members
 * are filtered by `allowedFleet` so an unrunnable model is never choosable; a
 * registry read failure yields an empty list rather than breaking the picker.
 * @param {string} provider - the provider token this adapter serves under.
 */
function fleetModels(provider) {
	try {
		return allowedFleet().map((member) => ({
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
 * vocabulary. Block-start and block-end always come in a matching pair, even
 * on failure — `modelProvider.answer()` throwing after some text was already
 * emitted must not leave the block open when the terminal `error` finish
 * chunk lands.
 * @param {import("./model-provider.js").ModelProvider} modelProvider
 * @param {{ messages: unknown[] }} options
 */
async function* streamImpl(modelProvider, options) {
	const index = 0;
	let text = "";
	yield { type: "block-start", index, blockType: "text" };
	try {
		for await (const piece of modelProvider.answer({ messages: options.messages })) {
			if (piece.type !== "text" || piece.text.length === 0) continue;
			text += piece.text;
			yield { type: "text-delta", index, text: piece.text };
		}
		yield { type: "block-end", index, block: { type: "text", text } };
		yield { type: "finish", reason: { kind: "stop" } };
	} catch (error) {
		yield { type: "block-end", index, block: { type: "text", text } };
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
