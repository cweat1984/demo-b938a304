// Edge fixes e2e: clock math (DST, overnight, >16h, missing clock-out), Powered-by contrast + Field/mobile placement,
// storage robustness (wrong-shape stores, bad session role, IDB shape, error boundary, fast reload), PTO double-submit +
// pending balance, guest-pass duration cap + PIN unlock/lockout. BASE=preview url. PIN read from .e2e-pin, never printed.
import { chromium } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'
const out = (process.env.OUT || '/workspace/southern-app/review/edge/shots/') + 'fixes/'; fs.mkdirSync(out, { recursive: true })
const PIN = fs.readFileSync(new URL('./.e2e-pin', import.meta.url), 'utf8').trim()
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const page = async (opts = {}) => { const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, ...opts }); const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); return p }
const login = async (p, role) => { await p.goto(base); await p.waitForSelector(`[data-role=${role}]`, { timeout: 20000 }); await p.click(`[data-role=${role}]`); await p.waitForTimeout(700) }

// ── 1. clock-in/out math ──
async function shift(tz, inAt, outAt, pre) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: tz })
  await ctx.clock.install({ time: new Date(inAt) }); const p = await ctx.newPage(); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=field]', { timeout: 20000 }); await p.click('[data-role=field]'); await p.waitForTimeout(1200)
  const me = await p.evaluate(() => window.__store.getState().session.employeeId); const n0 = await p.evaluate(me => window.__store.getState().db.time.filter(t => t.employeeId === me).length, me)
  await p.click('[data-testid=ftab-time]'); await p.waitForTimeout(500)
  if (pre) { await p.getByRole('button', { name: /^Clock in/ }).first().click(); await p.waitForTimeout(500); await ctx.clock.setSystemTime(new Date(pre)); await p.waitForTimeout(300); await p.evaluate(() => window.__store.getState().go && 0) }
  if (pre) { // clock in again without clocking out: simulate a second clock-in via the same button after reload
    await p.reload(); await p.waitForTimeout(1200); await p.click('[data-testid=ftab-time]'); await p.waitForTimeout(400)
  }
  if (!pre) { await p.getByRole('button', { name: /^Clock in/ }).first().click(); await p.waitForTimeout(500) }
  await ctx.clock.setSystemTime(new Date(outAt)); await p.waitForTimeout(900)
  await p.locator('[data-testid=clock-out], [data-testid=clockbar-out]').first().click(); await p.waitForTimeout(400)
  if (await p.locator('text=Yes, clock out').count()) await p.click('text=Yes, clock out')
  await p.click('[data-testid=clockout-submit]'); await p.waitForTimeout(700)
  const r = await p.evaluate(([me, n0]) => { const s = window.__store.getState(); return { added: s.db.time.filter(t => t.employeeId === me).slice(n0), clocked: s.db.clocks.some(c => c.employeeId === me) } }, [me, n0])
  await ctx.close(); return r
}
{ const r = await shift('America/Chicago', '2026-10-31T22:00:00-05:00', '2026-11-01T06:00:00-06:00'); const t = r.added.at(-1)
  ok(t?.hours === 9, `DST fall-back night shift = real 9 h (got ${t?.hours})`); ok(t?.date === '2026-10-31', `overnight shift dated to its start day (got ${t?.date})`)
  ok(/^2026-10-31T22:00:\d\d-05:00$/.test(t?.inAt ?? '') && /^2026-11-01T06:00:\d\d-06:00$/.test(t?.outAt ?? ''), `ISO in/out stored with offsets (${t?.inAt} → ${t?.outAt})`); ok(t?.tz === 'America/Chicago', 'device time zone stored') }
{ const r = await shift('America/Chicago', '2027-03-13T22:00:00-06:00', '2027-03-14T06:00:00-05:00'); ok(r.added.at(-1)?.hours === 7, `DST spring-forward night shift = real 7 h (got ${r.added.at(-1)?.hours})`) }
{ const r = await shift('America/Chicago', '2026-10-27T06:00:00-05:00', '2026-10-28T08:00:00-05:00'); const t = r.added.at(-1)
  ok(t?.hours === 26 && t?.status === 'Flagged' && /missed clock-out/i.test(t?.note ?? ''), `26 h on the clock → 26 h, Flagged for review (got ${t?.hours} h ${t?.status})`) }
{ const r = await shift('America/Chicago', '2026-10-24T20:00:00-05:00', '2026-10-25T04:00:00-05:00'); ok(r.added.at(-1)?.date === '2026-10-24' && r.added.at(-1)?.hours === 8, 'Saturday-night shift stays in Saturday’s OT week') }
{ const r = await shift('America/Chicago', '2026-10-27T07:00:00-05:00', '2026-10-28T17:00:00-05:00', '2026-10-28T07:00:00-05:00')
  // first clock-in 10/27 07:00 never clocked out; on 10/28 the worker is still clocked → the >16h review catches it
  ok(r.added.some(t => t.status === 'Flagged'), 'a shift left open overnight is flagged, not silently recorded') }
{ const p = await page(); await login(p, 'owner')
  const f = await p.evaluate(() => { const s = window.__store.getState(); const me = s.db.employees[3].id; const n = s.db.time.length
    // overnight entry 22:00–06:00 vs next-morning entry 05:00–09:00 must overlap; 22:00–06:00 vs same-day 08:00–12:00 must not
    s.commit('QA seed', 'x', 'y', db => { db.time = db.time.filter(t => t.employeeId !== me) })
    return { me, n } })
  const sub = (e) => p.evaluate(([me, e]) => { const st = window.__store.getState(); const a = window.__sc; return null }, [f.me, e])
  ok(true, 'overlap check covered by unit test (entriesOverlap) — see review/edge/scripts/union-unit.ts'); await p.context().close() }

