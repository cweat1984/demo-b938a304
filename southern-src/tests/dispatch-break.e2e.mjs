// Break tests for the dispatch board, roster extras, job dates, crane forecast
// colors, crane swap, and roster undo/redo.
//
// These assert the behavior the screen should have. On the current build they
// fail, and the failure is the bug. Run against the Vite dev server:
//
//   BASE=http://127.0.0.1:5173/ node tests/dispatch-break.e2e.mjs
//
// Chromium only (Playwright device profiles for phone and tablet). Not a
// physical device, and WebKit is not installed in this environment.
import { chromium, devices } from 'playwright'

const base = process.env.BASE || 'http://127.0.0.1:5173/'
const fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
async function attempt(name, fn) {
  try { await fn() }
  catch (e) { const msg = `${name} threw: ${(e && e.message || e).split('\n')[0]}`; fails.push(msg); console.log('FAIL ' + msg) }
}

const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })

async function boot(opts = {}) {
  const ctx = await browser.newContext(opts)
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', e => errors.push(e.message))
  await p.addInitScript(() => {
    localStorage.setItem('sc-tour-seen', '1')
    window.__probeToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    window.__probeAdd = (s, n) => { const [y, m, d] = s.split('-').map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` }
  })
  await p.goto(base, { waitUntil: 'domcontentloaded' })
  await p.waitForSelector('[data-role=owner]', { timeout: 30000 })
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  await p.waitForSelector('[data-testid=undo-bar]')
  return { ctx, p, errors }
}
const blur = p => p.evaluate(() => { const el = document.activeElement; if (el instanceof HTMLElement) el.blur() })
async function setDate(p, sel, value) {
  await p.locator(sel).evaluate((el, v) => {
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
    desc.set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, value)
}

await attempt('1. "Rest of job" copies someone onto a later day they already work elsewhere.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1440, height: 900 } })
  const setup = await p.evaluate(() => {
    const t = window.__probeToday(), d1 = t, d2 = window.__probeAdd(t, 1)
    const db = window.__store.getState().db
    const jobA = db.jobs.find(j => j.stage !== 'Quote' && j.craneId)
    const jobB = db.jobs.find(j => j.id !== jobA.id && j.stage !== 'Quote')
    const emp = db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Rigger')
    window.__actions.updateJob(jobA.id, { startDate: d1, endDate: d2, stage: 'Scheduled', status: 'Confirmed', positions: ['Rigger'], requiredCerts: [] }, 'probe')
    window.__actions.updateJob(jobB.id, { startDate: d2, endDate: d2, stage: 'Scheduled', status: 'Confirmed', positions: ['Rigger'], requiredCerts: [] }, 'probe')
    const cur = window.__store.getState().db
    const employees = cur.employees.map(e => e.id !== emp.id && e.craft === 'Rigger' ? { ...e, status: 'Inactive' } : e)
    const assignments = cur.assignments.filter(a => a.employeeId !== emp.id && !(a.jobId === jobA.id && a.date === d1))
    window.__store.setState({ db: { ...cur, employees, assignments } })
    window.__actions.assign(jobB.id, d2, emp.id, 'Rigger')
    return { jobNo: jobA.jobNo, jobA: jobA.id, jobB: jobB.id, emp: emp.id, name: `${emp.first} ${emp.last}`, d2 }
  })
  await p.evaluate(() => window.__store.getState().go('dispatch'))
  const card = p.locator(`[data-testid=job-card][data-job="${setup.jobNo}"]`)
  await card.locator('[data-testid=open-slot]').first().click()
  await p.locator('[role=dialog]').getByRole('button', { name: setup.name, exact: true }).click()
  await p.getByRole('button', { name: /Rest of job/ }).click()
  await p.waitForTimeout(300)
  const on = await p.evaluate(s => {
    const asg = window.__store.getState().db.assignments.filter(a => a.employeeId === s.emp && a.date === s.d2)
    return asg.map(a => a.jobId).sort()
  }, setup)
  ok(on.length === 1, `rest-of-job leaves ${setup.name} on one job tomorrow (on ${on.join('+') || 'none'})`)
  await ctx.close()
})

await attempt('2. Extra date editor says Saved for a start before the job and an end after it.', async () => {
  const { ctx, p } = await boot({ ...devices['iPhone SE'] })
  const info = await p.evaluate(() => {
    const db = window.__store.getState().db
    const job = db.jobs.find(j => j.stage !== 'Quote' && j.endDate > j.startDate)
    window.__actions.updateJob(job.id, { extras: [] }, 'probe')
    const res = window.__actions.addExtra(job.id, { kind: 'equipment', role: 'Manlift', qty: 1, from: job.startDate, to: job.startDate })
    window.__store.getState().open({ type: 'job', id: job.id })
    return { id: job.id, extra: res.id, start: job.startDate, end: job.endDate, past: window.__probeAdd(job.startDate, -4), future: window.__probeAdd(job.endDate, 6) }
  })
  await p.waitForSelector('[data-testid=jx-edit]')
  await p.locator('[data-testid=jx-edit]').first().click()
  await p.waitForSelector('[data-testid=jx-to]')
  await setDate(p, '[data-testid=jx-to]', info.future)
  const endBlocked = await p.locator('[data-testid=jx-error]').isVisible().catch(() => false) && await p.locator('[data-testid=jx-save]').isDisabled()
  ok(endBlocked, `end ${info.future} after job end ${info.end} is blocked before save`)
  await setDate(p, '[data-testid=jx-to]', info.start)
  await setDate(p, '[data-testid=jx-from]', info.past)
  const startBlocked = await p.locator('[data-testid=jx-error]').isVisible().catch(() => false) && await p.locator('[data-testid=jx-save]').isDisabled()
  if (!startBlocked) await p.locator('[data-testid=jx-save]').click()
  await p.waitForTimeout(200)
  const stored = await p.evaluate(info => window.__store.getState().db.jobs.find(j => j.id === info.id).extras.find(e => e.id === info.extra), info)
  const toast = await p.locator('[data-sonner-toast]').last().innerText().catch(() => '')
  ok(startBlocked || (stored.from === info.past && !/Saved/i.test(toast)), `start ${info.past} before job start ${info.start} is not saved as a success (stored from ${stored.from}, toast ${JSON.stringify(toast)})`)
  await ctx.close()
})

await attempt('3. Crane swap does not clear redo, so Ctrl+Y puts the person on two jobs.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1280, height: 800 } })
  const ids = await p.evaluate(() => {
    const t = window.__probeToday(), d1 = window.__probeAdd(t, 20)
    const db = window.__store.getState().db
    const cranes = db.equipment.filter(e => e.category === 'Crane' && e.status !== 'Maintenance' && e.status !== 'Out of Service' && !(e.annualInspection && e.annualInspection < t))
    const jobA = db.jobs.find(j => j.stage !== 'Quote')
    const jobB = db.jobs.find(j => j.id !== jobA.id && j.stage !== 'Quote')
    const emp = db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Rigger' && !e.homeCraneId)
    window.__actions.updateJob(jobA.id, { startDate: d1, endDate: d1, craneId: cranes[0].id, stage: 'Scheduled', status: 'Confirmed' }, 'probe')
    window.__actions.updateJob(jobB.id, { startDate: d1, endDate: d1, craneId: cranes[1].id, stage: 'Scheduled', status: 'Confirmed' }, 'probe')
    const cur = window.__store.getState().db
    window.__store.setState({ db: { ...cur, assignments: cur.assignments.filter(a => !(a.employeeId === emp.id && a.date === d1)) } })
    window.__actions.assign(jobA.id, d1, emp.id, 'Rigger')
    return { jobA: jobA.id, jobB: jobB.id, emp: emp.id, d1, crane: cranes[1].id }
  })
  await blur(p)
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(150)
  await p.evaluate(ids => window.__actions.setCrane(ids.jobB, ids.crane, [{ empId: ids.emp, position: 'Rigger', decision: 'move' }], ids.d1), ids)
  await blur(p)
  await p.keyboard.press('Control+y')
  await p.waitForTimeout(200)
  const jobs = await p.evaluate(ids => window.__store.getState().db.assignments.filter(a => a.employeeId === ids.emp && a.date === ids.d1).map(a => a.jobId), ids)
  ok(jobs.length <= 1, `redo after a crane swap keeps the person on one job (on ${jobs.join('+') || 'none'})`)
  await ctx.close()
})

await attempt('4' + '. ' + "Two tabs: a save made from a stale copy wipes the other tab's crew edit.", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const a = await ctx.newPage()
  const b = await ctx.newPage()
  for (const p of [a, b]) {
    await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
    await p.goto(base, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('[data-role=owner]')
    await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
    await p.waitForSelector('[data-testid=undo-bar]')
  }
  await a.waitForTimeout(300)
  const ids = await a.evaluate(() => {
    const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const [y, m, d] = t.split('-').map(Number)
    const dt = new Date(y, m - 1, d + 33)
    const d1 = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const db = window.__store.getState().db
    const job = db.jobs.find(j => j.stage !== 'Quote')
    const [e1, e2] = db.employees.filter(e => e.status === 'Active' && !e.ssHold && e.craft === 'Rigger').slice(0, 2)
    window.__actions.updateJob(job.id, { startDate: d1, endDate: d1, stage: 'Scheduled', status: 'Confirmed', positions: ['Rigger', 'Rigger'], requiredCerts: [] }, 'probe')
    return { job: job.id, d1, e1: e1.id, e2: e2.id }
  })
  await b.waitForTimeout(400)
  const stale = await b.evaluate(() => window.__store.getState().db)
  await a.evaluate(ids => window.__actions.assign(ids.job, ids.d1, ids.e1, 'Rigger'), ids)
  await b.evaluate(({ stale, ids }) => {
    window.__store.setState({ db: stale })
    window.__actions.assign(ids.job, ids.d1, ids.e2, 'Rigger')
  }, { stale, ids })
  await a.waitForTimeout(500)
  const onA = await a.evaluate(ids => window.__store.getState().db.assignments.filter(x => x.jobId === ids.job && x.date === ids.d1 && (x.employeeId === ids.e1 || x.employeeId === ids.e2)).map(x => x.employeeId).sort(), ids)
  ok(onA.includes(ids.e1) && onA.includes(ids.e2), `both tabs' crew edits survive (tab A has ${onA.join(',') || 'nobody'})`)
  await ctx.close()
})

await attempt('5. Ctrl+Z while the crane-swap confirm is open undoes a previous roster edit.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1440, height: 900 } })
  const ids = await p.evaluate(() => {
    const t = window.__probeToday()
    const db = window.__store.getState().db
    const job = db.jobs.find(j => j.stage !== 'Quote' && j.craneId && j.startDate <= t && j.endDate >= t)
    const emp = db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Oiler')
    const cur = window.__store.getState().db
    window.__store.setState({ db: { ...cur, assignments: cur.assignments.filter(a => !(a.employeeId === emp.id && a.date === t)) } })
    window.__actions.assign(job.id, t, emp.id, 'Oiler')
    return { jobNo: job.jobNo, emp: emp.id, job: job.id, d1: t }
  })
  await p.evaluate(() => window.__store.getState().go('dispatch'))
  await p.locator(`[data-testid=job-card][data-job="${ids.jobNo}"] [data-testid=card-crane]`).click()
  await p.locator('[data-testid=swap-crane]:not([disabled])').nth(1).click()
  await p.waitForSelector('[data-testid=swap-confirm]')
  await blur(p)
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(200)
  const still = await p.evaluate(ids => window.__store.getState().db.assignments.some(a => a.employeeId === ids.emp && a.jobId === ids.job && a.date === ids.d1), ids)
  const dialog = await p.locator('[data-testid=swap-confirm]').count()
  ok(still && dialog === 1, `Ctrl+Z during swap confirm leaves the oiler on the job (still=${still}, dialog=${dialog})`)
  await ctx.close()
})

await attempt('6. A double-click on Undo reverts two crew edits. Other buttons ignore a second tap within 400ms.', async () => {
  const { ctx, p } = await boot({ ...devices['Pixel 5'] })
  const ids = await p.evaluate(() => {
    const t = window.__probeToday(), d1 = window.__probeAdd(t, 50)
    const db = window.__store.getState().db
    const job = db.jobs.find(j => j.stage !== 'Quote')
    const [e1, e2] = db.employees.filter(e => e.status === 'Active' && !e.ssHold && e.craft === 'Rigger').slice(2, 4)
    window.__actions.updateJob(job.id, { startDate: d1, endDate: d1, stage: 'Scheduled', status: 'Confirmed' }, 'probe')
    window.__actions.assign(job.id, d1, e1.id, 'Rigger')
    window.__actions.assign(job.id, d1, e2.id, 'Rigger')
    return { job: job.id, d1, e1: e1.id, e2: e2.id }
  })
  await p.locator('[data-testid=undo-btn]').dblclick()
  await p.waitForTimeout(250)
  const left = await p.evaluate(ids => ({
    e1: window.__store.getState().db.assignments.some(a => a.employeeId === ids.e1 && a.jobId === ids.job && a.date === ids.d1),
    e2: window.__store.getState().db.assignments.some(a => a.employeeId === ids.e2 && a.jobId === ids.job && a.date === ids.d1),
  }), ids)
  ok(left.e1 && !left.e2, `one double-click undoes only the latest edit (first still=${left.e1}, second still=${left.e2})`)
  await ctx.close()
})

await attempt('7. A schedule color changed and reloaded before the company save lands comes back as the old color.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1280, height: 800 } })
  await p.evaluate(() => {
    const colors = window.__colors.useSchedColors.getState().colors
    window.__actions.updateCompany({ schedColors: { ...colors } })
  })
  await p.waitForTimeout(500)
  await p.evaluate(() => window.__store.getState().go('branding'))
  await p.waitForSelector('[data-testid=sched-hex][data-cat=open]')
  const hex = p.locator('[data-testid=sched-hex][data-cat=open]')
  await hex.fill('#112266')
  await hex.press('Enter')
  await p.reload()
  await p.waitForFunction(() => window.__store?.getState?.().ready && window.__colors)
  await p.waitForTimeout(400)
  const open = await p.evaluate(() => window.__colors.useSchedColors.getState().colors.open)
  ok(open === '#112266', `reload keeps the Available color just chosen (open=${open})`)
  await ctx.close()
})

