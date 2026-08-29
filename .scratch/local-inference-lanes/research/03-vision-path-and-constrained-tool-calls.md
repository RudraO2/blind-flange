# The vision path and constrained tool calls on `llama-server`

Research for [issue 03](../issues/03-can-llama-server-serve-qwen3-vl-and-force-valid-tool-calls.md).
Researched 30 August 2026. Target: GTX 1650 Ti, 3784 MiB free VRAM, Windows, prebuilt CUDA
`llama-server`.

Sources are llama.cpp `master` (docs + source) and the official Qwen model cards, read directly.
Where `master` and the last prebuilt release could differ, that is called out. Anything not
confirmed is marked **unconfirmed** rather than guessed.

## Answers in one screen

| # | Question | Answer |
|---|---|---|
| 1 | Vision GGUF source | `Qwen/Qwen3-VL-2B-Instruct-GGUF`, official. `Qwen3VL-2B-Instruct-Q4_K_M.gguf` (1,107,409,952 B) + `mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf` (445,053,216 B) = **1.45 GiB on disk**. No community re-quant needed. |
| 2 | Flags | `-m <llm> --mmproj <mmproj>`. Image goes in as an OAI `image_url` content part whose `url` is a `data:image/…;base64,…` URL. |
| 3 | Min version | Support merged 30 Oct 2025 (PR #16780). Qwen's own card points at release **`b6907`**. Latest build is `b10687` (29 Aug 2026); take a current one, two Qwen3-VL correctness fixes landed after b6907. |
| 4 | Text-only, no vision cost | **Yes for compute** — no image means no media chunk means no encoder pass. **No for VRAM** — the mmproj is loaded and GPU-offloaded at startup regardless; `--no-mmproj-offload` or `--mmproj-device none` moves it off the card. |
| 5 | Constraint mechanisms | Three, all current: GBNF `grammar`, `json_schema` / `response_format`, and `tools` + `--jinja` (jinja is now **on by default**). None deprecated. `grammar` and `tools` are mutually exclusive — the server rejects the pair. |
| 6 | One-of-several tool schemas | Yes, natively. The tool grammar is a `choice` over every tool, each with its own JSON-schema rule. Use `"tool_choice": "required"` to force a call and `"parallel_tool_calls": false` to cap it at exactly one. |
| 7 | Streaming | Yes. Constrained output streams; tool calls arrive as `chat.completion.chunk` deltas keyed by index, `finish_reason: "tool_calls"`. Arguments arrive as raw JSON fragments to concatenate. |
| 8 | Coder GGUF | `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF` → `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf`, 1,117,320,768 B (1.04 GiB). |

---

## Part A — the vision path for Qwen3-VL-2B-Instruct

### A1. Weights and the companion vision encoder

Qwen publishes the GGUFs itself, split into language model and vision encoder, which is exactly the
shape `llama-server` wants. From the repo file listing
([HF API](https://huggingface.co/api/models/Qwen/Qwen3-VL-2B-Instruct-GGUF?blobs=true),
[repo](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF)):

| File | Bytes | ≈ |
|---|---|---|
| `Qwen3VL-2B-Instruct-Q4_K_M.gguf` | 1,107,409,952 | 1.03 GiB |
| `Qwen3VL-2B-Instruct-Q8_0.gguf` | 1,834,427,424 | 1.71 GiB |
| `Qwen3VL-2B-Instruct-F16.gguf` | 3,447,350,304 | 3.21 GiB |
| `mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf` | 445,053,216 | 424 MiB |
| `mmproj-Qwen3VL-2B-Instruct-F16.gguf` | 819,394,848 | 781 MiB |

**Take `Q4_K_M` + `mmproj-…-Q8_0`: 1,552,463,168 bytes, 1.45 GiB on disk.** That is the only
combination that leaves room for a KV cache and a second tenant inside 3784 MiB. The card states the
two components are independently quantised and mixable: "You can mix precision levels for the
language and vision components based on your hardware" — and the card's own CLI example pairs a Q8_0
LLM with an F16 mmproj, so mixing is the documented path, not a hack
([model card](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF)). Licence is Apache-2.0 per the
card metadata, which matters for `npm run licence-audit`.

There is no need to look at community re-quants. The official repo already publishes the quant we
want, and the mmproj at two precisions. Content of the card was rephrased for compliance with
licensing restrictions.

Note the metadata reports `context_length: 262144` for this GGUF. Do **not** let `-c` default off
the model — see the `--fit` warning in A2.

### A2. Flags, and the shape of an image request

The multimodal doc gives two ways to enable the vision path; the local-files way is ours
([docs/multimodal.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md)):

> Use `-m model.gguf` option with `--mmproj file.gguf` to specify text and multimodal projector
> respectively

and, in the same file, "By default, multimodal projector will be offloaded to GPU. To disable this,
add `--no-mmproj-offload`".

The relevant flags, from the auto-generated help table in
[tools/server/README.md](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md):

| Flag | What it does |
|---|---|
| `-mm, --mmproj FILE` | path to the multimodal projector file |
| `--mmproj-offload` / `--no-mmproj-offload` | GPU offload for the projector (default: enabled) |
| `-mmdev, --mmproj-device DEVICE` | device for the projector; `none` = don't offload |
| `--image-min-tokens N` / `--image-max-tokens N` | clamp tokens per image for dynamic-resolution vision models (default: read from model) |
| `--mtmd-batch-max-tokens N` | max image tokens per encode batch (default: 1024) |
| `--media-path PATH` | directory for `file://` media, off by default |

A starting line for the document lane:

```powershell
llama-server.exe `
  -m D:\models\Qwen3VL-2B-Instruct-Q4_K_M.gguf `
  --mmproj D:\models\mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf `
  --jinja -c 8192 -ngl all --image-max-tokens 1024 `
  --host 127.0.0.1 --port 8081 --alias bf-document
```

**Two traps in that line, both from the same README help table:**

- `-ngl` now defaults to `auto`, and `-fit` (fit unset arguments into device memory) defaults to
  **on** with `-fitt` (per-device target margin) defaulting to **1024 MiB**. On a card with 3784 MiB
  free, a 1024 MiB reserved margin is a quarter of the budget, and the server is entitled to shrink
  context or offload fewer layers to respect it. Pass `-c` and `-ngl` explicitly, and consider
  `-fitt 256` or `-fit off`, or the observed layer split will not be the one you designed.
- `-c 0` (the default) means "loaded from model", and this model advertises 262144 context. Always
  set `-c`.

**Verifying the vision path is live** — `GET /props` returns a `modalities` object
(`"modalities": { "vision": false }` in the README's example) and a `media_marker` string. If
`modalities.vision` is not `true`, the mmproj did not load, and image requests will fail with the
server's own hint (the code raises `"… is not supported - hint: if this is unexpected, you may need
to provide the mmproj"`,
[tools/server/server-common.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-common.cpp)).
The README also says clients "should check `/models` or `/v1/models` for the `multimodal` capability
before a multimodal request".

**Submitting the image.** It is a typed content part on the OAI chat endpoint. From the README's
multimodal input section:

> If `type == "image_url"`: `image_url.url` can be a remote URL, base64 (raw or URI-encoded via
> `data:image/...;base64`) or path to local file

`server-common.cpp` confirms the validation: the data URL must start with `data:image/` and the media
type must end with `base64`, otherwise you get `Invalid uri format` / `uri must be base64 encoded`;
a bare string is retried as raw base64. Local paths need `file://` **and** `--media-path`.

Concrete request — a drawing-lane call:

```http
POST http://127.0.0.1:8081/v1/chat/completions
Content-Type: application/json

{
  "model": "bf-document",
  "stream": true,
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "List every tag number visible on this P&ID." },
        { "type": "image_url",
          "image_url": { "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg..." } }
      ]
    }
  ]
}
```

The base64 payload is the whole image inline, so it crosses the wire in the request body — budget for
that on a large page scan. Sampling settings the card recommends for the VL path: `temperature 0.7`,
`top_p 0.8`, `top_k 20`, `presence_penalty 1.5`; for the pure-text path it recommends different
values (`temperature 1.0`, `top_p 1.0`, `top_k 40`, `presence_penalty 2.0`)
([model card](https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF)). Worth honouring per lane,
since our common case is the text one.

### A3. Minimum llama.cpp version

- Qwen3-VL support merged into `master` on **2025-10-30 15:19 UTC**, PR
  [#16780 "[model] add support for qwen3vl series"](https://github.com/ggml-org/llama.cpp/pull/16780)
  (covers dense and MoE, adds MRoPE-Interleave and DeepStack).
- The Qwen card tells you to use "the latest version" and links release
  [`b6907`](https://github.com/ggml-org/llama.cpp/releases/tag/b6907), published **2025-10-31
  23:02 UTC** — after the merge. So `b6907` is a *confirmed-good* floor.
- **Unconfirmed:** the exact first build tag containing the merge (it is somewhere between the merge
  commit and `b6907`). Don't try to shave it; use `b6907` or later as the stated floor.
- Two correctness fixes landed later and argue for a current build, not the floor:
  [#17594 `clip: fix nb calculation for qwen3-vl`](https://github.com/ggml-org/llama.cpp/pull/17594)
  (merged 2025-11-30) and
  [#25781 `mtmd: use align_corners for Qwen3-VL vision position-embedding interpolation`](https://github.com/ggml-org/llama.cpp/pull/25781)
  (merged 2026-07-21). The second one describes a spatial error that grows with image size and skews
  bounding boxes on non-square images — directly relevant if the drawing lane ever asks *where* on
  the page something is.
- **Current builds:** the newest release at time of writing is **`b10687`**, published 2026-08-29,
  with Windows CUDA assets `llama-b10687-bin-win-cuda-12.4-x64.zip` (plus the separate
  `cudart-llama-bin-win-cuda-12.4-x64.zip` runtime) and 13.3 / 13.4 variants
  ([releases API](https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=6)). Semver tags
  (`v0.3.0`, 2026-08-25) exist alongside the `b####` build tags; both are published, the `b####`
  stream is the per-commit one.

### A4. Text-only with no vision cost — the critical one

**Compute: confirmed, no vision cost.** The chain is three links, each in a primary source:

1. `oaicompat_chat_params_parse` only rewrites a content part into a media marker when its `type` is
   `image_url`, `input_audio` or `input_video` (`p["type"] = "media_marker"`). A plain string
   message, or a `{"type":"text"}` part, produces no marker
   ([server-common.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-common.cpp)).
2. `mtmd_tokenize` splits the prompt on markers: "the prompt must have the input image marker
   (default `<__media__>`) in it … number of bitmaps must be equal to the number of markers in the
   prompt". No marker, no bitmap, no image chunk — only `MTMD_INPUT_CHUNK_TYPE_TEXT`
   ([tools/mtmd/mtmd.h](https://github.com/ggml-org/llama.cpp/blob/master/tools/mtmd/mtmd.h)).
3. The encoder entry point is explicit about what it skips: `mtmd_encode_chunk` — "text chunk will be
   ignored silently, only media chunk will be encoded" (same header).

So an OCR-text request through a vision-enabled server is a normal text prefill. Nothing runs the ViT.
The ten-second budget is not exposed to vision prefill on the common path.

**VRAM: the cost is residency, not per-request.** The projector is loaded at startup and offloaded to
GPU by default (docs/multimodal.md, above), so the 424 MiB Q8_0 mmproj sits on the card for the whole
process lifetime even if no request ever carries an image. `mtmd_context_params` also has
`bool warmup; // whether to run a warmup encode pass after initialization`, i.e. one encode at
startup, not per request (mtmd.h). Three levers if that 424 MiB is needed elsewhere:

- `--no-mmproj-offload` — keep the projector on CPU, pay CPU time only when an image actually arrives.
- `--mmproj-device none` — same intent, explicit device selection.
- `--no-mmproj` — drop vision entirely for a text-only server instance.

**Unmeasured:** actual resident VRAM (weights + KV + compute buffers) for this pair on this card, and
the wall-clock cost of one image encode at `--image-max-tokens 1024`. Both belong to tickets 06/07;
`mtmd.h` exposes `mtmd_get_memory_usage()` for the projector specifically, and it is flagged as an
unstable internal API used by `fit_params`, so read it via `--fit` behaviour and `nvidia-smi`, not by
calling it.

---

## Part B — forcing valid tool calls out of Qwen2.5-Coder-1.5B

### B5. What the server offers, and what is current

Three mechanisms, all live on current `master`, none marked deprecated
([tools/server/README.md](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)):

| Mechanism | Where | Notes |
|---|---|---|
| **GBNF grammar** | request field `grammar`; CLI `--grammar` / `--grammar-file` | lowest level, full control |
| **JSON schema** | request field `json_schema`; `response_format: {"type":"json_object","schema":…}` or `{"type":"json_schema",…}`; CLI `-j/--json-schema`, `-jf` | compiled to a grammar internally |
| **Native tool calling** | request `tools` + `tool_choice`, needs jinja | the intended path; per-tool schemas plus the model's own call syntax |

Flag names and current defaults that matter:

- `--jinja, --no-jinja` — "whether to use jinja template engine for chat (**default: enabled**)".
  Tool calling no longer needs an opt-in flag on current builds. Passing `--jinja` explicitly is
  harmless and keeps the command portable to older binaries, where it was mandatory:
  `oaicompat_chat_params_parse` throws `"tools param requires --jinja flag"` and
  `"tool_choice param requires --jinja flag"` when jinja is off.
- `--chat-template-file` / `--chat-template chatml` — the override escape hatch when a model's own
  template is not tool-aware ([docs/function-calling.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md)).
- `--reasoning-format`, `-rea/--reasoning`: leave alone for a non-thinking coder model.

**Hard mutual exclusions, straight from the request parser
([server-common.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-common.cpp)):**

- `"Cannot use both json_schema and grammar"`.
- `"Cannot use custom grammar constraints with tools."` — you cannot hand-write a GBNF *and* pass
  `tools`. If you want tools, you get the server's generated grammar, not yours. Plan the harness
  adapter around that: **either** `tools` (recommended) **or** a hand-rolled `grammar` over your own
  envelope, never both.

One documentation wrinkle worth knowing before you spend an hour on it: the README shows
`response_format: {"type": "json_schema", "schema": {…}}`, but the parser reads the schema for that
type from a **nested** `json_schema` object (`response_format.json_schema.schema`), matching
OpenAI's shape. `{"type": "json_object", "schema": {…}}` reads `schema` at the top level. If you use
`response_format` at all, prefer `{"type":"json_object","schema":{…}}` or the plain `json_schema`
request field, both of which are unambiguous in the code.

Note also that `docs/function-calling.md` is behind the code: it still describes named per-model
handlers ("Hermes 2/3, Qwen 2.5", "Qwen 2.5 Coder") and a `Chat format: Generic` log line, while
`common/chat.cpp` no longer contains the string `hermes` at all. The formats are now PEG-based
(`COMMON_CHAT_FORMAT_PEG_SIMPLE`, `PEG_NATIVE`, `PEG_GEMMA4`, `PEG_MINIMAX_M3`,
[common/chat.h](https://github.com/ggml-org/llama.cpp/blob/master/common/chat.h)) and, for templates
without a specialised handler, derived automatically from the template itself by
`common/chat-auto-parser-generator.cpp`. There is an open PR to refresh the doc
([#27778](https://github.com/ggml-org/llama.cpp/pull/27778), unmerged). Trust the source over the doc
here.

### B6. Constraining to one of three tool schemas

**Yes, and it is the built-in behaviour, not something to engineer.** In the auto-derived tool parser,
the grammar is a `choice` accumulated over every tool, each branch carrying that tool's own JSON
schema
([common/chat-auto-parser-generator.cpp](https://github.com/ggml-org/llama.cpp/blob/master/common/chat-auto-parser-generator.cpp),
`build_tool_parser_tag_json`):

```cpp
common_peg_parser tool_choice = p.choice();
foreach_function(inputs.tools, [&](const json & tool) {
    ...
    auto args_parser = p.tool_args(p.schema(p.json(), "tool-" + name + "-schema", schema));
    ...
    tool_choice |= p.rule("tool-" + name, func_parser);
});
auto require_calls = inputs.tool_choice == COMMON_CHAT_TOOL_CHOICE_REQUIRED;
```

The same pattern appears in every hand-written handler in `common/chat.cpp` (Mistral, Qwen3-Coder,
gpt-oss, Gemma 4, Functionary v3.2 …): one `p.choice()` over all tools, `min_calls = 1` when
`tool_choice == REQUIRED`, `max_calls = parallel_tool_calls ? -1 : 1`. So `pwsh`,
`bf_report_findings` and `bf_approval_note` can all be on the table at once, and the sampler is
constrained to exactly one of the three shapes — right down to each tool's argument schema.

The knobs, for our three-tool agent:

- `"tool_choice": "required"` → a call is mandatory. It also makes the grammar **non-lazy**:
  `data.grammar_lazy = !has_response_format && inputs.tool_choice == COMMON_CHAT_TOOL_CHOICE_AUTO;`
  With `"auto"` the grammar is lazy — it only engages once a trigger marker (for a Qwen-style
  template, `<tool_call>`) has been emitted, which means a 1.5B model is free to ramble first.
  **For a model this small, `required` is the setting that turns "will fumble" into "cannot fumble".**
- `"parallel_tool_calls": false` → exactly one call. The default is *not* false: the server takes it
  from the template's capabilities (`json_value(body, "parallel_tool_calls", caps["supports_parallel_tool_calls"])`),
  and the Qwen2.5-Coder template does render multiple `<tool_call>` blocks, so leaving it unset may
  well allow several. Set it explicitly.
- `"tool_choice": "none"` disables the tool grammar entirely; `"auto"` is the default when the field
  is absent (`json_value(body, "tool_choice", std::string("auto"))`).

The format detection for Qwen2.5-Coder-1.5B is the one thing I could not confirm without running the
binary. Its template emits `<tool_call>\n{"name": …, "arguments": …}\n</tool_call>`
([template in the GGUF metadata](https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF?blobs=true)),
which is precisely the `TAG_WITH_JSON` shape `build_tool_parser_tag_json` handles, with
`per_call_start = "<tool_call>"`. **Verify at runtime rather than assuming:** the resolved format is
reported as `chat_format` in the slot params (`GET /slots`) and in the verbose completion dump
(`{"chat_format", common_chat_format_name(...)}`,
[tools/server/server-task.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-task.cpp)).
If it comes back as content-only, the template was not recognised as tool-aware and the fix is
`--chat-template-file` with a known-good template, or `--chat-template chatml`. There is also a loud
log line for the failure mode — "Template seems to support tool calls, but failed to determine tool
format. Tool calling will not work properly" — so watch the server's first lines.

One more caution from the function-calling doc that applies to a 4 GB card: "Beware of extreme KV
quantizations (e.g. `-ctk q4_0`), they can substantially degrade the model's tool calling
performance." If VRAM pressure tempts you toward `-ctk`/`-ctv` quantisation, that is the tradeoff you
are making.

### B7. Does constrained output still stream?

**Yes.** Constraints act on the sampler, and the chat layer is built for incremental parsing:

- `task_result_state::update_chat_msg()` re-parses the accumulated text with `is_partial`, then emits
  `common_chat_msg_diff::compute_diffs(msg_prv, chat_msg)`
  ([server-task.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-task.cpp)).
- `to_json_oaicompat_chat_stream()` turns each diff into a `chat.completion.chunk` with a `delta`, and
  closes with `finish_reason` = `"tool_calls"` when the message has tool calls, `"stop"` otherwise
  (same file). Note `finish_reason` is `tool_calls` on the OAI-compatible stream; the older
  non-streaming example in `docs/function-calling.md` shows `"finish_reason": "tool"`, so key your
  adapter off the presence of `tool_calls` rather than off the string.
- The diff machinery is explicitly designed to emit a tool-call **header** delta (`id` + `name`) once,
  then argument fragments, tracked per `tool_call_index` — see the `sent_tool_call_names` bookkeeping
  in `update_chat_msg`.

For `llama-adapter.js`, that means: tool-call deltas are keyed by index, may interleave with content
deltas, and `function.arguments` arrives as **raw JSON fragments that must be concatenated** before
parsing. Do not `JSON.parse` a fragment. (The same description, with a reference Python accumulation
loop, is what the pending docs PR [#27778](https://github.com/ggml-org/llama.cpp/pull/27778) adds;
unmerged, but it matches the code above.)

**Unconfirmed:** nothing found that disables streaming when a grammar is active, and nothing in the
request parser rejects `stream` + `tools` (the parser reads both in the same function without
conflict). But I have not run it. First smoke test should be a streamed `tool_choice: required`
request, because that is the exact combination the harness depends on.

### B8. The coder GGUF

Official repo, from the file listing
([HF API](https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF?blobs=true),
[repo](https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF)):

| File | Bytes | ≈ |
|---|---|---|
| `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` | 1,117,320,768 | **1.04 GiB** |
| `qwen2.5-coder-1.5b-instruct-q5_k_m.gguf` | 1,285,494,336 | 1.20 GiB |
| `qwen2.5-coder-1.5b-instruct-q8_0.gguf` | 1,894,532,160 | 1.76 GiB |
| `qwen2.5-coder-1.5b-instruct-q3_k_m.gguf` | 924,456,000 | 882 MiB |

Apache-2.0 (with a `LICENSE` file in the repo), `qwen2` architecture, 32768 training context, and the
tool-aware ChatML template quoted in B6. sha256 for the Q4_K_M is
`cc324af070c2ecbfd324a30884d2f951a7ff756aba85cb811a6ec436933bb046` if you want to verify the download.

Aside, possibly useful for ticket 06: `llama-server` ships a shortcut for exactly this model —
`--fim-qwen-1.5b-default`, "use default Qwen 2.5 Coder 1.5B (note: can download weights from the
internet)" (README help table). That is the FIM/infill preset, not the chat path, so it is a
convenience for fetching weights rather than the configuration we want.

---

## Both lanes, side by side

Disk, and therefore the swap cost llama-swap pays:

| | LLM | mmproj | Total |
|---|---|---|---|
| Document / drawing lane | 1.03 GiB | 424 MiB | **1.45 GiB** |
| Coding lane | 1.04 GiB | — | **1.04 GiB** |
| Both resident | | | **2.49 GiB** of 3.70 GiB free |

That is disk size, not resident VRAM — KV cache, compute buffers and the CUDA context are on top, and
`--fit`'s default 1024 MiB margin will be fighting for the same space. Whether both fit at once is
ticket 07's measurement, and 2.49 GiB of weights against 3784 MiB free says it will be tight rather
than comfortable.

## Loose ends worth a line in the spec

- **`--fit` on a 4 GB card.** Default-on, 1024 MiB margin, and it silently rewrites unset arguments.
  Every launch line in the spec should set `-c` and `-ngl` explicitly so the configuration is the one
  written down.
- **`--image-max-tokens`** is the only direct lever on vision prefill cost. If the drawing lane ever
  needs a budget, that is the dial, and its default is read from the model rather than being a fixed
  number.
- **`chat_format` at runtime** is the cheap check that tool constraining actually engaged for the
  1.5B. Read it once from `/slots` during bring-up and record the value; don't infer it.
- **The docs lag the code** on function calling. When something disagrees, `common/chat.cpp`,
  `common/chat-auto-parser-generator.cpp` and `tools/server/server-common.cpp` are the truth.

## Sources

- Qwen3-VL-2B-Instruct GGUF card and file listing — https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF · https://huggingface.co/api/models/Qwen/Qwen3-VL-2B-Instruct-GGUF?blobs=true
- Qwen2.5-Coder-1.5B-Instruct GGUF listing — https://huggingface.co/api/models/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF?blobs=true
- llama.cpp multimodal doc — https://github.com/ggml-org/llama.cpp/blob/master/docs/multimodal.md
- llama.cpp server README (flags, endpoints, multimodal input shapes, `/props`) — https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md
- llama.cpp function-calling doc (partly stale) — https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md
- `tools/mtmd/mtmd.h` (chunk types, `mtmd_tokenize`, `mtmd_encode_chunk`, context params) — https://github.com/ggml-org/llama.cpp/blob/master/tools/mtmd/mtmd.h
- `common/chat.h` (formats, `tool_choice` enum, `grammar_lazy`, msg diffs) — https://github.com/ggml-org/llama.cpp/blob/master/common/chat.h
- `common/chat.cpp` (per-model tool grammars) — https://github.com/ggml-org/llama.cpp/blob/master/common/chat.cpp
- `common/chat-auto-parser-generator.cpp` (template-derived tool grammar, `p.choice()` over tools) — https://github.com/ggml-org/llama.cpp/blob/master/common/chat-auto-parser-generator.cpp
- `tools/server/server-common.cpp` (request parsing, media handling, exclusions) — https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-common.cpp
- `tools/server/server-task.cpp` (streaming deltas, `chat_format` reporting) — https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-task.cpp
- PR #16780, Qwen3-VL support — https://github.com/ggml-org/llama.cpp/pull/16780
- PR #17594, clip fix for qwen3-vl — https://github.com/ggml-org/llama.cpp/pull/17594
- PR #25781, align_corners fix for Qwen3-VL — https://github.com/ggml-org/llama.cpp/pull/25781
- PR #27778, pending function-calling doc revision (unmerged) — https://github.com/ggml-org/llama.cpp/pull/27778
- Release `b6907` — https://github.com/ggml-org/llama.cpp/releases/tag/b6907 · recent releases — https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=6
