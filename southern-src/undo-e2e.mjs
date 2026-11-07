// Roster undo/redo. Emulated Chromium and WebKit only, not a physical device.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4195/'
const fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const wk = await webkit.launch()

async function desk() {
  const ctx = await cr.newContext({ viewport: { width: 1280, height: 800 } })
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', e => errors.push(e.message))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  await p.waitForSelector('[data-testid=undo-bar]')
  return { ctx, p, errors }
}
const count = (p, emp, job, date) => p.evaluate(({ emp, job, date }) => window.__store.getState().db.assignments.filter(a => a.employeeId === emp && a.jobId === job && a.date === date).length, { emp, job, date })

{
  const { ctx, p, errors } = await desk()
  ok(await p.locator('[data-testid=undo-btn]').isDisabled(), 'undo starts disabled')
  ok(await p.locator('[data-testid=redo-btn]').isDisabled(), 'redo starts disabled')
  const ids = await p.evaluate(() => {
    const st = window.__store.getState()
    const job = st.db.jobs.find(j => j.status !== 'Complete')
    const emp = st.db.employees.find(e => e.status === 'Active' && !e.ssHold && !st.db.assignments.some(a => a.employeeId === e.id && a.jobId === job.id && a.date === job.startDate))
    const emp2 = st.db.employees.find(e => e.id !== emp.id && e.status === 'Active' && !e.ssHold && !st.db.assignments.some(a => a.employeeId === e.id && a.jobId === job.id && a.date === job.startDate))
    return { job: job.id, date: job.startDate, emp: emp.id, emp2: emp2.id }
  })
  await p.evaluate(ids => window.__actions.assign(ids.job, ids.date, ids.emp, 'Rigger'), ids)
  await p.waitForTimeout(200)
  ok(!(await p.locator('[data-testid=undo-btn]').isDisabled()), 'undo enables after an assignment')
  ok(/Assign/.test(await p.locator('[data-testid=undo-label]').textContent() || ''), 'undo names the assignment')
  const n1 = await count(p, ids.emp, ids.job, ids.date)
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(200)
  ok(await count(p, ids.emp, ids.job, ids.date) === n1 - 1, 'Ctrl+Z removes the assignment')
  await p.keyboard.press('Control+y')
  await p.waitForTimeout(200)
  ok(await count(p, ids.emp, ids.job, ids.date) === n1, 'Ctrl+Y puts it back')
  await p.keyboard.press('Control+z')
  await p.keyboard.press('Control+Shift+z')
  await p.waitForTimeout(200)
  ok(await count(p, ids.emp, ids.job, ids.date) === n1, 'Ctrl+Shift+Z also redos')
  await p.evaluate(ids => window.__actions.assign(ids.job, ids.date, ids.emp2, 'Oiler'), ids)
  await p.waitForTimeout(150)
  ok(await p.locator('[data-testid=redo-btn]').isDisabled(), 'a new edit clears redo')
  const search = p.locator('[data-testid=ask]')
  await search.click()
  await p.locator('[data-testid=ask-input]').fill('hello undo')
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(150)
  const typed = await p.locator('[data-testid=ask-input]').inputValue()
  const still = await count(p, ids.emp2, ids.job, ids.date)
  ok(still === 1 && !/hello undo/.test(typed), `text field keeps native undo and does not undo the roster (${JSON.stringify(typed)})`)
  await p.keyboard.press('Escape')
  await p.evaluate(ids => {
    const id = window.__store.getState().db.assignments.find(a => a.employeeId === ids.emp2 && a.jobId === ids.job && a.date === ids.date)?.id
    window.__store.setState(s => ({ db: { ...s.db, assignments: s.db.assignments.filter(a => a.id !== id) } }))
  }, ids)
  await p.locator('[data-testid=undo-btn]').click()
  await p.waitForTimeout(250)
  ok(/already edited|Couldn’t undo/.test(await p.locator('[data-sonner-toast]').last().innerText().catch(() => '')), 'stale roster edit is refused instead of overwritten')
  const held = await p.evaluate(() => {
    const e = window.__store.getState().db.employees.find(e => e.status === 'Active' && !e.ssHold && !/driver|operator/i.test(e.craft || ''))
    window.__actions.ssHold(e.id, true)
    return e.id
  })
  await p.keyboard.press('Control+z')
  await p.waitForTimeout(150)
  ok(await p.evaluate(id => !!window.__store.getState().db.employees.find(e => e.id === id)?.ssHold, held), 'Ctrl+Z does not clear an accident hold')
  await p.evaluate(() => window.__store.getState().signIn('dispatch', 'Demo role'))
  await p.waitForTimeout(300)
  ok(await p.locator('[data-testid=undo-btn]').isDisabled() && (await p.locator('[data-testid=undo-label]').textContent()) === '', 'role change drops roster history')
  await p.evaluate(() => window.__store.getState().signIn('guest', 'Demo role'))
  await p.waitForTimeout(300)
  ok(await p.locator('[data-testid=undo-bar]').count() === 0, 'guest has no undo bar')
  ok(!errors.length, `no page errors (${errors.slice(0, 2).join(' | ')})`)
  await ctx.close()
}

{
  const ctx = await wk.newContext(devices['iPhone 14'])
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  await p.waitForSelector('[data-testid=undo-btn]')
  const box = await p.locator('[data-testid=undo-btn]').boundingBox()
  ok(!!box && box.width >= 43 && box.height >= 43, `phone undo control is at least 44px (${box && Math.round(box.width)}×${box && Math.round(box.height)})`)
  await p.tap('[data-testid=shortcut-help]')
  ok(await p.locator('[data-testid=shortcut-help-body]').isVisible(), 'shortcut help opens from a visible button')
  ok(/⌘Z|Ctrl\+Z/.test(await p.locator('[data-testid=shortcut-help-body]').innerText()), 'help lists undo keys')
  await ctx.close()
}

{
  const ctx = await cr.newContext({ viewport: { width: 1100, height: 700 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  const ids = await p.evaluate(() => {
    const st = window.__store.getState()
    const job = st.db.jobs.find(j => j.status !== 'Complete')
    const free = st.db.employees.filter(e => e.status === 'Active' && !e.ssHold && !st.db.assignments.some(a => a.employeeId === e.id && a.jobId === job.id && a.date === job.startDate))
    return { job: job.id, date: job.startDate, a: free[0].id, b: free[1].id }
  })
  await p.evaluate(ids => { window.__actions.assign(ids.job, ids.date, ids.a, 'Rigger'); window.__actions.assign(ids.job, ids.date, ids.b, 'Oiler') }, ids)
  await p.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur() })
  await p.keyboard.press('Meta+z')
  await p.waitForTimeout(150)
  ok(await count(p, ids.b, ids.job, ids.date) === 0 && await count(p, ids.a, ids.job, ids.date) === 1, 'Cmd+Z undoes only the latest roster edit')
  await p.keyboard.press('Meta+Shift+z')
  await p.waitForTimeout(150)
  ok(await count(p, ids.b, ids.job, ids.date) === 1, 'Cmd+Shift+Z redos it')
  await ctx.close()
}

await cr.close(); await wk.close()
console.log(fails.length ? `FAILED ${fails.length}\n` + fails.join('\n') : 'ALL PASS')
process.exit(fails.length ? 1 : 0)
