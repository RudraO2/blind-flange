# Bringing llama-swap + llama-server up on this box

Research note for [issue 02](../issues/02-how-do-llama-swap-and-llama-server-get-onto-this-box.md).
Researched 30 August 2026. Target: Windows 11 x64, GTX 1650 Ti (Turing, SM 7.5), driver 592.82,
no llama.cpp present, 238 GB free on `D:`, 15.4 GB RAM.

Every claim below is sourced from the llama-swap repository at tag `v251`, the llama.cpp
repository at nightly tag `b10687`, or the GitHub releases API for those two repos. Where a
claim is *not* verified, it says so in the same sentence. Content was rephrased for compliance
with licensing restrictions.

---

## TL;DR — the download list

| What | Asset | Size |
| --- | --- | --- |
| llama-swap v251 | [`llama-swap_251_windows_amd64.zip`](https://github.com/mostlygeek/llama-swap/releases/download/v251/llama-swap_251_windows_amd64.zip) | 13.4 MB |
| llama.cpp CUDA 12 build (contains `llama-server.exe` + `ggml-cuda.dll`) | [`llama-b10687-bin-win-cuda-12.4-x64.zip`](https://github.com/ggml-org/llama.cpp/releases/download/b10687/llama-b10687-bin-win-cuda-12.4-x64.zip) | 250 MB |
| CUDA 12.4 runtime DLLs (required, separate) | [`cudart-llama-bin-win-cuda-12.4-x64.zip`](https://github.com/ggml-org/llama.cpp/releases/download/b10687/cudart-llama-bin-win-cuda-12.4-x64.zip) | 391 MB |

~655 MB total. No compiler, no CUDA Toolkit, no build step. Extract the two llama.cpp zips into
**the same directory** (reason in §2).

---

## 1. llama-swap: release, asset, invocation

**Current release: `v251`**, published 2026-08-23T07:04:58Z. Source: the releases API record —
<https://api.github.com/repos/mostlygeek/llama-swap/releases/latest>, human-readable at
<https://github.com/mostlygeek/llama-swap/releases/tag/v251>.

There is exactly one Windows asset in that release:

```
llama-swap_251_windows_amd64.zip
sha256:f91ebc3bbf3e6b2d96a5c0e8c6967755a336734b3b8b7447b1a36cde670aee5f
13,373,344 bytes
```

Note the version string in the asset name is `251`, not `v251` — the tag carries the `v`, the
archive does not. That naming comes from goreleaser's
`{{ .ProjectName }}_{{ .Version }}_{{ .Os }}_{{ .Arch }}` template in
[`.goreleaser.yaml`](https://github.com/mostlygeek/llama-swap/blob/v251/.goreleaser.yaml), with a
`format_overrides` entry making Windows a zip instead of a tar.gz.

The same file also confirms `CGO_ENABLED=0` and the `embed_ui` build tag, so the binary is
statically linked with the web UI compiled in — there is nothing to install alongside it. The
README states this as "one binary, one configuration file. no external dependencies"
([README](https://github.com/mostlygeek/llama-swap/blob/v251/README.md)).

**Binary name inside the zip: `llama-swap.exe`.** Caveat: `.goreleaser.yaml` does not set
`builds.binary`, so this rests on goreleaser's documented default of using the project name. I did
not extract the zip to confirm. Check with `Expand-Archive` before wiring it into a script.

### Flags

The complete flag set, read from
[`llama-swap.go`](https://github.com/mostlygeek/llama-swap/blob/v251/llama-swap.go) (the `main()`
function's `flag.String`/`flag.Bool` declarations):

| Flag | Meaning |
| --- | --- |
| `-config` | path to a config file |
| `-config-dir` | directory of `*.yml`/`*.yaml` configs, additive to `-config` |
| `-listen` | listen address; defaults to `:8080`, or `:8443` when TLS is configured |
| `-tls-cert-file` / `-tls-key-file` | TLS; both or neither, else it exits 1 |
| `-version` | print version/commit/build date and exit |
| `-watch-config` | poll the config for changes and hot-reload (2s interval) |

At least one of `-config` or `-config-dir` must be given, or the process logs an error and exits 1.
These are Go `flag` package options, so `-config` and `--config` are interchangeable; the README's
examples use the double-dash form.

**The invocation for tonight:**

```powershell
D:\ai\llama-swap\llama-swap.exe --config D:\ai\llama-swap\config.yaml --listen 127.0.0.1:8080
```

Two load-bearing details:

- **Bind to loopback deliberately.** `llama-swap.go` explicitly logs a warning when the listen
  address is not a loopback address: it tells you the instance is reachable by every host on the
  network and suggests `-listen localhost:<port>`. API keys exist but are opt-in, so a
  non-loopback bind is an unauthenticated inference endpoint on the LAN. Loopback is the safe
  default and costs nothing here.
- **Process cleanup on Windows is handled.** `llama-swap.go` calls `process.SetupTreeCleanup()`,
  which the comment describes as binding the process tree to a Windows Job Object so upstream
  processes get reaped when llama-swap exits, even on a forced kill. Practically: killing
  llama-swap will not leave orphan `llama-server.exe` holding 3.7 GB of VRAM. Good news for a
  demo night.

Skip `-watch-config` unless you want config edits to take effect live; the reload tears down and
rebuilds the server, which will evict a loaded model.

---

## 2. llama.cpp: the prebuilt Windows CUDA `llama-server.exe`

### Which release

llama.cpp's versioning changed and this is the trap. `releases/latest` currently resolves to
**`v0.3.0`**, and that release's *only* asset is a 7-byte `nightly-tag.txt`; its body points at a
nightly build tag for the actual binaries
(<https://github.com/ggml-org/llama.cpp/releases/tag/v0.3.0>). Binaries live on the `bNNNNN`
nightly tags, which are marked `prerelease: true`.

**Latest nightly at time of writing: `b10687`**, published 2026-08-29T18:23:05Z
(<https://github.com/ggml-org/llama.cpp/releases/tag/b10687>). A newer one very likely exists by
the time this is read — nightlies landed roughly hourly on 29 August (b10682 … b10687 all within
three hours). The asset naming is stable, so substitute the tag:
`llama-<tag>-bin-win-cuda-12.4-x64.zip`.

### Which asset

Two zips, both needed:

```
llama-b10687-bin-win-cuda-12.4-x64.zip     250,537,973 bytes
  sha256:63b52f4eea95a09a32df360b28b928597d07375a380b8d79f20ba9f1cbfe1f59

cudart-llama-bin-win-cuda-12.4-x64.zip     391,443,627 bytes
  sha256:8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6
```

**Yes, the CUDA runtime redistributable is mandatory and separate.** From
[`.github/workflows/release.yml`](https://github.com/ggml-org/llama.cpp/blob/b10687/.github/workflows/release.yml),
the `windows-cuda` job's "Copy and pack Cuda runtime (x64)" step robocopies `cudart64_*.dll`,
`cublas64_*.dll` and `cublasLt64_*.dll` out of the toolkit install and packs them into the
`cudart-...` zip. Those DLLs are not in the main zip. You do **not** need to install the CUDA
Toolkit — the redistributable DLLs are the whole requirement.

**Everything goes in one directory.** The release build uses `-DGGML_BACKEND_DL=ON`, so backends
are separate DLLs loaded at runtime rather than linked into the executable. The same workflow's
"Merge artifacts" step explains the packaging: the `windows-cpu` zip carries the full toolset
(`llama-server.exe` with the embedded UI, plus the CPU backend), and it is injected into every
other Windows zip so each archive ships identical binaries differing only in which backend library
sits on top. The `windows-cuda` job itself builds only `ggml-cuda.dll` — its own job comment says
`llama-server` is injected from the windows-cpu zip during the merge.

Consequence: extract `llama-b10687-bin-win-cuda-12.4-x64.zip` and then
`cudart-llama-bin-win-cuda-12.4-x64.zip` into the *same* folder, e.g. `D:\ai\llama.cpp\`. Then
`llama-server.exe`, `ggml-cuda.dll`, `cudart64_*.dll`, `cublas64_*.dll` and `cublasLt64_*.dll` are
all siblings and the dynamic backend load succeeds.

**No compilation is required.** Confirmed structurally: the release workflow builds these zips in
CI and uploads them as release assets; the assets exist with the byte sizes and digests quoted
above. Nothing in the consumption path invokes a compiler.

### Does it cover SM 7.5? Yes — but as PTX, not as a precompiled cubin

This is the part worth reading carefully.

The release workflow does **not** pass `CMAKE_CUDA_ARCHITECTURES`; it passes only
`-DGGML_BACKEND_DL=ON -DGGML_NATIVE=OFF -DGGML_CPU=OFF -DGGML_CUDA=ON
-DLLAMA_BUILD_BORINGSSL=ON -DGGML_CUDA_CUB_3DOT2=ON`. So the defaults in
[`ggml/src/ggml-cuda/CMakeLists.txt`](https://github.com/ggml-org/llama.cpp/blob/b10687/ggml/src/ggml-cuda/CMakeLists.txt)
apply. With `GGML_NATIVE=OFF` the `"native"` branch is skipped and the list is built up as:

```cmake
if (CUDAToolkit_VERSION VERSION_LESS "13")
    list(APPEND CMAKE_CUDA_ARCHITECTURES 50-virtual 61-virtual 70-virtual)
endif ()
list(APPEND CMAKE_CUDA_ARCHITECTURES 75-virtual 80-virtual 86-real)
if (CUDAToolkit_VERSION VERSION_GREATER_EQUAL "11.8")
    list(APPEND CMAKE_CUDA_ARCHITECTURES 89-real 90-virtual)
endif()
```

So the CUDA 12.4 build ships `50/61/70/75/80-virtual`, `86-real`, `89-real`, `90-virtual`. SM 7.5
is in the list. The same file's own comments define the suffixes: `-virtual` means the code is
emitted as PTX and JIT-compiled to machine code by the driver on first run, `-real` means a device
binary for that specific architecture, and it annotates `75 == Turing, int8 tensor cores`.

What that means for the 1650 Ti:

- It works. Turing is covered.
- The first `llama-server` start on this box pays a one-time driver JIT cost to turn the PTX into
  Turing machine code. The driver caches the result, so subsequent starts are faster. **I did not
  find a llama.cpp source quantifying that cost** — treat "first launch is slower than later
  launches" as expected, and don't mistake it for a hang. This matters for ticket 07's swap-cost
  measurement: throw away the first measurement.

### CUDA 12.4 or CUDA 13.3?

Both nightly zips exist (`...-win-cuda-13.3-x64.zip`, 146 MB, plus a 391 MB cudart 13.3), and per
the CMake logic above, CUDA 13 also emits `75-virtual` — the `VERSION_LESS "13"` guard only drops
50/61/70. So Turing is covered either way, and the 13.3 build is a 105 MB smaller download.

**Recommendation: take CUDA 12.4.** Rationale: I have not verified NVIDIA's minimum-driver
requirement for the CUDA 13.3 runtime against an NVIDIA primary source in this session. Driver
592.82 is very new and almost certainly clears it, but "almost certainly" is not what you want at
1 a.m. The 12.4 runtime has the lower floor of the two and 105 MB is cheap against 238 GB free.
If someone wants to verify and switch, the fact to check is the CUDA 13.3 minimum Windows driver
version in NVIDIA's CUDA release notes.

---

## 3. Minimal working YAML: one GPU model, one CPU-only model, mutually exclusive

### The key finding on exclusivity

**You do not have to configure anything to get "only one at a time" — that is the default.**

From [`config.example.yaml`](https://github.com/mostlygeek/llama-swap/blob/v251/config.example.yaml),
the `routing` section is optional and selects between two swap engines: `group` (the default,
described as simpler — you define groups that run together and loading one group typically unloads
the others) and `matrix` (newer, an expression language describing which combinations may run
concurrently). Within that section, the example's `group1` is annotated as reproducing
llama-swap's default behaviour: only one model runs at a time across the whole instance. The
README says the same thing from the other direction — the basic configuration handles one model
at a time, and a `matrix` is what allows several to be loaded together.

So: two `models` entries, no `routing` block, and llama-swap will evict one to load the other.

Also note `groups` here is *not* dead vocabulary — v251 still has it, as the default engine. Older
guidance describing `groups` with `swap`/`exclusive`/`persistent` fields is still current. What
changed is that `matrix` has been added beside it under `routing.router.use`.

### The YAML

```yaml
# D:\ai\llama-swap\config.yaml
# llama-swap v251. Only one model is resident at a time — that is the default
# behaviour with no `routing` section, so mutual exclusion needs no configuration.

macros:
  # one place to bump the llama.cpp build
  llama-server: >
    D:/ai/llama.cpp/llama-server.exe
    --port ${PORT}
    --host 127.0.0.1

models:
  # GPU-resident lane.
  "coder":
    name: "Coder (GPU)"
    cmd: |
      ${llama-server}
      --model D:/ai/models/coder.gguf
      --n-gpu-layers 99
      --ctx-size 8192
      --jinja
    ttl: 300

  # CPU-only lane: -ngl 0 keeps every layer in system RAM.
  "router":
    name: "Router (CPU)"
    cmd: |
      ${llama-server}
      --model D:/ai/models/router.gguf
      -ngl 0
      --ctx-size 4096
      --jinja
    ttl: 300
```

Field-by-field provenance, all from `config.example.yaml` and
[`docs/configuration.md`](https://github.com/mostlygeek/llama-swap/blob/v251/docs/configuration.md):

- `cmd` — the command to launch the upstream server. Multi-line is supported.
- `${PORT}` — a per-model port assigned automatically at load time, counting up from `startPort`
  (default 5800). Because `cmd` uses `${PORT}`, the `proxy` field can be omitted; its default is
  `http://localhost:${PORT}`. If you hardcode a port in `cmd` instead, `proxy` becomes mandatory.
- `ttl` — seconds of idleness before automatic unload. Per-model default is `-1`, meaning "use
  `globalTTL`"; `0` means never unload. `globalTTL`'s own default is `0`.
- `name` — display string surfaced in the `/v1/models` response and in `/running`.
- `macros` — reusable substitutions; names must match `^[a-zA-Z0-9_-]+$`, be under 64 characters,
  and must not collide with the reserved `PID`, `PORT`, `MODEL_ID`.
- `checkEndpoint` — not set above, so it stays at its default `/health`, which llama-server
  provides. llama-swap holds requests until that endpoint returns 200.
- `unloadTimeout` — not set; global default is 10 seconds of grace before the process is force
  killed.

On the `-ngl` spelling: `common/arg.cpp` at `b10687` registers the same option under `-ngl`,
`--gpu-layers` and `--n-gpu-layers`, so all three are valid. It now accepts `auto` or `all` as
well as an integer, and **the default is `auto` (-1), not 0** — meaning a GPU build will try to
offload by itself. `-ngl 0` is the way to force a model onto the CPU, and being explicit on the
GPU model too costs nothing.

### If you want exclusivity stated out loud

Equivalent, but explicit — useful when a third tenant lands tomorrow and someone needs to see the
intent in the file rather than infer it from an absence:

```yaml
routing:
  router:
    use: group
    settings:
      groups:
        "one-at-a-time":
          swap: true        # only one member runs at a time
          exclusive: true   # running a member unloads every other group
          members:
            - "coder"
            - "router"
```

Per `config.example.yaml`: `swap` defaults to `true`, `exclusive` defaults to `true`, `members` is
required, every member must be a model ID defined under `models`, and a model may belong to only
one group. There is also `persistent: true` for a group other groups can never unload — that is
the knob if the teammate's router model ends up needing to stay pinned.

---

## 4. Residency: `GET /running`

**Yes. `GET /running` exists and reports exactly what the residency panel needs.**

Route registration, from
[`internal/server/server.go`](https://github.com/mostlygeek/llama-swap/blob/v251/internal/server/server.go):

```go
mux.Handle("GET /running", apiChain.ThenFunc(s.handleRunning))
```

Handler and response struct, from
[`internal/server/api.go`](https://github.com/mostlygeek/llama-swap/blob/v251/internal/server/api.go):

```go
type runningModel struct {
	Model       string `json:"model"`
	State       string `json:"state"`
	Cmd         string `json:"cmd"`
	Proxy       string `json:"proxy"`
	TTL         int    `json:"ttl"`
	Name        string `json:"name"`
	Description string `json:"description"`
}
```

The handler asks the local router for `RunningModels()`, joins each model ID against its config for
the cmd/proxy/ttl/name/description metadata, sorts the list by model ID, and encodes
`{"running": [...]}`. So the exact shape is:

```json
{
  "running": [
    {
      "model": "coder",
      "state": "ready",
      "cmd": "D:/ai/llama.cpp/llama-server.exe --port 10001 ...",
      "proxy": "",
      "ttl": 300,
      "name": "Coder (GPU)",
      "description": ""
    }
  ]
}
```

Four things to design the panel around:

1. **The list is empty when nothing is loaded** — `{"running":[]}`, since the slice is built with
   `make(..., 0, len(states))`. Not `null`.
2. **`state` values.** `ProcessState` is a string type with five constants, from
   [`internal/process/process.go`](https://github.com/mostlygeek/llama-swap/blob/v251/internal/process/process.go):
   `"stopped"`, `"starting"`, `"ready"`, `"stopping"`, `"shutdown"`. The handler's own comment says
   it lists local processes that are *not* stopped, so in practice expect `starting`, `ready`,
   `stopping`, `shutdown`. Treat anything other than `ready` as "not serving yet".
3. **`proxy` is the configured value, not the resolved one.** It is copied straight from
   `mc.Proxy`, so it is the empty string whenever the config omits it and relies on the
   `http://localhost:${PORT}` default — as the YAML above does. Do not display it as the model's
   address.
4. **It is local-only.** The `handleUnload` comment notes peer models are remote and unaffected;
   `/running` likewise reads `s.local.RunningModels()`. Irrelevant on a single box, but do not
   describe the panel as showing "the fleet".

Related endpoints from the README's llama-swap API list, if the panel wants actions:
`POST /api/models/unload` (unload everything), `POST /api/models/unload/:model_id`,
`GET /api/events` (SSE stream the built-in UI uses), `GET /metrics` (Prometheus, system and GPU),
`GET /api/hardware`, `GET /health` (returns `OK`). There is also a legacy `GET /unload`.

`GET /api/events` is worth a look before settling on polling — it is how llama-swap's own UI stays
current. I did not chase its event schema; if push beats polling for the residency panel, that is
the next thing to read.

---

## 5. The OpenAI-compatible path and the exact SSE chunk format

**Path: `POST /v1/chat/completions`** on the llama-swap listener (so
`http://127.0.0.1:8080/v1/chat/completions`). llama-swap reads the `model` field out of the request
body, loads or swaps to the matching config, and proxies. The README lists the supported OpenAI
endpoints as `v1/completions`, `v1/chat/completions`, `v1/responses`, `v1/embeddings`, `v1/models`,
plus audio and image routes; and separately lists Anthropic's `v1/messages`. Send `"model": "coder"`
or `"model": "router"` — the model ID is the key in the `models` map.

**Streaming is SSE, in the standard OpenAI chat-completion chunk format.** The best primary source
for the exact bytes is llama-swap's *own* stream parser, since it is the code consuming this same
endpoint through this same proxy —
[`ui/src/lib/chatApi.ts`](https://github.com/mostlygeek/llama-swap/blob/v251/ui/src/lib/chatApi.ts):

```ts
function parseChatCompletionsLine(line: string): StreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("data: ")) {
    return null;
  }
  const data = trimmed.slice(6);
  if (data === "[DONE]") {
    return { content: "", done: true };
  }
  try {
    const parsed = JSON.parse(data);
    const delta = parsed.choices?.[0]?.delta;
    const content = delta?.content || "";
    const reasoning_content = delta?.reasoning_content || delta?.reasoning || "";
    ...
```

and the framing loop splits the byte stream on `\n`, keeping the trailing partial line in a buffer
across reads.

So `LocalModelProvider` needs to handle:

- Lines prefixed `data: ` (with the space). Everything else on a line is ignorable.
- A literal `data: [DONE]` sentinel terminating the stream.
- Per-chunk JSON where the text lives at `choices[0].delta.content`.
- Reasoning text at `choices[0].delta.reasoning_content`, **or** `choices[0].delta.reasoning` —
  llama-swap's own parser accepts both spellings, so both occur in the wild.
- Chunks carrying neither field (llama-swap's parser returns `null` for those). Skip, do not error.
- **Blank lines and SSE comment lines starting with `:`.** llama.cpp's server has an
  `sse_ping_interval` request option and a matching `--sse-ping-interval` server setting, described
  in [`tools/server/README.md`](https://github.com/ggml-org/llama.cpp/blob/b10687/tools/server/README.md)
  as emitting SSE comment pings while the stream is otherwise silent, to keep a long
  prompt-processing phase observable. A parser that chokes on a line starting with `:` will fall
  over during a slow first prefill — exactly when you least want it to.
- Partial lines across chunk boundaries. Buffer, split on `\n`, keep the remainder.

Two llama-swap behaviours that will show up in the stream and surprise you otherwise:

- **`sendLoadingState`** (global config, default `false`): when enabled, llama-swap injects
  loading-status messages into the reasoning field so chat UIs can show that a model is still
  loading. Leave it off unless the residency panel wants it, or filter it — otherwise
  "loading…" text lands in the deliverable's reasoning.
- **Reverse-proxy buffering** breaks SSE. The README notes llama-swap sets `X-Accel-Buffering: no`
  on SSE responses as a safeguard, and still recommends explicitly disabling `proxy_buffering` if
  anything sits in front. Nothing sits in front here, but worth knowing if the harness ever proxies
  llama-swap.

llama.cpp's server README confirms SSE framing in general terms for its native `/completion`
endpoint — responses use the Server-sent events standard, and the browser `EventSource` interface
cannot be used because it does not support POST. Note that native `/completion` is *not*
OAI-compatible and has a different response shape (`content`/`tokens`/`stop`); use
`/v1/chat/completions` and the parser above.

---

## Open / unverified

Stated plainly so nobody builds on a guess:

1. **The exe name inside `llama-swap_251_windows_amd64.zip`.** `llama-swap.exe` per goreleaser's
   default-to-project-name behaviour, but `.goreleaser.yaml` doesn't say it and I didn't extract
   the archive. One `Expand-Archive` settles it.
2. **CUDA 13.3's minimum Windows driver version.** Not checked against NVIDIA's release notes.
   This is the only reason the recommendation is CUDA 12.4 rather than the 105 MB-smaller 13.3
   build.
3. **The cost of the first-run PTX JIT for SM 7.5.** Real but unquantified in any llama.cpp source
   I read. Discard the first cold-start measurement in ticket 07.
4. **`GET /api/events` schema.** Exists, is what llama-swap's UI consumes, not read.
5. **Nightly tag drift.** `b10687` was newest at 2026-08-29T18:23Z. Check
   <https://github.com/ggml-org/llama.cpp/releases> and substitute the tag into
   `llama-<tag>-bin-win-cuda-12.4-x64.zip`; the naming pattern held across b10682–b10687.
6. **VRAM sizing, model choice, swap timing.** Out of scope here — tickets 01 and 07.

## Sources

- llama-swap releases API: <https://api.github.com/repos/mostlygeek/llama-swap/releases/latest>
- llama-swap v251 tree: <https://github.com/mostlygeek/llama-swap/tree/v251>
  - `README.md`, `docs/configuration.md`, `config.example.yaml`, `.goreleaser.yaml`,
    `llama-swap.go`, `internal/server/server.go`, `internal/server/api.go`,
    `internal/process/process.go`, `internal/matrix/doc.go`, `ui/src/lib/chatApi.ts`
- llama.cpp releases API: <https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=6>
- llama.cpp `v0.3.0` release notes: <https://github.com/ggml-org/llama.cpp/releases/tag/v0.3.0>
- llama.cpp `b10687` release: <https://github.com/ggml-org/llama.cpp/releases/tag/b10687>
- llama.cpp b10687 tree: <https://github.com/ggml-org/llama.cpp/tree/b10687>
  - `.github/workflows/release.yml`, `ggml/src/ggml-cuda/CMakeLists.txt`, `common/arg.cpp`,
    `tools/server/README.md`
