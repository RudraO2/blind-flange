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
