/**
 * `replay`: serves stored responses (CONTEXT.md "Replay"). For Phase 0 those
 * entries are authored by hand, not captured from a real `local` run —
 * ADR-0001's 28 August 2026 amendment, because `local` inference is a day-4
 * stretch goal and there is nothing to capture from yet. `replay-cache.json`
 * uses the same shape a captured cache would use (an ordered list of blocks
 * per turn), so replacing an authored entry with a captured one later is a
 * data change, not a code change.
 *
 * Story 5.1 extends an entry from one response to an ordered list of `steps`,
 * one per model call in the turn. A step may include a `tool-call` block: the
 * harness dispatches that call for real (this file only supplies the model's
 * half), appends the real result to the message history, and calls back in
 * for the next step. `pickStep` below is what tells two calls into the same
 * entry apart from a fresh one.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ModelProviderError } from "./model-provider.js";

const CACHE_PATH = join(dirname(fileURLToPath(import.meta.url)), "replay-cache.json");

/** A placeholder in an authored tool-call's arguments, resolved from the most recent `create_goal`/`get_goal`/`update_goal` result seen in history. Authored replay cannot know a runtime-generated goal id ahead of time — see `resolveArguments`. */
const GOAL_ID_PLACEHOLDER = "$GOAL_ID";
const GOAL_REVISION_PLACEHOLDER = "$GOAL_REVISION";

/** A message's plain text, joining its text blocks; "" for a message that carries none (e.g. a tool-result). */
function messageText(message) {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

/** Whether `message` is a tool-result message (`role: "user"`, `source.kind: "tool"` — message.ts). */
function isToolResult(message) {
	return message.role === "user" && message.source?.kind === "tool";
}

/**
 * Whether `message` is the genuine human turn, as opposed to a same-role
 * message the harness folds into history around it: a tool result
 * (`source.kind: "tool"`), or context the harness itself injects as a
 * "user"-role message — a runtime-context snapshot (`source.kind: "plugin"`),
 * a skill catalog (`source.kind: "skill-catalog"`), or an auxiliary call this
 * same adapter also serves, such as session-title generation
 * (`source.kind: "dsh-session-title-llm"`). Verified against a real session
 * log on 28 Aug 2026: those injections land in `options.messages` AFTER the
 * human's own message, so scanning for "the last user-role message" without
 * this check picks one of them instead (Story 5.1's original bug — the
 * scripted entry never matched because the "last user text" was a skill
 * catalog, not the operator's request). A message with no `source` at all
 * (every existing unit test's shape) still counts, matching this file's
 * pre-Story-5.1 behaviour.
 */
function isGenuineHumanMessage(message) {
	return message.role === "user" && (message.source === undefined || message.source.kind === "user");
}

/**
 * Find the turn's trigger — the most recent genuine human message — and how
 * many tool round trips have completed since it. Each authored step carries
 * at most one tool-call block, so that count is exactly the step index to
 * serve next.
 * @param {Array<{ role?: string, content?: unknown, source?: { kind?: string } }>} messages
 * @returns {{ text: string, stepIndex: number }}
 */
function triggerAndStep(messages) {
	let triggerIndex = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (isGenuineHumanMessage(messages[i])) {
			triggerIndex = i;
			break;
		}
	}
	if (triggerIndex === -1) return { text: "", stepIndex: 0 };
	let stepIndex = 0;
	for (let i = triggerIndex + 1; i < messages.length; i += 1) {
		if (isToolResult(messages[i])) stepIndex += 1;
	}
	return { text: messageText(messages[triggerIndex]), stepIndex };
}

/** The parsed JSON body of the most recent tool-result message carrying a `goal` field, or undefined. */
function latestGoalResult(messages) {
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		const message = messages[i];
		if (!isToolResult(message)) continue;
		const resultBlock = message.content.find((block) => block.type === "tool-result");
		const textBlock = resultBlock?.content?.find((block) => block.type === "text");
		if (!textBlock) continue;
		let parsed;
		try {
			parsed = JSON.parse(textBlock.text);
		} catch {
			continue;
		}
		if (parsed?.goal && typeof parsed.goal.id === "string") return parsed.goal;
	}
	return undefined;
}

/** Substitute `$GOAL_ID`/`$GOAL_REVISION` placeholders in an authored tool-call's arguments with the real values from history. */
function resolveArguments(rawArguments, messages) {
	const entries = Object.entries(rawArguments ?? {});
	const needsGoal = entries.some(([, value]) => value === GOAL_ID_PLACEHOLDER || value === GOAL_REVISION_PLACEHOLDER);
	const goal = needsGoal ? latestGoalResult(messages) : undefined;
	const resolved = {};
	for (const [key, value] of entries) {
		if (value === GOAL_ID_PLACEHOLDER) resolved[key] = goal?.id;
		else if (value === GOAL_REVISION_PLACEHOLDER) resolved[key] = goal?.revision;
		else resolved[key] = value;
	}
	return resolved;
}

export class ReplayModelProvider {
	/** @param {string} [cachePath] - override for tests; defaults to the shipped authored cache. */
	constructor(cachePath = CACHE_PATH) {
		this.entries = JSON.parse(readFileSync(cachePath, "utf8"));
		this.callCounter = 0;
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
		const { text, stepIndex } = triggerAndStep(request.messages);
		const entry = this.pickEntry(text);
		const steps = entry.steps ?? [{ blocks: entry.blocks ?? [] }];
		const step = steps[Math.min(stepIndex, steps.length - 1)];
		for (const block of step.blocks) {
			if (block.type === "text") {
				yield { type: "text", text: block.text };
			} else if (block.type === "tool-call") {
				this.callCounter += 1;
				yield {
					type: "tool-call",
					id: `replay-call-${this.callCounter}`,
					name: block.name,
					arguments: JSON.stringify(resolveArguments(block.arguments, request.messages)),
				};
			}
		}
	}
}
