import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
await p.goto(process.env.BASE); await p.click('[data-role=owner]'); await p.waitForTimeout(1000)
for (const q of ['unpaid bills', 'local 627', 'who is in midland', 'red river', 'w-4', 'crane 28', 'brady', 'cash', 'audit', 'pay rate']) {
  await p.evaluate(() => window.__store.getState().setUI({ cmdOpen: true })); await p.fill('[cmdk-input]', q); await p.waitForTimeout(500)
  const items = await p.locator('[cmdk-item]').allInnerTexts()
  console.log(q, await p.locator('[data-testid=cmd-records]').count(), '=>', items.filter(t => t.trim()).slice(0, 5).map(t => t.replace(/\s+/g, ' ').slice(0, 45)).join(' | '))
  await p.keyboard.press('Escape'); await p.waitForTimeout(200)
}
await b.close()
