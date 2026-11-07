// Scans every page for entity references (job #, people, customers, vendors, units, invoices, bills, WOs, items)
// that are NOT inside a clickable element that opens details. Usage: node link-scan.mjs [role]
import { chromium } from 'playwright'
const role = process.argv[2] ?? 'owner'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await (await b.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
const errors = []; p.on('pageerror', e => errors.push(e.message))
await p.goto(process.env.BASE || 'http://localhost:4173/'); await p.click(`[data-role=${role}]`); await p.waitForTimeout(1000)
const pages = await p.evaluate(() => { const st = window.__sc.getState(); return window.__pages ?? null })
const PAGES = ['command', 'dispatch', 'jobs', 'quotes', 'lifts', 'vault', 'windfarms', 'forecast', 'tickets', 'equipment', 'configs', 'shop', 'inventory', 'people', 'allocations', 'safety', 'time', 'analytics', 'receivables', 'payables', 'contacts', 'audit']
let total = 0
const report = {}
for (const pg of PAGES) {
  await p.evaluate(x => { location.hash = '/' + x }, pg); await p.waitForTimeout(900)
  const res = await p.evaluate(() => {
    const db = window.__sc.getState().db
    const terms = new Map()
    db.jobs.forEach(j => terms.set('#' + j.jobNo, 'job'))
    db.employees.forEach(e => terms.set(`${e.first} ${e.last}`, 'employee'))
    db.customers.forEach(c => terms.set(c.name, 'customer'))
    db.vendors.forEach(v => terms.set(v.name, 'vendor'))
    db.invoices.forEach(i => terms.set(i.invNo, 'invoice'))
    db.bills.forEach(x => terms.set(x.billNo, 'bill'))
    db.workOrders.forEach(w => terms.set(w.woNo, 'workorder'))
    db.items.forEach(i => terms.set(i.name, 'item'))
    db.equipment.forEach(e => terms.set(e.category === 'Crane' ? `Crane ${e.unit}` : e.unit, 'equipment'))
    const sorted = [...terms.keys()].filter(k => k.length >= 4).sort((a, b) => b.length - a.length)
    const out = []
    const root = document.querySelector('main') ?? document.body
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const CLICK = 'button, a, [role=button], [data-ref], label, select, option, input, textarea, .leaflet-container, [data-noscan]'
    let n
    while ((n = walker.nextNode())) {
      const txt = n.textContent ?? ''; if (txt.trim().length < 4) continue
      const el = n.parentElement; if (!el || el.closest(CLICK)) continue
      const vis = el.getClientRects().length > 0; if (!vis) continue
      const hit = sorted.find(k => { const i = txt.indexOf(k); if (i < 0) return false; const after = txt[i + k.length]; return !(after && /[0-9A-Za-z]/.test(after)) })
      if (hit) out.push({ kind: terms.get(hit), term: hit, text: txt.trim().slice(0, 90), tag: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ').slice(0, 3).join('.') : '') })
    }
    return out
  })
  report[pg] = res; total += res.length
  console.log(`${pg.padEnd(12)} ${res.length} unwired`)
  res.slice(0, 6).forEach(r => console.log(`   ${r.kind.padEnd(9)} "${r.term}" in <${r.tag}> "${r.text}"`))
}
console.log('TOTAL unwired:', total, errors.length ? 'ERRORS: ' + errors.join(' | ') : 'no errors')
await b.close()
process.exit(0)
