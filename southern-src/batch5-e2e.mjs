import { chromium, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const OUT = '/workspace/southern-app/screenshots/batch5'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []; let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
const watch = (p, tag) => { p.on('pageerror', e => errs.push(`${tag} pageerror ${e.message}`)); p.on('console', m => m.type() === 'error' && !/tile|arcgis|Failed to load|open-meteo|ERR_|WebAuthn|NotAllowed/i.test(m.text()) && errs.push(`${tag} ${m.text()}`)) }
const nav = async (p, k) => { await p.evaluate(k => { location.hash = '/' + k }, k); await p.waitForTimeout(900) }
// ---------- passkey with a CDP virtual platform authenticator ----------
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); watch(p, 'login')
  const cdp = await ctx.newCDPSession(p); await cdp.send('WebAuthn.enable'); await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } })
  await p.goto(base); await p.waitForSelector('[data-testid=passkey-btn]')
  await p.waitForTimeout(1800); await p.screenshot({ path: `${OUT}/login-passkey-desktop.png` })
  await p.click('[data-testid=passkey-btn]'); await p.waitForSelector('[data-testid=passkey-setup]'); await p.waitForTimeout(500)
  await p.screenshot({ path: `${OUT}/passkey-setup-desktop.png` })
  await p.click('[data-testid=passkey-create]'); await p.waitForSelector('[data-testid=bell]', { timeout: 15000 })
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('sc-passkeys') || '[]').length === 1), 'passkey registered, credential id stored locally')
  ok(await p.evaluate(() => JSON.parse(sessionStorage.getItem('sc-session') || '{}').method === 'Passkey (this device)'), 'signed in with passkey')
  await p.evaluate(() => { sessionStorage.removeItem('sc-session') }); await p.reload(); await p.waitForSelector('[data-testid=passkey-btn]')
  ok(/(fingerprint|Face ID|Touch ID|Windows Hello) · Chad/.test(await p.textContent('[data-testid=passkey-btn]')), 'returning user button')
  await p.click('[data-testid=passkey-btn]'); await p.waitForSelector('[data-testid=bell]', { timeout: 15000 })
  ok(true, 'second sign-in via WebAuthn assertion')
  // security center
  await nav(p, 'settings'); await p.getByRole('tab', { name: 'Security center' }).click(); await p.waitForSelector('[data-testid=security-center]')
  ok(await p.locator('[data-testid=passkey-row]').count() === 1, 'passkey listed in security center')
  const d0 = await p.locator('[data-testid=device-row]').count(); await p.locator('[data-testid=remote-signout]').first().click(); await p.waitForTimeout(300)
  ok(await p.locator('[data-testid=device-row]').count() === d0 - 1, 'remote sign-out')
  ok(await p.locator('[data-testid=mask-ssn]').count() === 0, 'ops role does not see the SSN / bank table at all (HR, payroll, owner only)')
  ok(await p.locator('[data-testid=access-matrix] tbody tr').count() > 20, 'access matrix')
  await p.getByRole('tab', { name: 'Security events' }).click(); await p.waitForTimeout(300)
  ok(await p.locator('[data-testid=audit-rows]').count() === 1, 'security events list shown')
  await p.screenshot({ path: `${OUT}/security-center-desktop.png`, fullPage: true })
  await ctx.close()
}
// ---------- 2FA + HR reveal ----------
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage(); watch(p, '2fa')
  await p.goto(base); await p.click('[data-testid=code-btn]'); await p.waitForSelector('[data-testid=twofa]')
  await p.selectOption('[data-testid=twofa] select', 'hr')
  const otp = p.locator('[data-testid=otp]'); for (let i = 0; i < 6; i++) await otp.nth(i).fill('482913'[i])
  await p.screenshot({ path: `${OUT}/twofa-desktop.png` })
  await p.click('[data-testid=otp-verify]'); await p.waitForSelector('[data-testid=bell]', { timeout: 15000 })
  ok(true, '2FA code sign-in')
  await nav(p, 'settings'); await p.getByRole('tab', { name: 'Security center' }).click(); await p.waitForSelector('[data-testid=sensitive-table]')
  await p.locator('[data-testid=mask-ssn]').first().click(); await p.waitForTimeout(300)
  ok(/\d{3}-\d{2}-\d{4}/.test(await p.locator('[data-testid=mask-ssn]').first().textContent()), 'HR reveals SSN')
  await p.getByRole('tab', { name: 'Security events' }).click(); await p.waitForTimeout(300)
  ok(/Revealed sensitive field/.test(await p.textContent('[data-testid=audit-rows]')), 'reveal logged')
  // offline queue
  await p.click('[data-testid=sim-offline]'); await p.waitForSelector('[data-testid=offline-banner]')
  await nav(p, 'myinfo'); await p.waitForTimeout(500)
  await ctx.close()
}
{
  const ctx = await b.newContext({ ...devices['iPhone 14'] }); const p = await ctx.newPage(); watch(p, 'field')
  await p.goto(base); await p.click('[data-role="field"]'); await p.waitForTimeout(1000)
  await p.screenshot({ path: `${OUT}/login-field-mobile.png` })
  // go offline (simulated) via the window offline event — like losing signal
  await ctx.setOffline(true); await p.waitForSelector('[data-testid=offline-banner]', { timeout: 5000 })
  await p.getByText('More', { exact: true }).last().click(); await p.waitForTimeout(400)
  await p.click('[data-testid=tile-checkin]'); await p.locator('[data-testid=field-load]').first().click()
  await p.click('[data-testid=checkin-demo-photo]'); await p.waitForFunction(() => !/Locating/.test(document.querySelector('[data-testid=checkin-gps]')?.textContent || 'Locating'), null, { timeout: 8000 })
  await p.click('[data-testid=checkin-submit]'); await p.waitForTimeout(600)
  ok(/2 will send/.test(await p.textContent('[data-testid=offline-banner]')), 'check-in + photo queued offline')
  await p.screenshot({ path: `${OUT}/offline-queued-mobile.png` })
  await ctx.setOffline(false); await p.waitForSelector('[data-testid=sync-indicator]', { timeout: 6000 })
  await p.waitForTimeout(300); await p.screenshot({ path: `${OUT}/offline-syncing-mobile.png` })
  await p.waitForFunction(() => /All synced/.test(document.querySelector('[data-testid=sync-indicator]')?.textContent || ''), null, { timeout: 8000 })
  ok(true, 'queue synced on reconnect')
  const man = await p.evaluate(async () => (await fetch('./manifest.webmanifest')).json())
  ok(man.icons.some(i => /arrowline/.test(i.src)) && man.display === 'standalone', 'manifest with Arrowline icon')
  ok(await p.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())), 'service worker registered')
  await ctx.close()
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
await b.close(); process.exit(fails || errs.length ? 1 : 0)
