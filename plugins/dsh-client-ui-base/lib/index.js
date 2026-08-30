/**
 * Blind Flange base plugin, host half.
 *
 * Story 1.1 gave this package a host-side row with an empty apply. Story 1.5
 * hung our own tab title and favicon on it, replacing DeepSeek Harness's,
 * over the `webServer` service's own extension points (`register` for a new
 * route, `tapIndex` for a pure html-to-html transform) rather than by
 * editing the harness's built `dist/index.html` or `dist/favicon.svg`, which
 * NFR5 forbids touching. Story 2.1 adds the egress denial waterfall
 * alongside it, and Story 2.2 has that waterfall append an `egress/denied`
 * marker event the on-screen egress monitor counts. Story 2.3 hangs the canary
 * here: a real tool (`egress/canary.js`) whose body genuinely calls out, named
 * in the same deny-list so the same waterfall refuses it, plus the loopback RPC
 * channel the composer button fires it through.
 *
 * `conversation.hero.brand.mark` — the third piece of AC1 — is a client-side
 * slot and is registered in client.js instead; this file only reaches what a
 * server-rendered index.html can reach.
 *
 * Story 3.1 adds the model plane: `ctx.llm.registerAdapter` bridges our own
 * `ModelProvider` contract (`model-plane/model-provider.js`) onto the
 * harness's model seam, defaulting to `replay`. See `model-plane/llm-adapter.js`
 * for why that bridge is duck-typed rather than importing `@deepseek-ai/dsh-llm`.
 *
 * Story 3.5 adds the router's classifier: an `agent/pre-step` listener runs
 * `router/classify.js` over each fresh request and appends the structured task
 * type to the session log. Story 3.6 extends that same listener to score the
 * licence-checked fleet against the classified task type and append the routing
 * decision (`router/routed`) alongside it.
 *
 * Story 5.3 extends the same `tools/pre-execute` waterfall to the `pwsh` tool
 * (`tool-pwsh`, enabled by `cordis.patch.yml`): unlike the network-capable
 * tools above, `pwsh` must run for ordinary coding tasks, so it is not denied
 * by name — only a call whose command text itself reaches for the network is
 * refused, recorded on the same `egress/denied` event the monitor already
 * counts.
 *
 * Story 5.4 adds the approval-note tool (`deliverables/tool.js`): a real
 * `.docx` written to disk from a completed set of findings, registered
 * unconditionally like the canary and the report-findings tool.
 *
 * Story 3.9 registers our three plugin-owned session event types into the
 * harness's persistence read-path vocabulary at mount
 * (`session-events/known-types.js`), so a stored session containing them
 * still opens instead of failing with `SessionFormatUnsupportedError`.
 *
 * Story 4.5 adds the provenance route (`findings/provenance.js`) beside the
 * favicon route below: the crop viewer in the browser loads the ingestion
 * capture and the real page images from it, and crops in the browser. Like
 * the favicon it is served through `webServer.register`, so a profile with no
 * web server simply does not have it.
 *
 * Story 3.10 fixes the classifier reading the wrong turn's text (or none).
 * `agent/pre-step` hands the listener `messages: claimed` directly in its
 * payload — `Inbox.claim()` in the harness (`packages/core/agent/src/inbox.ts`)
 * defines that as exactly the batch proposed for *this* step, stamped with
 * this turn's number before the event even fires. Story 3.5/3.6 ignored that
 * and read `decision.messages` from the far end of the `next()` waterfall
 * instead — whatever every other `agent/pre-step` listener downstream chose
 * to hand back, which is not the same guarantee. Classification now reads the
 * payload's own `messages`, never `decision.messages`.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	CANARY_CHANNEL,
	CANARY_TOOL_NAME,
	createCanaryRpcHandler,
	createCanaryTool,
	DEFAULT_CANARY_TARGET,
} from "./egress/canary.js";
import { createSealRpcHandler, isSealed, SEAL_CHANNEL } from "./egress/seal.js";
import { createApprovalNoteTool } from "./deliverables/tool.js";
import { createReportFindingsTool } from "./findings/tool.js";
import { createProvenanceHandler, PROVENANCE_ROUTE_PREFIX } from "./findings/provenance.js";
import { createLlmAdapter } from "./model-plane/llm-adapter.js";
import { createModelProvider } from "./model-plane/model-provider.js";
import { loadFleet } from "./registry/loader.js";
import { classifyRequest, lastUserText } from "./router/classify.js";
import { scoreFleet } from "./router/score.js";
import { registerKnownSessionEventTypes } from "./session-events/known-types.js";

const FAVICON_PATH = "/blind-flange/favicon.svg";
const FAVICON_SVG = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "favicon.svg"));

/**
 * Cordis services this plugin needs before `apply` runs: none.
 *
 * `inject` is a hard gate — Cordis holds the fiber until every named service
 * exists, and a service that never appears means `apply` never runs, silently.
 * The `web` profile has `webServer`; the `headless` profile does not. Naming
 * it here would therefore mount the egress denial waterfall in the browser
 * and nowhere else, which is the opposite of a sovereignty guarantee: the
 * profile with no UI would be the one with no enforcement.
 *
 * So the presentation half asks for `webServer` from inside `apply` instead,
 * through a nested `ctx.inject`, and the denial waterfall registers
 * unconditionally.
 */
