"""Render a scanned PDF's pages and run each through the OCR path in ocr.py.

`pypdfium2` does the rendering (Apache-2.0 or BSD-3-Clause, at our choice — LICENCES.md).
Never `PyMuPDF`: it is AGPL-3.0 (ADR-0005, CLAUDE.md).
"""

from __future__ import annotations

import pypdfium2 as pdfium

from ocr import Finding, findings_from_image

# The fixture PDF (fixtures/README.md) is rasterised at 300 dpi and its MediaBox is sized
# in points (1/72 in) accordingly. Rendering at the same dpi keeps pixel coordinates in the
# returned bbox consistent with what the engine proofs measured on this hardware, and
# matches the resolution a real flatbed scan of an A4/Letter page arrives at.
RENDER_DPI = 300
_SCALE = RENDER_DPI / 72.0


class PageFinding(Finding):
    page: int


def pdf_to_findings(pdf_bytes: bytes) -> list[PageFinding]:
    """Render every page of a scanned PDF and OCR each one.

    Raises pypdfium2.PdfiumError for bytes that are not a decodable PDF — the server
    maps that to a 400 rather than letting it surface as a 500.
    """
    findings: list[PageFinding] = []
    pdf = pdfium.PdfDocument(pdf_bytes)
    try:
        for page_index in range(len(pdf)):
            page = pdf[page_index]
            try:
                bitmap = page.render(scale=_SCALE)
                try:
                    image = bitmap.to_pil()
                    for finding in findings_from_image(image):
                        findings.append({**finding, "page": page_index + 1})
                finally:
                    bitmap.close()
            finally:
                page.close()
    finally:
        pdf.close()
    return findings
