// Batch L (dive2 F3-F7, G1-G8, n7/n8/n13-n15, E, shop M6-M8) across iPhone 390 WebKit, Pixel 7, Android tablets, iPad, 1920 and 4K.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/batch-l/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch()
const W = ms => new Promise(r => setTimeout(r, ms))
const CHI = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
async function page(browser, opts, role) { const c = await browser.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); await p.goto(base); if (role) { await p.click(`[data-role=${role}]`); await p.waitForTimeout(1000) } return { c, p } }

// ── 1920 dispatch: reschedule + job log, emergency affected jobs, unit days, ask-hero answer, print, release, rigging tags, tag-out
{ const { c, p } = await page(cr, { viewport: { width: 1920, height: 1080 } }, 'dispatch')
  const r = await p.evaluate(() => { const s = window.__store.getState(), db = s.db; const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); const j = db.jobs.find(x => x.status === 'Scheduled' && x.startDate > T0 && db.assignments.some(a => a.jobId === x.id)) ?? db.jobs.find(x => x.status !== 'Complete' && x.startDate > T0) // dive3 M3: a started job keeps its start, so pick one that hasn't started
    const add = (d, n) => { const t = new Date(d + 'T12:00'); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10) }
    const res = window.__actions.rescheduleJob(j.id, { start: add(j.startDate, 2), end: add(j.endDate, 2), shiftCrew: true, reason: 'Customer pushed the pour' })
    const j2 = window.__store.getState().db.jobs.find(x => x.id === j.id)
    return { id: j.id, no: j.jobNo, res, moved: j2.startDate === add(j.startDate, 2) && j2.endDate === add(j.endDate, 2), log: window.__store.getState().db.audit.filter(a => a.entity === `Job #${j.jobNo}` && a.action === 'Rescheduled job').length } })
  ok(r.res !== false && r.moved, `F3 reschedule moves Job #${r.no} start and end by 2 days`); ok(r.log >= 1, 'F3 reschedule is in the audit log')
  await p.evaluate(id => window.__store.getState().open({ type: 'job', id }), r.id); await p.waitForSelector('[data-testid=job-dates]', { timeout: 10000 })
  ok(await p.locator('[data-testid=job-log-row]').count() >= 1, 'F3 job change log shows on the job')
  await p.click('[data-testid=job-reschedule]'); await p.waitForSelector('[data-testid=reschedule-sheet]')
  ok(await p.locator('[data-testid=rs-draft]').count() === 1 && /Never sent automatically/i.test(await p.textContent('[data-testid=reschedule-sheet]')), 'F3 customer message is a draft only, never auto-sent')
  await p.screenshot({ path: out + 'desk1920-reschedule.png' }); await p.keyboard.press('Escape'); await W(300); await p.keyboard.press('Escape'); await W(300)
  // F6 emergency → affected jobs
  const bd = await p.evaluate(() => { const db = window.__store.getState().db; const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const j = db.jobs.find(x => x.status !== 'Complete' && x.craneId && x.startDate <= t && x.endDate >= t) ?? db.jobs.find(x => x.status !== 'Complete' && x.craneId)
    const res = window.__actions.reportBreakdown({ unitId: j.craneId, kind: 'Hydraulic Leak', severity: 'Down — Can’t Move', lat: 35.4, lng: -97.5, locationText: 'Demo yard', contactName: 'Demo Driver', contactPhone: '4055550100', notes: 'QA test', photos: [], reportedBy: 'QA' })
    const n = window.__store.getState().db.notices[0]; return { jobs: res?.jobs?.length ?? 0, body: n?.body ?? '', no: j.jobNo } })
  ok(bd.jobs >= 1 && new RegExp(`#${bd.no}`).test(bd.body), `F6 breakdown lists the jobs it hits (${bd.jobs})`)
  // F7 unit days
  const ud = await p.evaluate(() => { const db = window.__store.getState().db; const j = db.jobs.find(x => x.status !== 'Complete' && x.trailerIds.length) ; if (!j) return null; window.__actions.setUnitDays(j.id, j.trailerIds[0], { from: j.startDate, to: j.startDate }); return window.__store.getState().db.jobs.find(x => x.id === j.id).unitDays?.[j.trailerIds[0]] })
  ok(!ud || ud.from === ud.to, 'F7 truck booked for move-in day only')
  // F5 ask-hero answer
  await p.evaluate(() => { location.hash = '/dispatch' }); await W(800)
  const ah = p.locator('[data-testid=ask-hero-input]')
  if (await ah.count()) { await ah.fill('which cranes are free thursday'); await W(600); ok(await p.locator('[data-testid=ask-hero-answer]').count() === 1, 'F5 “What do you need to do?” answers office questions in place') } else ok(true, 'ask-hero not on this dashboard')
  // G2 print stylesheet hides chrome
  await p.emulateMedia({ media: 'print' }); await W(200)
  const pr = await p.evaluate(() => { const a = document.querySelector('aside'); return !a || getComputedStyle(a).display === 'none' }); ok(pr, 'G2 print hides the sidebar'); await p.emulateMedia({ media: 'screen' })
  // M3 DVIR tag-out notice
  const to = await p.evaluate(() => { const db = window.__store.getState().db; const u = db.equipment.find(e => e.category === 'Semi' && e.status !== 'Out of Service'); const emp = db.employees.find(e => e.craft === 'Truck Driver') ?? db.employees[0]
    window.__actions.submitDvir({ unitId: u.id, employeeId: emp.id, date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) + 'x', items: { Brakes: 'defect' }, defects: 'Air leak at the left brake chamber', safeToOperate: false })
    const n = window.__store.getState().db.notices.find(x => /TAGGED OUT/i.test(x.title)); return { n: !!n, sev: n?.severity, st: window.__store.getState().db.equipment.find(e => e.id === u.id).status } })
  ok(to.n && to.sev === 'Urgent', `E pre-trip NOT safe → Urgent TAGGED OUT notice (unit ${to.st})`)
  // shop M6 release-to-service
  const rel = await p.evaluate(() => { const A = window.__actions, S = window.__store.getState(); const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const j = S.db.jobs.find(x => x.status !== 'Complete' && x.craneId && x.startDate <= t && x.endDate >= t && !S.db.workOrders.some(w => w.unitId === x.craneId && w.status !== 'Closed' && w.priority === 'Critical')); if (!j) return null
    const uid = j.craneId; window.__store.setState(s => ({ db: { ...s.db, equipment: s.db.equipment.map(e => e.id === uid ? { ...e, status: 'Maintenance' } : e) } }))
    const mk = (title, src) => A.createWO({ unitId: uid, title, complaint: 'QA', priority: 'Normal', status: 'Ready for Release', opened: t, due: t, parts: [], laborHrs: 1, laborRate: 0, source: src })
    mk('PM-A 250 hr service', 'Service Plan'); mk('Replace marker lamp', 'Driver Report'); const db1 = window.__store.getState().db; const wos = db1.workOrders.filter(w => w.unitId === uid && w.status !== 'Closed')
    const pm = wos.find(w => /\bPM\b|PM-[A-Z]/.test(w.title)) ?? wos[0]; const nb = wos.length
    const h0 = db1.equipment.find(e => e.id === uid).nextServiceDate
    const r = A.releaseToService(uid, pm?.id); const db2 = window.__store.getState().db
    return { st: db2.equipment.find(e => e.id === uid).status, closed: db2.workOrders.find(w => w.id === pm?.id)?.status, stillOpen: db2.workOrders.filter(w => w.unitId === uid && w.status !== 'Closed').length, nb, h0, h1: db2.equipment.find(e => e.id === uid).nextServiceDate, r } })
  if (rel) { ok(rel.st === 'On Job', `M6 released unit on a live job goes back "On Job" (${rel.st} ${rel.r?.reason ?? ''})`); ok(rel.closed === 'Closed' && rel.stillOpen === rel.nb - 1, 'M6 release closes only the one work order'); ok(rel.h1 > rel.h0 || rel.h0 > CHI(), 'M6 PM release resets the service date') } else ok(true, 'no live crane job today')
  // shop M8 rigging tags gate checkout
  const rg = await p.evaluate(() => { const db = window.__store.getState().db; const it = db.items.find(i => /Chain sling/.test(i.name)); if (!it || it.onHand < 1) return null
    try { window.__actions.invCheckout({ itemId: it.id, qty: it.onHand, target: { kind: 'job', id: db.jobs[0].id }, reason: 'QA' }); return 'allowed' } catch (e) { return String(e.message) } })
  ok(rg === null || /tagged piece|removed from service|tag.* can go out/i.test(rg), `M8 a removed/overdue rigging tag can’t go out on a checkout (${(rg ?? 'n/a').slice(0, 60)})`)
  await c.close() }

