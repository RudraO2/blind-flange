---
title: "The agent's findings render as something you can read at a glance"
type: 'feature'
created: '2026-08-29'
status: 'done'
route: 'one-shot'
---

# The agent's findings render as something you can read at a glance

## Intent

**Problem:** Story 5.1's key findings arrived as a paragraph. An evaluator watching a scanned inspection report get processed sees a wall of prose with the page and region of each finding buried inside the sentences — a chat log, not an industrial instrument, and the first thing to read as such in a demo whose whole claim is that this is a workbench.

**Approach:** Adopt `@changfenhuang/dsh-genui` (MIT, pinned at `0.9.3`, installed through the profile bundle channel) and write a ```dsh-ui fence into the authored replay cache, so the key findings arrive as a table inline in the reply. The permitted component set is ours rather than the plugin's: three types — `table`, `chart`, `plot` — declared in `lib/genui/permitted-set.js` and enforced by a test that parses every fence in the cache and fails on a type outside the set, on an `action` key anywhere (the plugin's event loop back into the model, which nothing here needs), and on any `href` or `src`. The same test checks each row's cited region against the OCR capture, so the table can never quietly cite a region the crop viewer cannot show. The pin is 0.9.3 rather than the newest release because 0.9.4 adds a template drawer with a timed hint and 0.9.5 adds gamified achievement toasts mounted onto `document.body` — both in Chinese, both outside the slot registry, neither switchable off, and the second fires on the first rendered fence.

## Suggested Review Order

**The decision this story is really made of**

- The permitted set, the two keys that ride along with it, and why each type outside it is out.
  [`permitted-set.js:1`](../../plugins/dsh-client-ui-base/lib/genui/permitted-set.js#L1)

- The pin, and the two releases it deliberately sits behind.
  [`start.mjs:30`](../../scripts/start.mjs#L30)

**What actually changed on screen**

- The reply: a lead line, the fence, the recommended actions in prose, and the sentence that sends the reader to the Provenance tab. The table's `Read from` column is written the way that tab writes it.
  [`replay-cache.json:1`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-cache.json#L1)

- Both themes, at 1600×1000, on the live workbench.
  [`story-8-1-findings-table-light.png`](../../docs/screenshots/story-8-1-findings-table-light.png) · [`story-8-1-findings-table-dark.png`](../../docs/screenshots/story-8-1-findings-table-dark.png)

**The adoption gate, and the evidence for each half of it**

- Install path, why web only, what the plugin mounts, and the prefetch behaviour that had to be measured rather than assumed.
  [`profile-install.md:1008`](../../docs/profile-install.md#L1008)

- The three engines the package vendors that no metadata field names, and the measurement that says none of them is executed here.
  [`THIRD_PARTY_NOTICES.md:74`](../../THIRD_PARTY_NOTICES.md#L74)

- The same four components as decision records the audit reads.
  [`licence-decisions.json`](../../docs/licence-decisions.json)

**Tests**

- Every fence in the cache parsed and checked; the negative cases (quiz, scene3d, input, a buried `action`, an `href`, a `src`); and each cited region resolved against the 156-line OCR capture.
  [`genui.test.js:1`](../../plugins/dsh-client-ui-base/test/genui.test.js#L1)

- Story 5.1's own replay test, updated: the per-finding citation moved into the table and is now asserted in the crop viewer's wording.
  [`model-plane.test.js:288`](../../plugins/dsh-client-ui-base/test/model-plane.test.js#L288)
