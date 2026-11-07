// Round 2 navigation e2e (WebKit iPhone 390 + Chromium 1920): back arrow + iOS/browser back via history, scroll restore,
// fewer-tap shortcuts, more everyday words. BASE=preview url.
import { webkit, chromium, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'; const out = process.env.OUT || '/tmp/sc-e2e/nav2/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const pg = p => p.evaluate(() => window.__store.getState().ui.page); const drawer = p => p.evaluate(() => window.__store.getState().ui.drawer)
const dlg = p => p.locator('[role=dialog]').count()
const wk = await webkit.launch()
{ const ctx = await wk.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.tap('[data-role=owner]'); await p.waitForTimeout(1200)
  ok(await p.locator('[data-testid=page-back]').count() === 0, 'home shows the menu button, not a back arrow')
  await p.locator('[data-testid=tabbar] [data-tab=jobs]').tap(); await p.waitForTimeout(900); ok(await pg(p) === 'jobs', 'tab → Jobs')
  ok(await p.locator('[data-testid=page-back]').isVisible(), 'sub-page shows a back arrow in the header')
  await p.evaluate(() => window.scrollTo(0, 700)); await p.waitForTimeout(200); const y0 = await p.evaluate(() => scrollY)
  await p.locator('[data-testid=tabbar] [data-tab=dispatch]').tap(); await p.waitForTimeout(900); ok(await pg(p) === 'dispatch', 'tab → Dispatch')
  await p.goBack(); await p.waitForTimeout(900); ok(await pg(p) === 'jobs', 'browser/iOS back → Jobs again')
  const y1 = await p.evaluate(() => scrollY); ok(Math.abs(y1 - y0) < 60, `scroll position restored (${y0} → ${y1})`)
  // record drawer: back closes it, nested record back returns to the first one
  await p.evaluate(() => { const j = window.__store.getState().db.jobs[0]; window.__store.getState().open({ type: 'job', id: j.id }) }); await p.waitForTimeout(700)
  ok(await dlg(p) > 0 && await p.locator('[data-testid=sheet-back]').isVisible(), 'record opens with a back arrow')
  await p.screenshot({ path: out + 'iphone390-record-back-arrow.png' })
  const first = await drawer(p)
  await p.evaluate(() => { const e = window.__store.getState().db.employees[0]; window.__store.getState().open({ type: 'employee', id: e.id }) }); await p.waitForTimeout(600)
  ok((await drawer(p)).type === 'employee', 'drill into a person from the job')
  await p.tap('[data-testid=sheet-back]'); await p.waitForTimeout(600); ok(JSON.stringify(await drawer(p)) === JSON.stringify(first), 'header back arrow returns to the job')
  await p.evaluate(() => { const e = window.__store.getState().db.employees[0]; window.__store.getState().open({ type: 'employee', id: e.id }) }); await p.waitForTimeout(600)
  await p.goBack(); await p.waitForTimeout(700); ok(JSON.stringify(await drawer(p)) === JSON.stringify(first), 'swipe-back (history) returns to the job too')
  await p.goBack(); await p.waitForTimeout(700); ok(!(await drawer(p)) && await pg(p) === 'jobs', 'back again closes the record, still on Jobs')
  // More sheet: back closes it without leaving the page
  await p.tap('[data-testid=more-btn]'); await p.waitForSelector('[data-testid=more-page]'); await p.goBack(); await p.waitForTimeout(700)
  ok(await p.locator('[data-testid=more-page]').count() === 0 && await pg(p) === 'jobs', 'back closes the More page, stays on Jobs')
  // close with X → no dead back press
  await p.tap('[data-testid=more-btn]'); await p.waitForSelector('[data-testid=more-page]'); await p.locator('[aria-label=Close]').last().tap(); await p.waitForTimeout(700)
  await p.goBack(); await p.waitForTimeout(900); ok(await pg(p) === 'dispatch' || await pg(p) === 'command', 'after closing with X, one back press goes to the previous page (no dead press): ' + await pg(p))
  // header back arrow
  await p.locator('[data-testid=tabbar] [data-tab=jobs]').tap(); await p.waitForTimeout(700); await p.tap('[data-testid=page-back]'); await p.waitForTimeout(800); ok(await pg(p) !== 'jobs', 'header back arrow goes to the previous page')
  await ctx.close() }
// fewer taps: home shortcuts per role (1 tap), field sheets close with back, glossary + new everyday words
{ const ctx = await wk.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  const taps = []
  for (const [role, page, label] of [['owner', 'time', 'Approve time'], ['owner', 'receivables', 'Money owed'], ['accounting', 'payables', 'Bills to code'], ['payroll', 'pto', 'Time off'], ['dispatch', 'tickets', 'Field tickets'], ['shop', 'requests', 'Parts requests']]) {
    await p.goto(base); await p.waitForTimeout(400); await p.evaluate(() => window.__store.getState().signOut?.()); await p.waitForSelector(`[data-role=${role}]`); await p.tap(`[data-role=${role}]`); await p.waitForTimeout(900)
    await p.locator(`[data-testid=shortcuts] [data-shortcut=${page}]`).tap(); await p.waitForTimeout(600); const at = await pg(p); ok(at === page, `${role}: “${label}” is 1 tap from home (→ ${at})`); taps.push(`${role} · ${label}: 1 tap`)
    if (role === 'owner' && page === 'time') { await p.goBack(); await p.waitForTimeout(700); await p.screenshot({ path: out + 'iphone390-owner-home-shortcuts.png' }) }
  }
  // field hand: big tiles open sheets with a back arrow; back closes them
  await p.goto(base); await p.waitForTimeout(400); await p.evaluate(() => window.__store.getState().signOut?.()); await p.tap('[data-role=field]'); await p.waitForTimeout(1200)
  const tile = p.locator('button', { hasText: 'Safety Sheets' }).first(); await tile.tap(); await p.waitForTimeout(600)
  ok(await p.locator('[data-testid=fsheet-back]').isVisible(), 'field app: sheets have a back arrow'); await p.screenshot({ path: out + 'iphone390-field-sheet-back.png' })
  await p.goBack(); await p.waitForTimeout(700); ok(await p.locator('[data-testid=fsheet-back]').count() === 0 && await p.locator('[data-role=owner]').count() === 0, 'field app: swipe-back closes the sheet, stays in the app')
  // search: glossary + new everyday words
  await p.goto(base); await p.waitForTimeout(400); await p.evaluate(() => window.__store.getState().signOut?.()); await p.tap('[data-role=owner]'); await p.waitForTimeout(900); await p.tap('[data-testid=more-btn]'); await p.waitForSelector('[data-testid=more-page]')
  await p.fill('[data-testid=more-search]', 'ifta'); await p.waitForTimeout(300); ok(/Fuel Tax/.test(await p.locator('[data-testid=more-define]').textContent().catch(() => '')), 'search explains jargon: “IFTA means…”'); await p.screenshot({ path: out + 'iphone390-more-define-ifta.png' })
  for (const [q, k] of [['payday', 'time'], ['direct deposit', 'time'], ['who owes us', 'receivables'], ['pre trip', 'maint'], ['lowboy', 'equipment'], ['pilot car', 'permits'], ['hotel', 'expenses'], ['wex', 'mycards'], ['osha 30', 'certtracker'], ['ppe', 'safety'], ['mats', 'lifts'], ['coi', 'vault'], ['red tag', 'shop'], ['bigger text', 'settings']]) {
    await p.fill('[data-testid=more-search]', q); await p.waitForTimeout(220); const r = await p.locator('[data-testid=more-item]').evaluateAll(xs => xs.map(x => x.dataset.key)); ok(r.slice(0, 3).includes(k), `new word “${q}” → ${k} (top: ${r.slice(0, 3).join(', ')})`) }
  console.log('TAP COUNTS\n  ' + taps.join('\n  '))
  await ctx.close() }
await wk.close()
// projector 1920: shortcuts visible, no phone back arrow, jargon tooltips, empty state
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
{ const ctx = await cr.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => { localStorage.setItem('sc-tour-seen', '1'); localStorage.setItem('sc-present', JSON.stringify({ state: { on: true }, version: 0 })) })
  await p.goto(base); await p.click('[data-role=owner]'); await p.waitForTimeout(1000)
  ok(await p.locator('[data-testid=shortcuts] button').count() === 4 && !(await p.locator('[data-testid=page-back]').isVisible().catch(() => false)), 'projector: 4 shortcuts on home, no phone back arrow')
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'projector: no sideways scroll'); await p.screenshot({ path: out + 'projector1920-home-shortcuts.png' })
  await p.evaluate(() => { location.hash = '/fuel' }); await p.waitForTimeout(800); ok(/Fuel Tax/.test(await p.locator('aside [data-nav=fuel]').getAttribute('title') ?? ''), 'sidebar tooltip explains IFTA')
  await p.evaluate(() => { location.hash = '/audit' }); await p.waitForTimeout(800); await p.fill('main input', 'zzqqxx'); await p.waitForTimeout(300); ok(await p.locator('[data-testid=audit-empty]').isVisible(), 'Audit log search shows a helpful empty state')
  await p.keyboard.press('Control+k'); await p.fill('[data-testid=ask-input]', 'NPT'); await p.waitForTimeout(400); ok(await p.locator('[data-testid=cmd-define]').isVisible(), 'quick search explains NPT')
  await ctx.close() }
await cr.close()
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''))
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0)
