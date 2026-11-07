// dive3 shop-guest-devices B2 / M8 / M14 / framing on the owner build (iPhone, Pixel 7, iPad, 1920).
import { chromium, webkit, devices } from 'playwright'
const B = process.env.BASE || 'http://localhost:4174/', OUT = process.env.OUT || '/tmp/'
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++ }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch()
const as = async (p, role) => { await p.evaluate(r => { const s = window.__store.getState(); s.signOut?.(); window.__store.getState().signIn(r) }, role); await p.waitForTimeout(700) }
for (const [name, br, opts] of [['iphone', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad', wk, devices['iPad (gen 7)']], ['desk1920', cr, { viewport: { width: 1920, height: 1080 } }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); await p.goto(B); await p.waitForSelector('[data-role=shop]'); await as(p, 'shop')
  // B2: a unit whose only open work isn't finished → no one-tap release
  const u = await p.evaluate(() => { const db = window.__store.getState().db; const crit = db.workOrders.find(w => w.status !== 'Closed' && w.priority === 'Critical' && w.status !== 'Ready for Release'); return crit ? { id: crit.unitId, wo: crit.woNo } : null })
  if (u) { await p.evaluate(id => { window.__store.setState(s => ({ db: { ...s.db, equipment: s.db.equipment.map(e => e.id === id ? { ...e, status: 'Out of Service' } : e) } })); window.__store.getState().open({ type: 'equipment', id }) }, u.id); await p.waitForTimeout(800)
    ok(await p.locator('[data-testid=unit-release]').count() === 0 && await p.locator('[data-testid=unit-release-blocked]').count() === 1, `${name}: unit with open Critical ${u.wo} has no Release button (explains why)`)
    const r = await p.evaluate(id => window.__actions.releaseToService(id), u.id)
    const st = await p.evaluate(id => ({ s: window.__store.getState().db.equipment.find(e => e.id === id).status, open: window.__store.getState().db.workOrders.filter(w => w.unitId === id && w.status !== 'Closed').length }), u.id)
    ok(!r.ok && st.s === 'Out of Service' && st.open > 0, `${name}: store refuses too — unit stays Out of Service, WO stays open (${(r.reason || '').slice(0, 50)})`)
    await p.keyboard.press('Escape').catch(() => {}) } else ok(true, 'no critical WO in seed')
  // a Ready-for-Release WO: release asks first, Cancel changes nothing, Release closes only that WO
  const v = await p.evaluate(() => { const S = window.__store.getState(), db = S.db; const e = db.equipment.find(x => x.category === 'Crane' && x.status === 'Available' && !db.workOrders.some(w => w.unitId === x.id && w.status !== 'Closed')); const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    window.__store.setState(s => ({ db: { ...s.db, equipment: s.db.equipment.map(q => q.id === e.id ? { ...q, status: 'Maintenance' } : q) } }))
    window.__actions.createWO({ unitId: e.id, title: 'Replace cracked mirror bracket', complaint: 'QA', priority: 'Normal', status: 'Ready for Release', opened: t, due: t, parts: [], laborHrs: 1, laborRate: 0, source: 'Repair' })
    window.__actions.createWO({ unitId: e.id, title: 'Seat belt fraying', complaint: 'QA', priority: 'Low', status: 'Open', opened: t, due: t, parts: [], laborHrs: 0, laborRate: 0, source: 'Repair' })
    window.__store.getState().open({ type: 'equipment', id: e.id }); return e.id })
  await p.waitForTimeout(800); await p.locator('[data-testid=unit-release]').click(); await p.waitForTimeout(500)
  const dlg = await p.locator('[role=dialog], [role=alertdialog]').last().textContent().catch(() => '')
  ok(/will be closed/.test(dlg) && /Still open/.test(dlg), `${name}: Release asks first and names the WO it closes and the one that stays open`)
  await p.getByRole('button', { name: 'Cancel' }).last().click(); await p.waitForTimeout(400)
  ok(await p.evaluate(id => window.__store.getState().db.equipment.find(e => e.id === id).status, v) === 'Maintenance', `${name}: Cancel leaves the unit in Maintenance`)
  await p.locator('[data-testid=unit-release]').click(); await p.waitForTimeout(400); await p.getByRole('button', { name: 'Release to service' }).last().click(); await p.waitForTimeout(600)
  const after = await p.evaluate(id => { const db = window.__store.getState().db; return { s: db.equipment.find(e => e.id === id).status, open: db.workOrders.filter(w => w.unitId === id && w.status !== 'Closed').map(w => w.title) } }, v)
  ok(after.s === 'Available' && after.open.length === 1 && /Seat belt/.test(after.open[0]), `${name}: Release closes only the Ready WO; the open one stays open (${after.s})`)
  await p.keyboard.press('Escape').catch(() => {})
  // M14: no owner tour for a non-owner, and nothing turns the role into Owner
  await p.evaluate(() => { location.hash = '/settings' }); await p.waitForTimeout(700)
  ok(await p.locator('[data-testid=settings-tour]').count() === 0, `${name}: Shop has no "owner tour" button`)
  // M8: audit rows written by Owner (guest pass, SSN reveal) are not shown to Sales / Shop
  await as(p, 'owner'); await p.evaluate(() => { const s = window.__store.getState(); s.commit('Guest pass created', 'Dana Fictional · Acme Wind', 'expires soon', () => {}, { silent: true }); s.commit('Revealed sensitive field', 'Chad Weathers SSN', 'test', () => {}, { silent: true }) })
  for (const r of ['sales', 'shop']) { await as(p, r); await p.evaluate(() => { location.hash = '/settings' }); await p.waitForTimeout(600); await p.getByText('Security center', { exact: false }).first().click().catch(() => {}); await p.waitForTimeout(800)
    const t = await p.textContent('body'); ok(!/Dana Fictional|Revealed sensitive field/.test(t), `${name}: ${r} can't see the owner's guest-pass / SSN-reveal audit rows`) }
  ok(errs.length === 0, `${name}: no page errors ${errs.slice(0, 2).join(' | ')}`)
  await p.screenshot({ path: OUT + `sec-${name}.png` }); await c.close() }
// framing: another site can't frame the owner app (with or without ?as=owner); our own Phone + office page still can
{ const c = await cr.newContext(); const p = await c.newPage(); await p.setContent(`<iframe src="${B}?as=owner" width=900 height=700></iframe>`); await p.waitForTimeout(5000)
  const fr = p.frames().find(f => f.url().startsWith(B)); ok(fr && /inside another site/.test(await fr.textContent('body').catch(() => '')), 'owner app framed by another site with ?as=owner: refused')
  const q = await c.newPage(); await q.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); await q.goto(B + '?sync=1'); await q.waitForTimeout(8000)
  const ph = q.frames().find(f => /as=field/.test(f.url())); const pt = ph ? await ph.textContent('body').catch(() => '') : ''
  ok(ph && !/inside another site/.test(pt) && pt.length > 50, 'Phone + office demo (same-site frames) still works'); await c.close() }
await cr.close(); await wk.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0)
