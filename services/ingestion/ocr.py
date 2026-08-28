"""The OCR step the ingestion service runs against a scanned image.

Wraps RapidOCR — PP-OCRv6 detection and recognition models running on ONNX Runtime, CPU
only, no VRAM. The models ship inside the pip wheel and `proof/rapidocr_proof.py` verifies
that a full pass makes no outbound connection and no DNS lookup, which is the property this
whole product is about.

Replaced Tesseract on 28 Aug 2026. Tesseract worked — `proof/PROOF.md` has its numbers —
but on the same fixture page it read at 0.89-0.96 confidence where RapidOCR reads at 0.997,
and it mangled exactly the strings an inspection report is made of: reference numbers with
slashes, procedure codes, mixed-case equipment tags. See `proof/PROOF-RAPIDOCR.md`.

One finding per detected text *line*, not per word. Tesseract returned words; RapidOCR
returns lines, and lines are the better unit here — FR9 asks for a bounding box per
extracted claim, and FR10 shows the crop that claim was read from. A crop of one word is
not evidence a human can check; a crop of the line it sat in is.

This module does not open a socket — the HTTP boundary lives in server.py so the OCR path
stays testable on its own.
"""

from __future__ import annotations

import io
import sys
import threading
import types
from typing import TypedDict

import numpy as np
from PIL import Image


class _Polygon:
    """The only part of `shapely.geometry.Polygon` RapidOCR's detector actually uses.

    `rapidocr/ch_ppocr_det/utils.py` imports `shapely.geometry.Polygon` and reads exactly
    two properties off it, `.area` and `.length`, to size the unclip offset around a
    detected text box. Both are elementary for a simple polygon: the shoelace formula and
    the sum of the edge lengths.

    We supply them ourselves because the `shapely` wheel bundles the GEOS shared libraries,
    and **GEOS is LGPL-2.1** — weak copyleft, and not one of the four permissive licences
    `docs/licence-policy.md` allows. Importing it would have put a copyleft row on the
    attestation report Story 6.4 produces, to compute a polygon area.

    Verified on 28 Aug 2026 to produce byte-identical OCR output on the Story 4.1 fixture:
    97 regions, mean confidence 0.9968, same texts and same scores as the GEOS-backed run.
    """

    def __init__(self, coords) -> None:
        self.points = np.asarray(coords, dtype=float).reshape(-1, 2)

    @property
    def area(self) -> float:
        x, y = self.points[:, 0], self.points[:, 1]
        return 0.5 * abs(float(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))))

    @property
    def length(self) -> float:
        edges = np.diff(np.vstack([self.points, self.points[:1]]), axis=0)
        return float(np.hypot(edges[:, 0], edges[:, 1]).sum())


def _seal_out_geos() -> None:
    """Register the stub under `shapely.geometry` before RapidOCR can import the real one.

    Injecting into `sys.modules` rather than monkeypatching after the fact, because the
    import in RapidOCR's detector runs at module scope: by the time we could patch, GEOS
    would already be loaded into the process. `shapely` is not in requirements.txt, so on a
    clean install there is nothing to shadow — this also holds the line if some other
    dependency pulls it in later.
    """
    if "shapely" in sys.modules:
        return
    geometry = types.ModuleType("shapely.geometry")
    geometry.Polygon = _Polygon
    shapely = types.ModuleType("shapely")
    shapely.geometry = geometry
    sys.modules["shapely"] = shapely
    sys.modules["shapely.geometry"] = geometry


class _SealedHTTPError(RuntimeError):
    """Raised if anything in the OCR path actually tries to make an HTTP request."""


def _sealed_get(*_args, **_kwargs):
    raise _SealedHTTPError(
        "Blind Flange sealed `requests` out of the OCR path. RapidOCR reached for the "
        "network — its model downloader or its load-from-URL branch. Neither is reachable "
        "here: the models ship inside the wheel and images arrive as PIL objects. See "
        "docs/licence-policy.md and services/ingestion/LICENCES.md."
    )


