// Navigation + color picker e2e: phone More page (WebKit iPhone 390), smart search (aliases, typos, no-match), pins/recents,
// A–Z, bottom-bar customizing, quick search (Ctrl/Cmd+K), sidebar sections, any-color theme picker. BASE=preview url.
import { webkit, chromium, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'; const out = (process.env.OUT || '/workspace/southern-app/screenshots/nav/') + 'local/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const items = async p => p.locator('[data-testid=more-item]').evaluateAll(xs => xs.map(x => x.dataset.key))
const search = async (p, q) => { await p.fill('[data-testid=more-search]', q); await p.waitForTimeout(250); return items(p) }
const wk = await webkit.launch()
{ const ctx = await wk.newContext(devices['iPhone 14']); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=owner]'); await p.tap('[data-role=owner]'); await p.waitForTimeout(1200)
  await p.tap('[data-testid=more-btn]'); await p.waitForSelector('[data-testid=more-page]')
  ok(await p.locator('[data-testid=more-search]').isVisible(), 'More page opens with a search box at the top')
  ok(await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid=more-search]')).fontSize)) >= 16, 'search box is 16px+ (no iOS zoom)')
  const secs = await p.locator('[data-section]').evaluateAll(xs => xs.map(x => x.dataset.section)); ok(secs.length >= 6 && secs.length <= 9, `grouped into ${secs.length} labeled sections`)
  const alpha = await p.locator('[data-section]').evaluateAll(xs => xs.every(x => { const l = [...x.querySelectorAll('[data-testid=more-item] .font-semibold')].map(e => e.textContent); return l.every((v, i) => !i || l[i - 1].localeCompare(v) <= 0) })); ok(alpha, 'items are A–Z inside every section')
  const all = await items(p); ok(new Set(all).size === all.length, `no duplicates (${all.length} destinations)`)
  const h = await p.locator('[data-testid=more-item]').first().evaluate(x => x.getBoundingClientRect().height); ok(h >= 44, `rows are ${Math.round(h)}px tall (44px+ tap targets)`)
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'More page fits the iPhone width')
  await p.screenshot({ path: out + 'iphone390-more.png' })
  await p.tap('[data-testid=more-view-az]'); await p.waitForTimeout(200); const az = await p.locator('[data-testid=more-az] [data-testid=more-item] .font-semibold').allTextContents()
  ok(az.length === all.length + 0 || az.length >= all.length, 'A–Z shows one flat list'); ok(az.every((v, i) => !i || az[i - 1].localeCompare(v) <= 0), 'A–Z list is alphabetical'); await p.screenshot({ path: out + 'iphone390-more-az.png' }); await p.tap('[data-testid=more-view-sections]')
  // aliases (what people call things)
  const cases = [['paycheck', 'time'], ['pay stub', 'time'], ['vacation', 'pto'], ['day off', 'pto'], ['fuel card', 'mycards'], ['company card', 'mycards'], ['near miss', 'safety'], ['write-up', 'people'], ['clock in', 'time'], ['work ticket', 'tickets'], ['standby', 'npt'], ['per diem', 'time'], ['627', 'union'], ['hall', 'union'], ['semi', 'equipment'], ['boom', 'equipment'], ['invoice', 'receivables'], ['bill', 'payables'], ['permit', 'permits'], ['job #', 'jobs'], ['foreman', 'allocations'], ['schedule', 'dispatch'], ['w-2', 'people'], ['insurance', 'people']]
  for (const [q, k] of cases) { const r = await search(p, q); ok(r.slice(0, 3).includes(k), `“${q}” → ${k} (top: ${r.slice(0, 3).join(', ')})`) }
  await search(p, 'paycheck'); ok(/matches: paycheck/.test(await p.locator('[data-testid=more-item]').first().textContent()), 'result shows the real page name + “matches: paycheck”')
  await p.screenshot({ path: out + 'iphone390-more-search-paycheck.png' })
  // typos + partial words
  for (const [q, k] of [['shedule', 'dispatch'], ['perdiem', 'time'], ['tickt', 'tickets'], ['vacaton', 'pto'], ['equipmnt', 'equipment'], ['recei', 'receivables'], ['invent', 'inventory']]) { const r = await search(p, q); ok(r.slice(0, 3).includes(k), `typo/partial “${q}” → ${k} (top: ${r.slice(0, 3).join(', ')})`) }
  // no match → did you mean
  await search(p, 'zqxv'); ok(await p.locator('[data-testid=more-noresult]').isVisible() && await p.locator('[data-testid=more-dym] [data-testid=more-item]').count() >= 2, 'nothing matches → “Did you mean…” with the closest pages'); await p.screenshot({ path: out + 'iphone390-more-didyoumean.png' })
  ok(await p.locator('[data-testid=more-global]').isVisible(), 'offers to search people, jobs, cranes & trucks too')
  // tap a result → goes there
  await search(p, 'vacation'); await p.locator('[data-testid=more-item][data-key=pto]').tap(); await p.waitForTimeout(700); ok(await p.evaluate(() => window.__store.getState().ui.page) === 'pto', 'tapping a result opens that page')
  // recents + pins + bottom bar
  await p.tap('[data-testid=more-btn]'); await p.waitForSelector('[data-testid=more-page]'); ok(await p.locator('[data-testid=more-recent] [data-key=command]').count() === 1, 'Recent row tracks pages you visited')
  await p.tap('[data-testid=more-edit]'); await p.locator('[data-testid=more-item][data-key=union]').locator('xpath=..').locator('[data-testid=pin-btn]').tap()
  ok(await p.locator('[data-testid=more-pinned] [data-key=union]').count() === 1, 'pin a favorite → shows in Pinned')
  const bar0 = await p.locator('[data-testid=tabbar] [data-tab]').evaluateAll(xs => xs.map(x => x.dataset.tab))
  await p.locator('[data-testid=more-item][data-key=' + bar0[3] + ']').first().locator('xpath=..').locator('[data-testid=tab-btn]').tap()
  await p.locator('[data-testid=more-item][data-key=union]').locator('xpath=..').locator('[data-testid=tab-btn]').tap(); await p.waitForTimeout(200)
  await p.screenshot({ path: out + 'iphone390-more-edit.png' }); await p.tap('[data-testid=more-edit]'); await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(500)
  const bar1 = await p.locator('[data-testid=tabbar] [data-tab]').evaluateAll(xs => xs.map(x => x.dataset.tab)); ok(bar1.includes('union') && !bar1.includes(bar0[3]) && bar1.length === 4, `bottom bar customized: ${bar1.join(', ')}`)
  await p.reload(); await p.waitForTimeout(1500); const bar2 = await p.locator('[data-testid=tabbar] [data-tab]').evaluateAll(xs => xs.map(x => x.dataset.tab)); ok(bar2.join() === bar1.join(), 'bottom bar + pins persist after reload')
  await p.tap('[data-testid=more-btn]'); await p.waitForSelector('[data-testid=more-page]'); ok(await p.locator('[data-testid=more-pinned] [data-key=union]').count() === 1, 'pinned favorite persists')
  await p.screenshot({ path: out + 'iphone390-more-pinned.png' }); await p.keyboard.press('Escape').catch(() => {})
  // header search on phone → quick search finds people/jobs/cranes
  await p.goto(base); await p.waitForTimeout(1200); await p.tap('[data-testid=ask]'); await p.waitForSelector('[data-testid=ask-input]'); await p.fill('[data-testid=ask-input]', 'brent'); await p.waitForTimeout(500)
  ok(await p.locator('[cmdk-item]', { hasText: 'Brent Strawn' }).count() > 0, 'phone header search finds an employee (Brent Strawn)')
  await p.fill('[data-testid=ask-input]', 'paycheck'); await p.waitForTimeout(400); ok(await p.locator('[data-testid=cmd-pages] [data-page=time]').count() === 1, 'quick search understands “paycheck” → Time & Payroll'); await p.screenshot({ path: out + 'iphone390-quicksearch.png' })
  // field employee: role-aware
  await ctx.close() }
{ const ctx = await wk.newContext(devices['iPhone 14']); const p = await ctx.newPage(); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.tap('[data-role=hr]'); await p.waitForTimeout(1200); await p.tap('[data-testid=more-btn]'); await p.waitForSelector('[data-testid=more-page]')
  const ks = await items(p); const nav = await p.evaluate(() => window.__scNav); ok(ks.filter(k => !['mycards', 'npt'].includes(k)).every(k => nav.includes(k)) && !ks.includes('analytics') && !ks.includes('guests'), `role-aware: HR sees only its ${ks.length} pages (no Job Costing, no Guest passes)`)
  const r = await search(p, 'invoice'); ok(!r.includes('receivables'), 'role-aware search: HR “invoice” does not offer Receivables'); await ctx.close() }
