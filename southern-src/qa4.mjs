import { chromium } from 'playwright'
const S = '/workspace/southern-app/screenshots/'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []
const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage()
m.on('pageerror', e => errs.push(e.message)); m.on('console', x => x.type() === 'error' && errs.push(x.text()))
await m.goto('http://localhost:4173/'); await m.click('[data-role=owner]'); await m.waitForTimeout(1200)
for (const pg of ['quotes', 'lifts', 'vault', 'windfarms', 'payables', 'people', 'audit', 'integrations', 'tickets']) {
  await m.evaluate(x => { location.hash = '/' + x }, pg); await m.waitForTimeout(900)
  const w = await m.evaluate(() => document.documentElement.scrollWidth)
  console.log(pg, w)
  if (['quotes', 'lifts', 'vault', 'windfarms'].includes(pg)) await m.screenshot({ path: S + `mobile-${pg}.png` })
}
const d = await (await b.newContext({ viewport: { width: 1700, height: 950 } })).newPage()
d.on('pageerror', e => errs.push(e.message))
await d.goto('http://localhost:4173/?sync=1'); await d.waitForTimeout(4000); await d.screenshot({ path: S + 'sync-demo.png' })
const f = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage()
f.on('pageerror', e => errs.push(e.message))
await f.goto('http://localhost:4173/'); await f.click('[data-role=field]'); await f.waitForTimeout(1500); await f.screenshot({ path: S + 'field-home-docs.png', fullPage: true })
console.log(errs.length ? errs : 'no errors'); await b.close()
