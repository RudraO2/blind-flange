/**
 * Tests for the fleet reader (Story 3.3): the YAML-subset parser, the field
 * validation, the licence allow-list filter, and the shipped
 * `registry/models.yaml` declaring exactly the Phase 0 fleet.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { allowedFleet, FleetRegistryError, isLicenceAllowed, parseFleet, readFleet } from "../lib/registry/fleet.js";

/** Write `text` to a throwaway registry file and hand back its path plus a cleanup. */
function withRegistry(text, run) {
	const dir = mkdtempSync(join(tmpdir(), "bf-fleet-"));
	const path = join(dir, "models.yaml");
	writeFileSync(path, text);
	try {
		return run(path);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

const MINIMAL = `# a comment
fleet:
  - name: acme/one
    role: general reasoner
    licence: Apache-2.0
    size: 7B
    context: 32768
    modalities: [text]
    capabilities: [general-reasoning, tool-use]
  - name: acme/two
    role: none
    licence: MIT
    size: 3B
    context: 8192
    modalities: [text, image]
    capabilities: [vision]
`;

test("parseFleet reads a fleet sequence with comments, inline arrays and numeric context", () => {
	const members = parseFleet(MINIMAL);
	assert.equal(members.length, 2);
	assert.equal(members[0].name, "acme/one");
	assert.equal(members[0].context, 32768);
	assert.deepEqual(members[1].modalities, ["text", "image"]);
});

test("parseFleet rejects content before the fleet: key", () => {
	assert.throws(() => parseFleet("stray: value\nfleet:\n"), FleetRegistryError);
});

test("parseFleet rejects an unrecognised line shape", () => {
	assert.throws(() => parseFleet("fleet:\n  weird line without a colon\n"), FleetRegistryError);
});

test("readFleet validates required fields", () => {
	const missing = `fleet:
  - name: acme/one
    licence: MIT
    size: 7B
    modalities: [text]
    capabilities: [general]
`;
	withRegistry(missing, (path) => assert.throws(() => readFleet(path), /missing "context"/));
});

test("readFleet rejects an empty capabilities list", () => {
	const empty = MINIMAL.replace("capabilities: [general-reasoning, tool-use]", "capabilities: []");
	withRegistry(empty, (path) => assert.throws(() => readFleet(path), /non-empty "capabilities"/));
});

test("readFleet rejects a duplicate model name", () => {
	const dup = MINIMAL.replace("acme/two", "acme/one");
	withRegistry(dup, (path) => assert.throws(() => readFleet(path), /more than once/));
});

test("readFleet raises FleetRegistryError when the file is absent", () => {
	assert.throws(() => readFleet(join(tmpdir(), "definitely-not-here", "models.yaml")), FleetRegistryError);
});

test("isLicenceAllowed follows the docs/licence-policy.md allow-list, case-insensitively", () => {
	assert.ok(isLicenceAllowed({ licence: "Apache-2.0" }));
	assert.ok(isLicenceAllowed({ licence: "bsd-3-clause" }));
	assert.ok(!isLicenceAllowed({ licence: "Qwen Research Licence" }));
	assert.ok(!isLicenceAllowed({ licence: "AGPL-3.0" }));
});

test("allowedFleet drops the disallowed-licence member", () => {
	const withResearch = `${MINIMAL}  - name: acme/three
    role: none
    licence: Qwen Research Licence
    size: 3B
    context: 32768
    modalities: [text]
    capabilities: [general-reasoning]
`;
	withRegistry(withResearch, (path) => {
		assert.equal(readFleet(path).length, 3);
		assert.deepEqual(
			allowedFleet(path).map((m) => m.name),
			["acme/one", "acme/two"],
		);
	});
});

test("the shipped registry/models.yaml declares exactly the fleet on this box, with its licences", () => {
	const fleet = readFleet();
	// Changed 30 August 2026: the three 7B members were removed when the model
	// plane stopped being replayed. They were honest under `replay`, which
	// downloads no weights, but a 7B at Q4 does not fit in 3.7 GB of VRAM, so
	// declaring them made the router's decision fiction.
	assert.deepEqual(
		fleet.map((m) => [m.name, m.licence]),
		[
			["Qwen/Qwen2.5-Coder-1.5B-Instruct", "Apache-2.0"],
			["Qwen/Qwen3-VL-2B-Instruct", "Apache-2.0"],
			["Qwen/Qwen2.5-3B-Instruct", "Qwen Research Licence"],
			["Qwen/Qwen2.5-Coder-3B-Instruct", "Qwen Research Licence"],
		],
	);
	for (const member of fleet) {
		assert.ok(member.revision && /^[0-9a-f]{40}$/.test(member.revision), `${member.name} pins a 40-char revision`);
		assert.ok(member.size && member.context > 0);
		assert.ok(Array.isArray(member.modalities) && member.modalities.length > 0);
		assert.ok(Array.isArray(member.capabilities) && member.capabilities.length > 0);
	}
});

test("a member that runs declares what it actually runs as, so the UI cannot overstate its context", () => {
	// `context` is the model's native window; `runtime_context` is what llama-swap
	// starts it with. The vision member's native window is 262144 tokens and a KV
	// cache that size does not fit on this card, so the two numbers must differ
	// and both must be present rather than the larger one standing alone.
	const runnable = readFleet().filter((m) => m.runtime_id !== undefined);
	assert.equal(runnable.length, 2);
	for (const member of runnable) {
		assert.equal(typeof member.quantisation, "string", `${member.name} declares its quantisation`);
		assert.ok(member.runtime_context > 0, `${member.name} declares the context it is actually started with`);
		assert.ok(member.runtime_context <= member.context, `${member.name} cannot be run with more context than it has`);
	}
});

test("the shipped registry omits both disallowed members from the model list", () => {
	assert.deepEqual(
		allowedFleet().map((m) => m.name),
		["Qwen/Qwen2.5-Coder-1.5B-Instruct", "Qwen/Qwen3-VL-2B-Instruct"],
	);
});
