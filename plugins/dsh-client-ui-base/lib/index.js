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

/** Cordis services this plugin needs from the host. */
export const inject = ["webServer"];

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
 * Serve our favicon at its own route, swap the shipped title and favicon
 * link for ours on every rendered index.html, and register the egress
 * denial waterfall: any call to a tool named in {@link NETWORK_TOOL_NAMES}
 * is refused before its body runs. That check is synchronous, so the call
 * fails fast rather than hanging (NFR2) — a hang on stage reads as a crash.
 * @param ctx - host plugin context carrying the `webServer` service.
 */
export function apply(ctx) {
	ctx.effect(
		() =>
			ctx.webServer.register({
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

	ctx.effect(
		() =>
			ctx.webServer.tapIndex((html) => {
				const withTitle = replaceOrWarn(html, "<title>DeepSeek Harness</title>", "<title>Blind Flange</title>", "tab title");
				return replaceOrWarn(withTitle, 'href="/favicon.svg"', `href="${FAVICON_PATH}"`, "favicon link");
			}),
		"blind-flange: index title and favicon",
	);

	ctx.on("tools/pre-execute", (exec, next) => {
		if (NETWORK_TOOL_NAMES.has(exec.name)) {
			return {
				kind: "deny",
				reason: `Blind Flange denies outbound network access: "${exec.name}" attempted to reach ${describeTarget(exec.arguments)}`,
			};
		}
		return next();
	});
}
