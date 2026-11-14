/**
 * Home crane count includes every crane on a job today. A customer's Jobs number is the job list,
 * not jobs plus sales-history rows. Search follows the division filter.
 *   node tests/command-customer-search.mjs
 */
import { launch, newPage } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1400, height: 900 } })
await page.click('[data-role=owner]')
await page.waitForSelector('text=/cranes on a job/')
const cranes = await page.evaluate(() => {
  const text = document.body.innerText
  const m = text.match(/(\d+) of (\d+) cranes on a job/)
  const db = window.__store.getState().db
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
  const live = db.jobs.filter(j => j.stage !== 'Quote' && j.stage !== 'Awarded' && j.startDate <= today && j.endDate >= today)
  const ids = new Set()
  for (const j of live) {
    if (j.craneId) ids.add(j.craneId)
    for (const id of j.craneIds || []) ids.add(id)
    for (const p of j.rig || []) if (p.craneId) ids.add(p.craneId)
  }
  const craneIds = new Set(db.equipment.filter(e => e.category === 'Crane').map(e => e.id))
  let onJob = 0
  for (const id of ids) if (craneIds.has(id)) onJob++
  return { shown: m ? Number(m[1]) : null, onJob }
})
if (cranes.shown !== cranes.onJob) fail(`Home says ${cranes.shown} cranes on a job; ${cranes.onJob} are on a job`)
else ok(`${cranes.shown} cranes on a job matches the board`)

const cust = await page.evaluate(() => {
  const db = window.__store.getState().db
  const c = db.customers.find(c => db.jobs.some(j => j.customerId === c.id) && db.history.some(h => h.customerId === c.id))
  if (!c) return null
  window.__store.getState().open({ type: 'customer', id: c.id })
  return { jobs: db.jobs.filter(j => j.customerId === c.id).length, hist: db.history.filter(h => h.customerId === c.id).length }
})
await page.waitForTimeout(300)
const shownJobs = await page.evaluate(() => {
  const label = [...document.querySelectorAll('.label')].find(el => el.textContent?.trim() === 'Jobs')
  const raw = label?.parentElement?.querySelector('.num')?.textContent || ''
  const num = raw.replace(/,/g, '').match(/\d+/)
  return num ? Number(num[0]) : null
})
if (!cust) fail('no customer with both jobs and history')
else if (shownJobs !== cust.jobs) fail(`Customer Jobs shows ${shownJobs}; the job list has ${cust.jobs} (history rows ${cust.hist})`)
else ok('Customer Jobs matches the job list')

await page.keyboard.press('Escape')
await page.click('[data-testid=org-filter]')
await page.locator('[role=dialog]').getByRole('button', { name: /Southern Uptower/ }).click()
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await page.evaluate(() => window.__store.getState().setUI({ cmdOpen: true }))
await page.waitForSelector('[data-testid=ask-input]')
const craneUnit = await page.evaluate(() => window.__store.getState().db.equipment.find(e => e.category === 'Crane' && e.divisionId === 'div-slh')?.unit)
await page.fill('[data-testid=ask-input]', craneUnit)
await page.waitForTimeout(300)
const hit = await page.locator('[cmdk-item], [data-cmdk-item]').filter({ hasText: craneUnit }).count()
if (hit) fail('Uptower search still lists SLH crane ' + craneUnit)
else ok('Uptower search hides other divisions’ cranes')

await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
