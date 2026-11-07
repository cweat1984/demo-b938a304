// Hostile checks after the older suites. Playwright device profiles only — not a physical
// iPhone, Pixel, or tablet. BASE=preview or vite url.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const wk = await webkit.launch()
const boot = async (browser, opts) => {
  const ctx = await browser.newContext(opts)
  const p = await ctx.newPage()
  p.on('pageerror', e => fails.push('pageerror ' + e.message.slice(0, 140)))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  return { ctx, p }
}

// Guest isolation: staff storage stays, and a guest tab does not read it or accept a staff broadcast.
{
  const { ctx, p } = await boot(cr, { viewport: { width: 1280, height: 800 } })
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  await p.waitForTimeout(400)
  const marker = await p.evaluate(async () => {
    localStorage.setItem('sc-rig-v1', JSON.stringify([{ tag: 'RG-STAFF-KEEP' }]))
    localStorage.setItem('sc-gapb', JSON.stringify({ state: { permits: [{ key: 'staff-permit-keep' }] }, version: 1 }))
    await new Promise((res, rej) => {
      const r = indexedDB.open('sc-backgrounds', 1)
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('photos')) r.result.createObjectStore('photos', { keyPath: 'id' }) }
      r.onsuccess = () => { const tx = r.result.transaction('photos', 'readwrite'); tx.objectStore('photos').put({ id: 'staff-photo-keep', name: 'staff' }); tx.oncomplete = () => res(true); tx.onerror = () => rej(tx.error) }
      r.onerror = () => rej(r.error)
    })
    return localStorage.getItem('sc-rig-v1')
  })
  const guest = await ctx.newPage()
  await guest.addInitScript(() => localStorage.setItem('sc-guest-device', '1'))
  await guest.goto(base)
  await guest.waitForSelector('[data-testid=guest-device]')
  const hidden = await guest.evaluate(async () => {
    const rig = localStorage.getItem('sc-rig-v1')
    const gap = localStorage.getItem('sc-gapb')
    localStorage.setItem('sc-rig-v1', '[]')
    const photos = await new Promise(res => {
      const r = indexedDB.open('sc-backgrounds')
      r.onsuccess = () => { try { const g = r.result.transaction('photos').objectStore('photos').getAll(); g.onsuccess = () => res((g.result || []).map(x => x.id)) } catch { res([]) } }
      r.onerror = () => res(['err'])
    })
    return { rig, gapHas: /staff-permit-keep/.test(gap || ''), photos }
  })
  ok(hidden.rig == null && !hidden.gapHas && !hidden.photos.includes('staff-photo-keep'), 'guest tab cannot read staff rigging, permits, or background photos')
  await guest.evaluate(() => localStorage.removeItem('sc-guest-device'))
  await p.reload()
  await p.waitForSelector('[data-role=owner]')
  const kept = await p.evaluate(async () => {
    const photos = await new Promise(res => {
      const r = indexedDB.open('sc-backgrounds')
      r.onsuccess = () => { const g = r.result.transaction('photos').objectStore('photos').getAll(); g.onsuccess = () => res((g.result || []).map(x => x.id)) }
    })
    return { rig: localStorage.getItem('sc-rig-v1'), photos }
  })
  ok(kept.rig === marker && kept.photos.includes('staff-photo-keep'), 'staff copies survive the guest tab, including a guest write attempt')
  await ctx.close()
}

// Two owner tabs share a dispatch change. A guest tab in the same browser ignores that broadcast.
{
  const ctx = await cr.newContext()
  const a = await ctx.newPage(); const b = await ctx.newPage()
  for (const p of [a, b]) { await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); await p.goto(base); await p.waitForSelector('[data-role=owner]'); await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role')) }
  await a.waitForTimeout(500)
  const n0 = await b.evaluate(() => window.__store.getState().db.assignments.length)
  const added = await a.evaluate(() => {
    const st = window.__store.getState()
    const job = st.db.jobs.find(j => j.status !== 'Complete' && j.craneId)
    const emp = st.db.employees.find(e => e.status === 'Active' && !e.ssHold)
    const date = job.startDate
    window.__actions.assign(job.id, date, emp.id, 'Rigger')
    return { n: window.__store.getState().db.assignments.length, emp: emp.id, job: job.id, date }
  })
  await b.waitForTimeout(800)
  const n1 = await b.evaluate(() => window.__store.getState().db.assignments.length)
  ok(n1 > n0 && n1 === added.n, `second owner tab sees the new assignment (${n0} → ${n1})`)
  const g = await ctx.newPage()
  await g.goto(base)
  await g.waitForSelector('[data-role=owner]')
  await g.evaluate(() => window.__store.getState().signIn('guest', 'Demo role'))
  await g.waitForTimeout(400)
  const before = await g.evaluate(() => window.__store.getState().db.assignments.length)
  await a.evaluate((x) => {
    const st = window.__store.getState()
    const emp2 = st.db.employees.find(e => e.status === 'Active' && !e.ssHold && e.id !== x.emp && !st.db.assignments.some(a => a.employeeId === e.id && a.jobId === x.job && a.date === x.date))
    if (emp2) window.__actions.assign(x.job, x.date, emp2.id, 'Oiler')
  }, added)
  await g.waitForTimeout(800)
  const after = await g.evaluate(() => window.__store.getState().db.assignments.length)
  ok(after === before, `guest tab ignores a staff broadcast (${before} → ${after})`)
  await ctx.close()
}

