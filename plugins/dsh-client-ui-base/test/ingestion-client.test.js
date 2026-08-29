/**
 * Tests for the live ingestion path: the client (`findings/ingestion-client.js`)
 * and the findings tool that now calls it (`findings/tool.js`).
 *
 * Driven against a loopback stub rather than the real Python service, so these
 * run on a machine with no virtualenv and no OCR models. The service's own OCR
 * contract is covered by `services/ingestion/test_service.py` and is not
 * duplicated here.
 *
 * The behaviour worth being strict about is the disclosure. A capture read that
 * presents itself as a live OCR pass is the same class of dishonesty as replayed
 * inference presented as local inference, and ADR-0001 exists because that
 * distinction matters more than the convenience of blurring it.
 *
 *     node --test plugins/dsh-client-ui-base/test/
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
	ACCEPTED_UPLOAD_EXTENSIONS,
	ingest,
	ingestionHealth,
	ingestionTargetFor,
} from "../lib/findings/ingestion-client.js";
import { attachDocument, clearDocument, createReportFindingsTool } from "../lib/findings/tool.js";

/** Start a loopback stub, returning its base URL and a stop function. */
async function startStub(handler) {
	const server = createServer(handler);
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		endpoint: `http://127.0.0.1:${server.address().port}`,
		async stop() {
			await new Promise((resolve) => server.close(resolve));
		},
	};
}

/** A stub ingestion service that records what it was asked for. */
async function startIngestionStub(findings, { status = 200 } = {}) {
	const seen = {};
	const stub = await startStub((req, res) => {
		let length = 0;
		req.on("data", (chunk) => {
			length += chunk.length;
		});
		req.on("end", () => {
			seen.path = req.url;
			seen.contentType = req.headers["content-type"];
			seen.bytes = length;
			if (req.url === "/health") {
				res.writeHead(200, { "content-type": "application/json" });
				res.end(JSON.stringify({ status: "ok", warm: true, renderDpi: 200 }));
				return;
			}
			res.writeHead(status, { "content-type": "application/json" });
			res.end(status === 200 ? JSON.stringify({ findings }) : JSON.stringify({ error: "body is not a decodable PDF" }));
		});
	});
	return { ...stub, seen };
}

const ONE_FINDING = [{ text: "PSV-2207A relief valve", bbox: { left: 10, top: 20, width: 300, height: 40 }, confidence: 99.7, page: 1 }];

test("a filename chooses the service route, and an unreadable extension is refused up front", () => {
	assert.deepEqual(ingestionTargetFor("report.pdf"), { contentType: "application/pdf", path: "/v1/ingest/pdf" });
	assert.deepEqual(ingestionTargetFor("scan.PNG"), { contentType: "image/png", path: "/v1/ingest/image" });
	assert.deepEqual(ingestionTargetFor("photo.jpeg"), { contentType: "image/jpeg", path: "/v1/ingest/image" });
	// Better to say so before uploading three megabytes than to let the service 400.
	assert.equal(ingestionTargetFor("notes.docx"), null);
	assert.equal(ingestionTargetFor("noextension"), null);
	assert.ok(ACCEPTED_UPLOAD_EXTENSIONS.includes(".pdf"));
});

test("health reports whether the engine is warm, because a cold first request looks like a hang", async () => {
	const stub = await startIngestionStub(ONE_FINDING);
	try {
		assert.deepEqual(await ingestionHealth({ endpoint: stub.endpoint }), { up: true, warm: true, renderDpi: 200 });
	} finally {
		await stub.stop();
	}
	const offline = await ingestionHealth({ endpoint: "http://127.0.0.1:1" });
	assert.equal(offline.up, false);
	assert.ok(offline.detail);
});

test("ingest posts the bytes to the right route with the right content type", async () => {
	const stub = await startIngestionStub(ONE_FINDING);
	try {
		const result = await ingest({ bytes: Buffer.from("%PDF-1.7 fake"), filename: "report.pdf", endpoint: stub.endpoint });
		assert.equal(result.source, "live");
		assert.deepEqual(result.findings, ONE_FINDING);
		assert.equal(typeof result.seconds, "number");
		assert.equal(stub.seen.path, "/v1/ingest/pdf");
		assert.equal(stub.seen.contentType, "application/pdf");
		assert.equal(stub.seen.bytes, 13);
	} finally {
		await stub.stop();
	}
});

