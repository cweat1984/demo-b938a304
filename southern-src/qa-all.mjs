// Full QA crawl: every page × every role × theme × viewport. Usage: node qa-all.mjs <theme> [desktop|mobile]
import { chromium, devices } from 'playwright'
import fs from 'fs'
const theme = process.argv[2] || 'jen'; const only = process.argv[3]
const base = process.env.BASE || 'http://localhost:4173/'
const OUT = `/workspace/southern-app/screenshots/batch6/qa/${theme}`; fs.mkdirSync(OUT, { recursive: true })
const ROLES = ['owner', 'dispatch', 'ops', 'field', 'shop', 'safety', 'hr', 'payroll', 'accounting', 'sales', 'frontdesk', 'inventory', 'branch']
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const issues = []
for (const [vp, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['iPhone 14']]]) {
  if (only && only !== vp) continue
  for (const role of ROLES) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage()
    let page = 'login'
    p.on('pageerror', e => issues.push({ theme, vp, role, page, kind: 'pageerror', msg: e.message }))
    p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource|open-meteo|ERR_/i.test(m.text())) issues.push({ theme, vp, role, page, kind: 'console', msg: m.text().slice(0, 200) }) })
    await p.addInitScript(t => { const k = 'sc-prefs'; const v = JSON.parse(localStorage.getItem(k) || '{}'); if (v.theme !== t) localStorage.setItem(k, JSON.stringify({ ...v, theme: t, mode: t === 'light' ? 'light' : 'dark' })) }, theme)
    await p.goto(base); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(1200)
    const pages = role === 'field' ? ['field'] : await p.evaluate(() => window.__scNav || [])
    for (const k of pages) {
      page = k
      if (role !== 'field') { await p.evaluate(k => { location.hash = '/' + k }, k); await p.waitForTimeout(850) }
      const r = await p.evaluate(() => {
        const main = document.querySelector('main') || document.body
        const over = document.documentElement.scrollWidth > innerWidth + 2
        const lum = c => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b] = m.slice(0, 3).map(x => { x = +x / 255; return x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4 }); return { l: .2126 * r + .7152 * g + .0722 * b, a: m[3] == null ? 1 : +m[3] } }
        const bgOf = el => { while (el) { const c = getComputedStyle(el).backgroundColor; const L = lum(c); if (L && L.a > .85 && !getComputedStyle(el).backgroundImage.includes('url')) return L.l; el = el.parentElement } return null }
        const bad = []
        for (const el of main.querySelectorAll('h1,h2,h3,p,span,div,button,a,td,th,label')) {
          if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 2)) continue
          const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < .9 || el.closest('[disabled],.opacity-40,.opacity-60,.opacity-50')) continue
          const rc = el.getBoundingClientRect(); if (!rc.width || rc.bottom < 0 || rc.top > innerHeight * 3) continue
          const f = lum(cs.color); const bg = bgOf(el); if (!f || bg == null) continue
          const ratio = (Math.max(f.l, bg) + .05) / (Math.min(f.l, bg) + .05)
          if (ratio < 2.6 && f.a > .5) bad.push(`${ratio.toFixed(2)} "${el.textContent.trim().slice(0, 40)}"`)
        }
        return { over, text: main.innerText.length, bad: bad.slice(0, 4), nbad: bad.length }
      })
      if (r.over) issues.push({ theme, vp, role, page: k, kind: 'overflow-x', msg: 'page wider than viewport' })
      if (r.text < 60) issues.push({ theme, vp, role, page: k, kind: 'empty', msg: `only ${r.text} chars` })
      if (r.nbad) issues.push({ theme, vp, role, page: k, kind: 'contrast', msg: `${r.nbad}: ${r.bad.join(' | ')}` })
      if (role === 'owner' || k === pages[0]) await p.screenshot({ path: `${OUT}/${vp}-${role}-${k}.png` })
    }
    await ctx.close()
  }
}
fs.writeFileSync(`/tmp/qa-${theme}${only ? '-' + only : ''}.json`, JSON.stringify(issues, null, 1))
const by = {}; issues.forEach(i => { const key = `${i.kind}`; by[key] = (by[key] || 0) + 1 }); console.log(theme, JSON.stringify(by))
await b.close()