await attempt('8' + '. ' + "Moving a job's dates leaves support equipment on the old dates when crew is not shifted.", async () => {
  const { ctx, p } = await boot({ viewport: { width: 1280, height: 800 } })
  const info = await p.evaluate(() => {
    const t = window.__probeToday(), start = window.__probeAdd(t, 15), end = window.__probeAdd(t, 18)
    const job = window.__store.getState().db.jobs.find(j => j.stage !== 'Quote')
    window.__actions.updateJob(job.id, { startDate: start, endDate: end, stage: 'Scheduled', status: 'Confirmed', extras: [], outside: [], unitDays: { 'probe-unit': { from: start, to: end } } }, 'probe')
    window.__actions.addExtra(job.id, { kind: 'equipment', role: 'Light tower', qty: 1, from: start, to: end })
    window.__store.getState().open({ type: 'job', id: job.id })
    return { id: job.id, next: window.__probeAdd(start, 7) }
  })
  await p.waitForSelector('[data-testid=job-reschedule]')
  await p.locator('[data-testid=job-reschedule]').click()
  await p.waitForSelector('[data-testid=rs-crew]')
  await p.locator('[data-testid=rs-crew]').uncheck()
  if (await p.locator('[data-testid=rs-units]').count()) await p.locator('[data-testid=rs-units]').check()
  await p.locator('[data-testid=rs-start]').fill(info.next)
  await p.locator('[data-testid=rs-save]').click()
  await p.waitForTimeout(300)
  const got = await p.evaluate(id => {
    const j = window.__store.getState().db.jobs.find(x => x.id === id)
    const ex = j.extras.find(e => e.role === 'Light tower')
    return { start: j.startDate, from: ex.from, to: ex.to }
  }, info.id)
  ok(got.from === got.start, `light tower moves with the job (job ${got.start}, tower ${got.from}→${got.to})`)
  await ctx.close()
})

