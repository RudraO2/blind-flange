# The allow-list becomes a rule, and copyleft is decided per component

Story 6.4 built the third enforcement mechanism `docs/licence-policy.md` has always
promised: an audit that enumerates every transitive licence and fails when one is
undecided. Running it for the first time on 28 August 2026 enumerated **490 components**
across four trees — the harness, the web profile, our own packages, and the Python
ingestion service — and found **27 outside the four-name allow-list**.

That number is the decision this record exists to take. A policy that fails on first
contact with its own dependency tree either widens honestly or gets quietly ignored, and
the second is the outcome this project has said repeatedly it will not accept.

The 27 are rows in the audit rather than 27 separate arguments, and they break down like
this:

| | Rows | What it is |
|---|---|---|
| Permissive, off the four-name list | **16** | Admitted below, by rule |
| Copyleft | **8** | Decided one at a time below. Six distinct findings — libvips and FFmpeg each appear twice, once from a package manifest and once as the vendored library inside it |
| `LicenseRef-PdfiumThirdParty` | **2** | Permissive, but with no SPDX identity to enumerate. `pypdfium2` and its bundled set |
| Non-commercial research licence | **1** | `Qwen/Qwen2.5-3B-Instruct`, declared on purpose so the loader refuses it |

The first group and the second deserve opposite answers.

## The permissive group: widen the list, and make it a rule

Sixteen of the 27 rows carry licences that are permissive by any reading — no copyleft, no
user cap, no field-of-use restriction, no disclosure obligation:

| Licence | Components | Where |
|---|---|---|
| ISC | 11 (`inherits`, `isexe`, `once`, `picocolors`, `semver`, `setprototypeof`, `which`, `wrappy`, `yaml`, `zod-to-json-schema`, `benchmark`) | Inside the harness's own tree |
| 0BSD | `tslib` | Harness |
| Python-2.0 | `argparse` | Harness |
| MIT-CMU | `pillow` | Ingestion |
| BSL-1.0 | the Clipper C++ library inside `pyclipper` | Ingestion |
| Zlib, CC0-1.0, 0BSD | one row — the vendored file sets inside `numpy`, whose declared expression is `BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0` | Ingestion |

Most of them sit under the harness install, which NFR5 forbids editing, so "remove it" was
never on the table for those. But that is not why they are admitted. They are admitted
because a PSU legal reviewer reads every one of them the way they read MIT, which is the
test `docs/licence-policy.md` says the list exists to satisfy. ISC *is* MIT with the
redundant words removed. 0BSD is BSD with the attribution requirement dropped — strictly
more permissive than anything already on the list. MIT-CMU is the Carnegie Mellon variant
of MIT. BSL-1.0 waives attribution for binary distribution, which makes it more permissive
than MIT rather than less.

So the allow-list stops being four names chosen one at a time and becomes a **rule with an
enumerated set**:

> **OSI-approved, no copyleft, no user cap, no field-of-use restriction, no disclosure
> obligation.** As of this record that admits: Apache-2.0, MIT, BSD-2-Clause,
> BSD-3-Clause, ISC, 0BSD, Python-2.0, MIT-CMU, BSL-1.0, Zlib, CC0-1.0.

The set stays enumerated rather than becoming a judgement call at the point of use, because
an enumerated set is what the loader can gate on and what
`scripts/licence-audit.mjs` can fail on. The rule explains the set; it does not replace it.
Adding a name is still an ADR-level decision — this record is that process working, not a
licence to stop using it.

This closes two questions that had been sitting open in
`services/ingestion/LICENCES.md` since Story 4.1 and the RapidOCR engine swap: Pillow's
MIT-CMU and Clipper's BSL-1.0. Both were correctly refused a decision at the point of use.
Both are decided here, in writing.

`LicenseRef-PdfiumThirdParty` — libpng, LibTIFF, zlib and public-domain dedications inside
`pypdfium2`'s `pdfium.dll` — is admitted by the same reasoning but cannot go on the set,
because it has no SPDX identity to enumerate. It carries a per-component decision instead.

## The copyleft group: decided one at a time, and never by class

Eight rows, six distinct components, carry copyleft. Widening the list to cover them would destroy the thing the
policy is for, so each is decided individually and the reasoning is recorded against it in
`docs/licence-decisions.json`.

**`tqdm` (MPL-2.0 AND MIT) and `certifi` (MPL-2.0) — sealed out.** RapidOCR imports
`requests` and `tqdm` at module scope, but only calls them from its model downloader and
its load-image-from-URL branch. The three PP-OCRv6 models ship inside the wheel and this
service is handed already-decoded images, so neither branch is reachable.
`ocr.py::_seal_out_http` now registers raising stubs under both names before RapidOCR can
import the real ones — the same technique `_seal_out_geos` already used for shapely, for
the same reason. Verified: 97 regions at 99.68 mean confidence, with `certifi`, `urllib3`
and `idna` never entering `sys.modules`. Removing an HTTP client from an air-gapped product
is worth doing for NFR2 on its own.

