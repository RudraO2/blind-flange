/**
 * Tests for the permitted GenUI component set (Story 8.1).
 *
 * The adopted plugin (`@changfenhuang/dsh-genui`, pinned at 0.9.3) renders
 * whatever the fence contains, out of a whitelist thirty-odd component types
 * wide. Ours is three types wide, and this is where that is enforced rather
 * than merely written down: every ```dsh-ui fence in the authored replay cache
 * is parsed, checked against the permitted set, and — for the key-findings
 * fence.
 *
 * That last check is the one that matters most. Story 4.5's crop viewer cuts
 * its crop from a finding's recorded bounding box; a table row citing a region
 * no finding carries would render perfectly and quietly sever provenance,
 * which is exactly what Story 8.1's acceptance criteria forbid.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkGenuiSpec, extractGenuiFences, PERMITTED_GENUI_TYPES } from "../lib/genui/permitted-set.js";

const libDir = join(dirname(fileURLToPath(import.meta.url)), "..", "lib");
const cache = JSON.parse(readFileSync(join(libDir, "model-plane", "replay-cache.json"), "utf8"));

/** Every authored assistant text in the cache, flattened across entries and steps. */
function authoredTexts() {
	const texts = [];
	for (const entry of cache) {
		const steps = Array.isArray(entry.steps) ? entry.steps : [{ blocks: entry.blocks }];
		for (const step of steps) {
			for (const block of step?.blocks ?? []) {
				if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
			}
		}
	}
	return texts;
}

/** Every fence body in the cache, with the text it came from for the failure message. */
function cachedFences() {
	return authoredTexts().flatMap((text) => extractGenuiFences(text).map((body) => ({ body, text })));
}

test("the permitted set is tables, charts and plots — and widening it is a decision, not an edit", () => {
	assert.deepEqual([...PERMITTED_GENUI_TYPES], ["table", "chart", "plot"]);
});

test("the replay cache carries at least one fence, or this story rendered nothing", () => {
	assert.ok(cachedFences().length > 0);
});

test("every fence in the replay cache is valid JSON and inside the permitted set", () => {
	for (const { body } of cachedFences()) {
		let spec;
		assert.doesNotThrow(() => {
			spec = JSON.parse(body);
		}, `a fence body is not valid JSON: ${body.slice(0, 120)}`);
		assert.deepEqual(checkGenuiSpec(spec), [], `fence outside the permitted set: ${body.slice(0, 120)}`);
	}
});

test("the checker refuses the component types the story rules out", () => {
	const quiz = { items: [{ type: "quiz", question: "?", options: [] }] };
	assert.ok(checkGenuiSpec(quiz).some((message) => message.includes("`quiz`")));
	const scene = { items: [{ type: "scene3d", meshes: [] }] };
	assert.ok(checkGenuiSpec(scene).some((message) => message.includes("`scene3d`")));
	const form = { items: [{ type: "input", id: "tag" }] };
	assert.ok(checkGenuiSpec(form).some((message) => message.includes("`input`")));
});

test("the checker refuses the action event loop, wherever it is buried", () => {
	const nested = { items: [{ type: "table", columns: ["a"], rows: [["1"]], footer: { action: "refresh" } }] };
	const violations = checkGenuiSpec(nested);
	assert.ok(violations.some((message) => message.includes("`action`")));
});

test("the checker refuses a URL in any component", () => {
	assert.ok(checkGenuiSpec({ items: [{ type: "video", src: "https://example.com/x.mp4" }] }).some((m) => m.includes("`src`")));
	assert.ok(checkGenuiSpec({ items: [{ type: "link", label: "x", href: "https://example.com" }] }).some((m) => m.includes("`href`")));
});