export const inject = [];

/**
 * Replace the first occurrence of `search` in `html` with `replacement`.
 * `String.prototype.replace` is silently a no-op when `search` isn't found —
 * a harness upgrade that changes `dist/index.html`'s markup would revert the
 * tab title and favicon with nothing to say why, so this warns instead of
 * failing quietly.
 * @param html - the html to search.
 * @param search - exact substring to find.
 * @param replacement - what to put in its place.
 * @param label - what this swap is, for the warning.
 */
function replaceOrWarn(html, search, replacement, label) {
	if (!html.includes(search)) {
		console.warn(
			`@blind-flange/dsh-client-ui-base: expected to find ${JSON.stringify(search)} in the served index.html (${label}) and did not — the harness's shipped markup may have changed. Blind Flange's ${label} will not apply until docs/profile-install.md's Story 1.5 section is re-checked against the new markup.`,
		);
		return html;
	}
	return html.replace(search, replacement);
}

/**
 * Tool names known to reach outside the machine. Deny-by-name is a
 * deliberately simple policy for Phase 0: `tools/pre-execute` must decide
 * before the tool body runs, so the decision has to come from the call's
 * static name rather than from watching it actually try to connect. Any
 * future tool that can reach the network must be added here.
 *
 * The canary (Story 2.3, `egress/canary.js`) is in this set for exactly that
 * reason, and it is the only entry whose body genuinely tries: `web_search`
 * and `web_fetch` are names the harness's own `tool-web` would have used, kept
 * here as defence in depth after Story 1.2 removed the package that provides
 * them.
 *
 * Membership of this set is not by itself a refusal: the waterfall consults the
 * seal (`egress/seal.js`) first, and with the seal open a named tool here runs
 * and is recorded as {@link PERMITTED_EVENT} instead. Opening the seal is what
 * lets a real outbound connection out of this machine — deliberately, from the
 * UI, recorded, and closed again by a restart.
 */
const NETWORK_TOOL_NAMES = new Set(["web_search", "web_fetch", CANARY_TOOL_NAME]);

/**
 * The tool name Story 5.3 enables (`tool-pwsh`; the Windows executor per
 * `docs/deepseek-harness-notes.md` — `dsh-bash-sandbox` never loads on
 * win32). It is deliberately not in {@link NETWORK_TOOL_NAMES}: a coding task
 * needs `pwsh` to run, so the whole tool cannot be denied by name the way
 * `web_search`/`web_fetch` are. Only a call whose `command` argument itself
 * reaches for the network is denied — see {@link NETWORK_PWSH_PATTERN}.
 */
const PWSH_TOOL_NAME = "pwsh";

/**
 * Matches command text that reaches the network from inside a `pwsh` call:
 * the two clients Story 5.3's acceptance criteria name explicitly
 * (`Invoke-WebRequest`/`iwr`, `curl`), their less-common cousins
 * (`Invoke-RestMethod`/`irm`, `wget`, `Start-BitsTransfer`,
 * `Test-NetConnection`), and the raw-socket/HTTP-client .NET types a script
 * could reach for instead of a cmdlet. Case-insensitive, matched against the
 * call's `command` argument text.
 *
 * This is the same deliberately simple deny-by-pattern policy
 * {@link NETWORK_TOOL_NAMES} already accepts for Phase 0 (`tools/pre-execute`
 * must decide before the body runs, from the call's static shape, not by
 * watching it actually try to connect) — applied to command text instead of a
 * tool name because `pwsh` carries both network and non-network commands
 * under one name. A determined script can still evade a text match; that is a
 * known Phase 0 limitation of this policy, not an oversight.
 */
