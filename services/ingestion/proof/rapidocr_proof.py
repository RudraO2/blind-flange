"""Proof that RapidOCR reads the fixture without ever reaching the network.

RapidOCR ships its three ONNX models inside the pip wheel, but it also carries a
`download_file` path that fetches a model when one is missing. On a machine that has never
run it, that path is what would reach out — and this product's whole claim is that it does
not. So this proof does not ask politely: it blocks every non-loopback socket at the Python
level, then runs a full OCR pass. If any download were attempted, the connect would raise
and the run would fail loudly rather than silently succeeding on a machine that happened to
be online.

Run once and read the numbers into ../PROOF-RAPIDOCR.md rather than trusting a stale log.
Not imported by the service — ocr.py is what the service uses.
"""

from __future__ import annotations

import json
import socket
import sys
import time
from pathlib import Path

import resource_probe

FIXTURE = Path(__file__).resolve().parent.parent / "fixtures" / "sample-inspection-report-p1.png"
RESULT = Path(__file__).resolve().parent / "rapidocr-proof-result.json"

_LOOPBACK = {"127.0.0.1", "::1", "localhost"}


class EgressAttempted(AssertionError):
    """Raised the moment anything tries to open a non-loopback socket."""


def seal_the_network() -> list[str]:
    """Replace socket connect with one that refuses anything off this machine.

    Returns the list attempts are recorded into, so a failure names the host it wanted.
    Loopback stays open: this proof is about egress, and blocking it would break unrelated
    machinery rather than prove anything.
    """
    attempts: list[str] = []
    real_connect = socket.socket.connect
    real_connect_ex = socket.socket.connect_ex

    def guard(address: object) -> str | None:
        if isinstance(address, tuple) and address:
            host = str(address[0])
            if host not in _LOOPBACK:
                attempts.append(host)
                return host
        return None

    def connect(self: socket.socket, address: object) -> None:
        host = guard(address)
        if host is not None:
            raise EgressAttempted(f"RapidOCR tried to reach {host}")
        real_connect(self, address)

    def connect_ex(self: socket.socket, address: object) -> int:
        host = guard(address)
        if host is not None:
            raise EgressAttempted(f"RapidOCR tried to reach {host}")
        return real_connect_ex(self, address)

    socket.socket.connect = connect  # type: ignore[method-assign]
    socket.socket.connect_ex = connect_ex  # type: ignore[method-assign]
    # getaddrinfo too: a resolver lookup is an outbound packet even if no connect follows.
    real_getaddrinfo = socket.getaddrinfo

    def getaddrinfo(host, *args, **kwargs):  # type: ignore[no-untyped-def]
        if str(host) not in _LOOPBACK:
            attempts.append(str(host))
            raise EgressAttempted(f"RapidOCR tried to resolve {host}")
        return real_getaddrinfo(host, *args, **kwargs)

    socket.getaddrinfo = getaddrinfo  # type: ignore[assignment]
    return attempts


def main() -> None:
    if not FIXTURE.exists():
        print(f"fixture not found: {FIXTURE}", file=sys.stderr)
        sys.exit(1)

    attempts = seal_the_network()

    # Imported after the seal, so even import-time model resolution is covered. This goes
    # through ocr.py rather than RapidOCR directly, deliberately: the claim is about the
    # path the service actually runs, including its GEOS-free shapely stub, not about a
    # differently-configured engine that happens to behave.
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    import ocr

    before = resource_probe.peak_rss_mb()
    ocr._get_engine()
    after_load = resource_probe.peak_rss_mb()

    start = time.perf_counter()
    findings = ocr.image_to_findings(FIXTURE.read_bytes())
    elapsed = time.perf_counter() - start
    peak = resource_probe.peak_rss_mb()

    scores = [float(finding["confidence"]) / 100.0 for finding in findings]
    regions = [
        {"text": finding["text"], "bbox": finding["bbox"], "confidence": round(float(finding["confidence"]) / 100.0, 4)}
        for finding in findings
    ]

    geos_loaded = [name for name in sys.modules if name.startswith("shapely.") and name != "shapely.geometry"]

    payload = {
        "fixture": FIXTURE.name,
        "egress_attempts": attempts,
        "geos_modules_loaded": geos_loaded,
        "rss_before_mb": round(before, 1),
        "rss_after_model_load_mb": round(after_load, 1),
        "rss_peak_mb": round(peak, 1),
        "elapsed_seconds": round(elapsed, 2),
        "regions_returned": len(regions),
        "confidence_min": round(min(scores), 4) if scores else None,
        "confidence_max": round(max(scores), 4) if scores else None,
        "confidence_mean": round(sum(scores) / len(scores), 4) if scores else None,
        "first_regions": regions[:20],
    }
    RESULT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"egress attempts: {attempts or 'none'}")
    print(f"GEOS (LGPL-2.1) modules loaded: {geos_loaded or 'none'}")
    print(f"regions: {len(regions)}  elapsed: {elapsed:.2f}s  peak RSS: {peak:.1f} MB")
    print(f"confidence: min {min(scores):.4f}  mean {sum(scores) / len(scores):.4f}")
    print(f"written: {RESULT}")

    if attempts:
        print("FAILED: RapidOCR reached for the network", file=sys.stderr)
        sys.exit(1)
    if geos_loaded:
        print("FAILED: the real shapely loaded, pulling GEOS (LGPL-2.1) into the process", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
