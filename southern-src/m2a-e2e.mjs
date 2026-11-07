// Milestone 2a: logo → theme (upload or web address), color extraction, WCAG-checked options, saved presets, Powered by Arrowline kept.
import { chromium, webkit, devices } from 'playwright'
import path from 'path'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/m2/'; (await import('fs')).mkdirSync(out, { recursive: true })
const logo = path.resolve('test-logo-demo.png')
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const click = async (p, sel) => { const l = p.locator(sel).first(); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await W(150); await l.click() }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800x1280', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=owner]'); await W(900); await p.evaluate(() => { location.hash = '/branding' }); await p.waitForSelector('[data-testid=branding-page]', { timeout: 10000 })
  await p.setInputFiles('[data-testid=brand-logo]', logo); await p.waitForSelector('[data-testid=brand-logo-color]', { timeout: 10000 }).catch(() => {})
  const cols = await p.locator('[data-testid=brand-logo-color]').count(); ok(cols >= 2, `${name}: pulls ${cols} colors out of the logo`)
  const nopt = await p.locator('[data-testid=brand-theme-option]').count(); ok(nopt >= 2, `${name}: suggests ${nopt} theme options`)
  ok(await p.locator('[data-testid=brand-theme-option][data-aa="1"]').count() === nopt, `${name}: every option passes WCAG AA on white`)
  const o = p.locator('[data-testid=brand-theme-option]').first(); await o.scrollIntoViewIfNeeded(); await o.click(); await W(200)
  const prim = await p.inputValue('[data-testid=brand-primary]'); ok(/^#[0-9a-f]{6}$/i.test(prim) && prim.toLowerCase() !== '#0f2d52', `${name}: picking an option fills the colors (${prim})`)
  ok(await p.locator('[data-testid=brand-contrast-row][data-ok=true]').count() >= 3, `${name}: contrast report shows passes`)
  await p.fill('[data-testid=brand-preset-name]', 'Demo logo set'); await click(p, '[data-testid=brand-preset-save]'); await W(200)
  ok(await p.locator('[data-testid=brand-saved-preset]').count() === 1, `${name}: preset saved`)
  await click(p, '[data-testid=brand-save]'); await W(500)
  const applied = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())
  ok(!!applied, `${name}: branding applied to the app (${applied})`)
  ok(/Arrowline/.test(await p.textContent('[data-testid=brand-vendor]')), `${name}: “Powered by Arrowline” stays`)
  await p.reload(); await W(1200); await p.evaluate(() => { location.hash = '/branding' }); await p.waitForSelector('[data-testid=branding-page]')
  ok(await p.locator('[data-testid=brand-saved-preset]').count() === 1, `${name}: preset still there after reload`)
  // bad web address → plain message, nothing breaks
  await p.fill('[data-testid=brand-logo-url]', 'not a url'); await click(p, '[data-testid=brand-logo-fetch]'); await W(500)
  ok(/web address/i.test(await p.textContent('body')), `${name}: a bad logo address explains what to do`)
  await p.screenshot({ path: out + name + '-logo-theme.png', fullPage: name === 'desk1920' })
  await click(p, '[data-testid=brand-reset]'); await W(300); await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
