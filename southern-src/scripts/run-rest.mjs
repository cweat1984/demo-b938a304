// Remaining older e2e files, one after another, against one vite server.
// guestbuild-e2e.mjs stays skipped: it needs the deploy key file and the
// prebuilt guest money dataset, neither of which is in this handoff.
// A missing synthetic PIN is created here and is not a product failure.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const outDir = process.env.E2E_OUT || '/tmp/e2e-rest'
const port = process.env.PORT || '4174'
const base = `http://127.0.0.1:${port}/`
const limitMs = Number(process.env.E2E_LIMIT_MS || 8 * 60 * 1000)
fs.mkdirSync(outDir, { recursive: true })

const already = new Set(['map-unmount-e2e.mjs', 'nav2-e2e.mjs', 'd3x-e2e.mjs', 'shop-minors-e2e.mjs', 'regress-devices.mjs', 'd3s-e2e.mjs', 'd3g2-e2e.mjs', 'guest-switch-e2e.mjs'])
const skip = new Set(['guestbuild-e2e.mjs'])
const files = fs.readdirSync(root).filter(f => f.endsWith('-e2e.mjs') || f === 'e2e.mjs').filter(f => !already.has(f)).sort()

await new Promise((res, rej) => {
  const c = spawn(process.execPath, ['scripts/e2e-fixture.mjs'], { cwd: root, stdio: 'inherit' })
  c.on('exit', code => code === 0 ? res() : rej(new Error('fixture failed')))
})
const envFile = fs.readFileSync(path.join(root, '.env.e2e'), 'utf8')
const env = { ...process.env, BASE: base }
for (const line of envFile.split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) env[line.slice(0, i)] = String(JSON.parse(line.slice(i + 1)))
}

const vite = spawn('npx', ['vite', '--mode', 'e2e', '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let vlog = ''
vite.stdout.on('data', d => { vlog += d })
vite.stderr.on('data', d => { vlog += d })
await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start\n' + vlog.slice(-1500))), 120000)
  const tick = () => { if (/Local:|ready in/i.test(vlog)) { clearTimeout(t); res() } }
  vite.stdout.on('data', tick); vite.stderr.on('data', tick)
})

const results = []
const record = (row) => {
  results.push(row)
  fs.appendFileSync(path.join(outDir, 'results.jsonl'), JSON.stringify(row) + '\n')
  console.log(`${row.status} ${row.file}${row.why ? ' — ' + row.why : ''}`)
}
for (const file of files) {
  if (skip.has(file)) {
    record({ file, status: 'SKIP', code: 'skip', why: 'needs deploy guest keys and the prebuilt guest money dataset; synthetic keys are not a substitute for that package' })
    continue
  }
  console.log('\n=== ' + file + ' ===')
  const logPath = path.join(outDir, file.replace(/\.mjs$/, '.log'))
  const started = Date.now()
  const code = await new Promise(res => {
    const c = spawn(process.execPath, [file], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    const log = fs.createWriteStream(logPath)
    c.stdout.pipe(log); c.stderr.pipe(log)
    c.stdout.pipe(process.stdout); c.stderr.pipe(process.stderr)
    const timer = setTimeout(() => { c.kill('SIGKILL'); res(124) }, limitMs)
    c.on('exit', (cd) => { clearTimeout(timer); res(cd ?? 1) })
  })
  record({ file, status: code === 0 ? 'PASS' : code === 124 ? 'TIMEOUT' : 'FAIL', code, ms: Date.now() - started })
}
vite.kill('SIGTERM')
const counts = { PASS: 0, FAIL: 0, TIMEOUT: 0, SKIP: 0 }
for (const r of results) counts[r.status]++
const summary = { command: 'node scripts/run-rest.mjs', base, limitMs, counts, results }
fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2))
console.log('\nREST', JSON.stringify(counts))
process.exit(counts.FAIL || counts.TIMEOUT ? 1 : 0)
