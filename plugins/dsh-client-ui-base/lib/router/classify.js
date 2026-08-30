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
 * fixed order, so the same request always classifies the same way.
 *
 * **Two things outrank the keywords, because they are facts rather than
 * guesses.**
 *
 * *An attached image.* The fleet has one member that can see
 * (`modalities: [text, image]`) and one that cannot. If the operator attached a
 * picture, routing to the text-only coder does not produce a worse answer — it
 * produces an answer about an image nobody could look at. So an image confines
 * the decision to the two types the vision member serves, and the keywords only
 * choose between `document` and `drawing` inside that. `score.js` has always had
 * the same gate on the far side (`requires: { modality: "image" }`); this is the
 * near side of it, and until 31 August 2026 the classifier could not see an
 * attachment at all.
 *
 * *A request with no keyword hit at all.* This fell back to `document` until
 * 31 August 2026, which sent it to the vision member — and the vision member is
 * not the lane that builds a tool call. Measured that day: "Open WhatsApp and
 * check the vendor thread" and "Run a shell command in the sandbox that opens
 * https://web.whatsapp.com" both matched zero rules, both landed on the vision
 * member, and both were answered conversationally with no tool call — so the
 * egress waterfall, which is the whole point of that request, was never reached.
 * An unclassifiable request now falls back to `code`, which is the lane that
 * reaches for the sandbox. Reading a report is what the *rules* are for, and the
 * document rules are the broadest set here; a request that trips none of them is
 * not usually a document question.
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

/**
 * The task type a request with no rule hits resolves to when no image is
 * attached. See the header for why this is `code` rather than `document`.
 */
export const FALLBACK_TASK_TYPE = "code";

/**
 * The fallback when an image *is* attached. Both of these are served by the
 * vision member; `document` is the more common of the two by a wide margin, and
 * a drawing question reliably trips the `drawing` rules.
 */
export const IMAGE_FALLBACK_TASK_TYPE = "document";

/**
 * The task types the vision member serves — the only ones a turn carrying an
 * image may resolve to. Kept here rather than in `score.js` because it is the
 * same fact stated on the near side of the decision: `score.js` gates on a
 * member's declared modality, this gates on the request's.
 */
export const IMAGE_TASK_TYPES = ["document", "drawing"];

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
		// Bare arithmetic, which `docs/router-handoff.md` records as the router's
		// largest hole: "Sum the integers from 1 to 100" tripped nothing at all and
		// went to the vision member, which answered it *from memory* instead of
		// computing it. A confident wrong number in an approval note is worse than
		// a slow one, and the coding lane exists precisely because a small model is
		// bad at arithmetic and good at writing `print(sum(range(1, 101)))`.
		//
		// `\bsum\b` does not match "summarise" — the boundary is what keeps this
		// off the document lane's most common verb.
		["arithmetic-verb", /\b(sum|count|total|average|mean|median|minimum|maximum|round|divisible|percentage)\b/],
		["how-many", /\bhow\s+many\b/],
	],
	code: [
		["code-noun", /\bcode\b|\bsource\s+code\b/],
		["write-a-program", /\b(write|generate)\s+(a\s+)?(script|function|program|class|module)\b/],
		["language", /\b(python|javascript|typescript|node\.?js|bash|sql|regex)\b/],
		["refactor-or-debug", /\b(refactor|debug|fix\s+the\s+bug|stack\s+trace|traceback)\b/],
		["unit-test", /\bunit\s+tests?\b|\btest\s+coverage\b/],
		["api-or-cli", /\b(api\s+endpoint|cli\s+command|command-?line\s+tool)\b/],
		["code-fence", /```/],
		// The shell itself, however it is named. `api-or-cli` above only ever
		// matched the exact phrases "cli command" and "command-line tool", so
		// "run a shell command" scored zero — measured 31 August 2026.
		["shell", /\b(shell|terminal|powershell|pwsh|cmd|sandbox)\b/],
		["command-noun", /\bcommands?\b/],
		// NOT A RULE, DELIBERATELY: a bare action verb — run, open, launch,
		// execute, install. It was one for about ten minutes on 31 August 2026 and
		// the bleed was immediate: "open the report" and "run through the
		// findings" both scored 1-1 against `document` and lost the tie to `code`,
		// because `code` leads TASK_TYPE_PRIORITY. "open the drawing" was worse —
		// it routed a drawing question away from the only member that can see.
		//
		// Those verbs are ordinary English and too weak to be worth a point. The
		// case they were added for — "open WhatsApp", "launch the browser",
		// "install the package" — needs no rule at all, because it trips nothing
		// else either and the fallback is now `code`. The fallback carries it, and
		// carries it without taxing every sentence that happens to say "open".
	],
};

/**
 * @typedef {object} TaskClassification
 * @property {string}                 taskType         - the winning task type; one of {@link TASK_TYPES}.
 * @property {Record<string, number>} scores           - points per task type, every type present (0 when nothing matched).
 * @property {Record<string, string[]>} matchedRules   - the rule names that fired, grouped by task type.
 * @property {number}                 matchedRuleCount - total rules that fired; 0 means the result is the fallback.
 * @property {boolean}                fallback         - true when no *eligible* rule fired and `taskType` is the fallback.
 * @property {boolean}                hasImage         - true when the turn carried an attached image, which confined the result to {@link IMAGE_TASK_TYPES}.
 * @property {boolean}                tied             - true when the top score was shared and {@link TASK_TYPE_PRIORITY} broke it.
 */

/**
 * Classify one request into a task type.
 * @param {string} text - the request's plain text (a non-string is treated as empty).
 * @param {{ hasImage?: boolean }} [options] - `hasImage` when the turn carries an
 *   attached picture, which confines the result to {@link IMAGE_TASK_TYPES}.
 * @returns {TaskClassification}
 */
export function classifyRequest(text, options = {}) {
	const haystack = (typeof text === "string" ? text : "").toLowerCase();
	const hasImage = options?.hasImage === true;

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

	// An attached image confines the decision to what the vision member serves.
	// The scores are still reported in full — the routing chip shows the working,
	// and hiding the excluded types would make the decision less inspectable, not
	// more.
	const eligible = hasImage ? IMAGE_TASK_TYPES : TASK_TYPES;
	const eligibleHits = eligible.reduce((total, type) => total + scores[type], 0);

	if (eligibleHits === 0) {
		return {
			taskType: hasImage ? IMAGE_FALLBACK_TASK_TYPE : FALLBACK_TASK_TYPE,
			scores,
			matchedRules,
			matchedRuleCount,
			fallback: true,
			tied: false,
			hasImage,
		};
	}

	const topScore = Math.max(...eligible.map((type) => scores[type]));
	const leaders = TASK_TYPE_PRIORITY.filter((type) => eligible.includes(type) && scores[type] === topScore);
	const taskType = leaders[0];

	return {
		taskType,
		scores,
		matchedRules,
		matchedRuleCount,
		fallback: false,
		tied: leaders.length > 1,
		hasImage,
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