const NETWORK_PWSH_PATTERN =
	/\b(Invoke-WebRequest|iwr|Invoke-RestMethod|irm|curl(\.exe)?|wget|Start-BitsTransfer|Test-NetConnection)\b|Net\.Sockets\.(TcpClient|TcpListener|UdpClient|Socket)|Net\.(WebClient|Http\.HttpClient)|Net\.Dns/i;

/**
 * The session-log event the egress denial waterfall writes when it refuses a
 * call (Story 2.2). Story 2.1 leaned on the harness's own `tool/call` record
 * for the audit trail — but `tool/call` is appended for every call, allowed or
 * denied, so it cannot be counted as a denial. This is the distinct marker the
 * egress monitor folds: the counted zero is `the number of these events`, never
 * a literal (FR15), and the canary's increment (Story 2.3) is one more of them.
 *
 * A plugin-owned event type, like the router's {@link CLASSIFIED_EVENT} and
 * {@link ROUTED_EVENT}. `Session.append` gives no way to mark an event
 * `ignorable`, so a stored log containing this event needs the downstream
 * event-type registration the harness's `known-event-types` note defers
 * "until such a consumer exists" — Story 3.9 (`session-events/known-types.js`)
 * is that registration, added at mount so a reopened session still carries
 * this event.
 */
const EGRESS_DENIED_EVENT = "egress/denied";

/**
 * The session-log event the waterfall writes when the seal is OPEN and it
 * therefore lets a network-reaching call run (`egress/seal.js`).
 *
 * It is the counterweight to {@link EGRESS_DENIED_EVENT}, and it exists so the
 * audit list is not a list of this system's own successes. A seal that could be
 * opened without leaving a record would make every zero on the monitor
 * unfalsifiable — the count would be indistinguishable from a count taken while
 * nothing was being enforced. With this event, an evaluator reading the log can
 * see both what was stopped and what was waved through, in the order it
 * happened.
 */
const PERMITTED_EVENT = "egress/permitted";

/**
 * The session-log event the router's classifier writes (Story 3.5). It is a
 * plugin-owned event type: the harness's live log accepts it, and it carries
 * the classification as structured data a panel renders (the routing chip,
 * Story 3.7) rather than as prose. The harness's persistence *read* path did
 * not know this downstream event type until Story 3.9
 * (`session-events/known-types.js`) registered it at mount — before that fix,
 * reloading a stored log that contained this event failed outright.
 */
const CLASSIFIED_EVENT = "router/classified";

/**
 * The session-log event the router's scorer writes (Story 3.6). Like
 * {@link CLASSIFIED_EVENT} it is a plugin-owned event type carrying structured
 * data — the per-member scores, the members excluded before scoring with the
 * reason for each, and the selected member — that the routing chip (Story 3.7)
 * renders. The same persistence read-path registration Story 3.9 gives
 * {@link CLASSIFIED_EVENT} covers this event too.
 */
const ROUTED_EVENT = "router/routed";

/**
 * Classify the request entering a fresh turn, score the licence-checked fleet
 * against that task type, and record both on the session log. Runs only on the
 * first step of a turn — a tool-loop continuation step is the same request, not
 * a new one — and never throws into the loop: a classification or scoring
 * failure is logged and swallowed so the turn proceeds. Scoring failing does
 * not suppress the classification event that already landed.
 *
 * `messages` must be the `agent/pre-step` event's own payload field — the
 * turn-scoped batch `Inbox.claim()` proposed for this step — never
 * `decision.messages` read back out of the `next()` waterfall (Story 3.10;
 * see the file header).
 *
 * When no request text is found at all — `lastUserText` returns `""` — this
 * is recorded as `noRequestText: true` on the same event, distinct from an
 * ordinary fallback (text present, no rule matched). A silent fallback here
 * looks like a routing decision; this makes the anomaly itself visible in the
 * session record instead.
 * @param {{ session: { append: (type: string, data: unknown) => unknown } }} agent
 * @param {number} turn
 * @param {number} step
 * @param {Array<{ role?: string, content?: unknown }>} messages - this step's own claimed batch, from the `agent/pre-step` payload.
 */
