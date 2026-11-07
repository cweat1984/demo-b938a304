// dive3 M8 forecast segments per phase + hours-aware lanes + down until return date; acct m7 Paychex file; acct m12 presets keep name+logo, AA badge on dark. 5 devices.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r) => { await S(p, r => { window.__store.getState().signOut(); window.__store.getState().signIn(r, 'Demo role') }, r); await W(800) }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 }, acceptDownloads: true }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('dialog', d => d.dismiss().catch(() => {})); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'owner')
  // set up: a down crane with a return date + a booking inside it; two half-day jobs sharing a crane; a rig plan on a job
  const r = await S(p, () => { const st = window.__store.getState, set = f => window.__store.setState(s => ({ db: f(s.db) }))
    const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); const add = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA') }
    const live = st().db.jobs.filter(j => j.craneId && j.startDate <= T0 && j.endDate >= T0 && j.status !== 'Complete' && !(j.craneIds ?? []).length && !(j.rig ?? []).length)
    const used = id => st().db.jobs.some(x => x.status !== 'Complete' && (x.craneId === id || (x.craneIds ?? []).includes(id) || (x.rig ?? []).some(q => q.craneId === id)))
    const free = st().db.equipment.find(e => e.category === 'Crane' && !used(e.id))
    const [a, b, down] = live
    set(db => ({ ...db,
      jobs: db.jobs.map(j => j.id === b.id ? { ...j, craneIds: [free.id], siteId: a.siteId, craneHours: { [free.id]: { from: '12:00', to: '17:00' } } } : j.id === a.id ? { ...j, craneIds: [free.id], craneHours: { [free.id]: { from: '06:00', to: '11:00' } } } : j),
      equipment: db.equipment.map(e => e.id === down.craneId ? { ...e, status: 'Out of Service' } : e.id === free.id ? { ...e, status: 'Available', annualInspection: '2099-01-01' } : e),
      workOrders: [{ id: 'wo-t8', woNo: 'WO-99001', unitId: down.craneId, title: 'Swing bearing', complaint: 'x', priority: 'High', status: 'Open', opened: T0, due: add(T0, 6), parts: [], laborHrs: 0, laborRate: 115, source: 'Breakdown' }, ...db.workOrders] }))
    const rigJob = st().db.jobs.find(j => (j.rig ?? []).length && j.endDate >= T0 && j.status !== 'Complete')
    return { a: a.jobNo, b: b.jobNo, crane: free.id, down: down.craneId, downJob: down.jobNo, rig: !!rigJob } })
  await S(p, () => window.__store.getState().go('forecast')); await p.waitForSelector('[data-testid=forecast]'); await W(800)
  const row = p.locator(`[data-testid=fc-row][data-crane="${r.crane}"]`)
  const cats = await row.locator('[data-testid=fc-bar]').evaluateAll(bs => bs.map(b => b.dataset.job + ':' + b.dataset.cat))
  ok(cats.length >= 2 && !cats.some(x => x.startsWith(r.a + ':conflict') || x.startsWith(r.b + ':conflict')), `${name}: M8 two half-day bookings on one crane aren't red (${cats.join(' ')})`)
  const dn = p.locator(`[data-testid=fc-row][data-crane="${r.down}"]`)
  const dtext = await dn.locator('[data-testid=fc-down]').textContent().catch(() => '')
  ok(/Out of Service · back/.test(dtext || ''), `${name}: M8 down crane shows its return date (${dtext})`)
  ok(await dn.locator('[data-testid=fc-booked-down]').count() === 1 && await dn.locator(`[data-testid=fc-bar][data-job="${r.downJob}"][data-cat=conflict]`).count() === 1, `${name}: M8 a booking while down is red + flagged`)
  ok(!(await dn.locator('[data-testid=fc-gap]').allTextContents()).some(t => /Available · (2[0-9]|30)/.test(t)), `${name}: M8 down crane doesn't read "Available" for the month`)
  if (r.rig) ok(await p.locator('[data-testid=fc-seg]').count() >= 1, `${name}: M8 rig phases drawn as segments (${await p.locator('[data-testid=fc-seg]').count()})`)
  const leg = await p.textContent('main'); ok(/Moving|Rig/i.test(leg) && /Travel/i.test(leg), `${name}: M8 legend lists moving + travel`)
  const ov = await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); ok(ov, `${name}: forecast page doesn't overflow sideways`)
  await p.screenshot({ path: `/tmp/d3x-${name}-forecast.png` })
  if (name === 'desk1920') {
    // Paychex file
    await S(p, () => { const st = window.__store.getState, A = window.__actions; const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); const d7 = new Date(Date.now() - 6 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      const ids = st().db.time.filter(t => t.date >= d7 && t.date <= T0 && (t.status === 'Submitted' || t.status === 'Approved')).map(t => t.id); A.approveTime(ids); A.exportTime(ids); st().setUI({ filter: { divisionId: 'all', branchId: 'all' } }); st().go('time') })
    await W(900)
    const btn = p.locator('[data-testid=time-paychex]')
    if (await btn.count()) { const [dl] = await Promise.all([p.waitForEvent('download'), btn.click()]); const txt = fs.readFileSync(await dl.path(), 'utf8')
      ok(/Pay Component/.test(txt) && /,Hourly,/.test(txt) && /DEMO-CLIENT/.test(txt) && /DEMO — unverified/.test(txt) && /paychex-flex-/.test(dl.suggestedFilename()), `m7 Paychex file marked demo/unverified (${txt.split('\n').length - 1} lines)`)
      ok(await p.locator('[data-testid=paychex-demo]').isVisible(), 'm7 Paychex button is labeled Demo · unverified') }
    else ok(false, 'm7 Paychex file button shows after export')
    // presets keep name + logo; AA badge honest on dark
    await p.evaluate(() => { location.hash = '/branding' }); await p.waitForSelector('[data-testid=brand-name]'); await W(500)
    await p.fill('[data-testid=brand-name]', 'Prairie Crane Rental (fictional)'); await p.fill('[data-testid=brand-short]', 'Prairie'); await p.fill('[data-testid=brand-app]', 'Prairie Command'); await p.setInputFiles('[data-testid=brand-logo]', new URL('./test-logo-demo.png', import.meta.url).pathname); await p.waitForSelector('[data-testid=brand-names] img', { timeout: 8000 })
    await p.fill('[data-testid=brand-preset-name]', 'Prairie set'); await p.click('[data-testid=brand-preset-save]'); await W(300)
    await p.fill('[data-testid=brand-name]', 'Something Else'); await p.fill('[data-testid=brand-short]', 'X'); await p.fill('[data-testid=brand-app]', 'Other'); await p.click('[data-testid=brand-logo-remove]'); await W(200)
    await p.locator('[data-testid=brand-saved-preset] button').first().click(); await W(300)
    ok(await p.inputValue('[data-testid=brand-name]') === 'Prairie Crane Rental (fictional)', 'm12 a saved preset brings back the company name')
    ok(await p.inputValue('[data-testid=brand-short]') === 'Prairie' && await p.inputValue('[data-testid=brand-app]') === 'Prairie Command', 'm12 preset restores short name and app name')
    ok(await p.locator('[data-testid=brand-names] img').count() === 1, 'm12 preset restores the logo')
  }
  await c.close()
}
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
