#!/usr/bin/env node
// Faraday (SIH26117) — start the workbench in kiosk mode.
//
// `npm run kiosk`, which is what `run.bat` does when double-clicked. Starts
// the workbench, waits for it to actually answer, and opens it fullscreen with
// no address bar, no tabs and no bookmarks — so a judge sees the workbench
// rather than somebody's browser.
//
// The harness has no kiosk mode of its own: `dsh web` opens an ordinary tab in
// the default browser, and its only related flag is `--no-open`. So this
// starts the server with `--no-open` and drives the browser itself.
//
// Three details that matter:
//
//   1. **It waits for the port to answer** before opening anything. Launching
//      the browser first gives a judge an error page for a second, which is
//      exactly the wrong first frame.
//   2. **A dedicated browser profile.** Chrome and Edge hand a new window to an
//      already-running instance, which silently ignores `--kiosk`. A separate
//      `--user-data-dir` forces a real second instance, and keeps this out of
//      the operator's own browser profile, history and open tabs.
//   3. **The browser is closed when the server stops.** Ctrl+C here takes the
//      whole thing down rather than leaving a fullscreen window with nothing
//      behind it, which cannot easily be escaped from.
//
// Exit the kiosk window with Alt+F4, or stop the server here with Ctrl+C.
//
// Node builtins only, by policy.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Chromium-family browsers, best first. Any of them takes `--kiosk`. */
const BROWSERS = [
  ['Google Chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'],
  ['Google Chrome', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
  ['Google Chrome', join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe')],
  ['Microsoft Edge', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'],
  ['Microsoft Edge', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
]

/** Kept between runs so the workbench opens the way it was left. Never the operator's own profile. */
const BROWSER_PROFILE = join(homedir(), '.blind-flange', 'kiosk-browser-profile')

const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const port = portIndex === -1 ? '3080' : args[portIndex + 1]
const url = `http://127.0.0.1:${port}/`
/** Everything except our own `--port` pair, forwarded to the harness untouched. */
const passthrough = args.filter((_, index) => portIndex === -1 || (index !== portIndex && index !== portIndex + 1))

const say = (message) => console.log(message)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/** Poll the workbench until it answers, so the first frame is never an error page. */
async function waitForWorkbench(deadlineMs = 120_000) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (response.ok) return true
    } catch {
      /* not up yet */
    }
    if (server.exitCode !== null) return false
    await sleep(400)
  }
  return false
}

// ── the server ──────────────────────────────────────────────────────────────

say('\n  Starting Faraday. The workbench will open fullscreen when it is ready.')
say('  Close it with Alt+F4, or stop everything here with Ctrl+C.\n')

const server = spawn(
  process.execPath,
  [join(repoRoot, 'scripts', 'start.mjs'), '--no-open', '--port', port, ...passthrough],
  { stdio: 'inherit' },
)

let browser = null
let shuttingDown = false

/**
 * Kill a process and everything it started.
 *
 * `child.kill()` signals only the process we spawned. On Windows that leaves
 * its own children running: `start.mjs` launches `dsh web` through a shell, so
 * killing `start.mjs` orphans the harness — still listening on the port, with
 * nothing left to stop it. The next run then fails with `EADDRINUSE` and looks
 * like a broken install rather than a stale process, which is a miserable way
 * to lose a demo. `taskkill /T` takes the whole tree.
 */
function killTree(child) {
  if (!child || child.exitCode !== null || child.pid === undefined) return
  try {
    if (process.platform === 'win32') {
      // Synchronously: an async spawn here loses the race with process.exit
      // below and the tree survives, which is the whole bug this guards.
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } else {
      process.kill(-child.pid, 'SIGTERM')
    }
  } catch {
    /* already gone */
  }
  try {
    child.kill()
  } catch {
    /* already gone */
  }
}

/** Take down both halves, in either order, exactly once. */
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  killTree(browser)
  killTree(server)
  process.exit(code ?? 0)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
server.on('exit', (code) => shutdown(code ?? 0))

// ── the kiosk window ────────────────────────────────────────────────────────

const ready = await waitForWorkbench()
if (!ready) {
  console.error('\n  The workbench did not start, so there is nothing to open.')
  console.error('  The messages above say why. `npm run doctor` checks the install.\n')
  shutdown(1)
}

const found = BROWSERS.find(([, path]) => existsSync(path))
if (!found) {
  say('\n  No Chrome or Edge found, so the kiosk window cannot be opened.')
  say(`  The workbench is running — open ${url} in any browser, and press F11`)
  say('  for fullscreen. Stop it here with Ctrl+C.\n')
} else {
  const [name, path] = found
  say(`\n  Opening the workbench fullscreen in ${name}.\n`)
  browser = spawn(
    path,
    [
      '--kiosk',
      `--user-data-dir=${BROWSER_PROFILE}`,
      '--no-first-run',
      '--no-default-browser-check',
      // The workbench is the whole screen; none of this belongs on it.
      '--disable-features=Translate,AutofillServerCommunication',
      '--disable-background-networking',
      url,
    ],
    { stdio: 'ignore', detached: false },
  )
  browser.on('exit', () => {
    // Closing the window is the operator saying they are done.
    if (!shuttingDown) {
      say('\n  Kiosk window closed. Stopping the workbench.\n')
      shutdown(0)
    }
  })
  browser.on('error', (error) => {
    say(`\n  Could not open ${name} (${error.message}).`)
    say(`  The workbench is running — open ${url} in any browser.\n`)
    browser = null
  })
}
