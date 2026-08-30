# What language should the coding lane ask for, and who decides PASS?

Type: prototype
Status: resolved
Blocked by: 06

## Question

Story 5.3's replay cache scripts a PowerShell command, so the coding lane inherited PowerShell.
Once a real 1.5B model was writing the code instead of a human, it stopped working. Is the
language the problem, and who should be deciding whether the answer is right?

## Answer

Measured 30 August 2026. Harness: `.scratch/local-inference-lanes/probe-sandbox-language.mjs`
— three inspection-flavoured tasks, three attempts each, per language. Strict scoring: the
sandbox's last line must **be** `PASS`, never merely contain it.

```
powershell:  0/9 produced a real PASS   (0/9 even produced runnable code)
python:      3/9 produced a real PASS   (6/9 produced runnable, correct code)
```

PowerShell failed nine times out of nine, in four distinct ways:

- `Write-Output (1..100) -Sum | Out-String; if ((1..100) -Sum) -eq 5050) {...}` — unbalanced.
- `if ((9.5 - 7.2) / 9.5 * 100) -eq 24.2) {...}` — the same broken-paren shape, three times.
- A C-style ternary, which PowerShell echoed as literal tokens rather than evaluating.
- Four attempts where the **schema output itself** was truncated mid-string, because the model
  rambled past `max_tokens: 300`.

Python's six runnable results split into three clean passes and three that computed the right
answer but printed `5050` instead of the verdict it was told to print.

### The decisions

1. **The coding lane asks for Python, not PowerShell.** `tool-pwsh` stays the executor —
   `dsh-bash-sandbox` never loads on win32 per `docs/deepseek-harness-notes.md` — the command
   just becomes an invocation of the interpreter. Python 3.13 is already on this machine and is
   already a dependency via the ingestion service. Qwen's coder training is heavily
   Python-weighted, and the model gave the game away by writing `sum(1..100)` when asked for
   PowerShell.

2. **Our code decides PASS, not the model.** This is the more important half. Asking a 1.5B to
   both compute *and* format a verdict fails on the formatting a third of the time, for answers
   that were correct. So: the model prints the value, and the lane compares it against the
   expected value from the fixture. The model computes; the harness asserts.

   This also removes a real hazard from the evaluation harness. An earlier version of the smoke
   check used `output.includes("PASS")` and reported success for a command PowerShell never
   evaluated — it printed the literal string `5050 -eq 5050 ? PASS : FAIL` and the substring
   matched. **A metric that greps for the word PASS is theatre.** Comparing a computed value
   against a known one is not.

3. **Raise `max_tokens` and keep the schema narrow.** Truncated JSON was a third of the
   PowerShell failures and is a failure mode of our request, not of the model.

4. **Expect to retry, and show it.** Even in Python this model will produce a broken program
   sometimes. Feeding the interpreter's error back and trying again is what the harness's agent
   loop already does, and it is exactly the "iterate on a task instead of answering once and
   stopping" the problem statement asks for. A visible attempt 1 → error → attempt 2 → pass is a
   *better* demo beat than a first-time success, because it shows the loop is real.

## Consequence: the egress seal has a hole, and it is ours

`NETWORK_PWSH_PATTERN` in `lib/index.js` inspects a `pwsh` call's command text for PowerShell
network cmdlets — `Invoke-WebRequest`, `curl`, `Net.Sockets.*` and so on. **It knows nothing
about Python.** The moment the coding lane runs code through the interpreter, a program calling
`urllib.request.urlopen(...)` or `socket.socket(...)` walks straight past the seal, and the
egress monitor keeps reading a counted zero while the call happens.

That is a hole in the exact claim the whole product is built on, opened by our own change, and a
judge poking at the sandbox could find it. It must be closed in the same commit that switches the
lane to Python: extend the pattern to the interpreter's network surface (`urllib`, `requests`,
`http.client`, `socket`, `ftplib`, `smtplib`, `asyncio.open_connection`), and add a test that
fails if a Python network call is permitted — the same shape as the existing `pwsh` denial test.

The deeper limitation is unchanged and already recorded as a Phase 0 known limitation: a
deny-by-pattern policy on command text is evadable by a determined script. It is honest about
that. What it cannot be is silent about a whole language.
