/* Boots a fresh server, with a fresh database, for every test file.
   Session state is a fold over the log, so two files sharing a database
   are two files sharing a session — which is exactly how the clock
   assertions got contaminated by the projection test's own reveals.
   Isolation is per-file now, on principle. */
import { spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

/* Pure functions, no server needed. */
const OFFLINE = []

const FILES = ['test/session.mjs']

const scrub = db => [db, `${db}-wal`, `${db}-shm`]
  .forEach(p => { try { rmSync(p, { force: true }) } catch {} })

async function runFile(file, i) {
  const db = `data/test-${i}.db`
  scrub(db)
  const server = spawn('node',
    ['--disable-warning=ExperimentalWarning', 'packages/server/dist/index.js'], {
      env: { ...process.env, DM_KEY: 'testkey', ROOM: 'table', PORT: '8080', DB: db },
      stdio: ['ignore', 'ignore', 'inherit'],
    })
  await new Promise(r => setTimeout(r, 1400))
  const t = spawn('node', [file], { env: { ...process.env, DM_KEY: 'testkey' }, stdio: 'inherit' })
  const code = await new Promise(r => t.on('exit', r))
  server.kill()
  await new Promise(r => setTimeout(r, 250))
  scrub(db)
  return code ?? 1
}

let code = 0
for (const f of OFFLINE) {
  console.log(`\n== ${f} ==`)
  const t = spawn('node', [f], { stdio: 'inherit' })
  code = (await new Promise(r => t.on('exit', r))) ?? 1
  if (code !== 0) process.exit(code)
}

for (const [i, f] of FILES.entries()) {
  console.log(`\n== ${f} ==`)
  code = await runFile(f, i)
  if (code !== 0) break
}
process.exit(code)
