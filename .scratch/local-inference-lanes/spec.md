# Spec: the coding and document lanes run on real local models

Status: ready-for-agent
Branch: `feat/local-inference-lanes`
Map: [map.md](map.md) — read the Notes block before starting
Written: 30 August 2026

## Problem Statement

Blind Flange looks like a working sovereign AI workbench and is not one yet. Every token it
appears to generate comes from `replay-cache.json`, a file authored by hand. The routing chip
shows a model being selected, the egress monitor shows a counted zero, the approval note comes
out as a real signed `.docx` — and behind all of it no model has ever run.

A panel of judges will ask whether it is live. Today the honest answer is no, and the product
brief's cut line says so in writing.

Three specific gaps sit behind that:

- **`LocalModelProvider` throws.** It is six lines whose body raises "a day-4 stretch goal".
- **The router decides nothing.** `classifyAndRoute` appends a `router/routed` event carrying a
  `selected` model name, and nothing reads it. Every session is pinned to
  `provider: replay, model: replay-authored-v1`. The model changing "by itself" is true of the
  chip, not of the inference path.
- **Ingestion is never called.** The RapidOCR service works, reads the fixture at 0.997
  confidence, and returns per-line bounding boxes — and the harness reads a *captured* JSON
  response instead. Hand the workbench a document it has not seen and it answers about a
  different one.

A judge cannot see explainability either. The classifier's working is visible; nothing shows
which model actually answered, what it was asked to do, which tools it ran, or what it read each
claim from. And nothing measures whether the answers are right.

## Solution

The `code` and `document` lanes answer for real, on this machine's GPU, with two open-weight
models under Apache-2.0 licences, swapped in and out of 4 GB of VRAM by llama-swap.

A judge drops a scanned document onto the composer. It is read on the CPU in a few seconds while
the vision-document model loads on the GPU behind that work. The model extracts the findings and
drafts an approval note, and the `.docx` that lands carries its own audit trail: every claim next
to the page and region it was read from, and a closing section naming the task type, the
classifier's scores, the model that answered, the tools that ran and how long each took. Ask it
for code instead and the routing chip changes member, llama-swap evicts the vision model and
loads the coder, the coder writes a script *and an assertion*, the sandbox runs both, and the
printed pass is the verification.

Beside that, a small evaluation table: five fixtures per lane, right or wrong, and the wall-clock
cost.

The replay provider stays exactly where it is. Switching back is one line of YAML, which is what
makes attempting live inference on a deadline a reasonable thing to do.

## Seams

**Confirm these before building.** Two seams, one of them already exists.

1. **`ModelProvider.answer(request)` — widened, not replaced.** The existing seam, already
   covered by `model-plane.test.js`. The request object grows `model`, `tools` and `images`;
   `replay` ignores the new fields and its tests keep passing. Everything about local inference
   is testable here: feed a request, assert the yielded pieces. The SSE parsing is testable
   below it against a stub HTTP server, without llama-swap or a GPU present.

2. **The `router/routed` session event — read, never written.** The seam with the teammate.
   Our dispatch reads the event's `selected` field and resolves it to a runtime model id through
   the fleet registry. Testable by appending a synthetic event and asserting which model id came
   out. **No new seam is introduced in the router itself, and no line of `classify.js` or
   `score.js` is touched.**

Everything else rides existing seams: the ingestion service's HTTP contract, the
`bf_report_findings` and `bf_approval_note` tool interfaces, the `webServer` route registration,
and the slot registration for UI surfaces.

## User Stories

1. As a judge, I want to ask the workbench a coding question and get an answer generated on this
   machine, so that "sovereign" is something I watched rather than something I was told.
2. As a judge, I want to see which model answered my question, so that I can tell the routing
   apart from a label that changes colour.
3. As a judge, I want to watch the model change when I change the kind of work I am asking for,
   so that automatic selection is demonstrated and not asserted.
4. As a judge, I want to see why that model was chosen, in scores rather than prose, so that the
   decision is auditable.
