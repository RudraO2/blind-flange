# Licences — ingestion service

Every dependency this directory introduces, with its licence read from the `LICENSE` file
shipped in the distribution at the pinned version rather than from a README or a summary.
The allow-list is in `docs/licence-policy.md`: **Apache-2.0, MIT, BSD-2-Clause and
BSD-3-Clause only**. This file is input to Story 6.4, which closes the gap the policy
records against itself.

Verified 28 August 2026.

| Component | Version | Licence | How it was verified |
|---|---|---|---|
| `numpy` | 2.4.3 | BSD-3-Clause | `numpy-2.4.3.dist-info/licenses/LICENSE.txt` — the three-clause text verbatim. |
| `pypdfium2` | 4.30.0 | Apache-2.0 **or** BSD-3-Clause, at our choice | `METADATA` declares `(Apache-2.0 OR BSD-3-Clause) AND LicenseRef-PdfiumThirdParty`; both `LICENSES/Apache-2.0.txt` and `LICENSES/BSD-3-Clause.txt` ship in the distribution. |
| `reportlab` | 4.5.0 | BSD-3-Clause | `reportlab-4.5.0.dist-info/licenses/LICENSE` — retain-notice, reproduce-notice and no-endorsement clauses. No vendored shared libraries: the wheel has no `reportlab.libs`. It does bundle fonts — see below. |

### Pulled in transitively, and this is where it fails

| Component | Version | Licence | How it was verified |
|---|---|---|---|
| `pillow` | 11.3.0 | **`MIT-CMU` — outside the allow-list** | `License-Expression` field of the installed distribution's `METADATA`. |
| `charset-normalizer` | 3.4.4 | MIT | `License` field of the installed distribution's `METADATA`. Inside the allow-list. |

`reportlab` declares `pillow>=9.0.0` and `charset-normalizer` as unconditional
requirements, not extras — confirmed from `importlib.metadata.requires("reportlab")`. So
installing `requirements-fixtures.txt` installs Pillow.

**Three of the five are inside the allow-list, Pillow is not, and this story therefore does
not satisfy its own licence acceptance criterion.** The gate result is written up at the end
of this file.

## Bundled third-party code, recorded rather than glossed over

Two of the three carry vendored components under their own licences. Neither is a
copyleft obligation, but the attestation report has to be able to name them.

**`pypdfium2` bundles the PDFium engine**, whose third-party sources are listed in
`LICENSES/LicenseRef-PdfiumThirdParty.txt`: libpng, LibTIFF and similar, under the zlib
licence, the libpng licence and public-domain dedications. Permissive, no disclosure
obligation, but they are additional licence names on an SBOM row.

**`numpy` bundles OpenBLAS** (`numpy.libs/libscipy_openblas64_*.dll`, BSD-3-Clause) and the
Microsoft C++ runtime redistributable. numpy's own `License-Expression` field reads
`BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0`; the extra identifiers cover vendored
files inside the distribution, and numpy's own licence — the one that governs the library
we call — is BSD-3-Clause.

**`reportlab` bundles fonts, one of them copyleft.** `reportlab/fonts/` ships the DarkGarden
family (`DarkGardenMK.pfb`, `DarkGarden.sfd`) under **GPL-2.0-or-later** — verified by
reading `DarkGarden-copying.txt` and `DarkGarden-copying-gpl.txt` in the installed package
on 28 August 2026 — alongside Bitstream Vera and a set of Type 1 `.pfb` faces. The generator
uses none of them: it draws with the PDF base-14 names (`Helvetica`, `Helvetica-Bold`,
`Times-Italic`), which are metric-only and substituted by PDFium at raster time, so no font
file is embedded in any output. Recorded because a GPL file inside a shipped dependency
belongs on the attestation report whether or not it is called.

These bundled components are flagged for Story 6.4 rather than decided here.

## The open decision — Pillow's licence

**Pillow's licence is `MIT-CMU`** — verified from the installed distribution's
`License-Expression` metadata field on 28 August 2026. MIT-CMU is the Carnegie Mellon
variant of the MIT licence: permissive, no copyleft, no user cap, no field-of-use
restriction. It is nevertheless **not one of the four names on the allow-list**, and
`docs/licence-policy.md` says widening that list is an ADR-level decision and never a
judgement call made at the point of use.

Pillow reaches this directory by two separate routes, and closing one does not close the
other:

1. **ReportLab, now.** `reportlab/lib/utils.py` runs `from PIL import Image` at module
   load, so the import cannot be avoided by not using ReportLab's image features, and
   `pip install --no-deps` produces an installation that fails on the first import.
   Confirmed on 28 August 2026 by running the generator with `PIL` blocked at the import
   hook: `ImportError` from `reportlab.lib.colors`, before any page was composed.
2. **`pytesseract`, in Story 4.2.** It depends on Pillow too, and Pillow is how an image
   reaches it. ADR-0005 chose that wrapper.

So the hand-rolled PNG and PDF writers keep Pillow out of *our* imports but not out of the
tree, and the acceptance criterion "every one is inside the licence allow-list" is not met.

There are three honest ways out, and choosing between them is an ADR-level decision:

1. **Admit `MIT-CMU` to the allow-list by ADR**, on the record, the way BSD-2 and BSD-3 were
   admitted by ADR-0005 — noting that a PSU legal reviewer reads MIT-CMU as MIT. This is the
   cheapest and it closes both routes at once.