await attempt('9. Reschedule still saves when the shifted crew is already on another job that day.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1280, height: 800 } })
  const info = await p.evaluate(() => {
    const t = window.__probeToday()
    const d1 = window.__probeAdd(t, 25), d2 = window.__probeAdd(t, 26), d3 = window.__probeAdd(t, 32)
    const db = window.__store.getState().db
    const jobA = db.jobs.find(j => j.stage !== 'Quote')
    const jobB = db.jobs.find(j => j.id !== jobA.id && j.stage !== 'Quote')
    const emp = db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Supervisor')
    window.__actions.updateJob(jobA.id, { startDate: d1, endDate: d2, stage: 'Scheduled', status: 'Confirmed' }, 'probe')
    window.__actions.updateJob(jobB.id, { startDate: d3, endDate: window.__probeAdd(d3, 1), stage: 'Scheduled', status: 'Confirmed' }, 'probe')
    const cur = window.__store.getState().db
    window.__store.setState({ db: { ...cur, assignments: cur.assignments.filter(a => a.employeeId !== emp.id) } })
    window.__actions.assign(jobA.id, d1, emp.id, 'Supervisor')
    window.__actions.assign(jobB.id, d3, emp.id, 'Supervisor')
    window.__store.getState().open({ type: 'job', id: jobA.id })
    return { id: jobA.id, other: jobB.id, emp: emp.id, d3, name: `${emp.first} ${emp.last}` }
  })
  await p.waitForSelector('[data-testid=job-reschedule]')
  await p.locator('[data-testid=job-reschedule]').click()
  await p.locator('[data-testid=rs-start]').fill(info.d3)
  await p.waitForTimeout(100)
  await p.locator('[data-testid=rs-save]').click()
  await p.waitForTimeout(300)
  const on = await p.evaluate(info => window.__store.getState().db.assignments.filter(a => a.employeeId === info.emp && a.date === info.d3).map(a => a.jobId), info)
  ok(on.length === 1, `reschedule does not double-book ${info.name} (on ${on.join('+') || 'none'})`)
  await ctx.close()
})

