"""Confirm the ticket-05 changes on the fixture: 200 dpi, classifier off, engine pre-warmed.

The numbers to look for, measured 30 August 2026 before these changes landed:
  - the fixture took ~15s when the engine met each render size for the first time
  - it takes ~6.7s once warm
  - every equipment tag, reference number and procedure code must still be exact

Run: .venv\\Scripts\\python.exe proof\\warm_check.py
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

from ocr import warm_up  # noqa: E402
from pdf import RENDER_DPI, pdf_to_findings  # noqa: E402

FIXTURE = SERVICE / "fixtures" / "sample-inspection-report.pdf"
CAPTURE = REPO / "plugins" / "dsh-client-ui-base" / "lib" / "findings" / "sample-report-findings.json"

# The strings an inspection report is made of. RapidOCR replaced Tesseract because Tesseract
# mangled exactly these, so a change that damages one is not a speed win however fast it is.
#
# Every value here was checked to exist in the committed 300 dpi capture first. An earlier
# version of this list included `7.2` and `18.5`, which are not in the fixture at all — they
# were invented for a model prompt during bring-up — so the check reported a failure that was
# its own fault. A ground-truth list that has never been checked against ground truth is worse
# than no list, because it teaches you to ignore the alarm.
MUST_BE_EXACT = ("PSV-2207A", "E-1104A", "NCR-", "9.5", "11.42", "9.60", "24.0")


def main() -> int:
    print(f"RENDER_DPI = {RENDER_DPI}")

    warm_seconds = warm_up()
    print(f"warm_up(): {warm_seconds:.2f}s  (paid at service startup, not by the first upload)")

    started = time.perf_counter()
    findings = pdf_to_findings(FIXTURE.read_bytes())
    elapsed = time.perf_counter() - started

    mean_confidence = sum(f["confidence"] for f in findings) / len(findings)
    print(f"fixture:   {elapsed:.2f}s, {len(findings)} findings, mean confidence {mean_confidence:.2f}%")

    text = "\n".join(f["text"] for f in findings)
    missing = [needle for needle in MUST_BE_EXACT if needle not in text]
    print(f"load-bearing strings: {len(MUST_BE_EXACT) - len(missing)}/{len(MUST_BE_EXACT)} present")
    for needle in missing:
        print(f"    MISSING: {needle!r}")

    captured = json.loads(CAPTURE.read_text(encoding="utf-8"))
    entries = captured["findings"] if isinstance(captured, dict) else captured
    baseline = {str(f["text"]).strip() for f in entries}
    got = {f["text"].strip() for f in findings}
    print(f"lines identical to the committed 300 dpi capture: {len(got & baseline)}/{len(baseline)}")
    for line in sorted(baseline - got)[:6]:
        print(f"    differs: {line[:88]!r}")

    # bboxes are in source-image pixels at RENDER_DPI, and the provenance route crops against
    # a page it renders itself — so a page rendered at this dpi must contain every box.
    widest = max(f["bbox"]["left"] + f["bbox"]["width"] for f in findings)
    tallest = max(f["bbox"]["top"] + f["bbox"]["height"] for f in findings)
    print(f"furthest box extent: {widest} x {tallest} px (must fit a page rendered at {RENDER_DPI} dpi)")

    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
