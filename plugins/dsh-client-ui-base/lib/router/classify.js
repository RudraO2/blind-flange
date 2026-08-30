/**
 * The router's classifier (Story 3.5).
 *
 * CONTEXT.md "Router": the component that picks which fleet member answers a
 * request "by inspectable classifier score rather than a hard-coded rule". This
 * module is the first half of that — it does not score or pick anything (Story
 * 3.6), it only works out *what kind of job* the request is, so the operator
 * never has to.
 *
 * A request resolves to exactly one of four task types:
 *
 *   - `document`    — reading or reasoning over report text: an inspection or
 *                     maintenance report, clauses, findings, a scanned page.
 *   - `drawing`     — a P&ID or other engineering drawing: symbol and tag
 *                     inventory, line numbers, loop sheets, isometrics.
 *   - `calculation` — an engineering calculation: sizing, pressure drop, flow
 *                     rate, wall thickness, a formula to evaluate.
 *   - `code`        — a coding task: write, refactor, debug or test a program.
 *
 * ## How it decides
 *
 * Each task type owns a list of named rules (a word or a small regex). Every
 * rule that matches the request text contributes one point to its type. The
 * type with the most points wins; ties break by {@link TASK_TYPE_PRIORITY}, a
 * fixed order, so the same request always classifies the same way. A request
 * that matches no rule at all falls back to `document` — the workbench's most
 * common job is reading a report — and the result says so (`matchedRuleCount`
 * is 0).
 *
 * The output is structured data, not prose: a caller — the session log (Story
 * 3.5), the routing chip (Story 3.7) — renders it, it is never a sentence the
 * classifier wrote. Keyword matching is deliberately simple for Phase 0; the
 * seam that matters is that the decision is inspectable, and swapping in a real
 * classifier later is a change to this one file.
 */

import { lastGenuineUserMessage } from "../model-plane/injected.js";

/** The four task types a request can classify as. The router scores the fleet against exactly these (Story 3.6). */
export const TASK_TYPES = ["document", "drawing", "calculation", "code"];

/**
 * Tie-break order when two or more task types score equally. Earlier wins.
 * `code` and `drawing` lead because their rules are the most specific — a
 * request that trips a `code` rule and a `document` rule is almost always a
 * coding task phrased around a document.
 */
export const TASK_TYPE_PRIORITY = ["code", "drawing", "calculation", "document"];

/** The task type a request with no rule hits resolves to. */
export const FALLBACK_TASK_TYPE = "document";

/**
 * Rule sets, one per task type. Each entry is `[name, test]` where `test` is a
 * `RegExp` matched against the lower-cased request text. Names are stable — the
 * routing chip shows them as the working behind the decision.
 * @type {Record<string, Array<[string, RegExp]>>}
 */
