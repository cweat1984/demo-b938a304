// dive3 field/safety part 2: S10 draw lock, M3 non-driving override, S4 fail→WO, M2 re-inspection, S1 reclassify + close guard,
// F5 future separation, U1 rows, T3 OSHA year/300A, S12 reset, F1 double tap, A3 instant punch, F3 removed banner. 5 devices.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r, e) => { await S(p, ([r, e]) => { window.__store.getState().signOut(); window.__store.getState().signIn(r, 'Demo role', e) }, [r, e]); await W(800) }
const dbq = (p, f) => p.evaluate(`(${f})(window.__store.getState().db)`)
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('dialog', d => d.dismiss().catch(() => {})); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'der')
  const T0 = await S(p, () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
  // S10 one random draw per quarter
  await S(p, () => window.__store.getState().go('drugalc')); await W(700)
  await p.locator('.seg-btn', { hasText: 'Random' }).first().click().catch(() => {}); await W(300)
  if (await p.locator('[data-testid=da-select]').count()) { await p.locator('[data-testid=da-select]').click(); await W(500); await p.locator('.seg-btn', { hasText: 'Random' }).first().click().catch(() => {}); await W(400) }
  ok(await p.locator('[data-testid=da-select-locked]').count() === 1 && await p.locator('[data-testid=da-select]').count() === 0, `${name}: this quarter's draw is locked after it runs`)
  const nSel = await S(p, () => JSON.parse(localStorage.getItem('sc-da-v1')).selections.length)
  // M3 + relink: activation by override = non-driving; the hire's pre-employment records follow the person
  await as(p, 'owner')
  const r3 = await S(p, () => { const st = window.__store.getState, A = window.__actions; const h = st().db.hires[0]; if (!h) return null; const id = A.activateHire(h.id, { noDrive: 'Override (fictional test)' }); const e = st().db.employees.find(x => x.id === id); return { id, nd: e?.noDrive, status: e?.status } })
  ok(r3 && r3.id && r3.nd && r3.status === 'Active', `${name}: DOT override activates as non-driving until cleared`)
  // S4: a failed inspection opens a Critical work order + alerts
  const r4 = await S(p, () => { const st = window.__store.getState, A = window.__actions; const i = st().db.inspections.find(x => x.unitId); const n0 = st().db.workOrders.length; A.recordInspection(i.id, 'Fail', 'Hook latch broken (fictional)'); const d = st().db; return { wo: d.workOrders.length === n0 + 1 && d.workOrders[0].source === 'Inspection' && d.workOrders[0].priority === 'Critical', notice: /TAGGED OUT/.test(d.notices[0].title), oos: d.equipment.find(u => u.id === i.unitId).status === 'Out of Service' } })
  ok(r4.wo && r4.notice && r4.oos, `${name}: inspection Fail → tagged out + Critical WO + urgent notice`)
  // M2: re-inspection after the WO closes
  const r5 = await S(p, T0 => { const st = window.__store.getState, A = window.__actions; const u = st().db.equipment.find(x => x.status !== 'Out of Service' && /Truck|Tractor|Crane/i.test(x.category)) ?? st().db.equipment[0]; const e = st().db.employees.find(x => x.status === 'Active').id
    const items = { Brakes: 'defect' }; const a = A.submitDvir({ unitId: u.id, employeeId: e, date: T0, items, defects: 'Brake chamber leak (fictional)', safeToOperate: false }); const b = A.submitDvir({ unitId: u.id, employeeId: e, date: T0, items: { Brakes: 'ok' }, defects: '', safeToOperate: true })
    const wo = st().db.dvirs.find(d => d.unitId === u.id && d.employeeId === e).workOrderId; window.__store.setState(s => ({ db: { ...s.db, workOrders: s.db.workOrders.map(w => w.id === wo ? { ...w, status: 'Closed' } : w) } }))
    const c = A.submitDvir({ unitId: u.id, employeeId: e, date: T0, items: { Brakes: 'ok' }, defects: '', safeToOperate: true }); return { a: a.ok, b: b.ok, c: c.ok } }, T0)
  ok(r5.a && !r5.b && r5.c, `${name}: second pre-trip refused until the WO closes, then allowed (${JSON.stringify(r5)})`)
  // S1 + close guard
  const r6 = await S(p, () => { const st = window.__store.getState, A = window.__actions; const i = st().db.incidents.find(x => x.kind !== 'Recordable' && x.status !== 'Closed'); const a = A.updateIncident(i.id, { status: 'Closed', correctiveAction: '' }); const b = A.updateIncident(i.id, { kind: 'Recordable' }); return { a, b, k: st().db.incidents.find(x => x.id === i.id).kind } })
  ok(!r6.a && r6.b && r6.k === 'Recordable', `${name}: any incident needs a corrective action to close; can be reclassified`)
  // F5: a future last day keeps them active
  const r7 = await S(p, () => { const st = window.__store.getState, A = window.__actions; const e = st().db.employees.filter(x => x.status === 'Active' && !x.ssHold).at(-2); const d = new Date(Date.now() + 9 * 864e5).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); A.terminateEmployee(e.id, { lastDay: d, reason: 'Test (fictional)', rehire: true }); const x = st().db.employees.find(y => y.id === e.id); return { s: x.status, t: !!x.term } })
  ok(r7.s === 'Active' && r7.t, `${name}: separation dated next week is scheduled, not an instant lock-out`)
  // UI: inspection rows, OSHA year + 300A, incident time
  await as(p, 'safety'); await S(p, () => window.__store.getState().go('safety')); await W(700)
  await p.locator('.seg-btn', { hasText: 'Inspections' }).first().click(); await W(400)
  const row = p.locator('[data-testid=insp-row]').nth(1), pb = await row.locator('[data-testid=insp-pass]').boundingBox(), fb = await row.locator('[data-testid=insp-fail]').boundingBox()
  ok(pb && fb && fb.x - (pb.x + pb.width) >= ((opts.viewport?.width ?? 400) < 480 ? 20 : 4), `${name}: Pass and Fail are spaced apart`)
  const rb = await row.boundingBox(); ok(!!rb && rb.x + rb.width <= (await p.evaluate(() => innerWidth)) + 1, `${name}: inspection row fits the screen`)
  await row.locator('[data-testid=insp-fail]').click(); await W(400)
  ok(await p.locator('[data-testid=insp-fail-warn]').count() === 1 && await p.locator('[data-testid=insp-save]').isDisabled(), `${name}: Fail needs a defect note and warns about the work order`)
  await p.keyboard.press('Escape'); await W(400)
  await p.locator('.seg-btn', { hasText: /OSHA/ }).first().click(); await W(400)
  ok(await p.locator('[data-testid=osha-year] option').count() === 5 && await p.locator('[data-testid=osha-300a]').count() === 1, `${name}: OSHA year picker + 300A summary`)
  // S12 reset clears side stores, keeps settings
  await as(p, 'owner')
  const r8 = await S(p, async () => { localStorage.setItem('sc-rig-v1', '{"x":1}'); localStorage.setItem('sc-prefs', localStorage.getItem('sc-prefs') ?? '{}'); await window.__store.getState().resetDemo(); return { rig: localStorage.getItem('sc-rig-v1'), prefs: localStorage.getItem('sc-prefs') !== null } })
  ok(r8.rig === null && r8.prefs, `${name}: Reset demo clears side-store data, keeps settings`)
  // Field: F1 double tap, A3 instant punch, F3 removed-from-job banner, D2 ticket discard guard, J1 JSA list
  await p.reload(); await p.waitForFunction(() => window.__store?.getState().ready, null, { timeout: 20000 }); await W(500)
  const fe = await dbq(p, `db => { const t = '${T0}'; return db.assignments.filter(x => x.date === t).map(x => x.employeeId).find(id => { const e = db.employees.find(y => y.id === id); return e && e.status === 'Active' && !e.ssHold && !db.clocks.some(c => c.employeeId === id) && db.assignments.filter(a => a.employeeId === id && a.date === t).length === 1 }) }`)
  await as(p, 'field', fe); await W(600)
  const n0 = await dbq(p, `db => db.time.filter(t => t.employeeId === '${fe}').length`)
  const cin = p.locator('[data-testid=clockbar-in]'); await cin.click(); await p.locator('[data-testid=clockbar-out]').click({ timeout: 1500 }).catch(() => {}); await W(300)
  ok(await p.locator('[data-testid=clockout-submit]').count() === 0, `${name}: double tap on Clock in doesn't open Clock out`)
  await W(800); await p.locator('[data-testid=clockbar-out]').click(); await W(500); await p.locator('[data-testid=clockout-submit]').click(); await W(500)
  ok(await p.getByText('Discard this punch?').count() >= 1, `${name}: instant clock-out asks to discard`)
  await p.getByRole('button', { name: 'Discard punch' }).click(); await W(500)
  ok(await dbq(p, `db => !db.clocks.some(c => c.employeeId === '${fe}') && db.time.filter(t => t.employeeId === '${fe}').length === ${n0}`), `${name}: discarded punch saves no 0 h entry`)
  await p.locator('[data-testid=clockbar-in]').click(); await W(600)
  await S(p, id => { const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); window.__store.setState(s => ({ db: { ...s.db, assignments: s.db.assignments.filter(a => !(a.employeeId === id && a.date === t)) } })) }, fe); await W(500)
  ok(await p.locator('[data-testid=clock-removed]').count() === 1, `${name}: banner when dispatch removes you from the job you're clocked in on`)
  await c.close()
}
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
