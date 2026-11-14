/**
 * Bug: switching a saved customer preset restores the name and app name
 * but leaves the previous customer’s phone in the form. Apply then saves that phone
 * onto the customer you switched back to.
 * Exits 1 while that is still true.
 *
 *   node tests/brand-preset-phone.mjs
 */
import { launch, newPage, signIn } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

async function fill(page, name, short, app, phone, preset) {
  await page.fill('[data-testid=brand-name]', name)
  await page.fill('[data-testid=brand-short]', short)
  await page.fill('[data-testid=brand-app]', app)
  await page.fill('[data-testid=brand-phone]', phone)
  await page.fill('[data-testid=brand-preset-name]', preset)
  await page.click('[data-testid=brand-preset-save]')
  if (await page.locator('[data-testid=brand-save]').isEnabled()) await page.click('[data-testid=brand-save]')
  await page.waitForTimeout(250)
}

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } })
await signIn(page, 'owner')
await page.evaluate(() => window.__store.getState().go('branding'))
await page.waitForSelector('[data-testid=brand-phone]')
await fill(page, 'Red Mesa Crane', 'RMC', 'Mesa Command', '(432) 555-0191', 'Red Mesa')
await fill(page, 'Kilgore Ironworks', 'KIW', 'Iron Command', '(903) 555-0177', 'Kilgore Iron')
await page.locator('[data-testid=brand-saved-preset]').filter({ hasText: 'Red Mesa' }).locator('button').first().click()
await page.waitForTimeout(200)
const draft = await page.evaluate(() => ({
  name: document.querySelector('[data-testid=brand-name]').value,
  phone: document.querySelector('[data-testid=brand-phone]').value,
}))
if (draft.name.includes('Red Mesa') && draft.phone.includes('903')) fail('Red Mesa preset kept the other customer’s phone in the form')
else ok('preset restored its own phone')
if (await page.locator('[data-testid=brand-save]').isEnabled()) await page.click('[data-testid=brand-save]')
await page.waitForTimeout(300)
const saved = await page.evaluate(() => {
  const j = JSON.parse(localStorage.getItem('sc-branding-v1') || '{}')
  return j.state?.b || j.b || {}
})
if (String(saved.name || '').includes('Red Mesa') && String(saved.phone || '').includes('903')) fail('Apply stored the other customer’s phone on Red Mesa')
else ok('saved phone matches the preset')
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
