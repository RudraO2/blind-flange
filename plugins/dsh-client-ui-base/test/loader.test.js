/**
 * Tests for the licence loader (Story 3.4): a member whose declared licence is
 * outside the allow-list (ADR-0005) is refused — not loaded, not listed — with
 * a stated reason naming the offending licence, while every allowed member in
 * the same registry loads normally.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FleetRegistryError } from "../lib/registry/fleet.js";
import { announceRefusals, loadFleet } from "../lib/registry/loader.js";

/** Write `text` to a throwaway registry file and hand back its path plus a cleanup. */
function withRegistry(text, run) {
	const dir = mkdtempSync(join(tmpdir(), "bf-loader-"));
	const path = join(dir, "models.yaml");
	writeFileSync(path, text);
	try {
		return run(path);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const ALLOWED = `fleet:
  - name: acme/reasoner
    role: general reasoner
    licence: Apache-2.0
    size: 7B
    context: 32768
    modalities: [text]
    capabilities: [general-reasoning]
  - name: acme/coder
    role: coder
    licence: MIT
    size: 7B
    context: 32768
    modalities: [text]
    capabilities: [code-generation]
`;

const RESEARCH_MEMBER = `  - name: acme/reasoner-3b
    role: none
    licence: Qwen Research Licence
    size: 3B
    context: 32768
    modalities: [text]
    capabilities: [general-reasoning]
`;

test("loadFleet loads every allowed member and refuses none when the registry is clean", () => {
	withRegistry(ALLOWED, (path) => {
		const { loaded, refused } = loadFleet(path);
		assert.deepEqual(
			loaded.map((m) => m.name),
			["acme/reasoner", "acme/coder"],
		);
		assert.deepEqual(refused, []);
	});
});

test("loadFleet refuses a disallowed-licence member and names the licence — the others still load", () => {
	withRegistry(ALLOWED + RESEARCH_MEMBER, (path) => {
		const { loaded, refused } = loadFleet(path);
		assert.deepEqual(
			loaded.map((m) => m.name),
			["acme/reasoner", "acme/coder"],
		);
		assert.equal(refused.length, 1);
		assert.equal(refused[0].name, "acme/reasoner-3b");
		assert.equal(refused[0].licence, "Qwen Research Licence");
		assert.match(refused[0].reason, /Qwen Research Licence/);
		assert.match(refused[0].reason, /allow-list/);
	});
});

test("the gate reads the allow-list, not a blocklist — any unlisted licence is refused identically", () => {
	for (const licence of ["CDLA-Permissive-2.0", "AGPL-3.0", "Community-With-User-Cap-1.0"]) {
		withRegistry(ALLOWED + RESEARCH_MEMBER.replace("Qwen Research Licence", licence), (path) => {
			const { loaded, refused } = loadFleet(path);
			assert.deepEqual(loaded.map((m) => m.name), ["acme/reasoner", "acme/coder"]);
			assert.equal(refused.length, 1);
			assert.equal(refused[0].licence, licence);
		});
	}
});

test("loadFleet still propagates a FleetRegistryError when the registry file itself is broken", () => {
	assert.throws(() => loadFleet(join(tmpdir(), "no-such-dir", "models.yaml")), FleetRegistryError);
});

test("announceRefusals states one error line per refusal and returns the array", () => {
	announceRefusals.reset();
	const lines = [];
	const refused = [
		{ name: "acme/x", licence: "AGPL-3.0", reason: "Blind Flange refuses to load \"acme/x\": its licence \"AGPL-3.0\" ..." },
	];
	const returned = announceRefusals(refused, (m) => lines.push(m));
	assert.equal(lines.length, 1);
	assert.match(lines[0], /refuses to load "acme\/x"/);
	assert.equal(returned, refused);
});

test("the shipped registry: both Research-Licensed members are refused, both runnable members load", () => {
	const { loaded, refused } = loadFleet();
	assert.deepEqual(
		loaded.map((m) => m.name),
		["Qwen/Qwen2.5-Coder-1.5B-Instruct", "Qwen/Qwen3-VL-2B-Instruct"],
	);
	// Asserted by name, not just by count. The second refusal was added on
	// 30 August 2026 precisely because `Qwen2.5-Coder-3B-Instruct` is the size an
	// engineer reaches for when 1.5B feels small, and it is the one non-Apache
	// member of its family — the gate has to catch it without anyone remembering.
	assert.deepEqual(
		refused.map((m) => m.name),
		["Qwen/Qwen2.5-3B-Instruct", "Qwen/Qwen2.5-Coder-3B-Instruct"],
	);
	for (const member of refused) {
		assert.match(member.licence, /Qwen Research Licence/);
		assert.match(member.reason, /docs\/licence-policy\.md/);
	}
});

test("every loaded member declares the runtime id dispatch needs, and no refused member does", () => {
	const { loaded, refused } = loadFleet();
	// A loaded member with no runtime id is a registry entry that was never wired
	// into llama-swap's config: the router would select it and dispatch would
	// silently fall back to a default. Catch that here rather than on stage.
	assert.deepEqual(
		loaded.map((m) => m.runtime_id),
		["bf-coder", "bf-vision"],
	);
	assert.ok(
		refused.every((m) => m.runtime_id === undefined),
		"a member declared only so the loader refuses it must not claim a runtime id",
	);
});
