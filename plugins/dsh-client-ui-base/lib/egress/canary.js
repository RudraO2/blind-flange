/**
 * The canary (Story 2.3).
 *
 * CONTEXT.md: "the button that fires a deliberate outbound network call so the
 * user can watch egress denial block it, the monitor turn red, and the audit
 * log record it. Silence proves nothing; the canary is what turns an absence
 * into evidence."
 *
 * This module is the half that makes the attempt *real*. `execute` below calls
 * `fetch` against a public address with nothing standing between it and the
 * socket — no branch that pretends, no event appended by hand. What stops it is
 * the egress denial waterfall in `../index.js`, which refuses the call before
 * any tool body runs, because `bf_canary` is in that file's
 * `NETWORK_TOOL_NAMES` — but only while the seal is closed.
 *
 * That last clause is what makes this button evidence rather than decoration.
 * Open the seal (`./seal.js`) and the waterfall stands aside, this body runs,
 * and the attempt genuinely leaves the process — no code edit, no restart. So
 * the same button can be shown succeeding on a connected machine, which proves
 * it is measuring something, and then failing on a sealed one, which proves the
 * seal. An instrument that can only ever return one answer is not an
 * instrument. `test/canary.test.js` checks both answers.
 *
 * Registered as an ordinary tool rather than as a private code path so that the
 * canary is denied by *the same* waterfall that denies any other attempt (AC1),
 * with the same recorded shape (AC2), instead of by a second mechanism written
 * to look like the first. A second mechanism would prove only that the second
 * mechanism works.
 *
 * Written against the harness's `ToolDefinition` shape structurally rather than
 * through `defineTool` from `@deepseek-ai/dsh-tools`, for the same reason
 * `../model-plane/llm-adapter.js` is duck-typed: the harness supplies its own
 * packages at runtime and this package resolves nothing from them.
 * `ToolRuntime.register` accepts a plain definition — `defineTool` is an
 * argument-typing helper, not a registration requirement.
 */

/**
 * The tool name. Also the entry in `../index.js`'s `NETWORK_TOOL_NAMES` — the
 * two must stay in step, and `test/canary.test.js` asserts that they do.
 */
export const CANARY_TOOL_NAME = "bf_canary";

/**
 * Where the canary tries to reach. `example.com` is IANA's reserved
 * documentation domain, so a machine that *is* connected contacts a name that
 * exists and belongs to nobody, rather than a real service that would be
 * surprised to hear from a demo. Overridable per deployment through
 * `config.canary.target`.
 */
export const DEFAULT_CANARY_TARGET = "https://example.com/blind-flange-canary";

/**
 * How long the attempt is given before it is abandoned.
 *
 * A host firewall does not refuse a connection, it discards it silently and
 * sends nothing back — that is deliberate on its part, so a scan learns
 * nothing, not even that a firewall is there. The consequence here is that an
 * unbounded `fetch` sits waiting for minutes with the seal open on a blocked
 * machine, and a control that spins for minutes on stage reads as a crash
 * rather than as evidence (NFR2 asks this waterfall to fail fast for exactly
 * that reason).
 *
 * Three seconds is long enough that the silence is legible as "we waited and
 * nothing came back", and short enough that nobody in the room starts to
 * wonder whether it has hung. The silence is the evidence; this bounds it.
 */
export const CANARY_TIMEOUT_MS = 3000;

/**
 * The signal the attempt runs under: the caller's own cancellation, if it has
 * one, or {@link CANARY_TIMEOUT_MS} elapsing — whichever comes first.
 * @param {AbortSignal} [callerSignal] - the caller-owned cancellation.
 * @returns {AbortSignal}
 */
function canaryDeadline(callerSignal) {
	const deadline = AbortSignal.timeout(CANARY_TIMEOUT_MS);
	return callerSignal ? AbortSignal.any([callerSignal, deadline]) : deadline;
}

/**
 * The session-log event recording what became of an attempt the seal let
 * through. The waterfall's own `egress/denied` cannot cover this: by the time
 * the outcome is known the waterfall has long since stepped aside, and the
 * fact worth recording — whether the call actually reached the internet — is
 * only knowable after the body has run.
 *
 * It is written whether the answer is good news or bad. A call that got out is
 * the loudest fact this system can produce about itself, and an audit log that
 * recorded only refusals would be a log of its own successes.
 */
export const ESCAPED_EVENT = "egress/escaped";

/**
 * Build the canary tool definition.
 * @param {string} target - the URL the attempt is made against.
 * @param {(input: string, init?: object) => Promise<{ status: number }>} [fetchImpl] -
 *   the outbound call. Defaults to the platform `fetch`; a test substitutes its
 *   own to observe that a real request would leave, without making one.
 * @returns a harness `ToolDefinition`.
 */
export function createCanaryTool(target, fetchImpl) {
	return {
		name: CANARY_TOOL_NAME,
		description:
			"Deliberately attempt an outbound network connection so the egress denial can be watched refusing it. " +
			"Blind Flange denies this call; it exists as the calibration for the egress monitor, not as a way to reach the network.",
		parameters: {
			type: "object",
			properties: {
				target: {
					type: "string",
					description: "URL to attempt. Defaults to the deployment's configured canary target.",
				},
			},
			additionalProperties: false,
		},
		output: {
			schema: {
				type: "object",
				properties: {
					target: { type: "string" },
					status: { type: "number" },
				},
				required: ["target", "status"],
				additionalProperties: false,
			},
			/**
			 * Model-facing content. Only ever produced on a machine where the
			 * seal is not in place — a denied call never reaches a renderer.
			 */
			render: (_args, value) => [
				{
					type: "text",
					text: `Outbound connection to ${value.target} completed with status ${value.status}. Egress denial did not refuse this call.`,
				},
			],
		},
		/**
		 * Make the attempt. Reached only when the egress denial waterfall is
		 * absent or has been removed; with the seal in place `tools/pre-execute`
		 * returns `{ kind: 'deny' }` first and this body never runs.
		 * @param args - validated by the caller against `parameters` above.
		 * @param exec - carries the caller-owned cancellation signal.
		 */
		async execute(args, exec) {
			const url = typeof args?.target === "string" && args.target !== "" ? args.target : target;
			const doFetch = fetchImpl ?? globalThis.fetch;
			if (typeof doFetch !== "function") {
				throw new Error("no fetch implementation available for the canary");
			}
			const response = await doFetch(url, {
				method: "GET",
				redirect: "manual",
				signal: canaryDeadline(exec?.signal),
			});
			return { target: url, status: response.status };
		},
	};
}

