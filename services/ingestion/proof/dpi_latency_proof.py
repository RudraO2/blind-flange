"""Ticket 05: how fast can the ingestion service read a page, and what does speed cost?

`pdf.py` renders at RENDER_DPI = 300 and that number has never been timed. The document
lane has to answer in seconds, and render resolution is the obvious lever — pixel count
falls with the square of the DPI, so 150 dpi is a quarter of the work.

The accuracy floor is not "mean confidence stayed high". It is that the strings an
inspection report is *made of* still come out exactly right: reference numbers with
slashes, procedure codes, mixed-case equipment tags. That is the whole reason RapidOCR
replaced Tesseract (ADR-0005 amendment, proof/PROOF-RAPIDOCR.md) — Tesseract read the same
page at 0.89-0.96 and mangled precisely those strings. A DPI drop that reintroduces the
defect the engine swap fixed is not a speed win.

So this measures wall-clock per stage at each DPI, and diffs the recognised text against
the committed 300 dpi capture that Story 5.1 was built on, reporting exact-match rate and
naming every line that changed.

Run: .venv\\Scripts\\python.exe proof\\dpi_latency_proof.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVICE = HERE.parent
REPO = SERVICE.parent.parent
sys.path.insert(0, str(SERVICE))

import pypdfium2 as pdfium  # noqa: E402

from ocr import findings_from_image  # noqa: E402

FIXTURE = SERVICE / "fixtures" / "sample-inspection-report.pdf"
# The committed capture of a real 300 dpi run, 28 Aug 2026 — the baseline Story 5.1's
# findings table and Story 4.5's provenance crops were both built against.
CAPTURE = REPO / "plugins" / "dsh-client-ui-base" / "lib" / "findings" / "sample-report-findings.json"

DPIS = (300, 250, 200, 150)


def render_and_read(pdf_bytes: bytes, dpi: int):
    """Render every page at `dpi` and OCR each, timing the two stages separately."""
    scale = dpi / 72.0
    render_seconds = 0.0
    ocr_seconds = 0.0
    per_page: list[float] = []
    findings = []

    pdf = pdfium.PdfDocument(pdf_bytes)
    try:
        for page_index in range(len(pdf)):
            page_started = time.perf_counter()
            page = pdf[page_index]
            try:
                t0 = time.perf_counter()
                bitmap = page.render(scale=scale)
                try:
                    image = bitmap.to_pil()
                    render_seconds += time.perf_counter() - t0

                    t1 = time.perf_counter()
                    page_findings = findings_from_image(image)
                    ocr_seconds += time.perf_counter() - t1
                finally:
                    bitmap.close()
            finally:
                page.close()
            for finding in page_findings:
                findings.append({**finding, "page": page_index + 1})
            per_page.append(time.perf_counter() - page_started)
    finally:
        pdf.close()

    return findings, render_seconds, ocr_seconds, per_page


def normalise(findings) -> list[str]:
    """The recognised text in reading order, which is what a DPI change can damage."""
    return [f["text"].strip() for f in findings]


def main() -> int:
    if not FIXTURE.exists():
        print(f"missing fixture: {FIXTURE}")
        return 1

    pdf_bytes = FIXTURE.read_bytes()

    baseline_texts: list[str] | None = None
    if CAPTURE.exists():
        captured = json.loads(CAPTURE.read_text(encoding="utf-8"))
        entries = captured.get("findings", captured) if isinstance(captured, dict) else captured
        baseline_texts = [str(f["text"]).strip() for f in entries]
        print(f"baseline: committed capture, {len(baseline_texts)} lines\n")
    else:
        print(f"no committed capture at {CAPTURE} — comparing against this run's 300 dpi\n")

    # Warm the engine so the first DPI is not charged for loading three ONNX models.
    warm_started = time.perf_counter()
    render_and_read(pdf_bytes, 150)
    print(f"engine warm-up discarded: {time.perf_counter() - warm_started:.2f}s\n")

    rows = []
    texts_by_dpi: dict[int, list[str]] = {}

    for dpi in DPIS:
        findings, render_s, ocr_s, per_page = render_and_read(pdf_bytes, dpi)
        texts = normalise(findings)
        texts_by_dpi[dpi] = texts
        confidences = [f["confidence"] for f in findings]
        mean_conf = sum(confidences) / len(confidences) if confidences else 0.0
        rows.append(
            {
                "dpi": dpi,
                "total": render_s + ocr_s,
                "render": render_s,
                "ocr": ocr_s,
                "first_page": per_page[0] if per_page else 0.0,
                "lines": len(findings),
                "mean_conf": mean_conf,
            }
        )

    if baseline_texts is None:
        baseline_texts = texts_by_dpi[DPIS[0]]

    print(f"{'dpi':>5} {'total':>8} {'render':>8} {'ocr':>8} {'page1':>8} {'lines':>6} {'meanconf':>9} {'exact':>7}")
    print("-" * 70)
    for row in rows:
        texts = texts_by_dpi[row["dpi"]]
        matched = sum(1 for t in texts if t in baseline_texts)
        exact = 100.0 * matched / len(baseline_texts) if baseline_texts else 0.0
        print(
            f"{row['dpi']:>5} {row['total']:>7.2f}s {row['render']:>7.2f}s {row['ocr']:>7.2f}s "
            f"{row['first_page']:>7.2f}s {row['lines']:>6} {row['mean_conf']:>8.2f}% {exact:>6.1f}%"
        )

    print("\n=== what each DPI lost against the baseline ===")
    baseline_set = set(baseline_texts)
    for dpi in DPIS:
        missing = [t for t in baseline_texts if t not in set(texts_by_dpi[dpi])]
        added = [t for t in texts_by_dpi[dpi] if t not in baseline_set]
        print(f"\n{dpi} dpi — {len(missing)} baseline lines not read, {len(added)} lines not in baseline")
        for text in missing[:12]:
            print(f"    lost:  {text!r}")
        for text in added[:12]:
            print(f"    new:   {text!r}")
        if len(missing) > 12 or len(added) > 12:
            print("    ... truncated")

    print(
        "\nRead the diff, not the percentage. A dropped decorative line is free; a mangled "
        "reference number or equipment tag is the defect the RapidOCR swap existed to fix."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
