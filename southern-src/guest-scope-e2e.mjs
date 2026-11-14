// Guest pass scope: allow-list, scope picker, no money/HR pages for a default pass, friendly no-access, view-only honesty.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const PIN = fs.readFileSync(new URL('./.e2e-pin', import.meta.url), 'utf8').trim() // never printed
const base = process.env.BASE || 'http://localhost:4173/'; const out = '/workspace/southern-app/screenshots/guest-scope/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const watch = p => p.on('pageerror', e => errors.push(e.message))
const SENSITIVE = ['time', 'people', 'onboarding', 'union', 'payables', 'receivables', 'analytics', 'acctsync', 'expenses', 'pto', 'mgmt', 'allocations', 'quotes', 'purchasing', 'certtracker', 'contacts', 'audit', 'vault', 'settings', 'integrations', 'guests', 'branding', 'myinfo']
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const oc = await cr.newContext({ viewport: { width: 1440, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] }); const o = await oc.newPage(); watch(o)
await o.goto(base); await o.click('[data-role=owner]'); await o.waitForTimeout(800); await o.evaluate(() => { location.hash = '/guests' }); await o.waitForSelector('[data-testid=gp-pin-gate]')
for (const d of PIN) await o.click(`[data-pin="${d}"]`); await o.waitForSelector('[data-testid=guest-new]')
ok(await o.getAttribute('[data-testid=guest-scope-show]', 'data-selected') === 'true', 'new pass defaults to the safe Showcase scope')
ok(await o.locator('[data-testid^=guest-scope-]').count() === 3, 'scope picker has 3 choices'); await o.screenshot({ path: out + 'owner-scope-picker.png' })
const make = async (name, sc) => { if (sc) await o.click(`[data-testid=guest-scope-${sc}]`); await o.fill('[data-testid=guest-name]', name); await o.click('[data-testid=guest-create]'); await o.waitForTimeout(500); const l = await o.textContent('[data-testid=guest-link]'); return base + l.slice(l.indexOf('?')) }
const showUrl = await make('Bank - First Fidelity'); const opsUrl = await make('Ops Visitor', 'ops'); const allUrl = await make('Trusted CPA', 'all')
ok(!(await o.textContent('body')).includes(PIN), 'PIN never on screen')
const visit = async (b, opts, url, tag) => { const c = await b.newContext(opts); const g = await c.newPage(); watch(g); await g.goto(url); await g.waitForSelector('[data-testid=guest-banner]', { timeout: 15000 }); await g.waitForTimeout(600); return { c, g, tag } }
// default (showcase) pass on iPhone WebKit
const wk = await webkit.launch()
{ const { c, g } = await visit(wk, devices['iPhone 14'], showUrl, 'show')
  const nav = await g.evaluate(() => window.__scNav || [])
  ok(nav.length > 3 && nav.length <= 12, `showcase guest sees a short safe menu (${nav.length} pages: ${nav.join(',')})`)
  ok(!nav.some(k => SENSITIVE.includes(k)), 'showcase guest menu has no money/HR/admin pages')
  for (const k of SENSITIVE) {
    await g.evaluate(k => { location.hash = '/' + k }, k); await g.waitForTimeout(250)
    const page = await g.evaluate(() => window.__store.getState().ui.page)
    const na = await g.locator('[data-testid=no-access]').count()
    if (page === k || !na) ok(false, `guest typed #/${k}: page=${page} noAccess=${na}`)
  }
  ok(true, `guest typing any of ${SENSITIVE.length} money/HR/admin addresses gets "not part of this pass"`)
  await g.screenshot({ path: out + 'iphone390-guest-no-access.png' })
  for (const k of ['time', 'payables', 'people']) { await g.evaluate(k => window.__store.getState().go(k), k); await g.waitForTimeout(300); ok(await g.locator('[data-testid=no-access]').count() === 1 && !/Needs approval|Needs Coding|Directory/.test(await g.textContent('main')), `in-app link to ${k} shows no-access, no data`) }
  await g.tap('[data-testid=no-access-home]'); await g.waitForTimeout(400); ok(await g.locator('[data-testid=no-access]').count() === 0, 'no-access → "Go to my home page" works')
  ok(/Welcome, Bank - First Fidelity/.test(await g.textContent('main')), 'guest greeting reads "Welcome, <name>"')
  { const m = await g.textContent('main'); ok(!/Revenue at work|Sales YTD|Coming out behind|Who makes the money|Jobs losing money/.test(m) && /Crane utilization/.test(m), 'showcase guest Command shows no revenue, margins or job costing') }
  { await g.locator('[data-kpi="jobs:today"]').first().tap(); await g.waitForTimeout(700); const d = await g.textContent('[role=dialog]').catch(() => '')
    ok(d.length > 0 && !/\$\d/.test(d) && !/Revenue/.test(d), 'guest drill-down behind a Command tile shows no day rates or revenue'); await g.screenshot({ path: out + 'iphone390-guest-drill-no-money.png' })
    await g.evaluate(() => history.back()); await g.waitForTimeout(500)
    for (const k of ['month:2026:1', 'jobs:behind', 'hist:division:div-1']) { await g.evaluate(k => window.__store.getState().open({ type: 'list', id: k }), k); await g.waitForTimeout(400); const t = await g.textContent('[role=dialog]').catch(() => ''); if (/\$\d/.test(t)) ok(false, `guest drill ${k} shows money`) ; await g.keyboard.press('Escape').catch(() => {}); await g.evaluate(() => history.back()); await g.waitForTimeout(300) }
    ok(true, 'guest sales / job-costing drill-downs show no money') }
  { const d = await g.evaluate(() => { const db = window.__store.getState().db; return { rate: db.employees.some(e => e.rate > 0), addr: db.employees.some(e => e.address || e.emergencyContacts?.length || e.emergencyContact || e.phone), time: db.time.length, bills: db.bills.length, inv: db.invoices.length } })
    ok(!d.rate && !d.addr && !d.time && !d.bills && !d.inv, 'guest browser holds a scrubbed copy (no pay, addresses, contacts, time, bills, invoices) ' + JSON.stringify(d)) }
  await g.evaluate(() => { const j = window.__store.getState().db.jobs[0]; window.__store.getState().open({ type: 'job', id: j.id }) }); await g.waitForTimeout(700)
  ok(await g.locator('[data-testid=guest-ro-strip]').isVisible(), 'records show a "View-only demo" strip')
  await g.evaluate(() => window.__store.getState().commit('Coded bill', 'x', 'y', () => {})); await g.waitForTimeout(400)
  const toasts = await g.locator('[data-sonner-toast]').allInnerTexts()
  ok(toasts.some(t => /View-only demo/.test(t)) && !toasts.some(t => /Coded|Saved|Approved/.test(t)), 'blocked edit shows "View-only demo", never a success: ' + toasts.join(' / ').slice(0, 80))
  await g.screenshot({ path: out + 'iphone390-guest-view-only.png' })
  await g.evaluate(() => { const e = window.__store.getState().db.employees[0]; window.__store.getState().open({ type: 'employee', id: e.id }) }); await g.waitForTimeout(600)
  ok(await g.locator('[role=dialog] a[href^="tel:"]').count() === 0 && !/Pay rate|HR file|Recent time/.test(await g.textContent('[role=dialog]')), 'guest person card hides phone, pay, HR and time')
  await c.close() }
