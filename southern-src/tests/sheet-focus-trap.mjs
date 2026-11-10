/**
 * Sheets keep Tab inside the dialog. Exits 1 if focus escapes the company-view sheet.
 *   node tests/sheet-focus-trap.mjs
 */
import { launch, newPage } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } })
await page.click('[data-role=owner]')
await page.waitForSelector('[data-testid=bell]')
await page.click('[data-testid=org-filter]')
await page.waitForSelector('[role=dialog]')
await page.waitForTimeout(200)
for (let i = 0; i < 12; i++) await page.keyboard.press('Tab')
const inside = await page.evaluate(() => {
  const dialog = [...document.querySelectorAll('[role=dialog]')].at(-1)
  return !!dialog && dialog.contains(document.activeElement)
})
if (!inside) fail('Tab left the company-view sheet')
else ok('Tab stays inside the sheet')
await page.keyboard.press('Escape')
await page.waitForTimeout(800)
const closed = await page.locator('[role=dialog]').count()
if (closed) fail('Escape did not close the sheet')
else ok('Escape closes the sheet')
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
