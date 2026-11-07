// Inventory / Purchasing role e2e: home queue, reorder → PO → send → receive (damaged) → AP 3-way match,
// job PO → job cost, parts request (field phone → approve → pick & check out), cycle count w/ reason → audit,
// reports, guide, nav placement, tips. Screenshots → screenshots/inventory-role/
import { chromium } from 'playwright'
const base = process.env.BASE ?? 'http://localhost:4173/'
const shots = '/workspace/southern-app/screenshots/inventory-role/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []; const fail = m => { errors.push('FAIL ' + m); console.log('FAIL', m) }; const ok = m => console.log('ok', m)
async function ctxFor(role, vp = { width: 1440, height: 900 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.25, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(`${role} console: ${m.text()}`) })
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 20000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const readDb = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('southern-command', 1); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get('db'); g.onsuccess = () => res(g.result) } }))
const settle = p => p.waitForTimeout(800)
const go = (p, h) => p.evaluate(x => { location.hash = '/' + x }, h)
const esc = async p => { await p.keyboard.press('Escape'); await p.waitForTimeout(350) }

// ---------- inventory role, desktop ----------
const { p, ctx } = await ctxFor('inventory')
await p.waitForSelector('[data-testid=inv-command]')
let db = await readDb(p)
const n = s => p.locator(`[data-testid=${s}] .display`).first().textContent()
for (const q of ['q-requests', 'q-receive', 'q-overdue', 'q-reorder']) { const v = Number(await n(q)); if (!(v > 0)) fail(`${q} empty`) }
if (!(await p.$('[data-testid=cmd-scan]'))) fail('no big scan button')
if (!(await p.$('[data-testid=cmd-count]'))) fail('no cycle count task')
ok(`seed: ${db.vendors.filter(v => v.kind).length} stock vendors, ${db.pos.length} POs (${[...new Set(db.pos.map(x => x.status))].join(', ')}), ${db.partsRequests.length} requests, ${db.cycleCounts.length} counts`)
if (db.pos.length < 6 || new Set(db.pos.map(x => x.status)).size < 5) fail('POs not in every state')
const navHubs = await p.$$eval('aside [data-hub]', els => els.map(e => e.getAttribute('data-hub')))
if (!navHubs.includes('inventory')) fail('Inventory not a top-level nav item: ' + navHubs.join(','))
await p.screenshot({ path: shots + 'desktop-inventory-command.png' }); ok('Inventory Command home')

// scan an item → check out / check in sheet
const sling = db.items.find(i => i.name.startsWith('Polyester round sling 10') && i.branchId === 'br-okc')
await p.click('[data-testid=cmd-scan]'); await p.fill('[data-testid=scan-manual]', 'INV:' + sling.sku); await p.click('[data-testid=scan-go]')
await p.waitForSelector('[data-testid=scan-hit]'); await p.screenshot({ path: shots + 'desktop-scan-hit.png' }); ok('scan → check out / check in choice')
await p.click('[data-testid=hit-out]'); await p.waitForSelector('[data-testid=checkout-flow]'); await esc(p)

// 1) reorder → one-tap create PO for a vendor → send
await go(p, 'purchasing'); await p.waitForSelector('[data-testid=purchasing]'); await settle(p)
await p.screenshot({ path: shots + 'desktop-purchasing-reorder.png' })
const vendCount = (await p.$$('[data-testid=reorder-vendor]')).length
if (vendCount < 2) fail('reorder not grouped by vendor: ' + vendCount)
const pos0 = db.pos.length
await p.click('[data-testid=create-po] >> nth=0'); await settle(p)
db = await readDb(p); if (db.pos.length !== pos0 + 1 || db.pos[0].status !== 'Draft') fail('create PO failed'); else ok(`one-tap PO ${db.pos[0].poNo} (${db.pos[0].lines.length} lines)`)
const newPo = db.pos[0]
if (newPo.lines.some(l => { const it = db.items.find(i => i.id === l.itemId); return it.onHand + l.qty !== it.max })) fail('suggested qty should fill to max')
if ((await p.$$('[data-testid=reorder-vendor]')).length !== vendCount - 1) fail('vendor group should leave the reorder list once on order')
await p.getByRole('tab', { name: /Purchase orders/ }).click(); await p.waitForTimeout(300)
await p.screenshot({ path: shots + 'desktop-purchase-orders.png' })
await p.click(`[data-testid=po-row] >> text=${newPo.poNo}`); await p.waitForSelector('[data-testid=po-view]'); await p.waitForTimeout(700); await p.screenshot({ path: shots + 'desktop-po-drawer.png' }); await p.click('[data-testid=po-send]'); await settle(p)
db = await readDb(p); if (db.pos.find(x => x.id === newPo.id).status !== 'Sent') fail('send PO'); else ok('PO sent (Draft → Sent)')

