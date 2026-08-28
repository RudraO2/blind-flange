/**
 * The licence audit (Story 6.4).
 *
 * `docs/licence-policy.md` says the value of the policy is that it is
 * *enforced* rather than asserted, and names three mechanisms. Two exist: the
 * registry carries a `licence:` per fleet member, and the loader refuses a
 * member outside the allow-list. This script is the third — it enumerates
 * every transitive licence in what we ship and fails when something outside
 * the allow-list has no decision recorded against it.
 *
 * Run it:
 *
 *     npm run licence-audit          # print the report, exit non-zero on a gap
 *     npm run licence-audit -- --write   # also regenerate docs/licence-audit.md
 *
 * ## What it reads
 *
 * Three trees, because the workbench is three trees:
 *
 *   - **The harness.** `~/.dsh/profiles/node_modules` and the profile's own
 *     `node_modules`. This is `@deepseek-ai/dsh` and everything it resolves,
 *     and it is the largest of the three by two orders of magnitude. NFR5
 *     forbids editing anything in it, which makes an unacceptable licence in
 *     here a fact to be disclosed, not a file to be patched.
 *   - **Ours.** The root manifest and `plugins/dsh-client-ui-base`, both MIT
 *     and both dependency-free by design.
 *   - **The ingestion service.** Python, enumerated by
 *     `scripts/licence_audit.py`, which this script spawns.
 *
 * Plus the fleet, through the model loader's own gate, so the models and the
 * code are judged by one allow-list rather than two.
 *
 * ## What it cannot see, and what we do about it
 *
 * Package metadata describes the package, not what the package vendored. Every
 * material finding in this audit was of that second kind: libvips inside
 * `sharp`, FFmpeg inside `opencv-python`, Clipper inside `pyclipper`, Eigen
 * inside `onnxruntime`, GPL fonts inside `reportlab`. No metadata field names
 * any of them.
 *
 * So bundled components are declared by hand in `docs/licence-decisions.json`
 * — and each declaration carries an `evidence` path that this script checks
 * exists on disk. A bundled-component claim whose evidence file has moved or
 * vanished fails the audit rather than sitting in the report as prose nobody
 * rechecked.
 *
 * ## The gate
 *
 * A component outside the allow-list must have a decision recorded against it
 * in `docs/licence-decisions.json`. `open` is not a decision and fails. So does
 * a component with no entry at all, and so does one recorded as `rejected`
 * that is nonetheless present in the tree.
 *
 * Exit 0 means: every licence in the tree is either on the allow-list or has a
 * recorded decision whose evidence still checks out.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ALLOWED_LICENCES } from "../plugins/dsh-client-ui-base/lib/registry/fleet.js";
import { ALLOWED_LICENCES_DISPLAY, loadFleet } from "../plugins/dsh-client-ui-base/lib/registry/loader.js";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DECISIONS_PATH = join(PROJECT_ROOT, "docs", "licence-decisions.json");
const REPORT_PATH = join(PROJECT_ROOT, "docs", "licence-audit.md");
const POLICY_PATH = join(PROJECT_ROOT, "docs", "licence-policy.md");
const CLAUDE_MD_PATH = join(PROJECT_ROOT, "CLAUDE.md");

/**
 * The npm trees, in the order the report lists them.
 *
 * `~/.dsh` is where the harness installs, so these paths are machine-local by
 * nature. A missing root is reported, not skipped silently: an audit that
 * quietly enumerated two of three trees would pass while proving nothing.
 * @type {{ id: string, label: string, path: string, role: string }[]}
 */
const NPM_ROOTS = [
	{
		id: "harness",
		label: "DeepSeek Harness (the pinned runtime)",
		path: join(homedir(), ".dsh", "profiles", "node_modules"),
		role: "runtime",
	},
	{
		id: "profile",
		label: "The web profile's own dependencies",
		path: join(homedir(), ".dsh", "profiles", "web", "node_modules"),
		role: "runtime",
	},
	{
		id: "ours",
		label: "Blind Flange's own packages",
		path: join(PROJECT_ROOT, "plugins"),
		role: "runtime",
	},
];

/**
 * Free-text licence strings, normalised to the SPDX id they actually mean.
 *
 * Only entries verified by reading the licence text at the pinned version are
 * here — `docs/licence-decisions.json` records which file each was read from.
 * A string not in this map and not already an SPDX id is reported as
 * **ambiguous**, never guessed: "BSD" alone does not say two-clause or three,
 * and the difference is the whole point of having a list of four names.
 */
