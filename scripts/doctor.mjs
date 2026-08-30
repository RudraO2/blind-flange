#!/usr/bin/env node
// Faraday (SIH26117) — is this install actually working?
//
// `npm run doctor`. Written for the person who just cloned this and wants to
// know whether it is set up correctly before trusting anything it shows them.
//
// Every check states what it looked at and what it found. A failure says what
// to run next in plain words rather than printing a stack trace. Checks are
// grouped so a missing optional piece (Python) never reads as a broken install.
//
// It deliberately does NOT start the workbench or take over the terminal —
// run it before `npm start`, or in another window while that one is serving.
//
// Node builtins only, by policy.

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')

const HARNESS_VERSION = '0.1.1-rc.2'
const MIN_NODE = '22.15.0'
const PROFILES = ['web', 'headless']
/** The adopted panel plugin and its pin — kept in step with scripts/start.mjs. */
const GENUI_PACKAGE = '@changfenhuang/dsh-genui'
const GENUI_VERSION = '0.9.3'

const args = process.argv.slice(2)
const portFlag = args.indexOf('--port')
const port = portFlag === -1 ? '3080' : args[portFlag + 1]

/** @type {{ level: 'ok' | 'warn' | 'fail', section: string, message: string, fix?: string }[]} */
const results = []
let section = ''

const heading = (title) => {
  section = title
  console.log(`\n${title}`)
}
const ok = (message) => {
  results.push({ level: 'ok', section, message })
  console.log(`  [ ok ] ${message}`)
}
const warn = (message, fix) => {
  results.push({ level: 'warn', section, message, fix })
  console.log(`  [note] ${message}`)
  if (fix) console.log(`         ${fix}`)
}
const bad = (message, fix) => {
  results.push({ level: 'fail', section, message, fix })
  console.log(`  [FAIL] ${message}`)
  if (fix) console.log(`         ${fix}`)
}

