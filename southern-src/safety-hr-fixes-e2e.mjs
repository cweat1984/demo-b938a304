// dive2 safety / HR / union fixes. BASE=http://127.0.0.1:4313/ node safety-hr-fixes-e2e.mjs
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const WK = process.env.WEBKIT === '1'
const browser = WK ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []; const fail = m => { errors.push('FAIL ' + m); console.log('FAIL', m) }; const ok = (c, m) => c ? console.log('ok', m) : fail(m)
async function open(role, opts = {}) {
  const ctx = opts.ctx ?? await browser.newContext(WK ? { ...devices['iPhone 14'] } : { viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base + '?qa=1'); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 20000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const S = (p, f, a) => p.evaluate(f, a)
const db = p => S(p, () => window.__store.getState().db)
const go = async (p, pg) => { await S(p, x => window.__store.getState().go(x), pg); await p.waitForTimeout(700) }
const as = async (p, role, emp) => { await S(p, ([r, e]) => { const s = window.__store.getState(); s.signOut(); s.signIn(r, 'Demo role', e) }, [role, emp]); await p.waitForTimeout(900) }
const toasts = p => S(p, () => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText.replace(/\s+/g, ' ')).join(' || '))
const dlg = () => '[role=dialog]'

// 1 BLOCKER — five "John Smith" hires, no freeze, unique emails + employee #s
{ const { p, ctx } = await open('hr'); await go(p, 'people')
  for (let k = 0; k < 5; k++) {
    await p.getByRole('button', { name: 'New hire', exact: true }).first().click(); await p.waitForTimeout(300)
    const D = p.locator(dlg()); await D.locator('input').nth(0).fill('John'); await D.locator('input').nth(1).fill('Smith'); await D.locator('input').nth(3).fill(`40555512${10 + k}`)
    const t0 = Date.now(); const r = await Promise.race([S(p, () => { document.querySelector('[data-testid=hire-create]').click(); return 'ok' }), new Promise(r => setTimeout(() => r('HANG'), 8000))])
    ok(r === 'ok' && Date.now() - t0 < 5000, `B1: John Smith hire #${k + 1} created without freezing (${Date.now() - t0} ms)`); if (r !== 'ok') break
    await p.waitForTimeout(300)
  }
  const d = await db(p); const js = d.hires.filter(h => h.first === 'John' && h.last === 'Smith')
  ok(js.length === 5, `B1: 5 John Smith hires saved (${js.length})`)
  ok(new Set(js.map(h => h.email)).size === 5 && !d.employees.some(e => js.some(h => h.email === e.email)), `B1: unique emails ${js.map(h => h.email.split('@')[0]).join(', ')}`)
  ok(new Set(js.map(h => h.empNo)).size === 5, 'B1: unique employee numbers')
  await ctx.close() }

// 2–5 Safety
{ const { p, ctx } = await open('safety'); await go(p, 'safety')
  await p.getByRole('button', { name: 'Report incident' }).click(); await p.waitForTimeout(300)
  const D = p.locator(dlg()); await D.locator('select').nth(0).selectOption('Recordable')
  await D.locator('[data-testid=inc-desc]').fill('   '); ok(await D.locator('[data-testid=inc-submit]').isDisabled(), 'incident: whitespace-only report blocked')
  ok(await D.locator('[data-testid=inc-injured]').count() === 1 && await D.locator('[data-testid=inc-time]').count() === 1 && await D.locator('[data-testid=inc-witnesses]').count() === 1, 'incident: injured / time / witnesses fields present')
  const d0 = await db(p); const victim = d0.employees.find(e => e.craft === 'Rigger' && e.status === 'Active')
  await D.locator('[data-testid=inc-injured]').selectOption(victim.id); await D.locator('[data-testid=inc-location]').fill('Pad T-14'); await D.locator('[data-testid=inc-witnesses]').fill('Seth Reed')
  await D.locator('[data-testid=inc-desc]').fill('Pinched finger between shackle and lug'); await D.locator('[data-testid=inc-submit]').click(); await p.waitForTimeout(500)
  const inc = (await db(p)).incidents[0]; ok(inc.employeeId === victim.id && inc.witnesses === 'Seth Reed' && inc.location === 'Pad T-14' && !!inc.time, 'incident: saved with injured, time, location, witnesses')
  ok((await db(p)).notices.some(n => n.roles.includes('der') && /post-accident/.test(n.title)), 'incident: Recordable notifies the DER about a post-accident test')
  const days = await p.locator('[data-testid=days-no-recordable]').innerText(); const h = await p.locator('h1, [data-testid=days-no-recordable]').first().evaluate(e => e.closest('h1,div')?.innerText ?? '')
  ok(days === '0', `days without a recordable = 0 on the same day (got ${days})`); ok(/0 days without/.test(await p.evaluate(() => document.body.innerText)), 'plural: "0 days"')
  // close guard
  await p.locator('.seg-btn', { hasText: 'Incidents' }).first().click(); await p.waitForTimeout(400)
  await p.locator('[data-testid=incident-status]').first().selectOption('Closed'); await p.waitForTimeout(500)
  ok((await db(p)).incidents[0].status !== 'Closed', 'incident: Recordable cannot close without root cause + corrective action')
  ok(await p.locator('[data-testid=incident-detail]').count() === 1, 'incident: refused close opens the investigation')
  const DD = p.locator('[data-testid=incident-detail]'); await DD.locator('[data-testid=incd-root]').fill('No tag line; hand placed at pinch point'); await DD.locator('[data-testid=incd-ca]').fill('Hands-free tools for shackles; JSA updated — C. Smith, Nov 6')
  await DD.locator('[data-testid=incd-away]').fill('2'); await DD.locator('[data-testid=incd-wc-status]').selectOption('Filed'); await DD.locator('[data-testid=incd-wc-claim]').fill('WC-26-0142')
  await DD.locator('[data-testid=incd-status]').selectOption('Closed'); await DD.locator('[data-testid=incd-save]').click(); await p.waitForTimeout(500)
  const ic = (await db(p)).incidents[0]; ok(ic.status === 'Closed' && ic.closedBy === 'Cale Smith' && ic.daysAway === 2 && ic.wc?.claimNo === 'WC-26-0142', 'incident: investigation + WC claim saved, closed by Cale')
  await p.locator('[data-testid=incident-open]').first().click(); await p.waitForTimeout(400); ok(await p.locator('[data-testid=incident-detail]').count() === 1, 'incident: card opens'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  // OSHA 300
  await p.locator('.seg-btn', { hasText: 'OSHA 300' }).first().click(); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=osha-row]').count() >= 1 && /\d/.test(await p.locator('[data-testid=osha-trir]').innerText()), `OSHA 300 log + TRIR ${await p.locator('[data-testid=osha-trir]').innerText()} / DART ${await p.locator('[data-testid=osha-dart]').innerText()}`)
  // inspections
  await p.locator('.seg-btn', { hasText: 'Inspections' }).first().click(); await p.waitForTimeout(400)
  const insp = (await db(p)).inspections; const freq = [...insp].sort((a, b) => a.due.localeCompare(b.due)).find(i => i.kind === 'Crane Frequent')
  const row = p.locator('.card > div', { has: p.locator('[data-testid=insp-fail]') }).filter({ hasText: 'Crane Frequent' }).first()
  await row.locator('[data-testid=insp-fail]').click(); await p.waitForTimeout(300)
  ok(await p.locator('[data-testid=insp-save]').isDisabled(), 'inspection: Fail needs a defect note')
  const rid = await S(p, () => null)
  await p.locator('[data-testid=insp-note]').fill('Hook latch broken'); await p.locator('[data-testid=insp-save]').click(); await p.waitForTimeout(400)
  const failed = (await db(p)).inspections.find(i => i.result === 'Fail' && i.notes === 'Hook latch broken')
  ok(!!failed && failed.inspectorId === 'emp-1016' && failed.history?.length >= 1, 'inspection: Fail keeps the note, stamps the inspector (Cale), keeps history')
  const row2 = p.locator('.card > div', { has: p.locator('[data-testid=insp-pass]') }).filter({ hasText: 'Hook latch broken' }).first()
  await row2.locator('[data-testid=insp-pass]').click(); await p.waitForTimeout(300); await p.locator('[data-testid=insp-save]').click(); await p.waitForTimeout(400)
  const passed = (await db(p)).inspections.find(i => i.id === failed.id); const dd = Math.round((new Date(passed.due) - new Date(passed.date)) / 864e5)
  ok(passed.result === 'Pass' && dd === ({ 'Crane Frequent': 30, 'Crane Annual': 365 }[passed.kind] ?? dd) && passed.history.some(x => x.notes === 'Hook latch broken'), `inspection: Pass on ${passed.kind} → next due +${dd} d, defect stays in history`)
  // cert renewal
  await p.locator('.seg-btn', { hasText: 'Certifications' }).first().click(); await p.waitForTimeout(400)
  const before = (await db(p)).certs
  await p.locator('[data-testid=log-renewal]').first().click(); await p.waitForTimeout(300)
  const R = p.locator('[data-testid=renew-modal]'); const sugg = await R.locator('[data-testid=renew-exp]').inputValue()
  await R.locator('[data-testid=renew-exp]').fill('2027-11-02'); await R.locator('[data-testid=renew-file]').setInputFiles({ name: 'h2s-card.jpg', mimeType: 'image/jpeg', buffer: Buffer.from([255, 216, 255, 217]) })
  await R.locator('[data-testid=renew-save]').click(); await p.waitForTimeout(400)
  const c1 = (await db(p)).certs.find(c => c.pendingExpires === '2027-11-02'); const c0 = before.find(c => c.id === c1?.id)
  ok(!!c1 && c1.expires === c0.expires && c1.verified === 'Needs Review' && c1.pendingProof === 'h2s-card.jpg', `renewal: printed date pending verification, old expiry ${c0?.expires} still in force (suggested ${sugg} for ${c1?.type})`)
  await S(p, id => { const m = window.__store; }, 0)
  await p.locator('[data-testid=pending-renewal]').first().scrollIntoViewIfNeeded(); await p.locator('[data-testid=pending-renewal]').first().locator('xpath=ancestor::div[1]').getByRole('button', { name: 'Verify' }).click(); await p.waitForTimeout(400)
  const c2 = (await db(p)).certs.find(c => c.id === c1.id); ok(c2.expires === '2027-11-02' && !c2.pendingExpires && c2.verified === 'Verified', 'renewal: verifying applies the new expiry')
  // JSA all crews → field phone
  await p.getByRole('button', { name: 'JSA / Toolbox talk' }).click(); await p.waitForTimeout(300)
  ok(await p.locator('[data-testid=talk-publish]').isDisabled(), 'JSA: title required (no fake prefilled JSA)')
  await p.locator('[data-testid=talk-title]').fill('All crews — high wind week'); await p.locator('[data-testid=talk-publish]').click(); await p.waitForTimeout(400)
  const t = (await db(p)).talks[0]; ok(t.leaderId === 'emp-1016' && !t.jobId, 'JSA: led by the signed-in safety manager')
  await p.locator('.seg-btn', { hasText: 'JSAs' }).first().click(); await p.waitForTimeout(400)
  const unsigned0 = await p.locator('[data-testid=talk-unsigned]').first().innerText().catch(() => ''); ok(/Not signed yet/.test(unsigned0), `JSA: office sees who hasn't signed (${unsigned0.slice(0, 70)}…)`)
  const fieldEmp = (await db(p)).assignments.find(a => a.date === t.date)?.employeeId
  await as(p, 'field', fieldEmp); await p.locator('[data-testid=ftab-more]').click().catch(() => {}); await p.waitForTimeout(400)
  await p.locator('button', { hasText: 'JSA' }).first().click(); await p.waitForTimeout(600)
  ok((await p.evaluate(() => document.body.innerText)).includes('All crews — high wind week'), 'JSA: all-crews JSA shows on a crew phone')
  await S(p, ([id, e]) => window.__store.getState().db && null, [t.id, fieldEmp])
  await ctx.close() }

// 6 DOT — positive removes from dispatch; order post-accident; per-branch site; RTD clears
{ const { p, ctx } = await open('der'); await go(p, 'drugalc')
  await p.locator('[data-testid=da-select]').click(); await p.waitForTimeout(400)
  await p.locator('.seg-btn', { hasText: 'Tests' }).first().click(); await p.waitForTimeout(400)
  const d0 = await db(p)
  await p.locator('[data-testid=da-schedule]').first().click(); await p.waitForTimeout(300)
  const da = await S(p, () => JSON.parse(localStorage.getItem('sc-da-v1'))); const st = da.tests.find(x => x.scheduled && x.selectedAt === x.scheduled.at.slice(0, 10) && x.result === 'Pending')
  const br = d0.employees.find(e => e.id === st.empId).branchId; ok(st.scheduled.site.includes(br === 'br-mid' ? 'Midland' : br === 'br-kil' ? 'Longview' : 'OKC'), `D&A: collection site matches branch (${br} → ${st.scheduled.site})`)
  // put him on a future job first so removal is visible
  await S(p, id => { const s = window.__store.getState(); const a = s.db.assignments.find(x => x.date >= new Date().toISOString().slice(0, 10)); if (a) s.commit('t', 't', 't', db => { db.assignments.push({ ...a, id: 'asg-test-da', employeeId: id }) }) }, st.empId)
  await p.locator('[data-testid=da-result-Positive]').first().click(); await p.waitForTimeout(500)
  const d1 = await db(p); const e1 = d1.employees.find(e => e.id === st.empId)
  ok(!!e1.ssHold && !d1.assignments.some(a => a.employeeId === e1.id && a.date >= e1.ssHold), 'D&A: positive → not cleared, removed from future jobs')
  ok(d1.absences.some(a => a.employeeId === e1.id && a.id.startsWith('abs-ss-')), 'D&A: blocked on the dispatch board (unavailable)')
  ok(!d1.audit?.some?.(a => /Positive/.test(a.detail ?? '')), 'D&A: audit/dispatch never shows the result')
  await as(p, 'dispatch'); await go(p, 'pickup'); const pt = await p.evaluate(() => document.body.innerText)
  if (e1.craft === 'Truck Driver') ok(/Not cleared for safety-sensitive work/.test(pt), 'D&A: Smart Pickup blocks the held driver')
  await as(p, 'der'); await go(p, 'drugalc'); await p.locator('.seg-btn', { hasText: 'Tests' }).first().click(); await p.waitForTimeout(400)
  ok(await p.locator('[data-testid=da-held]').count() === 1, 'D&A: held list shown to DER')
  await p.locator('[data-testid=da-rtd]').first().click(); await p.waitForTimeout(400)
  await p.locator('[data-testid=da-test]', { hasText: 'Return-to-duty' }).first().locator('[data-testid=da-result-Negative]').click(); await p.waitForTimeout(400)
  ok(!(await db(p)).employees.find(e => e.id === st.empId).ssHold, 'D&A: negative return-to-duty clears the hold')
  const other = (await db(p)).employees.find(e => e.craft === 'Truck Driver' && e.id !== st.empId && !e.ssHold)
  await p.locator('[data-testid=da-order-emp]').selectOption(other.id); await p.locator('[data-testid=da-order-kind]').selectOption('Post-accident'); await p.locator('[data-testid=da-order-go]').click(); await p.waitForTimeout(400)
  const da2 = await S(p, () => JSON.parse(localStorage.getItem('sc-da-v1'))); ok(da2.tests.some(x => x.empId === other.id && x.kind === 'Post-accident' && x.scheduled), 'D&A: post-accident test ordered (go now)')
  await p.locator('[data-testid=da-order-kind]').selectOption('Reasonable suspicion'); ok(await p.locator('[data-testid=da-order-go]').isDisabled(), 'D&A: reasonable suspicion needs a supervisor observation')
  // any employee (not only CDL drivers): a non-CDL rigger involved in an accident is held until cleared
  const d2 = await db(p); const cands = d2.employees.filter(e => e.status === 'Active' && !e.ssHold && e.craft && e.craft !== 'Truck Driver' && e.craft !== 'Office' && !d2.certs.some(c => c.employeeId === e.id && c.type === 'CDL Class A')); const nonCdl = cands.find(e => /Rigger|Oiler/.test(e.craft)) ?? cands[0]
  await p.locator('[data-testid=da-order-kind]').selectOption('Post-accident'); await p.waitForTimeout(150)
  ok(await p.locator(`[data-testid=da-order-emp] option[value="${nonCdl.id}"]`).count() === 1, `D&A: non-CDL employee (${nonCdl.craft}) can get a post-accident test`)
  await p.locator('[data-testid=da-order-emp]').selectOption(nonCdl.id); await p.locator('[data-testid=da-order-go]').dispatchEvent('click') /* toasts can sit over it on iPhone */; await p.waitForTimeout(400)
  const d3 = await db(p); ok(!!d3.employees.find(e => e.id === nonCdl.id).ssHold, 'D&A: non-CDL employee held after the post-accident test is ordered')
  const job = d3.jobs.find(j => j.stage === 'Scheduled' || j.stage === 'In Progress'); const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  await S(p, ([j, d, e]) => window.__actions.assign(j, d, e, 'Rigger'), [job.id, today, nonCdl.id]); await p.waitForTimeout(300)
  ok(!(await db(p)).assignments.some(a => a.employeeId === nonCdl.id && a.date >= today), 'D&A: held non-CDL employee cannot be scheduled / dispatched')
  ok(/not cleared for work/i.test(await toasts(p)), 'D&A: dispatcher is told why')
  { const fp = await ctx.newPage(); await fp.goto(base + '?qa=1'); await fp.waitForTimeout(800); await S(fp, e => { const s = window.__store.getState(); s.signOut(); s.signIn('field', 'Demo role', e) }, nonCdl.id); await fp.waitForTimeout(1200)
    ok(await fp.locator('[data-testid=field-held]').count() === 1 && await fp.locator('[data-testid=clockbar-in]').count() === 0, 'D&A: field app tells the held employee and hides clock-in'); await fp.close() }
  { const neg = p.locator('[data-testid=da-test]', { hasText: 'Post-accident' }).filter({ hasText: nonCdl.first }).first().locator('[data-testid=da-result-Negative]'); await neg.dispatchEvent('click') }; await p.waitForTimeout(400)
  ok(!(await db(p)).employees.find(e => e.id === nonCdl.id).ssHold, 'D&A: negative result clears the non-CDL employee')
  await S(p, ([j, d, e]) => window.__actions.assign(j, d, e, 'Rigger'), [job.id, today, nonCdl.id]); await p.waitForTimeout(300)
  ok((await db(p)).assignments.some(a => a.employeeId === nonCdl.id && a.date === today), 'D&A: cleared employee can be scheduled again')
  await ctx.close() }

// 6b CDL activation gate
{ const { p, ctx } = await open('hr'); await go(p, 'onboarding')
  const card = p.locator('.card', { hasText: 'Maria Delacruz' }).first(); await card.locator('[data-testid=hire-activate]').click(); await p.waitForTimeout(300)
  await p.getByRole('button', { name: 'Activate now' }).click(); await p.waitForTimeout(300)
  const txt = await p.evaluate(() => [...document.querySelectorAll('[role=dialog]')].map(d => d.innerText).join(' '))
  ok(/isn’t DOT-cleared to drive/.test(txt), 'onboarding: CDL activation stops for missing pre-employment test + Clearinghouse')
  p.once('dialog', d => d.accept(''))
  await p.getByRole('button', { name: 'Override with a reason' }).click(); await p.waitForTimeout(500)
  ok(!(await db(p)).employees.some(e => e.first === 'Maria' && e.last === 'Delacruz'), 'onboarding: override without a reason does not activate')
  await ctx.close() }

// 7 termination + 8 reviews
{ const { p, ctx } = await open('hr'); await go(p, 'people')
  const d0 = await db(p); const eli = d0.employees.find(e => e.first === 'Eli' && e.last === 'Bell'); const supId = eli.supervisorId
  await p.locator('main .card > div').filter({ hasText: 'Eli Bell' }).locator('[aria-label=Edit]').first().click(); await p.waitForTimeout(300)
  await p.locator('[data-testid=emp-status]').selectOption('Inactive'); ok(await p.locator('[data-testid=term-box]').count() === 1 && await p.locator('[data-testid=emp-save]').isDisabled(), 'termination: reason required')
  await p.locator('[data-testid=term-reason]').selectOption({ index: 1 }); await p.locator('[data-testid=emp-save]').click(); await p.waitForTimeout(500)
  const d1 = await db(p); const e1 = d1.employees.find(e => e.id === eli.id)
  ok(e1.status === 'Inactive' && e1.term?.reason && e1.term.rehire === true && !e1.supervisorId && !d1.assignments.some(a => a.employeeId === eli.id && a.date > e1.term.lastDay), `termination: Inactive, off future jobs + team (was ${supId}), reason/last day/rehire saved`)
  ok(await p.locator('[data-testid=emp-inactive]').count() >= 1, 'termination: directory shows Inactive')
  await as(p, 'field', eli.id); ok(await p.locator('[data-testid=field-inactive]').count() === 1, 'termination: field app blocked')
  await S(p, id => { const { actions } = window; }, eli.id)
  const before = (await db(p)).time.length; await S(p, id => window.__store.getState(), 0)
  // reviews
  await as(p, 'safety'); await go(p, 'people'); await p.locator('.seg-btn', { hasText: 'Records' }).first().click(); await p.waitForTimeout(400)
  const recs = await p.locator('[data-testid=hr-records]').innerText(); ok(!/Annual performance review/.test(recs), 'reviews: hidden from Safety (not HR, not their manager)')
  const d2 = await db(p); const rev = d2.hrRecords.find(r => r.kind === 'Review'); const mgr = d2.employees.find(e => e.id === rev.employeeId).supervisorId
  if (mgr) { await as(p, 'dispatch', mgr); await go(p, 'people'); await p.locator('.seg-btn', { hasText: 'Records' }).first().click(); await p.waitForTimeout(400); ok((await p.locator('[data-testid=hr-records]').innerText()).includes(rev.title), 'reviews: the direct manager sees their report’s review') }
  await as(p, 'hr'); await go(p, 'people'); await p.locator('.seg-btn', { hasText: 'Records' }).first().click(); await p.waitForTimeout(400); ok(/Annual performance review/.test(await p.locator('[data-testid=hr-records]').innerText()), 'reviews: HR sees reviews')
  await ctx.close() }

// 10 search + union city
{ const { p, ctx } = await open('hr')
  const q = async s => { if (!(await p.locator('[data-testid=ask-input]').count())) { await p.locator('[data-testid=ask]').first().click(); await p.waitForTimeout(300) } await p.locator('[data-testid=ask-input]').fill(s); await p.waitForTimeout(500); return p.evaluate(() => document.querySelector('[cmdk-list]')?.innerText.replace(/\n+/g, ' | ') ?? '') }
  for (const [s, want] of [['harassment', 'People'], ['terminate', 'People'], ['write up', 'People'], ['discipline', 'People'], ['anonymous', 'People'], ['workers comp', 'Safety'], ['osha 300', 'Safety'], ['kilgore', 'Union Locals']]) { const r = await q(s); const first = r.split(' | ').slice(1, 2)[0] ?? ''; ok(first.startsWith(want), `search "${s}" → ${first}`) }
  await p.keyboard.press('Escape'); await go(p, 'union'); await p.locator('.seg-btn', { hasText: 'List' }).first().click(); await p.waitForTimeout(400)
  for (const [c, l] of [['Kilgore', '178'], ['Longview', '178'], ['Odessa', '178'], ['Enid', '627']]) { await p.locator('[data-testid=union-search]').fill(c); await p.waitForTimeout(300); const t = await p.locator('[data-testid=union-local]').allInnerTexts(); ok(t.some(x => x.startsWith('Local ' + l)), `union: "${c}" → Local ${l}`) }
  await ctx.close() }

await browser.close()
const real = errors.filter(e => !e.startsWith('FAIL'))
console.log(real.length ? real.join('\n') : 'no page errors')
console.log(errors.filter(e => e.startsWith('FAIL')).length ? `\n${errors.filter(e => e.startsWith('FAIL')).length} FAILED` : '\nALL PASS')
process.exit(errors.length ? 1 : 0)
