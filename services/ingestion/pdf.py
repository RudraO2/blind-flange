"""Render a scanned PDF's pages and run each through the OCR path in ocr.py.

`pypdfium2` does the rendering (Apache-2.0 or BSD-3-Clause, at our choice — LICENCES.md).
Never `PyMuPDF`: it is AGPL-3.0 (ADR-0005, CLAUDE.md).
"""

from __future__ import annotations

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