// Field Back: sheet, then Ticket → Time → Job, then stay in the field app.
{
  const { ctx, p } = await boot(wk, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } })
  await p.evaluate(() => { const s = window.__store.getState(); s.signIn('owner', 'Demo role'); s.go('dispatch'); s.signOut(); s.signIn('field', 'Demo role') })
  await p.waitForSelector('[data-testid=field-app]')
  const active = () => p.evaluate(() => [...document.querySelectorAll('[data-testid^=ftab-]')].find(el => el.className.includes('text-accent'))?.getAttribute('data-testid') || '')
  await p.tap('[data-testid=ftab-time]'); await p.waitForTimeout(250)
  await p.tap('[data-testid=ftab-ticket]'); await p.waitForTimeout(250)
  await p.locator('[data-testid=tile-sds]').tap(); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=fsheet-back]').count() === 1, 'field sheet is open')
  await p.goBack(); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=fsheet-back]').count() === 0 && await active() === 'ftab-ticket', 'Back closes the sheet and stays on Ticket')
  await p.goBack(); await p.waitForTimeout(300)
  ok(await active() === 'ftab-time', 'Back from Ticket returns to Time')
  await p.goBack(); await p.waitForTimeout(300)
  ok(await active() === 'ftab-home', 'Back from Time returns to Job')
  await p.goBack(); await p.waitForTimeout(400)
  const stayed = await p.evaluate(() => ({ hash: location.hash, field: !!document.querySelector('[data-testid=field-app]') }))
  ok(stayed.field && stayed.hash === '#/field', `further Back stays on #/field (${stayed.hash})`)
  await ctx.close()
}

// Forecast: real overlap is red; non-overlapping hours are not; rig phases are segments.
{
  const { ctx, p } = await boot(cr, { viewport: { width: 1400, height: 900 } })
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  const setup = await p.evaluate(() => {
    const st = window.__store.getState
    const set = (f) => window.__store.setState(s => ({ db: f(s.db) }))
    const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const live = st().db.jobs.filter(j => j.status !== 'Complete' && j.endDate >= T0)
    const [a, b] = live
    const crane = st().db.equipment.find(e => e.category === 'Crane' && e.status !== 'Out of Service')
    set(db => ({ ...db, jobs: db.jobs.map(j => j.id === a.id ? { ...j, craneId: crane.id, craneIds: [crane.id], craneHours: undefined, startDate: T0, endDate: T0, status: 'On Site', stage: 'In Progress' } : j.id === b.id ? { ...j, craneId: crane.id, craneIds: [crane.id], craneHours: undefined, startDate: T0, endDate: T0, status: 'On Site', stage: 'In Progress' } : j) }))
    return { a: a.jobNo, b: b.jobNo, crane: crane.id, rig: st().db.jobs.some(j => (j.rig ?? []).length) }
  })
  await p.evaluate(() => window.__store.getState().go('forecast'))
  await p.waitForSelector('[data-testid=forecast]')
  const clash = await p.locator(`[data-testid=fc-row][data-crane="${setup.crane}"] [data-testid=fc-bar][data-cat=conflict]`).count()
  ok(clash >= 2, `full-day overlap on one crane is red (${clash})`)
  await p.evaluate((s) => {
    window.__store.setState(st => ({ db: { ...st.db, jobs: st.db.jobs.map(j => j.jobNo === s.a ? { ...j, craneHours: { [s.crane]: { from: '06:00', to: '11:00' } } } : j.jobNo === s.b ? { ...j, craneHours: { [s.crane]: { from: '12:00', to: '17:00' } } } : j) } }))
  }, setup)
  await p.waitForTimeout(300)
  const half = await p.locator(`[data-testid=fc-row][data-crane="${setup.crane}"] [data-testid=fc-bar][data-cat=conflict]`).count()
  ok(half === 0, `non-overlapping hours on that crane are not red (${half})`)
  const phases = await p.locator('[data-testid=fc-seg]').evaluateAll(els => [...new Set(els.map(e => e.dataset.phase))])
  ok(!setup.rig || phases.some(x => x === 'rigup' || x === 'rigdown' || x === 'move'), `rig phases drawn (${phases.join(',') || 'none'})`)
  await ctx.close()
}

