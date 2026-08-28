# Licence policy

**This is a hard constraint, not a preference.** It applies to model weights, to every
runtime dependency, and to the harness. Any architecture, story, or dependency choice that
violates it is rejected regardless of technical merit.

## The rule

**OSI-approved, no copyleft, no user cap, no field-of-use restriction, no disclosure
obligation.** As of ADR-0006 that admits exactly eleven names, and nothing else ships:

> Apache-2.0 · MIT · BSD-2-Clause · BSD-3-Clause · ISC · 0BSD · Python-2.0 · MIT-CMU ·
> BSL-1.0 · Zlib · CC0-1.0

The set stays enumerated rather than becoming a judgement call at the point of use, because
an enumerated set is what the model loader can refuse on and what `scripts/licence-audit.mjs`
can fail on. The rule explains the set; it does not replace it.

Amended twice, both times in writing and both times because the alternative was tolerating
an exception quietly:

- **28 August 2026, ADR-0005** — from "Apache-2.0 and MIT only" to those two plus
  BSD-2-Clause and BSD-3-Clause. A PSU legal reviewer reads BSD-2 and BSD-3 the way they
  read MIT; BSD-3-Clause is in fact simpler than Apache-2.0, which carries a patent grant.
- **28 August 2026, ADR-0006** — the remaining seven, after Story 6.4's audit enumerated
  490 components across the harness, the profile, our packages and the ingestion service,
  and found 27 outside the four. ISC *is* MIT with the redundant words removed; 0BSD is BSD
  with attribution dropped; MIT-CMU is the Carnegie Mellon variant of MIT; BSL-1.0 waives
  attribution for binary distribution. Most sit inside the harness, which NFR5 forbids
  editing — but that is not why they were admitted. They were admitted because they pass
  the rule.

**Widening the list is an ADR-level decision, not a judgement call made at the point of
use.** Two ADRs in one day is that process working, not a reason to stop using it.

**Copyleft is never admitted by widening.** No copyleft licence goes on the set, at any
strength. Each copyleft component is decided one at a time, with the reasoning and the
evidence recorded against it in `docs/licence-decisions.json`. Seven such decisions exist and
they are listed under "Copyleft, decided one at a time" below.

## Why it is absolute

The client is MRPL — an ONGC subsidiary, a Miniratna CPSE, a government-owned company. For
that buyer a licence carrying a monthly-active-user ceiling, a no-competing-model clause, or
a jurisdictional carve-out is not a technical inconvenience. It is a legal review that stalls
deployment for months. Community-licensed weights trigger PSU legal review *even when you are
far under any user cap*, because someone has to certify that you are and will remain under it.

This is the argument almost no competing team will make, and it is the one that reads as
adult engineering to an industrial evaluator. It is worth more than a benchmark chart.

The cautionary example is already in the pitch: MinIO relicensed away from Apache-2.0, which
is why file storage here is a plain filesystem vault. Permissive today is not permissive
forever — pin versions and record the licence at the version you pinned.

## Enforcement, not assertion

Saying "we only use permissive licences" proves nothing. Three mechanisms make it checkable:

1. **The model registry** carries a `license:` field per fleet member, alongside name, size,
   context, modalities and capabilities. It is the highest-leverage file in the project — it
   drives the router, the loader, the UI picker, the licence check and the attestation
   manifest from one place.
2. **The loader refuses** to load any model whose licence class is outside the allow-list in
   the policy file. Not a warning. A refusal.
