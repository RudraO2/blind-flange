"""Render a scanned PDF's pages and run each through the OCR path in ocr.py.

`pypdfium2` does the rendering (Apache-2.0 or BSD-3-Clause, at our choice — LICENCES.md).
Never `PyMuPDF`: it is AGPL-3.0 (ADR-0005, CLAUDE.md).
"""

from __future__ import annotations

import io

import pypdfium2 as pdfium

from ocr import Finding, findings_from_image

# Stays at 300, and the investigation that briefly lowered it is worth recording because the
# conclusion was the opposite of what it set out to prove (30 August 2026 —
# proof/dpi_latency_proof.py, proof/ocr_tuning_proof.py, proof/warm_check.py).
#
# The theory was that 300 dpi wastes work: RapidOCR caps its own working image at
# `Global.max_side_len: 2000`, roughly 170 dpi for A4, so pdfium rasterises 3508 pixels of
# height and the engine discards a third of them. Rendering at 200 should have been free
# speed. It was measured at 200 and shipped there for about an hour.
#
# Two facts reversed it:
#
#   1. **It buys nothing.** Warm, the fixture reads in 7.20s and 6.45s at 200 dpi against
#      7.77s and 6.29s at 300 — noise. Rasterising was only 0.6s of the original 15s pass;
#      the whole saving came from pre-warming the engine (`ocr.py` `warm_up`), which removes
#      several seconds of ONNX Runtime shape specialisation from the first request.
#   2. **It costs coordinate compatibility.** `bbox` is in source-image pixels at whatever dpi
#      rendered the page. The committed capture in `plugins/.../sample-report-findings.json`
#      and the pre-rendered page images the provenance route crops against are both 300 dpi.
#      Serving 200 dpi boxes would have cropped the wrong region of the right page — silently,
#      because a crop that is merely offset still looks like a crop.
#
# So: keep 300, keep the warm-up, and revisit only once the provenance route renders pages on
# demand at this same constant, at which point the two numbers are coupled by code rather
# than by a comment.
RENDER_DPI = 300
_SCALE = RENDER_DPI / 72.0


class PageFinding(Finding):
    page: int


def page_count(pdf_bytes: bytes) -> int:
    """How many pages the document has.

    Raises pypdfium2.PdfiumError for bytes that are not a decodable PDF, like the other
    entry points here, so the server maps it to a 400 rather than a 500.
    """
    pdf = pdfium.PdfDocument(pdf_bytes)
    try:
        return len(pdf)
    finally:
        pdf.close()


def render_page_png(pdf_bytes: bytes, page_number: int) -> bytes:
    """Render one 1-indexed page to PNG bytes at RENDER_DPI.

    Added 30 August 2026 for the provenance crop. A crop is only evidence if it comes from
    the page the claim was read from, so the panel needs the page image — and for a document
    a judge uploaded, no such image exists anywhere until somebody renders it. Node cannot:
    the PDF renderer is `pypdfium2`, which lives here.

    **RENDER_DPI is the contract.** The bounding boxes in a finding are in source-image
    pixels at this resolution, so the page served for cropping has to be rendered at the same
    number or the crop is offset — and an offset crop still looks like a crop, which is the
    failure mode worth being careful about. Both come from this one constant.

    Raises IndexError for a page outside the document, which the server maps to a 404.
    """
    pdf = pdfium.PdfDocument(pdf_bytes)
    try:
        if page_number < 1 or page_number > len(pdf):
            raise IndexError(f"page {page_number} is outside a {len(pdf)}-page document")
        page = pdf[page_number - 1]
        try:
            bitmap = page.render(scale=_SCALE)
            try:
                buffer = io.BytesIO()
                bitmap.to_pil().convert("RGB").save(buffer, format="PNG")
                return buffer.getvalue()
            finally:
                bitmap.close()
        finally:
            page.close()
    finally:
        pdf.close()


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
