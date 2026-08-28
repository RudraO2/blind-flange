#!/usr/bin/env node
// Blind Flange (SIH26117) — bring the workbench up from a clean clone.
//
// One command, `npm start`, from the repository root. It installs the pinned
// harness if it is missing, points both profiles at this checkout's plugin
// package, writes the profile's patch layers, task-type presets and settings
// from the tracked copies under `profile/`, and then starts the web profile.
//
// Every step is idempotent: run it again after an edit under `profile/` and
// the profile catches up. `profile/` in this repository is the source of
// truth; a hand edit made under the harness home is overwritten by the next
// run. docs/profile-install.md explains what each row does and how to do the
// same work by hand.
//
// Node builtins only, by policy — the licence allow-list (docs/licence-policy.md)
// is enforced rather than asserted, and a setup script is not a good reason to
// widen it. Nothing here downloads a model or a font.

import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The harness version this workbench was built and verified against (NFR6). */
const HARNESS_VERSION = '0.1.1-rc.2'
/** Node the plugin package was verified against; a minimum, not a pin. */
const MIN_NODE = '22.15.0'
/** `dsh plugin` forwards to whatever pnpm is on PATH. */
const MIN_PNPM = '10.11.0'
/** Both profiles carry the sovereignty layer — the web one renders it, the headless one does not. */
const PROFILES = ['web', 'headless']
/** The task types Story 1.4 authored. Directory names, not display names. */
const PRESETS = ['document', 'drawing', 'calculation', 'code-task']

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dshHome = (process.env.DSH_HOME || '').trim() || join(homedir(), '.dsh')
const args = process.argv.slice(2)
const setupOnly = args.includes('--setup-only')
/** Everything else is the harness's own, forwarded to `dsh web` — `--no-open`, `--port 3081`. */
const forwarded = args.filter((argument) => argument !== '--setup-only')

const say = (message) => console.log(message)
const step = (message) => console.log(`\n==> ${message}`)

/** Stop with a message a human can act on rather than a stack trace. */
function fail(message) {
  console.error(`\nBlind Flange setup stopped: ${message}\n`)
  process.exit(1)
}

/**
 * Run a command and hand back its exit status and trimmed stdout.
 * `shell: true` throughout — on Windows `dsh`, `npm` and `pnpm` are all `.cmd`
 * shims, which `spawnSync` cannot execute directly.
 */
function capture(command) {
  const result = spawnSync(command, { shell: true, encoding: 'utf8' })
  return { status: result.status, stdout: (result.stdout || '').trim(), stderr: (result.stderr || '').trim() }
}

/** Run a command with the terminal attached, and stop the script if it fails. */
function run(command, description) {
  const result = spawnSync(command, { shell: true, stdio: 'inherit' })
  if (result.status !== 0) fail(`${description} failed (exit ${result.status}).\n  ${command}`)
}

/** Compare dotted version strings numerically; suffixes like `-rc.2` are ignored. */
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

function requireTool(command, name, minimum, install) {
  const { status, stdout } = capture(command)
  if (status !== 0 || !stdout) fail(`${name} was not found on PATH. ${install}`)
  const version = stdout.split('\n')[0].replace(/^v/, '').trim()
  if (!versionAtLeast(version, minimum)) {
    fail(`${name} ${version} is older than the required ${minimum}. ${install}`)
  }
  say(`  ${name} ${version} (needs >= ${minimum})`)
}

/**
 * Merge `profile/settings.yaml` into the harness home's own `settings.yaml`.
 *
 * The harness keeps the operator's settings in the same file as ours —
 * `ui-theme.preference` above all, which is the operator's choice and must
 * survive. So every key this project owns is listed in the tracked fragment
 * and enforced; every key that is not in the fragment is left exactly as it
 * was. The shape handled here is the shape both files actually use: top-level
 * keys, one level of indented scalar entries underneath.
 */
