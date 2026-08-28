---
title: 'The loader refuses a fleet member with a disallowed licence'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The loader refuses a fleet member with a disallowed licence

## Intent

**Problem:** `docs/licence-policy.md` demands the licence rule be enforced by software — "the
loader refuses to load any model whose licence class is outside the allow-list. Not a warning. A
refusal." Story 3.3's `allowedFleet` filtered disallowed members silently; a silent drop is not a
stated refusal.

**Approach:** New `lib/registry/loader.js` — `loadFleet()` splits `registry/models.yaml` into
`{ loaded, refused }` by the ADR-0005 allow-list (Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause),
each refusal carrying a reason that names the offending licence; `announceRefusals()` states each
on stderr as an error, deduped per process. `llm-adapter.js` builds the model list from
`loadFleet().loaded` and announces refusals once at mount. The gate reads the allow-list, never a
blocklist, so `Qwen/Qwen2.5-3B-Instruct` (Qwen Research Licence) and any other disallowed licence
are refused identically while the three Apache-2.0 members load.

## Suggested Review Order

1. [`loader.js`](../../plugins/dsh-client-ui-base/lib/registry/loader.js) — the gate: `loadFleet` split and the stated, deduped refusal.
2. [`llm-adapter.js`](../../plugins/dsh-client-ui-base/lib/model-plane/llm-adapter.js) — model list now from `loadFleet().loaded`; refusals announced once at mount.
3. [`fleet.js`](../../plugins/dsh-client-ui-base/lib/registry/fleet.js) — `allowedFleet` comment updated; it is now the plain predicate view, `loadFleet` owns the gate.
4. [`loader.test.js`](../../plugins/dsh-client-ui-base/test/loader.test.js) — allow-list not blocklist, per-member refusal, shipped-registry check.
