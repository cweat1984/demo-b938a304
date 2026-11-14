/**
 * Break tests for field time/tickets, JSAs, lift plans, accident holds,
 * drug-test clearance, and the injury report. Each test asserts the behavior
 * the product is supposed to have. They fail while that behavior is missing.
 *
 * Dev server only: window.__actions / window.__store exist when Vite is in dev.
 */
import { test, expect, type Page } from 'playwright/test'

async function boot(page: Page, role: string, employeeId?: string) {
  await page.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await page.goto('/')
  await page.waitForFunction(() => (window as unknown as { __store?: { getState: () => { ready: boolean } } }).__store?.getState?.().ready === true)
  await page.evaluate(({ role, employeeId }) => {
    const w = window as unknown as { __store: { getState: () => { signIn: (r: string, m: string, id?: string) => void } } }
    w.__store.getState().signIn(role, 'Demo role', employeeId)
  }, { role, employeeId })
}

function chicagoToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

test.describe('accident hold', () => {
  test('reporting a vehicle accident pulls every involved employee off dispatch until a negative test', async ({ page }) => {
    test.skip(test.info().project.name !== 'desktop', 'office safety form')
    await boot(page, 'safety')
    await page.evaluate(() => (window as unknown as { __store: { getState: () => { go: (p: string) => void } } }).__store.getState().go('safety'))
    const today = chicagoToday()
    const emp = await page.evaluate((today) => {
      const db = (window as unknown as { __store: { getState: () => { db: { employees: { id: string; first: string; last: string; craft: string; status: string; ssHold?: string }[]; assignments: { employeeId: string; date: string }[] } } } }).__store.getState().db
      const e = db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft !== 'Truck Driver' && db.assignments.some(a => a.employeeId === e.id && a.date >= today))
      if (!e) return null
      return { id: e.id, name: `${e.first} ${e.last}`, craft: e.craft, before: db.assignments.filter(a => a.employeeId === e.id && a.date >= today).length }
    }, today)
    expect(emp, 'need a non-driver who is on the board').toBeTruthy()

    await page.getByRole('button', { name: 'Report incident' }).click()
    await page.locator('select').filter({ has: page.locator('option', { hasText: 'Vehicle' }) }).selectOption({ label: 'Vehicle' })
    await page.getByTestId('inc-injured').selectOption(emp!.id)
    await page.getByTestId('inc-desc').fill('Yard truck struck the gate. This person was in the cab.')
    await page.getByTestId('inc-submit').click()

    const after = await page.evaluate(({ id, today }) => {
      const w = window as unknown as {
        __store: { getState: () => { db: { employees: { id: string; ssHold?: string }[]; assignments: { employeeId: string; date: string; jobId: string }[]; jobs: { id: string; jobNo: string; status: string; endDate: string }[] } } }
        __actions: { assign: (jobId: string, date: string, empId: string, pos: string) => void }
      }
      const db = w.__store.getState().db
      const e = db.employees.find(x => x.id === id)
      const job = db.jobs.find(j => j.status !== 'Complete' && j.endDate >= today)!
      const n0 = db.assignments.filter(a => a.employeeId === id && a.jobId === job.id && a.date === today).length
      w.__actions.assign(job.id, today, id, 'Rigger')
      const n1 = w.__store.getState().db.assignments.filter(a => a.employeeId === id && a.jobId === job.id && a.date === today).length
      return {
        hold: e?.ssHold ?? null,
        future: w.__store.getState().db.assignments.filter(a => a.employeeId === id && a.date >= today).length,
        n0, n1,
      }
    }, { id: emp!.id, today })

    expect(after.hold, `${emp!.name} (${emp!.craft}) stays dispatchable after the accident`).toBeTruthy()
    expect(after.future, 'future assignments should be removed').toBe(0)
    expect(after.n1, 'dispatch can still place them on a job').toBe(after.n0)
  })

  test('a field "someone got hurt" report names the injured person and pulls them off the board', async ({ page }) => {
    test.skip(test.info().project.name !== 'phone', 'field phone')
    await boot(page, 'field')
    await page.getByTestId('ftab-more').click()
    await page.getByTestId('tile-incident').click()
    await page.getByTestId('incident-form').waitFor()
    await expect(page.getByTestId('incident-form').getByRole('combobox'), 'the report has no control for who was hurt').toBeVisible()
  })
})

