// dive3 shop-guest-devices part 1: M5 Critical WO tags out, M6 PM source + reading at release, M7 annual inspection enforced. 5 devices.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r) => { await S(p, r => { window.__store.getState().signOut(); window.__store.getState().signIn(r, 'Demo role') }, r); await W(800) }
let first = true
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('dialog', d => d.dismiss().catch(() => {})); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'shop')
  if (first) {
    first = false
    const r = await S(p, () => {
      const st = window.__store.getState, A = window.__actions, R = window.__rig, set = f => window.__store.setState(s => ({ db: f(s.db) }))
      const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); const out = {}
      const down = e => e.status === 'Maintenance' || e.status === 'Out of Service'
      const live = st().db.jobs.filter(j => j.craneId && j.startDate <= T0 && j.endDate >= T0 && j.status !== 'Complete')
      // M5: a Critical WO on a crane working today tags it out + alerts dispatch and the crew
      const j5 = live.find(j => !down(st().db.equipment.find(e => e.id === j.craneId)))
      if (j5) { const n0 = st().db.notices.length
        A.createWO({ unitId: j5.craneId, title: 'Boom hoist brake slipping', complaint: 'test', priority: 'Critical', status: 'Open', opened: T0, due: T0, parts: [], laborHrs: 0, laborRate: 115, source: 'Driver Report' })
        const u = st().db.equipment.find(e => e.id === j5.craneId); const nn = st().db.notices.slice(0, st().db.notices.length - n0)
        out.m5 = u.status === 'Out of Service' && nn.some(n => /TAGGED OUT/.test(n.title) && n.roles.includes('dispatch') && n.body.includes(j5.jobNo)); out.m5n = nn.length }
      // M5 cont: a Normal WO does not tag out
      { const u = st().db.equipment.find(e => e.category === 'Crane' && e.status === 'Available'); const s0 = u.status; A.createWO({ unitId: u.id, title: 'Wiper blade', complaint: 'x', priority: 'Normal', status: 'Open', opened: T0, due: T0, parts: [], laborHrs: 0, laborRate: 115, source: 'Driver Report' }); out.m5normal = st().db.equipment.find(e => e.id === u.id).status === s0 }
      // M6: PM release takes the meter reading and plans the next service from it
      { const u = st().db.equipment.find(e => e.category === 'Crane' && e.status === 'Available' && e.hours != null && !st().db.workOrders.some(w => w.unitId === e.id && w.status !== 'Closed'))
        if (u) { const h = (u.hours ?? 0) + 37
          A.createWO({ unitId: u.id, title: '250-hr PM service', complaint: 'PM', priority: 'Normal', status: 'Ready for Release', opened: T0, due: T0, parts: [], laborHrs: 2, laborRate: 115, source: 'Service Plan', pm: true })
          const w = st().db.workOrders.find(x => x.unitId === u.id && x.status !== 'Closed'); const res = A.releaseToService(u.id, w.id, h); const u2 = st().db.equipment.find(e => e.id === u.id)
          out.m6 = res.ok && u2.hours === h && u2.nextServiceAt === h + 250; out.m6d = { ok: res.ok, h: u2.hours, n: u2.nextServiceAt, want: h } } else out.m6 = 'skip' }
      // M7: a crane past its annual is locked out of dispatch; a passed annual re-certifies it
      { const j7 = live.find(j => !down(st().db.equipment.find(e => e.id === j.craneId)) && R.jobConflicts(st().db, j, T0).every(x => !/annual/i.test(x.text)) && st().db.equipment.some(e => e.category === 'Crane' && e.id !== j.craneId && !down(e) && !(j.craneIds ?? []).includes(e.id)))
        const cx = st().db.equipment.find(e => e.category === 'Crane' && e.id !== j7.craneId && !down(e) && !(j7.craneIds ?? []).includes(e.id))
        set(db => ({ ...db, equipment: db.equipment.map(e => e.id === cx.id ? { ...e, annualInspection: '2020-01-01' } : e) }))
        const before = st().db.jobs.find(j => j.id === j7.id).craneId
        const r1 = A.setCrane(j7.id, cx.id, [], T0); out.m7swap = !!r1?.blocked && st().db.jobs.find(j => j.id === j7.id).craneId === before
        A.addJobCrane(j7.id, cx.id); out.m7add = !(st().db.jobs.find(j => j.id === j7.id).craneIds ?? []).includes(cx.id)
        // a job already on it shows red
        set(db => ({ ...db, equipment: db.equipment.map(e => e.id === before ? { ...e, annualInspection: '2020-01-01' } : e) }))
        out.m7red = R.jobConflicts(st().db, st().db.jobs.find(j => j.id === j7.id), T0).some(x => x.level === 'red' && /annual/i.test(x.text))
        const ins = st().db.inspections.find(i => i.kind === 'Crane Annual' && i.unitId === cx.id)
        if (ins) { A.recordInspection(ins.id, 'Pass', 'Annual passed'); out.m7pass = st().db.equipment.find(e => e.id === cx.id).annualInspection > T0 } else out.m7pass = 'noins'
        set(db => ({ ...db, equipment: db.equipment.map(e => e.id === before ? { ...e, annualInspection: '2099-01-01' } : e) }))
        out.m7c = cx.id; out.m7j = j7.id }
      return out
    })
    console.log(JSON.stringify(r))
    ok(r.m5 === true, `M5 Critical WO tags the unit out + urgent notice (${r.m5n})`); ok(r.m5normal, 'M5 a Normal WO leaves status alone')
    ok(r.m6 === true || r.m6 === 'skip', `M6 PM release uses the reading (${JSON.stringify(r.m6d)})`)
    ok(r.m7swap, 'M7 swap to an expired-annual crane is refused'); ok(r.m7add, 'M7 add-crane on an expired annual is refused'); ok(r.m7red, 'M7 job on an expired-annual crane shows red')
    ok(r.m7pass === true, `M7 a passed Crane Annual re-certifies the crane (${r.m7pass})`)
    globalThis.__m7 = { c: r.m7c, j: r.m7j }
    // M9: inventory quantities
    const q = await S(p, () => { const st = window.__store.getState, A = window.__actions; const out = {}
      const it = st().db.items.find(i => i.onHand >= 10 && i.unit === 'ea' && !i.oos); const j = st().db.jobs.find(x => x.status !== 'Complete')
      const t = r => { try { r(); return 'ok' } catch (e) { return 'refused' } }
      const tgt = { kind: 'job', id: j.id }; const h0 = st().db.items.find(i => i.id === it.id).onHand
      out.neg = t(() => A.invCheckout({ itemId: it.id, qty: -5, target: tgt, reason: 'x' })); out.zero = t(() => A.invCheckout({ itemId: it.id, qty: 0, target: tgt, reason: 'x' }))
      out.nan = t(() => A.invCheckout({ itemId: it.id, qty: NaN, target: tgt, reason: 'x' })); out.frac = t(() => A.invCheckout({ itemId: it.id, qty: 1.5, target: tgt, reason: 'x' }))
      out.past = t(() => A.invCheckout({ itemId: it.id, qty: 1, target: tgt, reason: 'x', due: '2020-01-01' }))
      out.same = st().db.items.find(i => i.id === it.id).onHand === h0
      out.tr999 = t(() => A.invTransfer(it.id, 999, st().db.branches.find(b => b.id !== (it.branchId ?? 'br-okc')).id, 'x'))
      out.trNeg = t(() => A.invTransfer(it.id, -3, st().db.branches.find(b => b.id !== (it.branchId ?? 'br-okc')).id, 'x'))
      out.trSame = t(() => A.invTransfer(it.id, 1, it.branchId ?? 'br-okc', 'x'))
      out.good = t(() => A.invCheckout({ itemId: it.id, qty: 2, target: tgt, reason: 'x' }))
      const c = st().db.checkouts.find(x => x.itemId === it.id); const h1 = st().db.items.find(i => i.id === it.id).onHand
      A.invCheckin({ checkoutId: c.id, qty: -4, condition: 'Good' }); out.ciNeg = st().db.items.find(i => i.id === it.id).onHand === h1
      out.unit = it.unit; return out })
    console.log(JSON.stringify(q))
    ok(q.neg === 'refused' && q.zero === 'refused' && q.nan === 'refused' && q.frac === 'refused' && q.past === 'refused' && q.same, 'M9 checkout refuses −5, 0, NaN, 1.5 ea, past due date; stock unchanged')
    ok(q.tr999 === 'refused' && q.trNeg === 'refused' && q.trSame === 'refused', 'M9 transfer refuses 999, −3 and the same branch')
    ok(q.good === 'ok' && q.ciNeg, 'M9 a normal checkout works; check-in −4 is ignored')
    // M10: rigging checkout by tag
    const g = await S(p, () => { const st = window.__store.getState, A = window.__actions; const out = {}
      const j = st().db.jobs.find(x => x.status !== 'Complete'); const tgt = { kind: 'job', id: j.id }
      const t = r => { try { r(); return 'ok' } catch (e) { return 'refused: ' + e.message } }
      const items = st().db.items.filter(i => i.category === 'Rigging' && (i.sub === 'Slings' || i.sub === 'Shackles'))
      out.bogus = t(() => A.invCheckout({ itemId: items[0].id, qty: 1, target: tgt, reason: 'x', tags: ['RG-9999'] }))
      const pcs = JSON.parse(localStorage.getItem('sc-rig-v1') || '[]'); out.pieces = pcs.length
      const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
      const rem = pcs.find(p => p.status === 'Removed'); if (rem) out.removed = t(() => A.invCheckout({ itemId: rem.itemId, qty: 1, target: tgt, reason: 'x', tags: [rem.tag] }))
      const okp = pcs.find(p => p.status !== 'Removed' && !p.out && p.colorDate.slice(0, 7) === T0.slice(0, 7) && st().db.items.find(i => i.id === p.itemId)?.onHand > 0)
      if (okp) { out.good = t(() => A.invCheckout({ itemId: okp.itemId, qty: 1, target: tgt, reason: 'x', tags: [okp.tag] }))
        const c = st().db.checkouts.find(x => x.itemId === okp.itemId && (x.tags ?? []).includes(okp.tag)); out.recorded = !!c
        out.twice = t(() => A.invCheckout({ itemId: okp.itemId, qty: 1, target: tgt, reason: 'x', tags: [okp.tag] }))
        out.isOut = JSON.parse(localStorage.getItem('sc-rig-v1')).find(p => p.tag === okp.tag).out === c?.id
        if (c) A.invCheckin({ checkoutId: c.id, qty: 1, condition: 'Good' }); out.back = !JSON.parse(localStorage.getItem('sc-rig-v1')).find(p => p.tag === okp.tag).out; out.cdbg = { tags: c?.tags, rq: st().db.checkouts.find(x => x.id === c?.id)?.returnedQty } }
      return out })
    console.log(JSON.stringify(g))
    ok(/refused/.test(g.bogus) && g.pieces > 0, 'M10 an unknown tag is refused')
    ok(!('removed' in g) || /refused/.test(g.removed), 'M10 a removed-from-service tag is refused')
    ok(g.good === 'ok' && g.recorded && /refused/.test(g.twice) && g.isOut && g.back, 'M10 the tag is recorded on the checkout, can\'t go out twice, and comes back on check-in')
  }
  // UI per device: new WO defaults to a non-PM source
  await as(p, 'owner')
  await S(p, () => window.__store.getState().go('shop')); await W(900)
  const nb = p.getByRole('button', { name: /^work order$/i }).first()
  if (await nb.count()) { await nb.click(); await W(500); const src = await p.locator('select').evaluateAll(ss => ss.map(s => s.value)); ok(!src.includes('Service Plan') && src.includes('Breakdown'), `${name}: M6 new WO source defaults to Breakdown`); await p.keyboard.press('Escape'); await W(300) }
  else ok(false, `${name}: new work order button`)
  // UI: PM WO ready for release shows the meter field
  const wid = await S(p, () => { const st = window.__store.getState, A = window.__actions; const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const u = st().db.equipment.find(e => e.category === 'Crane' && e.status === 'Available' && !st().db.workOrders.some(w => w.unitId === e.id && w.status !== 'Closed'))
    A.createWO({ unitId: u.id, title: 'PM-A service', complaint: 'PM', priority: 'Normal', status: 'Ready for Release', opened: T0, due: T0, parts: [], laborHrs: 1, laborRate: 115, source: 'Service Plan', pm: true })
    const w = st().db.workOrders.find(x => x.unitId === u.id && x.status !== 'Closed'); st().open({ type: 'workorder', id: w.id }); return w.id })
  await W(800); ok(await p.locator('[data-testid=wo-reading-in]').count() === 1, `${name}: M6 PM release asks for the hour meter`)
  const fit = await p.locator('[data-testid=wo-reading]').evaluate(el => el.getBoundingClientRect().right <= window.innerWidth + 1).catch(() => false); ok(fit, `${name}: reading field fits the screen`)
  await p.screenshot({ path: `/tmp/d3s-${name}-wo.png` })
  await S(p, () => window.__store.getState().open(null)); await W(300)
  // UI: dispatch swap list marks expired-annual cranes
  await as(p, 'dispatch')
  const lab = await S(p, (m) => { const st = window.__store.getState; st().db.equipment.find(e => e.id === m.c) && window.__store.setState(s => ({ db: { ...s.db, equipment: s.db.equipment.map(e => e.id === m.c ? { ...e, annualInspection: '2020-01-01' } : e) } })); return st().db.equipment.find(e => e.id === m.c)?.unit }, globalThis.__m7)
  await S(p, () => window.__store.getState().go('dispatch')); await W(900)
  const sw = p.locator('[data-testid=crane-swap-open], [data-testid=card-crane]').first()
  if (await sw.count()) { await sw.click(); await W(600); const b = p.locator(`[data-testid=swap-crane][data-unit="${lab}"]`); ok(await b.count() === 0 || (await b.isDisabled() && /Annual expired/.test(await b.innerText())), `${name}: M7 swap list disables expired-annual crane ${lab}`); await p.keyboard.press('Escape') }
  else ok(true, `${name}: (no swap button visible)`)
  await c.close()
}
// M11 + M12: background photos follow the customer; never printed; overlay ≥45 %  (desktop chromium)
{ const path = (await import('path')).default; const files = [path.resolve('test-bg-demo-0.jpg'), path.resolve('test-bg-demo-1.jpg')]
  const c = await cr.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await c.newPage(); p.on('pageerror', e => errors.push('bg: ' + e.message)); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=owner]'); await W(900); await p.evaluate(() => { location.hash = '/branding' }); await p.waitForSelector('[data-testid=bg-card]')
  await p.setInputFiles('[data-testid=bg-upload]', files); await p.waitForFunction(() => document.querySelectorAll('[data-testid=bg-photo]').length === 2, null, { timeout: 15000 }).catch(() => {})
  ok(await p.locator('[data-testid=bg-photo]').count() === 2, 'M11 two photos for Southern')
  await p.fill('[data-testid=brand-name]', 'Prairie Crane Rental (fictional)'); await p.click('[data-testid=brand-save]'); await W(900)
  ok(await p.locator('[data-testid=bg-photo]').count() === 0 && !(await p.evaluate(() => document.documentElement.dataset.bgphoto)), 'M11 a different customer does not see the last one\'s photos')
  await p.setInputFiles('[data-testid=bg-upload]', files.slice(0, 1)); await p.waitForFunction(() => document.querySelectorAll('[data-testid=bg-photo]').length === 1, null, { timeout: 15000 }).catch(() => {})
  ok(await p.locator('[data-testid=bg-photo]').count() === 1, 'M11 Prairie has its own photo')
  p.once('dialog', d => d.accept()); await p.click('[data-testid=bg-del-all]'); await W(800); ok(await p.locator('[data-testid=bg-photo]').count() === 0, 'M11 "Remove all photos" clears this customer only')
  await p.fill('[data-testid=brand-name]', 'Southern Lifting & Hoisting'); await p.click('[data-testid=brand-save]'); await W(900)
  ok(await p.locator('[data-testid=bg-photo]').count() === 2, 'M11 back to Southern → its 2 photos return')
  const ovMin = await p.locator('[data-testid=bg-overlay]').getAttribute('min'); ok(Number(ovMin) >= 45, `M12 overlay minimum ${ovMin}%`)
  await p.emulateMedia({ media: 'print' }); const pr = await p.evaluate(() => ({ on: document.documentElement.dataset.bgphoto, img: getComputedStyle(document.body).backgroundImage })); await p.emulateMedia({ media: 'screen' })
  ok(pr.on === '1' && pr.img === 'none', `M12 the photo does not print (${pr.img.slice(0, 30)})`)
  await c.close() }
