/**
 * Tests for the hand-rolled OOXML `.docx` builder (`lib/deliverables/docx.js`),
 * Story 5.4. Unzips the result with an independent reader and inspects the raw
 * XML — the same kind of check `test/zip.test.js` runs on the archive itself,
 * one layer up. `test/deliverables.test.js` covers the tool that calls this;
 * this file covers the document it produces.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import test from "node:test";
import { inflateRawSync } from "node:zlib";
import { buildApprovalNoteDocx } from "../lib/deliverables/docx.js";

/** Unzips a buffer into { name: text } for every entry, decoded as UTF-8. */
function unzipToText(zip) {
	const parts = {};
	let offset = 0;
	while (offset < zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
		const compressedSize = zip.readUInt32LE(offset + 18);
		const nameLength = zip.readUInt16LE(offset + 26);
		const extraLength = zip.readUInt16LE(offset + 28);
		const nameStart = offset + 30;
		const name = zip.toString("ascii", nameStart, nameStart + nameLength);
		const dataStart = nameStart + nameLength + extraLength;
		parts[name] = inflateRawSync(zip.subarray(dataStart, dataStart + compressedSize)).toString("utf8");
		offset = dataStart + compressedSize;
	}
	return parts;
}

function sampleNote(overrides = {}) {
	return {
		title: "Approval Note",
		referenceNumber: "NRC-APPR-0001",
		generatedAt: "2026-08-28T00:00:00.000Z",
		sourceReport: "sample-inspection-report.pdf",
		clauses: [
			{
				text: "E-1104A — corrosion under insulation suspected.",
				page: 1,
				region: { left: 560, top: 2048, width: 814, height: 58 },
				tag: "E-1104A",
			},
		],
		contentHash: "deadbeef",
		...overrides,
	};
}

test("produces a well-formed zip archive with the required OOXML parts", () => {
	const parts = unzipToText(buildApprovalNoteDocx(sampleNote()));
	assert.ok(parts["[Content_Types].xml"], "no [Content_Types].xml");
	assert.ok(parts["_rels/.rels"], "no _rels/.rels");
	assert.ok(parts["word/document.xml"], "no word/document.xml");
	assert.ok(parts["word/_rels/document.xml.rels"], "no word/_rels/document.xml.rels");
	assert.ok(parts["word/footer1.xml"], "no word/footer1.xml");
});

test("the titleblock carries the title and reference number", () => {
	const parts = unzipToText(buildApprovalNoteDocx(sampleNote()));
	assert.match(parts["word/document.xml"], /Approval Note/);
	assert.match(parts["word/document.xml"], /Reference: NRC-APPR-0001/);
});

test("every clause's text appears in the body, with its tag when it names one", () => {
	// The second line under a clause was its page and bounding box until
	// 31 August 2026. ADR-0008 removed the OCR service that produced them; a
	// clause with no tag now carries no source line rather than one reading
	// "page undefined", which would look like a citation and cite nothing.
	const parts = unzipToText(
		buildApprovalNoteDocx(
			sampleNote({
				clauses: [
					{ text: "First finding." },
					{ text: "Second finding.", tag: "PSV-2207A" },
				],
			}),
		),
	);
	const body = parts["word/document.xml"];
	assert.match(body, /First finding\./);
	assert.match(body, /Second finding\./);
	assert.match(body, /Tag: PSV-2207A/);
	assert.doesNotMatch(body, /undefined/);
});

test("the footer carries the content hash and names the note as not pre-authored", () => {
	const parts = unzipToText(buildApprovalNoteDocx(sampleNote({ contentHash: "abc123" })));
	assert.match(parts["word/footer1.xml"], /abc123/);
	assert.match(parts["word/footer1.xml"], /not pre-authored/);
});

test("the document references the footer through a relationship, not an inline copy", () => {
	const parts = unzipToText(buildApprovalNoteDocx(sampleNote()));
	assert.match(parts["word/document.xml"], /w:footerReference/);
	assert.match(parts["word/_rels/document.xml.rels"], /footer1\.xml/);
});

test("XML-significant characters in clause text are escaped, not injected raw", () => {
	const parts = unzipToText(
		buildApprovalNoteDocx(
			sampleNote({
				clauses: [{ text: 'Valve <V-1> reads "open" & closed', page: 1, region: { left: 0, top: 0, width: 1, height: 1 } }],
			}),
		),
	);
	const body = parts["word/document.xml"];
	assert.ok(!body.includes("<V-1>"), "a raw angle bracket would corrupt the XML tree");
	assert.match(body, /Valve &lt;V-1&gt; reads &quot;open&quot; &amp; closed/);
});

test("the signature block is present", () => {
	const parts = unzipToText(buildApprovalNoteDocx(sampleNote()));
	assert.match(parts["word/document.xml"], /Prepared by:/);
	assert.match(parts["word/document.xml"], /Approved by:/);
});

test("two notes built from the same input are byte-identical", () => {
	const note = sampleNote();
	assert.deepEqual(buildApprovalNoteDocx(note), buildApprovalNoteDocx({ ...note }));
});
