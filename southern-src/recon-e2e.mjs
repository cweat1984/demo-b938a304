// Role briefings for every role + Time reconciliation + My Info self-service.
// Screenshots → screenshots/briefing-{field,dispatch,sales,shop}.png, recon-*.png, myinfo-*.png
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const shots = '/workspace/southern-app/screenshots/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []; const fail = m => errors.push('FAIL ' + m); const ok = m => console.log('ok', m)
const PHONE = { width: 390, height: 844 }
async function ctxFor(role, vp = { width: 1500, height: 950 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.25, isMobile: mobile, hasTouch: mobile })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(`${role} console: ${m.text()}`) })
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const readDb = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('southern-command', 1); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get('db'); g.onsuccess = () => res(g.result) } }))
const go = (p, h) => p.evaluate(x => { location.hash = '/' + x }, h)
const wait = (p, ms = 700) => p.waitForTimeout(ms)
const playBrief = async p => { await p.click('[data-testid=role-briefing-btn] >> nth=0'); await p.waitForSelector('[data-testid=role-briefing-card]'); await p.click('[data-testid=role-briefing-card] [aria-label=Stop]').catch(() => {}); await wait(p, 500) }

// ---------- 1) briefing on every role ----------
for (const role of (process.env.SKIP_ROLES ? [] : ['dispatch', 'ops', 'shop', 'safety', 'hr', 'payroll', 'accounting', 'sales', 'frontdesk', 'branch'])) {
  const { p, ctx } = await ctxFor(role)
  if (!(await p.$('[data-testid=briefing-offer]'))) fail(`${role}: no auto-offer on first open`)
  await playBrief(p)
  const secs = await p.$$('[data-testid=brief-section]'); if (secs.length < 2) fail(`${role}: only ${secs.length} briefing sections`)
  const txt = await p.textContent('[data-testid=briefing-text]'); if (!txt || txt.length < 30) fail(`${role}: briefing text empty`)
  if (['dispatch', 'sales', 'shop'].includes(role)) await p.screenshot({ path: shots + `briefing-${role}.png` })
  const item = await p.$('[data-testid=role-briefing-card] button[data-testid^=brief-]:not([data-testid=brief-section])')
  if (!item) fail(`${role}: no tappable briefing item`)
  else { const sig = () => p.evaluate(() => location.hash + '|' + document.body.innerText.length); const h0 = await sig(); await item.click(); await wait(p, 1300); const drawer = await p.$('[role=dialog], [data-testid=entity-drawer], [data-testid=sds-sheet]'); const h1 = await sig(); if (!drawer && h0 === h1) fail(`${role}: briefing item opened nothing`) }
  // offer should not come back on reload the same day
  await p.reload(); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 5000 }).then(() => p.click(`[data-role="${role}"]`)).catch(() => {}); await wait(p, 900)
  if (await p.$('[data-testid=briefing-offer]')) fail(`${role}: auto-offer showed twice in one day`)
  ok(`${role} briefing: ${secs.length} sections, item opens detail`)
  await ctx.close()
}

