import { chromium } from 'playwright'
const base = 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/'
const which = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []
async function role(role, page, w = 1600, h = 1000, mobile = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 3 : 1.5, isMobile: mobile, hasTouch: mobile, colorScheme: 'dark' })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role}: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error') errors.push(`${role} console: ${m.text()}`) })
  await p.goto(base)
  await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 })
  await p.click(`[data-role="${role}"]`)
  await p.waitForTimeout(800)
  if (page) { await p.evaluate(pg => { location.hash = '/' + pg }, page); await p.waitForTimeout(600) }
  return { p, ctx }
}
for (const w of which) {
  if (w === 'owner') { const { p, ctx } = await role('owner'); await p.waitForTimeout(3500); await p.screenshot({ path: out + 'preview-owner-dashboard.png' }); await ctx.close() }
  if (w === 'dispatch') { const { p, ctx } = await role('dispatch', 'dispatch'); await p.waitForTimeout(1500); await p.screenshot({ path: out + 'preview-dispatch.png' }); await ctx.close() }
  if (w === 'field') { const { p, ctx } = await role('field', null, 390, 844, true); await p.waitForTimeout(1500); await p.screenshot({ path: out + 'preview-field-mobile.png' }); await ctx.close() }
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors')
await browser.close()
