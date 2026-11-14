/**
 * Inventory open-PO and checkout counts follow the branch, not the whole company.
 *   node tests/inventory-branch-kpis.mjs
 */
import { launch, newPage, signIn, pickBranch } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1400, height: 900 } })
await signIn(page, 'owner')
await pickBranch(page, 'SLH-MID')
await page.evaluate(() => window.__store.getState().go('inventory'))
await page.waitForSelector('[data-testid=kpi-pos]')
const info = await page.evaluate(() => {
  const db = window.__store.getState().db
  const open = p => ['Draft', 'Sent', 'Partially Received'].includes(p.status)
  const mine = db.pos.filter(p => open(p) && p.branchId === 'br-mid').length
  const all = db.pos.filter(open).length
  const shown = Number(document.querySelector('[data-testid=kpi-pos]')?.innerText.match(/\d+/)?.[0])
  return { shown, mine, all }
})
if (info.shown !== info.mine) fail(`Open POs shows ${info.shown}; Midland has ${info.mine} of ${info.all}`)
else ok(`Open POs matches Midland (${info.shown} of ${info.all} company-wide)`)
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
