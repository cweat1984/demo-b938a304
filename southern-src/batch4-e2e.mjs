// Batch 4 e2e: maintenance & inspections, messaging & alerts, text ticket + ?sign, management dashboard, accounting sync.
import { chromium } from 'playwright'
import { writeFileSync } from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/batch4/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = [], fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const png = '/tmp/b4-photo.png'
writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'))
const RUN = String(Date.now())
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1.5 })
await ctx.addInitScript(run => { if (localStorage.getItem('b4-run') !== run) { localStorage.removeItem('sc-batch4'); localStorage.setItem('b4-run', run) } }, RUN)
const watch = (pg, tag) => { pg.on('pageerror', e => errors.push(tag + ' pageerror: ' + e.message)); pg.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(tag + ' console: ' + m.text()) }) }
const p = await ctx.newPage(); watch(p, 'office')
const shot = (n, pg = p) => pg.screenshot({ path: out + n + '.png' })
const go = async h => { await p.evaluate(x => { location.hash = '/' + x }, h); await p.waitForTimeout(800) }
await p.goto(base); await p.waitForSelector('[data-role=ops]', { timeout: 15000 }); await p.click('[data-role=ops]'); await p.waitForTimeout(900)
// 1) maintenance
await go('maint'); await p.waitForSelector('[data-testid=maint-page]'); await shot('01-maint-pm-rag')
ok(await p.locator('[data-testid=pm-row]').count() > 5, 'PM schedule rows')
const rag = await Promise.all(['red', 'amber', 'green'].map(r => p.textContent(`[data-testid=rag-${r}]`))); ok(rag.every(x => /\d/.test(x)), 'RAG counts ' + rag.join('/'))
await p.locator('[data-testid=insp-fail]').nth(1).click(); await p.fill('[data-testid=insp-note]', 'Hook latch spring broken'); await p.setInputFiles('[data-testid=insp-photo]', png)
await p.click('[data-testid=insp-allpass]'); await shot('02-inspection-defect'); await p.click('[data-testid=insp-submit]'); await p.waitForTimeout(500)
ok(await p.locator('[data-testid=insp-recent]', { hasText: 'WO-' }).count() > 0, 'defect → work order')
await p.locator('[data-testid=annual-cal]').scrollIntoViewIfNeeded(); await shot('03-annual-calendar')
await go('shop'); await p.waitForTimeout(500); ok(await p.locator('text=Daily inspection: Wire rope').count() + await p.locator('text=inspection:').count() > 0, 'work order visible in Shop'); await shot('04-shop-work-order')
// 2) messaging
await go('messages'); await p.waitForSelector('[data-testid=messages]'); await p.waitForTimeout(500)
ok(await p.locator('[data-testid=chat-item]').count() >= 3, 'project chats auto-created')
await p.locator('[data-testid=chat-item]').first().click(); await p.fill('[data-testid=msg-input]', 'Pad photo attached @Lo'); await p.waitForSelector('[data-testid=mention-sugg]'); await p.locator('[data-testid=mention-sugg]').first().click()
await p.type('[data-testid=msg-input]', 'please confirm the mats'); await p.setInputFiles('[data-testid=msg-photo]', png); await p.click('[data-testid=msg-send]'); await p.waitForTimeout(500)
ok(await p.locator('[data-testid=msg] img').count() > 0, 'photo message sent'); ok(await p.locator('text=mentioned Lori Haynes').count() > 0, '@mention push toast')
await shot('05-project-chat-mention')
await p.click('[data-testid=alert-test-wind]'); await p.waitForTimeout(400); ok(await p.locator('text=Wind over limit — Sweetwater T-14').count() > 0, 'wind alert push'); await shot('06-alert-rules-push')
await p.click('[data-testid=dm-new]'); await p.locator('[data-testid=dm-person]').nth(2).click(); await p.fill('[data-testid=msg-input]', 'Quick DM test'); await p.click('[data-testid=msg-send]'); await p.waitForTimeout(300); ok(await p.locator('[data-testid=msg]', { hasText: 'Quick DM test' }).count() > 0, 'DM sent'); await shot('07-dm')
await p.click('[data-testid=bell]'); await p.waitForTimeout(500); ok(await p.locator('text=Wind over limit — Sweetwater T-14').count() > 0, 'bell shows alert'); await shot('08-bell'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
// 3) text ticket
await go('tickets'); await p.waitForTimeout(400)
const pw = await ctx.newPage(); await pw.goto(base + '?portal=1'); await pw.click('[data-testid=portal-send]'); await pw.click('[data-testid=portal-magic]'); await pw.waitForSelector('[data-testid=portal-job]')
const pwJobs = (await pw.locator('[data-testid=portal-job]').allTextContents()).map(t => t.match(/#(\d+)/)?.[1]).filter(Boolean); await pw.close()
await p.bringToFront()
const tabs = ['Awaiting signature', 'To review']; let tid = null
// Root-cause fix for the old flake: pick an unsigned ticket that belongs to the portal customer (Plains Wind Partners) — never fall back to row 0,
// which could be another customer's ticket and then never shows in this customer's portal.
let picked = false
for (const tb of tabs) { if (picked) break; await p.locator('button', { hasText: tb }).first().click().catch(() => {}); await p.waitForTimeout(300)
  const rows = p.locator('.card.p-0 > button').filter({ hasText: 'Plains Wind Partners' }).filter({ hasText: 'Not signed' }); const rn = await rows.count()
  const rtx = await rows.allTextContents(); const order = [...Array(rn).keys()].filter(i => !pwJobs.length || pwJobs.some(j => rtx[i].includes(j))) // only tickets whose job shows in this customer's portal
  for (const i of order.slice(0, 6)) { if (picked) break; await rows.nth(i).click(); await p.waitForTimeout(400); if (await p.locator('[data-testid=text-ticket]').count()) picked = true; else await p.keyboard.press('Escape') } }
ok(picked, 'found an unsigned Plains Wind Partners ticket' + (pwJobs.length ? '' : ' (portal job list empty)'))
ok(await p.locator('[data-testid=text-ticket]').count() > 0, 'Text ticket button on unsigned ticket')
await p.click('[data-testid=text-ticket]'); await p.waitForSelector('[data-testid=sms-preview]'); const sms = await p.textContent('[data-testid=sms-preview]'); tid = (sms.includes('sign=') ? await p.getAttribute('[data-testid=sms-preview]', 'data-ticket') : null); ok(!!tid, 'SMS preview has signing link'); await shot('09-text-ticket-sms')
await p.click('[data-testid=tt-send]'); await p.waitForTimeout(300)
// The demo stores data per browser, so sign in the same browser profile (phone-sized tab) — a real deploy shares the backend.
const sp = await ctx.newPage(); watch(sp, 'sign'); await sp.setViewportSize({ width: 390, height: 844 })
await sp.goto(base + '?sign=' + tid); await sp.waitForSelector('[data-testid=sign-canvas]', { timeout: 15000 }).catch(async e => { console.log('TID', tid, (await sp.textContent('body')).slice(0, 200)); throw e }); await shot('10-sign-page', sp)
const b = await sp.locator('[data-testid=sign-canvas]').boundingBox(); await sp.mouse.move(b.x + 20, b.y + 80); await sp.mouse.down(); for (let i = 0; i < 14; i++) await sp.mouse.move(b.x + 30 + i * 20, b.y + 50 + (i % 2) * 50); await sp.mouse.up()
await sp.click('[data-testid=sign-go]'); await sp.waitForSelector('[data-testid=signed-image]', { timeout: 10000 }); ok(true, 'signed ticket image generated'); await sp.screenshot({ path: out + '11-signed-ticket-image.png', fullPage: true })
const pp = await ctx.newPage(); watch(pp, 'portal')
await pp.goto(base + '?portal=1'); await pp.click('[data-testid=portal-send]'); await pp.click('[data-testid=portal-magic]'); await pp.waitForSelector('[data-testid=portal-job]')
let seen = false; const jobs = pp.locator('[data-testid=portal-job]'); const n = await jobs.count()
for (let i = 0; i < n && !seen; i++) { await jobs.nth(i).click(); await pp.waitForSelector('[data-testid=portal-project]'); await pp.click('[data-testid=portal-sec-docs]'); await pp.waitForTimeout(500); if (await pp.locator('[data-testid=portal-signed-img]').count()) seen = true; else await pp.click('text=All projects') }
ok(seen, 'signed ticket image visible in portal')
if (seen) await shot('12-portal-signed-ticket', pp)
await p.reload(); await p.waitForTimeout(900); await go('audit'); await p.waitForTimeout(400); ok(await p.locator('text=Customer signed ticket').first().waitFor({ timeout: 8000 }).then(() => true, () => false), 'approval logged in audit'); await shot('13-audit-ticket-signed')
// 4) dashboard
await go('mgmt'); await p.waitForSelector('[data-testid=mgmt-dash]'); await p.waitForTimeout(500); await shot('14-mgmt-dashboard')
for (const k of ['moves', 'quotes', 'pickups', 'certs', 'exp', 'co', 'wind']) ok(await p.locator(`[data-testid=dash-${k}]`).count() === 1, 'dash tile ' + k)
await p.click('[data-testid=dash-certs]'); await p.waitForSelector('[data-testid=dash-detail]'); await shot('15-dash-drilldown'); await p.click('[data-testid=dash-go]'); await p.waitForTimeout(600); ok(await p.locator('[data-testid=cert-tracker]').waitFor({ timeout: 8000 }).then(() => true, () => false), 'tile navigates to page')
// 5) accounting sync
await go('acctsync'); await p.waitForSelector('[data-testid=acct-sync]'); await shot('16-acct-sync-disconnected')
await p.click('[data-testid=sync-run]'); await p.waitForTimeout(300); const failed1 = Number(await p.textContent('[data-testid=sync-Failed]')); ok(failed1 > 0, 'not connected → failed with reason')
await p.click('[data-testid=connect-qb]'); await p.click('[data-testid=connect-paychex]'); await p.waitForTimeout(1300)
await p.locator('[data-testid=sync-retry]').first().click(); await p.waitForTimeout(300); await p.click('[data-testid=sync-run]'); await p.waitForTimeout(300)
ok(Number(await p.textContent('[data-testid=sync-Failed]')) < failed1, 'retry after connect succeeds'); await shot('17-acct-sync-connected')
await p.locator('[data-testid=field-map]').scrollIntoViewIfNeeded(); await shot('18-field-mapping')
// phone inspection
const m2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }); const ip = await m2.newPage(); watch(ip, 'inspect')
await ip.goto(base + '?inspect=1'); await ip.waitForSelector('[data-testid=insp-form]', { timeout: 15000 }); await shot('19-phone-inspection', ip); await m2.close()
await browser.close()
const errs = [...new Set(errors)]
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors')
if (fails.length || errs.length) process.exit(1)
