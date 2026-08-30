/**
 * Tests for the upload channel (`upload/rpc.js`).
 *
 * This is a trust boundary: bytes and a filename arrive from a browser and end up
 * attached to the session, posted to a local service, and named in a deliverable's
 * audit trail. So the validation is what gets tested hardest — the happy path is
 * three lines and the refusals are the interesting part.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { attachedFindings, clearDocument, currentDocument } from "../lib/findings/attached.js";
import {
	createUploadRpcHandler,
	MAX_UPLOAD_BYTES,
	safeFilename,
	UPLOAD_CLEAR_ENDPOINT,
	UPLOAD_ENDPOINT,
} from "../lib/upload/rpc.js";

/** A stub ingestion service returning `findings`, recording what it received. */
async function startStub(findings, { status = 200 } = {}) {
	const seen = {};
	const server = createServer((req, res) => {
		let length = 0;
		req.on("data", (chunk) => {
			length += chunk.length;
		});
		req.on("end", () => {
			seen.path = req.url;
			seen.contentType = req.headers["content-type"];
			seen.bytes = length;
			res.writeHead(status, { "content-type": "application/json" });
			res.end(status === 200 ? JSON.stringify({ findings }) : JSON.stringify({ error: "not decodable" }));
		});
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		endpoint: `http://127.0.0.1:${server.address().port}`,
		seen,
		async stop() {
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

const FINDINGS = [
	{ text: "TK-4102 shell plate", bbox: { left: 1, top: 2, width: 3, height: 4 }, confidence: 98.1, page: 1 },
	{ text: "wall loss 2.3 mm", bbox: { left: 5, top: 6, width: 7, height: 8 }, confidence: 99.2, page: 2 },
];

const base64 = (text) => Buffer.from(text).toString("base64");

test("a filename is sanitised at the boundary, not trusted for where it came from", () => {
	// The browser sends File.name, which has no path in it. This value still ends
	// up in a tool result, the provenance manifest and the deliverable's audit
	// trail, so it is cleaned here rather than because of who sent it.
	assert.equal(safeFilename("report.pdf"), "report.pdf");
	assert.equal(safeFilename("C:\\Users\\someone\\report.pdf"), "report.pdf");
	assert.equal(safeFilename("../../etc/passwd"), "passwd");
	assert.equal(safeFilename("bad\u0000name.pdf"), "badname.pdf");
	assert.equal(safeFilename(""), "uploaded-document");
	assert.equal(safeFilename(undefined), "uploaded-document");
	assert.equal(safeFilename("x".repeat(500)).length, 200);
});

test("an upload is attached and ingested in one round trip, and reports what it found", async () => {
	const stub = await startStub(FINDINGS);
	clearDocument();
	try {
		const handle = createUploadRpcHandler({ endpoint: stub.endpoint });
		const result = await handle(UPLOAD_ENDPOINT, { filename: "judges-own-report.pdf", base64: base64("%PDF-1.7 hello") });
		assert.equal(result.ok, true);
		// A count the user can sanity-check is worth more than a tick.
		assert.equal(result.value.filename, "judges-own-report.pdf");
		assert.equal(result.value.findings, 2);
		assert.equal(result.value.pages, 2);
		assert.equal(result.value.bytes, 14);
		assert.equal(typeof result.value.seconds, "number");
		assert.equal(stub.seen.path, "/v1/ingest/pdf");
		assert.equal(stub.seen.contentType, "application/pdf");

		// Attached AND remembered: the findings tool reads the document, the
		// provenance panel cites these exact lines.
		assert.equal(currentDocument().filename, "judges-own-report.pdf");
		assert.deepEqual(attachedFindings(), FINDINGS);
	} finally {
		clearDocument();
		await stub.stop();
	}
});

test("a file type the OCR path cannot read is refused before anything is uploaded", async () => {
	clearDocument();
	const handle = createUploadRpcHandler({ endpoint: "http://127.0.0.1:1" });
	const result = await handle(UPLOAD_ENDPOINT, { filename: "approval-note.docx", base64: base64("PK") });
	assert.equal(result.ok, false);
	assert.equal(result.error.code, "unsupported-type");
	assert.match(result.error.message, /scanned PDFs and images/);
	// Nothing attached, so the next question is still answered about the fixture
	// rather than about a document that was never read.
	assert.equal(currentDocument(), null);
});

test("empty and oversized uploads are refused, the large one before it is decoded", async () => {
	clearDocument();
	const handle = createUploadRpcHandler({ endpoint: "http://127.0.0.1:1" });

	assert.equal((await handle(UPLOAD_ENDPOINT, { filename: "a.pdf", base64: "" })).error.code, "empty");
	assert.equal((await handle(UPLOAD_ENDPOINT, { filename: "a.pdf" })).error.code, "empty");

	// Checked against the base64 length first, so a 40 MB payload is refused
	// without being decoded into a 30 MB buffer to find out it was too big.
	const oversized = "A".repeat(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 2048);
	const result = await handle(UPLOAD_ENDPOINT, { filename: "a.pdf", base64: oversized });
	assert.equal(result.error.code, "too-large");
	assert.match(result.error.message, /25 MB/);
	assert.equal(currentDocument(), null);
});

test("an ingestion failure leaves the document attached, so nothing silently answers about the fixture", async () => {
	clearDocument();
	try {
		const handle = createUploadRpcHandler({ endpoint: "http://127.0.0.1:1" });
		const result = await handle(UPLOAD_ENDPOINT, { filename: "judges-own-report.pdf", base64: base64("%PDF-1.7") });
		assert.equal(result.ok, false);
		assert.equal(result.error.code, "ingestion-failed");
		assert.match(result.error.message, /npm run ingestion/);
		// Deliberately still attached. The findings tool refuses to describe an
		// attached document from the fixture's capture, so the failure stays visible.
		// Clearing it here would quietly put the demo back on the shipped report.
		assert.equal(currentDocument().filename, "judges-own-report.pdf");
	} finally {
		clearDocument();
	}
});

test("a service error is reported rather than swallowed", async () => {
	const stub = await startStub([], { status: 400 });
	clearDocument();
	try {
		const handle = createUploadRpcHandler({ endpoint: stub.endpoint });
		const result = await handle(UPLOAD_ENDPOINT, { filename: "not-really.pdf", base64: base64("garbage") });
		assert.equal(result.ok, false);
		assert.equal(result.error.code, "ingestion-failed");
		assert.match(result.error.message, /returned 400/);
	} finally {
		clearDocument();
		await stub.stop();
	}
});

test("clear puts the session back to the shipped fixture, and an unknown endpoint is refused", async () => {
	const stub = await startStub(FINDINGS);
	try {
		const handle = createUploadRpcHandler({ endpoint: stub.endpoint });
		await handle(UPLOAD_ENDPOINT, { filename: "a.pdf", base64: base64("%PDF-1.7") });
		assert.notEqual(currentDocument(), null);

		assert.deepEqual(await handle(UPLOAD_CLEAR_ENDPOINT, {}), { ok: true, value: { cleared: true } });
		assert.equal(currentDocument(), null);

		const unknown = await handle("delete-everything", {});
		assert.equal(unknown.ok, false);
		assert.equal(unknown.error.code, "unknown-command");
	} finally {
		clearDocument();
		await stub.stop();
	}
});

test("an image upload goes to the image route and comes back with a page to cite", async () => {
	const stub = await startStub([{ text: "x", bbox: { left: 0, top: 0, width: 1, height: 1 }, confidence: 90, page: 1 }]);
	clearDocument();
	try {
		const handle = createUploadRpcHandler({ endpoint: stub.endpoint });
		const result = await handle(UPLOAD_ENDPOINT, { filename: "a-photograph.JPG", base64: base64("\xff\xd8\xff") });
		assert.equal(result.ok, true);
		assert.equal(stub.seen.path, "/v1/ingest/image");
		assert.equal(stub.seen.contentType, "image/jpeg");
		assert.equal(result.value.pages, 1);
	} finally {
		clearDocument();
		await stub.stop();
	}
});
