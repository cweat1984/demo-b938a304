/**
 * Round 2 break tests: crane inspections, signatures, supervisor time approval,
 * overnight hours, briefing text, crew chat, training records, ticket photos.
 * Each test asserts the behavior the product should have.
 */
import { test, expect, type Page } from 'playwright/test'

async function boot(page: Page) {
  await page.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await page.goto('/')
  await page.waitForFunction(() => (window as unknown as { __store?: { getState: () => { ready: boolean } } }).__store?.getState?.().ready === true)
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

test('a failed daily crane inspection with a critical defect tags the crane out', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'shop maintenance screen')
  await boot(page)
  await page.evaluate(() => {
    const s = (window as unknown as { __store: { getState: () => { signIn: (r: string, m: string) => void; go: (p: string) => void } } }).__store.getState()
    s.signIn('shop', 'Demo role')
    s.go('maint')
  })
  await page.getByTestId('insp-form').waitFor()
  const unit = await page.evaluate(() => {
    const label = document.querySelector('[data-testid=insp-form] .label')?.textContent || ''
    const unitNo = label.split('·')[0].trim()
    const u = (window as unknown as { __store: { getState: () => { db: { equipment: { id: string; unit: string; status: string }[] } } } }).__store.getState().db.equipment.find(e => e.unit === unitNo)
    return u ? { id: u.id, unit: u.unit, status: u.status } : null
  })
  expect(unit).toBeTruthy()
  const items = page.getByTestId('insp-item')
  const n = await items.count()
  for (let i = 0; i < n; i++) {
    const row = items.nth(i)
    const name = (await row.innerText()).split('\n')[0]
    await row.getByRole('button', { name: /Wire rope/i.test(name) ? 'Fail' : 'Pass' }).click()
    if (/Wire rope/i.test(name)) await row.getByTestId('insp-note').fill('Birdcage at the hook')
  }
  await page.getByTestId('insp-submit').click()
  const after = await page.evaluate((id) => {
    const u = (window as unknown as { __store: { getState: () => { db: { equipment: { id: string; status: string }[]; workOrders: { unitId: string; priority: string; title: string }[] } } } }).__store.getState().db
    const wo = dbWork(u, id)
    return { status: u.equipment.find(e => e.id === id)?.status, wo }
    function dbWork(db: { workOrders: { unitId: string; priority: string; title: string }[] }, unitId: string) {
      return db.workOrders.find(w => w.unitId === unitId && /Wire rope/i.test(w.title)) || null
    }
  }, unit!.id)
  expect(after.wo?.priority, 'a wire-rope failure should open a critical work order').toBe('Critical')
  expect(after.status, `${unit!.unit} stayed ${after.status} after a critical daily defect`).toBe('Out of Service')
})

test('passing the annual inspection on the maintenance form certifies the crane', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'shop maintenance screen')
  await boot(page)
  await page.evaluate(() => {
    const s = (window as unknown as { __store: { getState: () => { signIn: (r: string, m: string) => void; go: (p: string) => void } } }).__store.getState()
    s.signIn('shop', 'Demo role')
    s.go('maint')
  })
  await page.getByTestId('insp-form').waitFor()
  const before = await page.evaluate(() => {
    const label = document.querySelector('[data-testid=insp-form] .label')?.textContent || ''
    const unitNo = label.split('·')[0].trim()
    const u = (window as unknown as { __store: { getState: () => { db: { equipment: { id: string; unit: string; annualInspection?: string }[] } } } }).__store.getState().db.equipment.find(e => e.unit === unitNo)
    return { id: u!.id, unit: u!.unit, annual: u!.annualInspection }
  })
  await page.getByRole('tab', { name: 'Annual' }).click()
  const n = await page.getByTestId('insp-pass').count()
  for (let i = 0; i < n; i++) await page.getByTestId('insp-pass').nth(i).click()
  await page.getByTestId('insp-cert').fill('CWI-100')
  await page.getByTestId('insp-sign').fill('Robert Adams')
  await page.getByTestId('insp-submit').click()
  const annual = await page.evaluate((id) => (window as unknown as { __store: { getState: () => { db: { equipment: { id: string; annualInspection?: string }[] } } } }).__store.getState().db.equipment.find(e => e.id === id)?.annualInspection, before.id)
  expect(annual, `${before.unit} annual stayed ${before.annual}`).not.toBe(before.annual)
  expect(annual! > today()).toBeTruthy()
})

