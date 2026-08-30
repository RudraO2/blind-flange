import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lastUserText } from "../lib/router/classify.js";
import { attachDocument, clearDocument, rememberFindings } from "../lib/findings/attached.js";
import { isGenuineHumanMessage, lastGenuineUserMessage, withoutHarnessInjections } from "../lib/model-plane/injected.js";
import { toChatMessages } from "../lib/model-plane/local-provider.js";

/**
 * The shape a real session produced on 30 August 2026: the operator's question,
 * then the harness's own injections folded in behind it as `role: "user"`.
 */
function sessionWithInjections() {
	return [
		{ role: "user", content: "summarise the findings in the inspection report", source: { kind: "user" } },
		{ role: "user", content: "Current DSH File Policy: workspace-write ...", source: { kind: "plugin" } },
		{ role: "user", content: "Available skills: ai-seo, hyperframes, media-use, seo-audit ...", source: { kind: "skill-catalog" } },
	];
}

describe("harness-injected context is not mistaken for the operator", () => {
	it("recognises only an untagged or user-sourced message as human", () => {
		assert.equal(isGenuineHumanMessage({ role: "user", content: "hi" }), true);
		assert.equal(isGenuineHumanMessage({ role: "user", content: "hi", source: { kind: "user" } }), true);
		assert.equal(isGenuineHumanMessage({ role: "user", content: "hi", source: { kind: "skill-catalog" } }), false);
		assert.equal(isGenuineHumanMessage({ role: "user", content: "hi", source: { kind: "plugin" } }), false);
		assert.equal(isGenuineHumanMessage({ role: "assistant", content: "hi" }), false);
	});

	it("finds the human turn behind the injections that follow it", () => {
		assert.equal(lastGenuineUserMessage(sessionWithInjections()).content, "summarise the findings in the inspection report");
	});

	it("falls back to the last user-role message when nothing is tagged as human", () => {
		const only = [{ role: "user", content: "catalog", source: { kind: "skill-catalog" } }];
		assert.equal(lastGenuineUserMessage(only).content, "catalog");
	});
});

describe("the router classifies the request, not the injection", () => {
	it("reads the operator's text past a trailing skill catalogue", () => {
		// Before 30 August 2026 this returned the catalogue, so every turn whose
		// injections landed last was classified on text the operator never typed.
		assert.equal(lastUserText(sessionWithInjections()), "summarise the findings in the inspection report");
	});

	it("still reads a plain message with no source at all", () => {
		assert.equal(lastUserText([{ role: "user", content: "write a python script" }]), "write a python script");
	});
});

describe("the harness's own injections never reach the model", () => {
	it("is dropped from the chat messages the local provider builds", () => {
		const chat = toChatMessages(sessionWithInjections());
		assert.equal(chat.some((message) => message.content.includes("ai-seo")), false);
	});

	it("drops the runtime-context snapshot too", () => {
		// Kept in the first pass, on the reasoning that a model needs its file
		// policy. The same session disproved it an hour later: asked what was in an
		// uploaded document, the model summarised the file policy instead.
		const chat = toChatMessages(sessionWithInjections());
		assert.equal(chat.some((message) => message.content.includes("workspace-write")), false);
		assert.equal(chat.length, 1);
	});

	it("leaves an ordinary message list untouched", () => {
		const plain = [{ role: "user", content: "hello" }];
		assert.deepEqual(withoutHarnessInjections(plain), plain);
	});
});

describe("an attached document announces itself to the model", () => {
	it("says nothing when no document is attached", () => {
		clearDocument();
		assert.equal(toChatMessages(sessionWithInjections()).some((m) => m.role === "system"), false);
	});

	it("names the file, the OCR line count and the tool that reads it", () => {
		// The gap this closes: upload is host state, so without a note the model has
		// no idea a file arrived and never calls the findings tool. Measured on
		// 30 August 2026 — a document was uploaded, "what is in the doc I sent?" was
		// asked, and the session log recorded zero tool calls for that turn.
		attachDocument("github-profile.png", new Uint8Array([1, 2, 3]));
		rememberFindings([{ page: 1 }, { page: 1 }]);
		const note = toChatMessages(sessionWithInjections()).find((m) => m.role === "system");
		assert.ok(note, "a system note should be present");
		assert.match(note.content, /github-profile\.png/);
		assert.match(note.content, /2 OCR lines/);
		assert.match(note.content, /bf_report_findings/);
		clearDocument();
	});
});
