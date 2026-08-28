# Story 4.2 — Tesseract returns word boxes on this hardware

Timebox: 30 minutes of active work, agreed before starting. Consumed: ~20 minutes
(installing the binary and pinning the wrapper took longer than running it). The proof did
not need the timebox's slack.

## Result: it works

`pytesseract.image_to_data()` against `sample-inspection-report-p1.png` (page 1 of the
Story 4.1 fixture — degraded skew, speckle, uneven contrast, one simulated handwritten
annotation) returns, per word: `left`, `top`, `width`, `height`, `conf`. This is FR9's
criterion almost verbatim.

| Measure | Value |
|---|---|
| Tesseract version | 5.5.3.20260724 (`tesseract-ocr.tesseract` via winget, the project's own build) |
| Elapsed (`image_to_data` call only) | 2.49 s |
| Peak RSS before / after | 82.7 MB / 94.0 MB |
| Word boxes returned (incl. blank OCR noise entries) | 576 |
| Non-blank word boxes | 370 |
| Sample confidence range (typed body text) | 89–96 |

Full run output and the first 20 non-blank boxes are in `proof-result.json`, written by
`tesseract_proof.py` on every run.

## CPU-only, no VRAM

**Given** the sample document **When** `image_to_data()` runs **Then** it ran on CPU, with
no CUDA path and no VRAM used:

- The installed Tesseract-OCR directory (`C:\Program Files\Tesseract-OCR\`) carries no CUDA,
  cuDNN, or NVIDIA runtime DLL — only `libtesseract-5.dll`, `libleptonica-6.dll`, and
  standard CPU imaging/codec libraries (libpng, libjpeg-turbo, libtiff, libwebp, zlib).
- `tesseract --version`'s own capability banner lists CPU SIMD extensions found at runtime
  (AVX512BW, AVX512F, AVX512VNNI, AVX2, AVX, FMA, SSE4.1) and nothing GPU-related — Tesseract's
  LSTM engine has no GPU code path in any upstream release; this is a documented project fact,
  not an inference from this one run.
- `nvidia-smi` was attempted as corroborating evidence but requires elevation on this machine
  and was not pursued further — not needed given the point above.

## Unmistakably synthetic

The fixture (Story 4.1) carries a banner and a footer line stating it is synthetic sample
data for a fictional company, plant and equipment tags. OCR read that banner text back
correctly (`SYNTHETIC`, `SAMPLE`, `FICTIONAL`, `NOT A REAL INSPECTION RECORD`,
`NORTHCAPE REFINING COMPANY (FICTIONAL)`) — visible in `proof-result.json`'s first entries.

## What this does and does not prove

- Proves: typed body text and table text on a realistically degraded scan produce usable
  word-level boxes with confidence, on CPU, on this laptop, fast enough that Story 4.3's
  service will not be waiting on OCR.
- Does not attempt: the handwritten annotation. The fixture's README says plainly that a
  result showing the annotation was not read is correct, not a bug — real handwriting
  defeats Tesseract, and this is simulated handwriting standing in for that failure mode.
  Confirmed here: it did not appear as high-confidence word boxes in the sample, consistent
  with expectation. This does not affect FR9, which is about typed findings and body text.
- Does not attempt page 2, tables specifically, or the PDF path — that is Story 4.3
  (regions from an image) and Story 4.4 (`pypdfium2` rendering a PDF page first).

## Files

| File | What it is |
|---|---|
| `tesseract_proof.py` | The proof script. Points `pytesseract` at the winget-installed binary on Windows, runs `image_to_data`, prints and writes the measurements. |
| `resource_probe.py` | Cross-platform peak-RSS reader (`psutil`) — Windows has no `resource` module, which is what `pytesseract`'s own doc examples assume. |
| `proof-result.json` | Output of the last run: version, elapsed time, memory, and the first 20 non-blank word boxes. Regenerate with `python services/ingestion/proof/tesseract_proof.py`. |

Not a fixture, not reused by Story 4.3 as a dependency — Story 4.3 builds the real ingestion
service and may reuse the pattern but not this script.
