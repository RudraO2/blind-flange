/**
 * `local`: real inference on this machine's GPU, through llama-swap.
 *
 * ADR-0001 declared this provider and left it throwing, because local inference
 * was a day-4 stretch goal. This is that goal. Nothing above the
 * `ModelProvider` seam changes: the harness bridge, the router, the tools and
 * the panels all keep working, which is the claim ADR-0001 made and this file
 * is its first real test.
 *
 * **Why HTTP to a local service rather than an in-process runtime.** The plugin
 * is mounted with `link:`, so Node resolves bare specifiers from the repo's own
 * path where the harness's dependencies do not exist — see `llm-adapter.js`'s
 * header. That makes `import "node-llama-cpp"` unavailable and a hand-rolled
 * binding pointless. A loopback `fetch` needs no resolution at all, and the
 * ingestion service at `127.0.0.1:8642` already establishes the pattern.
 *
 * **Why llama-swap owns residency.** The only GPU is a GTX 1650 Ti with about
 * 3.7 GB free, and the fleet does not fit in it at once. llama-swap loads on
 * demand and evicts to make room — one model at a time is its default with no
 * routing configuration, which is exactly the policy we want. Measured on this
 * box: a warm swap costs roughly 3 seconds, because both GGUFs stay in the OS
 * page cache. We read residency from its `/running` endpoint rather than
 * tracking it ourselves.
 *
 * **Why a JSON schema instead of native tool calling.** Measured, not assumed.
 * `Qwen2.5-Coder-1.5B-Instruct` receives the tool definitions and names them
 * correctly, but wraps the call in a fenced JSON block instead of the tag its
 * own chat template specifies, so llama-server's template-derived parser
 * returns it as prose with an empty `tool_calls`. Setting `tool_choice` to
 * `required`, and naming the function explicitly, both failed the same way.
 * Constraining the *response* to a schema worked first time and seven times
 * faster. So a caller that wants a tool call passes `schema`, reads the
 * validated object out, and builds the call itself — the model chooses content,
 * the lane chooses the tool.
 *
 * Everything outbound here goes to loopback. The egress seal in `index.js`
 * governs *tool* calls and is untouched by this: the counted zero stays zero.
 */

import { ModelProviderError } from "./model-provider.js";
import { createSseParser } from "./sse.js";

/** Where llama-swap listens. Loopback on purpose: it has no authentication and must never be reachable off this machine. */
export const DEFAULT_LOCAL_ENDPOINT = "http://127.0.0.1:8080";

/**
 * The model id used when a request does not name one. These are llama-swap
 * config keys, not Hugging Face names — `registry/models.yaml` maps a fleet
 * member to its runtime id, so dispatch can resolve one from the other without
 * this file knowing about either.
 */
export const DEFAULT_LOCAL_MODEL = "bf-coder";

/** Temperature 0 by default: a demo that answers differently each run is a demo that cannot be rehearsed. */
const DEFAULT_TEMPERATURE = 0;

/** Roles the chat endpoint accepts. Anything else is folded to `user`. */
const CHAT_ROLES = new Set(["system", "user", "assistant"]);

/**
 * A harness message's plain text. Mirrors `replay-provider.js`'s `messageText`
 * deliberately rather than sharing it: that one serves trigger matching against
 * an authored cache, this one serves wire serialisation, and coupling them
 * would mean a change for one silently altering the other.
 * @param {{ content?: unknown }} message
 */
function messageText(message) {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	const parts = [];
	for (const block of message.content) {
		if (block?.type === "text" && typeof block.text === "string") {
			parts.push(block.text);
			continue;
		}
		// A tool result carries its payload one level down, as text blocks. The
		// model needs to see it — it is the outcome of the action it asked for —
		// so it is flattened in rather than dropped.
		if (block?.type === "tool-result" && Array.isArray(block.content)) {
			for (const inner of block.content) {
				if (inner?.type === "text" && typeof inner.text === "string") parts.push(inner.text);
			}
		}
	}
	return parts.join("\n");
}

/**
 * Translate harness messages into OpenAI chat messages, attaching images to the
 * final user message when the request carries any.
 *
 * Empty messages are dropped: llama-server rejects a message with no content,
 * and the harness legitimately produces them (a tool-result whose payload was
 * not text, for instance).
 * @param {Array<{ role?: string, content?: unknown }>} messages
 * @param {Array<{ mediaType: string, base64: string }>} [images]
 */
