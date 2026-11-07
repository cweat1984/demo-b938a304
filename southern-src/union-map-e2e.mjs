// Union coverage map + My union history e2e. Desktop 1920 (Chrome) and iPhone 390 (WebKit). BASE=http://localhost:4291/
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4291/'
const out = '/workspace/southern-app/screenshots/unionmap/'; fs.mkdirSync(out, { recursive: true })
const errors = [], fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const watch = (p, tag) => { p.on('pageerror', e => errors.push(`${tag} pageerror: ${e.message}`)); p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource|favicon/i.test(m.text())) errors.push(`${tag} console: ${m.text()}`) }) }
const has = (p, sel, t = 8000) => p.locator(sel).first().waitFor({ timeout: t }).then(() => true, () => false)
const go = async (p, h) => { await p.evaluate(x => { location.hash = '/' + x }, h); await p.waitForTimeout(900) }
const init = () => { if (!sessionStorage.getItem('um-run')) { localStorage.removeItem('sc-union-notes'); sessionStorage.setItem('um-run', '1') } localStorage.setItem('sc-tour-seen', '1') }
const center = async (p, sel) => { const b = await p.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }

// ---------------- Desktop 1920 ----------------
{
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
  const ctx = await br.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true }); await ctx.addInitScript(init)
  const p = await ctx.newPage(); watch(p, 'desk')
  await p.goto(base); await p.waitForSelector('[data-role=ops]', { timeout: 30000 }); await p.click('[data-role=ops]'); await p.waitForTimeout(900)
  await go(p, 'union'); ok(await has(p, '[data-testid=union-map] svg path[data-c]', 20000), 'Union Locals opens on the map by default')
  ok(await p.locator('[data-testid=union-map] path[data-c]').count() > 1000, 'counties drawn: ' + await p.locator('[data-testid=union-map] path[data-c]').count())
  ok(/Local 627/.test(await p.textContent('[data-testid=union-detail]')), 'default local is 627 (not the Colorado local with no rates)')
  ok(await p.locator('[data-testid=union-detail] [data-testid=union-rates] tr').count() > 5, 'default detail has 627 rates')
  const leg = (await p.locator('[data-testid=union-legend-item]').allTextContents()).join(' | ')
  ok(/Local 627/.test(leg) && /Local 178/.test(leg) && /Local 450/.test(leg), 'legend lists 627 / 178 / 450')
  ok(await has(p, '[data-testid=union-map-legend] >> text=No IUOE local on file'), 'legend shows no-local hatch')
  await p.screenshot({ path: out + 'desk-01-map-default.png' })
  // hover Oklahoma County (pins off so the county itself is under the cursor)
  await p.click('[data-testid=union-pins-branch]'); await p.click('[data-testid=union-pins-job]'); await p.waitForTimeout(200)
  const okc = await center(p, 'path[data-c="40109"]'); await p.mouse.move(okc.x, okc.y); await p.waitForTimeout(250)
  const tip = await p.textContent('[data-testid=union-map-tip]').catch(() => ''); ok(/Oklahoma Co\., OK/.test(tip) && /Local 627/.test(tip), 'hover tooltip: ' + tip)
  await p.screenshot({ path: out + 'desk-02-hover.png' })
  await p.mouse.click(okc.x, okc.y); ok(await has(p, '[data-testid=union-sheet]'), 'click county → local sheet opens')
  ok(/Local 627/.test(await p.textContent('[data-testid=union-sheet-title]')), 'sheet is Local 627')
  ok(await has(p, '[data-testid=union-contact] >> text=Michael L. Stark Jr.'), 'contact: business manager (verified) shown')
  ok(await p.locator('[data-testid=union-contact-hall]').count() >= 2 && await has(p, '[data-testid=union-contact] >> text=9412 N Robinson Ave'), 'contact: Tulsa + OKC halls with addresses')
  ok(await p.locator('[data-testid=union-sheet-halls] a[href^="tel:"]').count() >= 2, 'tap-to-call hall phones')
  ok(await p.locator('[data-testid=union-payscale] a[href*="sam.gov"]').count() > 0, 'pay scale by classification with WD source links')
  ok(await has(p, '[data-testid=union-fringes] >> text=/total fringe/'), 'fringe totals with WD')
  ok(await p.locator('[data-testid=union-rules] >> text=Get from the hall\'s agreement').count() >= 6, 'unsourced rules say "Get from the hall\'s agreement"')
  await p.locator('[data-testid=union-sheet]').evaluate(el => el.closest('[class*=overflow]')?.scrollBy(0, 99999)); await p.screenshot({ path: out + 'desk-03-sheet-627.png' })
  await p.click('[data-testid=union-rule-dispatch-note]'); await p.fill('[data-testid=union-rule-dispatch-note-input]', 'Call the OKC hall by 2pm for next-day dispatch (per Garner)'); await p.click('[data-testid=union-rule-dispatch-note-save]'); await p.waitForTimeout(300)
  ok(/Call the OKC hall/.test(await p.evaluate(() => localStorage.getItem('sc-union-notes') ?? '')), 'admin rule note saved to localStorage')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  // state filter TX
  await p.selectOption('[data-testid=union-map-state]', 'TX'); await p.waitForTimeout(500)
  const legTx = (await p.locator('[data-testid=union-legend-item]').allTextContents()).join(' | '); ok(/Local 178/.test(legTx) && /Local 450/.test(legTx) && !/Local 627/.test(legTx), 'TX filter legend: ' + legTx.slice(0, 120))
  const mid = await center(p, 'path[data-c="48003"]'); await p.mouse.click(mid.x, mid.y); await p.waitForTimeout(300)
  ok(/Andrews County, TX/.test(await p.textContent('[data-testid=union-map-info]')) && /No IUOE local on file/.test(await p.textContent('[data-testid=union-map-info]')), 'Andrews County (West TX) shows no local on file — honest gap')
  await p.click('[data-testid=union-pins-branch]'); await p.click('[data-testid=union-pins-job]');
  await p.click('[data-testid=union-pins-wind]'); await p.waitForTimeout(800)
  ok(await p.locator('[data-pin^=branch]').count() === 3, 'branch pins: OKC, Midland, Kilgore')
  { await p.selectOption('[data-testid=union-map-state]', 'OK'); await p.waitForTimeout(400); const pb = await p.locator('[data-pin="branchbr-okc"]').boundingBox(), cb = await p.locator('path[data-c="40109"]').boundingBox(); const cx = pb.x + pb.width / 2, cy = pb.y + pb.height / 2
    ok(cx >= cb.x - 4 && cx <= cb.x + cb.width + 4 && cy >= cb.y - 4 && cy <= cb.y + cb.height + 4, 'OKC HQ pin sits on Oklahoma County (projection matches)'); await p.screenshot({ path: out + 'desk-04b-ok-pins.png' }); await p.selectOption('[data-testid=union-map-state]', 'TX'); await p.waitForTimeout(400) }
  ok(await p.locator('[data-pin^=job]').count() > 0, 'active job pins: ' + await p.locator('[data-pin^=job]').count())
  ok(await p.locator('[data-pin^=wind]').count() > 20, 'wind farm pins (TX): ' + await p.locator('[data-pin^=wind]').count())
  await p.screenshot({ path: out + 'desk-04-tx-pins.png' })
  const vb0 = await p.getAttribute('[data-testid=union-map] svg', 'viewBox'); await p.click('[data-testid=union-map-zoomin]'); await p.waitForTimeout(200)
  ok(vb0 !== await p.getAttribute('[data-testid=union-map] svg', 'viewBox'), 'zoom in button zooms')
  const c = await center(p, '[data-testid=union-map] svg'); await p.mouse.move(c.x, c.y); await p.mouse.wheel(0, -400); await p.waitForTimeout(200)
  await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 120, c.y + 60, { steps: 6 }); await p.mouse.up(); ok(!(await has(p, '[data-testid=union-sheet]', 500)), 'drag pans without opening a sheet')
  await p.screenshot({ path: out + 'desk-05-zoomed.png' })
  // legend → sheet
  await p.locator('[data-testid=union-legend-item]', { hasText: 'Local 178' }).click(); ok(await has(p, '[data-testid=union-contact] >> text=Robert Teran'), 'legend → Local 178 sheet with verified business manager'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  // list toggle
  await p.click('[data-testid=union-mode] button:has-text("List")'); ok(await has(p, '[data-testid=union-local]') && await p.locator('[data-testid=union-map] path[data-c]').count() === 0, 'List toggle shows the list'); await p.click('[data-testid=union-mode] button:has-text("Map")'); ok(await has(p, '[data-testid=union-map] path[data-c]'), 'Map toggle back')
  // persistence after reload
  await p.reload(); await p.waitForTimeout(1500); await go(p, 'union'); await p.waitForSelector('[data-testid=union-map] path[data-c]', { timeout: 15000 })
  await p.locator('[data-testid=union-legend-item]', { hasText: 'Local 627' }).click(); ok(await has(p, '[data-testid=union-rule-dispatch-note] >> text=Call the OKC hall'), 'rule note persists after reload'); await p.keyboard.press('Escape')
  // search aliases
  for (const [q, want] of [['union map', 'Union'], ['local map', 'Union'], ['hall', 'Union'], ['fringe', 'Union'], ['my union hours', 'My Info'], ['pension', 'My Info'], ['annuity', 'My Info']]) {
    await p.click('[data-testid=ask]'); await p.waitForTimeout(250); await p.keyboard.type(q); await p.waitForTimeout(350)
    const t = await p.locator('[data-testid=cmd-pages]').textContent().catch(() => ''); ok(t.includes(want), `search "${q}" → ${want}`); await p.keyboard.press('Escape'); await p.waitForTimeout(200)
  }
  // My union history (Chad)
  await go(p, 'myinfo'); ok(await has(p, '[data-testid=union-history]', 15000), 'My Info shows My union history')
  ok(/DEMO DATA/.test(await p.textContent('[data-testid=uh-demo-note]')), 'demo data clearly labelled')
  ok(await p.locator('[data-testid=uh-year]').count() >= 1 && await p.locator('[data-testid=uh-local]').count() >= 1, 'chart years + per-local rows: ' + await p.locator('[data-testid=uh-year]').count() + ' yrs')
  ok(/Local 627/.test(await p.locator('[data-testid=uh-local]').first().textContent()), 'Chad: Local 627 has the most hours')
  const tot = await p.textContent('[data-testid=uh-totals]'); ok(/Fringe credited\s*\$[\d,]+/.test(tot), 'totals include fringe credited: ' + tot.slice(0, 140))
  await p.locator('[data-testid=union-history]').scrollIntoViewIfNeeded(); await p.screenshot({ path: out + 'desk-06-my-union-history.png', fullPage: false })
  await p.locator('[data-testid=uh-local]').first().click(); ok(await has(p, '[data-testid=uh-drill]'), 'per-local drill-down opens'); ok(await p.locator('[data-testid=uh-drill] [data-testid=uh-jobs] tr').count() > 1, 'drill-down lists jobs for the year')
  await p.screenshot({ path: out + 'desk-07-drill-627.png' }); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=uh-csv]')]); const csvPath = out + 'union-history-chad.csv'; await dl.saveAs(csvPath)
  const csv = fs.readFileSync(csvPath, 'utf8'); ok(csv.split('\n').length > 3 && /DEMO \(generated\)/.test(csv) && /fringe_credited/.test(csv), 'CSV export: ' + (csv.split('\n').length - 1) + ' rows')
  const [pop] = await Promise.all([p.waitForEvent('popup'), p.click('[data-testid=uh-print]')]); await pop.waitForLoadState(); ok(/Union history — Chad Weathers/.test(await pop.textContent('h1')), 'printable PDF view opens'); await pop.screenshot({ path: out + 'desk-08-print.png' }); await pop.close()
  // office view from employee record
  const emp = await p.evaluate(() => { const db = window.__store.getState().db; const e = db.employees.filter(x => x.craft === 'Operator' && /627/.test(x.local ?? '')).sort((a, b) => a.hireDate.localeCompare(b.hireDate))[0]; return e?.id })
  await p.evaluate(id => window.__store.getState().open({ type: 'employee', id }), emp); ok(await has(p, '[data-testid=emp-union-history]'), 'employee record has Union history (ops)')
  await p.click('[data-testid=emp-union-history]'); ok(await has(p, '[data-testid=union-history]'), 'office can open any employee history'); await p.waitForTimeout(500); ok(await p.locator('[role=dialog] [data-testid=uh-year], [data-testid=union-history] [data-testid=uh-year]').count() >= 3, 'long-tenured 627 operator: multi-year demo history back to hire date (' + await p.locator('[data-testid=uh-year]').count() + ' yrs)'); await p.screenshot({ path: out + 'desk-09-employee-record-history.png' })
  // projector-ish: nothing overflows
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await go(p, 'union'); await p.waitForTimeout(600); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '1920: no horizontal overflow')
  // guest never sees it
  const g = await br.newContext({ viewport: { width: 1920, height: 1080 } }); const gp = await g.newPage(); watch(gp, 'guest'); await gp.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await gp.goto(base); await gp.waitForSelector('[data-role=ops]', { timeout: 30000 }); await gp.evaluate(() => window.__store.getState().signIn('guest')); await gp.waitForTimeout(800)
  await go(gp, 'myinfo'); ok(await gp.locator('[data-testid=union-history]').count() === 0, 'guest: no union history on My Info')
  await gp.evaluate(id => window.__store.getState().open({ type: 'employee', id }), emp); await gp.waitForTimeout(800); ok(await gp.locator('[data-testid=emp-union-history]').count() === 0, 'guest: no Union history button on employee record')
  await br.close()
}

