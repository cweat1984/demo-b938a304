/**
 * Bug: People hides "New hire" from anyone who is not HR or Owner, but the Onboarding
 * tab still offers New hire, a pay-rate field, and Activate. Front desk can run all three.
 * Exits 1 while that is still true.
 *
 *   node tests/onboarding-role-gate.mjs
 */
import { launch, newPage, signIn } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } })
await signIn(page, 'frontdesk')
await page.evaluate(() => { location.hash = '/people' })
await page.waitForTimeout(400)
await page.getByRole('tab', { name: /Onboarding/ }).click()
await page.waitForTimeout(400)
const gate = await page.evaluate(() => ({
  newHire: document.querySelectorAll('[data-testid=hire-new]').length,
  activate: document.querySelectorAll('[data-testid=hire-activate]').length,
}))
if (gate.newHire) fail('front desk can start a new hire from Onboarding')
else ok('front desk has no New hire button')
if (gate.activate) fail(`front desk can activate ${gate.activate} hire(s)`)
else ok('front desk has no Activate button')
if (gate.newHire) {
  await page.click('[data-testid=hire-new]')
  const pay = await page.locator('text=Pay rate').count()
  if (pay) fail('front desk new-hire form asks for a pay rate')
}
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
