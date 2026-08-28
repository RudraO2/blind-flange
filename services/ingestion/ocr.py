"""Story 4.3 — the OCR step the ingestion service runs against a scanned image.

Wraps `pytesseract.image_to_data()` the way Story 4.2 proved it: CPU only, no downloaded
models (the tessdata Tesseract reads was installed alongside the binary, not fetched here),
one word per finding with its bounding box and confidence. This module does not open a
socket — the HTTP boundary lives in server.py so the OCR path stays testable on its own.
"""

from __future__ import annotations

import io
import platform
from pathlib import Path
from typing import TypedDict

import pytesseract
from PIL import Image

_windows_default = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
if platform.system() == "Windows" and _windows_default.exists():
    pytesseract.pytesseract.tesseract_cmd = str(_windows_default)


class Finding(TypedDict):
    text: str
    bbox: dict[str, int]
    confidence: float


def image_to_findings(image_bytes: bytes) -> list[Finding]:
    """Run OCR against raw image bytes and return one finding per non-blank word.

    Raises PIL.UnidentifiedImageError for bytes that are not a decodable image — the
    server maps that to a 400 rather than letting it surface as a 500.
    """
    image = Image.open(io.BytesIO(image_bytes))
    return findings_from_image(image)


def findings_from_image(image: Image.Image) -> list[Finding]:
    """Run OCR against an already-decoded image.

    Split out from image_to_findings so Story 4.4's PDF path can hand this a page
    rendered straight from pypdfium2, rather than re-encoding it to bytes and back.
    """
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)

    findings: list[Finding] = []
    for i, text in enumerate(data["text"]):
        if not text.strip():
            continue
        conf = float(data["conf"][i])
        if conf < 0:
            # Tesseract emits -1 for structural (non-word) boxes; not a finding.
            continue
        findings.append(
            {
                "text": text,
                "bbox": {
                    "left": int(data["left"][i]),
                    "top": int(data["top"][i]),
                    "width": int(data["width"][i]),
                    "height": int(data["height"][i]),
                },
                "confidence": conf,
            }
        )
    return findings