test('the signature pad keeps its stroke aligned after the phone rotates', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'field phone')
  await boot(page)
  const who = await page.evaluate((today) => {
    const db = (window as unknown as { __store: { getState: () => { db: { assignments: { employeeId: string; jobId: string; date: string }[]; tickets: { jobId: string; date: string; signedAt?: string }[]; employees: { id: string; first: string; last: string }[] }; signIn: (r: string, m: string, id?: string) => void } } }).__store.getState()
    const hit = db.db.assignments.find(a => a.date === today && !db.db.tickets.some(t => t.jobId === a.jobId && t.date === today && t.signedAt))
    if (!hit) return null
    db.signIn('field', 'Demo role', hit.employeeId)
    const e = db.db.employees.find(x => x.id === hit.employeeId)!
    return e.first + ' ' + e.last
  }, today())
  expect(who, 'someone dispatched today without a signed ticket').toBeTruthy()
  await page.getByTestId('field-app').waitFor()
  await page.getByTestId('ftab-ticket').click()
  await page.getByRole('button', { name: /Today ·/ }).click()
  await page.getByTestId('ticket-next').click()
  const pad = page.getByTestId('sig-pad')
  const box = await pad.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.move(box!.x + 40, box!.y + 50)
  await page.mouse.down()
  await page.mouse.move(box!.x + 160, box!.y + 100, { steps: 5 })
  await page.mouse.up()
  await page.setViewportSize({ width: 800, height: 412 })
  await page.waitForTimeout(200)
  const drift = await pad.evaluate((c: HTMLCanvasElement) => Math.abs(c.width - c.getBoundingClientRect().width * window.devicePixelRatio))
  expect(drift, 'canvas bitmap no longer matches the rotated pad').toBeLessThan(3)
})

test('a supervisor cannot approve a day that is over 16 hours', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'field supervisor phone')
  await boot(page)
  const setup = await page.evaluate((today) => {
    const st = (window as unknown as { __store: { getState: () => { db: {
      jobs: { id: string; jobNo: string; supervisorId?: string }[]
      assignments: { jobId: string; employeeId: string; date: string }[]
      employees: { id: string; first: string; last: string }[]
    }; signIn: (r: string, m: string, id?: string) => void } }; __actions: { submitTime: (e: Record<string, unknown>, o?: { hours: number }) => { ok: boolean } } }).__store.getState()
    const job = st.db.jobs.find(j => j.supervisorId && st.db.assignments.some(a => a.jobId === j.id && a.date === today && a.employeeId !== j.supervisorId))
    if (!job) return null
    const crew = st.db.assignments.find(a => a.jobId === job.id && a.date === today && a.employeeId !== job.supervisorId)!
    const emp = st.db.employees.find(e => e.id === crew.employeeId)!
    const sup = st.db.employees.find(e => e.id === job.supervisorId)!
    const actions = (window as unknown as { __actions: { submitTime: (e: Record<string, unknown>, o?: { hours: number }) => { ok: boolean } } }).__actions
    actions.submitTime({ employeeId: emp.id, jobId: job.id, date: today, activity: 'Lifting & Hoisting', start: '05:00', end: '15:00', mealMin: 0, perDiems: [] }, { hours: 10 })
    actions.submitTime({ employeeId: emp.id, jobId: job.id, date: today, activity: 'Rigging', start: '15:30', end: '23:00', mealMin: 0, perDiems: [] }, { hours: 7.5 })
    st.signIn('field', 'Demo role', sup.id)
    return { sup: sup.first + ' ' + sup.last, emp: emp.first + ' ' + emp.last, job: job.jobNo }
  }, today())
  expect(setup, 'a supervisor with crew today').toBeTruthy()
  await page.getByTestId('field-app').waitFor()
  await page.getByTestId('tile-crew').click()
  const card = page.locator('[data-testid=crew-job]', { hasText: setup!.emp })
  await card.getByTestId('crew-approve').click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  const rows = await page.evaluate((today) => {
    const db = (window as unknown as { __store: { getState: () => { db: { time: { employeeId: string; date: string; hours: number; status: string }[]; employees: { id: string; first: string; last: string }[] } } } }).__store.getState().db
    return db.time.filter(t => t.date === today && t.hours >= 7).map(t => {
      const e = db.employees.find(x => x.id === t.employeeId)
      return { who: e ? e.first + ' ' + e.last : '', hours: t.hours, status: t.status }
    })
  }, today())
  const approved = rows.filter(r => r.who === setup!.emp && r.status === 'Approved')
  expect(approved, `${setup!.emp} ${approved.map(r => r.hours + 'h ' + r.status).join(', ')}`).toHaveLength(0)
})

