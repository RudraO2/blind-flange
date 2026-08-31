# Demo runbook

What to start, in what order, and what to do when a piece of it misbehaves. Written 30 August
2026; deadline 1 September.

Three processes, and the order matters only because two of them have a warm-up you do not want to
pay in front of an audience.

## Start, in this order

```powershell
# 1. Inference. Loads a model on first request; keep it warm.
D:\ai\llama-swap\llama-swap.exe --config D:\ai\llama-swap\config.yaml --listen 127.0.0.1:8080

# 2. The workbench. Serves http://127.0.0.1:3080 and nothing else.
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

1. **The seal row reads zero, then ask it to open WhatsApp.** The seal row sits at the foot of
   the sidebar and is on screen before you type anything. Ask the workbench to open WhatsApp and
   check a vendor thread: the attempt is refused before it runs, a notice names the tool and the
   address, and the count goes up. Click the row — the Sovereignty drawer carries the seal's
   switch, the two figures and the record. The zero was a count of `egress/denied` events, never
   a literal; silence proves nothing, so a refused request is what turns an absence into
   evidence.

   Then **throw the switch and ask again.** With the seal open the same request reaches the
   internet and is recorded as let through. Do this only on a machine you are willing to have
   reach the network, and close the seal afterwards — a restart closes it anyway. This half is
   what proves the monitor is measuring rather than asserting.
2. **Attach an image and ask about it.** Paste it, drag it onto the window, or use *Attach an
   image* in the composer's `+` menu — all three go to the same place. A thumbnail appears in the
   composer before you send, and after you send it the picture sits above your own message in the
   transcript, exactly where anyone in the room expects it. Click it for the full-size original.
   The vision member answers from the pixels, not from extracted text; the routing chip names it.
   Keep it to a photograph, a nameplate or a screenshot — PNG, JPEG, WebP or GIF. PDFs are not
   accepted (ADR-0008).
3. **Ask for a coding or calculation task in the same session.** The routing chip changes member by
   itself; open it for the score per fleet member. The model writes Python, the sandbox runs it,
   and the reply states whether the value it computed matched what the model predicted before
   running.
4. **Generate the approval note.** A real `.docx`, and a "How this note was produced" section
   naming the task type, every member's score, the model that answered, how many attached images it
   was sent, and the tools that ran. Open the file to show the reasoning survives leaving the room.
5. **`npm run evaluate`** if there is time, or just show `docs/evaluation.md`. The coding lane's
   fixtures against ground truth a human wrote down, scored, with the failing programs printed.
   The document lane is no longer scored — see ADR-0008.

## When something misbehaves

**A model OOMs, or llama-swap will not start.** Switch the model plane back to replay: in
`~/.dsh/profiles/web/cordis.patch.yml`, set the `modelPlane.provider` to `replay` and restart
`npm start`. Everything else still works — the lanes, the attach control, the audit trail and the
evaluation table are all independent of which provider answered. You lose the "it's live" line and
keep the rest. This is the escape hatch and it is one line.

**The turn fails with "exceeds the available context size".** The attached image plus the
conversation is over `bf-vision`'s 8192-token context. Start a new session and attach the image to
the first message; a long conversation with a picture in it is the case that overflows. The image
budget itself is capped at 640×640 in `attachments/images.js` for exactly this reason.

**The model describes an image nobody sent.** It should not — an attachment that could not be read
is announced to the model in words rather than dropped silently. If it happens anyway, check the
host log for `attachment ... could not be read` and say so rather than trusting the answer.

**An arithmetic question gets a wrong answer with no sandbox run.** That is the classifier routing
it to `document` — a known gap, owned by the router. See `docs/router-handoff.md`. Phrase the
prompt so it mentions code, a script, or the sandbox and it will route correctly.

**The routing chip names a model that is not in the registry.** An old session replaying its stored
decision. Start a new session.

## Two honest things to have ready

Someone will ask, and having the answer straight is better than being caught by it.

- **Model weights were downloaded** over the network, at setup time, on 30 August. Nothing is
  fetched at runtime and no demo pulls anything. `scripts/fetch-runtime.ps1`
  is the script that did it and it is idempotent.
- **The coding lane scores 2 of 5** against ground truth. The document lane scores 5 of 5. The
  coding failures are a 1.5B model reading engineering arithmetic imprecisely — summing when asked
  to count, ignoring a requested rounding, dividing by atmospheres instead of multiplying by a
  hundred — and `docs/evaluation.md` prints the program each time so the failure can be read rather
  than guessed at. That is what the evaluation is for. A bigger model would fix it and does not fit
  in 4 GB.