test('swapping a crane puts a held employee back on the job', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'dispatch action')
  await boot(page, 'dispatch')
  const result = await page.evaluate((today) => {
    const w = window as unknown as {
      __store: { getState: () => { db: {
        equipment: { id: string; unit: string; category: string; annualInspection?: string; status: string }[]
        employees: { id: string; first: string; last: string; craft: string; status: string; homeCraneId?: string; ssHold?: string }[]
        jobs: { id: string; jobNo: string; status: string; craneId?: string; startDate: string; endDate: string }[]
        assignments: { employeeId: string; jobId: string; date: string }[]
      } } }
      __actions: {
        ssHold: (id: string, on: boolean) => number
        setCrane: (jobId: string, craneId: string, decisions: { empId: string; position: string; decision: string }[], date: string) => { blocked?: string }
      }
    }
    const db = w.__store.getState().db
    const crane = db.equipment.find(c => c.category === 'Crane' && c.status !== 'Out of Service' && c.status !== 'Maintenance' && !(c.annualInspection && c.annualInspection < today) && db.employees.some(e => e.homeCraneId === c.id && e.status === 'Active'))
    const person = db.employees.find(e => e.homeCraneId === crane!.id && e.status === 'Active')!
    const job = db.jobs.find(j => j.status !== 'Complete' && j.craneId && j.craneId !== crane!.id && j.startDate <= today && j.endDate >= today)!
    w.__actions.ssHold(person.id, true)
    const home = w.__store.getState().db.employees.filter(e => e.homeCraneId === crane!.id && e.status === 'Active')
    const decisions = home.flatMap(e => {
      const elsewhere = w.__store.getState().db.assignments.find(a => a.employeeId === e.id && a.date === today && a.jobId !== job.id)
      if (elsewhere) return []
      const position = e.craft === 'Operator' ? 'Operator' : e.craft === 'Oiler' ? 'Oiler' : 'Rigger'
      return [{ empId: e.id, position, decision: 'move' }]
    })
    const blocked = w.__actions.setCrane(job.id, crane!.id, decisions, today)
    const after = w.__store.getState().db.assignments.filter(a => a.employeeId === person.id && a.jobId === job.id && a.date >= today)
    return {
      name: `${person.first} ${person.last}`,
      crane: crane!.unit,
      job: job.jobNo,
      included: decisions.some(d => d.empId === person.id),
      blocked: blocked && 'blocked' in blocked ? blocked.blocked : '',
      days: after.length,
      stillHeld: !!w.__store.getState().db.employees.find(e => e.id === person.id)?.ssHold,
    }
  }, chicagoToday())

  expect(result.included, 'the crane picker auto-moves permanent crew who have no other assignment, including someone who is held').toBeTruthy()
  expect(result.blocked).toBeFalsy()
  expect(result.days, `${result.name} was written onto job ${result.job} for ${result.days} day(s) while still held`).toBe(0)
  expect(result.stillHeld).toBeTruthy()
})

test('one Negative on a drug-and-alcohol order does not clear the other panel or the hold', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'DER screen')
  await boot(page, 'der')
  await page.getByRole('tab', { name: /Tests/ }).click()
  const empId = await page.evaluate(() => {
    const db = (window as unknown as { __store: { getState: () => { db: { employees: { id: string; status: string; craft: string; ssHold?: string }[] } } } }).__store.getState().db
    return db.employees.find(e => e.status === 'Active' && !e.ssHold && e.craft === 'Oiler')!.id
  })
  // The order button writes both panels in one turn. Date.now() is the whole id, so a
  // clock that does not tick between the two writes gives them the same id.
  await page.evaluate(() => { Date.now = () => 1_700_000_000_000 })
  await page.getByTestId('da-order-emp').selectOption(empId)
  await page.getByTestId('da-order-panel').selectOption('Both')
  await page.getByTestId('da-order-go').click()
  await page.getByTestId('da-result-Negative').first().click()

  const after = await page.evaluate((id) => {
    const tests = JSON.parse(localStorage.getItem('sc-da-v1') || '{"tests":[]}').tests.filter((t: { empId: string; kind: string }) => t.empId === id && t.kind === 'Post-accident')
    const e = (window as unknown as { __store: { getState: () => { db: { employees: { id: string; ssHold?: string }[] } } } }).__store.getState().db.employees.find(x => x.id === id)
    return { ids: tests.map((t: { id: string }) => t.id), rows: tests.map((t: { panel: string; result: string }) => `${t.panel}:${t.result}`), hold: !!e?.ssHold }
  }, empId)

  expect(new Set(after.ids).size, `panels share an id: ${after.ids.join(', ')}`).toBe(2)
  expect(after.rows.filter((r: string) => r.endsWith(':Pending')).length, after.rows.join(' | ')).toBe(1)
  expect(after.hold, 'hold lifted after a single Negative').toBeTruthy()
})

