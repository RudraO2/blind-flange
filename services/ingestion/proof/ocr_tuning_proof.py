"""Ticket 05, part two: where the OCR time actually goes, and what buys it back.

`dpi_latency_proof.py` disproved the obvious lever. Rendering is 0.6s of 15s and the
recognised line count is identical at every resolution, because RapidOCR's own
`Global.max_side_len: 2000` caps the working image at roughly 170 dpi on an A4 page — so
rendering at 300 dpi does triple the rasterising work and then throws the pixels away.

The cost is 156 recognition passes, not resolution. So the knobs worth sweeping are the
ones that change how those passes run:

  Global.use_cls                     the PP-OCRv4 angle classifier — a whole extra model
                                     pass over every detected line. The fixture is skewed,
                                     not upside-down, so this may be paying for nothing.
  Rec.rec_batch_num                  recognition batch size, default 6 against 6 cores.
  EngineConfig.onnxruntime.
    intra_op_num_threads             defaults to -1, i.e. ORT's own choice.

Accuracy is judged the same way as part one: diff the recognised text against the
committed 300 dpi capture and name what changed. A configuration that is faster and
mangles an equipment tag is not a win.

Run: .venv\\Scripts\\python.exe proof\\ocr_tuning_proof.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVICE = HERE.parent
REPO = SERVICE.parent.parent
sys.path.insert(0, str(SERVICE))

import pypdfium2 as pdfium  # noqa: E402
from PIL import Image  # noqa: E402

# Reuse the production module's GEOS and HTTP seals rather than reimplementing them —
# importing RapidOCR without them pulls in LGPL-2.1 GEOS (ADR-0006, ocr.py).
import ocr as ocr_module  # noqa: E402

FIXTURE = SERVICE / "fixtures" / "sample-inspection-report.pdf"
CAPTURE = REPO / "plugins" / "dsh-client-ui-base" / "lib" / "findings" / "sample-report-findings.json"

# 200 dpi: part one showed it is as accurate as 300 on every tag and slightly cheaper to
# rasterise, and it sits just above RapidOCR's own 2000px working ceiling.
RENDER_DPI = 200

CONFIGS = [
	("baseline (as shipped)", {}),
	("cls off", {"Global.use_cls": False}),
	("cls off + batch 16", {"Global.use_cls": False, "Rec.rec_batch_num": 16}),
	(
		"cls off + batch 16 + 6 threads",
		{
			"Global.use_cls": False,
			"Rec.rec_batch_num": 16,
			"EngineConfig.onnxruntime.intra_op_num_threads": 6,
		},
	),
	(
		"cls off + batch 32 + 6 threads",
		{
			"Global.use_cls": False,
			"Rec.rec_batch_num": 32,
			"EngineConfig.onnxruntime.intra_op_num_threads": 6,
		},
	),
]


def build_engine(params: dict):
	"""A fresh engine per configuration — the production module memoises one globally."""
	ocr_module._seal_out_geos()
	ocr_module._seal_out_http()
	from rapidocr import RapidOCR

	return RapidOCR(params=params) if params else RapidOCR()


def render_pages(pdf_bytes: bytes, dpi: int) -> list[Image.Image]:
	"""Rasterise once and reuse, so each configuration is charged only for OCR."""
	scale = dpi / 72.0
	pages: list[Image.Image] = []
	pdf = pdfium.PdfDocument(pdf_bytes)
	try:
		for index in range(len(pdf)):
			page = pdf[index]
			try:
				bitmap = page.render(scale=scale)
				try:
					pages.append(bitmap.to_pil().convert("RGB"))
				finally:
					bitmap.close()
			finally:
				page.close()
	finally:
		pdf.close()
	return pages


def read(engine, pages: list[Image.Image]):
	"""Mirror `ocr.findings_from_image`'s extraction, timing each page."""
	texts: list[str] = []
	confidences: list[float] = []
	per_page: list[float] = []
	for page in pages:
		started = time.perf_counter()
		result = engine(page)
		per_page.append(time.perf_counter() - started)
		for text, score in zip(list(result.txts or []), list(result.scores or [])):
			if not text.strip():
				continue
			texts.append(text.strip())
			confidences.append(float(score) * 100.0)
	return texts, confidences, per_page


def main() -> int:
	if not FIXTURE.exists():
		print(f"missing fixture: {FIXTURE}")
		return 1

	captured = json.loads(CAPTURE.read_text(encoding="utf-8"))
	# The committed capture is a bare array; tolerate the wrapped shape the HTTP contract uses.
	entries = captured["findings"] if isinstance(captured, dict) else captured
	baseline_texts = [str(f["text"]).strip() for f in entries]
	baseline_set = set(baseline_texts)
	print(f"baseline: committed 300 dpi capture, {len(baseline_texts)} lines")
	print(f"rendering both pages once at {RENDER_DPI} dpi\n")

	pages = render_pages(FIXTURE.read_bytes(), RENDER_DPI)
	print(f"page sizes: {[p.size for p in pages]}\n")

	results = []
	for label, params in CONFIGS:
		engine = build_engine(params)
		read(engine, pages[:1])  # warm this engine's graph before timing it
		texts, confidences, per_page = read(engine, pages)
		matched = sum(1 for t in texts if t in baseline_set)
		results.append(
			{
				"label": label,
				"total": sum(per_page),
				"page1": per_page[0],
				"lines": len(texts),
				"mean_conf": sum(confidences) / len(confidences) if confidences else 0.0,
				"exact": 100.0 * matched / len(baseline_texts),
				"texts": texts,
			}
		)

	print(f"{'configuration':<34} {'ocr':>8} {'page1':>8} {'lines':>6} {'meanconf':>9} {'exact':>7}")
	print("-" * 78)
	for r in results:
		print(
			f"{r['label']:<34} {r['total']:>7.2f}s {r['page1']:>7.2f}s {r['lines']:>6} "
			f"{r['mean_conf']:>8.2f}% {r['exact']:>6.1f}%"
		)

	# Compare against the shipped configuration, not against the worst one in the sweep —
	# fastest-versus-slowest flatters a result when the slowest entry is a bad setting.
	baseline_total = results[0]["total"]
	fastest = min(results, key=lambda r: r["total"])
	print(
		f"\nfastest: {fastest['label']} — {fastest['total']:.2f}s against the shipped "
		f"configuration's {baseline_total:.2f}s "
		f"({100 * (1 - fastest['total'] / baseline_total):.0f}% saved)"
	)
	for r in results[1:]:
		delta = 100 * (r["total"] / baseline_total - 1)
		print(f"    {r['label']:<34} {delta:+.0f}% vs shipped")

	print("\n=== accuracy diff against the committed capture ===")
	for r in results:
		got = set(r["texts"])
		missing = [t for t in baseline_texts if t not in got]
		added = [t for t in r["texts"] if t not in baseline_set]
		print(f"\n{r['label']} — {len(missing)} not read, {len(added)} new")
		for text in missing[:8]:
			print(f"    lost: {text!r}")
		for text in added[:8]:
			print(f"    new:  {text!r}")

	print(
		"\nJudge on the diff. Equipment tags, reference numbers and procedure codes must be "
		"byte-identical; a dropped page footer costs nothing."
	)
	return 0


if __name__ == "__main__":
	raise SystemExit(main())
