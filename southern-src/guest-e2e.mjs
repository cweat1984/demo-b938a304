import { chromium } from 'playwright'
const openDock = async pg => { const h = pg.locator('[data-testid=fb-handle]'); if (await h.isVisible().catch(() => false) && !(await pg.locator('[data-testid=suggest-btn]').isVisible())) { await h.click(); await pg.waitForTimeout(150) } }
const PIN = (await import('fs')).readFileSync(new URL('./.e2e-pin', import.meta.url), 'utf8').trim() // never printed
const typePin = async (pg, pin) => { for (const d of pin) await pg.click(`[data-pin="${d}"]`); await pg.waitForTimeout(250); await pg.waitForFunction(() => !/Checking/.test(document.querySelector('[data-testid=pin-msg]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {}) }
const base = process.env.BASE || 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/guest/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = [], fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const watch = p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(m.text()) }) }
const has = (p, sel, t = 6000) => p.locator(sel).first().waitFor({ timeout: t }).then(() => true, () => false)
// owner makes passes
const oc = await browser.newContext({ viewport: { width: 1440, height: 950 }, permissions: ['clipboard-read', 'clipboard-write'] }); const o = await oc.newPage(); watch(o)
await o.goto(base); await o.waitForSelector('[data-role=owner]', { timeout: 20000 })
ok(await o.locator('[data-role=guest]').count() === 0, 'guest role hidden from login')
await o.click('[data-role=owner]'); await o.waitForTimeout(800); await o.evaluate(() => { location.hash = '/guests' }); ok(await has(o, '[data-testid=gp-pin-gate]') && await o.locator('[data-testid=guest-new]').count() === 0, 'Guest passes is PIN-locked for the owner')
await typePin(o, PIN.split('').reverse().join('') === PIN ? '0000' : PIN.split('').reverse().join('')); ok(/Wrong PIN/.test(await o.textContent('[data-testid=pin-msg]')) && await o.locator('[data-testid=guest-new]').count() === 0, 'wrong PIN is refused')
await typePin(o, PIN); ok(await has(o, '[data-testid=guest-passes]') && await has(o, '[data-testid=guest-new]'), 'right PIN unlocks Guest passes')
ok(!(await o.textContent('body')).includes(PIN), 'the PIN never appears on screen')
await o.click('[data-testid=gp-lock]'); ok(await has(o, '[data-testid=gp-pin-gate]'), 'Lock button locks it again'); await typePin(o, PIN)
await o.reload(); await o.waitForTimeout(1200); await o.evaluate(() => { location.hash = '/guests' }); ok(await has(o, '[data-testid=guest-new]'), 'unlock lasts for the browser session')
ok(await o.getAttribute('[data-testid=guest-dur-2h]', 'data-selected') === 'true', '2 hours is the default duration')
for (const k of ['1h', '24h', '3d', '7d', 'custom']) ok(await o.locator(`[data-testid=guest-dur-${k}]`).count() === 1, `duration option ${k}`)
await o.fill('[data-testid=guest-name]', 'Pat Morgan'); await o.fill('[data-testid=guest-note]', 'Valley Wind demo'); await o.click('[data-testid=guest-create]'); await o.waitForTimeout(500)
const link = await o.textContent('[data-testid=guest-link]'); ok(/\?guest=[\w-]+\.[\w-]+/.test(link), 'signed link created')
ok(await o.locator('[data-testid=guest-row][data-status=Active]').count() === 1, 'listed as active'); await o.screenshot({ path: out + '01-owner-passes.png' })
const u = l => base + l.slice(l.indexOf('?'))
// guest opens the 2h link
const gc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); const g = await gc.newPage(); watch(g)
await g.goto(u(link)); ok(await has(g, '[data-testid=guest-banner]', 15000), 'guest lands signed in with banner')
ok(/Pat Morgan/.test(await g.textContent('[data-testid=guest-banner]')) && /1h 5\dm|2h 00m|1h/.test(await g.textContent('[data-testid=guest-countdown]')), 'countdown shows ~2h: ' + await g.textContent('[data-testid=guest-countdown]'))
ok(!(await g.evaluate(() => location.search)).includes('guest='), 'token stripped from address bar')
const before = await g.evaluate(() => window.__store.getState().db.notices.length)
await g.evaluate(() => window.__store.getState().commit('Dispatched crane', 'x', 'y', db => { db.notices.unshift({ id: 'zz', at: '', sev: 'info', title: 'should not happen', body: '' }) }))
ok(await g.evaluate(() => window.__store.getState().db.notices.length) === before, 'guest writes are blocked (read-only)')
ok(await g.evaluate(() => window.__store.getState().session.role) === 'guest', 'guest role')
await g.evaluate(() => { location.hash = '/guests' }); await g.waitForTimeout(600); ok(await g.locator('[data-testid=guest-passes]').count() === 0, 'guest cannot open Guest passes')
ok(await g.evaluate(() => !(window.__scNav || []).some(k => ['guests', 'branding'].includes(k))), 'guest nav has no Guest passes or Branding')
ok(await g.locator('[data-testid=gp-pin-gate]').count() === 0 && !/Guest passes/i.test(await g.textContent('main')), 'guest typing #/guests just lands on the home page')
await g.evaluate(() => { location.hash = '/branding' }); await g.waitForTimeout(600); ok(await g.locator('[data-testid=branding-page]').count() === 0, 'guest cannot open Company Branding')
await g.locator('[data-testid=more-btn]').click(); await g.fill('[data-testid=more-search]', 'guest pass'); await g.waitForTimeout(300)
ok(await g.locator('[data-testid=more-item][data-key=guests]').count() === 0, 'More search never lists Guest passes for a guest'); ok(await g.locator('text=/sign out/i').count() === 0, 'no sign-out to the staff role picker for a guest (guest Switch role stays inside the pass)'); await g.keyboard.press('Escape'); await g.waitForTimeout(300)
await g.evaluate(() => window.__store.getState().setUI({ cmdOpen: true })); await g.fill('[data-testid=ask-input]', 'guest pass'); await g.waitForTimeout(400); ok(await g.locator('[data-page=guests]').count() === 0 && await g.locator('[cmdk-item]', { hasText: 'Guest Passes' }).count() === 0, 'quick search never lists Guest passes for a guest'); await g.keyboard.press('Escape')
await g.evaluate(() => window.__store.getState().commit('Suggestion posted', 'Suggest board', 't', () => {}, { silent: true }))
await openDock(g); ok(await has(g, '[data-testid=suggest-btn]') && await has(g, '[data-testid=notepad-btn]'), 'Suggest + design-notes buttons available to guest')
await openDock(g); await g.click('[data-testid=suggest-btn]'); ok(await has(g, '[data-testid=suggest-form]'), 'guest can open Suggest form'); await g.keyboard.press('Escape'); await g.screenshot({ path: out + '02-guest-banner-phone.png' })
await g.reload(); ok(await has(g, '[data-testid=guest-banner]', 15000), 'pass survives reload')
// tampered token
const t2 = await gc.newPage(); await t2.goto(u(link).replace(/\.([\w-])/, '.A$1')); ok(await has(t2, '[data-testid=guest-locked]', 15000), 'tampered link → lockout'); await t2.close()
// expiry by timer (fake clock jumps past the 2h), then on load and on route change
const sc = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await sc.clock.install(); const s = await sc.newPage(); watch(s)
await s.goto(u(link)); ok(await has(s, '[data-testid=guest-banner]', 15000), 'second browser: banner')
await sc.clock.fastForward('02:00:05'); await sc.clock.runFor(2000)
ok(await has(s, '[data-testid=guest-locked]', 8000), 'timer locks the guest out at expiry'); await s.screenshot({ path: out + '03-expired-lockout.png' })
await s.reload(); ok(await has(s, '[data-testid=guest-locked]', 10000), 'lockout enforced on load'); await s.evaluate(() => { location.hash = '/command' }); ok(await has(s, '[data-testid=guest-locked]'), 'lockout on route change')
// revoke (owner browser)
await o.locator('[data-testid=guest-row][data-status=Active]', { hasText: 'Pat Morgan' }).locator('[data-testid=guest-revoke]').click(); await o.waitForTimeout(300)
ok(await o.locator('[data-testid=guest-row][data-status=Revoked]').count() === 1, 'owner revokes → listed Revoked'); await o.screenshot({ path: out + '04-revoked.png' })
const r = await oc.newPage(); await r.goto(u(link)); ok(await has(r, '[data-testid=guest-locked] >> text=turned off', 15000), 'revoked link refused in owner browser'); await r.close()
// a guest who signs out (or trims the link) never gets the staff role picker → can't mint links as Owner
{ const xc = await browser.newContext({ viewport: { width: 390, height: 844 } }); const x = await xc.newPage(); watch(x); await x.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await x.goto(base + '?guest=' + link.split('?guest=')[1].split('#')[0]); ok(await has(x, '[data-testid=guest-banner]', 15000), 'third browser: guest pass opens')
  await x.evaluate(() => window.__store.getState().signOut()); await x.waitForTimeout(800)
  ok(await has(x, '[data-testid=guest-device]') && await x.locator('[data-role=owner]').count() === 0, 'guest who signs out sees no role picker (cannot become Owner)')
  await x.reload(); await x.waitForTimeout(1500); ok(await x.locator('[data-role=owner]').count() === 0, '…still no role picker after reload (pass resumes)')
  await x.evaluate(() => window.__store.getState().signOut()); await x.waitForTimeout(600); await x.click('[data-testid=guest-device-staff]'); await x.waitForTimeout(500); for (const d of PIN) await x.click(`[data-testid=guest-device-pin] [data-pin="${d}"]`); await x.waitForTimeout(2500); ok(await x.locator('[data-role=owner]').count() > 0, 'Staff sign-in (owner PIN) clears it (live site asks for the site password)'); await xc.close() }
{ const tc = await browser.newContext(); const t = await tc.newPage(); await t.goto(base + '#staticrypt_pwd=trimmed'); ok(await has(t, '[data-testid=guest-locked]', 15000), 'guest link with the ?guest= part cut off is refused'); await t.reload(); await t.waitForTimeout(1200); ok(await t.locator('[data-role=owner]').count() === 0, '…and that browser gets no role picker'); await tc.close() }
// 5 wrong PINs → 60-second lockout
{ const lc = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await lc.clock.install(); const l = await lc.newPage(); await l.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await l.goto(base); await l.click('[data-role=owner]'); await l.waitForTimeout(800); await l.evaluate(() => { location.hash = '/guests' }); await has(l, '[data-testid=gp-pin-gate]')
  ok(await l.getAttribute('[data-testid=pin-input]', 'inputmode') === 'numeric', 'PIN entry uses the numeric keypad on iPhone')
  const bad = PIN === '1111' ? '2222' : '1111'; for (let i = 0; i < 5; i++) await typePin(l, bad)
  ok(/Too many tries/.test(await l.textContent('[data-testid=pin-msg]')) && await l.locator('[data-pin="1"]').isDisabled(), '5 wrong tries → locked out')
  await l.screenshot({ path: out + '05-pin-lockout-phone.png' })
  await lc.clock.fastForward('01:05'); await l.waitForTimeout(600); await typePin(l, PIN); ok(await has(l, '[data-testid=guest-new]'), 'after 60 s the right PIN works'); await lc.close() }
ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''))
await browser.close(); console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0)
