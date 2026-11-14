/**
 * Bug: under 640px the branch chip hides its label and draws at about 36×38,
 * so a phone cannot see Oklahoma City vs Midland vs Kilgore and the target is under 44px.
 * Checked on iPhone, Pixel, and WebKit iPhone. Exits 1 while the chip stays blank or short.
 *
 *   node tests/branch-chip-phone.mjs
 */
import { launch, phone, withWebKit } from './support.mjs'
import { devices } from 'playwright'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

async function check(browser, name, device) {
  const ctx = await browser.newContext(device)
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(process.env.BASE || 'http://localhost:5199/')
  await page.waitForSelector('[data-role=shop]')
  await page.click('[data-role=shop]')
  await page.waitForSelector('[data-testid=org-filter]')
  const chip = await page.evaluate(() => {
    const el = document.querySelector('[data-testid=org-filter]')
    const r = el.getBoundingClientRect()
    return { text: el.innerText.replace(/\s+/g, ' ').trim(), h: Math.round(r.height), w: Math.round(r.width), aria: el.getAttribute('aria-label') || '' }
  })
  const named = /OKC|Oklahoma|MID|Midland|KIL|Kilgore|All/i.test(chip.text)
  if (!named) fail(`${name} branch chip has no visible name (${chip.w}×${chip.h}, aria "${chip.aria}")`)
  else ok(`${name} branch chip reads "${chip.text}"`)
  if (chip.h < 44 || chip.w < 44) fail(`${name} branch chip is ${chip.w}×${chip.h}, under 44px`)
  else ok(`${name} branch chip is ${chip.w}×${chip.h}`)
  await ctx.close()
}

const browser = await launch()
await check(browser, 'iphone', phone.iphone)
await check(browser, 'pixel', phone.pixel)
await browser.close()

await withWebKit(async wb => { await check(wb, 'webkit-iphone', devices['iPhone 14']) })

if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
