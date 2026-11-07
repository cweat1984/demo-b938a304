// System check crawl: every page × role × theme × viewport, plus a dead-click probe. Usage: node syscheck.mjs <before|after>
import { chromium, webkit, devices } from 'playwright'
import fs from 'fs'
const tag = process.argv[2] || 'before'; const base = process.env.BASE || 'http://localhost:4173/'
const OUT = `/workspace/southern-app/screenshots/syscheck/${tag}${process.env.SET ? '-' + process.env.SET : ''}`; fs.mkdirSync(OUT, { recursive: true })
const ROLES = ['owner', 'dispatch', 'ops', 'shop', 'safety', 'hr', 'payroll', 'accounting', 'sales', 'frontdesk', 'inventory', 'branch', 'der']
const VPS = { desktop: { viewport: { width: 1440, height: 900 } }, tablet: { viewport: { width: 820, height: 1180 }, hasTouch: true }, phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' } }
const SET = process.env.SET || 'default'
if (SET === 'ios') { for (const k of Object.keys(VPS)) delete VPS[k]; VPS['iphone390'] = devices['iPhone 14']; VPS['iphone430'] = devices['iPhone 15 Pro Max'] }
if (SET === 'projector') { for (const k of Object.keys(VPS)) delete VPS[k]; VPS['proj1920'] = { viewport: { width: 1920, height: 1080 } }; VPS['proj1280'] = { viewport: { width: 1280, height: 720 } } }
const THEMES = { light: { theme: 'light', mode: 'light' }, dark: { theme: 'slh', mode: 'dark' } }
const b = SET === 'ios' ? await webkit.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const issues = [], timings = []
const probe = () => {
  const main = document.querySelector('main') || document.body
  const over = document.documentElement.scrollWidth > innerWidth + 2
  const lum = c => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(x => { x = +x / 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return { l: .2126 * r + .7152 * g + .0722 * b, a: m[3] == null ? 1 : +m[3] } }
  const bgOf = el => { while (el) { const cs = getComputedStyle(el); const L = lum(cs.backgroundColor); if (L && L.a > .85 && cs.backgroundImage === 'none') return L.l; el = el.parentElement } return null }
  const bad = [], clip = [], small = []
  for (const el of main.querySelectorAll('h1,h2,h3,p,span,div,button,a,td,th,label')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2)) continue
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < .9 || el.closest('[disabled],.opacity-40,.opacity-50,.opacity-60,[aria-hidden=true]')) continue
    const rc = el.getBoundingClientRect(); if (!rc.width || rc.bottom < 0 || rc.top > innerHeight * 3) continue
    if (rc.right > innerWidth + 4 && !el.closest('.overflow-auto,.overflow-x-auto,.overflow-x-scroll,.leaflet-container,[class*=overflow-x]')) clip.push(el.textContent.trim().slice(0, 30))
    const f = lum(cs.color), bg = bgOf(el); if (!f || bg == null) continue
    const ratio = (Math.max(f.l, bg) + .05) / (Math.min(f.l, bg) + .05)
    if (ratio < 3 && f.a > .5) bad.push(`${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 30)}"`)
  }
  if (matchMedia('(pointer: coarse)').matches || innerWidth < 500) for (const el of main.querySelectorAll('button, a[href], [role=button], input, select')) { const rc = el.getBoundingClientRect(); if (rc.width && rc.height && rc.top < innerHeight * 2 && (rc.height < 28 || rc.width < 28) && !el.closest('.leaflet-container, table')) small.push((el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 20)) }
  const tiny = [...main.querySelectorAll('span,div,td,th,p,text,tspan,button,a,label')].filter(el => { if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) return false; const rc = el.getBoundingClientRect(); if (!rc.width || rc.top > innerHeight * 2) return false; return parseFloat(getComputedStyle(el).fontSize) < 12 }).length
  const unlabeled = [...main.querySelectorAll('button')].filter(x => !x.textContent.trim() && !x.getAttribute('aria-label') && !x.title).length
  return { tiny, over, text: main.innerText.length, bad: bad.slice(0, 3), nbad: bad.length, clip: [...new Set(clip)].slice(0, 3), small: [...new Set(small)].slice(0, 4), nsmall: small.length, unlabeled }
}
async function crawl(themeK, vpK, role, pagesFilter) {
  const ctx = await b.newContext(VPS[vpK]); const p = await ctx.newPage(); let page = 'login'
  p.on('pageerror', e => issues.push({ themeK, vpK, role, page, kind: 'pageerror', msg: e.message.slice(0, 200) }))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource|open-meteo|ERR_|favicon/i.test(m.text())) issues.push({ themeK, vpK, role, page, kind: 'console', msg: m.text().slice(0, 200) }) })
  await p.addInitScript(t => { localStorage.setItem('sc-prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('sc-prefs') || '{}'), ...t })); localStorage.setItem('sc-tour-seen', '1'); if (t.present) localStorage.setItem('sc-present', JSON.stringify({ state: { on: true }, version: 0 })) }, { ...THEMES[themeK], present: SET === 'projector' })
  const t0 = Date.now(); await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 30000 }); timings.push({ what: `boot ${vpK}`, ms: Date.now() - t0 })
  await p.click(`[data-role="${role}"]`); await p.waitForTimeout(1000)
  let pages = role === 'field' ? ['field'] : await p.evaluate(() => window.__scNav || []); if (pagesFilter) pages = pages.filter(pagesFilter)
  for (const k of pages) {
    page = k
    if (role !== 'field') { const t = Date.now(); await p.evaluate(k => { location.hash = '/' + k }, k); await p.waitForFunction(() => (document.querySelector('main')?.innerText.length ?? 0) > 60, null, { timeout: 8000 }).catch(() => {}); const ms = Date.now() - t; timings.push({ what: `${vpK} ${k}`, ms }); if (ms > 2500) issues.push({ themeK, vpK, role, page: k, kind: 'slow', msg: ms + ' ms' }); await p.waitForTimeout(450) }
    const r = await p.evaluate(probe)
    if (r.over) issues.push({ themeK, vpK, role, page: k, kind: 'overflow-x', msg: 'page wider than viewport' })
    if (r.clip.length) issues.push({ themeK, vpK, role, page: k, kind: 'clipped', msg: r.clip.join(' | ') })
    if (r.text < 60) issues.push({ themeK, vpK, role, page: k, kind: 'empty', msg: `only ${r.text} chars` })
    if (r.nbad) issues.push({ themeK, vpK, role, page: k, kind: 'contrast', msg: `${r.nbad}: ${r.bad.join(' | ')}` })
    if (r.nsmall) issues.push({ themeK, vpK, role, page: k, kind: 'small-tap', msg: `${r.nsmall}: ${r.small.join(' | ')}` })
    if (SET === 'projector' && r.tiny) issues.push({ themeK, vpK, role, page: k, kind: 'tiny-text', msg: String(r.tiny) })
    if (r.unlabeled) issues.push({ themeK, vpK, role, page: k, kind: 'unlabeled-btn', msg: String(r.unlabeled) })
    if (role === 'owner' || role === 'der' || k === pages[0]) await p.screenshot({ path: `${OUT}/${themeK}-${vpK}-${role}-${k}.png` }).catch(() => {})
  }
  await ctx.close()
}
// dead-click probe: list-row buttons in <main> that change nothing when clicked (owner, desktop, dark)
async function deadClicks() {
  const ctx = await b.newContext({ ...VPS.desktop, acceptDownloads: false }); const p = await ctx.newPage(); await p.addInitScript(() => { localStorage.setItem('sc-tour-seen', '1'); window.print = () => {}; window.open = () => null })
  p.on('dialog', d => d.dismiss().catch(() => {})); p.setDefaultTimeout(4000); ctx.on('page', np => np.close().catch(() => {}))
  await p.goto(base); await p.click('[data-role=owner]'); await p.waitForTimeout(1000)
  const pages = await p.evaluate(() => window.__scNav || [])
  for (const k of pages) {
    console.error('dead-probe', k, new Date().toLocaleTimeString()); await p.evaluate(k => { location.hash = '/' + k }, k); await p.waitForTimeout(900)
    const n = await p.evaluate(() => { const bs = [...document.querySelectorAll('main button')].filter(x => !x.disabled && x.textContent.trim().length > 12 && x.offsetParent && !x.closest('[role=dialog]')); bs.forEach((x, i) => x.setAttribute('data-dc', String(i))); return bs.length })
    for (let i = 0; i < Math.min(n, 6); i++) {
      const before = await p.evaluate(() => [location.href, document.body.innerHTML.length, document.querySelectorAll('[role=dialog]').length, document.activeElement?.tagName].join('|'))
      const label = await p.locator(`[data-dc="${i}"]`).textContent().catch(() => null); if (label == null) continue
      if (/sign out|reset|delete|remove|revoke|clear|log out/i.test(label)) continue
      await p.locator(`[data-dc="${i}"]`).click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(350)
      const after = await p.evaluate(() => [location.href, document.body.innerHTML.length, document.querySelectorAll('[role=dialog]').length, document.activeElement?.tagName].join('|'))
      if (before.split('|').slice(0, 3).join('|') === after.split('|').slice(0, 3).join('|')) issues.push({ themeK: 'dark', vpK: 'desktop', role: 'owner', page: k, kind: 'dead-click?', msg: label.trim().slice(0, 50) })
      await p.keyboard.press('Escape'); await p.evaluate(k => { if (location.hash !== '#/' + k) location.hash = '/' + k }, k); await p.waitForTimeout(250)
      await p.evaluate(() => { const bs = [...document.querySelectorAll('main button')].filter(x => !x.disabled && x.textContent.trim().length > 12 && x.offsetParent && !x.closest('[role=dialog]')); bs.forEach((x, i) => x.setAttribute('data-dc', String(i))) })
    }
  }
  await ctx.close()
}
const mode = process.argv[3] || 'all'
if (mode === 'all' || mode === 'pages') for (const th of Object.keys(THEMES)) for (const vp of Object.keys(VPS)) await crawl(th, vp, 'owner')
if (mode === 'all' || mode === 'roles') for (const role of [...ROLES.filter(r => r !== 'owner'), 'field']) await crawl('dark', 'phone', role)
if (mode === 'all' || mode === 'roles') await crawl('light', 'phone', 'field')
if (mode === 'all' || mode === 'dead') await deadClicks()
fs.writeFileSync(`/tmp/syscheck-${tag}-${process.env.SET || 'default'}-${mode}.json`, JSON.stringify({ issues, timings }, null, 1))
const by = {}; issues.forEach(i => { by[i.kind] = (by[i.kind] || 0) + 1 }); console.log(tag, mode, JSON.stringify(by))
const slow = timings.filter(t => t.what.startsWith('boot')); console.log('boot ms', slow.map(t => t.ms).join(','))
await b.close()
