# Ralph loop — one story per chat

**How to use this:** open a new Claude Code chat in this repo, run `/model sonnet`, and paste:

> Read `docs/ralph-loop.md` and do exactly what it says.

That is the whole prompt. It works out which story is next by itself, builds it, gates it,
commits, pushes and stops. Nothing to edit between chats.

To force a specific story instead, add one line: `Do story 4.5.` An explicit story always wins
over the picking rule below.

**Run it on Sonnet.** `/model sonnet`. The stories in `epics.md` already carry their acceptance
criteria in Given/When/Then form, so the thinking has been done — what is left is mechanical, and
every subagent inherits the session's model, which multiplies the cost of choosing a larger one.

---

You are implementing **Blind Flange** (SIH26117). Do exactly one story, then stop.

## 0 — Work out which story

Skip this only if you were told a story by name.

Read `_bmad-output/implementation-artifacts/sprint-status.yaml` and apply these rules in order.
The first one that matches decides it:

1. **A story is `in-progress` or `review`.** That one is yours — finish it. Something stopped
   mid-flight and leaving it is worse than starting new work. Read what blocked it first.
2. **Otherwise, the first `backlog` story in the build order.** The order is *not* numerical,
   and it is **not written here** — read it from the **Build order** section of
   `_bmad-output/planning-artifacts/epics.md`. That section is the only copy; it changes as the
   plan changes, and a copy kept in this file would go stale and send you to the wrong story.

   Walk that sequence and take the first story still marked `backlog`.

   **Order stories within an epic numerically, not alphabetically.** Story 3.9 comes *before*
   story 3.10 — sorting the tracker's keys as text puts `3-10-...` first, which is wrong. An
   epic can carry more than nine stories; two do.

**Never take a story marked `deferred`.** Those were cut on 28 Aug 2026 with reasons recorded at
each story. `deferred` is a decision, not a gap to be helpfully filled.

**Say which story you picked and why, in one line, before you do anything else.** If the tracker
and the build order disagree, or every remaining story is `deferred` or `done`, stop and ask
rather than guessing.

## 1 — Read

- `CLAUDE.md`, `CONTEXT.md`, `docs/licence-policy.md`
- Your story in `_bmad-output/planning-artifacts/epics.md`, plus that file's **Standing
  acceptance criteria** section, which applies to every story
- `docs/deepseek-harness-notes.md` — only if the story touches the harness. It is verified from
  source, so trust it instead of exploring

That is the whole reading list. Do not read the ADRs, `HANDOFF.md` or `blind-flange.html` unless
the story sends you there.

## 2 — Build it

Invoke `bmad-build` and **take the one-shot route**. Say so when you invoke it.

`bmad-build` is the only skill you invoke to build a story. If you find yourself implementing
without having invoked it, stop and invoke it — the one-shot route is what carries the review,
the sprint-status sync and the commit, and skipping it means reaching for those separately.

**This is an instruction, not a suggestion, and it overrides the skill's own routing step.**
`bmad-build` chooses its route by judging blast radius, and it will judge some of these stories
high — story 1.1 is a package six epics mount into, story 3.1 touches an unproven seam. Ignore
that judgement and take one-shot regardless. The blast radius is real but the acceptance criteria
are already written, which is what the heavier route exists to produce. If you conclude the full
route is genuinely necessary, **stop and ask** rather than taking it.

**The story in `epics.md` is the spec. Do not write another one.** No epic-context compilation,
no planning step, no separate spec file, no implementation subagent — implement directly. The
acceptance criteria are already written; re-deriving them is the expensive mistake this loop
exists to avoid.

**Spawn at most one subagent, and only for the review** — and that one is spawned *by
`bmad-build`'s one-shot route*, not by you. If you are about to launch a subagent to explore the
codebase, stop: the slot table, the plugin format, the extension-point map and the install path
are all in `docs/deepseek-harness-notes.md`, verified from source.

