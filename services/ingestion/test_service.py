"""Story 4.3 verification — exercises the contract end to end, over real local HTTP.

Stdlib only (`unittest`, `http.client`), deliberately, for the same reason server.py is
stdlib-only: this story should not need a new dependency to prove itself. Run with:

    python services/ingestion/test_service.py

Starts the real server on a background thread against the Story 4.1 fixture, so this is a
genuine HTTP round trip, not a call into the handler class.
"""

from __future__ import annotations

import http.client
import json
import threading
import time
import unittest
from pathlib import Path

from server import HOST, IngestionHandler
from http.server import ThreadingHTTPServer

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample-inspection-report-p1.png"
PDF_FIXTURE = Path(__file__).resolve().parent / "fixtures" / "sample-inspection-report.pdf"
TEST_PORT = 8643


class IngestionServiceTest(unittest.TestCase):
    httpd: ThreadingHTTPServer
    thread: threading.Thread

    @classmethod
    def setUpClass(cls) -> None:
        cls.httpd = ThreadingHTTPServer((HOST, TEST_PORT), IngestionHandler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        time.sleep(0.1)  # give the listener socket a moment to come up

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)

    def _client(self) -> http.client.HTTPConnection:
        return http.client.HTTPConnection(HOST, TEST_PORT, timeout=30)

    def test_health(self) -> None:
        conn = self._client()
        conn.request("GET", "/health")
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        self.assertEqual(json.loads(resp.read()), {"status": "ok"})

    def test_ingest_image_returns_findings_with_bbox_and_confidence(self) -> None:
        image_bytes = FIXTURE.read_bytes()
        conn = self._client()
        conn.request(
            "POST",
            "/v1/ingest/image",
            body=image_bytes,
            headers={"Content-Type": "image/png", "Content-Length": str(len(image_bytes))},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.read())

        self.assertIn("findings", body)
        findings = body["findings"]
        self.assertGreater(len(findings), 0, "expected at least one word finding")

        sample = findings[0]
        self.assertIn("text", sample)
        self.assertIn("bbox", sample)
        for key in ("left", "top", "width", "height"):
            self.assertIn(key, sample["bbox"])
            self.assertIsInstance(sample["bbox"][key], int)
        self.assertIn("confidence", sample)
        self.assertIsInstance(sample["confidence"], float)

        # The banner text from the fixture should be legible, per Story 4.2's own proof.
        all_text = " ".join(f["text"] for f in findings)
        self.assertIn("SYNTHETIC", all_text)

    def test_ingest_rejects_non_image_content_type(self) -> None:
        conn = self._client()
        payload = b"not an image"
        conn.request(
            "POST",
            "/v1/ingest/image",
            body=payload,
            headers={"Content-Type": "text/plain", "Content-Length": str(len(payload))},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 400)
        resp.read()

    def test_ingest_rejects_undecodable_image_bytes(self) -> None:
        conn = self._client()
        payload = b"\x89PNGnot-actually-png-data"
        conn.request(
            "POST",
            "/v1/ingest/image",
            body=payload,
            headers={"Content-Type": "image/png", "Content-Length": str(len(payload))},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 400)
        resp.read()


    def test_ingest_pdf_returns_findings_with_page_numbers(self) -> None:
        pdf_bytes = PDF_FIXTURE.read_bytes()
        conn = self._client()
        conn.request(
            "POST",
            "/v1/ingest/pdf",
            body=pdf_bytes,
            headers={"Content-Type": "application/pdf", "Content-Length": str(len(pdf_bytes))},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        body = json.loads(resp.read())

        findings = body["findings"]
        self.assertGreater(len(findings), 0, "expected at least one word finding")

        sample = findings[0]
        for key in ("text", "bbox", "confidence", "page"):
            self.assertIn(key, sample)
        self.assertIsInstance(sample["page"], int)

        pages_seen = {f["page"] for f in findings}
        self.assertEqual(pages_seen, {1, 2}, "the fixture PDF has two pages")

        # Page 1's own banner text should still be legible after the pdfium render step,
        # per the same proof Story 4.2 ran against the plain image.
        page_1_text = " ".join(f["text"] for f in findings if f["page"] == 1)
        self.assertIn("SYNTHETIC", page_1_text)

    def test_ingest_pdf_rejects_non_pdf_content_type(self) -> None:
        conn = self._client()
        payload = b"not a pdf"
        conn.request(
            "POST",
            "/v1/ingest/pdf",
            body=payload,
            headers={"Content-Type": "image/png", "Content-Length": str(len(payload))},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 400)
        resp.read()

    def test_ingest_pdf_rejects_undecodable_pdf_bytes(self) -> None:
        conn = self._client()
        payload = b"%PDF-not-actually-a-pdf"
        conn.request(
            "POST",
            "/v1/ingest/pdf",
            body=payload,
            headers={"Content-Type": "application/pdf", "Content-Length": str(len(payload))},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 400)
        resp.read()


if __name__ == "__main__":
    unittest.main()
