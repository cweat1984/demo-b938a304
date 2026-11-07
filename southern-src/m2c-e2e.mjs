// Milestone 2c: customizable schedule colors with legend + color-blind patterns; red can't mean available.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'; const out = '/workspace/southern-app/screenshots/m2/'; (await import('fs')).mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const wk = await webkit.launch(); const W = ms => new Promise(r => setTimeout(r, ms))
const center = async (p, sel) => { const l = p.locator(sel).first(); await l.evaluate(e => e.scrollIntoView({ block: 'center' })); await W(150); return l }
const rgb = h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`
const reddish = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return r > 150 && g < 90 && b < 90 }
const go = async (p, h, sel) => { await p.evaluate(x => { location.hash = x }, h); await p.waitForSelector(sel, { timeout: 10000 }); await W(400) }
for (const [name, br, opts] of [['desk1920', cr, { viewport: { width: 1920, height: 1080 } }], ['iphone390', wk, devices['iPhone 14']], ['pixel7', cr, { ...devices['Pixel 7'], viewport: { width: 412, height: 915 } }], ['ipad820', wk, { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true }], ['tab1280x800', cr, { viewport: { width: 1280, height: 800 }, hasTouch: true, isMobile: true }]]) {
  const c = await br.newContext(opts); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.click('[data-role=owner]'); await W(900)
  await go(p, '/forecast', '[data-testid=forecast]')
  const leg = await p.locator('[data-testid=sched-legend-item]').evaluateAll(es => es.map(e => e.dataset.cat))
  ok(['working', 'outstate', 'open', 'off', 'conflict'].every(k => leg.includes(k)), `${name}: forecast has a legend (${leg.join(', ')})`)
  const gaps = await p.locator('[data-testid=fc-gap]').evaluateAll(es => es.map(e => getComputedStyle(e).backgroundColor))
  ok(gaps.length > 0 && !gaps.some(reddish), `${name}: available time is not red (${gaps.length} gaps, ${gaps[0]})`)
  const bars = await p.locator('[data-testid=fc-bar]').evaluateAll(es => es.map(e => [e.dataset.cat, getComputedStyle(e).backgroundColor]))
  const work = bars.filter(b => b[0] === 'working'); ok(work.length > 0 && work.every(b => b[1] === rgb('#cdeccf')), `${name}: working bars are very light green by default (${work.length})`)
  ok(bars.filter(b => b[0] === 'conflict').every(b => reddish(b[1])), `${name}: only conflicts are red`)
  console.log(`     ${name}: out-of-state bars ${bars.filter(b => b[0] === 'outstate').length}`)
  if (name === 'desk1920') await p.screenshot({ path: out + name + '-forecast.png' })
  // editor
  await go(p, '/branding', '[data-testid=sched-colors]')
  ok(await p.locator('[data-testid=sched-row]').count() === 7, `${name}: 7 schedule categories editable`)
  const hex = async (cat, v) => { const l = await center(p, `[data-testid=sched-hex][data-cat=${cat}]`); await l.fill(v); await l.press('Enter'); await W(250) }
  await hex('open', '#d32f2f'); ok(await p.locator('[data-testid=sched-error]').count() === 1 && /conflict/i.test(await p.locator('[data-testid=sched-error]').innerText()), `${name}: red refused for "Available"`)
  ok(await p.evaluate(() => (JSON.parse(localStorage.getItem('sc-sched-colors-v1') || 'null')?.state.colors.open ?? '#e6e9ee')) === '#e6e9ee', `${name}: available color unchanged after refusal`)
  await hex('working', '#c62828'); ok(await p.locator('[data-testid=sched-error]').count() === 1, `${name}: duplicate / red refused for "Working"`)
  await hex('outstate', '#5e35b1'); ok(await p.locator('[data-testid=sched-error]').count() === 0, `${name}: out-of-state color changed`)
  const sw = await p.locator('[data-testid=sched-colors] [data-testid=sched-legend-item][data-cat=outstate] i').evaluate(e => getComputedStyle(e).backgroundColor)
  ok(sw === rgb('#5e35b1'), `${name}: legend shows the new color (${sw})`)
  const img1 = await p.locator('[data-testid=sched-sample] [data-cat=moving]').first().evaluate(e => getComputedStyle(e).backgroundImage)
  await (await center(p, '[data-testid=sched-patterns]')).click(); await W(250)
  const img2 = await p.locator('[data-testid=sched-sample] [data-cat=moving]').first().evaluate(e => getComputedStyle(e).backgroundImage)
  ok(/gradient/.test(img1) && img2 === 'none', `${name}: color-blind patterns on by default, can be turned off`)
  await (await center(p, '[data-testid=sched-patterns]')).click(); await W(200)
  await p.screenshot({ path: out + name + '-sched-colors.png' })
  // crane drawer 30-day strip + rig strip follow the colors
  await p.reload(); await W(1500)
  await p.evaluate(() => { const s = window.__store.getState(); const cr = s.db.equipment.find(e => e.category === 'Crane' && s.db.jobs.some(j => j.craneId === e.id && j.rig?.length)) ?? s.db.equipment.find(e => e.category === 'Crane'); s.open({ type: 'equipment', id: cr.id }) })
  await p.waitForSelector('[data-testid=eq-30d]', { timeout: 10000 }); await W(400)
  const cells = await p.locator('[data-testid=eq-30d] button[data-cat]').evaluateAll(es => es.map(e => [e.dataset.cat, getComputedStyle(e).backgroundColor]))
  ok(cells.length === 30 && !cells.filter(x => x[0] === 'open').some(x => reddish(x[1])), `${name}: crane 30-day strip colored by category (${[...new Set(cells.map(x => x[0]))].join(', ')})`)
  ok(await p.locator('[data-testid=eq-30d] [data-testid=sched-legend]').count() === 1, `${name}: crane strip has a legend`)
  const os = cells.find(x => x[0] === 'outstate'); if (os) ok(os[1] === rgb('#5e35b1'), `${name}: saved out-of-state color kept after reload`)
  await p.keyboard.press('Escape'); await W(300)
  await go(p, '/branding', '[data-testid=sched-colors]'); await (await center(p, '[data-testid=sched-reset]')).click(); await W(300)
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('sc-sched-colors-v1')).state.colors.outstate) === '#7b4fb5', `${name}: reset to Annual-sheet defaults`)
  await c.close() }
await cr.close(); await wk.close()
const real = errors.filter(e => !/ResizeObserver|Failed to fetch|NetworkError|Load failed/.test(e)); ok(real.length === 0, `no page errors (${real.slice(0, 2).join(' | ')})`)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS'); process.exit(fails.length ? 1 : 0)
