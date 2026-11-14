/**
 * Bug: the shell offline notice is hidden below 640px, so a phone never shows
 * “Offline — changes saved on device”. Exits 1 while that notice stays hidden.
 * Checked on iPhone (Chromium and WebKit) and a Pixel.
 *
 *   node tests/offline-banner-phone.mjs
 */
import { launch, phone, withWebKit, base } from './support.mjs'
import { devices } from 'playwright'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

async function check(browser, name, device) {
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(base)
  await page.click('[data-role=owner]')
  await page.waitForSelector('[data-testid=bell]')
  await ctx.setOffline(true)
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await page.waitForTimeout(300)
  const visible = await page.evaluate(() => /Offline — changes saved on device/.test(document.body.innerText))
  if (!visible) fail(name + ' hides the offline notice')
  else ok(name + ' shows the offline notice')
  await ctx.close()
}

const browser = await launch()
await check(browser, 'iphone', phone.iphone)
await check(browser, 'pixel', phone.pixel)
await browser.close()
await withWebKit(async wb => { await check(wb, 'webkit-iphone', devices['iPhone 14']) })
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
