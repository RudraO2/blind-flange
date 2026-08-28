# Ingestion service — HTTP contract

Story 4.3. Written down so the harness side (Node) can be built against this without
reading the Python. `NFR7`: the boundary is local HTTP, JSON only — no Python object ever
crosses it.

Base URL: `http://127.0.0.1:8642` (override the port with the `INGESTION_PORT` env var the
service reads at startup). Bound to `127.0.0.1` only — not reachable off the box.

## `GET /health`

Liveness probe.

**Response `200`**
```json
{"status": "ok"}
```

## `POST /v1/ingest/image`

Runs OCR against one scanned page image and returns line-level findings.

**Request**
- Header `Content-Type: image/png` or `image/jpeg` (or another `image/*` Pillow can decode)
- Header `Content-Length` (required)
- Body: the raw image bytes, not multipart, not base64

**Response `200`**
```json
{
  "findings": [
    {
      "text": "Report no. NRC/RVF/INSP/2026-0417",
      "bbox": {"left": 199, "top": 505, "width": 792, "height": 58},
      "confidence": 99.97
    }
  ]
}
```
- `findings` is a flat array, one entry per detected text **line**. No grouping into
  paragraphs — that is left to whichever caller needs it, so the contract stays the
  smallest thing that satisfies FR9's first half (bounding box and confidence per finding).

  Lines, not words: FR10 shows the crop a finding was read from, and a crop of one word is
  not evidence a human can check. This changed on 28 Aug 2026 with the engine swap from
  Tesseract, which returned words, to RapidOCR, which returns lines.
- `bbox` is in source-image pixel coordinates, top-left origin —
  `left`/`top`/`width`/`height`, not `x1,y1,x2,y2`. RapidOCR detects a four-point polygon,
  because scanned text can be skewed and the fixture deliberately is; the rectangle here is
  that polygon's extent, which is the crop FR10 needs to draw.
- `confidence` is a float on a **0–100** scale. RapidOCR scores 0–1 natively and `ocr.py`
  scales it, deliberately: the scale is the contract's, not the engine's, so the harness
  side reads one number whichever engine is behind it.
- **Page number is not in this contract.** Story 4.3 is single-image only; Story 4.4 adds
  the PDF path and is where `page` joins each finding.

**Error responses**

| Status | Body | When |
|---|---|---|
| `400` | `{"error": "Content-Type must be image/*"}` | wrong or missing `Content-Type` |
| `400` | `{"error": "Content-Length is required"}` | no `Content-Length` header |
| `400` | `{"error": "request body is empty"}` | `Content-Length: 0` |
| `400` | `{"error": "body is not a decodable image"}` | bytes are not an image Pillow can open |
| `413` | `{"error": "body exceeds 26214400 bytes"}` | body over 25 MB |
| `404` | `{"error": "not found"}` | any other path or method |

## `POST /v1/ingest/pdf`

Story 4.4. Renders every page of a scanned, multi-page PDF with `pypdfium2` and runs each
page through the same OCR path as `/v1/ingest/image`.

**Request**
- Header `Content-Type: application/pdf`
- Header `Content-Length` (required)
- Body: the raw PDF bytes

**Response `200`**
```json
{
  "findings": [
    {
      "text": "Report no. NRC/RVF/INSP/2026-0417",
      "bbox": {"left": 199, "top": 505, "width": 792, "height": 58},
      "confidence": 99.97,
      "page": 1
    }
  ]
}
```
- Same shape as `/v1/ingest/image`'s findings, plus **`page`**, 1-indexed, completing FR9's
  bounding-box-and-confidence-and-page requirement.
- `findings` is a flat array across the whole document, in page order; grouping by page is
  left to the caller.
- Pages are rendered at 300 dpi, matching the fixture PDF (`fixtures/README.md`) and the
  resolution the engine proofs measured against, so `bbox` pixel coordinates carry the
  same meaning as the image endpoint's.

**Error responses**

| Status | Body | When |
|---|---|---|
| `400` | `{"error": "Content-Type must be application/pdf"}` | wrong or missing `Content-Type` |
| `400` | `{"error": "Content-Length is required"}` | no `Content-Length` header |
| `400` | `{"error": "request body is empty"}` | `Content-Length: 0` |
| `400` | `{"error": "body is not a decodable PDF"}` | bytes are not a PDF `pypdfium2` can open |
| `413` | `{"error": "body exceeds 26214400 bytes"}` | body over 25 MB |
| `404` | `{"error": "not found"}` | any other path or method |

## What is deliberately not in this contract

- **No auth.** The service is loopback-only; the harness process is the only intended
  caller. Revisit if that stops being true.
- **No batching on `/v1/ingest/image`.** One image per request. `/v1/ingest/pdf` (Story
  4.4) is the multi-page path — it renders every page itself and returns one combined
  findings array rather than asking the caller to call the image endpoint per page.
- **No streaming / partial results.** The engine runs to completion (proved fast enough on
  this hardware in Story 4.2 — 2.49 s for a full page) before the response is sent.

## Running it

```
python services/ingestion/server.py
```

Reads `INGESTION_PORT` (defaults to `8642`). Requires only `pip install -r requirements.txt`:
RapidOCR ships its ONNX models inside the wheel, so there is no separate binary to install and
nothing is fetched at first run (`proof/PROOF-RAPIDOCR.md`) —
this service never downloads a model at runtime (NFR2).
