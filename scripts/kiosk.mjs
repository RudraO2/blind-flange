#!/usr/bin/env node
// Blind Flange (SIH26117) — start the workbench in kiosk mode.
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
//   1. **It waits for both ports to answer** before opening anything. Launching
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
// Start sequence:
//   landing-server.mjs (port landingPort) ─┐
//   start.mjs → dsh web  (port workPort)  ─┴─ both ready → browser opens landingUrl
//
// The browser navigates to the workbench (workUrl) when the user clicks
// "Launch Workbench" — no modification to the dsh/harness internals.
//
// Exit the kiosk window with Alt+F4, or stop everything here with Ctrl+C.
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
/** The workbench (dsh) port — default 3080. */
const workPort = portIndex === -1 ? '3080' : args[portIndex + 1]
/** The landing page port — always one below the workbench port. */
const landingPort = String(Number(workPort) - 1)
const workUrl    = `http://127.0.0.1:${workPort}/`
const landingUrl = `http://127.0.0.1:${landingPort}/`
/** Everything except our own `--port` pair, forwarded to the harness untouched. */
const passthrough = args.filter((_, index) => portIndex === -1 || (index !== portIndex && index !== portIndex + 1))

const say = (message) => console.log(message)
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

/**
 * Poll a URL until it answers with an OK response.
 * @param {string} targetUrl - URL to poll.
 * @param {ChildProcess|null} watchProcess - If this process exits, stop polling.
 * @param {number} deadlineMs - Maximum wait time.
 */
async function waitForUrl(targetUrl, watchProcess, deadlineMs = 120_000) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(targetUrl, { signal: AbortSignal.timeout(1500) })
      if (response.ok) return true
    } catch {
      /* not up yet */
    }
    if (watchProcess && watchProcess.exitCode !== null) return false
    await sleep(400)
  }
  return false
}

// ── servers ──────────────────────────────────────────────────────────────────

say('\n  Starting Blind Flange. The landing page will open fullscreen when both servers are ready.')
say('  Close the window with Alt+F4, or stop everything here with Ctrl+C.\n')

/** DSH workbench — unchanged from before. */
const server = spawn(
  process.execPath,
  [join(repoRoot, 'scripts', 'start.mjs'), '--no-open', '--port', workPort, ...passthrough],
  { stdio: 'inherit' },
)

/** Landing page static server — completely separate from dsh. */
const landingServer = spawn(
  process.execPath,
  [join(repoRoot, 'scripts', 'landing-server.mjs'), '--port', landingPort],
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

/** Take down all three halves (landing server + dsh server + browser), exactly once. */
function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  killTree(browser)
  killTree(landingServer)
  killTree(server)
  process.exit(code ?? 0)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
server.on('exit', (code) => shutdown(code ?? 0))
landingServer.on('exit', (code) => {
  // Landing server crash is non-fatal if the workbench itself is still up —
  // the operator can navigate to workUrl directly.
  if (code !== 0 && !shuttingDown) {
    say(`\n  [landing] Landing server exited (code ${code}). The workbench is still at ${workUrl}\n`)
  }
})

// ── the kiosk window ────────────────────────────────────────────────────────

// Wait for both servers concurrently — no point holding up the browser for the
// slower one if the other is already answering.
say('  Waiting for both servers to be ready…')
const [workbenchReady, landingReady] = await Promise.all([
  waitForUrl(workUrl, server, 120_000),
  waitForUrl(landingUrl, landingServer, 30_000),
])

if (!workbenchReady) {
  console.error('\n  The workbench did not start, so there is nothing to open.')
  console.error('  The messages above say why. `npm run doctor` checks the install.\n')
  shutdown(1)
}

if (!landingReady) {
  // Non-fatal: fall back to opening the workbench directly.
  say('\n  [landing] Landing server did not answer in time; opening the workbench directly.')
}

// Open the landing page when it is up; fall back to the workbench URL.
const openUrl = landingReady ? landingUrl : workUrl

const found = BROWSERS.find(([, path]) => existsSync(path))
if (!found) {
  say('\n  No Chrome or Edge found, so the kiosk window cannot be opened.')
  say(`  Both servers are running — open ${landingUrl} in any browser, and press F11`)
  say('  for fullscreen. Stop everything here with Ctrl+C.\n')
} else {
  const [name, path] = found
  say(`\n  Opening the landing page fullscreen in ${name}.\n`)
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
      openUrl,
    ],
    { stdio: 'ignore', detached: false },
  )
  browser.on('exit', () => {
    // Closing the window is the operator saying they are done.
    if (!shuttingDown) {
      say('\n  Kiosk window closed. Stopping all servers.\n')
      shutdown(0)
    }
  })
  browser.on('error', (error) => {
    say(`\n  Could not open ${name} (${error.message}).`)
    say(`  Servers are running — open ${landingUrl} in any browser.\n`)
    browser = null
  })
}
