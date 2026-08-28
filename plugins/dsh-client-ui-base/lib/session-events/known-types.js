/**
 * Story 3.9 — register Blind Flange's plugin-owned session event types
 * (`egress/denied`, `router/classified`, `router/routed`) into the harness's
 * own read-path vocabulary, so a stored session containing them still opens.
 *
 * `@deepseek-ai/dsh-session-persistence` refuses to reconstruct a stored log
 * containing an event type outside `@deepseek-ai/dsh-session`'s exported
 * `KNOWN_SESSION_EVENT_TYPES` — a mutable `Set` — unless the event carries
 * `ignorable: true`. Adding our three types to that Set before any session is
 * read is enough: `Session.append` gives no way to mark an event ignorable,
 * so this is the only way a reopened session avoids
 * `SessionFormatUnsupportedError`.
 *
 * Reaching that `Set` is the hard part. `import "@deepseek-ai/dsh-session"`
 * from this plugin fails with `ERR_MODULE_NOT_FOUND`: this package is
 * mounted through a `link:` row in the profile's `package.json` (a
 * filesystem symlink into this repo), and Node resolves a bare specifier
 * from a symlinked module's REAL on-disk path — this repo, not the profile's
 * `node_modules` the harness's own packages live in. `model-plane/llm-adapter.js`
 * hit the identical wall for `@deepseek-ai/dsh-llm` and sidestepped it by
 * needing nothing from that package at all; the read-path vocabulary check
 * lives inside the harness, so this fix has no such option and has to reach
 * it instead. `createRequire`, pointed explicitly at the profile's own
 * install of `@deepseek-ai/dsh-session` (`docs/deepseek-harness-notes.md`
 * — "Put the package at `~/.dsh/profiles/node_modules/<scope>/<name>/`",
 * the same shared location every profile hoists its harness packages into),
 * resolves independently of this module's own symlinked location. Verified
 * 28 Aug 2026 against the installed harness (0.1.1-rc.2, Node 22): a `Set`
 * reached this way and one reached by a native `import` of the same resolved
 * file are the same object — Node's `require(esm)` interop shares the ESM
 * module cache — so mutating it here is visible to
 * `dsh-session-persistence`'s own `import { KNOWN_SESSION_EVENT_TYPES } from
 * "@deepseek-ai/dsh-session"`.
 *
 * This is coupling to a harness internal rather than a published contract
 * (NFR6) — the profile install path is a documented convention, not a
 * contract either side promises to keep — so {@link registerKnownSessionEventTypes}
 * never throws into the caller and never regresses silently: it reports
 * exactly what it could not do, by name, so a harness upgrade that moves or
 * removes this path is a loud console error instead of a session that quietly
 * fails to reopen with no explanation.
 */

import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

/** Blind Flange's own session event types, kept in one place. */
export const OUR_SESSION_EVENT_TYPES = ["egress/denied", "router/classified", "router/routed"];

/**
 * Default resolver: `createRequire` anchored at the profile's own installed
 * copy of `@deepseek-ai/dsh-session`, per `docs/deepseek-harness-notes.md`.
 * @returns the package's exports.
 */
function resolveInstalledDshSession() {
	const packageJsonPath = join(homedir(), ".dsh", "profiles", "node_modules", "@deepseek-ai", "dsh-session", "package.json");
	const requireFromProfile = createRequire(packageJsonPath);
	return requireFromProfile("@deepseek-ai/dsh-session");
}

/**
 * Add {@link OUR_SESSION_EVENT_TYPES} to the harness's
 * `KNOWN_SESSION_EVENT_TYPES` Set so its persistence read path stops
 * refusing a stored session that contains them. Never throws: a failure to
 * reach the Set is reported to `log` (defaults to `console.error`, naming
 * this package) and left there — the caller's other seven seats must not go
 * down with it.
 * @param {{ resolve?: () => unknown, log?: (message: string) => void }} [deps] - injectable for tests; production callers take the defaults.
 */
export function registerKnownSessionEventTypes(deps = {}) {
	const resolve = deps.resolve ?? resolveInstalledDshSession;
	const log = deps.log ?? ((message) => console.error(message));
	let dshSession;
	try {
		dshSession = resolve();
	} catch (error) {
		log(
			`@blind-flange/dsh-client-ui-base: could not reach @deepseek-ai/dsh-session to register our session event types (${error instanceof Error ? error.message : String(error)}) — a reopened session containing egress/denied, router/classified or router/routed will fail with SessionFormatUnsupportedError until this is fixed.`,
		);
		return;
	}
	const types = dshSession?.KNOWN_SESSION_EVENT_TYPES;
	if (!(types instanceof Set)) {
		log(
			"@blind-flange/dsh-client-ui-base: @deepseek-ai/dsh-session no longer exports a mutable KNOWN_SESSION_EVENT_TYPES Set — a reopened session containing egress/denied, router/classified or router/routed will fail with SessionFormatUnsupportedError until this is fixed.",
		);
		return;
	}
	for (const type of OUR_SESSION_EVENT_TYPES) types.add(type);
}