// 2) receive a sent PO with 1 damaged → stock up, bill in AP, 3-way hold
await p.click('[data-testid=po-receive]'); await p.waitForSelector('[data-testid=receive-modal]')
const dmgInputs = p.locator('[data-testid=receive-modal] [data-testid=recv-damaged]')
await dmgInputs.first().fill('1')
const firstLine = newPo.lines[0]; const before = db.items.find(i => i.id === firstLine.itemId).onHand
await p.screenshot({ path: shots + 'desktop-receive.png' })
await p.click('[data-testid=recv-confirm]'); await settle(p)
db = await readDb(p)
const rp = db.pos.find(x => x.id === newPo.id); const it1 = db.items.find(i => i.id === firstLine.itemId)
if (it1.onHand !== before + firstLine.qty - 1) fail(`receive stock ${before} → ${it1.onHand}`)
if (rp.lines[0].damaged !== 1) fail('damaged not recorded')
const bill = db.bills.find(b => b.poId === rp.id); if (!bill) fail('no bill handed to AP'); else ok(`received: ${rp.status}, bill ${bill.billNo} in AP`)
await esc(p)

// 3) job PO → receive → cost on the job
const jobPo = db.pos.find(x => x.jobId && x.status === 'Sent')
const jobCost = d => d.costs.filter(c => c.jobId === jobPo.jobId && c.source === 'Inventory').reduce((s, c) => s + c.amount, 0)
const jc0 = jobCost(db)
await p.click('[data-testid=po-filter-open]'); await p.click(`[data-testid=po-row] >> text=${jobPo.poNo} >> xpath=ancestor::div[@data-testid="po-row"] >> [data-testid=po-receive-row]`)
await p.waitForSelector('[data-testid=receive-modal]'); await p.click('[data-testid=recv-confirm]'); await settle(p)
db = await readDb(p)
const exp = jobPo.lines.reduce((s, l) => s + l.qty * l.cost, 0)
if (Math.abs(jobCost(db) - jc0 - exp) > 0.01) fail(`job PO cost ${jc0} → ${jobCost(db)} (exp +${exp})`); else ok(`job PO ${jobPo.poNo} → $${exp} on job P&L`)

// 4) AP 3-way match
await go(p, 'payables'); await p.waitForTimeout(700); await p.getByRole('tab', { name: /Pending Approval/ }).click(); await p.waitForTimeout(300)
const badges = await p.$$eval('[data-testid=bill-3way]', els => els.map(e => e.textContent))
if (!badges.some(t => /hold/.test(t)) || !badges.some(t => /✓/.test(t))) fail('3-way badges ' + badges.join('|')); else ok(`AP 3-way badges: ${badges.join(', ')}`)
const hold = db.bills.find(b => b.poId === 'po-4099')
await p.click(`text=${hold.billNo}`); await p.waitForSelector('[data-testid=three-way]')
if (!(await p.textContent('[data-testid=three-way]')).includes('Hold')) fail('seeded PO-4099 should be on hold')
await p.waitForTimeout(700); await p.screenshot({ path: shots + 'desktop-ap-three-way.png' }); ok('3-way panel in bill drawer'); await esc(p)

// 5) parts requests: approve + pick & check out
await go(p, 'requests'); await p.waitForSelector('[data-testid=requests]'); await settle(p)
await p.screenshot({ path: shots + 'desktop-requests.png' })
const req = db.partsRequests.find(r => r.status === 'Waiting' && r.from === 'Field')
await p.click(`[data-testid=req-row] >> text=${req.no}`); await p.waitForSelector('[data-testid=request-view]')
await p.click('[data-testid=req-approve]'); await settle(p)
const co0 = db.checkouts.length
await p.waitForTimeout(700); await p.screenshot({ path: shots + 'desktop-request-drawer.png' })
await p.click('[data-testid=req-fill]'); await settle(p)
db = await readDb(p)
const r2 = db.partsRequests.find(r => r.id === req.id)
if (r2.status !== 'Checked out' || db.checkouts.length !== co0 + req.lines.length) fail('request fill'); else ok(`request ${req.no} approved → checked out to ${req.byName}`)
if (db.checkouts[0].byName !== req.byName) fail('checkout should be to requester, got ' + db.checkouts[0].byName)
await esc(p)

