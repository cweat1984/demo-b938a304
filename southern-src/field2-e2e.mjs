// Field review fixes (WebKit iPhone 390): clock in at the top, toasts off the buttons, injury/near-miss, My pay,
// honest DVIR, receipts/NPT tiles, supervisors with real crews + My crew, data-driven home chips, search routes.
import { webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'; const out = '/workspace/southern-app/screenshots/field2/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const wk = await webkit.launch()
const ctx = await wk.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
await p.goto(base); await p.tap('[data-role=field]'); await p.waitForTimeout(1500)
const bar = await p.locator('[data-testid=clock-bar]').boundingBox(); ok(!!bar && bar.y < 260, `Clock in is at the top of Home (y=${Math.round(bar?.y ?? -1)})`)
await p.screenshot({ path: out + 'iphone390-home-clock-bar.png' })
await p.tap('[data-testid=clockbar-in]'); await p.waitForTimeout(600)
ok(/On the clock/.test(await p.textContent('[data-testid=clock-bar]')), 'one tap clocks in from Home')
const tb = await p.locator('[data-sonner-toast]').first().boundingBox(); ok(!!tb && tb.y < 200, `toasts show at the top, away from bottom buttons (y=${Math.round(tb?.y ?? -1)})`)
await p.waitForTimeout(300); await p.screenshot({ path: out + 'iphone390-toast-top.png' })
await p.tap('[data-testid=ftab-more]'); await p.waitForSelector('[data-testid=tile-incident]', { timeout: 5000 }).catch(() => {}); await p.waitForTimeout(300)
for (const t of ['tile-incident', 'tile-pay', 'tile-receipt', 'tile-npt']) ok(await p.locator(`[data-testid=${t}]`).count() === 1, `More has ${t.replace('tile-', '')}`)
// injury / near miss
const n0 = await p.evaluate(() => window.__store.getState().db.incidents.length)
await p.tap('[data-testid=tile-incident]'); await p.waitForSelector('[data-testid=incident-form]')
ok(await p.locator('[data-testid=inc-send]').isDisabled(), 'report needs a description first')
await p.fill('[data-testid=inc-desc]', 'Tag line slipped near the pad, nobody hurt'); await p.tap('[data-testid=inc-stop]'); await p.screenshot({ path: out + 'iphone390-near-miss.png' })
await p.tap('[data-testid=inc-send]'); await p.waitForTimeout(600)
ok(await p.evaluate(() => window.__store.getState().db.incidents.length) === n0 + 1, 'near miss reaches the Safety log (2 taps from More + typing)')
// my pay
await p.tap('[data-testid=tile-pay]'); await p.waitForSelector('[data-testid=my-pay]'); await p.waitForTimeout(400)
ok(/\$\d/.test(await p.textContent('[data-testid=pay-week-gross]')) && await p.locator('[data-testid=pay-stub]').count() > 0, 'My pay shows this week $ and past stubs')
await p.screenshot({ path: out + 'iphone390-my-pay.png' }); await p.locator('[data-testid=fsheet-back]').tap(); await p.waitForTimeout(500)
// DVIR
await p.locator('button', { hasText: 'Pre-trip (DVIR)' }).first().tap(); await p.waitForTimeout(600)
ok(await p.locator('[data-testid=dvir-submit]').isDisabled() && /Check 12 more|Check \d+ more/.test(await p.textContent('[data-testid=dvir-submit]')), 'pre-trip starts unchecked — cannot submit without looking')
await p.locator('[aria-label$=" OK"]').first().tap(); await p.tap('[data-testid=dvir-rest-ok]'); await p.waitForTimeout(200)
ok(await p.locator('[data-testid=dvir-submit]').isDisabled(), 'still needs odometer / hours')
await p.fill('[data-testid=dvir-odo]', '184220'); ok(!(await p.locator('[data-testid=dvir-submit]').isDisabled()), 'all checked + odometer → can submit')
await p.locator('[aria-label$=" defect"]').first().tap(); await p.waitForTimeout(200)
ok(await p.locator('[data-testid=dvir-submit]').isDisabled() && /Describe/.test(await p.textContent('[data-testid=dvir-submit]')), 'a defect needs a description')
await p.fill('[data-testid=dvir-defect-text]', 'Left marker lamp out'); ok(/Safe or NOT safe/.test(await p.textContent('[data-testid=dvir-submit]')), 'a defect needs a Safe / NOT safe call')
await p.tap('[data-testid=dvir-notsafe]'); ok(!(await p.locator('[data-testid=dvir-submit]').isDisabled()), 'description + NOT safe → can submit'); await p.screenshot({ path: out + 'iphone390-dvir-defect.png' })
p.once('dialog', d => d.accept()) // field fixes: Back on a typed form now asks "Discard…?"
await p.locator('[data-testid=fsheet-back]').tap(); await p.waitForTimeout(400)
// search routes: paycheck → My pay, near miss → incident form
for (const [q, sel] of [['paycheck', 'my-pay'], ['near miss', 'incident-form'], ['gate code', 'site-sheet']]) {
  await p.tap('[data-testid=ftab-home]'); await p.waitForTimeout(400); const inp = p.locator('[data-testid=field-app] input').first(); await inp.fill(q); await p.waitForTimeout(400); await inp.press('Enter'); await p.waitForTimeout(800)
  ok(await p.locator(`[data-testid=${sel}]`).count() === 1, `typing “${q}” opens ${sel}`); await p.goBack(); await p.waitForTimeout(500)
}
// supervisors
for (const sid of ['emp-2001', 'emp-2002', 'emp-2003']) {
  await p.evaluate(() => window.__store.getState().signOut()); await p.waitForTimeout(500); await p.tap(`[data-sup=${sid}]`); await p.waitForTimeout(1200)
  const jobs = await p.evaluate(id => window.__store.getState().db.jobs.filter(j => j.supervisorId === id).length, sid)
  ok(jobs > 0 && await p.locator('[data-testid=tile-crew]').count() === 1, `${sid}: supervisor runs ${jobs} job(s) and has My crew on Home`)
  ok(!/No job today/.test(await p.textContent('[data-testid=field-app]')), `${sid}: home shows today's job`)
  if (sid === 'emp-2001') { await p.tap('[data-testid=tile-crew]'); await p.waitForSelector('[data-testid=my-crew]'); const rows = await p.locator('[data-testid=roll-row]').count(); ok(rows > 1, `My crew roll call lists ${rows} people`)
    const ap = p.locator('[data-testid=crew-approve]'); if (await ap.count()) { ok(await p.locator('[data-testid=crew-time-row]').count() > 0, 'crew time listed per person before approving'); await ap.tap(); await p.waitForTimeout(300); await p.getByRole('button', { name: 'Approve', exact: true }).tap(); await p.waitForTimeout(400); ok(await p.locator('[data-testid=crew-approve]').count() === 0, 'supervisor approves crew time (per person list + confirm)') } else ok(true, 'crew time already approved')
    await p.screenshot({ path: out + 'iphone390-supervisor-my-crew.png' }); await p.locator('[data-testid=fsheet-back]').tap(); await p.waitForTimeout(400) 
    // Chad: each person signs their own JSA — supervisors see status only, no "sign in my crew"
    let jt = p.getByText('JSA & toolbox', { exact: true }).first(); if (!(await jt.isVisible().catch(() => false))) { await p.locator('[data-testid=ftab-more]').tap().catch(() => {}); await p.waitForTimeout(400); jt = p.getByText('JSA & toolbox', { exact: true }).first() }
    await jt.tap(); await p.waitForTimeout(500); const op = p.locator('[data-testid=jsa-open]').first(); if (await op.count()) { await op.tap(); await p.waitForTimeout(300) }
    ok(await p.locator('[data-testid=jsa-crew]').count() === 0, 'supervisor JSA has no sign-for-crew button (each person signs)')
    ok(await p.locator('[data-testid=jsa-crew-status]').count() >= 1 || await p.locator('[data-testid=jsa-empty]').count() === 1, 'supervisor sees who has / hasn’t signed')
    await p.locator('[data-testid=fsheet-back]').tap().catch(() => {}); await p.waitForTimeout(300) }
}
const areas = await p.evaluate(() => new Set(window.__store.getState().db.jobs.filter(j => ['emp-2001', 'emp-2002', 'emp-2003'].includes(j.supervisorId)).map(j => j.branchId + j.divisionId)).size)
ok(areas >= 2, `the three supervisors cover different areas (${areas})`)
ok(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '))
await wk.close(); console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0)
