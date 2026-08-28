# The recorded offline run — Story 6.5

The insurance policy. A video submission, a projector failure and a live demo that will not
start are all the same problem, and this is the answer to all three: a recording of the real
workbench doing the three demo beats, made by a script that can make it again.

| | |
|---|---|
| **Watch** | `blind-flange-offline-run-light.mp4` — 59s, 1440×900, H.264, 1.6 MB |
| **Dark theme** | `blind-flange-offline-run-dark.mp4` — the same run, same script, `--theme dark` |
| **Evidence** | `recording-light.json`, `recording-dark.json` — what the recorder observed, second by second |
| **Remake it** | `npm start` in one terminal, `npm run record-demo` in another |
| **Recorded** | 28 August 2026, harness `0.1.1-rc.2`, Chrome 152.0.7977.64 |

## What is on screen

The demo order, not the build order: Epic 2 opens because it lands in three seconds with an
audience that has never seen a P&ID.

| At | Beat | What the workbench does |
|---|---|---|
| 0:03 | **Blind Flange, sealed and idle** | Our mark, our tab title, no API-key modal |
| 0:06 | **The egress monitor reads zero** | And the provider disclosure reads *Replay — authored responses* |
| 0:09 | **The canary is fired and denied** | One deliberate outbound call, refused, the monitor red and counting `Egress 1` |
| 0:15 | **The audit line, on screen** | `bf_canary` against `https://example.com/blind-flange-canary`, timestamped |
| 0:23 | **The router picks the vision-document model** | `Qwen2.5-VL-7B-Instruct`, for a request about the inspection report |
| 0:29 | **The routing chip shows its working** | The score per fleet member, not a badge that says "trust me" |
| 0:42 | **The model changes by itself** | A coding request, and the chip is now `Qwen2.5-Coder-7B-Instruct`. Nothing on screen let the operator choose |
| 0:52 | **The approval note comes out** | `approval-note-NRC-RVF-APPR-0417.docx`, signed, citing the page and region each finding was read from |

Silence proves nothing, so the canary is what turns the monitor's zero into evidence — and
the same principle governs this file. Everything above is asserted by the recorder against
the live DOM and written into `recording-<theme>.json`; none of it is a caption typed over
a video afterwards.

## What the recorder checks, and refuses to record without

`scripts/record-demo.mjs` fails the run rather than producing a video of something that did
not happen. Every beat waits on a real condition — the audit line's text, the chip's model
name, the produced filename — with a thirty-second ceiling on each, and the run is checked
against the story's own criteria before a single frame is encoded:

- **The `remote` provider was never active (ADR-0001).** Not inferred from the absence of the
  word: the disclosure is sampled thirteen times across the run and every sample has to
  positively read `Replay — authored responses` with the replay provider's own title text.
  Exactly one blank is tolerated, and only the first — the disclosure lives in the session
  header, which does not exist until the first turn, so the opening shot of the idle workbench
  has no provider to read. Any later blank fails the run, because a recording that cannot show
  which provider answered proves nothing either way. That is twelve positive samples in the
  recordings as shipped, and the one blank is beat `00-workbench` at 0:03. The profile backs
  this up statically — `profile/web/cordis.patch.yml`'s `agent-default-model` row sets
  `config.provider: replay`, and `model-plane/model-provider.js` throws if anything asks for
  `remote`.
- **The hook lands inside thirty seconds (NFR9).** The canary's audit line is on screen at
  0:15.
- **The whole thing runs under three minutes (NFR9).** It runs 55 seconds, and encodes to 59.
- **The monitor really did start at zero.** `Egress 0` before the canary, `Egress 1` after,
  both read off the chip rather than assumed.

## How it is made

Chrome's own screencast of the page, driven over the DevTools Protocol, with the frame
timings carried through to the encoder so the video is the same length as the run. No
compositing, no cuts, no overlaid captions, no re-timing. The one edit is the encode itself.

Node builtins only — the protocol is spoken over the platform's `WebSocket` and `fetch`
rather than a client library, because `docs/licence-policy.md` is enforced rather than
asserted. The single external tool is the `ffmpeg` CLI, which is build-time only, is not
shipped, and is recorded as a decision in `docs/licence-decisions.json` rather than waved
through as "just a build tool".

The theme belongs to the operator, so `--theme` asks for it through the workbench's own
Settings dialog and puts the original choice back afterwards — including when the run fails.

## Known, and deliberate

- The sidebar still reads **DSH Local Build**. The mark, tab title, favicon and persona are
  ours (Epic 1); the remainder of the rebrand is Story 7.2, deferred on 28 August 2026
  because no evaluation criterion rewards it inside this budget.
- The session list carries earlier replay sessions from this machine's build history. It is
  the real workbench on the real development box, not a staged empty one.
- Responses come from the replay provider, disclosed on screen throughout. Per ADR-0001's
  28 August 2026 amendment there is no `local` run to capture from yet, so the cache is
  authored by hand and says so.