3. **The audit** — `npm run licence-audit` (`scripts/licence-audit.mjs`, Story 6.4).
   It enumerates every transitive licence across all four trees, joins each against the
   decisions in `docs/licence-decisions.json`, and **exits non-zero** when something outside
   the set has no decision, has one recorded as `open`, or has evidence that no longer
   exists on disk. `docs/licence-audit.md` is its committed output. It reads
   `ALLOWED_LICENCES` from the same module the model loader reads, so there is one
   allow-list in this project rather than two that can drift.

   It also checks that *this file* and `CLAUDE.md` still name every licence the code gates
   on, so a widened set and a stale statement of it cannot coexist. `CLAUDE.md` is checked
   because it is what every session loads as authority, and ADR-0006 initially updated the
   code and this file while leaving it stating the superseded four names.

   The evidence check has no carve-out. Most evidence lives outside the repo — in the
   harness home and in Python's site-packages — and a missing path still fails, because
   those paths carry the copyleft disclosures the whole claim rests on. They are written
   as `{dsh-home}` and `{site-packages}` and expanded against the machine the audit runs
   on, the ingestion service's own `.venv` first. Until 28 August 2026 they were one
   laptop's absolute paths, which made the audit pass there and fail on every other
   machine — including a collaborator's, where the whole point is that they can check it.

## Verified so far

| Component | Licence | Verified |
|---|---|---|
| DeepSeek Harness (`deepseek-ai/deepseek-harness`) | MIT | 27 Aug 2026, read from repo `LICENSE`, not from documentation |
| Cordis (`cordiverse/cordis`) | MIT | 27 Aug 2026, read from repo `LICENSE` at `main` |
| `@deepseek-ai/dsh` (npm) | MIT | 27 Aug 2026, `license` field in `apps/cli/package.json` |
| Tesseract (`tesseract-ocr/tesseract`) | Apache-2.0 | 28 Aug 2026, **re-verified 28 Aug 2026 (Story 6.4)** — read `C:\Program Files\Tesseract-OCR\doc\LICENSE` in the install at the pinned version `5.5.3.20260724` (confirmed by `tesseract --version`): the Apache License 2.0 text verbatim. Proof tooling only since the RapidOCR swap. |
| tessdata (`tesseract-ocr/tessdata`, `tessdata_fast`, `tessdata_best`) | Apache-2.0 | 28 Aug 2026, **re-verified 28 Aug 2026 (Story 6.4)** — read the repository `LICENSE`: "Apache License, Version 2.0, January 2004". Recorded gap: the Tesseract installer ships the `.traineddata` files with **no licence file beside them**, so this row is verified from the upstream repository rather than from the artefact on disk. Proof tooling only. |
| pytesseract (`madmaze/pytesseract`) | Apache-2.0 | 28 Aug 2026, **re-verified 28 Aug 2026 (Story 6.4)** — read `pytesseract-0.3.13.dist-info/LICENSE` in the installed distribution: the Apache License 2.0 text verbatim. Proof tooling only. |
| pypdfium2 (`pypdfium2-team/pypdfium2`) | Apache-2.0 **OR** BSD-3-Clause, at our choice; the bundled PDFium engine adds `LicenseRef-PdfiumThirdParty` | 28 Aug 2026, **re-verified 28 Aug 2026 (Story 6.4)** — the installed `4.30.0` distribution ships `Apache-2.0.txt`, `BSD-3-Clause.txt` and `LicenseRef-PdfiumThirdParty.txt`, all read. `dep5-wheel` maps them per file: the bindings are `Apache-2.0 OR BSD-3-Clause`, `pdfium.dll` adds the third-party set. Correction to the earlier row: the engine is not simply BSD-3-Clause. |
| `Qwen/Qwen2.5-7B-Instruct` (fleet — general reasoner) | Apache-2.0 | 28 Aug 2026 — read the `LICENSE` file at revision `a09a35458c702b33eeacc393d103063234e8bc28`: "Apache License, Version 2.0" |
| `Qwen/Qwen2.5-Coder-7B-Instruct` (fleet — coder) | Apache-2.0 | 28 Aug 2026 — read the `LICENSE` file at revision `c03e6d358207e414f1eca0bb1891e29f1db0e242`: "Apache License, Version 2.0" |
| `Qwen/Qwen2.5-VL-7B-Instruct` (fleet — vision-document) | Apache-2.0 | 28 Aug 2026 — **no `LICENSE` file exists in this repo at any revision**; verified from the `license: apache-2.0` field in `README.md` YAML frontmatter at revision `cc594898137f460bfe9f0759e9844b3ce807cfb5`. Recorded decision (28 Aug 2026): the model-card metadata at a pinned revision is a primary declaration and is accepted here in the absence of a `LICENSE` file. **Re-checked 28 Aug 2026 (Story 6.4): still absent** — a request for `LICENSE` at that exact revision returns HTTP 404. The decision stands. |
| `Qwen/Qwen2.5-3B-Instruct` (declared only so the loader refuses it — Story 3.4) | **Qwen RESEARCH LICENSE AGREEMENT** | 28 Aug 2026 — read the `LICENSE` file at revision `aa8e72537993ba99e69dfaafa59ed015b17504d1`: "Qwen RESEARCH LICENSE AGREEMENT, Release Date: September 19, 2024". Outside the allow-list by design — see the Rejected table. |

