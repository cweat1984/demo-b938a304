/**
 * Bug: People → Time off, Records, and Onboarding ignore the branch filter.
 * Kilgore still lists Oklahoma City and Midland time off, other branches' HR notes,
 * and both new hires. Maria Delacruz (Midland supervisor, no branch on the hire)
 * is labeled Oklahoma City. Exits 1 while that is still true.
 *
 *   node tests/hr-branch-scope.mjs
 */
import { launch, newPage, signIn, pickBranch } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1366, height: 800 } })
await signIn(page, 'branch')
await page.evaluate(() => { location.hash = '/people' })
await page.waitForTimeout(400)
await page.getByRole('tab', { name: /Onboarding/ }).click()
await page.waitForTimeout(400)
const label = await page.evaluate(() => {
  const db = window.__store.getState().db
  const maria = db.hires.find(h => h.last === 'Delacruz')
  const sup = db.employees.find(e => e.id === maria?.supervisorId)
  const row = [...document.querySelectorAll('[data-testid=hire-row]')].find(el => /Delacruz/.test(el.innerText))
  const supCity = db.branches.find(b => b.id === sup?.branchId)?.city ?? ''
  return { saysOkc: !!row && /Oklahoma City/.test(row.innerText), saysSupCity: !!row && !!supCity && row.innerText.includes(supCity), supIsMid: sup?.branchId === 'br-mid' }
})
if (label.supIsMid && label.saysOkc && !label.saysSupCity) fail('Maria Delacruz is labeled Oklahoma City; her supervisor is in Midland')
else ok('Maria Delacruz is labeled with her branch')
await pickBranch(page, 'SLH-KIL')
const filter = await page.evaluate(() => window.__store.getState().ui.filter.branchId)
if (filter !== 'br-kil') fail('could not select Kilgore (got ' + filter + ')')

await page.getByRole('tab', { name: /Time off/ }).click()
const pto = await page.evaluate(() => {
  const db = window.__store.getState().db
  const f = window.__store.getState().ui.filter.branchId
  const text = document.body.innerText
  const shown = db.pto.filter(p => { const e = db.employees.find(x => x.id === p.employeeId); return e && text.includes(e.first + ' ' + e.last) })
  return { foreign: shown.filter(p => db.employees.find(e => e.id === p.employeeId).branchId !== f).length, shown: shown.length }
})
if (pto.foreign) fail(`Kilgore time off shows ${pto.foreign} request(s) from other branches`)
else ok('time off follows Kilgore')

await page.getByRole('tab', { name: /Records/ }).click()
const rec = await page.evaluate(() => {
  const db = window.__store.getState().db
  const f = window.__store.getState().ui.filter.branchId
  const text = document.body.innerText
  let foreign = 0
  for (const r of db.hrRecords) {
    const e = db.employees.find(x => x.id === r.employeeId)
    if (!e || e.branchId === f) continue
    if (text.includes(e.first + ' ' + e.last) && text.includes(r.title.slice(0, 18))) foreign++
  }
  return foreign
})
if (rec) fail(`Kilgore HR records show ${rec} note(s) from other branches`)
else ok('HR records follow Kilgore')

await page.getByRole('tab', { name: /Onboarding/ }).click()
await page.waitForTimeout(400)
const hireVisible = await page.locator('[data-testid=hire-row]', { hasText: 'Delacruz' }).count()
if (hireVisible) fail('Kilgore onboarding still lists Maria Delacruz')
else ok('Kilgore onboarding hides other branches')

await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
