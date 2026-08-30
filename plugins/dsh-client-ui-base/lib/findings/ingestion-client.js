/**
 * The client for the ingestion service (`services/ingestion/server.py`).
 *
 * The service was built in Epic 4, proved on a real fixture at 0.997 confidence,
 * and then never called from the harness: `findings/tool.js` read a *captured*
 * response instead, because the service is a separate Python process and making
 * every demo depend on it being up was the wrong trade for Phase 0. The header
 * of that file promised the swap would be "a data change, not a rewrite of this
 * file". This is that swap.
 *
 * **Why it matters now.** The upload control lets a judge hand the workbench a
 * document it has never seen. A captured response is the right answer for
 * exactly one file, so the moment upload is real the capture stops being a
 * stand-in and becomes a wrong answer. Live ingestion is what makes upload mean
 * anything.
 *
 * The capture stays as the fallback, though, and not out of sentiment: it is the
 * difference between a demo that degrades to the shipped fixture and a demo that
 * shows an error because a Python process was not started. `ingest()` reports
 * which path answered so the trace can say so out loud rather than implying live
 * inference that did not happen — the same disclosure discipline ADR-0001
 * applies to the model plane.
 *
 * Loopback only. Same shape as `model-plane/local-provider.js` talking to
 * llama-swap, and for the same reason: this package resolves no bare specifiers
 * (see `model-plane/llm-adapter.js`), so an HTTP call needs no dependency where
 * an in-process binding would need one. The egress seal governs *tool* calls and
 * is unaffected — the counted zero stays zero.
 */

/** Where the ingestion service listens. `INGESTION_PORT` is honoured by the service, so honour it here too. */
export const DEFAULT_INGESTION_ENDPOINT = `http://127.0.0.1:${process.env.INGESTION_PORT ?? 8642}`;

/** Content types the service accepts, by file extension. It rejects anything else with a 400. */
const CONTENT_TYPES = {
	pdf: "application/pdf",
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	tif: "image/tiff",
	tiff: "image/tiff",
	bmp: "image/bmp",
	webp: "image/webp",
};

/**
 * The service route and content type for a filename, or `null` when the
 * extension is not something the OCR path can read.
 * @param {string} filename
 */
export function ingestionTargetFor(filename) {
	const extension = String(filename).toLowerCase().split(".").pop() ?? "";
	const contentType = CONTENT_TYPES[extension];
	if (contentType === undefined) return null;
	return { contentType, path: contentType === "application/pdf" ? "/v1/ingest/pdf" : "/v1/ingest/image" };
}

/** Every extension the upload control should offer, as an `accept` attribute value. */
export const ACCEPTED_UPLOAD_EXTENSIONS = Object.keys(CONTENT_TYPES).map((extension) => `.${extension}`);

/**
 * @typedef {object} IngestionResult
 * @property {Array<{ text: string, bbox: object, confidence: number, page: number }>} findings
 * @property {"live" | "capture"} source - which path answered. Shown, never hidden.
 * @property {string} [detail] - why the live path was not used, when it was not.
 * @property {number} [seconds] - wall clock for a live read, for the trace and the eval table.
 */

/**
 * Is the service up, and has its OCR engine already run a page?
 *
 * `warm` matters because the engine specialises per input shape: before it is
 * warm the first request pays several seconds that look, to someone watching, a
 * lot like a hang. The service warms itself at startup, so this should be true
 * almost always — it is here so the UI can say "still starting" rather than
 * leaving a judge's upload apparently stuck.
 * @param {object} [options]
 * @param {string} [options.endpoint]
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 */
export async function ingestionHealth({ endpoint = DEFAULT_INGESTION_ENDPOINT, fetchImpl = globalThis.fetch } = {}) {
	try {
		const response = await fetchImpl(`${endpoint}/health`, { method: "GET" });
		if (!response.ok) return { up: false, warm: false, detail: `health returned ${response.status}` };
		const payload = await response.json();
		return { up: payload?.status === "ok", warm: payload?.warm === true, renderDpi: payload?.renderDpi };
	} catch (error) {
		return { up: false, warm: false, detail: error instanceof Error ? error.message : String(error) };
	}
}

