// Guest security (dive2 shop-it-guest B1/B2/M1-M5/M9): a guest can't become staff, never saves, sees no money, no side routes.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const PIN = fs.readFileSync(new URL('./.e2e-pin', import.meta.url), 'utf8').trim() // never printed
const base = process.env.BASE || 'http://localhost:4173/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const watch = p => p.on('pageerror', e => errors.push(e.message))
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const oc = await cr.newContext({ viewport: { width: 1440, height: 950 } }); const o = await oc.newPage(); watch(o)
await o.goto(base); await o.click('[data-role=owner]'); await o.waitForTimeout(800); await o.evaluate(() => { location.hash = '/guests' }); await o.waitForSelector('[data-testid=gp-pin-gate]')
for (const d of PIN) await o.click(`[data-pin="${d}"]`); await o.waitForSelector('[data-testid=guest-new]')
const make = async (name, sc) => { if (sc) await o.click(`[data-testid=guest-scope-${sc}]`); await o.fill('[data-testid=guest-name]', name); await o.click('[data-testid=guest-create]'); await o.waitForTimeout(500); const l = await o.textContent('[data-testid=guest-link]'); return base + l.slice(l.indexOf('?')) }
const showUrl = await make('Bank'); const opsUrl = await make('Ops Visitor', 'ops')
const ownerBills = await o.evaluate(() => window.__store.getState().db.bills.length)
const role = g => g.evaluate(() => window.__store?.getState().session?.role ?? null)
const dollars = t => (t.match(/\$\s?\d/g) || []).length

// B1 + M5: ?as=owner, signIn('owner'), session edit — all stay guest (iPhone WebKit)
const wk = await webkit.launch()
{ const c = await wk.newContext(devices['iPhone 14']); const g = await c.newPage(); watch(g)
  await g.goto(showUrl); await g.waitForSelector('[data-testid=guest-banner]', { timeout: 15000 }); await g.waitForTimeout(600)
  await g.evaluate(() => window.__store.getState().signIn('owner')); await g.waitForTimeout(400)
  ok(await role(g) === 'guest', 'console signIn("owner") is refused for a guest')
  const t2 = await c.newPage(); watch(t2); await t2.goto(base + '?as=owner'); await t2.waitForTimeout(2500)
  ok(await role(t2) !== 'owner' && await t2.locator('[data-role=owner]').count() === 0, 'new tab /?as=owner on a guest browser does not become Owner')
  ok(await t2.locator('[data-testid=guest-device]').count() === 1, '…it shows the guest-pass screen instead')
  await t2.evaluate(() => { localStorage.removeItem('sc-guest-device'); sessionStorage.setItem('sc-session', JSON.stringify({ role: 'owner', name: 'X' })) }); await t2.goto(base + '?as=owner&x=1'); await t2.waitForTimeout(2500)
  ok(await role(t2) !== 'owner' && await t2.locator('[data-role=owner]').count() === 0, 'deleting the localStorage flag + forging the session still does not give Owner (cookie lock)')
  // M4: side routes skip the guest guard → refused on a guest browser
  await g.goto(base + '?inspect=eq-1'); await g.waitForTimeout(2500)
  ok(await g.locator('[data-testid=phone-inspect]').count() === 0, '?inspect= side route refused for a guest')
  await g.goto(base + '?sync=1'); await g.waitForTimeout(2000)
  ok(await g.locator('iframe[title=Office]').count() === 0, '?sync demo (owner iframe) refused for a guest')
  // B2: mutations blocked at the store, nothing saved
  await g.goto(showUrl); await g.waitForSelector('[data-testid=guest-banner]', { timeout: 15000 }); await g.waitForTimeout(600)
  const before = await g.evaluate(() => window.__store.getState().db.audit.length)
  await g.evaluate(() => window.__store.getState().commit('Deleted everything', 'x', '', db => { db.jobs = []; db.employees = [] }))
  ok(await g.evaluate(() => window.__store.getState().db.jobs.length) > 0 && await g.evaluate(() => window.__store.getState().db.audit.length) === before, 'store-level commit is a no-op for a guest')
  ok(await g.evaluate(() => window.__store.getState().db.__guest === true), 'guest copy is marked __guest')
  await g.waitForTimeout(1200)
  const idb = await g.evaluate(() => new Promise(res => { const r = indexedDB.open('southern-command', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => { const tx = r.result.transaction('kv', 'readonly'); const q = tx.objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result.length); q.onerror = () => res(-1) }; r.onerror = () => res(-1) }))
  ok(idb === 0, `guest phone saved nothing in IndexedDB (${idb} keys)`)
  ok(await g.evaluate(() => !localStorage.getItem('sc-db-pending') && !localStorage.getItem('sc-db-fallback')), 'no pending/fallback DB copy in localStorage')
  // M1: Showcase pass — jobs page has no $ and no margin badges
  await g.evaluate(() => { location.hash = '/jobs' }); await g.waitForTimeout(1200)
  const jt = await g.textContent('body'); ok(dollars(jt) === 0 && !/Losing money|Coming out ahead/.test(jt), `showcase guest Jobs: no $ / margin badges (${dollars(jt)} $)`)
  // Staff sign-in on a guest browser needs the owner PIN
  await g.evaluate(() => window.__store.getState().signOut()); await g.waitForTimeout(800)
  await g.tap('[data-testid=guest-device-staff]'); await g.waitForTimeout(500)
  ok(await g.locator('[data-testid=guest-device-pin] [data-testid=gp-pin-gate]').count() === 1 && await g.locator('[data-role=owner]').count() === 0, 'Staff sign-in on a guest browser asks for the owner PIN first')
  await c.close() }
