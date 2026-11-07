// dive3 field/safety part 3: J2 JSA dedupe, S13 store refusals, T3b incident no. per year, hire numbers, Needs-Correction ticket
// edit, supervisor JSA on the phone, desktop Large mode. 5 devices.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r, e) => { await S(p, ([r, e]) => { window.__store.getState().signOut(); window.__store.getState().signIn(r, 'Demo role', e) }, [r, e]); await W(800) }
const dbq = (p, f) => p.evaluate(`(${f})(window.__store.getState().db)`)
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('dialog', d => d.dismiss().catch(() => {})); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'owner')
  const T0 = await S(p, () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
  const r1 = await S(p, T0 => { const st = window.__store.getState, A = window.__actions, db = st().db
    const n0 = db.talks.length; const t = { kind: 'JSA', title: 'Blade pick T-9 (fictional)', jobId: db.jobs[0].id, date: T0, leaderId: db.employees[0].id, attendeeIds: [], hazards: ['Wind'], controls: ['Tag lines'], signed: false }; A.addTalk(t); A.addTalk(t); const jsa = st().db.talks.length - n0
    const held = st().db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Operator'); const j = st().db.jobs.find(x => x.endDate >= T0 && x.startDate <= T0)
    window.__store.setState(s => ({ db: { ...s.db, employees: s.db.employees.map(e => e.id === held.id ? { ...e, status: 'Inactive' } : e) } }))
    const a0 = st().db.assignments.length; A.assign(j.id, T0, held.id, 'Operator'); const asg = st().db.assignments.length - a0
    A.addIncident({ date: T0, kind: 'Near Miss', severity: 'Low', description: 'Test (fictional)', status: 'Reported', reportedBy: 'QA', photos: 0 }); const no = st().db.incidents[0].no
    A.createHire({ first: 'Testa', last: 'Fictional', craft: 'Operator', phone: '(405) 555-0199', start: T0, position: 'Operator' }); const emp = st().db.hires[0].empNo
    return { jsa, asg, no, emp } }, T0)
  ok(r1.jsa === 1, `${name}: a double Publish makes one JSA`)
  ok(r1.asg === 0, `${name}: the store refuses to schedule an Inactive employee`)
  ok(/^INC-\d{4}-\d{3}$/.test(r1.no) && r1.no.startsWith('INC-' + T0.slice(0, 4)), `${name}: incident number uses its year (${r1.no})`)
  ok(/^SLH-[1-8]\d{3}$/.test(r1.emp), `${name}: new hire number continues the field sequence (${r1.emp})`)
  // Needs Correction ticket opens for editing on the phone
  const sup = await dbq(p, `db => { const t = '${T0}'; const j = db.jobs.find(j => db.assignments.some(a => a.jobId === j.id && a.date === t) && db.employees.find(e => e.id === j.supervisorId)?.status === 'Active' && db.assignments.some(a => a.jobId === j.id && a.date === t && a.employeeId === j.supervisorId)); return j && [j.supervisorId, j.id] }`)
  if (sup) {
    await S(p, ([sid, jid, T0]) => { const db = window.__store.getState().db; const t = { id: 'tk-fix-test', jobId: jid, date: T0, supervisorId: sid, crewIds: [sid], hours: { 'Lifting & Hoisting': 8 }, work: 'Test (fictional)', equipmentIn: '', equipmentOut: '', delays: '', pctComplete: 50, expectedFinish: T0, status: 'Needs Correction', correction: 'Hours split is off (fictional)', photos: 0, submittedAt: new Date().toISOString(), signedAt: new Date().toISOString() }; window.__store.setState(s => ({ db: { ...s.db, tickets: [...s.db.tickets.filter(x => !(x.jobId === jid && x.date === T0)), t] } })) }, [...sup, T0])
    await as(p, 'field', sup[0]); await W(500)
    await S(p, () => { const b = [...document.querySelectorAll('button')].find(b => /ticket|signature/i.test(b.textContent)); b?.click() }); await W(700)
    ok(await p.locator('[data-testid=ticket-fix]').count() === 1 && await p.locator('[data-testid=ticket-signed]').count() === 0, `${name}: a sent-back ticket opens for editing with the office note`)
    await p.keyboard.press('Escape'); await W(300); await p.reload(); await p.waitForFunction(() => window.__store?.getState().ready); await W(600)
    await S(p, () => window.__store.getState().setUI && 0)
    let jb = p.locator('button', { hasText: 'JSA & toolbox' }).first(); if (!(await jb.isVisible().catch(() => false))) { await p.locator('button', { hasText: /^More$/ }).last().click().catch(() => {}); await W(500) } jb = p.locator('button', { hasText: 'JSA & toolbox' }).first(); await jb.click().catch(() => {}); await W(600)
    if (await p.locator('[data-testid=jsa-new-open]').count()) { await p.locator('[data-testid=jsa-new-open]').click(); await W(300); await p.fill('[data-testid=jsa-new-title]', 'Tailing pick (fictional)'); await p.fill('[data-testid=jsa-new-hazards]', 'Pinch points, wind'); const n0 = await dbq(p, 'db => db.talks.length'); await p.locator('[data-testid=jsa-new-publish]').click(); await W(500)
      ok(await dbq(p, 'db => db.talks.length') === n0 + 1, `${name}: supervisor writes a JSA on the phone`) } else ok(false, `${name}: supervisor JSA button found`)
  } else ok(false, `${name}: found a supervisor on a job today`)
  if (name === 'desk1920' && sup) { await as(p, 'field', sup[0]); await W(500); const w0 = (await p.locator('[data-testid=field-frame]').boundingBox()).width; await p.locator('[data-testid=field-large]').click(); await W(300); const w1 = (await p.locator('[data-testid=field-frame]').boundingBox()).width; ok(w1 > w0 + 80, `${name}: Large mode enlarges the field preview (${w0}→${w1})`) }
  await c.close()
}
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
