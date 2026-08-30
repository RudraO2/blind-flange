/**
 * The seal.
 *
 * Faraday is named after the plate bolted over a line to positively
 * isolate it. This module is that plate, in software: one boolean the egress
 * denial waterfall consults before it refuses anything, and the loopback RPC
 * channel the operator opens and closes it through.
 *
 * WHY THIS EXISTS. Before it, the waterfall in `../index.js` refused every
 * network-capable call unconditionally, and the only evidence that the refusal
 * was real was our own panel turning red — a closed loop, and an evaluator has
 * no way to tell a real refusal from a button that colours a box. The seal
 * opens that loop. With it open, the canary's `fetch` genuinely runs and
 * genuinely leaves this process, so the demo can show all three outcomes:
 *
 *   1. seal open, machine connected  -> the call REACHES the internet.
 *      This is the calibration. An instrument that can only ever return one
 *      answer is not an instrument, and this is what proves the canary is
 *      measuring something rather than asserting it.
 *   2. seal open, machine firewalled -> the call leaves this code and dies
 *      outside it. What stopped it is Windows, whose own log is evidence we
 *      did not write.
 *   3. seal closed                   -> we refuse it before the body runs.
 *      Defence in depth: two independent locks, each shown working alone.
 *
 * SAFETY PROPERTIES, both deliberate:
 *
 *   - The seal is CLOSED at boot and its open state is never persisted. A
 *     restart re-seals the workbench. The dangerous state is not sticky, and
 *     no stored file can arrive already open.
 *   - Opening and closing are both recorded on the session log, so the audit
 *     trail carries the operator's own action, not only the machine's. A log
 *     that records nothing but its own successes is not an audit trail.
 *
 * Process-wide rather than per-session: the seal is a property of this
 * installation's outbound access, not of one conversation, and a per-session
 * seal would mean a second session silently ran unsealed.
 */

/** The one endpoint set the seal channel answers. */
export const SEAL_ENDPOINTS = Object.freeze(["get", "open", "close"]);

/**
 * The RPC channel the seal control posts to. A single path segment, which is
 * what the harness's channel pattern allows, and registered `loopback`-only
 * for the same reason the canary is: opening the seal changes what this
 * machine may do, so it belongs to the operator sitting at it, never to
 * anything that can merely reach the port.
 */
export const SEAL_CHANNEL = "/bf-seal";

/** The session-log event recording an operator opening or closing the seal. */
export const SEAL_EVENT = "egress/seal";

/**
 * Closed until someone deliberately opens it. Module-scoped so the waterfall
 * in `../index.js` and the RPC handler below read the same value without
 * either owning the other.
 */
let closed = true;

/** Is the seal closed? The waterfall asks this before it refuses anything. */
export function isSealed() {
	return closed;
}

/**
 * Set the seal directly. The RPC handler is the production caller; tests use
 * it to put the module back to its boot state between cases.
 * @param {boolean} next - true to close the seal, false to open it.
 * @returns {boolean} the state after the change.
 */
export function setSealed(next) {
	closed = next !== false;
	return closed;
}

/**
 * Build the handler for {@link SEAL_CHANNEL}.
 *
 * `get` reports the current state and changes nothing — the client calls it on
 * mount so a reloaded page shows the truth rather than an assumption. `open`
 * and `close` set it and record the change on the session the operator was in.
 *
 * The record is best-effort in the same sense the waterfall's is: a seal change
 * with no reachable session still takes effect, it simply is not on that
 * session's audit list. Failing the change because the log was unreachable
 * would leave the operator's intent and the machine's behaviour disagreeing,
 * which is worse than a gap in one list.
 * @param {{ agents: { get: (id: string) => unknown } }} deps.agents - the harness `ctx.agents` registry.
 * @returns a `ConnectionRpcHandler`.
 */
export function createSealRpcHandler({ agents }) {
	return async function handleSeal(endpoint, payload) {
		if (!SEAL_ENDPOINTS.includes(endpoint)) {
			return {
				ok: false,
				error: { code: "unknown-command", message: `unknown seal endpoint "${endpoint}"`, details: {} },
			};
		}
		if (endpoint === "get") {
			return { ok: true, value: { sealed: isSealed() } };
		}

		const wanted = endpoint === "close";
		const before = isSealed();
		setSealed(wanted);

		// Record it even when nothing changed: an operator pressing "close" on an
		// already-closed seal is a real thing they did, and an audit list that
		// silently drops it is deciding what is worth recording on their behalf.
		const sessionId = payload?.sessionId;
		if (typeof sessionId === "string" && sessionId !== "") {
			try {
				const agent = agents.get(sessionId);
				agent?.session?.append?.(SEAL_EVENT, { sealed: wanted, changed: before !== wanted });
			} catch (error) {
				console.warn(
					`@blind-flange/dsh-client-ui-base: seal change not recorded — ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		return { ok: true, value: { sealed: isSealed() } };
	};
}