**That gap is closed.** The four `docs`-stack rows above were originally established from
published project documentation rather than from the `LICENSE` file at a pinned version, and
this file recorded the shortfall against itself. Story 6.4 re-read all four from the
artefact actually installed, on 28 August 2026, and one row changed as a result: pypdfium2
is dual-licensed at our choice and its bundled engine carries a third-party set, not plain
BSD-3-Clause.

Two honest residuals, recorded rather than smoothed over: tessdata ships no licence file
beside the `.traineddata` artefacts, so its row is verified from the upstream repository;
and Qwen2.5-VL still has no `LICENSE` file at its pinned revision, re-checked and still a
404. Both were already recorded decisions and both still stand.

The full enumeration — all 490 components, not just the ones a human thought to table here
— is `docs/licence-audit.md`, regenerated by `npm run licence-audit -- --write`.

## Copyleft, decided one at a time

No copyleft licence is on the set. Seven components carry one anyway — plus GEOS, removed in
a previous story and kept in the table because the pattern it established is what the others
were measured against. Each is decided individually in `docs/licence-decisions.json` with its
evidence. Four were removed or are not shipped, one is measured not loaded, and two are
genuinely linked and therefore disclosed.

Two of the seven are **build-time tooling rather than anything that runs on the box** — the
fixture generator's fonts and the demo recorder's encoder. Both are named here anyway,
because "it is only a build tool" is exactly the reasoning this file exists to stop being
made silently.

| Component | Licence | Reached through | Decision |
|---|---|---|---|
| GEOS, inside `shapely` | LGPL-2.1 | `rapidocr`'s detector | **Removed.** `ocr.py` supplies the two `Polygon` properties the detector uses and registers them under `shapely` before RapidOCR can import the real package. Identical output. `test_service.py::test_geos_is_never_loaded` holds it. |
| `certifi` and `tqdm` | MPL-2.0 | `rapidocr` → `requests`; `rapidocr` | **Removed.** Only reachable from RapidOCR's model downloader and its load-from-URL branch, neither of which runs here. `ocr.py::_seal_out_http` registers raising stubs. Verified: 97 regions at 99.68 mean confidence with `certifi`, `urllib3` and `idna` never loaded. |
| FFmpeg, inside `opencv-python` | LGPL-2.1-or-later | `rapidocr` | **Mitigated.** A lazily-loaded video-I/O plugin; this service never opens a video. Measured across a full OCR pass: `cv2.pyd` loads, `opencv_videoio_ffmpeg4130_64.dll` does not. Redistributed, not linked. |
| Eigen, inside `onnxruntime` | MPL-2.0 | `rapidocr` | **Disclosed.** Header-only, compiled in, genuinely linked. MPL-2.0's obligations are file-level and attach only to modified MPL files; we modify none. |
| DarkGarden fonts, inside `reportlab` | **GPL-2.0-or-later** | the fixture generator | **Not shipped.** Build-time rather than runtime: the generator's output is a committed PNG and PDF and the tool is not run on the box. It draws with the PDF base-14 font names, which are metric-only and substituted at raster time, so no font file is embedded in any output. |
| FFmpeg, the `ffmpeg` CLI on `PATH` | **GPL-3.0-only** | Story 6.5's demo recorder | **Not shipped.** Build-time rather than runtime, and the only entry here that is not in any of the four audited trees: `scripts/record-demo.mjs` shells out to it as a separate process to mux Chrome's captured screencast frames into the demo MP4. Nothing in the workbench, the profile, our packages or the ingestion service links to it or calls it, and the recording is output rather than a derivative work of the encoder. The build in use is `8.1.1-full_build-www.gyan.dev`, configured `--enable-gpl --enable-version3`; its licence text is committed at `docs/licence-evidence/ffmpeg-8.1.1-LICENSE.txt`. |
| libvips, inside `sharp` | LGPL-3.0-or-later | the harness's `dsh-attachment-local` | **Disclosed.** Measured loaded in the running workbench process. Cannot be disabled: `attachment-local` is the sole provider of the `attachments` service and the API gateway requires it, so the `disabled: true` row was written, measured, and reverted. NFR5 forbids editing harness source. |

