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

from pdf import RENDER_DPI

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
        payload = json.loads(resp.read())
        self.assertEqual(payload["status"], "ok")

        # `warm` and `renderDpi` were added on 30 August 2026 for the upload path. `warm`
        # tells the caller whether the first real request will pay ONNX Runtime's
        # shape-specialisation cost, which is several seconds and looks like a hang to
        # someone watching a demo; `renderDpi` means a caller never has to assume the
        # resolution its bounding boxes are in.
        #
        # False here is correct: this test starts the handler directly, so `main()`'s
        # startup warm-up never runs. Asserting field-by-field rather than on the whole
        # dict, so adding another advisory field to /health does not fail this test.
        self.assertIs(payload["warm"], False)
        self.assertEqual(payload["renderDpi"], 300)

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
        self.assertGreater(len(findings), 0, "expected at least one line finding")

        sample = findings[0]
        self.assertIn("text", sample)
        self.assertIn("bbox", sample)
        for key in ("left", "top", "width", "height"):
            self.assertIn(key, sample["bbox"])
            self.assertIsInstance(sample["bbox"][key], int)
        self.assertIn("confidence", sample)
        self.assertIsInstance(sample["confidence"], float)

        # The banner text from the fixture should be legible, per the OCR proof.
        all_text = " ".join(f["text"] for f in findings)
        self.assertIn("SYNTHETIC", all_text)

        # The report's own reference number, read exactly. This is the assertion that
        # would have caught the engine regressing: slashes, digits and a hyphen in one
        # token is precisely what Tesseract mangled and what RapidOCR reads at 1.000.
        # An inspection finding the agent cites is worthless if its reference is wrong.
        self.assertIn("NRC/RVF/INSP/2026-0417", all_text)

    def test_geos_is_never_loaded(self) -> None:
        """The LGPL-2.1 line must not be crossed by accident.

        RapidOCR's detector imports `shapely.geometry.Polygon`, and the shapely wheel
        bundles the GEOS shared libraries under LGPL-2.1 — outside the four permissive
        licences docs/licence-policy.md allows. ocr.py supplies the two polygon properties
        the detector actually uses and registers them under `shapely` before RapidOCR can
        import the real one. This asserts that seal held through a real OCR pass, so a
        future dependency bump that pulls shapely back in fails here rather than quietly
        putting a copyleft row on Story 6.4's attestation report.
        """
        import sys

        import ocr

        # Build the engine here rather than relying on another test having run first:
        # unittest orders alphabetically, and the seal is installed at engine construction.
        ocr._get_engine()

        geos_modules = [name for name in sys.modules if name.startswith("shapely.") and name != "shapely.geometry"]
        self.assertEqual(geos_modules, [], f"the real shapely was loaded: {geos_modules}")
        self.assertIs(
            sys.modules["shapely"].geometry.Polygon,
            ocr._Polygon,
            "shapely.geometry.Polygon is not our GEOS-free stub",
        )

    def test_http_client_is_never_loaded(self) -> None:
        """The MPL-2.0 line, and an HTTP client in an air-gapped product.

        RapidOCR imports `requests` and `tqdm` at module scope, from its model downloader
        and its load-image-from-URL branch. `requests` pulls in `certifi` (MPL-2.0) and
        `tqdm` is itself MPL-2.0 AND MIT — both outside the allow-list, and both weak
        copyleft rather than merely off-list. ocr.py registers raising stubs under those
        two names before RapidOCR can import the real ones (ADR-0006, Story 6.4).

        Asserts two things: the real packages never loaded, and the stubs are the raising
        kind. A dependency bump that moves real work behind those imports fails here.
        """
        import sys

        import ocr

        ocr._get_engine()

        for name in ("certifi", "urllib3", "idna"):
            self.assertNotIn(name, sys.modules, f"the real requests stack was loaded: {name}")
        for name in ("requests", "tqdm"):
            self.assertFalse(
                hasattr(sys.modules[name], "__file__"),
                f"{name} is the real package, not our stub — the seal did not hold",
            )
        with self.assertRaises(ocr._SealedHTTPError):
            sys.modules["requests"].get("http://example.invalid")
        with self.assertRaises(ocr._SealedHTTPError):
            sys.modules["tqdm"].tqdm(total=1)

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
        self.assertGreater(len(findings), 0, "expected at least one line finding")

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


