import { chromium } from 'playwright'
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = [], fail = m => errors.push('FAIL ' + m)
const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 } })
const p = await ctx.newPage()
p.on('pageerror', e => errors.push('pageerror: ' + e.message))
p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push('console: ' + m.text()) })
await p.goto(base); await p.evaluate(() => localStorage.clear()); await p.reload()
await p.waitForSelector('[data-role="owner"]'); 
if (!(await p.textContent('body')).includes('Southern Lifting & Hoisting')) fail('login company name')
if (!(await p.title()).startsWith('Southern Command')) fail('title ' + await p.title())
await p.click('[data-role="owner"]'); await p.waitForTimeout(700)
const aside = await p.textContent('aside')
// Owner is company-wide and opens on All branches. The sidebar shows that scope, not a single city.
if (!/Southern Command/.test(aside) || !/SLH · All branches/i.test(aside)) fail('sidebar brand: ' + aside.slice(0, 80))
if (!(await p.textContent('header, body')).includes('Ask Southern')) fail('ask placeholder')
await p.evaluate(() => { location.hash = '/settings' }); await p.waitForTimeout(400)
await p.getByRole('tab', { name: 'Company & branches' }).click(); await p.waitForSelector('[data-testid="company-profile"]')
await p.fill('[data-testid="company-name"]', 'Acme Heavy Haul'); await p.fill('[data-testid="company-short"]', 'ACME'); await p.fill('[data-testid="company-assistant"]', 'Acme')
await p.getByRole('button', { name: 'Save profile' }).click(); await p.waitForTimeout(400)
const aside2 = await p.textContent('aside')
if (!/ACME ·/.test(aside2)) fail('sidebar did not update')
if (!(await p.textContent('body')).includes('Ask Acme')) fail('ask did not update')
if (!(await p.title()).includes('Acme Heavy Haul')) fail('title did not update')
// module toggle
const hasLifts = async () => p.evaluate(() => !!document.querySelector('aside [data-page="lifts"], aside [data-page="configs"], aside [data-page="windfarms"]'))
await p.click('[data-testid="module-crane"]'); await p.waitForTimeout(400)
const allTabs = async () => { const out = new Set(); for (const h of await p.$$eval('[data-hub]', els => els.map(e => e.getAttribute('data-hub')))) { await p.click(`[data-hub="${h}"]`); await p.waitForTimeout(150); (await p.$$eval('button', els => els.map(e => e.textContent.trim()))).forEach(t => out.add(t)) } return [...out] }
const nav = (await allTabs()).filter(t => /^(Lift plan|Wind farm|Crane config)/i.test(t)); await p.evaluate(() => { location.hash = '/settings' }); await p.waitForTimeout(300); await p.getByRole('tab', { name: 'Company & branches' }).click()
if (nav.length) fail('crane pages still visible: ' + nav.join(','))
await p.click('[data-testid="module-crane"]'); await p.waitForTimeout(400)
const nav2 = (await allTabs()).filter(t => /^(Lift plan|Wind farm|Crane config)/i.test(t)); if (nav2.length < 2) fail('crane pages not restored: ' + nav2); await p.evaluate(() => { location.hash = '/settings' }); await p.waitForTimeout(300); await p.getByRole('tab', { name: 'Company & branches' }).click()
// restore defaults
await p.fill('[data-testid="company-name"]', 'Southern Lifting & Hoisting'); await p.fill('[data-testid="company-short"]', 'SLH'); await p.fill('[data-testid="company-assistant"]', 'Southern')
await p.getByRole('button', { name: 'Save profile' }).click(); await p.waitForTimeout(400); if (!/SLH ·/.test(await p.textContent('aside'))) fail('restore'); await p.waitForTimeout(1500)
// customer status page
await p.goto(base + '?status=10125'); await p.waitForSelector('[data-testid=customer-status]'); await p.waitForTimeout(500)
{ const h = await p.textContent('[data-testid=customer-status] header'); if (!h.includes('Southern Lifting & Hoisting')) fail('status page company: ' + h) }
console.log('crane tabs off:', nav.length, 'on:', nav2.join(', '))
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no errors')
await browser.close()
process.exit(errors.length ? 1 : 0)
