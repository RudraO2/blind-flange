/**
 * The fan-out lane: how "use three helper agents" becomes three real subagent
 * sessions instead of one model pretending to be all of them.
 *
 * ## Why this lane has to exist at all
 *
 * The `subagent` tool is mounted, enabled and working — Story 5.2 verified it
 * against the real harness and got a real second session with
 * `origin: "subagent"`. It is nonetheless uncallable on the `local` provider,
 * for a reason recorded in `model-plane/local-provider.js`: that provider does
 * not send tool definitions at all. Native tool calling was measured against
 * `Qwen2.5-Coder-1.5B-Instruct` on 30 August 2026 and failed — the model named
 * the tool in prose and returned empty `tool_calls`, and neither
 * `tool_choice: "required"` nor naming the function explicitly changed that.
 * Constraining the *response* to a JSON schema worked first time.
 *
 * So on `local`, a model asked to delegate does the only thing left open to it:
 * it writes out "Helper Agent 1:" and "Helper Agent 2:" and answers as both.
 * Observed on 31 August 2026, and it is the single most damaging thing a judge
 * could see — it makes a real capability look like a costume.
 *
 * This lane closes that gap the same way the coding lane closed its own: the
 * model fills in a shape, and **our code** makes the tool calls. What the
 * harness then spawns is genuine — real sessions, real lineage, the shipped
 * `ui-subagent` breadcrumb counting them without knowing we exist.
 *
 * ## Why the operator's words select this lane, not the router
 *
 * The router classifies a request into a task *type* — document, drawing,
 * calculation, code — and delegation is orthogonal to all four: a calculation
 * can be delegated or not, and the same is true of every other type. There is
 * no task type this lane could claim without also claiming turns that must not
 * fan out. So the trigger is the operator asking for it, in their own words,
 * read from the message they actually typed.
 *
 * That is a Phase 0 answer and it is deliberately a narrow one. It also matches
 * how delegation is used in practice here: an operator directing the workbench
 * to split work is a workflow, not a guess the machine should make on their
 * behalf. Model-initiated delegation needs a model large enough to be trusted
 * with the decision, and this hardware does not have one.
 *
 * ## Why the helper count is capped
 *
 * llama-swap runs `--parallel 1` (see `D:/ai/llama-swap/config.yaml`): one model
 * resident, one slot. Helpers therefore **queue** rather than run side by side.
 * Four is where a plan stays watchable — beyond that the gauge fills with work
 * that will not start for minutes, which reads as a hang rather than as fan-out.
 * The serialisation is honest and worth saying out loud; a plan of nine that
 * takes ten minutes is not.
 */

import { isGenuineHumanMessage, lastGenuineUserMessage } from "../model-plane/injected.js";

/** The harness's delegation tool, as named by the preset's `toolName` config. */
export const SUBAGENT_TOOL_NAME = "subagent";

/**
 * The most helpers one turn will dispatch.
 *
 * Not a capability limit — the harness would spawn more. It is a limit on what
 * is worth watching on hardware that runs them one at a time.
 */
export const MAX_HELPERS = 4;

/**
 * Does the operator's own message ask for delegation?
 *
 * Deliberately broad on the noun and strict on the verb. "Helper agent",
 * "sub-agent" and "helpers" are all things an operator says; the verb is what
 * separates *asking for* delegation from merely mentioning it, so
 * "what is a helper agent?" does not spawn one.
 */
const DELEGATION_PATTERN =
	/\b(?:use|spawn|delegate|dispatch|split|fan[\s-]?out|hand\s+off|farm\s+out)\b[\s\S]{0,80}?\b(?:helper|helpers|sub[\s-]?agents?|agents?|this\s+up|the\s+work)\b/i;

/**
 * How many helpers the operator asked for, when they said a number.
 *
 * Only the small words and digits an operator actually types. A request with no
 * number is not a failure — the model proposes a count and the schema bounds it.
 */
const COUNT_WORDS = new Map([
	["one", 1], ["two", 2], ["three", 3], ["four", 4],
	["a", 1], ["an", 1], ["1", 1], ["2", 2], ["3", 3], ["4", 4],
]);

/**
 * The count named in the operator's message, or null when they named none.
 * @param {string} text
 */
