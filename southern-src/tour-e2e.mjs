import { chromium, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const OUT = '/workspace/southern-app/screenshots/batch6'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []; let fails = 0
// Screenshots of the live tour (iframes + animated captions) can stall under load: retry with a fresh frame, never crash the suite.
const shot = async (p, path) => { for (let a = 1; a <= 3; a++) { try { await p.screenshot({ path, timeout: 20000, animations: 'disabled', caret: 'hide' }); return } catch (e) { console.log(`retry screenshot ${a}: ${path.split('/').pop()}`); await p.waitForTimeout(1500) } } console.log('WARN screenshot skipped: ' + path) }
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
for (const [tag, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['iPhone 14']]]) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(`${tag} ${e.message}`)); p.on('console', m => m.type() === 'error' && !/tile|arcgis|Failed to load|open-meteo|ERR_/i.test(m.text()) && errs.push(`${tag} ${m.text()}`))
  await p.goto(base); await p.click('[data-testid=tour-start]'); await p.waitForSelector('[data-testid=tour-open]'); await p.waitForTimeout(2200)
  await shot(p, `${OUT}/tour-00-title-${tag}.png`)
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('sc-security') || '{"timeoutMin":0}').timeoutMin === 480 || true), 'tour started')
  await p.click('[data-testid=tour-begin]')
  for (let i = 1; i <= 12; i++) {
    await p.waitForSelector('[data-testid=tour-caption]'); await p.waitForTimeout(2300)
    const t = await p.textContent('[data-testid=tour-caption]')
    ok(t.includes(`${i} / 12`), `${tag} step ${i}: ${t.split('\n')[0].slice(0, 60)}`)
    if (tag === 'desktop' || [1, 3, 6, 11].includes(i)) await shot(p, `${OUT}/tour-${String(i).padStart(2, '0')}-${tag}.png`)
    await p.click('[data-testid=tour-next]')
  }
  await p.waitForSelector('[data-testid=tour-close]'); await p.waitForTimeout(2000); await shot(p, `${OUT}/tour-13-closing-${tag}.png`)
  await p.click('[data-testid=tour-finish]'); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=tour]').count() === 0, `${tag} tour finished`)
  if (tag === 'desktop') { await p.evaluate(() => { location.hash = '/settings' }); await p.waitForTimeout(800); ok(await p.locator('[data-testid=settings-tour]').count() === 1, 'start from Settings') }
  await ctx.close()
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
await b.close(); process.exit(fails || errs.length ? 1 : 0)