// M2: Operations pass — inventory, permits, shop: no $ (1920 projector)
{ const c = await cr.newContext({ viewport: { width: 1920, height: 1080 } }); const g = await c.newPage(); watch(g)
  await g.goto(opsUrl); await g.waitForSelector('[data-testid=guest-banner]', { timeout: 15000 }); await g.waitForTimeout(600)
  const nav = await g.evaluate(() => window.__scNav || [])
  for (const k of ['jobs', 'inventory', 'invhome', 'permits', 'shop', 'equipment', 'command', 'dispatch']) { if (!nav.includes(k)) continue
    await g.evaluate(k => { location.hash = '/' + k }, k); await g.waitForTimeout(900)
    const t = await g.textContent('main') ?? await g.textContent('body'); ok(dollars(t) === 0 && !/Losing money|Coming out ahead/.test(t), `ops guest #/${k}: no $ (${dollars(t)})`) }
  const wo = await g.evaluate(() => window.__store.getState().db.workOrders.every(w => w.laborRate === 0) && window.__store.getState().db.items.every(i => i.cost === 0)); ok(wo, 'ops guest data has no labor rates / unit costs')
  await c.close() }
// owner's real data untouched by all of the above
await o.reload(); await o.waitForTimeout(1500)
ok(await o.evaluate(() => window.__store.getState().db.bills.length) === ownerBills && ownerBills > 0, `owner data intact (${ownerBills} bills)`)
// M9: shop / inventory: no PII table, no reset demo, audit is their own module only
for (const r of ['shop', 'inventory']) { const c = await cr.newContext({ viewport: { width: 1440, height: 950 } }); const p = await c.newPage(); watch(p)
  await p.goto(base); await p.click(`[data-role=${r}]`); await p.waitForTimeout(800); await p.evaluate(() => { location.hash = '/settings' }); await p.waitForTimeout(1200)
  const t = await p.textContent('body'); ok(!/Sensitive fields/.test(t) && !/Reset all demo|Demo data/.test(t), `${r}: Settings has no PII table and no Reset demo`)
  const roles = await p.evaluate(() => { const s = window.__store.getState(); return s.session.role }); ok(roles === r, `${r} signed in`)
  await c.close() }
await wk.close(); await cr.close()
ok(!errors.length, 'no page errors ' + errors.slice(0, 2).join(' | '))
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0)
