/**
 * The document the workbench is currently answering about.
 *
 * Two consumers need the same answer to "which document is this?", and they must
 * not disagree: `findings/tool.js`, which reads its OCR lines, and
 * `findings/provenance.js`, which serves the page image a crop is cut from. If
 * one served the uploaded file while the other served the shipped fixture, the
 * panel would show a crop of the wrong page next to a real finding — and a crop
 * of the wrong page still looks like a crop, which is the failure mode this whole
 * area has to be careful about. So the state lives here, in one place, rather
 * than in whichever module happened to need it first.
 *
 * `null` means no upload, and the shipped fixture is the document. That is not a
 * degraded state: the fixture is a real scanned report and the committed capture
 * is a real OCR pass over it.
 *
 * ponytail: one document for the whole process. Same ceiling and same upgrade
 * path as `router/dispatch.js` and `lanes/code.js` — Phase 0 is single-user and
 * single-session by the product brief's cut line, and the fix is a map keyed by
 * session id once the harness gives these seams a session id to key on. A second
 * concurrent user would see the first's document, which on a shared box would be
 * a confidentiality bug rather than a cosmetic one, so this ceiling is the first
 * of the three to raise if Phase 0's single-user assumption ever moves.
 */

/**
 * @typedef {object} AttachedDocument
 * @property {string} filename
 * @property {Uint8Array} bytes
 * @property {Array<object> | null} findings - the OCR result, once something has read it.
 * @property {Map<number, { png: Uint8Array, width: number, height: number }>} pages - rendered page cache.
 */

/** @type {AttachedDocument | null} */
let attached = null;

/**
 * Attach an uploaded document. Replaces any previous one, and drops its cached
 * findings and page renders with it — they described a different file.
 * @param {string} filename
 * @param {Uint8Array} bytes
 */
export function attachDocument(filename, bytes) {
	attached = { filename, bytes, findings: null, pages: new Map() };
	return attached;
}

/** The attached document, or `null` when the shipped fixture is what to read. */
export function currentDocument() {
	return attached;
}

/** Forget it. For tests, and when a session is cleared. */
export function clearDocument() {
	attached = null;
}

/**
 * Remember the OCR result for the attached document, so the provenance panel and
 * the findings tool describe the same lines rather than each running their own
 * OCR pass over the same bytes.
 * @param {Array<object>} findings
 */
export function rememberFindings(findings) {
	if (attached !== null) attached.findings = findings;
}

/** The remembered OCR result, or `null` when nothing has read the document yet. */
export function attachedFindings() {
	return attached?.findings ?? null;
}

/**
 * A rendered page, from the cache. Rendering costs a round trip to the ingestion
 * service and a full page rasterise, and the crop viewer asks for the same page
 * once per finding the user clicks.
 * @param {number} page
 */
export function cachedPage(page) {
	return attached?.pages.get(page) ?? null;
}

/**
 * Cache a rendered page against the attached document.
 * @param {number} page
 * @param {{ png: Uint8Array, width: number, height: number }} rendered
 */
export function cachePage(page, rendered) {
	if (attached !== null) attached.pages.set(page, rendered);
}

/**
 * A one-line note telling the model that a document is attached, or `null` when
 * none is.
 *
 * **Why this exists.** Upload attaches the document on the host and OCRs it
 * immediately, and until 30 August 2026 that is where the chain stopped: nothing
 * in the conversation said a file had arrived. Measured that day - a document was
 * uploaded, then "what is in the doc I sent?" was asked, and the session log
 * records zero tool calls for that turn. The model had no attachment in context,
 * no reason to call `bf_report_findings`, and answered from the only text in its
 * window. It said it had read the file, because that is what a model says.
 *
 * So the note names the file, says the OCR has already run, and names the tool
 * that returns the text. It is deliberately a statement of fact and not an
 * instruction to obey: the model still decides to call the tool, and the session
 * log still records whether it did.
 */
export function attachmentNote() {
	if (attached === null) return null;
	const count = Array.isArray(attached.findings) ? attached.findings.length : null;
	const read = count === null ? "It has not been read yet" : `Its text has already been extracted - ${count} OCR lines`;
	return (
		`A document is attached to this session: "${attached.filename}". ${read}. ` +
		"Call `bf_report_findings` to read it before answering any question about its contents, " +
		"and cite the page and bounding box of every line a claim comes from. " +
		"Do not describe the document from memory or from anything else in this conversation."
	);
}
