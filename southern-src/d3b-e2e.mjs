// dive3 accounting/sales majors (part 2): real win rate, quote a new customer + site, AP "$1,250.00" + split lines + no
// self-approval, expenses reach job cost, job P&L names on phones, branding reaches login/Ask/divisions/invoice, logo-from-site
// message, repricing changes the invoice. iPhone 390, Pixel 7, iPad 820, Android tablet 800, 1920.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/', out = (process.env.OUT || '/tmp/')
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r) => { await S(p, r => { window.__store.getState().signOut(); window.__store.getState().signIn(r) }, r); await W(700) }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=sales]'); await as(p, 'sales')
  // m3: win rate is a real ratio
  await S(p, () => window.__store.getState().go('quotes')); await W(800)
  const wr = await p.locator('text=Win rate').first().locator('xpath=..').innerText().catch(() => '')
  ok(/\d+%/.test(wr) && !/100%/.test(wr) && /lost/.test(wr), `${name}: win rate counts lost quotes (${wr.replace(/\s+/g, ' ').slice(0, 50)})`)
  // M9/m10: blank builder, quote a brand-new customer at a brand-new site
  await S(p, () => window.__store.getState().setUI({ jobBuilder: {} })); await W(700)
  ok(await p.locator('[data-testid=jb-continue]').isDisabled() && /customer/i.test(await p.innerText('[data-testid=jb-step-err]')), `${name}: builder starts blank — Continue waits for a customer`)
  await p.selectOption('[data-testid=jb-customer]', '__new'); await p.fill('[data-testid=jb-cu-name]', 'Prairie Test Fab (fictional)'); await p.click('[data-testid=jb-cu-save]'); await W(300)
  await p.selectOption('[data-testid=jb-site]', '__new'); await p.fill('[data-testid=jb-si-name]', 'North yard (fictional)'); await p.fill('[data-testid=jb-si-city]', 'Enid'); await p.fill('[data-testid=jb-si-state]', 'ok'); await p.click('[data-testid=jb-si-save]'); await W(300)
  await p.fill('[data-testid=jb-name]', 'Press set (fictional)'); await W(150)
  ok(await p.locator('[data-testid=jb-continue]').isEnabled(), `${name}: new customer + new site added in place, Continue enabled`)
  await p.click('[data-testid=jb-continue]'); await W(800); await p.locator('[data-testid=jb-crane]:not([disabled])').first().click(); await W(200)
  for (let i = 0; i < 2; i++) { await p.click('[data-testid=jb-continue]'); await W(900) }
  await p.locator('select').filter({ hasText: 'Quote' }).selectOption('Quote'); await p.locator('[data-testid=jb-create]').click(); await W(900)
  const nj = await S(p, () => { const d = window.__store.getState().db, j = d.jobs.at(-1); return { cu: d.customers.find(x => x.id === j.customerId)?.name, si: d.sites.find(x => x.id === j.siteId)?.name, st: d.sites.find(x => x.id === j.siteId)?.state, id: j.id } })
  ok(/Prairie Test Fab/.test(nj.cu) && /North yard/.test(nj.si) && nj.st === 'OK', `${name}: quote saved for the new customer at the new site (${nj.cu} · ${nj.si}, ${nj.st})`)
  // M6: repricing with the margin slider changes what gets invoiced
  await S(p, id => window.__store.getState().open({ type: 'job', id }), nj.id); await W(300); await S(p, () => window.__store.getState().go('quotes')); await W(600)
  await p.locator('[data-testid=quote-card]').filter({ hasText: 'Prairie Test Fab' }).first().click(); await W(700)
  const before = await S(p, id => window.__store.getState().db.jobs.find(j => j.id === id).dayRate, nj.id)
  await p.locator('[data-testid=margin-slider]').fill('45'); await W(200); await p.click('[data-testid=margin-apply]'); await W(500)
  const rp = await S(p, id => { const j = window.__store.getState().db.jobs.find(x => x.id === id); return { dr: j.dayRate, rev: j.quote.revenue, inv: window.__actions.invoiceDraft(id)[0].rate } }, nj.id)
  ok(rp.dr !== before && rp.inv === rp.dr, `${name}: Apply repricing changes the day rate the invoice uses (${before} → ${rp.dr})`)
  await p.keyboard.press('Escape'); await S(p, id => window.__actions.deleteJob(id, 'test cleanup'), nj.id)
  // M10: AP parsing, split lines, no self-approval over $5,000
  await as(p, 'accounting'); await S(p, () => window.__store.getState().go('payables')); await W(700)
  await p.getByRole('button', { name: 'Enter bill' }).click(); await W(400)
  await p.fill('[data-testid=bill-no]', 'D3B-' + name); await p.fill('[data-testid=bill-amount]', '$1,250.00'); await p.click('[data-testid=bill-add-line]'); await p.locator('[data-testid=bill-line-amt]').last().fill('2,000'); await W(200)
  ok(/\$3,250\.00/.test(await p.innerText('[data-testid=bill-total]')) && await p.locator('[data-testid=bill-save]').isEnabled(), `${name}: "$1,250.00" + "2,000" accepted, total $3,250.00`)
  await p.screenshot({ path: out + `d3b-${name}-bill.png` })
  await p.click('[data-testid=bill-save]'); await W(500)
  const bl = await S(p, n => { const b = window.__store.getState().db.bills.find(x => x.billNo === n); return b ? { lines: b.lines.length, amt: b.lines.reduce((s, l) => s + l.amount, 0), by: b.enteredBy } : null }, 'D3B-' + name)
  ok(bl && bl.lines === 2 && bl.amt === 3250 && bl.by, `${name}: bill saved with 2 lines, $3,250, entered-by recorded`)
  const self = await S(p, () => { const A = window.__actions, d = window.__store.getState().db, j = d.jobs.find(x => x.stage === 'In Progress'); A.addBill({ vendorId: d.vendors[0].id, billNo: 'SELF-' + Math.random().toString(36).slice(2, 6), date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }), due: '2099-01-01', lines: [{ id: 'x1', jobId: j.id, category: 'Other', description: 'QA', amount: 9000 }], status: 'Pending Approval', branchId: j.branchId }); const b = window.__store.getState().db.bills[0]; return { id: b.id, r: A.setBillStatus(b.id, 'Approved') } })
  ok(!self.r.ok && /someone else/.test(self.r.reason), `${name}: can't approve your own $9,000 bill (${(self.r.reason || '').slice(0, 40)})`)
  await as(p, 'owner'); ok(await S(p, id => window.__actions.setBillStatus(id, 'Approved').ok, self.id), `${name}: a second person (owner) can approve it`)
  // M13: approved expense is in job cost
  ok(await S(p, () => window.__store.getState().db.costs.some(c => c.source === 'Expense' && c.refId === 'exp:ex-7')), `${name}: approved Love's expense posted to job cost (db.costs, source Expense)`)
  // M11: job P&L shows the job on phones / tablets
  await S(p, () => window.__store.getState().go('analytics')); await W(900)
  const nmSel = (await S(p, () => innerWidth)) >= 1024 ? '[data-testid=jpl-name-lg]' : '[data-testid=jpl-name]'
  const nw = await p.locator(nmSel).first().evaluate(e => ({ w: e.getBoundingClientRect().width, t: e.textContent })).catch(() => ({ w: 0, t: '' }))
  ok(nw.w > 120 && /#\d+ · /.test(nw.t), `${name}: Job P&L shows "${nw.t?.slice(0, 30)}" (${Math.round(nw.w)}px)`)
  await p.screenshot({ path: out + `d3b-${name}-jobpl.png` })
  if (name === 'desk1920' || name === 'iphone390') {
    // M14: branding reaches Ask, divisions, login, printed invoice; website logo gives a clear message
    await S(p, () => window.__store.getState().go('branding')); await W(800)
    await p.fill('[data-testid=brand-name]', 'Bobs Machine Moving (fictional)'); await p.fill('[data-testid=brand-short]', 'BMM'); await p.fill('[data-testid=brand-phone]', '(555) 010-0199'); await p.click('[data-testid=brand-save]'); await W(600)
    await p.route('**/bobsmachinemoving.com/**', r => r.abort()); await p.fill('[data-testid=brand-logo-url]', 'bobsmachinemoving.com'); await p.click('[data-testid=brand-logo-fetch]'); await W(1500)
    ok(/Upload/i.test(await p.innerText('[data-testid=brand-url-msg]').catch(() => '')), `${name}: website without CORS → plain message + Upload button`)
    const dv = await S(p, () => window.__store.getState().db.divisions.map(d => d.name).join(', ')); ok(/BMM Transport/.test(dv) && !/Southern/.test(dv), `${name}: division names follow the brand (${dv.slice(0, 60)})`)
    await S(p, () => window.__store.getState().signOut()); await W(900)
    const lg = await p.innerText('body'); ok(await p.locator('[data-testid=login-hero]').count() === 0 && /four divisions and three branches/.test(lg) === true, `${name}: login drops the wind hero; copy counts divisions/branches from data`)
    await p.click('[data-role=owner]'); await W(700)
    ok(/Ask BMM/.test((await p.getAttribute('[data-testid=ask]','aria-label').catch(()=>''))||''), `${name}: "Ask BMM" in the app`)
    await S(p, () => window.__store.getState().go('branding')); await W(700); await p.click('[data-testid=brand-reset]'); await W(500)
    ok(/Southern Transport/.test(await S(p, () => window.__store.getState().db.divisions.map(d => d.name).join(', '))), `${name}: reset branding puts Southern division names back`)
  }
  await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed|aborted/i.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
