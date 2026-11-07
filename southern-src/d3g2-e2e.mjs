// dive3 dispatch part 2: M5 extra dupes, M7 colour rules on the company record + m4 one audit row, M9 crane remove undo, M10 operator per crane,
// M11 drive time between same-day jobs, M12 tap an open slot + board-first on phones + sticky forecast column, m3 ask answer, m6 audit line. 5 devices.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const S = (p, f, a) => p.evaluate(f, a)
const as = async (p, r) => { await S(p, r => { window.__store.getState().signOut(); window.__store.getState().signIn(r, 'Demo role') }, r); await W(800) }
let first = true
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab800', cr, { viewport: { width: 800, height: 1280 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message)); p.on('dialog', d => d.dismiss().catch(() => {})); await c.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=der]'); await as(p, 'dispatch')
  if (first) {
    first = false
    const r = await S(p, () => {
      const st = window.__store.getState, A = window.__actions, R = window.__rig, C = window.__colors, set = f => window.__store.setState(s => ({ db: f(s.db) }))
      const T0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }); const out = {}
      const live = st().db.jobs.filter(j => j.craneId && j.startDate <= T0 && j.endDate >= T0 && j.status !== 'Complete')
      // M11: two half-day jobs far apart can't share a crane with a 1 h gap; same site can
      let a, b; for (const x of live) for (const y of live) if (!a && x.id !== y.id && R.driveHours(st().db, x, y) > 2) { a = x; b = y }
      out.pair = !!a
      if (a) {
        set(db => ({ ...db, jobs: db.jobs.map(j => j.id === b.id ? { ...j, craneIds: [...(j.craneIds ?? []), a.craneId], craneHours: { [a.craneId]: { from: '13:00', to: '17:00' } } } : j.id === a.id ? { ...j, craneHours: { [a.craneId]: { from: '06:00', to: '12:00' } } } : j) }))
        const s1 = R.sharedOn(st().db, st().db.jobs.find(j => j.id === a.id), a.craneId, T0).find(x => x.job.id === b.id); out.m11red = !!s1?.clash && /drive/.test(s1.why || ''); out.m11why = s1?.why
        set(db => ({ ...db, jobs: db.jobs.map(j => j.id === b.id ? { ...j, siteId: a.siteId } : j) }))
        const s2 = R.sharedOn(st().db, st().db.jobs.find(j => j.id === a.id), a.craneId, T0).find(x => x.job.id === b.id); out.m11same = s2 && !s2.clash
        // M10: b now has two own cranes → two Operators needed
        const jb = st().db.jobs.find(j => j.id === b.id); out.m10 = R.requiredPositions(jb, T0).filter(x => x === 'Operator').length >= 2
        // m6: a new job on a booked crane writes the clash into its audit line
        A.createJob({ ...a, id: 't-m6', jobNo: '19998', craneIds: [], craneHours: {}, rig: [], outside: [] }, [])
        out.m6 = (st().db.audit.find(x => x.entity === 'Job #19998')?.detail || '').includes('double-booked')
      }
      // M5: a repeat tap inside 3 s is caught
      const j = live[0]; const e1 = A.addExtra(j.id, { kind: 'crew', role: 'Oiler', qty: 1 }), e2 = A.addExtra(j.id, { kind: 'crew', role: 'Oiler', qty: 1 }), e3 = A.addExtra(j.id, { kind: 'crew', role: 'Oiler', qty: 1, again: true })
      out.m5 = e1.ok && !e2.ok && e2.dupe && e3.ok
      // M9: removing a crane can be undone
      const jm = st().db.jobs.find(x => (x.craneIds ?? []).length); if (jm) { const cid = jm.craneIds[0]; const snap = A.removeJobCrane(jm.id, cid); const gone = !(st().db.jobs.find(x => x.id === jm.id).craneIds ?? []).includes(cid); A.restoreJobCranes(jm.id, snap); out.m9 = gone && st().db.jobs.find(x => x.id === jm.id).craneIds.includes(cid) } else out.m9 = 'skip'
      // M14: crew hear about an added crane and an outside hire
      { const jn = live.find(x => st().db.assignments.some(a => a.jobId === x.id && a.date >= T0)); const free = st().db.equipment.find(e => e.category === 'Crane' && e.status !== 'Maintenance' && e.status !== 'Out of Service' && !(e.annualInspection && e.annualInspection < T0) && jn && e.id !== jn.craneId && !(jn.craneIds ?? []).includes(e.id))
        if (jn && free) { const n0 = st().db.notices.length; A.addJobCrane(jn.id, free.id); const n1 = st().db.notices.length; const v = (st().db.craneVendors ?? [])[0]; if (v) A.saveOutsideCrane(jn.id, { id: 'oc-t14', vendorId: v.id, size: '300t', role: 'Work assist', status: 'Requested', from: jn.startDate, to: jn.startDate }); out.m14 = n1 > n0 && (!v || st().db.notices.length > n1) } else out.m14 = 'skip' }
      // M7 colour rules
      const D = C.useSchedColors.getState().colors
      out.m7 = [!!C.colorProblem('conflict', '#2e7d32', D), !!C.colorProblem('travel', '#d32f2f', D), !!C.colorProblem('open', '#ff4d00', D), !!C.colorProblem('open', '#cdecd0', D), !C.colorProblem('outstate', '#5e35b1', D), C.cleanColors({ open: '#ff4d00' }).open === '#e6e9ee', C.divMark('#ef4444') === '#64748b', C.divMark('#2563eb') === '#2563eb']
      return out })
    ok(r.pair, 'found two live jobs far apart')
    ok(r.m11red, `M11 1 h gap between far-apart half-days = clash (${r.m11why})`)
    ok(r.m11same, 'M11 same site, 1 h gap = shared (info)')
    ok(r.m10, 'M10 a second own crane needs a second Operator')
    ok(r.m6, 'm6 new job on a booked crane: clash in the audit line')
    ok(r.m5, 'M5 repeat tap caught; "Add another" allowed')
    ok(r.m9 === true || r.m9 === 'skip', 'M9 removed crane comes back with Undo')
    ok(r.m14 === true || r.m14 === 'skip', `M14 crew told about added crane + outside hire (${r.m14})`)
    ok(r.m7.every(Boolean), `M7 colour rules ${JSON.stringify(r.m7)}`)
    // M7 company record + m4 one audit row for a picker drag
    await as(p, 'owner'); await S(p, () => window.__store.getState().go('branding')); await p.waitForSelector('[data-testid=sched-colors]')
    const before = await S(p, () => window.__store.getState().db.audit.filter(a => a.action === 'Schedule color changed').length)
    const inp = p.locator('[data-testid=sched-color][data-cat=travel]'); for (const v of ['#a0c8f0', '#98c0ec', '#90b8e8']) { await inp.fill(v); await W(80) }
    await W(1300)
    const after = await S(p, () => ({ n: window.__store.getState().db.audit.filter(a => a.action === 'Schedule color changed').length, co: window.__store.getState().db.company?.schedColors?.travel }))
    ok(after.n - before === 1, `m4 one audit row for a picker drag (${after.n - before})`)
    ok(after.co === '#90b8e8', `M7 colours saved on the company record (${after.co})`)
    await p.locator('[data-testid=sched-hex][data-cat=conflict]').fill('#2e7d32'); await p.keyboard.press('Enter'); await W(300)
    ok(await p.locator('[data-testid=sched-error]').count() === 1, 'M7 Conflict can’t be set to green')
    await p.locator('[data-testid=sched-reset]').click(); await W(900)
    await as(p, 'dispatch'); await S(p, () => window.__store.getState().go('dispatch')); await W(900)
    // m3: the answer is shown when Enter opens the page
    await p.fill('[data-testid=ask-hero-input]', 'which cranes are free thursday'); await p.keyboard.press('Enter'); await W(700)
    ok(/free/i.test(await p.locator('[data-sonner-toast]').allInnerTexts().then(t => t.join(' '))), 'm3 ask answer stays on screen after Enter')
  }
  await S(p, () => window.__store.getState().go('dispatch')); await W(1000)
  const vh = await S(p, () => innerHeight), y = await p.locator('[data-testid=job-card]').first().evaluate(e => e.getBoundingClientRect().top)
  ok(y < vh, `${name}: M12 first job card on screen (${Math.round(y)} < ${vh})`)
  const os = p.locator('[data-testid=open-slot]')
  if (await os.count()) { await os.first().scrollIntoViewIfNeeded(); await os.first().click(); await W(600); ok(await p.locator('[data-testid=slot-pick]').count() === 1, `${name}: M12 tap an open slot → pick a person`); await p.keyboard.press('Escape'); await W(300) }
  else ok(true, `${name}: no open slots today`)
  await S(p, () => window.__store.getState().go('forecast')); await p.waitForSelector('[data-testid=forecast]'); await W(600)
  const st = await p.locator('[data-testid=forecast]').evaluate(el => { el.scrollLeft = 400; return new Promise(r => setTimeout(() => { const cell = el.querySelector('[data-testid=fc-crane-cell]'); r({ sw: el.scrollWidth > el.clientWidth, d: cell ? Math.round(cell.getBoundingClientRect().left - el.getBoundingClientRect().left) : 999 }) }, 200)) })
  ok(!st.sw || Math.abs(st.d) <= 2, `${name}: M12 forecast crane column stays put when scrolled (${JSON.stringify(st)})`)
  await p.screenshot({ path: `/tmp/d3g2-${name}-forecast.png` })
  await c.close()
}
ok(!errors.length, `no page errors (${errors.slice(0, 3).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); await cr.close(); await wk.close(); process.exit(fails.length ? 1 : 0)