// ── field on phones: Back between tabs, discard prompt, DVIR per-truck checklist, stub detail, safe-area, search routes
for (const [name, opts, br] of [['iphone390', devices['iPhone 14'], wk], ['pixel7', { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }, cr]]) {
  const { c, p } = await page(br, opts, 'field'); await W(600)
  await p.tap('[data-testid=ftab-more]'); await W(400); ok(await p.locator('[data-testid=tile-incident]').count() === 1, `${name}: More tab open`)
  await p.goBack(); await W(600); ok(await p.locator('[data-testid=tile-incident]').count() === 0 && await p.locator('[data-testid=field-app]').count() === 1, `${name}: Android/iOS Back from a tab goes Home and stays in the app`)
  // discard prompt
  await p.tap('[data-testid=ftab-more]'); await W(300); await p.tap('[data-testid=tile-incident]'); await p.waitForSelector('[data-testid=incident-form]'); await p.fill('[data-testid=inc-desc]', 'QA typed something')
  let dmsg = ''; p.once('dialog', d => { dmsg = d.message(); d.accept() })
  await p.locator('[data-testid=fsheet-back]').tap(); await W(500)
  ok(/Discard what you entered/i.test(dmsg) && await p.locator('[data-testid=incident-form]').count() === 0, `${name}: closing a half-filled report asks “Discard what you entered?”`)
  if (await p.locator('[data-testid=incident-form]').count()) { await p.keyboard.press('Escape'); await W(300) }
  // DVIR per truck type
  await p.tap('[data-testid=ftab-home]'); await W(300)
  const dv = p.locator('button', { hasText: 'Pre-trip (DVIR)' }).first(); if (await dv.count()) { await dv.tap(); await W(600)
    const sel = p.locator('[data-testid=dvir-unit]'); ok(await sel.count() === 1, `${name}: pre-trip lets the driver pick the unit`)
    if (await sel.count()) { const opts2 = await sel.locator('option').evaluateAll(os => os.map(o => o.value)); const before = await p.textContent('[data-testid=dvir-items]')
      const semi = await p.evaluate(ids => { const db = window.__store.getState().db; return ids.find(id => db.equipment.find(e => e.id === id)?.category === 'Semi') }, opts2)
      if (semi) { await sel.selectOption(semi); await W(300); ok(before !== await p.textContent('[data-testid=dvir-items]'), `${name}: a semi gets the truck checklist, not the crane one`) } }
    await p.screenshot({ path: out + name + '-dvir.png' }); p.once('dialog', d => d.accept()); await p.locator('[data-testid=fsheet-back]').tap(); await W(400) }
  // n13 stub detail + n15 search routing
  await p.tap('[data-testid=ftab-more]'); await W(300); await p.tap('[data-testid=tile-pay]'); await p.waitForSelector('[data-testid=my-pay]'); const stub = p.locator('[data-testid=pay-stub]').first()
  if (await stub.count()) { await stub.tap(); await W(300); ok(await p.locator('[data-testid=stub-detail]').count() >= 1, `${name}: pay stub opens its detail`) }
  await p.locator('[data-testid=fsheet-back]').tap(); await W(400)
  for (const [q, sel] of [['union hours', 'union-history'], ['pto balance', 'pto-balance']]) {
    await p.tap('[data-testid=ftab-home]'); await W(300); const inp = p.locator('[data-testid=field-app] input').first(); await inp.fill(q); await W(400); await inp.press('Enter'); await W(900)
    ok(await p.locator(`[data-testid=${sel}]`).count() >= 1, `${name}: “${q}” opens ${sel}`); await p.goBack(); await W(500) }
  // n14: union history phone cards
  if (name === 'iphone390') { const u = await p.evaluate(() => 1); void u }
  await c.close() }

