import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []
const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
await p.goto('file:///workspace/southern-app/app/dist-standalone/index.html'); await p.click('[data-role=owner]', { timeout: 20000 }); await p.waitForTimeout(2000)
for (const pg of ['quotes', 'lifts', 'vault', 'windfarms']) { await p.evaluate(x => { location.hash = '/' + x }, pg); await p.waitForTimeout(1200) }
console.log(errs.length ? errs.slice(0, 5) : 'standalone no errors'); await b.close()
