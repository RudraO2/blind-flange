# For whoever owns the router

Written 30 August 2026, from `feat/local-inference-lanes`. Everything downstream of the router
now works against real local models, so this is what that side needs from yours — and, more
usefully, the two things measurement says are currently wrong.

**Update, 31 August 2026:** `classify.js` has since been changed — see the banner under
Problem 1. `score.js` is still untouched.

Nothing on that branch touches `lib/router/classify.js` or `lib/router/score.js`. They are
yours, and they were left alone deliberately so tomorrow is a merge rather than a conflict in
the two files two people would otherwise both be rewriting.

## The seam, in one sentence

**You produce a task type and a selected fleet member; the execution side reads it off the
`router/routed` session event and does everything after that.**

Concretely, `classifyAndRoute` in `lib/index.js` already appends:

```
router/classified   { taskType, scores, matchedRules, fallback, tied, ... }
router/routed       { taskType, scored[], excluded[], selected, tied, allZero }
```

`selected` is a fleet member's `name` from `registry/models.yaml`. `lib/router/dispatch.js`
resolves that to the member's `runtime_id`, which is the key llama-swap knows the model by, and
the LLM adapter puts it in the request. That link did not exist before 30 August — the decision
was recorded and nothing consumed it — so if you were planning to build dispatch, **don't, it
exists**.

Two consequences worth knowing:

- If you replace the regex classifier with a model, **nothing downstream changes** as long as the
  event keeps its shape. Dispatch does not know or care where a task type came from.
- If you add a task type, `scoreFleet` needs a profile for it in `TASK_PROFILES` or it throws.
  Adding a *model* is a `registry/models.yaml` edit and needs no code at all — but a member that
  can run must carry a `runtime_id`, and a test now fails if one doesn't.

## Problem 1: plain arithmetic classifies as `document`

> **Addressed 31 August 2026.** All three misroutes below now reach the coder, and
> `test/router.test.js` holds them so they cannot come back. Two things did it, and neither is
> the model-based classifier this section goes on to propose:
>
> 1. **The fallback moved from `document` to `code`.** A request that trips no rule at all was
>    being handed to the vision member, which is not the lane that builds a tool call. Two of
>    the three prompts below score zero against every rule, so the fallback alone fixed them.
> 2. **`calculation` gained `arithmetic-verb` and `how-many`** — near enough the
>    `\b(sum|count|total|average|mean|minimum|maximum|round)\b` this section asks for. That
>    fixed the third, which was losing to `report-noun` matching the *verb* "report".
>
> A third change went in beside them: **an attached image now confines classification to the
> two task types the vision member serves**, because only one member can see and that is a fact
> about the request rather than a guess from its wording.
>
> The section below is kept as written. The reasoning still holds, the measurement is still the
> measurement, and the model-based classifier it proposes is still the better long-term answer —
> the regex set is now less wrong, not right.

This is the largest hole in the demo, bigger than any missing panel.

`npm run evaluate` scores the router separately from the lanes, and it reports **7 of 10**. Every
miss is the same shape — an arithmetic question routed to the vision-document model, which then
answers it *from memory instead of computing it*. The coding lane never engages, so no program is
written, nothing runs in the sandbox, and the answer is whatever the model recalls.

Measured misroutes, verbatim:

| prompt | classified | should be |
|---|---|---|
| Sum the integers from 1 to 100. | `document` | `calculation` |
| Count how many integers from 1 to 200 are divisible by both 3 and 5. | `document` | `calculation` |
| Given readings 7.2, 7.6, 6.9 and 7.4 mm, report the minimum reading. | `document` | `calculation` |

`RULES.calculation` in `classify.js` has eight patterns and none of them match a bare arithmetic
instruction — no `\b(sum|count|total|average|mean|minimum|maximum|round)\b`, nothing for "how
many", nothing for a bare numeric list. `document` wins by fallback and by matching incidental
words.

Why it matters more than it looks: a confident wrong number in an approval note is worse than a
slow one. The whole point of the coding lane is that a 1.5B model is bad at arithmetic and good
at writing `print(sum(range(1, 101)))`, and the router is what decides which of those happens.

`npm run evaluate` is how you'll know you've fixed it. It prints `task type classified into the
right lane` as its own line, separately from whether the answers were correct, precisely so a
classification miss and a lane failure can't hide inside one number.

## Problem 2: the router model must not sit on the discrete GPU

If the router becomes a model, where it runs decides whether the lanes fit at all.

```
Vulkan0   AMD Radeon(TM) Graphics      ~8 GB shared system RAM   the Ryzen 4600H's iGPU
Vulkan1   NVIDIA GeForce GTX 1650 Ti   4149 MiB, ~3.7 GB free    the discrete card
```

Three things follow:

1. **`Vulkan0` is what llama.cpp picks by default**, and it is the wrong device for a lane model —
   shared DDR4 at a fraction of the bandwidth. Every model in `D:\ai\llama-swap\config.yaml` pins
   `--device Vulkan1` explicitly. Don't remove those.
2. **The router runs on every turn, first.** Anything resident on `Vulkan1` permanently reduces
   what's left, and the lane models need essentially all of it: llama-swap holds one model at a
   time by default, which is the residency policy, and 3.7 GB does not hold two.
3. **So put the router on `Vulkan0` or the CPU.** `--device Vulkan0` gives you ~8 GB of iGPU memory
   with nothing else competing for it — better than the CPU, because it's still parallel hardware
   and never touches the discrete card. `-ngl 0` puts it on six Ryzen cores instead, which is fine:
   classification is a tiny-output, prefill-dominated task and lands well under a second there.

There is a commented `bf-router` entry in `D:\ai\llama-swap\config.yaml` showing exactly where it
goes, with `ttl: 0` so it is never evicted.

**If your router model happens to be a capable vision-language model, say so.** It could serve the
document lane too, and llama-swap would load it once for both — which would make the whole budget
easier rather than harder.

## Two other things measurement said

**Expert offload is not available on this machine.** The planning notes recorded "dense to MoE
with expert offload is the answer to the mid-range GPU" as a closed decision. The smallest useful
MoE coder is roughly 17 GB at Q4 and has to sit in system RAM, against 15.4 GB total including
Windows. Dense small models only. That claim is on a slide and needs correcting.

**The GPU is a 1650 Ti, not a 1650 Max-Q.** ADR-0001 says Max-Q. Minor, but the residency
arithmetic gets written against that number.

**And the deadline recorded in the planning notes was wrong** — they said 31 August 2026; it is
1 September.

## Where to read the detail

- `docs/measurements/local-inference-lanes/map.md` — the effort, its decisions and what is built.
- `docs/measurements/local-inference-lanes/spec.md` — the buildable plan, including the seam.
- `docs/measurements/local-inference-lanes/issues/` — eight tickets, each with its measurement.
- `docs/evaluation.md` — the current scores, regenerated by `npm run evaluate`.
