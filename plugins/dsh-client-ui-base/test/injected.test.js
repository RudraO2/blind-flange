import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { lastUserText } from "../lib/router/classify.js";
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

describe("an attached image reaches the vision model as an image", () => {
	/** One message carrying `text` and a resolved image block, as `attachments/images.js` leaves it. */
	function withImage(text, base64 = "aGVsbG8=") {
		return [
			{
				role: "user",
				source: { kind: "user" },
				content: [
					{ type: "text", text },
					{ type: "image", attachment: { attachmentId: "sha256:abc", mediaType: "image/png" }, mediaType: "image/png", base64 },
				],
			},
		];
	}

	it("sends the picture as an image_url part on the message that carried it", () => {
		// The bug this closes: `toChatMessages` flattened every message to a
		// string, so an `image` block was dropped and the vision model was never
		// sent the picture the operator could plainly see attached to their own
		// message. Measured 31 August 2026.
		const chat = toChatMessages(withImage("what is in this image?"));
		const user = chat.find((m) => m.role === "user");
		assert.ok(Array.isArray(user.content), "a message with an image must serialise as parts, not a string");
		const image = user.content.find((part) => part.type === "image_url");
		assert.ok(image, "the image part is missing");
		assert.match(image.image_url.url, /^data:image\/png;base64,/);
		assert.deepEqual(
			user.content.find((part) => part.type === "text"),
			{ type: "text", text: "what is in this image?" },
		);
	});

	it("tells the model it is looking at a picture rather than at extracted text", () => {
		// Asked what was in a photograph, the previous build listed thirteen
		// numbered lines of OCR text, because the instruction it carried was about
		// extraction. Measured 30 August 2026.
		const note = toChatMessages(withImage("what is this?")).find((m) => m.role === "system");
		assert.ok(note, "a vision note should be present");
		assert.match(note.content, /looking at the picture itself/);
		assert.doesNotMatch(note.content, /OCR/);
	});

	it("keeps each image on its own message rather than moving them all to the last one", () => {
		// The earlier code hung every image off whichever user message came last,
		// which detaches a picture from the message it belonged to as soon as a
		// follow-up is asked.
		const chat = toChatMessages([
			...withImage("first picture", "AAAA"),
			{ role: "assistant", content: [{ type: "text", text: "a gauge" }] },
			{ role: "user", source: { kind: "user" }, content: [{ type: "text", text: "and the reading?" }] },
		]);
		const users = chat.filter((m) => m.role === "user");
		assert.equal(users.length, 2);
		assert.ok(Array.isArray(users[0].content), "the first message keeps its image");
		assert.equal(users[1].content, "and the reading?", "the follow-up must not inherit the picture");
	});

	it("says an image could not be loaded rather than letting the model invent one", () => {
		// A vision model asked about a picture it was not sent does not refuse; it
		// describes something plausible, which is the worst outcome this surface
		// has.
		const chat = toChatMessages([
			{
				role: "user",
				source: { kind: "user" },
				content: [
					{ type: "text", text: "what is this?" },
					{ type: "image", attachment: { attachmentId: "sha256:gone" }, unreadable: true },
				],
			},
		]);
		const user = chat.find((m) => m.role === "user");
		const said = user.content.map((part) => part.text ?? "").join(" ");
		assert.match(said, /could not be loaded/);
	});

	it("says nothing about vision when no image is attached", () => {
		assert.equal(toChatMessages(sessionWithInjections()).some((m) => m.role === "system"), false);
	});
});
