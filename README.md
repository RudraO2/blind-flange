# Blind Flange

**SIH26117 — a sovereign, air-gapped agentic AI workbench for MRPL**, built on DeepSeek Harness
and open-weight models under permissive licences only.

A blind flange is the plate bolted over a pipe to positively isolate it: isolation you can see,
not a policy you have to trust. This is the software version. Nothing it does reaches the
network, and it proves that on screen rather than claiming it.

---

## Start it

Two prerequisites, both checked for you before anything is installed:

| | Version | Get it |
|---|---|---|
| Node.js | 22.15.0 or newer | <https://nodejs.org> — `npm` comes with it |
| pnpm | 10.11.0 or newer | `npm install -g pnpm` |

Get it:

```sh
git clone https://github.com/RudraO2/blind-flange.git
cd blind-flange
```

Then — **on Windows, double-click `run.bat`**. It installs pnpm if it is missing, sets
everything up, and opens the workbench **fullscreen**: no address bar, no tabs, nothing on
screen but Blind Flange. Alt+F4 closes it. Nothing else to read.

```
run.bat            set up if needed, then open fullscreen
run.bat windowed   the same, in an ordinary browser tab
run.bat check      check the install and stop
run.bat setup      set up and stop
run.bat models     download the inference runtime and the two models
run.bat stop       stop the workbench and the inference runtime
```

From a terminal, on any platform, in the repository root:

```sh
npm start
```

That is the whole command. It installs the pinned harness if this machine does not already have
it, points a harness profile at this checkout, writes the profile's configuration from the
tracked copies under `profile/`, and opens Blind Flange at <http://127.0.0.1:3080>.

**If anything looks wrong, run `npm run doctor`** (or `run.bat check`). It checks the toolchain,
the profile wiring, the seal, the tests and the licence audit, and every failure it reports says
what to run next.

Stop it with Ctrl+C. Run `npm start` again any time — every step is idempotent, and it is also
how you pick up a change after editing anything under `profile/` or `plugins/`.

```sh
npm run setup                 # do everything except start the app
npm start -- --no-open        # start without opening a browser
npm start -- --port 3081      # any other flag is passed through to the harness
npm test                      # the plugin package's own tests
npm run doctor                # check this install and say what, if anything, is wrong
npm run record-demo           # record the three demo beats from a running workbench
npm run evaluate              # score the coding lane against hand-written ground truth
```

## What actually runs, and what is replayed

Worth being straight about before you judge what you are looking at.

**Real, and running on this machine.** The egress seal and the audit record. The router — it
genuinely classifies each request and scores the fleet. The sandbox: a coding task really
executes. The approval note is really written to disk as a `.docx`. And since 30 August 2026
the model plane is `local`: open-weight models on this box's GPU through llama-swap, which
loads one at a time and evicts to make room because a GTX 1650 Ti does not hold two. An image
you attach goes to the vision member as pixels.

**Replayed, if you ask for it.** `replay` is still there as the escape hatch — set
`modelPlane.provider` back to `replay` in the profile patch and restart. Answers then come from
a hand-authored cache, disclosed on screen as *Replay — authored responses* the whole time.
Everything except live generation still works, because nothing else depends on which provider
answered.

That split is deliberate and it is on screen, never hidden. See ADR-0001.

The key findings arrive as a table rather than a paragraph. The table is a **rendering of that
same replayed text** — the reply carries a `dsh-ui` fence and an adopted plugin
(`@changfenhuang/dsh-genui`, MIT, pinned at 0.9.3) draws it. Nothing in it is computed live,
the provider pill names the provider that answered while it is on screen.

## What you should see

The first screen is the workbench itself — no notice to dismiss, no API-key prompt, no
account. At the foot of the sidebar, above Settings, one line reads **Sealed** with a green dot
and a number. That number is a count of denied outbound attempts, not a printed literal, and
the line is there on the new-session screen as well as inside a conversation — the seal belongs
to the installation, not to a conversation.

Now ask it to do something that needs the internet: *open WhatsApp and check the vendor
thread*. The attempt is refused before it runs, a notice names the tool and the address it was
sent to, and the count goes up. Click the seal row: the **Sovereignty** drawer opens with the
seal's own switch, the figures, and the record of every attempt this session — timestamped,
named, and exportable. Silence proves nothing; a refused request is what turns an absence into
evidence.

Then throw the switch and ask again. The same request reaches the internet, and that is
recorded too. An instrument that can only ever return one answer is not an instrument.

That is the first demo beat. From there the routing chip at the end of the composer names the
fleet member that answered and why, and an image you paste, drop or attach appears above your
own message and goes to the vision member as pixels.

## What the start command does, and what touches the network

