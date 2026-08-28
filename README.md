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

Then, from a clean clone — **on Windows, double-click `run.bat`**. It installs pnpm if it is
missing, sets everything up, and starts the workbench. Nothing else to read.

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
npm run setup-ingestion       # optional: install the Python OCR service (see below)
npm run ingestion             # optional: run it
```

## What actually runs, and what is replayed

Worth being straight about before you judge what you are looking at.

**Real.** The egress seal, the canary and the audit log. The router — it genuinely classifies
each request and scores the fleet. The sandbox: a coding task really executes. The approval
note is really written to disk as a `.docx`. The OCR is real PP-OCRv6 inference on the scanned
report.

**Replayed.** The agent's own prose. Phase 0 answers from the `replay` provider —
stored responses, disclosed on screen as *Replay — authored responses* the entire time. There
is no local inference yet: `model-plane/model-provider.js` declares `local` and `remote` and
both throw, by design, so selecting one later is a config change rather than a rewrite. **No
model weights are downloaded by anything here, and a GPU changes nothing yet.**

That split is deliberate and it is on screen, never hidden. See ADR-0001.

## What you should see

The first screen is the workbench itself — no notice to dismiss, no API-key prompt, no
account. In the session header, beside the composer, there is a pill reading **Egress 0** with
a green dot. That zero is a count of denied outbound attempts, not a printed literal.

Click it. The panel underneath carries a **Fire the canary** button. Pressing it makes Blind
Flange deliberately attempt one outbound call, watch its own egress denial refuse it, turn the
monitor red, and write the attempt into an audit log you can read on the same screen. Silence
proves nothing; the canary is what turns an absence into evidence.

That is the first demo beat. From there the routing chip at the end of the composer names the
fleet member that answered and why, and the Provenance tab shows the image region each finding
was actually read from.

## What the start command does, and what touches the network

1. **Checks Node and pnpm.** Stops with a plain message if either is missing or too old.
2. **Installs `@deepseek-ai/dsh@0.1.1-rc.2` globally** — *only if* this machine does not already
   have exactly that version. The harness is a developer preview whose own README promises
   compatibility-breaking changes, so the version is pinned rather than tracked.
3. **Installs this checkout's plugin package** into the `web` and `headless` profiles as a
   `link:` dependency, so the running app serves the working copy.
4. **Writes the profile's patch layer, task-type presets and settings** from `profile/`.
5. **Gives a brand-new install one workspace** pointing at this checkout, so the first session
   can start without picking a directory first. An existing workspace list is never touched.
6. **Starts the `web` profile.**

**Step 2 is the only step that uses the network, and on a machine that already has the pinned
harness there is no network use at all.** Nothing downloads a model, a font, an icon or a
script at first use, or at any later use: every asset the page loads is served from
`127.0.0.1:3080` or a `data:` URI, and the model plane answers from a cache committed to this
repository. The fleet in `registry/models.yaml` is declared and licence-checked; the provider
that would need weights on disk fails loudly rather than fetching anything.

Blind Flange is a demo prototype and says so out loud: the live demo answers from **replay**,
stored responses served through the same model plane a local model would answer through, and
the active provider is named on screen at all times.

## Where things are

| Path | What it is |
|---|---|
| `run.bat` | The front door on Windows. Double-click it. `run.bat check` / `setup` / `ingestion` for the other paths |
| `scripts/start.mjs` | The start command. Node builtins only — no dependencies |
| `scripts/doctor.mjs` | `npm run doctor` — checks the toolchain, the wiring, the seal, the tests and the licence audit |
| `scripts/setup-ingestion.mjs` | `npm run setup-ingestion` — the optional Python OCR service, in its own virtual environment |
| `scripts/record-demo.mjs` | `npm run record-demo` — drives a running workbench through the three demo beats and records them. Needs `ffmpeg` on `PATH` |
| `videos/recorded-offline-run/` | The recording itself, and what it shows second by second |
| `profile/` | The harness profile's configuration, tracked. The source of truth for what `npm start` writes |
| `plugins/dsh-client-ui-base/` | Blind Flange itself: the egress seal, canary, model plane, router, provenance viewer and deliverable factory, as one out-of-tree harness plugin |
| `registry/models.yaml` | The fleet, one row per model, each with the licence it was verified under |
| `services/ingestion/` | The Python OCR service that turns a scanned report into text with regions |
| `docs/licence-policy.md` | The licence allow-list, and why it is absolute |
| `docs/profile-install.md` | Every profile change explained, and how to do it by hand |
| `CONTEXT.md` | The vocabulary this project uses, and the words it avoids |

Nothing under the harness's own installation is ever edited. Every change Blind Flange makes is
a profile patch row or an out-of-tree plugin, which is why an operator's own IT department can
audit it and why removing it is a config edit rather than a rebuild.

## The ingestion service (optional)

The Python OCR service that turns a scanned report into text with regions. **You do not need it
to run the demo** — the workbench reads a committed capture of a real response the service
produced (`plugins/dsh-client-ui-base/lib/findings/sample-report-findings.json`), because the
two are separate trees and reaching across them at runtime would be a lie about the seam.

Install it if you want to see that capture reproduced on your own machine:

```sh
npm run setup-ingestion       # needs Python 3.11+ on PATH
```

It builds a virtual environment under `services/ingestion/.venv`, installs the pinned
dependencies, and runs the service's own tests. It also **uninstalls `shapely`**, which is not
housekeeping: RapidOCR pulls it in, its wheel bundles the LGPL-2.1 GEOS libraries, and `ocr.py`
supplies the two properties RapidOCR actually uses instead. A plain `pip install -r
requirements.txt` leaves the real package on disk and quietly breaks the licence claim, so the
installer removes it and `npm run doctor` fails if it ever comes back.

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
