// Requirement H (part 2): start/end date changes tell the right people (crew, supervisor, PM, dispatch, ops, safety, shop, accounting),
// customer + equipment-owner messages are drafts only, extras move with the dates, change log + billing review.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/hx/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['tab800x1280', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=ops]'); await W(1000)
  const j = await p.evaluate(() => { const db = window.__store.getState().db; const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const j = db.jobs.find(x => x.status !== 'Complete' && x.startDate > t && x.supervisorId && (x.outside ?? []).length) ?? db.jobs.find(x => x.status !== 'Complete' && x.startDate > t && x.supervisorId)
    window.__actions.addExtra(j.id, { kind: 'equipment', role: 'Light tower', qty: 2, from: j.startDate })
    return { id: j.id, no: j.jobNo, sup: j.supervisorId, start: j.startDate, outside: (j.outside ?? []).length } })
  await p.evaluate(id => window.__store.getState().open({ type: 'job', id }), j.id); await p.waitForSelector('[data-testid=job-reschedule]', { timeout: 10000 })
  await p.locator('[data-testid=job-reschedule]').click(); await p.waitForSelector('[data-testid=reschedule-sheet]')
  const who = await p.locator('[data-testid=rs-notify-who]').allTextContents()
  ok(['Crew', 'Supervisor', 'Dispatch', 'Ops', 'Safety', 'Shop', 'Accounting'].every(w => who.some(x => x.includes(w))), `${name}: sheet lists who is told (${who.length})`)
  ok(await p.locator('[data-testid=rs-draft]').count() === 1, `${name}: customer message is a draft`)
  if (j.outside) ok(await p.locator('[data-testid=rs-vendor-draft]').count() >= 1, `${name}: outside crane owner gets a draft, never sent`)
  const ns = await p.evaluate(d => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + 3); return x.toISOString().slice(0, 10) }, j.start)
  await p.fill('[data-testid=rs-start]', ns); await p.fill('[data-testid=rs-reason]', 'Customer pushed it'); await p.screenshot({ path: out + name + '-reschedule-notify.png' })
  await p.locator('[data-testid=rs-save]').click(); await W(500)
  const r = await p.evaluate(([id, sup]) => { const db = window.__store.getState().db; const j = db.jobs.find(x => x.id === id); const n = db.notices.filter(x => new RegExp(`Job #${j.jobNo} rescheduled`).test(x.title))
    return { start: j.startDate, extraFrom: j.extras.find(x => x.role === 'Light tower').from, supTold: n.some(x => x.empIds?.includes(sup)), roles: [...new Set(n.flatMap(x => x.roles))], review: (db.billingReview ?? []).some(b => b.jobId === id && /^Dates/.test(b.what)), log: db.audit.some(a => a.entity === `Job #${j.jobNo}` && a.action === 'Rescheduled job'), sent: db.notices.some(x => /customer/i.test(x.roles?.join(',') ?? '')) } }, [j.id, j.sup])
  ok(r.start === ns && r.extraFrom === ns, `${name}: start moved and the light towers moved with it`)
  ok(r.supTold, `${name}: supervisor is told in the app`)
  ok(['dispatch', 'ops', 'safety', 'shop', 'accounting'].every(x => r.roles.includes(x)), `${name}: dispatch, ops, safety, shop, accounting told (${r.roles.join(',')})`)
  ok(r.review && r.log, `${name}: date change on the billing review list and the change log`)
  ok(!r.sent, `${name}: nothing goes to the customer automatically`)
  await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