5. As a judge, I want to see which models are currently in the GPU's memory and which was just
   evicted, so that I understand a 4 GB card is being managed rather than pretended away.
6. As a judge, I want to drop a scanned document of my own onto the workbench, so that I am not
   watching a rehearsed path over a file they prepared.
7. As a judge, I want the document to start being read the moment I drop it, so that I am not
   hunting for a second button.
8. As a judge, I want to see the reading progress, so that a pause reads as work rather than a
   hang.
9. As a judge, I want each extracted finding to show the region of the page it was read from, so
   that I can check a claim against the source without trusting a filename.
10. As a judge, I want the approval note to arrive as a Word file I can take away, so that the
    output is a deliverable rather than a chat reply.
11. As a judge, I want that Word file to contain the reasoning that produced it, so that the
    evidence survives leaving the room.
12. As a judge, I want a coding task to be run and verified rather than just written, so that
    "verified in a sandbox" is a demonstrated claim.
13. As a judge, I want to see the assertion the model wrote and its result, so that verification
    is something I can read.
14. As a judge, I want to see a failing case too, so that I know the pass was not hardcoded.
15. As a judge, I want the egress monitor to stay at a counted zero throughout, so that going
    local did not quietly open a network path.
16. As MRPL's IT, I want every model's licence named and enforced at load time, so that a fleet
    member with unacceptable terms cannot be used by accident.
17. As MRPL's IT, I want a model with a research-only licence to be refused out loud, so that
    the gate is proven rather than described.
18. As MRPL's IT, I want the inference runtime to be a binary I can inspect and a config file I
    can read, so that deployment does not depend on understanding someone's code.
19. As MRPL's IT, I want no component in the stack to carry a field-of-use restriction, so that
    a legal review does not stall.
20. As the developer, I want the model plane to remain one interface with providers behind it, so
    that ADR-0001's claim survives its first real use.
21. As the developer, I want to switch back to the replay provider with one line of
    configuration, so that a demo is never one OOM away from nothing.
22. As the developer, I want the local provider to fail loudly and legibly when llama-swap is not
    running, so that a missing service is not mistaken for a broken model.
23. As the developer, I want an out-of-memory failure surfaced as an error rather than a hang, so
    that the failure mode on stage is a message and not a frozen screen.
24. As the developer, I want a small model's tool calls constrained to a schema, so that a 1.5B
    model cannot break the agent loop with malformed JSON.
25. As the developer, I want the model that a request is dispatched to resolved from the routing
    decision already on the session log, so that my work does not collide with a teammate
    rewriting the router tomorrow.
26. As the developer, I want the fleet registry to declare the runtime identity of each member,
    so that adding a model is a registry edit and not a code change.
27. As the developer, I want the live ingestion service called over its existing HTTP contract,
    so that the OCR work already built and proven is used rather than reimplemented.
28. As the developer, I want provenance crops to work for a file that was never pre-rendered, so
    that upload is genuinely open rather than a fixture in disguise.
29. As the developer, I want an evaluation I can run with one command, so that "it works" has a
    number behind it.
30. As the developer, I want latency measured per stage, so that a slow demo can be diagnosed
    rather than guessed at.
31. As the developer, I want every new surface to render in light and dark, so that a theme
    switch does not reveal the panels as bolted on.
32. As a teammate arriving tomorrow, I want the boundary between routing and execution written
    down, so that I can build the router without reading the execution code.
33. As a teammate arriving tomorrow, I want a commented slot in the llama-swap config showing
    where a router model goes and why it belongs on the CPU, so that I do not take the VRAM the
    lanes need.

## Implementation Decisions

### The model plane

**Widen the `ModelProvider` request object.** It carries `messages` today and drops everything
else the harness supplies. It gains: the **model id** to dispatch to, the **tool schemas**
available for this call, and **image content** where a lane supplies one. `replay` ignores every
new field. This is deliberately a widening of the one interface rather than a second interface
for `local` — ADR-0001's claim is that everything behind the seam is a swap and never a rewrite,
and a parallel interface would break that claim on its first real use. **This warrants an ADR**:
it is hard to reverse, and a future reader will ask why the seam carries fields replay never
reads.

