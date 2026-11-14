/**
 * Bug: Reset demo deletes saved customer branding presets. The reset is documented
 * as keeping branding. Exits 1 while a preset saved before the reset is gone after it.
 *
 *   node tests/reset-keeps-presets.mjs
 */
import { launch, newPage, signIn } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 900 } })
await signIn(page, 'owner')
await page.evaluate(() => window.__store.getState().go('branding'))
await page.waitForSelector('[data-testid=brand-preset-name]')
await page.fill('[data-testid=brand-preset-name]', 'Keep Me Crane')
const save = page.locator('[data-testid=brand-preset-save]')
if (!(await save.isEnabled())) {
  await page.fill('[data-testid=brand-name]', 'Keep Me Crane Co')
  await page.fill('[data-testid=brand-short]', 'KMC')
  await page.fill('[data-testid=brand-app]', 'Keep Command')
}
await save.click()
await page.waitForTimeout(200)
const before = await page.locator('[data-testid=brand-saved-preset]', { hasText: 'Keep Me Crane' }).count()
if (!before) fail('preset was not saved before reset')
await page.evaluate(() => window.__store.getState().go('settings'))
await page.getByRole('tab', { name: /Account/ }).click()
await page.click('[data-testid=reset-demo]')
await page.getByRole('button', { name: 'Reset demo' }).last().click()
await page.waitForTimeout(1600)
await page.waitForSelector('[data-testid=bell], [data-role=owner]', { timeout: 20000 })
if (await page.locator('[data-role=owner]').count()) await page.click('[data-role=owner]')
await page.waitForSelector('[data-testid=bell]', { timeout: 20000 })
await page.evaluate(() => window.__store.getState().go('branding'))
await page.waitForTimeout(500)
const after = await page.locator('[data-testid=brand-saved-preset]', { hasText: 'Keep Me Crane' }).count()
if (!after) fail('Reset demo removed the saved branding preset')
else ok('preset survived the demo reset')
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