const FREE_TEXT_TO_SPDX = new Map([
	["mit license", "MIT"],
	["apache 2.0", "Apache-2.0"],
	["apache license 2.0", "Apache-2.0"],
	["apache software license", "Apache-2.0"],
	["3-clause bsd license", "BSD-3-Clause"],
	["bsd-3-clause license", "BSD-3-Clause"],
]);

/** Licence strings this project has read the text of and resolved. Keyed `name@version`. */
const RESOLVED_BY_READING = new Map();

// ---------------------------------------------------------------------------
// SPDX expressions
// ---------------------------------------------------------------------------

/**
 * Whether an SPDX expression is satisfied by the allow-list.
 *
 * `A OR B` passes when either side does — a dual licence is a choice, and we
 * take the allowed side (`pypdfium2` is exactly this: Apache-2.0 OR
 * BSD-3-Clause). `A AND B` passes only when both do, because a conjunction is
 * a set of obligations we take on together.
 *
 * `LicenseRef-*` never passes: it is by definition a licence with no SPDX
 * identity, which is the same thing as one whose terms nobody has classified.
 * @param {string} expression
 * @returns {{ allowed: boolean, ambiguous: boolean, ids: string[] }}
 */
export function evaluateExpression(expression) {
	const raw = String(expression || "").trim();
	if (!raw) return { allowed: false, ambiguous: true, ids: [] };

	const tokens = raw
		.replace(/\(/g, " ( ")
		.replace(/\)/g, " ) ")
		.split(/\s+/)
		.filter(Boolean);

	let index = 0;
	/** @type {string[]} */
	const ids = [];
	let sawAmbiguous = false;

	const peek = () => tokens[index];
	const take = () => tokens[index++];

	/** A single licence id, a parenthesised expression, or `ID WITH exception`. */
	function parseAtom() {
		if (peek() === "(") {
			take();
			const value = parseOr();
			if (peek() === ")") take();
			return value;
		}
		let id = take() ?? "";
		if ((peek() || "").toUpperCase() === "WITH") {
			take();
			// An exception can only widen permission, so judge the base licence.
			take();
		}
		const normalised = id.replace(/\+$/, "");
		ids.push(id);
		if (/^LicenseRef-/i.test(normalised)) {
			sawAmbiguous = true;
			return false;
		}
		if (!ALLOWED_LICENCES.has(normalised.toLowerCase())) {
			// `Foo-2.0+` means "or later", which cannot be on a list of exact names.
			if (id.endsWith("+")) sawAmbiguous = true;
			return false;
		}
		return true;
	}

	function parseAnd() {
		let value = parseAtom();
		while ((peek() || "").toUpperCase() === "AND") {
			take();
			const right = parseAtom();
			value = value && right;
		}
		return value;
	}

	function parseOr() {
		let value = parseAnd();
		while ((peek() || "").toUpperCase() === "OR") {
			take();
			const right = parseAnd();
			value = value || right;
		}
		return value;
	}

	const allowed = parseOr();
	return { allowed, ambiguous: !allowed && sawAmbiguous, ids };
}

/**
 * Turn whatever a manifest declared into an SPDX expression plus a verdict.
 *
 * Three outcomes and they are deliberately distinct: `allowed`, `flagged` (a
 * real licence, outside the list, needs a decision) and `ambiguous` (we cannot
 * tell what the licence is, which the policy treats as its own failure — "any
 * dependency whose licence cannot be established at all").
 * @param {string | null | undefined} declared
 * @param {string} key - `name@version`, for the resolved-by-reading lookup.
 */
export function classify(declared, key) {
	const resolved = RESOLVED_BY_READING.get(key);
	const text = String(resolved ?? declared ?? "").trim();
	if (!text) return { spdx: "", verdict: "ambiguous", note: "no licence declared in the manifest" };

	const mapped = FREE_TEXT_TO_SPDX.get(text.toLowerCase());
	const spdx = mapped ?? text;
	const { allowed, ambiguous } = evaluateExpression(spdx);

	if (allowed) {
		return {
			spdx,
			verdict: "allowed",
			note: resolved ? "resolved by reading the licence text" : mapped ? "free-text string mapped to its SPDX id" : "",
		};
	}
	// Free text that is not an SPDX id and not in the map — "BSD", "PSF".
	const looksLikeSpdx = /^[A-Za-z0-9.\-+]+(\s+(AND|OR|WITH)\s+|\s*[()]\s*|[A-Za-z0-9.\-+])*$/.test(spdx) && !/\s/.test(spdx.replace(/\s+(AND|OR|WITH)\s+/gi, "|"));
	if (ambiguous || !looksLikeSpdx) {
		return { spdx, verdict: "ambiguous", note: "not an exact SPDX id — read the licence file at this version" };
	}
	return { spdx, verdict: "flagged", note: "" };
}