test("ingest names the failure instead of returning nothing", async () => {
	await assert.rejects(
		() => ingest({ bytes: Buffer.from("x"), filename: "report.pdf", endpoint: "http://127.0.0.1:1" }),
		/not reachable/,
	);
	await assert.rejects(() => ingest({ bytes: Buffer.from("x"), filename: "notes.docx" }), /PDFs and images/);

	const stub = await startIngestionStub([], { status: 400 });
	try {
		await assert.rejects(
			() => ingest({ bytes: Buffer.from("not a pdf"), filename: "report.pdf", endpoint: stub.endpoint }),
			/returned 400/,
		);
	} finally {
		await stub.stop();
	}
});

test("the findings tool reads the shipped fixture through the live service when it is up", async () => {
	const stub = await startIngestionStub(ONE_FINDING);
	clearDocument();
	try {
		const tool = createReportFindingsTool({ endpoint: stub.endpoint });
		const value = await tool.execute({});
		assert.equal(value.source, "live");
		assert.equal(value.report, "sample-inspection-report.pdf");
		assert.deepEqual(value.findings, ONE_FINDING);
		// The real fixture PDF was posted, so the demo's own path is the real one.
		assert.ok(stub.seen.bytes > 1000, "the fixture PDF should have been sent, not a placeholder");
		assert.match(tool.output.render({}, value)[0].text, /Read 1 OCR findings.*in \d/);
	} finally {
		await stub.stop();
	}
});

test("with the service down the tool falls back to the capture and SAYS so", async () => {
	clearDocument();
	const tool = createReportFindingsTool({ endpoint: "http://127.0.0.1:1" });
	const value = await tool.execute({});
	// The capture is a real capture of this same file, so the answer is right —
	// but a demo that implies an OCR pass it did not run is the thing ADR-0001
	// exists to prevent, so the disclosure is asserted, not just the data.
	assert.equal(value.source, "capture");
	assert.equal(value.findings.length, 156);
	assert.match(value.detail, /committed 28 Aug 2026 capture/);
	assert.match(tool.output.render({}, value)[0].text, /not a live OCR pass/);
});

test("an uploaded document is read live, not answered from the fixture", async () => {
	const uploaded = [{ text: "TK-4102 shell plate", bbox: { left: 1, top: 2, width: 3, height: 4 }, confidence: 98.1, page: 1 }];
	const stub = await startIngestionStub(uploaded);
	try {
		attachDocument("judges-own-report.pdf", Buffer.from("%PDF-1.7 uploaded"));
		const tool = createReportFindingsTool({ endpoint: stub.endpoint });
		const value = await tool.execute({});
		assert.equal(value.report, "judges-own-report.pdf");
		assert.deepEqual(value.findings, uploaded);
		assert.equal(value.source, "live");
		// Every finding must carry a page, whichever endpoint answered. The image
		// route omitted it until 30 August 2026, which broke provenance for an
		// uploaded photograph — the crop has no page to render and the approval
		// note has no page to cite. Asserted at the boundary so a regression in the
		// Python contract is caught here.
		assert.ok(
			value.findings.every((finding) => Number.isInteger(finding.page) && finding.page >= 1),
			"every finding needs a page to cite, or provenance cannot show a crop",
		);
	} finally {
		clearDocument();
		await stub.stop();
	}
});

test("an uploaded document with no service to read it FAILS rather than describing the fixture", async () => {
	// The one case where falling back would be a lie rather than a degradation:
	// the capture describes a different document entirely, so answering from it
	// would be answering about the wrong file. Refusing is the honest outcome.
	try {
		attachDocument("judges-own-report.pdf", Buffer.from("%PDF-1.7 uploaded"));
		const tool = createReportFindingsTool({ endpoint: "http://127.0.0.1:1" });
		await assert.rejects(() => tool.execute({}), (error) => {
			assert.match(error.message, /"judges-own-report\.pdf" was attached but could not be read/);
			assert.match(error.message, /npm run ingestion/);
			return true;
		});
	} finally {
		clearDocument();
	}
});
