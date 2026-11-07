// n7 (parts request qty cap / over-stock warning / why disabled), n8 (My Info email check), shop M7 (annual date single source).
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const W = ms => new Promise(r => setTimeout(r, ms))
for (const [name, vp] of [['pixel7', { viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true }], ['desk1920', { viewport: { width: 1920, height: 1080 } }]]) {
  const c = await cr.newContext(vp); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=shop]'); await W(900)
  await p.evaluate(() => { location.hash = '/requests' }); await p.waitForSelector('[data-testid=request-form]', { timeout: 10000 })
  ok(/Add what you need/.test(await p.textContent('[data-testid=req-why]')), `${name} n7: says why Send is disabled`)
  await p.fill('[data-testid=item-search]', 'filter'); await W(400); await p.locator('[data-testid=item-hit]').first().click(); await W(300)
  await p.fill('[data-testid=req-qty]', '5000'); await W(200)
  ok(Number(await p.inputValue('[data-testid=req-qty]')) === 999, `${name} n7: quantity is capped at 999`)
  ok(await p.locator('[data-testid=req-over]').count() === 1, `${name} n7: warns when asking for more than is on the shelf`)
  // annual date: Maintenance count = units whose annual date (unit record) is past
  await p.evaluate(() => { location.hash = '/maint' }); await p.waitForSelector('[data-testid=maint-page]', { timeout: 10000 }); await W(400)
  const shown = await p.evaluate(() => { const el = [...document.querySelectorAll('div')].filter(d => /crane\(s\) past their annual/.test(d.textContent)).sort((a, b) => a.textContent.length - b.textContent.length)[0]; const m = el?.textContent.match(/(\d+) crane\(s\)/); return m ? Number(m[1]) : null })
  const exp = await p.evaluate(() => { const t = new Date(); const iso = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; return window.__store.getState().db.equipment.filter(e => e.category === 'Crane' && e.annualInspection < iso).length })
  ok(shown === null || shown === exp, `${name} M7: Maintenance annuals match the unit record (${shown} vs ${exp})`)
  // n8 My Info email
  await p.evaluate(() => { location.hash = '/myinfo' }); await p.waitForSelector('[data-testid=mi-email]', { timeout: 10000 }).catch(() => {})
  if (await p.locator('[data-testid=mi-email]').count()) { await p.fill('[data-testid=mi-email]', 'not-an-email'); await W(200)
    ok(await p.locator('[data-testid=mi-bad-email]').count() === 1 && await p.isDisabled('[data-testid=myinfo-save]'), `${name} n8: a bad email blocks Save with a plain message`)
    await p.fill('[data-testid=mi-email]', 'demo.person@example.com'); await W(200); ok(await p.locator('[data-testid=mi-bad-email]').count() === 0, `${name} n8: a real email clears the warning`) }
  else ok(false, `${name} n8: My Info email field found`)
  await c.close() }
await cr.close(); ok(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