// 6) cycle count with a variance + reason → ledger + audit, next week scheduled
await go(p, 'invhome'); await p.waitForSelector('[data-testid=cmd-count]'); await p.click('[data-testid=cmd-count]'); await p.waitForSelector('[data-testid=cc-task]')
const rows = p.locator('[data-testid=count-input]'); const k = await rows.count()
const due = db.cycleCounts.find(c => c.status === 'Due')
const shelfItems = db.items.filter(i => i.branchId === 'br-okc' && i.bin.replace(/-B\d+$/, '') === due.shelf)
for (let i = 0; i < k; i++) await rows.nth(i).fill(String(shelfItems[i].onHand - (i === 0 ? 1 : 0)))
if (!(await p.isDisabled('[data-testid=count-post]'))) fail('count posted without a reason')
await p.selectOption('[data-testid=count-reason]', { index: 1 })
await p.screenshot({ path: shots + 'desktop-cycle-count.png' })
await p.click('[data-testid=count-post]'); await settle(p)
db = await readDb(p)
if (db.cycleCounts.find(c => c.id === due.id)?.status !== 'Done') fail('count task not done')
if (!db.cycleCounts.some(c => c.status === 'Due' && c.id !== due.id)) fail('next week not scheduled')
if (db.invLedger[0].kind !== 'Count' || !db.audit.some(a => a.action === 'Cycle count' && a.diff?.length)) fail('count not in ledger/audit'); else ok('cycle count → ledger + audit (with diff) + next shelf scheduled')

// 7) min/max edit + reports + guide
await go(p, 'purchasing'); await p.waitForSelector('[data-testid=purchasing]'); await p.getByRole('tab', { name: 'Min / max', exact: true }).click(); await p.waitForSelector('[data-testid=mm-row]')
await p.locator('[data-testid=mm-min]').first().fill('7'); await p.locator('[data-testid=mm-max]').first().fill('19'); await p.click('[data-testid=mm-save]'); await settle(p)
db = await readDb(p); if (!db.audit.some(a => a.action === 'Set reorder point')) fail('min/max not saved'); else ok('min/max per item per location')
await p.screenshot({ path: shots + 'desktop-min-max.png' })
await p.getByRole('tab', { name: 'Vendors', exact: true }).click(); await p.waitForTimeout(300)
if ((await p.$$('[data-testid=vendor-card]')).length < 5) fail('vendors list < 5')
await p.screenshot({ path: shots + 'desktop-vendors.png' })
await p.click('[data-testid=vendor-card] >> nth=0'); await p.waitForTimeout(400); await esc(p)
await go(p, 'inventory'); await p.waitForSelector('[data-testid=inventory]'); await p.getByRole('tab', { name: 'Reports', exact: true }).click(); await p.waitForSelector('[data-testid=who-took-what]')
const all = (await p.$$('[data-testid=wtw-row]')).length
await p.selectOption('[data-testid=wtw-person]', { index: 1 }); await p.waitForTimeout(200)
const one = (await p.$$('[data-testid=wtw-row]')).length
if (!(one > 0 && one < all)) fail(`who-took-what filter ${all} → ${one}`); else ok('who took what — filter by person')
for (const t of ['value-by-loc', 'slow-movers', 'swag-by-rep']) if (!(await p.$(`[data-testid=${t}]`))) fail('missing report ' + t)
await p.screenshot({ path: shots + 'desktop-reports.png', fullPage: true })
await go(p, 'invguide'); await p.waitForSelector('[data-testid=inv-guide]'); await p.getByRole('button', { name: /Min and max/ }).click(); await p.waitForTimeout(200)
await p.screenshot({ path: shots + 'desktop-guide.png', fullPage: true }); ok('guide')
// tips dismiss + reset
await go(p, 'invhome'); await p.waitForSelector('[data-testid=inv-command]')
const t0 = (await p.$$('[data-testid=inv-tip]')).length; await p.click('[data-testid=tip-dismiss] >> nth=0'); await p.waitForTimeout(200)
if ((await p.$$('[data-testid=inv-tip]')).length !== t0 - 1) fail('tip dismiss'); else ok('tips dismissible')
// theme check: light mode
await p.evaluate(() => { const k = 'sc-prefs'; const v = JSON.parse(localStorage.getItem(k) || '{}'); v.theme = 'light'; v.mode = 'light'; localStorage.setItem(k, JSON.stringify(v)) })
await p.reload(); await p.waitForSelector('[data-testid=inv-command]'); await settle(p)
await p.screenshot({ path: shots + 'desktop-inventory-command-light.png' })
await ctx.close()

