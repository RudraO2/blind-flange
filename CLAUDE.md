# Blind Flange — SIH26117

Read `HANDOFF.md` first in any new session. It carries the project brief, the artifact URL,
the file map, and the decisions that are closed and must not be reopened.

`CONTEXT.md` is the shared language. Use its terms in prose, code, commits and UI copy;
don't drift to the synonyms listed under `_Avoid_`.

`docs/licence-policy.md` is a hard constraint, not a preference. Apache-2.0 and MIT only,
across weights, dependencies and the harness. Read it before proposing any dependency.

`videos/sovereign-workbench-explainer` is finished output only. Nothing reads back from it.

## Method: BMAD

**BMAD is the development method for this project, start to end.** BMad Method v6.11.0,
module `bmm`, installed to `_bmad/` with 49 skills in `.claude/skills/`.

The current phase is building the Phase 0 prototype for the IITM BS internal hackathon
round, September 2026, solo.

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

- Git repo initialised 27 Aug 2026, **no commits yet**. First commit is the user's call.
- Domain docs are single-context: `CONTEXT.md` at root, ADRs in `docs/adr/`. Three exist.
- `.scratch/` holds the pre-BMAD Phase 0 spec. Treat it as input, not authority — BMAD's
  own planning artifacts supersede it.
- `_bmad-output/` is BMAD's working output and is gitignored.
- If `bmad-project-context` offers to write an `AGENTS.md` block: fine, but this file
  (`CLAUDE.md`) is what Claude Code auto-loads. Keep them consistent rather than divergent.
- This folder is inside OneDrive. Expect sync churn once `node_modules` and a Python venv
  appear; both are gitignored.