**FFmpeg (LGPL-2.1-or-later) inside `opencv-python` — measured not loaded.** `opencv-python`
redistributes a 28.6 MB FFmpeg DLL, which no metadata field mentions; its
`LICENSE-3RD-PARTY.txt` does. It is a lazily-loaded video-I/O plugin, and this service never
opens a video. Measured across a full OCR pass: `cv2.pyd` loads,
`opencv_videoio_ffmpeg4130_64.dll` does not. Redistributed but not linked — weaker than the
shapely fix, which removed the package outright, and stronger than disclosure alone.

**DarkGarden fonts (GPL-2.0-or-later) inside `reportlab` — not shipped.** ReportLab is the
fixture generator's dependency, and the generator is build-time only: its output, a PNG and
a PDF, is committed and the tool is not run on the box. It draws with the PDF base-14 font
names, which are metric-only and substituted at raster time, so no font file is embedded in
any output.

**Eigen (MPL-2.0) inside `onnxruntime` — disclosed.** Header-only, compiled into
`onnxruntime.dll`, named in its `ThirdPartyNotices.txt`. Genuinely linked, so no
not-loaded argument is available. MPL-2.0's obligations are file-level and attach only to
modified MPL files; we modify none.

**libvips (LGPL-3.0-or-later) inside `sharp` — disclosed, and this one is a real loss.**
Measured on the running workbench process: `sharp-win32-x64-0.35.4.node`,
`libvips-cpp-8.18.6.dll` and `libvips-42.dll` were all loaded. It reaches us through
`@deepseek-ai/dsh-attachment-local`, a harness plugin.

The obvious fix was tried and does not work. A `disabled: true` row for `attachment-local`
in the profile's `cordis.patch.yml` — the same mechanism Epic 1 used to seal the tool list —
makes the workbench fail to boot:

```
dsh: 1 entry did not activate
@deepseek-ai/dsh-host-apiproxy: pending (waiting for service: attachments)
```

`attachment-local` is the only provider of the `attachments` service, and
`dsh-host-apiproxy` — the API gateway carrying sessions, workspaces, presets and settings —
requires it. No sharp-free attachment provider ships, and NFR5 forbids editing harness
source. The row was written, measured, reverted, and the reason left in
`profile/web/cordis.patch.yml` so nobody tries it again.

So libvips is disclosed. LGPL-3.0 permits redistributing an unmodified library with notice
and the ability to relink, which we can satisfy; it is compliant, it is simply not
permissive, and the attestation report has to say so.

## What this does to the claim

"Every component is permissively licensed" was not survivable, and
`blind-flange.html` §Feasibility and `DECK-CONTENT.md` still say it. Two components of 490
are weak copyleft and linked at runtime. That sentence is flagged for rewriting, not
rewritten here — deck copy is the project owner's.

What is safe to say, and now backed by a re-runnable audit:

- **Apache-2.0 / MIT across the fleet.** Verified from the `LICENSE` file at the pinned
  revision of every model. Unchanged and unaffected by any of this.
- **479 of 490 components sit on the eleven-name permissive set.** The other eleven rows are
  the copyleft findings below, the two `LicenseRef-PdfiumThirdParty` rows, and the research
  licence the loader refuses on purpose.
- **Two components carry weak copyleft *and are linked at runtime*, both inherited rather
  than chosen, both named:** libvips inside the harness's attachment store, and Eigen inside
  ONNX Runtime. Neither carries a disclosure obligation for our code. The rest of the
  copyleft was removed or is measured not loaded.
- **Every copyleft component that could be removed, was** — shapely's GEOS in the engine
  swap, and `requests`/`tqdm`/`certifi` here.

That is a stronger position in front of an MRPL reviewer than the sentence it replaces,
because a reviewer can check it and it survives being checked.

## Status

accepted, 28 August 2026.

Amends `docs/licence-policy.md`: the allow-list becomes the rule and the eleven-name set
above. Supersedes the four-name list from ADR-0005, which stands as the reasoning for why
BSD-2 and BSD-3 were admitted and why CDLA-Permissive-2.0 was not — that asymmetry is
unchanged, and CDLA remains refused.

Enforced by `plugins/dsh-client-ui-base/lib/registry/fleet.js` (`ALLOWED_LICENCES`, read by
both the model loader and the audit) and by `scripts/licence-audit.mjs`, which fails when a
component outside the set has no decision recorded in `docs/licence-decisions.json`.
