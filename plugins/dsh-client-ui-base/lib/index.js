/**
 * Blind Flange base plugin, host half.
 *
 * Story 1.1 gave this package a host-side row with an empty apply. Story 1.5
 * hung our own tab title and favicon on it, replacing DeepSeek Harness's,
 * over the `webServer` service's own extension points (`register` for a new
 * route, `tapIndex` for a pure html-to-html transform) rather than by
 * editing the harness's built `dist/index.html` or `dist/favicon.svg`, which
 * NFR5 forbids touching. Story 2.1 adds the egress denial waterfall
 * alongside it. The canary tool and the model plane still hang here in
 * later stories.
 *
 * `conversation.hero.brand.mark` — the third piece of AC1 — is a client-side
 * slot and is registered in client.js instead; this file only reaches what a
 * server-rendered index.html can reach.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
	ctx.on("tools/pre-execute", (exec, next) => {
		if (NETWORK_TOOL_NAMES.has(exec.name)) {
			return {
				kind: "deny",
				reason: `Blind Flange denies outbound network access: "${exec.name}" attempted to reach ${describeTarget(exec.arguments)}`,
			};
		}
		return next();
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