export function toChatMessages(messages, images) {
	const source = Array.isArray(messages) ? messages : [];
	const chat = [];
	for (const message of source) {
		const text = messageText(message);
		if (text === "") continue;
		const role = CHAT_ROLES.has(message.role) ? message.role : "user";
		chat.push({ role, content: text });
	}

	if (!Array.isArray(images) || images.length === 0) return chat;

	// Vision input rides the last user message as OpenAI `image_url` parts with
	// data URLs, which is what llama-server's multimodal path reads. Absent any
	// user message we make one, so an image-only request is still well formed.
	let index = -1;
	for (let i = chat.length - 1; i >= 0; i -= 1) {
		if (chat[i].role === "user") {
			index = i;
			break;
		}
	}
	if (index === -1) {
		chat.push({ role: "user", content: "" });
		index = chat.length - 1;
	}
	const parts = [];
	if (chat[index].content !== "") parts.push({ type: "text", text: chat[index].content });
	for (const image of images) {
		parts.push({ type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.base64}` } });
	}
	chat[index] = { role: "user", content: parts };
	return chat;
}

/**
 * Build the request body for llama-swap's OpenAI-compatible endpoint.
 * @param {{ messages: unknown[], model?: string, schema?: object, schemaName?: string, images?: unknown[], maxTokens?: number, temperature?: number }} request
 * @param {string} defaultModel
 */
export function buildRequestBody(request, defaultModel) {
	const body = {
		model: request.model ?? defaultModel,
		messages: toChatMessages(request.messages, request.images),
		stream: true,
		temperature: request.temperature ?? DEFAULT_TEMPERATURE,
	};
	if (typeof request.maxTokens === "number") body.max_tokens = request.maxTokens;
	if (request.schema) {
		// `strict: true` is what turns the schema into a sampling constraint
		// rather than a suggestion — the reason a 1.5B can be relied on here.
		body.response_format = {
			type: "json_schema",
			json_schema: { name: request.schemaName ?? "bf_response", strict: true, schema: request.schema },
		};
	}
	return body;
}

/** Distinguishable failures, so a demo never has to guess which of three things went wrong. */
function unreachable(endpoint, cause) {
	return new ModelProviderError(
		`the local model plane could not reach llama-swap at ${endpoint} — start it with ` +
			`\`llama-swap --config <path> --listen 127.0.0.1:8080\` before selecting the local provider (${cause})`,
	);
}

function badStatus(status, model, detail) {
	if (status === 404) {
		return new ModelProviderError(
			`llama-swap does not have a model called "${model}" — the id must match a key under \`models:\` in its config (404)`,
		);
	}
	// llama-server reports an allocation failure in the body rather than the
	// status, and on 3.7 GB of VRAM it is the failure most likely to happen.
	if (/out of memory|failed to allocate|vk::.*Memory/i.test(detail)) {
		return new ModelProviderError(
			`"${model}" ran out of GPU memory. Lower \`--ctx-size\`, confirm \`--parallel 1\`, or switch the ` +
				`model plane back to \`replay\` in profile/web/cordis.patch.yml (${status})`,
		);
	}
	return new ModelProviderError(`llama-swap returned ${status} for "${model}": ${detail.slice(0, 400)}`);
}

export class LocalModelProvider {
	/**
	 * @param {object} [options]
	 * @param {string} [options.endpoint] - llama-swap's base URL.
	 * @param {string} [options.defaultModel] - used when a request names no model.
	 * @param {typeof globalThis.fetch} [options.fetchImpl] - injected in tests; defaults to the platform `fetch`.
	 */
	constructor({ endpoint, defaultModel, fetchImpl } = {}) {
		this.endpoint = (endpoint ?? process.env.BF_LOCAL_ENDPOINT ?? DEFAULT_LOCAL_ENDPOINT).replace(/\/+$/, "");
		this.defaultModel = defaultModel ?? process.env.BF_LOCAL_MODEL ?? DEFAULT_LOCAL_MODEL;
		this.fetchImpl = fetchImpl ?? globalThis.fetch;
	}

	/** Which models llama-swap currently holds in memory — the residency surface reads this rather than tracking state. */
	async running() {
		try {
			const response = await this.fetchImpl(`${this.endpoint}/running`, { method: "GET" });
			if (!response.ok) return [];
			const payload = await response.json();
			return Array.isArray(payload?.running) ? payload.running : [];
		} catch {
			// Residency is decoration; never let reading it break a turn.
			return [];
		}
	}

	/**
	 * Stream one turn. Yields `{ type: "text" }` pieces, and `{ type: "reasoning" }`
	 * where the model emits it — the adapter ignores piece types it does not
	 * know, so reasoning is carried for the execution trace at no cost today.
	 * @param {{ messages: unknown[], model?: string, schema?: object, images?: unknown[], signal?: AbortSignal }} request
	 */
	async *answer(request) {
		const model = request.model ?? this.defaultModel;
		const url = `${this.endpoint}/v1/chat/completions`;
		const body = buildRequestBody(request, this.defaultModel);

		let response;
		try {
			response = await this.fetchImpl(url, {
				method: "POST",
				headers: { "content-type": "application/json", accept: "text/event-stream" },
				body: JSON.stringify(body),
				signal: request.signal,
			});
		} catch (error) {
			throw unreachable(this.endpoint, error instanceof Error ? error.message : String(error));
		}

		if (!response.ok) {
			let detail = "";
			try {
				detail = await response.text();
			} catch {
				detail = "(no response body)";
			}
			throw badStatus(response.status, model, detail);
		}
		if (!response.body) {
			throw new ModelProviderError(`llama-swap returned no response body for "${model}"`);
		}

		const parser = createSseParser();
		const decoder = new TextDecoder();
		for await (const chunk of response.body) {
			// Node hands back Uint8Array; a stubbed fetch may hand back strings.
			const text = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
			for (const piece of parser.push(text)) {
				// Return on the terminator rather than after the batch: several SSE
				// events routinely arrive in one TCP read, so anything the server
				// wrote after `[DONE]` sits in the same array as the pieces before
				// it. Draining the array first would leak that trailing text into
				// the answer.
				if (piece.type === "done") return;
				yield piece;
			}
		}
		for (const piece of parser.flush()) {
			if (piece.type === "done") return;
			yield piece;
		}
	}
}
