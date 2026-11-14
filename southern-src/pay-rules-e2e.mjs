// Pay rules on the People screen, the time card, and a job's double-time hours.
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://127.0.0.1:4196/'
const fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await b.newPage({ viewport: { width: 1280, height: 800 } })
p.setDefaultTimeout(20000)
await p.goto(base)
await p.waitForSelector('[data-role=owner]')
await p.click('[data-role=owner]')
await p.waitForSelector('[data-testid=bell]')

await p.evaluate(() => window.__store.getState().go('people'))
await p.click('[data-testid=pay-rules-open]')
await p.waitForSelector('[data-testid=pay-rules]')
const ruleNames = await p.locator('[data-testid=pay-rule-row] input').evaluateAll(els => els.map(e => e.value))
ok(ruleNames.some(t => /Weekly after 40/.test(t)) && ruleNames.some(t => /Daily after 8/.test(t)), `pay rules table lists weekly and daily (${ruleNames.join(' | ')})`)
await p.locator('[data-testid=pay-rule-row]').nth(1).locator('input').first().fill('Daily after 8')
await p.click('[data-testid=pay-rules-save]')
await p.waitForTimeout(300)
const savedName = await p.evaluate(() => window.__store.getState().db.payRules.find(r => r.kind === 'daily').name)
ok(savedName === 'Daily after 8', `daily rule name saved (${savedName})`)

const setup = await p.evaluate(() => {
  const st = window.__store.getState()
  const emp = st.db.employees.find(e => e.status === 'Active' && e.rate > 0)
  const job = st.db.jobs.find(j => j.stage === 'In Progress' || j.stage === 'Scheduled')
  const week = ['2026-10-28', '2026-10-31', '2026-11-01']
  const origRule = window.__store.getState().db.payRules.find(r => r.id === 'pay-daily')
  const pulled = st.db.time.filter(t => t.employeeId === emp.id && week.includes(t.date))
  window.__restore = { empId: emp.id, payRuleId: emp.payRuleId || 'pay-weekly', jobId: job.id, dtAfter: job.dtAfter, daily: origRule, ids: [], pulled }
  st.db.time = st.db.time.filter(t => !pulled.includes(t))
  window.__actions.updateEmployee(emp.id, { payRuleId: 'pay-daily' })
  const before = new Set(window.__store.getState().db.time.map(t => t.id))
  const put = (date, start, end) => window.__actions.submitTime({ employeeId: emp.id, jobId: job.id, date, activity: 'Lifting & Hoisting', start, end, mealMin: 0, perDiems: [] })
  const a = put('2026-10-28', '06:00', '16:00')
  const b = put('2026-10-31', '06:00', '12:00')
  const c = put('2026-11-01', '06:00', '10:00')
  window.__restore.ids.push(...window.__store.getState().db.time.filter(t => t.employeeId === emp.id && !before.has(t.id)).map(t => t.id))
  return { name: emp.first + ' ' + emp.last, ok: !!(a.ok && b.ok && c.ok), why: [a, b, c].map(x => x.reason || 'ok').join(' · ') }
})
ok(setup.ok, `daily hours saved (${setup.why})`)
await p.evaluate(() => window.__store.getState().go('time'))
await p.waitForSelector('[aria-label="Previous week"]')
for (let i = 0; i < 8; i++) {
  const label = await p.locator('span.w-36').first().innerText()
  if (/Oct 26/.test(label)) break
  await p.click('[aria-label="Previous week"]')
  await p.waitForTimeout(150)
}
const card = p.locator('[data-testid=time-emp]', { hasText: setup.name.split(' ')[0] }).first()
await card.waitFor()
const ot = await card.locator('[data-testid=time-ot]').innerText()
const rule = await card.locator('[data-testid=time-rule]').innerText()
ok(/12\.0h OT/.test(ot), `time card shows 12.0h OT for the daily week (${ot})`)
ok(/Saturday/.test(rule), `time card names the daily rule (${rule})`)

const dt = await p.evaluate(() => {
  const st = window.__store.getState()
  const emp = st.db.employees.filter(e => (e.payRuleId || 'pay-weekly') === 'pay-weekly' && e.status === 'Active' && e.id !== window.__restore.empId)
    .map(e => ({ e, h: st.db.time.filter(t => t.employeeId === e.id && t.date >= '2026-10-26' && t.date <= '2026-11-01').reduce((s, t) => s + t.hours, 0) }))
    .sort((a, b) => a.h - b.h)[0]?.e
  const job = st.db.jobs.find(j => j.id === window.__restore.jobId)
  window.__actions.updateJob(job.id, { dtAfter: 12 })
  const before = new Set(window.__store.getState().db.time.map(t => t.id))
  const r = window.__actions.submitTime({ employeeId: emp.id, jobId: job.id, date: '2026-10-27', activity: 'Lifting & Hoisting', start: '05:00', end: '19:00', mealMin: 0, perDiems: [] })
  const row = window.__store.getState().db.time.find(t => t.employeeId === emp.id && t.date === '2026-10-27' && !before.has(t.id))
  if (row) window.__restore.ids.push(row.id)
  return { ok: r.ok, reason: r.reason, jobId: job.id, id: row?.id, hours: row?.hours }
})
ok(dt.ok && dt.hours === 14, `14 h day on a double-time job saved (${dt.reason || dt.hours})`)
const slice = await p.evaluate(async (id) => {
  const logic = await import('/src/data/logic.ts')
  const s = logic.overtimeByEntry(window.__store.getState().db).get(id)
  return s ? { reg: s.reg, ot: s.ot, dt: s.dt } : null
}, dt.id)
ok(slice && slice.reg === 12 && slice.dt === 2 && slice.ot === 0, `weekly worker, double time after 12 → 12 straight + 2 double (${JSON.stringify(slice)})`)
await p.evaluate(() => {
  const r = window.__restore
  const db = window.__store.getState().db
  db.time = db.time.filter(t => !r.ids.includes(t.id)).concat(r.pulled || [])
  window.__actions.updateEmployee(r.empId, { payRuleId: r.payRuleId })
  window.__actions.savePayRule(r.daily)
  window.__actions.updateJob(r.jobId, { dtAfter: r.dtAfter })
})

const billed = await p.evaluate(async () => {
  const logic = await import('/src/data/logic.ts')
  const db = structuredClone(window.__store.getState().db)
  const emp = db.employees.find(e => e.rate > 0)
  emp.payRuleId = 'pay-daily'
  const job = db.jobs.find(j => j.siteId)
  job.billOt = true
  job.dtAfter = undefined
  const site = db.sites.find(s => s.id === job.siteId)
  if (site) site.dtAfter = undefined
  db.time = [{ id: 'bill-1', employeeId: emp.id, jobId: job.id, date: '2026-10-28', start: '06:00', end: '16:00', hours: 10, activity: 'Lifting & Hoisting', mealMin: 0, perDiems: [], status: 'Approved', submittedAt: '' }]
  return { lines: logic.billedLaborLines(db, job), rate: emp.rate }
})
ok(billed.lines.length === 1 && billed.lines[0].qty === 2 && Math.abs(billed.lines[0].rate - billed.rate * 1.5) < 0.02 && /Overtime labor/.test(billed.lines[0].description), `invoice bills the 2 overtime hours at 1.5× (${JSON.stringify(billed)})`)

console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED')
await b.close()
process.exit(fails.length ? 1 : 0)