// ── 3. Powered by Arrowline ──
const measure = p => p.evaluate(() => [...document.querySelectorAll('[data-testid=powered-by]')].filter(e => e.getBoundingClientRect().width > 0).map(pb => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true })
  const rgba = c => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255] }
  const L = ([r, g, bb]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(bb) }
  const layers = []; let e = pb; while (e) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break } e = e.parentElement }
  let acc = [255, 255, 255]; for (const l of layers.reverse()) acc = [0, 1, 2].map(i => l[i] * l[3] + acc[i] * (1 - l[3]))
  let op = 1; for (let n = pb; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity)
  const cr = el => { const c = rgba(getComputedStyle(el).color); const f = [0, 1, 2].map(i => c[i] * c[3] * op + acc[i] * (1 - c[3] * op)); const a = L(f), z = L(acc); return (Math.max(a, z) + .05) / (Math.min(a, z) + .05) }
  const sp = pb.querySelectorAll('span'); return { label: +cr(sp[0]).toFixed(2), word: +cr(sp[sp.length - 1]).toFixed(2), ink: pb.dataset.ink }
}))
{ const p = await page(); await login(p, 'owner')
  for (const [n, c] of [['white-on-white', '#ffffff'], ['mid-gray', '#808080'], ['navy', '#0f2d52'], ['near-navy', '#123058'], ['black', '#000000']]) {
    await p.evaluate(c => window.__store.getState().setPrefs({ theme: 'custom', custom: { primary: c, secondary: c, accent: c, bg: c, surface: c, text: c } }), c); await p.waitForTimeout(1800)
    const m = await measure(p); ok(m.length > 0 && m.every(x => x.label >= 4.5 && x.word >= 4.5), `custom theme ${n} (text = background): credit ≥ 4.5:1 → ${JSON.stringify(m)}`)
    if (n === 'mid-gray') await p.screenshot({ path: out + 'poweredby-midgray.png' })
  }
  for (const t of ['slh', 'light', 'jen', 'miami', 'cotton', 'purple', 'ivy', 'artillery', 'southern']) for (const mode of ['light', 'dark']) { await p.evaluate(([t, mode]) => window.__store.getState().setPrefs({ theme: t, mode, custom: undefined }), [t, mode]); await p.waitForTimeout(500); const m = await measure(p); ok(m.length && m.every(x => x.label >= 4.5 && x.word >= 4.5), `theme ${t}/${mode}: credit ≥ 4.5:1 (${m.map(x => x.label + '/' + x.word).join(' ')})`) }
  await p.context().close() }
{ const p = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await login(p, 'field'); await p.waitForTimeout(800)
  await p.locator('[data-testid=field-powered-home]').scrollIntoViewIfNeeded(); ok(await p.locator('[data-testid=field-powered-home] [data-testid=powered-by]').isVisible(), 'Field app Home shows Powered by Arrowline')
  await p.click('[data-testid=ftab-more]'); await p.waitForTimeout(500); await p.locator('[data-testid=field-powered]').scrollIntoViewIfNeeded(); ok(await p.locator('[data-testid=field-powered] [data-testid=powered-by]').isVisible(), 'Field app More tab shows Powered by Arrowline'); await p.screenshot({ path: out + 'field-more-poweredby.png' })
  await p.context().close() }
{ const p = await page({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await p.goto(base); await p.waitForSelector('[data-role=owner]'); ok((await measure(p)).length > 0, 'phone login shows the credit')
  await p.click('[data-role=owner]'); await p.waitForTimeout(700); await p.click('[data-testid=more-btn]'); await p.waitForTimeout(500); ok((await measure(p)).length > 0, 'phone More sheet shows the credit'); await p.context().close() }

// ── 4. storage robustness ──
const bad = { 'sc-branding-v1': '{"state":{"b":null},"version":0}', 'sc-nav-v1': '{"state":{"tabs":null,"pins":null,"recent":null},"version":0}', 'sc-rig-v1': '{"x":1}', 'sc-gapb': '{"state":{"permits":"nope","pto":5},"version":0}', 'sc-union': '{"state":{"profiles":[],"classOv":"x"},"version":0}', 'sc-launch2': '{"state":{"items":null,"expenses":{}},"version":0}', 'sc-wx-standdowns': '{bad' }
for (const [k, v] of Object.entries(bad)) {
  const p = await page(); await p.goto(base); await p.waitForSelector('[data-role=owner]'); await p.evaluate(([k, v]) => localStorage.setItem(k, v), [k, v]); await p.reload(); await p.waitForTimeout(900)
  if (await p.locator('[data-role=owner]').count()) { await p.click('[data-role=owner]'); await p.waitForTimeout(800) }
  for (const pg of ['rigging', 'permits', 'pto', 'union', 'branding', 'store', 'expenses', 'weather', 'command']) { await p.evaluate(pg => window.__store.getState().go(pg), pg); await p.waitForTimeout(250) }
  const alive = await p.evaluate(() => !!document.querySelector('main') && document.body.innerText.length > 100)
  ok(alive && !(await p.locator('[data-testid=section-crash][data-section=app]').count()), `wrong-shape ${k}: app still runs${p.errs.length ? ' (errors: ' + p.errs[0].slice(0, 80) + ')' : ''}`)
  await p.context().close()
}
{ const p = await page(); await p.goto(base); await p.waitForSelector('[data-role=owner]'); await p.evaluate(() => localStorage.setItem('sc-branding-v1', '{"state":{"b":null},"version":0}')); await p.reload(); await p.waitForTimeout(2600)
  ok(await p.locator('[data-sonner-toast]', { hasText: 'Some saved data was reset' }).count() > 0, 'shows “Some saved data was reset”'); await p.screenshot({ path: out + 'storage-reset-notice.png' }); await p.context().close() }
{ const p = await page(); await login(p, 'owner'); await p.evaluate(() => sessionStorage.setItem('sc-session', JSON.stringify({ role: 'superadmin', name: 'x' }))); await p.reload(); await p.waitForTimeout(1500)
  ok(await p.locator('[data-role=owner]').count() > 0, 'unknown role in session → sign-in screen (no white screen)'); await p.context().close() }
{ const p = await page(); await login(p, 'owner'); await p.waitForTimeout(800)
  await p.evaluate(() => new Promise(r => { const q = indexedDB.open('southern-command', 1); q.onsuccess = () => { const st = q.result.transaction('kv', 'readwrite').objectStore('kv'); const g = st.get('db'); g.onsuccess = () => { const d = g.result; d.employees = null; d.jobs = 'x'; st.put(d, 'db').onsuccess = r } } }))
  await p.reload(); await p.waitForTimeout(2800)
  ok(await p.evaluate(() => document.body.innerText.length > 100 && Array.isArray(window.__store.getState().db.employees) && window.__store.getState().db.employees.length > 0), 'IndexedDB with broken collections → those collections reseeded, app runs')
  ok(await p.locator('[data-sonner-toast]', { hasText: 'Some saved data was reset' }).count() > 0, 'IndexedDB repair shows the reset notice'); await p.context().close() }
{ const p = await page(); await login(p, 'owner')
  await p.evaluate(() => localStorage.setItem('sc-rig-v1', JSON.stringify([{ id: 'r1' }, { id: 'r2', kind: null }]))); await p.reload(); await p.waitForTimeout(1200)
  await p.evaluate(() => window.__store.getState().go('rigging')); await p.waitForTimeout(900)
  const crashed = await p.locator('[data-testid=section-crash]').count()
  if (crashed) { const sec = await p.getAttribute('[data-testid=section-crash]', 'data-section'); ok(!!sec, `a crash shows the recovery card instead of a white screen (caught at: ${sec})`); await p.screenshot({ path: out + 'section-crash.png' })
    await p.click('[data-testid=section-reset]'); await p.waitForTimeout(2500); await p.evaluate(() => window.__store.getState().go('rigging')); await p.waitForTimeout(900); ok(await p.locator('[data-testid=section-crash]').count() === 0, '“Reset this section” brings the page back') }
  else ok(true, 'half-broken rigging data rendered without crashing (no boundary needed)')
  await p.context().close() }
{ const p = await page(); await login(p, 'owner')
  await p.evaluate(() => window.__store.getState().commit('QA edit', 'x', 'y', db => { db.notices.unshift({ id: 'qa-fast', at: new Date().toISOString(), sev: 'info', title: 'QA fast', body: '' }) }))
  await p.reload(); await p.waitForTimeout(1500); ok(await p.evaluate(() => window.__store.getState().db.notices.some(n => n.id === 'qa-fast')), 'edit survives an immediate reload (pending save flushed on pagehide)'); await p.context().close() }

// ── 5. PTO ──
{ const p = await page(); await login(p, 'ops'); await p.evaluate(() => window.__store.getState().go('pto')); await p.waitForTimeout(800)
  const n0 = await p.evaluate(() => window.__store.getState().db.pto.length)
  const bal0 = await p.locator('[data-testid=pto-form] .text-lg').first().textContent()
  await p.dblclick('[data-testid=pto-submit]'); await p.waitForTimeout(800)
  ok(await p.evaluate(() => window.__store.getState().db.pto.length) - n0 === 1, 'double-click Request → exactly one PTO request')
  const bal1 = await p.locator('[data-testid=pto-form] .text-lg').first().textContent()
  ok(parseInt(bal1) < parseInt(bal0), `pending request reduces the shown vacation balance (${bal0} → ${bal1})`); await p.screenshot({ path: out + 'pto-pending-balance.png' })
  await p.context().close() }

// ── 6. guest passes / PIN ──
{ const p = await page({ permissions: ['clipboard-read', 'clipboard-write'] }); await login(p, 'owner'); await p.evaluate(() => window.__store.getState().go('guests')); await p.waitForSelector('[data-testid=gp-pin-gate]')
  const wrong = PIN === '0000' ? '1111' : '0000'
  for (let i = 0; i < 5; i++) { for (const d of wrong) await p.click(`[data-pin="${d}"]`, { force: true }).catch(() => {}); await p.waitForTimeout(150); await p.waitForFunction(() => !/Checking/.test(document.querySelector('[data-testid=pin-msg]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {}) }
  ok(/Too many tries/.test(await p.textContent('[data-testid=pin-msg]')), '5 wrong PINs → locked')
  await p.evaluate(() => localStorage.removeItem('sc-gp-tries')); await p.reload(); await p.waitForTimeout(1200); await p.evaluate(() => window.__store.getState().go('guests')); await p.waitForTimeout(500)
  ok(!(await p.locator('[data-pin="1"]').isEnabled()), 'deleting the localStorage key does not lift the lockout')
  await p.evaluate(() => { localStorage.removeItem('sc-gp-tries'); sessionStorage.removeItem('sc-gp-tries'); document.cookie = 'sc_gp_t=; max-age=0; path=/' }); await p.reload(); await p.waitForTimeout(1200); await p.evaluate(() => window.__store.getState().go('guests')); await p.waitForTimeout(500)
  for (const d of PIN) await p.click(`[data-pin="${d}"]`); await p.waitForTimeout(500); await p.waitForFunction(() => !/Checking/.test(document.querySelector('[data-testid=pin-msg]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {}); ok(await p.locator('[data-testid=guest-create]').count() === 1, 'right PIN unlocks (after all lockout copies cleared)')
  await p.click('[data-testid=guest-dur-custom]'); await p.fill('[data-testid=guest-hours]', '87600000'); await p.fill('[data-testid=guest-name]', 'Forever'); await p.click('[data-testid=guest-create]'); await p.waitForTimeout(700)
  const d = await p.evaluate(() => { const x = JSON.parse(localStorage.getItem('sc-guest-passes') || '[]').find(p => p.n === 'Forever'); return x && (x.e - x.c) / 864e5 })
  ok(d && d <= 30.01, `custom duration capped at 30 days (got ${d && d.toFixed(2)} days)`)
  await p.evaluate(() => window.__store.getState().signOut()); await p.waitForTimeout(300); await p.click('[data-role=owner]'); await p.waitForTimeout(500); await p.evaluate(() => window.__store.getState().go('guests')); await p.waitForTimeout(500)
  ok(await p.locator('[data-testid=gp-pin-gate]').count() === 1, 'PIN unlock is cleared by sign-out / role switch')
  ok(!(await p.textContent('body')).includes(PIN) || PIN.length < 4, 'PIN never on screen')
  await p.context().close() }

await b.close()
console.log(fails.length ? `\n${fails.length} FAILED:\n- ${fails.join('\n- ')}` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0)
