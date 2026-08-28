/**
 * The fleet reader (Story 3.3).
 *
 * `registry/models.yaml` at the repo root is the one file that declares the
 * fleet (CONTEXT.md "Fleet"). This module is the single seam three consumers
 * read it through, so adding a model stays a one-file edit:
 *
 *   - the UI model list — `listModels()` in `../model-plane/llm-adapter.js`
 *     returns `readFleet()` mapped to the harness's model shape, so a new
 *     registry entry appears under the active provider after a restart;
 *   - the licence loader (Story 3.4) — reads `member.licence` and refuses
 *     anything outside the allow-list;
 *   - the router (Stories 3.5-3.6) — scores `member.capabilities` and
 *     `member.modalities` against the classified task type.
 *
 * ## Why a hand-written parser and not `js-yaml`
 *
 * This plugin ships no bundler and no `node_modules` of its own, and it is
 * mounted through a symlink — Node resolves bare specifiers from the
 * symlink's real on-disk path (this repo), not the profile's `node_modules`
 * where the harness's packages live, so `import "js-yaml"` from here fails
 * with `ERR_MODULE_NOT_FOUND` exactly as `import "@deepseek-ai/dsh-llm"`
 * does (see `../model-plane/llm-adapter.js` for the verified write-up).
 *
 * `models.yaml` is ours and fixed-shape, so a parser for just the subset it
 * uses — one `fleet:` sequence of maps with scalar and inline-array values —
 * is ~40 lines and adds zero dependencies. The file is still valid YAML, so
 * swapping in `js-yaml` later (once this package has a real `node_modules`)
 * is a drop-in change here and nowhere else.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REGISTRY_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "registry", "models.yaml");

/** Thrown when the registry file is missing, unparseable, or internally inconsistent. */
export class FleetRegistryError extends Error {
	constructor(message) {
		super(message);
		this.name = "FleetRegistryError";
	}
}

/** Every field a fleet member must carry (Story 3.3, first acceptance block). */
const REQUIRED_FIELDS = ["name", "licence", "size", "context", "modalities", "capabilities"];

/**
 * Parse one scalar value token from `models.yaml`. Handles the three shapes
 * the file uses: a quoted string, an inline flow sequence `[a, b, c]`, and a
 * bare scalar (kept as a string unless it is a plain integer, which `context`
 * needs as a number).
 * @param {string} raw - the text after the `key:` on a line, already trimmed.
 * @returns {string | number | string[]}
 */
function parseValue(raw) {
	if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
		return raw.slice(1, -1);
	}
	if (raw.startsWith("[") && raw.endsWith("]")) {
		const inner = raw.slice(1, -1).trim();
		if (inner === "") return [];
		return inner.split(",").map((item) => item.trim());
	}
	if (/^-?\d+$/.test(raw)) {
		return Number(raw);
	}
	return raw;
}

/**
 * Strip a trailing ` # comment` from a value line without eating a `#` that
 * sits inside a quoted string. Deliberately simple: `models.yaml` never puts
 * a `#` inside a quoted value, so a bare "first unquoted hash wins" rule is
 * enough and stays readable.
 */
function stripInlineComment(line) {
	let inQuote = false;
	for (let i = 0; i < line.length; i += 1) {
		const char = line[i];
		if (char === '"') inQuote = !inQuote;
		if (char === "#" && !inQuote && (i === 0 || line[i - 1] === " ")) {
			return line.slice(0, i);
		}
	}
	return line;
}

/**
 * Parse the `fleet:` sequence from `models.yaml` text.
 *
 * The grammar accepted is exactly what the file uses and no more:
 *   - full-line `#` comments and blank lines are skipped;
 *   - a top-level `fleet:` key introduces the sequence;
 *   - `  - key: value` opens a new member and sets its first field;
 *   - `    key: value` adds a field to the member currently open.
 * Anything outside that shape raises {@link FleetRegistryError} rather than
 * being silently dropped — a malformed registry must fail loud.
 * @param {string} text
 * @returns {Array<Record<string, unknown>>}
 */
export function parseFleet(text) {
	const members = [];
	let current = null;
	let seenFleetKey = false;

	const lines = text.split(/\r?\n/);
	for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
		const rawLine = stripInlineComment(lines[lineNumber]).replace(/\s+$/, "");
		if (rawLine.trim() === "") continue;

		if (rawLine === "fleet:") {
			seenFleetKey = true;
			continue;
		}
		if (!seenFleetKey) {
			throw new FleetRegistryError(`registry/models.yaml line ${lineNumber + 1}: content before the "fleet:" key`);
		}

		const itemMatch = rawLine.match(/^ {2}- (\w[\w-]*): (.+)$/);
		if (itemMatch) {
			current = {};
			members.push(current);
			current[itemMatch[1]] = parseValue(itemMatch[2].trim());
			continue;
		}

		const fieldMatch = rawLine.match(/^ {4}(\w[\w-]*): (.+)$/);
		if (fieldMatch) {
			if (current === null) {
				throw new FleetRegistryError(`registry/models.yaml line ${lineNumber + 1}: field outside any "- " member`);
			}
			current[fieldMatch[1]] = parseValue(fieldMatch[2].trim());
			continue;
		}

		throw new FleetRegistryError(`registry/models.yaml line ${lineNumber + 1}: unrecognised line ${JSON.stringify(rawLine)}`);
	}

	if (!seenFleetKey) {
		throw new FleetRegistryError('registry/models.yaml: no "fleet:" key found');
	}
	return members;
}

