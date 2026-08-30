/**
 * What happened during the turn in flight, for the deliverable's audit trail.
 *
 * The routing decision and the dispatch already have a home in
 * `router/dispatch.js`. This is the rest: whether the OCR ran live or came from
 * the committed capture, and which tools ran in what order. Recorded where it
 * happens and read where it is needed, rather than reconstructed afterwards from
 * the session log — reconstruction would mean a second implementation of "what
 * did this turn do", and the version inside an emailed `.docx` is the one nobody
 * can check against the screen.
 *
 * Deliberately not here: the count of denied outbound attempts. The egress
 * monitor derives that by counting `egress/denied` events on the session log,
 * because FR15 requires the counted zero to be a count and not a literal. A
 * counter kept alongside would be a second source of truth for the one number
 * this product's whole claim rests on, and the two could disagree. Until the
 * deliverable can read the same events the monitor reads, it says nothing about
 * egress rather than saying something from a different source.
 *
 * ponytail: one turn for the whole process, the same ceiling and upgrade path as
 * `router/dispatch.js` and `lanes/code.js` — Phase 0 is single-session by the
 * product brief's cut line. Three modules now share that assumption, which is
 * itself the argument for a single per-session context object the moment the
 * harness offers a session id at these seams.
 */

/**
 * How many pictures the operator attached to this turn.
 *
 * This slot held the OCR ingestion result until 31 August 2026, when ADR-0008
 * removed the OCR service. What replaced it answers the question that actually
 * matters to somebody reading the trace: did the vision model get the picture,
 * or is it answering about an image it never saw?
 * @type {number}
 */
let images = 0;

/** @type {Array<{ name: string, outcome?: string, seconds?: number }>} */
let tools = [];

/**
 * Record how many attached images went to the model this turn.
 * @param {number} count
 */
export function recordImages(count) {
	images = Number.isFinite(count) && count > 0 ? count : 0;
}

/** How many attached images went to the model this turn; `0` when none did. */
export function imagesThisTurn() {
	return images;
}

/**
 * Record a tool that ran. Order is arrival order, which is the order it happened.
 * @param {string} name
 * @param {{ outcome?: string, seconds?: number }} [detail]
 */
export function recordTool(name, detail = {}) {
	tools.push({ name, outcome: detail.outcome, seconds: detail.seconds });
}

/** The tools that ran this turn, in order. */
export function toolsRunThisTurn() {
	return [...tools];
}

/** Forget it. For tests, and at the start of a fresh turn. */
export function clearTurn() {
	images = 0;
	tools = [];
}