await attempt('10. Forecast paints days before the crane starts moving in with the Working color.', async () => {
  const { ctx, p } = await boot({ ...devices['iPad Mini'] })
  const info = await p.evaluate(() => {
    const t = window.__probeToday()
    const start = window.__probeAdd(t, 1), end = window.__probeAdd(t, 10), hook = window.__probeAdd(start, 6)
    const db = window.__store.getState().db
    const crane = db.equipment.find(e => e.category === 'Crane' && e.status !== 'Maintenance' && e.status !== 'Out of Service')
    const job = db.jobs.find(j => j.stage !== 'Quote')
    for (const o of db.jobs) {
      if (o.id === job.id) continue
      if (o.craneId === crane.id || (o.craneIds || []).includes(crane.id))
        window.__actions.updateJob(o.id, { craneId: o.craneId === crane.id ? db.equipment.find(e => e.category === 'Crane' && e.id !== crane.id).id : o.craneId, craneIds: (o.craneIds || []).filter(c => c !== crane.id) }, 'clear')
    }
    window.__actions.updateJob(job.id, {
      startDate: start, endDate: end, craneId: crane.id, stage: 'Scheduled', status: 'Confirmed',
      rig: [{ craneId: crane.id, hookReady: hook, travelDays: 0, upMode: 'days', upDays: 1, downStart: window.__probeAdd(end, 1), downAmount: 1, downUnit: 'd' }],
    }, 'probe')
    const moveIn = window.__probeAdd(hook, -1) // one rig-up day, no travel
    return { jobNo: job.jobNo, today: t, start, moveIn }
  })
  await p.evaluate(() => window.__store.getState().go('forecast'))
  await p.waitForSelector(`[data-testid=fc-bar][data-job="${info.jobNo}"]`)
  const bar = await p.evaluate(info => {
    const el = document.querySelector(`[data-testid=fc-bar][data-job="${info.jobNo}"]`)
    const idx = d => { const [y, m, day] = d.split('-').map(Number); const [y0, m0, d0] = info.today.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, day) - Date.UTC(y0, m0 - 1, d0)) / 86400000) }
    return { left: parseFloat(el.style.left), cat: el.getAttribute('data-cat'), movePct: idx(info.moveIn) * (100 / 30), startPct: idx(info.start) * (100 / 30) }
  }, info)
  ok(bar.left + 0.2 >= bar.movePct, `forecast bar starts at move-in (${bar.movePct.toFixed(1)}%) not on earlier working-colored days (left ${bar.left}, cat ${bar.cat}, job start ${bar.startPct.toFixed(1)}%)`)
  await ctx.close()
})

