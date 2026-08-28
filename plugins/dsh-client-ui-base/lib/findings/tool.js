/**
 * The report-findings tool (Story 5.1).
 *
 * `sample-report-findings.json` is not fabricated: it is the literal response
 * the real ingestion service (`services/ingestion/server.py`, Epic 4) returned
 * on 28 Aug 2026 for a genuine `POST /v1/ingest/pdf` against the actual fixture
 * at `services/ingestion/fixtures/sample-inspection-report.pdf` — 156 OCR
 * lines, each with its real bounding box, confidence and page. This mirrors
 * `model-plane/replay-provider.js`'s own "captured, not authored" design for
 * Phase 0 (CONTEXT.md "Replay"): the ingestion service is a separate Python
 * process Epic 6 has not yet wired into one startup command, so calling it
 * live from inside a tool would make every demo run depend on that process
 * already being up. Reading the capture is what "an ingested inspection
 * report" (this story's Given) means until that wiring lands — a data swap
 * away from a live `fetch('http://127.0.0.1:8642/v1/ingest/pdf')`, not a
 * rewrite of this file.
 *
 * The tool call itself is real: a genuine file read and JSON parse dispatched
 * through the ordinary tool registry, logged like any other call. Only the
 * model's synthesis of these lines into key findings is replayed text
 * (ADR-0001) — the same split canary.js documents for the egress seal.
 *
 * Written structurally against the harness's `ToolDefinition` shape, like
 * `../egress/canary.js`, rather than through `defineTool` — this package
 * resolves nothing from the harness's own installed packages (see
 * `../model-plane/llm-adapter.js` for why).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPORT_FINDINGS_TOOL_NAME = "bf_report_findings";

const FIXTURE_PATH = join(dirname(fileURLToPath(import.meta.url)), "sample-report-findings.json");
const REPORT_NAME = "sample-inspection-report.pdf";

/**
 * Build the report-findings tool definition.
 * @param {string} [fixturePath] - override for tests; defaults to the shipped capture.
 * @returns a harness `ToolDefinition`.
 */
export function createReportFindingsTool(fixturePath = FIXTURE_PATH) {
	return {
		name: REPORT_FINDINGS_TOOL_NAME,
		description:
			"Read the line-level OCR findings already extracted from the ingested inspection report " +
			`(${REPORT_NAME}, Epic 4). Each finding carries the page, the exact source text, its bounding ` +
			"box in source-image pixels, and OCR confidence. Call this before answering any question about " +
			"the report's content, and cite the page and bounding box of each line a claim is drawn from.",
		parameters: {
			type: "object",
			properties: {},
			additionalProperties: false,
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					report: { type: "string" },
					findings: { type: "array" },
				},
				required: ["report", "findings"],
			},
			render: (_args, value) => [
				{
					type: "text",
					text: `Read ${value.findings.length} OCR findings from ${value.report}.`,
				},
			],
		},
		/** Real fs I/O, dispatched every call — no in-memory cache to go stale. */
		async execute() {
			const findings = JSON.parse(readFileSync(fixturePath, "utf8"));
			return { report: REPORT_NAME, findings };
		},
	};
}