export function requestedHelperCount(text) {
	const match = /\b(one|two|three|four|an?|[1-4])\s+(?:more\s+)?(?:helper|sub[\s-]?agent|agent)/i.exec(String(text ?? ""));
	if (match === null) return null;
	return COUNT_WORDS.get(match[1].toLowerCase()) ?? null;
}

/**
 * Whether this turn should fan out, read from the message the operator actually
 * typed rather than from the last `role: "user"` message — the harness appends
 * its own after theirs, which is what `injected.js` exists to see through.
 * @param {Array<{ role?: string, source?: { kind?: string }, content?: unknown }>} messages
 */
export function wantsDelegation(messages) {
	const text = userText(messages);
	if (isQuestionAbout(text)) return false;
	return DELEGATION_PATTERN.test(text);
}

/**
 * Is this a question *about* delegation rather than a request *for* it?
 *
 * "Can this workbench spawn sub-agents at all?" carries the same verb and the
 * same noun as "Spawn a sub-agent to check this", and spawning a session in
 * answer to the first would be the over-eagerness this lane exists to replace.
 * The signal that separates them is grammatical rather than lexical: an opening
 * interrogative closed by a question mark is someone asking, not directing.
 *
 * Deliberately narrow. A request that merely *ends* in a question mark — "use
 * two helpers for this, would you?" — is still a request, so both halves are
 * required.
 * @param {string} text
 */
function isQuestionAbout(text) {
	const trimmed = String(text ?? "").trim();
	if (!trimmed.endsWith("?")) return false;
	return /^(?:what|which|who|when|where|why|how|can|could|would|should|does|do|did|is|are|will)\b/i.test(trimmed);
}

/**
 * The operator's own words this turn, flattened to text.
 * @param {Array<{ role?: string, source?: { kind?: string }, content?: unknown }>} messages
 */
export function userText(messages) {
	const message = lastGenuineUserMessage(messages);
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block) => block?.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n");
}

/**
 * What the model must return: a list of helpers, each with the two arguments
 * the `subagent` tool takes. Constrained by the server's sampling, for the
 * reason this file's header gives.
 */
export const FANOUT_PLAN_SCHEMA = {
	type: "object",
	properties: {
		helpers: {
			type: "array",
			minItems: 1,
			maxItems: MAX_HELPERS,
			items: {
				type: "object",
				properties: {
					description: {
						type: "string",
						description: "A short label for this helper's job, under ten words. Shown in the agents list.",
					},
					prompt: {
						type: "string",
						description:
							"The complete, self-contained instruction for this helper. It cannot see this " +
							"conversation, so restate every number and name it needs, and end by telling it " +
							"to begin its answer by naming the subject.",
					},
				},
				required: ["description", "prompt"],
				additionalProperties: false,
			},
		},
	},
	required: ["helpers"],
	additionalProperties: false,
};

/** A name for the schema, so a server-side rejection says which one failed. */
export const FANOUT_PLAN_SCHEMA_NAME = "bf_fanout_plan";

/**
 * Shown the shape rather than told about it — the same lesson the coding lane
 * learned on 30 August 2026, where describing the requirement did not work and
 * demonstrating it did.
 *
 * The self-containment rule is the one that matters. A spawned helper starts a
 * fresh session and cannot see this conversation, so a prompt reading "check the
 * second pump" gives it nothing to check.
 */
export const FANOUT_LANE_SYSTEM_PROMPT = [
	"You return only JSON matching the schema. No prose, no code fences.",
	"You are splitting the operator's request into independent jobs for helper agents.",
	"",
	"- Each helper starts with NO knowledge of this conversation. Restate every number,",
	"  name, tag and unit it needs inside its own `prompt`. Never write 'the second one'",
	"  or 'as above' — the helper cannot see what you are pointing at.",
	"- One job per helper, and the jobs must not depend on each other's answers.",
	"- If the operator said how many helpers to use, return exactly that many.",
	`- Never return more than ${MAX_HELPERS}.`,
	"- NEVER tell a helper to use, spawn or delegate to other helpers. A helper does the",
	"  work itself. Only the operator decides to delegate.",
	"- `description` is a short label for the agents list, under ten words.",
	"- Every `prompt` must end with: 'Begin your answer by naming the subject.' A helper's",
	"  reply is read next to two others, and an answer that says 'the pump' names nothing.",
	"",
	"Example, for 'use two helper agents to check P-101A at 250 m3/h and P-102B at 80 m3/h':",
	'{"helpers": [' +
		'{"description": "Check P-101A duty point", "prompt": "A centrifugal pump P-101A is specified for 250 m3/h. Assess whether that duty point is reasonable and state any concern in two sentences. Begin your answer by naming the subject."}, ' +
		'{"description": "Check P-102B duty point", "prompt": "A centrifugal pump P-102B is specified for 80 m3/h. Assess whether that duty point is reasonable and state any concern in two sentences. Begin your answer by naming the subject."}' +
		"]}",
].join("\n");

