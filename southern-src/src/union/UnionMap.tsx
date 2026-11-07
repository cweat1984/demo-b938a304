/** Union coverage map: every county in our region coloured by its IUOE local. Offline — pre-projected us-atlas county paths
 *  (scripts/build-union-geo.mjs), no tiles, no API key. Pan / pinch / wheel zoom, tap or hover a county, pins for branches,
 *  active jobs and wind farms. County → local links are inferred from DOL wage-determination coverage (UNVERIFIED). */
import { memo, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from 'react'
import { Plus, Minus, Maximize2, Building2, HardHat, Wind, ChevronRight, X } from 'lucide-react'
import { useStore } from '../data/store'
import { useWind } from '../data/wind'
import type { ULocal } from './payroll'

export interface Geo { w: number; h: number; k: number; t: [number, number]; p: [number, number]; r: number; states: { id: string; st: string; n: string; d: string; c: [number, number]; b: [number, number, number, number] }[]; counties: { id: string; st: string; n: string; d: string; c: [number, number] }[] }
let geoCache: Geo | null = null
export function useGeo() {
  const [g, setG] = useState<Geo | null>(geoCache)
  useEffect(() => { if (!g) import('./geo/counties.json').then(m => { geoCache = m.default as unknown as Geo; setG(geoCache) }) }, [g])
  return g
}
/** Same conic equal-area projection d3 used to bake the paths (parallels 29.5/45.5, rotate 98°W). */
export function projector(g: Geo) {
  const R = Math.PI / 180, s0 = Math.sin(g.p[0] * R), n = (s0 + Math.sin(g.p[1] * R)) / 2, c = 1 + s0 * (2 * n - s0), r0 = Math.sqrt(c) / n
  const yc = r0 - Math.sqrt(c - 2 * n * Math.sin(33.6442 * R)) / n // d3.geoConicEqualArea's default center [0, 33.6442]
  return (lng: number, lat: number): [number, number] => { const x = (lng + g.r) * R * n, r = Math.sqrt(c - 2 * n * Math.sin(lat * R)) / n; return [g.t[0] + g.k * r * Math.sin(x), g.t[1] - g.k * (r0 - r * Math.cos(x) - yc)] }
}
export const MAP_STATES = ['OK', 'TX', 'KS', 'NM', 'CO', 'AR', 'LA', 'MO', 'NE', 'IA', 'MS']
const norm = (s: string) => s.toLowerCase().replace(/ (county|parish)$/, '').replace(/[^a-z]/g, '')
const FIXED: Record<string, string> = { '627': '#d9692b', '178': '#2563eb', '450': '#0d9488', '9': '#7c3aed', '101': '#ca8a04', '513': '#db2777', '406': '#16a34a', '624': '#0891b2', '953': '#9333ea', '351': '#65a30d', '12': '#b45309' }
const PAL = ['#ef4444', '#8b5cf6', '#14b8a6', '#f59e0b', '#3b82f6', '#84cc16', '#ec4899', '#06b6d4', '#a855f7', '#22c55e']
export const localColor = (k: string) => FIXED[k] ?? PAL[[...k].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PAL.length]
const score = (l: ULocal, st: string) => l.rates.filter(r => r.st === st && (r.cr || r.oi)).length * 100 + l.nr
/** county key "ST|name" → locals (best first, same ordering as payroll's localsForCounty). */
export function countyIndex(locals: ULocal[]) {
  const m = new Map<string, ULocal[]>()
  for (const l of locals) for (const [c, s] of l.counties) { const k = s + '|' + norm(c); (m.get(k) ?? m.set(k, []).get(k)!).push(l) }
  for (const [k, v] of m) v.sort((a, b) => score(b, k.slice(0, 2)) - score(a, k.slice(0, 2)))
  return m
}
const cname = (c: Geo['counties'][number]) => c.id === '29510' ? 'St. Louis City' : c.n
const ckey = (c: Geo['counties'][number]) => c.st + '|' + norm(cname(c))

type VB = { x: number; y: number; w: number; h: number }
interface Pin { id: string; kind: 'branch' | 'job' | 'wind'; x: number; y: number; label: string; sub: string; act?: () => void }
type Sel = { kind: 'county'; c: Geo['counties'][number]; ls: ULocal[] } | { kind: 'pin'; p: Pin; c?: Geo['counties'][number]; ls: ULocal[] } | null

const Counties = memo(function Counties({ g, idx, st }: { g: Geo; idx: Map<string, ULocal[]>; st: string }) {
  return <g>{g.counties.map(c => { const l = idx.get(ckey(c))?.[0]; const dim = st !== 'ALL' && c.st !== st
    return <path key={c.id} d={c.d} data-c={c.id} fill={l ? localColor(String(l.local)) : 'url(#nolocal)'} fillOpacity={dim ? 0.18 : l ? 0.78 : 1} stroke="#fff" strokeOpacity={0.55} strokeWidth={0.35} vectorEffect="non-scaling-stroke" /> })}</g>
})

export default function UnionMap({ locals, st, onOpenLocal, height }: { locals: ULocal[]; st: string; onOpenLocal: (l: ULocal) => void; height?: number }) {
  const g = useGeo(), db = useStore(s => s.db), open = useStore(s => s.open), wind = useWind()
  const idx = useMemo(() => countyIndex(locals), [locals])
  const [vb, setVb] = useState<VB>({ x: 0, y: 0, w: 1000, h: 760 })
  const [show, setShow] = useState({ branch: true, job: true, wind: false })
  const [sel, setSel] = useState<Sel>(null), [hover, setHover] = useState<{ c: Geo['counties'][number]; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null), wrapRef = useRef<HTMLDivElement>(null)
  const ptrs = useRef(new Map<number, { x: number; y: number }>()), gest = useRef<{ moved: number; t: number; target: Element | null; pinch?: number; vb0?: VB; mid?: [number, number] }>({ moved: 0, t: 0, target: null })
  // fit to the selected state (or the whole region)
  useEffect(() => { if (!g) return; const s = g.states.find(x => x.st === st); if (!s) { setVb({ x: 0, y: 0, w: g.w, h: g.h }); return } const [x0, y0, x1, y1] = s.b, pad = 18, w = x1 - x0 + pad * 2, h = y1 - y0 + pad * 2, asp = g.w / g.h
    const W = Math.max(w, h * asp), H = W / asp; setVb({ x: x0 - pad - (W - w) / 2, y: y0 - pad - (H - h) / 2, w: W, h: H }) }, [g, st])
  const proj = useMemo(() => g ? projector(g) : null, [g])
  const pins = useMemo<Pin[]>(() => {
    if (!proj) return []
    const out: Pin[] = []
    if (show.branch) db.branches.forEach(b => { const [x, y] = proj(b.lng, b.lat); out.push({ id: b.id, kind: 'branch', x, y, label: `Southern · ${b.name}`, sub: `${b.city}, ${b.state} branch` }) })
    if (show.job) db.jobs.filter(j => j.status !== 'Complete' && j.stage !== 'Quote').forEach(j => { const s = db.sites.find(x => x.id === j.siteId); if (!s?.lat || !MAP_STATES.includes(s.state)) return; const [x, y] = proj(s.lng, s.lat); out.push({ id: j.id, kind: 'job', x, y, label: `Job #${j.jobNo} · ${j.name}`, sub: `${s.city}, ${s.state} · ${j.status}`, act: () => open({ type: 'job', id: j.id } as never) }) })
    if (show.wind && wind) wind.farms.filter(f => MAP_STATES.includes(f.st) && (st === 'ALL' || f.st === st)).forEach(f => { const [x, y] = proj(f.lng, f.lat); out.push({ id: f.id, kind: 'wind', x, y, label: `${f.name} wind farm`, sub: `${f.county} Co., ${f.st} · ${f.n} turbines · ${Math.round(f.mw)} MW`, act: () => open({ type: 'windfarm', id: f.id }) }) })
    return out
  }, [proj, show, db, wind, st, open])
  const legend = useMemo(() => { if (!g) return []; const m = new Map<string, { l: ULocal; n: number }>(); let none = 0
    g.counties.filter(c => st === 'ALL' || c.st === st).forEach(c => { const l = idx.get(ckey(c))?.[0]; if (!l) { none++; return } const k = String(l.local); const e = m.get(k) ?? m.set(k, { l, n: 0 }).get(k)!; e.n++ })
    return [...[...m.values()].sort((a, b) => b.n - a.n), { l: null, n: none }] as { l: ULocal | null; n: number }[] }, [g, idx, st])

  const toSvg = (cx: number, cy: number, v = vb): [number, number] => { const r = svgRef.current!.getBoundingClientRect(), s = Math.min(r.width / v.w, r.height / v.h), ox = (r.width - v.w * s) / 2, oy = (r.height - v.h * s) / 2; return [v.x + (cx - r.left - ox) / s, v.y + (cy - r.top - oy) / s] }
  const pxPerUnit = () => { const r = svgRef.current?.getBoundingClientRect(); return r ? Math.min(r.width / vb.w, r.height / vb.h) : 1 }
  const zoomAt = (f: number, cx?: number, cy?: number) => setVb(v => { const w = Math.min(1400, Math.max(40, v.w / f)), h = w * v.h / v.w; const [px, py] = cx != null ? toSvg(cx, cy!, v) : [v.x + v.w / 2, v.y + v.h / 2]; return { x: px - (px - v.x) * w / v.w, y: py - (py - v.y) * h / v.h, w, h } })
  useEffect(() => { const el = svgRef.current; if (!el) return; const wh = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY) }; el.addEventListener('wheel', wh, { passive: false }); return () => el.removeEventListener('wheel', wh) }) // eslint-disable-line
  const down = (e: RPE<SVGSVGElement>) => { try { svgRef.current!.setPointerCapture(e.pointerId) } catch { /* synthetic pointer */ } ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.current.size === 1) gest.current = { moved: 0, t: Date.now(), target: e.target as Element }
    if (ptrs.current.size === 2) { const [a, b] = [...ptrs.current.values()]; gest.current.pinch = Math.hypot(a.x - b.x, a.y - b.y); gest.current.vb0 = vb; gest.current.mid = [(a.x + b.x) / 2, (a.y + b.y) / 2]; gest.current.moved = 99 } }
  const move = (e: RPE<SVGSVGElement>) => {
    const p = ptrs.current.get(e.pointerId)
    if (!p) { if (e.pointerType === 'mouse') { const id = (e.target as Element).getAttribute?.('data-c'); const c = id ? g!.counties.find(x => x.id === id) : undefined; const r = wrapRef.current!.getBoundingClientRect(); setHover(c ? { c, x: e.clientX - r.left, y: e.clientY - r.top } : null) } return }
    if (ptrs.current.size === 2 && gest.current.pinch && gest.current.vb0) { ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const [a, b] = [...ptrs.current.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), v0 = gest.current.vb0, f = d / gest.current.pinch
      const w = Math.min(1400, Math.max(40, v0.w / f)), h = w * v0.h / v0.w, [mx, my] = gest.current.mid!, [px, py] = toSvg(mx, my, v0), nm = [(a.x + b.x) / 2, (a.y + b.y) / 2], s = pxPerUnit() * (v0.w / w)
      setVb({ x: px - (px - v0.x) * w / v0.w - (nm[0] - mx) / s, y: py - (py - v0.y) * h / v0.h - (nm[1] - my) / s, w, h }); return }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); gest.current.moved += Math.abs(dx) + Math.abs(dy)
    if (gest.current.moved > 5) { const s = pxPerUnit(); setVb(v => ({ ...v, x: v.x - dx / s, y: v.y - dy / s })); setHover(null) }
  }
  const up = (e: RPE<SVGSVGElement>) => {
    const had = ptrs.current.delete(e.pointerId); if (ptrs.current.size === 1) { gest.current.pinch = undefined; const [k] = [...ptrs.current.keys()]; void k } if (!had || ptrs.current.size) return
    if (gest.current.moved > 6) return
    const t = gest.current.target, pid = t?.getAttribute?.('data-pin'), cid = t?.getAttribute?.('data-c')
    if (pid) { const p = pins.find(x => x.kind + x.id === pid); const under = document.elementsFromPoint(e.clientX, e.clientY).find(el => el.getAttribute('data-c'))?.getAttribute('data-c'); const c = under && g ? g.counties.find(x => x.id === under) : undefined
      if (p) setSel({ kind: 'pin', p, c, ls: c ? idx.get(ckey(c)) ?? [] : [] }); return }
    if (cid && g) { const c = g.counties.find(x => x.id === cid)!; const ls = idx.get(ckey(c)) ?? []; const again = sel?.kind === 'county' && sel.c.id === c.id
      setSel({ kind: 'county', c, ls }); if (ls[0] && (e.pointerType === 'mouse' || again)) onOpenLocal(ls[0]) } else setSel(null)
  }
  if (!g) return <div className="grid place-items-center text-sm text-muted" style={{ height: height ?? 480 }}>Loading county map…</div>
  const s = pxPerUnit(), pr = (px: number) => px / s
  const hoverLocals = hover ? idx.get(ckey(hover.c)) ?? [] : []
  return <div className="space-y-3" data-testid="union-map-wrap">
    <div className="flex flex-wrap gap-2 items-center text-sm" data-testid="union-pins">
      {([['branch', 'Branches', Building2, '#0f2d52'], ['job', 'Active jobs', HardHat, '#111827'], ['wind', 'Wind farms', Wind, '#0e7490']] as const).map(([k, label, I, col]) =>
        <button key={k} data-testid={'union-pins-' + k} aria-pressed={show[k]} onClick={() => setShow(x => ({ ...x, [k]: !x[k] }))} className={'h-10 px-3 rounded-full border hairline inline-flex items-center gap-1.5 ' + (show[k] ? 'text-white' : '')} style={show[k] ? { background: col, borderColor: col } : undefined}><I className="size-4" /><span className="hidden sm:inline">{label}</span><span className="sm:hidden">{k === 'branch' ? 'Branches' : k === 'job' ? 'Jobs' : 'Wind'}</span></button>)}
      <span className="text-xs text-muted ml-auto hidden sm:inline">Scroll or pinch to zoom · drag to pan · click a county for its local</span>
    </div>
    <div ref={wrapRef} className="relative rounded-xl overflow-hidden border hairline select-none" style={{ background: '#eef3f8', height: height ?? 'min(72vh, 640px)' }} data-testid="union-map">
      <svg ref={svgRef} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full block" style={{ touchAction: 'none', cursor: gest.current.moved > 5 && ptrs.current.size ? 'grabbing' : 'grab' }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e => { ptrs.current.delete(e.pointerId) }} onPointerLeave={() => setHover(null)} role="img" aria-label="Map of counties coloured by IUOE local">
        <defs><pattern id="nolocal" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#e2e8f0" /><line x1="0" y1="0" x2="0" y2="6" stroke="#cbd5e1" strokeWidth="2" /></pattern></defs>
        <Counties g={g} idx={idx} st={st} />
        <g pointerEvents="none">{g.states.map(x => <path key={x.id} d={x.d} fill="none" stroke="#0f2d52" strokeWidth={1.4} vectorEffect="non-scaling-stroke" />)}</g>
        {sel?.kind === 'county' && <path d={sel.c.d} fill="none" stroke="#111" strokeWidth={3} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {hover && <path d={hover.c.d} fill="none" stroke="#111" strokeWidth={1.6} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        <g pointerEvents="none" style={{ fontSize: pr(11), fontWeight: 700 }}>{g.states.filter(x => vb.w > 260 || x.st === st).map(x => <text key={x.id} x={x.c[0]} y={x.c[1]} textAnchor="middle" fill="#0f2d52" fillOpacity={0.55} stroke="#fff" strokeWidth={pr(2.5)} paintOrder="stroke">{x.st}</text>)}</g>
        <g>{pins.map(p => p.kind === 'branch' ? <g key={p.kind + p.id}><rect data-pin={p.kind + p.id} x={p.x - pr(9)} y={p.y - pr(9)} width={pr(18)} height={pr(18)} rx={pr(4)} fill="#0f2d52" stroke="#fff" strokeWidth={pr(2)} /><text x={p.x} y={p.y + pr(4)} textAnchor="middle" fill="#fff" pointerEvents="none" style={{ fontSize: pr(10), fontWeight: 800 }}>S</text></g>
          : p.kind === 'job' ? <circle key={p.kind + p.id} data-pin={p.kind + p.id} cx={p.x} cy={p.y} r={pr(6)} fill="#111827" stroke="#fff" strokeWidth={pr(1.5)} />
          : <path key={p.kind + p.id} data-pin={p.kind + p.id} d={`M${p.x},${p.y - pr(7)} L${p.x + pr(6)},${p.y + pr(5)} L${p.x - pr(6)},${p.y + pr(5)}Z`} fill="#0e7490" stroke="#fff" strokeWidth={pr(1.2)} />)}</g>
      </svg>
      <div className="absolute right-2 top-2 flex flex-col gap-1.5">
        <button aria-label="Zoom in" data-testid="union-map-zoomin" onClick={() => zoomAt(1.5)} className="size-11 rounded-xl bg-white/95 shadow grid place-items-center text-slate-800"><Plus className="size-5" /></button>
        <button aria-label="Zoom out" onClick={() => zoomAt(1 / 1.5)} className="size-11 rounded-xl bg-white/95 shadow grid place-items-center text-slate-800"><Minus className="size-5" /></button>
        <button aria-label="Reset view" data-testid="union-map-reset" onClick={() => { const s0 = g.states.find(x => x.st === st); if (!s0) setVb({ x: 0, y: 0, w: g.w, h: g.h }); else setVb(v => ({ ...v })) ; if (!s0) return; const [x0, y0, x1, y1] = s0.b, w = x1 - x0 + 36, h = y1 - y0 + 36, asp = g.w / g.h, W = Math.max(w, h * asp), H = W / asp; setVb({ x: x0 - 18 - (W - w) / 2, y: y0 - 18 - (H - h) / 2, w: W, h: H }) }} className="size-11 rounded-xl bg-white/95 shadow grid place-items-center text-slate-800"><Maximize2 className="size-4" /></button>
      </div>
      {hover && <div data-testid="union-map-tip" className="absolute pointer-events-none z-10 rounded-lg bg-slate-900/95 text-white text-xs px-2.5 py-1.5 shadow-lg max-w-64" style={{ left: Math.min(hover.x + 14, (wrapRef.current?.clientWidth ?? 600) - 220), top: hover.y + 14 }}>
        <b>{cname(hover.c)} {hover.c.st === 'LA' ? 'Parish' : 'Co.'}, {hover.c.st}</b><div>{hoverLocals[0] ? `IUOE Local ${hoverLocals[0].local}${hoverLocals.length > 1 ? ` (also ${hoverLocals.slice(1, 3).map(l => l.local).join(', ')})` : ''}` : 'No IUOE local on file'}</div></div>}
      {sel && <div data-testid="union-map-info" className="absolute left-2 right-2 bottom-2 sm:right-auto sm:max-w-md z-10 rounded-xl bg-white text-slate-900 shadow-xl border hairline p-3 flex items-center gap-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {sel.kind === 'county' ? <>
          <span className="size-4 rounded shrink-0" style={{ background: sel.ls[0] ? localColor(String(sel.ls[0].local)) : '#cbd5e1' }} />
          <div className="flex-1 min-w-0"><div className="font-semibold">{cname(sel.c)} {sel.c.st === 'LA' ? 'Parish' : 'County'}, {sel.c.st}</div><div className="text-sm text-slate-600">{sel.ls[0] ? <>IUOE Local {sel.ls[0].local}{sel.ls.length > 1 && <> · also {sel.ls.slice(1, 3).map(l => l.local).join(', ')}</>} · <span className="text-xs">inferred from DOL WDs</span></> : 'No IUOE local on file — not in any 2026 wage determination. Check with the hall.'}</div></div>
          {sel.ls[0] && <button data-testid="union-map-open" onClick={() => onOpenLocal(sel.ls[0])} className="h-11 px-3 rounded-lg text-white font-semibold inline-flex items-center gap-1 shrink-0" style={{ background: '#0f2d52' }}>Local {sel.ls[0].local}<ChevronRight className="size-4" /></button>}
        </> : <>
          <div className="flex-1 min-w-0"><div className="font-semibold truncate">{sel.p.label}</div><div className="text-sm text-slate-600">{sel.p.sub}</div>
            {sel.c && <div className="text-xs text-slate-600 mt-0.5">in {cname(sel.c)} {sel.c.st === 'LA' ? 'Parish' : 'County'}, {sel.c.st} → {sel.ls[0] ? <button data-testid="union-map-open" className="underline font-semibold" style={{ color: '#c4581c' }} onClick={() => onOpenLocal(sel.ls[0])}>IUOE Local {sel.ls[0].local}</button> : 'no IUOE local on file'}</div>}</div>
          {sel.p.act && <button onClick={sel.p.act} className="h-11 px-3 rounded-lg text-white font-semibold shrink-0" style={{ background: '#0f2d52' }}>Open</button>}
        </>}
        <button aria-label="Close" onClick={() => setSel(null)} className="size-9 grid place-items-center text-slate-500 shrink-0"><X className="size-4" /></button>
      </div>}
    </div>
    <div data-testid="union-map-legend" className="flex flex-wrap gap-1.5">
      {legend.map(({ l, n }) => l ? <button key={String(l.local)} data-testid="union-legend-item" onClick={() => onOpenLocal(l)} className="h-10 pl-2 pr-3 rounded-full border hairline inline-flex items-center gap-2 text-sm hover:bg-black/5"><span className="size-3.5 rounded-sm" style={{ background: localColor(String(l.local)) }} /><b>Local {l.local}</b><span className="text-muted text-xs">{l.hq_city ?? ''} · {n} co.</span></button>
        : n > 0 && <span key="none" className="h-10 pl-2 pr-3 rounded-full border hairline inline-flex items-center gap-2 text-sm"><svg className="size-3.5"><rect width="14" height="14" fill="url(#nolocal)" /></svg><span>No IUOE local on file</span><span className="text-muted text-xs">{n} co.</span></span>)}
    </div>
    <div className="text-[11px] text-muted">County lines: U.S. Census via us-atlas (bundled). County → local inferred from 2026 DOL Davis-Bacon wage-determination coverage — UNVERIFIED against each local's CBA jurisdiction. Hatched counties have no IUOE scale on file (most of West Texas).</div>
  </div>
}
