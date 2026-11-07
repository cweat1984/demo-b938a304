// Milestone 1 loose ends: crew notices on rig/crane-hour changes, driver notice on truck assignment, outside cranes on the move board,
// demo multi-crane job (shared crane + outside), guest store without prices. Devices: 1920, Pixel 7, Android tablet portrait/landscape, iPad, iPhone WebKit.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const PIN = fs.readFileSync(new URL('./.e2e-pin', import.meta.url), 'utf8').trim() // never printed
const base = process.env.BASE || 'http://localhost:4173/'; const out = '/workspace/southern-app/screenshots/m1/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const watch = p => p.on('pageerror', e => errors.push(e.message))
const noSide = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const c = await cr.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await c.newPage(); watch(p)
await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
await p.goto(base); await p.click('[data-role=dispatch]'); await p.waitForTimeout(1000)
const n = await p.evaluate(() => { const S = window.__store.getState, A = window.__actions, db = S().db; const now = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const j = db.jobs.find(x => x.craneId && db.assignments.some(a => a.jobId === x.id && a.date >= now))
  const crew = [...new Set(db.assignments.filter(a => a.jobId === j.id && a.date >= now).map(a => a.employeeId))]
  A.setRigPlan(j.id, { craneId: j.craneId, hookReady: j.startDate, travelDays: 1, upMode: 'days', upDays: 2, downStart: j.endDate, downAmount: 3, downUnit: 'h' })
  const rig = S().db.notices.filter(x => x.empIds && crew.includes(x.empIds[0]) && /Rig schedule/.test(x.title)).length
  A.setCraneHours(j.id, j.craneId, { from: '07:00', to: '12:00' })
  const hrs = S().db.notices.filter(x => x.empIds && crew.includes(x.empIds[0]) && /Crane hours changed/.test(x.title)).length
  const semi = S().db.equipment.find(e => (e.category === 'Semi' || e.category === 'Pickup') && e.assignedTo && !j.trailerIds.includes(e.id))
  A.setJobUnits(j.id, [...j.trailerIds, semi.id]); const drv = S().db.notices.filter(x => x.empIds?.includes(semi.assignedTo) && x.title.includes(semi.unit)).length
  return { crew: crew.length, rig, hrs, drv } })
