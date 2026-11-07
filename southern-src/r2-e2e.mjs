// Round-2 feature checks: quotes → job, lift plan approve, vault, payables suggestions, audit diffs, customer status, Ask Southern.
import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []; const ok = m => console.log('ok', m)
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
const p = await ctx.newPage()
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
await p.goto(process.env.BASE || 'http://localhost:4173/'); await p.click('[data-role=owner]'); await p.waitForTimeout(1500)
const go = async pg => { await p.evaluate(x => { location.hash = '/' + x }, pg); await p.waitForTimeout(900) }
const st = () => p.evaluate(() => window.__sc.getState().db)
// quotes
await go('quotes'); const n0 = await p.locator('[data-testid=quote-card]').count()
await p.locator('[data-testid=quote-card]').first().click(); await p.click('[data-testid=quote-won]'); await p.waitForTimeout(600)
await p.keyboard.press('Escape'); await p.waitForTimeout(300)
await go('quotes'); const n1 = await p.locator('[data-testid=quote-card]').count(); if (n1 !== n0 - 1) throw new Error('quote not won'); ok('quote won → job')
// lifts
await go('lifts'); await p.locator('[data-testid=lift-row]').first().click(); await p.waitForTimeout(300)
for (const t of ['Rigging inspected', 'Site walked', 'Wind limit set', 'Lift director']) await p.getByText(t, { exact: false }).first().click()
const before = (await st()).jobs.filter(j => j.liftPlan === 'Approved').length
await p.click('[data-testid=lift-approve]'); await p.waitForTimeout(500)
const after = (await st()).jobs.filter(j => j.liftPlan === 'Approved').length
if (after !== before + 1) throw new Error('lift not approved ' + before + ' ' + after); ok('lift approved & filed')
// vault
await go('vault'); await p.fill('[data-testid=vault-search]', 'Lift plan'); await p.waitForTimeout(300); if (!(await p.locator('[data-testid=vault-doc]').count())) throw new Error('vault empty'); ok('vault search')
// payables
await go('payables'); const s0 = await p.locator('[data-testid=accept-suggest]').count(); await p.click('[data-testid=accept-all]'); await p.waitForTimeout(500)
if (await p.locator('[data-testid=accept-suggest]').count() !== 0 || !s0) throw new Error('suggestions'); ok(`payables ${s0} suggestions accepted`)
// audit
await go('audit'); await p.locator('[data-testid=audit-row]').first().click({ position: { x: 30, y: 12 } }); await p.waitForSelector('[data-testid=audit-diff]'); ok('audit diff')
// ask
await go('command'); await p.keyboard.press('Control+k'); await p.keyboard.type('who is running crane 28'); await p.waitForTimeout(700)
if (!(await p.getByText('operator on this crane today').count())) throw new Error('ask operator'); ok('ask crane operator'); await p.keyboard.press('Escape')
// status
const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message)); await q.goto((process.env.BASE || 'http://localhost:4173/') + '?status=10125'); await q.waitForSelector('[data-testid=customer-status]'); ok('customer status page')
console.log(errs.length ? errs : 'no errors'); await b.close(); if (errs.length) process.exit(1)
