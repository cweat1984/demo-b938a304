/**
 * Bug: a passkey sign-in trusts the role stored next to the credential in localStorage.
 * Register as Shop, change that stored role to owner, and the same authenticator
 * signs in as Owner. Exits 1 while that is still true.
 * WebAuthn needs a hostname (localhost), not a raw IP.
 *
 *   node tests/passkey-role-escalation.mjs
 */
import { launch, base } from './support.mjs'

if (!/^https?:\/\/(localhost|\[::1\])(:|\/|$)/.test(base)) {
  console.log('SKIP passkey role check needs BASE on localhost, got ' + base)
  process.exit(0)
}

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('WebAuthn.enable')
await cdp.send('WebAuthn.addVirtualAuthenticator', {
  options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
})
await page.goto(base)
await page.waitForSelector('[data-testid=passkey-btn]')
await page.click('[data-testid=passkey-btn]')
await page.waitForSelector('[data-testid=passkey-role]')
await page.selectOption('[data-testid=passkey-role]', 'shop')
await page.click('[data-testid=passkey-create]')
await page.waitForSelector('[data-testid=bell]', { timeout: 20000 })
const registered = await page.evaluate(() => window.__store.getState().session?.role ?? null)
if (registered !== 'shop') fail('passkey setup did not sign in as shop (got ' + registered + ')')
else ok('passkey registered as shop')

await page.evaluate(() => window.__store.getState().signOut())
await page.waitForSelector('[data-testid=passkey-btn]')
await page.evaluate(() => {
  const list = JSON.parse(localStorage.getItem('sc-passkeys') || '[]')
  if (list[0]) list[0].role = 'owner'
  localStorage.setItem('sc-passkeys', JSON.stringify(list))
})
await page.click('[data-testid=passkey-btn]')
await page.waitForTimeout(2500)
const after = await page.evaluate(() => ({
  role: window.__store.getState().session?.role ?? null,
  method: window.__store.getState().session?.method ?? null,
  page: window.__store.getState().ui.page,
}))
if (after.role === 'owner') fail('edited passkey record signed in as owner via ' + after.method + ' on ' + after.page)
else if (after.role === 'shop') ok('passkey still signs in as shop')
else fail('passkey sign-in ended as ' + after.role)

await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
