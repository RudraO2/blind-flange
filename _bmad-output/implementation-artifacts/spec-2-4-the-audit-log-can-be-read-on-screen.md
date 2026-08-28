---
title: 'The audit log can be read on screen'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The audit log can be read on screen

## Intent

**Problem:** Story 2.1 wrote every denial to the session log, Story 2.2 counted them, and
Story 2.3 gave an evaluator a button that makes one happen. What was still missing is the
reading: the evidence existed only as JSONL on disk, so "show me" meant a terminal. An
evaluator asking that question at a demo table will not be handed a shell.

**Approach:** No new slot and no new session event. The egress monitor's full panel becomes the
audit surface, and the timestamp comes from the record itself — the harness's `SessionEvent`
envelope carries `seq` (monotonic) and `time` (unix epoch milliseconds) on every event, so the
client-side `bf-egress` node Definition keeps both alongside the `{ tool, target }` data the
denial waterfall already appends. The view builder folds those nodes into `entries`, sorted by
the log's own sequence number, so they read in the order they were written however they were
delivered; `count` becomes `entries.length`, still a count rather than a literal (FR15). The
panel lists each denial under "Audit log — oldest first": local clock reading, tool, refused
target, with the ISO 8601 stamp and the whole sentence on the row's `title`. Because the panel
was already subscribed to that view through `useSyncExternalStore`, a fresh denial appears in
the open list with no restart and no reopening. Both-theme screenshots at
`docs/screenshots/2-4-audit-log-{light,dark}.png`.

**Decided here, because the plan did not record it:**

- **The audit surface is the egress monitor's panel, not a new seat.** The story says "the
  audit surface" without naming one. An evaluator who asks "show me" is already looking at the
  monitor — it is the thing that just turned red — and a second surface folding the same
  `egress/denied` events would be two places to keep in step for no gain. The panel already
  carried a one-line `Last: tool → target` detail; this story makes that line the list it was
  standing in for.
- **The panel moved from bottom-right to below the session header.** Story 2.2 anchored the
  card bottom-right, which was fine while it was three lines tall. The audit list makes it tall
  enough to cover the canary button in the composer row — the one control an evaluator presses
  *while* watching this panel, which would have broken the demo moment the epic is built around.
  It now opens at `top: 88px`, below the header where the chip that opens it lives, so it reads
  as that chip's own surface; the list is capped at `maxHeight: 168px` and scrolls, so the card
  cannot grow back down into the composer. The header measured 76px at default density on
  28 August 2026.
- **A missing field is named as missing.** A record with no envelope `time` renders "no
  timestamp recorded" and an empty target renders "unrecorded target", rather than a fallback
  value that reads like a real one. An audit surface that invents a value is worse than one that
  admits a gap.
- **`toLocaleTimeString` on the line, ISO 8601 in the title.** The readable form is what an
  evaluator matches against the moment they pressed the canary; the unambiguous form is one
  hover away and is the one that belongs in a screenshot of an audit claim.

**Verified on a running `dsh web`, 28 August 2026:** three canary firings list as three rows,
oldest at the top, each with its clock reading, `bf_canary`, and
`https://example.com/blind-flange-canary`; firing again with the panel already open adds the
fourth line in place with no reload; the denials survive a page reload, since the stored log
replays them back through the same fold.

**Review:** one subagent (`bmad-build` one-shot's own layer, `Story Reviewer`). One finding,
patched: the list is oldest-first inside a box capped at 168px, which holds three entries, and
nothing scrolled it — so from the fourth denial on, the newest line rendered below the fold. That
is the line an evaluator pressing the canary is watching for, so it landed on the story's own
third criterion. Fixed by scrolling the box to the end whenever the entry count changes, rather
than by reversing the order, which the "in the order they were written" criterion rules out.
Verified live at five denials: the box is scrolled to its end and the newest row is fully
visible. Nothing else was raised.

## Suggested Review Order

1. [`plugins/dsh-client-ui-base/lib/client.js`](../../plugins/dsh-client-ui-base/lib/client.js) — three places: `egressNodeDefinition.start` keeps the envelope's `time` and `seq`; `createEgressViewBuilder`'s `summarise` returns `entries` ordered by that sequence number; `buildEgressPanel`'s `auditLine` renders one row, and the panel's `style` comment records why the card moved out of the composer's way.
2. [`plugins/dsh-client-ui-base/test/client.test.js`](../../plugins/dsh-client-ui-base/test/client.test.js) — the Definition keeps the log's timestamp and reports a missing one as null; entries delivered out of order still read in written order; the surface lists timestamp, tool and target; a later denial appears without a restart; a record with gaps is named as missing; the surface sets no colour of its own.
3. [`docs/screenshots/2-4-audit-log-light.png`](../../docs/screenshots/2-4-audit-log-light.png) / [`-dark.png`](../../docs/screenshots/2-4-audit-log-dark.png) — three listed denials with the canary button still reachable beneath, both themes.
4. [`docs/profile-install.md`](../../docs/profile-install.md) — new Story 2.4 section: no profile change, why no host-side event was added, the panel's move, and how to check it in the running app. The Story 2.2 and 2.3 sections are corrected where they described the old position and the old one-line detail.
