/**
 * Bug: passkey setup on a raw IP (http://127.0.0.1) throws SecurityError
 * "This is an invalid domain" and the UI says the user cancelled.
 * Exits 1 while the message is still the cancel text.
 *
 *   IP_BASE=http://127.0.0.1:5199/ node tests/passkey-ip-host.mjs
 */
import { chromium } from 'playwright'

const ipBase = process.env.IP_BASE || 'http://127.0.0.1:5199/'
const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('WebAuthn.enable')
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
})
await page.goto(ipBase)
await page.waitForSelector('[data-testid=passkey-btn]')
await page.click('[data-testid=passkey-btn]')
await page.waitForSelector('[data-testid=passkey-create]')
if (await page.locator('[data-testid=passkey-create]').isDisabled()) {
  fail('passkey create is disabled on an IP host before the user tries')
} else {
  await page.click('[data-testid=passkey-create]')
  await page.waitForTimeout(1500)
  const toast = (await page.locator('[data-sonner-toast], [data-sonner-toaster]').allInnerTexts().catch(() => [])).join(' ')
  const signedIn = await page.locator('[data-testid=bell]').count()
  if (signedIn) ok('passkey created on the IP host')
  else if (/cancel/i.test(toast)) fail('IP-host passkey failure is described as cancelled: ' + toast.replace(/\s+/g, ' ').slice(0, 180))
  else if (/address|hostname|domain|localhost/i.test(toast)) ok('IP-host failure names the address problem')
  else fail('passkey create on an IP host did not sign in and did not explain why: ' + toast.replace(/\s+/g, ' ').slice(0, 180))
}
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
