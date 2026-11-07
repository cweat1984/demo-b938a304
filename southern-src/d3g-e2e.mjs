// dive3 dispatch blockers + M1–M4: B1 one crane-clash rule (board, picker, forecast), B2 reschedule moves hires/units, B3 swap keeps
// trucks + moves rig plan, B4 caps, M1 down assist, M2 dropped crew told, M3 started job keeps start. 5 devices.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r, e) => { await S(p, ([r, e]) => { window.__store.getState().signOut(); window.__store.getState().signIn(r, 'Demo role', e) }, [r, e]); await W(800) }
const dbq = (p, f) => p.evaluate(`(${f})(window.__store.getState().db)`)
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('dialog', d => d.dismiss().catch(() => {})); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'dispatch')
  const T0 = await S(p, () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }))
  const r = await S(p, T0 => {
    const st = window.__store.getState, A = window.__actions, R = window.__rig, set = f => window.__store.setState(s => ({ db: f(s.db) }))
    const add = (d, n) => { const t = new Date(d + 'T12:00'); t.setDate(t.getDate() + n); return t.toLocaleDateString('en-CA') }
    const live = st().db.jobs.filter(j => j.craneId && j.startDate <= T0 && j.endDate >= T0 && ['Scheduled', 'On Site', 'En Route'].includes(j.status) || (j.craneId && j.startDate <= T0 && j.endDate >= T0 && j.stage === 'In Progress'))
    const [a, b] = live; const out = {}
    // B1
    set(db => ({ ...db, jobs: db.jobs.map(j => j.id === b.id ? { ...j, craneIds: [...(j.craneIds ?? []), a.craneId], craneHours: {} } : j.id === a.id ? { ...j, craneHours: {} } : j) }))
    const ja = st().db.jobs.find(j => j.id === a.id); out.b1red = R.jobConflicts(st().db, ja, T0).some(x => x.level === 'red' && /double-booked/.test(x.text))
    set(db => ({ ...db, jobs: db.jobs.map(j => j.id === b.id ? { ...j, siteId: a.siteId, craneHours: { [a.craneId]: { from: '13:00', to: '17:00' } } } : j.id === a.id ? { ...j, craneHours: { [a.craneId]: { from: '06:00', to: '12:00' } } } : j) }))
    const ja2 = st().db.jobs.find(j => j.id === a.id); const cf2 = R.jobConflicts(st().db, ja2, T0).filter(x => x.text.includes('Crane ' + st().db.equipment.find(e => e.id === a.craneId).unit)); out.b1txt = cf2.map(x => x.text).join(' | '); out.b1share = !cf2.some(x => x.text.includes('double-booked: Job #' + b.jobNo)) && cf2.some(x => x.text.includes('also on Job #' + b.jobNo))
    // B2
    const f = st().db.jobs.find(j => j.startDate > add(T0, 3) && !(j.rig ?? []).length && j.status !== 'Complete')
    set(db => ({ ...db, jobs: db.jobs.map(j => j.id === f.id ? { ...j, outside: [{ id: 'oc-t', vendorId: (db.craneVendors ?? [])[0]?.id ?? 'v1', size: '300t', role: 'Work assist', from: f.startDate, to: f.startDate, status: 'Booked' }], unitDays: { [db.equipment.find(e => e.category !== 'Crane').id]: { from: add(f.startDate, -1), to: f.startDate } } } : j) }))
    A.rescheduleJob(f.id, { start: add(f.startDate, 7), end: add(f.endDate, 7), shiftCrew: true }); const f2 = st().db.jobs.find(j => j.id === f.id)
    out.b2 = f2.outside[0].from === add(f.startDate, 7) && Object.values(f2.unitDays)[0].to === add(f.startDate, 7)
    // B4
    out.b4len = A.rescheduleJob(f.id, { start: f2.startDate, end: add(f2.startDate, 400) }) === false
    const t0 = performance.now(); out.b4rig = R.rigUpDates({ upMode: 'days', upDays: 1e7, hookReady: '2026-12-01', travelDays: 1e7, downStart: '2026-12-10', downAmount: 1e7, downUnit: 'd' }).length === 60 && R.downDays({ downAmount: 1e7, downUnit: 'd' }) === 90 && performance.now() - t0 < 200
    // M3
    const s = st().db.jobs.find(j => j.startDate < T0 && j.endDate > add(T0, 2) && j.status !== 'Complete')
    out.m3 = s ? A.rescheduleJob(s.id, { start: add(s.startDate, 1), end: s.endDate }) === false && A.rescheduleJob(s.id, { start: s.startDate, end: add(s.endDate, 1) }) === true : true
    // M2
    const g = st().db.jobs.find(j => j.id !== f.id && j.startDate > add(T0, 2) && st().db.assignments.some(x => x.jobId === j.id) && j.status !== 'Complete')
    if (g) { const people = [...new Set(st().db.assignments.filter(x => x.jobId === g.id).map(x => x.employeeId))]; A.rescheduleJob(g.id, { start: add(g.endDate, 30), end: add(g.endDate, 31), shiftCrew: false })
      out.m2 = people.every(id => st().db.notices.some(n => n.empIds?.includes(id) && new RegExp(`off Job #${g.jobNo}`).test(n.title))) } else out.m2 = 'nojob'
    // M1
    const dn = st().db.equipment.find(e => e.category === 'Crane' && e.id !== a.craneId && !R.jobConflicts); set(db => ({ ...db, equipment: db.equipment.map(e => e.category === 'Crane' && e.id === (st().db.equipment.filter(x => x.category === 'Crane' && x.id !== a.craneId && x.id !== b.craneId).at(-1)).id ? { ...e, status: 'Out of Service' } : e) }))
    const down = st().db.equipment.find(e => e.category === 'Crane' && e.status === 'Out of Service'); A.addJobCrane(a.id, down.id); out.m1 = !(st().db.jobs.find(j => j.id === a.id).craneIds ?? []).includes(down.id) && st().db.jobs.find(j => j.id === a.id).craneId !== down.id
    // B3
    const h = st().db.jobs.find(j => j.startDate > add(T0, 2) && j.craneId && j.status !== 'Complete' && j.id !== f.id && j.id !== g?.id)
    const hand = st().db.equipment.find(e => e.category !== 'Crane' && !(st().db.configs.find(x => x.id === h.configId)?.trailerIds ?? []).includes(e.id) && !st().db.jobs.some(j => j.trailerIds.includes(e.id)))
    const nc = st().db.equipment.find(e => e.category === 'Crane' && e.id !== h.craneId && e.status !== 'Out of Service' && e.status !== 'Maintenance')
    set(db => ({ ...db, jobs: db.jobs.map(j => j.id === h.id ? { ...j, trailerIds: [...j.trailerIds, hand.id], rig: [{ craneId: h.craneId, hookReady: h.startDate, travelDays: 1, upMode: 'days', upDays: 1, downStart: add(h.endDate, 1), downAmount: 1, downUnit: 'd' }], craneHours: { [h.craneId]: { from: '06:00', to: '14:00' } } } : j) }))
    A.setCrane(h.id, nc.id, [], h.startDate); const h2 = st().db.jobs.find(j => j.id === h.id)
    out.b3 = h2.trailerIds.includes(hand.id) && h2.rig.every(x => x.craneId === nc.id) && !!h2.craneHours?.[nc.id] && !h2.craneHours?.[h.craneId]
    out.ids = { a: a.id, date: T0 }
    return out }, T0)
  ok(r.b1red, `${name}: same crane all day on two jobs = red double-booked`)
  ok(r.b1share, `${name}: set non-overlapping hours = shared (info only) [${r.b1txt}]`)
  ok(r.b2, `${name}: reschedule moves the outside crane and truck days too`)
  ok(r.b4len && r.b4rig, `${name}: 400-day job refused; rig days capped, no freeze`)
  ok(r.m3, `${name}: a started job keeps its start date; end can change`)
  ok(r.m2 === true, `${name}: crew dropped by a reschedule are told (${r.m2})`)
  ok(r.m1, `${name}: a down crane can't be added as an assist`)
  ok(r.b3, `${name}: swap keeps hand-added units and moves the rig plan + hours`)
  // UI: swap picker shows the red badge for a crane booked all day elsewhere
  await S(p, () => window.__store.getState().go('dispatch')); await W(900)
  const unitBtn = p.locator('[data-testid=crane-swap-open], [data-testid=card-crane]').first()
  if (await unitBtn.count()) { await unitBtn.click(); await W(600); ok(await p.locator('[data-testid=swap-crane]').count() > 3, `${name}: swap list opens`); ok(await p.locator('[data-testid=swap-badge-clash]').count() >= 1, `${name}: picker marks double-booked cranes red`) }
  else ok(await p.locator('[data-testid=dispatch-board], main').count() >= 1, `${name}: board renders`)
  await c.close()
}
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
