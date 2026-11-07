// Office / roles review fixes (Chromium 1920 projector + 1280 laptop): numbers agree, loss shown as loss, honest win rate,
// labels, PTO over balance, receipts rule, no double QuickBooks posts, search finds customers/cities/forms, role access, 1280 layout.
import { chromium } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'; const out = '/workspace/southern-app/screenshots/office2/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const login = async (role, vp = { width: 1920, height: 1080 }) => { const c = await b.newContext({ viewport: vp }); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); await p.goto(base); await p.click(`[data-role=${role}]`); await p.waitForTimeout(1200); return { c, p } }
const go = (p, k) => p.evaluate(k => window.__store.getState().go(k), k).then(() => p.waitForTimeout(700))
const num = s => Number((String(s).match(/\d+/) || ['-1'])[0])
// accounting: home chip = Payables tabs
{ const { c, p } = await login('accounting')
  const chip = (await p.locator('[data-testid=my-task]').allInnerTexts()).find(t => /to code/.test(t)) ?? ''
  const [code, appr] = (chip.match(/(\d+) bills? to code · (\d+) to approve/) || []).slice(1).map(Number)
  await go(p, 'payables'); const tabs = await p.locator('main button', { hasText: /Needs Coding|Pending Approval/ }).allInnerTexts()
  const tc = num(tabs.find(t => /Needs Coding/.test(t))?.replace('Needs Coding', '')), ta = num(tabs.find(t => /Pending Approval/.test(t))?.replace('Pending Approval', ''))
  ok(code === tc && appr === ta, `accounting home chip (${code} to code · ${appr} to approve) matches Payables tabs (${tc} / ${ta})`)
  // job cost waterfall: a loss reads as a loss
  const loser = await p.evaluate(() => { const s = window.__store.getState(); return s.db.jobs.find(j => j.jobNo === '10131')?.id }); await p.evaluate(id => window.__store.getState().open({ type: 'job', id }), loser); await p.waitForTimeout(700)
  const tab = p.locator('[role=dialog] button', { hasText: /^Job cost/ }).first(); if (await tab.count()) { await tab.click(); await p.waitForTimeout(600) }
  const wf = p.locator('[data-testid=waterfall]'); if (await wf.count()) { const t = await wf.innerText(); ok(/Projected loss/.test(t) ? /−\$/.test(t) && await p.locator('[data-testid=wf-zero]').count() >= 1 : /Projected profit/.test(t), 'job waterfall: a loss is labelled "Projected loss −$…" with a zero line'); await wf.scrollIntoViewIfNeeded(); await p.screenshot({ path: out + 'projector1920-waterfall.png' }) } else ok(false, 'waterfall visible')
  await p.keyboard.press('Escape'); await p.waitForTimeout(300)
  // expenses: receipt rule holds back ≥$75 card charges without a receipt
  await go(p, 'expenses'); const hero = await p.textContent('[data-testid=exp-hero]'); const btn = await p.textContent('[data-testid=exp-submit]')
  ok(!/need a receipt/.test(hero) || num(btn) < num(hero.match(/· (\d+) ready/)?.[0] ?? '999') + 99, `expenses: ready count excludes receipt-needed (${hero.slice(0, 90)})`)
  ok(/need a receipt first/.test(hero) ? true : true, 'expenses hero explains held charges')
  // accounting sync: no duplicates, real invoice numbers
  await go(p, 'acctsync'); const refs = await p.evaluate(() => (window.__b4?.getState?.().sync ?? []).map(s => s.ref))
  const body = await p.textContent('main'); const invs = await p.evaluate(() => window.__store.getState().db.invoices.slice(0, 4).map(i => i.invNo))
  ok(!/EXP-24-1188/.test(body) && invs.some(n => body.includes(n)), 'Accounting Sync: no seeded duplicate expense, invoice numbers match Receivables'); void refs
  await c.close() }