class RenderPageTest(IngestionServiceTest):
    """`POST /v1/render/page`, added 30 August 2026 for the provenance crop.

    A crop is only evidence if it comes from the page the claim was read from, and for a
    document a judge uploaded no such image exists until something renders it. Node has no
    PDF renderer; pypdfium2 lives here.

    The property worth guarding is that the rendered page and the findings' bounding boxes
    share one coordinate space. A page rendered at a different resolution than the boxes
    were measured at yields a crop that is offset — and an offset crop still looks like a
    crop, so nothing downstream would complain.
    """

    def test_render_pdf_page_matches_the_ocr_coordinate_space(self) -> None:
        pdf_bytes = (FIXTURE.parent / "sample-inspection-report.pdf").read_bytes()

        conn = self._client()
        conn.request(
            "POST",
            "/v1/render/page?page=1",
            body=pdf_bytes,
            headers={"Content-Type": "application/pdf", "Content-Length": str(len(pdf_bytes))},
        )
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        self.assertEqual(resp.getheader("Content-Type"), "image/png")
        # Reported rather than left to be assumed by the caller.
        self.assertEqual(resp.getheader("X-Render-Dpi"), str(RENDER_DPI))
        png = resp.read()
        self.assertEqual(png[:8], b"\x89PNG\r\n\x1a\n")

        # Every bounding box OCR produced for page 1 must fit inside the page rendered for
        # the crop. This is the assertion that would have caught the 200 dpi change that was
        # briefly shipped and reverted the same day.
        width = int.from_bytes(png[16:20], "big")
        height = int.from_bytes(png[20:24], "big")

        conn = self._client()
        conn.request(
            "POST",
            "/v1/ingest/pdf",
            body=pdf_bytes,
            headers={"Content-Type": "application/pdf", "Content-Length": str(len(pdf_bytes))},
        )
        findings = json.loads(conn.getresponse().read())["findings"]
        page_one = [f for f in findings if f["page"] == 1]
        self.assertGreater(len(page_one), 20)
        for finding in page_one:
            box = finding["bbox"]
            self.assertGreaterEqual(box["left"], 0)
            self.assertGreaterEqual(box["top"], 0)
            self.assertLessEqual(box["left"] + box["width"], width, f"box escapes the page: {finding['text']!r}")
            self.assertLessEqual(box["top"] + box["height"], height, f"box escapes the page: {finding['text']!r}")

    def test_render_image_is_page_one_only(self) -> None:
        image_bytes = FIXTURE.read_bytes()
        for page, expected in ((1, 200), (2, 404)):
            conn = self._client()
            conn.request(
                "POST",
                f"/v1/render/page?page={page}",
                body=image_bytes,
                headers={"Content-Type": "image/png", "Content-Length": str(len(image_bytes))},
            )
            self.assertEqual(conn.getresponse().status, expected, f"page {page}")

    def test_render_rejects_a_page_outside_the_document_and_a_bad_page_number(self) -> None:
        pdf_bytes = (FIXTURE.parent / "sample-inspection-report.pdf").read_bytes()
        for query, expected in (("page=99", 404), ("page=0", 400), ("page=abc", 400)):
            conn = self._client()
            conn.request(
                "POST",
                f"/v1/render/page?{query}",
                body=pdf_bytes,
                headers={"Content-Type": "application/pdf", "Content-Length": str(len(pdf_bytes))},
            )
            self.assertEqual(conn.getresponse().status, expected, query)
