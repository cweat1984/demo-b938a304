// Ad-hoc QA screenshots: node qa.mjs <name>...
import { chromium } from 'playwright'
const base = 'http://localhost:4173/'
const out = '/workspace/southern-app/screenshots/qa/'
import fs from 'fs'; fs.mkdirSync(out, { recursive: true })
const which = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []
async function role(role, page, w = 1600, h = 1000, mobile = false) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: 'dark' })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role}: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error') errors.push(`${role} console: ${m.text()}`) })
  await p.goto(base)
  await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 })
  await p.click(`[data-role="${role}"]`)
  await p.waitForTimeout(900)
  if (page) { await p.evaluate(pg => { location.hash = '/' + pg }, page); await p.waitForTimeout(800) }
  return { p, ctx }
}
const openJob = async (p, no) => { await p.evaluate(no => { const s = window.__store?.getState?.(); const j = s?.db.jobs.find(x => x.jobNo === no); s?.open({ type: 'job', id: j.id }) }, no); await p.waitForTimeout(700) }
for (const w of which) {
  if (w === 'phone') { for (const pg of ['command', 'dispatch', 'jobs']) { const { p, ctx } = await role('owner', pg, 390, 844, true); await p.waitForTimeout(1500); const sw = await p.evaluate(() => document.documentElement.scrollWidth); console.log(pg, 'scrollWidth', sw); await p.screenshot({ path: out + `phone-${pg}.png` }); await ctx.close() } }
  if (w === 'command') { const { p, ctx } = await role('owner'); await p.waitForTimeout(3500); await p.screenshot({ path: out + 'command.png' }); await p.screenshot({ path: out + 'command-full.png', fullPage: true }); await ctx.close() }
  if (w === 'fix') { const { p, ctx } = await role('owner', 'jobs'); await openJob(p, '10066'); await p.getByRole('button', { name: 'Crew', exact: true }).first().click(); await p.waitForTimeout(500); await p.screenshot({ path: out + 'crew-tab.png' }); const b = p.locator('[data-testid=fix-btn]').first(); if (await b.count()) { await b.click(); await p.waitForTimeout(600); await p.screenshot({ path: out + 'fix-modal.png' }); await p.locator('[data-testid=fix-assign]').first().click(); await p.waitForTimeout(600); await p.screenshot({ path: out + 'fix-after.png' }) } else console.log('NO FIX BUTTON'); await ctx.close() }
  if (w === 'cost') { const { p, ctx } = await role('owner', 'jobs'); await openJob(p, '10066'); await p.getByRole('button', { name: 'Job cost', exact: true }).first().click(); await p.waitForTimeout(900); await p.screenshot({ path: out + 'jobcost.png' }); await ctx.close() }
  if (w === 'configs') { const { p, ctx } = await role('owner', 'configs'); await p.screenshot({ path: out + 'configs.png' }); await ctx.close() }
  if (w.startsWith('page:')) { const pg = w.slice(5); const { p, ctx } = await role('owner', pg); await p.waitForTimeout(1200); await p.screenshot({ path: out + `${pg}.png` }); await ctx.close() }
  if (w === 'compact') { const { p, ctx } = await role('owner', 'dispatch'); await p.getByRole('button', { name: 'Compact', exact: true }).click(); await p.waitForTimeout(600); await p.screenshot({ path: out + 'dispatch-compact.png' }); await ctx.close() }
  if (w === 'dispatch') { const { p, ctx } = await role('owner', 'dispatch'); await p.waitForTimeout(800); await p.screenshot({ path: out + 'dispatch.png' }); await ctx.close() }
  if (w === 'briefing') { const { p, ctx } = await role('owner'); await p.waitForTimeout(1500); await p.click('[data-testid=briefing]'); await p.waitForTimeout(6000); await p.screenshot({ path: out + 'briefing.png' }); await ctx.close() }
  if (w === 'matcher') { const { p, ctx } = await role('owner', 'windfarms'); await p.evaluate(() => { const s = window.__store.getState(); const j = s.db.jobs.find(x => x.jobNo === '10125'); s.open({ type: 'windfarm', id: j.windFarmId }) }); await p.waitForTimeout(3500); await p.screenshot({ path: out + 'matcher-pre.png' }); await p.locator('[data-testid=crane-matcher]').scrollIntoViewIfNeeded({ timeout: 5000 }); await p.screenshot({ path: out + 'matcher.png' }); await p.locator('[data-testid=quote-it]').first().click(); await p.waitForTimeout(900); await p.screenshot({ path: out + 'matcher-quote.png' }); await ctx.close() }
  if (w === 'sync') {
    const ctx = await browser.newContext({ viewport: { width: 1700, height: 950 }, colorScheme: 'dark' }); const p = await ctx.newPage()
    p.on('pageerror', e => errors.push(`sync: ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errors.push(`sync console: ${m.text()}`) })
    await p.goto(base + '?sync=1'); await p.waitForTimeout(6000); await p.screenshot({ path: out + 'sync.png' })
    const phone = p.frameLocator('[data-testid=sync-phone]')
    await phone.locator('[data-testid=time-cta]').click().catch(e => console.log('time-cta', e.message)); await p.waitForTimeout(800)
    const ci = phone.locator('[data-testid=clock-in]'); if (await ci.count()) { await ci.click(); await p.waitForTimeout(1500) } else console.log('no clock-in button')
    await p.screenshot({ path: out + 'sync-after.png' }); await ctx.close()
  }
  if (w === 'field') { const { p, ctx } = await role('field', null, 390, 844, true); await p.waitForTimeout(1500); await p.screenshot({ path: out + 'field.png' }); await ctx.close() }
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no errors')
await browser.close()
