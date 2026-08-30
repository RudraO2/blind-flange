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
import { attachDocument, clearDocument, rememberFindings } from "../lib/findings/attached.js";
import {
	ACCEPTED_UPLOAD_EXTENSIONS,
	ingest,
	ingestionHealth,
	ingestionTargetFor,
	renderPage,
} from "../lib/findings/ingestion-client.js";
import { createProvenanceHandler, PROVENANCE_ROUTE_PREFIX, pngSize } from "../lib/findings/provenance.js";
import { createReportFindingsTool } from "../lib/findings/tool.js";

/** Minimal ServerResponse stand-in, matching the shape provenance.test.js uses. */
function stubResponse() {
	return {
		statusCode: 0,
		headers: {},
		body: undefined,
		writeHead(status, headers = {}) {
			this.statusCode = status;
			for (const [key, value] of Object.entries(headers)) this.headers[key.toLowerCase()] = value;
			return this;
		},
		end(body) {
			this.body = body;
		},
	};
}

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

// ---------------------------------------------------------------------------
// Rendering a page for the provenance crop
// ---------------------------------------------------------------------------

/** The smallest valid PNG header the size reader will accept, plus a byte of payload. */
function fakePng(width, height) {
	const buffer = Buffer.alloc(25);
	Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
	buffer.write("IHDR", 12, "latin1");
	buffer.writeUInt32BE(width, 16);
	buffer.writeUInt32BE(height, 20);
	return buffer;
}

/** A stub that answers page renders and records what was asked for. */
async function startRenderStub({ width = 2480, height = 3508, dpi = 300, status = 200 } = {}) {
	const seen = {};
	const stub = await startStub((req, res) => {
		req.on("data", () => {});
		req.on("end", () => {
			seen.url = req.url;
			seen.contentType = req.headers["content-type"];
			if (status !== 200) {
				res.writeHead(status, { "content-type": "application/json" });
				res.end(JSON.stringify({ error: "page 9 is outside a 2-page document" }));
				return;
			}
			const png = fakePng(width, height);
			res.writeHead(200, { "content-type": "image/png", "x-render-dpi": String(dpi) });
			res.end(png);
		});
	});
	return { ...stub, seen };
}

test("renderPage asks for the page by number and reports the resolution it was rendered at", async () => {
	const stub = await startRenderStub({ dpi: 300 });
	try {
		const result = await renderPage({
			bytes: Buffer.from("%PDF-1.7 fake"),
			filename: "report.pdf",
			page: 2,
			endpoint: stub.endpoint,
		});
		assert.equal(stub.seen.url, "/v1/render/page?page=2");
		assert.equal(stub.seen.contentType, "application/pdf");
		// Worth returning rather than assuming: a page rendered at a different
		// resolution than the bounding boxes were measured at gives a crop that is
		// offset and still looks like a crop.
		assert.equal(result.renderDpi, 300);
		assert.equal(pngSize(Buffer.from(result.png)).height, 3508);
	} finally {
		await stub.stop();
	}
});

test("renderPage names its failures — an out-of-range page and an unreachable service", async () => {
	const stub = await startRenderStub({ status: 404 });
	try {
		await assert.rejects(
			() => renderPage({ bytes: Buffer.from("x"), filename: "report.pdf", page: 9, endpoint: stub.endpoint }),
			/returned 404 rendering page 9/,
		);
	} finally {
		await stub.stop();
	}
	await assert.rejects(
		() => renderPage({ bytes: Buffer.from("x"), filename: "report.pdf", page: 1, endpoint: "http://127.0.0.1:1" }),
		/not reachable.*to render page 1/s,
	);
});

test("provenance serves an uploaded document's pages, rendered on demand and then cached", async () => {
	const stub = await startRenderStub({ width: 1700, height: 2400 });
	let renders = 0;
	const counting = async (url, init) => {
		if (String(url).includes("/v1/render/page")) renders += 1;
		return globalThis.fetch(url, init);
	};
	try {
		attachDocument("judges-own-report.pdf", Buffer.from("%PDF-1.7 uploaded"));
		// The findings the panel cites come from whatever read the document, not
		// from a second OCR pass — so the two can never describe it differently.
		rememberFindings([
			{ text: "TK-4102 shell plate", bbox: { left: 10, top: 20, width: 300, height: 40 }, confidence: 98.1, page: 1 },
		]);
		const handler = createProvenanceHandler({ endpoint: stub.endpoint, fetchImpl: counting });

		const manifest = stubResponse();
		await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/findings` }, manifest);
		assert.equal(manifest.statusCode, 200);
		const payload = JSON.parse(String(manifest.body));
		assert.equal(payload.report, "judges-own-report.pdf");
		assert.equal(payload.source, "upload");
		assert.deepEqual(payload.pages, [{ page: 1, available: true, width: 1700, height: 2400, renderDpi: 300 }]);
		assert.equal(renders, 1);

		// The viewer asks for the same page once per finding clicked, so the render
		// is cached rather than repeated.
		const image = stubResponse();
		await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/pages/1` }, image);
		assert.equal(image.statusCode, 200);
		assert.equal(image.headers["content-type"], "image/png");
		assert.equal(renders, 1, "the second request should have been served from the cache");
	} finally {
		clearDocument();
		await stub.stop();
	}
});

test("an unrenderable page is a visible gap in the manifest, not a finding that clicks to nothing", async () => {
	try {
		attachDocument("judges-own-report.pdf", Buffer.from("%PDF-1.7 uploaded"));
		rememberFindings([{ text: "x", bbox: { left: 0, top: 0, width: 1, height: 1 }, confidence: 90, page: 1 }]);
		const handler = createProvenanceHandler({ endpoint: "http://127.0.0.1:1" });

		const manifest = stubResponse();
		await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/findings` }, manifest);
		const payload = JSON.parse(String(manifest.body));
		assert.equal(payload.pages[0].available, false);
		assert.match(payload.pages[0].reason, /not reachable/);
		// Reported rather than omitted: the panel can then say this finding's page
		// cannot be shown. Dropping the page would leave a finding that clicks to
		// nothing with no explanation.
		assert.equal(payload.findings.length, 1);

		// And a direct page request is a 502, not a 404 — the page exists, we could
		// not produce it, and that distinction matters to whoever debugs a blank crop.
		const image = stubResponse();
		await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/pages/1` }, image);
		assert.equal(image.statusCode, 502);
	} finally {
		clearDocument();
	}
});
