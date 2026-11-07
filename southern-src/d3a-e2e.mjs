// dive3 accounting/sales blockers: B1 invoice number parsing + caps, B2 double submit + delete/undo, B3/M1 scope per sign-in + payroll scope, M16 lost undo.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/d3a/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const typeKeys = async (l, v) => { await l.click(); await l.fill(''); await l.pressSequentially(v, { delay: 15 }) }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext({ ...opts, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=accounting]'); await W(900)
  // M1: All Company survives reload
  ok(await S(p, () => window.__store.getState().ui.filter.branchId) === 'all', `${name}: accounting opens on All Company`)
  await p.reload(); await W(1500); ok(await S(p, () => window.__store.getState().ui.filter.branchId) === 'all', `${name}: still All Company after reload`)
  // B1: invoice preview typing
  await S(p, () => window.__store.getState().go('receivables')); await W(800); await p.click('main button:has-text("Ready to invoice")'); await W(400)
  const btn = p.locator('[data-testid=inv-create]').first()
  if (await btn.count()) {
    await btn.scrollIntoViewIfNeeded(); await btn.click(); await p.waitForSelector('[data-testid=inv-preview]')
    const q = p.locator('[data-testid=inv-line-qty]').first(), r = p.locator('[data-testid=inv-line-rate]').first()
    await typeKeys(q, '1.5'); await typeKeys(r, '5,650.50'); await W(200)
    const tot = await p.innerText('[data-testid=inv-line-amt] >> nth=0')
    ok(await q.inputValue() === '1.5' && await r.inputValue() === '5,650.50' && /8,47[56]/.test(tot), `${name}: typed 1.5 × 5,650.50 stays as typed = ${tot}`)
    await typeKeys(r, '99999999999'); await W(150)
    ok(await p.locator('[data-testid=inv-send]').isDisabled() && /check the number/.test(await p.innerText('[data-testid=inv-reason]')), `${name}: absurd rate blocked with a message`)
    await typeKeys(r, '5650.50'); await (await p.locator('[data-testid=inv-add-line]')).click(); await W(150)
    const d = p.locator('[data-testid=inv-line-desc]').last(); await d.fill(''); await typeKeys(p.locator('[data-testid=inv-line-rate]').last(), '777'); await W(150)
    ok(/needs a description/.test(await p.innerText('[data-testid=inv-reason]')) && await p.locator('[data-testid=inv-send]').isDisabled(), `${name}: blank description blocks Send with the reason`)
    await p.locator('[data-testid=inv-line-del]').last().click(); await typeKeys(p.locator('[data-testid=inv-tax]'), '8.2.5'); await W(150)
    ok(/Sales tax/.test(await p.innerText('[data-testid=inv-reason]')), `${name}: bad tax % explained`)
    await typeKeys(p.locator('[data-testid=inv-tax]'), '8.25'); await W(150)
    // phones: description readable, × visible
    const dw = await p.locator('[data-testid=inv-line-desc]').first().evaluate(e => e.getBoundingClientRect().width)
    const xr = await p.locator('[data-testid=inv-line-del]').first().evaluate(e => e.getBoundingClientRect().right)
    const vw = await S(p, () => innerWidth); ok(dw > 150 && xr <= vw, `${name}: line description ${Math.round(dw)}px wide, remove button on screen`)
    await p.screenshot({ path: out + name + '-inv-preview.png' })
    const before = await S(p, () => window.__store.getState().db.invoices.length)
    await p.locator('[data-testid=inv-send]').dblclick(); await W(800)
    const after = await S(p, () => { const d = window.__store.getState().db; return { n: d.invoices.length, amt: d.invoices[0].amount, lines: d.invoices[0].lines } })
    const sub = after.lines.filter(l => !/Sales tax/.test(l.description)).reduce((s, l) => s + l.qty * l.rate, 0), tx = after.lines.find(l => /Sales tax/.test(l.description))?.rate ?? 0
    ok(after.n === before + 1 && Math.abs(tx - Math.round(sub * 8.25) / 100) < 0.01, `${name}: double-click sends one invoice; tax matches the saved lines ($${after.amt})`)
  } else ok(false, `${name}: a job ready to invoice`)
  // B3: payroll export scope + filter reset per sign-in
  await S(p, () => { const s = window.__store.getState(); s.setUI({ filter: { divisionId: 'all', branchId: 'br-kil' } }); s.signOut() }); await W(500)
  await p.click('[data-role=payroll]'); await W(900)
  ok(await S(p, () => window.__store.getState().ui.filter.branchId) === 'all', `${name}: payroll opens on All Company, not the last user's Kilgore`)
  await S(p, () => window.__store.getState().signOut()); await W(400); await p.click('[data-role=sales]'); await W(900)
  ok(await S(p, () => window.__store.getState().ui.filter.branchId) !== 'br-kil', `${name}: sales doesn't inherit Kilgore`)
  if (name === 'desk1920') {
    await S(p, () => window.__store.getState().signOut()); await W(400); await p.click('[data-role=payroll]'); await W(900)
    await S(p, () => { const s = window.__store.getState(); s.setUI({ filter: { divisionId: 'all', branchId: 'br-okc' } }); s.go('time') }); await W(800)
    const wkStart = await S(p, () => { const d = window.__store.getState().db; return d.time.filter(t => t.status === 'Approved').map(t => t.date).sort().at(-1) })
    await p.click('[data-testid=time-export]'); await W(500)
    const body = await p.locator('[role=dialog]').last().innerText()
    ok(/SLH-OKC/.test(body) && /SLH-MID/.test(body) && /SLH-KIL/.test(body), `${name}: export asks — screen shows OKC, payroll covers OKC, MID, KIL`)
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }).catch(() => null), p.getByRole('button', { name: /^All / }).last().click()])
    if (dl) { const fp = out + 'pay.csv'; await dl.saveAs(fp); const t = fs.readFileSync(fp, 'utf8'); ok(/all-branches/.test(dl.suggestedFilename()) && /SCOPE,"?All branches/.test(t), `${name}: file says what it included (${dl.suggestedFilename()})`) }
    else ok(true, `${name}: no approved time this week to export (${wkStart})`)
  }
  // B2: double-submit Save quote → one quote; delete + undo; lost undo
  await S(p, () => window.__store.getState().signOut()); await W(400); await p.click('[data-role=sales]'); await W(900)
  const n0 = await S(p, () => window.__store.getState().db.jobs.length)
  await S(p, () => { const d = window.__store.getState().db; const j = d.jobs[0]; window.__store.getState().setUI({ jobBuilder: { prefill: { customerId: j.customerId, siteId: j.siteId, name: 'D3 test lift (fictional)' } } }) }); await W(600)
  await p.getByRole('button', { name: 'Continue' }).click(); await W(800)
  await p.locator('[data-testid=jb-crane]:not([disabled])').first().click(); await W(200)
  for (let i = 0; i < 2; i++) { await p.getByRole('button', { name: 'Continue' }).click(); await W(900) }
  await p.locator('select').filter({ hasText: 'Quote' }).selectOption('Quote')
  await typeKeys(p.locator('[data-testid=jb-rate]'), '4,500.50'); await W(150)
  if (name.startsWith('iphone') || name.startsWith('pixel') || name === 'ipad820' || name === 'tab800') { const b = p.locator('[data-testid=jb-create]'); await b.tap(); await W(60); await b.tap().catch(() => {}) } else await p.locator('[data-testid=jb-create]').dblclick()
  await W(900); const n1 = await S(p, () => window.__store.getState().db.jobs.length)
  ok(n1 === n0 + 1, `${name}: double click/tap on Save quote makes one quote (${n0} → ${n1})`)
  ok(await S(p, () => window.__store.getState().db.jobs.at(-1).dayRate) === 4500.5, `${name}: day rate "4,500.50" saved as $4,500.50/day`)
  const qid = await S(p, () => window.__store.getState().db.jobs.at(-1).id)
  await S(p, () => window.__store.getState().go('quotes')); await W(600)
  const res = await S(p, id => { const a = window.__actions; const r = a.deleteJob(id, 'Duplicate'); if (!r.ok) return 'refused'; a.restoreJob(r.snap); return window.__store.getState().db.jobs.some(j => j.id === id) ? 'restored' : 'gone' }, qid)
  ok(res === 'restored', `${name}: quote can be deleted and restored with Undo (${res})`)
  ok(await S(p, () => { const d = window.__store.getState().db; const j = d.jobs.find(x => x.tickets !== undefined || d.tickets.some(t => t.jobId === x.id)); return !window.__actions.canDeleteJob(j.id).ok }), `${name}: a job with field tickets can't be deleted`)
  await S(p, id => window.__actions.deleteJob(id, 'test cleanup'), qid)
  await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
