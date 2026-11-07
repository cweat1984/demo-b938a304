import { chromium } from 'playwright'
const S = '/workspace/southern-app/screenshots/'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errs = []
const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } })
const p = await ctx.newPage()
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()))
await p.goto('http://localhost:4173/'); await p.click('[data-role=owner]'); await p.waitForTimeout(1500)
const go = async (pg) => { await p.evaluate(x => { location.hash = '/' + x }, pg); await p.waitForTimeout(1000) }
const only = process.argv.slice(2)
const want = k => !only.length || only.includes(k)
if (want('payables')) { await go('payables'); await p.screenshot({ path: S + 'payables-suggest.png' }); const n = await p.locator('[data-testid=accept-suggest]').count(); console.log('suggest chips', n); await p.locator('[data-testid=code-job]').first().click(); await p.fill('[data-testid=job-search]', 'wood'); await p.waitForTimeout(300); await p.screenshot({ path: S + 'payables-combobox.png' }); await p.keyboard.press('Escape'); await p.mouse.click(5, 5) }
if (want('audit')) { await go('audit'); await p.locator('[data-testid=audit-row]').nth(1).click({ position: { x: 30, y: 12 } }); await p.waitForTimeout(300); await p.screenshot({ path: S + 'audit-diff.png' }) }
if (want('people')) { await go('people'); await p.screenshot({ path: S + 'people-chips.png' }) }
if (want('tickets')) { await go('tickets'); await p.getByText('Needs correction').first().click(); await p.waitForTimeout(400); await p.screenshot({ path: S + 'tickets-corrections.png' }) }
if (want('integrations')) { await go('integrations'); await p.screenshot({ path: S + 'integrations-demo.png' }) }
if (want('equipment')) { await go('equipment'); await p.screenshot({ path: S + 'equipment-annual.png' }) }
if (want('wind')) { await go('windfarms'); await p.waitForTimeout(1500); await p.click('[data-testid=wf-filters]'); await p.waitForTimeout(400); await p.screenshot({ path: S + 'windfarms-filters.png' }) ; await p.keyboard.press('Escape') }
if (want('ask')) { await go('command'); await p.keyboard.press('Control+k'); await p.waitForTimeout(300); await p.keyboard.type('who is running crane 28'); await p.waitForTimeout(800); await p.screenshot({ path: S + 'ask-crane-operator.png' }); await p.keyboard.press('Escape') }
console.log(errs.length ? errs : 'no errors'); await b.close()
