// dive3 whole-app regression pass: every office page as owner + the field app, on 6 device sizes.
// Checks per page: no page errors, no sideways overflow, no "NaN" / "undefined" / "[object Object]" on screen, a heading or content renders.
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4174/'; const OUT = process.env.OUT || '/tmp/sc-e2e/regress/'; fs.mkdirSync(OUT, { recursive: true })
const PAGES = 'command dispatch jobs forecast tickets equipment configs shop inventory people allocations safety time analytics receivables payables windfarms contacts integrations audit settings quotes lifts vault myinfo invhome purchasing requests invguide moves suggest pickup bids weather onboarding store expenses recon changeorders certtracker sitedata maint messages mgmt acctsync fuel pto permits union rigging drugalc guests branding'.split(' ')
const only = process.env.ONLY
const fails = []; const ok = (c, m) => { if (!c) fails.push(m); if (!c || process.env.VERBOSE) console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const DEV = [['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['androidtab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['androidtab800land', cr, { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['desk2560', cr, { viewport: { width: 2560, height: 1440 } }], ['desk3440', cr, { viewport: { width: 3440, height: 1440 } }], ['desk3840', cr, { viewport: { width: 3840, height: 2160 } }]]
let n = 0
for (const [name, br, opts] of DEV) {
  if (only && only !== name) continue
  const c = await br.newContext(opts); const p = await c.newPage(); let cur = 'login'; const errs = []
  p.on('pageerror', e => errs.push(`${cur}: ${e.message.slice(0, 120)}`)); p.on('dialog', d => d.dismiss().catch(() => {}))
  await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await p.evaluate(() => { window.__store.getState().signIn('owner', 'Demo role') }); await W(900)
  for (const pg of PAGES) { cur = pg; n++
    const e0 = errs.length
    await p.evaluate(x => { const s = window.__store.getState(); s.open?.(null); s.go(x) }, pg); await W(700)
    const r = await p.evaluate(() => { const main = document.querySelector('main') ?? document.body; const t = main.innerText || ''
      const bad = (t.match(/\bNaN\b|\bundefined\b|\[object Object\]/g) ?? []).slice(0, 3)
      return { sw: document.documentElement.scrollWidth, vw: window.innerWidth, bad, len: t.trim().length } })
    ok(errs.length === e0, `${name} ${pg}: no page errors (${errs.slice(e0).join(' | ')})`)
    ok(r.sw <= r.vw + 1, `${name} ${pg}: no sideways overflow (${r.sw} > ${r.vw})`)
    ok(!r.bad.length, `${name} ${pg}: no NaN/undefined on screen (${r.bad.join(',')})`)
    ok(r.len > 20, `${name} ${pg}: page renders content (${r.len} chars)`)
    if (['command', 'dispatch', 'forecast', 'shop', 'inventory', 'time', 'branding'].includes(pg)) await p.screenshot({ path: `${OUT}${name}-${pg}.png` })
  }
  // field app
  cur = 'field'; const e1 = errs.length
  await p.evaluate(() => { const s = window.__store.getState(); s.signOut(); s.signIn('field', 'Demo role') }); await W(1200)
  const fr = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth, len: (document.body.innerText || '').trim().length, bad: ((document.body.innerText || '').match(/\bNaN\b|\bundefined\b|\[object Object\]/g) ?? []).length }))
  ok(errs.length === e1 && fr.sw <= fr.vw + 1 && fr.len > 20 && !fr.bad, `${name} field app home renders cleanly (${JSON.stringify(fr)} ${errs.slice(e1).join(' | ')})`)
  await p.screenshot({ path: `${OUT}${name}-field.png` })
  await c.close()
}
console.log(`${n} page views checked`); console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
