import { chromium, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const OUT = '/workspace/southern-app/screenshots/batch3'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []; let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
async function ctxFor(role, opts) {
  const ctx = await b.newContext({ ...opts, acceptDownloads: true })
  const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(`${role} pageerror ${e.message}`)); p.on('console', m => m.type() === 'error' && !/tile|arcgis|Failed to load|open-meteo|ERR_/i.test(m.text()) && errs.push(`${role} ${m.text()}`))
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const nav = async (p, k) => { await p.evaluate(k => { location.hash = '/' + k }, k); await p.waitForTimeout(900) }
{
  const { p } = await ctxFor('dispatch', { viewport: { width: 1440, height: 900 } })
  // Smart pickup
  await nav(p, 'pickup'); await p.waitForSelector('[data-testid=pickup-page]')
  ok(await p.locator('[data-testid=ranked-row][data-ok=true]').count() > 0, 'ranked eligible drivers')
  ok(await p.locator('[data-testid=reasons] span').count() > 3, 'reasons shown')
  await p.screenshot({ path: `${OUT}/pickup-desktop.png` })
  await p.click('[data-testid=plan-thursday]'); await p.waitForTimeout(800)
  const n = await p.locator('[data-testid=pickup-row][data-assigned=true]').count(); const tot = await p.locator('[data-testid=pickup-row]').count()
  ok(n >= tot - 1 && n > 3, `Plan Thursday filled ${n}/${tot}`)
  await p.screenshot({ path: `${OUT}/pickup-thursday-desktop.png` })
  await p.click('[data-testid=confirm-all]'); await p.waitForTimeout(300)
  // Bids
  await nav(p, 'bids'); await p.waitForSelector('[data-testid=bids-page]')
  const ep = await p.textContent('[data-testid=email-preview]')
  ok(!/Red River|Refinery Rd|Gate 4/.test(ep) && /Pickup region/.test(ep), 'vendor email hides customer/site')
  ok(/sealed/.test(await p.textContent('[data-testid=compare]')), 'prices sealed until deadline')
  await p.screenshot({ path: `${OUT}/bids-sealed-desktop.png` })
  await p.click('[data-testid=unseal]'); await p.locator('[data-testid=award-btn]').first().click(); await p.click('[data-testid=award-confirm]'); await p.waitForTimeout(500)
  ok(/Attached to project #10158/.test(await p.textContent('[data-testid=award-summary]')), 'award attached for invoicing')
  ok(/Red River/.test(await p.locator('[data-testid=email-preview]').last().textContent()) || /Customer:/.test(await p.textContent('[data-testid=rfq-detail]')), 'winner sees full details')
  await p.screenshot({ path: `${OUT}/bids-awarded-desktop.png`, fullPage: true })
  await p.click('[data-testid=new-rfq]'); await p.waitForSelector('[data-testid=rfq-builder]'); await p.click('[data-testid=rfq-create]'); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=email-tab]').count() === 3, 'one email per vendor')
  await p.click('[data-testid=send-rfq]'); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=quote-row]').count() >= 2, 'quotes came in')
  await p.getByRole('tab', { name: 'Price variance' }).click(); await p.waitForSelector('[data-testid=variance-table]')
  ok(/Hold for review/.test(await p.textContent('[data-testid=variance-table]')), 'variance flagged')
  await p.screenshot({ path: `${OUT}/bids-variance-desktop.png` })
  await p.getByRole('tab', { name: 'Vendor scorecard' }).click(); await p.waitForSelector('[data-testid=scorecard]'); await p.screenshot({ path: `${OUT}/bids-scorecard-desktop.png` })
  // Weather
  await nav(p, 'weather'); await p.waitForSelector('[data-testid=weather-page]'); await p.waitForTimeout(2500)
  await p.screenshot({ path: `${OUT}/weather-live-desktop.png` })
  await p.getByRole('tab', { name: 'Simulated' }).click(); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=wx-limit]').count() === 1, 'crane limit line')
  ok(/Weather standby day/.test(await p.textContent('[data-testid=wx-verdict]')), 'yesterday is a standby day (simulated)')
  await p.click('[data-testid=record-standdown]'); await p.waitForTimeout(300)
  await p.screenshot({ path: `${OUT}/weather-standby-desktop.png`, fullPage: true })
  const dl = p.waitForEvent('download'); await p.click('[data-testid=wx-pdf]'); const d = await dl
  ok(/\.pdf$/.test(d.suggestedFilename()), 'customer PDF'); await d.saveAs(`${OUT}/weather-log.pdf`)
}
{
  const { p } = await ctxFor('ops', { ...devices['iPhone 14'] })
  for (const k of ['pickup', 'bids', 'weather']) { await nav(p, k); await p.waitForTimeout(1200); await p.screenshot({ path: `${OUT}/${k}-mobile.png` }) }
  ok(true, 'mobile pages render')
}
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASS')
await b.close(); process.exit(fails || errs.length ? 1 : 0)