/**
 * Validate one parsed member: every required field present, `modalities` and
 * `capabilities` non-empty lists, `context` a positive number.
 * @param {Record<string, unknown>} member
 * @param {number} index - position in the sequence, for the error message.
 */
function validateMember(member, index) {
	const label = typeof member.name === "string" ? member.name : `#${index + 1}`;
	for (const field of REQUIRED_FIELDS) {
		if (member[field] === undefined) {
			throw new FleetRegistryError(`registry/models.yaml: fleet member ${label} is missing "${field}"`);
		}
	}
	for (const field of ["modalities", "capabilities"]) {
		if (!Array.isArray(member[field]) || member[field].length === 0) {
			throw new FleetRegistryError(`registry/models.yaml: fleet member ${label} needs a non-empty "${field}" list`);
		}
	}
	if (typeof member.context !== "number" || member.context <= 0) {
		throw new FleetRegistryError(`registry/models.yaml: fleet member ${label} needs a positive numeric "context"`);
	}
}

/**
 * Read and validate the fleet from `registry/models.yaml`.
 * @param {string} [registryPath] - override for tests; defaults to the repo's `registry/models.yaml`.
 * @returns {Array<{ name: string, role: string, licence: string, size: string, context: number, modalities: string[], capabilities: string[], [extra: string]: unknown }>}
 */
export function readFleet(registryPath = REGISTRY_PATH) {
	let text;
	try {
		text = readFileSync(registryPath, "utf8");
	} catch (error) {
		throw new FleetRegistryError(`registry/models.yaml could not be read at ${registryPath}: ${error.message}`);
	}
	const members = parseFleet(text);
	if (members.length === 0) {
		throw new FleetRegistryError("registry/models.yaml declares an empty fleet");
	}
	members.forEach(validateMember);

	const names = members.map((member) => member.name);
	const duplicate = names.find((name, i) => names.indexOf(name) !== i);
	if (duplicate) {
		throw new FleetRegistryError(`registry/models.yaml declares "${duplicate}" more than once`);
	}
	return members;
}

/**
 * The licence allow-list from `docs/licence-policy.md`. Matching is
 * case-insensitive on the trimmed `licence` string. Widening this list is an
 * ADR-level decision, never an edit made here.
 *
 * The rule these eleven names satisfy (ADR-0006): OSI-approved, no copyleft, no
 * user cap, no field-of-use restriction, no disclosure obligation. The set stays
 * enumerated rather than becoming a judgement call at the point of use, because
 * an enumerated set is what this loader can refuse on and what
 * `scripts/licence-audit.mjs` can fail on. The rule explains the set; it does
 * not replace it.
 *
 * ADR-0005 admitted BSD-2 and BSD-3 to the original Apache-2.0/MIT pair.
 * ADR-0006 added the remaining seven after Story 6.4's audit enumerated 490
 * components and found 27 outside the four. Copyleft is never admitted here —
 * `docs/licence-decisions.json` decides those one at a time.
 *
 * Exported because the audit gates the whole dependency tree on the same names
 * the model loader gates the fleet on. Two copies of an allow-list is how a
 * policy ends up enforced in one place and asserted in the other.
 */
export const ALLOWED_LICENCES = new Set([
	"apache-2.0",
	"mit",
	"bsd-2-clause",
	"bsd-3-clause",
	"isc",
	"0bsd",
	"python-2.0",
	"mit-cmu",
	"bsl-1.0",
	"zlib",
	"cc0-1.0",
]);

/**
 * Whether a fleet member's declared licence is inside the allow-list.
 * @param {{ licence: string }} member
 */
export function isLicenceAllowed(member) {
	return ALLOWED_LICENCES.has(String(member.licence).trim().toLowerCase());
}

/**
 * The fleet with disallowed-licence members removed.
 *
 * Story 3.4's `loadFleet()` in `./loader.js` is the licence gate now — it
 * states each refusal and names the offending licence rather than dropping it
 * silently, and it is what the UI model list and the router read. This helper
 * stays as the plain predicate-filter view (same list as `loadFleet().loaded`)
 * for call sites and tests that only need "which members are allowed".
 * @param {string} [registryPath] - override for tests.
 */
export function allowedFleet(registryPath = REGISTRY_PATH) {
	return readFleet(registryPath).filter(isLicenceAllowed);
}