function classifyAndRoute(agent, turn, step, messages) {
	if (step !== 1) return;
	let classification;
	try {
		const text = lastUserText(messages);
		classification = classifyRequest(text);
		agent.session.append(CLASSIFIED_EVENT, { turn, step, ...classification, noRequestText: text === "" });
	} catch (error) {
		console.warn(`@blind-flange/dsh-client-ui-base: request not classified — ${error instanceof Error ? error.message : String(error)}`);
		return;
	}
	try {
		const routing = scoreFleet(classification.taskType, loadFleet().loaded);
		agent.session.append(ROUTED_EVENT, { turn, step, ...routing });
	} catch (error) {
		console.warn(`@blind-flange/dsh-client-ui-base: fleet not scored — ${error instanceof Error ? error.message : String(error)}`);
	}
}

/**
 * Best-effort human-readable target from a tool call's arguments, for the
 * denial reason that lands in the session log alongside the tool name.
 *
 * The harness hands `tools/pre-execute` **parsed, frozen** arguments — the
 * registry materialises them as lossless JSON before policy starts — so the
 * object branch is the one that runs in production. The string branch is kept
 * because a caller further out may still hold the raw model-emitted JSON, and
 * because a name-only denial is worth recording even when the arguments are
 * something this function has never seen.
 *
 * Never throws: anything unrecognised falls back to a printable form, so the
 * log carries something to audit rather than nothing.
 * @param toolArguments - parsed arguments, or the raw JSON string.
 * @returns a string naming what was refused.
 */
function describeTarget(toolArguments) {
	let args = toolArguments;
	if (typeof args === "string") {
		try {
			args = JSON.parse(args);
		} catch {
			return toolArguments;
		}
	}
	if (typeof args?.url === "string") return args.url;
	if (typeof args?.target === "string") return args.target;
	if (Array.isArray(args?.queries)) return args.queries.join(", ");
	try {
		return JSON.stringify(toolArguments) ?? String(toolArguments);
	} catch {
		return String(toolArguments);
	}
}

/**
 * The `command` argument of a `pwsh` tool call, or `undefined` when the
 * arguments do not carry one — mirrors {@link describeTarget}'s tolerance of
 * both the materialised object the harness hands the waterfall in production
 * and a raw JSON string.
 * @param toolArguments - parsed arguments, or the raw JSON string.
 */
function pwshCommandText(toolArguments) {
	let args = toolArguments;
	if (typeof args === "string") {
		try {
			args = JSON.parse(args);
		} catch {
			return undefined;
		}
	}
	return typeof args?.command === "string" ? args.command : undefined;
}

/**
 * Register the egress denial waterfall, and — wherever a web server exists —
 * serve our favicon at its own route and swap the shipped title and favicon
 * link for ours on every rendered index.html.
 *
 * The waterfall refuses any call to a tool named in {@link NETWORK_TOOL_NAMES}
 * before its body runs. The check is synchronous, so the call fails fast
 * rather than hanging (NFR2) — a hang on stage reads as a crash. It is
 * registered first and unconditionally: every profile that boots this package
 * is sealed, whether or not it renders anything.
 *
 * `config.modelPlane.provider` selects the model plane (ADR-0001; FR7):
 * `replay` (default), `local`, or `remote`. This is the one place that value
 * is read — `createModelProvider` is the only caller of the provider
 * constructors, so which one runs is a `cordis.patch.yml` edit, never a code
 * change. Deferred until `llm` exists, the same way presentation below
 * defers until `webServer` exists, so a profile with no model seam still
 * gets the egress denial waterfall.
 *
 * The router's classifier (Story 3.5) and scorer (Story 3.6) are registered
 * here too, on `agent/pre-step` and unconditionally — every profile's session
 * log carries the task type each request classified as and the fleet-scoring
 * decision that followed.
 *
 * `config.canary.target` is the address the canary tool (Story 2.3) attempts,
 * defaulting to {@link DEFAULT_CANARY_TARGET}. The tool and the loopback RPC
 * channel that fires it are registered below, each behind the services it
 * needs, so a profile with no tool registry or no browser transport still
 * boots sealed.
 * @param ctx - host plugin context.
 * @param config - this row's resolved config; `modelPlane.provider` defaults to `"replay"`.
 */