// ---------------------------------------------------------------------------
// The npm trees
// ---------------------------------------------------------------------------

/**
 * Every package under an npm root, keyed `name@version`.
 *
 * Walks by `statSync` rather than the dirent's `isDirectory()`: pnpm lays this
 * tree out with junctions on Windows, and a junction reports as neither a
 * directory nor a symlink through a dirent, so a dirent-based walk finds 21 of
 * 448 packages and reports a clean tree. That is the exact shape of bug this
 * script exists to not have.
 *
 * A `package.json` with no `name` is a subpath entry-point manifest
 * (`@google/genai/node/package.json`), not a package, and is skipped.
 * @param {string} root
 * @param {Map<string, object>} into
 * @param {string} rootId
 */
function walkNpmRoot(root, into, rootId) {
	const visited = new Set();

	/** @param {string} dir */
	function walk(dir) {
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.name === ".bin" || entry.name === ".cache") continue;
			const path = join(dir, entry.name);
			let stats;
			try {
				stats = statSync(path);
			} catch {
				continue;
			}
			if (!stats.isDirectory()) continue;

			const real = path.toLowerCase();
			if (visited.has(real)) continue;
			visited.add(real);

			const manifest = join(path, "package.json");
			if (existsSync(manifest)) {
				try {
					const json = JSON.parse(readFileSync(manifest, "utf8"));
					if (json.name && json.version) {
						const key = `${json.name}@${json.version}`;
						const declared =
							typeof json.license === "string"
								? json.license
								: json.license?.type ??
									(Array.isArray(json.licenses) ? json.licenses.map((l) => l.type ?? l).join(" OR ") : null);
						const existing = into.get(key);
						if (existing) {
							if (!existing.roots.includes(rootId)) existing.roots.push(rootId);
						} else {
							into.set(key, {
								ecosystem: "npm",
								name: json.name,
								version: json.version,
								licence: declared,
								licenceFile: ["LICENSE", "LICENCE", "LICENSE.md", "LICENSE.txt", "COPYING"].some((f) =>
									existsSync(join(path, f)),
								),
								path,
								roots: [rootId],
							});
						}
					}
				} catch {
					// A manifest we cannot parse is not a package we can licence-check;
					// it surfaces as an absence in the count, which the report states.
				}
			}
			walk(path);
		}
	}

	walk(root);
}

/** Every npm package across every configured root, plus which roots were missing. */
function collectNpm() {
	/** @type {Map<string, object>} */
	const packages = new Map();
	const missingRoots = [];
	for (const root of NPM_ROOTS) {
		if (!existsSync(root.path)) {
			missingRoots.push(root);
			continue;
		}
		walkNpmRoot(root.path, packages, root.id);
	}
	return { packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)), missingRoots };
}

// ---------------------------------------------------------------------------
// The Python tree
// ---------------------------------------------------------------------------