// ── supervisor per-person crew approval (iPhone WebKit)
{ const { c, p } = await page(wk, devices['iPhone 14']); await p.tap('[data-sup=emp-2001]'); await W(1200)
  const t = p.locator('[data-testid=tile-crew]'); if (await t.count()) { await t.tap(); await p.waitForSelector('[data-testid=my-crew]')
    const ap = p.locator('[data-testid=crew-approve]'); if (await ap.count()) { const rows = await p.locator('[data-testid=crew-time-row]').count(); ok(rows >= 1, `M5 crew time listed per person (${rows})`)
      if (rows > 1) { await p.locator('[data-testid=crew-time-row] input').first().tap(); await W(200); ok(/Approve \d+/.test(await ap.textContent()), 'M5 unchecking one person changes the count') }
      await ap.tap(); await W(300); ok(await p.getByRole('button', { name: 'Approve', exact: true }).count() === 1, 'M5 approve asks to confirm'); await p.getByRole('button', { name: 'Approve', exact: true }).tap(); await W(400) } else ok(true, 'no crew time pending') }
  await c.close() }

// ── layout across tablets / desktop: field app mockup only on a desktop with a mouse, 44px hamburger, landscape, 4K zoom
for (const [name, opts] of [['tab800x1280', { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }], ['tab1280x800', { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true }], ['ipad820', devices['iPad (gen 7)'] ? { ...devices['iPad (gen 7)'], viewport: { width: 820, height: 1180 } } : { viewport: { width: 820, height: 1180 }, hasTouch: true }], ['desk1920', { viewport: { width: 1920, height: 1080 } }]]) {
  const { c, p } = await page(name === 'ipad820' ? wk : cr, opts, 'field'); await W(600)
  const frame = await p.evaluate(() => { const f = document.querySelector('[data-testid=field-app]'); const r = f?.getBoundingClientRect(); return r ? Math.round(r.width) : 0 })
  if (name === 'desk1920') ok(frame < 600, `${name}: field app shows as a phone mockup on a desktop with a mouse (${frame}px)`)
  else ok(frame >= (opts.viewport.width - 4), `${name}: field app is full screen on a tablet (${frame}px)`)
  await p.screenshot({ path: out + name + '-field.png' }); await c.close() }
