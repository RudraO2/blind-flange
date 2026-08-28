---
title: 'The agent turns a scanned report into key findings'
type: 'feature'
created: '2026-08-28'
status: 'done'
route: 'one-shot'
---

# The agent turns a scanned report into key findings

## Intent

**Problem:** The workbench had no path from an ingested report to an agent-produced answer — the model plane could only reply with authored text, never call a real tool, so there was no way for a run to end in findings with provenance rather than a conversation about findings.

**Approach:** Extended the replay model plane (Story 3.1) to support multi-step scripted turns that include real tool-call blocks, added a real tool (`bf_report_findings`) that reads the ingestion service's captured OCR output for the sample report (Epic 4), and authored a replay entry that drives `create_goal` → `bf_report_findings` → `update_goal` through the harness's own shipped GoalBar — no plan panel was built, per the epic's explicit instruction.

## Suggested Review Order

**Multi-step replay + tool-call streaming (the seam that makes a real tool call possible)**

- Entry point: how the provider tells two calls into the same scripted turn apart from a fresh one.
  [`replay-provider.js:72`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-provider.js#L72)

- The bug this caught: the harness appends context-injection messages as `role:"user"` AFTER the human's own message, so a naive "last user message" scan picks the wrong one. Fixed to require `source.kind` be absent or `"user"`.
  [`replay-provider.js:60`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-provider.js#L60)

- Authored replay can't know a runtime-generated goal id ahead of time; `$GOAL_ID`/`$GOAL_REVISION` placeholders are resolved from the real tool result in message history.
  [`replay-provider.js:108`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-provider.js#L108)

- Translates a mixed text/tool-call piece stream into the harness's `StreamChunk` vocabulary, closing the open text block before a tool-call block and reopening after, per the `packages/llm/llm/src/types.ts` contract.
  [`llm-adapter.js:79`](../../plugins/dsh-client-ui-base/lib/model-plane/llm-adapter.js#L79)

**The real tool call**

- `bf_report_findings`: a genuine file read of the ingestion service's captured output, dispatched through the ordinary tool registry — not fabricated data (see the module doc comment for why it reads a capture rather than calling the live service).
  [`findings/tool.js:74`](../../plugins/dsh-client-ui-base/lib/findings/tool.js#L74)

- Registered unconditionally, like the canary, so every preset's agent has it without a per-preset `cordis.patch.yml` row.
  [`index.js:297`](../../plugins/dsh-client-ui-base/lib/index.js#L297)

**The scripted turn**

- The authored entry: `create_goal` → `bf_report_findings` → key-findings text with real page/bbox citations + `update_goal` → closing reply.
  [`replay-cache.json:12`](../../plugins/dsh-client-ui-base/lib/model-plane/replay-cache.json#L12)

**Provenance data**

- The captured findings fixture — the literal response the real ingestion service returned for the real fixture PDF on 28 Aug 2026, not authored.
  [`findings/sample-report-findings.json`](../../plugins/dsh-client-ui-base/lib/findings/sample-report-findings.json)

**Tests**

- End-to-end proof against the actual shipped replay entry, dispatching the real `bf_report_findings` tool.
  [`model-plane.test.js`](../../plugins/dsh-client-ui-base/test/model-plane.test.js)

- The regression test for the context-injection trigger bug, written against a real captured session-log message shape.
  [`model-plane.test.js`](../../plugins/dsh-client-ui-base/test/model-plane.test.js)

- Tool definition and fixture-read coverage.
  [`findings.test.js`](../../plugins/dsh-client-ui-base/test/findings.test.js)
