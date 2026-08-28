#!/usr/bin/env node
// Blind Flange (SIH26117) — start the Python ingestion service.
//
// `npm run ingestion`. A thin launcher so the service starts the same way on
// every machine without anyone having to remember where the virtual
// environment put its interpreter, or to activate it first.
//
// The workbench does not call this service; see scripts/setup-ingestion.mjs
// for why it exists and what running it proves.
//
// Node builtins only, by policy.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const serviceDir = join(repoRoot, 'services', 'ingestion')
const venvDir = join(serviceDir, '.venv')

const python = [join(venvDir, 'Scripts', 'python.exe'), join(venvDir, 'bin', 'python')].find((exe) => existsSync(exe))

if (!python) {
  console.error('\nThe ingestion service is not installed.\n')
  console.error('  Install it with `npm run setup-ingestion`.')
  console.error('  The workbench itself does not need it — `npm start` works without this.\n')
  process.exit(1)
}

console.log(`Starting the ingestion service on http://127.0.0.1:8642 — Ctrl+C to stop.`)
console.log('It listens on loopback only and makes no outbound connection.\n')

const service = spawnSync(python, ['server.py', ...process.argv.slice(2)], { cwd: serviceDir, stdio: 'inherit' })
process.exit(service.status ?? 0)
