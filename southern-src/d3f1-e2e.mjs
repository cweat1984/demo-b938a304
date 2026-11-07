// dive3 field/safety part 1: D&A details stay out of the shared audit (B1), post-accident hold lifts only when every test is
// negative (B2), holds block clock-in and stop a running clock (B3), separation stops the clock (M4), honest clock-out (F2),
// manual time dates/job (F6/U2), PTO validation (F7). iPhone 390, Pixel 7, iPad 820, Android tablet 800, 1920.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r, e) => { await S(p, ([r, e]) => { window.__store.getState().signOut(); window.__store.getState().signIn(r, 'Demo role', e) }, [r, e]); await W(800) }
const dbq = (p, f) => p.evaluate(`(${f})(window.__store.getState().db)`)
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'der')
  await S(p, () => window.__store.getState().go('drugalc')); await W(700)
  await p.locator('.seg-btn', { hasText: 'Tests' }).first().click(); await W(400)
  const [a, b] = await dbq(p, db => db.employees.filter(e => e.status === 'Active' && !e.ssHold && e.craft && e.craft !== 'Office').slice(3, 5).map(e => e.id))
  // B1
  await p.locator('[data-testid=da-order-emp]').selectOption(a); await p.locator('[data-testid=da-order-kind]').selectOption('Reasonable suspicion')
  await p.fill('[data-testid=da-order-note]', 'Slurred speech at 7:40 fictional obs'); await p.locator('[data-testid=da-order-go]').dispatchEvent('click'); await W(500)
  const au = await dbq(p, db => JSON.stringify(db.audit.slice(0, 40)))
  ok(!/Slurred|Reasonable suspicion/.test(au), `${name}: shared audit has no D&A test type or observation`)
  ok(await S(p, id => JSON.parse(localStorage.getItem('sc-da-v1')).tests.some(t => t.empId === id && /Slurred/.test(t.note ?? '')), a), `${name}: the observation stays with the D&A record`)
  // B2
  await p.locator('[data-testid=da-order-emp]').selectOption(b); await p.locator('[data-testid=da-order-kind]').selectOption('Post-accident'); await p.locator('[data-testid=da-order-panel]').selectOption('Both')
  await p.locator('[data-testid=da-order-go]').dispatchEvent('click'); await W(600)
  ok(!!(await dbq(p, `db => db.employees.find(e => e.id === '${b}').ssHold`)), `${name}: post-accident drug + alcohol ordered, employee held`)
  const bn = await dbq(p, `db => { const e = db.employees.find(x => x.id === '${b}'); return e.first + ' ' + e.last }`)
  const rowA = p.locator('[data-testid=da-test]', { hasText: bn }).filter({ hasText: 'Alcohol' }).first()
  await rowA.locator('[data-testid=da-result-Negative]').dispatchEvent('click'); await W(500)
  ok(!!(await dbq(p, `db => db.employees.find(e => e.id === '${b}').ssHold`)), `${name}: alcohol negative, drug pending → still held`)
  const rowD = p.locator('[data-testid=da-test]', { hasText: bn }).filter({ hasText: 'Drug' }).first()
  await rowD.locator('[data-testid=da-result-Negative]').dispatchEvent('click'); await W(500)
  ok(!(await dbq(p, `db => db.employees.find(e => e.id === '${b}').ssHold`)), `${name}: both negative → cleared`)
  ok(!/Return-to-duty negative/.test(await p.locator('[data-sonner-toast]').allInnerTexts().then(t => t.join(' '))), `${name}: no return-to-duty/SAP wording for a post-accident clear`)
  // B3 + M4: hold / separation stop a running clock; held can't clock in
  const fe = await dbq(p, `db => { const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); return db.assignments.filter(x => x.date === t).map(x => x.employeeId).find(id => { const e = db.employees.find(y => y.id === id); return e && e.status === 'Active' && !e.ssHold && id !== '${a}' && id !== '${b}' }) }`)
  const r3 = await S(p, id => { const A = window.__actions, st = window.__store.getState; A.clockIn(id); const was = st().db.clocks.some(x => x.employeeId === id); A.ssHold(id, true); const stopped = !st().db.clocks.some(x => x.employeeId === id); const flagged = st().db.time.some(t => t.employeeId === id && t.status === 'Flagged' && /restriction/.test(t.note ?? '')); const again = A.clockIn(id); return { was, stopped, flagged, again: again?.ok, still: st().db.clocks.some(x => x.employeeId === id) } }, fe)
  ok(r3.was && r3.stopped && r3.flagged, `${name}: a hold landing mid-shift stops the clock, flagged for the supervisor`)
  ok(r3.again === false && !r3.still, `${name}: held employee can't clock in`)
  await as(p, 'field', fe); await W(500)
  ok(await p.locator('[data-testid=field-held]').count() === 1, `${name}: phone shows the hold`)
  await as(p, 'owner'); await S(p, id => window.__actions.ssHold(id, false), fe)
  const r4 = await S(p, id => { const A = window.__actions, st = window.__store.getState; A.clockIn(id); A.terminateEmployee(id, { lastDay: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }), reason: 'Test (fictional)', rehire: true }); return { stopped: !st().db.clocks.some(x => x.employeeId === id), flagged: st().db.time.some(t => t.employeeId === id && /separation/.test(t.note ?? '')) } }, fe)
  ok(r4.stopped && r4.flagged, `${name}: separation stops the clock, flagged for payroll`)
  // F6/U2 + F7 on the phone
  const fe2 = await dbq(p, `db => { const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); return db.assignments.filter(x => x.date === t).map(x => x.employeeId).find(id => { const e = db.employees.find(y => y.id === id); return e && e.status === 'Active' && !e.ssHold && id !== '${fe}' }) }`)
  await as(p, 'field', fe2); await W(500)
  await p.locator('button', { hasText: /^Time$/ }).last().click().catch(() => {}); await W(500)
  const addT = p.locator('button', { hasText: /Add time/ }).first()
  if (await addT.count()) { await addT.click(); await W(500)
    await p.fill('[data-testid=manual-date]', '2001-02-05'); await W(200)
    ok(await p.locator('[data-testid=manual-save]').isDisabled() && /supervisor/.test(await p.innerText('[data-testid=manual-err]').catch(() => '')), `${name}: manual time dated 2001 refused`)
    await p.keyboard.press('Escape'); await W(400)
  } else ok(false, `${name}: Add time found`)
  await p.reload(); await p.waitForSelector('[data-role=der]', { timeout: 8000 }).catch(() => {}); await as(p, 'field', fe2); await W(500)
  let pto = p.locator('button', { hasText: /Time off/ }).first(); if (!(await pto.isVisible().catch(() => false))) { await p.locator('button', { hasText: /^More$/ }).last().click().catch(() => {}); await W(500); pto = p.locator('button', { hasText: /Time off/ }).first() }
  if (await pto.count()) { await pto.click(); await W(500)
    await p.fill('[data-testid=pto-from]', ''); await W(150)
    ok(await p.locator('[data-testid=pto-send]').isDisabled(), `${name}: PTO with a blank date can't be sent`)
    await p.fill('[data-testid=pto-from]', '2026-01-05'); await W(150)
    ok(/past/.test(await p.innerText('[data-testid=pto-err]').catch(() => '')), `${name}: PTO in the past refused`)
    await p.keyboard.press('Escape'); await W(300)
  } else ok(false, `${name}: PTO found`)
  await c.close()
}
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