function mergeSettings(fragmentPath, targetPath) {
  const fragment = parseBlocks(readFileSync(fragmentPath, 'utf8'))
  if (!existsSync(targetPath)) {
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, readFileSync(fragmentPath, 'utf8'), 'utf8')
    say('  wrote a new settings.yaml from the tracked fragment')
    return
  }

  const target = parseBlocks(readFileSync(targetPath, 'utf8'))
  const changes = []
  for (const block of fragment) {
    const existing = target.find((candidate) => candidate.key === block.key)
    if (!existing) {
      target.push(block)
      changes.push(`${block.key} (added)`)
      continue
    }
    for (const entry of block.entries) {
      const index = existing.body.findIndex((line) => line.trimStart().startsWith(`${entry.key}:`))
      if (index === -1) {
        existing.body.push(entry.line)
        changes.push(`${block.key}.${entry.key} (added)`)
      } else if (existing.body[index].trim() !== entry.line.trim()) {
        existing.body[index] = entry.line
        changes.push(`${block.key}.${entry.key} (updated)`)
      }
    }
  }

  if (changes.length === 0) {
    say('  settings.yaml already carries every key this project owns')
    return
  }
  const rendered = target.map((block) => [...block.comments, block.line, ...block.body].join('\n')).join('\n\n')
  // Comments written below the last block belong to nothing above them; keep them where they were.
  const tail = target.trailingComments.length > 0 ? `\n\n${target.trailingComments.join('\n')}` : ''
  writeFileSync(targetPath, `${`${rendered}${tail}`.replace(/\n+$/, '')}\n`, 'utf8')
  say(`  merged: ${changes.join(', ')}`)
}

/**
 * Split a settings file into top-level blocks, each carrying the comment lines
 * written above it so a block added here keeps the reason it exists.
 */
function parseBlocks(text) {
  const blocks = []
  let comments = []
  let current = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '')
    if (line === '') continue
    if (line.startsWith('#')) {
      comments.push(line)
      continue
    }
    // An indented comment above an entry describes that entry, so it travels with the block
    // rather than being hoisted onto whatever top-level key happens to come next.
    if (line.trimStart().startsWith('#') && current) {
      current.body.push(line)
      continue
    }
    if (!line.startsWith(' ')) {
      current = { key: line.split(':')[0].trim(), line, comments, body: [], entries: [] }
      blocks.push(current)
      comments = []
      continue
    }
    if (!current) continue
    current.body.push(line)
    const key = line.trim().split(':')[0]
    if (key) current.entries.push({ key, line })
  }
  blocks.trailingComments = comments
  return blocks
}

/**
 * Give a brand-new harness home one workspace, pointing at this checkout.
 *
 * The composer will not start a session until a workspace is chosen, and a
 * fresh home has none — so without this the documented start command stops one
 * click short of the first demo beat. The registry is ordinary durable state
 * (`$DSH_HOME/storages/workspace.json`, the json storage backend the web
 * profile already configures), written here in the shape the harness's own
 * domain spec declares: `name: workspace`, `version: 2`.
 *
 * **Only ever written when the file does not exist.** An operator's own
 * workspace list is theirs; a re-run on an installed machine leaves it alone.
 */
function seedWorkspace() {
  const target = join(dshHome, 'storages', 'workspace.json')
  if (existsSync(target)) {
    say('  a workspace registry already exists here — left exactly as it is')
    return
  }
  const now = new Date().toISOString()
  const id = randomUUID()
  const registry = {
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: [id], archivedSessionIds: [] },
    tables: {
      workspaces: {
        [id]: { path: realpathSync(repoRoot), title: 'Blind Flange', sessionIds: [], createdAt: now, updatedAt: now },
      },
    },
  }
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')
  say(`  one workspace, "Blind Flange", at ${registry.tables.workspaces[id].path}`)
}

// ── 1. prerequisites ────────────────────────────────────────────────────────

