/**
 * A saved menu order with a page that no longer exists must not blank Settings.
 *   node tests/settings-nav-stale.mjs
 */
import { launch, newPage } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', e => errors.push(e.message))
await page.click('[data-role=owner]')
await page.waitForSelector('[data-testid=bell]')
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('sc-prefs') || '{}')
  const nav = raw.navOrder || {}
  nav.owner = ['command', 'no-such-page', 'settings']
  localStorage.setItem('sc-prefs', JSON.stringify({ ...raw, navOrder: nav }))
})
await page.reload()
await page.waitForSelector('[data-testid=bell]')
await page.evaluate(() => window.__store.getState().go('settings'))
await page.getByRole('tab', { name: 'Navigation' }).click()
await page.waitForTimeout(300)
const text = await page.locator('body').innerText()
if (errors.length) fail('Settings threw: ' + errors[0].slice(0, 140))
else if (!/Navigation|Reset menu|Command/.test(text)) fail('Navigation settings did not render')
else ok('Stale menu key does not blank Settings')
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
