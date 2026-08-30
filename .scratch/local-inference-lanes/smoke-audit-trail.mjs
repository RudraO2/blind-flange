/**
 * Smoke test: produce a real approval note through the real tool, with a real
 * routing decision and a real live OCR read behind it, then read the audit trail
 * back out of the file.
 *
 * The point is not that a heading appears. It is that the block inside the
 * document says the same thing the screen said — the same task type, the same
 * scores, the same model, and an honest statement of whether the OCR ran live.
 * A file that claims more than the session did is the failure this exists to
 * prevent.
 *
 *   node .scratch/local-inference-lanes/smoke-audit-trail.mjs
 *
 * Requires llama-swap and `npm run ingestion`.
 */

import { rmSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { createApprovalNoteTool } from "../../plugins/dsh-client-ui-base/lib/deliverables/tool.js";
import { clearDocument } from "../../plugins/dsh-client-ui-base/lib/findings/attached.js";
import { createReportFindingsTool } from "../../plugins/dsh-client-ui-base/lib/findings/tool.js";
import { loadFleet } from "../../plugins/dsh-client-ui-base/lib/registry/loader.js";
import { classifyRequest } from "../../plugins/dsh-client-ui-base/lib/router/classify.js";
import { recordRoutingDecision } from "../../plugins/dsh-client-ui-base/lib/router/dispatch.js";
import { scoreFleet } from "../../plugins/dsh-client-ui-base/lib/router/score.js";
import { clearTurn, recordTool } from "../../plugins/dsh-client-ui-base/lib/trace/turn.js";

function unzipToText(zip) {
	const parts = {};
	let offset = 0;
	while (offset + 30 <= zip.length && zip.readUInt32LE(offset) === 0x04034b50) {
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

clearTurn();
clearDocument();

// Exactly what classifyAndRoute does on agent/pre-step, step 1.
const prompt = "Summarise the key findings in the ingested inspection report and draft an approval note.";
const classification = classifyRequest(prompt);
const routing = scoreFleet(classification.taskType, loadFleet().loaded);
recordRoutingDecision(routing, 1);
console.log(`routed as ${classification.taskType} -> ${routing.selected}`);

// A real OCR read, which is what the trail should describe.
const started = Date.now();
const findings = await createReportFindingsTool().execute({});
recordTool("bf_report_findings", { outcome: `${findings.findings.length} OCR lines`, seconds: (Date.now() - started) / 1000 });
console.log(`ingested ${findings.findings.length} lines from ${findings.report} (${findings.source})`);

// Two findings cited with the provenance the capture actually carries.
const cite = (needle) => {
	const finding = findings.findings.find((f) => f.text.startsWith(needle));
	return { text: finding.text, page: finding.page, region: finding.bbox };
};

const tool = createApprovalNoteTool({ providerName: "local" });
const result = await tool.execute(
	{
		title: "Approval Note",
		referenceNumber: "NRC-APPR-SMOKE",
		sourceReport: findings.report,
		clauses: [cite("Insulation cladding open"), cite("Test tag expired")],
	},
	{},
);

console.log(`\nwrote ${result.path}`);
console.log(`SHA-256 ${result.contentHash}, ${result.clauseCount} clauses`);

const { readFileSync } = await import("node:fs");
const body = unzipToText(readFileSync(result.path))["word/document.xml"];

// Pull the printed text back out, so what is checked is what a reader sees.
// Unescaped for display. The entities in the XML are correct and required — this
// is only so the console shows what Word shows, rather than making correct
// escaping look like a defect.
const unescape = (value) =>
	value
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&amp;", "&");
const text = [...body.matchAll(/<w:t xml:space="preserve">([^<]*)<\/w:t>/g)].map((match) => unescape(match[1]));
const start = text.findIndex((line) => line === "How this note was produced");
console.log("\n=== the audit trail, read back out of the .docx ===");
if (start === -1) {
	console.log("  NOT PRESENT — that is a defect");
} else {
	for (const line of text.slice(start + 1)) console.log(`  ${line}`);
}

console.log("\n=== does it still open clean? ===");
try {
	const { execFileSync } = await import("node:child_process");
	// Word via COM, the same independent check Story 5.4 used: a repair prompt
	// would mean the new section broke the OOXML.
	const script = [
		"$w = New-Object -ComObject Word.Application",
		"$w.Visible = $false",
		"$w.DisplayAlerts = 0",
		`$d = $w.Documents.Open("${result.path}", $false, $true)`,
		"Write-Output ($d.Paragraphs.Count.ToString() + ' paragraphs')",
		"$d.Close($false)",
		"$w.Quit()",
	].join("; ");
	const out = execFileSync("pwsh", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 180_000 });
	console.log(`  Word opened it: ${out.trim()} — no repair prompt`);
} catch (error) {
	console.log(`  could not verify with Word: ${String(error.message).split("\n")[0].slice(0, 120)}`);
}

rmSync(result.path, { force: true });
clearTurn();
clearDocument();
