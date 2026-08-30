/**
 * The provenance route (Story 4.5), host half.
 *
 * CONTEXT.md defines a provenance crop as "the image region a cited fact was
 * actually read from, shown next to the claim. Provenance here always means
 * page *and* region, never just a filename." The crop viewer that shows it is
 * a browser panel, so the two things it needs — the OCR findings and the page
 * images those findings were read from — have to be reachable over the same
 * loopback origin the client is served from. This is that route.
 *
 * It serves two things and generates neither:
 *
 *   1. `GET /blind-flange/provenance/findings` — the same
 *      `sample-report-findings.json` capture `findings/tool.js` reads, plus a
 *      page manifest. The manifest's `width`/`height` are parsed out of each
 *      PNG's own IHDR header, not recorded in a constant, so the pixel space
 *      the client scales its crop in is the page image's real pixel space.
 *      If the fixture is ever regenerated at a different resolution the crop
 *      follows it without a code change.
 *   2. `GET /blind-flange/provenance/pages/<n>` — page `n` of the report as
 *      the real 300 dpi PNG. The client crops it in the browser by offsetting
 *      the full page inside a clipped box sized to the finding's bounding box.
 *      **Nothing here renders a crop.** There is no pre-cut image anywhere in
 *      this package: a crop that did not come from the page a claim was read
 *      from would be exactly the fake panel NFR8 forbids, and Story 4.2's own
 *      acceptance criteria say it in the strongest form — "if the OCR slips,
 *      the provenance crop slips".
 *
 * The page images under `pages/` are copies of the Epic 4 fixtures at
 * `services/ingestion/fixtures/sample-inspection-report-p{1,2}.png`, committed
 * here for the same reason `sample-report-findings.json` is: the Python
 * ingestion service is a separate tree, and reaching across it at runtime
 * would make this panel depend on the repository layout that happens to be
 * true while the profile installs the plugin with `link:`. They are the
 * literal fixture bytes, and the findings capture beside them was produced by
 * the real service from that exact PDF, so a bounding box in the capture
 * indexes the pixels in these files.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attachedFindings, cachedPage, cachePage, currentDocument } from "./attached.js";
import { DEFAULT_INGESTION_ENDPOINT, renderPage } from "./ingestion-client.js";

/** Prefix the route is registered under. Matches `p` and `p/<anything>` (`kind: "prefix"`). */
export const PROVENANCE_ROUTE_PREFIX = "/blind-flange/provenance";

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FINDINGS_PATH = join(HERE, "sample-report-findings.json");
const DEFAULT_PAGES_DIR = join(HERE, "pages");
const PAGE_FILE = (page) => `sample-inspection-report-p${page}.png`;

/** The document these findings and pages came from, named on the panel. */
export const PROVENANCE_REPORT_NAME = "sample-inspection-report.pdf";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Width and height from a PNG's IHDR chunk — the first chunk of every PNG, at
 * a fixed offset right after the 8-byte signature. Ten lines rather than an
 * image library, because this package has no dependencies and reading two
 * big-endian integers does not justify acquiring one.
 * @param {Buffer} buffer - the PNG bytes.
 * @returns `{ width, height }`, or `null` when the bytes are not a PNG.
 */
export function pngSize(buffer) {
	if (!Buffer.isBuffer(buffer) || buffer.length < 24) return null;
	if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
	if (buffer.subarray(12, 16).toString("latin1") !== "IHDR") return null;
	const width = buffer.readUInt32BE(16);
	const height = buffer.readUInt32BE(20);
	if (width === 0 || height === 0) return null;
	return { width, height };
}

/**
 * The page numbers the findings actually cite, ascending. Driving the manifest
 * off the capture rather than off a directory listing keeps the two honest
 * about each other: a page image with no findings is not offered, and a
 * finding whose page has no image is reported as a gap below rather than
 * silently dropped.
 * @param {Array<{ page?: number }>} findings - the parsed capture.
 * @returns {number[]} ascending distinct page numbers.
 */
