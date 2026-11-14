/**
 * Bug: the bell’s “units past service” alert counts every branch, not the one on screen.
 * Shop filtered to Midland still shows Oklahoma City and Kilgore units.
 * Exits 1 while that is still true.
 *
 *   node tests/notify-branch-scope.mjs
 */
import { launch, newPage, signIn, pickBranch } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } })
await signIn(page, 'shop')
await pickBranch(page, 'SLH-MID')
await page.click('[data-testid=bell]')
await page.waitForTimeout(300)
const info = await page.evaluate(() => {
  const db = window.__store.getState().db
  const f = window.__store.getState().ui.filter.branchId
  const today = new Date().toISOString().slice(0, 10)
  const overdue = e => {
    const days = e.nextServiceDate ? (Date.parse(e.nextServiceDate) - Date.parse(today)) / 864e5 : 0
    const meter = e.category === 'Semi' || e.category === 'Pickup' ? e.miles : e.hours
    const rem = e.nextServiceAt != null && meter != null ? e.nextServiceAt - meter : null
    return (rem != null && rem < 0) || days < 0
  }
  const all = db.equipment.filter(overdue)
  const mine = all.filter(e => e.branchId === f)
  const text = document.body.innerText
  const m = text.match(/(\d+) units past service/)
  return { branch: f, all: all.length, mine: mine.length, shown: m ? Number(m[1]) : null }
})
if (info.branch !== 'br-mid') fail('Midland filter did not apply (' + info.branch + ')')
else if (info.shown != null && info.shown !== info.mine) fail(`service alert says ${info.shown} units; Midland has ${info.mine}`)
else ok('service alert matches the branch')
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