**`LocalModelProvider` speaks HTTP to llama-swap over loopback**, at llama-swap's
OpenAI-compatible chat completions path, with the model id in the request body. This mirrors the
pattern the ingestion service already establishes — a local service on a loopback port, reached
by `fetch` — and it sidesteps the plugin's `link:`-mount problem entirely, since no bare
specifier has to resolve.

**The SSE parser is the risky part and is specified from llama-swap's own client.** It must
tolerate: `data: `-prefixed lines, a `[DONE]` sentinel, text arriving in the delta's content
field, reasoning text under either of two field spellings, chunks carrying neither, partial lines
split across reads, and **SSE comment lines beginning with a colon**. That last one is a ping
llama.cpp emits during a long prefill — precisely when a brittle parser fails and precisely the
moment it would be blamed on the model.

**Tool calls are driven by a JSON schema, not by native tool calling.** This reverses the
research's recommendation, on measurement. Native tool calling **does not work** with the 1.5B on
this build: the model sees the tools and names them correctly, but wraps the call in a fenced
JSON block rather than the tag its own chat template specifies, so the server returns it as prose
with no structured tool call. Setting tool choice to required did not force the grammar, and
neither did naming the function explicitly.

Constraining the response to a JSON schema instead works first time, is **seven times faster**
(0.91s against 6.98s), and does not depend on llama.cpp recognising a chat template as
tool-capable. So a lane asks the model for a schema-shaped object and **our code constructs the
tool call from it**. The model chooses content, the lane chooses the tool. That is a narrower
contract than free-form tool calling and a 1.5B meets it reliably.

Consequence for the adapter: tool-call arguments no longer arrive as streamed fragments, so the
existing "a replayed call is never fragmentary" assumption still holds and the tool-call block
assembly does not need reworking. The streaming path only has to handle text.

**The coding lane asks for Python, and our code decides the verdict.** Measured over nine
attempts per language (ticket 08): PowerShell produced **runnable code zero times out of nine**,
in four distinct failure modes; Python produced runnable, correct code six times out of nine.
`tool-pwsh` remains the executor — `dsh-bash-sandbox` never loads on win32 — the command simply
invokes the interpreter, which is already a dependency through the ingestion service.

Of Python's six successes, three printed the computed value and ignored the instruction to print
a verdict. So **the model prints the value and the lane compares it against the fixture's
expected value.** The model computes; the harness asserts. Asking a 1.5B to do both fails on the
formatting for answers that were right.

This also closes a trap in the evaluation harness: a check of the form "the output contains PASS"
reported success during bring-up for a command the shell never evaluated — it printed the literal
text `5050 -eq 5050 ? PASS : FAIL` and the substring matched. **Never grep for the verdict.**
Compare a computed value against a known one.

Expect retries and show them. Even in Python this model sometimes emits a broken program. Feeding
the interpreter's error back is what the harness's agent loop already does, and it is the
"iterate on a task instead of answering once" the problem statement asks for — a visible attempt
one failing and attempt two passing is a stronger beat than a first-time success.

**Raise the reply ceiling.** A third of the PowerShell failures were the *schema output itself*
truncating mid-string because the model rambled past a 300-token limit. That is a defect in our
request, not in the model.

**Errors are surfaced, never swallowed.** llama-swap unreachable, a model failing to load, and
an out-of-memory condition are three distinguishable messages, each reaching the user as a
finish-with-error rather than a hang or a silent empty answer.

### Dispatch, and the seam with the teammate

**Dispatch reads the routing decision from the session log.** The `router/routed` event already
carries `selected`. That name is resolved to a runtime model id through the fleet registry, and
the id goes into the widened request. Nothing writes to the router, and **`classify.js` and
`score.js` are not modified on this branch** — a teammate is rewriting them tomorrow without
coordination, and a merge conflict in those two files is the single most expensive thing that
could happen.

