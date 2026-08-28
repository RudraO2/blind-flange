"""Story 4.3 — the ingestion service's local HTTP boundary.

Deliberately stdlib-only (`http.server`), so the Node/Python line (NFR7, ADR-0003) carries
JSON and nothing else, and so this story adds no new dependency for the licence gate to
re-check beyond what Story 4.2 already pinned. Binds to 127.0.0.1 only — the harness is the
only intended caller, this is not a service meant to be reachable off the box.

Contract is written down in CONTRACT.md rather than only here, so the harness side can be
built against it without reading this file.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from PIL import UnidentifiedImageError
from pypdfium2 import PdfiumError

from ocr import image_to_findings
from pdf import pdf_to_findings

HOST = "127.0.0.1"
DEFAULT_PORT = 8642
MAX_BODY_BYTES = 25 * 1024 * 1024  # a 300 dpi scanned page is a few MB; 25 MB is generous headroom


class IngestionHandler(BaseHTTPRequestHandler):
    server_version = "BlindFlangeIngestion/0.1"

    def log_message(self, format: str, *args) -> None:  # noqa: A002 - stdlib signature
        pass  # the default logs to stderr on every request; the harness doesn't need that noise

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - stdlib method name
        if self.path == "/health":
            self._send_json(200, {"status": "ok"})
            return
        self._send_json(404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802 - stdlib method name
        if self.path == "/v1/ingest/image":
            self._handle_ingest_image()
        elif self.path == "/v1/ingest/pdf":
            self._handle_ingest_pdf()
        else:
            self._send_json(404, {"error": "not found"})

    def _read_body(self, max_bytes: int) -> bytes | None:
        # Read (and so drain from the socket) before any error response is sent. Responding
        # first and leaving the body unread lets Windows RST the connection out from under
        # the client while it is still reading that response.
        length = self.headers.get("Content-Length")
        if length is None:
            self._send_json(400, {"error": "Content-Length is required"})
            return None
        length = int(length)
        if length <= 0:
            self._send_json(400, {"error": "request body is empty"})
            return None
        if length > max_bytes:
            self._send_json(413, {"error": f"body exceeds {max_bytes} bytes"})
            return None
        return self.rfile.read(length)

    def _handle_ingest_image(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        body = self._read_body(MAX_BODY_BYTES)
        if body is None:
            return
        if not content_type.startswith("image/"):
            self._send_json(400, {"error": "Content-Type must be image/*"})
            return

        try:
            findings = image_to_findings(body)
        except UnidentifiedImageError:
            self._send_json(400, {"error": "body is not a decodable image"})
            return

        self._send_json(200, {"findings": findings})

    def _handle_ingest_pdf(self) -> None:
        content_type = self.headers.get("Content-Type", "")
        body = self._read_body(MAX_BODY_BYTES)
        if body is None:
            return
        if content_type != "application/pdf":
            self._send_json(400, {"error": "Content-Type must be application/pdf"})
            return

        try:
            findings = pdf_to_findings(body)
        except PdfiumError:
            self._send_json(400, {"error": "body is not a decodable PDF"})
            return

        self._send_json(200, {"findings": findings})


def main() -> None:
    port = int(os.environ.get("INGESTION_PORT", DEFAULT_PORT))
    httpd = ThreadingHTTPServer((HOST, port), IngestionHandler)
    print(f"ingestion service listening on http://{HOST}:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
