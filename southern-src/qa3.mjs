import { chromium } from 'playwright'
const S = '/workspace/southern-app/screenshots/'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
const p = await ctx.newPage()
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
await p.goto('http://localhost:4173/'); await p.click('[data-role=owner]'); await p.waitForTimeout(1500)
const go = async (pg) => { await p.evaluate(x => { location.hash = '/' + x }, pg); await p.waitForTimeout(1000) }
const only = process.argv.slice(2); const want = k => !only.length || only.includes(k)
if (want('quotes')) { await go('quotes'); await p.screenshot({ path: S + 'quotes.png' }); await p.locator('[data-testid=quote-card]').first().click(); await p.waitForTimeout(500); await p.screenshot({ path: S + 'quote-sheet.png' }); await p.click('[data-testid=quote-won]'); await p.waitForTimeout(900); await p.screenshot({ path: S + 'quote-won-job.png' }); await p.keyboard.press('Escape'); await p.waitForTimeout(300); await p.keyboard.press('Escape') }
if (want('newquote')) { await go('quotes'); await p.click('[data-testid=new-quote]'); await p.waitForTimeout(700); await p.screenshot({ path: S + 'quote-builder.png' }); await p.keyboard.press('Escape') }
if (want('lifts')) { await go('lifts'); await p.waitForTimeout(300); await p.screenshot({ path: S + 'lift-planning.png' }) }
if (want('vault')) { await go('vault'); await p.screenshot({ path: S + 'vault.png' }) }
if (want('status')) { const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message)); await q.goto('http://localhost:4173/?status=10125'); await q.waitForTimeout(1500); await q.screenshot({ path: S + 'customer-status.png', fullPage: true }) }
if (want('payables')) { await go('payables'); await p.locator('[data-testid=code-job]').first().click(); await p.fill('[data-testid=job-search]', 'wood'); await p.waitForTimeout(300); await p.screenshot({ path: S + 'payables-combobox.png' }) }
if (want('cost')) { await go('analytics'); await p.waitForTimeout(500); await p.evaluate(() => { const db = window.__sc.getState().db; const j = db.jobs.find(x => x.jobNo === '10125'); window.__sc.getState().open({ type: 'job', id: j.id }) }); await p.waitForTimeout(600); await p.getByRole('button', { name: 'Job cost', exact: true }).last().click(); await p.waitForTimeout(1200); await p.screenshot({ path: S + 'job-waterfall.png' }) }
console.log(errs.length ? errs : 'no errors'); await b.close()
