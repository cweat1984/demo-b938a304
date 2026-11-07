// Launch-2 e2e: customer portal, new hire onboarding, Southern Store, expenses. BASE env overrides the port.
import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/launch2/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] })
const errors = [], fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const png = '/tmp/l2-receipt.png'
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
async function page(vp = { width: 1440, height: 950 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.5, isMobile: mobile, hasTouch: mobile })
  await ctx.addInitScript(() => { if (!sessionStorage.getItem('l2-init')) { localStorage.removeItem('sc-launch2'); sessionStorage.setItem('l2-init', '1') } })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push('pageerror: ' + e.message))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()) })
  return { p, ctx }
}
const shot = (p, n) => p.screenshot({ path: out + n + '.png' })
// 1) Customer portal
{ const { p, ctx } = await page()
  await p.goto(base); await p.waitForSelector('[data-testid=portal-link]', { timeout: 15000 }); await shot(p, '00-login-previews')
  await p.click('[data-testid=portal-link]'); await p.waitForSelector('[data-testid=portal-signin]'); await shot(p, '01-portal-signin')
  await p.click('[data-testid=portal-send]'); await p.waitForSelector('[data-testid=portal-magic]'); await shot(p, '02-portal-magic-link')
  await p.click('[data-testid=portal-magic]'); await p.waitForSelector('[data-testid=portal]')
  const n = await p.locator('[data-testid=portal-job]').count(); ok(n > 0, `portal lists ${n} projects`)
  const custOnly = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('southern-db') || 'null'); return db }) ; void custOnly
  await p.waitForTimeout(600); await shot(p, '03-portal-projects')
  // pick a project with tickets
  const jobs = p.locator('[data-testid=portal-job]'); let picked = false
  for (let i = 0; i < n && !picked; i++) { await jobs.nth(i).click(); await p.waitForSelector('[data-testid=portal-project]'); if (await p.locator('[data-testid=portal-day]').count()) picked = true; else await p.click('text=All projects') }
  ok(picked, 'project with daily history found')
  await shot(p, '04-portal-daily-history')
  if (await p.locator('[data-testid=portal-approve]').count()) { await p.locator('[data-testid=portal-approve]').first().click(); ok(await p.locator('text=You approved').count() > 0, 'approve ticket') }
  if (await p.locator('[data-testid=portal-dispute]').count()) { await p.locator('[data-testid=portal-dispute]').first().click(); await p.fill('[data-testid=portal-reason]', 'Hours show 10, crew left at 3 PM.'); await p.click('[data-testid=portal-dispute-send]'); ok(await p.locator('text=Disputed').count() > 0, 'dispute ticket') }
  await shot(p, '05-portal-approve-dispute')
  await p.click('[data-testid=portal-sec-docs]'); await p.waitForTimeout(300); await shot(p, '06-portal-docs-certs')
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }).catch(() => null), p.click('[data-testid=portal-certs]')]); ok(!!dl, 'cert packet downloads')
  await p.click('[data-testid=portal-sec-recon]'); await shot(p, '07-portal-recon')
  await p.click('[data-testid=portal-sec-photos]'); await shot(p, '08-portal-photos')
  await p.click('[data-testid=portal-tab-digest]'); await p.waitForSelector('[data-testid=portal-digest]'); await shot(p, '09-portal-digest')
  await ctx.close() }
{ const { p, ctx } = await page({ width: 390, height: 844 }, true)
  await p.goto(base + '?portal=1'); await p.click('[data-testid=portal-send]'); await p.click('[data-testid=portal-magic]'); await p.waitForSelector('[data-testid=portal-job]'); await shot(p, '10-portal-mobile'); await ctx.close() }