test('an unsigned JSA is not already signed by the whole crew', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'field phone')
  await page.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await page.goto('/')
  await page.waitForFunction(() => (window as unknown as { __store?: { getState: () => { ready: boolean } } }).__store?.getState?.().ready === true)
  const talk = await page.evaluate((today) => {
    const db = (window as unknown as { __store: { getState: () => { db: { talks: { id: string; kind: string; title: string; date: string; jobId?: string; signed: boolean; attendeeIds: string[] }[]; assignments: { employeeId: string; jobId: string; date: string }[]; employees: { id: string; status: string }[] }; signIn: (r: string, m: string, id?: string) => void } } }).__store.getState()
    const t = db.db.talks.find(t => t.kind === 'JSA' && t.date === today && t.signed === false && t.attendeeIds.length > 0)
    if (!t) return null
    const crew = [...new Set(db.db.assignments.filter(a => a.date === t.date && a.jobId === t.jobId).map(a => a.employeeId))].filter(id => db.db.employees.find(e => e.id === id)?.status !== 'Inactive')
    const miss = crew.filter(id => !t.attendeeIds.includes(id))
    db.signIn('field', 'Demo role', t.attendeeIds[0])
    return { title: t.title, signed: t.signed, label: `${t.attendeeIds.length} of ${new Set([...crew, ...t.attendeeIds]).size} signed`, miss: miss.length }
  }, chicagoToday())
  expect(talk, 'seed has an unsigned JSA today').toBeTruthy()
  await page.getByTestId('field-app').waitFor()
  await page.getByTestId('ftab-more').click()
  await page.getByRole('button', { name: 'JSA & toolbox' }).click()
  const card = page.locator('[data-testid=jsa-talk]', { hasText: talk!.title })
  await expect(card.getByTestId('jsa-sign')).not.toHaveText(/You signed/)
  expect(talk!.miss, `${talk!.title} shows as "${talk!.label}" while signed is false`).toBeGreaterThan(0)
})

test('a 15 hour day is not filed as ordinary submitted time', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'field phone')
  await boot(page, 'field')
  await page.getByTestId('ftab-time').click()
  await page.getByRole('button', { name: '+ Add time' }).click()
  await page.locator('input[type=time]').nth(0).fill('05:00')
  await page.locator('input[type=time]').nth(1).fill('20:30')
  await page.getByTestId('manual-meal').fill('30')
  await expect(page.getByTestId('manual-err')).toHaveCount(0)
  await page.getByTestId('manual-save').click()
  const toast = (await page.locator('[data-sonner-toast]').allTextContents()).join(' ')
  const row = await page.evaluate(() => {
    const st = (window as unknown as { __store: { getState: () => { session: { employeeId: string }; db: { time: { employeeId: string; hours: number; status: string; note?: string; submittedAt?: string }[] } } } }).__store.getState()
    return st.db.time.filter(t => t.employeeId === st.session.employeeId).sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''))[0]
  })
  expect(toast, `toast was "${toast}" for a ${row?.hours}h ${row?.status} row (${row?.note})`).toMatch(/held|review|flag/i)
  expect(row?.status).not.toBe('Flagged')
})

test('browser Forward returns to Ticket, and Back still walks Ticket to Time to Job', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'field phone')
  await boot(page, 'field')
  await page.getByTestId('field-app').waitFor()
  const active = () => page.evaluate(() => [...document.querySelectorAll('[data-testid^=ftab-]')].find(el => el.className.includes('text-accent'))?.getAttribute('data-testid') || '')
  await page.getByTestId('ftab-time').click()
  await page.getByTestId('ftab-ticket').click()
  expect(await active()).toBe('ftab-ticket')
  await page.goBack()
  await expect.poll(active).toBe('ftab-time')
  await page.goForward()
  await expect.poll(active).toBe('ftab-ticket')
  await page.goBack()
  await expect.poll(active).toBe('ftab-time')
  await page.goBack()
  await expect.poll(active).toBe('ftab-home')
})

test('a lift plan with the radius longer than the boom cannot be approved', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop', 'lift planning')
  await boot(page, 'ops')
  await page.evaluate(() => (window as unknown as { __store: { getState: () => { go: (p: string) => void } } }).__store.getState().go('lifts'))
  await page.locator('[data-testid=lift-row]').filter({ hasText: '%' }).first().click()
  await page.getByTestId('lift-plan').waitFor()
  await page.getByTestId('lift-load').fill('1')
  await page.getByTestId('lift-radius').fill('180')
  await page.locator('[data-testid=lift-plan] input.input.num').nth(3).fill('30')
  const extras = page.locator('[data-testid=lift-plan] button').filter({ hasText: /Rigging inspected|Site walked|Wind limit|Lift director/ })
  for (let i = 0; i < await extras.count(); i++) await extras.nth(i).click()
  await expect(page.getByText(/Radius can’t exceed boom/)).toBeVisible()
  await expect(page.getByTestId('lift-approve')).toBeDisabled()
})

test('an injury report made with the app offline does not say it was sent', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'field phone')
  await boot(page, 'field')
  await page.getByTestId('ftab-more').click()
  await page.getByTestId('tile-incident').click()
  await page.getByTestId('inc-desc').fill('Hand cut on cribbing. Reporting while the phone has no signal.')
  await page.evaluate(() => (window as unknown as { __store: { getState: () => { setUI: (p: { online: boolean }) => void } } }).__store.getState().setUI({ online: false }))
  await expect(page.getByText(/Offline/)).toBeVisible()
  await page.getByTestId('inc-send').click()
  const toast = (await page.locator('[data-sonner-toast]').allTextContents()).join(' ')
  expect(toast).not.toMatch(/Report sent/)
  expect(toast).toMatch(/not sent|saved on this phone|offline/i)
})