export function citedPages(findings) {
	const pages = new Set();
	for (const finding of Array.isArray(findings) ? findings : []) {
		const page = finding?.page;
		if (Number.isInteger(page) && page > 0) pages.add(page);
	}
	return [...pages].sort((a, b) => a - b);
}

/**
 * Build the payload the crop viewer loads once when it mounts: the report
 * name, the page manifest with each page's real pixel size, and the findings
 * themselves.
 *
 * A cited page whose image is missing or unreadable is reported with
 * `available: false` instead of being omitted. The panel then says that
 * finding's page cannot be shown, which is a visible gap; dropping the page
 * would leave a finding that clicks to nothing with no explanation.
 * @param {object} [paths]
 * @param {string} [paths.findingsPath] - override for tests.
 * @param {string} [paths.pagesDir] - override for tests.
 * @returns `{ report, pages, findings }`.
 */
export function buildProvenancePayload({ findingsPath = DEFAULT_FINDINGS_PATH, pagesDir = DEFAULT_PAGES_DIR } = {}) {
	const findings = JSON.parse(readFileSync(findingsPath, "utf8"));
	const pages = citedPages(findings).map((page) => {
		const file = join(pagesDir, PAGE_FILE(page));
		if (!existsSync(file)) return { page, available: false };
		const size = pngSize(readFileSync(file));
		if (size === null) return { page, available: false };
		return { page, available: true, width: size.width, height: size.height };
	});
	return { report: PROVENANCE_REPORT_NAME, pages, findings };
}

/**
 * The page number a `/blind-flange/provenance/pages/<n>` pathname asks for.
 * @param {string} pathname - the request pathname.
 * @returns the page number, or `null` when this is not a page request.
 */
export function pageNumberFromPath(pathname) {
	const prefix = `${PROVENANCE_ROUTE_PREFIX}/pages/`;
	if (typeof pathname !== "string" || !pathname.startsWith(prefix)) return null;
	const rest = pathname.slice(prefix.length);
	if (!/^[1-9][0-9]{0,3}$/.test(rest)) return null;
	return Number(rest);
}

/**
 * The route handler. Registered on the harness's own `webServer` service
 * (`kind: "prefix"`), the same supported extension point the favicon route in
 * `../index.js` takes — no harness source is touched (NFR5).
 *
 * Reads from disk on every request rather than caching at mount: the capture
 * and the page images are the demo's evidence, and a stale in-memory copy
 * would be a panel showing something the files no longer say.
 * @param {object} [paths]
 * @param {string} [paths.findingsPath] - override for tests.
 * @param {string} [paths.pagesDir] - override for tests.
 * @returns a `WebRoute` handler `(req, res) => void`.
 */
/**
 * The payload for an uploaded document: its remembered OCR lines, and a page
 * manifest built by actually rendering each cited page.
 *
 * Rendering is what makes upload mean anything. The committed page images belong
 * to one file, so for any other document the crop has to be cut from a page
 * nobody has rendered yet — and only the ingestion service can render one.
 *
 * A page that cannot be rendered is reported `available: false` with the reason,
 * exactly as a missing fixture page is. The panel then says that finding's page
 * cannot be shown, which is a visible gap; omitting it would leave a finding that
 * clicks to nothing.
 * @param {object} options
 * @param {string} [options.endpoint]
 * @param {typeof globalThis.fetch} [options.fetchImpl]
 */