// 2) HR onboarding + new-hire flow
{ const { p, ctx } = await page()
  await p.goto(base); await p.waitForSelector('[data-role=hr]'); await p.click('[data-role=hr]'); await p.waitForTimeout(800)
  await p.evaluate(() => { location.hash = '/onboarding' }); await p.waitForSelector('[data-testid=onboarding]'); await p.waitForTimeout(400); await shot(p, '11-hr-onboarding-tracker')
  await p.click('[data-testid=hire-new]'); await p.fill('[data-testid=nh-first]', 'Tyler'); await p.fill('[data-testid=nh-last]', 'Grant'); await p.fill('[data-testid=nh-personalEmail]', 'tyler.grant@mail.example'); await p.fill('[data-testid=nh-phone]', '(405) 555-0188')
  await p.click('[data-testid=nh-save]'); await p.waitForSelector('[data-testid=welcome-email]'); ok(await p.locator('text=tyler.grant@slh-demo.example').count() > 0, 'welcome email shows work email'); await shot(p, '12-welcome-email')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  ok(await p.locator('[data-testid=hire-row]').count() >= 4, 'new hire appears in tracker')
  await ctx.close() }
{ const { p, ctx } = await page({ width: 390, height: 844 }, true)
  await p.goto(base + '?welcome=nh-2'); await p.waitForSelector('[data-testid=welcome-start]', { timeout: 15000 }); await p.waitForTimeout(2800); await shot(p, '13-newhire-cinematic')
  await p.click('[data-testid=welcome-start]'); await p.waitForTimeout(500); await shot(p, '14-newhire-story')
  for (let i = 0; i < 5; i++) { await p.click('[data-testid=story-next]'); await p.waitForTimeout(350); if (i === 4 - 1) await shot(p, '15-newhire-story-flag') }
  const names = ['personal', 'w4', 'deposit', 'i9', 'handbook', 'emergency', 'badge', 'ids', 'training', 'benefits', 'gear']
  for (const nm of names) {
    await p.waitForTimeout(250)
    if (nm === 'w4') ok(await p.locator('[data-testid=paychex-badge]').count() > 0, 'Paychex handoff badge')
    if (nm === 'badge') { await p.setInputFiles('[data-testid=upload-badge]', png); await p.waitForTimeout(300); ok(await p.locator('[data-testid=id-badge] img').count() > 0, 'badge live preview'); await shot(p, '17-newhire-badge') }
    if (nm === 'ids') { await p.setInputFiles('[data-testid=upload-idFront]', png); await p.waitForTimeout(200) }
    if (nm === 'training') { await p.locator('[data-testid=upload-training]').first().setInputFiles(png); await p.waitForTimeout(200); await shot(p, '18-newhire-training') }
    if (nm === 'benefits') await shot(p, '19-newhire-benefits')
    if (nm === 'gear') { for (const g of ['vest', 'fr', 'gloves', 'hardhat']) await p.locator(`[data-testid=size-${g}]`).first().click(); await shot(p, '20-newhire-gear-temp') }
    if (nm === 'personal') await shot(p, '16-newhire-paperwork')
    if (nm === 'personal') { await p.click('[data-testid=flow-next]'); ok(await p.locator('[data-testid=flow-error]').count() > 0, 'paperwork: missing address blocks Continue'); await p.fill('[data-field="Home address"]', '100 Demo St, Oklahoma City, OK 73101'); await p.fill('[data-field="Personal phone"]', '(405) 555-0100'); await p.fill('[data-field="Personal email"]', 'newhire@example.com') }
    if (nm === 'deposit') { await p.fill('[data-field="Routing number"]', '12345'); await p.click('[data-testid=flow-next]'); ok(await p.locator('[data-testid=flow-error]').count() > 0, 'paperwork: bad routing blocks'); await p.fill('[data-field="Routing number"]', '000000000'); await p.fill('[data-field="Account number"]', '00001234') }
    if (nm === 'handbook') await p.fill('[data-field="Type your full name to sign"]', 'Demo Hire')
    if (nm === 'emergency') { await p.fill('[data-field="Contact 1 — name & relation"]', 'Demo Contact, spouse'); await p.fill('[data-field="Phone"]', '4055550101') }
    await p.click('[data-testid=flow-next]')
  }
  await p.waitForSelector('[data-testid=welcome-done]'); await p.waitForTimeout(1500); await shot(p, '21-newhire-celebration'); ok(true, 'celebration screen')
  await ctx.close() }
// 3) Store + 4) Expenses (as Ops/Chad and owner)
{ const { p, ctx } = await page()
  await p.goto(base); await p.waitForSelector('[data-role=owner]'); await p.click('[data-role=owner]'); await p.waitForTimeout(800)
  await p.evaluate(() => { location.hash = '/store' }); await p.waitForSelector('[data-testid=store]'); await p.waitForTimeout(400); await shot(p, '22-store')
  const before = await p.textContent('[data-testid=credit-balance]')
  await p.locator('[data-testid=store-item]').first().click(); await p.waitForTimeout(400); await shot(p, '23-store-item'); await p.click('[data-testid=store-add]')
  await p.waitForTimeout(400); await p.click('[data-testid=store-checkout]'); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=store-order]').count() > 0 && before !== await p.textContent('[data-testid=credit-balance]'), 'order placed, credits deducted')
  await p.locator('text=Overstock & Sale').scrollIntoViewIfNeeded(); await shot(p, '24-store-overstock')
  await p.click('[data-testid=store-rules]'); await p.waitForSelector('[data-testid=credit-rules]'); ok(await p.locator('[data-testid=rule-amount]').first().inputValue() === '', 'credit amounts empty by default'); await shot(p, '25-store-credit-rules')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.evaluate(() => { location.hash = '/expenses' }); await p.waitForSelector('[data-testid=expenses]'); await p.waitForTimeout(600); await p.click('text=Everything'); await p.waitForTimeout(300); await shot(p, '26-expenses')
  const rules = await p.locator('[data-testid=exp-why]').allTextContents(); ok(rules.some(r => /Rule 1/.test(r)) && rules.some(r => /Rule 2/.test(r)) && rules.some(r => /Rule 3/.test(r)), 'rules 1-3 matched: ' + rules.join(' | '))
  await p.locator('[data-testid=exp-why]').first().click(); await p.waitForSelector('[data-testid=exp-explain]'); await shot(p, '27-expense-explain'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.setInputFiles('[data-testid=exp-file]', png); await p.waitForSelector('[data-testid=exp-scan-save]', { timeout: 5000 }); await shot(p, '28-expense-receipt-read'); await p.click('[data-testid=exp-scan-save]')
  await p.click('[data-testid=exp-perdiem]'); await p.click('[data-testid=exp-mileage]')
  await p.click('[data-testid=exp-submit]'); await p.waitForTimeout(300); await p.click('[data-testid=exp-approve-all]'); await p.waitForTimeout(300); await p.click('[data-testid=exp-qb]'); await p.waitForTimeout(500)
  ok(await p.locator('text=In QuickBooks').count() > 0, 'pushed to QuickBooks'); await shot(p, '29-expenses-quickbooks')
  await ctx.close() }
await browser.close()
const errs = [...new Set(errors)]
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors')
if (fails.length || errs.length) process.exit(1)
