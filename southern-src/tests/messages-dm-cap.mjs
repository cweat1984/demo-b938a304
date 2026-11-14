/**
 * Bug: New DM only lists the first 40 active people. With a larger roster the rest
 * cannot be chosen. Exits 1 while the list stays capped.
 *
 *   node tests/messages-dm-cap.mjs
 */
import { launch, newPage, signIn } from './support.mjs'

const fails = []
const fail = m => { fails.push(m); console.log('FAIL ' + m) }
const ok = m => console.log('ok   ' + m)

const browser = await launch()
const { ctx, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } })
await signIn(page, 'owner')
await page.evaluate(() => {
  const st = window.__store.getState()
  const sample = st.db.employees.find(e => e.status === 'Active')
  const extra = []
  for (let i = 0; i < 80; i++) extra.push({ ...sample, id: 'emp-dm-' + i, first: 'Extra', last: 'Hand' + String(i).padStart(2, '0'), empNo: 'DM' + i, phone: '', email: '' })
  window.__store.setState({ db: { ...st.db, employees: st.db.employees.concat(extra) } })
})
await page.evaluate(() => window.__store.getState().go('messages'))
await page.waitForSelector('[data-testid=dm-new]')
await page.click('[data-testid=dm-new]')
const shown = await page.locator('[data-testid=dm-person]').count()
const active = await page.evaluate(() => {
  const me = window.__store.getState().session?.name
  return window.__store.getState().db.employees.filter(e => e.status === 'Active' && `${e.first} ${e.last}` !== me).length
})
if (shown < active) fail(`DM list shows ${shown} of ${active} people`)
else ok(`DM list shows all ${shown} people`)
await ctx.close()
await browser.close()
if (fails.length) { console.log(fails.length + ' failure(s)'); process.exit(1) }
console.log('passed')
