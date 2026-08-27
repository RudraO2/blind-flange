/**
 * Blind Flange base plugin, host half.
 *
 * Story 1.1 gave this package a host-side row with an empty apply. Story 1.5
 * is the first thing hung on it: our own tab title and favicon, replacing
 * DeepSeek Harness's, over the `webServer` service's own extension points
 * (`register` for a new route, `tapIndex` for a pure html-to-html transform)
 * rather than by editing the harness's built `dist/index.html` or
 * `dist/favicon.svg`, which NFR5 forbids touching.
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
 * Serve our favicon at its own route and swap the shipped title and favicon
 * link for ours on every rendered index.html.
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
}
