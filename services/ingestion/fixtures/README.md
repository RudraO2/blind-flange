# The sample inspection report

The scanned page every ingestion story runs against. Committed so that Stories 4.2 to 4.5
need no external asset and the demo does not depend on finding a document on the day.

| File | What it is |
|---|---|
| `generate_sample_report.py` | Composes the page and rasterises it. The generator, committed alongside its output. |
| `scan_artefacts.py` | The degradation, the PNG writer and the PDF writer. |
| `sample-inspection-report-p1.png` | Page 1, 2481 × 3508 px, 300 dpi, 8-bit greyscale. |
| `sample-inspection-report-p2.png` | Page 2, same. |
| `sample-inspection-report.pdf` | Both pages as an image-only PDF — no text layer, which is what a scanned report actually arrives as. Story 4.4 reads this one. |

## Everything in it is invented

Northcape Refining Company does not exist. Neither does Ravensfell Refinery, nor Unit 22,
nor any of the equipment tags, personnel or reference numbers. The page carries a banner
across the top and a line in the footer of every page saying so. It is not a real MRPL
record and it does not present itself as any other organisation's record either.

The content is written to be plausible industrial work — an external inspection of static
equipment, with an equipment register, five findings, six thickness readings against a
minimum allowable, a conclusion and a signature block — because the router, the findings
extraction and the deliverable factory all need something with real structure to bite on.

## It is deliberately a bad scan

A clean render makes OCR look easier than it is, and Story 4.2 has to measure Tesseract
against something honest. Each page is put through `scan_artefacts.scan`, which applies, in
the order a scanner does:

1. **Skew** — a rotation between 0.35° and 0.95°, never near zero, because a page that
   happens to land straight is a clean render again.
2. **Softened edges** — two box-blur passes, standing in for the optics.
3. **Uneven contrast** — a smooth low-frequency illumination field, plus the shadow a lid
   that does not close flat leaves down one edge.
4. **Speckle** — sensor grain, dark dust flecks, and dropout inside the ink.
5. **Tonal quantisation** — 64 grey levels rather than 256, which is what a scanner's own
   compression leaves behind.

## The handwriting is simulated, and this matters

The two pen annotations, the ringed severity, the lead line and the signatures are drawn:
an italic face placed glyph by glyph on its own rotation and baseline, and stroked bezier
paths. They are **not** a scan of anyone's handwriting.

That is worth saying plainly because Story 4.2 measures OCR against this page. Real
handwriting defeats Tesseract, and so does this; a result that says the annotation was not
read is the correct result, not a bug in the fixture.

## Regenerating it

```
python services/ingestion/fixtures/generate_sample_report.py
```

Output is deterministic for a given seed, so a re-run reproduces the committed files byte
for byte. `--dpi`, `--seed` and `--out-dir` are available if a variant is ever needed;
changing any of them changes the committed bytes, so do it deliberately.

Dependencies are pinned in `../requirements-fixtures.txt` and their licences are recorded
in `../LICENCES.md`.

The PNG writer, the PDF writer and the whole degradation pipeline are numpy and the
standard library, deliberately, because the obvious library for all three is Pillow and
Pillow's licence sits outside the allow-list in `docs/licence-policy.md`.

**That is not sufficient, and `../LICENCES.md` records why.** ReportLab depends on Pillow
unconditionally and imports it at module load, so installing this file's requirements
installs Pillow regardless of what our own modules import. The licence question is open
and needs an ADR before this story's licence claim can be made in front of MRPL.
