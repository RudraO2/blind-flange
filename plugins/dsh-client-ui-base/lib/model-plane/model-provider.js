/**
 * The `ModelProvider` contract (ADR-0001; CONTEXT.md "Model plane"): our own
 * interface, not the harness's. Everything behind it is a swap, never a
 * rewrite. Three names are selectable — `replay`, `local`, `remote` — and
 * which one runs is a configuration value read once in `createModelProvider`,
 * never a code path (FR7). The harness-facing bridge lives in
 * `llm-adapter.js`; nothing in this file knows the harness exists.
 */

import { LocalModelProvider } from "./local-provider.js";
import { ReplayModelProvider } from "./replay-provider.js";

/**
 * @typedef {object} ModelRequest
 * @property {unknown[]} messages   - harness messages for this turn. The only field `replay` reads.
 * @property {string}  [model]      - runtime model id to dispatch to, resolved from the fleet registry by the router's decision. Ignored by `replay`.
 * @property {object}  [schema]     - JSON schema the reply must satisfy. How a caller gets a tool call out of a small model; see `local-provider.js`. Ignored by `replay`.
 * @property {string}  [schemaName] - a name for that schema, for the server's error messages.
 * @property {Array<{ mediaType: string, base64: string }>} [images] - vision input. Ignored by `replay`.
 * @property {number}  [maxTokens]  - reply ceiling.
 * @property {number}  [temperature] - defaults to 0, so a demo can be rehearsed.
 * @property {AbortSignal} [signal] - cancellation.
 */

/**
 * @typedef {{ type: "text", text: string }
 *          | { type: "reasoning", text: string }
 *          | { type: "tool-call", id: string, name: string, arguments: string }} ModelPiece
 */

/** Thrown when a configured provider name has no implementation to select, or when a selected provider cannot answer. */
export class ModelProviderError extends Error {
	constructor(message) {
		super(message);
		this.name = "ModelProviderError";
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
 * `LocalModelProvider`) directly.
 *
 * **The request object was widened for `local`, not forked.** It carried only
 * `messages`; real inference also needs to know which model to dispatch to,
 * whether to constrain the reply to a schema, whether an image is attached, and
 * how to be cancelled. ADR-0001's claim is that everything behind this seam is
 * a swap and never a rewrite — a second interface for `local` would have broken
 * that claim on its first real use. `replay` ignores every added field, which is
 * why its tests are unchanged.
 * @param {string} name - one of "replay", "local", "remote".
 * @returns {{ answer(request: ModelRequest): AsyncGenerator<ModelPiece> }}
 */
export function createModelProvider(name) {
	const factory = FACTORIES[name];
	if (!factory) {
		throw new ModelProviderError(`unknown model provider "${name}" — expected one of: ${Object.keys(FACTORIES).join(", ")}`);
	}
	return factory();
}
