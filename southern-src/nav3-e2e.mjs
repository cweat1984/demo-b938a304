// Block 3 navigation e2e: page filters survive back (WebKit iPhone 390 + Chromium 1920), forward nav starts fresh,
// side-by-side phone+office demo keeps its own back history. BASE=preview url.
import { webkit, chromium, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'; const out = '/workspace/southern-app/screenshots/nav3/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const pg = p => p.evaluate(() => window.__store.getState().ui.page)
const search = p => p.locator('main input.input').first()
async function filters(p, tag, back) {
  await p.evaluate(() => window.__store.getState().go('jobs')); await p.waitForTimeout(700)
  await search(p).fill('wind'); await p.waitForTimeout(300)
  await p.evaluate(() => window.__store.getState().go('time')); await p.waitForTimeout(700)
  await p.locator('main button', { hasText: 'Approved' }).first().click(); await p.waitForTimeout(300)
  const tabSel = async () => p.locator('main button[aria-pressed=true], main [role=tab][aria-selected=true], main button.bg-surface-3').allInnerTexts()
  const tabBefore = (await tabSel()).join('|')
  await p.evaluate(() => window.__store.getState().go('dispatch')); await p.waitForTimeout(700)
  await back(); await p.waitForTimeout(900); ok(await pg(p) === 'time', `${tag}: back → Time`)
  const tabAfter = (await tabSel()).join('|'); ok(tabAfter === tabBefore && /Approved/.test(tabAfter), `${tag}: Time tab kept after back (${tabAfter.slice(0, 40)})`)
  await back(); await p.waitForTimeout(900); ok(await pg(p) === 'jobs', `${tag}: back → Jobs`)
  ok(await search(p).inputValue() === 'wind', `${tag}: Jobs search text kept after back`)
  await p.screenshot({ path: `${out}${tag}-jobs-search-kept.png` })
  await p.evaluate(() => window.__store.getState().go('people')); await p.waitForTimeout(600)
  await p.evaluate(() => window.__store.getState().go('jobs')); await p.waitForTimeout(700)
  ok(await search(p).inputValue() === '', `${tag}: opening Jobs fresh from the menu starts with an empty search`)
}
const wk = await webkit.launch()
{ const ctx = await wk.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.tap('[data-role=owner]'); await p.waitForTimeout(1200)
  await filters(p, 'iphone390', () => p.goBack())
  // header back arrow keeps filters too
  await p.evaluate(() => window.__store.getState().go('jobs')); await p.waitForTimeout(600); await search(p).fill('crane'); await p.locator('[data-testid=tabbar] [data-tab=dispatch]').tap(); await p.waitForTimeout(800)
  await p.tap('[data-testid=page-back]'); await p.waitForTimeout(900); ok(await pg(p) === 'jobs' && await search(p).inputValue() === 'crane', 'iphone390: header back arrow keeps the Jobs search')
  // reload keeps them (same tab), sign out clears them
  await p.reload(); await p.waitForTimeout(1500); ok(await search(p).inputValue() === 'crane', 'iphone390: reload keeps the search')
  await p.evaluate(() => window.__store.getState().signOut()); await p.waitForTimeout(600); await p.tap('[data-role=owner]'); await p.waitForTimeout(1000)
  ok(await p.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('sc-keep')).length) === 0, 'iphone390: sign-out clears kept filters')
  await ctx.close() }
await wk.close()
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
{ const ctx = await cr.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => { localStorage.setItem('sc-tour-seen', '1'); localStorage.setItem('sc-present', '1') })
  await p.goto(base); await p.click('[data-role=owner]'); await p.waitForTimeout(1200)
  await filters(p, 'projector1920', () => p.goBack())
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), 'projector1920: no sideways scroll')
  // side-by-side demo: frames keep their own history
  await p.goto(base + '?sync=1'); await p.waitForTimeout(4500)
  const h0 = await p.evaluate(() => history.length)
  const office = p.frameLocator('[data-testid=sync-office]'); const of = p.frame({ url: /as=owner/ }); const ph = p.frame({ url: /as=field/ })
  ok(!!of && !!ph, 'side-by-side demo loads both frames')
  await of.evaluate(() => { window.__store.getState().go('jobs') }); await p.waitForTimeout(500); await of.evaluate(() => { window.__store.getState().go('people') }); await p.waitForTimeout(500)
  await of.evaluate(() => { const j = window.__store.getState().db.jobs[0]; window.__store.getState().open({ type: 'job', id: j.id }) }); await p.waitForTimeout(600)
  const tile = ph.locator('button', { hasText: 'Safety Sheets' }).first(); if (await tile.count()) { await tile.click(); await p.waitForTimeout(600) }
  ok(await p.evaluate(() => history.length) === h0, `side-by-side: clicking around in the phone/office frames adds no browser history (${h0} → ${await p.evaluate(() => history.length)})`)
  await of.evaluate(() => window.__store.getState().pageBack()); await p.waitForTimeout(600)
  ok(await of.evaluate(() => window.__store.getState().ui.page) === 'jobs', 'side-by-side: office back goes to its own previous page (Jobs)')
  await of.evaluate(() => window.__store.getState().pageBack()); await p.waitForTimeout(600)
  ok(await of.evaluate(() => window.__store.getState().ui.page) === 'dispatch', 'side-by-side: office back again → Dispatch (where it started)')
  ok(await p.locator('[data-testid=sync-demo]').count() === 1, 'side-by-side: outer demo page untouched')
  await p.screenshot({ path: out + 'projector1920-sync-demo.png' }); void office
  await ctx.close() }
await cr.close()
ok(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '))
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0)