Eight of the audit's 490 rows are copyleft — six distinct components, since libvips and
FFmpeg each appear twice, once from a package manifest and once as the vendored library
inside it. The `ffmpeg` CLI is the seventh component and is in none of those rows: the audit
enumerates the harness, the profile, our packages and the ingestion service, and a tool on
`PATH` is in no manifest to enumerate — which is precisely why it is declared by hand here
and in `docs/licence-decisions.json` rather than left to be noticed. **Two components are
linked at runtime**, both inherited rather than chosen, both named. Neither places any obligation on our own code. **That is the sentence this
policy can defend, and it is a different sentence from "every component is permissively
licensed"** — which `blind-flange.html` §Feasibility and `DECK-CONTENT.md` still say, and
which is no longer true.

## Rejected

A rejected row is evidence the gate ran. An absence proves nothing — in exactly the way the
egress monitor's zero proves nothing without the canary.

| Component | Licence | Why rejected |
|---|---|---|
| `ds4sd/docling-models` (Docling's layout + TableFormer models) | CDLA-Permissive-2.0 | Outside the allow-list. Docling's own code is MIT, but its models are not, and the models are the part that ships. **Not a legal hazard** — CDLA-Permissive-2.0 permits commercial use and places no restriction on results or models built from the data; the only obligation is shipping the licence text when redistributing the data itself, which we would be doing since artefacts are pre-staged offline. Rejected on fit and cost: a third licence name on the attestation report, and a much heavier stack (PyTorch + transformers) than Phase 0 needs. Replaced by the Tesseract stack — see ADR-0005 for the full reasoning. |
| PyMuPDF | AGPL-3.0 | Copyleft with a disclosure obligation. Named here explicitly because it is the library every PDF tutorial reaches for and the default an agent will select unprompted. Use pypdfium2. |
| `Qwen/Qwen2.5-3B-Instruct` | Qwen RESEARCH LICENSE AGREEMENT | Non-commercial research licence — outside the allow-list. **Declared in `registry/models.yaml` on purpose** so the loader (Story 3.4) refuses it and the refusal is checkable: same family, publisher and release as `Qwen2.5-7B-Instruct` (Apache-2.0), different licence. Never loads. |

## What this rules out

- Weights under bespoke community licences with user caps or use restrictions
- Anything AGPL, SSPL, BUSL, or a source-available licence with a commercial-use carve-out
- **Data and model licences outside the allow-list, including the CDLA family** — not because
  their terms are restrictive (CDLA-Permissive-2.0's are not), but because each additional
  licence class costs some of the checkability that makes this policy worth having. Admitting
  one is an ADR-level decision, and a reasonable one when the component earns it.
- Any dependency whose licence cannot be established at all

When a component fails this test, the answer is to find a permissive equivalent, not to seek
an exception.