/** The one endpoint the canary channel answers. */
export const CANARY_ENDPOINT = "fire";

/**
 * The RPC channel the canary button posts to. A single path segment, which is
 * what the harness's channel pattern allows, and registered `loopback`-only:
 * firing the canary writes to the session log, so it belongs to the operator at
 * the machine, not to anything that can merely reach the port.
 */
export const CANARY_CHANNEL = "/bf-canary";

/** Monotonic suffix so two presses never share a call id. */
let callCounter = 0;

/**
 * Build the handler for {@link CANARY_CHANNEL}.
 *
 * It resolves the live agent for the session the button was pressed in and
 * dispatches {@link CANARY_TOOL_NAME} through `ctx.tools.execute` — the ordinary
 * entry point, so the call runs the ordinary pipeline: `tools/pre-execute`
 * first, which is where the egress denial waterfall refuses it (and appends the
 * `egress/denied` event the monitor counts) whenever the seal is closed. The
 * handler itself neither denies nor records a denial; if it did, the canary
 * would be proving its own plumbing rather than the seal.
 *
 * WHAT IT REPORTS, and why it is no longer one boolean. Before the seal existed
 * this handler reported `denied: result.isError === true` — "if anything went
 * wrong, call it denied". With the seal openable that is neither true nor safe:
 * a call the seal let through, which then died at the host firewall, also
 * arrives here as an error, and reporting it as a denial would have the button
 * claim our refusal stopped it and that the audit log recorded it — while the
 * counter beside it, fed only by the waterfall that never ran, stayed still.
 * The button and the counter would contradict each other on screen, and the
 * sentence the button showed would be false.
 *
 * So the outcome is decided by the seal's state at the moment of the attempt,
 * which is authoritative, rather than by reading an error message:
 *
 *   - `refused`         — the seal was closed; our waterfall stopped it before
 *                          the body ran, and appended `egress/denied`.
 *   - `stopped-outside` — the seal was open, the body ran, the call genuinely
 *                          left this process, and something beyond this
 *                          application refused it. Nothing of ours stopped it.
 *   - `reached`         — the seal was open and the call arrived. The seal was
 *                          the only thing holding, and it was open.
 *
 * The last two are recorded as {@link ESCAPED_EVENT} on the session log, so the
 * audit list carries what became of an attempt we let through.
 * @param deps.tools - the harness `ctx.tools` runtime.
 * @param deps.agents - the harness `ctx.agents` registry.
 * @param deps.target - the configured canary target.
 * @param deps.sealed - reads the seal's current state; `isSealed` from `./seal.js` in production. Absent means sealed, so a caller that forgets it gets the safe reading.
 * @returns a `ConnectionRpcHandler`.
 */
export function createCanaryRpcHandler({ tools, agents, target, sealed }) {
	return async function handleCanary(endpoint, payload, signal) {
		if (endpoint !== CANARY_ENDPOINT) {
			return {
				ok: false,
				error: { code: "unknown-command", message: `unknown canary endpoint "${endpoint}"`, details: {} },
			};
		}
		const sessionId = payload?.sessionId;
		if (typeof sessionId !== "string" || sessionId === "") {
			return {
				ok: false,
				error: { code: "internal", message: "the canary needs the session it was fired in", details: {} },
			};
		}
		const agent = agents.get(sessionId);
		if (agent === undefined || agent === null) {
			return {
				ok: false,
				error: { code: "internal", message: `no live agent for session ${sessionId}`, details: {} },
			};
		}

		// Read once, before the dispatch, so the outcome is judged against the
		// state the attempt actually ran under even if the operator closes the
		// seal while the three seconds are still ticking.
		const wasSealed = sealed === undefined ? true : sealed() !== false;

		callCounter += 1;
		const result = await tools.execute({
			callId: `bf-canary-${Date.now()}-${callCounter}`,
			name: CANARY_TOOL_NAME,
			arguments: { target },
			agent,
			signal,
		});

		if (wasSealed) {
			// `isError` is how a `{ kind: 'deny' }` verdict surfaces to the caller.
			// Reported back so the button can say what happened, never so the panel
			// can move: the count the monitor shows comes from the session log.
			return {
				ok: true,
				value: {
					outcome: "refused",
					sealed: true,
					target,
					detail: result.isError === true ? result.error?.message ?? "" : "",
				},
			};
		}

		const reached = result.isError !== true;
		const detail = reached ? "the request completed" : result.error?.message ?? "no response";

		try {
			agent.session?.append?.(ESCAPED_EVENT, { tool: CANARY_TOOL_NAME, target, reached, detail });
		} catch (error) {
			console.warn(
				`@blind-flange/dsh-client-ui-base: canary outcome not recorded — ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		return {
			ok: true,
			value: { outcome: reached ? "reached" : "stopped-outside", sealed: false, target, detail },
		};
	};
}
