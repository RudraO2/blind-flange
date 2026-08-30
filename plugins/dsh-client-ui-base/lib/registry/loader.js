/**
 * The licence loader (Story 3.4).
 *
 * `docs/licence-policy.md` is a hard constraint: only Apache-2.0, MIT,
 * BSD-2-Clause and BSD-3-Clause ship (ADR-0005). The policy's own words —
 * "the loader refuses to load any model whose licence class is outside the
 * allow-list. Not a warning. A refusal." This module is that refusal.
 *
 * `loadFleet()` reads `registry/models.yaml` through the Story 3.3 reader and
 * splits the fleet in two:
 *
 *   - `loaded`   — members whose declared licence is inside the allow-list.
 *                  This is the ONLY list the UI model list and the router are
 *                  built from, so a member the box may not legally run is
 *                  never choosable and never scored.
 *   - `refused`  — members outside the allow-list, each with a stated reason
 *                  that names the offending licence. `announceRefusals()`
 *                  writes those to stderr as errors (not `console.warn`) so
 *                  the refusal is stated at load, the way the policy demands.
 *
 * A refusal is per-member: `Qwen/Qwen2.5-3B-Instruct` (Qwen Research Licence)
 * is refused while `Qwen2.5-7B-Instruct`, `Qwen2.5-Coder-7B-Instruct` and
 * `Qwen2.5-VL-7B-Instruct` (all Apache-2.0) load normally. The gate reads the
 * allow-list, never a blocklist, so any other disallowed licence —
 * CDLA-Permissive-2.0, AGPL-3.0, a community licence with a user cap —
 * behaves identically without a code change.
 */

import { ALLOWED_LICENCES, isLicenceAllowed, readFleet } from "./fleet.js";

/** SPDX ids as they are written, keyed by the lower-case form the gate matches on. */
const CANONICAL_CASE = {
	"apache-2.0": "Apache-2.0",
	"bsd-2-clause": "BSD-2-Clause",
	"bsd-3-clause": "BSD-3-Clause",
	"mit-cmu": "MIT-CMU",
	"python-2.0": "Python-2.0",
	"bsl-1.0": "BSL-1.0",
	"cc0-1.0": "CC0-1.0",
	"0bsd": "0BSD",
	zlib: "Zlib",
};

/**
 * The allow-list as one human-readable string, for the refusal reason.
 *
 * Derived from `ALLOWED_LICENCES` rather than written out again, so a name
 * admitted by a future ADR appears in the refusal message without a second
 * edit. The canonical casing is restored here because the gate matches
 * lower-case and a refusal a human reads should say "Apache-2.0", not
 * "apache-2.0".
 */
export const ALLOWED_LICENCES_DISPLAY = [...ALLOWED_LICENCES]
	.map((id) => CANONICAL_CASE[id] ?? id.toUpperCase())
	.join(", ");

/**
 * @typedef {object} LicenceRefusal
 * @property {string} name    - the refused member's model id.
 * @property {string} licence - the declared licence that caused the refusal, trimmed.
 * @property {string} reason  - a full sentence naming the licence and pointing at the policy.
 */

/**
 * Read the fleet and enforce the licence allow-list.
 *
 * Does not throw on a disallowed licence — that member is refused, the rest
 * load. It still propagates {@link import("./fleet.js").FleetRegistryError}
 * from `readFleet` when the registry file itself is missing or malformed,
 * because then there is no fleet to reason about.
 * @param {string} [registryPath] - override for tests; defaults to the repo's `registry/models.yaml`.
 * @returns {{ loaded: ReturnType<typeof readFleet>, refused: LicenceRefusal[] }}
 */
export function loadFleet(registryPath) {
	const loaded = [];
	/** @type {LicenceRefusal[]} */
	const refused = [];

	for (const member of readFleet(registryPath)) {
		if (isLicenceAllowed(member)) {
			loaded.push(member);
			continue;
		}
		const licence = String(member.licence).trim();
		refused.push({
			name: member.name,
			licence,
			reason:
				`Faraday refuses to load "${member.name}": its licence "${licence}" is outside the ` +
				`permissive allow-list (${ALLOWED_LICENCES_DISPLAY}). See docs/licence-policy.md (ADR-0006).`,
		});
	}

	return { loaded, refused };
}

/** Model ids whose refusal has already been stated this process — see {@link announceRefusals}. */
const announced = new Set();

/**
 * State each refusal on stderr — an error line, not a warning, one per refused
 * member — and return the same array so a caller can log and forward in one
 * step.
 *
 * Deduplicated per process by model id: the adapter reads the registry on
 * every mount and every `listModels`, and restating the identical refusal each
 * time would bury it. The first statement is the one that matters; call
 * {@link announceRefusals.reset} to clear the guard (tests only).
 * @param {LicenceRefusal[]} refused
 * @param {(message: string) => void} [log] - sink, for tests; defaults to `console.error`.
 * @returns {LicenceRefusal[]}
 */
export function announceRefusals(refused, log = console.error) {
	for (const refusal of refused) {
		if (announced.has(refusal.name)) continue;
		announced.add(refusal.name);
		log(`@blind-flange/dsh-client-ui-base: ${refusal.reason}`);
	}
	return refused;
}

/** Clear the per-process "already stated" guard. Tests only. */
announceRefusals.reset = () => announced.clear();