/** Thrown when the model's schema-constrained reply cannot be used. */
export class FanoutLaneError extends Error {
	constructor(message) {
		super(message);
		this.name = "FanoutLaneError";
	}
}

/**
 * Parse the model's schema-constrained reply into helpers.
 *
 * Tolerant of a fenced block even though the schema forbids one, for the same
 * reason `parseProgram` is: a model that ignores the instruction is a normal
 * event, and losing the turn over a pair of backticks would be a waste.
 *
 * Trims to {@link MAX_HELPERS} rather than refusing. A plan of six is the model
 * being enthusiastic, not the model being unusable, and four of six real helpers
 * is a better turn than none.
 * @param {string} text
 * @returns {Array<{ description: string, prompt: string }>}
 */
export function parsePlan(text) {
	const trimmed = String(text ?? "").trim();
	const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
	let parsed;
	try {
		parsed = JSON.parse(unfenced);
	} catch (error) {
		throw new FanoutLaneError(`the model's reply was not JSON: ${error instanceof Error ? error.message : String(error)}`);
	}
	if (!Array.isArray(parsed?.helpers)) throw new FanoutLaneError('the model\'s reply is missing a "helpers" array');

	const helpers = [];
	for (const entry of parsed.helpers) {
		const description = typeof entry?.description === "string" ? entry.description.trim() : "";
		const prompt = typeof entry?.prompt === "string" ? entry.prompt.trim() : "";
		// A helper with no instruction would spawn a session that sits there with
		// nothing to do, which looks exactly like the hang this lane exists to
		// avoid. Skipping it is better than dispatching it.
		if (prompt === "") continue;
		// The recursion defence. A helper handed "use two helper agents to..."
		// would fan out one level down, and its children again below that. The
		// operator delegates; helpers do the work they were given.
		if (DELEGATION_PATTERN.test(prompt)) continue;
		helpers.push({ description: description === "" ? "Helper agent" : description, prompt });
		if (helpers.length === MAX_HELPERS) break;
	}
	if (helpers.length === 0) throw new FanoutLaneError("the model returned no helper with an instruction");
	return helpers;
}

/**
 * The `subagent` tool call for one helper, as a JSON argument string.
 *
 * `run_in_background` is deliberately omitted: the preset mounts this tool in
 * `continuable` mode, whose own default backgrounds the child. Setting it here
 * would be a second opinion on a decision the profile already made.
 * @param {{ description: string, prompt: string }} helper
 */
export function subagentArguments(helper) {
	return JSON.stringify({ description: helper.description, prompt: helper.prompt });
}

/**
 * The line stated before the helpers are dispatched.
 *
 * Says the count and says they queue. The queueing is a property of this
 * hardware — one model resident, one slot — and an operator watching four
 * helpers start one at a time should have been told that rather than left to
 * wonder whether it has hung.
 * @param {Array<{ description: string }>} helpers
 */
export function describePlan(helpers) {
	const count = helpers.length;
	const noun = count === 1 ? "helper agent" : "helper agents";
	const lines = [`Delegating to ${count} ${noun}:`, ""];
	for (const helper of helpers) lines.push(`- ${helper.description}`);
	if (count > 1) {
		lines.push("");
		lines.push("This machine holds one model in memory at a time, so they run in turn rather than at once.");
	}
	return lines.join("\n");
}

