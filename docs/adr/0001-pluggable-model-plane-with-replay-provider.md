# Pluggable model plane with a replay provider

The only GPU available is a GTX 1650 Max-Q with 4 GB VRAM in a laptop, and no better
hardware is coming before the internal round. Live inference on it is slow enough to
stall a demo and hot enough to throttle mid-run. So every model call goes through one
`ModelProvider` interface with three implementations — `replay` (cached responses,
instant), `local` (llama.cpp on the 1650, genuinely offline), and `remote` (rented GPU
or an API, for development speed) — selected by config, never by a code path.

## Consequences

The live demo runs `replay` and says so out loud, then plays a recorded `local` run with
the cable physically pulled as the sovereignty proof. This is honest: the fallback was
already specified in §18's failure kit as `DEMO_CACHE=1`, and §17 Phase 1 already asks for
the 90-second recording. It is only dishonest if the replay mode is presented as live
inference, so the UI must always show which provider is active.

`remote` must never be the provider during any demo or recording. Renting a cloud GPU
inverts the project's central claim; it is a development convenience only.

Cached responses for `replay` are captured from real `local` runs, not hand-written, so
the replayed output is something the system actually produced.

## Amendment, 28 August 2026 — Phase 0 ships an authored cache

The paragraph above cannot hold for Phase 0, and it is better to say so than to leave a rule
in the repository that the code quietly breaks.

Real `local` inference on the GTX 1650 is a **stretch goal for day 4** of a four-day build, so
there are no real `local` runs to capture from. For the internal-round prototype the replay
cache is therefore **authored by hand**, and the disclosure on screen must say what is actually
true rather than implying capture.

**What this costs.** The text the workbench appears to produce is written by a person, not
generated. That is a real reduction in what the demo evidences, and it is why the original rule
existed.

**What it does not cost.** Everything ADR-0002 protects still holds. The egress denial, the
canary, the audit log, the router scoring, the OCR and its bounding boxes, and the `.docx`
generation are all real events produced by real code. Only token generation is authored — and
token generation was already the one swappable part.

**Therefore:**

- The provider indicator must not use wording that implies capture from a live run. It states
  that responses are cached and authored for the prototype.
- The cache format is the same one a captured cache would use, so replacing authored entries
  with captured ones later is a data swap, not a code change.
- When `local` runs — on day 4, or in any later phase — the authored entries are replaced with
  captured ones and this amendment is superseded rather than quietly forgotten.
- `remote` remains a development convenience only, never active during a demo or a recording.
  Unchanged.