async function buildAttachedPayload({ endpoint, fetchImpl }) {
	const document = currentDocument();
	const findings = attachedFindings();
	if (document === null || findings === null) return null;

	const pages = [];
	for (const page of citedPages(findings)) {
		const cached = cachedPage(page);
		if (cached !== null) {
			pages.push({ page, available: true, width: cached.width, height: cached.height });
			continue;
		}
		try {
			const { png, renderDpi } = await renderPage({
				bytes: document.bytes,
				filename: document.filename,
				page,
				endpoint,
				fetchImpl,
			});
			const size = pngSize(Buffer.from(png));
			if (size === null) {
				pages.push({ page, available: false, reason: "the rendered page was not a readable PNG" });
				continue;
			}
			cachePage(page, { png, width: size.width, height: size.height });
			pages.push({ page, available: true, width: size.width, height: size.height, renderDpi });
		} catch (error) {
			pages.push({ page, available: false, reason: error instanceof Error ? error.message : String(error) });
		}
	}
	return { report: document.filename, pages, findings, source: "upload" };
}

export function createProvenanceHandler({
	findingsPath = DEFAULT_FINDINGS_PATH,
	pagesDir = DEFAULT_PAGES_DIR,
	endpoint = DEFAULT_INGESTION_ENDPOINT,
	fetchImpl = globalThis.fetch,
} = {}) {
	return async function handleProvenance(req, res) {
		if (req.method !== "GET" && req.method !== "HEAD") {
			res.writeHead(405, { allow: "GET, HEAD" });
			res.end();
			return;
		}
		const pathname = String(req.url ?? "").split("?")[0];
		const head = req.method === "HEAD";

		if (pathname === `${PROVENANCE_ROUTE_PREFIX}/findings`) {
			let body;
			try {
				// An uploaded document takes precedence, because it is what the user is
				// asking about. Falling through to the fixture here would show a crop
				// of the wrong document beside a real finding.
				const attached = await buildAttachedPayload({ endpoint, fetchImpl });
				body = Buffer.from(JSON.stringify(attached ?? buildProvenancePayload({ findingsPath, pagesDir })), "utf8");
			} catch (error) {
				// The capture is shipped inside this package, so an unreadable one
				// means a broken install rather than a missing upload. Say which
				// file, because the panel can only say "unavailable".
				console.warn(
					`@blind-flange/dsh-client-ui-base: provenance findings not readable at ${findingsPath} — ${error instanceof Error ? error.message : String(error)}`,
				);
				res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
				res.end(head ? undefined : '{"error":"findings are unavailable"}');
				return;
			}
			res.writeHead(200, { "content-type": "application/json; charset=utf-8", "content-length": String(body.length) });
			res.end(head ? undefined : body);
			return;
		}

		const page = pageNumberFromPath(pathname);
		if (page !== null) {
			// An uploaded document's pages are rendered on demand and cached. The
			// manifest above will normally have warmed the cache already, so this is
			// usually a memory read; it renders here too, so a direct request for a
			// page still works without loading the manifest first.
			const document = currentDocument();
			if (document !== null) {
				let rendered = cachedPage(page);
				if (rendered === null) {
					try {
						const { png } = await renderPage({
							bytes: document.bytes,
							filename: document.filename,
							page,
							endpoint,
							fetchImpl,
						});
						const size = pngSize(Buffer.from(png));
						if (size === null) throw new Error("the rendered page was not a readable PNG");
						rendered = { png, width: size.width, height: size.height };
						cachePage(page, rendered);
					} catch (error) {
						// 502 rather than 404: the page exists, we could not produce it.
						// The distinction matters to whoever is debugging a blank crop.
						res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
						res.end(head ? undefined : JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
						return;
					}
				}
				res.writeHead(200, { "content-type": "image/png", "content-length": String(rendered.png.length) });
				res.end(head ? undefined : Buffer.from(rendered.png));
				return;
			}

			const file = join(pagesDir, PAGE_FILE(page));
			if (!existsSync(file)) {
				res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
				res.end(head ? undefined : '{"error":"no such page"}');
				return;
			}
			const bytes = readFileSync(file);
			res.writeHead(200, { "content-type": "image/png", "content-length": String(bytes.length) });
			res.end(head ? undefined : bytes);
			return;
		}

		res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
		res.end(head ? undefined : '{"error":"not found"}');
	};
}
