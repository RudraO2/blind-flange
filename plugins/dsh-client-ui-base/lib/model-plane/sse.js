/**
 * The Server-Sent Events parser `local-provider.js` reads llama-swap's replies
 * with. Split out from the provider so it can be tested as a pure function —
 * no socket, no GPU, no model — because this is the part most likely to break
 * and the part whose failures look like the model misbehaving.
 *
 * The shape is not guessed. It is taken from llama-swap's own client
 * (`ui/src/lib/chatApi.ts` at tag v251), which consumes the same endpoint
 * through the same proxy, plus llama.cpp's server README on SSE framing. Six
 * behaviours have to be tolerated, and every one of them was observed or
 * documented rather than imagined:
 *
 *   1. Payload lines are prefixed `data: ` — with the space.
 *   2. The stream terminates with a literal `data: [DONE]` sentinel, which is
 *      not JSON and must not be parsed as such.
 *   3. Text arrives at `choices[0].delta.content`.
 *   4. Reasoning text arrives at `delta.reasoning_content` *or* `delta.reasoning`.
 *      llama-swap's own parser accepts both spellings, so both occur.
 *   5. Chunks carrying neither field are normal (role-only openers, the final
 *      chunk with a `finish_reason`) and are skipped, not treated as errors.
 *   6. **Comment lines beginning with `:` are pings**, not payload. llama.cpp
 *      emits them via `sse_ping_interval` while a long prefill is otherwise
 *      silent — which is exactly the moment a parser that chokes on them would
 *      fail, and exactly the moment the failure would be blamed on the model.
 *
 * Plus the one every line-oriented network parser needs: a payload can be split
 * across two reads, so the trailing partial line is buffered rather than parsed.
 */

/**
 * @typedef {{ type: "text", text: string }
 *          | { type: "reasoning", text: string }
 *          | { type: "done", finishReason?: string }} SsePiece
 */

/**
 * A stateful line-oriented parser. Feed it decoded string chunks in arrival
 * order; each call returns the pieces that completed within it.
 *
 * `reasoning` pieces are emitted rather than dropped because the execution
 * trace wants them, and because the adapter ignores piece types it does not
 * recognise — so surfacing them costs nothing today and is there when the
 * trace panel needs it.
 * @returns {{ push(text: string): SsePiece[], flush(): SsePiece[], get finished(): boolean }}
 */
export function createSseParser() {
	let buffer = "";
	let finished = false;

	/**
	 * Turn one complete line into zero or more pieces.
	 * @param {string} rawLine
	 * @returns {SsePiece[]}
	 */
	function parseLine(rawLine) {
		// \r\n framing: the CR belongs to the transport, not the payload.
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		const trimmed = line.trim();

		// Keep-alive comment (behaviour 6) and blank event separators.
		if (trimmed === "" || trimmed.startsWith(":")) return [];
		if (!trimmed.startsWith("data:")) return [];

		// Tolerate `data:` with or without the conventional single space.
		const payload = trimmed.slice("data:".length).trimStart();
		if (payload === "[DONE]") {
			finished = true;
			return [{ type: "done" }];
		}

		let chunk;
		try {
			chunk = JSON.parse(payload);
		} catch {
			// A malformed payload is not worth failing a whole turn over — the
			// stream is still framed correctly and the next chunk is likely fine.
			return [];
		}

		const choice = chunk?.choices?.[0];
		const delta = choice?.delta ?? {};
		/** @type {SsePiece[]} */
		const pieces = [];

		const reasoning = delta.reasoning_content ?? delta.reasoning;
		if (typeof reasoning === "string" && reasoning.length > 0) {
			pieces.push({ type: "reasoning", text: reasoning });
		}
		if (typeof delta.content === "string" && delta.content.length > 0) {
			pieces.push({ type: "text", text: delta.content });
		}
		// A `finish_reason` closes the turn even when no [DONE] sentinel follows.
		if (typeof choice?.finish_reason === "string" && choice.finish_reason !== null) {
			finished = true;
			pieces.push({ type: "done", finishReason: choice.finish_reason });
		}
		return pieces;
	}

	return {
		push(text) {
			buffer += text;
			/** @type {SsePiece[]} */
			const pieces = [];
			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				pieces.push(...parseLine(buffer.slice(0, newline)));
				buffer = buffer.slice(newline + 1);
				newline = buffer.indexOf("\n");
			}
			return pieces;
		},
		/** Parse whatever is left when the socket closes without a trailing newline. */
		flush() {
			if (buffer === "") return [];
			const rest = buffer;
			buffer = "";
			return parseLine(rest);
		},
		get finished() {
			return finished;
		},
	};
}