const RULES = {
	document: [
		["inspection-report", /\b(inspection|maintenance)\s+report\b/],
		["report-noun", /\breports?\b/],
		["findings", /\bfindings?\b/],
		["clause-or-section", /\b(clause|section|paragraph|sub-?clause)\b/],
		["summarise", /\bsummar(?:ise|ize|y)\b/],
		["scanned-page", /\b(scanned|scan|page\s+\d+|annotation|handwritten)\b/],
		["read-the-document", /\bread\s+(the\s+)?(report|document|page|scan|pdf)\b/],
		["corrosion-note", /\b(corrosion|pitting|wall\s+loss|defect\s+log)\b/],
	],
	drawing: [
		["p-and-id", /\bp\s*&\s*id\b|\bpiping\s+and\s+instrumentation\b/],
		["pid-abbrev", /\bp&?ids?\b/],
		["tag-inventory", /\b(tag|symbol)\s+inventory\b/],
		["line-number", /\bline\s+numbers?\b/],
		["drawing-noun", /\b(drawing|schematic|isometric|iso\s+drawing|loop\s+sheet)\b/],
		["instrument-loop", /\b(instrument\s+loop|control\s+loop|valve\s+symbol)\b/],
		["region-qa", /\bwhat\s+(is|does)\s+.*\b(this|the)\s+(symbol|valve|line|region)\b/],
	],
	calculation: [
		["calculate-verb", /\b(calculate|compute|work\s+out|evaluate)\b/],
		["pressure-drop", /\bpressure\s+drop\b/],
		["flow-rate", /\bflow\s*rate\b|\bflow\s+velocity\b/],
		["reynolds", /\breynolds\b/],
		["sizing", /\b(sizing|size\s+the|line\s+sizing|relief\s+sizing)\b/],
		["wall-thickness", /\b(wall\s+thickness|minimum\s+thickness|t-?min|corrosion\s+allowance)\b/],
		["formula", /\b(formula|equation)\b/],
		["units", /\b(psi|bar\b|kpa|mpa|m3\/h|kg\/s|kg\/h|mm\/yr|°c|deg\s?c)\b/],
	],
	code: [
		["code-noun", /\bcode\b|\bsource\s+code\b/],
		["write-a-program", /\b(write|generate)\s+(a\s+)?(script|function|program|class|module)\b/],
		["language", /\b(python|javascript|typescript|node\.?js|bash|sql|regex)\b/],
		["refactor-or-debug", /\b(refactor|debug|fix\s+the\s+bug|stack\s+trace|traceback)\b/],
		["unit-test", /\bunit\s+tests?\b|\btest\s+coverage\b/],
		["api-or-cli", /\b(api\s+endpoint|cli\s+command|command-?line\s+tool)\b/],
		["code-fence", /```/],
	],
};

/**
 * @typedef {object} TaskClassification
 * @property {string}                 taskType         - the winning task type; one of {@link TASK_TYPES}.
 * @property {Record<string, number>} scores           - points per task type, every type present (0 when nothing matched).
 * @property {Record<string, string[]>} matchedRules   - the rule names that fired, grouped by task type.
 * @property {number}                 matchedRuleCount - total rules that fired; 0 means the result is the fallback.
 * @property {boolean}                fallback         - true when no rule fired and `taskType` is {@link FALLBACK_TASK_TYPE}.
 * @property {boolean}                tied             - true when the top score was shared and {@link TASK_TYPE_PRIORITY} broke it.
 */

/**
 * Classify one request into a task type.
 * @param {string} text - the request's plain text (a non-string is treated as empty).
 * @returns {TaskClassification}
 */
export function classifyRequest(text) {
	const haystack = (typeof text === "string" ? text : "").toLowerCase();

	/** @type {Record<string, number>} */
	const scores = {};
	/** @type {Record<string, string[]>} */
	const matchedRules = {};
	let matchedRuleCount = 0;

	for (const taskType of TASK_TYPES) {
		const hits = [];
		for (const [name, test] of RULES[taskType]) {
			if (test.test(haystack)) hits.push(name);
		}
		scores[taskType] = hits.length;
		matchedRules[taskType] = hits;
		matchedRuleCount += hits.length;
	}

	if (matchedRuleCount === 0) {
		return {
			taskType: FALLBACK_TASK_TYPE,
			scores,
			matchedRules,
			matchedRuleCount: 0,
			fallback: true,
			tied: false,
		};
	}

	const topScore = Math.max(...TASK_TYPES.map((type) => scores[type]));
	const leaders = TASK_TYPE_PRIORITY.filter((type) => scores[type] === topScore);
	const taskType = leaders[0];

	return {
		taskType,
		scores,
		matchedRules,
		matchedRuleCount,
		fallback: false,
		tied: leaders.length > 1,
	};
}

/**
 * The last user-role message's plain text from a harness message list, or "" if
 * there is none. Mirrors `lastUserText` in `../model-plane/replay-provider.js`
 * — `content` is an array of blocks, but a bare string is tolerated for the
 * message shapes this classifier has not been verified against end to end.
 * @param {Array<{ role?: string, content?: unknown }>} messages
 * @returns {string}
 */
export function lastUserText(messages) {
	// The operator's own turn, not the runtime-context snapshot or the skill
	// catalogue the harness folds in as `role: "user"` AFTER it. Scanning
	// backwards for the last user-role message returned one of those instead, so
	// the router classified the injection rather than the request — the same bug
	// `replay-provider.js` recorded in Story 5.1, surfacing in a second file.
	const message = lastGenuineUserMessage(messages);
	if (!message) return "";
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";
	return message.content
		.filter((block) => block && block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}