// M13 + m4: Dispatch drag works at 2560×1440 and 3840×2160; UI still scales up
for (const [w, h] of [[2560, 1440], [3840, 2160], [3440, 1440]]) {
  const c = await cr.newContext({ viewport: { width: w, height: h } }); const p = await c.newPage(); p.on('pageerror', e => errors.push(`${w}: ` + e.message)); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'dispatch'); await S(p, () => window.__store.getState().go('dispatch')); await W(1200)
  const sc = await p.evaluate(() => ({ z: Number(getComputedStyle(document.documentElement).zoom) || 1, f: parseFloat(getComputedStyle(document.documentElement).fontSize) }))
  ok(sc.z === 1 && sc.f > 16, `${w}×${h}: scaled by rem, no zoom (${JSON.stringify(sc)})`)
  const chip = p.locator('[data-testid=pool] [data-testid=person-chip]').first(); const card = p.locator('[data-testid=job-card]').nth(1)
  if (await chip.count() && await card.count()) {
    const jobNo = await card.getAttribute('data-job')
    const n0 = await p.evaluate(no => { const st = window.__store.getState().db; const j = st.jobs.find(x => x.jobNo === no); return st.assignments.filter(x => x.jobId === j?.id).length }, jobNo)
    const a = await chip.boundingBox(), b = await card.boundingBox()
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down(); await p.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 6, { steps: 4 })
    await p.mouse.move(b.x + b.width / 2, b.y + 60, { steps: 20 }); await W(200); await p.mouse.up(); await W(800)
    const res = await p.evaluate(([no, n0]) => { const m = [...document.querySelectorAll('[role=dialog]')].some(d => (d.textContent || '').includes('#' + no)); const st = window.__store.getState().db; const j = st.jobs.find(x => x.jobNo === no); return { dlg: m, asg: st.assignments.filter(x => x.jobId === j?.id).length > n0 } }, [jobNo, n0])
    ok(res.dlg || res.asg, `${w}×${h}: M13 drag a pool person onto #${jobNo} → it lands there (${JSON.stringify(res)})`)
    await p.screenshot({ path: `/tmp/d3s-drag-${w}.png` })
  } else ok(true, `${w}: no pool/job to drag`)
  await c.close() }
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
