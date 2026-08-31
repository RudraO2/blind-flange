/**
 * Smoke test for live ingestion: the harness's own findings tool calling the real
 * Python service, for the shipped fixture and for an "uploaded" document.
 *
 * Before 30 August 2026 this tool read a captured JSON response. The service had
 * been built, proved and never called. That was defensible while the demo only
 * ever answered about one file; it stops being defensible the moment a judge can
 * hand the workbench a document of their own.
 *
 *   node .scratch/local-inference-lanes/smoke-ingestion.mjs
 *
 * Requires the ingestion service: `npm run ingestion`.
 */

import { readFileSync } from "node:fs";
import { attachDocument, clearDocument, createReportFindingsTool } from "../../plugins/dsh-client-ui-base/lib/findings/tool.js";
import { ingestionHealth } from "../../plugins/dsh-client-ui-base/lib/findings/ingestion-client.js";

const health = await ingestionHealth();
console.log(`service: up=${health.up} warm=${health.warm} renderDpi=${health.renderDpi ?? "?"}`);
if (!health.up) {
	console.log("start it with `npm run ingestion` and run this again");
	process.exit(1);
}

const tool = createReportFindingsTool();

console.log("\n=== the shipped fixture, through the live service ===");
clearDocument();
let started = Date.now();
let value = await tool.execute({});
console.log(`  source   : ${value.source}${value.detail ? ` (${value.detail})` : ""}`);
console.log(`  report   : ${value.report}`);
console.log(`  findings : ${value.findings.length}`);
console.log(`  service  : ${value.seconds?.toFixed(2)}s   round trip: ${((Date.now() - started) / 1000).toFixed(2)}s`);
console.log(`  rendered : ${tool.output.render({}, value)[0].text}`);

const tags = value.findings.filter((f) => /PSV-2207A|E-1104A|NCR-/.test(f.text));
console.log(`  the strings that matter: ${tags.length} lines`);
for (const finding of tags.slice(0, 3)) {
	const b = finding.bbox;
	console.log(`    p${finding.page} ${b.left},${b.top} ${b.width}x${b.height}  ${finding.confidence}%  ${finding.text.slice(0, 62)}`);
}

// A different document, to prove the answer follows the file rather than the fixture.
console.log("\n=== a page image standing in for an upload ===");
const page = readFileSync("services/ingestion/fixtures/sample-inspection-report-p2.png");
attachDocument("page-two-only.png", page);
started = Date.now();
try {
	value = await tool.execute({});
	console.log(`  source   : ${value.source}`);
	console.log(`  report   : ${value.report}`);
	console.log(`  findings : ${value.findings.length}   in ${value.seconds?.toFixed(2)}s`);
	// Page 2 alone must not carry page-1 content, which is how we know the answer
	// followed the uploaded file rather than the fixture's capture.
	const pages = [...new Set(value.findings.map((f) => f.page))];
	console.log(`  pages    : ${pages.join(", ")} (an image is always page 1 — a 2-page answer here would mean the fixture leaked)`);
	console.log(`  first    : ${value.findings[0]?.text.slice(0, 70)}`);
} finally {
	clearDocument();
}

console.log("\n=== with an unreadable file type, refused before anything is uploaded ===");
attachDocument("approval-note.docx", Buffer.from("PK\u0003\u0004"));
try {
	await tool.execute({});
	console.log("  NOT REFUSED — that is a defect");
} catch (error) {
	console.log(`  refused  : ${error.message.slice(0, 150)}`);
} finally {
	clearDocument();
}
