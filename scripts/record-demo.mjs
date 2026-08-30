#!/usr/bin/env node
// Faraday (SIH26117) — record the offline run (Story 6.5).
//
// `npm run record-demo` drives the running workbench through the three demo
// beats and records what the screen actually did:
//
//   1. the canary — egress monitor at zero, one deliberate outbound attempt,
//      denied, the monitor red, the audit line on screen;
//   2. the routing chip changing model by itself as the task type changes;
//   3. the approval note coming out as a signed `.docx`.
//
// It is a recording of the real workbench, not a montage: every frame comes
// from Chrome's own screencast of the page, every step waits on a real DOM
// condition rather than a sleep, and the run fails loudly instead of
// producing a video of something that did not happen.
//
// Node builtins only, by policy — the licence allow-list (docs/licence-policy.md)
// is enforced rather than asserted, so the Chrome DevTools Protocol is spoken
// over the platform's own `WebSocket` and `fetch` rather than through a client
// library. The one external tool is the `ffmpeg` CLI, which muxes the captured
// frames into an MP4; it is build-time only and never ships, and that decision
// is recorded in docs/licence-decisions.json.
//
// Usage:
//   npm start                       # in another terminal — the workbench must be up
//   npm run record-demo             # records at 127.0.0.1:3080 in the light theme
//   npm run record-demo -- --theme dark --port 3081
//
// Flags:
//   --port <n>       workbench port (default 3080)
//   --theme <t>      `light` or `dark` (default light) — chosen through the
//                    workbench's own Settings dialog, and put back to the
//                    operator's choice when the run ends
//   --out <path>     output MP4 (default videos/recorded-offline-run/blind-flange-offline-run-<theme>.mp4)
//   --stills <dir>   where the per-beat PNGs go (default docs/screenshots)
//   --keep-frames    leave the captured JPEG frames on disk for inspection

import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Chrome, in the two places Windows puts it. The recorder needs a real browser, not a shim. */
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
]

/** The recorded viewport. Both even, so H.264 needs no padding. */
const VIEWPORT = { width: 1440, height: 900 }

/** How long any single wait-for-condition may take before the run is called failed. */
const STEP_TIMEOUT_MS = 30_000

/** NFR9: the whole thing runs under three minutes and the hook lands inside thirty seconds. */
const MAX_DURATION_S = 180
const HOOK_DEADLINE_S = 30

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? fallback : args[index + 1]
}
const port = flag('port', '3080')
const theme = flag('theme', 'light')
const keepFrames = args.includes('--keep-frames')
const workbenchUrl = `http://127.0.0.1:${port}/`
const stillsDir = resolve(repoRoot, flag('stills', 'docs/screenshots'))
const outPath = resolve(
  repoRoot,
  flag('out', `videos/recorded-offline-run/blind-flange-offline-run-${theme}.mp4`),
)

if (theme !== 'light' && theme !== 'dark') fail(`--theme must be "light" or "dark", not "${theme}"`)

const say = (message) => console.log(message)
const step = (message) => console.log(`\n==> ${message}`)

function fail(message) {
  console.error(`\nRecording stopped: ${message}\n`)
  process.exit(1)
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** An ephemeral port for Chrome's debugging endpoint, so two runs never collide. */
function freePort() {
  return new Promise((done) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const { port: chosen } = server.address()
      server.close(() => done(chosen))
    })
  })
}

/**
 * A Chrome DevTools Protocol connection to one page target.
 *
 * Thin on purpose: `send` for commands, `on` for events. Everything the demo
 * needs — evaluating a predicate, typing, clicking, screencasting — is one of
 * those two.
 */
