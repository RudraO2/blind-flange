/**
 * Tests for the router's classifier (Story 3.5): a request resolves to exactly
 * one of document, drawing, calculation or code, the result is structured data,
 * and a request that matches nothing falls back deterministically.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequest, FALLBACK_TASK_TYPE, lastUserText, TASK_TYPES } from "../lib/router/classify.js";

test("every request resolves to one of the four task types", () => {
	for (const text of [
		"summarise the findings in the inspection report",
		"what does this valve symbol mean on the P&ID",
		"calculate the pressure drop across the line",
		"write a python script to parse the log",
		"hello",
		"",
	]) {
		const result = classifyRequest(text);
		assert.ok(TASK_TYPES.includes(result.taskType), `"${text}" classified as ${result.taskType}`);
	}
});

test("classifies a report-reading request as document", () => {
	const result = classifyRequest("Read the maintenance report and list the corrosion findings on page 3");
	assert.equal(result.taskType, "document");
	assert.ok(result.matchedRules.document.length > 0);
	assert.equal(result.fallback, false);
});

test("classifies a P&ID request as drawing", () => {
	const result = classifyRequest("Give me the tag inventory from this P&ID and the line numbers");
	assert.equal(result.taskType, "drawing");
});

test("classifies an engineering calculation as calculation", () => {
	const result = classifyRequest("Compute the minimum wall thickness given 15 bar and a 3 mm/yr corrosion allowance");
	assert.equal(result.taskType, "calculation");
});

test("classifies a coding task as code", () => {
	const result = classifyRequest("Refactor this function and add unit tests");
	assert.equal(result.taskType, "code");
});

test("a code fence alone is enough to classify as code", () => {
	const result = classifyRequest("what does this do?\n```\nSELECT 1\n```");
	assert.equal(result.taskType, "code");
});

test("the result is structured data: a score for every task type", () => {
	const result = classifyRequest("write a python function");
	assert.deepEqual(Object.keys(result.scores).sort(), [...TASK_TYPES].sort());
	for (const type of TASK_TYPES) {
		assert.equal(typeof result.scores[type], "number");
		assert.ok(Array.isArray(result.matchedRules[type]));
	}
	assert.equal(typeof result.matchedRuleCount, "number");
});

test("no part of the decision is prose", () => {
	const result = classifyRequest("summarise the report");
	for (const value of Object.values(result)) {
		assert.notEqual(typeof value, "undefined");
	}
	// taskType is an enum token, scores/matchedRules are keyed by the same tokens — nothing free-text.
	assert.ok(TASK_TYPES.includes(result.taskType));
});

test("an unrecognised request falls back to document and says so", () => {
	const result = classifyRequest("good morning");
	assert.equal(result.taskType, FALLBACK_TASK_TYPE);
	assert.equal(result.fallback, true);
	assert.equal(result.matchedRuleCount, 0);
});

test("classification is deterministic — the same request always classifies the same way", () => {
	const text = "debug the python script and calculate the flow rate";
	const first = classifyRequest(text);
	for (let i = 0; i < 5; i += 1) {
		assert.deepEqual(classifyRequest(text), first);
	}
});

test("a tie is broken by the fixed priority order and flagged", () => {
	// one code rule (language) and one calculation rule (calculate-verb) — code wins on priority.
	const result = classifyRequest("evaluate this regex");
	assert.equal(result.scores.code, result.scores.calculation);
	assert.equal(result.taskType, "code");
	assert.equal(result.tied, true);
});

test("a non-string request is treated as empty, not a crash", () => {
	assert.equal(classifyRequest(undefined).taskType, FALLBACK_TASK_TYPE);
	assert.equal(classifyRequest(null).fallback, true);
	assert.equal(classifyRequest(42).matchedRuleCount, 0);
});

test("lastUserText reads the last user message's text blocks", () => {
	assert.equal(
		lastUserText([
			{ role: "user", content: [{ type: "text", text: "first" }] },
			{ role: "assistant", content: [{ type: "text", text: "reply" }] },
			{ role: "user", content: [{ type: "text", text: "second" }, { type: "image", url: "x" }] },
		]),
		"second",
	);
	assert.equal(lastUserText([{ role: "user", content: "bare string" }]), "bare string");
	assert.equal(lastUserText([]), "");
	assert.equal(lastUserText("nonsense"), "");
});