test('an overnight shift that crosses midnight splits onto the next calendar day', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'time store')
  await boot(page)
  const row = await page.evaluate(() => {
    const st = (window as unknown as { __store: { getState: () => { signIn: (r: string, m: string) => void; db: { employees: { id: string; status: string; craft: string }[]; jobs: { id: string; status: string }[]; time: { employeeId: string; date: string; hours: number; start: string; end: string }[] } } }; __actions: { submitTime: (e: Record<string, unknown>) => { ok: boolean } } })
    st.__store.getState().signIn('payroll', 'Demo role')
    const db = st.__store.getState().db
    const emp = db.employees.find(e => e.status === 'Active' && e.craft === 'Rigger')!
    const job = db.jobs.find(j => j.status !== 'Complete')!
    st.__actions.submitTime({ employeeId: emp.id, jobId: job.id, date: '2026-11-08', activity: 'Lifting & Hoisting', start: '22:00', end: '06:00', mealMin: 0, perDiems: [], note: 'overnight-split' })
    const rows = st.__store.getState().db.time.filter(t => t.employeeId === emp.id && t.note === 'overnight-split')
    return { sun: rows.filter(t => t.date === '2026-11-08').map(t => t.hours), mon: rows.filter(t => t.date === '2026-11-09').reduce((s, t) => s + t.hours, 0) }
  })
  expect(row.sun.reduce((s, n) => s + n, 0), 'Sunday should keep only the hours before midnight').toBe(2)
  expect(row.mon, 'Monday should receive the hours after midnight').toBe(6)
})

test('the daily briefing toolbox line is a talk that was actually posted', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'safety home')
  await boot(page)
  await page.evaluate(() => (window as unknown as { __store: { getState: () => { signIn: (r: string, m: string) => void } } }).__store.getState().signIn('safety', 'Demo role'))
  await page.getByTestId('role-briefing-btn').first().click()
  await page.getByRole('button', { name: /Push to every crew/ }).waitFor()
  const spoken = (await page.getByRole('button', { name: /Push to every crew/ }).innerText()).split('\n')[0].trim()
  const titles = await page.evaluate((today) => (window as unknown as { __store: { getState: () => { db: { talks: { date: string; title: string; kind: string }[] } } } }).__store.getState().db.talks.filter(t => t.date === today).map(t => t.title), today())
  expect(spoken.length, 'briefing names a toolbox talk').toBeGreaterThan(5)
  expect(titles.some(t => spoken.includes(t) || t.includes(spoken)), `briefing said "${spoken}" but today's talks are ${titles.slice(0, 4).join(' | ')}`).toBeTruthy()
})