/**
 * Have the helpers already been dispatched for the operator's current request?
 *
 * **This is the function that stopped a runaway on 31 August 2026.** Its first
 * version copied `sandboxHasReported` and looked only at `messages.at(-1)` —
 * which is correct for the coding lane, because that lane emits exactly one tool
 * call. This lane emits several, and the harness does not necessarily leave a
 * tool-result last: another message can land after it. Every time it did, the
 * check read "not dispatched yet", the lane planned again, and the parent
 * spawned another batch. One parent session ended up with **thirty** children.
 *
 * `code.js` had written the fix down before the bug happened — "a turn that grew
 * to several calls would need the 'count tool results since the last genuine
 * human message' walk that `replay-provider.js` does". So that is the walk: find
 * the operator's own message, then look forward for any tool-result at all. One
 * is enough. This lane dispatches once per request and never twice, whatever
 * order the harness appends its messages in.
 * @param {Array<{ role?: string, source?: { kind?: string }, content?: unknown }>} messages
 */
export function helpersHaveReported(messages) {
	if (!Array.isArray(messages)) return false;
	let triggerIndex = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (isGenuineHumanMessage(messages[i])) {
			triggerIndex = i;
			break;
		}
	}
	// No genuine trigger means no request to serve, and planning against a
	// history whose start we cannot find is how the runaway began.
	if (triggerIndex === -1) return true;
	for (let i = triggerIndex + 1; i < messages.length; i += 1) {
		const message = messages[i];
		if (message?.role !== "user" || message?.source?.kind !== "tool") continue;
		if (Array.isArray(message.content) && message.content.some((block) => block?.type === "tool-result")) return true;
	}
	return false;
}

/**
 * Why there is no "am I a spawned child?" check here.
 *
 * There was one, briefly, on 31 August 2026. It read `source.kind: "user"` —
 * the stamp `dsh-subagent-in-process-driver` puts on a child's first message —
 * and treated its absence as proof of an operator at the keyboard. That was
 * wrong: `injected.js` accepts **both** an absent `source` and
 * `source.kind: "user"` as human, because the harness uses that stamp for more
 * than spawned children. The check therefore suppressed real operator turns and
 * silently disabled this lane. The same prompt that had fanned out went to the
 * coding lane instead, which is how it was caught.
 *
 * The harness does track this properly, as `delegationDepth` on the session
 * header — a child is depth 1. That is the right signal and it is not reachable
 * from here: this adapter is never handed a session id (`code.js` records the
 * same ceiling for its pending prediction). Wiring one through is a real change,
 * not a deadline-day change.
 *
 * So the recursion defence moved to the one place that needs no harness
 * knowledge at all: the prompts are ours, we write them, and
 * {@link parsePlan} refuses to send a helper an instruction that asks it to
 * delegate. A child cannot fan out on wording it was never given.
 */

/**
 * The operator request this lane last dispatched helpers for.
 *
 * **Defence in depth, added the same day the runaway happened.**
 * {@link helpersHaveReported} is the correct check and it is now correct — but
 * it reasons about the shape of a message list the harness owns and we do not,
 * and on 31 August 2026 a surprise in that shape cost one parent session
 * thirty-six children. This guard reasons about something we do own: the words
 * the operator typed. If helpers went out for this exact request already, they
 * do not go out again, whatever the history looks like.
 *
 * The trade-off is stated rather than hidden: an operator who types the *same
 * sentence twice in a row* gets one fan-out, not two. That is a small and
 * recoverable cost — changing a word, or starting a new session, dispatches
 * again — set against an unbounded one.
 *
 * ponytail: process-wide, the same ceiling and the same upgrade path as
 * `code.js`'s pending prediction and `router/dispatch.js`'s decision — Phase 0
 * is single-session by the cut line, and the fix is a map keyed by session id
 * once the adapter is handed one.
 * @type {string | null}
 */
let dispatchedFor = null;

/**
 * How many helpers went out for {@link dispatchedFor}.
 *
 * The parent needs this to know when the last one is in. Without it, every
 * helper that settled produced its own reply — three one-line answers arriving
 * separately, each summarising whichever child had just spoken and naming no
 * subject at all. Observed on 31 August 2026.
 * @type {number}
 */
let dispatchedCount = 0;

/**
 * Have helpers already gone out for this exact request?
 * @param {string} trigger - the operator's own words, from {@link userText}.
 */
export function alreadyDispatched(trigger) {
	const text = String(trigger ?? "").trim();
	return text !== "" && text === dispatchedFor;
}

/**
 * Record that helpers went out for this request.
 * @param {string} trigger - the operator's own words, from {@link userText}.
 */
