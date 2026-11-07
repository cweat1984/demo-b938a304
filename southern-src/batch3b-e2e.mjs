// Batch 3b e2e: site recon → hazard PDF → portal; change orders + portal signature; cert tracker; site data capture.
import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/batch3b/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = [], fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const png = '/tmp/b3-photo.png'
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5, acceptDownloads: true })
const RUN = String(Date.now())
await ctx.addInitScript(run => { if (localStorage.getItem('b3-run') !== run) { localStorage.removeItem('sc-batch3b'); localStorage.setItem('b3-run', run) } }, RUN)
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror: ' + e.message))
p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()) })
const shot = n => p.screenshot({ path: out + n + '.png' })
const go = async h => { await p.evaluate(x => { location.hash = '/' + x }, h); await p.waitForTimeout(700) }
await p.goto(base); await p.waitForSelector('[data-role=ops]', { timeout: 15000 }); await p.click('[data-role=ops]'); await p.waitForTimeout(900)
// 1) recon
await go('recon'); await p.waitForSelector('[data-testid=recon-form]'); await shot('01-recon-form')
await p.setInputFiles('[data-testid=recon-photo]', [png, png])
await p.click('[data-testid=recon-save]'); await p.waitForSelector('[data-testid=recon-hazard]')
ok(await p.locator('[data-testid=recon-hazard]').count() >= 4, 'recon derived hazards'); ok(await p.locator('[data-testid=recon-required]').count() >= 3, 'recon derived required items (mats, spotter, energized plan…)')
await shot('02-recon-review')
await p.click('[data-testid=recon-add-items]'); await p.waitForTimeout(300); ok(await p.locator('text=On project').count() >= 3, 'required items added to project')
ok(await p.locator('[data-testid=recon-similar]').count() === 1, 'similar past jobs card'); await p.locator('[data-testid=recon-similar]').scrollIntoViewIfNeeded(); await shot('03-recon-required-similar')
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 15000 }).catch(() => null), p.click('[data-testid=recon-pdf]')]); ok(!!dl, 'hazard report PDF downloads')
if (dl) await dl.saveAs(out + 'hazard-report.pdf')
await p.click('[data-testid=recon-approve]'); await p.waitForTimeout(300); ok(await p.locator('text=Approved · in customer portal').count() > 0, 'recon approved'); await shot('04-recon-approved')
// 2) change orders
await go('changeorders'); await p.waitForSelector('[data-testid=co-page]'); await p.click('[data-testid=co-new]'); await p.waitForSelector('[data-testid=co-impact]')
await p.fill('[data-testid=co-extraDays]', '3'); await p.waitForTimeout(200)
const impact = await p.textContent('[data-testid=co-impact]'); ok(/\+\$[\d,]+/.test(impact) && /stays 3 more days|Crew stays 3/.test(impact), 'auto cost + schedule impact: ' + impact.slice(0, 160))
await shot('05-co-new-impact'); await p.click('[data-testid=co-create]'); await p.waitForTimeout(400)
ok(await p.locator('[data-testid=co-row]').count() >= 2, 'change order created'); await shot('06-co-list')
await p.locator('[data-testid=co-audit]').first().click(); await p.waitForSelector('[data-testid=co-audit-list]'); await shot('07-co-audit'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
// 3) cert tracker
await go('certtracker'); await p.waitForSelector('[data-testid=cert-calendar]'); await shot('08-cert-tracker')
const hit = p.locator('[data-testid=cal-day-hit]'); for (let i = 0; i < 3 && !(await hit.count()); i++) { await p.click('[data-testid=cal-next]'); await p.waitForTimeout(150) }
if (await hit.count()) { await hit.first().click(); await p.waitForTimeout(200) }
ok(await p.locator('[data-testid=cert-soon]').count() > 0, 'expiring certs listed'); await p.locator('[data-testid=cert-remind]').first().click(); ok(await p.locator('text=Reminded').count() > 0, 'reminder sent')
await shot('09-cert-calendar-reminders')
await p.locator('[data-testid=who-current]').scrollIntoViewIfNeeded(); ok(await p.locator('[data-testid=wc-row]').count() > 0, "who's current lists crew"); await shot('10-who-is-current')
// 4) site data
await go('sitedata'); await p.waitForSelector('[data-testid=site-form]'); const before = await p.locator('[data-testid=site-note]').count()
await p.locator('[data-testid=sf-field]').nth(0).fill('T-22'); await p.locator('[data-testid=sf-field]').nth(1).fill('Vestas V110'); await p.locator('[data-testid=sf-field]').nth(2).fill('Firm gravel, crane side west')
await p.click('[data-testid=sf-save]'); await p.waitForTimeout(300); ok(await p.locator('[data-testid=site-note]').count() === before + 1, 'site note saved'); await shot('11-site-library')
// site memory on future job card at the same site
await go('jobs'); await p.waitForTimeout(400)

// 5) portal: approved hazard report + sign CO
const pp = await ctx.newPage(); pp.on('pageerror', e => errors.push('portal pageerror: ' + e.message))
await pp.goto(base + '?portal=1'); await pp.click('[data-testid=portal-send]'); await pp.click('[data-testid=portal-magic]'); await pp.waitForSelector('[data-testid=portal-job]')
// open the project the recon was for
const name = await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('sc-batch3b')).state; return s.recons[0].jobId })
let found = false; const jobs = pp.locator('[data-testid=portal-job]'); const n = await jobs.count()
for (let i = 0; i < n && !found; i++) { await jobs.nth(i).click(); await pp.waitForSelector('[data-testid=portal-project]'); await pp.click('[data-testid=portal-sec-recon]'); await pp.waitForTimeout(200); if (await pp.locator('[data-testid=portal-fix]').count()) found = true; else await pp.click('text=All projects') }
ok(found, 'approved hazard report visible in portal (job ' + name + ')'); await pp.screenshot({ path: out + '12-portal-hazard-report.png' })
await pp.click('[data-testid=portal-sec-co]'); await pp.waitForSelector('[data-testid=portal-co]'); await pp.locator('[data-testid=portal-co-sign]').first().click()
const box = await pp.locator('[data-testid=sign-pad]').boundingBox(); await pp.mouse.move(box.x + 30, box.y + 70); await pp.mouse.down(); for (let i = 0; i < 12; i++) await pp.mouse.move(box.x + 40 + i * 25, box.y + 40 + (i % 2) * 40); await pp.mouse.up()
await pp.screenshot({ path: out + '13-portal-co-signing.png' }); await pp.click('[data-testid=sign-submit]'); await pp.waitForTimeout(400)
ok(await pp.locator('text=Signed by Rick Dawson').count() > 0, 'customer signed change order'); await pp.screenshot({ path: out + '14-portal-co-signed.png' })
// audit shows the signature
await p.reload(); await p.waitForTimeout(800); await go('changeorders'); const signedRow = p.locator('[data-testid=co-row]', { hasText: 'Signed by Rick Dawson' }); ok(await signedRow.first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'office sees signed CO')
await signedRow.first().locator('[data-testid=co-audit]').click(); await p.waitForSelector('[data-testid=co-audit-list]'); ok(await p.locator('text=Customer signed in portal').count() > 0, 'audit trail records signature'); await shot('15-co-audit-signed'); await p.keyboard.press('Escape')
// 6) phone screens
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); const mp = await m.newPage(); mp.on('pageerror', e => errors.push('phone pageerror: ' + e.message))
await mp.goto(base + '?recon=1'); await mp.waitForSelector('[data-testid=recon-form]', { timeout: 15000 }); await mp.screenshot({ path: out + '16-phone-recon.png' })
await mp.goto(base + '?sitedata=1'); await mp.waitForSelector('[data-testid=site-form]'); await mp.screenshot({ path: out + '17-phone-site-notes.png', fullPage: true })
await m.close()
await browser.close()
const errs = [...new Set(errors)]
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors')
if (fails.length || errs.length) process.exit(1)
