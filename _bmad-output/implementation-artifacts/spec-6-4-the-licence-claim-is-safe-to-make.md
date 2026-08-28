---
title: 'The licence claim is safe to make'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The licence claim is safe to make

## Intent

**Problem:** `docs/licence-policy.md` says the value of the policy is that it is *enforced* rather than asserted, and names three mechanisms. Two existed — the registry carries a `licence:` per fleet member, and the loader refuses one outside the allow-list. The third, an audit of the whole dependency tree, did not, so the strongest argument in the pitch rested on four names nobody had checked against what actually installs. The file also recorded a gap against itself: four rows added on 28 August were established from project documentation rather than from the `LICENSE` file at a pinned version.

**Approach:** `scripts/licence-audit.mjs` enumerates every transitive licence across all four trees — the harness under `~/.dsh`, the web profile, our own packages, and the Python ingestion service via `scripts/licence_audit.py` — plus the fleet through the model loader's own gate, so the models and the code are judged by one allow-list rather than two. It joins each component against `docs/licence-decisions.json` and exits non-zero when something outside the set has no decision, has one recorded as `open`, is keyed twice, carries an evidence path that no longer exists on disk, or when `docs/licence-policy.md` or `CLAUDE.md` no longer names what the code gates on. It is wired into `npm test`.

The first run enumerated **490 components and found 27 outside the four-name allow-list**, which is the finding this story exists to produce. ADR-0006 turns the list into a rule with an enumerated set of eleven names and admits the 16 permissive rows — closing Pillow's MIT-CMU and Clipper's BSL-1.0, both open since Story 4.1 and the RapidOCR swap. Copyleft is never admitted by widening: the remaining six are decided one at a time, with evidence.

Two of those six were removable and were removed. `requests` and `tqdm` are now sealed out of the OCR path by `ocr.py::_seal_out_http`, the same technique `_seal_out_geos` already used for shapely, which takes MPL-2.0 (`certifi`, `tqdm`) out of the runtime and an HTTP client out of an air-gapped product. FFmpeg inside `opencv-python` is measured not loaded. Eigen inside `onnxruntime` and libvips inside `sharp` are disclosed, because both are genuinely linked.

The libvips attempt is the part the plan did not anticipate, and the reason it is written down. A `disabled: true` row for `attachment-local` — the mechanism Epic 1 used to seal the tool list — makes the workbench fail to boot, because `attachment-local` is the sole provider of the `attachments` service and `dsh-host-apiproxy`, the API gateway carrying sessions, workspaces, presets and settings, requires it. The row was written, the failure measured, the row reverted, and the reason left in `profile/web/cordis.patch.yml` so nobody tries it again.

The audit also found what the pinning had missed: `opencv-python` and `numpy` are loaded by every OCR pass and were never in `requirements.txt`, breaking that file's own rule that an unpinned transitive is an unverified licence.

## Suggested Review Order

**The mechanism**

- The audit, top to bottom. The header comment says what it reads, what package metadata cannot see, and why bundled components are declared by hand with an evidence path the script checks.
  [`licence-audit.mjs:1`](../../scripts/licence-audit.mjs#L1)

- The gate. A composite expression fails on the specific licences inside it, so one decision cannot stand in for three.
  [`licence-audit.mjs:586`](../../scripts/licence-audit.mjs#L586)

- SPDX expression evaluation. `A OR B` passes when either side does, because a dual licence is a choice; `A AND B` needs both, because a conjunction is a set of obligations taken together.
  [`licence-audit.mjs:140`](../../scripts/licence-audit.mjs#L140)

- The Python half. It reads installed distributions rather than what a resolver would pick today, because the policy asks for the licence at the version pinned.
  [`licence_audit.py:1`](../../scripts/licence_audit.py#L1)

- One allow-list, exported so the audit and the model loader read the same set.
  [`fleet.js:217`](../../plugins/dsh-client-ui-base/lib/registry/fleet.js#L217)

**The decisions**

- ADR-0006. Why the permissive group is admitted by rule and the copyleft group never is.
  [`0006-the-allow-list-becomes-a-rule…`](../../docs/adr/0006-the-allow-list-becomes-a-rule-and-copyleft-is-decided-per-component.md)

- The decision record, and its vocabulary — `accepted`, `mitigated`, `not-shipped`, `disclosed`, `refused`, `rejected`, `open`. Read the `$comment` block first.
  [`licence-decisions.json:1`](../../docs/licence-decisions.json#L1)

- The policy, with the four re-verified rows and the copyleft table. This is where the second acceptance criterion lands.
  [`licence-policy.md:1`](../../docs/licence-policy.md#L1)

**What was removed, and what was measured**

- The HTTP seal. The stubs raise rather than no-op, so a future RapidOCR that moves real work behind those imports fails loudly instead of quietly downloading something.
  [`ocr.py:97`](../../services/ingestion/ocr.py#L97)

- The test that holds it.
  [`test_service.py:119`](../../services/ingestion/test_service.py#L119)

- The reverted `attachment-local` row, kept as a comment because the failure is the finding.
  [`cordis.patch.yml:1`](../../profile/web/cordis.patch.yml#L1)

**The output**

- The generated report — 490 components, the licence histogram, and every row outside the set with its decision.
  [`licence-audit.md`](../../docs/licence-audit.md)

- The notices, and the cross-check of the harness's own disclosure against what actually installs.
  [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md)
