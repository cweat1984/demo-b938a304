import { chromium } from 'playwright'
const base = 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []
const only = process.argv.slice(2)
async function login(role, vp = { width: 1600, height: 1000 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.25, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(`${role} console: ${m.text()}`) })
  await p.goto(base); await p.waitForSelector(`[data-role="${role === '_login' ? 'owner' : role}"]`, { timeout: 15000 })
  if (role === '_login') return { p, ctx }
  await p.click(`[data-role="${role}"]`); await p.waitForTimeout(800)
  return { p, ctx }
}
const go = async (p, pg) => { await p.evaluate(x => { location.hash = '/' + x }, pg); await p.waitForTimeout(900) }
const S = {
  login: async () => { const { p, ctx } = await login('_login'); await p.waitForTimeout(1500); await p.screenshot({ path: out + 'login.png' }); await ctx.close() },
  owner: async () => { const { p, ctx } = await login('owner'); await p.waitForTimeout(3500); await p.screenshot({ path: out + 'owner-dashboard.png' }); await p.screenshot({ path: out + 'owner-dashboard-full.png', fullPage: true }); await ctx.close() },
  dispatch: async () => { const { p, ctx } = await login('dispatch'); await go(p, 'dispatch'); await p.screenshot({ path: out + 'dispatch-board.png' }); await ctx.close() },
  job: async () => { const { p, ctx } = await login('owner'); await go(p, 'jobs'); await p.fill('input[placeholder^="Job #"]', '10125'); await p.waitForTimeout(300); await p.locator('main button.w-full').first().click(); await p.waitForTimeout(900); await p.screenshot({ path: out + 'job-detail.png' }); const t = p.getByRole('button', { name: 'Job cost', exact: true }).first(); if (await t.count()) { await t.click(); await p.waitForTimeout(700); await p.screenshot({ path: out + 'job-costing.png' }) } await ctx.close() },
  analytics: async () => { const { p, ctx } = await login('owner'); await go(p, 'analytics'); await p.screenshot({ path: out + 'analytics-job-pl.png' }); await p.click('button:has-text("Year over year")'); await p.waitForTimeout(600); await p.screenshot({ path: out + 'analytics-yoy.png' }); await p.click('button:has-text("Compare")'); await p.waitForTimeout(600); await p.screenshot({ path: out + 'analytics-divisions.png' }); await ctx.close() },
  modules: async () => { const { p, ctx } = await login('owner'); for (const [pg, n] of [['equipment', 'equipment'], ['inventory', 'inventory'], ['safety', 'safety'], ['time', 'timesheet'], ['shop', 'shop'], ['people', 'hr-people'], ['receivables', 'accounts-receivable'], ['payables', 'accounts-payable'], ['forecast', 'crane-forecast'], ['allocations', 'field-allocations'], ['tickets', 'field-tickets'], ['integrations', 'integrations'], ['settings', 'settings-themes'], ['contacts', 'contacts']]) { await go(p, pg); await p.screenshot({ path: out + n + '.png' }) } await ctx.close() },
  field: async () => { const { p, ctx } = await login('field', { width: 390, height: 844 }, true); await p.waitForTimeout(1200); await p.screenshot({ path: out + 'field-mobile-home.png' });
    await p.click('[data-testid=ticket-cta]'); await p.waitForTimeout(700); await p.click('[data-testid=ticket-next]'); await p.waitForTimeout(500)
    const pad = await p.locator('[data-testid=sig-pad]').boundingBox(); if (pad) { await p.mouse.move(pad.x + 30, pad.y + 110); await p.mouse.down(); for (let i = 0; i < 24; i++) await p.mouse.move(pad.x + 30 + i * 11, pad.y + 110 - Math.sin(i / 2.5) * 35); await p.mouse.up() }
    await p.waitForTimeout(300); await p.screenshot({ path: out + 'field-mobile-signature.png' }); await p.click('[data-testid=ticket-save]'); await p.waitForTimeout(900); await p.screenshot({ path: out + 'field-mobile-ticket-signed.png' })
    await p.locator('button:has-text("Done")').first().click(); await p.click('[data-testid=ftab-time]'); await p.waitForTimeout(400); await p.click('[data-testid=clock-in]'); await p.waitForTimeout(800); await p.screenshot({ path: out + 'field-mobile-time.png' })
    await p.click('[data-testid=ftab-schedule]'); await p.waitForTimeout(500); await p.screenshot({ path: out + 'field-mobile-schedule.png' })
    await p.click('[data-testid=ftab-more]'); await p.waitForTimeout(500); await p.screenshot({ path: out + 'field-mobile-more.png' })
    await p.click('[data-testid=tile-breakdown]'); await p.waitForTimeout(700); await p.screenshot({ path: out + 'field-mobile-breakdown.png' }); await ctx.close() },
  themes: async () => { const { p, ctx } = await login('owner'); await go(p, 'settings'); for (const k of ['southern', 'miami', 'purple', 'ivy', 'cotton', 'artillery', 'jen', 'slh']) { await p.click(`[data-theme=${k}]`); await p.waitForTimeout(300); if (k !== 'slh') { await go(p, 'command'); await p.waitForTimeout(1800); await p.screenshot({ path: out + `theme-${k}.png` }); await go(p, 'settings') } } await p.waitForTimeout(800); await p.evaluate(() => { document.querySelectorAll('*').forEach(e => { if (e.scrollTop) e.scrollTop = 0 }); scrollTo(0, 0) }); await p.waitForTimeout(400); await p.screenshot({ path: out + 'settings-themes.png' }); await ctx.close() },
}
for (const [k, fn] of Object.entries(S)) if (!only.length || only.includes(k)) { try { await fn(); console.log('shot', k) } catch (e) { console.log('FAIL', k, e.message.split('\n')[0]) } }
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors')
await browser.close()
