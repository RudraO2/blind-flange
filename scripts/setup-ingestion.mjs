#!/usr/bin/env node
// Blind Flange (SIH26117) — install the Python ingestion service.
//
// `npm run setup-ingestion`. Separate from `npm start` on purpose: the
// workbench does not call this service at runtime. `findings/tool.js` reads a
// committed capture of a real response it produced, so the whole demo runs
// without Python installed at all.
//
// What this is for is checking that the capture is real. Run it and the OCR
// engine reads the same scanned report again on this machine, and you can
// compare what comes back against what ships.
//
// Two things here are load-bearing rather than housekeeping:
//
//   1. **shapely is uninstalled, deliberately.** RapidOCR's detector pulls it
//      in, its wheel bundles the GEOS shared libraries, and GEOS is LGPL-2.1 —
//      weak copyleft, outside the allow-list in docs/licence-policy.md.
//      `ocr.py` supplies the two `Polygon` properties the detector actually
//      uses and registers them under `shapely` first, so the output is
//      identical. A plain `pip install -r requirements.txt` leaves the real
//      package on disk and quietly breaks the licence claim, which is exactly
//      the kind of silent breakage this script exists to prevent.
//   2. **It installs into a virtual environment**, not the global interpreter,
//      so the tree whose licences the audit enumerates is the tree that
//      actually ships rather than whatever else a machine happens to have.
//
// Node builtins only, by policy — a setup script is not a good reason to widen
// the licence allow-list. Nothing here downloads a model: RapidOCR ships its
// three PP-OCRv6 ONNX models inside its own wheel.
//
// Usage:
//   npm run setup-ingestion            # create the venv and install
//   npm run setup-ingestion -- --check # report what is installed, change nothing

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serviceDir = join(repoRoot, 'services', 'ingestion')
const venvDir = join(serviceDir, '.venv')
const checkOnly = process.argv.slice(2).includes('--check')

/** Python the ingestion service was verified against; a minimum, not a pin. */
const MIN_PYTHON = '3.11'

/** The package whose bundled GEOS is outside the allow-list. Never left installed. */
const FORBIDDEN = 'shapely'

const say = (message) => console.log(message)
const step = (message) => console.log(`\n==> ${message}`)

function fail(message) {
  console.error(`\nIngestion setup stopped: ${message}\n`)
  process.exit(1)
}

/** The venv's own interpreter, wherever this platform puts it. */
const venvPython = () =>
  [join(venvDir, 'Scripts', 'python.exe'), join(venvDir, 'bin', 'python')].find((exe) => existsSync(exe)) ?? null

function capture(exe, args) {
  const result = spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() }
}

function run(exe, args, description) {
  const result = spawnSync(exe, args, { stdio: 'inherit' })
  if (result.status !== 0) fail(`${description} failed (exit ${result.status}).`)
}

/** Compare dotted versions numerically. */
function versionAtLeast(actual, minimum) {
  const parse = (value) => (value.match(/\d+/g) || []).map(Number)
  const a = parse(actual)
  const b = parse(minimum)
  for (let i = 0; i < b.length; i += 1) {
    const left = a[i] ?? 0
    if (left > b[i]) return true
    if (left < b[i]) return false
  }
  return true
}

/** The first interpreter on PATH that runs and is new enough. */
function findSystemPython() {
  for (const exe of ['python', 'python3', 'py']) {
    const probe = capture(exe, ['--version'])
    if (probe.status !== 0) continue
    const version = `${probe.stdout} ${probe.stderr}`.replace(/[^\d.]/g, ' ').trim().split(/\s+/)[0]
    if (version && versionAtLeast(version, MIN_PYTHON)) return { exe, version }
  }
  return null
}

// ── check mode ──────────────────────────────────────────────────────────────

if (checkOnly) {
  const python = venvPython()
  if (!python) {
    say('The ingestion service is not installed (no virtual environment).')
    say('Install it with `npm run setup-ingestion`. The workbench runs without it.')
    process.exit(0)
  }
  const packages = capture(python, ['-m', 'pip', 'list', '--format=freeze'])
  const installed = packages.stdout.split('\n').filter(Boolean)
  say(`Virtual environment: ${venvDir}`)
  say(`Packages installed:  ${installed.length}`)
  const forbidden = installed.find((line) => line.toLowerCase().startsWith(`${FORBIDDEN}==`))
  say(forbidden ? `  PROBLEM: ${forbidden} is installed — its bundled GEOS is LGPL-2.1` : `  ${FORBIDDEN} is absent, as it must be`)
  process.exit(forbidden ? 1 : 0)
}