class Devtools {
  /** @param {string} webSocketUrl */
  constructor(webSocketUrl) {
    this.socket = new WebSocket(webSocketUrl)
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    this.ready = new Promise((done, reject) => {
      this.socket.addEventListener('open', () => done(), { once: true })
      this.socket.addEventListener('error', () => reject(new Error('the DevTools socket refused the connection')), {
        once: true,
      })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined) {
        const settle = this.pending.get(message.id)
        if (!settle) return
        this.pending.delete(message.id)
        if (message.error) settle.reject(new Error(`${message.error.message} (CDP)`))
        else settle.resolve(message.result)
        return
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params)
    })
  }

  /** @param {string} method @param {object} [params] */
  send(method, params = {}) {
    const id = this.nextId++
    this.socket.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve_, reject) => this.pending.set(id, { resolve: resolve_, reject }))
  }

  /** @param {string} method @param {(params: any) => void} listener */
  on(method, listener) {
    if (!this.listeners.has(method)) this.listeners.set(method, [])
    this.listeners.get(method).push(listener)
  }

  close() {
    try {
      this.socket.close()
    } catch {
      /* the browser is going away anyway */
    }
  }
}

/** Poll `/json/version` until Chrome's debugging endpoint answers, or give up. */
async function waitForDevtools(debugPort) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`)
      if (response.ok) return await response.json()
    } catch {
      /* not up yet */
    }
    await sleep(200)
  }
  fail('Chrome never opened its DevTools endpoint')
}

/** The page target Chrome opened for our URL. */
async function pageTarget(debugPort) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()
    const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl)
    if (page) return page
    await sleep(200)
  }
  fail('Chrome opened no page target')
}

async function main() {
  step('Checking what this needs')

  const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!chrome) fail(`no Chrome found. Looked in:\n  ${CHROME_CANDIDATES.join('\n  ')}`)
  say(`  Chrome: ${chrome}`)

  const ffmpegProbe = spawnSync('ffmpeg', ['-version'], { shell: true, encoding: 'utf8' })
  if (ffmpegProbe.status !== 0) {
    fail(
      'ffmpeg is not on PATH. It muxes the captured frames into an MP4 and is build-time\n' +
        '  tooling only — see the FFmpeg row in docs/licence-decisions.json. Install it with\n' +
        '  `winget install Gyan.FFmpeg` and run this again.',
    )
  }
  say(`  ffmpeg: ${(ffmpegProbe.stdout || '').split('\n')[0]}`)

  try {
    const response = await fetch(workbenchUrl)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    fail(
      `the workbench is not answering at ${workbenchUrl} (${error.message}).\n` +
        '  Start it in another terminal with `npm start` and run this again.',
    )
  }
  say(`  Workbench: ${workbenchUrl}`)

  const framesDir = mkdtempSync(join(tmpdir(), 'blind-flange-frames-'))
  const chromeProfile = mkdtempSync(join(tmpdir(), 'blind-flange-chrome-'))
  const debugPort = await freePort()

  step('Starting a clean headless Chrome')
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${chromeProfile}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      '--force-device-scale-factor=1',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' },
  )
  browser.on('error', (error) => fail(`Chrome would not start: ${error.message}`))

  const version = await waitForDevtools(debugPort)
  say(`  ${version.Browser}`)

  const target = await pageTarget(debugPort)
  const cdp = new Devtools(target.webSocketDebuggerUrl)
  await cdp.ready

  /** Frames as Chrome hands them over: base64 JPEG plus the wall-clock instant it painted. */
  /** @type {{ data: string, timestamp: number }[]} */
  const frames = []
  cdp.on('Page.screencastFrame', async (params) => {
    frames.push({ data: params.data, timestamp: params.metadata.timestamp })
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId })
    } catch {
      /* the screencast has already been stopped */
    }
  })

  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  /** Evaluate an expression in the page and hand back a plain value. */
  const evaluate = async (expression) => {
    const result = await cdp.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate threw in the page')
    }
    return result.result.value
  }

  /** Poll a page-side predicate until it is true. A timeout fails the run — a demo of something that did not happen is worse than no demo. */
  const waitFor = async (expression, description, timeout = STEP_TIMEOUT_MS) => {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await evaluate(expression)) return
      await sleep(150)
    }
    throw new Error(`timed out after ${timeout / 1000}s waiting for ${description}`)
  }

  /** Type into the focused composer one character at a time, so the recording shows typing rather than a paste. */
  const typeText = async (text) => {
    for (const character of text) {
      await cdp.send('Input.insertText', { text: character })
      await sleep(24)
    }
  }

  const pressEnter = async () => {
    // A moment on the typed prompt before it is sent: the request is half the
    // point of the routing beats, and an instantly-sent prompt is unreadable.
    await sleep(700)
    for (const type of ['keyDown', 'keyUp']) {
      await cdp.send('Input.dispatchKeyEvent', {
        type,
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      })
    }
  }

  // ---------------------------------------------------------------- page-side helpers
  //
  // Selectors are aria-labels and visible text, never the harness's hashed CSS
  // module class names — those change whenever the harness is rebuilt and a
  // recorder that breaks on a rebuild is worse than no recorder.
  const PAGE_HELPERS = `
    globalThis.__bf = {
      composer: () => document.querySelector('textarea'),
      // Exact text, for the controls whose label is a prefix of another's —
      // Settings' "Close" against the details pane's "Close details".
      exact: (label) => [...document.querySelectorAll('button')].find((element) => (element.textContent || '').trim() === label),
      // The theme is a harness setting the server inlines into the document,
      // not a media query, so this is where the operator's current choice is.
      preference: () => {
        const boot = [...document.querySelectorAll('script')]
          .map((node) => node.textContent || '')
          .find((text) => /const preference = /.test(text));
        const found = boot && boot.match(/const preference = "(\\w+)"/);
        return found ? found[1] : null;
      },
      button: (pattern) => [...document.querySelectorAll('button')].find((element) =>
        new RegExp(pattern, 'i').test((element.getAttribute('aria-label') || '') + ' ' + (element.getAttribute('title') || '') + ' ' + (element.textContent || ''))),
      text: () => document.body.innerText,
      provider: () => {
        const node = [...document.querySelectorAll('[title]')].find((element) =>
          /Faraday is answering from the/.test(element.getAttribute('title')));
        return node ? { label: node.textContent.trim(), title: node.getAttribute('title') } : null;
      },
      egress: () => {
        const chip = [...document.querySelectorAll('button')].find((element) => /^Egress\\b/.test((element.textContent || '').trim()));
        return chip ? chip.textContent.trim() : null;
      },
      routedModel: () => {
        const chip = [...document.querySelectorAll('button')].find((element) => /The router picked/.test(element.getAttribute('title') || ''));
        return chip ? chip.textContent.trim() : null;
      },
    };
    true;
  `

  /** The theme the operator had chosen before the recorder borrowed the setting. */
  let operatorTheme = null

  /**
   * Pick a theme through the workbench's own Settings dialog.
   *
   * `light` and `dark` are checkable — the harness marks the body — so they are
   * waited on rather than assumed. `system` is the operator's own choice
   * deferring to the machine, and there is nothing to assert about it beyond
   * the dialog having closed.
   */
  const chooseTheme = async (want) => {
    const label = { light: 'Light', dark: 'Dark', system: 'System' }[want]
    if (!label) throw new Error(`no Settings control for the ${want} theme`)
    await evaluate("__bf.exact('Settings').click()")
    await waitFor(`!!__bf.exact('${label}')`, 'the Settings dialog to open')
    await evaluate(`__bf.exact('${label}').click()`)
    if (want !== 'system') {
      await waitFor(
        `document.body.hasAttribute('data-ds-dark-theme') === ${want === 'dark'}`,
        `the ${want} theme to be applied`,
      )
    }
    await evaluate("__bf.exact('Close').click()")
    await waitFor("!__bf.exact('Light')", 'the Settings dialog to close')
  }

  /** Put the operator's theme back. Runs on the way out of a good run and a failed one alike. */
  const restoreTheme = async () => {
    if (operatorTheme === null || operatorTheme === theme) return
    try {
      await chooseTheme(operatorTheme)
      say(`  The workbench is back on the ${operatorTheme} theme.`)
    } catch (error) {
      say(`  Could not put the ${operatorTheme} theme back (${error.message}) — set it in Settings.`)
    }
    operatorTheme = null
  }

  /** What the run observed, step by step. This is the evidence the story's acceptance criteria are checked against, not a claim made afterwards. */
  const observations = []
  const beats = []
  let started = 0

  /** Sample the disclosed provider, the egress count and the routed model at this instant. */
  const observe = async (label) => {
    const sample = await evaluate(
      `(() => ({ provider: __bf.provider(), egress: __bf.egress(), model: __bf.routedModel() }))()`,
    )
    observations.push({ at: Number(((Date.now() - started) / 1000).toFixed(2)), label, ...sample })
    return sample
  }

  /** Mark a beat, sample what was on screen at it, and save a still for the story's both-theme evidence. */
  const mark = async (id, label) => {
    const at = Number(((Date.now() - started) / 1000).toFixed(2))
    const sample = await observe(`beat ${id}`)
    beats.push({ id, label, at, provider: sample.provider?.label ?? null, egress: sample.egress, model: sample.model })
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    mkdirSync(stillsDir, { recursive: true })
    writeFileSync(join(stillsDir, `6-5-${id}-${theme}.png`), Buffer.from(shot.data, 'base64'))
    say(`  [${String(at).padStart(6)}s] ${label}`)
  }

  try {
    step('Recording')
    await cdp.send('Page.navigate', { url: workbenchUrl })
    // The helpers live on the document that actually loaded, so they go in
    // after the composer exists rather than before the navigation.
    await waitFor("!!document.querySelector('textarea')", 'the workbench to finish loading')
    await evaluate(PAGE_HELPERS)

    // The theme belongs to the operator, so the recorder asks for it the way an
    // operator does — through Settings — and puts the choice back when it is
    // done. Nothing here writes to the profile behind the workbench's back.
    operatorTheme = await evaluate('__bf.preference()')
    if (operatorTheme === null) throw new Error('the workbench did not disclose which theme it is set to')
    say(`  The workbench is set to the ${operatorTheme} theme; recording in ${theme}.`)
    await chooseTheme(theme)

    await cdp.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 90,
      maxWidth: VIEWPORT.width,
      maxHeight: VIEWPORT.height,
      everyNthFrame: 1,
    })
    started = Date.now()
    await sleep(3000)
    await mark('00-workbench', 'Faraday, sealed and idle')

    // ---------------------------------------------------------------- beat 1: the canary
    //
    // A one-word turn first, only so the session header exists: the egress
    // monitor and the provider disclosure live there, and a monitor reading
    // zero is the thing the canary is about to disprove the silence of.
    await evaluate('__bf.composer().focus()')
    await typeText('hello')
    await pressEnter()
    await waitFor('/replay mode/i.test(__bf.text())', 'the first turn to answer')
    await waitFor('__bf.egress() !== null', 'the egress monitor to appear in the session header')
    await sleep(2000)
    const atZero = await observe('egress monitor before the canary')
    if (atZero.egress !== 'Egress 0') {
      throw new Error(`the egress monitor read "${atZero.egress}" before the canary, not "Egress 0"`)
    }
    await mark('01-egress-zero', `egress monitor at zero — provider: ${atZero.provider?.label}`)

    await evaluate('__bf.button("Fire the canary").click()')
    await waitFor('!!__bf.button("Canary denied")', 'egress denial to refuse the canary')
    await waitFor('__bf.egress() === "Egress 1"', 'the egress monitor to count the denial')
    await sleep(2500)
    await observe('after the canary')
    await mark('02-canary-denied', 'canary fired, denied, counted')

    await evaluate('__bf.button("Egress monitor").click()')
    await waitFor('/Audit log/i.test(__bf.text())', 'the audit log to open')
    await waitFor('/bf_canary/.test(__bf.text())', 'the audit line for the canary')
    await sleep(6000)
    await mark('03-audit-log', 'the audit line, on screen')
    await evaluate('__bf.button("Dismiss").click()')
    await sleep(1500)

    // ---------------------------------------------------------------- beat 2: the routing chip
    //
    // Two turns of different task types, back to back. Nothing here picks a
    // model: the operator types a request and the router changes the fleet
    // member by itself, which is the claim being judged.
    await evaluate('__bf.composer().focus()')
    await typeText('Summarise the key findings in the ingested inspection report.')
    await pressEnter()
    await waitFor('/PSV-2207A/.test(__bf.text())', 'the findings turn to answer')
    await waitFor('__bf.routedModel() === "Qwen2.5-VL-7B-Instruct"', 'the router to pick the vision-document model')
    await sleep(3000)
    const documentTurn = await observe('document task type')
    await mark('04-routing-document', `routing chip: ${documentTurn.model}`)

    await evaluate('__bf.button("The router picked").click()')
    await waitFor('/score/i.test(__bf.text())', 'the routing chip to show its working')
    await sleep(6000)
    await mark('05-routing-scores', 'the score per fleet member')
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await sleep(1500)

    await evaluate('__bf.composer().focus()')
    await typeText('Run a coding task in the sandbox: write a Python function for the tag parser and cover it with unit tests.')
    await pressEnter()
    await waitFor('/sandbox ran that/i.test(__bf.text())', 'the sandbox turn to answer')
    await waitFor('__bf.routedModel() === "Qwen2.5-Coder-7B-Instruct"', 'the router to change model by itself')
    await sleep(5000)
    const codeTurn = await observe('code task type')
    await mark('06-routing-code', `routing chip changed by itself: ${codeTurn.model}`)

    // ---------------------------------------------------------------- beat 3: the deliverable
    await evaluate('__bf.composer().focus()')
    await typeText('Generate the approval note for the PSV-2207A non-conformance.')
    await pressEnter()
    await waitFor('/approval-note-NRC-RVF-APPR-0417\\.docx/.test(__bf.text())', 'the approval note to be produced')
    await sleep(7000)
    const deliverableTurn = await observe('approval note produced')
    await mark('07-approval-note', 'the approval note, as a signed .docx')

    await sleep(3000)
    await cdp.send('Page.stopScreencast')
    await restoreTheme()

    const durationS = Number(((Date.now() - started) / 1000).toFixed(2))

    // ---------------------------------------------------------------- what the run proves
    step('Checking the run against the story')

    // ADR-0001 asks for more than the absence of the word "remote": every
    // sample has to positively disclose the replay provider, and a sample that
    // read nothing at all would prove nothing either way.
    //
    // Exactly one sample is allowed to read nothing, and only the first: the
    // disclosure lives in the session header, which does not exist until the
    // first turn, so the opening shot of the idle workbench has no provider to
    // read. Any later blank is a disclosure that stopped rendering, and a run
    // that cannot show which provider answered proves nothing either way.
    const blanks = observations.filter((sample) => sample.provider === null)
    const disclosed = observations.filter((sample) => sample.provider !== null)
    if (blanks.length > 1 || (blanks.length === 1 && observations[0].provider !== null)) {
      throw new Error(
        `the provider disclosure was unreadable at ${blanks.map((sample) => `${sample.at}s (${sample.label})`).join(', ')} — ` +
          'only the opening shot, taken before the first turn creates the session header, may have none',
      )
    }
    const notReplay = disclosed.filter(
      (sample) => !/^Replay\b/.test(sample.provider.label) || !/replay provider/.test(sample.provider.title),
    )
    if (notReplay.length > 0) {
      throw new Error(
        `a provider other than replay was disclosed at ${notReplay.map((sample) => `${sample.at}s (${sample.provider.label})`).join(', ')} — ` +
          'ADR-0001 keeps the remote provider out of every demo',
      )
    }
    say(
      `  The workbench disclosed "${disclosed[0].provider.label}" at all ${disclosed.length} samples across the run — ` +
        'the remote provider was never active (ADR-0001).',
    )

    const hook = beats.find((beat) => beat.id === '03-audit-log')
    if (hook.at > HOOK_DEADLINE_S) {
      throw new Error(`the hook — canary denied and audited — landed at ${hook.at}s, past the ${HOOK_DEADLINE_S}s NFR9 deadline`)
    }
    say(`  The hook lands at ${hook.at}s, inside the ${HOOK_DEADLINE_S}s NFR9 deadline.`)

    if (durationS > MAX_DURATION_S) {
      throw new Error(`the run took ${durationS}s, past the ${MAX_DURATION_S}s NFR9 ceiling`)
    }
    say(`  The run is ${durationS}s, inside the ${MAX_DURATION_S}s NFR9 ceiling.`)
    say(`  ${deliverableTurn.model ? `Final routed model: ${deliverableTurn.model}.` : ''}`)

    // ---------------------------------------------------------------- mux
    step(`Encoding ${frames.length} captured frames`)
    if (frames.length < 30) fail(`only ${frames.length} frames were captured — the screencast did not run`)

    const manifest = []
    frames.forEach((frame, index) => {
      const name = `frame-${String(index).padStart(6, '0')}.jpg`
      writeFileSync(join(framesDir, name), Buffer.from(frame.data, 'base64'))
      // Chrome emits a frame only when the page repaints, so a still moment is
      // one frame held for a long time. Carrying the real gap through to the
      // concat list is what keeps the video the same length as the run.
      const next = frames[index + 1]
      const held = next ? Math.max(0.033, next.timestamp - frame.timestamp) : 1.2
      manifest.push(`file '${name}'`, `duration ${held.toFixed(3)}`)
    })
    // The concat demuxer ignores the duration of the last entry unless the file
    // is named once more after it.
    manifest.push(`file 'frame-${String(frames.length - 1).padStart(6, '0')}.jpg'`)
    const listPath = join(framesDir, 'frames.txt')
    writeFileSync(listPath, manifest.join('\n'))

    mkdirSync(dirname(outPath), { recursive: true })
    const encode = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'concat',
        '-safe', '0',
        '-i', listPath,
        '-r', '30',
        '-c:v', 'libx264',
        '-preset', 'medium',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        outPath,
      ],
      { encoding: 'utf8' },
    )
    if (encode.status !== 0) fail(`ffmpeg failed:\n${encode.stderr || encode.stdout}`)

    const probe = spawnSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'default=noprint_wrappers=1', outPath],
      { encoding: 'utf8' },
    )
    const encoded = Object.fromEntries(
      (probe.stdout || '')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => line.split('=')),
    )

    const recordPath = join(dirname(outPath), `recording-${theme}.json`)
    writeFileSync(
      recordPath,
      `${JSON.stringify(
        {
          recorded: new Date().toISOString(),
          workbench: workbenchUrl,
          theme,
          viewport: VIEWPORT,
          chrome: version.Browser,
          durationS,
          frames: frames.length,
          video: { path: outPath.slice(repoRoot.length + 1).replace(/\\/g, '/'), ...encoded },
          beats,
          observations,
        },
        null,
        2,
      )}\n`,
    )

    step('Done')
    say(`  Video      ${outPath}`)
    say(`  Evidence   ${recordPath}`)
    say(`  Stills     ${stillsDir}\\6-5-*-${theme}.png`)
    if (keepFrames) say(`  Frames     ${framesDir}`)
  } catch (error) {
    try {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
      mkdirSync(stillsDir, { recursive: true })
      const wreck = join(stillsDir, `6-5-failed-${theme}.png`)
      writeFileSync(wreck, Buffer.from(shot.data, 'base64'))
      say(`\n  The page as it stood when this failed: ${wreck}`)
    } catch {
      /* nothing more to learn from a page that will not screenshot */
    }
    await restoreTheme()
    cdp.close()
    browser.kill()
    fail(error.message)
  } finally {
    cdp.close()
    browser.kill()
    if (!keepFrames) rmSync(framesDir, { recursive: true, force: true })
    rmSync(chromeProfile, { recursive: true, force: true })
  }
}

await main()
