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
import { currentDocument, rememberFindings } from "./attached.js";
import { DEFAULT_INGESTION_ENDPOINT, ingest } from "./ingestion-client.js";

export const REPORT_FINDINGS_TOOL_NAME = "bf_report_findings";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(HERE, "sample-report-findings.json");
/** The fixture PDF itself, so the shipped demo path can go through the live service too. */
const FIXTURE_PDF_PATH = join(HERE, "..", "..", "..", "..", "services", "ingestion", "fixtures", "sample-inspection-report.pdf");
const REPORT_NAME = "sample-inspection-report.pdf";

/**
 * Build the report-findings tool definition.
 * @param {string | { fixturePath?: string, endpoint?: string, fetchImpl?: typeof globalThis.fetch }} [options]
 *   A path keeps the original single-argument call working; an object is for tests
 *   that need to point the client at a stub service.
 * @returns a harness `ToolDefinition`.
 */
export function createReportFindingsTool(options = {}) {
	const { fixturePath = FIXTURE_PATH, endpoint = DEFAULT_INGESTION_ENDPOINT, fetchImpl = globalThis.fetch } =
		typeof options === "string" ? { fixturePath: options } : options;
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
					// Disclosed on the tool's own output rather than tucked into a log:
					// whether these lines came from an OCR pass just now or from the
					// committed capture is exactly the kind of thing a demo must not
					// blur.
					source: { type: "string" },
					detail: { type: "string" },
					seconds: { type: "number" },
				},
				required: ["report", "findings", "source"],
			},
			render: (_args, value) => [
				{
					type: "text",
					text:
						value.source === "live"
							? `Read ${value.findings.length} OCR findings from ${value.report} in ${value.seconds?.toFixed(1) ?? "?"}s.`
							: `Read ${value.findings.length} OCR findings from ${value.report} — from the committed capture, not a live OCR pass.`,
				},
			],
		},
		/**
		 * Reads whatever document is currently attached, live, and falls back to
		 * the shipped capture when the service is not running.
		 *
		 * The fallback is **disclosed, never silent**: the returned `source` says
		 * which path answered and `detail` says why, so the trace can state it
		 * rather than implying an OCR pass that never happened. That is the same
		 * discipline ADR-0001 applies to replayed inference.
		 *
		 * When no document has been attached there is nothing to read live, and
		 * the capture is the correct answer rather than a degraded one — it *is*
		 * the ingested report for the shipped fixture.
		 */
		async execute() {
			const attached = currentDocument();
			if (attached !== null) {
				try {
					const result = await ingest({ bytes: attached.bytes, filename: attached.filename, endpoint, fetchImpl });
					// Remembered so the provenance panel cites these exact lines rather
					// than running its own OCR pass and possibly describing the same
					// document slightly differently.
					rememberFindings(result.findings);
					return {
						report: attached.filename,
						findings: result.findings,
						source: "live",
						seconds: result.seconds,
					};
				} catch (error) {
					// A judge's own document with no service to read it is the one
					// case where falling back is a lie: the capture describes a
					// different file. Say so instead of answering about the wrong
					// document.
					throw new Error(
						`"${attached.filename}" was attached but could not be read: ${error instanceof Error ? error.message : String(error)}`,
					);
				}
			}

			// No upload: the shipped fixture. Try the live service first so the
			// demo's own path is the real one, and fall back to the capture of
			// that same file if the service is down.
			try {
				const bytes = readFileSync(FIXTURE_PDF_PATH);
				const result = await ingest({ bytes, filename: REPORT_NAME, endpoint, fetchImpl });
				return { report: REPORT_NAME, findings: result.findings, source: "live", seconds: result.seconds };
			} catch (error) {
				const findings = JSON.parse(readFileSync(fixturePath, "utf8"));
				return {
					report: REPORT_NAME,
					findings,
					source: "capture",
					detail: `read from the committed 28 Aug 2026 capture of this same file, because ${
						error instanceof Error ? error.message : String(error)
					}`,
				};
			}
		},
	};
}

// Re-exported so callers that already reach for these through the tool keep
// working; the state itself lives in `attached.js`, because the provenance route
// needs the same answer and the two must never disagree about which document is
// being described.
export { attachDocument, clearDocument, currentDocument } from "./attached.js";
