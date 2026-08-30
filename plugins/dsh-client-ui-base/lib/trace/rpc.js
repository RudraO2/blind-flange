/**
 * The trace channel: what is in VRAM right now, and what this turn did.
 *
 * ## Why this is residency-first rather than a general trace panel
 *
 * The spec asked for an execution-trace surface. Most of what such a panel would
 * show already has a home: the routing chip carries every classifier score and
 * every exclusion reason, and the approval note carries the model, the OCR
 * provenance and the tool sequence in a form that survives the file being
 * emailed. A fourth surface repeating those would be work spent making the same
 * fact visible in a fourth place.
 *
 * One thing is genuinely invisible: **which models are resident in 4 GB of VRAM
 * at this moment, and what was evicted to make room.** That is the single hardest
 * constraint on this build — llama-swap holds one model at a time because 3.7 GB
 * free does not hold two — and it is the difference between a routing chip that
 * changes a label and a machine visibly managing a card too small for its fleet.
 * So that is what this serves, with the turn's trace as the detail underneath it.
 *
 * ## Where the numbers come from
 *
 * Residency is read from llama-swap's own `/running`, not tracked here. We do not
 * own loading or eviction — llama-swap does — and a panel keeping its own idea of
 * what is loaded would be a second source of truth that can disagree with the
 * thing actually holding the memory. The same reasoning that keeps the egress
 * monitor counting events rather than incrementing a counter.
 *
 * Deliberately absent, again: any egress number. FR15 requires the counted zero
 * to be a count of `egress/denied` events, the monitor already does that, and a
 * second path to the one number this product's claim rests on is a second thing
 * to be wrong.
 */

import { DEFAULT_LOCAL_ENDPOINT, LocalModelProvider } from "../model-plane/local-provider.js";
import { loadFleet } from "../registry/loader.js";
import { lastRoutingDecision, runtimeModelForCurrentTurn } from "../router/dispatch.js";
import { lastIngestion, toolsRunThisTurn } from "./turn.js";

/** The channel the session-header chip reads. */
export const TRACE_CHANNEL = "/bf-trace";

/** Its one endpoint. */
export const TRACE_ENDPOINT = "read";

/**
 * Map llama-swap's `/running` entries to what the panel needs.
 *
 * `proxy` is dropped on purpose: llama-swap reports the *configured* value, which
 * is the empty string whenever the config relies on its `${PORT}` default — so
 * rendering it would show a blank field that looks like a missing address rather
 * than an absent setting. `cmd` is dropped too; it carries absolute weights paths
 * that are noise on screen.
 */
function residencyFrom(running) {
	return (Array.isArray(running) ? running : []).map((entry) => ({
		model: String(entry?.model ?? ""),
		// One of stopped / starting / ready / stopping / shutdown. Anything but
		// `ready` means "not serving yet", which is worth showing during a swap
		// rather than hiding until it settles.
		state: String(entry?.state ?? "unknown"),
		name: typeof entry?.name === "string" && entry.name !== "" ? entry.name : undefined,
		ttl: typeof entry?.ttl === "number" ? entry.ttl : undefined,
	}));
}

/**
 * Build the handler for {@link TRACE_CHANNEL}.
 *
 * Never throws and never returns an error for a missing runtime: llama-swap being
 * down is a state to display, not a failure of the panel. A chip that vanishes
 * when the inference runtime stops is less useful than one that says so.
 * @param {object} [options]
 * @param {string} [options.endpoint] - llama-swap's base URL.
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 * @param {string} [options.providerName] - the active model plane, disclosed on the panel.
 * @returns a `ConnectionRpcHandler`.
 */
export function createTraceRpcHandler({ endpoint = DEFAULT_LOCAL_ENDPOINT, fetchImpl, providerName = "unknown" } = {}) {
	const provider = new LocalModelProvider({ endpoint, fetchImpl });

	return async function handleTrace(rpcEndpoint) {
		if (rpcEndpoint !== TRACE_ENDPOINT) {
			return { ok: false, error: { code: "unknown-command", message: `unknown trace endpoint "${rpcEndpoint}"`, details: {} } };
		}

		// `running()` already degrades to [] rather than throwing, because residency
		// is decoration and must never break a turn. Here that means an empty list
		// and `runtimeReachable: false` are different states and both are reported.
		const running = await provider.running();
		let runtimeReachable = true;
		if (running.length === 0) {
			// Distinguish "nothing loaded" from "nothing answering". The panel says
			// very different things about each, and llama-swap returns `[]` when it
			// is up and idle.
			try {
				const response = await (fetchImpl ?? globalThis.fetch)(`${endpoint}/health`, { method: "GET" });
				runtimeReachable = response.ok;
			} catch {
				runtimeReachable = false;
			}
		}

		const routing = lastRoutingDecision();
		let dispatch = null;
		try {
			dispatch = runtimeModelForCurrentTurn(loadFleet().loaded);
		} catch {
			dispatch = null;
		}

		return {
			ok: true,
			value: {
				providerName,
				runtimeReachable,
				residency: residencyFrom(running),
				// A summary, not the whole decision: the routing chip beside this one
				// already carries every score and every exclusion, and duplicating it
				// here would be two places to keep right.
				taskType: routing?.taskType ?? null,
				selected: routing?.selected ?? null,
				runtimeId: dispatch?.runtimeId ?? null,
				dispatchReason: dispatch?.reason ?? null,
				ingestion: lastIngestion(),
				tools: toolsRunThisTurn(),
			},
		};
	};
}