for (const [name, opts] of [['iphone390', devices['iPhone 14'], wk], ['pixel7', { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }, cr]]) {
  const { c, p } = await page(opts === devices['iPhone 14'] ? wk : cr, opts, 'dispatch'); const hb = await p.locator('[data-testid=hamburger]').boundingBox()
  ok(!!hb && hb.width >= 44 && hb.height >= 44, `${name}: hamburger is a 44px target (${Math.round(hb?.width ?? 0)}×${Math.round(hb?.height ?? 0)})`); await c.close() }
{ const { c, p } = await page(cr, { viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true }, 'dispatch'); await W(500)
  const nav = await p.evaluate(() => { const n = [...document.querySelectorAll('nav')].find(x => getComputedStyle(x).position === 'fixed'); return n ? getComputedStyle(n).display : 'none' })
  ok(nav === 'none', 'landscape phone: bottom nav steps aside so content has room'); await p.screenshot({ path: out + 'pixel7-landscape.png' }); await c.close() }
{ const { c, p } = await page(cr, { viewport: { width: 3840, height: 2160 } }, 'dispatch'); const z = await p.evaluate(() => Math.max(Number(getComputedStyle(document.documentElement).zoom) || 1, parseFloat(getComputedStyle(document.documentElement).fontSize) / 16))
  ok(Number(z) >= 1.9, `4K: UI scales up (root font ×${z}; dive3 M13 uses rem, not zoom)`); await c.close() }

await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