export function rememberDispatch(trigger, count = 0) {
	dispatchedFor = String(trigger ?? "").trim();
	dispatchedCount = count;
}

/** How many helpers went out for the request in flight. */
export function helpersDispatched() {
	return dispatchedCount;
}

/** Forget it. For tests, and for a deliberate re-run. */
export function clearDispatch() {
	dispatchedFor = null;
	dispatchedCount = 0;
}

/**
 * The `source.kind` the harness stamps on the notice a finished background
 * helper sends its parent. Read from a real session log, 31 August 2026.
 */
const SETTLED_SOURCE_KIND = "subagent-settled";

/**
 * Is this turn a helper reporting back?
 *
 * The harness delivers each finished helper as its own `role: "user"` message,
 * and each one starts a turn. That is why the parent answered three times.
 * @param {Array<{ role?: string, source?: { kind?: string } }>} messages
 */
export function isSettleTurn(messages) {
	return (Array.isArray(messages) ? messages.at(-1) : undefined)?.source?.kind === SETTLED_SOURCE_KIND;
}

/**
 * Every helper report received for the request in flight, oldest first.
 *
 * Counted from the operator's own message forward, so a previous request's
 * helpers cannot be mistaken for this one's.
 * @param {Array<{ role?: string, source?: { kind?: string }, content?: unknown }>} messages
 * @returns {string[]} each helper's closing text
 */
export function settledReports(messages) {
	if (!Array.isArray(messages)) return [];
	let triggerIndex = -1;
	for (let i = messages.length - 1; i >= 0; i -= 1) {
		if (isGenuineHumanMessage(messages[i])) {
			triggerIndex = i;
			break;
		}
	}
	const reports = [];
	for (let i = triggerIndex + 1; i < messages.length; i += 1) {
		const message = messages[i];
		if (message?.source?.kind !== SETTLED_SOURCE_KIND) continue;
		const text = Array.isArray(message.content)
			? message.content
				.filter((block) => block?.type === "text" && typeof block.text === "string")
				.map((block) => block.text)
				.join("\n")
			: "";
		// The first two blocks are the harness's own "finished and will do no
		// further work" notice and the literal words "Its closing message:".
		// What the helper actually said is the last block.
		const closing = text.split("Its closing message:").at(-1).trim();
		reports.push(closing === "" ? text.trim() : closing);
	}
	return reports;
}

/**
 * The line shown while helpers are still out.
 *
 * Written here rather than generated, and this is the point: a progress note is
 * a fact the workbench knows exactly, and asking a 1.5B to phrase it would be
 * spending a model call to make a certainty less reliable. It also keeps the
 * parent quiet — one short line per helper instead of a full, subject-less
 * answer three times over.
 * @param {number} received
 * @param {number} total
 */
export function describeProgress(received, total) {
	return `Helper ${received} of ${total} has reported. Waiting for the rest.`;
}

/**
 * Every helper's report, gathered under one heading, for the turn that closes
 * the fan-out.
 *
 * Deterministic: this is a transcript of what the helpers said, not a
 * paraphrase. The model is asked for a synthesis after it, so a reader can tell
 * what was reported from what was concluded — the same separation the coding
 * lane draws between the sandbox's value and the model's prose.
 * @param {string[]} reports
 */
export function describeReports(reports) {
	const lines = [
		reports.length === 1 ? "The helper has reported." : `All ${reports.length} helpers have reported.`,
		"",
	];
	for (const [ordinal, report] of reports.entries()) {
		lines.push(`**Helper ${ordinal + 1}**`);
		lines.push(report);
		lines.push("");
	}
	return lines.join("\n");
}

/** What the model is asked for once every helper is in. */
export const FANOUT_SUMMARY_SYSTEM_PROMPT = [
	"Several helper agents have reported above. Write one short summary of what they found.",
	"Name each subject explicitly — a summary that says 'the pump' when three were checked is useless.",
	"If a helper's report says DISAGREES, say that its two numbers did not agree and do not pick one.",
	"Do not invent findings no helper reported. Four sentences at most.",
].join("\n");

/**
 * A reply ceiling for the plan.
 *
 * Larger than the coding lane's because a plan carries several self-contained
 * prompts and each one restates its own numbers — the very thing that makes a
 * helper usable is what makes this reply long.
 */
export const FANOUT_LANE_MAX_TOKENS = 900;