// Accident hold blocks any employee, not only a driver.
{
  const { ctx, p } = await boot(cr, { viewport: { width: 1200, height: 800 } })
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  const held = await p.evaluate(() => {
    const st = window.__store.getState()
    const emp = st.db.employees.find(e => e.status === 'Active' && !/driver|operator/i.test(e.craft || '') && !e.ssHold)
    const job = st.db.jobs.find(j => j.status !== 'Complete')
    const date = job.startDate
    window.__actions.ssHold(emp.id, true)
    const mid = window.__store.getState().db.assignments.filter(a => a.employeeId === emp.id && a.jobId === job.id && a.date === date).length
    window.__actions.assign(job.id, date, emp.id, 'Rigger')
    const after = window.__store.getState().db.assignments.filter(a => a.employeeId === emp.id && a.jobId === job.id && a.date === date).length
    const clock = window.__actions.clockIn(emp.id)
    const still = !!window.__store.getState().db.employees.find(e => e.id === emp.id).ssHold
    window.__actions.ssHold(emp.id, false)
    const cleared = !window.__store.getState().db.employees.find(e => e.id === emp.id).ssHold
    window.__actions.assign(job.id, date, emp.id, 'Rigger')
    const booked = window.__store.getState().db.assignments.some(a => a.employeeId === emp.id && a.jobId === job.id && a.date === date)
    return { craft: emp.craft, mid, after, clockOk: clock.ok, clockWhy: clock.reason, still, cleared, booked }
  })
  ok(held.after === held.mid && held.still && held.clockOk === false, `hold blocks schedule and clock-in for ${held.craft} (${held.clockWhy})`)
  ok(held.cleared && held.booked, 'clearing the hold lets that person be scheduled again')
  await ctx.close()
}

// Non-billable extra is absorbed cost, not a customer charge.
{
  const { ctx, p } = await boot(cr, { viewport: { width: 1280, height: 900 } })
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  const jobId = await p.evaluate(() => {
    const j = window.__store.getState().db.jobs.find(j => j.status !== 'Complete' && j.stage !== 'Quote')
    const r = window.__actions.addExtra(j.id, { kind: 'equipment', role: 'Forklift', qty: 1, billable: false, again: true, reason: 'break-it absorbed' })
    return r.ok ? j.id : ''
  })
  ok(!!jobId, 'non-billable extra was accepted')
  await p.evaluate(id => window.__store.getState().open({ type: 'job', id }), jobId)
  await p.waitForTimeout(400)
  await p.getByRole('tab', { name: 'Job cost' }).click()
  await p.waitForTimeout(300)
  const absorbed = await p.locator('[data-testid=bva-absorbed]').textContent().catch(() => '')
  ok(/Absorbed/.test(absorbed || '') && /Non-billable/.test(absorbed || ''), `job cost shows absorbed non-billable cost (${(absorbed || '').slice(0, 80)})`)
  const notice = await p.evaluate(id => window.__store.getState().db.notices.find(n => n.ref && n.ref.id === id && /absorbed/i.test(n.body || ''))?.body || '', jobId)
  ok(/absorbed cost/.test(notice) && /unchanged/.test(notice), 'notice says tickets are unchanged')
  await ctx.close()
}

// Small-screen emulation (not hardware): no sideways overflow, primary controls at least 44px.
{
  const { ctx, p } = await boot(wk, devices['iPhone 14'])
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  for (const page of ['dispatch', 'forecast', 'time']) {
    await p.evaluate(pg => window.__store.getState().go(pg), page)
    await p.waitForTimeout(400)
    const r = await p.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 1, sw: document.documentElement.scrollWidth, vw: innerWidth }))
    ok(!r.over, `${page} at 390px does not overflow sideways (${r.sw}/${r.vw})`)
  }
  const bar = await p.locator('[data-testid=hamburger], [data-testid=page-back]').first().boundingBox()
  ok(bar && bar.width >= 43 && bar.height >= 43, `header menu/back is at least 44px (${bar && Math.round(bar.width)}×${bar && Math.round(bar.height)})`)
  await ctx.close()
}

await cr.close(); await wk.close()
console.log(fails.length ? `FAILED ${fails.length}\n` + fails.join('\n') : 'ALL PASS')
process.exit(fails.length ? 1 : 0)