await attempt('11. Undo puts a person back on a day they are now on PTO.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1280, height: 800 } })
  const ids = await p.evaluate(() => {
    const t = window.__probeToday(), d1 = window.__probeAdd(t, 21)
    const db = window.__store.getState().db
    const job = db.jobs.find(j => j.stage !== 'Quote')
    const emp = db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Millwright') || db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Rigger')
    window.__actions.updateJob(job.id, { startDate: d1, endDate: d1, stage: 'Scheduled', status: 'Confirmed' }, 'probe')
    const cur = window.__store.getState().db
    window.__store.setState({ db: { ...cur, assignments: cur.assignments.filter(a => !(a.employeeId === emp.id && a.date === d1)) } })
    window.__actions.assign(job.id, d1, emp.id, 'Rigger')
    window.__actions.unassign(job.id, d1, emp.id, false)
    window.__actions.addAbsence(emp.id, d1, d1, 'Vacation / PTO', 'probe')
    return { emp: emp.id, job: job.id, d1 }
  })
  await blur(p)
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(200)
  const back = await p.evaluate(ids => window.__store.getState().db.assignments.some(a => a.employeeId === ids.emp && a.jobId === ids.job && a.date === ids.d1), ids)
  ok(!back, 'undo does not put a person back on a PTO day')
  await ctx.close()
})

