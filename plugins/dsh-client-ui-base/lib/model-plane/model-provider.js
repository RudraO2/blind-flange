/**
 * The `ModelProvider` contract (ADR-0001; CONTEXT.md "Model plane"): our own
 * interface, not the harness's. Everything behind it is a swap, never a
 * rewrite. Three names are selectable — `replay`, `local`, `remote` — and
 * which one runs is a configuration value read once in `createModelProvider`,
 * never a code path (FR7). The harness-facing bridge lives in
 * `llm-adapter.js`; nothing in this file knows the harness exists.
 */

import { ReplayModelProvider } from "./replay-provider.js";

/** Thrown when a configured provider name has no implementation to select, or when a selected provider cannot answer. */
export class ModelProviderError extends Error {
	constructor(message) {
		super(message);
		this.name = "ModelProviderError";
	}
}

/**
 * `local` is llama.cpp on the GTX 1650 (ADR-0001) — a day-4 stretch goal in
 * this four-day build, so there is no implementation yet. Declaring it here,
 * failing loud rather than answering nothing, is what keeps "select local"
 * a configuration change once it exists rather than a fork of this file.
 */
class LocalModelProvider {
	// Always throws before any yield; the generator shape is the contract other providers meet.
	async *answer() {
		throw new ModelProviderError(
			"the local model provider is a day-4 stretch goal (ADR-0001) and has no implementation in this Phase 0 build",
		);
	}
}

/**
 * `remote` is a rented GPU or API — a development convenience only.
 * ADR-0001 is explicit that it must never be the active provider during a
 * demo or a recording, and nothing in this repo is licensed to reach a
 * network endpoint outside a test (NFR15-17), so it stays unimplemented.
 */
class RemoteModelProvider {
	// Always throws before any yield; the generator shape is the contract other providers meet.
	async *answer() {
		throw new ModelProviderError("the remote model provider is a development convenience this build does not configure (ADR-0001)");
	}
}

const FACTORIES = {
	replay: () => new ReplayModelProvider(),
	local: () => new LocalModelProvider(),
	remote: () => new RemoteModelProvider(),
};

/**
 * Select a `ModelProvider` by name. The one place ADR-0001's "selected by
 * configuration, never by a code path" is enforced: every caller reaches a
 * provider through this lookup, never by importing `ReplayModelProvider` (or
 * a future local/remote implementation) directly.
 * @param {string} name - one of "replay", "local", "remote".
 * @returns {{ answer(request: { messages: unknown[] }): AsyncGenerator<{ type: "text", text: string }> }}
 */
export function createModelProvider(name) {
	const factory = FACTORIES[name];
	if (!factory) {
		throw new ModelProviderError(`unknown model provider "${name}" — expected one of: ${Object.keys(FACTORIES).join(", ")}`);
	}
	return factory();
}