export function apply(ctx, config) {
	// Story 3.9: register our three plugin-owned event types into the harness's
	// persistence read-path vocabulary before anything else — unconditional and
	// first, like the egress waterfall below, so every profile's stored sessions
	// stay reopenable regardless of what else this mount does.
	registerKnownSessionEventTypes();

	// The egress denial waterfall, now consulting the seal.
	//
	// Before the seal, this refused every network-reaching call unconditionally
	// and the only evidence of the refusal was our own panel turning red — a
	// closed loop nobody outside this codebase can check. `isSealed()` opens
	// that loop deliberately: with the seal open the call is permitted to run,
	// so the attempt genuinely leaves this process and whatever stops it next
	// is not us. See `egress/seal.js` for why that is the point rather than a
	// weakening.
	//
	// Permitting is recorded as loudly as refusing. `egress/permitted` lands on
	// the same session log the monitor already reads, so the audit list carries
	// the calls we let through beside the ones we stopped. An audit trail that
	// records only its own successes is not an audit trail, and a seal whose
	// opening left no trace would be worse than no seal.
	ctx.on("tools/pre-execute", (exec, next) => {
		/**
		 * Append one egress marker to the attempting session's log.
		 * Best-effort, exactly as the denial record always was: a verdict with
		 * no reachable session still takes effect — the seal holds, or does not
		 * — it simply is not on the on-screen list.
		 */
		const record = (type, data) => {
			try {
				exec.agent?.session?.append?.(type, data);
			} catch (error) {
				console.warn(
					`@blind-flange/dsh-client-ui-base: egress event not recorded — ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		};

		if (NETWORK_TOOL_NAMES.has(exec.name)) {
			const target = describeTarget(exec.arguments);
			if (!isSealed()) {
				record(PERMITTED_EVENT, { tool: exec.name, target });
				return next();
			}
			// The distinct denial marker the egress monitor counts (Story 2.2).
			record(EGRESS_DENIED_EVENT, { tool: exec.name, target });
			return {
				kind: "deny",
				reason: `Blind Flange denies outbound network access: "${exec.name}" attempted to reach ${target}`,
			};
		}
		if (exec.name === PWSH_TOOL_NAME) {
			const command = pwshCommandText(exec.arguments);
			if (command !== undefined && NETWORK_PWSH_PATTERN.test(command)) {
				if (!isSealed()) {
					record(PERMITTED_EVENT, { tool: exec.name, target: command });
					return next();
				}
				// Same distinct denial marker as above (Story 2.2) — the sandbox's
				// shell is sealed the same way the network canary is (Story 5.3).
				record(EGRESS_DENIED_EVENT, { tool: exec.name, target: command });
				return {
					kind: "deny",
					reason: `Blind Flange denies outbound network access: "${exec.name}" attempted to reach the network via: ${command}`,
				};
			}
		}
		return next();
	});

	// The router's classifier (Story 3.5) and scorer (Story 3.6). Registered
	// unconditionally, like the egress waterfall above — the decision belongs in
	// every profile's session log, not only the one with a UI. It classifies the
	// incoming request into a task type, scores the licence-checked fleet against
	// it, and appends both structured results; it never rejects a step or
	// rewrites its messages.
	//
	// Story 3.10: `messages` is read from this event's own payload — the batch
	// `Inbox.claim()` proposed for this exact step, present the instant the
	// event fires — never from `decision.messages`, which is whatever the rest
	// of the `agent/pre-step` waterfall handed back by the time `next()`
	// resolves. `next()` is still awaited first, only to learn whether the step
	// was accepted (`decision.kind === "enter"`); its `messages` are unused.
	ctx.on("agent/pre-step", async ({ agent, turn, step, messages }, next) => {
		const decision = await next();
		if (decision.kind === "enter") {
			classifyAndRoute(agent, turn, step, messages);
		}
		return decision;
	});

	// The canary (Story 2.3). Two registrations, both deferred until the
	// services they need exist, so a profile without them still gets the seal:
	//
	//   1. the tool itself, on `tools` — a genuine outbound `fetch`, denied by
	//      the waterfall above because its name is in NETWORK_TOOL_NAMES;
	//   2. the loopback RPC channel the composer's canary button posts to, which
	//      resolves that session's agent and dispatches the tool through
	//      `ctx.tools.execute`, i.e. through `tools/pre-execute` like any other
	//      call. Nothing here appends an event or moves a panel: the denial
	//      recorded by the waterfall is the only thing the monitor reads.
	const canaryTarget = config?.canary?.target ?? DEFAULT_CANARY_TARGET;
	ctx.inject(["tools"], (toolCtx) => {
		toolCtx.effect(() => toolCtx.tools.register(createCanaryTool(canaryTarget)), "blind-flange: canary tool");
	});

	// Story 5.1: the report-findings tool. Registered unconditionally, like the
	// canary above, so every preset's agent can read the ingested report's OCR
	// findings without a per-preset cordis.patch.yml row.
	ctx.inject(["tools"], (toolCtx) => {
		toolCtx.effect(() => toolCtx.tools.register(createReportFindingsTool()), "blind-flange: report findings tool");
	});
	// Story 5.4: the approval-note tool. Registered unconditionally, like the
	// two tools above, so every preset's agent can turn a completed set of
	// findings into a real, signed .docx without a per-preset row.
	ctx.inject(["tools"], (toolCtx) => {
		toolCtx.effect(() => toolCtx.tools.register(createApprovalNoteTool()), "blind-flange: approval note tool");
	});
	ctx.inject(["connection", "agents", "tools"], (canaryCtx) => {
		canaryCtx.effect(() => {
			const dispose = canaryCtx.connection.rpc.handle(
				CANARY_CHANNEL,
				createCanaryRpcHandler({
					tools: canaryCtx.tools,
					agents: canaryCtx.agents,
					target: canaryTarget,
					sealed: isSealed,
				}),
				{ authority: "loopback" },
			);
			return () => {
				void dispose();
			};
		}, "blind-flange: canary rpc channel");
	});

	// The seal's own loopback channel. Registered beside the canary's and behind
	// the same services, with the same `loopback` authority: opening the seal
	// changes what this machine may do, so it belongs to the operator sitting at
	// it and never to anything that can merely reach the port.
	//
	// `agents` is needed only to write the change onto the session log — the
	// seal itself is process-wide and takes effect whether or not a session is
	// reachable.
	ctx.inject(["connection", "agents"], (sealCtx) => {
		sealCtx.effect(() => {
			const dispose = sealCtx.connection.rpc.handle(SEAL_CHANNEL, createSealRpcHandler({ agents: sealCtx.agents }), {
				authority: "loopback",
			});
			return () => {
				void dispose();
			};
		}, "blind-flange: seal rpc channel");
	});

	const providerName = config?.modelPlane?.provider ?? "replay";
	ctx.inject(["llm"], (llmCtx) => {
		llmCtx.effect(() => {
			let modelProvider;
			try {
				modelProvider = createModelProvider(providerName);
			} catch (error) {
				console.warn(`@blind-flange/dsh-client-ui-base: model plane not mounted — ${error.message}`);
				return undefined;
			}
			const adapter = createLlmAdapter(modelProvider, { displayName: `Blind Flange (${providerName})` });
			return llmCtx.llm.registerAdapter([providerName], adapter);
		}, "blind-flange: model plane adapter");
	});

	// Presentation. Deferred until `webServer` exists, and simply never runs in
	// a profile that has none — `headless` prints to a terminal and has no
	// index.html to tap.
	ctx.inject(["webServer"], (web) => {
		web.effect(
			() =>
				web.webServer.register({
					kind: "exact",
					path: FAVICON_PATH,
					handler: (req, res) => {
						if (req.method !== "GET" && req.method !== "HEAD") {
							res.writeHead(405);
							res.end();
							return;
						}
						res.writeHead(200, { "content-type": "image/svg+xml" });
						res.end(req.method === "HEAD" ? undefined : FAVICON_SVG);
					},
				}),
			"blind-flange: favicon route",
		);

		// Story 4.5: the provenance route. `kind: "prefix"` so one registration
		// covers `/findings` and `/pages/<n>` — the page count comes from the
		// capture, not from a route table that would have to be edited when the
		// sample report gains a page.
		web.effect(
			() =>
				web.webServer.register({
					kind: "prefix",
					path: PROVENANCE_ROUTE_PREFIX,
					handler: createProvenanceHandler(),
				}),
			"blind-flange: provenance route",
		);

		web.effect(
			() =>
				web.webServer.tapIndex((html) => {
					const withTitle = replaceOrWarn(html, "<title>DeepSeek Harness</title>", "<title>Blind Flange</title>", "tab title");
					return replaceOrWarn(withTitle, 'href="/favicon.svg"', `href="${FAVICON_PATH}"`, "favicon link");
				}),
			"blind-flange: index title and favicon",
		);
	});
}
