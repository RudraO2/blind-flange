/**
 * `replay`: serves stored responses (CONTEXT.md "Replay"). For Phase 0 those
 * entries are authored by hand, not captured from a real `local` run —
 * ADR-0001's 28 August 2026 amendment, because `local` inference is a day-4
 * stretch goal and there is nothing to capture from yet. `replay-cache.json`
 * uses the same shape a captured cache would use (an ordered list of blocks
 * per turn), so replacing an authored entry with a captured one later is a
 * data change, not a code change.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ModelProviderError } from "./model-provider.js";

const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), "replay-cache.json");

/**
 * The last user-role message's plain text, or "" when the turn carries none.
 * `message.content` is documented as an array of blocks, but is handled as a
 * bare string too — cheap insurance against a shape this file has not seen
 * verified against every path into the harness's message history.
 */
function lastUserText(messages) {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (message.role !== "user") continue;
		if (typeof message.content === "string") return message.content;
		return message.content
			.filter((block) => block.type === "text")
			.map((block) => block.text)
			.join("\n");
	}
	return "";
}

export class ReplayModelProvider {
	/** @param {string} [cachePath] - override for tests; defaults to the shipped authored cache. */
	constructor(cachePath = CACHE_PATH) {
		this.entries = JSON.parse(readFileSync(cachePath, "utf8"));
	}

	/** The first entry whose `match` is a case-insensitive substring of `text`, else the `match: null` entry. */
	pickEntry(text) {
		const lower = text.toLowerCase();
		const hit = this.entries.find((entry) => typeof entry.match === "string" && lower.includes(entry.match.toLowerCase()));
		const entry = hit ?? this.entries.find((entry) => entry.match === null);
		if (!entry) {
			throw new ModelProviderError("replay-cache.json has no matching entry and no fallback (match: null) entry");
		}
		return entry;
	}

	async *answer(request) {
		const entry = this.pickEntry(lastUserText(request.messages));
		for (const block of entry.blocks) {
			if (block.type === "text") yield { type: "text", text: block.text };
		}
	}
}
