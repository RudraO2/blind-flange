---
title: 'Clicking a finding shows the crop it was read from'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# Clicking a finding shows the crop it was read from

## Intent

**Problem:** Epic 4 produced findings that each carry a page number and a bounding box, and nothing showed them. Provenance on this project means page *and* region (CONTEXT.md); until a claim can be clicked through to the pixels it was read from, the workbench asserts provenance rather than demonstrating it.

**Approach:** One route on the host half and one tab in the browser half, both inside the plugin package already installed. The host serves the ingestion capture — the same `sample-report-findings.json` the `bf_report_findings` tool reads — plus the real 300 dpi page PNGs, with each page's pixel size parsed out of the PNG's own IHDR header rather than recorded as a constant. The browser takes `conversation.view` as a tab, lists all 156 findings, and on a click cuts the crop itself: a clipping box the size of the recorded bounding box with the whole page image inside it, scaled and offset by that box's own top-left. There is no pre-rendered crop anywhere in the package — move a bounding box and the pixels on screen move with it. The page PNGs are byte-identical copies of the Epic 4 fixtures, committed into the plugin (with a test that asserts they have not drifted) because the Python ingestion service is a separate tree and reaching across it at runtime would tie the panel to the repository layout that happens to hold while the profile installs with `link:`.

## Suggested Review Order

**The claim this story makes, and the file that keeps it honest**

- The route: what it serves, what it deliberately does not generate, and why the page size is read from the PNG instead of written down.
  [`provenance.js:1`](../../plugins/dsh-client-ui-base/lib/findings/provenance.js#L1)

**The crop itself**

- The geometry — a clip box the size of the bounding box, and the offset that brings that region of the full page underneath it. This is the whole of "the region shown corresponds to the bounding box recorded".
  [`client.js:1307`](../../plugins/dsh-client-ui-base/lib/client.js#L1307)

- The panel: findings list, the quoted text, the crop, and the whole-page locator that places it. Claim first, evidence second.
  [`client.js:1582`](../../plugins/dsh-client-ui-base/lib/client.js#L1582)

- The seat: `conversation.view` as a labelled tab, ordered after Chat and Trajectory rather than replacing either.
  [`client.js:1858`](../../plugins/dsh-client-ui-base/lib/client.js#L1858)

**Verified against the running harness, not only in tests**

- The three `curl` probes, the geometry the browser actually computed for a real finding, and the layout trap that cost a re-take of the screenshots.
  [`profile-install.md:812`](../../docs/profile-install.md#L812)

**Tests**

- The host half against the real shipped capture and the real page images: the page sizes parsed from the PNGs, every bounding box checked to lie inside the page it names, a missing page reported rather than dropped, and the path handling (query strings, traversal, HEAD, 405).
  [`provenance.test.js:57`](../../plugins/dsh-client-ui-base/test/provenance.test.js#L57)

- The browser half evaluated out of `client.js` in a `vm`: nothing cropped before a click, the clip box and image offset asserted as rendered style for a known bounding box, the height-bound case, and no hand-rolled colour anywhere in the rendered tree.
  [`provenance.test.js:195`](../../plugins/dsh-client-ui-base/test/provenance.test.js#L195)