// ---------- owner + ops nav, accounting ----------
for (const role of ['owner', 'ops']) {
  const o = await ctxFor(role)
  const hubs = await o.p.$$eval('aside [data-hub]', els => els.map(e => e.getAttribute('data-hub')))
  if (!hubs.includes('inventory')) fail(`${role}: no top-level Inventory`)
  const fleetTabs = await o.p.evaluate(() => 1)
  void fleetTabs
  await o.p.click('aside [data-hub=inventory]'); await o.p.waitForSelector('[data-testid=inv-command]'); await o.p.waitForTimeout(400)
  const tabs = await o.p.$$eval('[data-testid=hub-tabs] button', els => els.map(e => e.textContent))
  if (tabs.length < 5) fail(`${role}: inventory tabs ${tabs}`); else ok(`${role}: Inventory top-level → ${tabs.join(' | ')}`)
  if (role === 'owner') await o.p.screenshot({ path: shots + 'desktop-owner-nav.png' })
  await o.ctx.close()
}

// ---------- mobile: inventory role + field request ----------
const m = await ctxFor('inventory', { width: 390, height: 844 }, true)
await m.p.waitForSelector('[data-testid=inv-command]'); await m.p.waitForTimeout(600)
const w = await m.p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) fail('mobile overflow ' + w)
await m.p.screenshot({ path: shots + 'mobile-inventory-command.png' })
await m.p.screenshot({ path: shots + 'mobile-inventory-command-full.png', fullPage: true })
await m.p.click('[data-testid=q-receive-btn] >> nth=0'); await m.p.waitForSelector('[data-testid=receive-modal]'); await m.p.waitForTimeout(400)
await m.p.screenshot({ path: shots + 'mobile-receive.png' }); await esc(m.p)
await go(m.p, 'purchasing'); await m.p.waitForSelector('[data-testid=purchasing]'); await m.p.waitForTimeout(500)
if (await m.p.evaluate(() => document.documentElement.scrollWidth) > 392) fail('purchasing mobile overflow')
await m.p.screenshot({ path: shots + 'mobile-purchasing.png' })
await go(m.p, 'invguide'); await m.p.waitForSelector('[data-testid=inv-guide]'); await m.p.waitForTimeout(400)
await m.p.screenshot({ path: shots + 'mobile-guide.png' })
await m.ctx.close()

const f = await ctxFor('field', { width: 390, height: 844 }, true)
await f.p.locator('[data-testid=ftab-more]').dispatchEvent('click'); await f.p.waitForTimeout(500)
await f.p.click('[data-testid=tile-parts]'); await f.p.waitForSelector('[data-testid=request-form]')
await f.p.fill('[data-testid=item-search]', 'Tag line'); await f.p.click('[data-testid=item-hit] >> nth=0')
await f.p.fill('[data-testid=req-reason]', 'Old one frayed')
const tgt = await f.p.$eval('[data-testid=req-target]', s => s.value)
if (!tgt) await f.p.selectOption('[data-testid=req-target]', { index: 1 })
await f.p.waitForTimeout(300); await f.p.screenshot({ path: shots + 'mobile-field-request.png' })
await f.p.click('[data-testid=req-submit]'); await f.p.waitForTimeout(800)
const fdb = await readDb(f.p); const nr = fdb.partsRequests[0]
if (nr.from !== 'Field' || nr.status !== 'Waiting' || !nr.lines.length) fail('field request not created'); else ok(`field request ${nr.no} from ${nr.byName}`)
await f.ctx.close()

console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors')
await browser.close()