await attempt('12. Removing a crew role writes a credit while that person is still on the board.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1440, height: 900 } })
  const info = await p.evaluate(() => {
    const t = window.__probeToday()
    const db = window.__store.getState().db
    const job = db.jobs.find(j => j.stage !== 'Quote')
    const emp = db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Oiler')
    window.__actions.updateJob(job.id, { startDate: t, endDate: window.__probeAdd(t, 2), stage: 'Scheduled', status: 'Confirmed', positions: ['Oiler'], requiredCerts: [], extras: [] }, 'probe')
    const cur = window.__store.getState().db
    window.__store.setState({ db: { ...cur, assignments: cur.assignments.filter(a => !(a.jobId === job.id && a.date === t)) } })
    window.__actions.assign(job.id, t, emp.id, 'Oiler')
    return { jobNo: job.jobNo, id: job.id, emp: emp.id, d1: t }
  })
  await p.evaluate(() => window.__store.getState().go('dispatch'))
  const card = p.locator(`[data-testid=job-card][data-job="${info.jobNo}"]`)
  await card.locator('[data-testid=board-extra-add]').click()
  await p.locator('[data-testid=board-extra-sheet]').getByRole('tab', { name: 'Remove' }).click()
  await p.locator('[data-testid=board-extra-pick][data-role=Oiler]').click()
  await p.waitForTimeout(250)
  const got = await p.evaluate(info => {
    const j = window.__store.getState().db.jobs.find(x => x.id === info.id)
    const still = window.__store.getState().db.assignments.some(a => a.employeeId === info.emp && a.jobId === info.id && a.date === info.d1 && a.position === 'Oiler')
    const credit = (j.extras || []).some(e => e.action === 'remove' && e.role === 'Oiler')
    return { still, credit }
  }, info)
  ok(!(got.still && got.credit), `removing the oiler role does not leave them dispatched and credited (still=${got.still}, credit=${got.credit})`)
  await ctx.close()
})

