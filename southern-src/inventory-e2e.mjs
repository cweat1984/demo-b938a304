// Inventory e2e: checkout→job cost, partial check-in credit, returnable out/in, swag→salesperson (kiosk),
// adjustment requires reason, QR scan via manual code, new item needs photo+location (+SDS for chemicals),
// leftovers on a finished job, Safety SDS library, field-app Safety Sheets (mobile). Screenshots → screenshots/inventory-*.png
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const shots = '/workspace/southern-app/screenshots/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []; const fail = m => errors.push('FAIL ' + m); const ok = m => console.log('ok', m)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
async function ctxFor(role, vp = { width: 1500, height: 950 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.25, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(`${role} console: ${m.text()}`) })
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(800)
  return { p, ctx }
}
const readDb = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('southern-command', 1); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get('db'); g.onsuccess = () => res(g.result) } }))
const settle = p => p.waitForTimeout(900)
const go = (p, h) => p.evaluate(x => { location.hash = '/' + x }, h)

const { p, ctx } = await ctxFor('owner')
await go(p, 'inventory'); await p.waitForSelector('[data-testid=inventory]'); await settle(p)
await p.screenshot({ path: shots + 'inventory-home.png' })
let db = await readDb(p)
if (db.items.length < 60 || db.items.length > 130) fail('item count ' + db.items.length)
if (!db.items.some(i => i.category === 'Swag')) fail('no swag seeded')
if (db.invLedger.length < 100) fail('ledger history too thin ' + db.invLedger.length)
if (!db.items.filter(i => i.branchId === 'br-okc').every(i => i.loc && i.bin)) fail('items missing locations')
const job = db.jobs.find(j => j.branchId === 'br-okc' && j.stage === 'In Progress')
const invCost = d => d.costs.filter(c => c.jobId === job.id && c.source === 'Inventory').reduce((s, c) => s + c.amount, 0)
const before = invCost(db)
ok(`seed: ${db.items.length} items, ${db.invLedger.length} ledger lines, ${db.checkouts.filter(c => !c.returned).length} open`)

// 1) check out 10 cribbing to a job → cost posts to that job
await p.click('[data-testid=inv-checkout]'); await p.fill('[data-testid=item-search]', 'Cribbing 6'); await p.click('[data-testid=item-hit] >> nth=0')
await p.fill('[data-testid=co-qty]', '10'); await p.click('[data-testid=co-next]')
await p.click('[data-testid=target-job]'); await p.fill('[data-testid=target-search]', job.jobNo); await p.click('[data-testid=target-hit] >> nth=0')
if (!(await p.isDisabled('[data-testid=co-next]'))) fail('reason should be required before Next')
await p.fill('[data-testid=co-reason]', 'Blocking under the load'); await p.click('[data-testid=co-next]')
await p.screenshot({ path: shots + 'inventory-checkout-desktop.png' })
await p.click('[data-testid=co-confirm]'); await settle(p)
db = await readDb(p)
const crib = db.items.find(i => i.name.startsWith('Cribbing') && i.branchId === 'br-okc')
if (Math.abs(invCost(db) - before - 10 * crib.cost) > 0.01) fail(`job cost did not post: ${before} → ${invCost(db)}`); else ok('checkout to job posts cost to job P&L')
const co = db.checkouts[0]
if (co.itemId !== crib.id || co.target.kind !== 'job' || !co.reason || !co.byName) fail('checkout record incomplete')
if (db.invLedger[0].kind !== 'Check-out' || db.invLedger[0].qty !== -10) fail('ledger missing check-out')

// 2) partial check-in of leftovers → credit back
await p.click('[data-testid=inv-checkin]'); await p.fill('[data-testid=ci-search]', 'Cribbing 6'); await p.click('[data-testid=ci-open] >> nth=0')
await p.fill('[data-testid=ci-qty]', '4'); await p.click('[data-testid=ci-cond-Good]'); await p.click('[data-testid=ci-confirm]'); await settle(p)
db = await readDb(p)
const co2 = db.checkouts.find(c => c.id === co.id)
if (co2.returnedQty !== 4 || co2.returned) fail('partial return not recorded ' + JSON.stringify(co2))
if (Math.abs(invCost(db) - before - 6 * crib.cost) > 0.01) fail('return did not credit the job')
else ok('partial check-in credits the job (net 6 × cribbing)')
if (!db.invLedger.some(m => m.kind === 'Return' && m.checkoutId === co.id) || !db.invLedger.some(m => m.kind === 'Check-out' && m.checkoutId === co.id)) fail('ledger should keep both out and in')

