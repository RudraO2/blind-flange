"""Story 4.2 — proof that pytesseract.image_to_data() returns word boxes on this hardware.

Run once and read the numbers into ../PROOF.md rather than trusting a stale log.
Not part of the ingestion service — Story 4.3 builds that against whatever this proves out.
"""

import json
import platform
import resource_probe
import sys
import time
from pathlib import Path

import pytesseract
from PIL import Image

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "sample-inspection-report-p1.png"

_windows_default = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
if platform.system() == "Windows" and _windows_default.exists():
    pytesseract.pytesseract.tesseract_cmd = str(_windows_default)


def main() -> None:
    if not FIXTURE.exists():
        print(f"fixture not found: {FIXTURE}", file=sys.stderr)
        sys.exit(1)

    print(f"tesseract binary: {pytesseract.pytesseract.tesseract_cmd}")
    print(f"tesseract version: {pytesseract.get_tesseract_version()}")
    print(f"python: {platform.python_version()} ({platform.system()} {platform.release()})")

    mem_before = resource_probe.peak_rss_mb()
    image = Image.open(FIXTURE)

    start = time.perf_counter()
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    elapsed = time.perf_counter() - start
    mem_after = resource_probe.peak_rss_mb()

    n_words = len(data["text"])
    words_with_text = [
        {
            "text": data["text"][i],
            "left": data["left"][i],
            "top": data["top"][i],
            "width": data["width"][i],
            "height": data["height"][i],
            "conf": data["conf"][i],
        }
        for i in range(n_words)
        if data["text"][i].strip()
    ]

    print(f"elapsed: {elapsed:.2f}s")
    print(f"peak RSS before: {mem_before:.1f} MB, after: {mem_after:.1f} MB")
    print(f"boxes returned (incl. blanks): {n_words}, non-blank words: {len(words_with_text)}")
    print("sample of first 8 non-blank words:")
    for w in words_with_text[:8]:
        print(f"  {w}")

    out = {
        "tesseract_version": str(pytesseract.get_tesseract_version()),
        "elapsed_seconds": round(elapsed, 3),
        "peak_rss_mb_before": round(mem_before, 1),
        "peak_rss_mb_after": round(mem_after, 1),
        "word_box_count": len(words_with_text),
        "sample_words": words_with_text[:20],
    }
    out_path = Path(__file__).resolve().parent / "proof-result.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(f"written: {out_path}")


if __name__ == "__main__":
    main()