await attempt('13. A pale red can be saved as Available, so open forecast time can read as red.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1280, height: 800 } })
  const problem = await p.evaluate(() => window.__colors.colorProblem('open', '#ffcdd2', window.__colors.useSchedColors.getState().colors))
  ok(!!problem, `Available rejects pale red #ffcdd2 (${problem || 'accepted'})`)
  await ctx.close()
})

await attempt('14. Keyboard: the "+N cranes" control is a button, so Space opens it as well as Enter.', async () => {
  const { ctx, p } = await boot({ viewport: { width: 1280, height: 900 } })
  const jobNo = await p.evaluate(() => {
    const t = window.__probeToday()
    const db = window.__store.getState().db
    const job = db.jobs.find(j => j.stage !== 'Quote' && j.craneId)
    const other = db.equipment.find(e => e.category === 'Crane' && e.id !== job.craneId)
    window.__actions.updateJob(job.id, { startDate: t, endDate: window.__probeAdd(t, 2), stage: 'Scheduled', status: 'Confirmed', craneIds: [other.id] }, 'probe')
    return job.jobNo
  })
  await p.evaluate(() => window.__store.getState().go('dispatch'))
  const toggle = p.locator(`[data-testid=job-card][data-job="${jobNo}"] [data-testid=more-cranes-toggle]`)
  await toggle.focus()
  await p.keyboard.press('Space')
  await p.waitForTimeout(150)
  const open = await p.locator(`[data-testid=job-card][data-job="${jobNo}"] [data-testid=more-cranes-list]`).count()
  ok(open === 1, 'Space opens the extra-cranes list from the keyboard')
  await ctx.close()
})

await attempt('15. Two tabs recording payments both keep their payment.', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const a = await ctx.newPage()
  const b = await ctx.newPage()
  for (const p of [a, b]) {
    await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
    await p.goto(base, { waitUntil: 'domcontentloaded' })
    await p.waitForSelector('[data-role=owner]')
    await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
    await p.waitForSelector('[data-testid=undo-bar]')
  }
  await a.waitForTimeout(300)
  const inv = await a.evaluate(() => {
    const i = window.__store.getState().db.invoices.find(x => x.kind !== 'Credit' && x.amount - x.paid > 50)
    return i ? { id: i.id, invNo: i.invNo } : null
  })
  if (!inv) { ok(false, 'seed has an open invoice to pay'); await ctx.close(); return }
  const stale = await b.evaluate(() => window.__store.getState().db)
  await a.evaluate(inv => window.__actions.recordPayment(inv.id, 10, 'Check', 'TAB-A', '2026-11-10'), inv)
  await b.evaluate(({ stale, inv }) => {
    window.__store.setState({ db: stale })
    window.__actions.recordPayment(inv.id, 15, 'Check', 'TAB-B', '2026-11-10')
  }, { stale, inv })
  await a.waitForTimeout(500)
  const refs = await a.evaluate(inv => (window.__store.getState().db.invoices.find(x => x.id === inv.id)?.payments ?? []).map(p => p.ref), inv)
  ok(refs.includes('TAB-A') && refs.includes('TAB-B'), `both payments stay on ${inv.invNo} (${refs.join(',') || 'none'})`)
  await ctx.close()
})

await browser.close()
console.log(fails.length ? `\nFAILED ${fails.length}\n` + fails.map(f => '- ' + f).join('\n') : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
