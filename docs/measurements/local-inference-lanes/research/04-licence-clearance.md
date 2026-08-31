# Licence clearance for the local-inference components

Researched: 30 August 2026
Answers: `.scratch/local-inference-lanes/issues/04-will-the-licence-audit-still-pass.md`
Gate read first: `docs/licence-policy.md`, `docs/licence-decisions.json`,
`scripts/licence-audit.mjs`, `plugins/dsh-client-ui-base/lib/registry/fleet.js`

Every licence below was read from the artefact or repository that owns it. Where the
statement is metadata rather than a licence file, that is said so explicitly, because
`registry/models.yaml` records `licence_source` per fleet member and the distinction is
already a recorded decision in this project.

---

## Verdict table

| # | Component | Licence | Inside the eleven? | Status |
|---|---|---|---|---|
| 1 | llama-swap `v251` | MIT | yes | **clear** |
| 2a | llama.cpp / `llama-server` (source) | MIT | yes | **clear** |
| 2b | `libomp.dll` inside every Windows llama.cpp zip | Apache-2.0 WITH LLVM-exception | yes (base licence) | **clear, needs a `bundled` entry** |
| 2c | `cudart64_12.dll`, `cublas64_12.dll`, `cublasLt64_12.dll` | NVIDIA CUDA Toolkit EULA | **no** | **BLOCKER — raise, do not widen** |
| 3 | `Qwen/Qwen3-VL-2B-Instruct` | Apache-2.0, **frontmatter only** | yes | **clear** |
| 4a | `Qwen/Qwen3-VL-2B-Instruct-GGUF` | Apache-2.0, **frontmatter only** | yes | **clear — recommended** |
| 4b | `unsloth/Qwen3-VL-2B-Instruct-GGUF` | Apache-2.0, frontmatter only | yes | clear, but third-party |
| 4c | `ggml-org/Qwen3-VL-2B-Instruct-GGUF` | **none declared** | n/a | **BLOCKER — licence cannot be established** |
| 4d | `bartowski/Qwen_Qwen3-VL-2B-Instruct-GGUF` | **none declared** | n/a | **BLOCKER — licence cannot be established** |
| 4e | `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF` | Apache-2.0, **`LICENSE` file** | yes | **clear — recommended** |
| 5 | `Qwen/Qwen2.5-Coder-1.5B-Instruct` | Apache-2.0, `LICENSE` file | yes | **clear** |
| 6 | `Qwen/Qwen2.5-Coder-3B-Instruct` | Qwen RESEARCH LICENSE AGREEMENT | **no, by design** | **refusal case, evidenced** |
| — | llama-swap's ~80 statically linked Go modules | see §7 | direct requires all inside | **structural gap — needs a decision** |

Two blockers and one structural gap. Neither blocker needs the allow-list widened: both have
a licence-clear substitute available on this hardware.

---

## 1. llama-swap — MIT, verified

The licence file is `LICENSE.md`, not `LICENSE` — which is why a naive fetch of
`raw.githubusercontent.com/.../main/LICENSE` returns 404 and could be mistaken for "no
licence file".

