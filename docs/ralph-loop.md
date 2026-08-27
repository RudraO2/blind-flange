# Ralph loop — one story per chat

**How to use this:** open a new Claude Code chat in this repo and paste everything below the
line as your first message. Nothing else. The loop works out which story is next by itself.

One story per chat. When it finishes a story it stops. Open a new chat and paste again.

---

You are implementing **Blind Flange** (SIH26117), one story at a time. Do exactly one story in
this chat, then stop. Do not batch stories. Do not work ahead.

## Step 1 — Orient

Read these, in this order, before doing anything else:

- `CLAUDE.md` — the rules that override your defaults
- `HANDOFF.md` — the project and the closed decisions
- `CONTEXT.md` — the vocabulary. Use these words in code, commits and UI copy
- `docs/licence-policy.md` — a hard constraint, not a preference
- `_bmad-output/planning-artifacts/epics.md` — the plan. Read the **Standing acceptance
  criteria** section near the top in full; it applies to every story and is not repeated in them
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — where the build got to

Read `docs/adr/` if the story touches the model plane, the harness, the frontend, or ingestion.
Read `docs/deepseek-harness-notes.md` before touching anything harness-shaped — it is verified
source, not guesswork, and it will save you an hour.

## Step 2 — Pick the story

In `sprint-status.yaml`, under `development_status`, take the **first key in file order** that
both:

- matches the pattern `<epic>-<story>-<slug>` (skip `epic-N` and `epic-N-retrospective`), and
- has the status `backlog`

Epic 7 is P1. Skip any key starting `7-` until every key for epics 1 through 6 is `done`.

Say which story you picked and why, in one line. If nothing is `backlog`, say so and stop.

Then find that story in `epics.md` and read it — its user story, all of its acceptance criteria,
and its epic's implementation notes.

Set the story's status to `in-progress` in `sprint-status.yaml` before you start.

## Step 3 — Build it

Invoke the `bmad-build` skill for this story.

While building:

- **Extend, do not fork.** Harness changes are `cordis.patch.yml` rows and out-of-tree plugin
  packages. Never edit harness source.
- **Check the licence before adding any dependency.** `docs/licence-policy.md` allows Apache-2.0,
  MIT, BSD-2-Clause and BSD-3-Clause. Nothing else. **`PyMuPDF` is AGPL-3.0 — never use it**; the
  substitute is `pypdfium2`.
- **No fake panels.** A panel that animates without a real event behind it is a bug, not a
  shortcut. Only token generation is replayed.
- **UI comes from the primitives.** `@deepseek-ai/dsh-client-ui-primitives` and `ui-theme`
  tokens. No hand-rolled hex, radii, spacing, shadows or font stacks. Take a declared slot, never
  `root`.
- **Do not invoke Matt Pocock's skills** — `wayfinder`, `prototype`, `to-tickets`, `to-spec`,
  `implement`, `tdd`, `code-review`, `codebase-design`, `diagnosing-bugs`, `research`, `grilling`,
  `domain-modeling`. BMAD owns implementation and review in this repo.

**If the story is timeboxed** — Story 3.1 (replay adapter) and Story 4.2 (Tesseract proof) both
are — honour the timebox. When it expires, take the recorded fallback or escalate. Do not grind.

**If the story needs a decision that nothing in the repo records, stop and ask.** Do not invent
one and carry on. That is how a plan quietly stops being the plan.

## Step 4 — Review it

Invoke the `bmad-code-review` skill on the changes.

Review the diff, not your memory of what you wrote.

## Step 5 — Fix and re-review

Fix every finding. Then run `bmad-code-review` again on the result.

Do this at most **twice**. If findings survive two rounds, stop and report them rather than
looping — a third pass by the same mind rarely finds anything the second did not.

## Step 6 — The gate

**Do not mark the story done unless every one of these is true.** Check them one at a time and
say so explicitly.

1. Every acceptance criterion in the story is met. Quote each one and state how it was verified.
2. The Standing acceptance criteria from `epics.md` are met.
3. **If the story touched a user-visible surface:** it has been screenshotted in **both light and
   dark** themes, and the screenshots are saved in the repo. Start the app, use the Chrome
   DevTools MCP tools, switch the theme in Settings, capture both. A component that only works in
   one theme is unfinished.
4. No harness source file was edited.
5. Any new dependency was checked against `docs/licence-policy.md` and the licence recorded.
6. No review finding is outstanding, or one is outstanding and you have written down why it is
   being accepted.

**If the gate fails:** set the story's status to `review`, write down exactly what is blocking it,
and stop. Do not mark it done. Do not paper over it. A story that is nearly done is not done, and
saying otherwise costs more than the hour you saved.

## Step 7 — Commit and push

- Conventional Commits subject. A body only when the *why* is not obvious from the diff.
- Normal English in the message, not compressed.
- Run `git status` first and check nothing unexpected is staged. This folder is inside OneDrive
  and sync churn surfaces files you did not intend to add.
- Never commit model weights, `node_modules/`, the `~/.dsh` profile, or `.env`.
- **Push.** A story that is done and unpushed is not done.

## Step 8 — Update the tracker

Set the story's status to `done` in `_bmad-output/implementation-artifacts/sprint-status.yaml`.
If every story in its epic is now `done`, set the epic to `done` too.

Commit that change with the story, or immediately after it.

## Step 9 — Report and stop

In plain language, short:

- Which story you did
- What now works that did not work before
- What you had to decide that the plan did not record — this is the important line, do not skip it
- Anything that will bite the next story
- Which story is next

Then **stop**. Do not start it. The next story goes in a new chat.

---

## If something is wrong with the plan itself

If the story you picked is wrong, contradicts another story, or the plan has drifted from the
code, do not fix it silently. Say so, and invoke `bmad-correct-course`. Changing the plan is a
decision, and it belongs in writing.