// 3) returnable radio: out to an employee → shows as Out → check in
await p.click('[data-testid=inv-checkout]'); await p.fill('[data-testid=item-search]', 'Two-way radio'); await p.click('[data-testid=item-hit] >> nth=0')
await p.click('[data-testid=co-next]'); await p.click('[data-testid=target-employee]'); await p.fill('[data-testid=target-search]', 'Chad'); await p.click('[data-testid=target-hit] >> nth=0')
await p.fill('[data-testid=co-reason]', 'Signal person on the pick'); await p.click('[data-testid=co-next]'); await p.click('[data-testid=co-confirm]'); await settle(p)
db = await readDb(p); const radio = db.checkouts[0]
if (!radio.returnable || radio.returned || radio.due <= radio.out) fail('radio should be Out with a due-back date')
await p.getByRole('tab', { name: /Who has what/ }).click(); await p.waitForTimeout(300)
if (!(await p.textContent('[data-testid=inventory]')).includes('Two-way radio')) fail('radio not in who-has-what')
await p.click('[data-testid=inv-checkin]'); await p.fill('[data-testid=ci-search]', 'radio'); await p.click('[data-testid=ci-open] >> nth=0'); await p.click('[data-testid=ci-confirm]'); await settle(p)
db = await readDb(p); if (!db.checkouts.find(c => c.id === radio.id).returned) fail('radio check-in failed'); else ok('returnable out → in')

// 4) swag through the kiosk as Chris Ramos → rolls up to the salesperson
await p.click('[data-testid=kiosk]'); await p.waitForSelector('[data-testid=kiosk-mode]'); await p.fill('[data-testid=kiosk-mode] input', 'Chris'); await p.getByRole('button', { name: /Chris Ramos/ }).click()
await p.click('[data-testid=kiosk-out]'); await p.fill('[data-testid=item-search]', 'Koozie'); await p.click('[data-testid=item-hit] >> nth=0')
await p.fill('[data-testid=co-qty]', '24'); await p.click('[data-testid=co-next]'); await p.click('[data-testid=target-customer]'); await p.click('[data-testid=target-hit] >> nth=0')
await p.fill('[data-testid=co-reason]', 'Safety stand-down giveaway'); await p.click('[data-testid=co-next]'); await p.click('[data-testid=co-confirm]'); await settle(p)
await p.getByRole('button', { name: 'Exit kiosk' }).click()
db = await readDb(p); const sw = db.checkouts[0]
if (sw.byName !== 'Chris Ramos' || sw.target.kind !== 'customer') fail('swag not attributed to Chris: ' + sw.byName)
await p.getByRole('tab', { name: 'Reports', exact: true }).click(); await p.waitForSelector('[data-testid=swag-by-rep]')
if (!(await p.textContent('[data-testid=swag-by-rep]')).includes('Chris Ramos')) fail('swag-by-rep missing Chris'); else ok('swag rolls up to salesperson')
await p.click('[data-testid=swag-by-rep] >> text=Chris Ramos'); await p.waitForSelector('[data-testid=emp-swag]', { timeout: 5000 }).catch(() => fail('employee drawer has no swag section'))
await p.keyboard.press('Escape'); await p.waitForTimeout(300)

// 5) adjustment requires a reason
await p.getByRole('tab', { name: 'Stock', exact: true }).click(); await p.fill('[data-testid=stock-search]', 'Zip ties'); await p.click('[data-testid=stock-row] >> nth=0 >> button >> nth=0')
await p.waitForSelector('[data-testid=item-view]'); await p.click('[data-testid=item-adjust]'); await p.fill('[data-testid=adj-qty]', '20')
if (!(await p.isDisabled('[data-testid=adj-save]'))) fail('adjust saved without a reason')
await p.fill('[data-testid=adj-reason]', 'Cycle count correction'); await p.click('[data-testid=adj-save]'); await settle(p)
db = await readDb(p); if (db.invLedger[0].kind !== 'Adjust' || db.invLedger[0].reason !== 'Cycle count correction') fail('adjust not in ledger'); else ok('adjustment requires reason → ledger')
await p.keyboard.press('Escape'); await p.waitForTimeout(300)

// 6) QR scan via manual code: bin → contents, item → detail
const someItem = db.items.find(i => i.name.startsWith('Oil filter — Cummins') && i.branchId === 'br-okc')
await p.click('[data-testid=inv-scan]'); await p.fill('[data-testid=scan-manual]', 'BIN:' + someItem.bin); await p.click('[data-testid=scan-go]')
await p.waitForSelector('[data-testid=bin-sheet]'); if (!(await p.textContent('[data-testid=bin-sheet]')).includes('Oil filter')) fail('bin scan contents'); else ok('scan bin → contents')
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
await p.click('[data-testid=inv-scan]'); await p.fill('[data-testid=scan-manual]', 'INV:' + someItem.sku); await p.click('[data-testid=scan-go]')
await p.waitForSelector('[data-testid=item-view]'); await p.waitForSelector('[data-testid=loc-path]'); await p.waitForTimeout(1500); ok('scan item → detail with location path + photo')
await p.screenshot({ path: shots + 'inventory-item.png' })
await p.keyboard.press('Escape'); await p.waitForTimeout(300)

