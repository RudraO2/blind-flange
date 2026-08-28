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
 * marker event the on-screen egress monitor counts. The canary tool and the
 * model plane still hang here in later stories.
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
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLlmAdapter } from "./model-plane/llm-adapter.js";
import { createModelProvider } from "./model-plane/model-provider.js";
import { loadFleet } from "./registry/loader.js";
import { classifyRequest, lastUserText } from "./router/classify.js";
import { scoreFleet } from "./router/score.js";

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
 * future tool that can reach the network — including the canary in Story
 * 2.3, which exists specifically to prove this waterfall denies a real
 * attempt — must be added here.
 */
const NETWORK_TOOL_NAMES = new Set(["web_search", "web_fetch"]);

/**
 * The session-log event the egress denial waterfall writes when it refuses a
 * call (Story 2.2). Story 2.1 leaned on the harness's own `tool/call` record
 * for the audit trail — but `tool/call` is appended for every call, allowed or
 * denied, so it cannot be counted as a denial. This is the distinct marker the
 * egress monitor folds: the counted zero is `the number of these events`, never
 * a literal (FR15), and the canary's increment (Story 2.3) is one more of them.
 *
 * A plugin-owned event type, like the router's {@link CLASSIFIED_EVENT} and
 * {@link ROUTED_EVENT}, and it carries the same persistence read-path caveat:
 * `Session.append` gives no way to mark an event `ignorable`, so a stored log
 * containing this event needs the downstream event-type registration the
 * harness's `known-event-types` note defers "until such a consumer exists".
 * That does not bite Phase 0, where the demo runs on `replay` and sessions
 * are created fresh, not resumed from disk.
 */
const EGRESS_DENIED_EVENT = "egress/denied";

/**
 * The session-log event the router's classifier writes (Story 3.5). It is a
 * plugin-owned event type: the harness's live log accepts it, and it carries
 * the classification as structured data a panel renders (the routing chip,
 * Story 3.7) rather than as prose. The harness's persistence *read* path does
 * not yet know downstream event types — reloading a stored log that contains
 * this event needs the registration surface its `known-event-types` note says
 * is "deferred until such a consumer exists" — which does not bite Phase 0,
 * where the demo runs on `replay` and sessions are created fresh, not resumed
 * from disk.
 */
const CLASSIFIED_EVENT = "router/classified";

/**
 * The session-log event the router's scorer writes (Story 3.6). Like
 * {@link CLASSIFIED_EVENT} it is a plugin-owned event type carrying structured
 * data — the per-member scores, the members excluded before scoring with the
 * reason for each, and the selected member — that the routing chip (Story 3.7)
 * renders. The same persistence read-path caveat as the classified event
 * applies and does not bite Phase 0's fresh-session `replay` demo.
 */
const ROUTED_EVENT = "router/routed";

/**
 * Classify the request entering a fresh turn, score the licence-checked fleet
 * against that task type, and record both on the session log. Runs only on the
 * first step of a turn — a tool-loop continuation step is the same request, not
 * a new one — and never throws into the loop: a classification or scoring
 * failure is logged and swallowed so the turn proceeds. Scoring failing does
 * not suppress the classification event that already landed.
 * @param {{ session: { append: (type: string, data: unknown) => unknown } }} agent
 * @param {number} turn
 * @param {number} step
 * @param {Array<{ role?: string, content?: unknown }>} messages - the messages entering this step.
 */
function classifyAndRoute(agent, turn, step, messages) {
	if (step !== 1) return;
	let classification;
	try {
		const text = lastUserText(messages);
		classification = classifyRequest(text);
		agent.session.append(CLASSIFIED_EVENT, { turn, step, ...classification });
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
 * Best-effort human-readable target from a tool call's raw argument JSON, for
 * the denial reason that lands in the session log alongside the tool name.
 * Never throws: malformed or unrecognised arguments fall back to the raw
 * string so the log still carries something to audit.
 */
function describeTarget(rawArguments) {
	try {
		const args = JSON.parse(rawArguments);
		if (typeof args?.url === "string") return args.url;
		if (Array.isArray(args?.queries)) return args.queries.join(", ");
	} catch {
		// fall through to the raw string below
	}
	return rawArguments;
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
 * @param ctx - host plugin context.
 * @param config - this row's resolved config; `modelPlane.provider` defaults to `"replay"`.
 */
export function apply(ctx, config) {
	ctx.on("tools/pre-execute", (exec, next) => {
		if (NETWORK_TOOL_NAMES.has(exec.name)) {
			const target = describeTarget(exec.arguments);
			// The distinct denial marker the egress monitor counts (Story 2.2).
			// Best-effort: a denial with no reachable session still fails the
			// call — the seal holds — it just is not on the on-screen counter.
			try {
				exec.agent?.session?.append?.(EGRESS_DENIED_EVENT, { tool: exec.name, target });
			} catch (error) {
				console.warn(`@blind-flange/dsh-client-ui-base: egress denial not recorded — ${error instanceof Error ? error.message : String(error)}`);
			}
			return {
				kind: "deny",
				reason: `Blind Flange denies outbound network access: "${exec.name}" attempted to reach ${target}`,
			};
		}
		return next();
	});

	// The router's classifier (Story 3.5) and scorer (Story 3.6). Registered
	// unconditionally, like the egress waterfall above — the decision belongs in
	// every profile's session log, not only the one with a UI. It classifies the
	// incoming request into a task type, scores the licence-checked fleet against
	// it, and appends both structured results; it never rejects a step or
	// rewrites its messages.
	ctx.on("agent/pre-step", async ({ agent, turn, step }, next) => {
		const decision = await next();
		if (decision.kind === "enter") {
			classifyAndRoute(agent, turn, step, decision.messages);
		}
		return decision;
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
