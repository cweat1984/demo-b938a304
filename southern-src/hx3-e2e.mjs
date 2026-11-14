// Requirement H (part 3): one-tap extras from the Dispatch board for the board's day, roster check in the field, extras by date on tickets.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/hx/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const tap = async (p, sel) => { const l = typeof sel === 'string' ? p.locator(sel).first() : sel; await l.scrollIntoViewIfNeeded(); await l.click() }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['tab1280x800', cr, { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=dispatch]'); await W(1000); await p.evaluate(() => { location.hash = '/dispatch' }); await W(1000)
  const card = p.locator('[data-testid=job-card]').first(); await card.waitFor({ timeout: 10000 }); const jobNo = await card.getAttribute('data-job')
  const n0 = await card.locator('[data-testid=board-extra]').count()
  const add = card.locator('[data-testid=board-extra-add]'); ok(await add.count() === 1, `${name}: job card has a ± Extra button`)
  const bb = await add.boundingBox(); if (opts.hasTouch || opts.isMobile) ok(bb && bb.height >= 44, `${name}: ± Extra is a 44px touch target (${Math.round(bb?.height ?? 0)})`)
  await tap(p, add); await p.waitForSelector('[data-testid=board-extra-sheet]')
  await tap(p, '[data-testid=board-extra-pick][data-role=Rigger]')
  await p.locator('[data-testid=board-extra-row]').nth(0).waitFor({ timeout: 8000 })
  await tap(p, '[data-testid=board-extra-pick][data-role="Light tower"]')
  await p.locator('[data-testid=board-extra-row]').nth(1).waitFor({ timeout: 8000 })
  ok(await p.locator('[data-testid=board-extra-row]').count() >= 2, `${name}: one tap per extra — rigger and light tower on this day`)
  await p.screenshot({ path: out + name + '-board-extra-sheet.png' }); await p.keyboard.press('Escape'); await W(400)
  if (await p.locator('[data-testid=board-extra-sheet]').count()) { await p.locator('[aria-label=Close]').first().click().catch(() => {}); await W(300) }
  const card2 = p.locator(`[data-testid=job-card][data-job="${jobNo}"]`).first()
  ok(await card2.locator('[data-testid=board-extra]').count() === n0 + 2, `${name}: the card shows the extras for the board day`)
  const r = await p.evaluate(no => { const j = window.__store.getState().db.jobs.find(x => x.jobNo === no); return { audit: window.__store.getState().db.audit.filter(a => a.entity === `Job #${no}` && a.action === 'Added to job').length, review: (window.__store.getState().db.billingReview ?? []).filter(b => b.jobId === j.id).length } }, jobNo)
  ok(r.audit >= 2 && r.review >= 2, `${name}: board adds are audited and on billing review`)
  if (name === 'desk1920') {
    // tickets by date: customer sign page shows billable extras only, no money
    const tk = await p.evaluate(() => { const S = window.__store.getState(), db = S.db; const t = db.tickets.find(x => !x.signedAt && db.jobs.some(j => j.id === x.jobId && j.startDate <= x.date && j.endDate >= x.date)); if (!t) return null
      window.__actions.addExtra(t.jobId, { kind: 'person', role: 'Crane Manager', qty: 1, from: t.date, to: t.date })
      const r2 = window.__actions.addExtra(t.jobId, { kind: 'equipment', role: 'Forklift', qty: 1, from: t.date, to: t.date }); window.__actions.updateExtra(t.jobId, r2.id, { billable: false })
      if (!window.__store.getState().db.assignments.some(a => a.jobId === t.jobId && a.date === t.date && a.position === 'Oiler')) window.__actions.addExtra(t.jobId, { kind: 'person', role: 'Oiler', qty: 1, from: t.date, to: t.date }) // dive3 M5: only what's on the job can be removed
      window.__actions.addExtra(t.jobId, { kind: 'person', role: 'Oiler', qty: 1, action: 'remove', from: t.date, to: t.date })
      return t.id })
    if (tk) { await W(1200); const sp = await c.newPage(); sp.on('pageerror', e => errors.push(e.message)); await sp.setViewportSize({ width: 390, height: 844 }); await sp.goto(base + '?sign=' + tk); await sp.waitForSelector('[data-testid=ticket-extras]', { timeout: 15000 }).catch(() => {})
      const txt = await sp.textContent('[data-testid=ticket-extras]').catch(() => '')
      ok(/Crane Manager/.test(txt) && /Removed \(credit\).*Oiler/.test(txt), `customer ticket for that date shows the added crane manager and the oiler credit`)
      ok(!/Forklift/.test(txt), 'non-billable forklift never shows on the customer ticket'); ok(!/\$/.test(txt), 'no dollars on the ticket extras')
      await sp.screenshot({ path: out + 'iphone390-sign-ticket-extras.png' }); await sp.close() } else ok(true, 'no unsigned ticket to check')
  }
  await c.close() }
// roster check: supervisor sees people + equipment extras on today in My crew (no money)
{ const c = await wk.newContext(devices['iPhone 14']); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.tap('[data-sup=emp-2001]'); await W(1200)
  const ok2 = await p.evaluate(() => { const db = window.__store.getState().db; const t = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); const j = db.jobs.find(x => x.supervisorId === 'emp-2001' && x.status !== 'Complete' && x.startDate <= t && x.endDate >= t && db.assignments.some(a => a.jobId === x.id && a.date >= t)); if (!j) return false
    const cur = window.__store.getState().session; window.__store.setState({ session: { ...cur, role: 'dispatch' } }); window.__actions.addExtra(j.id, { kind: 'person', role: 'HSE', qty: 1, from: t }); window.__store.setState({ session: cur }); return true })
  if (ok2) { await p.tap('[data-testid=tile-crew]'); await p.waitForSelector('[data-testid=my-crew]'); await W(300)
    ok(/Roster check/.test(await p.textContent('[data-testid=my-crew]')) && await p.locator('[data-testid=jx-row]').count() >= 1, 'iPhone: supervisor roster check lists the extra HSE on today')
    ok(await p.locator('[data-testid=jx-money]').count() === 0 && await p.locator('[data-testid=jx-badge]').count() === 0, 'iPhone: roster check shows no money or billing flags'); await p.screenshot({ path: out + 'iphone390-roster-check.png' }) }
  else ok(true, 'no live supervisor job today')
  await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
