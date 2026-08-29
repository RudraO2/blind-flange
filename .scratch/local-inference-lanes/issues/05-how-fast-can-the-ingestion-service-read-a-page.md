# How fast can the ingestion service read a page, and what does that cost in accuracy?

Type: prototype
Status: resolved
Blocked by: —

## Answer

Measured 30 August 2026 on this machine. Two harnesses, both committed as evidence:
`services/ingestion/proof/dpi_latency_proof.py` and
`services/ingestion/proof/ocr_tuning_proof.py`. Both diff recognised text against the
committed 300 dpi capture rather than trusting a confidence average.

**The DPI lever does not work, and the reason matters.** Rendering is 0.62s of a 15s pass.
Worse, RapidOCR caps its own working image at `Global.max_side_len: 2000`, so an A4 page is
downscaled to 2000px on the long side *whatever* it was rendered at — 300 dpi rasterises
3508px and then throws a third of them away. The recognised line count is **156 at every
resolution tested**, because recognition cost scales with detected lines, not source pixels.
150 dpi came out *slower* than 250 and lost six lines.

```
  dpi    total   render      ocr    page1  lines  meanconf   exact
  300   15.08s    0.62s   14.46s    9.12s    156    99.63%  100.0%
  250   12.33s    0.46s   11.87s    6.67s    156    99.62%   98.7%
  200   12.75s    0.36s   12.38s    7.00s    156    99.62%   98.1%
  150   14.39s    0.39s   13.99s    7.45s    156    99.44%   97.4%
```

**Where the time actually goes.** With pages pre-rendered and each engine warmed on a page
of the production size first, the same OCR work costs **7.03s for two pages, 3.60s for page
one**. The gap against the table above is the finding: ONNX Runtime re-optimises per input
shape, so **the first inference at a new page size pays a multi-second warm-up**. Part one
paid it once per DPI and charged it to OCR.

```
configuration                           ocr    page1  lines  meanconf   exact
baseline (as shipped)                 7.03s    3.60s    156    99.62%   98.1%
cls off                               6.67s    3.39s    156    99.62%   98.1%
cls off + batch 16                    7.62s    4.14s    156    99.57%   98.1%
cls off + batch 16 + 6 threads        7.93s    4.61s    156    99.57%   98.1%
cls off + batch 32 + 6 threads       12.24s    6.20s    156    99.43%   96.8%
```

### The decisions

1. **Render at 200 dpi, not 300.** 2000px on the long side is roughly 170 dpi for A4, so 200
   is the first value that stops discarding pixels with a margin. Identical accuracy on every
   tag; cheaper to rasterise.
2. **Turn `Global.use_cls` off.** ~5% saved for byte-identical output. The classifier detects
   180° rotation, which a scanned inspection report does not have. The fixture's *skew* is
   handled by the detector's polygon output, not by this model.
3. **Leave `Rec.rec_batch_num` and `intra_op_num_threads` alone.** Both made it worse — ORT
   already saturates six cores for intra-op work, and forcing more concurrency causes
   contention. Batch 32 cost 74% more *and* lost two lines including a reviewer name.
4. **Pre-warm the engine at service startup** with a throwaway page at the production render
   size. This is the largest perceived-latency win available and it is not a tuning knob: it
   moves a multi-second shape-specialisation cost off the first real request.
5. **Emit findings per page.** First findings land at ~3.4s rather than ~6.7s.

### Accuracy cost of 200 dpi, judged on the diff

Three lines differ from the 300 dpi capture and all three are cosmetic whitespace or
punctuation around a separator — `Refinery·Unit` losing a space, `NOT A REAL INSPECTION
RECORD` gaining one, and `E-1104A channel` reading as `E-1104A.channel`. **Every equipment
tag, reference number and procedure code is byte-identical.** The last one is worth noting
for the evaluation harness: the tag `E-1104A` extracts cleanly, but a naive whole-line exact
match against the old capture would score it wrong. Match on fields, not on lines.

### Consequence for the speed budget

The document lane's OCR stage is **~3.4s to first findings, ~6.7s complete**, once warm.
That is comfortably inside the ten-second end-to-end estimate and it is enough cover for a
model load to happen behind it.

## Question

Extraction has to take seconds. `services/ingestion/pdf.py` renders at `RENDER_DPI = 300` and
the two-page fixture has never been timed. RapidOCR read it at 0.997 confidence, which suggests
headroom to trade resolution for speed.

Measure, on the shipped fixture `services/ingestion/fixtures/sample-inspection-report.pdf`:

- Wall-clock per page at 300, 200 and 150 DPI, separating pdfium render time from OCR time.
- What accuracy is actually lost at each step — specifically whether the reference numbers and
  equipment tags still come out exactly right. That was the whole reason RapidOCR replaced
  Tesseract (ADR-0005's amendment), so a DPI drop that mangles a tag is not a speed win.
- Whether ONNX Runtime thread count changes anything on six Ryzen cores.
- Whether findings can be emitted per page as each finishes, so page one's results appear while
  page two is still being read.

The output is a chosen DPI with the evidence behind it, and a yes/no on per-page streaming being
worth the change. Nothing here is blocked — RapidOCR is already installed in
`services/ingestion/.venv`.