// ---------------- iPhone 390 WebKit ----------------
{
  const wk = await webkit.launch(); const ctx = await wk.newContext({ ...devices['iPhone 14'] }); await ctx.addInitScript(init)
  const p = await ctx.newPage(); watch(p, 'iphone')
  await p.goto(base); await p.waitForSelector('[data-role=ops]', { timeout: 30000 }); await p.click('[data-role=ops]'); await p.waitForTimeout(1200)
  await go(p, 'union'); ok(await has(p, '[data-testid=union-map] path[data-c]', 20000), 'iPhone: map is the default view')
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'iPhone: page fits 390 wide')
  ok(await p.evaluate(() => getComputedStyle(document.querySelector('[data-testid=union-map] svg')).touchAction === 'none'), 'iPhone: map owns touch gestures (pinch/pan)')
  const mb = await p.locator('[data-testid=union-map]').boundingBox(); ok(mb.width >= 330 && mb.height >= 300, `iPhone: map size ${Math.round(mb.width)}×${Math.round(mb.height)}`)
  await p.screenshot({ path: out + 'iphone-01-map.png' })
  // simulated pinch (two pointers) zooms
  const vb0 = await p.getAttribute('[data-testid=union-map] svg', 'viewBox')
  await p.evaluate(() => { const s = document.querySelector('[data-testid=union-map] svg'), r = s.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const ev = (t, id, x, y) => s.dispatchEvent(new PointerEvent(t, { pointerId: id, clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: id === 1 }))
    ev('pointerdown', 1, cx - 20, cy); ev('pointerdown', 2, cx + 20, cy); for (let i = 1; i <= 6; i++) { ev('pointermove', 1, cx - 20 - i * 15, cy); ev('pointermove', 2, cx + 20 + i * 15, cy) } ev('pointerup', 2, cx + 110, cy); ev('pointerup', 1, cx - 110, cy) })
  await p.waitForTimeout(300); const vb1 = await p.getAttribute('[data-testid=union-map] svg', 'viewBox')
  ok(Number(vb1.split(' ')[2]) < Number(vb0.split(' ')[2]) * 0.6, `iPhone: pinch zooms in (${vb0.split(' ')[2]} → ${Math.round(vb1.split(' ')[2])})`)
  await p.click('[data-testid=union-map-reset]'); await p.waitForTimeout(200)
  // tap county → info card → sheet
  await p.evaluate(() => document.querySelector('[data-testid=union-map]').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300); await p.click('[data-testid=union-pins-job]'); await p.waitForTimeout(200)
  await p.screenshot({ path: out + 'iphone-01b-map-in-view.png' })
  await p.evaluate(() => document.querySelector('[data-testid=union-map] path[data-c="40109"]').scrollIntoView({ block: 'center' })); await p.waitForTimeout(300) // keep the county clear of the bottom tab bar
  const okc = await center(p, 'path[data-c="40109"]'); await p.touchscreen.tap(okc.x, okc.y); await p.waitForTimeout(400)
  ok(/Oklahoma County, OK/.test(await p.textContent('[data-testid=union-map-info]').catch(() => '')), 'iPhone: tap county shows county + local')
  await p.screenshot({ path: out + 'iphone-02-tap-county.png' })
  await p.click('[data-testid=union-map-open]'); ok(await has(p, '[data-testid=union-sheet]'), 'iPhone: open local sheet from map'); await p.waitForTimeout(400)
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'iPhone: sheet fits')
  await p.screenshot({ path: out + 'iphone-03-sheet.png' })
  await p.locator('[data-testid=union-rules]').scrollIntoViewIfNeeded(); await p.screenshot({ path: out + 'iphone-04-sheet-rules.png' })
  const fs16 = await p.evaluate(() => { document.querySelector('[data-testid=union-rule-ot-note]')?.click(); return true }); void fs16; await p.waitForTimeout(200)
  const inFont = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid=union-rule-ot-note-input]')).fontSize)); ok(inFont >= 16, 'iPhone: note inputs ≥16px (no Safari zoom-on-focus): ' + inFont)
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await go(p, 'myinfo'); ok(await has(p, '[data-testid=union-history]', 15000), 'iPhone: My union history in My Info')
  await p.locator('[data-testid=union-history]').scrollIntoViewIfNeeded(); ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'iPhone: history fits 390')
  await p.screenshot({ path: out + 'iphone-05-my-union-history.png' })
  await p.locator('[data-testid=uh-local-card]').first().click(); ok(await has(p, '[data-testid=uh-drill]'), 'iPhone: drill-down'); await p.screenshot({ path: out + 'iphone-06-drill.png' })
  await ctx.close()
  // field employee sees own history only; no access to others
  const fc = await wk.newContext({ ...devices['iPhone 14'] }); await fc.addInitScript(init); const f = await fc.newPage(); watch(f, 'field')
  await f.goto(base); await f.waitForSelector('[data-role=field]', { timeout: 30000 }); await f.click('[data-role=field]'); await f.waitForTimeout(1200)
  await f.locator('nav button:has-text("More")').last().click(); await f.waitForTimeout(500); await f.click('[data-testid=tile-union]'); const fh = await has(f, '[data-testid=union-history]', 10000)
  const fname = fh ? await f.textContent('[data-testid=union-history]') : ''; ok(fh && /My union history/.test(fname) && /DEMO DATA/.test(fname), 'field employee: More → My union hours shows own history'); await f.screenshot({ path: out + 'iphone-07-field-my-union-hours.png' }); await f.keyboard.press('Escape'); await f.waitForTimeout(300)
  const other = await f.evaluate(() => window.__store.getState().db.employees.find(x => x.first !== 'John')?.id); await f.evaluate(id => window.__store.getState().open({ type: 'employee', id }), other); await f.waitForTimeout(600)
  ok(await f.locator('[data-testid=emp-union-history]').count() === 0, 'field employee cannot open others\' union history')
  
  await wk.close()
}
console.log('\nerrors:', errors.length ? errors.slice(0, 10) : 'none')
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED'); process.exit(fails.length || errors.length ? 1 : 0)