**The registry gains a runtime identity per member**, so a fleet member's model id in
llama-swap's config is declared data rather than a mapping in code. The registry's parser already
accepts unknown keys, so this costs nothing at the parse layer; the adapter's model-list mapping
needs the new field only if the UI should show it.

**The four task types collapse onto two members with no router change.** The drawing lane is
already forced to the vision member by the existing modality gate. The calculation lane goes to
the coder, because a calculation with steps shown is a script that prints its working — which is
what the problem statement asks for and what the sandbox already executes for real.

### The fleet

**Replace the three fp16 7B entries with two members that physically run**, both Apache-2.0:
a 1.5B coder (text-only) and a 2B vision-document model. Sizes, revisions, quantisation and
provenance are recorded in the map's research notes; take both from the vendor's own GGUF
repositories and **not** from the community re-uploads, two of which declare no licence at all.

**Add a second deliberate refusal case:** the 3B coder from the same family, which is the one
non-Apache member of it. That is a sharper proof of the gate than the existing one, because it is
the size an engineer reaches for when 1.5B feels small.

The coder being text-only is load-bearing rather than incidental: it makes the existing modality
exclusion a real reason on the routing chip instead of a decorative one.

### The runtime

**llama-swap drives llama-server; we build no residency manager.** One model at a time is
llama-swap's default behaviour with no routing configuration at all, so the residency policy is
an absence rather than a subsystem. Eviction, load-on-demand and residency reporting are the
tool's job; ours is to read what it reports.

**Take the Vulkan build of llama.cpp, not the CUDA one.** This is a licence decision, not a
performance one: the CUDA build requires three separately-packaged NVIDIA redistributables whose
EULA is not OSI-approved and carries a field-of-use restriction, which fails the licence policy
on two counts and cannot be admitted by ADR. The Vulkan archive is otherwise identical, including
the vision path. **The performance consequence is unmeasured** and is the first thing to check.

**Set context size and GPU layer count explicitly.** llama-server's fitting behaviour is on by
default with a per-device margin larger than a third of this card, and will silently rewrite
either value if left unset.

**The config carries a commented third entry** showing where a router model goes and that it
belongs on the CPU, so tomorrow's teammate can see the slot without being told.

### The document lane

**The lane feeds the model OCR text, not the page image.** The vision member is used as a text
model for this lane. This is both an accuracy decision — the OCR engine reads the fixture at
0.997 and was chosen over Tesseract precisely because it gets reference numbers and equipment
tags exactly right — and the reason the lane can be fast, since no image content means no vision
encoding is performed at all. The vision path stays available for the drawing lane.

**Wire the live ingestion service.** The findings tool currently reads a captured response; it
gains a live call over the service's existing HTTP contract, keeping the capture as the fallback
when the service is not running. The tool's interface does not change, so the agent, the findings
table and the provenance route all keep working.

**Ingestion latency is already measured and the changes are known.** Render at 200 dpi rather than
300 — the OCR engine caps its own working image at 2000px, so 300 dpi rasterises pixels it then
discards, and every equipment tag and reference number survives the drop. Turn the angle
classifier off: it costs ~5% for byte-identical output and it detects a 180° rotation a scanned
report does not have. **Leave batch size and thread count alone** — both measured worse, because
the runtime already saturates six cores.

The largest win is not a tuning knob: **pre-warm the OCR engine at service startup** with a
throwaway page at the production render size. The runtime re-optimises per input shape, and that
shape-specialisation cost is multiple seconds charged to whoever makes the first request. Emit
findings per page so the first ones land at ~3.4s rather than ~6.7s.

**For the evaluation harness:** match on extracted fields, not whole lines. At 200 dpi three lines
differ from the committed capture in whitespace or punctuation around a separator, while every tag
and reference number is byte-identical — a naive line-level exact match would score those wrong.

### Upload

**A real upload control in the composer's tool row**, built from the harness's UI primitives and
rendering correctly in both themes. It rides the attachment service the profile already depends
on and cannot disable.

