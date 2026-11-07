import { writeFileSync } from 'fs'
import { truckSvg } from '../src/art/peterbilt'
import { paintFor } from '../src/art/paint'
import { THEMES, tokens } from '../src/data/themes'
const cards = THEMES.map(t => { const p = t.key === 'light' ? { ...t.variants.light!, primary: '#d62f2f' } : t.variants[t.defaultMode]!; const k = tokens(p)
  return `<div style="background:${k.surface};border-radius:22px;padding:10px;border:1px solid ${k.line}"><div style="border-radius:14px;overflow:hidden">${truckSvg(paintFor(t.key, p), { id: t.key, scene: { bg: k.bg, ground: k.surface2, line: k.line } }).replace('<svg ', '<svg style="display:block;width:100%" ')}</div><div style="font:600 15px Inter,system-ui;color:${k.text};padding:10px 6px 2px">${t.name}</div><div style="font:12px Inter,system-ui;color:${k.muted};padding:0 6px 4px">${t.truck}</div></div>` }).join('')
writeFileSync('/tmp/trucks.html', `<html><body style="margin:0;padding:32px;background:#16181b"><div style="display:grid;grid-template-columns:repeat(5,1fr);gap:18px;width:1736px">${cards}</div></body></html>`)
const slh = THEMES[0].variants.dark!
writeFileSync('/tmp/hero.html', `<html><body style="margin:0;background:radial-gradient(120% 90% at 70% 0%,#4a4f57,#1c1e22 70%);padding:40px 60px 30px">${truckSvg(paintFor('slh', slh), { id: 'hero' }).replace('<svg ', '<svg style="display:block;width:1480px" ')}</body></html>`)
