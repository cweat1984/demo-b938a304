// Roles-review fixes (REPORT-2 #1–#4, #6–#13). BASE env overrides the port. Chromium 1280×800 unless noted.
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = [], fail = m => { errors.push('FAIL ' + m); console.log('FAIL', m) }, ok = (c, m) => c ? console.log('ok  ', m) : fail(m)
const PROOF = '/tmp/r3proof/card.pdf'
async function as(role, { vp = { width: 1280, height: 800 }, clock } = {}) {
  const ctx = await browser.newContext({ viewport: vp })
  const p = await ctx.newPage()
  if (clock) await p.clock.install({ time: clock })
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 20000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const st = (p, fn, a) => p.evaluate(fn, a)
const db = p => st(p, () => window.__store.getState().db)
const go = (p, page) => st(p, pg => window.__store.getState().go(pg), page).then(() => p.waitForTimeout(700))
const commit = (p, src) => st(p, src => { const fn = new Function('db', src); window.__store.getState().commit('test setup', 'e2e', '', fn) }, src)
const iso = d => d.toISOString().slice(0, 10)

// #1 — reseed follows the America/Chicago day and never wipes user edits
{
  const { p, ctx } = await as('owner', { clock: new Date('2026-10-23T23:00:00Z') }) // 6 PM CT Fri
  const s0 = (await db(p)).seededAt
  await p.clock.setSystemTime(new Date('2026-10-24T01:30:00Z')) // 8:30 PM CT, already "tomorrow" in UTC
  await p.reload(); await p.waitForTimeout(1500)
  ok((await db(p)).seededAt === s0, '#1 no reseed at UTC midnight (still same Chicago day)')
  await commit(p, "db.customers[0].name = 'E2E Edited Co'"); await p.waitForTimeout(800)
  await p.clock.setSystemTime(new Date('2026-10-25T15:00:00Z')) // next Chicago day
  await p.reload(); await p.waitForTimeout(1500)
  ok((await db(p)).customers[0].name === 'E2E Edited Co', '#1 next-day load keeps user changes')
  await ctx.close()
}

// #2 — crane swap: undersized cranes blocked by load chart, confirm dialog for the rest
{
  const { p, ctx } = await as('dispatch')
  await commit(p, "db.jobs.forEach(j => { j.lift = { load: 20, rigging: 2, radius: 60, boom: 120 } })"); await p.waitForTimeout(500)
  await go(p, 'dispatch')
  const btn = p.locator('button[title="Swap crane"]').first()
  if (await btn.count()) {
    await btn.click(); await p.waitForTimeout(600)
    const rows = p.locator('[data-testid=swap-crane]'); const n = await rows.count()
    let small = 0, smallEnabled = 0, okBtn = null
    for (let i = 0; i < n; i++) { const r = rows.nth(i), t = await r.textContent(), dis = await r.isDisabled(); if (/Too small/.test(t)) { small++; if (!dis) smallEnabled++ } else if (!dis && !okBtn && !/busy|on #/i.test(t)) okBtn = r }
    ok(small > 0 && smallEnabled === 0, `#2 ${small} undersized cranes shown "Too small" and disabled`)
    if (okBtn) { const before = (await db(p)).jobs.map(j => j.craneId).join(); await okBtn.click(); await p.waitForTimeout(500)
      ok(await p.locator('[data-testid=swap-confirm]').count() > 0, '#2 swap asks for confirmation with load-chart %')
      ok(/Load chart: \d+%/.test(await p.locator('[data-testid=swap-confirm]').textContent()), '#2 confirm shows load chart %')
      await p.keyboard.press('Escape'); await p.waitForTimeout(400)
      ok((await db(p)).jobs.map(j => j.craneId).join() === before, '#2 cancel leaves crane unchanged') }
  } else fail('#2 no job card on dispatch board')
  await ctx.close()
}

// #6/#7/#3 — hire form validation, branch/division/pay carry through, add cert → dispatchable
{
  const { p, ctx } = await as('hr')
  await go(p, 'people'); await p.getByText('People & HR', { exact: true }).first().click(); await p.waitForTimeout(600)
  await p.getByRole('button', { name: 'New hire' }).last().click(); await p.waitForTimeout(400)
  const dlg = p.locator('[role=dialog]').last()
  const inputs = dlg.locator('input.input')
  await inputs.nth(0).fill('   '); await inputs.nth(1).fill('   ')
  ok(await p.locator('[data-testid=hire-create]').isDisabled(), '#7 whitespace-only names blocked')
  await inputs.nth(0).fill('Nina'); await inputs.nth(1).fill('Testhire')
  const br = await p.locator('[data-testid=hire-branch] option').nth(1).getAttribute('value')
  await p.selectOption('[data-testid=hire-branch]', br)
  const dv = await p.locator('[data-testid=hire-division] option').last().getAttribute('value')
  await p.selectOption('[data-testid=hire-division]', dv)
  await p.fill('[data-testid=hire-rate]', '37.5')
  await p.click('[data-testid=hire-create]'); await p.waitForTimeout(600)
  let d = await db(p); const h = d.hires.find(x => x.last === 'Testhire')
  ok(h && h.branchId === br && h.divisionId === dv && h.rate === 37.5, '#6 hire stores branch/division/rate')
  // one onboarding list: the People-form hire shows up in the merged tracker; activate from there
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.locator('button:has-text("Onboarding")').last().click(); await p.waitForTimeout(800)
  const row = p.locator('[data-testid=onboarding] .card', { hasText: 'Nina Testhire' }).first()
  ok(await row.count() > 0 && /SLH-\d+/.test(await row.textContent()), 'merge: People-form hire appears in the one onboarding list with its employee #')
  await row.locator('[data-testid=hire-activate]').click(); await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Activate now' }).click(); await p.waitForTimeout(700)
  d = await db(p); const e = d.employees.find(x => x.last === 'Testhire'), b = d.branches.find(x => x.id === br)
  ok(e && e.branchId === br && e.divisionId === dv && e.rate === 37.5 && e.city === b.city, `#6 activated employee keeps ${b?.code}/${dv}/$37.5 (was hard-coded OKC/SLH/$28)`)
  // #3 add certification with proof
  await st(p, id => window.__store.getState().open({ type: 'employee', id }), e.id); await p.waitForTimeout(700)
  const certTab = p.getByText(/^Certs|Certifications$/).first(); if (await certTab.count()) { await certTab.click().catch(() => {}); await p.waitForTimeout(300) }
  ok(await p.locator('[data-testid=cert-add]').count() > 0, '#3 HR sees "+ Add certification"')
  await p.click('[data-testid=cert-add]'); await p.waitForTimeout(400)
  await p.fill('[data-testid=cert-no]', 'OSHA-99887')
  ok(await p.locator('[data-testid=cert-save]').isDisabled(), '#3 proof upload required')
  await p.setInputFiles('[data-testid=cert-proof]', PROOF)
  await p.fill('[data-testid=cert-expires]', '2020-01-01')
  ok(await p.locator('[data-testid=cert-save]').isDisabled(), '#3 past expiry rejected')
  await p.fill('[data-testid=cert-expires]', '2029-01-01')
  await p.click('[data-testid=cert-save]'); await p.waitForTimeout(500)
  d = await db(p); const c = d.certs.find(x => x.employeeId === e.id && x.type === 'OSHA 10')
  ok(c && c.proof === 'card.pdf' && c.verified === 'Needs Review' && c.expires === '2029-01-01', '#3 cert saved with proof + expiry, pending verification')
  // #7 PTO: reversed dates blocked, hours never negative, weekend handling
  await go(p, 'pto')
  const t = new Date(); const mon = new Date(t); mon.setDate(t.getDate() + ((8 - t.getDay()) % 7 || 7) + 7)
  const fri = new Date(mon); fri.setDate(mon.getDate() + 4); const sat = new Date(mon); sat.setDate(mon.getDate() + 5); const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  await p.fill('[data-testid=pto-from]', iso(fri)); await p.fill('[data-testid=pto-to]', iso(mon))
  ok(await p.locator('[data-testid=pto-submit]').isDisabled() && /before/.test(await p.locator('[data-testid=pto-err]').textContent()), '#7 PTO "to" before "from" blocked')
  await p.fill('[data-testid=pto-from]', iso(mon)); await p.fill('[data-testid=pto-to]', iso(sun))
  ok(/Request 5 work days \(50h\)/.test(await p.locator('[data-testid=pto-submit]').textContent()), '#7 Mon–Sun counts 5 business days (50h), not 7')
  await commit(p, `const e = db.employees.find(x => x.last === 'Testhire'); db.pto = db.pto.filter(x => x.employeeId !== e.id)`)
  await ctx.close()
}

// merge — hire created on the Onboarding tracker becomes a real HR record and then an employee (branch/division/rate)
{
  const { p, ctx } = await as('hr')
  await go(p, 'onboarding'); await p.waitForTimeout(800)
  const coreN = (await db(p)).hires.length
  const rows = await p.locator('[data-testid=hire-row]').count()
  ok(rows >= coreN, `merge: tracker shows every HR hire (${rows} rows ≥ ${coreN} HR records)`)
  await p.click('[data-testid=hire-new]'); await p.fill('[data-testid=nh-first]', 'Lena'); await p.fill('[data-testid=nh-last]', 'Merged'); await p.fill('[data-testid=nh-personalEmail]', 'lena.m@mail.example')
  await p.fill('[data-testid=nh-position]', 'Crane Operator'); await p.selectOption('[data-testid=nh-branch]', 'Midland'); await p.fill('[data-testid=nh-rate]', '41')
  await p.click('[data-testid=nh-save]'); await p.waitForTimeout(900); await p.keyboard.press('Escape'); await p.waitForTimeout(400)
  let d = await db(p); const h = d.hires.find(x => x.first === 'Lena' && x.last === 'Merged'), mid = d.branches.find(b => b.city === 'Midland')
  ok(h && h.branchId === mid.id && h.rate === 41 && h.craft === 'Operator' && /^SLH-\d+$/.test(h.empNo), `merge: tracker hire got an HR record ${h?.empNo} (Midland, Operator, $41)`)
  ok(d.hires.filter(x => x.first === 'Lena' && x.last === 'Merged').length === 1, 'merge: no duplicate HR record after re-sync')
  await go(p, 'people'); await p.getByText('People & HR', { exact: true }).first().click(); await p.waitForTimeout(500); await p.locator('button:has-text("Onboarding")').last().click(); await p.waitForTimeout(800)
  ok(await p.locator('[data-testid=onboarding] .card', { hasText: 'Lena Merged' }).count() === 1, 'merge: same hire listed once under People → Onboarding')
  await p.locator('[data-testid=onboarding] .card', { hasText: 'Lena Merged' }).first().locator('[data-testid=hire-activate]').click(); await p.waitForTimeout(400)
  await p.getByRole('button', { name: 'Activate now' }).click(); await p.waitForTimeout(800)
  d = await db(p); const e = d.employees.find(x => x.first === 'Lena' && x.last === 'Merged')
  ok(e && e.branchId === mid.id && e.rate === 41 && e.city === 'Midland' && !d.hires.some(x => x.first === 'Lena' && x.last === 'Merged'), 'merge: Activate → employee on roster (Midland/$41), removed from onboarding')
  ok(await p.locator('[data-testid=onboarding] .card', { hasText: 'Lena Merged' }).count() === 0, 'merge: activated hire leaves the list')
  await ctx.close()
}

// move status on Dispatch board + Equipment (seed move mv-1 is in progress)
{
  const { p, ctx } = await as('dispatch')
  await st(p, () => window.__store.setState(s => ({ ui: { ...s.ui, filter: { ...s.ui.filter, branchId: 'all', divisionId: 'all' } } })))
  await go(p, 'dispatch'); await p.waitForTimeout(600)
  const n = await p.locator('[data-testid=dispatch-moving]').count()
  const d = await db(p); const c28 = d.equipment.find(x => x.unit === '28'); const on = d.jobs.filter(j => j.craneId === c28?.id && j.startDate <= iso(new Date()) && j.endDate >= iso(new Date()) && !['Quote', 'Awarded'].includes(j.stage))
  ok(on.length === 0 ? true : n > 0, `dispatch: crane on an active move shows MOVING/ARRIVING badge (${n} on board; ${on.length} job(s) with crane 28 today)`)
  await go(p, 'equipment'); await p.waitForTimeout(600)
  ok(await p.locator('[data-testid=equip-moving]').count() > 0, 'equipment: crane on active move shows "Moving → #job"')
  await ctx.close()
}

// #8 — complete job explains unsigned/missing tickets; AR shows why jobs can't bill; invoice bills signed days
{
  const { p, ctx } = await as('owner')
  await st(p, () => window.__store.setState(s => ({ ui: { ...s.ui, filter: { ...s.ui.filter, branchId: 'all', divisionId: 'all' } } })))
  let d = await db(p); const j = d.jobs.find(x => x.stage === 'In Progress')
  await st(p, id => window.__store.getState().open({ type: 'job', id }), j.id); await p.waitForTimeout(700)
  const cb = p.locator('[data-testid=job-complete]')
  if (await cb.count()) { await cb.click(); await p.waitForTimeout(500)
    ok(await p.locator('[data-testid=complete-reasons]').count() > 0, `#8 completing #${j.jobNo} early/unsigned shows reasons`)
    await p.getByRole('button', { name: 'Not yet' }).click(); await p.waitForTimeout(300)
    ok((await db(p)).jobs.find(x => x.id === j.id).stage === 'In Progress', '#8 "Not yet" leaves job in progress')
  } else fail('#8 no Complete job button')
  await commit(p, `const j = db.jobs.find(x => x.id === '${j.id}'); j.stage = 'Complete'; db.tickets.filter(t => t.jobId === j.id).forEach((t, i) => { if (i === 0) { t.signedAt = undefined; t.signerName = undefined } })`)
  await p.keyboard.press('Escape'); await go(p, 'receivables'); await p.getByText('Ready to invoice').first().click(); await p.waitForTimeout(500)
  ok(await p.locator(`[data-testid=billing-blocked]:has-text("#${j.jobNo}")`).count() > 0, `#8 AR lists #${j.jobNo} as "can't bill yet" with a reason`)
  // invoice bills distinct signed-ticket days
  d = await db(p); const r = d.jobs.find(x => x.stage === 'Complete' && !x.invoiceNo && d.tickets.some(t => t.jobId === x.id && t.signedAt) && !d.tickets.some(t => t.jobId === x.id && !t.signedAt))
  if (r) { const days = new Set(d.tickets.filter(t => t.jobId === r.id && (t.signedAt || t.signerName)).map(t => t.date)).size
    await p.locator(`text=#${r.jobNo}`).first().scrollIntoViewIfNeeded().catch(() => {})
    const card = p.locator('.card', { hasText: `#${r.jobNo}` }).filter({ has: p.getByRole('button', { name: /Create invoice/ }) }).first()
    await card.getByRole('button', { name: /Create invoice/ }).click(); await p.waitForTimeout(700)
    const txt = await st(p, () => [...document.querySelectorAll('[role=dialog] input, [role=dialog] textarea')].map(i => i.value).join(' | ') + ' ' + (document.querySelector('[role=dialog]')?.textContent ?? ''))
    const inv = (await db(p)).invoices.find(i => i.jobId === r.id)
    ok((inv && inv.lines[0].qty === days) || txt.includes(`${days} days (${days} signed ticket days)`), `#8 invoice draft for #${r.jobNo} bills ${days} signed-ticket day(s)`)
  } else console.log('skip #8 invoice: no ready job')
  await ctx.close()
}

// #4 — won quote warns when its crane is already booked, prompts to staff crew
{
  const { p, ctx } = await as('owner')
  let d = await db(p); const q = d.jobs.find(x => x.stage === 'Quote' && x.craneId), other = d.jobs.find(x => x.id !== q.id && x.stage === 'In Progress')
  await commit(p, `const q = db.jobs.find(x => x.id === '${q.id}'), o = db.jobs.find(x => x.id === '${other.id}'); q.craneId = o.craneId; q.startDate = o.startDate; q.endDate = o.endDate`)
  await st(p, () => window.__store.setState(s => ({ ui: { ...s.ui, filter: { ...s.ui.filter, branchId: 'all', divisionId: 'all' } } })))
  await go(p, 'quotes'); await p.locator('[data-testid=quote-card]', { hasText: q.jobNo }).first().click().catch(() => {}); await p.waitForTimeout(600)
  if (await p.locator('[data-testid=quote-won]').count()) { await p.click('[data-testid=quote-won]'); await p.waitForTimeout(700)
    ok(await p.locator('text=/already booked on #/').count() > 0, `#4 winning #${q.jobNo} warns crane already booked on #${other.jobNo}`)
    await p.getByRole('button', { name: 'Schedule it' }).first().click().catch(() => {}); await p.waitForTimeout(500)
    ok((await db(p)).jobs.find(x => x.id === q.id).stage === 'Awarded', '#4 "Schedule it" refuses while crane clashes')
  } else fail('#4 could not open quote')
  // no clash → schedule → staff prompt
  d = await db(p); const q2 = d.jobs.find(x => x.stage === 'Quote' && !x.quoteLost && !x.craneId && x.id !== q.id) || d.jobs.find(x => x.stage === 'Quote' && !x.quoteLost && x.id !== q.id)
  await commit(p, `const q = db.jobs.find(x => x.id === '${q2.id}'); q.craneId = undefined; db.assignments = db.assignments.filter(a => a.jobId !== q.id)`)
  await p.keyboard.press('Escape'); await go(p, 'quotes'); await p.locator('[data-testid=quote-card]', { hasText: q2.jobNo }).first().click().catch(() => {}); await p.waitForTimeout(600)
  if (await p.locator('[data-testid=quote-won]').count()) { await p.click('[data-testid=quote-won]'); await p.waitForTimeout(600)
    await p.getByRole('button', { name: 'Schedule it' }).first().click(); await p.waitForTimeout(600)
    ok(await p.getByRole('button', { name: 'Staff the crew' }).count() > 0, '#4 scheduled with no crew → "Staff the crew" prompt')
  } else fail('#4 could not open 2nd quote')
  // #10 labels
  ok(await p.locator('text=Quotes won this year (booked)').count() > 0, '#10 Quotes tile says "Quotes won this year (booked)"')
  await p.keyboard.press('Escape'); await go(p, 'command')
  ok(await p.locator('text=/Revenue YTD \\d{4} \\(billed\\)/').count() > 0, '#10 exec tile says "Revenue YTD (billed)", not "Sales YTD"')
  await ctx.close()
}

// #9 — move planner validation, permits from planned move
{
  const { p, ctx } = await as('owner', { vp: { width: 1400, height: 900 } })
  await go(p, 'moves')
  const plan = p.locator('[data-testid=plan-move]').first()
  if (await plan.count()) { await plan.click(); await p.waitForTimeout(500)
    await p.fill('[data-testid=planner-project]', 'ABC'); await p.fill('[data-testid=planner-jobno]', 'ABC')
    ok(await p.locator('[data-testid=planner-create]').isDisabled() && /No job #ABC/.test(await p.locator('[data-testid=planner-err]').textContent()), '#9 unknown job number blocked')
    const jobOpt = await p.locator('[data-testid=planner-job] option').nth(1).getAttribute('value')
    await p.selectOption('[data-testid=planner-job]', jobOpt); await p.waitForTimeout(200)
    await p.fill('[data-testid=planner-pickup]', '2020-01-01')
    ok(await p.locator('[data-testid=planner-create]').isDisabled() && /past/.test(await p.locator('[data-testid=planner-err]').textContent()), '#9 past pickup date blocked')
    await p.keyboard.press('Escape')
  } else fail('#9 no plan-move button')
  await go(p, 'permits')
  const opts = await p.locator('[data-testid=permit-route] option').allTextContents()
  ok(/planned move/.test(opts[0] || ''), `#9 permits route comes from the planned move ("${opts[0]}")`)
  await ctx.close()
}

// #11 / #13 — presentation mode at 1280 and sign-out; JobBuilder validation
{
  const { p, ctx } = await as('owner')
  await st(p, () => { document.documentElement.classList.add('presenting') })
  const fs = await st(p, () => parseFloat(getComputedStyle(document.documentElement).fontSize))
  ok(fs <= 16.5, `#11 presenting at 1280 uses ${fs}px root (was 18.5px → clipping)`)
  await p.keyboard.press('Shift+P'); await p.waitForTimeout(300)
  const on = await st(p, () => JSON.parse(localStorage.getItem('sc-present') || '{}').state?.on)
  await st(p, () => window.__store.getState().signOut()); await p.waitForTimeout(500)
  const after = await st(p, () => JSON.parse(localStorage.getItem('sc-present') || '{}').state?.on)
  ok(on === true && after === false, '#13 presentation mode turns off on sign-out')
  await ctx.close()
}

// #12 — portal only signs in invited contacts
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`portal pageerror: ${e.message}`))
  await p.goto(base); await p.waitForSelector('[data-testid=portal-link]', { timeout: 15000 }); await p.click('[data-testid=portal-link]'); await p.waitForSelector('[data-testid=portal-signin]')
  if (await p.locator('[data-testid=portal-email]').count()) {
    await p.fill('[data-testid=portal-email]', 'random.person@mail.example'); await p.click('[data-testid=portal-send]'); await p.waitForTimeout(500)
    ok(await p.locator('[data-testid=portal-magic]').count() === 0 && await p.locator('text=/invite list/').count() > 0, '#12 un-invited email refused')
    ok(await p.locator('[data-testid=portal-demo-auth]').count() > 0, '#12 "needs real auth in production" note shown')
    await p.fill('[data-testid=portal-email]', 'rick.dawson@plainswind.com'); await p.click('[data-testid=portal-send]'); await p.waitForTimeout(500)
    ok(await p.locator('[data-testid=portal-magic]').count() > 0, '#12 invited contact gets the sign-in link')
  } else console.log('skip #12: portal route not found at #/portal')
  await ctx.close()
}

await browser.close()
const real = errors.filter(e => !/tile|arcgis/i.test(e))
console.log(real.length ? real.join('\n') : 'ROLES-FIXES E2E: all passed')
process.exit(real.length ? 1 : 0)