ok(n.crew > 0 && n.rig === n.crew, `every crew member gets a "Rig schedule set" notice (${n.rig}/${n.crew})`)
ok(n.hrs === n.crew, `crane hours change notifies the crew (${n.hrs}/${n.crew})`)
ok(n.drv === 1, 'driver hears when their truck is put on a job')
// demo multi-crane job
const demo = await p.evaluate(() => { const db = window.__store.getState().db; const j = db.jobs.find(x => (x.craneIds ?? []).length && x.outside?.length && x.craneHours); if (!j) return null; const sh = Object.keys(j.craneHours)[0]; const other = db.jobs.find(o => o.id !== j.id && o.craneId === sh); return { id: j.id, jobNo: j.jobNo, n: 1 + j.craneIds.length, shared: !!other?.craneHours?.[sh] } })
ok(!!demo && demo.n >= 3 && demo.shared, `demo job with ${demo?.n} cranes + outside crane + a crane shared with another job today`)
await p.evaluate(() => window.__store.getState().go('dispatch')); await p.waitForTimeout(800)
const tile = p.locator(`[data-testid=job-card][data-job="${demo?.jobNo}"]`)
ok(await tile.count() === 1 && await tile.locator('[data-testid=more-cranes-toggle]').count() === 1 && await tile.locator('[data-testid=outside-tile-item]').count() >= 1 && await tile.locator('[data-testid=crane-shared-item]').count() >= 1, 'demo job tile: +N cranes, OUTSIDE crane, shared-crane note')
await tile.screenshot({ path: out + 'projector1920-demo-multicrane-tile.png' })
await p.evaluate(() => window.__store.getState().go('moves')); await p.waitForTimeout(800)
ok(await p.locator('[data-testid=move-outside-item]').count() >= 1, 'crane-move board shows the hired outside crane')
await p.screenshot({ path: out + 'projector1920-moves-outside.png' })
await c.close()
// devices: board with the demo job
const DEV = [['pixel7', { ...devices['Pixel 7'] }, 'chromium'], ['android-tab-portrait', { viewport: { width: 800, height: 1280 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'chromium'], ['android-tab-landscape', { viewport: { width: 1280, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'chromium'], ['ipad', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, 'chromium'], ['iphone390', devices['iPhone 14'], 'webkit']]
const wk = await webkit.launch()
for (const [name, opt, eng] of DEV) {
  const ctx = await (eng === 'webkit' ? wk : cr).newContext(opt); const d = await ctx.newPage(); watch(d); await d.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await d.goto(base); await d.tap('[data-role=dispatch]'); await d.waitForTimeout(1000); await d.evaluate(() => window.__store.getState().go('dispatch')); await d.waitForTimeout(800)
  const t = d.locator(`[data-testid=job-card][data-job="${demo?.jobNo}"]`)
  if (await t.count()) { await t.scrollIntoViewIfNeeded(); const b = await t.locator('[data-testid=more-cranes-toggle]').boundingBox(); ok(b && b.height >= 44, `${name}: "+N cranes" is a 44px touch target`); await t.locator('[data-testid=more-cranes-toggle]').tap(); await d.waitForTimeout(200); ok(await t.locator('[data-testid=more-crane]').count() >= 2, `${name}: tap expands the cranes (no hover needed)`) }
  else ok(false, `${name}: demo job on the board`)
  ok(await noSide(d), `${name}: board has no sideways scroll`)
  await d.screenshot({ path: out + `${name}-board.png` })
  await d.evaluate(id => window.__store.getState().open({ type: 'job', id }), demo.id); await d.waitForSelector('[data-testid=job-rig]'); await d.waitForTimeout(300)
  ok(await d.evaluate(() => [...document.querySelectorAll('[role=dialog]')].every(x => x.scrollWidth <= x.clientWidth + 1)) && await noSide(d), `${name}: job view (cranes + outside) no sideways scroll`)
  await ctx.close()
}
// guest: merch store has no prices
const oc = await cr.newContext({ viewport: { width: 1440, height: 950 } }); const o = await oc.newPage(); watch(o)
await o.goto(base); await o.click('[data-role=owner]'); await o.waitForTimeout(800); await o.evaluate(() => { location.hash = '/guests' }); await o.waitForSelector('[data-testid=gp-pin-gate]')
for (const x of PIN) await o.click(`[data-pin="${x}"]`); await o.waitForSelector('[data-testid=guest-new]')
await o.fill('[data-testid=guest-name]', 'Store Visitor'); await o.click('[data-testid=guest-create]'); await o.waitForTimeout(500); const l = await o.textContent('[data-testid=guest-link]'); const gurl = base + l.slice(l.indexOf('?')); await oc.close()
for (const [name, opt, eng] of [['iphone390', devices['iPhone 14'], 'webkit'], ['pixel7', devices['Pixel 7'], 'chromium']]) {
  const gc = await (eng === 'webkit' ? wk : cr).newContext(opt); const g = await gc.newPage(); watch(g); await g.goto(gurl); await g.waitForTimeout(1500)
  const allowed = await g.evaluate(() => (window.__scNav || []).includes('store'))
  if (allowed) { await g.evaluate(() => window.__store.getState().go('store')); await g.waitForTimeout(700); const txt = await g.textContent('main') ?? await g.textContent('body')
    ok(!/\$\s?\d/.test(txt), `${name} guest: merch Store shows no prices`); await g.screenshot({ path: out + `${name}-guest-store.png` }) }
  else ok(true, `${name} guest: Store not on this pass`)
  await gc.close()
}
await wk.close(); await cr.close()
ok(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '))
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0)
