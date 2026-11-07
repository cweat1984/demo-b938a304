import { chromium } from 'playwright'
const S = '/workspace/southern-app/screenshots/'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage()
m.on('pageerror', e => errs.push(e.message)); m.on('console', x => x.type() === 'error' && errs.push(x.text()))
await m.goto('http://localhost:4173/'); await m.click('[data-role=owner]'); await m.waitForTimeout(2500)
await m.screenshot({ path: S + 'mobile-command.png' })
const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
p.on('pageerror', e => errs.push(e.message)); p.on('console', x => x.type() === 'error' && errs.push(x.text()))
await p.goto('http://localhost:4173/'); await p.click('[data-role=owner]'); await p.waitForTimeout(1800)
const n = await p.locator('[data-testid=alert-fix]').count(); console.log('alert fix buttons', n)
if (n) { await p.locator('[data-testid=alert-fix]').first().click(); await p.waitForTimeout(500); await p.screenshot({ path: S + 'command-alert-fix.png' }); await p.keyboard.press('Escape') }
await p.evaluate(() => { const db = window.__sc.getState().db; const c = db.equipment.find(e => e.unit === '1200'); window.__sc.getState().open({ type: 'equipment', id: c.id }) }); await p.waitForTimeout(700)
await p.screenshot({ path: S + 'equipment-photo.png' })
console.log(errs.length ? errs : 'no errors'); await b.close()
