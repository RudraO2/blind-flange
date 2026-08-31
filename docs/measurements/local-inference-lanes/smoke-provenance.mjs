/**
 * Smoke test for provenance on an uploaded document.
 *
 * The committed page images belong to one file. For any other document the crop
 * has to be cut from a page nobody has rendered yet, and only the ingestion
 * service can render one — Node has no PDF renderer here.
 *
 * The property that matters is not "a PNG came back". It is that the page's pixel
 * space and the findings' bounding boxes agree, because a crop rendered at a
 * different resolution than the boxes were measured at is offset and STILL LOOKS
 * LIKE A CROP. So this checks every box fits inside the page it cites.
 *
 *   node .scratch/local-inference-lanes/smoke-provenance.mjs
 *
 * Requires the ingestion service: `npm run ingestion`.
 */

import { readFileSync } from "node:fs";
import { attachDocument, clearDocument } from "../../plugins/dsh-client-ui-base/lib/findings/attached.js";
import { ingestionHealth } from "../../plugins/dsh-client-ui-base/lib/findings/ingestion-client.js";
import { createProvenanceHandler, PROVENANCE_ROUTE_PREFIX, pngSize } from "../../plugins/dsh-client-ui-base/lib/findings/provenance.js";
import { createReportFindingsTool } from "../../plugins/dsh-client-ui-base/lib/findings/tool.js";

const health = await ingestionHealth();
console.log(`service: up=${health.up} warm=${health.warm} renderDpi=${health.renderDpi ?? "?"}`);
if (!health.up) {
	console.log("start it with `npm run ingestion` and run this again");
	process.exit(1);
}

/** Minimal ServerResponse stand-in. */
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

const handler = createProvenanceHandler();

async function report(label, filename, bytes) {
	console.log(`\n=== ${label} ===`);
	clearDocument();
	if (bytes !== null) attachDocument(filename, bytes);

	// The findings tool is what remembers the OCR result for the panel to cite.
	if (bytes !== null) {
		const value = await createReportFindingsTool().execute({});
		console.log(`  ingested: ${value.findings.length} findings from ${value.report} (${value.source})`);
	}

	const manifest = stubResponse();
	await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/findings` }, manifest);
	if (manifest.statusCode !== 200) {
		console.log(`  manifest FAILED ${manifest.statusCode}: ${manifest.body}`);
		return;
	}
	const payload = JSON.parse(String(manifest.body));
	console.log(`  report  : ${payload.report}${payload.source ? ` (${payload.source})` : " (shipped fixture)"}`);
	for (const page of payload.pages) {
		console.log(
			page.available
				? `  page ${page.page} : ${page.width}x${page.height} px${page.renderDpi ? ` at ${page.renderDpi} dpi` : ""}`
				: `  page ${page.page} : UNAVAILABLE — ${page.reason ?? "no reason given"}`,
		);
	}

	// The check that matters: every bbox must fit inside the page it cites.
	const sizes = new Map(payload.pages.filter((p) => p.available).map((p) => [p.page, p]));
	let outside = 0;
	for (const finding of payload.findings) {
		const size = sizes.get(finding.page);
		if (size === undefined) continue;
		const b = finding.bbox;
		if (b.left < 0 || b.top < 0 || b.left + b.width > size.width || b.top + b.height > size.height) outside += 1;
	}
	console.log(`  boxes outside their page: ${outside} of ${payload.findings.length}`);
	if (outside > 0) console.log("    >>> the crop coordinate space and the page render DISAGREE");

	// And the page bytes actually serve.
	const first = payload.pages.find((p) => p.available);
	if (first !== undefined) {
		const image = stubResponse();
		await handler({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/pages/${first.page}` }, image);
		const size = pngSize(Buffer.from(image.body ?? []));
		console.log(`  GET page ${first.page}: ${image.statusCode} ${image.headers["content-type"]} ${size?.width}x${size?.height}`);
	}
}

await report("no upload — the shipped fixture and its committed page images", null, null);
await report(
	"an uploaded PDF, pages rendered on demand",
	"judges-own-report.pdf",
	readFileSync("services/ingestion/fixtures/sample-inspection-report.pdf"),
);
await report(
	"an uploaded page image",
	"a-photograph.png",
	readFileSync("services/ingestion/fixtures/sample-inspection-report-p2.png"),
);

console.log("\n=== an uploaded document with the service unreachable ===");
clearDocument();
attachDocument("judges-own-report.pdf", readFileSync("services/ingestion/fixtures/sample-inspection-report.pdf"));
const offline = createProvenanceHandler({ endpoint: "http://127.0.0.1:1" });
const res = stubResponse();
await offline({ method: "GET", url: `${PROVENANCE_ROUTE_PREFIX}/pages/1` }, res);
console.log(`  GET page 1: ${res.statusCode} — ${String(res.body).slice(0, 120)}`);
console.log("  502 rather than 404 on purpose: the page exists, we could not produce it.");
clearDocument();