await wk.close()
// desktop / projector: Ctrl+K palette + sidebar sections + color picker
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
{ const ctx = await cr.newContext({ viewport: { width: 1920, height: 1080 } }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=owner]'); await p.waitForTimeout(1000)
  const hubs = await p.locator('aside [data-hub]').evaluateAll(xs => xs.map(x => x.textContent.trim())); ok(hubs.some(x => /^Safety/.test(x)) && hubs.some(x => /Equipment & Shop/.test(x)) && hubs.some(x => /Office & Settings/.test(x)), 'sidebar uses the same sections: ' + hubs.join(' | '))
  await p.keyboard.press('Control+k'); await p.waitForSelector('[data-testid=ask-input]'); ok(true, 'Ctrl+K opens quick search')
  for (const [q, sel] of [['10131', '[cmdk-item]:has-text("10131")'], ['crane 28', '[cmdk-item]:has-text("28")'], ['Sammy', '[cmdk-item]:has-text("Sammy Tinsley")'], ['shedule', '[data-page=dispatch]'], ['day off', '[data-page=pto]']]) { await p.fill('[data-testid=ask-input]', q); await p.waitForTimeout(400); ok(await p.locator(sel).count() > 0, `quick search “${q}” finds it`) }
  await p.fill('[data-testid=ask-input]', 'zqxvbn'); await p.waitForTimeout(400); ok(await p.locator('[data-testid=cmd-dym]').count() >= 2, 'quick search with no match offers “Did you mean”')
  await p.screenshot({ path: out + 'desktop-quicksearch-dym.png' }); await p.keyboard.press('Escape')
  await p.fill('[data-testid=ask-input]', '').catch(() => {})
  // color picker
  await p.evaluate(() => { location.hash = '/settings' }); await p.waitForSelector('[data-testid=my-color]')
  await p.fill('[data-testid=my-color-hex]', '#7c3aed'); await p.waitForTimeout(300); ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) === '#7c3aed', 'typing a hex code changes the app color live')
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent-ink').trim()) === '#ffffff', 'button text auto-picks white on purple')
  await p.locator('[data-testid=my-color-hue]').fill('120'); await p.waitForTimeout(300); const g = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()); ok(g !== '#7c3aed' && /^#/.test(g), 'hue slider picks a new color: ' + g)
  await p.locator('[data-testid=my-color-wheel]').evaluate((x, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(x, v); x.dispatchEvent(new Event('input', { bubbles: true })) }, '#00aa55'); await p.waitForTimeout(300)
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) === '#00aa55', 'native color wheel works')
  const dim = await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--surface').trim()); await p.fill('[data-testid=my-color-hex]', dim); await p.waitForTimeout(300); ok(await p.locator('[data-testid=my-color-warn]').isVisible(), 'a color that blends into the cards warns about poor contrast')
  await p.click('[data-testid=my-color-fix]'); await p.waitForTimeout(300); const fixed = await p.inputValue('[data-testid=my-color-hex]'); ok(fixed !== dim && !(await p.locator('[data-testid=my-color-warn]').isVisible()), 'Make readable fixes it: ' + fixed)
  await p.screenshot({ path: out + 'desktop-color-picker.png' })
  await p.click('[data-swatch="#0d7d7d"]'); await p.waitForTimeout(200); ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) === '#0d7d7d', 'preset swatches still work')
  await p.reload(); await p.waitForTimeout(1200); ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) === '#0d7d7d', 'color saved after reload')
  await p.evaluate(() => window.__store.getState().signOut()); await p.waitForTimeout(500); await p.click('[data-role=dispatch]'); await p.waitForTimeout(800)
  ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) !== '#0d7d7d', 'saved per user: another login keeps its own color')
  await p.evaluate(() => window.__store.getState().signOut()); await p.waitForTimeout(500); await p.click('[data-role=owner]'); await p.waitForTimeout(800); await p.evaluate(() => { location.hash = '/settings' }); await p.waitForSelector('[data-testid=my-color]')
  await p.click('[data-testid=my-color-reset]'); await p.waitForTimeout(300); ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) !== '#0d7d7d', '“Use theme color” resets it')
  await p.evaluate(() => { location.hash = '/branding' }); await p.waitForSelector('[data-testid=branding-page]'); ok(await p.locator('input[type=color]').count() >= 2 && /Powered by Arrowline/.test(await p.textContent('[data-testid=brand-vendor]')), 'Company Branding colors are free-form; Powered by Arrowline stays locked')
  await ctx.close() }
await cr.close()
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' / ') : ''))
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASSED'); process.exit(fails.length ? 1 : 0)
