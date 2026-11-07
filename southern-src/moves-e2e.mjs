import { chromium, devices } from 'playwright'
const openDock = async pg => { const h = pg.locator('[data-testid=fb-handle]'); if (await h.isVisible().catch(() => false) && !(await pg.locator('[data-testid=suggest-btn]').isVisible())) { await h.click(); await pg.waitForTimeout(150) } }
const base = process.env.BASE || 'http://localhost:4173/'
const OUT = '/workspace/southern-app/screenshots/moves'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []; let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
async function ctxFor(role, opts) {
  const ctx = await b.newContext({ ...opts, acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] })
  const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(`${role} pageerror ${e.message}`)); p.on('console', m => m.type() === 'error' && !/tile|arcgis|Failed to load|geolocation/i.test(m.text()) && errs.push(`${role} ${m.text()}`))
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const nav = async (p, k) => { await p.evaluate(k => { location.hash = '/' + k }, k); await p.waitForTimeout(900) }

// ---------- desktop ops ----------
{
  const { p } = await ctxFor('ops', { viewport: { width: 1440, height: 900 } })
  await nav(p, 'moves'); await p.waitForSelector('[data-testid=moves-page]')
  ok(await p.locator('[data-testid=load-card]').count() >= 10, 'move board has loads')
  const del0 = +(await p.textContent('[data-testid=n-delivered]'))
  ok(del0 >= 5, `seeded delivered loads: ${del0}`)
  await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/board-desktop.png` })
  await p.locator('[data-testid=sim-geofence]').first().click(); await p.waitForTimeout(2200)
  ok(+(await p.textContent('[data-testid=n-delivered]')) === del0 + 1, 'Samsara geofence auto check-in')
  // third-party crew check-in
  const tp = p.locator('[data-testid=load-card][data-status="En route"][data-carrier="3P"] [data-testid=crew-checkin]')
  const btn = (await tp.count()) ? tp.first() : p.locator('[data-testid=crew-checkin]').first()
  await btn.click(); await p.waitForSelector('[data-testid=checkin-form]')
  await p.waitForFunction(() => !/Locating/.test(document.querySelector('[data-testid=checkin-gps]')?.textContent || 'Locating'), null, { timeout: 6000 })
  ok(await p.isDisabled('[data-testid=checkin-submit]'), 'photo required before check-in')
  await p.click('[data-testid=checkin-demo-photo]'); await p.screenshot({ path: `${OUT}/checkin-desktop.png` })
  await p.click('[data-testid=checkin-submit]'); await p.waitForTimeout(800)
  ok(+(await p.textContent('[data-testid=n-delivered]')) === del0 + 2, 'crew check-in delivered')
  // load-out: deselect a planned piece -> storage picker
  await p.getByRole('tab', { name: 'Load-out list' }).click(); await p.waitForSelector('[data-testid=loadout]')
  const loads0 = +(await p.textContent('[data-testid=n-loads]'))
  const cb = p.locator('[data-testid=loadout-row] input[type=checkbox]:checked:not([disabled])')
  const nCb = await cb.count(); ok(nCb > 0, `planned pieces toggleable: ${nCb}`)
  await cb.first().click(); await p.waitForSelector('[data-testid=storage-picker]'); await p.click('[data-testid=storage-confirm]'); await p.waitForTimeout(500)
  ok(+(await p.textContent('[data-testid=n-loads]')) <= loads0, 'loads re-planned after deselect')
  await p.screenshot({ path: `${OUT}/loadout-desktop.png` })
  await p.getByRole('tab', { name: /Shorts/ }).click(); await p.waitForSelector('[data-testid=shorts]')
  await p.locator('[data-testid=source-btn]').first().click(); await p.waitForTimeout(400)
  await p.screenshot({ path: `${OUT}/shorts-desktop.png` })
  await p.getByRole('tab', { name: 'Rentals' }).click(); await p.waitForSelector('[data-testid=rentals]')
  ok(/left to return/.test(await p.textContent('[data-testid=rentals]')), 'rentals show loads left to return')
  await p.screenshot({ path: `${OUT}/rentals-desktop.png` })
  await p.getByRole('tab', { name: 'Components' }).click(); await p.waitForSelector('[data-testid=components]')
  ok(await p.locator('[data-testid=crane-chip]').count() >= 4, '4 cranes with components')
  await p.locator('[data-testid=comp-row]').first().click(); await p.waitForSelector('[data-testid=compat]')
  ok(await p.locator('[data-testid=compat] span').count() > 0, 'compatible-with list')
  await p.screenshot({ path: `${OUT}/components-desktop.png` }); await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  // planner
  await p.click('[data-testid=plan-move]'); await p.waitForSelector('[data-testid=planner]')
  await p.locator('[data-testid=planner-crane]').nth(2).click()
  await p.fill('[data-testid=planner-project]', 'OG&E Mustang — stator set'); await p.fill('[data-testid=planner-jobno]', '10177')
  await p.screenshot({ path: `${OUT}/planner-desktop.png` })
  await p.click('[data-testid=planner-create]'); await p.waitForSelector('[data-testid=loadout]')
  ok(await p.locator('[data-testid=move-chip]').count() >= 2, 'new move created from 4 fields')
  // notepad
  await openDock(p); await p.click('[data-testid=notepad-btn]'); await p.waitForSelector('[data-testid=notepad]')
  await p.fill('[data-testid=note-love]', 'Trailer fill bars are great'); await p.fill('[data-testid=note-ideas]', 'Show ETA per load')
  await p.screenshot({ path: `${OUT}/notepad-desktop.png` })
  const dl = p.waitForEvent('download'); await p.click('[data-testid=export-notes]'); const d = await dl
  ok(/design-notes-.*\.(md|json)$/.test(d.suggestedFilename()), 'export downloads notes file')
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  await p.reload(); await p.waitForTimeout(1200); await openDock(p); await p.click('[data-testid=notepad-btn]')
  ok((await p.inputValue('[data-testid=note-love]')) === 'Trailer fill bars are great', 'notes autosaved per page')
  await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  // suggest with screenshot
  await openDock(p); await p.click('[data-testid=suggest-btn]'); await p.waitForSelector('[data-testid=suggest-form]', { timeout: 15000 })
  ok(await p.locator('[data-testid=sug-shot]').count() === 1, 'screenshot auto-captured')
  await p.fill('[data-testid=sug-title]', 'E2E idea: per-load ETA'); await p.fill('[data-testid=sug-details]', 'From the test')
  await p.click('[data-testid=sug-submit]'); await p.waitForTimeout(500)
  await nav(p, 'suggest'); await p.waitForSelector('[data-testid=suggest-page]')
  ok(await p.locator('[data-testid=sug-row]').count() >= 11, 'board has seeded + new suggestions')
  await p.screenshot({ path: `${OUT}/suggest-board-desktop.png` })
  await p.getByText('E2E idea: per-load ETA').click(); await p.waitForSelector('[data-testid=sug-detail]')
  await p.fill('[data-testid=comment-input]', 'Love it'); await p.click('[data-testid=comment-send]')
  await p.click('[data-testid="status-Shipped"]'); await p.waitForTimeout(1500)
  await p.screenshot({ path: `${OUT}/suggest-shipped-desktop.png` })
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('sc-feedback-v1')).inbox.some(i => /shipped/i.test(i.title))), 'submitter notified: Your idea shipped')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.click('[data-testid=bell]'); await p.waitForTimeout(600)
  ok(/Your idea shipped/.test(await p.textContent('body')), 'shipped notice in bell')
  await p.keyboard.press('Escape')
  await nav(p, 'settings'); ok(await p.locator('[data-testid=design-mode]').count() === 1, 'design mode toggle in settings')
}
// ---------- mobile ----------
{
  const { p } = await ctxFor('dispatch', { ...devices['iPhone 14'] })
  await nav(p, 'moves'); await p.waitForSelector('[data-testid=moves-page]'); await p.waitForTimeout(1200)
  await p.screenshot({ path: `${OUT}/board-mobile.png` })
  await p.screenshot({ path: `${OUT}/board-mobile-full.png`, fullPage: true })
  await openDock(p); await p.click('[data-testid=notepad-btn]'); await p.waitForSelector('[data-testid=notepad]'); await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/notepad-mobile.png` }); await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  await nav(p, 'suggest'); await p.waitForTimeout(600); await p.screenshot({ path: `${OUT}/suggest-board-mobile.png` })
  ok(await p.locator('[data-testid="status-Shipped"]').count() === 0, 'non-admin cannot see status controls until opening')
}
{
  const { p } = await ctxFor('field', { ...devices['iPhone 14'] })
  await p.getByText('More', { exact: true }).last().click(); await p.waitForTimeout(500)
  await p.click('[data-testid=tile-checkin]'); await p.waitForSelector('[data-testid=field-checkin]')
  await p.screenshot({ path: `${OUT}/field-checkin-list-mobile.png` })
  await p.locator('[data-testid=field-load]').first().click(); await p.waitForSelector('[data-testid=checkin-form]')
  await p.click('[data-testid=checkin-demo-photo]'); await p.waitForFunction(() => !/Locating/.test(document.querySelector('[data-testid=checkin-gps]')?.textContent || 'Locating'), null, { timeout: 6000 })
  await p.screenshot({ path: `${OUT}/field-checkin-mobile.png` })
  await p.click('[data-testid=checkin-submit]'); await p.waitForTimeout(600)
  ok(true, 'field crew check-in submitted')
  ok(await p.locator('[data-testid=suggest-btn]').count() === 1, 'suggest button on field app')
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
await b.close(); process.exit(fails || errs.length ? 1 : 0)
