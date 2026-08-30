# Demo runbook

What to start, in what order, and what to do when a piece of it misbehaves. Written 30 August
2026; deadline 1 September.

Three processes, and the order matters only because two of them have a warm-up you do not want to
pay in front of an audience.

## Start, in this order

```powershell
# 1. Inference. Loads a model on first request; keep it warm.
D:\ai\llama-swap\llama-swap.exe --config D:\ai\llama-swap\config.yaml --listen 127.0.0.1:8080

# 2. OCR. Warms its own engine at startup — wait for "engine warm in Ns".
npm run ingestion

# 3. The workbench. Serves http://127.0.0.1:3080 and nothing else.
npm start
```

**Then warm both models by hand before anyone is watching.** The first request to a model pays
Vulkan shader compilation — measured at 8.5s for the coder and 20.9s for the vision model, cached
by the driver afterwards. Ask one throwaway question of each task type, or:

```powershell
$b = '{"model":"MODEL","messages":[{"role":"user","content":"ok"}],"max_tokens":4}'
foreach ($m in "bf-coder","bf-vision") {
  Invoke-RestMethod -Method Post http://127.0.0.1:8080/v1/chat/completions `
    -ContentType application/json -Body ($b -replace 'MODEL',$m) | Out-Null
}
```

Check everything is up:

```powershell
Invoke-RestMethod http://127.0.0.1:8642/health     # {"status":"ok","warm":true,"renderDpi":300}
Invoke-RestMethod http://127.0.0.1:8080/running    # the model(s) currently resident
```

## The demo, and what each beat proves

1. **Egress monitor reads zero, then press the canary.** One deliberate outbound call, refused,
   red row, audit line. The zero is a count of `egress/denied` events, never a literal — silence
   proves nothing, so the canary is what turns an absence into evidence.
2. **Upload a scanned document.** The control is in the composer row, left of the canary. It reads
   the file in the browser, posts it over loopback, and OCRs it immediately — expect roughly 7s for
   two pages, and the button says which stage it is in. Then ask about the findings: click one and
   the provenance crop shows the region of the page it was read from, cut from a page rendered on
   demand at the same resolution the boxes were measured at.
3. **Ask for a coding or calculation task in the same session.** The routing chip changes member by
   itself; open it for the score per fleet member. The model writes Python, the sandbox runs it,
   and the reply states whether the value it computed matched what the model predicted before
   running.
4. **Generate the approval note.** A real `.docx`, each clause carrying its page and region, and a
   "How this note was produced" section naming the task type, every member's score, the model that
   answered, whether the OCR ran live, and the tools that ran. Open the file to show the reasoning
   survives leaving the room.
5. **`npm run evaluate`** if there is time, or just show `docs/evaluation.md`. Ten fixtures against
   ground truth a human wrote down, scored, with the failing programs printed.

## When something misbehaves

**A model OOMs, or llama-swap will not start.** Switch the model plane back to replay: in
`~/.dsh/profiles/web/cordis.patch.yml`, set the `modelPlane.provider` to `replay` and restart
`npm start`. Everything else still works — the lanes, the upload control, the provenance crops, the
audit trail and the evaluation table are all independent of which provider answered. You lose the
"it's live" line and keep the rest. This is the escape hatch and it is one line.

**The ingestion service is down.** The findings tool falls back to the committed capture of the
shipped fixture and *says so*, on screen and in the `.docx`. An uploaded document, though, will
refuse rather than describe the fixture — that is deliberate, because the capture describes a
different file.

**A provenance crop is blank.** A direct page request answers 502 with the reason when the page
could not be rendered, rather than 404. Check the ingestion service.

**An arithmetic question gets a wrong answer with no sandbox run.** That is the classifier routing
it to `document` — a known gap, owned by the router. See `docs/router-handoff.md`. Phrase the
prompt so it mentions code, a script, or the sandbox and it will route correctly.

**The routing chip names a model that is not in the registry.** An old session replaying its stored
decision. Start a new session.

## Two honest things to have ready

Someone will ask, and having the answer straight is better than being caught by it.

- **Model weights were downloaded** over the network, at setup time, on 30 August. Nothing is
  fetched at runtime and no demo pulls anything. `.scratch/local-inference-lanes/fetch-runtime.ps1`
  is the script that did it and it is idempotent.
- **The coding lane scores 2 of 5** against ground truth. The document lane scores 5 of 5. The
  coding failures are a 1.5B model reading engineering arithmetic imprecisely — summing when asked
  to count, ignoring a requested rounding, dividing by atmospheres instead of multiplying by a
  hundred — and `docs/evaluation.md` prints the program each time so the failure can be read rather
  than guessed at. That is what the evaluation is for. A bigger model would fix it and does not fit
  in 4 GB.
