// Local test runner. Generates a synthetic guest-key fixture, serves the app, runs the saved batch.
// Skips guestbuild-e2e.mjs: it reads /workspace/pages-build/keys, which is not in this handoff.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const port = process.env.PORT || '4174'
const base = `http://127.0.0.1:${port}/`

await new Promise((res, rej) => {
  const c = spawn(process.execPath, ['scripts/e2e-fixture.mjs'], { cwd: root, stdio: 'inherit' })
  c.on('exit', code => code === 0 ? res() : rej(new Error('fixture failed')))
})
const envFile = fs.readFileSync(path.join(root, '.env.e2e'), 'utf8')
const env = { ...process.env }
for (const line of envFile.split('\n')) {
  const i = line.indexOf('=')
  if (i > 0) env[line.slice(0, i)] = String(JSON.parse(line.slice(i + 1)))
}

const vite = spawn('npx', ['vite', '--mode', 'e2e', '--port', port, '--strictPort', '--host', '127.0.0.1'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let log = ''
vite.stdout.on('data', d => { log += d })
vite.stderr.on('data', d => { log += d })
const ready = await new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('vite did not start\n' + log.slice(-2000))), 120000)
  const tick = () => { if (/Local:|ready in/i.test(log)) { clearTimeout(t); res() } }
  vite.stdout.on('data', tick); vite.stderr.on('data', tick)
})
void ready

const tests = (process.argv.slice(2).length ? process.argv.slice(2) : ['map-unmount-e2e.mjs', 'nav2-e2e.mjs', 'd3x-e2e.mjs', 'shop-minors-e2e.mjs', 'regress-devices.mjs'])
const results = []
for (const file of tests) {
  if (file.includes('guestbuild')) { results.push({ file, code: 'skip', why: 'deploy keys not in handoff' }); console.log('SKIP ' + file); continue }
  console.log('\n=== ' + file + ' ===')
  const code = await new Promise(res => {
    const c = spawn(process.execPath, [file], { cwd: root, env: { ...env, BASE: base }, stdio: 'inherit' })
    c.on('exit', res)
  })
  results.push({ file, code })
}
vite.kill('SIGTERM')
console.log('\nBATCH')
for (const r of results) console.log(`${r.code === 0 ? 'PASS' : r.code === 'skip' ? 'SKIP' : 'FAIL'} ${r.file}${r.why ? ' — ' + r.why : ''}`)
process.exit(results.some(r => r.code !== 0 && r.code !== 'skip') ? 1 : 0)
