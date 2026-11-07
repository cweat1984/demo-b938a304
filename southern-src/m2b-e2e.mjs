// Milestone 2b: customer background photos — import (shrunk on device), IndexedDB, rotation, overlay, where; field app / guests excluded.
import { chromium, webkit, devices } from 'playwright'
import path from 'path'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/m2/'; (await import('fs')).mkdirSync(out, { recursive: true })
const files = [path.resolve('test-bg-demo-0.jpg'), path.resolve('test-bg-demo-1.jpg')]
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const center = async (p, sel) => { const l = p.locator(sel).first(); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await W(150); return l }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab1280x800', cr, { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=owner]'); await W(900); await p.evaluate(() => { location.hash = '/branding' }); await p.waitForSelector('[data-testid=bg-card]', { timeout: 10000 })
  ok(await p.evaluate(() => !document.documentElement.dataset.bgphoto), `${name}: no background until the owner adds one`)
  await p.setInputFiles('[data-testid=bg-upload]', files); await p.waitForFunction(() => document.querySelectorAll('[data-testid=bg-photo]').length === 2, null, { timeout: 15000 }).catch(() => {})
  const ws = await p.locator('[data-testid=bg-photo]').evaluateAll(es => es.map(e => Number(e.dataset.w)))
  ok(ws.length === 2 && ws.every(w => w <= 1920), `${name}: 2 photos imported and shrunk (${ws.join(', ')} px wide)`)
  await W(500); const st = await p.evaluate(() => ({ on: document.documentElement.dataset.bgphoto, img: getComputedStyle(document.body).backgroundImage }))
  ok(st.on === '1' && /url\("?blob:/.test(st.img), `${name}: photo paints behind the app with an overlay`)
  const ov = await center(p, '[data-testid=bg-overlay]'); await ov.fill('80'); await W(300)
  ok(await p.evaluate(() => document.documentElement.style.getPropertyValue('--bg-ov')) === '0.8', `${name}: overlay slider changes the overlay`)
  await (await center(p, '[data-testid=bg-rotate]')).selectOption('1'); await W(200)
  await p.reload(); await W(1500); await p.evaluate(() => { location.hash = '/branding' }); await p.waitForSelector('[data-testid=bg-card]'); await W(800)
  ok(await p.locator('[data-testid=bg-photo]').count() === 2 && await p.evaluate(() => document.documentElement.dataset.bgphoto) === '1', `${name}: photos and setting kept after reload (IndexedDB)`)
  ok(await p.inputValue('[data-testid=bg-rotate]') === '1', `${name}: rotation setting kept`)
  await p.screenshot({ path: out + name + '-backgrounds.png' })
  await (await center(p, '[data-testid=bg-photo-del]')).click(); await W(600); ok(await p.locator('[data-testid=bg-photo]').count() === 1, `${name}: a photo can be removed`)
  // field app never shows photos
  await p.evaluate(() => window.__store.getState().signOut()); await W(800)
  ok(await p.evaluate(() => document.documentElement.dataset.bgphoto) === '1', `${name}: sign-in screen shows the customer photo`)
  await p.click('[data-role=field]'); await W(1000)
  ok(await p.evaluate(() => !document.documentElement.dataset.bgphoto), `${name}: field app stays plain (outdoor readability)`)
  await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
