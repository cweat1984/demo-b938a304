// WebKit: remove a Leaflet canvas map (wind job) and the command fleet map. The unmount race
// `this._ctx.clearRect` must not fire. A real page error still fails this test.
import { webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const errors = []
const wk = await webkit.launch()
const ctx = await wk.newContext(devices['iPhone 14'])
const p = await ctx.newPage()
p.on('pageerror', e => errors.push(e.message))
await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
await p.goto(base)
await p.tap('[data-role=owner]')
await p.waitForTimeout(1000)
await p.evaluate(() => window.__store.getState().go('jobs'))
await p.waitForTimeout(500)
const opened = await p.evaluate(() => {
  const j = window.__store.getState().db.jobs.find(j => j.windFarmId && (j.turbines ?? []).length)
  if (!j) return false
  window.__store.getState().open({ type: 'job', id: j.id })
  return true
})
await p.waitForTimeout(900)
if (opened) {
  await p.evaluate(() => window.__store.getState().open(null))
  await p.waitForTimeout(400)
}
await p.evaluate(() => window.__store.getState().go('windfarms'))
await p.waitForTimeout(800)
await p.evaluate(() => window.__store.getState().go('dispatch'))
await p.waitForTimeout(500)
await p.goBack()
await p.waitForTimeout(500)
const hit = errors.filter(m => /clearRect|_ctx/.test(m))
console.log(opened ? 'ok   opened a wind job canvas map' : 'FAIL no wind job to unmount')
console.log(hit.length ? 'FAIL canvas redraw after remove: ' + hit.join(' | ') : 'ok   no clearRect page error on map removal')
if (errors.length && !hit.length) console.log('other page errors: ' + errors.slice(0, 3).join(' | '))
await wk.close()
process.exit(opened && !hit.length && !errors.length ? 0 : 1)
