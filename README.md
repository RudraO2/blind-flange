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

Then, from a clean clone, in the repository root:

```sh
npm start
```

That is the whole command. It installs the pinned harness if this machine does not already have
it, points a harness profile at this checkout, writes the profile's configuration from the
tracked copies under `profile/`, and opens Blind Flange at <http://127.0.0.1:3080>.

Stop it with Ctrl+C. Run `npm start` again any time — every step is idempotent, and it is also
how you pick up a change after editing anything under `profile/` or `plugins/`.

```sh
npm run setup                 # do everything except start the app
npm start -- --no-open        # start without opening a browser
npm start -- --port 3081      # any other flag is passed through to the harness
npm test                      # the plugin package's own tests
npm run record-demo           # record the three demo beats from a running workbench
```

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
| `scripts/start.mjs` | The start command. Node builtins only — no dependencies |
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

## If it does not start

- **`pnpm was not found on PATH`** — `npm install -g pnpm`, then run `npm start` again.
- **The app starts but panels are missing.** The profile's `link:` points at an absolute path.
  If the repository has been moved or re-cloned since the last run, `npm start` repairs it.
- **A different harness home.** Set `DSH_HOME` and everything — profile, presets, settings —
  goes there instead of `~/.dsh`. This is also how to try a cold start without disturbing an
  existing install.

## Licence and credit

Built on **DeepSeek Harness** (MIT). Blind Flange ships only Apache-2.0, MIT, BSD-2-Clause and
BSD-3-Clause components, across model weights, dependencies and the harness itself — a hard
constraint recorded in `docs/licence-policy.md` and enforced by a loader that refuses anything
else, not merely asserted. Third-party notices are in `THIRD_PARTY_NOTICES.md`.
