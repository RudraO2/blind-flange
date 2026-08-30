# ADR-0008 — An attached image goes to the vision model, not to OCR

**Date:** 31 August 2026
**Status:** Accepted
**Supersedes:** Epic 4's ingestion service and Story 4.5's provenance crop viewer, both of
which shipped and worked. They are superseded, not undone.

## Context

Uploading a picture went through a path of our own. A composer control read the file in the
browser, posted it as base64 over a loopback RPC channel, and the host handed it to a Python
service on `127.0.0.1:8642` that ran OCR over it with RapidOCR and answered with lines of
extracted text and the pixel box each was read from. The vision model — `bf-vision`,
Qwen3-VL-2B, running with its 424 MiB projector offloaded to the card — was then handed those
words.

Three things were wrong with that, and they compound.

**The picture never appeared in the conversation.** The upload was session state, not message
state, so a judge who attached a photograph saw a pill reading `Document read` and a
transcript with nothing in it. Every product a judge has used — ChatGPT, Gemini, Claude —
shows the image above the message it was sent with. Ours showed a status label.

**The wrong model was reading it.** OCR throws away everything about a photograph that is not
a word. Asked what was in a picture, the workbench answered with numbered lines of extracted
text, because that is what it had been given. A vision model was loaded, resident, and blind.

**We were carrying a Python service to do it.** Roughly 28 packages, a virtual environment,
a second process to start before a demo, a second port, a warm-up wait, and 466 components in
the licence audit — several of which (`shapely`'s bundled GEOS, `reportlab`'s DarkGarden
fonts) needed their own recorded decisions precisely because they were copyleft.

## What we already had

The harness ships the whole path, and it was mounted in this profile the entire time.

- `@deepseek-ai/dsh-attachment` — a durable attachment seam. It validates and commits an
  image and hands back a serializable `ImageAttachmentRef` that rides on the message as an
  `image` content block.
- `@deepseek-ai/dsh-attachment-local` — content-addressed storage under
  `<DSH_HOME>/attachments/v1/`, with EXIF orientation applied, metadata stripped, and the
  long edge normalised to 2048px.
- `@deepseek-ai/dsh-client-ui-attachment` — the composer's draft thumbnail rail, the
  full-viewport drag-and-drop target, the chat-history image gallery, and the lightbox.

Verified in the running workbench on 31 August 2026: pasting a PNG into the composer produced
a 64px draft card in the rail and the event came back `defaultPrevented`. None of it needed
installing or enabling.

**The only broken link was ours.** `local-provider.js`'s `toChatMessages` flattened every
message to a plain string before serialising it, so an `image` block was dropped on the floor.
The model was never sent the picture the operator could plainly see attached to their own
message.

## Decision

1. **An attached image goes to the vision model as an image.** `attachments/images.js`
   resolves each `ImageBlock` through the host's `ctx.attachments.readImageRequest` and
   `local-provider.js` serialises it as an OpenAI `image_url` part **on the message that
   carried it** — not collected onto the last user message, which detaches a picture from its
   message the moment a follow-up is asked.
2. **The OCR service is deleted.** `services/ingestion/`, `findings/`, `upload/rpc.js`, the
   provenance route, the `bf_report_findings` tool, the Provenance tab, and the
   `npm run ingestion` / `setup-ingestion` scripts all go.
3. **PDFs are no longer accepted.** The composer offers PNG, JPEG, WebP and GIF, which is
   exactly the harness's version-one image contract. Nothing left in the workbench can read a
   PDF, so offering one would put the refusal after the file picker instead of inside it.
4. **The approval note survives without its bounding boxes.** It keeps its audit trail — task
   type, every member's score, the model that answered, the tools in order — and cites clause
   text and an equipment tag. A clause with no tag now carries no source line at all, rather
   than one reading `page undefined`.
5. **The attach control hands the file to the harness's own draft.** It synthesises the
   `paste` event the harness is already listening for, rather than opening a second path into
   attachment handling. Same choice `typeIntoComposer` makes for slash commands.

## Consequences

**Provenance-to-a-pixel-box is gone, and that was a real claim.** CONTEXT.md defined
provenance as "page *and region*, never just a filename", and Story 4.5 built a tab that cut
the crop out of the page a finding was read from. Nothing replaces it: a model cannot give a
bounding box that can be checked, which is exactly why OCR was chosen for it. What replaces it
in the transcript is weaker but honest — the image itself, against the message that carried
it, with a lightbox for the original. The evidence a reader wanted from that tab is now beside
the claim rather than in a tab of its own.

