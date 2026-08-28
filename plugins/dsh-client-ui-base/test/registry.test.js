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

test("the shipped registry/models.yaml declares exactly the Phase 0 fleet with the story's licences", () => {
	const fleet = readFleet();
	assert.deepEqual(
		fleet.map((m) => [m.name, m.licence]),
		[
			["Qwen/Qwen2.5-7B-Instruct", "Apache-2.0"],
			["Qwen/Qwen2.5-Coder-7B-Instruct", "Apache-2.0"],
			["Qwen/Qwen2.5-VL-7B-Instruct", "Apache-2.0"],
			["Qwen/Qwen2.5-3B-Instruct", "Qwen Research Licence"],
		],
	);
	for (const member of fleet) {
		assert.ok(member.revision && /^[0-9a-f]{40}$/.test(member.revision), `${member.name} pins a 40-char revision`);
		assert.ok(member.size && member.context > 0);
		assert.ok(Array.isArray(member.modalities) && member.modalities.length > 0);
		assert.ok(Array.isArray(member.capabilities) && member.capabilities.length > 0);
	}
});

test("the shipped registry omits the disallowed member from the model list, keeps the three that load", () => {
	assert.deepEqual(
		allowedFleet().map((m) => m.name),
		["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-Coder-7B-Instruct", "Qwen/Qwen2.5-VL-7B-Instruct"],
	);
});
