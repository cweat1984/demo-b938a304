import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []
const p = await (await b.newContext({ viewport: { width: 1500, height: 950 } })).newPage()
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => m.type() === 'error' && !/tile|arcgis|Failed to load/i.test(m.text()) && errs.push(m.text()))
await p.goto(process.env.BASE || 'http://localhost:4173/'); await p.waitForSelector('[data-role="owner"]'); await p.click('[data-role="owner"]'); await p.waitForTimeout(800)
await p.evaluate(() => { location.hash = '/inventory' }); await p.waitForTimeout(1200)
await p.screenshot({ path: '/tmp/inv1.png' })
const st = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /db/i.test(k)) ?? '') ?? 'null'); return db ? { items: db.items.length, led: db.invLedger.length, co: db.checkouts.length, open: db.checkouts.filter(c => !c.returned).length, pos: db.pos.length } : Object.keys(localStorage) })
console.log(JSON.stringify(st))
console.log(errs.join('\n') || 'no errors')
await b.close()