// ── 1. an interpreter ───────────────────────────────────────────────────────

step('Looking for Python')
const system = findSystemPython()
if (!system) {
  fail(
    `no Python ${MIN_PYTHON} or newer on PATH.\n` +
      '  Install it from https://python.org (tick "Add python.exe to PATH"), then run this again.\n' +
      '  The workbench itself does not need Python — `npm start` works without this step.',
  )
}
say(`  ${system.exe} ${system.version} (needs >= ${MIN_PYTHON})`)

// ── 2. the virtual environment ──────────────────────────────────────────────

step('Creating the virtual environment')
if (venvPython()) {
  say(`  already exists at ${venvDir}`)
} else {
  run(system.exe, ['-m', 'venv', venvDir], 'Creating the virtual environment')
  say(`  ${venvDir}`)
}
const python = venvPython()
if (!python) fail('the virtual environment was created but has no interpreter inside it')

// ── 3. the pinned dependencies ──────────────────────────────────────────────

step('Installing the pinned dependencies')
say('  This is the only step that uses the network. No model weights are downloaded —')
say('  RapidOCR ships its three PP-OCRv6 ONNX models inside its own wheel.')
run(python, ['-m', 'pip', 'install', '--upgrade', 'pip', '--quiet'], 'Upgrading pip')

// All three, not just the service's own. `scripts/licence_audit.py` enumerates
// the service, its fixture generator and its proof scripts as one Python tree,
// and the evidence paths in docs/licence-decisions.json point into it —
// reportlab's GPL font notice among them. Installing only requirements.txt
// would leave the audit unable to check evidence it claims to have checked,
// which is a worse outcome than a slightly larger virtual environment.
const REQUIREMENTS = [
  ['requirements.txt', join(serviceDir, 'requirements.txt'), 'the ingestion service itself'],
  ['requirements-fixtures.txt', join(serviceDir, 'requirements-fixtures.txt'), 'the sample-report generator'],
  ['proof/requirements-proof.txt', join(serviceDir, 'proof', 'requirements-proof.txt'), 'the timeboxed engine proofs'],
]
for (const [label, path, why] of REQUIREMENTS) {
  if (!existsSync(path)) fail(`${label} is missing from this checkout`)
  say(`\n  ${label} — ${why}`)
  run(python, ['-m', 'pip', 'install', '-r', path], `Installing ${label}`)
}

// ── 4. the licence step that is not optional ────────────────────────────────

step(`Removing ${FORBIDDEN}`)
const listed = capture(python, ['-m', 'pip', 'list', '--format=freeze'])
if (listed.stdout.toLowerCase().split('\n').some((line) => line.startsWith(`${FORBIDDEN}==`))) {
  say(`  pip pulled ${FORBIDDEN} in as a dependency of rapidocr. Its wheel bundles GEOS, which is`)
  say('  LGPL-2.1 and outside the allow-list, so it comes back out. ocr.py already supplies the')
  say('  two Polygon properties RapidOCR actually uses. Output is identical.')
  run(python, ['-m', 'pip', 'uninstall', '-y', FORBIDDEN], `Uninstalling ${FORBIDDEN}`)
} else {
  say(`  not installed — nothing to remove`)
}

const after = capture(python, ['-m', 'pip', 'list', '--format=freeze'])
if (after.stdout.toLowerCase().split('\n').some((line) => line.startsWith(`${FORBIDDEN}==`))) {
  fail(`${FORBIDDEN} is still installed after the uninstall step. The licence claim does not hold with it present.`)
}
say(`  ${FORBIDDEN} is absent`)

// ── 5. prove it actually works ──────────────────────────────────────────────

step('Checking the service runs')
const tests = spawnSync(python, ['-m', 'unittest', 'test_service', '-v'], { cwd: serviceDir, stdio: 'inherit' })
if (tests.status !== 0) {
  fail(
    'the ingestion service\'s own tests did not pass. That is a real failure, not a\n' +
      '  setup wrinkle — the tests are what hold the sealed-import and no-GEOS lines.',
  )
}

step('Ingestion service installed')
say(`  Interpreter  ${python}`)
say('  Run it       npm run ingestion')
say('  Re-check     npm run setup-ingestion -- --check')
say('')
say('  The workbench does not call this service — it reads a committed capture of a real')
say('  response (plugins/dsh-client-ui-base/lib/findings/sample-report-findings.json).')
say('  Having run the tests above, you have now seen that capture reproduced on this machine.')
