/**
 * Dispatch: the missing link between the router deciding and a model answering.
 *
 * Through 29 August 2026 the router was **observational only**. `classifyAndRoute`
 * appended a `router/routed` event carrying a `selected` fleet member, the
 * routing chip rendered it, and nothing whatsoever consumed it — every session
 * was pinned to one provider and one model by `profile/web/cordis.patch.yml`.
 * "The model changes by itself" (Story 3.8) was true of the chip, not of the
 * inference path. This module closes that gap.
 *
 * ## The boundary this module defends
 *
 * The router is being rewritten by someone else, concurrently and without
 * coordination. So the contract is deliberately one-way and narrow:
 *
 *   - **This file, and everything downstream of it, never writes to the router.**
 *     `classify.js` and `score.js` are not modified. Whether a task type came
 *     from thirty regexes or from a model, dispatch does not know and must not
 *     care.
 *   - The only thing dispatch needs from the router is a `RoutingDecision` with
 *     a `selected` fleet-member name. That is already the shape `scoreFleet`
 *     returns and already what lands on the session log.
 *   - The only thing dispatch needs from the registry is `runtime_id`, which
 *     translates a fleet member's published name into the key llama-swap knows
 *     it by. Adding a model stays a `registry/models.yaml` edit.
 *
 * ## Why the decision is memoised rather than read back off the session log
 *
 * The routing decision is produced in the `agent/pre-step` waterfall, which has
 * the agent and its session. The model call happens later, in the harness's LLM
 * adapter, which is handed messages and nothing else — no session, no session
 * id. Rather than plumb a session through the harness's own interface, the
 * decision is recorded here as it is made and read here as the call is issued.
 * Ordering is guaranteed: `classifyAndRoute` runs on step 1 of a turn, before
 * the model is invoked for that step.
 *
 * ponytail: one decision for the whole process, not one per session. A second
 * concurrent session would read the first's model. Phase 0 is explicitly
 * single-user and single-session (`product-brief.md` cut line), and the demo is
 * one conversation on one machine. The upgrade path is a `Map` keyed by session
 * id, the moment the harness gives the adapter a session id to key on.
 */

/** @typedef {import("./score.js").RoutingDecision} RoutingDecision */

/**
 * The most recent routing decision, and the turn it belongs to. Held here
 * rather than in `index.js` so the adapter can read it without importing the
 * plugin's entry point, which would be a cycle.
 * @type {{ decision: RoutingDecision, turn: number } | null}
 */
let latest = null;

/**
 * Record the decision the router just made, so the model call for this turn can
 * honour it. Called from the `agent/pre-step` waterfall immediately after the
 * `router/routed` event is appended.
 * @param {RoutingDecision} decision
 * @param {number} [turn]
 */
export function recordRoutingDecision(decision, turn) {
	latest = { decision, turn };
}

/** The most recent decision, or `null` when no turn has been routed yet. */
export function lastRoutingDecision() {
	return latest?.decision ?? null;
}

/** Forget the recorded decision. For tests, and for a clean state between runs. */
export function clearRoutingDecision() {
	latest = null;
}

/**
 * @typedef {object} Dispatch
 * @property {string | null} runtimeId - the llama-swap model key to call, or null when none could be resolved.
 * @property {string | null} member    - the fleet member the router selected, carried through for the trace.
 * @property {string} reason           - why this resolved as it did. A stable token, safe to assert on and to show.
 */

/**
 * Resolve a selected fleet-member name to the runtime model id that answers for
 * it.
 *
 * Never throws. A dispatch failure must degrade to "let the provider use its
 * default" rather than break a turn — a demo that answers with the wrong model
 * is recoverable, one that throws mid-sentence is not. Every outcome carries a
 * `reason` so the execution trace can say which happened instead of leaving a
 * silent fallback looking like a decision.
 * @param {string | null | undefined} selected - `RoutingDecision.selected`.
 * @param {Array<{ name?: string, runtime_id?: string }>} fleet - the licence-checked fleet (`loadFleet().loaded`).
 * @returns {Dispatch}
 */
export function resolveRuntimeModel(selected, fleet) {
	if (typeof selected !== "string" || selected === "") {
		return { runtimeId: null, member: null, reason: "no-selection" };
	}
	const members = Array.isArray(fleet) ? fleet : [];
	const member = members.find((candidate) => candidate?.name === selected);
	if (!member) {
		// The router named a member the licence gate dropped, or one that is not
		// in the registry at all. Both mean the two files have drifted apart.
		return { runtimeId: null, member: selected, reason: "member-not-in-fleet" };
	}
	if (typeof member.runtime_id !== "string" || member.runtime_id === "") {
		// Legitimate for a member declared only so the loader refuses it — those
		// never run and carry no runtime id. For anything else it is a registry
		// entry that was never wired into llama-swap's config.
		return { runtimeId: null, member: selected, reason: "member-has-no-runtime-id" };
	}
	return { runtimeId: member.runtime_id, member: selected, reason: "routed" };
}

/**
 * The runtime model for the turn currently being answered: the recorded routing
 * decision resolved against the fleet.
 * @param {Array<{ name?: string, runtime_id?: string }>} fleet
 * @returns {Dispatch}
 */
export function runtimeModelForCurrentTurn(fleet) {
	const decision = lastRoutingDecision();
	if (decision === null) {
		// No turn has been routed. Happens for auxiliary model calls the harness
		// makes outside a turn — session-title generation, for one — which should
		// use the default model rather than fail.
		return { runtimeId: null, member: null, reason: "no-routing-decision" };
	}
	return resolveRuntimeModel(decision.selected, fleet);
}
