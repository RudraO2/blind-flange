/**
 * Tests for the router's scorer (Story 3.6): a classified task type produces a
 * score for every eligible fleet member, members excluded before scoring carry
 * a machine-readable reason, the highest scorer is selected, and no part of the
 * decision is free text.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import test from "node:test";
import { RouterScoreError, scoreFleet, TASK_PROFILES } from "../lib/router/score.js";

/** A fixture fleet mirroring the shape of `registry/models.yaml`'s licence-checked members. */
const FLEET = [
	{
		name: "Qwen/Qwen2.5-7B-Instruct",
		modalities: ["text"],
		capabilities: ["general-reasoning", "instruction-following", "tool-use"],
	},
	{
		name: "Qwen/Qwen2.5-Coder-7B-Instruct",
		modalities: ["text"],
		capabilities: ["code-generation", "code-reasoning", "tool-use"],
	},
	{
		name: "Qwen/Qwen2.5-VL-7B-Instruct",
		modalities: ["text", "image"],
		capabilities: ["document-understanding", "drawing-understanding", "visual-grounding"],
	},
];

test("every eligible member gets a numeric score", () => {
	const decision = scoreFleet("calculation", FLEET);
	assert.equal(decision.scored.length, FLEET.length);
	for (const entry of decision.scored) {
		assert.equal(typeof entry.score, "number");
		assert.ok(Array.isArray(entry.matched));
	}
});

test("the highest-scoring eligible member is selected", () => {
	assert.equal(scoreFleet("code", FLEET).selected, "Qwen/Qwen2.5-Coder-7B-Instruct");
	assert.equal(scoreFleet("calculation", FLEET).selected, "Qwen/Qwen2.5-7B-Instruct");
	assert.equal(scoreFleet("document", FLEET).selected, "Qwen/Qwen2.5-VL-7B-Instruct");
});

test("the selected member is the first entry of the score-sorted list", () => {
	const decision = scoreFleet("code", FLEET);
	assert.equal(decision.scored[0].name, decision.selected);
	for (let i = 1; i < decision.scored.length; i += 1) {
		assert.ok(decision.scored[i - 1].score >= decision.scored[i].score, "scored list is not sorted by score descending");
	}
});

test("a member excluded before scoring carries a machine-readable reason and is not scored", () => {
	const decision = scoreFleet("drawing", FLEET);
	const excludedNames = decision.excluded.map((e) => e.name);
	assert.deepEqual(excludedNames, ["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-Coder-7B-Instruct"]);
	for (const exclusion of decision.excluded) {
		assert.equal(exclusion.reason.code, "modality-missing");
		assert.equal(typeof exclusion.reason.detail, "string");
	}
	// excluded members must not also appear in scored
	const scoredNames = decision.scored.map((s) => s.name);
	for (const name of excludedNames) assert.ok(!scoredNames.includes(name));
	assert.equal(decision.selected, "Qwen/Qwen2.5-VL-7B-Instruct");
});

test("no part of the decision exists only as rendered text", () => {
	const decision = scoreFleet("code", FLEET);
	assert.ok(Object.keys(TASK_PROFILES).includes(decision.taskType));
	for (const entry of decision.scored) {
		assert.equal(typeof entry.name, "string");
		assert.equal(typeof entry.score, "number");
		for (const hit of entry.matched) {
			assert.equal(typeof hit.capability, "string");
			assert.equal(typeof hit.points, "number");
		}
	}
	for (const exclusion of decision.excluded) {
		assert.equal(typeof exclusion.reason.code, "string");
		assert.match(exclusion.reason.code, /^[a-z-]+$/, "the reason code is not a stable token");
	}
	assert.equal(typeof decision.tied, "boolean");
	assert.equal(typeof decision.allZero, "boolean");
});

test("a tie is broken by fleet declaration order and flagged", () => {
	const tiedFleet = [
		{ name: "first", modalities: ["text"], capabilities: ["general-reasoning"] },
		{ name: "second", modalities: ["text"], capabilities: ["general-reasoning"] },
	];
	const decision = scoreFleet("calculation", tiedFleet);
	assert.equal(decision.scored[0].score, decision.scored[1].score);
	assert.equal(decision.selected, "first");
	assert.equal(decision.tied, true);
});

test("scoring is deterministic — the same task type and fleet always route the same way", () => {
	const first = scoreFleet("document", FLEET);
	for (let i = 0; i < 5; i += 1) {
		assert.deepEqual(scoreFleet("document", FLEET), first);
	}
});

test("every eligible member scoring zero still selects the first and sets allZero", () => {
	const fleet = [
		{ name: "a", modalities: ["text"], capabilities: ["embedding"] },
		{ name: "b", modalities: ["text"], capabilities: ["reranking"] },
	];
	const decision = scoreFleet("code", fleet);
	assert.equal(decision.scored[0].score, 0);
	assert.equal(decision.allZero, true);
	assert.equal(decision.selected, "a");
});

test("no eligible member leaves selected null, not a crash", () => {
	const decision = scoreFleet("drawing", [{ name: "text-only", modalities: ["text"], capabilities: ["general-reasoning"] }]);
	assert.deepEqual(decision.scored, []);
	assert.equal(decision.selected, null);
	assert.equal(decision.excluded.length, 1);
});

test("an empty fleet is handled without throwing", () => {
	const decision = scoreFleet("code", []);
	assert.deepEqual(decision.scored, []);
	assert.deepEqual(decision.excluded, []);
	assert.equal(decision.selected, null);
});

test("an unknown task type throws RouterScoreError", () => {
	assert.throws(() => scoreFleet("translation", FLEET), RouterScoreError);
	assert.throws(() => scoreFleet(undefined, FLEET), RouterScoreError);
});

test("a member with malformed modalities/capabilities is treated as declaring none", () => {
	const decision = scoreFleet("code", [{ name: "broken", modalities: "text", capabilities: null }]);
	assert.equal(decision.scored[0].score, 0);
	assert.deepEqual(decision.scored[0].matched, []);
});
