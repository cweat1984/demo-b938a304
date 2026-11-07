import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []
const ROLES = { owner: null, dispatch: null, ops: null, shop: null, safety: null, payroll: null, hr: null, accounting: null }
async function login(role, vp = { width: 1600, height: 1000 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.5, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(`${role} console: ${m.text()}`) })
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(700)
  return { p, ctx }
}
const pagesFor = async p => p.evaluate(() => [...document.querySelectorAll('aside nav button, aside nav a')].map(b => b.getAttribute('data-page')).filter(Boolean))
for (const role of Object.keys(ROLES)) {
  const { p, ctx } = await login(role)
  const pages = ['command', 'dispatch', 'forecast', 'jobs', 'tickets', 'equipment', 'configs', 'shop', 'inventory', 'people', 'allocations', 'safety', 'time', 'analytics', 'receivables', 'payables', 'contacts', 'integrations', 'audit', 'settings']
  for (const pg of pages) { await p.evaluate(x => { location.hash = '/' + x }, pg); await p.waitForTimeout(250) }
  console.log(role, 'ok')
  await ctx.close()
}
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors')
await browser.close()