**Upload ingests immediately**, with progress visible. This removes a step from a timed demo, and
the CPU-bound OCR pass is the window llama-swap needs to load the model — the swap latency is
paid inside work the user can see progressing.

**Provenance must work for a file that was never pre-rendered.** The current route serves two
page images generated ahead of time for the shipped fixture. An uploaded file needs its pages
rendered on demand and cached per upload. This is the largest single piece of work in the spec
and the most likely thing to slip; the fixture path continues to work if it does.

### Explainability

**The deliverable carries its own audit trail.** The approval note gains, alongside the existing
per-clause page and region: the task type and the classifier's scores, the model that answered
and why it was selected, the tools that ran in order, and per-stage timings. A judge who takes
the file away keeps the evidence.

**One live surface, not three.** A single panel in a declared slot shows the execution trace for
the current turn and the residency state read from llama-swap. The routing half needs no new
work — the chip already receives the entire routing decision including every score, every
capability breakdown and every exclusion reason.

### Evaluation

**One command, five fixtures per lane, one table.** The coding lane's metric is that the value the
sandbox printed equals the fixture's expected value — asserted by the harness, never by grepping
the output for a verdict word. Report the attempt count too, since retries are expected and a
task solved on the second attempt is a different result from one solved on the first. The
document lane's metric is
field-level exact match against a hand-written ground truth for known fields — reference number,
equipment tags, dates. Both lanes report wall-clock latency, and the document lane reports the
OCR and generation stages separately. No model-judges-model pass: that is a second inference on a
card with no room for one.

### The egress seal has to learn a second language

`NETWORK_PWSH_PATTERN` inspects a sandbox call's command text for PowerShell network cmdlets. It
knows nothing about Python. **The moment the coding lane runs Python, a program calling
`urllib.request`, `socket`, `http.client`, `ftplib` or `smtplib` walks straight past the seal
while the egress monitor keeps reading a counted zero.**

That is a hole in the one claim the whole product rests on, opened by our own change, and it is
reachable by any judge who types a prompt at the sandbox. **It must be closed in the same commit
that switches the lane to Python**, with a test that fails if a Python network call is permitted —
the same shape as the existing `pwsh` denial test, which is prior art for exactly this.

The underlying limitation is unchanged and already declared: deny-by-pattern on command text is
evadable by a determined script, and Phase 0 accepts that in writing. What it cannot be is silent
about an entire language.

### Licence compliance

`npm run licence-audit` is part of `npm test` and fails on an undecided licence. In the same
commit as the registry edit: the new fleet rows with an honest `licence_source` for each (one has
a real licence file, one has only model-card metadata at a pinned revision and must say so), a
recorded decision with evidence for the refused member, a bundled-component entry for the OpenMP
runtime that ships inside every llama.cpp Windows build with its licence text copied into the
evidence directory, and **an update to the loader test, which asserts the exact fleet list and
refusal count and will otherwise fail the build**. While there, assert the second refusal by name
so the new case is held by a test rather than only declared.

### The escape hatch

Timebox the runtime bring-up to an hour fixed in advance. If llama-server is not answering a real
prompt through the provider by then, the profile switches back to replay and everything else in
this spec still ships — the lane pipelines, the upload control, the in-output explainability and
the evaluation table are all independent of which provider answered.

## Testing Decisions

A good test here asserts what a caller can observe and nothing about how it was reached. It must
not require a GPU, llama-swap, a downloaded model, or a network. The runner is Node's built-in
test runner with no framework, matching the sixteen existing test files.

**Tested at the `ModelProvider` seam**, extending `model-plane.test.js`, which already covers the
provider factory, the two throwing stubs and the adapter's chunk translation:

- The widened request carries the model id, tool schemas and image content through, and `replay`
  ignores all three without behaviour change. The existing replay assertions are the regression
  net for that.