test('a crew message stays unread for the people who did not send it', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'messages')
  await boot(page)
  await page.evaluate(() => {
    const s = (window as unknown as { __store: { getState: () => { signIn: (r: string, m: string) => void; go: (p: string) => void } } }).__store.getState()
    s.signIn('owner', 'Demo role')
    s.go('messages')
  })
  await page.getByTestId('chat-item').nth(3).click()
  await page.getByTestId('msg-input').fill('Gate is open, setting up now.')
  await page.getByTestId('msg-send').click()
  const unread = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('sc-batch4') || 'null') as { state?: { chats?: { title: string; msgs: { text: string }[]; lastRead: number }[] } }
    const chats = raw?.state?.chats || []
    const chat = chats.find(c => c.msgs.some(m => m.text === 'Gate is open, setting up now.'))
    if (!chat) return null
    return { title: chat.title, unread: chat.msgs.length - chat.lastRead }
  })
  expect(unread, 'message was stored').toBeTruthy()
  expect(unread!.unread, `${unread!.title} was marked read for the whole crew`).toBeGreaterThan(0)
})

test('a hire with orientation still open is not activated onto the roster with no training certs', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'HR action')
  await boot(page)
  const result = await page.evaluate(() => {
    const st = (window as unknown as { __store: { getState: () => { signIn: (r: string, m: string) => void; db: { hires: { id: string; first: string; last: string; steps: Record<string, boolean> }[]; employees: { id: string; status: string }[]; certs: { employeeId: string; type: string }[] } } }; __actions: { activateHire: (id: string) => string | undefined } })
    st.__store.getState().signIn('hr', 'Demo role')
    const h = st.__store.getState().db.hires.find(x => x.steps && x.steps.training === false)
    if (!h) return null
    const id = st.__actions.activateHire(h.id)
    const db = st.__store.getState().db
    const e = id ? db.employees.find(x => x.id === id) : undefined
    return { name: h.first + ' ' + h.last, training: h.steps.training, id: id || null, status: e?.status || null, certs: id ? db.certs.filter(c => c.employeeId === id).map(c => c.type) : [] }
  })
  expect(result, 'a hire whose orientation step is still open').toBeTruthy()
  expect(result!.status, `${result!.name} was activated while orientation was open`).not.toBe('Active')
})

test('photos attached to a ticket show on the signed copy', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'field phone')
  await boot(page)
  const who = await page.evaluate((today) => {
    const db = (window as unknown as { __store: { getState: () => { db: { assignments: { employeeId: string; jobId: string; date: string }[]; tickets: { jobId: string; date: string; signedAt?: string }[]; employees: { id: string }[] }; signIn: (r: string, m: string, id?: string) => void } } }).__store.getState()
    const hit = db.db.assignments.find(a => a.date === today && !db.db.tickets.some(t => t.jobId === a.jobId && t.date === today && t.signedAt))
    if (!hit) return null
    db.signIn('field', 'Demo role', hit.employeeId)
    return hit.employeeId
  }, today())
  expect(who).toBeTruthy()
  await page.getByTestId('field-app').waitFor()
  await page.getByTestId('ftab-ticket').click()
  await page.getByRole('button', { name: /Today ·/ }).click()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.getByTestId('ticket-photo').setInputFiles({ name: 'pad.png', mimeType: 'image/png', buffer: png })
  await expect(page.getByTestId('photo-thumb').first()).toBeVisible()
  await page.getByTestId('ticket-next').click()
  const pad = page.getByTestId('sig-pad')
  const box = await pad.boundingBox()
  await page.mouse.move(box!.x + 30, box!.y + 40)
  await page.mouse.down()
  await page.mouse.move(box!.x + 140, box!.y + 90, { steps: 4 })
  await page.mouse.up()
  await page.getByTestId('ticket-save').click()
  await page.getByTestId('ticket-signed').waitFor()
  const stored = await page.evaluate((today) => {
    const t = (window as unknown as { __store: { getState: () => { db: { tickets: { date: string; photoRefs?: string[] }[] } } } }).__store.getState().db.tickets.find(x => x.date === today && (x.photoRefs?.length || 0) > 0)
    return t?.photoRefs?.length || 0
  }, today())
  expect(stored, 'the photo was saved on the ticket').toBeGreaterThan(0)
  await expect(page.getByTestId('ticket-pdf').getByTestId('photo-thumb')).toBeVisible()
})
