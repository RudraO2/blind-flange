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
 * `NETWORK_TOOL_NAMES`. Delete that one entry and this tool genuinely reaches
 * the network; that is the property the story's "not simulated" criterion is
 * about, and `test/canary.test.js` is where it is checked.
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
				...(exec?.signal ? { signal: exec.signal } : {}),
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
 * first, which is where the egress denial waterfall refuses it and appends the
 * `egress/denied` event the monitor counts. The handler itself neither denies
 * nor records anything; if it did, the canary would be proving its own
 * plumbing rather than the seal.
 *
 * The agent is required rather than optional. A denial with no agent still
 * fails the call, but it lands nowhere the monitor can read, and a canary whose
 * refusal is invisible is exactly the silence this button exists to replace.
 * @param deps.tools - the harness `ctx.tools` runtime.
 * @param deps.agents - the harness `ctx.agents` registry.
 * @param deps.target - the configured canary target.
 * @returns a `ConnectionRpcHandler`.
 */
export function createCanaryRpcHandler({ tools, agents, target }) {
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
		callCounter += 1;
		const result = await tools.execute({
			callId: `bf-canary-${Date.now()}-${callCounter}`,
			name: CANARY_TOOL_NAME,
			arguments: { target },
			agent,
			signal,
		});
		// `isError` is how a `{ kind: 'deny' }` verdict surfaces to the caller.
		// Reported back so the button can say what happened, never so the panel
		// can move: the count the monitor shows comes from the session log.
		return {
			ok: true,
			value: {
				denied: result.isError === true,
				target,
				reason: result.isError === true ? result.error?.message ?? "" : "",
			},
		};
	};
}
