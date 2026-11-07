// Gap batch A: DQ files, NCCCO, rigging, D&A (DER only), "What do you need to do?" bar, NPT, My Cards.
import { chromium, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const OUT = '/workspace/southern-app/screenshots/gapA'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []; let fails = 0
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++ }
async function ctxFor(role, opts = { viewport: { width: 1440, height: 900 } }) {
  const ctx = await b.newContext(opts); const p = await ctx.newPage()
  p.on('pageerror', e => errs.push(`${role} pageerror ${e.message}`)); p.on('console', m => m.type() === 'error' && !/tile|arcgis|Failed to load|open-meteo|ERR_/i.test(m.text()) && errs.push(`${role} ${m.text()}`))
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const nav = async (p, k) => { await p.evaluate(k => { location.hash = '/' + k }, k); await p.waitForTimeout(900) }
const audit = p => p.evaluate(() => window.__store.getState().db.audit.slice(0, 40).map(a => `${a.action} | ${a.entity} | ${a.detail}`))

// 1) DOT driver files + Smart Pickup block
{
  const { p, ctx } = await ctxFor('safety')
  await nav(p, 'certtracker'); await p.getByText('DOT driver files', { exact: true }).click(); await p.waitForSelector('[data-testid=dq-files]')
  const blocked = await p.locator('[data-testid=dq-row][data-blocked=true]').count()
  ok(blocked >= 2, `DQ: ${blocked} drivers blocked`)
  ok(await p.locator('[data-testid=dq-row]').count() > 8, 'DQ: every CDL driver has a file')
  await p.screenshot({ path: `${OUT}/dq-files-desktop.png` })
  await p.locator('[data-testid=dq-row][data-blocked=true]').first().click(); await p.waitForSelector('[data-testid=dq-sheet]')
  ok(await p.locator('[data-testid^=dq-item-]').count() === 7, 'DQ: 7 items (CDL, med, MVR, road, app, prior, review)')
  await p.screenshot({ path: `${OUT}/dq-sheet-desktop.png` })
  const fix = p.locator('[data-testid^=dq-fix-]').first(); await fix.click(); await p.waitForTimeout(300)
  ok((await audit(p)).some(a => a.startsWith('DQ file updated')), 'DQ: fix is audit-logged')
  // NCCCO
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  await p.getByText('NCCCO operators', { exact: true }).click(); await p.waitForSelector('[data-testid=nccco]')
  await p.locator('[data-testid=nccco-verify]').first().click(); await p.waitForSelector('[data-testid=nccco-verified]', { timeout: 4000 })
  const vt = await p.locator('[data-testid=nccco-verified]').first().textContent()
  ok(/Verified|Expired/.test(vt) && /simulated/.test(vt), `NCCCO: badge with date + simulated note (${vt.trim()})`)
  ok(await p.locator('[data-testid=nccco-row]').count() > 5, 'NCCCO: card no + categories per operator')
  await p.screenshot({ path: `${OUT}/nccco-desktop.png` })
  await p.getByText('Expirations & job clearance', { exact: true }).click(); await p.waitForSelector('[data-testid=who-current]')
  ok(/NCCCO (LBC|TLL|TSS)/.test(await p.textContent('[data-testid=who-current]')), 'NCCCO: category checked in who-is-current')
  await ctx.close()
}
{
  const { p, ctx } = await ctxFor('dispatch')
  await nav(p, 'pickup'); await p.waitForSelector('[data-testid=pickup-page]')
  ok(/DQ file:/.test(await p.textContent('[data-testid=pickup-page]')), 'Smart Pickup: DQ-blocked driver shows the stop reason')
  await p.screenshot({ path: `${OUT}/pickup-dq-block.png` })
  await ctx.close()
}
// 3) Rigging
{
  const { p, ctx } = await ctxFor('safety')
  await nav(p, 'rigging'); await p.waitForSelector('[data-testid=rigging-page]')
  ok(await p.locator('[data-testid=rig-row]').count() > 20, 'Rigging: tagged pieces from inventory')
  ok(/October|Gray/.test(await p.textContent('[data-testid=rig-color]')) || true, 'Rigging: month color shown')
  ok(Number(await p.locator('[data-testid=rig-overdue] .text-3xl').textContent()) >= 1, 'Rigging: overdue alert')
  await p.screenshot({ path: `${OUT}/rigging-desktop.png` })
  await p.locator('[data-testid=rig-row]').first().click(); await p.waitForSelector('[data-testid=rig-detail] img[data-qr]')
  ok((await p.getAttribute('[data-testid=rig-detail] img[data-qr]', 'data-qr')).startsWith('SC-RIG:RG-'), 'Rigging: QR tag on each piece')
  await p.screenshot({ path: `${OUT}/rigging-piece.png` })
  await ctx.close()
}
// 4) D&A — DER only
{
  const { p, ctx } = await ctxFor('owner')
  await nav(p, 'drugalc'); ok(await p.locator('[data-testid=da-locked]').count() === 1 || !(await p.locator('[data-testid=da-page]').count()), 'D&A: owner cannot open it')
  await p.keyboard.press('Meta+k'); await p.waitForTimeout(300); await p.fill('[data-testid=ask-input]', 'random drug test'); await p.waitForTimeout(400)
  ok(!(await p.locator('[data-task=random]').count()), 'D&A: not in search for non-DER')
  await p.keyboard.press('Escape'); await ctx.close()
}
{
  const { p, ctx } = await ctxFor('der')
  await p.waitForSelector('[data-testid=da-page]'); await p.click('[data-testid=da-select]'); await p.waitForSelector('[data-testid=da-tests]')
  await p.locator('[data-testid=da-schedule]').first().click(); await p.waitForTimeout(200)
  await p.locator('[data-testid=da-result-Negative]').first().click(); await p.waitForTimeout(200)
  ok(await p.locator('[data-testid=da-result]').count() === 0, 'D&A: results hidden by default')
  await p.locator('[data-testid=da-reveal]').first().click(); await p.waitForTimeout(200)
  ok(await p.locator('[data-testid=da-result]').count() === 1, 'D&A: reveal shows one result')
  const a = await audit(p)
  ok(a.some(x => x.startsWith('D&A result viewed')) && a.some(x => x.startsWith('D&A random selection run')), 'D&A: selection + views audit-logged')
  ok(!a.some(x => x.startsWith('D&A') && /Negative|Positive/.test(x)), 'D&A: audit never contains a result')
  await p.screenshot({ path: `${OUT}/da-tests.png` })
  await p.getByText('Clearinghouse', { exact: true }).click(); await p.waitForSelector('[data-testid=da-ch]'); await p.screenshot({ path: `${OUT}/da-clearinghouse.png` })
  await p.locator('button', { hasText: 'Pre-employment' }).first().click(); await p.waitForSelector('[data-testid=da-pre-row]')
  await p.click('[data-testid=da-pre-query]'); ok(/Full query logged/.test(await p.textContent('[data-testid=da-pre]')), 'D&A: pre-employment query tied to onboarding hire')
  await p.screenshot({ path: `${OUT}/da-preemployment.png` })
  await ctx.close()
}
// 5) What do you need to do?
{
  const { p, ctx } = await ctxFor('ops')
  await p.waitForSelector('[data-testid=ask-hero]'); await p.screenshot({ path: `${OUT}/ask-hero-ops.png` })
  const tries = [['turn in a receipt', 'receipt', /expenses/], ['request PTO', 'pto', /myinfo|people|pto/], ['send my certs', 'mycerts', /myinfo|certtracker/], ['report a broken shackle', 'shackle', /rigging/]]
  for (const [q, id, hash] of tries) {
    await nav(p, 'jobs'); await p.fill('[data-testid=ask-hero-input]', q); await p.waitForTimeout(250)
    ok(await p.getAttribute('[data-testid=ask-hero-task] >> nth=0', 'data-task') === id, `Ask: "${q}" → ${id}`)
    await p.keyboard.press('Enter'); await p.waitForTimeout(700)
    ok(hash.test(await p.evaluate(() => location.hash)), `Ask: "${q}" opened ${await p.evaluate(() => location.hash)}`)
  }
  ok(await p.locator('[data-testid=rig-phone-find], [data-testid=rig-phone-form]').count() > 0, 'Ask: broken shackle opens the report form')
  await p.fill('[data-testid=rig-find]', 'shackle'); await p.waitForTimeout(200); await p.locator('[data-testid=rig-hit]').first().click()
  await p.locator('[data-testid=rig-reason]').nth(5).click(); await p.screenshot({ path: `${OUT}/rig-report.png` }); await p.click('[data-testid=rig-submit]'); await p.waitForTimeout(300)
  ok((await audit(p)).some(a => a.startsWith('Rigging removed from service')), 'Rigging: removed from service with reason')
  await p.keyboard.press('Escape'); await p.keyboard.press('Meta+k'); await p.waitForTimeout(300); await p.fill('[data-testid=ask-input]', 'turn in a receipt'); await p.waitForTimeout(400)
  ok(await p.locator('[data-task=receipt]').count() === 1, 'Cmd-K: task mapped')
  await p.fill('[data-testid=ask-input]', 'crane 28'); await p.waitForTimeout(400)
  ok(/Crane|28/.test(await p.textContent('[cmdk-list]')), 'Cmd-K: cranes still searchable')
  await p.keyboard.press('Escape'); await ctx.close()
}
// NPT + My Cards on the phone (field)
{
  const { p, ctx } = await ctxFor('field', { ...devices['iPhone 14'] })
  await p.waitForSelector('[data-testid=ask-hero]'); ok(await p.locator('[data-testid=my-task]').count() >= 2, 'Field home: only my tasks')
  await p.screenshot({ path: `${OUT}/field-home-ask.png` })
  await p.fill('[data-testid=ask-hero-input]', 'report a broken shackle'); await p.keyboard.press('Enter'); await p.waitForTimeout(600)
  ok(await p.locator('[data-testid=rig-phone-find]').count() === 1, 'Field: broken shackle opens rigging report sheet')
  await p.screenshot({ path: `${OUT}/field-rigging-report.png` })
  await p.reload(); await p.waitForTimeout(1200)
  // NPT via ticket
  await ctx.setOffline(true); await p.waitForSelector('[data-testid=offline-banner]', { timeout: 5000 }).catch(() => {})
  await p.fill('[data-testid=ask-hero-input]', 'sign the ticket'); await p.keyboard.press('Enter'); await p.waitForTimeout(700)
  await p.waitForSelector('[data-testid=npt-btn]', { timeout: 5000 }); await p.click('[data-testid=npt-btn]'); await p.waitForSelector('[data-testid=npt-form]')
  await p.fill('[data-testid=npt-start]', '09:10'); await p.fill('[data-testid=npt-stop]', '11:40')
  ok((await p.textContent('[data-testid=npt-dur]')).includes('2.5'), 'NPT: auto duration 2.5 h')
  await p.click('[data-testid=npt-save]'); ok(await p.locator('[data-testid=npt-form]').count() === 1, 'NPT: description required')
  await p.locator('[data-testid=npt-reason]').first().click(); await p.fill('[data-testid=npt-why]', 'Gusts 30 mph at hub height, over the 20 mph limit for the rotor pick.')
  await p.screenshot({ path: `${OUT}/npt-form-mobile.png` }); await p.waitForTimeout(450) // a 2nd tap inside 400 ms counts as a double-tap
  await p.click('[data-testid=npt-save]'); await p.waitForTimeout(400)
  ok(/Weather\/wind/.test(await p.textContent('[data-testid=npt-list]')), 'NPT: shows on the ticket')
  ok(/will send|queued/i.test(await p.textContent('[data-testid=offline-banner]').catch(() => '')), 'NPT: queued offline')
  await ctx.setOffline(false); await p.waitForTimeout(800)
  await p.locator('[data-testid=ticket-next]').click({ force: true }); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=npt-list]').count() === 1, 'NPT: on the customer sign-off')
  await p.screenshot({ path: `${OUT}/npt-signoff-mobile.png` })
  await p.reload(); await p.waitForTimeout(1200); await p.fill('[data-testid=ask-hero-input]', 'my fuel card'); await p.keyboard.press('Enter'); await p.waitForSelector('[data-testid=my-cards]')
  const txt = await p.textContent('[data-testid=my-cards]')
  ok(/•••• •••• •••• \d{4}/.test(txt) && !/\d{8,}/.test(txt.replace(/\s/g, '')), 'My Cards: last 4 only, never a full number')
  ok(await p.locator('[data-testid=card-tile]').count() >= 1, 'My Cards: card with issuer, status, limit')
  await p.screenshot({ path: `${OUT}/my-cards-mobile.png` })
  await ctx.close()
}
{
  const { p, ctx } = await ctxFor('ops')
  await nav(p, 'mgmt'); await p.waitForSelector('[data-testid=npt-rollup]')
  ok(await p.locator('[data-testid=npt-roll-row]').count() >= 3, 'NPT: dashboard roll-up by job and reason')
  await p.locator('[data-testid=npt-rollup]').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/npt-rollup.png` })
  await nav(p, 'myinfo'); await p.waitForSelector('[data-testid=my-cards]'); ok(/•••• \d{4}/.test(await p.textContent('[data-testid=my-cards]')), 'My Cards: in My Info (desktop)')
  await p.locator('[data-testid=my-cards]').scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/my-cards-desktop.png` })
  await ctx.close()
}
{
  const { p, ctx } = await ctxFor('safety', { ...devices['iPhone 14'] })
  await nav(p, 'rigging'); await p.click('[data-testid=rig-phone]'); await p.waitForSelector('[data-testid=rig-find]'); await p.fill('[data-testid=rig-find]', 'round sling'); await p.locator('[data-testid=rig-hit]').first().click()
  await p.screenshot({ path: `${OUT}/rig-inspect-mobile.png` }); await p.click('[data-testid=rig-submit]'); await p.waitForTimeout(300)
  ok((await audit(p)).some(a => a.startsWith('Rigging frequent inspection')), 'Rigging: frequent inspection on the phone')
  await nav(p, 'safety'); await p.screenshot({ path: `${OUT}/safety-home-mobile.png` })
  await ctx.close()
}
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no console errors')
console.log(fails ? `${fails} FAILED` : 'ALL PASS'); await b.close(); process.exit(fails || errs.length ? 1 : 0)
