# Can llama-server serve Qwen3-VL-2B, and force valid tool calls out of a 1.5B?

Type: research
Status: resolved
Blocked by: —

## Answer

Full findings with sources:
[research/03-vision-path-and-constrained-tool-calls.md](../research/03-vision-path-and-constrained-tool-calls.md).

**Vision.** Both files from Qwen's own `Qwen/Qwen3-VL-2B-Instruct-GGUF`:
`Qwen3VL-2B-Instruct-Q4_K_M.gguf` (1.03 GiB) plus `mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf`
(424 MiB). Mixing quant levels across the two components is the model card's documented path.
Flags are `-m … --mmproj …`; an image goes in as an OpenAI `image_url` content part carrying a
`data:image/…;base64,…` URL. Floor version is `b6907` (support merged 2025-10-30), but later
correctness fixes mean taking a current build.

**Text-only costs nothing.** No `image_url` part means no media marker, no marker means no image
chunk, and `mtmd_encode_chunk` ignores text chunks silently. The document lane pays zero vision
compute. It *does* pay residency: the projector loads and GPU-offloads at startup regardless, so
424 MiB sits on the card all session unless `--no-mmproj-offload` or `--mmproj-device none`.

**Tool calls — the research answer was wrong on this hardware, and measurement overturned it.**

Three constraint mechanisms exist and all are current: GBNF `grammar`, `json_schema`, and native
`tools` with jinja (`--jinja` is default-enabled). `grammar` and `tools` cannot be combined. The
research recommended native `tools` with `"tool_choice": "required"` and
`"parallel_tool_calls": false`.

**Tested against the real model, that does not work.** `probe-tool-calling.ps1` and
`probe-json-schema.ps1` in this effort's directory:

| attempt | result |
|---|---|
| `tools` + `tool_choice: "required"` | 6.98s, `tool_calls` empty. Call emitted as a fenced JSON block in `content`. |
| `tools` + `tool_choice` as an explicit function object | 1.05s, same failure. |
| `response_format: json_schema`, no tools | **0.91s, clean JSON, parsed first time.** |

The diagnosis is precise, and it is the trap this ticket already flagged: the model *does* receive
the tools — it named `pwsh` and used the right argument keys — and `/props` confirms its chat
template declares a tools section. But it wrapped the call in ```` ```json ```` instead of the
`<tool_call>` tags the template specifies, and llama-server's template-derived auto-parser
therefore found nothing to parse. `tool_choice` did not force a grammar in either form.

**Decision: drive the lanes with `response_format: json_schema` and construct the tool call in
our own code.** Faster, deterministic, and independent of whether llama.cpp recognises a template
as tool-capable. End-to-end proof on the coder — the model produced

```
Write-Output (1..100 | Measure-Object -Sum).Sum; if ($?) { Write-Output 'PASS' } else { Write-Output 'FAIL' }
```

which the sandbox ran, printing `5050` then `PASS`. That is Story 5.3's claim, live, in under a
second.

**One honesty note.** That assertion checks the previous command *succeeded*, not that the sum was
5050. It printed PASS truthfully but does not verify the answer. Fix in the lane's prompt by
demanding a comparison against an expected value — not in code.

**Consequence for the adapter:** tool-call arguments no longer arrive as streamed fragments, so
`llm-adapter.js`'s existing "a replayed call is never fragmentary" assumption still holds and the
tool-call block assembly needs no rework. Only text streams.

Coder weights: `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf`, 1.04 GiB.

**Three traps flagged rather than asserted:**

1. **`--fit` defaults on** with a 1024 MiB per-device margin and will silently rewrite unset
   `-c`/`-ngl` on a 3784 MiB card. Set both explicitly in the llama-swap config.
2. **`grammar` and `tools` cannot be combined** — the server rejects it outright. Pick native
   tool calling.
3. `docs/function-calling.md` lags the code: the named Hermes/Qwen handlers are gone in favour of
   a template-derived auto-parser. Confirm the resolved `chat_format` from `/slots` during
   bring-up rather than assuming the 1.5B's template was recognised.

## Question

Two capabilities the whole plan rests on, both unverified.

**The vision path.** Does current `llama-server` serve `Qwen3-VL-2B-Instruct` with image input,
and how?

- Which GGUF repository to take the weights from, and the companion vision-encoder file
  (`mmproj`) — exact filenames and sizes at a sensible quantisation.
- The flags that enable the vision path, and how an image is submitted through the
  OpenAI-compatible endpoint (base64 data URL in the message content, or something else).
- Any minimum llama.cpp version for Qwen3-VL specifically.
- Whether the model can be used **text-only**, with no image and no vision-encoder cost. The
  document lane feeds it OCR text, so this is the common case, and paying vision prefill on
  every document request would break the speed budget.

**Forcing valid tool calls.** `Qwen2.5-Coder-1.5B-Instruct` will fumble free-form tool calling.

- What `llama-server` offers to constrain output to a schema — GBNF grammar, JSON-schema
  response format, a native tool-calling mode, or several — and which is current rather than
  deprecated.
- Whether it can constrain to *one of several* tool schemas, since the agent has `pwsh`,
  `bf_report_findings` and `bf_approval_note` available at once.
- Whether constrained output still streams, because `llama-adapter.js` translates a stream.

Also: the GGUF source and file size for `Qwen2.5-Coder-1.5B-Instruct` at Q4_K_M.

Prefer llama.cpp's own docs, discussions and the model cards. Record findings with URLs.
