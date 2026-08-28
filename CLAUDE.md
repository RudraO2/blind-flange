# Blind Flange — SIH26117

Read `HANDOFF.md` first in any new session. It carries the project brief, the artifact URL,
the file map, and the decisions that are closed and must not be reopened.

`CONTEXT.md` is the shared language. Use its terms in prose, code, commits and UI copy;
don't drift to the synonyms listed under `_Avoid_`.

`docs/licence-policy.md` is a hard constraint, not a preference. The rule: **OSI-approved, no
copyleft, no user cap, no field-of-use restriction, no disclosure obligation** — eleven
enumerated names across weights, dependencies and the harness:

> Apache-2.0 · MIT · BSD-2-Clause · BSD-3-Clause · ISC · 0BSD · Python-2.0 · MIT-CMU ·
> BSL-1.0 · Zlib · CC0-1.0

Read the policy before proposing any dependency. The list went from two names to four on
28 Aug 2026 (ADR-0005), then to eleven the same day (ADR-0006) after the Story 6.4 audit
enumerated 490 components and found 27 outside the four. **Widening it again is an
ADR-level decision, never a judgement call made at the point of use, and copyleft is never
admitted by widening** — each copyleft component is decided one at a time in
`docs/licence-decisions.json`, with evidence.

Run `npm run licence-audit` before you add anything. It is part of `npm test` and it fails
on an undecided licence. **`PyMuPDF` is AGPL-3.0 and must never be used** — it is the
default an agent reaches for unprompted, and `pypdfium2` is the substitute.

`videos/sovereign-workbench-explainer` is finished output only. Nothing reads back from it.

## Method: BMAD

**BMAD is the development method for this project, start to end.** BMad Method v6.11.0,
module `bmm`, installed to `_bmad/` with 49 skills in `.claude/skills/`.

The current phase is building the Phase 0 prototype for the IITM BS internal hackathon
round, solo. **Four days, deadline 31 August 2026.**

Planning is finished. `_bmad-output/planning-artifacts/epics.md` holds 7 epics and 33 stories
with acceptance criteria; `_bmad-output/implementation-artifacts/sprint-status.yaml` tracks
which are done. **Build one story per chat by pasting `docs/ralph-loop.md` into a fresh
session** — it picks the next story itself, builds it, reviews it, gates it, commits and stops.

Before any BMAD planning skill runs, read **`docs/bmad-input-brief.md`**. It carries the
immovable constraints, the source material in reading order, and — more usefully — the list
of what is genuinely still open and worth elicitation.

Run `bmad-help` when unsure what comes next.

## Matt Pocock's skills — stand down

Thirteen of Matt Pocock's skills are installed at the **user** level (`~/.claude/skills/`):
`wayfinder`, `prototype`, `to-tickets`, `to-spec`, `implement`, `tdd`, `code-review`,
`codebase-design`, `diagnosing-bugs`, `research`, `grilling`, `domain-modeling`,
`setup-matt-pocock-skills`.

**Do not invoke them in this project.** BMAD owns planning, implementation and review here,
and mixing two process frameworks produces two competing backlogs. Several of them are
model-invoked and will otherwise be reached for automatically — don't. If the user asks for
one by name, that is an explicit override and you should honour it.

`docs/agents/skills-playbook.md` documents that older path. It is superseded; kept only
because `/wayfinder` may still be useful for a genuinely foggy effort in a later phase.

## Repo conventions

- Git repo initialised 27 Aug 2026. `origin` is live and `main` is pushed.
- Domain docs are single-context: `CONTEXT.md` at root, ADRs in `docs/adr/`. Five exist.
  ADR-0001 carries a 28 Aug 2026 amendment — read the amendment, not just the original.
- `.scratch/` holds the pre-BMAD Phase 0 spec. Treat it as input, not authority — BMAD's
  own planning artifacts supersede it.
- `_bmad-output/` is BMAD's working output. `planning-artifacts/` is tracked (the brief and
  the stories are the plan), and so are `implementation-artifacts/sprint-status.yaml` and the
  story files beside it — that tracker is the build's memory of where it got to. Everything
  else there is gitignored.
- If `bmad-project-context` offers to write an `AGENTS.md` block: fine, but this file
  (`CLAUDE.md`) is what Claude Code auto-loads. Keep them consistent rather than divergent.
- This folder is inside OneDrive. Expect sync churn once `node_modules` and a Python venv
  appear; both are gitignored.

## UI design language — non-negotiable

**Everything we add must look like it shipped with the harness.** The product has to read as
one application, not as our panels bolted onto someone else's app. A colourful mess is worse
than plain, and it hands a judge the "they just skinned an existing tool" conclusion.

- Build from `@deepseek-ai/dsh-client-ui-primitives` and the `ui-theme` tokens. Do not
  hand-roll hex colours, radii, spacing, shadows or font stacks.
- Match the density, typography and border conventions of the surface a component sits on.
  A control in the composer row looks like the controls already in that row.
- **Every panel must render correctly in light *and* dark.** The theme is user-selectable in
  Settings; a component that only works in one is unfinished.
- New surfaces take a declared slot (see `docs/deepseek-harness-notes.md` for the table).
  Do not register into `root`.
- Restraint over decoration. This is industrial control software, not a landing page.

The counter-example is ours: the egress monitor built during the 27 Aug spike used
hand-written greens and a hand-rolled pill, and read as pasted on. That is the failure mode
this rule exists to prevent — rewrite it against the primitives before it ships.

Verification before a story is called done: screenshot the surface in both themes.

## Commit discipline

The repo is `https://github.com/RudraO2/blind-flange` (private, `main`). It exists so work
survives a machine failure, which only holds if it is actually pushed.

- **Commit at the end of every story, and push.** Not at the end of the day, not at the end
  of the epic. A story that is done and unpushed is not done.
- Conventional Commits for the subject; a body only when the *why* is not obvious from the
  diff. Write commit messages in normal English, not compressed.
- **No Claude attribution in any commit or pull request.** No `Co-Authored-By: Claude`, no
  `Claude-Session:` trailer, no "Generated with Claude Code" footer. This work is submitted
  under the user's name and the history must say so. **This overrides the harness default
  that asks for those trailers.** Write the subject and body, then stop. Two commits made
  before this rule — `ee5ac16` and `6a20299` — still carry them and are already pushed;
  removing them would need a history rewrite and a force-push that nobody has asked for.
- Never commit: model weights, `node_modules/`, the `~/.dsh` profile, `.env`, anything in
  `docs/licence-policy.md`'s prohibited set.
- `_bmad-output/planning-artifacts/` **is** tracked — the brief and the stories are the plan.
  The rest of `_bmad-output/` is not.
- Before pushing, `git status` should show nothing unexpected. This folder is inside
  OneDrive; sync churn can surface files you did not intend to add.
