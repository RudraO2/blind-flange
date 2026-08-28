# Licence policy

**This is a hard constraint, not a preference.** It applies to model weights, to every
runtime dependency, and to the harness. Any architecture, story, or dependency choice that
violates it is rejected regardless of technical merit.

## The rule

**Apache-2.0, MIT, BSD-2-Clause and BSD-3-Clause only.** Nothing else ships.

Amended 28 August 2026 by ADR-0005, from an earlier "Apache-2.0 and MIT only". The four
licences on this list sit in one legal class for the buyer this policy exists to satisfy: no
copyleft, no user cap, no field-of-use restriction, no disclosure obligation. A PSU legal
reviewer reads BSD-2 and BSD-3 the same way they read MIT — BSD-3-Clause is in fact simpler
than Apache-2.0, which carries a patent grant. The list was widened deliberately and in
writing because the value of this policy is that it is *enforced* rather than asserted, and
quietly tolerating a third licence would destroy that.

**Widening the list is an ADR-level decision, not a judgement call made at the point of use.**

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
3. **The attestation report** hands the evaluator an SBOM with the licence of every
   component. The claim is auditable at the moment it is made.

## Verified so far

| Component | Licence | Verified |
|---|---|---|
| DeepSeek Harness (`deepseek-ai/deepseek-harness`) | MIT | 27 Aug 2026, read from repo `LICENSE`, not from documentation |
| Cordis (`cordiverse/cordis`) | MIT | 27 Aug 2026, read from repo `LICENSE` at `main` |
| `@deepseek-ai/dsh` (npm) | MIT | 27 Aug 2026, `license` field in `apps/cli/package.json` |
| Tesseract (`tesseract-ocr/tesseract`) | Apache-2.0 | 28 Aug 2026 — **re-verify by reading `LICENSE` at the pinned version before the claim ships** |
| tessdata (`tesseract-ocr/tessdata`, `tessdata_fast`, `tessdata_best`) | Apache-2.0 | 28 Aug 2026 — **re-verify by reading `LICENSE` at the pinned version before the claim ships** |
| pytesseract (`madmaze/pytesseract`) | Apache-2.0 | 28 Aug 2026 — **re-verify by reading `LICENSE` at the pinned version before the claim ships** |
| pypdfium2 (`pypdfium2-team/pypdfium2`) | Apache-2.0; bundled PDFium engine BSD-3-Clause | 28 Aug 2026 — **re-verify by reading `LICENSE` at the pinned version before the claim ships** |
| `Qwen/Qwen2.5-7B-Instruct` (fleet — general reasoner) | Apache-2.0 | 28 Aug 2026 — read the `LICENSE` file at revision `a09a35458c702b33eeacc393d103063234e8bc28`: "Apache License, Version 2.0" |
| `Qwen/Qwen2.5-Coder-7B-Instruct` (fleet — coder) | Apache-2.0 | 28 Aug 2026 — read the `LICENSE` file at revision `c03e6d358207e414f1eca0bb1891e29f1db0e242`: "Apache License, Version 2.0" |
| `Qwen/Qwen2.5-VL-7B-Instruct` (fleet — vision-document) | Apache-2.0 | 28 Aug 2026 — **no `LICENSE` file exists in this repo at any revision**; verified from the `license: apache-2.0` field in `README.md` YAML frontmatter at revision `cc594898137f460bfe9f0759e9844b3ce807cfb5`. Recorded decision (28 Aug 2026): the model-card metadata at a pinned revision is a primary declaration and is accepted here in the absence of a `LICENSE` file. Re-check for a `LICENSE` file before the claim ships. |
| `Qwen/Qwen2.5-3B-Instruct` (declared only so the loader refuses it — Story 3.4) | **Qwen RESEARCH LICENSE AGREEMENT** | 28 Aug 2026 — read the `LICENSE` file at revision `aa8e72537993ba99e69dfaafa59ed015b17504d1`: "Qwen RESEARCH LICENSE AGREEMENT, Release Date: September 19, 2024". Outside the allow-list by design — see the Rejected table. |

The four `docs`-stack rows added on 28 August were established from published project
documentation, not yet from the `LICENSE` file at a pinned version. They are recorded here so the work is not
repeated, but they do **not** yet satisfy this policy's own standard. Close that gap before
the claim goes in front of MRPL.

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
