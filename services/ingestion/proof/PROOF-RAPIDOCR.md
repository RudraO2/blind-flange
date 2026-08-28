# RapidOCR — accuracy, cost, and no network

Replaces Tesseract as the ingestion engine, 28 August 2026. `PROOF.md` beside this file is
the Tesseract proof and stays: it is the baseline these numbers are measured against, and
Tesseract remains the fallback if the licence question below closes the wrong way.

## Why swap at all

Tesseract worked. It returned word boxes with confidence, on CPU, in 2.49 s. The problem was
*what* it read. An inspection report is made of reference numbers, procedure codes and
equipment tags — `NRC/RVF/INSP/2026-0417`, `NRC-INS-STD-014 Rev 3`, `V-2201-A` — and a token
with slashes, digits and mixed case is exactly where Tesseract's LSTM is weakest. A finding
the agent cites with a mangled reference number is worse than no finding: it looks authoritative
and it is wrong.

| Measure | Tesseract 5.5.3 | RapidOCR 3.9.2 |
|---|---|---|
| Confidence, mean | 0.89–0.96 (typed body text) | **0.9968** |
| Confidence, min | — | 0.9745 |
| Elapsed | 2.49 s | 3.63 s |
| Peak RSS | 94.0 MB | 212.9 MB |
| VRAM | 0 | **0** |
| Units returned | 370 word boxes | 97 line boxes |
| `NRC/RVF/INSP/2026-0417` | mangled | **read exactly, 1.000** |

Both on `sample-inspection-report-p1.png` — the Story 4.1 fixture, deliberately degraded with
skew, speckle and uneven contrast.

2.3× the memory and 1.5× the time, on a machine with 15.7 GB of RAM. That is not a real cost.

## Lines, not words

Tesseract returned one finding per word; RapidOCR returns one per detected line. This is an
improvement, not a compromise. FR9 asks for a bounding box per extracted claim and FR10 shows
the crop that claim was read from — and a crop of a single word is not evidence a human can
check. A crop of the line it sat in is. `test_service.py` asserts the reference number survives
the round trip for exactly this reason.

## No network — proved, not assumed

RapidOCR ships its three ONNX models inside the pip wheel, but it also carries a `download_file`
path that fetches a model when one is missing. On a machine that has never run it, that path is
what would reach out. This product's entire claim is that nothing does.

`rapidocr_proof.py` does not check politely. Before importing RapidOCR at all, it replaces
`socket.socket.connect`, `connect_ex` and `socket.getaddrinfo` with versions that raise on any
non-loopback address — a DNS lookup counts, since a resolver query is an outbound packet even
when no connection follows. Then it runs a full OCR pass.

**Result: `egress_attempts: []`, `geos_modules_loaded: []`.** 97 regions returned, no
connection attempted, no name resolved, no LGPL library loaded. The proof runs through
`ocr.py` rather than RapidOCR directly, so what it measures is the path the service actually
takes. Regenerate with:

```sh
python services/ingestion/proof/rapidocr_proof.py
```

It exits non-zero if anything reaches out, so it is safe to wire into a gate later.

Loopback is deliberately left open: this proves *egress*, and sealing loopback would break
unrelated machinery without proving anything.

## GEOS was found and removed, not accepted

RapidOCR's detector does `from shapely.geometry import Polygon`, and the `shapely` wheel
bundles GEOS as `geos-*.dll` / `geos_c-*.dll` under **LGPL-2.1** — weak copyleft, a different
category from anything else in this tree. `shapely._geos` and `shapely.lib` were confirmed
loaded during a real OCR pass, so this was live, not theoretical.

The detector uses `Polygon` for exactly two properties, `.area` and `.length`, to size the
unclip offset around a detected text box. `ocr.py` supplies both — the shoelace formula and
the sum of the edge lengths, about ten lines of numpy — and registers them under `shapely`
in `sys.modules` before RapidOCR can import the real package. Verified identical: 97 regions,
mean confidence 0.9968, same texts and same scores as the GEOS-backed run.

`shapely` is then uninstalled. `requirements.txt` does not pin it and says why;
`test_service.py::test_geos_is_never_loaded` and this proof both fail if it comes back.

**No LGPL code is linked, loaded, or shipped.**

## Open question — the Boost Software License

**This is not resolved, and Story 6.4 must resolve it before the licence claim is made.**

RapidOCR's detection post-processing needs `pyclipper`. The Python wrapper is MIT, but it
embeds the Clipper C++ library, and pyclipper's own README says:

> - Pyclipper is available under MIT license.
> - The core Clipper library is available under Boost Software License. Freeware for both
>   open source and commercial applications.

**BSL-1.0 is not one of the four licences `docs/licence-policy.md` allows.** It is genuinely
permissive — arguably more so than MIT, since it waives the attribution requirement for binary
distribution — and it is not a legal hazard. But `CLAUDE.md` is explicit that widening the
allow-list is an ADR-level decision and never a judgement call made at the point of use, and
no ADR has been written.

The swap was made on 28 Aug 2026 with this known and deliberately deferred, on the call of the
project owner. Two ways it can close:

1. **ADR-0006 widens the allow-list to five licences**, adding BSL-1.0 with its reasoning
   written down, the same way ADR-0005 widened it from two to four. The attestation report
   then carries five rows.
2. **The swap is reverted to Tesseract.** `ocr.py` is the only file that changes — `pdf.py`
   and `server.py` call `findings_from_image` and never touch the engine — and `PROOF.md`
   still holds the numbers that justified it. This is why that file was kept.

`pyclipper` does the actual polygon offsetting, which is real computational geometry and not
ten lines of numpy — so unlike GEOS it cannot simply be replaced, and it stays.

Nothing else in the dependency set is in question. Every other package resolves to a licence
already on the list; `../LICENCES.md` records each with its pinned version.

## Pinned versions

| Package | Version | Licence |
|---|---|---|
| `rapidocr` | 3.9.2 | Apache-2.0 |
| `onnxruntime` | 1.24.4 | MIT |
| `omegaconf` | 2.3.1 | BSD-3-Clause |
| `antlr4-python3-runtime` | 4.9.3 | BSD-3-Clause |
| `colorlog` | 6.12.0 | MIT |
| `pyclipper` | 1.4.0 | MIT wrapper, **BSL-1.0 core — open** |
| ~~`shapely`~~ | ~~2.1.2~~ | ~~BSD-3-Clause wrapper, **LGPL-2.1 GEOS**~~ — removed, see above |

Models bundled in the wheel: `PP-OCRv6_det_small.onnx`, `PP-OCRv6_rec_small.onnx`,
`ch_ppocr_mobile_v2.0_cls_mobile.onnx`. PaddleOCR upstream is Apache-2.0.

## Files

| File | What it is |
|---|---|
| `rapidocr_proof.py` | The proof script. Seals the network, runs a full pass, writes the measurements, exits non-zero on any egress attempt. |
| `rapidocr-proof-result.json` | Output of the last run: egress attempts, memory, timing, and the first 20 regions with boxes and confidence. |
| `resource_probe.py` | Cross-platform peak-RSS reader. Shared with the Tesseract proof. |
| `PROOF.md` | The Tesseract baseline. Kept — it is the fallback's evidence. |