// ---------- 2) time reconciliation: payroll queue ----------
{
  const { p, ctx } = await ctxFor('payroll')
  await go(p, 'time'); await wait(p); await p.click('text=Ticket reconciliation'); await p.waitForSelector('[data-testid=recon]')
  let db = await readDb(p)
  if (!db.tickets.some(t => t.id.startsWith('tk-split'))) fail('no multi-job day seeded')
  const st = async s => (await p.$$(`[data-status=${s}]`)).length
  const red0 = await st('red'), yel0 = await st('yellow'), grn0 = await st('green')
  if (red0 < 3) fail('expected ≥3 red days, got ' + red0); if (yel0 < 2) fail('expected ≥2 yellow days, got ' + yel0); if (grn0 < 20) fail('too few green days ' + grn0)
  if (!(await p.$('text=/2 jobs/'))) fail('multi-job day not visible in queue')
  ok(`recon queue: ${red0} red / ${yel0} yellow / ${grn0} green, multi-job days present`)
  // timeline side-by-side
  await p.click('[data-status=red] >> nth=0', { position: { x: 12, y: 30 } }); await p.waitForSelector('[data-testid=recon-timeline]')
  await p.screenshot({ path: shots + 'recon-queue.png' })
  // bulk approve greens
  const recs0 = (db.timeRecs ?? []).filter(r => r.status === 'Approved').length
  await p.click('[data-testid=recon-bulk]'); await wait(p)
  db = await readDb(p); const recs1 = db.timeRecs.filter(r => r.status === 'Approved').length
  if (recs1 - recs0 < 10) fail(`bulk approve greens approved only ${recs1 - recs0}`)
  if (await p.$('[data-testid=recon-bulk]')) fail('bulk button should disappear after approving all greens')
  ok(`bulk approved ${recs1 - recs0} green days`)
  // supervisor adds reason to an unexplained over → yellow → approve → cost lands
  const heath = db.employees.find(e => e.first === 'Heath' && e.last === 'Gibson') ?? null
  const redRow = p.locator('[data-status=red]').filter({ hasText: /\(\+/ }).first()
  await redRow.locator('[data-testid=recon-add-reason]').click(); await p.waitForSelector('[data-testid=reason-form]')
  if (!(await p.textContent('[data-testid=reason-form]')).includes('what was the extra')) fail('reason prompt text missing')
  await p.click('[data-testid="reason-Moved to another site"]'); await p.click('[data-testid=reason-save]'); await wait(p)
  db = await readDb(p)
  const rec = db.timeRecs.find(r => r.reason === 'Moved to another site'); if (!rec || rec.status !== 'Pending' || !rec.jobId) fail('supervisor reason not saved with job')
  const costBefore = db.costs.filter(c => c.jobId === rec.jobId && /Extra time/.test(c.description)).length
  await p.locator(`[data-testid="recon-${rec.employeeId}|${rec.date}"] [data-testid=recon-approve]`).click(); await wait(p)
  db = await readDb(p)
  if (db.costs.filter(c => c.jobId === rec.jobId && /Extra time/.test(c.description)).length !== costBefore + 1) fail('approved extra time did not cost to the job')
  ok('reason → yellow → approve posts extra labor to the job')
  // blowout: approve → unit work order labor
  const blow = db.timeRecs.find(r => r.reason.startsWith('Breakdown'))
  const woH = d => d.workOrders.filter(w => w.unitId === blow.unitId).reduce((s, w) => s + w.laborHrs, 0)
  const h0 = woH(db)
  await p.locator(`[data-testid="recon-${blow.employeeId}|${blow.date}"] [data-testid=recon-approve]`).click(); await wait(p)
  db = await readDb(p); if (!(woH(db) > h0)) fail('blowout time did not land on the unit')
  ok('blowout approved → hours land on the truck as repair cost')
  // ask why on the under day
  p.once('dialog', d => d.accept('Short 1.5h vs your ticket — did you leave early?'))
  await p.locator('[data-status=red]').filter({ hasText: /\(-/ }).first().locator('[data-testid=recon-ask]').click(); await wait(p)
  db = await readDb(p); if (!db.timeRecs.some(r => r.status === 'Asked')) fail('ask why not recorded')
  await p.click('text=Patterns'); await p.waitForSelector('[data-testid=recon-patterns]')
  await p.screenshot({ path: shots + 'recon-patterns.png' }); ok('ask why + patterns report')
  void heath
  await ctx.close()
}
// dispatch briefing mentions timecards
{
  const { p, ctx } = await ctxFor('dispatch'); await playBrief(p)
  if (!(await p.$('text=Timecards vs signed tickets'))) fail('dispatch briefing missing timecard section')
  await ctx.close()
}

// ---------- 3) field: prompt + reason on phone ----------
{
  const { p, ctx } = await ctxFor('field', PHONE, true)
  await playBrief(p)
  if (!(await p.$('[data-testid=brief-recon]'))) fail('field briefing: no "timecards needing a reason"')
  await p.screenshot({ path: shots + 'briefing-field.png' })
  await p.click('[data-testid=brief-recon] >> nth=0'); await wait(p)
  await p.waitForSelector('[data-testid=field-recon]')
  await p.click('[data-testid=field-recon-day] >> nth=0'); await p.waitForSelector('[data-testid=reason-form]'); await wait(p)
  const t = await p.textContent('[data-testid=reason-form]'); if (!/Your tickets total .* travel\. You entered .* what was the extra/.test(t)) fail('field prompt wording: ' + t.slice(0, 120))
  await p.screenshot({ path: shots + 'recon-field-prompt.png' })
  if (!(await p.isDisabled('[data-testid=reason-save]'))) fail('save should need a reason')
  await p.click('[data-testid=reason-Other]'); if (!(await p.isDisabled('[data-testid=reason-save]'))) fail('Other needs a note')
  await p.fill('[data-testid=reason-note]', 'Helped load the mats at the yard'); await p.click('[data-testid=reason-save]'); await wait(p)
  if (await p.$('[data-testid=field-recon]')) fail('field recon card should clear after explaining')
  const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) fail('field overflow ' + w)
  ok('field: briefing → time → prompt → reason saved')
  // My Info on phone
  await p.locator('[data-testid=ftab-more]').dispatchEvent('click'); await wait(p, 400); await p.click('[data-testid=tile-myinfo]'); await p.waitForSelector('[data-testid=myinfo-form]'); await wait(p)
  await p.selectOption('[data-testid=mi-shirt]', '3XL'); await p.click('[data-testid=myinfo-save]'); await wait(p)
  const db = await readDb(p); const me = db.employees.find(e => e.first === 'John' && e.last === 'Smith')
  if (me.sizes?.shirt !== '3XL') fail('field My Info: shirt size not saved')
  await p.screenshot({ path: shots + 'myinfo-field.png' }); ok('field My Info saves sizes')
  await ctx.close()
}

// ---------- 4) My Info desktop + HR notified ----------
{
  const { p, ctx } = await ctxFor('sales')
  await p.click('[data-nav=myinfo]'); await p.waitForSelector('[data-testid=myinfo-form]')
  await p.fill('[data-testid=mi-phone]', '(405) 555-0199')
  await p.fill('[data-testid=mi-address]', '1200 NW 63rd St, Oklahoma City, OK 73116')
  await p.click('[data-testid=ec-add]'); const n = (await p.$$('[data-testid=ec-row]')).length - 1
  if (!(await p.isDisabled('[data-testid=myinfo-save]'))) fail('incomplete emergency contact should block save')
  await p.fill(`[data-testid=ec-name-${n}]`, 'Maria Ramos'); await p.fill(`[data-testid=ec-phone-${n}]`, '(405) 555-0144')
  await p.click('[data-testid=myinfo-save]'); await wait(p)
  const db = await readDb(p); const me = db.employees.find(e => e.first === 'Chris' && e.last === 'Ramos')
  if (me.address !== '1200 NW 63rd St, Oklahoma City, OK 73116' || me.phone !== '(405) 555-0199') fail('My Info not saved')
  if (!me.emergencyContacts.some(c => c.name === 'Maria Ramos')) fail('emergency contact not saved')
  const ch = db.infoChanges.filter(c => c.employeeId === me.id); if (!ch.some(c => c.payroll && c.field === 'address')) fail('address change not flagged for payroll')
  if (!(await p.$('[data-testid=info-history]'))) fail('history not shown')
  await p.screenshot({ path: shots + 'myinfo-desktop.png' }); ok(`My Info desktop: ${ch.length} changes recorded, address flagged payroll`)
  const hp = await ctx.newPage(); hp.on('pageerror', e => errors.push('hr pageerror: ' + e.message))
  await hp.goto(base); await hp.waitForSelector('[data-role="hr"]', { timeout: 15000 }); await hp.click('[data-role="hr"]'); await wait(hp, 900)
  const h = { p: hp, ctx }; await playBrief(h.p)
  const it = await h.p.$('[data-testid=brief-infochange]:has-text("Chris Ramos")'); if (!it) fail('HR briefing: Chris Ramos change missing')
  else { await it.click(); await h.p.waitForSelector('[data-testid=emp-info]'); await h.p.click('[data-testid=info-reviewed]'); await wait(h.p); const d2 = await readDb(h.p); if (d2.infoChanges.some(c => c.employeeId === me.id && !c.hrSeen)) fail('HR mark reviewed failed'); ok('HR notified → employee profile shows changes → reviewed') }
  await h.ctx.close()
}

await browser.close()
if (errors.length) { console.log(errors.join('\n')); process.exit(1) } else console.log('RECON/BRIEFING/MYINFO E2E: all passed')