1. **Checks Node and pnpm.** Stops with a plain message if either is missing or too old.
2. **Installs `@deepseek-ai/dsh@0.1.1-rc.2` globally** — *only if* this machine does not already
   have exactly that version. The harness is a developer preview whose own README promises
   compatibility-breaking changes, so the version is pinned rather than tracked.
3. **Installs this checkout's plugin package** into the `web` and `headless` profiles as a
   `link:` dependency, so the running app serves the working copy.
4. **Installs the one adopted plugin**, `@changfenhuang/dsh-genui@0.9.3` (MIT), into the `web`
   profile at that exact version — again only if it is not already there. It renders the key
   findings table.
5. **Writes the profile's patch layer, task-type presets and settings** from `profile/`.
6. **Gives a brand-new install one workspace** pointing at this checkout, so the first session
   can start without picking a directory first. An existing workspace list is never touched.
7. **Starts the `web` profile.**

**Steps 2 and 4 are the only steps that use the network, and on a machine that already has the
pinned harness and the pinned plugin there is no network use at all.** Nothing downloads a
model, a font, an icon or a script at first use, or at any later use: every asset the page
loads is served from `127.0.0.1:3080` or a `data:` URI, and the model plane answers from a
cache committed to this repository. The fleet in `registry/models.yaml` is declared and licence-checked; the provider
that would need weights on disk fails loudly rather than fetching anything.

Blind Flange is a demo prototype and says so out loud: the live demo answers from **replay**,
stored responses served through the same model plane a local model would answer through, and
the active provider is named on screen at all times.

## Where things are

| Path | What it is |
|---|---|
| `run.bat` | The front door on Windows. Double-click it. `run.bat check` / `setup` / `models` / `stop` for the other paths |
| `scripts/start.mjs` | The start command. Node builtins only — no dependencies |
| `scripts/doctor.mjs` | `npm run doctor` — checks the toolchain, the wiring, the seal, the tests and the licence audit |
| `scripts/record-demo.mjs` | `npm run record-demo` — drives a running workbench through the three demo beats and records them. Needs `ffmpeg` on `PATH` |
| `videos/recorded-offline-run/` | The recording itself, and what it shows second by second |
| `profile/` | The harness profile's configuration, tracked. The source of truth for what `npm start` writes |
| `plugins/dsh-client-ui-base/` | Blind Flange itself: the egress seal, model plane, router, attached-image path and deliverable factory, as one out-of-tree harness plugin |
| `registry/models.yaml` | The fleet, one row per model, each with the licence it was verified under |
| `docs/licence-policy.md` | The licence allow-list, and why it is absolute |
| `docs/profile-install.md` | Every profile change explained, and how to do it by hand |
| `CONTEXT.md` | The vocabulary this project uses, and the words it avoids |

Nothing under the harness's own installation is ever edited. Every change Blind Flange makes is
a profile patch row or an out-of-tree plugin, which is why an operator's own IT department can
audit it and why removing it is a config edit rather than a rebuild.

## If it does not start

**Run `npm run doctor` first** — it names the problem and what to run. Otherwise:

- **`pnpm was not found on PATH`** — `npm install -g pnpm`, then run `npm start` again.
- **The app starts but panels are missing.** The profile's `link:` points at an absolute path.
  If the repository has been moved or re-cloned since the last run, `npm start` repairs it.
- **A different harness home.** Set `DSH_HOME` and everything — profile, presets, settings —
  goes there instead of `~/.dsh`. This is also how to try a cold start without disturbing an
  existing install.

## Licence and credit

Built on **DeepSeek Harness** (MIT). Blind Flange's licence rule is **OSI-approved, no copyleft,
no user cap, no field-of-use restriction, no disclosure obligation** — eleven enumerated names
across model weights, dependencies and the harness:

> Apache-2.0 · MIT · BSD-2-Clause · BSD-3-Clause · ISC · 0BSD · Python-2.0 · MIT-CMU ·
> BSL-1.0 · Zlib · CC0-1.0

It is a hard constraint recorded in `docs/licence-policy.md`, enforced by a loader that refuses
any model outside it and by `npm run licence-audit`, which enumerates every transitive licence
across all four trees and exits non-zero on anything undecided. Not merely asserted — run it.

**And the honest part.** "Every component is permissively licensed" would be a stronger sentence
and it would be false. Eight of the audit's rows are copyleft; **two are linked at runtime** —
libvips inside `sharp`, reached through a harness plugin we are forbidden to edit, and Eigen
inside `onnxruntime`. Both are inherited rather than chosen, both are disclosed, and neither
places any obligation on this project's own code. Each is decided one at a time, with evidence,
in `docs/licence-decisions.json`. Third-party notices are in `THIRD_PARTY_NOTICES.md`.