/**
 * Read a document through the live service.
 *
 * Throws rather than falling back, so a caller that wants the fallback opts into
 * it explicitly. Silent degradation is how a demo ends up claiming live
 * ingestion it never did.
 * @param {object} request
 * @param {Uint8Array | Buffer} request.bytes
 * @param {string} request.filename - only its extension is used, to choose the route.
 * @param {string} [request.endpoint]
 * @param {typeof globalThis.fetch} [request.fetchImpl]
 * @returns {Promise<IngestionResult>}
 */
export async function ingest({ bytes, filename, endpoint = DEFAULT_INGESTION_ENDPOINT, fetchImpl = globalThis.fetch }) {
	const target = ingestionTargetFor(filename);
	if (target === null) {
		throw new Error(
			`the ingestion service reads PDFs and images; "${filename}" is neither ` +
				`(accepted: ${ACCEPTED_UPLOAD_EXTENSIONS.join(", ")})`,
		);
	}

	const started = Date.now();
	let response;
	try {
		response = await fetchImpl(`${endpoint}${target.path}`, {
			method: "POST",
			headers: { "content-type": target.contentType },
			body: bytes,
		});
	} catch (error) {
		throw new Error(
			`the ingestion service is not reachable at ${endpoint} — start it with \`npm run ingestion\` ` +
				`(${error instanceof Error ? error.message : String(error)})`,
		);
	}

	if (!response.ok) {
		let detail = "";
		try {
			detail = JSON.stringify(await response.json());
		} catch {
			detail = `(no readable body)`;
		}
		throw new Error(`the ingestion service returned ${response.status} for "${filename}": ${detail.slice(0, 300)}`);
	}

	const payload = await response.json();
	if (!Array.isArray(payload?.findings)) {
		throw new Error(`the ingestion service returned no findings array for "${filename}"`);
	}
	return { findings: payload.findings, source: "live", seconds: (Date.now() - started) / 1000 };
}

/**
 * Render one page of a document to PNG, for the provenance crop.
 *
 * A crop is only evidence if it comes from the page the claim was read from. For
 * the shipped fixture there are committed page images; for a document a judge
 * uploaded, no such image exists until something renders it, and the only PDF
 * renderer in this project is `pypdfium2` inside the ingestion service.
 *
 * The service renders at the same resolution it OCRs at, so the returned pixels
 * and a finding's `bbox` share one coordinate space. It reports that resolution
 * back on `X-Render-Dpi`, which is worth checking rather than assuming: a page
 * rendered at a different number than the boxes were measured at yields a crop
 * that is offset but still looks like a crop.
 * @param {object} request
 * @param {Uint8Array | Buffer} request.bytes
 * @param {string} request.filename
 * @param {number} request.page - 1-indexed.
 * @param {string} [request.endpoint]
 * @param {typeof globalThis.fetch} [request.fetchImpl]
 * @returns {Promise<{ png: Uint8Array, renderDpi: number | null }>}
 */
export async function renderPage({ bytes, filename, page, endpoint = DEFAULT_INGESTION_ENDPOINT, fetchImpl = globalThis.fetch }) {
	const target = ingestionTargetFor(filename);
	if (target === null) {
		throw new Error(`"${filename}" is not a document the ingestion service can render`);
	}
	let response;
	try {
		response = await fetchImpl(`${endpoint}/v1/render/page?page=${encodeURIComponent(page)}`, {
			method: "POST",
			headers: { "content-type": target.contentType },
			body: bytes,
		});
	} catch (error) {
		throw new Error(
			`the ingestion service is not reachable at ${endpoint} to render page ${page} — start it with ` +
				`\`npm run ingestion\` (${error instanceof Error ? error.message : String(error)})`,
		);
	}
	if (!response.ok) {
		throw new Error(`the ingestion service returned ${response.status} rendering page ${page} of "${filename}"`);
	}
	const png = new Uint8Array(await response.arrayBuffer());
	const declared = Number(response.headers.get("x-render-dpi"));
	return { png, renderDpi: Number.isFinite(declared) && declared > 0 ? declared : null };
}
