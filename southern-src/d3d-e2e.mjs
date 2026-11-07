// dive3 accounting/sales minors m5–m16: payment validation, Ask aliases, lost quotes hidden from the portal/pipeline,
// extras role check + finished-job default, sync retry-all + Mon–Sun week, default theme primary, sheet bottom padding.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r) => { await S(p, r => { window.__store.getState().signOut(); window.__store.getState().signIn(r) }, r); await W(700) }
const askQ = async (p, q) => { await S(p, () => window.__store.getState().setUI({ cmdOpen: true })); await W(300); await p.fill('[data-testid=ask-input]', q); await W(400); const t = await p.locator('[data-testid=ask-answer]').innerText().catch(() => ''); await p.keyboard.press('Escape'); await W(200); return t.replace(/\s+/g, ' ') }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=accounting]'); await as(p, 'accounting')
  // m5: payments
  const inv = await S(p, () => { const d = window.__store.getState().db; const i = d.invoices.find(i => i.amount - i.paid > 1000 && i.status !== 'Paid'); return { id: i.id, date: i.date } })
  await S(p, id => window.__store.getState().open({ type: 'invoice', id }), inv.id); await W(800)
  await p.fill('[data-testid=pay-ref]', '1001')
  await p.fill('[data-testid=pay-amount]', '-500'); await W(150)
  ok(await p.locator('[data-testid=pay-submit]').isDisabled() && /negative/i.test(await p.innerText('[data-testid=pay-error]').catch(() => '')), `${name}: -500 refused with a message (not silently 500)`)
  await p.fill('[data-testid=pay-amount]', '0.001'); await W(150)
  ok(await p.locator('[data-testid=pay-submit]').isDisabled() && /0\.01/.test(await p.innerText('[data-testid=pay-error]').catch(() => '')), `${name}: $0.001 refused (minimum $0.01)`)
  await p.fill('[data-testid=pay-amount]', '100'); await p.fill('[data-testid=pay-date]', '1999-01-01'); await W(150)
  ok(await p.locator('[data-testid=pay-submit]').isDisabled() && /before|closed/i.test(await p.innerText('[data-testid=pay-error]').catch(() => '')), `${name}: payment dated 1999 refused (${(await p.innerText('[data-testid=pay-error]').catch(() => '')).slice(0, 60)})`)
  await p.keyboard.press('Escape'); await W(400)
  // m14: Ask
  const wr = await askQ(p, 'win rate'); ok(/Win rate \d+%/.test(wr) && /lost/.test(wr), `${name}: Ask "win rate" → ${wr.slice(0, 60)}`)
  if (name === 'desk1920') {
    const bl = await askQ(p, 'backlog'); ok(/backlog/i.test(bl), `Ask "backlog" → ${bl.slice(0, 60)}`)
    const cb = await askQ(p, 'compare branches'); ok(/Branches by invoiced revenue/.test(cb), `Ask "compare branches" → ${cb.slice(0, 60)}`)
    const ab = await askQ(p, 'absorbed cost'); ok(/absorbed cost/i.test(ab), `Ask "absorbed cost" → ${ab.slice(0, 60)}`)
    const br2 = await askQ(p, 'billing review'); ok(/billing review/.test(br2) && !/DOT|driver/i.test(br2), `Ask "billing review" → ${br2.slice(0, 60)}`)
    const qn = await S(p, () => window.__store.getState().db.jobs.find(j => j.stage === 'Quote' && !j.quoteLost).jobNo)
    const qa = await askQ(p, `Q-${qn}`); ok(new RegExp(`Quote Q-${qn}`).test(qa) && !/not started/.test(qa), `Ask "Q-${qn}" → ${qa.slice(0, 60)}`)
  }
  // m8: sync
  await as(p, 'owner'); await S(p, () => window.__store.getState().go('acctsync')); await W(900)
  if (await p.locator('[data-testid=acct-sync]').count()) {
    const txt = await p.innerText('[data-testid=acct-sync]')
    ok(/Week ending Sun/.test(txt) && !/\$[\d,]+\.\d(?!\d)/.test(txt), `${name}: payroll row is a Mon–Sun week; money shows 2 decimals`)
    if (/Disconnect/.test(await p.innerText('[data-testid=conn-qb]'))) { await p.click('[data-testid=connect-qb]'); await W(1300) }
    await p.click('[data-testid=sync-run]'); await W(500)
    ok(await p.locator('[data-testid=sync-retry-all]').count() === 1, `${name}: "Retry all" appears when pushes fail`)
  } else ok(false, `${name}: accounting sync page opened`)
  // m16 / m11: extras
  const r = await S(p, () => { const st = window.__store.getState(); const j = st.db.jobs.find(j => j.status === 'Complete' && j.stage !== 'Quote'); st.signOut(); st.signIn('accounting'); const a = window.__actions.addExtra(j.id, { kind: 'person', role: 'Rigger', qty: 1 }); window.__store.getState().signOut(); window.__store.getState().signIn('ops'); const b = window.__actions.addExtra(j.id, { kind: 'person', role: 'Rigger', qty: 1 }); const x = window.__store.getState().db.jobs.find(y => y.id === j.id).extras?.at(-1); const c2 = window.__actions.addExtra(j.id, { kind: 'person', role: 'Rigger', qty: 1, from: '2020-01-01' }); return { a: a.ok, b: b.ok, from: x?.from, end: j.endDate, c: c2.ok } })
  ok(r.a === false, `${name}: Accounting can't add crew/equipment extras (store check)`)
  ok(r.b !== false && r.from === r.end, `${name}: forgotten extra on a finished job defaults to its last day (${r.from})`)
  ok(r.c === false, `${name}: extra dated 2020-01-01 refused`)
  // lost quotes hidden from customer portal + pipeline
  const lp = await S(p, () => { const d = window.__store.getState().db; return d.jobs.filter(j => j.quoteLost).length })
  ok(lp >= 20, `${name}: lost quotes seeded (${lp})`)
  await as(p, 'owner'); await S(p, () => window.__store.getState().go('jobs')); await W(600)
  ok(!/Lost quote \(demo history\)/.test(await p.innerText('main')), `${name}: Jobs list doesn't show lost quotes`)
  // m13: default dark theme primary isn't gray
  const bg = await S(p, () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase())
  ok(bg !== '#9ca1a8', `${name}: default primary is not the disabled-looking gray (${bg})`)
  // m15: sheet content clears the tab bar on phones
  if (name === 'iphone390') {
    const q = await S(p, () => window.__store.getState().db.jobs.find(j => j.stage === 'Quote' && !j.quoteLost).id)
    await S(p, () => window.__store.getState().go('quotes')); await W(600)
    const card = p.locator('[data-testid=quote-card]').first(); await card.click().catch(() => {}); await W(800)
    const btn = p.locator('[data-testid=quote-lost]'); if (await btn.count()) { await btn.scrollIntoViewIfNeeded(); await W(300); const bb = await btn.boundingBox(); const tab = await p.locator('nav').last().boundingBox().catch(() => null); ok(!tab || bb.y + bb.height <= tab.y + 1 || tab.y < 400, `iPhone: "Mark lost" (bottom ${Math.round(bb.y + bb.height)}) clears the tab bar (top ${tab ? Math.round(tab.y) : '-'})`) } else ok(true, 'iPhone: quote sheet n/a')
    void q
  }
  await c.close()
}
// portal (one device is enough — same data)
{ const c = await cr.newContext({ viewport: { width: 390, height: 844 } }); const p = await c.newPage(); p.on('pageerror', e => errors.push('portal: ' + e.message))
  await p.goto(base + '?portal=1'); await p.click('[data-testid=portal-send]'); await p.click('[data-testid=portal-magic]'); await p.waitForSelector('[data-testid=portal-job]')
  const t = await p.innerText('body'); ok(!/Lost quote|demo history/i.test(t), 'customer portal hides lost quotes'); await c.close() }
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
