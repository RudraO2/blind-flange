/**
 * Builds a real `.docx` (OOXML) for the approval note, dependency-free (see
 * `zip.js`'s header for why). Hand-written XML for exactly the parts Word and
 * LibreOffice both need to open the file clean — no named styles (a `w:pStyle`
 * reference with no matching `styles.xml` entry is a common cause of "found
 * unreadable content, do you want to recover" prompts), only direct run/
 * paragraph formatting.
 *
 * FR12: titleblock, reference number, cited clauses traceable to their
 * provenance (page + region — CONTEXT.md "Provenance crop"), a signature
 * block, and a provenance footer carrying a content hash.
 */

import { createZip } from "./zip.js";

/** Escape the five XML-significant characters; every piece of model- or user-supplied text passes through this before it reaches a run. */
function escapeXml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

/** One `w:p` with a single run, half-point size, optional bold/italic. */
function paragraph(text, { bold = false, italic = false, sizeHalfPoints = 22, alignment } = {}) {
	const rpr = `<w:rPr>${bold ? "<w:b/>" : ""}${italic ? "<w:i/>" : ""}<w:sz w:val="${sizeHalfPoints}"/></w:rPr>`;
	const ppr = alignment === undefined ? "" : `<w:pPr><w:jc w:val="${alignment}"/></w:pPr>`;
	return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/**
 * The equipment tag a clause concerns, when it names one.
 *
 * This was a provenance line — `page 1, region left 560 top 2048 …` — until
 * 31 August 2026. ADR-0008 removed the OCR service that produced those boxes,
 * so the line would have printed `page undefined, region undefined`, which is
 * worse than printing nothing: a citation that looks like one and cites
 * nothing. A clause with no tag now gets no source line at all.
 */
function clauseSourceLine(clause) {
	return typeof clause.tag === "string" && clause.tag !== "" ? `Tag: ${clause.tag}` : null;
}

/**
 * @param {object} note
 * @param {string} note.title - titleblock heading.
 * @param {string} note.referenceNumber
 * @param {string} note.generatedAt - ISO 8601 timestamp for the titleblock.
 * @param {string} note.sourceReport - the document or image the clauses were read from.
 * @param {Array<{ text: string, tag?: string }>} note.clauses
 * @param {string} note.contentHash - hex-encoded digest, printed in the footer.
 * @param {string[]} [note.auditTrail] - lines from `audit-trail.js`; omitted entirely when absent, rather than printing an empty heading.
 * @returns the complete `.docx` file as a Buffer.
 */
export function buildApprovalNoteDocx(note) {
	const bodyParagraphs = [
		paragraph(note.title, { bold: true, sizeHalfPoints: 32 }),
		paragraph(`Reference: ${note.referenceNumber}`, { bold: true, sizeHalfPoints: 22 }),
		paragraph(`Generated: ${note.generatedAt}`, { sizeHalfPoints: 20 }),
		paragraph(`Source report: ${note.sourceReport}`, { sizeHalfPoints: 20 }),
		paragraph("Cited findings", { bold: true, sizeHalfPoints: 26 }),
		...note.clauses.flatMap((clause, index) => {
			const source = clauseSourceLine(clause);
			return [
				paragraph(`${index + 1}. ${clause.text}`, { sizeHalfPoints: 22 }),
				...(source === null ? [] : [paragraph(source, { italic: true, sizeHalfPoints: 18 })]),
			];
		}),
		paragraph("Signatures", { bold: true, sizeHalfPoints: 26 }),
		paragraph("Prepared by: _________________________        Date: _______________", { sizeHalfPoints: 22 }),
		paragraph("Approved by: _________________________        Date: _______________", { sizeHalfPoints: 22 }),
		// The audit trail goes after the signatures on purpose: it is evidence for a
		// reviewer, not content for a signatory, and it must not sit between the
		// findings and the line somebody signs.
		//
		// It goes in the document at all because the live surfaces — the routing chip,
		// the egress monitor — explain a turn only while you are looking at them.
		// A judge who takes this file away, or an MRPL reviewer opening it in six
		// months, otherwise has a document that asserts findings and cannot show what
		// produced them.
		...(Array.isArray(note.auditTrail) && note.auditTrail.length > 0
			? [
					paragraph("How this note was produced", { bold: true, sizeHalfPoints: 26 }),
					...note.auditTrail.map((line) =>
						// A blank line stays a blank paragraph rather than collapsing, so
						// the block's own grouping survives into Word.
						paragraph(line === "" ? " " : line, { sizeHalfPoints: 18, italic: line.startsWith("Disclosure:") }),
					),
				]
			: []),
	].join("");

	const documentXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
		`<w:body>${bodyParagraphs}` +
		"<w:sectPr>" +
		'<w:footerReference w:type="default" r:id="rIdFooter1"/>' +
		'<w:pgSz w:w="12240" w:h="15840"/>' +
		'<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>' +
		"</w:sectPr>" +
		"</w:body>" +
		"</w:document>";

	const footerXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
		paragraph(`Provenance — SHA-256 content hash: ${note.contentHash}. Generated by Faraday, not pre-authored.`, {
			italic: true,
			sizeHalfPoints: 16,
			alignment: "center",
		}) +
		"</w:ftr>";

	const contentTypesXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
		'<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
		'<Default Extension="xml" ContentType="application/xml"/>' +
		'<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
		'<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>' +
		'<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
		'<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
		"</Types>";

	const rootRelsXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
		'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
		'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
		'<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
		"</Relationships>";

	const documentRelsXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
		'<Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>' +
		"</Relationships>";

	const coreXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
		`<dc:title>${escapeXml(note.title)}</dc:title>` +
		"<dc:creator>Faraday</dc:creator>" +
		`<dcterms:created xsi:type="dcterms:W3CDTF">${escapeXml(note.generatedAt)}</dcterms:created>` +
		"</cp:coreProperties>";

	const appXml =
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
		'<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">' +
		"<Application>Faraday</Application>" +
		"</Properties>";

	return createZip([
		{ name: "[Content_Types].xml", data: Buffer.from(contentTypesXml, "utf8") },
		{ name: "_rels/.rels", data: Buffer.from(rootRelsXml, "utf8") },
		{ name: "docProps/core.xml", data: Buffer.from(coreXml, "utf8") },
		{ name: "docProps/app.xml", data: Buffer.from(appXml, "utf8") },
		{ name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
		{ name: "word/_rels/document.xml.rels", data: Buffer.from(documentRelsXml, "utf8") },
		{ name: "word/footer1.xml", data: Buffer.from(footerXml, "utf8") },
	]);
}
