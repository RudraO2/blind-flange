---
title: 'A workspace file is attached by naming it'
type: 'feature'
created: '2026-08-29'
status: 'done'
route: 'one-shot'
---

# A workspace file is attached by naming it

## Intent

**Problem:** Attaching the inspection report in the demo should look like part of the sentence rather than a trip through a file dialog. Story 8.2 proposed adopting `FSMargoo/dsh-at-file@0.6.3` to add an `@` mention picker to the composer.

**Approach:** The adoption gate ran first and found what nobody had checked: the harness already ships this. `@deepseek-ai/dsh-client-ui-reference` — "Unified Web @file and @session reference source" — is mounted by the `dsh-web-app` bundle at the pinned host `0.1.1-rc.2`, backed by `dsh-file-reference-local`, and typing `@` opens a searchable workspace picker on a stock install. `dsh-at-file` was still installed through the sanctioned profile bundle channel and put through all four gates. It **passed** the licence gate — MIT, zero runtime dependencies, 494 components enumerated and nothing added to the 11 already outside the allow-list, every one of which carries a recorded decision. It **failed** the design gate: `ctx.inputTriggers.registerSource` rejects only a duplicate `(trigger, name)` pair, so a second `@` source does not collide, it coexists — measured live at 25 candidates in one menu with `deliverables` listed twice in two different spellings, this plugin's group headed by the raw source key `at-file` beside the shipped groups' translated titles, and eight hand-authored file-type icon hues beside shipped rows that use none. Story 8.2's own escape hatch covers this exactly, so the plugin was removed and the deliverable became the verification of the shipped surface plus the written record. No code was written and no dependency was added.

## Suggested Review Order

**The decision this story is really made of**

- Why the adoption was declined, and every criterion re-verified against the shipped surface instead.
  [`epics.md` — Story 8.2 Outcome](../planning-artifacts/epics.md)

- The Rejected row, which is the evidence the gate ran rather than an absence.
  [`epics.md` — Rejected on 29 Aug 2026](../planning-artifacts/epics.md)

**What was actually verified, and how**

- What ships the `@` mention, what a mention does and does not carry to the model, and where confinement is genuinely enforced.
  [`profile-install.md` — Story 8.2](../../docs/profile-install.md)

- The picker, both themes, on a cold `DSH_HOME` whose seeded workspace is the repository.
  [`story-8-2-mention-picker-light.png`](../../docs/screenshots/story-8-2-mention-picker-light.png) · [`story-8-2-mention-picker-dark.png`](../../docs/screenshots/story-8-2-mention-picker-dark.png)

- The resolved mention as an inline chip in the draft — the "part of the sentence" the story asked for.
  [`story-8-2-mention-chip-light.png`](../../docs/screenshots/story-8-2-mention-chip-light.png) · [`story-8-2-mention-chip-dark.png`](../../docs/screenshots/story-8-2-mention-chip-dark.png)

**The measurement that argued against doing more**

- The index walk over this checkout, and why the `excludedDirectories` row it suggests was deliberately not written.
  [`profile-install.md` — the index, and why it was left alone](../../docs/profile-install.md)