step('Checking prerequisites')
requireTool('node -v', 'Node', MIN_NODE, 'Install Node 22.15.0 or newer from https://nodejs.org.')
requireTool('npm -v', 'npm', '10.0.0', 'npm ships with Node; reinstall Node.')
requireTool('pnpm -v', 'pnpm', MIN_PNPM, 'Install it with `npm install -g pnpm`.')
say(`  repository: ${repoRoot}`)
say(`  harness home: ${dshHome}${process.env.DSH_HOME ? ' (from DSH_HOME)' : ''}`)

// ── 2. the harness itself ───────────────────────────────────────────────────

step(`Checking the harness (@deepseek-ai/dsh@${HARNESS_VERSION})`)
const installed = capture('dsh --version')
if (installed.status === 0 && installed.stdout.split('\n')[0].trim() === HARNESS_VERSION) {
  say(`  already installed at the pinned version — nothing is downloaded`)
} else {
  const found = installed.status === 0 ? installed.stdout.split('\n')[0].trim() : 'not installed'
  say(`  found: ${found}. Installing the pinned version (about 511 packages, ~2 minutes).`)
  say('  This is the one step that uses the network, and it is the last one that does.')
  run(`npm install -g @deepseek-ai/dsh@${HARNESS_VERSION}`, 'Installing the harness')
}

// ── 3. the plugin package, in both profiles ─────────────────────────────────

// `link:`, not `file:` — pnpm copies a `file:` dependency into its store, so
// every plugin edit would need a reinstall before it reached the browser. The
// cost is an absolute path baked into the profile: move or re-clone the
// repository and this step has to run again, which is what `npm start` does.
const linkTarget = `link:${join(repoRoot, 'plugins', 'dsh-client-ui-base').replace(/\\/g, '/')}`
for (const profile of PROFILES) {
  step(`Installing the plugin package into the ${profile} profile`)
  const manifestPath = join(dshHome, 'profiles', profile, 'package.json')
  const current = existsSync(manifestPath)
    ? JSON.parse(readFileSync(manifestPath, 'utf8')).dependencies?.['@blind-flange/dsh-client-ui-base']
    : undefined
  if (current === linkTarget) {
    say('  already points at this checkout')
  } else {
    run(`dsh plugin --profile ${profile} add "${linkTarget}"`, `Installing the plugin into the ${profile} profile`)
  }
}

// ── 4. the patch layers, presets and settings ───────────────────────────────

step('Writing the profile patch layers')
for (const profile of PROFILES) {
  const source = join(repoRoot, 'profile', profile, 'cordis.patch.yml')
  const destination = join(dshHome, 'profiles', profile, 'cordis.patch.yml')
  mkdirSync(dirname(destination), { recursive: true })
  cpSync(source, destination)
  say(`  ${profile}: ${destination}`)
}

step('Writing the task-type presets')
for (const preset of PRESETS) {
  const destination = join(dshHome, '.agent-presets', preset)
  cpSync(join(repoRoot, 'profile', 'agent-presets', preset), destination, { recursive: true, force: true })
  say(`  ${preset}`)
}

step('Merging the settings this project owns')
mergeSettings(join(repoRoot, 'profile', 'settings.yaml'), join(dshHome, 'settings.yaml'))

step('Seeding the workspace registry')
seedWorkspace()

// ── 5. start ────────────────────────────────────────────────────────────────

if (setupOnly) {
  step('Setup complete')
  say('  Start the workbench with `npm start`, or a single task with')
  say('  `dsh --profile headless "summarise the inspection report"`.')
  process.exit(0)
}

step('Starting the workbench')
const port = forwarded[forwarded.indexOf('--port') + 1]
say(`  It serves http://127.0.0.1:${forwarded.includes('--port') ? port : '3080'} and nothing else. Stop it with Ctrl+C.`)
const web = spawnSync(['dsh web', ...forwarded].join(' '), { shell: true, stdio: 'inherit' })
process.exit(web.status ?? 0)
