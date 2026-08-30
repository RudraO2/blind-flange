/**
 * Tests for the router's classifier (Story 3.5): a request resolves to exactly
 * one of document, drawing, calculation or code, the result is structured data,
 * and a request that matches nothing falls back deterministically.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import test from "node:test";
import { classifyRequest, FALLBACK_TASK_TYPE, IMAGE_FALLBACK_TASK_TYPE, lastUserText, TASK_TYPES } from "../lib/router/classify.js";

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

/* ---------------------------------------------------------------------------
 * The two facts that outrank the keywords (31 August 2026)
 * ------------------------------------------------------------------------ */

test("an attached image routes to the vision side whatever the words say", () => {
	// The fleet has one member that can see and one that cannot. Routing a turn
	// carrying a picture to the text-only coder does not produce a worse answer,
	// it produces an answer about an image nobody looked at. So this is a hard
	// gate, not a weight — the near side of the same modality gate `score.js`
	// already applies to members.
	const result = classifyRequest("write a python script to refactor this", { hasImage: true });
	assert.ok(["document", "drawing"].includes(result.taskType), `image turn routed to ${result.taskType}`);
	assert.equal(result.hasImage, true);
	// The excluded types keep their scores: the routing chip shows the working,
	// and hiding them would make the decision less inspectable, not more.
	assert.ok(result.scores.code > 0, "the code rules still scored, they just did not win");
});

test("an image with drawing words still picks drawing over document", () => {
	const result = classifyRequest("give me the tag inventory from this P&ID", { hasImage: true });
	assert.equal(result.taskType, "drawing");
});

test("an image with no useful words falls back to document, not to code", () => {
	const result = classifyRequest("what is this?", { hasImage: true });
	assert.equal(result.taskType, IMAGE_FALLBACK_TASK_TYPE);
	assert.equal(result.taskType, "document");
	assert.equal(result.fallback, true);
});

test("an unclassifiable request falls back to the lane that can reach for a tool", () => {
	// Measured 31 August 2026: this fell back to `document`, which sent it to the
	// vision member — not the lane that builds a tool call. The request was
	// answered conversationally, so the egress waterfall, which is the entire
	// point of asking it, was never reached.
	assert.equal(FALLBACK_TASK_TYPE, "code");
	assert.equal(classifyRequest("good morning").taskType, "code");
});

test("the requests the sovereignty beat is actually phrased with reach the coding lane", () => {
	for (const text of [
		"Open WhatsApp and check the vendor thread.",
		"Run a shell command in the sandbox that opens https://web.whatsapp.com",
		"launch the browser",
		"execute this in the terminal",
		"install the package",
	]) {
		assert.equal(classifyRequest(text).taskType, "code", `"${text}" did not reach the coding lane`);
	}
});

test("widening the code rules did not swallow the document lane", () => {
	for (const text of [
		"summarise the inspection report",
		"what are the findings on page 3?",
		"read the maintenance report and list the corrosion findings",
		"what does clause 5 say?",
	]) {
		assert.equal(classifyRequest(text).taskType, "document", `"${text}" stopped being a document task`);
	}
});

test("an ordinary action verb does not drag a report or a drawing into the coding lane", () => {
	// The bleed a scored `action-verb` rule caused for about ten minutes on
	// 31 August 2026, kept as a test rather than a memory. `open` and `run` are
	// ordinary English: each scored 1 against `document`'s 1 and won the tie,
	// because `code` leads TASK_TYPE_PRIORITY. The drawing case was the worst of
	// them — it routed a question about a picture away from the only member that
	// can see one.
	assert.equal(classifyRequest("open the report").taskType, "document");
	assert.equal(classifyRequest("run through the findings with me").taskType, "document");
	assert.equal(classifyRequest("open the drawing").taskType, "drawing");
});

test("the three misroutes docs/router-handoff.md records now reach the coder", () => {
	// Problem 1 in that handoff, verbatim, and it is the one it calls "the largest
	// hole in the demo": each of these was classified `document` and answered by
	// the vision member *from memory* instead of being computed. The coding lane
	// never engaged, so nothing ran in the sandbox.
	//
	// `code` and `calculation` are the same member — what matters is that all
	// three now reach it.
	for (const text of [
		"Sum the integers from 1 to 100.",
		"Count how many integers from 1 to 200 are divisible by both 3 and 5.",
		"Given readings 7.2, 7.6, 6.9 and 7.4 mm, report the minimum reading.",
	]) {
		const taskType = classifyRequest(text).taskType;
		assert.ok(taskType === "calculation" || taskType === "code", `"${text}" classified ${taskType}, which is not the coder`);
	}
});

test("the arithmetic verbs did not swallow the document lane either", () => {
	// `sum` must not match `summarise`, and a report question that counts things
	// is still a report question.
	assert.equal(classifyRequest("summarise the inspection report").taskType, "document");
	assert.equal(classifyRequest("count the findings in the report").taskType, "document");
});
