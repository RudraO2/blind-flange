# How do llama-swap and llama-server get onto this box?

Type: research
Status: resolved
Blocked by: —

## Answer

Full findings with sources: [research/02-llama-swap-bringup.md](../research/02-llama-swap-bringup.md).

- **llama-swap `v251`**, asset `llama-swap_251_windows_amd64.zip` (13.4 MB). Invoke
  `llama-swap.exe --config <path> --listen 127.0.0.1:8080`. Bind loopback deliberately — API
  keys are opt-in, so a LAN bind is an unauthenticated inference endpoint. It binds children to
  a Windows Job Object, so killing it will not orphan a `llama-server.exe` holding VRAM.
- **llama.cpp binaries live on `bNNNNN` nightly tags, not `releases/latest`** — `latest` is
  `v0.3.0` whose only asset is a 7-byte pointer file. Latest at research time: `b10687`.
  **Take the Vulkan build, not CUDA** — see ticket 04, this is a licence decision. No
  compilation, no CUDA Toolkit.
- **Exclusivity needs no configuration.** One model at a time is llama-swap's default with no
  `routing` section. The residency policy is an absence.
- **`GET /running`** returns `{"running":[{model, state, cmd, proxy, ttl, name, description}]}`,
  `[]` when idle, `state` one of `stopped`/`starting`/`ready`/`stopping`/`shutdown`. The
  residency surface reads this rather than tracking state. `proxy` is the *configured* value and
  is empty when the config uses the `${PORT}` default — do not render it as an address.
  `GET /api/events` is an SSE alternative, unexamined.
- **`POST /v1/chat/completions`, SSE.** The parser must handle `data: ` prefixed lines, a
  `data: [DONE]` sentinel, text at `choices[0].delta.content`, reasoning at either
  `delta.reasoning_content` or `delta.reasoning`, chunks with neither field, partial lines across
  reads, and **SSE comment lines starting with `:`** — llama.cpp emits ping comments during a
  long prefill, which is exactly when a brittle parser falls over.
- Turing/SM 7.5 ships as **PTX, not a precompiled cubin**, so the driver JITs on first run.
  Discard the first cold-start measurement in ticket 07.

## Question

Exactly what has to be downloaded and run to get llama-swap driving `llama-server` on this
machine — Windows 11, GTX 1650 Ti (Turing, compute capability 7.5), CUDA driver 592.82, no
llama.cpp present, 238 GB free on `D:`?

Needed as concrete answers, not general guidance:

- The current llama-swap release, its Windows asset name, and how it is invoked
  (`--config`, `--listen`, anything else load-bearing).
- Which llama.cpp release asset carries a **prebuilt Windows CUDA `llama-server.exe`** that
  covers SM 7.5, and whether any CUDA runtime redistributable has to be installed alongside it.
  Confirm no compilation step is required.
- The minimal llama-swap YAML for two models where one is GPU-resident and one is CPU-only
  (`-ngl 0`), including whatever expresses "only one of these may be loaded at a time" —
  groups, TTL, or whatever the current config vocabulary calls it.
- Whether llama-swap exposes a queryable endpoint reporting which models are currently loaded,
  and its exact shape. The residency panel reads this rather than tracking state itself.
- The OpenAI-compatible endpoint path and whether streaming is SSE, since
  `LocalModelProvider` has to parse it.

Prefer official docs and the repository over blog posts. Record findings with URLs.
