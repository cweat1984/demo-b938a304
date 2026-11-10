/**
 * Bug: Guest is a pass-only role, but the two-step dialog and the passkey setup list
 * offer it. Choosing it signs in with the full staff database (no guest banner, no scrub).
 * Exits 1 while that is still true.
 *
 *   node tests/guest-role-without-pass.mjs
 */
import { launch, newPage, employeeTelCount } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser)

await page.click('[data-testid=code-btn]')
await page.waitForSelector('[data-testid=twofa]')
const twoFaGuest = await page.locator('[data-testid=twofa] option[value=guest]').count()
if (twoFaGuest) fail('two-step account list includes Guest')
else ok('two-step account list hides Guest')

await page.keyboard.press('Escape')
await page.click('[data-testid=passkey-btn]')
await page.waitForSelector('[data-testid=passkey-role]')
const passkeyGuest = await page.locator('[data-testid=passkey-role] option[value=guest]').count()
if (passkeyGuest) fail('passkey setup list includes Guest')
else ok('passkey setup list hides Guest')
await page.keyboard.press('Escape')

// The staff picker itself stays hidden. A guest sign-in that is not a signed pass
// must be refused, or must scrub staff phones and show the guest banner.
await page.click('[data-testid=code-btn]')
await page.waitForSelector('[data-testid=twofa]')
if (await page.locator('[data-testid=twofa] option[value=guest]').count()) {
  await page.locator('[data-testid=twofa] select').selectOption('guest')
  const shown = ((await page.locator('[data-testid=twofa] b').first().innerText()).match(/\d/g) || []).join('')
  await page.locator('[data-testid=otp]').first().click()
  await page.keyboard.type(shown)
  await page.click('[data-testid=otp-verify]')
  await page.waitForTimeout(800)
  const session = await page.evaluate(() => ({
    role: window.__store.getState().session?.role ?? null,
    banner: !!document.querySelector('[data-testid=guest-banner]'),
    phones: window.__store.getState().db.employees.filter(e => String(e.phone || '').replace(/\D/g, '').length >= 7).length,
  }))
  if (session.role === 'guest' && !session.banner) fail('guest sign-in from the two-step dialog has no guest-pass banner')
  if (session.phones > 0) fail(`guest sign-in kept ${session.phones} employee phone numbers in memory`)
  if (session.role === 'guest') {
    await page.evaluate(() => window.__store.getState().guestSwitch('field'))
    await page.waitForTimeout(500)
    const tels = await employeeTelCount(page)
    if (tels > 0) fail(`field view for this guest exposes ${tels} employee phone links`)
    else ok('field view hides employee phones')
  }
}

await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
