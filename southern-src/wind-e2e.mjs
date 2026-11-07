import { chromium } from 'playwright'
const out = '/workspace/southern-app/screenshots/'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []
async function ctx(role, vp = { width: 1600, height: 1000 }, mobile = false) {
  const c = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.25, isMobile: mobile, hasTouch: mobile })
  const p = await c.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(`${role} console: ${m.text()}`) })
  await p.goto(process.env.BASE || 'http://localhost:4173/'); await p.waitForSelector(`[data-role=${role}]`); await p.click(`[data-role=${role}]`); await p.waitForTimeout(800)
  return { c, p }
}
const pick = (p, idx, last = false) => p.evaluate(({ idx, last }) => { const els = [...document.querySelectorAll('[data-testid=turbine-map]')]; const m = els[last ? els.length - 1 : 0].__map; const ls = []; m.eachLayer(l => { if (l.__caseId) ls.push(l) }); idx.forEach(i => ls[i]?.fire('click')); return ls.length }, { idx, last })
const go = async (p, h) => { await p.evaluate(x => { location.hash = '/' + x }, h); await p.waitForTimeout(700) }
const step = async (n, f) => { try { await f(); console.log('ok', n) } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); await (globalThis.__p?.screenshot({ path: '/tmp/fail-' + n.replace(/ /g, '_') + '.png' }).catch(() => {})) } }
{
  const { c, p } = await ctx('ops'); globalThis.__p = p
  if (process.env.SKIP) {} else await step('directory', async () => { await p.evaluate(() => { location.hash = '/windfarms' }); await p.waitForSelector('[data-testid=wf-row]'); await p.waitForTimeout(500); await p.screenshot({ path: out + 'wind-directory.png' }) })
  await step('map view', async () => { await p.getByRole('tab', { name: 'Map', exact: true }).click(); await p.waitForTimeout(2500); await p.screenshot({ path: out + 'wind-directory-map.png' }); await p.getByRole('tab', { name: 'List', exact: true }).click() })
  await step('open farm', async () => { await p.fill('[data-testid=wf-search]', '25 Mile'); await p.waitForTimeout(300); await p.click('[data-testid=wf-row] >> nth=0'); await p.waitForSelector('[data-testid=turbine-map]'); await p.waitForTimeout(3500); await p.screenshot({ path: out + 'wind-farm-detail.png' }); await p.screenshot({ path: out + 'wind-farm-detail-full.png', fullPage: true }) })
  await step('select turbines', async () => { const n = await pick(p, [17, 21]); console.log('turbine pins', n); await p.waitForTimeout(500); await p.waitForSelector('[data-testid=turbine-selection]'); await p.screenshot({ path: out + 'wind-turbine-select.png' }) })
  await step('drop pin', async () => { p.once('dialog', d => d.accept('Substation (test)')); await p.click('[data-testid=drop-Substation]'); const bb = await p.locator('[data-testid=turbine-map]').boundingBox(); await p.mouse.click(bb.x + 120, bb.y + 120); await p.waitForTimeout(800); const n = await p.locator('text=Substation (test)').count(); if (!n) throw new Error('pin not saved') })
  await step('attach to job', async () => { const sel = p.locator('select[aria-label="Attach to job"]'); const v = await sel.locator('option').nth(1).getAttribute('value'); await sel.selectOption(v); await p.click('[data-testid=attach-turbines]'); await p.waitForTimeout(600) })
  await step('ask wind', async () => { await p.keyboard.press('Control+k'); await p.waitForTimeout(400); await p.keyboard.type('wind farms in Oklahoma with GE 2.8 turbines'); await p.waitForTimeout(900); await p.screenshot({ path: out + 'ask-wind-ge.png' }); await p.keyboard.press('Escape'); await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('tallest hub heights in Texas'); await p.waitForTimeout(900); await p.screenshot({ path: out + 'ask-wind-tallest.png' }); await p.keyboard.press('Escape') })
  await step('job drawer', async () => { await p.keyboard.press('Escape'); await go(p, 'command'); await go(p, 'jobs'); await p.fill('input[placeholder^="Job #"]', '10125'); await p.waitForTimeout(300); await p.locator('main button.w-full').first().click(); await p.waitForSelector('[data-testid=wind-job]'); await p.waitForTimeout(2500); await p.screenshot({ path: out + 'wind-job-drawer.png' }) })
  await step('job builder', async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(400); await go(p, 'command'); await go(p, 'jobs'); await p.getByRole('button', { name: 'New job' }).first().click(); await p.waitForTimeout(600); if (await p.locator('[data-testid=farm-picked] button').count()) await p.click('[data-testid=farm-picked] button'); await p.fill('[data-testid=farm-search]', 'Canadian Hills'); await p.waitForTimeout(500); await p.click('[data-testid=farm-hit] >> nth=0'); await p.waitForTimeout(400); await p.click('[data-testid=jb-pick-turbines]'); await p.waitForTimeout(3000); await pick(p, [40, 41], true); await p.waitForTimeout(400); await p.screenshot({ path: out + 'wind-jobbuilder-picker.png' }); await p.click('[data-testid=turbines-done]'); await p.waitForTimeout(400); await p.screenshot({ path: out + 'wind-jobbuilder.png' }) })
  await c.close()
}
{
  const { c, p } = await ctx('field', { width: 390, height: 844 }, true)
  await step('field wind', async () => { await p.waitForSelector('[data-testid=wind-job]'); await p.waitForTimeout(2500); await p.screenshot({ path: out + 'field-mobile-turbines.png', fullPage: false }); await p.locator('[data-testid=om-checkin]').scrollIntoViewIfNeeded(); await p.waitForTimeout(800); await p.screenshot({ path: out + 'field-mobile-turbines-2.png' }) })
  await c.close()
}
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors')
await b.close()
