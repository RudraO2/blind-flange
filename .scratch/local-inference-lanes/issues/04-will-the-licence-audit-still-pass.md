# Will the licence audit still pass with the new components?

Type: research
Status: resolved
Blocked by: —

## Answer

Full findings with sources, including the exact `registry/models.yaml` rows and
`licence-decisions.json` entry shapes:
[research/04-licence-clearance.md](../research/04-licence-clearance.md).

**Clear:** llama-swap `v251` MIT (the file is `LICENSE.md`, which is why a fetch of `LICENSE`
404s); llama.cpp MIT; `Qwen/Qwen2.5-Coder-1.5B-Instruct` Apache-2.0 from a real `LICENSE` file;
`Qwen/Qwen3-VL-2B-Instruct` Apache-2.0 but **frontmatter only, no `LICENSE` file** — the same
shape as the existing Qwen2.5-VL-7B entry, so it rides that recorded decision provided
`licence_source` says so.

**Blocker, resolved by substitution — the CUDA redistributables.** Measured by reading the ZIP
central directories over range requests: the main CUDA archive bundles **no** NVIDIA DLL, but
`cudart-llama-bin-win-cuda-12.4-x64.zip` contains exactly `cublas64_12.dll`,
`cublasLt64_12.dll`, `cudart64_12.dll` and **no licence text**, and they are mandatory to run
the CUDA build. The NVIDIA CUDA EULA permits redistribution (§2.6 Attachment A) but §2.1 scopes
the grant to systems with NVIDIA GPUs — a field-of-use restriction — and it is not OSI-approved.
It fails the rule on two counts, so it cannot be `accepted` by ADR either; the
`LicenseRef-PdfiumThirdParty` precedent does not transfer.

**Take `llama-b10687-bin-win-vulkan-x64.zip` instead.** Verified as the identical 52-entry
archive with `ggml-vulkan.dll` in place of `ggml-cuda.dll` — same `llama-server.exe`, same
`mtmd.dll` vision path, zero NVIDIA content, 7× smaller. One line of llama-swap config.

**Blocker, resolved by substitution — the GGUF uploads.**
`ggml-org/Qwen3-VL-2B-Instruct-GGUF` declares **no licence at all** (204-byte README, only
`base_model:`), and so does `bartowski/Qwen_Qwen3-VL-2B-Instruct-GGUF`. That is the `ambiguous`
verdict, a harder failure than a wrong licence, and it must not be resolved by inheriting
Apache-2.0 from the base model. **Take both GGUFs from `Qwen/…`** — first-party, and the coder's
GGUF repo even has a real `LICENSE` file.

**The refusal case is solid.** `Qwen/Qwen2.5-Coder-3B-Instruct` is `license: other` /
`license_name: qwen-research`, the same Qwen Research Licence document already refused for
Qwen2.5-3B. The rest of the family — 0.5B, 1.5B, 7B, 14B, 32B — is Apache-2.0 with `LICENSE`
files. 3B alone is not, which is what makes it a sharp second refusal case: the size an engineer
reaches for when 1.5B feels small is the one banned member.

**Two mechanical consequences:**

1. An Apache-2.0 fleet member needs **no** `licence-decisions.json` entry — the loader has
   already gated it and the audit emits `allowed` unconditionally. The refused member **does**
   need one, or the audit fails.
2. **`test/loader.test.js` asserts the exact loaded list and `refused.length === 1`.** Any
   registry edit breaks `npm test` unless the same commit updates it — and while there, assert
   the second refusal by name so it is held by a test rather than only declared.

**One loose end, not a blocker:** llama-swap is a statically linked Go binary, so it *contains*
~80 modules that sit in no tree the audit walks, and neither repo nor release ships a NOTICE.
All 17 direct requires were verified inside the eleven; ~65 indirect are unverified. Close it by
committing a `go-licenses` enumeration at tag `v251` to `docs/licence-evidence/` and declaring
it as one `bundled` component. Also: `libomp.dll` ships in every Windows build under
`Apache-2.0 WITH LLVM-exception`, which the audit's `evaluateExpression` resolves to Apache-2.0
and passes — copy `LICENSE-LLVM-OpenMP` out of the archive into `docs/licence-evidence/` as the
evidence path, following the ffmpeg pattern.

## Question

`npm run licence-audit` is part of `npm test` and **fails on an undecided licence**. This effort
introduces several components that have never been audited, and the allow-list is eleven
enumerated names — widening it is an ADR-level act, never a judgement call at the point of use.

For each new component, establish the licence, the primary source it is stated in, and whether
it falls inside the allow-list (Apache-2.0 · MIT · BSD-2-Clause · BSD-3-Clause · ISC · 0BSD ·
Python-2.0 · MIT-CMU · BSL-1.0 · Zlib · CC0-1.0):

- **llama-swap** — reported MIT; verify against the repository's own `LICENSE`.
- **llama.cpp / `llama-server`** — reported MIT; verify, and check whether the prebuilt CUDA
  binary bundles anything with a different licence (CUDA runtime redistributables in particular,
  since NVIDIA's terms are not OSI-approved and a bundled `.dll` is a shipped component).
- **`Qwen3-VL-2B-Instruct`** weights — reported Apache-2.0; verify at the pinned revision and
  note whether the statement is in a `LICENSE` file or only in the model card frontmatter, since
  `registry/models.yaml` records `licence_source` and the existing VL entry had no `LICENSE` file.
- **The GGUF quantisations** — a re-quantised upload is a derived work by a third party, so its
  own repository licence matters separately from the original weights.
- **`Qwen2.5-Coder-1.5B-Instruct`** weights — expected Apache-2.0; verify. And record
  `Qwen2.5-Coder-3B-Instruct` as non-permissive, so it can be added to the registry as a second
  deliberate refusal case.

Read `docs/licence-policy.md` first. Anything outside the eleven names is a blocker to be raised,
not a licence to widen the list. Machine-local evidence paths get no carve-out — the audit checks
that the path exists.