**The document lane is no longer scored.** `npm run evaluate` graded five questions about a
scanned inspection report against ground truth written by hand. There is no extracted text to
grade any more, and scoring the vision lane needs its own fixtures — photographs with the
answer written down beside them — which do not exist. The coding lane still scores. Reporting
a stale document number would be worse than reporting none.

**One fewer process, one fewer port, 33 fewer components.** The licence audit went from 493
components to 460, and four recorded copyleft decisions (`shapely`, `certifi`, `tqdm`, the
DarkGarden fonts) went with the service that needed them. `run.bat` starts two things instead
of three and the OCR warm-up wait is gone from the demo.

**The image budget is a measured number, not an arithmetic one.** The first version of
`IMAGE_REQUEST_POLICY` allowed one megapixel, reasoning that Qwen3-VL bills about one token
per 28×28 patch. Sent through the real runtime it returned:

```
llama-swap returned 400 for "bf-vision": request (8510 tokens) exceeds the
available context size (8192 tokens)
```

The estimate was optimistic and, more importantly, it costed the image alone — an image never
arrives alone, it rides a conversation that already has turns in it. The budget is 640×640,
which reads a nameplate on a 2B model and leaves room for the session around it. Raising
`--ctx-size` on `bf-vision` is the other half of that trade and is a llama-swap config change,
not a change in this repository; it costs KV-cache VRAM on a card with about 3.7 GB free.

**Two replay entries were rewritten.** The authored cache called `bf_report_findings` in its
"key findings" and "approval note" flows. A cached entry naming a tool the harness no longer
registers fails at dispatch, which would have broken the `replay` escape hatch silently —
the one thing that escape hatch has to be true of. `test/model-plane.test.js` now asserts that
no replay entry names a tool this build does not register.

**`egress/escaped` and the OCR vocabulary stay where they are recorded.** Sessions captured
before today still open and still read correctly; nothing in this decision rewrites history
that has already been written down.

## Addendum, same day — the router had to learn about the image

Removing OCR exposed a second defect, in a file this change was not meant to touch.

`classifyRequest` decided from the request's words alone. That was defensible while every
attachment was OCR'd to text — the words were all there was. With a picture going to the vision
member as a picture, the classifier was making a keyword guess about something it could have
simply been told, and `score.js` already had the matching gate on the far side
(`requires: { modality: "image" }`) with nothing on the near side to feed it.

Two more things were measured on 31 August 2026 and neither was theoretical:

**"Open WhatsApp and check the vendor thread" matched no rule.** It fell back to `document`,
went to the vision member, and was answered conversationally — "I can't directly open WhatsApp
… I'm an AI assistant". No tool call, so `tools/pre-execute` never ran, so the egress waterfall
never saw it. The single request this product's sovereignty beat is built around was not
reaching the seal at all. ADR-0007 widened the policy to catch launcher shapes; this is the
turn before that, and it was never arriving.

**"Run a shell command in the sandbox that opens https://…" also matched no rule.** The `code`
rules' `api-or-cli` pattern only ever matched the literal phrases "cli command" and
"command-line tool".

So: an attached image confines the result to the two types the vision member serves; the `code`
rules gained `shell` and `command-noun`; `calculation` gained `arithmetic-verb` and `how-many`;
and the no-rule fallback moved from `document` to `code`, which is the lane that builds a tool
call.

**A scored `action-verb` rule was tried and reverted within the hour.** `run|open|launch|execute`
as a point of `code` put "open the report" and "run through the findings" at 1-1 against
`document`, and `code` leads `TASK_TYPE_PRIORITY`, so both lost the tie and routed to the coder.
"open the drawing" was the one that settled it — it sent a question about a picture away from
the only member that can see one. Those verbs are ordinary English and too weak to be worth a
point; the case they were added for needs no rule, because the fallback is now `code`. The
attempt is kept as a test rather than as a memory.

**This closes Problem 1 of `docs/router-handoff.md`** — its three recorded misroutes, which it
calls the largest hole in the demo, now all reach the coder. The regex classifier is less wrong,
not right, and the model-based classifier that handoff proposes is still the better answer.
