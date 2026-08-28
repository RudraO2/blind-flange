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

Runs OCR against one scanned page image and returns word-level findings.

**Request**
- Header `Content-Type: image/png` or `image/jpeg` (or another `image/*` Pillow can decode)
- Header `Content-Length` (required)
- Body: the raw image bytes, not multipart, not base64

**Response `200`**
```json
{
  "findings": [
    {
      "text": "VESSEL",
      "bbox": {"left": 412, "top": 88, "width": 210, "height": 34},
      "confidence": 94.5
    }
  ]
}
```
- `findings` is a flat array, one entry per non-blank OCR word. No grouping into lines or
  paragraphs — that is left to whichever caller needs it, so the contract stays the
  smallest thing that satisfies FR9's first half (bounding box and confidence per finding).
- `bbox` is in source-image pixel coordinates, top-left origin, matching what
  `pytesseract.image_to_data()` returns — `left`/`top`/`width`/`height`, not `x1,y1,x2,y2`.
- `confidence` is Tesseract's own 0–100 word confidence, as a float. Tesseract's `-1` rows
  (structural boxes with no text) are filtered out before this response is built — every
  entry in `findings` is a real word.
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
      "text": "VESSEL",
      "bbox": {"left": 412, "top": 88, "width": 210, "height": 34},
      "confidence": 94.5,
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
  resolution Story 4.2 measured Tesseract against, so `bbox` pixel coordinates carry the
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
- **No streaming / partial results.** Tesseract runs to completion (proved fast enough on
  this hardware in Story 4.2 — 2.49 s for a full page) before the response is sent.

## Running it

```
python services/ingestion/server.py
```

Reads `INGESTION_PORT` (defaults to `8642`). Requires the Tesseract binary already
installed on the host (Story 4.2: `winget install tesseract-ocr.tesseract` on Windows) —
this service never downloads a model at runtime (NFR2).
