// dive3 B1/M2/M3: the guest-only build. Passes are minted here with the DEV signing key (unwrapped with the PIN from
// .e2e-pin, never printed). GBASE = guest build preview, BASE = owner build preview.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'; import { webcrypto as C } from 'crypto'
const GB = process.env.GBASE || 'http://localhost:4186/', OB = process.env.BASE || 'http://localhost:4174/', OUT = process.env.OUT || '/tmp/'
const DIR = process.env.GDIR || '/tmp/dist-guest-e2e'
let fails = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++ }
const K = JSON.parse(fs.readFileSync('/workspace/pages-build/keys/dev-keys.json', 'utf8')), PIN = fs.readFileSync('.e2e-pin', 'utf8').trim()
const ub = s => Buffer.from(s, 'base64url'), b64 = b => Buffer.from(b).toString('base64url')
const base = await C.subtle.importKey('raw', new TextEncoder().encode(PIN), 'PBKDF2', false, ['deriveKey'])
const wk = await C.subtle.deriveKey({ name: 'PBKDF2', salt: ub(K.wrap.s), iterations: K.wrap.it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
const priv = await C.subtle.importKey('jwk', JSON.parse(new TextDecoder().decode(await C.subtle.decrypt({ name: 'AES-GCM', iv: ub(K.wrap.iv) }, wk, ub(K.wrap.ct)))), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
const sign = async c => { const body = b64(new TextEncoder().encode(JSON.stringify(c))); const sig = await C.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, new TextEncoder().encode(body)); return `${body}.${b64(sig)}` }
const now = Date.now(), pass = (s, extra = {}) => ({ i: Math.random().toString(36).slice(2, 10), n: 'Pat Fictional', e: now + 2 * 36e5, c: now, s, ...extra })
const pShow = pass('show'), pAll = pass('all', { k: K.allKey }), pExp = pass('show', { e: now - 1000, c: now - 36e5 }), pRev = pass('ops')
const tShow = await sign(pShow), tAll = await sign(pAll), tExp = await sign(pExp), tRev = await sign(pRev)
const [bShow, sShow] = tShow.split('.'), forged = b64(new TextEncoder().encode(JSON.stringify({ ...pShow, s: 'all', e: now + 3650 * 864e5 }))) + '.' + sShow
fs.writeFileSync(DIR + '/revoked.json', JSON.stringify({ ids: [pRev.i] }))
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wkb = await webkit.launch()
const visit = async (br, opts, url) => { const c = await br.newContext(opts); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(3500); return { c, p, errs } }
const money = t => /\$\s?\d[\d,]{2,}/.test(t)
// 1) no link: no staff picker, no Owner, a plain message
{ const { c, p } = await visit(cr, { viewport: { width: 1920, height: 1080 } }, GB)
  ok(await p.locator('[data-testid=guest-locked]').count() === 1 && /guest link/i.test(await p.textContent('[data-testid=guest-locked]')), 'guest build without a pass: "opens from a guest link"')
  ok(await p.locator('[data-role=owner], [data-role]').count() === 0, 'guest build has no staff role picker at all')
  await c.close() }
// 2) key-in-query / ?as=owner tricks
for (const [u, m] of [[`${GB}?as=owner`, '?as=owner'], [`${GB}?staticrypt_pwd=x&remember_me=1`, '?staticrypt_pwd= in the query'], [`${GB}?qa=1&as=owner`, '?qa=1&as=owner']]) {
  const { c, p } = await visit(cr, { viewport: { width: 1440, height: 900 } }, u)
  ok(await p.locator('[data-role=owner]').count() === 0 && await p.locator('[data-testid=guest-locked]').count() === 1, `guest build ${m}: refused, no Owner`); await c.close() }
// 3) Demo pass on iPhone (WebKit): opens as guest, no money, no hooks to force Owner from ?qa
{ const { c, p, errs } = await visit(wkb, devices['iPhone 14'], `${GB}?guest=${tShow}`)
  ok(await p.locator('[data-testid=guest-banner]').count() === 1, 'iPhone: Demo pass opens the guest app')
  ok(!/guest=/.test(await p.evaluate(() => location.href)), 'token removed from the address bar')
  const d = await p.evaluate(() => { const db = window.__store?.getState().db; return db ? { bills: db.bills.length, inv: db.invoices.length, rate: db.employees.some(e => e.rate > 0), rev: (db.history ?? []).some(h => h.revenue > 0), dayRate: db.jobs.some(j => j.dayRate > 0) } : null })
  ok(d && !d.bills && !d.inv && !d.rate && !d.rev && !d.dayRate, 'Demo pass: the guest copy has no bills, invoices, pay, job values or sales history ' + JSON.stringify(d))
  await p.evaluate(() => { location.hash = '/jobs' }); await p.waitForTimeout(1200); ok(!money(await p.textContent('body')), 'Demo pass: Jobs shows no dollar amounts')
  ok(errs.length === 0, 'iPhone guest: no page errors ' + errs.slice(0, 2).join(' | '))
  await p.screenshot({ path: OUT + 'gb-iphone-demo.png' }); await c.close() }
// 4) Everything pass on desktop: money unlocks only with the signed key
{ const { c, p } = await visit(cr, { viewport: { width: 1920, height: 1080 } }, `${GB}?guest=${tAll}`); await p.waitForTimeout(1500)
  const n = await p.evaluate(() => window.__store.getState().db.invoices.length); ok(n > 0, `Everything pass: money dataset decrypted (${n} invoices)`)
  await c.close() }
// 5) forged / expired / revoked
for (const [t, m, re] of [[forged, 'forged "Everything for 10 years" (scope edited, old signature)', /isn’t valid/], [tExp, 'expired pass', /has ended/], [tRev, 'revoked pass (published list)', /turned off/], ['eyJhIjoxfQ.AAAA', 'old HMAC-style token', /isn’t valid/]]) {
  const { c, p } = await visit(cr, { viewport: { width: 1280, height: 800 } }, `${GB}?guest=${t}`)
  const txt = await p.locator('[data-testid=guest-locked]').textContent().catch(() => '')
  ok(re.test(txt) && await p.locator('[data-testid=guest-banner]').count() === 0, `${m}: refused (${txt.slice(0, 40)})`); await c.close() }
// 6) M3: Switch role chip tappable from 640 px up
for (const [w, h] of [[820, 1180], [1280, 800], [1920, 1080], [640, 900]]) {
  const { c, p } = await visit(cr, { viewport: { width: w, height: h } }, `${GB}?guest=${tShow}`)
  const hit = await p.evaluate(() => { const b = document.querySelector('[data-testid=guest-switch]'); if (!b) return 'no chip'; const r = b.getBoundingClientRect(); const pts = [[r.left + 6, r.top + r.height / 2], [r.left + r.width / 2, r.top + r.height / 2], [r.right - 6, r.top + r.height / 2]]; return pts.every(([x, y]) => b.contains(document.elementFromPoint(x, y))) ? 'ok' : 'covered' })
  ok(hit === 'ok', `${w}px: Switch role chip is tappable (${hit})`)
  if (w === 1920) await p.screenshot({ path: OUT + 'gb-1920-guest.png' }); await c.close() }
// 7) framed by another origin → refuses to render
{ const c = await cr.newContext(); const p = await c.newPage(); await p.setContent(`<iframe id=f src="${GB}?guest=${tShow}" width=900 height=700></iframe>`); await p.waitForTimeout(4000)
  const fr = p.frames().find(f => f.url().startsWith(GB)); const t = fr ? await fr.textContent('body').catch(() => '') : ''
  ok(/inside another site/.test(t), 'framed by another site: the app refuses to render'); await c.close() }
// 8) owner build: ?as=owner framed by another site, and key in the query
if (OB) { const c = await cr.newContext(); const p = await c.newPage(); await p.setContent(`<iframe src="${OB}?as=owner" width=900 height=700></iframe>`); await p.waitForTimeout(5000)
  const fr = p.frames().find(f => f.url().startsWith(OB)); ok(fr && /inside another site/.test(await fr.textContent('body').catch(() => '')), 'owner app framed by another site with ?as=owner: refused'); await c.close() }
await cr.close(); await wkb.close()
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0)
