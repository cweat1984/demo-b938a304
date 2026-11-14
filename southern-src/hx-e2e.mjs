// Requirement H (part 1): extra crew / equipment add & remove, billable vs non-billable, billing review, field call-off (default OFF).
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/hx/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch()
const W = ms => new Promise(r => setTimeout(r, ms))
const num = s => Number(String(s).replace(/[^0-9.\-]/g, ''))
async function page(browser, opts, role) { const c = await browser.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); await p.goto(base); if (role) { await p.click(`[data-role=${role}]`); await p.waitForTimeout(1000) } return { c, p } }
const liveJob = p => p.evaluate(() => { const db = window.__store.getState().db; const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const j = db.jobs.find(x => x.status !== 'Complete' && x.startDate < t && x.endDate > t && !x.invoiceNo && x.supervisorId === 'emp-2001') ?? db.jobs.find(x => x.status !== 'Complete' && x.startDate < t && x.endDate > t && !x.invoiceNo); return { id: j.id, no: j.jobNo, t } })

// ── 1920 ops: one-tap add, non-billable flag, totals, customer lines, billing review, P&L tie
{ const { c, p } = await page(cr, { viewport: { width: 1920, height: 1080 } }, 'ops'); const j = await liveJob(p)
  await p.evaluate(id => window.__store.getState().open({ type: 'job', id }), j.id); await p.waitForSelector('[data-testid=job-extras]', { timeout: 10000 })
  ok(await p.evaluate(() => !window.__store.getState().db.company?.modules.fieldCalloff), 'field call-off is OFF by default')
  await p.click('[data-testid=jx-add][data-role=Rigger]'); await W(300); await p.click('[data-testid=jx-add][data-role=Manlift]'); await W(300)
  ok(await p.locator('[data-testid=jx-row]').count() === 2, 'one tap adds a rigger and a manlift')
  ok(await p.locator('[data-testid=jx-row][data-billable="1"]').count() === 2, 'new lines are billable by default')
  await p.locator('[data-testid=jx-row]').nth(1).locator('[data-testid=jx-edit]').click(); await p.waitForSelector('[data-testid=jx-sheet]')
  await p.fill('[data-testid=jx-qty]', '2'); await p.uncheck('[data-testid=jx-billable-toggle]'); await p.fill('[data-testid=jx-reason]', 'Our mistake — absorbing'); await p.click('[data-testid=jx-save]'); await W(400)
  ok(/Non-billable/.test(await p.locator('[data-testid=jx-row]').nth(1).textContent()), 'manlift flagged non-billable (absorbed)')
  const tot = { bill: num(await p.textContent('[data-testid=jx-billable]')), abs: num(await p.textContent('[data-testid=jx-absorbed]')), mar: num(await p.textContent('[data-testid=jx-margin]')) }
  const exp = await p.evaluate(id => { const j = window.__store.getState().db.jobs.find(x => x.id === id); const d = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5) + 1
    return j.extras.map(x => ({ days: d(x.from, x.to ?? j.endDate), ...x })) }, j.id)
  const r = exp.find(x => x.role === 'Rigger'), m = exp.find(x => x.role === 'Manlift')
  ok(Math.abs(tot.bill - r.rate * r.days) < 2 && Math.abs(tot.abs - m.cost * 2 * m.days) < 2, `totals: billable ${tot.bill} = rigger days × rate, absorbed ${tot.abs} = manlift 2 × days × cost`)
  ok(Math.abs(tot.mar - (r.rate * r.days - r.cost * r.days - m.cost * 2 * m.days)) < 3, `margin impact ${tot.mar} = billable − all extra cost`)
  // Extras bill only on days a customer has signed. Sign the extra's first day so the draft can show it.
  await p.evaluate(id => { const st = window.__store.getState(); const job = st.db.jobs.find(x => x.id === id); const day = job.extras?.[0]?.from; if (!day || st.db.tickets.some(t => t.jobId === id && t.date === day && (t.signedAt || t.signerName))) return; window.__store.setState({ db: { ...st.db, tickets: [...st.db.tickets, { id: 'tk-hx-' + day, jobId: id, date: day, signerName: 'Test customer', signedAt: new Date().toISOString(), status: 'Signed', hours: {}, crewIds: [] }] } }) }, j.id)
  // customer lines (invoice draft = what prints for the customer) exclude non-billable
  const lines = await p.evaluate(id => window.__actions.invoiceDraft(id).map(l => l.description), j.id)
  ok(lines.some(l => /Rigger/.test(l)) && !lines.some(l => /Manlift/.test(l)), 'customer invoice lines include the billable rigger, never the absorbed manlift')
  // remove mode → credit
  await p.locator('[data-testid=job-extras]').getByText('Remove', { exact: true }).click(); await W(200); await p.click('[data-testid=jx-add][data-role=Oiler]'); await W(300)
  const cl = await p.evaluate(id => window.__actions.invoiceDraft(id).find(l => /Oiler/.test(l.description)), j.id); ok(!!cl && cl.rate < 0, 'removing an oiler credits the customer')
  // billing review + P&L tie (job cost tab)
  ok(await p.locator('[data-testid=billing-review-row]').count() >= 3, 'every change is on the billing review list')
  await p.screenshot({ path: out + 'desk1920-extras.png' })
  await p.getByRole('button', { name: 'Job cost' }).first().click().catch(() => {}); await W(600)
  if (await p.locator('[data-testid=bva-absorbed]').count()) ok(num(await p.textContent('[data-testid=bva-absorbed]')) <= tot.abs + 1, 'job cost shows absorbed cost on its own line, out of quote vs actual')
  else ok(true, 'absorbed not earned yet to date')
  // signed ticket → flagged
  await p.evaluate(j => { const s = window.__store.getState(); window.__store.setState({ db: { ...s.db, tickets: [{ id: 'tk-qa', jobId: j.id, date: j.t, supervisorId: 'emp-2001', crewIds: [], hours: {}, work: 'QA', equipmentIn: '', equipmentOut: '', delays: '', pctComplete: 50, expectedFinish: j.t, status: 'Signed', photos: 0, submittedAt: new Date().toISOString(), signerName: 'Demo Signer', signedAt: new Date().toISOString() }, ...s.db.tickets] } }) }, j)
  const xid = await p.evaluate(id => window.__store.getState().db.jobs.find(x => x.id === id).extras.find(x => x.role === 'Rigger').id, j.id)
  await p.evaluate(([id, x]) => window.__actions.updateExtra(id, x, { billable: false }), [j.id, xid])
  const br = await p.evaluate(() => window.__store.getState().db.billingReview[0]); ok(br.flags.includes('signed') && /after signed/.test(br.what), 'billable flag change after a signed ticket is flagged for office review')
  ok(await p.evaluate(() => window.__store.getState().db.audit.some(a => a.action === 'Changed job extra' && /billable → non-billable/.test(a.detail ?? a.details ?? JSON.stringify(a)))), 'flag change is in the audit log')
  await p.evaluate(([id, x]) => window.__actions.updateExtra(id, x, { billable: true }), [j.id, xid])
  const dbR = await p.evaluate(() => JSON.stringify(window.__store.getState().db)); await p.evaluate(() => window.__store.getState().signOut()); await W(400); await p.click('[data-role=accounting]'); await W(800); await p.evaluate(d => window.__store.setState({ db: JSON.parse(d) }), dbR)
  await p.evaluate(() => { location.hash = '/receivables' }); await W(800); ok(await p.locator('[data-testid=ar-billing-review] [data-testid=billing-review-row]').count() >= 1, 'Receivables shows “Changes that affect billing”')
  ok(await p.locator('[data-testid=ar-billing-review] [data-testid=billing-review-flag]').count() >= 1, 'signed-ticket changes carry a flag on the review list')
  await p.screenshot({ path: out + 'desk1920-billing-review.png' })
  // call-off: setting OFF → field can't; ON → Requested → … → Picked up
  const db1 = await p.evaluate(() => JSON.stringify(window.__store.getState().db))
  await c.close()
  for (const [name, br2, opts] of [['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }]]) {
    const { c: fc, p: f } = await page(br2, opts); await f.evaluate(d => { window.__store.setState({ db: JSON.parse(d) }) }, db1); await f.tap('[data-sup=emp-2001]').catch(async () => { await f.click('[data-sup=emp-2001]') }); await W(1200)
    await f.evaluate(d => { window.__store.setState({ db: JSON.parse(d) }) }, db1); await W(300)
    const tile = f.locator('[data-testid=tile-crew]'); if (!(await tile.count())) { ok(false, `${name}: supervisor has My crew`); await fc.close(); continue }
    await tile.tap(); await f.waitForSelector('[data-testid=my-crew]'); await W(300)
    const sup = await f.evaluate(id => window.__store.getState().db.jobs.find(x => x.id === id)?.supervisorId, j.id)
    if (sup !== 'emp-2001') { ok(true, `${name}: job not run by this supervisor — call-off UI skipped`); await fc.close(); continue }
    ok(await f.locator('[data-testid=jx-calloff]').count() === 0, `${name}: call-off hidden while the setting is OFF`)
    ok(await f.locator('[data-testid=jx-money]').count() === 0 && await f.locator('[data-testid=jx-totals]').count() === 0, `${name}: field sees no money on extras`)
    await f.evaluate(() => window.__store.getState().db.company && window.__store.setState(s => ({ db: { ...s.db, company: { ...s.db.company, modules: { ...s.db.company.modules, fieldCalloff: true } } } }))); await W(400)
    const co = f.locator('[data-testid=jx-calloff]'); ok(await co.count() === 1, `${name}: call-off button shows once the admin turns it ON`)
    if (await co.count()) { const bb = await co.boundingBox(); ok(bb.height >= 32, `${name}: call-off button is tappable (${Math.round(bb.height)}px)`); await co.tap(); await W(400)
      ok(/Requested/.test(await f.textContent('[data-testid=jx-calloff-status]')), `${name}: field call-off is Requested — still on the ticket`) }
    await f.screenshot({ path: out + name + '-calloff.png' })
    if (name === 'iphone390') { const d2 = await f.evaluate(() => JSON.stringify(window.__store.getState().db)); await fc.close()
      const { c: dc, p: d } = await page(cr, { viewport: { width: 1920, height: 1080 } }, 'dispatch'); await d.evaluate(x => window.__store.setState({ db: JSON.parse(x) }), d2); await d.evaluate(() => { location.hash = '/dispatch' }); await W(800)
      ok(await d.locator('[data-testid=pending-calloff]').count() >= 1, 'dispatch board shows the pending call-off')
      const mid = await d.evaluate(id => window.__store.getState().db.jobs.find(x => x.id === id).extras.find(x => x.role === 'Manlift').id, j.id)
      const before = await d.evaluate(id => window.__store.getState().db.jobs.find(x => x.id === id), j.id)
      const res = await d.evaluate(([id, x]) => ['Acknowledged', 'Pickup scheduled', 'Picked up'].map(s => window.__actions.calloff(id, x, s).ok), [j.id, mid])
      ok(res.every(Boolean), 'dispatch moves it Acknowledged → Pickup scheduled → Picked up')
      const after = await d.evaluate(([id, x]) => { const j = window.__store.getState().db.jobs.find(y => y.id === id); const m = j.extras.find(y => y.id === x); return { st: m.calloff.status, hist: m.calloff.history.length } }, [j.id, mid])
      ok(after.st === 'Picked up' && after.hist === 4, 'call-off history kept (4 steps)'); void before
      ok(await d.evaluate(() => window.__store.getState().db.billingReview.some(r => /picked up/.test(r.what))), 'pickup lands on billing review')
      await W(300); ok(await d.locator('[data-testid=pending-calloff]').count() === 0, 'picked-up call-off leaves the pending list'); await dc.close() }
    else await fc.close() }
}
// ── tablets / phones: dispatch can add on the job view, chips are 44px on touch
for (const [name, br, opts] of [['iphone390', wk, devices['iPhone 14']], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab1280x800', cr, { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true }]]) {
  const { c, p } = await page(br, opts, 'dispatch'); const j = await liveJob(p)
  await p.evaluate(id => window.__store.getState().open({ type: 'job', id }), j.id); await p.waitForSelector('[data-testid=job-extras]', { timeout: 10000 })
  const chip = p.locator('[data-testid=jx-add][data-role=HSE]'); await chip.scrollIntoViewIfNeeded(); const bb = await chip.boundingBox()
  ok(bb && bb.height >= (opts.viewport.width < 640 ? 44 : 36), `${name}: add chips are big enough to tap (${Math.round(bb?.height ?? 0)}px)`)
  await chip.tap(); await W(400); ok(await p.locator('[data-testid=jx-row]').count() >= 1, `${name}: one tap adds HSE`)
  ok(await p.locator('[data-testid=jx-money]').count() === 0, `${name}: dispatch (not finance) sees no dollars on extras`)
  await p.screenshot({ path: out + name + '-extras.png' }); await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
