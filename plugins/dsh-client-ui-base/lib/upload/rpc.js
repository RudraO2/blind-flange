/**
 * The upload channel: how a document a human picked in the browser reaches the
 * host that has to OCR it.
 *
 * Story 8.2 found that the harness already ships an `@` mention picker, and
 * concluded — correctly, at the time — that nothing needed installing. Attaching
 * by naming a path that was already on disk is a real feature. It is just not the
 * same thing as a judge watching a file *arrive*, which is the thirty seconds
 * this product has to earn, so this adds the arrival without replacing the
 * mention.
 *
 * Shaped exactly like the canary's channel (`egress/canary.js`): one loopback RPC
 * channel, one endpoint, `authority: "loopback"` so it is reachable from a
 * browser on this machine and not from anything that can merely reach the port.
 * Following that pattern rather than inventing a second one is deliberate —
 * there is now one way a composer control talks to the host, and a reader who
 * has understood the canary has understood this too.
 *
 * **Uploading ingests immediately.** Two reasons. It removes a step from a demo
 * timed to three minutes, and the OCR pass is several seconds of visible CPU work
 * that gives llama-swap cover to load the vision model behind it. The swap
 * latency is paid inside work the user can already see progressing.
 */

import { attachDocument, clearDocument, rememberFindings } from "../findings/attached.js";
import { ACCEPTED_UPLOAD_EXTENSIONS, DEFAULT_INGESTION_ENDPOINT, ingest, ingestionTargetFor } from "../findings/ingestion-client.js";

/** The channel the composer's upload control posts to. */
export const UPLOAD_CHANNEL = "/bf-upload";

/** Endpoints it answers. `clear` exists so a session can be put back to the shipped fixture. */
export const UPLOAD_ENDPOINT = "attach";
export const UPLOAD_CLEAR_ENDPOINT = "clear";

/**
 * The ceiling on an uploaded document, matching the ingestion service's own
 * 25 MB body cap. Checked here as well as there so a 40 MB file is refused before
 * it is base64-encoded and pushed across the RPC boundary, rather than after.
 */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Base64 costs about a third in size; refuse before decoding something absurd. */
const MAX_BASE64_LENGTH = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 1024;

/**
 * A filename with the path stripped and separators removed.
 *
 * The browser sends `File.name`, which has no path in it — but this value ends up
 * in a tool result, in the provenance manifest and in the deliverable's own
 * audit trail, so it is sanitised at the boundary rather than trusted because of
 * where it came from. Nothing here opens a file by this name; that is why this is
 * cheap rather than load-bearing, and it stays anyway.
 * @param {unknown} value
 */
export function safeFilename(value) {
	const raw = typeof value === "string" ? value : "";
	const base = raw.split(/[\\/]/).pop() ?? "";
	const cleaned = base.replace(/[\u0000-\u001f]/g, "").trim();
	return cleaned === "" ? "uploaded-document" : cleaned.slice(0, 200);
}

/** An RPC error in the shape the transport expects. */
function failure(code, message, details = {}) {
	return { ok: false, error: { code, message, details } };
}

/**
 * Build the handler for {@link UPLOAD_CHANNEL}.
 *
 * Returns the ingestion outcome rather than just an acknowledgement, so the
 * button can say "156 findings in 7.4s" instead of "uploaded" — a count the user
 * can sanity-check is worth more than a tick.
 * @param {object} [options]
 * @param {string} [options.endpoint] - the ingestion service.
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 * @returns a `ConnectionRpcHandler`.
 */
export function createUploadRpcHandler({ endpoint = DEFAULT_INGESTION_ENDPOINT, fetchImpl = globalThis.fetch } = {}) {
	return async function handleUpload(rpcEndpoint, payload) {
		if (rpcEndpoint === UPLOAD_CLEAR_ENDPOINT) {
			clearDocument();
			return { ok: true, value: { cleared: true } };
		}
		if (rpcEndpoint !== UPLOAD_ENDPOINT) {
			return failure("unknown-command", `unknown upload endpoint "${rpcEndpoint}"`);
		}

		const filename = safeFilename(payload?.filename);
		if (ingestionTargetFor(filename) === null) {
			return failure(
				"unsupported-type",
				`Faraday reads scanned PDFs and images. "${filename}" is neither ` +
					`(accepted: ${ACCEPTED_UPLOAD_EXTENSIONS.join(", ")}).`,
			);
		}

		const base64 = typeof payload?.base64 === "string" ? payload.base64 : "";
		if (base64 === "") return failure("empty", `"${filename}" arrived with no content.`);
		if (base64.length > MAX_BASE64_LENGTH) {
			return failure("too-large", `"${filename}" is larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`);
		}

		let bytes;
		try {
			bytes = Buffer.from(base64, "base64");
		} catch (error) {
			return failure("undecodable", `"${filename}" could not be decoded: ${error instanceof Error ? error.message : String(error)}`);
		}
		if (bytes.length === 0) return failure("empty", `"${filename}" decoded to nothing.`);
		if (bytes.length > MAX_UPLOAD_BYTES) {
			return failure("too-large", `"${filename}" is larger than the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit.`);
		}

		attachDocument(filename, bytes);

		// Ingest now rather than on the next question: it removes a step from a
		// timed demo, and the OCR pass is the window llama-swap needs to load the
		// vision model.
		try {
			const result = await ingest({ bytes, filename, endpoint, fetchImpl });
			rememberFindings(result.findings);
			return {
				ok: true,
				value: {
					filename,
					bytes: bytes.length,
					findings: result.findings.length,
					pages: [...new Set(result.findings.map((finding) => finding.page))].length,
					seconds: result.seconds,
				},
			};
		} catch (error) {
			// The document stays attached deliberately. It is what the user chose,
			// and the findings tool will refuse to answer about it from the fixture's
			// capture — which is the honest outcome. Clearing it here would silently
			// put the demo back on the shipped report without saying so.
			return failure("ingestion-failed", error instanceof Error ? error.message : String(error), { filename });
		}
	};
}
