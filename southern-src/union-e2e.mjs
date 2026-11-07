// Union Locals e2e: IUOE locals list/search/counties/rates, job rate profiles, union-aware time entries with breakdown.
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4190/'
const out = '/workspace/southern-app/screenshots/union/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = [], fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5 })
await ctx.addInitScript(() => { if (!sessionStorage.getItem('u-run')) { localStorage.removeItem('sc-union'); sessionStorage.setItem('u-run', '1') } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()) })
const shot = n => p.screenshot({ path: out + n + '.png' })
const go = async h => { await p.evaluate(x => { location.hash = '/' + x }, h); await p.waitForTimeout(900) }
const has = (sel, t = 6000) => p.locator(sel).first().waitFor({ timeout: t }).then(() => true, () => false)
await p.goto(base); await p.waitForSelector('[data-role=ops]', { timeout: 20000 }); await p.click('[data-role=ops]'); await p.waitForTimeout(900)
await go('union'); ok(await has('[data-testid=union-page]'), 'union page opens')
await p.waitForSelector('[data-testid=union-local]', { timeout: 15000 })
ok(await p.locator('[data-testid=union-local]').count() >= 10, 'priority-state locals listed: ' + await p.locator('[data-testid=union-local]').count())
await p.fill('[data-testid=union-search]', '627'); await p.waitForTimeout(400); await p.locator('[data-testid=union-local]').first().click(); await p.waitForTimeout(500)
ok(await has('[data-testid=union-sheet]'), 'click a local → detail sheet opens')
ok(/Local 627/.test(await p.locator('[data-testid=union-sheet-title]').textContent()), 'sheet shows local number')
ok(await has('[data-testid=union-sheet-halls] a[href^="tel:"]'), 'sheet shows hall + tap-to-call phone')
ok(await p.locator('[data-testid=union-sheet-crane] a[href*="sam.gov"]').count() > 0, 'sheet crane rates with source links')
ok(await has('[data-testid=union-sheet-oiler]') && await has('[data-testid=union-sheet] >> text=/Verified|Unverified/'), 'sheet oiler table + verified badges')
ok(await has('[data-testid=union-sheet-counties] >> text=Oklahoma, OK'), 'sheet counties covered')
ok(/Our open jobs in its counties \(\d+\)/.test(await p.locator('[data-testid=union-sheet-jobs]').textContent()), 'sheet lists open jobs in its counties: ' + (await p.locator('[data-testid=union-sheet-jobs]').textContent()).slice(0, 50))
await shot('00-local-sheet'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
ok(await has('[data-testid=union-detail] >> text=Local 627'), 'Local 627 detail')
ok(await p.locator('[data-testid=union-rates] tr').count() > 5, 'Local 627 rate table with sources')
ok(await p.locator('[data-testid=union-rates] a[href*="sam.gov"]').count() > 0, 'rates link to SAM.gov WDs')
ok(await has('text=/statewide Oklahoma/i'), '627 statewide OK jurisdiction note'); await shot('01-local-627-rates')
await p.click('[data-testid=union-view] button:has-text("Counties")'); ok(await p.locator('[data-testid=union-counties] >> text=Oklahoma, OK').count() > 0, 'Oklahoma County in 627 list'); await shot('02-local-627-counties')
await p.fill('[data-testid=union-search]', 'Tarrant'); await p.waitForTimeout(400)
const tar = (await p.locator('[data-testid=union-local]').allTextContents()).join(' | '); ok(/Local 178/.test(tar), 'county search Tarrant → ' + tar.slice(0, 80)); await p.locator('[data-testid=union-local]').first().click(); await p.keyboard.press('Escape'); await shot('03-county-search-tarrant')
await p.selectOption('[data-testid=union-state]', 'ALL'); await p.fill('[data-testid=union-search]', '302'); await p.waitForTimeout(400); await p.locator('[data-testid=union-local]').first().click(); await p.keyboard.press('Escape'); await p.waitForTimeout(400)
ok(await has('[data-testid=union-cba] >> text=2024-06-01'), 'Local 302 CBA terms (verified)'); await shot('04-local-302-cba')
// time tab: find a job worked
await p.click('button:has-text("Union time")'); await p.waitForSelector('[data-testid=ut-row]', { timeout: 10000 })
ok(await p.locator('[data-testid=ut-row] >> text=/Local \\d+/').count() > 0, 'time entries auto-assigned to a local')
await shot('05-union-time-before')
const rowTxt = await p.locator('[data-testid=ut-row]').filter({ hasText: /#\d{5}/ }).first().textContent()
const jobNo = rowTxt.match(/#(\d{5})/)[1]; const empVal = await p.inputValue('[data-testid=ut-emp]')
const totBefore = await p.locator('[data-testid=ut-row]').filter({ hasText: '#' + jobNo }).first().locator('.num.font-semibold').textContent()
// profile for that job
await p.click('button:has-text("Job rate profiles")'); await p.waitForSelector('[data-testid=rp-job]')
const opt = await p.locator('[data-testid=rp-job] option', { hasText: '#' + jobNo }).first().getAttribute('value').catch(() => null)
ok(!!opt, 'job #' + jobNo + ' available for profile')
if (opt) {
  await p.selectOption('[data-testid=rp-job]', opt); await p.waitForTimeout(300)
  await p.fill('[data-testid=rp-name]', 'Refinery shutdown package'); await p.fill('[data-testid=rp-base]', '58'); await p.fill('[data-testid=rp-night]', '61'); await p.fill('[data-testid=rp-otMult]', '1.5')
  await p.fill('[data-testid=rp-travelRate]', '30'); await p.fill('[data-testid=rp-travelHrs]', '1'); await p.fill('[data-testid=rp-perDiem]', '75'); await p.fill('[data-testid=rp-subsistence]', '20'); await p.fill('[data-testid=rp-showUp]', '120')
  await p.click('[data-testid=rp-addline]'); await shot('06-rate-profile-editor'); await p.click('[data-testid=rp-save]'); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=rp-active]').count() === 1, 'profile saved')
}
await p.click('button:has-text("Union time")'); await p.waitForSelector('[data-testid=ut-row]'); await p.selectOption('[data-testid=ut-emp]', empVal); await p.waitForTimeout(400)
const onJob = p.locator('[data-testid=ut-row]').filter({ hasText: '#' + jobNo }).first()
ok(/Job profile: Refinery shutdown package/.test(await onJob.textContent()), 'profile applies on that job automatically')
ok(await onJob.locator('.num.font-semibold').textContent() !== totBefore, 'pay changed on that job')
const off = p.locator('[data-testid=ut-row]').filter({ hasNotText: '#' + jobNo })
const offN = await off.count(); ok(offN === 0 || !/Job profile: Refinery/.test(await off.first().textContent()), 'other jobs unaffected — no manual change back (' + offN + ' other rows)')
await shot('07-union-time-after-profile')
await onJob.click(); ok(await has('[data-testid=ut-breakdown] >> text=Per diem (set rate)'), 'breakdown shows per diem set rate')
ok(await has('[data-testid=ut-breakdown] >> text=$58.00'), 'breakdown shows max(assigned, scale, profile) = $58')
await shot('08-pay-breakdown'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
if (offN) { await off.first().click(); await p.waitForTimeout(300); ok(await has('[data-testid=ut-breakdown] >> text=/Local \\d+ scale|Employee assigned rate|Company default/'), 'off-job entry uses local/assigned rule'); await shot('09-breakdown-other-job'); await p.keyboard.press('Escape') }
// mobile
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500); await shot('10-mobile-union-time')
{ // per-turbine county → local (wind farm across a county line)
  const wc = await browser.newContext({ viewport: { width: 1440, height: 950 } }); const w = await wc.newPage(); w.on('pageerror', e => errors.push('pageerror: ' + e.message))
  await w.goto(base); await w.waitForSelector('[data-role=owner]', { timeout: 20000 }); await w.click('[data-role=owner]'); await w.waitForTimeout(800)
  await w.evaluate(() => window.__store.getState().open({ type: 'windfarm', id: 'TX-horse-hollow-ii' })); await w.waitForSelector('[data-testid=farm-detail]', { timeout: 15000 })
  await w.waitForSelector('[data-testid=farm-spans]', { timeout: 15000 }).catch(() => {})
  const spans = await w.locator('[data-testid=farm-spans]').textContent().catch(() => ''); ok(/Spans 2 counties · 2 locals/.test(spans), 'Horse Hollow II badge: ' + spans)
  ok(/Nolan Co\./.test(await w.textContent('[data-testid=farm-union]')) && /Taylor Co\./.test(await w.textContent('[data-testid=farm-union]')), 'farm view lists both counties with their local')
  for (const t of ['T-75', 'T-76']) { await w.fill('[data-testid=turbine-find]', t); await w.press('[data-testid=turbine-find]', 'Enter') } await w.waitForTimeout(400)
  const rows = await w.locator('[data-testid=turbine-county]').allTextContents(); ok(rows.length === 2 && rows[0] !== rows[1], 'turbine detail: neighbours across the line get different counties: ' + rows.join(' / '))
  ok(await w.locator('[data-testid=turbine-union-row] >> text=IUOE Local').count() === 1 && await w.locator('[data-testid=turbine-union-row] >> text=No local').count() === 1, 'turbine detail: one side Local, other side no local')
  ok(/Co\. · (Local \d+|no local)/.test(await w.locator('.leaflet-tooltip').allTextContents().then(a => a.join(' '))), 'turbine pin labels show county + local')
  await w.screenshot({ path: out + '10-turbine-split.png' })
  const before = rows[0], other = rows[1].split(' Co.')[0]
  await w.locator('[data-testid=turbine-county-edit]').first().click(); await w.selectOption('[data-testid=turbine-county-pick]', other).catch(() => {}); await w.fill('[data-testid=turbine-county-why]', 'Pad surveyed across the line'); await w.click('[data-testid=turbine-county-save]'); await w.waitForTimeout(400)
  ok((await w.locator('[data-testid=turbine-county]').first().textContent()).startsWith(other) && await w.locator('[data-testid=turbine-union-row] >> text=Admin override').count() === 1, 'admin override changes the turbine county')
  ok(/Turbine county overridden/.test(await w.locator('[data-testid=turbine-county-audit]').first().textContent().catch(() => '')) && await w.evaluate(() => window.__store.getState().db.audit.some(a => a.action === 'Turbine county overridden')), 'override is audit-logged'); await w.screenshot({ path: out + '11-turbine-override.png' })
  await w.click('[data-testid=turbine-county-reset]'); await w.waitForTimeout(300); ok((await w.locator('[data-testid=turbine-county]').first().textContent()) === before, 'reset back to Census boundary')
  // pay: a time entry tied to a turbine uses that turbine's county/local
  await w.evaluate(() => { location.hash = '/union' }); await w.waitForSelector('[data-testid=union-page]'); await w.click('[data-testid=union-page] button:has-text("Time")').catch(() => {}); await w.waitForTimeout(600)
  const emps = await w.locator('[data-testid=ut-emp] option').evaluateAll(o => o.map(x => x.value)); let found = false
  for (const v of emps) { await w.selectOption('[data-testid=ut-emp]', v); await w.waitForTimeout(150); if (await w.locator('[data-testid=ut-turbine]').count()) { found = true; break } }
  ok(found, 'time entries tied to turbines carry the turbine county')
  if (found) { await w.locator('[data-testid=ut-row]').filter({ has: w.locator('[data-testid=ut-turbine]') }).first().click(); await w.waitForTimeout(300)
    const why = await w.textContent('[data-testid=ut-breakdown]'); ok(/Turbine T-\d+, \w+ Co\., (Local \d+|no local)/.test(why), 'pay breakdown: ' + (why.match(/Turbine T-\d+, [^—]+/) || [''])[0]); await w.screenshot({ path: out + '12-turbine-pay.png' }) }
  await wc.close() }
{ const ph = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const q = await ph.newPage()
  await q.goto(base); await q.waitForSelector('[data-role=ops]', { timeout: 20000 }); await q.click('[data-role=ops]'); await q.waitForTimeout(900); await q.evaluate(() => { location.hash = '/union' }); await q.waitForSelector('[data-testid=union-mode]', { timeout: 15000 }); await q.click('[data-testid=union-mode] button:has-text("List")'); await q.waitForSelector('[data-testid=union-local]', { timeout: 15000 })
  await q.fill('[data-testid=union-search]', '627'); await q.waitForTimeout(400); await q.locator('[data-testid=union-local]').first().tap(); await q.waitForTimeout(600)
  ok(await q.locator('[data-testid=union-sheet]').first().isVisible().catch(() => false), 'phone: tapping a local opens the detail sheet'); await q.screenshot({ path: out + '00-phone-sheet.png' })
  const bb = await q.locator('[data-testid=union-sheet]').boundingBox(); ok(!!bb && bb.width <= 390, 'phone: sheet fits viewport'); await ph.close() }
ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''))
await browser.close(); console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0)