function capture(command, args_ = []) {
  const result = spawnSync(command, args_, { shell: args_.length === 0, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() }
}

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

console.log('Faraday — checking this install')
console.log(`  repository   ${repoRoot}`)
console.log(`  harness home ${dshHome}${process.env.DSH_HOME ? ' (from DSH_HOME)' : ''}`)

// ── the toolchain ───────────────────────────────────────────────────────────

heading('Toolchain')

const node = capture('node -v')
if (node.status === 0 && versionAtLeast(node.stdout.replace(/^v/, ''), MIN_NODE)) {
  ok(`Node ${node.stdout.replace(/^v/, '')}`)
} else {
  bad(`Node ${node.stdout || 'not found'} — needs ${MIN_NODE} or newer`, 'Install from https://nodejs.org and re-open this terminal.')
}

const pnpm = capture('pnpm -v')
if (pnpm.status === 0) ok(`pnpm ${pnpm.stdout}`)
else bad('pnpm is not on PATH', 'Run `npm install -g pnpm`. The harness shells out to it to install plugins.')

const dsh = capture('dsh --version')
const dshVersion = dsh.status === 0 ? dsh.stdout.split('\n')[0].trim() : null
if (dshVersion === HARNESS_VERSION) ok(`DeepSeek Harness ${dshVersion} (the pinned version)`)
else if (dshVersion) warn(`DeepSeek Harness ${dshVersion}, but this was built against ${HARNESS_VERSION}`, 'Run `npm start` — it installs the pinned version.')
else bad('DeepSeek Harness is not installed', 'Run `npm start`, or `npm run setup` to install without starting.')

// ── the profile wiring ──────────────────────────────────────────────────────

heading('Profile wiring')

for (const profile of PROFILES) {
  const manifest = join(dshHome, 'profiles', profile, 'package.json')
  if (!existsSync(manifest)) {
    bad(`the ${profile} profile has no package.json`, 'Run `npm run setup`.')
    continue
  }
  const dependency = JSON.parse(readFileSync(manifest, 'utf8')).dependencies?.['@blind-flange/dsh-client-ui-base']
  if (!dependency) {
    bad(`the ${profile} profile does not depend on our plugin package`, 'Run `npm run setup`.')
  } else if (!dependency.startsWith('link:')) {
    warn(`the ${profile} profile depends on our plugin as "${dependency}", not a link:`, 'Run `npm run setup` so plugin edits reach the browser without a reinstall.')
  } else {
    const target = dependency.slice('link:'.length).replace(/\//g, '\\')
    const here = join(repoRoot, 'plugins', 'dsh-client-ui-base')
    if (resolve(target).toLowerCase() === resolve(here).toLowerCase()) ok(`the ${profile} profile points at this checkout`)
    else bad(`the ${profile} profile points at ${target}, not this checkout`, 'Run `npm run setup` — the path is baked in and this repo has moved or been re-cloned.')
  }

  const patch = join(dshHome, 'profiles', profile, 'cordis.patch.yml')
  if (existsSync(patch)) {
    const written = readFileSync(patch, 'utf8')
    const source = readFileSync(join(repoRoot, 'profile', profile, 'cordis.patch.yml'), 'utf8')
    if (written.trim() === source.trim()) ok(`the ${profile} patch layer matches the tracked copy`)
    else warn(`the ${profile} patch layer differs from profile/${profile}/cordis.patch.yml`, 'Run `npm run setup` — the tracked copy is the source of truth and will overwrite it.')
  } else {
    bad(`the ${profile} profile has no cordis.patch.yml`, 'Run `npm run setup`.')
  }
}

// The adopted panel plugin (Story 8.1). Web only, and pinned: a range or a
// newer version is a finding, not a convenience — 0.9.4 and 0.9.5 add surfaces
// this project turned down, and an unpinned adoption is what the epic's
// adoption gate exists to prevent.
const webManifest = join(dshHome, 'profiles', 'web', 'package.json')
if (existsSync(webManifest)) {
  const adopted = JSON.parse(readFileSync(webManifest, 'utf8')).dependencies?.[GENUI_PACKAGE]
  if (adopted === GENUI_VERSION) ok(`the web profile has ${GENUI_PACKAGE} at the pinned ${GENUI_VERSION}`)
  else if (adopted) bad(`the web profile has ${GENUI_PACKAGE} at "${adopted}", not the pinned ${GENUI_VERSION}`, 'Run `npm run setup`.')
  else bad(`the web profile does not have ${GENUI_PACKAGE}`, 'Run `npm run setup` — the key findings render through it.')
}

const workspaces = join(dshHome, 'storages', 'workspace.json')
if (existsSync(workspaces)) ok('a workspace is registered, so the composer can start a session')
else bad('no workspace is registered', 'Run `npm run setup` — without one the composer will not send.')

// ── what the sovereignty claim rests on ─────────────────────────────────────

heading('The seal')

const webPatch = join(dshHome, 'profiles', 'web', 'cordis.patch.yml')
if (existsSync(webPatch)) {
  const patch = readFileSync(webPatch, 'utf8')
  const provider = patch.match(/provider:\s*(\w+)/)?.[1]
  // `local` and `replay` are both sealed: one runs open-weight models on this
  // machine's GPU through llama-swap, the other answers from the authored cache.
  // Only `remote` reaches off the box, and ADR-0001 keeps it out of every demo.
  // This check asserted `replay` until 31 August 2026, which had it failing on
  // every machine running the local inference lanes it was meant to reassure.
  if (provider === 'local') ok('the model plane is set to the local provider — real inference on this GPU')
  else if (provider === 'replay') ok('the model plane is set to the replay provider — answers come from the authored cache')
  else if (provider) bad(`the model plane is set to "${provider}", which reaches off this machine`, 'ADR-0001 keeps `remote` out of every demo. Check profile/web/cordis.patch.yml.')
  else warn('could not read which model provider the profile selects', 'Check profile/web/cordis.patch.yml by hand.')

  if (/web-search/.test(patch) && /disabled:\s*true/.test(patch)) ok('the web-search tool is disabled in the profile')
  else warn('could not confirm the web-search tool is disabled', 'Open the tool list in the running workbench and check it by eye.')
} else {
  bad('the web profile has no patch layer, so nothing is sealed', 'Run `npm run setup`.')
}

// ── our own tests ───────────────────────────────────────────────────────────

heading('Our own tests')

const unitRan = spawnSync('node', ['--test'], { cwd: join(repoRoot, 'plugins', 'dsh-client-ui-base'), encoding: 'utf8' })
const passed = (unitRan.stdout || '').match(/^# pass (\d+)$/m)?.[1]
const failed = (unitRan.stdout || '').match(/^# fail (\d+)$/m)?.[1]
if (unitRan.status === 0 && passed) ok(`${passed} plugin tests pass`)
else bad(`the plugin tests did not pass (${failed ?? '?'} failing)`, 'Run `npm test` to see which.')

const audit = spawnSync('node', [join(repoRoot, 'scripts', 'licence-audit.mjs')], { encoding: 'utf8' })
if (audit.status === 0) {
  const count = (audit.stdout || '').match(/(\d+) components/)?.[1]
  ok(`the licence audit passes — ${count ?? 'all'} components enumerated, every one decided`)
} else {
  bad('the licence audit fails', `Run \`npm run licence-audit\` to see why.\n         ${(audit.stdout || audit.stderr || '').split('\n').filter(Boolean).slice(-2).join('\n         ')}`)
}

// ── is it up? ───────────────────────────────────────────────────────────────

heading('Is the workbench running?')

try {
  const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) })
  if (response.ok) ok(`answering on http://127.0.0.1:${port}`)
  else warn(`something is on port ${port} but returned HTTP ${response.status}`)
} catch {
  warn(`nothing is serving on port ${port}`, 'That is fine if you have not started it. Run `npm start` (or double-click run.bat).')
}

// ── the verdict ─────────────────────────────────────────────────────────────

const failures = results.filter((result) => result.level === 'fail')
const notes = results.filter((result) => result.level === 'warn')

console.log('')
if (failures.length === 0) {
  console.log(`All ${results.filter((r) => r.level === 'ok').length} checks passed${notes.length ? `, with ${notes.length} note${notes.length === 1 ? '' : 's'} above` : ''}.`)
  console.log('This install is working. Start it with `npm start`, or double-click run.bat.')
} else {
  console.log(`${failures.length} check${failures.length === 1 ? '' : 's'} failed:`)
  for (const failure of failures) console.log(`  - ${failure.section}: ${failure.message}`)
  console.log('\nEach failure above says what to run. Most are fixed by `npm run setup`.')
}
process.exit(failures.length === 0 ? 0 : 1)
