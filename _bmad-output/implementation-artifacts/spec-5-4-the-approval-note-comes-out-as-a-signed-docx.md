---
title: 'The approval note comes out as a signed .docx'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The approval note comes out as a signed .docx

## Intent

**Problem:** The workbench had no way to turn a completed set of findings into a real deliverable — no tool existed to write a titleblock, a reference number, cited clauses traceable to their provenance, a signature block and a provenance content hash into a `.docx` a reader could actually open.

**Approach:** Added a real tool, `bf_approval_note`, that writes a genuine OOXML `.docx` to disk. The obvious library (`docx` on npm) was evaluated and rejected — its transitive tree carries ISC, Zlib and BlueOak-1.0.0 licences, none on this project's allow-list, and widening that list is an ADR-level decision, not one to make at the point of use. Instead the ZIP and the XML are hand-written using only `node:zlib` and `node:crypto` — zero new dependencies. `presentCall` returns the exact render-intent shape (`generic` card, `kind: 'edit'`, `locations`) the shipped produced-files row already reads, so no UI was built.

## Suggested Review Order

**The licence decision, made before any code was written**

- Why `docx` was rejected and what replaces it — the reasoning that shaped everything else in this diff.
  [`profile-install.md:696`](../../docs/profile-install.md#L696)

**The dependency-free OOXML package**

- The ZIP writer: local file headers, central directory, EOCD — built from `node:zlib`'s `deflateRawSync` and `crc32` alone.
  [`zip.js:1`](../../plugins/dsh-client-ui-base/lib/deliverables/zip.js#L1)

- The document itself: titleblock, cited clauses with page-and-region provenance, signature block, and a footer carrying the content hash — no named styles, to avoid Word's "unreadable content" recovery prompt.
  [`docx.js:1`](../../plugins/dsh-client-ui-base/lib/deliverables/docx.js#L1)

**The tool that ties it to the produced-files row**

- `presentCall`'s render-intent shape, matched against the harness's own `turn-deliverables.ts` rather than assumed.
  [`tool.js:170`](../../plugins/dsh-client-ui-base/lib/deliverables/tool.js#L170)

- Provenance validation: every clause must carry a page and a bounding box, or the call is rejected before anything is written.
  [`tool.js:60`](../../plugins/dsh-client-ui-base/lib/deliverables/tool.js#L60)

**Verified against the real harness, not just unit tests**

- The `dsh --profile headless` run that wrote a real file, plus the independent verification against it: `unzip -t`, `python-docx`, and real Microsoft Word via COM automation — and the LibreOffice gap, disclosed rather than hidden.
  [`profile-install.md:716`](../../docs/profile-install.md#L716)

**Tests**

- The ZIP writer round-tripped through an independent reader (`node:zlib`'s own inflate/crc32), not the same code checking itself.
  [`zip.test.js:1`](../../plugins/dsh-client-ui-base/test/zip.test.js#L1)

- The OOXML body: titleblock, both clauses' provenance, escaping of XML-significant characters, and the footer's content hash.
  [`docx.test.js:1`](../../plugins/dsh-client-ui-base/test/docx.test.js#L1)

- The tool against a real temp-directory filesystem — no `writeFileSync` stub — plus every validation rejection and the produced-files render-intent shape.
  [`deliverables.test.js:1`](../../plugins/dsh-client-ui-base/test/deliverables.test.js#L1)