**Never invoke `bmad-code-review`.** Not as the gate, not "to be safe", not because
`bmad-build` was skipped. It carries **four** review layers of its own — Blind Hunter, Edge Case
Hunter, Verification Gap and Acceptance Auditor — none of which this project's
`_bmad/custom/bmad-build.toml` can reach, because that file customises `bmad-build` and nothing
else. BMAD's own catalog marks it `required=false`, "optional extra layer after Build's built-in
review". On 28 Aug 2026 a chat building Story 3.1 skipped `bmad-build` entirely and reached for
this instead: four subagents where the configured route spawns one. The work was fine; the bill
was four times what it needed to be.

The review for a story is the one `bmad-build`'s one-shot route runs. There is no second review.

**Announce the plan in one line before starting** — the story you picked, the route, and how many
subagents you intend to spawn. If that number is above one, you have misread this section.

Rules while building:

- **Extend, do not fork.** Harness changes are `cordis.patch.yml` rows and out-of-tree plugin
  packages. Never edit harness source.
- **Licences:** Apache-2.0, MIT, BSD-2-Clause, BSD-3-Clause. Nothing else. **`PyMuPDF` is
  AGPL-3.0 — never use it**; use `pypdfium2`.
- **No fake panels.** A panel that animates with no real event behind it is a bug. Only token
  generation is replayed.
- **UI from the primitives** — `@deepseek-ai/dsh-client-ui-primitives` and `ui-theme` tokens. No
  hand-rolled hex, radii, spacing, shadows or fonts. Declared slots only, never `root`.
- **Do not invoke Matt Pocock's skills.** BMAD owns implementation here.

**Timeboxed stories** — 3.1, the replay adapter seam — honour the timebox. When it expires take
the recorded fallback or escalate. Do not grind. (4.2, the OCR proof, is already done and
passed twice: `services/ingestion/proof/PROOF.md` for Tesseract and `PROOF-RAPIDOCR.md` for
the engine that replaced it.)

**If the story needs a decision nothing in the repo records, stop and ask.** Do not invent one.

## 3 — The gate

Do not call the story done until all of these hold. State each one.

1. Every acceptance criterion met — quote it, say how it was verified.
2. The Standing acceptance criteria met.
3. **Touched a user-visible surface?** Screenshotted in **both** light and dark, saved under
   `docs/screenshots/`. A component that works in one theme is unfinished.
4. No harness source file edited.
5. Any new dependency licence-checked and recorded.
6. No unresolved review finding from **`bmad-build`'s own review**, or one is recorded as
   accepted with the reason. If you did not reach that review, the fix is to run `bmad-build`
   one-shot — never to invoke a separate review skill.
7. The work is on `origin/main` — not on a branch, not in a worktree.

**Gate fails:** set the story to `review` in the tracker, write what is blocking it, stop. Do not
mark it done.

## 4 — Commit, push, record

- `git status` first — this folder is in OneDrive and sync churn surfaces stray files.
- Conventional Commits subject; body only when the *why* is not obvious.
- **No Claude attribution.** No `Co-Authored-By`, no session trailer, no generated-with footer.
- `git pull --rebase` then push.
- Set the story to `done` in `_bmad-output/implementation-artifacts/sprint-status.yaml`. If every
  story in the epic is done, set the epic to `done`.
- Never commit `node_modules/`, model weights, `~/.dsh`, or `.env`.

## 5 — Report and stop

Four lines, plain language: what you built · **what you had to decide that the plan did not
record** · anything that will bite the next story · which story is next by the picking rule in
step 0.

Then stop. The next story goes in a new chat.

---

## Where you work

**Build on `main`, in the main checkout.** Do not create a git worktree and do not create a
branch. Six worktrees already exist from earlier stories and three of them never reached
`main`; the tracker said `backlog` for work that was finished and pushed. A worktree buys
isolation this build does not need — one story runs at a time now — and costs a merge step
that keeps getting skipped.

If a tool offers to move you into a worktree, decline it.

**Before you start:** `git pull --rebase`. **Before you finish:** `git pull --rebase`, then
push to `main`. A story is done when it is on `origin/main`, not when it is committed
somewhere.

The Python ingestion service (`services/ingestion/`) and the harness plugins
(`plugins/`, the profile) are separate trees, so a story touches one or the other. If your
story needs the other side's files, stop and say so.

## If the plan itself is wrong

Say so and invoke `bmad-correct-course`. Do not fix it silently — changing the plan is a decision
and belongs in writing.
