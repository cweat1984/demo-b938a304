/**
 * Southern Transport's equipment view shows that division's trucks, not an empty crane grid,
 * and the outside-crane count follows the division.
 *   node tests/division-equipment.mjs
 */
import { launch, newPage } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1400, height: 900 } })
await page.click('[data-role=owner]')
await page.waitForSelector('[data-testid=bell]')
await page.click('[data-testid=org-filter]')
await page.locator('[role=dialog]').getByRole('button', { name: /Southern Transport/ }).click()
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await page.evaluate(() => window.__store.getState().go('equipment'))
await page.waitForTimeout(400)
const info = await page.evaluate(() => {
  const db = window.__store.getState().db
  const f = window.__store.getState().ui.filter
  const cards = [...document.querySelectorAll('[data-testid=equip-card]')].map(el => el.innerText)
  const craneUnits = new Set(db.equipment.filter(e => e.category === 'Crane').map(e => e.unit))
  const shownCranes = cards.filter(t => [...craneUnits].some(u => t.startsWith(u + '\n') || t.startsWith(u + ' ')))
  const outside = Number((document.body.innerText.match(/Outside cranes · (\d+)/) || [])[1])
  const today = new Date().toISOString().slice(0, 10)
  const expectedOutside = db.jobs.filter(j => f.divisionId === 'all' || j.divisionId === f.divisionId).reduce((n, j) => n + (j.outside || []).filter(o => o.to >= today && o.status !== 'Done').length, 0)
  return { division: f.divisionId, cards: cards.length, shownCranes: shownCranes.length, outside, expectedOutside }
})
if (info.division !== 'div-str') fail('Southern Transport was not selected')
else if (!info.cards) fail('Transport equipment grid is empty')
else if (info.shownCranes) fail('Transport view still shows ' + info.shownCranes + ' crane cards')
else ok('Transport equipment shows ' + info.cards + ' non-crane units')
if (info.outside !== info.expectedOutside) fail(`Outside cranes shows ${info.outside}, division has ${info.expectedOutside}`)
else ok('Outside crane count matches the division')
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
