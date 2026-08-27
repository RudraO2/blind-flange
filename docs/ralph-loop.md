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

**Bound the investigation.** Build's planning step spawns subagents to explore the codebase.
Most of what they would go looking for is already written down — the slot table, the plugin
format, the extension-point map and the installation path are all in
`docs/deepseek-harness-notes.md`, verified from source. Read that first and cap the exploration
at **one** subagent, or none when the story's Code Map is already obvious. Say what you skipped
and why.

## Step 4 — Let build finish its own review

**Do not invoke `bmad-code-review`.** `bmad-build` already runs a review step with the same
layers and its own patch-and-re-verify loop. Running a second review skill on top of it, and
then re-running that, triples the model calls for a third opinion from the same mind — and this
build has a rate limit to respect, not just a deadline.

Read what build's review reported and make sure its patch findings were actually applied. That
is the review.

`bmad-code-review` is for later, run by hand on a change that worries you — not once per story.

## Step 5 — The gate

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

## Step 6 — Commit and push

- Conventional Commits subject. A body only when the *why* is not obvious from the diff.
- Normal English in the message, not compressed.
- Run `git status` first and check nothing unexpected is staged. This folder is inside OneDrive
  and sync churn surfaces files you did not intend to add.
- Never commit model weights, `node_modules/`, the `~/.dsh` profile, or `.env`.
- **Push.** A story that is done and unpushed is not done.

## Step 7 — Update the tracker

Set the story's status to `done` in `_bmad-output/implementation-artifacts/sprint-status.yaml`.
If every story in its epic is now `done`, set the epic to `done` too.

Commit that change with the story, or immediately after it.

## Step 8 — Report and stop

In plain language, short:

- Which story you did
- What now works that did not work before
- What you had to decide that the plan did not record — this is the important line, do not skip it
- Anything that will bite the next story
- Which story is next

Then **stop**. Do not start it. The next story goes in a new chat.

---

## Which model to run a story on

Every subagent runs at the session's model capability — `step-04-review.md` says so outright.
So the session model multiplies across roughly six calls per story, and running all thirty-three
on the largest model exhausts a five-hour window long before it exhausts the backlog.

**Run on Opus** the stories where a wrong judgement is expensive and hard to notice:

| Story | Why |
|---|---|
| 3.1 | The unproven `LlmAdapter` seam, and the fallback call is a real decision |
| 3.5, 3.6 | Router classification and scoring — the design is genuinely open |
| 4.2 | Reading OCR results and deciding whether to escalate |
| 4.5 | Mapping bounding boxes to a rendered region; fiddly and easy to get subtly wrong |
| 5.4 | The `.docx` with its provenance footer and content hash |

**Sonnet is enough** for the rest, and most of the rest is mechanical: `disabled: true` rows in
a patch file, a YAML registry, a favicon and a tab title, a build check that greps for `http`,
the rebrand pass. Switch with `/model`. If a Sonnet session starts flailing, stop it and rerun
that one story on Opus — cheaper than running all of them there by default.

## Running two chats at once

Two lanes are safe. More are not, and the reason is mechanical rather than cautious: one
`~/.dsh/profiles/web/cordis.patch.yml`, one port 3080, one `sprint-status.yaml` and one `main`
branch are all single-copy on this machine.

The lanes come from ADR-0003's hard boundary — the harness orchestrates in Node, Python services
do all the ML behind local HTTP, nothing crosses. That boundary is also a work boundary.

| | Lane A — harness | Lane B — Python |
|---|---|---|
| Stories | Epics 1, 2, 3, 5, 6, 7 in order, plus 4.5 | 4.1 → 4.2 → 4.3 → 4.4 |
| Touches | the plugin packages, the profile, React | the ingestion service and its fixtures only |
| Runs `dsh web` | yes | **never** |
| Takes screenshots | yes | no |
| Writes `sprint-status.yaml` | yes | **never** — reports instead |

Lane B needs nothing from Lane A and can start before Story 1.1 exists. It also contains Story
4.2, the timeboxed proof that OCR returns bounding boxes on this hardware, which is the build's
largest unknown — starting it in parallel from the first hour is the main reason to bother with
two lanes at all.

Story 4.5, the crop viewer, is React. It belongs to Lane A and waits for both lanes.

**When running in a lane, four things change:**

1. **You are told which story to do. Skip Step 2's selection entirely** and use the story you
   were given. Never auto-pick in a lane — two chats picking "the first backlog story" pick the
   same one.
2. **Lane B never starts the application, never takes a screenshot, and never edits
   `sprint-status.yaml`.** It reports the story key and its status in the final message, and
   Lane A or the user records it. One writer for that file.
3. **`git pull --rebase` before every push.** The lanes touch different directories, so this
   stays clean; without it the second push of a pair is rejected.
4. **Stay inside your lane's files.** If the story you were given needs a file belonging to the
   other lane, stop and say so rather than reaching across. That is the signal the two lanes have
   met, and it is a decision for the user, not for you.

## If something is wrong with the plan itself

If the story you picked is wrong, contradicts another story, or the plan has drifted from the
code, do not fix it silently. Say so, and invoke `bmad-correct-course`. Changing the plan is a
decision, and it belongs in writing.