def _seal_out_http() -> None:
    """Register stubs for `requests` and `tqdm` before RapidOCR can import the real ones.

    Same technique as `_seal_out_geos`, for the same two reasons in the same order.

    **Licence.** `requests` pulls in `certifi`, and `certifi` is **MPL-2.0** — file-level
    weak copyleft, outside the allow-list. `tqdm` is **MPL-2.0 AND MIT**, so both halves
    apply. Sealing them removes the last two MPL rows from the runtime tree
    (`docs/licence-decisions.json`, ADR-0006).

    **Sovereignty.** They are only reachable from `rapidocr/utils/download_file.py`, which
    fetches model weights, and `rapidocr/utils/load_image.py`, which opens an image from a
    URL. This service does neither: the three PP-OCRv6 models ship inside the wheel, and
    `findings_from_image` is handed an already-decoded `PIL.Image`. An HTTP client that
    exists but is unreachable is still an HTTP client on the attestation report of an
    air-gapped product (NFR2).

    The stubs raise rather than no-op. If a future RapidOCR moves real work behind these
    imports, the service fails loudly on the first request instead of quietly downloading
    something.
    """
    if "requests" not in sys.modules:
        requests = types.ModuleType("requests")
        requests.get = _sealed_get
        requests.post = _sealed_get
        # `download_file.py` annotates with `requests.Response` and catches
        # `requests.RequestException`, so both have to exist as real objects — and the
        # exception has to be a class `except` will accept.
        requests.Response = type("Response", (), {})
        requests.RequestException = _SealedHTTPError
        sys.modules["requests"] = requests

    if "tqdm" not in sys.modules:
        tqdm_module = types.ModuleType("tqdm")

        class _SealedTqdm:
            """`download_file.py` uses this as a context manager around a download."""

            def __init__(self, *_args, **_kwargs):
                raise _SealedHTTPError(
                    "Blind Flange sealed `tqdm` out of the OCR path — it is only reached "
                    "from RapidOCR's model downloader, which never runs here."
                )

        tqdm_module.tqdm = _SealedTqdm
        sys.modules["tqdm"] = tqdm_module

_engine = None
_engine_lock = threading.Lock()


class Finding(TypedDict):
    text: str
    bbox: dict[str, int]
    confidence: float


def _get_engine():
    """Build the RapidOCR engine once and reuse it.

    Construction loads three ONNX models and costs ~75 MB and most of a second, so a
    long-running service must not pay it per request. Guarded by a lock because server.py
    serves on a ThreadingHTTPServer and two concurrent first requests would otherwise
    build two engines.
    """
    global _engine
    if _engine is None:
        with _engine_lock:
            if _engine is None:
                _seal_out_geos()
                _seal_out_http()
                from rapidocr import RapidOCR

                _engine = RapidOCR()
    return _engine


def image_to_findings(image_bytes: bytes) -> list[Finding]:
    """Run OCR against raw image bytes and return one finding per detected text line.

    Raises PIL.UnidentifiedImageError for bytes that are not a decodable image — the
    server maps that to a 400 rather than letting it surface as a 500.
    """
    image = Image.open(io.BytesIO(image_bytes))
    return findings_from_image(image)


def findings_from_image(image: Image.Image) -> list[Finding]:
    """Run OCR against an already-decoded image.

    Split out from image_to_findings so the PDF path can hand this a page rendered
    straight from pypdfium2, rather than re-encoding it to bytes and back.
    """
    # RapidOCR reads RGB; a PDF page rendered by pypdfium2 arrives as RGBA and a scanned
    # PNG can be paletted or greyscale.
    if image.mode != "RGB":
        image = image.convert("RGB")

    result = _get_engine()(image)

    texts = list(result.txts or [])
    scores = list(result.scores or [])
    boxes = list(result.boxes if result.boxes is not None else [])

    findings: list[Finding] = []
    for text, score, box in zip(texts, scores, boxes):
        if not text.strip():
            continue
        # RapidOCR returns a four-point polygon, because detected text can be skewed and
        # the fixture is deliberately skewed. The contract is an axis-aligned rectangle:
        # take the polygon's extent, which is the crop FR10 needs to show.
        xs = [float(point[0]) for point in box]
        ys = [float(point[1]) for point in box]
        left, top = min(xs), min(ys)
        findings.append(
            {
                "text": text,
                "bbox": {
                    "left": int(left),
                    "top": int(top),
                    "width": int(max(xs) - left),
                    "height": int(max(ys) - top),
                },
                # RapidOCR scores 0-1; the contract is 0-100, unchanged from the Tesseract
                # implementation so the harness side reads one scale whichever engine runs.
                "confidence": round(float(score) * 100.0, 2),
            }
        )
    return findings