- The SSE parser, against a stub loopback HTTP server that replays recorded byte sequences:
  well-formed text deltas; a `[DONE]` sentinel; both reasoning field spellings; chunks with
  neither field; **a line split across two reads**; **a comment line beginning with a colon**; a
  tool call arriving as several argument fragments that must concatenate into valid JSON. Capture
  the byte sequences from the real server during bring-up so the fixtures are recorded rather
  than imagined — the same discipline the replay cache's message-shape documentation used.
- Each failure mode produces its own distinguishable error: service unreachable, model failed to
  load, out of memory.

**Tested at the routing-decision seam**, extending `index.test.js`, which already covers the
router wiring and the egress waterfall: a synthetic `router/routed` event resolves to the
expected runtime model id; an unknown member name and a null selection both degrade to something
legible rather than throwing into the agent loop.

**Registry and loader**, extending `registry.test.js` and `loader.test.js`: the new members parse
with their runtime identity; the new refused member is refused **by name**; the loaded list is
asserted exactly, as it is today.

**Ingestion**, extending `findings.test.js`: the live call is attempted and its response mapped
to the existing findings shape; the captured response is used when the service is unreachable.
The Python service's own tests already cover the OCR contract and are not duplicated here.

**Deliverables**, extending `deliverables.test.js` and `docx.test.js`: the audit-trail section
appears with the routing, model, tool and timing fields populated, and the document still parses
with an unrelated OOXML parser. That independent-parser check is prior art from the existing
approval-note verification and is what makes the claim credible.

**UI**, extending `client.test.js`: the upload control and the trace panel register into their
declared slots at the expected priority, and the residency view renders each reported state
including the empty case. Verification before either is called done is a screenshot in both
themes, per the repo's UI rule.

**Evaluation** is a script, not a unit under test. Its own correctness is checked by a fixture
whose expected answer is known to be wrong, proving the harness can fail.

## Out of Scope

- **Rewriting the router.** A teammate owns classification and scoring. Zero lines of those two
  files change on this branch.
- **Building a residency manager, VRAM accounting, or an eviction policy.** llama-swap owns all
  three.
- **MoE with expert offload.** Not possible in 15.4 GB of system RAM; the smallest useful MoE
  coder needs roughly 17 GB resident. The slide claiming otherwise needs correcting, which is a
  separate effort.
- **The drawing lane.** It classifies and routes correctly today by the modality gate. Actually
  sending a P&ID as an image, and what the vision encoder costs, is unexamined and stays that way
  unless the two named lanes finish early.
- **Full connectivity-graph extraction from a P&ID.** Already past the cut line.
- **Fine-tuning, a custom inference engine, a 120B-class model.** Already past the cut line.
- **Model-judges-model evaluation.**
- **Multi-user, RBAC, concurrency.** Single machine, single session.
- **Enumerating llama-swap's statically linked Go modules.** Needed before the licence claim is
  honestly complete, tracked in the map's fog, not a blocker tonight.
- **Re-recording the offline demo video.** Two deferred items already say the footage is stale in
  appearance; one pass covers them after this lands.

## Further Notes

**The deadline is tomorrow, 31 August 2026.** Order the work so that each piece is demonstrable
on its own and the escape hatch stays reachable. The runtime bring-up first, because it is the
only part that can fail in a way nothing else routes around. Then the provider and dispatch, then
the lanes, then upload, then the trace surface and the evaluation table. The upload path's
provenance work is the most likely thing to be cut and the fixture path must keep working without
it.

**A first-run cost is expected and is not a hang.** Turing support ships as intermediate code
that the driver compiles on first launch, and the result is cached. Discard the first
cold-start measurement.

**Weights are downloaded over the network.** That happens now, at setup time, and never during a
demo or a recording. Say so out loud rather than letting someone discover it.

**The vision projector occupies memory whether or not an image is sent.** It loads and offloads
at startup, so the document lane pays its residency without using it. Whether to keep it off the
GPU is a measurement, not a guess.

**Two corrections to closed decisions that this effort exposed**, both currently wrong in
`HANDOFF.md` and the artifact: the GPU is a 1650 Ti rather than a 1650 Max-Q, and expert offload
is not available on this hardware. Neither blocks the build; both are on a slide.