2. **Drop ReportLab and call Tesseract through its command line**, so no Python imaging
   library enters the tree at all. The page composition would then have to be hand-rolled
   too — that is a rebuild of this story, not an edit.
3. **Accept it for the fixture only** on the grounds that the generator is a build-time tool
   whose output is a PNG and a PDF, and keep Pillow out of the ingestion service at runtime.
   This is the weakest of the three: it splits the policy into a build tier and a runtime
   tier, which the policy does not currently have, and that split is itself an ADR.

Recorded, not decided. Raised to the user on 28 August 2026 at the close of Story 4.1.

## Story 4.2 — OCR proof tooling

Verified 28 August 2026, from the `LICENSE` file shipped at the pinned version, same
standard as above. These are proof-script dependencies (`services/ingestion/proof/`), not
yet the ingestion service's own runtime dependencies — Story 4.3 pins those separately, and
may reuse some of these names.

| Component | Version | Licence | How it was verified |
|---|---|---|---|
| `tesseract-ocr/tesseract` (binary, via `winget install tesseract-ocr.tesseract`) | 5.5.3.20260724 | Apache-2.0 | `C:\Program Files\Tesseract-OCR\doc\LICENSE`, the Apache License 2.0 text verbatim. |
| `pytesseract` | 0.3.13 | Apache-2.0 | `pytesseract-0.3.13.dist-info/LICENSE`, the Apache License 2.0 text verbatim. |
| `psutil` | 7.2.2 | BSD-3-Clause | `psutil-7.2.2.dist-info/LICENSE`, the three-clause text verbatim (Jay Loden, Dave Daeschler, Giampaolo Rodola). |

`pytesseract` pulls in Pillow (`MIT-CMU`) the same way `reportlab` does — the second route
into this tree the Story 4.1 gate result already anticipated. It does not open a new
question; see "The open decision — Pillow's licence" above, which this story does not
resolve or need to.

All three rows above are individually inside the allow-list. The Pillow question stands as
recorded in Story 4.1's gate result and is unaffected by this story.

## Story 4.3 — the ingestion service itself

Verified 28 August 2026. `services/ingestion/requirements.txt` pins the service's own
runtime dependencies, distinct from the fixture generator and the Story 4.2 proof script.

| Component | Version | Licence | How it was verified |
|---|---|---|---|
| `pytesseract` | 0.3.13 | Apache-2.0 | Same distribution already verified for Story 4.2 — `pytesseract-0.3.13.dist-info/LICENSE`. |
| `pillow` | 11.3.0 | **`MIT-CMU` — outside the allow-list** | Same open question as Story 4.1 and 4.2 — see above. Not reopened, not resolved, by this story. |

**No new component enters the tree.** The HTTP boundary (`server.py`) is Python's own
`http.server` — deliberately, so this story does not have to license-check a web framework
on top of an already-open question. `services/ingestion/CONTRACT.md` documents why nothing
richer than stdlib was needed for one JSON endpoint.

The service makes no outbound call at runtime (NFR2): `server.py` and `ocr.py` import only
`json`, `os`, `io`, `pathlib`, `platform`, `http.server`, `pytesseract` and `PIL` — no
`requests`, `urllib.request`, `socket` client code, or similar. It binds `127.0.0.1` only
and reads the Tesseract binary already installed on the host (Story 4.2); it never fetches
tessdata or any model file at request time.

Story 4.3's own licence gate therefore inherits Story 4.1's open Pillow question rather than
adding to it — see "The open decision" above, still unresolved, still an ADR away.

## Story 4.4 — the PDF path

Verified 28 August 2026. Adds one runtime dependency to `services/ingestion/requirements.txt`:

| Component | Version | Licence | How it was verified |
|---|---|---|---|
| `pypdfium2` | 4.30.0 | Apache-2.0 **or** BSD-3-Clause, at our choice | Same distribution already verified for the fixture generator in Story 4.1 — `METADATA` declares `(Apache-2.0 OR BSD-3-Clause) AND LicenseRef-PdfiumThirdParty`. Now also a runtime dependency of the service, not only a build-time tool, so recorded here again against that role. |

No other component enters the tree: `pdf.py` imports only `pypdfium2` and this directory's
own `ocr` module. **`PyMuPDF` does not appear anywhere in the dependency tree** — confirmed
by `pip show pymupdf` (not installed) and by `requirements.txt` naming only `pytesseract`,
`pillow` and `pypdfium2` (ADR-0005).

`pypdfium2` bundles the PDFium engine's third-party sources (`LICENSES/LicenseRef-PdfiumThirdParty.txt`)
— libpng, LibTIFF and similar under permissive/public-domain terms, recorded in Story 4.1's
row above and unchanged here.

This story does not touch the open Pillow (`MIT-CMU`) question — it neither resolves nor
reopens it. The service's dependency tree still does not fully satisfy its own "every licence
inside the allow-list" acceptance criterion for that one pre-existing reason, unchanged since
Story 4.1.

## Gate result for Story 4.1

The story's third acceptance criterion — "**Given** the generator's dependencies **When**
they are checked **Then** every one is inside the licence allow-list (NFR1)" — **is not
met**, because of Pillow. Every other acceptance criterion in the story is met.

The work is committed rather than held back so that it survives and so Stories 4.2 to 4.5
have their fixture, but the story is not `done` until the decision above is taken.
