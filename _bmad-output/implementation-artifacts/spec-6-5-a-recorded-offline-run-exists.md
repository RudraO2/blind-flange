---
title: 'A recorded offline run exists'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# A recorded offline run exists

## Intent

**Problem:** The round format is unannounced, and a video submission, a projector failure and
a live demo that will not start are all the same problem. Nothing in the repo could show the
three demo beats without the workbench being up and behaving.

**Approach:** `scripts/record-demo.mjs` drives the running workbench through the three beats
over the Chrome DevTools Protocol and records Chrome's own screencast of the page, then muxes
the frames to MP4 with their real timings. Every step waits on a live DOM condition and the
run is checked against the story's own criteria — hook inside 30s, under 3 minutes, the
replay provider positively disclosed at every sample — before a frame is encoded, so the
script fails rather than producing a video of something that did not happen.

## Suggested Review Order

1. [`scripts/record-demo.mjs`](../../scripts/record-demo.mjs) — the recorder. Read the beat
   sequence and the checks that follow it; that is where the acceptance criteria are enforced.
2. [`videos/recorded-offline-run/RECORDING.md`](../../videos/recorded-offline-run/RECORDING.md)
   — what the recording shows, and what it deliberately does not hide.
3. [`videos/recorded-offline-run/recording-light.json`](../../videos/recorded-offline-run/recording-light.json)
   — the evidence the doc's claims are read from, not written over.
4. [`docs/licence-decisions.json`](../../docs/licence-decisions.json) and
   [`docs/licence-policy.md`](../../docs/licence-policy.md) — the `ffmpeg` CLI is the one
   external tool this story adds, decided rather than assumed.
