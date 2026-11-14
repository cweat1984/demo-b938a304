/**
 * Bug: Shop → Parts ignores the branch filter. Work orders follow it.
 * A shop sign-in opens on Oklahoma City and the parts list still shows Midland and Kilgore bins.
 * Choosing Midland still shows Oklahoma City bins. Exits 1 while that is still true.
 *
 *   node tests/shop-parts-branch.mjs
 */
import { launch, newPage, signIn, pickBranch } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

async function bins(page) {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll('button')].map(b => b.innerText).filter(t => /bin /.test(t))
    return {
      branch: window.__store.getState().ui.filter.branchId,
      okc: rows.filter(t => /OKC-/.test(t)).length,
      mid: rows.filter(t => /MID-/.test(t)).length,
      kil: rows.filter(t => /KIL-/.test(t)).length,
    }
  })
}

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } })
await signIn(page, 'shop')
await page.evaluate(() => window.__store.getState().go('shop'))
await page.getByRole('tab', { name: /^Parts/ }).click()
await page.waitForTimeout(200)
const home = await bins(page)
if (home.branch === 'br-okc' && (home.mid > 0 || home.kil > 0)) fail(`OKC shop parts lists other branches (MID ${home.mid}, KIL ${home.kil})`)
else ok('OKC parts stay on OKC bins')

await pickBranch(page, 'SLH-MID')
const mid = await bins(page)
if (mid.branch !== 'br-mid') fail('branch sheet did not select Midland (got ' + mid.branch + ')')
else if (mid.okc > 0 || mid.kil > 0) fail(`Midland parts still lists other branches (OKC ${mid.okc}, KIL ${mid.kil})`)
else ok('Midland parts stay on Midland bins')

await page.getByRole('tab', { name: /Work orders/ }).click()
const wo = await page.evaluate(() => {
  const db = window.__store.getState().db
  const f = window.__store.getState().ui.filter.branchId
  const ids = new Set(db.equipment.filter(e => e.branchId === f).map(e => e.id))
  const text = document.body.innerText
  return db.workOrders.filter(w => w.status !== 'Closed' && !ids.has(w.unitId) && text.includes(w.woNo)).length
})
if (wo) fail('Midland work orders include ' + wo + ' from other branches')
else ok('work orders follow the branch')

await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
