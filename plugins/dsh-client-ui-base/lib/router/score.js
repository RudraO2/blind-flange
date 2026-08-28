/**
 * The router's scorer (Story 3.6).
 *
 * CONTEXT.md "Router": the component that picks which fleet member answers a
 * request "by inspectable classifier score rather than a hard-coded rule".
 * `classify.js` is the first half — it works out the task type. This module is
 * the second: given that task type and the fleet, it gives *every eligible
 * member a score*, records a machine-readable reason for every member excluded
 * before scoring, and selects the highest scorer.
 *
 * The whole point of the story: "the answer is data I can look at rather than a
 * rule I have to trust." So the output is structured data end to end — task
 * type token, capability tokens, integer weights, an ordered score list. No
 * part of the decision is a sentence this module wrote; a caller (the session
 * log, the routing chip in Story 3.7) renders it.
 *
 * ## How a member is scored
 *
 * Each task type owns a {@link TASK_PROFILES profile}: an optional hard
 * requirement and a table of capability weights. A member's score is the sum
 * of the weights of the capabilities it declares in `registry/models.yaml`.
 * Nothing else contributes — not size, not context length — because those are
 * not decision inputs for Phase 0's `replay` fleet and pretending they were
 * would be exactly the untrustworthy rule this story exists to replace.
 *
 * ## Eligibility vs. scoring
 *
 * A member is *excluded before scoring* only when it cannot do the job at all —
 * currently just the modality gate: a `drawing` task needs a member that
 * accepts image input, and a text-only member is out with the reason
 * `modality-missing`. Everything else is a scoring difference, not an
 * exclusion: a general reasoner asked a coding question still gets a score, it
 * just loses to the coder.
 *
 * The fleet passed in is already the licence-checked list — `loadFleet().loaded`
 * from `../registry/loader.js` (Story 3.4). A member refused for its licence
 * never reaches here, so a licence is never an exclusion reason at this layer.
 *
 * ## Selection and ties
 *
 * The highest-scoring eligible member wins. A tie is broken by fleet
 * declaration order — the earlier entry in `registry/models.yaml` wins — so the
 * same task type always routes to the same member. When every eligible member
 * scores zero (a task type whose weighted capabilities no member happens to
 * declare) the first eligible member is still selected and `allZero` is set, so
 * a caller can show "no strong match" rather than the router silently picking.
 */

import { TASK_TYPES } from "./classify.js";

/**
 * Scoring profile per task type.
 *
 * `requires.modality` is a hard gate checked before scoring. `weights` maps a
 * capability name (as declared in `registry/models.yaml`) to the points it
 * contributes. Capability names not listed here contribute nothing.
 * @type {Record<string, { requires: { modality?: string } | null, weights: Record<string, number> }>}
 */
export const TASK_PROFILES = {
	document: {
		requires: null,
		weights: {
			"document-understanding": 3,
			"visual-grounding": 1,
			"general-reasoning": 1,
			"instruction-following": 1,
		},
	},
	drawing: {
		requires: { modality: "image" },
		weights: {
			"drawing-understanding": 3,
			"visual-grounding": 2,
			"document-understanding": 1,
		},
	},
	calculation: {
		requires: null,
		weights: {
			"general-reasoning": 3,
			"code-reasoning": 1,
			"instruction-following": 1,
			"tool-use": 1,
		},
	},
	code: {
		requires: null,
		weights: {
			"code-generation": 3,
			"code-reasoning": 2,
			"tool-use": 1,
			"general-reasoning": 1,
		},
	},
};

/** Thrown when {@link scoreFleet} is handed a task type it has no profile for. */
export class RouterScoreError extends Error {
	constructor(message) {
		super(message);
		this.name = "RouterScoreError";
	}
}

/**
 * @typedef {object} MemberScore
 * @property {string}   name          - the fleet member's model id.
 * @property {number}   score         - sum of the weights of its matched capabilities.
 * @property {Array<{ capability: string, points: number }>} matched - the capabilities that contributed, in weight-desc then declared order.
 * @property {string[]} modalities    - the member's declared modalities, carried through for the chip.
 * @property {string[]} capabilities  - the member's declared capabilities, carried through for the chip.
 */

/**
 * @typedef {object} MemberExclusion
 * @property {string} name   - the excluded member's model id.
 * @property {{ code: string, detail: string }} reason - machine-readable: `code` is a stable token, `detail` a human string built from tokens.
 */

/**
 * @typedef {object} RoutingDecision
 * @property {string}            taskType  - the task type this decision is for; one of {@link TASK_TYPES}.
 * @property {MemberScore[]}     scored    - every eligible member with a score, highest first (ties keep fleet order).
 * @property {MemberExclusion[]} excluded  - members ruled out before scoring, each with a reason; fleet order.
 * @property {string | null}     selected  - the winning member's id, or null when no member was eligible.
 * @property {boolean}           tied      - true when the top score was shared and fleet order broke it.
 * @property {boolean}           allZero   - true when every eligible member scored zero.
 */

/**
 * Score the fleet against a classified task type and pick a member.
 * @param {string} taskType - one of {@link TASK_TYPES}; anything else throws {@link RouterScoreError}.
 * @param {Array<{ name: string, modalities?: unknown, capabilities?: unknown }>} fleet - the licence-checked fleet (`loadFleet().loaded`).
 * @returns {RoutingDecision}
 */
export function scoreFleet(taskType, fleet) {
	if (!TASK_TYPES.includes(taskType) || !TASK_PROFILES[taskType]) {
		throw new RouterScoreError(`no scoring profile for task type ${JSON.stringify(taskType)}`);
	}
	const profile = TASK_PROFILES[taskType];
	const members = Array.isArray(fleet) ? fleet : [];

	/** @type {MemberScore[]} */
	const scored = [];
	/** @type {MemberExclusion[]} */
	const excluded = [];

	for (const member of members) {
		const modalities = Array.isArray(member?.modalities) ? member.modalities.map(String) : [];
		const capabilities = Array.isArray(member?.capabilities) ? member.capabilities.map(String) : [];

		const requiredModality = profile.requires?.modality;
		if (requiredModality && !modalities.includes(requiredModality)) {
			excluded.push({
				name: member.name,
				reason: {
					code: "modality-missing",
					detail:
						`task type "${taskType}" needs a member that accepts ${requiredModality} input; ` +
						`"${member.name}" declares modalities [${modalities.join(", ")}]`,
				},
			});
			continue;
		}

		const matched = capabilities
			.filter((capability) => profile.weights[capability] !== undefined)
			.map((capability) => ({ capability, points: profile.weights[capability] }))
			.sort((a, b) => b.points - a.points);
		const score = matched.reduce((total, hit) => total + hit.points, 0);

		scored.push({ name: member.name, score, matched, modalities, capabilities });
	}

	// Stable sort by score descending: `scored` is already in fleet order, and a
	// numeric compare that returns 0 for equal scores leaves that order intact,
	// so the fleet's declaration order is the tie-break.
	scored.sort((a, b) => b.score - a.score);

	const topScore = scored.length > 0 ? scored[0].score : null;
	const tied = scored.length > 1 && scored[1].score === topScore;
	const allZero = scored.length > 0 && topScore === 0;
	const selected = scored.length > 0 ? scored[0].name : null;

	return { taskType, scored, excluded, selected, tied, allZero };
}
