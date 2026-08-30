# ADR-0007 — The request is the canary

**Date:** 30 August 2026
**Status:** Accepted
**Supersedes:** Story 2.3 (`2-3-the-canary-proves-the-zero-is-enforced`), which is complete
and shipped. It is superseded, not undone.

## Context

The canary was a button in the composer row. Pressing it dispatched a real tool whose body
called `fetch`; the egress denial waterfall refused it before that body ran, appended
`egress/denied`, and the monitor moved off that recorded event. It did its job. It closed
the gap between "this system claims it denies outbound calls" and "watch it deny one."

Three things changed.

**The demonstration got better.** Asking the workbench to *open WhatsApp* proves the same
thing and needs no explanation. A judge watching a button labelled `Canary` has to be told
what a canary is, and then has to take our word that pressing it did something real. A judge
watching somebody type "open WhatsApp and check the vendor thread" and watching the workbench
refuse it is watching a thing they already understand. The vocabulary is theirs, not ours.

**The button was one control too many.** The composer row carried Upload, Canary and the
routing chip; the session header carried four pills of equal weight. The canary was the one
element on the screen whose only purpose was to make another element move.

**It was hiding a hole.** This is the part that matters, and it was not visible until the
canary was measured against what would replace it.

## The hole

`tools/pre-execute` refused three tools by name — `web_search`, `web_fetch`, `bf_canary` —
plus `pwsh` calls whose command text matched a network pattern. Those patterns knew what a
network *client* looks like: PowerShell's web cmdlets, .NET's socket and HTTP types, Python's
network surface and `webbrowser`.

None of them knew what *opening* something looks like. Measured against the real listener with
the seal closed, on 30 August 2026, seven of eleven "open WhatsApp" shapes were permitted
through to their tool body:

```
ALLOWED  pwsh  Start-Process "https://web.whatsapp.com"
ALLOWED  pwsh  Start-Process msedge "https://web.whatsapp.com"
ALLOWED  pwsh  start https://web.whatsapp.com
ALLOWED  pwsh  explorer.exe "https://web.whatsapp.com"
ALLOWED  pwsh  Start-Process "whatsapp://send?text=hi"
ALLOWED  pwsh  cmd /c start "" https://web.whatsapp.com
ALLOWED  pwsh  [System.Diagnostics.Process]::Start("https://web.whatsapp.com")
```

Nothing further out catches them. The harness's sandbox says so in its own documentation —
`@deepseek-ai/dsh-sandbox`: *"File effects are the whole policy vocabulary — the seam
expresses no network, process, syscall, device, or credential restrictions."*
`@deepseek-ai/dsh-sandbox-windows-acl`, the backend that actually confines `tool-pwsh` on this
machine: *"Writes are restricted; reads, network, and process visibility are not"* and
*"Read-side confinement and network policy are out of scope."* Our waterfall is the only thing
standing there.

The model plane is now `local`, so which tool a request reaches for is the model's decision.
"Open WhatsApp" could therefore have succeeded — on stage, in front of the panel. That is the
single worst outcome this product has, and the canary was the reason the demo never went
anywhere near the path that produces it: it always took the one route that was already
covered.

## Decision

1. **Widen the sandbox command policy first.** Two more rules, reported as their own denial
   reasons: a launcher-verb pattern (`Start-Process`, `Invoke-Item`, `explorer`, `rundll32`,
   `[Diagnostics.Process]::Start`, and browser executables named with `.exe`), and a
   URL-or-URI pattern that refuses a command carrying a web address at all.
2. **Then remove the canary** — the tool, its loopback channel, its config key, and the
   composer button.
3. **The demonstration becomes the request.** "Open WhatsApp" is refused by the same waterfall
   that refuses everything else, recorded on the same `egress/denied` event, counted by the
   same fold.

The order is the decision. Removing the button first would have left the hole open with
nothing exercising it.

## Consequences

**The calibration survives as a step rather than as a control.** The canary's real argument was
that it could be shown *succeeding* with the seal open, which is what proved the monitor was
measuring rather than asserting. The same request does this: open the seal, ask again, watch it
reach. `test/index.test.js` asserts both answers on the same input, which is the property that
matters — an instrument that can only ever return one answer is not an instrument.

**The URL rule is deliberately broad.** A command that merely mentions a URL is refused, even
in a comment, because `tools/pre-execute` decides from static text and cannot tell a citation
from an argument. This is the same trade the Python rule already makes when it refuses the bare
word `socket`. It fails in the safe direction: the refusal is visible, names itself, and is one
sentence for an operator to read — where the other direction is a browser opening on a
projector.

**Browser names are matched only with `.exe`.** `chrome`, `brave` and `opera` are ordinary
English words, and a policy that refused `print("be brave")` would be discredited by the first
person who tried it. Nothing is lost: a browser launched without its extension goes through
`Start-Process` or `start`, and a browser launched at all carries the address it is being sent
to.

**`egress/escaped` stays in the vocabulary.** Only the canary ever wrote it. It is kept in the
event registration and in the view's fold so a session recorded before today still opens and
still reads correctly.

**This is not a claim that the policy is complete.** It is a deny-by-pattern policy over static
command text, and a determined script can still evade it — that was already written down for
the Python rules and is no less true here. What changed is that the *unprompted* route, the one
a model reaches for when told to open something, is now covered and has a test.