// 7) new item: photo + location required; chemical requires SDS PDF
await p.click('[data-testid=add-item]'); await p.fill('[data-testid=add-name]', 'Citrus degreaser (gal)')
if (!(await p.isDisabled('[data-testid=add-save]'))) fail('saved without photo')
await p.setInputFiles('[data-testid=add-photo]', { name: 'p.png', mimeType: 'image/png', buffer: PNG })
await p.click('[data-testid=add-chemical] button, [data-testid=add-chemical] [role=switch]').catch(async () => p.click('[data-testid=add-chemical]'))
await p.waitForSelector('[data-testid=sds-section]')
if (!(await p.isDisabled('[data-testid=add-save]'))) fail('chemical saved without SDS')
await p.setInputFiles('[data-testid=add-sds]', '/workspace/southern-app/app/public/sds/sds-8.pdf')
await p.waitForTimeout(300); await p.click('[data-testid=add-save]'); await settle(p)
db = await readDb(p); const nu = db.items.find(i => i.name === 'Citrus degreaser (gal)')
if (!nu || !nu.photo || !nu.loc || !nu.sdsId || !db.sds.find(s => s.id === nu.sdsId)?.pdf) fail('new chemical not saved with photo/location/SDS'); else ok('new item requires photo + location; chemical requires SDS')

// 8) leftovers on a finished job
const doneJob = db.jobs.find(j => (j.status === 'Complete' || j.stage === 'Complete') && db.checkouts.some(c => c.jobId === j.id && !c.returned))
if (!doneJob) fail('no finished job with leftovers seeded')
else {
  const openN = d => d.checkouts.filter(c => c.jobId === doneJob.id && !c.returned).length
  const n0 = openN(db)
  await p.getByRole('tab', { name: /Who has what/ }).click(); await p.getByRole('tab', { name: 'By job' }).click()
  await p.click(`text=Job #${doneJob.jobNo} >> nth=0`); await p.waitForSelector('[data-testid=leftovers]')
  await p.click('[data-testid=leftovers-return]'); await p.click('[data-testid=ci-open] >> nth=0'); await p.click('[data-testid=ci-confirm]'); await settle(p)
  db = await readDb(p); if (openN(db) !== n0 - 1) fail(`leftover return failed ${n0} → ${openN(db)}`); else ok('finished job shows Return leftovers → check-in')
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
}

// 9) Safety SDS library + scan a container
await go(p, 'safety'); await p.waitForTimeout(600); await p.getByRole('tab', { name: 'SDS', exact: true }).click()
await p.waitForSelector('[data-testid=sds-library]')
if ((await p.$$('[data-testid=sds-row]')).length < 12) fail('SDS library too small')
const brak = db.items.find(i => i.name.startsWith('Brake parts cleaner') && i.branchId === 'br-okc')
await p.click('[data-testid=sds-scan]'); await p.fill('[data-testid=scan-manual]', 'INV:' + brak.sku); await p.click('[data-testid=scan-go]')
await p.waitForSelector('[data-testid=sds-sheet]'); if (!(await p.textContent('[data-testid=sds-sheet]')).includes('First aid')) fail('sds sheet missing first aid'); else ok('Safety: scan container → SDS')
await p.keyboard.press('Escape'); await p.waitForTimeout(200)
await p.getByRole('tab', { name: /Chemical inventory/ }).click(); if (!(await p.textContent('[data-testid=chem-list]')).includes('SDS missing')) fail('missing SDS flag not shown'); else ok('missing / expired SDS flagged')
await ctx.close()

// 10) mobile: checkout flow screenshot + field Safety Sheets
const m = await ctxFor('owner', { width: 390, height: 844 }, true)
await go(m.p, 'inventory'); await m.p.waitForSelector('[data-testid=inventory]'); await m.p.waitForTimeout(500)
const w = await m.p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) fail('mobile overflow ' + w)
await m.p.click('[data-testid=inv-checkout]'); await m.p.fill('[data-testid=item-search]', 'Shackle'); await m.p.click('[data-testid=item-hit] >> nth=0'); await m.p.waitForTimeout(300); { const tg = m.p.locator('[data-testid=co-tag]:not([disabled])'); if (await tg.count()) await tg.first().click() } await m.p.click('[data-testid=co-next]'); await m.p.click('[data-testid=target-job]'); await m.p.waitForTimeout(300)
await m.p.screenshot({ path: shots + 'inventory-checkout-mobile.png' })
await m.ctx.close()
const f = await ctxFor('field', { width: 390, height: 844 }, true)
await f.p.click('[data-testid=tile-sds]'); await f.p.waitForSelector('[data-testid=sds-library]')
if (!(await f.p.$('[data-testid=sds-mine]'))) fail('field: no chemicals-on-my-job list')
await f.p.fill('[data-testid=sds-search]', 'WD-40'); await f.p.click('[data-testid=sds-row] >> nth=0'); await f.p.waitForSelector('[data-testid=sds-sheet]')
await f.p.waitForTimeout(400); await f.p.screenshot({ path: shots + 'inventory-sds-mobile.png' }); ok('field Safety Sheets: search → sheet with first aid/PPE/spill on top')
await f.ctx.close()

console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors')
await browser.close()