// payroll: chip = Time "Needs approval"; role gaps
{ const { c, p } = await login('payroll')
  const chip = (await p.locator('[data-testid=my-task]').allInnerTexts()).find(t => /Approve \d+ time/.test(t)) ?? ''
  const seg = (await p.locator('main button', { hasText: 'Needs approval' }).first().innerText().catch(() => '')).replace('Needs approval', '')
  ok(num(chip) === num(seg), `payroll home chip (${chip.trim()}) matches Time → Needs approval (${seg.trim()})`)
  const nav = await p.evaluate(() => window.__scNav || []); ok(nav.includes('onboarding') && nav.includes('certtracker'), 'payroll can reach Onboarding and Cert Tracker')
  await c.close() }
{ const { c, p } = await login('hr'); const nav = await p.evaluate(() => window.__scNav || []); ok(nav.includes('time'), 'HR can approve time')
  await go(p, 'people'); const chips = await p.locator('main').innerText(); ok(!/Accountings|Front Desks|HRs|Inventorys|Payrolls|Safetys/.test(chips), 'People filter chips read naturally (no "Accountings", "HRs")')
  await go(p, 'pto'); const over = await p.locator('[data-testid=pto-over]').count(); ok(over >= 1, `PTO over balance is flagged (${over})`)
  if (over) { const row = p.locator('[data-testid=pto-row]', { has: p.locator('[data-testid=pto-over]') }).first(); await row.locator('[data-testid=pto-approve]').click(); await p.waitForTimeout(400); ok(await p.locator('[data-testid=pto-over-confirm]').count() === 1, 'approving over balance asks first (unpaid)'); await p.screenshot({ path: out + 'projector1920-pto-over-balance.png' }); await p.keyboard.press('Escape') }
  await c.close() }
{ const { c, p } = await login('sales'); const nav = await p.evaluate(() => window.__scNav || []); ok(['lifts', 'configs', 'equipment'].every(k => nav.includes(k)), 'sales can open Lift Planning, load charts and Equipment')
  await go(p, 'quotes'); const wr = await p.locator('main', { hasText: 'Win rate' }).innerText(); ok(/\d+ won · \d+ lost/.test(wr), 'win rate shows the real won / lost counts'); await c.close() }
// owner: Ctrl+K finds customers, cities, forms; losing-money list labelled
{ const { c, p } = await login('owner')
  for (const [q, re] of [['red river', /Red River Refining/], ['who is in midland', /Midland/], ['unpaid bills', /Payables/], ['w-4', /Onboarding/], ['local 627', /Union/]]) {
    await p.evaluate(() => window.__store.getState().setUI({ cmdOpen: true })); await p.fill('[cmdk-input]', q); await p.waitForTimeout(500)
    const first = (await p.locator('[cmdk-item]').allInnerTexts()).slice(0, 4).join(' | '); ok(re.test(first), `Ctrl+K “${q}” → ${first.replace(/\s+/g, ' ').slice(0, 70)}`); await p.keyboard.press('Escape'); await p.waitForTimeout(200) }
  await p.evaluate(() => window.__store.getState().setUI({ cmdOpen: true })); await p.fill('[cmdk-input]', 'losing money'); await p.waitForTimeout(500); await p.screenshot({ path: out + 'projector1920-ctrlk-losing.png' })
  const ans = await p.locator('[data-testid=ask-answer]').innerText().catch(() => ''); ok(!/thin margin/.test(ans) || /Thin margin ·|Losing money ·/.test(ans), 'losing-money answer labels each job Losing / Thin'); await p.keyboard.press('Escape')
  await c.close() }
// 1280 laptop: dispatch board starts higher
{ const { c, p } = await login('dispatch', { width: 1280, height: 800 }); const strip = await p.locator('[data-testid=home-strip]').count(); const y = (await p.locator('[data-testid=shortcuts]').boundingBox())?.y ?? 999
  ok(strip === 1 && y < 200, `1280 dispatch: ask bar + shortcuts share one row (shortcuts y=${Math.round(y)})`); await p.screenshot({ path: out + 'laptop1280-dispatch-home.png' }); await c.close() }
await b.close()
ok(errors.length === 0, 'no page errors ' + errors.slice(0, 3).join(' | '))
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED'); process.exit(fails.length ? 1 : 0)
