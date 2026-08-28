# Tesseract for ingestion, and a widened permissive allow-list

Phase 0 needs a scanned page to come in and produce text where every extracted claim carries
the page number and the bounding box it was read from (FR9), so that clicking a finding can
show the pixel region it came from (FR10). The obvious candidate was Docling, named in the
earlier Phase 0 spec for layout and OCR.

Docling fails the licence policy. The library itself is MIT, but its models —
`ds4sd/docling-models`, the RT-DETR layout model and TableFormer — are published under
**CDLA-Permissive-2.0**, verified on 28 August 2026 from the model card on Hugging Face.
`docs/licence-policy.md` allows Apache-2.0 and MIT and says the loader refuses anything
else. Shipping Docling would mean the licence gate we are building would refuse the
component we built it on, in the one area where the claim is the product.

So ingestion is built on Tesseract instead:

| Component | Licence | Role |
|---|---|---|
| `tesseract-ocr/tesseract` | Apache-2.0 | OCR engine |
| `tesseract-ocr/tessdata` (also `tessdata_fast`, `tessdata_best`) | Apache-2.0 | Trained language models |
| `madmaze/pytesseract` | Apache-2.0 | Python wrapper |
| `pypdfium2-team/pypdfium2` | Apache-2.0 (PDFium engine BSD-3-Clause) | Render a PDF page to an image |

`pytesseract.image_to_data()` returns word-level bounding boxes with confidence scores,
which is FR9's acceptance criterion almost verbatim.

## Status

accepted, 28 August 2026. Supersedes the "Docling for layout and OCR" line in
`.scratch/phase-0-spine/spec.md`, which was already marked input rather than authority.

Amends `docs/licence-policy.md`: the allow-list becomes **Apache-2.0, MIT, BSD-2-Clause and
BSD-3-Clause**. BSD-2 and BSD-3 sit in the same legal class as MIT for the buyer this policy
exists to satisfy — no copyleft, no user cap, no field-of-use restriction, no disclosure
obligation. A PSU legal reviewer reads them the same way. Widening the list deliberately and
in writing preserves what makes the policy worth anything, which is that it is enforced
rather than asserted; quietly tolerating a third licence would not.

The asymmetry is the reason this amendment admits BSD and still refuses CDLA-Permissive-2.0.
BSD is an ordinary, decades-old software licence. CDLA-Permissive-2.0 is a *data* licence
that a government legal reviewer has most likely never encountered, which is precisely the
review delay this policy exists to avoid.

### What CDLA-Permissive-2.0 actually says — so this record is not misread

Read from the licence text on 28 August 2026. It is genuinely permissive and it is **not** a
legal hazard. Commercial use is permitted. It states explicitly that it imposes no restriction
or obligation on the use, modification or sharing of *Results* — which includes models and
anything produced with the data. There is no copyleft, no share-alike on downstream code, no
user cap and no field-of-use limit. The sole obligation is to make the licence text available
when redistributing **the data itself**, and that obligation does not extend to software or
models built on it.

So Docling is rejected on **fit and cost**, not on legal risk, and this ADR should not be
cited as evidence that CDLA is dangerous:

1. Because Blind Flange pre-stages every model artefact for offline operation, we *would* be
   redistributing the data, and would owe the licence text alongside the weights. Small, but
   real, and it puts a third licence name on the attestation report — a row an evaluator stops
   on during a three-minute pitch.
2. The policy's value is that it is short and checkable. Each additional licence class costs
   some of that.
3. **The strongest reason is weight, not law.** Docling pulls PyTorch, transformers and
   downloaded model files. Tesseract is a CPU binary plus `.traineddata`. On a 15.7 GB laptop
   with three days remaining, the lighter stack wins on its own merits, and would have been
   the right call for Phase 0 even if the licence question had never come up.

If a later phase needs table structure, reading order or layout classification, the correct
move is to reopen this decision on its merits and add CDLA-Permissive-2.0 to the allow-list by
ADR — not to treat it as forbidden.

## Considered alternatives

**Keep Docling and add CDLA-Permissive-2.0 to the allow-list.** Rejected. Docling is
genuinely better at documents — table structure via TableFormer, reading order, layout
classes — but Phase 0 needs none of that. FR9 and FR10 ask for words and their coordinates.
Paying for capability we do not need with the credibility of the licence argument is a bad
trade.

**Keep Docling and settle the licence later.** Rejected for the same reason the panels must
be driven by real events: the contradiction is discoverable, and a judge or an MRPL reviewer
who finds it has found it themselves rather than been told.

**PyMuPDF for page rendering.** Rejected outright — **AGPL-3.0**. It is the library every
tutorial reaches for and the one an agent will select by default, so it is named here
explicitly as a trap rather than left to be discovered.