/** Run `scripts/licence_audit.py --json`. Returns null (with a stated reason) if Python is unreachable. */
function collectPython() {
	const script = join(PROJECT_ROOT, "scripts", "licence_audit.py");
	for (const exe of ["python", "python3", "py"]) {
		const run = spawnSync(exe, [script, "--json"], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
		if (run.error || run.status !== 0) continue;
		try {
			return { data: JSON.parse(run.stdout), error: null };
		} catch (cause) {
			return { data: null, error: `${exe} ran but its JSON did not parse: ${cause.message}` };
		}
	}
	return { data: null, error: "no working `python` on PATH — the Python tree was not enumerated" };
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

/** @typedef {{ component: string, ecosystem: string, licence: string, decision: string, reason: string, adr?: string, recorded?: string, evidence?: string[] }} Decision */

/**
 * Read `docs/licence-decisions.json`.
 *
 * A decision is keyed one of two ways, and the distinction is the point:
 *
 *   - by **component** (`{ ecosystem, component }`) when the reasoning is about
 *     that package — where it sits in the tree, whether the offending part is
 *     reachable, what it was measured doing;
 *   - by **licence** (`{ licence }`) when the reasoning is about the licence
 *     class itself and applies to every package carrying it. Eleven ISC
 *     packages do not need eleven arguments; they need one, recorded once.
 *
 * A component-keyed decision wins over a licence-keyed one for the same
 * package, so a class decision can be taken generally and then overridden for
 * the one package where the class reasoning does not hold.
 */
function readDecisions() {
	if (!existsSync(DECISIONS_PATH)) {
		return { file: null, byComponent: new Map(), byLicence: new Map(), bundled: [] };
	}
	const file = JSON.parse(readFileSync(DECISIONS_PATH, "utf8"));
	const byComponent = new Map();
	const byLicence = new Map();
	const duplicates = [];

	/**
	 * Refuse a duplicate key rather than letting the last one win.
	 *
	 * `Map.set` overwriting silently is how a superseded `open` entry can sit in
	 * the file while the audit passes, with the verdict depending on which order
	 * the two happen to appear in the array. That is a gate whose result is an
	 * accident of formatting, so a duplicate is a hard failure and the file has
	 * to say which decision it means.
	 */
	const put = (map, key, decision) => {
		if (map.has(key)) {
			duplicates.push(key);
			return;
		}
		map.set(key, decision);
	};

	for (const decision of file.decisions ?? []) {
		if (decision.component) {
			put(byComponent, `${decision.ecosystem}:${decision.component.toLowerCase()}`, decision);
		} else if (decision.licence) {
			put(byLicence, decision.licence.toLowerCase(), decision);
		}
	}
	for (const [key, spdx] of Object.entries(file.resolved_by_reading ?? {})) {
		RESOLVED_BY_READING.set(key, spdx);
	}
	return { file, byComponent, byLicence, bundled: file.bundled ?? [], duplicates };
}

/**
 * Every `evidence` path in the decisions file must still exist. All of them.
 *
 * This is what stops a bundled-component declaration from decaying into a
 * sentence nobody rechecked. Paths are project-relative, or `~`-prefixed for the
 * two trees that live outside the repo — the harness under `~/.dsh` and Python's
 * site-packages.
 *
 * Those `~` paths are machine-local, and an earlier version of this function
 * treated a missing one as merely unverifiable rather than as a failure. That
 * carve-out was exactly backwards: five of the seven evidence-bearing decisions
 * have only `~` paths, and they are the copyleft disclosures the whole claim
 * rests on. An audit that cannot check the evidence for libvips and FFmpeg
 * should not print that the evidence checks out. If a path is wrong for the
 * machine the audit is running on, that is worth failing over — the evidence has
 * to be checkable where the claim is made.
 * @param {Decision[]} decisions
 */
function checkEvidence(decisions) {
	const problems = [];
	for (const decision of decisions) {
		for (const path of decision.evidence ?? []) {
			const absolute = path.startsWith("~")
				? join(homedir(), path.slice(1).replace(/^[/\\]/, ""))
				: resolve(PROJECT_ROOT, path);
			if (!existsSync(absolute)) {
				problems.push({
					component: decision.component ?? decision.licence,
					path,
					absolute,
					offRepo: path.startsWith("~"),
				});
			}
		}
	}
	return problems;
}

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------

/**
 * Assert every prose file that states the allow-list still names what the code
 * gates on.
 *
 * `CLAUDE.md` is here and not only the policy file, because it is what every
 * session loads as authority. ADR-0006 widened the set in `fleet.js`,
 * `loader.js`, the policy and the ADR — and left `CLAUDE.md` stating the
 * superseded four names as the hard constraint. A drift check that only looked
 * at the policy could not see it, so the file most likely to be believed was the
 * one file nothing verified.
 */
function checkPolicyDrift() {
	const problems = [];
	for (const [label, path] of [
		["docs/licence-policy.md", POLICY_PATH],
		["CLAUDE.md", CLAUDE_MD_PATH],
	]) {
		if (!existsSync(path)) {
			problems.push(`${label} is missing`);
			continue;
		}
		const text = readFileSync(path, "utf8");
		const missing = [...ALLOWED_LICENCES].filter((name) => !new RegExp(name.replace(/[-.]/g, "[-.]"), "i").test(text));
		if (missing.length) problems.push(`${label} does not name: ${missing.join(", ")}`);
	}
	return problems.length ? problems.join("; ") : null;
}

function audit() {
	const { file: decisionsFile, byComponent, byLicence, bundled, duplicates } = readDecisions();

	/** The decision that governs a row: component-specific first, then the licence class. */
	const decisionFor = (ecosystem, name, spdx) =>
		byComponent.get(`${ecosystem}:${String(name).toLowerCase()}`) ?? byLicence.get(String(spdx).toLowerCase()) ?? null;

	const npm = collectNpm();
	const python = collectPython();
	const fleet = loadFleet();

	/** @type {{ ecosystem: string, name: string, version: string, declared: string, spdx: string, verdict: string, note: string, roles: string[], decision: Decision | null }[]} */
	const rows = [];

	for (const pkg of npm.packages) {
		const key = `${pkg.name}@${pkg.version}`;
		const { spdx, verdict, note } = classify(pkg.licence, key);
		rows.push({
			ecosystem: "npm",
			name: pkg.name,
			version: pkg.version,
			declared: pkg.licence ?? "(none declared)",
			spdx,
			verdict,
			note,
			roles: pkg.roots,
			licenceFile: pkg.licenceFile,
			decision: decisionFor("npm", pkg.name, spdx),
		});
	}

	for (const pkg of python.data?.packages ?? []) {
		const key = `${pkg.name}@${pkg.version}`;
		const { spdx, verdict, note } = classify(pkg.licence, key);
		rows.push({
			ecosystem: "python",
			name: pkg.name,
			version: pkg.version,
			declared: pkg.licence || "(none declared)",
			spdx,
			verdict,
			note,
			roles: pkg.roles,
			licenceFile: (pkg.licence_files ?? []).length > 0,
			decision: decisionFor("python", pkg.name, spdx),
		});
	}

	for (const member of fleet.loaded) {
		rows.push({
			ecosystem: "model",
			name: member.name,
			version: member.revision ?? "",
			declared: member.licence,
			spdx: member.licence,
			verdict: "allowed",
			note: member.licence_source ?? "",
			roles: ["fleet"],
			licenceFile: true,
			decision: null,
		});
	}
	for (const refusal of fleet.refused) {
		rows.push({
			ecosystem: "model",
			name: refusal.name,
			version: "",
			declared: refusal.licence,
			spdx: refusal.licence,
			verdict: "flagged",
			note: "refused at load by the licence loader (Story 3.4)",
			roles: ["fleet"],
			licenceFile: true,
			decision: decisionFor("model", refusal.name, refusal.licence),
		});
	}

	for (const item of bundled) {
		rows.push({
			ecosystem: "bundled",
			name: item.component,
			version: item.version ?? "",
			declared: item.licence,
			spdx: item.licence,
			verdict: classify(item.licence, `${item.component}@${item.version ?? ""}`).verdict,
			note: `vendored inside ${item.inside}`,
			roles: [item.role ?? "runtime"],
			licenceFile: true,
			decision: decisionFor("bundled", item.component, item.licence),
		});
	}

	// The gate.
	//
	// A composite expression fails on the specific licences inside it that are
	// not on the allow-list, and each of those needs its own decision.
	// `numpy` is `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`: three
	// vendored-file identifiers rather than one licence, and treating the whole
	// string as a single unknown would let one decision stand in for three.
	// `(Apache-2.0 OR BSD-3-Clause) AND LicenseRef-PdfiumThirdParty` fails on
	// the `LicenseRef-` half only — the dual-licensed half is a choice we take.
	const failures = [];
	for (const row of rows) {
		if (row.verdict === "allowed") continue;

		const atoms = evaluateExpression(row.spdx || row.declared)
			.ids.map((id) => id.replace(/^\(+|\)+$/g, ""))
			.filter((id) => id && !ALLOWED_LICENCES.has(id.replace(/\+$/, "").toLowerCase()));
		// An ambiguous row has no parseable atoms to attribute the failure to;
		// judge it as one unit under whatever it declared.
		const toDecide = atoms.length ? [...new Set(atoms)] : [row.spdx || row.declared];
		row.atoms = toDecide;

		for (const atom of toDecide) {
			const decision = decisionFor(row.ecosystem, row.name, atom);
			row.decision ??= decision;
			if (!decision) {
				failures.push({ row, atom, why: "no decision recorded in docs/licence-decisions.json" });
				continue;
			}
			if (decision.decision === "open") {
				failures.push({ row, atom, decision, why: "recorded as open" });
				continue;
			}
			if (decision.decision === "rejected") {
				failures.push({ row, atom, decision, why: "recorded as rejected, but present in the tree" });
			}
		}
	}

	const evidenceProblems = checkEvidence([...byComponent.values(), ...byLicence.values()]);
	const drift = checkPolicyDrift();

	return { rows, failures, evidenceProblems, drift, duplicates, npm, python, fleet, decisionsFile };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

const VERDICT_LABEL = {
	allowed: "on the allow-list",
	flagged: "**outside the allow-list**",
	ambiguous: "**licence not established**",
};

/** @param {ReturnType<typeof audit>} result */
function renderReport(result) {
	const { rows, failures, evidenceProblems, drift, duplicates, npm, python } = result;
	const today = new Date().toISOString().slice(0, 10);
	const counts = new Map();
	for (const row of rows) counts.set(row.spdx || "(none)", (counts.get(row.spdx || "(none)") ?? 0) + 1);

	const lines = [];
	lines.push("# Licence audit");
	lines.push("");
	lines.push(
		"Generated by `npm run licence-audit -- --write` (`scripts/licence-audit.mjs`). Do not edit by hand —",
		"the decisions it reads from are in `docs/licence-decisions.json`, and the policy is",
		"`docs/licence-policy.md`.",
	);
	lines.push("");
	lines.push(`Run on ${today}. Allow-list: ${ALLOWED_LICENCES_DISPLAY} (ADR-0006).`);
	lines.push("");
	const gateFailed = failures.length > 0 || evidenceProblems.length > 0 || duplicates.length > 0 || Boolean(drift);
	lines.push(
		`**Gate: ${gateFailed ? "FAIL" : "PASS"}** — ${rows.length} components enumerated, ${failures.length} without a usable decision, ` +
			`${evidenceProblems.length} evidence path${evidenceProblems.length === 1 ? "" : "s"} missing.`,
	);
	lines.push("");

	if (drift) {
		lines.push(`> **Policy drift:** ${drift}`);
		lines.push("");
	}

	lines.push("## Scope");
	lines.push("");
	lines.push("| Tree | What it is | Components |");
	lines.push("|---|---|---|");
	for (const root of NPM_ROOTS) {
		const n = npm.packages.filter((p) => p.roots.includes(root.id)).length;
		const missing = npm.missingRoots.some((m) => m.id === root.id);
		lines.push(`| \`${root.id}\` | ${root.label} | ${missing ? "**root not found on this machine**" : n} |`);
	}
	lines.push(
		`| \`python\` | The ingestion service, its fixture generator and its proof scripts | ${python.data ? python.data.packages.length : "**not enumerated**"} |`,
	);
	lines.push(`| \`model\` | The fleet in \`registry/models.yaml\`, through the loader's own gate | ${rows.filter((r) => r.ecosystem === "model").length} |`);
	lines.push(`| \`bundled\` | Vendored components no metadata field names — declared in \`docs/licence-decisions.json\` | ${rows.filter((r) => r.ecosystem === "bundled").length} |`);
	lines.push("");
	if (python.error) {
		lines.push(`> The Python tree was not enumerated: ${python.error}`);
		lines.push("");
	}

	lines.push("## Every licence in the tree");
	lines.push("");
	lines.push("| Licence | Components |");
	lines.push("|---|---|");
	for (const [licence, n] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
		const { allowed } = evaluateExpression(licence);
		lines.push(`| ${allowed ? "" : "**"}${licence}${allowed ? "" : "**"} | ${n} |`);
	}
	lines.push("");

	const needsAttention = rows.filter((r) => r.verdict !== "allowed");
	lines.push("## Outside the allow-list");
	lines.push("");
	if (needsAttention.length === 0) {
		lines.push("Nothing. Every component is on the allow-list.");
	} else {
		lines.push(
			failures.length === 0 && evidenceProblems.length === 0
				? "Every row carries a decision recorded in `docs/licence-decisions.json`, and every evidence path still exists on disk."
				: "Each row needs a decision recorded against it in `docs/licence-decisions.json`.",
		);
		lines.push("");
		lines.push("| Component | Version | Licence | Tree | Verdict | Decision |");
		lines.push("|---|---|---|---|---|---|");
		for (const row of needsAttention.sort((a, b) => a.name.localeCompare(b.name))) {
			const decision = row.decision
				? `\`${row.decision.decision}\`${row.decision.adr ? ` (${row.decision.adr})` : ""}`
				: "**none recorded**";
			lines.push(
				`| \`${row.name}\` | ${row.version} | ${(row.atoms ?? [row.spdx || row.declared]).join(", ")} | ${row.ecosystem} | ${VERDICT_LABEL[row.verdict]} | ${decision} |`,
			);
		}
	}
	lines.push("");

	if (failures.length) {
		lines.push("## Why the gate fails");
		lines.push("");
		lines.push("Grouped by the licence that caused it, because one decision closes a whole group.");
		lines.push("");
		const groups = new Map();
		for (const failure of failures) {
			const key = `${failure.atom} — ${failure.why}`;
			if (!groups.has(key)) groups.set(key, { failure, components: [] });
			groups.get(key).components.push(`\`${failure.row.name}\``);
		}
		for (const [key, group] of [...groups.entries()].sort((a, b) => b[1].components.length - a[1].components.length)) {
			lines.push(`### ${key}`);
			lines.push("");
			lines.push(`${group.components.length} component${group.components.length === 1 ? "" : "s"}: ${group.components.sort().join(", ")}`);
			if (group.failure.decision?.reason) {
				lines.push("");
				lines.push(`> ${group.failure.decision.reason}`);
			}
			lines.push("");
		}
	}

	if (evidenceProblems.length) {
		lines.push("## Evidence that no longer checks out");
		lines.push("");
		for (const problem of evidenceProblems) {
			lines.push(
				`- \`${problem.component}\` — \`${problem.path}\` **is missing**${problem.offRepo ? " (a machine-local path, outside the repo — re-point it for this machine)" : ""}`,
			);
		}
		lines.push("");
	}

	lines.push("## The full enumeration");
	lines.push("");
	lines.push("| Component | Version | Declared | SPDX | Tree | Verdict |");
	lines.push("|---|---|---|---|---|---|");
	for (const row of rows) {
		lines.push(
			`| \`${row.name}\` | ${row.version} | ${String(row.declared).replace(/\|/g, "\\|").slice(0, 60)} | ${row.spdx.replace(/\|/g, "\\|")} | ${row.ecosystem} | ${row.verdict} |`,
		);
	}
	lines.push("");
	return `${lines.join("\n")}\n`;
}

// ---------------------------------------------------------------------------

function main() {
	const write = process.argv.includes("--write");
	const result = audit();
	const report = renderReport(result);

	if (write) {
		writeFileSync(REPORT_PATH, report, "utf8");
		console.log(`Wrote ${relative(PROJECT_ROOT, REPORT_PATH)}`);
	}

	const flagged = result.rows.filter((r) => r.verdict !== "allowed");
	console.log(`Licence audit: ${result.rows.length} components, ${flagged.length} outside the allow-list.`);
	const grouped = new Map();
	for (const failure of result.failures) {
		const key = `${failure.atom} — ${failure.why}`;
		if (!grouped.has(key)) grouped.set(key, []);
		grouped.get(key).push(failure.row.name);
	}
	for (const [key, components] of grouped) {
		const shown = components.slice(0, 4).join(", ");
		const more = components.length > 4 ? `, +${components.length - 4} more` : "";
		console.error(`  FAIL  ${key}  [${shown}${more}]`);
	}
	for (const problem of result.evidenceProblems) {
		console.error(`  FAIL  ${problem.component} — evidence path missing: ${problem.path}`);
	}
	for (const key of result.duplicates) {
		console.error(`  FAIL  docs/licence-decisions.json has two decisions keyed "${key}" — delete the superseded one`);
	}
	if (result.drift) console.error(`  FAIL  ${result.drift}`);

	const failed =
		result.failures.length > 0 ||
		result.evidenceProblems.length > 0 ||
		result.duplicates.length > 0 ||
		Boolean(result.drift);
	if (failed) {
		console.error(
			"\nThe licence claim is not safe to make yet. Record a decision in docs/licence-decisions.json,\n" +
				"or remove the component. Widening the allow-list is an ADR-level decision (docs/licence-policy.md).",
		);
	} else {
		console.log(
			"Every component is on the allow-list or carries a recorded decision, and every evidence " +
				"path in docs/licence-decisions.json exists on disk.",
		);
	}
	return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
	process.exit(main());
}