- Blob read via the contents API at tag `v251`:
  [`LICENSE.md?ref=v251`](https://api.github.com/repos/mostlygeek/llama-swap/contents/LICENSE.md?ref=v251)
  → blob sha `6dbacecf76aeb0b0006d4841932983c9944ecab8`, 1075 bytes, decoding to
  `MIT License` / `Copyright (c) 2024 Benson Wong` followed by the MIT text verbatim.
- The blob sha is **identical at `main` and at tag `v251`**, so the pin and the head agree:
  [`/license`](https://api.github.com/repos/mostlygeek/llama-swap/license) returns the same
  sha and `spdx_id: "MIT"`.
- Human-readable: <https://github.com/mostlygeek/llama-swap/blob/main/LICENSE.md>

**Version to pin.** Latest release is `v251`, published 23 August 2026
([release](https://github.com/mostlygeek/llama-swap/releases/tag/v251)). Windows artefact
`llama-swap_251_windows_amd64.zip`, 13,373,344 bytes,
`sha256:f91ebc3bbf3e6b2d96a5c0e8c6967755a336734b3b8b7447b1a36cde670aee5f`.

MIT is on the allow-list. No decision entry needed for llama-swap's own code.

---

## 2. llama.cpp / `llama-server`

### 2a. The source — MIT, verified

Read directly: [`LICENSE` at `master`](https://raw.githubusercontent.com/ggml-org/llama.cpp/master/LICENSE)
→ `MIT License` / `Copyright (c) 2023-2026 The ggml authors`, 1078 bytes, MIT text verbatim.
Human-readable: <https://github.com/ggml-org/llama.cpp/blob/master/LICENSE>

On the allow-list. Nothing to decide.

### 2b. What the prebuilt Windows CUDA zip actually contains

This was **measured, not assumed**. I read the ZIP central directory of the release
artefacts over HTTP range requests rather than downloading 250 MB, and cross-checked the
End-of-Central-Directory entry count.

Release used: `b10687`, published 29 August 2026 —
<https://github.com/ggml-org/llama.cpp/releases/tag/b10687>

`llama-b10687-bin-win-cuda-12.4-x64.zip` (250,537,973 bytes) — **EOCD total entries = 52,
52 parsed.** The complete list, no NVIDIA file among them:

```
ggml-cuda.dll (538,598,912 uncompressed)   llama-server.exe        llama-server-impl.dll
ggml.dll  ggml-base.dll  ggml-rpc.dll      llama.dll  llama.exe    llama-common.dll
ggml-cpu-{x64,sse42,sandybridge,ivybridge,haswell,skylakex,icelake,cascadelake,
          cooperlake,sapphirerapids,alderlake,cannonlake,zen4,piledriver}.dll
mtmd.dll                                   llama-mtmd-cli.exe      llama-mtmd-debug.exe
llama-{cli,bench,quantize,completion,perplexity,batched-bench,fit-params}.exe (+ -impl.dll)
llama-{llava,gemma3,qwen2vl,minicpmv}-cli.exe  llama-{tokenize,imatrix,results,tts,gguf-split}.exe
ggml-rpc-server.exe
libomp.dll (768,000)                       LICENSE-LLVM-OpenMP (19,741)
```

**No `cudart64_*.dll`, no `cublas64_*.dll`, no `cublasLt64_*.dll`, no `nv*.dll`.** The main
CUDA archive bundles zero NVIDIA redistributables. The 538 MB `ggml-cuda.dll` is llama.cpp's
own code compiled by `nvcc`, which is a permitted output of the toolkit, not a redistributed
NVIDIA library.

`libomp.dll` **is** a bundled third-party component, and it is in every Windows build
(CPU, CUDA and Vulkan alike). I decompressed `LICENSE-LLVM-OpenMP` out of the archive and
read it: 19,741 bytes opening

> The LLVM Project is under the Apache License v2.0 with LLVM Exceptions

followed by the Apache-2.0 text and the LLVM exception clause. SPDX:
`Apache-2.0 WITH LLVM-exception`. `scripts/licence-audit.mjs`'s `evaluateExpression` takes
`ID WITH exception` and judges the base licence — "an exception can only widen permission" —
so this evaluates to `Apache-2.0` and passes without widening anything.

### 2c. The CUDA redistributables — a real blocker

`cudart-llama-bin-win-cuda-12.4-x64.zip` (391,443,627 bytes) — **EOCD total entries = 3**:

| file | uncompressed |
|---|---|
| `cublas64_12.dll` | 100,033,536 |
| `cublasLt64_12.dll` | 473,551,360 |
| `cudart64_12.dll` | 553,984 |

Three NVIDIA DLLs and **nothing else — no licence text, no NOTICE file**. To run the CUDA
build these must sit beside `llama-server.exe` or on `PATH`; llama.cpp's own issue tracker
confirms the split is deliberate and that the cudart zip is what supplies them
([issue #15204](https://github.com/ggml-org/llama.cpp/issues/15204),
[llama.vscode wiki, Windows](https://github.com/ggml-org/llama.vscode/wiki/Windows/3cc5c44cf6138b968c514d2cf30b75035903c252)).
The NVIDIA *driver* does not supply them — it supplies `nvcuda.dll`, the driver API. cuBLAS
and the CUDA runtime come from the toolkit.

**Their terms.** [NVIDIA CUDA Toolkit EULA](https://docs.nvidia.com/cuda/eula/index.html),
read in full. The clauses that decide this:

- **§2.6 Attachment A** lists what may be redistributed with your application. `cudart.dll`
  appears under *CUDA Runtime*; `cublas.dll, cublasLt.dll` appear under *CUDA BLAS Library*.
  So NVIDIA does permit shipping exactly these three files — the archive is not a violation.
- **§2.1 License Scope**: the SDK is licensed to develop applications *only for use in
  systems with NVIDIA GPUs*. That is a **field-of-use restriction** in the precise sense
  `docs/licence-policy.md` uses the term.
- **§1.7 General**: governed by the laws of the United States and Delaware; exclusive
  jurisdiction in Santa Clara County, California; total cumulative liability capped at
  US$10; a termination clause NVIDIA may invoke; and a US export-controls covenant.

Content rephrased for compliance with licensing restrictions.

Against the rule ("OSI-approved, no copyleft, no user cap, no field-of-use restriction, no
disclosure obligation") this fails on **two** counts: it is not OSI-approved, and §2.1 is a
field-of-use restriction. So it cannot be `accepted` by an ADR either — ADR-0006's mechanism
admits a component *because it passes the rule*, and this one does not. The
`LicenseRef-PdfiumThirdParty` precedent does not transfer: that was admitted because it
passes the rule and merely lacks an SPDX identity.

It is also the exact shape of licence the policy's "Why it is absolute" section says stalls
a PSU legal review: a jurisdictional carve-out plus a hardware-scoped grant, requiring
someone to certify continuing compliance.

**Recommendation, and it costs nothing on this hardware: use the Vulkan build.**

`llama-b10687-bin-win-vulkan-x64.zip` (34,905,002 bytes) — I read its central directory
too: **52 entries, byte-for-byte the same set as the CUDA zip with `ggml-vulkan.dll`
(55,552,000) replacing `ggml-cuda.dll`.** Same `llama-server.exe`, same `mtmd.dll` (the
vision path), same `libomp.dll` + `LICENSE-LLVM-OpenMP`. **Zero NVIDIA content, so nothing
to decide.** It is also 7× smaller to download.

The GTX 1650 Ti is Turing and has a Vulkan 1.3 driver, so `-ngl` offload works. llama-swap
does not care which binary it drives: its config takes an arbitrary `cmd:` string
([`config.example.yaml` at v251](https://github.com/mostlygeek/llama-swap/blob/v251/config.example.yaml)),
so this is a path change in one YAML file, not a design change.

Fallback if Vulkan underperforms and CUDA is genuinely needed: install the CUDA Toolkit
from NVIDIA on the box so the DLLs come from a system SDK install rather than from files
this project stages and redistributes. That is the `not-shipped` shape the `ffmpeg` CLI
already uses — but it is still a decision to record, and still an ADR-level conversation,
because §2.1 attaches to *use* and not only to redistribution. **Do not take that path
silently.**

---

## 3. `Qwen/Qwen3-VL-2B-Instruct` — Apache-2.0, frontmatter only

Pinned revision: `89644892e4d85e24eaac8bacfd4f463576704203` (repo last modified
23 October 2025).

- **There is no `LICENSE` file.** A request for it at that exact revision returns
  **HTTP 404**:
  `https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct/raw/89644892e4d85e24eaac8bacfd4f463576704203/LICENSE`
- The full file list at that revision confirms it — `.gitattributes`, `README.md`,
  `chat_template.json`, `config.json`, `generation_config.json`, `merges.txt`,
  `model.safetensors`, `preprocessor_config.json`, `tokenizer.json`,
  `tokenizer_config.json`, `video_preprocessor_config.json`, `vocab.json`. No `LICENSE`,
  no `NOTICE`.
- The declaration is `README.md` YAML frontmatter, read at the pinned revision:
  ```yaml
  ---
  license: apache-2.0
  pipeline_tag: image-text-to-text
  library_name: transformers
  ---
  ```
  Source: <https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct/blob/main/README.md>
- The Hub's own model metadata agrees: `cardData.license = apache-2.0`, with
  `license_name` and `license_link` both empty —
  <https://huggingface.co/api/models/Qwen/Qwen3-VL-2B-Instruct>

**This is precisely the `Qwen2.5-VL-7B-Instruct` situation, already a recorded decision in
this repo** (28 August 2026: model-card metadata at a pinned revision is a primary
declaration and is accepted in the absence of a `LICENSE` file). The new entry rides that
decision rather than needing a new one — but `licence_source` must say so honestly.

Note for `issues/01`: the citation there for Qwen3-VL being Apache-2.0 is a third-party
community-content Markdown file. That is a secondary source. Replace it with the pinned
frontmatter above.

---

## 4. The GGUF quantisations

A re-quantised upload is a third party's derived work, so the uploading repository's own
licence is a separate question from the original weights'. Four candidate repos, and they
do not all clear.

### 4a. `Qwen/Qwen3-VL-2B-Instruct-GGUF` — first-party, clear, recommended

Pinned revision `52d6c8ffea26cc873ac5ad116f8631268d7eb503` (last modified 1 November 2025).
Uploaded by **Qwen themselves**, which removes the third-party derived-work question
entirely: <https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF>

Frontmatter at the pinned revision:

```yaml
---
license: apache-2.0
pipeline_tag: image-text-to-text
library_name: transformers
base_model:
- Qwen/Qwen3-VL-2B-Instruct
---
```

**No `LICENSE` file** — a request at the pinned revision returns HTTP 404. Same
frontmatter-only shape as §3.

Contents and sizes, read from the tree API at that revision:

| file | bytes |
|---|---|
| `Qwen3VL-2B-Instruct-Q4_K_M.gguf` | 1,107,409,952 |
| `Qwen3VL-2B-Instruct-Q8_0.gguf` | 1,834,427,424 |
| `Qwen3VL-2B-Instruct-F16.gguf` | 3,447,350,304 |
| `mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf` | 445,053,216 |
| `mmproj-Qwen3VL-2B-Instruct-F16.gguf` | 819,394,848 |

It ships the `mmproj` vision encoder, so ticket 03's vision path has everything it needs
from one licence-clear repo. Q4_K_M + Q8_0 mmproj ≈ 1.55 GB, close to issue 01's estimate.

### 4b. `unsloth/Qwen3-VL-2B-Instruct-GGUF` — clear, but third-party

Revision `8dcb98e52a1d1d02dce9249e5ab15bae8121c666`. `cardData.license = apache-2.0`,
no `LICENSE` file, `license_link` empty. Ships `Qwen3-VL-2B-Instruct-Q4_K_M.gguf` plus
`mmproj-{BF16,F16,F32}.gguf`. <https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF>

Clearable on the same frontmatter-at-a-pinned-revision basis, but it is a third party
asserting Apache-2.0 over its own derived work, which is a weaker claim than 4a for no
benefit. Prefer 4a.

### 4c. `ggml-org/Qwen3-VL-2B-Instruct-GGUF` — BLOCKER, no licence at all

Revision `ea6a11058182570be6436b9a2e4ee7f7b49f908d`.
<https://huggingface.co/ggml-org/Qwen3-VL-2B-Instruct-GGUF>

The entire `README.md` is 204 bytes. I read all of it:

```yaml
---
base_model:
- Qwen/Qwen3-VL-2B-Instruct
---
```

**No `license:` field, no `LICENSE` file, no NOTICE.** The Hub metadata confirms
`cardData.license` is empty.

This is the trap. `ggml-org` is llama.cpp's own Hugging Face organisation, and its quants
are the reference ones for a newly landed vision path (the card links
[llama.cpp PR #16780](https://github.com/ggml-org/llama.cpp/pull/16780)), so it is the repo
an agent or a hurried human reaches for first. Under `docs/licence-policy.md` it is
"any dependency whose licence cannot be established at all" — the `ambiguous` verdict in
`classify()`, which is a distinct failure from `flagged` and deliberately so.

**Do not resolve this by inheriting Apache-2.0 from the base model.** The base model's
licence permits the derived work; it does not tell you what terms *this* uploader offers it
under. Use 4a instead. Same weights, same `mmproj`, a licence statement that exists.

### 4d. `bartowski/Qwen_Qwen3-VL-2B-Instruct-GGUF` — BLOCKER, same reason

Revision `e84f8ae7ffee8b04793a4ed771609e2b61d3f3cf`. `cardData.license` empty, no `LICENSE`
file. Ships `Q4_K_M` plus `mmproj-...{bf16,f16}.gguf`.
<https://huggingface.co/bartowski/Qwen_Qwen3-VL-2B-Instruct-GGUF>

### 4e. `Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF` — the cleanest of the lot

Pinned revision `f86cb2c1fa58255f8052cc32aeede1b7482d4361` (last modified 12 November 2024).
First-party, **and it has a real `LICENSE` file**:
<https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF>

- `LICENSE` read at the pinned revision, 11,343 bytes, opening
  `Apache License / Version 2.0, January 2004 / http://www.apache.org/licenses/` — the
  Apache-2.0 text verbatim.
- Frontmatter `license: apache-2.0`, and `license_link` points at that same `LICENSE` file.
- `qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` = 1,117,320,768 bytes (matches issue 01's
  ~1.0 GB); `q8_0` = 1,894,532,160 bytes. Q2_K through Q8_0 all present.

`licence_source: LICENSE file at the pinned revision` — no recorded decision needed.

---

## 5. `Qwen/Qwen2.5-Coder-1.5B-Instruct` — Apache-2.0, verified from the LICENSE file

Pinned revision `2e1fd397ee46e1388853d2af2c993145b0f1098a` (last modified 12 January 2025).
<https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct>

`LICENSE` read at that revision: 11,343 bytes, `Apache License / Version 2.0, January 2004`
— the Apache-2.0 text verbatim. Frontmatter `license: apache-2.0` and `license_link` points
at that file. Both agree, and the file is authoritative.

This is the **strongest** evidence shape in this whole set: a `LICENSE` file at a pinned
revision, matching the standard `docs/licence-policy.md` sets and the standard the three
existing Apache-2.0 fleet members already meet.

---

## 6. `Qwen/Qwen2.5-Coder-3B-Instruct` — Qwen Research Licence, evidenced

Pinned revision `488639f1ff808d1d3d0ba301aef8c11461451ec5` (last modified 12 January 2025).
<https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct>

**Hub metadata** — note it does *not* claim Apache-2.0:

```
license      = other
license_name = qwen-research
license_link = https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct/blob/main/LICENSE
```

**`LICENSE` file read at the pinned revision**, 7,378 bytes. First two lines:

```
Qwen RESEARCH LICENSE AGREEMENT
Qwen RESEARCH LICENSE AGREEMENT Release Date: September 19, 2024
```

The two clauses that decide it, quoted from that file:

> "Non-Commercial" shall mean for research or evaluation purposes only.

> You are granted a non-exclusive, worldwide, non-transferable and royalty-free limited
> license […] FOR NON-COMMERCIAL PURPOSES ONLY.

and a distribution condition requiring a `Notice` text file carrying
`Qwen is licensed under the Qwen RESEARCH LICENSE AGREEMENT, Copyright (c) Alibaba Cloud.`

Same document, same release date (19 September 2024) as the `Qwen/Qwen2.5-3B-Instruct`
LICENSE this repo already refuses. So `licence: Qwen Research Licence` in
`registry/models.yaml` is the correct string and the existing refusal machinery covers it
unchanged.

**Issue 01's framing is confirmed.** I checked the rest of the family, and 3B is the lone
exception:

| model | `license` | `license_name` | `LICENSE` file |
|---|---|---|---|
| `Qwen2.5-Coder-0.5B-Instruct` | `apache-2.0` | — | yes |
| `Qwen2.5-Coder-1.5B-Instruct` | `apache-2.0` | — | yes |
| **`Qwen2.5-Coder-3B-Instruct`** | **`other`** | **`qwen-research`** | **yes (Research)** |
| `Qwen2.5-Coder-7B-Instruct` | `apache-2.0` | — | yes |
| `Qwen2.5-Coder-14B-Instruct` | `apache-2.0` | — | yes |
| `Qwen2.5-Coder-32B-Instruct` | `apache-2.0` | — | yes |

That is what makes it a good second refusal case: the size an engineer picks when 1.5B feels
too small is the one banned member of the family, and the gate catches it by name.

---

## 7. The structural gap: llama-swap's statically linked Go modules

llama-swap ships as a single Go binary. Go links its dependencies statically, so
`llama-swap.exe` **contains** third-party code, and that code is in **no tree
`scripts/licence-audit.mjs` enumerates** — the audit walks the harness, the profile, our
`plugins/`, and Python site-packages. This is the same class of problem as the `ffmpeg` CLI
on `PATH`: a shipped component in no manifest, which is exactly why the policy declares that
one by hand.

Making it worse: the repo tree at `main` has **no `NOTICE`, `THIRD_PARTY`, or third-party
licences file** ([tree API](https://api.github.com/repos/mostlygeek/llama-swap/git/trees/main)),
and neither does the release archive. There is no bundled disclosure to point evidence at.

[`go.mod` at `main`](https://github.com/mostlygeek/llama-swap/blob/main/go.mod) declares
**17 direct requires and ~65 indirect**. I verified all 17 direct requires. Every one is
inside the eleven:

| module | licence | how established |
|---|---|---|
| `github.com/billziss-gh/golib` | MIT | GitHub licence API |
| `github.com/charmbracelet/{bubbles,bubbletea,lipgloss}` | MIT | GitHub licence API |
| `github.com/fxamacker/cbor/v2` | MIT | GitHub licence API |
| `github.com/gin-gonic/gin` | MIT | GitHub licence API |
| `github.com/google/jsonschema-go` | MIT | GitHub licence API |
| `github.com/stretchr/testify` | MIT | GitHub licence API |
| `github.com/tidwall/{gjson,sjson}` | MIT | GitHub licence API |
| `github.com/yusufpapurcu/wmi` | MIT | GitHub licence API |
| `github.com/pressly/goose/v3` | MIT | **read the text** — GitHub says `NOASSERTION`; the file opens `MIT License` |
| `github.com/klauspost/compress` | BSD-3-Clause | **read the text** — `NOASSERTION`; Go-Authors BSD form, no-endorsement clause present |
| `github.com/shirou/gopsutil/v4` | BSD-3-Clause | **read the text** — `NOASSERTION`; no-endorsement clause present |
| `gopkg.in/yaml.v3` | MIT AND Apache-2.0 | **read the text** — `NOASSERTION`; the file states it is covered by both |
| `golang.org/x/sys` | BSD-3-Clause | GitHub licence API (`golang/sys`) |
| `modernc.org/sqlite` | BSD-3-Clause | [pkg.go.dev licences tab](https://pkg.go.dev/modernc.org/sqlite?tab=licenses) |

Four of those seventeen come back as `NOASSERTION` from automated classification and only
resolve by opening the file — the same "a package whose metadata says only BSD is ambiguous
until somebody opens it" problem `resolved_by_reading` exists for. Spot-checked indirects:
`google.golang.org/protobuf` BSD-3-Clause, `modernc.org/libc` BSD-3-Clause
([pkg.go.dev](https://pkg.go.dev/modernc.org/libc?tab=licenses)).

**This is not a blocker, but it is not clear either — it is unfinished.** Nothing found so
far is outside the allow-list, and there is no reason to expect copyleft in a Go server
stack. But ~65 indirect modules are unverified, and the honest sentence today is "llama-swap
itself is MIT; what its binary statically links has been sampled, not enumerated."

Two ways to close it, cheapest first:

1. **Enumerate once and commit the output.** `go-licenses report` or `go list -m all` piped
   through a licence lookup, against `go.mod` at tag `v251`, committed to
   `docs/licence-evidence/llama-swap-251-go-modules.txt`. That file then becomes the
   `evidence` path, and it is repo-relative so the audit can check it on any machine — no
   `{site-packages}` or `{harness}` expansion needed.
2. **Declare it as one `bundled` component** with `role: runtime` and that evidence file,
   the way `libvips` and `OpenBLAS` are declared. One entry, not eighty.

Do (1) before shipping the claim; (2) is how it gets recorded.

---

## 8. What the audit would check, and what to write where

Read from `scripts/licence-audit.mjs` and `plugins/dsh-client-ui-base/lib/registry/fleet.js`,
so these are the mechanics as they are, not as remembered.

### Fleet members: `registry/models.yaml` only, no decision entry

`isLicenceAllowed` lower-cases the whole trimmed `licence` string and tests membership in
`ALLOWED_LICENCES`. `loadFleet()` splits the fleet into `loaded` and `refused`. The audit
then emits every `loaded` member as `verdict: "allowed"` **unconditionally** — the loader has
already gated them — and calls `decisionFor(...)` with `null`. **So an Apache-2.0 fleet
member needs no `docs/licence-decisions.json` entry at all.** Just the registry rows:

```yaml
  - name: Qwen/Qwen3-VL-2B-Instruct
    role: vision-document
    licence: Apache-2.0
    licence_source: README.md YAML frontmatter at the pinned revision (no LICENSE file in repo)
    revision: 89644892e4d85e24eaac8bacfd4f463576704203
    size: 2B
    context: 262144            # confirm against config.json in ticket 03, not asserted here
    modalities: [text, image]
    capabilities: [document-understanding, drawing-understanding, visual-grounding]

  - name: Qwen/Qwen2.5-Coder-1.5B-Instruct
    role: coder
    licence: Apache-2.0
    licence_source: LICENSE file at the pinned revision
    revision: 2e1fd397ee46e1388853d2af2c993145b0f1098a
    size: 1.5B
    context: 32768             # confirm against config.json in ticket 03
    modalities: [text]
    capabilities: [code-generation, code-reasoning, tool-use]
```

The `licence_source` strings above are the two shapes this repo already uses verbatim. Keep
them identical so the file reads as one convention rather than four.

Also update `registry/models.yaml`'s header comment block: it still says "only Apache-2.0,
MIT, BSD-2-Clause and BSD-3-Clause ship", four names superseded by ADR-0006. The audit's
`checkPolicyDrift()` only checks `docs/licence-policy.md`, `CLAUDE.md` and `README.md`, so
this stale statement will **not** fail the build — which is why it needs fixing by hand.

### The second refusal: `registry/models.yaml` + a decision entry with evidence

A `refused` member is emitted with `verdict: "flagged"` and looked up as
`decisionFor("model", name, licence)`. Missing → the audit **fails**. So both files:

```yaml
  - name: Qwen/Qwen2.5-Coder-3B-Instruct
    role: none
    licence: Qwen Research Licence
    licence_source: LICENSE file at the pinned revision
    revision: 488639f1ff808d1d3d0ba301aef8c11461451ec5
    size: 3B
    context: 32768
    modalities: [text]
    capabilities: [code-generation]
    note: "declared so the loader can refuse it — the obvious small-coder pick is the one non-Apache member of the Coder family"
```

```json
{
  "ecosystem": "model",
  "component": "Qwen/Qwen2.5-Coder-3B-Instruct",
  "licence": "Qwen Research Licence",
  "decision": "refused",
  "recorded": "2026-08-30",
  "reason": "Non-commercial research licence. Declared in registry/models.yaml on purpose so the loader refuses it. Sharper than the Qwen2.5-3B case: the Coder family is Apache-2.0 at 0.5B, 1.5B, 7B, 14B and 32B and 3B alone is not, so the size an engineer reaches for when 1.5B feels small is the one banned member. Read from the LICENSE file at revision 488639f1ff808d1d3d0ba301aef8c11461451ec5: 'Qwen RESEARCH LICENSE AGREEMENT, Release Date: September 19, 2024', granting rights FOR NON-COMMERCIAL PURPOSES ONLY.",
  "evidence": [
    "plugins/dsh-client-ui-base/lib/registry/loader.js",
    "plugins/dsh-client-ui-base/test/loader.test.js"
  ]
}
```

Both evidence paths are repo-relative and already exist, so `checkEvidence` passes. The
decision key must be `model:qwen/qwen2.5-coder-3b-instruct` after lower-casing — matching
the registry `name` exactly. `readDecisions` **hard-fails on a duplicate key**, so do not
add a second entry for the same ecosystem+component.

### The bundled runtime components: `bundled` + a decision each

`bundled` rows are classified through `classify()` like anything else, and each gets
`decisionFor("bundled", component, licence)`.

**`libomp.dll` — needed, and it passes.** `Apache-2.0 WITH LLVM-exception` evaluates to
`Apache-2.0` in `evaluateExpression`, so the row comes back `allowed` and strictly speaking
needs no decision. Declare it under `bundled` anyway — that array's whole purpose is that
"package metadata describes the package, not what the package vendored", and `OpenBLAS`
inside numpy sets the precedent of recording an allow-listed bundled component so the
attestation report can name it:

```json
{
  "component": "LLVM OpenMP runtime",
  "inside": "llama-b10687-bin-win-vulkan-x64.zip, as libomp.dll",
  "licence": "Apache-2.0 WITH LLVM-exception",
  "version": "shipped prebuilt with llama.cpp b10687",
  "role": "runtime",
  "note": "Present in every Windows llama.cpp build — CPU, CUDA and Vulkan alike. The archive carries its licence text as LICENSE-LLVM-OpenMP (19,741 bytes), read on 30 Aug 2026: 'The LLVM Project is under the Apache License v2.0 with LLVM Exceptions'. On the allow-list via the base licence; recorded so the attestation report can name it."
}
```

**Evidence path.** Whatever entry you write, the evidence file has to exist on this machine
when the audit runs, and `checkEvidence` has **no carve-out**. There is no `{harness}` or
`{site-packages}` placeholder that reaches a llama.cpp install, and the audit expands only
`{site-packages}`, `{harness}`, `{dsh-home}` and `~`. Two workable options:

1. **Copy `LICENSE-LLVM-OpenMP` out of the archive into
   `docs/licence-evidence/llvm-openmp-llama.cpp-b10687-LICENSE.txt`** and cite that
   repo-relative path. This is the pattern `docs/licence-evidence/ffmpeg-8.1.1-LICENSE.txt`
   already establishes, it is machine-independent, and a collaborator can check it. **Do
   this.**
2. Add a `{llama}` placeholder to `checkEvidence` pointing at the install root. More code,
   and it reintroduces the machine-local fragility the `{site-packages}` work removed.

`ggml-cuda.dll` / `ggml-vulkan.dll` need no entry: they are llama.cpp's own MIT code.

### The CUDA blocker, if the Vulkan route is rejected

There is no correct `docs/licence-decisions.json` entry for the NVIDIA DLLs. `accepted`
requires an ADR admitting a component *because it passes the rule*, and the EULA fails the
rule on two counts. `mitigated` requires a measurement that the offending part is not
loaded — impossible, since `ggml-cuda.dll` links against `cudart` and `cublas` and they are
loaded on every generation. `not-shipped` is arguable only if the box installs the CUDA
Toolkit from NVIDIA and this project stages nothing, and even then §2.1 attaches to use.

So: **raise it, do not widen the list.** The recommendation stands — the Vulkan build has
the same `llama-server.exe` and the same `mtmd.dll` vision path with zero NVIDIA content,
and llama-swap drives it with a one-line config change.

### Not a licence problem, but it fails `npm test`

`plugins/dsh-client-ui-base/test/loader.test.js` (the last test, "the shipped registry")
asserts the exact loaded list

```js
["Qwen/Qwen2.5-7B-Instruct", "Qwen/Qwen2.5-Coder-7B-Instruct", "Qwen/Qwen2.5-VL-7B-Instruct"]
```

and `refused.length === 1` with `refused[0].name === "Qwen/Qwen2.5-3B-Instruct"`. **Adding
any of the three registry entries above breaks that assertion**, and it is part of
`npm test`. Update the expected lists in the same commit as the registry edit — and while
you are there, assert the *second* refusal by name, so the new refusal case is held by a
test rather than only declared.

---

## Summary for the spec

- **llama-swap and llama.cpp are both MIT, verified from their own licence files.** No
  widening, no decision entries for their own code.
- **Take the Vulkan Windows build, not the CUDA one.** Measured: identical 52-entry
  archive bar `ggml-vulkan.dll` for `ggml-cuda.dll`, 7× smaller, and it avoids three NVIDIA
  redistributables whose EULA is not OSI-approved and carries a field-of-use restriction.
  This is the single decision that keeps the licence claim intact.
- **Take GGUFs from `Qwen/…` and nowhere else.** The `ggml-org` and `bartowski` uploads
  declare no licence at all, which is a harder failure than a wrong one.
- **`Qwen2.5-Coder-1.5B-Instruct` has a real `LICENSE` file; `Qwen3-VL-2B-Instruct` does
  not** — its Apache-2.0 is frontmatter at a pinned revision, riding the recorded decision
  Qwen2.5-VL-7B already established. Say so in `licence_source`.
- **`Qwen2.5-Coder-3B-Instruct` is Qwen Research, evidenced byte-for-byte**, and it is the
  only non-Apache member of its family — a sharper refusal case than the one already
  shipped.
- **One loose end to close before claiming this is audited:** enumerate llama-swap's
  statically linked Go modules and commit the output. Its 17 direct requires are all inside
  the eleven; ~65 indirect are unverified and sit in no tree the audit walks.

---

## Sources

Primary, all read on 30 August 2026.

**llama-swap**
- <https://api.github.com/repos/mostlygeek/llama-swap/contents/LICENSE.md?ref=v251>
- <https://github.com/mostlygeek/llama-swap/blob/main/LICENSE.md>
- <https://github.com/mostlygeek/llama-swap/releases/tag/v251>
- <https://github.com/mostlygeek/llama-swap/blob/main/go.mod>
- <https://github.com/mostlygeek/llama-swap/blob/v251/config.example.yaml>
- <https://api.github.com/repos/mostlygeek/llama-swap/git/trees/main>

**llama.cpp**
- <https://github.com/ggml-org/llama.cpp/blob/master/LICENSE>
- <https://github.com/ggml-org/llama.cpp/releases/tag/b10687>
- <https://github.com/ggml-org/llama.cpp/issues/15204>
- <https://github.com/ggml-org/llama.vscode/wiki/Windows/3cc5c44cf6138b968c514d2cf30b75035903c252>
- ZIP central directories of `llama-b10687-bin-win-cuda-12.4-x64.zip`,
  `cudart-llama-bin-win-cuda-12.4-x64.zip` and `llama-b10687-bin-win-vulkan-x64.zip`, read
  over HTTP range requests; `LICENSE-LLVM-OpenMP` decompressed from the first of those.

**NVIDIA**
- <https://docs.nvidia.com/cuda/eula/index.html> (§1.7 General, §2.1 License Scope,
  §2.2 Distribution, §2.6 Attachment A)

**Weights and quantisations**
- <https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct> @ `89644892e4d85e24eaac8bacfd4f463576704203`
- <https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct-GGUF> @ `52d6c8ffea26cc873ac5ad116f8631268d7eb503`
- <https://huggingface.co/unsloth/Qwen3-VL-2B-Instruct-GGUF> @ `8dcb98e52a1d1d02dce9249e5ab15bae8121c666`
- <https://huggingface.co/ggml-org/Qwen3-VL-2B-Instruct-GGUF> @ `ea6a11058182570be6436b9a2e4ee7f7b49f908d`
- <https://huggingface.co/bartowski/Qwen_Qwen3-VL-2B-Instruct-GGUF> @ `e84f8ae7ffee8b04793a4ed771609e2b61d3f3cf`
- <https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct> @ `2e1fd397ee46e1388853d2af2c993145b0f1098a`
- <https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF> @ `f86cb2c1fa58255f8052cc32aeede1b7482d4361`
- <https://huggingface.co/Qwen/Qwen2.5-Coder-3B-Instruct> @ `488639f1ff808d1d3d0ba301aef8c11461451ec5`
- Family check: `Qwen2.5-Coder-{0.5B,7B,14B,32B}-Instruct` model metadata via
  `https://huggingface.co/api/models/…`

**Go modules**
- <https://pkg.go.dev/modernc.org/sqlite?tab=licenses>
- <https://pkg.go.dev/modernc.org/libc?tab=licenses>
- `LICENSE` files at `klauspost/compress`, `pressly/goose`, `shirou/gopsutil`,
  `go-yaml/yaml` (branch `v3`), read directly from `raw.githubusercontent.com`
- GitHub licence API for the remaining direct requires