await wk.close()
// ops pass: operations pages yes, money/HR no; all pass: books visible
{ const { c, g } = await visit(cr, { viewport: { width: 1920, height: 1080 } }, opsUrl, 'ops'); const nav = await g.evaluate(() => window.__scNav || [])
  ok(nav.includes('tickets') && nav.includes('shop') && !nav.some(k => SENSITIVE.includes(k)), 'Operations pass adds tickets/shop, still no money/HR')
  await g.evaluate(() => { location.hash = '/tickets' }); await g.waitForTimeout(500); ok(await g.evaluate(() => window.__store.getState().ui.page) === 'tickets', 'Operations guest can open Tickets')
  await g.evaluate(() => { location.hash = '/receivables' }); await g.waitForTimeout(400); ok(await g.locator('[data-testid=no-access]').count() === 1, 'Operations guest cannot open Receivables')
  await g.screenshot({ path: out + 'projector1920-ops-guest-no-access.png' })
  { await g.click('[data-testid=ask]'); await g.waitForTimeout(600); const t = await g.textContent('body')
    ok(!/losing money|sales vs last year|owes us money|Most profitable|Open quotes/i.test(t) && /Crane 28|Wind farms/.test(t), 'guest Ctrl+K suggestions have no money questions')
    await g.keyboard.type('who owes us money'); await g.waitForTimeout(500); ok(/Money isn’t part of this guest pass/.test(await g.textContent('body')), 'guest asking a money question gets "not part of this guest pass"')
    await g.keyboard.press('Escape'); await g.waitForTimeout(300) }
  // click through the side-store pages: nothing may be saved, and no success toast
  g.on('dialog', d => d.dismiss().catch(() => {}))
  const snap = () => g.evaluate(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(k => /^sc-(npt|gapb|pickup|moves|rig|batch|wx|bids|union|launch|da|dq|nccco|turbine)/.test(k)).sort().map(k => [k, localStorage.getItem(k)]))))
  const before = await snap(); let clicks = 0; const changed = []
  for (const k of ['tickets', 'permits', 'pickup', 'moves', 'weather', 'rigging', 'maint', 'sitedata']) {
    await g.evaluate(k => window.__store.getState().go(k), k); await g.waitForTimeout(600)
    if (await g.evaluate(() => window.__store.getState().ui.page) !== k) continue
    for (const bt of (await g.locator('main button:visible').all()).slice(0, 12)) {
      const b0 = await snap(); await bt.click({ timeout: 300, noWaitAfter: true }).catch(() => {}); clicks++; await g.waitForTimeout(250)
      if (await snap() !== b0) changed.push(k + ':' + (((await bt.textContent().catch(() => '')) || '').trim().slice(0, 30)))
      await g.keyboard.press('Escape'); const here = await g.evaluate(() => window.__store?.getState?.().ui.page ?? null).catch(() => null); if (here === null) { await g.goBack().catch(() => {}); await g.waitForTimeout(400) } else if (here !== k) await g.evaluate(k => window.__store.getState().go(k), k)
    }
  }
  ok(changed.length === 0 && (await snap()) === before, `ops guest: ${clicks} clicks across permits/pickup/tickets/moves/weather/rigging/shop/site library saved nothing ${changed.slice(0, 4).join(' | ')}`)
  await c.close() }
{ const { c, g } = await visit(cr, { viewport: { width: 1440, height: 900 } }, allUrl, 'all'); const nav = await g.evaluate(() => window.__scNav || [])
  ok(nav.includes('time') && nav.includes('receivables') && !nav.some(k => ['guests', 'branding', 'settings', 'vault', 'audit', 'integrations'].includes(k)), 'Everything pass shows the books but never admin pages'); await c.close() }
// tampering with the scope breaks the signature
{ const c = await cr.newContext(); const g = await c.newPage(); const tok = showUrl.split('guest=')[1].split('#')[0]; const [body, sig] = tok.split('.')
  const json = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()); json.s = 'all'
  const nb = Buffer.from(JSON.stringify(json)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  await g.goto(showUrl.replace(body, nb)); ok(await g.locator('[data-testid=guest-locked]').waitFor({ timeout: 15000 }).then(() => true, () => false), 'editing the scope inside a link → link refused'); void sig; await c.close() }
// staff: friendly no-access instead of a silent bounce
{ const c = await cr.newContext({ viewport: { width: 1280, height: 800 } }); const g = await c.newPage(); watch(g); await g.goto(base); await g.click('[data-role=sales]'); await g.waitForTimeout(900)
  await g.evaluate(() => { location.hash = '/time' }); await g.waitForTimeout(500); ok(/You don’t have access to/.test(await g.textContent('main')), 'staff typing a page outside their role sees "You don’t have access"'); await g.screenshot({ path: out + 'staff-no-access.png' }); await c.close() }
await cr.close()
ok(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '))
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0)