**Accept image files only and render no PDFs at all.** Viable, and the smallest possible
dependency set, but it costs the demo the ability to accept a PDF, which is what a scanned
inspection report actually arrives as.

## Consequences

**Docling's memory profile was never the problem.** Docling defaults to CPU and only touches
the GPU when explicitly given `AcceleratorDevice.CUDA`, so it would not have competed with
the fleet for the 4 GB of VRAM. It competes for system RAM. The reason it is out is the
licence, and the record should say so, because "we dropped it to save memory" is a claim that
does not survive being checked.

**We lose table structure, reading order and layout classification.** Tesseract returns words
and coordinates, not a document model. Phase 0 does not require them; anything past Phase 0
that does will need this decision revisited rather than assumed.

**Every licence in the table above is verified by reading the `LICENSE` file at the version
being pinned**, per the policy. Recorded in `docs/licence-policy.md`.

**`ds4sd/docling-models` is recorded as rejected, not merely unused.** A rejected row is
evidence that the gate ran. An absence proves nothing, in exactly the way the egress
monitor's zero proves nothing without the canary.

---

## Amendment, 28 August 2026 — RapidOCR replaces Tesseract, and the allow-list question is reopened

This decision chose Tesseract on fit and cost, and it was right about the cost. It was wrong
about the fit.

Tesseract worked and its proof stands (`services/ingestion/proof/PROOF.md`): word boxes with
confidence, on CPU, 94 MB, 2.49 s. What it could not do reliably is read the strings an
inspection report is actually made of — `NRC/RVF/INSP/2026-0417`, `NRC-INS-STD-014 Rev 3`,
`V-2201-A`. Tokens mixing slashes, digits and case are where its LSTM is weakest, and a
finding the agent cites with a mangled reference number is worse than no finding at all: it
carries authority it has not earned. That is a product failure, not a benchmark quibble.

RapidOCR — PP-OCRv6 models on ONNX Runtime — reads the same degraded fixture page at 0.9968
mean confidence against Tesseract's 0.89–0.96, and reads that reference number exactly. It
costs 2.3× the memory (213 MB) and 1.5× the time (3.6 s) on a machine with 15.7 GB of RAM,
which is not a real cost. It uses no VRAM either. Its models ship inside the wheel, and the
air-gap claim is proved rather than assumed: `proof/rapidocr_proof.py` seals every
non-loopback socket and `getaddrinfo` before importing anything, then runs a full pass.

Findings are now one per detected **line** rather than one per word. This is an improvement
for FR10: a crop of a single word is not evidence a human can check; a crop of the line it
sat in is.

### What this does to the licence position

Two licences outside the allow-list came with the swap. They were handled differently, and
the difference is the point.

**GEOS, LGPL-2.1 — removed.** `shapely`, pulled in transitively, bundles the GEOS shared
libraries under weak copyleft, and they were confirmed loading during a real OCR pass.
RapidOCR's detector uses `shapely.geometry.Polygon` for two properties only, `.area` and
`.length`. `ocr.py` supplies both itself and registers them under `shapely` before RapidOCR
can import the real package; `shapely` is uninstalled. Output is identical, and both a test
and the proof script fail if it ever returns. **No LGPL code is linked, loaded or shipped.**

**Clipper, BSL-1.0 — open.** `pyclipper` embeds the Clipper C++ library, which is Boost
Software License. Unlike GEOS it does real polygon offsetting and cannot be replaced in ten
lines. BSL-1.0 is permissive — more so than MIT — and is not a legal hazard, but the
allow-list is four licences and this is a fifth.

**This amendment does not widen the allow-list.** ADR-0005 widened it from two to four with
its reasoning written down, and `CLAUDE.md` is explicit that doing so again is an ADR-level
decision, never a judgement call made at the point of use. The swap was made on the project
owner's call with the question knowingly deferred, and it must close before the licence claim
is made in public.

**Story 6.4 owns closing it**, two ways only:

1. **ADR-0006 admits BSL-1.0** as a fifth licence, with reasoning, and the attestation report
   carries five rows.
2. **Revert to Tesseract.** `ocr.py` is the only file that changes — `pdf.py` and `server.py`
   call `findings_from_image` and never touch the engine. `proof/PROOF.md` and the Tesseract
   rows in `services/ingestion/LICENCES.md` are kept precisely so this stays a one-file
   decision rather than an archaeology exercise.

Everything else in this decision stands. `PyMuPDF` remains banned by name; `pypdfium2` remains
the substitute. Docling remains rejected, and for the reason recorded above — fit and cost,
not legal hazard.
