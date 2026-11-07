import { moneyHidden } from '../lib/util'
import { useMemo, useState } from 'react'
import { FileBadge, Car, AlertTriangle, Clock, Check, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, DemoTag } from '../components/ui'
import { useMoves, compOf, trailerOf } from '../data/moves'
import { cn } from '../lib/util'
import { useG, DIMS, DECK, STATE_RULES, ROUTES, ESCORT_VENDORS, type PermitRec, type RouteOpt } from './gstore'

const ft = (n: number) => `${Math.floor(n)}′${Math.round((n % 1) * 12)}″`
export default function Permits() {
  const ms = useMoves(), { permits, escorts } = useG()
  // Permits follow the PLANNED moves (pick one), with a route built from the crane's site → destination; demo routes stay as extras.
  const [moveId, setMoveId] = useState(() => (ms.moves.find(m => m.status !== 'Complete') ?? ms.moves[0])?.id ?? '')
  const move = ms.moves.find(m => m.id === moveId) ?? ms.moves[0]
  const planned: RouteOpt | null = useMemo(() => { if (!move) return null; const c = ms.cranes.find(x => x.id === move.craneId); const from = c ? { lat: c.lat, lng: c.lng } : { lat: 35.4, lng: -97.5 }
    const st = (lat: number, lng: number) => lat < 33.9 || (lat < 36.5 && lng < -100) ? 'TX' : 'OK'
    const a = st(from.lat, from.lng), b = st(move.toLat, move.toLng), mi = Math.round(1.25 * 69 * Math.hypot(move.toLat - from.lat, (move.toLng - from.lng) * Math.cos(from.lat * Math.PI / 180)))
    const states = a === b ? [a] : [a, b]
    return { id: 'planned', label: `${move.fromProject} → ${move.toProject} (planned move)`, states, miles: Object.fromEntries(states.map(x => [x, Math.max(1, Math.round(mi / states.length))])) } }, [move, ms.cranes])
  const routes = planned ? [planned, ...ROUTES] : ROUTES
  const [routeId, setRouteId] = useState('planned')
  const route = routes.find(r => r.id === routeId) ?? routes[0]
  const loads = useMemo(() => !move ? [] : move.loads.filter(l => l.kind !== 'return').map(l => {
    const comps = move.items.filter(i => i.travels && i.loadNo === l.no).map(i => compOf(ms, i.compId)!).filter(Boolean)
    const tr = trailerOf(ms, l.trailerId), deck = DECK[tr?.kind ?? 'Flatbed'] ?? DECK.Flatbed
    const d = comps.map(c => DIMS[c.type] ?? { w: 8, h: 4, l: 10 })
    const w = Math.max(8, ...d.map(x => x.w)), h = deck.h + Math.max(0, ...d.map(x => x.h)), len = 70 + Math.max(0, ...d.map(x => x.l)) * 0.4
    const lbs = 20000 + deck.tare + comps.reduce((a, c) => a + c.weightLbs, 0)
    const states = route.states.filter((s, i, a) => a.indexOf(s) === i).map(s => { const r = STATE_RULES[s]; const os = w > r.legal.w || h > r.legal.h, ow = lbs > r.legal.lbs
      return { s, need: os || ow, why: [w > r.legal.w && `width ${ft(w)} > ${r.legal.w} ft`, h > r.legal.h && `height ${ft(h)} > ${r.legal.h} ft`, ow && `${(lbs / 1000).toFixed(0)}k lb > ${r.legal.lbs / 1000}k`].filter(Boolean) as string[], escorts: r.escort(w, h, len), cost: !(os || ow) ? 0 : Math.round(r.base + (ow ? ((lbs - r.legal.lbs) / 2000) * r.perTon * (route.miles[s] ?? 100) / 25 : 0)) } })
    return { l, comps, tr, w, h, len, lbs, states }
  }), [move, ms, route])
  if (!move) return <Card>No crane move to permit.</Card>
  const date = move.pickup
  const key = (no: number, s: string) => `${move.id}|${routeId}|${no}|${s}`
  const rec = (no: number, s: string) => permits.find(p => p.key === key(no, s))
  const jobNo = move.toJobNo
  const total = loads.reduce((a, x) => a + x.states.reduce((b, s) => b + s.cost, 0), 0)
  const escortNeeds = [...new Set(loads.flatMap(x => x.states.flatMap(s => s.escorts.map(e => `${s.s}|${e}`))))]
  const orderAll = () => { loads.forEach(x => x.states.filter(s => s.need).forEach(s => { if (!rec(x.l.no, s.s)) useG.getState().setPermit({ key: key(x.l.no, s.s), moveId: move.id, loadNo: x.l.no, state: s.s, status: 'Ordered', cost: s.cost, jobNo, date }) })); toast.success('Permits ordered (simulated) — all charged to one job', { description: `Rule 2: same-day permits on the same route share Job ${jobNo}` }) }
  return <div className="flex flex-col gap-5" data-testid="permits-page">
    <PageHeader eyebrow={<span className="inline-flex gap-2 items-center">Fleet <DemoTag /></span>} title="Oversize / overweight permits" sub="The load-out already knows sizes and weights. We work out which states need permits and escorts." actions={<select data-testid="permit-route" value={routeId} onChange={e => setRouteId(e.target.value)} className="h-10 rounded-xl bg-surface-2 px-3 text-sm">{routes.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select>} />
    {ms.moves.length > 1 && <div className="flex items-center gap-2 text-sm -mt-2"><span className="text-muted">Move</span><select data-testid="permit-move" value={move.id} onChange={e => { setMoveId(e.target.value); setRouteId('planned') }} className="h-9 rounded-xl bg-surface-2 px-3 text-sm">{ms.moves.map(m => <option key={m.id} value={m.id}>#{m.fromJobNo} → #{m.toJobNo} · {m.toProject} · {m.status}</option>)}</select></div>}
    <div className="grid md:grid-cols-4 gap-3">
      <Card className="!p-4"><div className="text-xs text-muted">Move</div><div className="font-semibold">#{move.fromJobNo} → #{move.toJobNo}</div><div className="text-xs text-muted">{route.states.join(' → ')} · {Object.values(route.miles).reduce((a, b) => a + b, 0)} mi</div></Card>
      <Card className="!p-4"><div className="text-xs text-muted">Loads needing permits</div><div className="text-2xl font-semibold" data-testid="permit-need">{loads.filter(x => x.states.some(s => s.need)).length} / {loads.length}</div></Card>
      <Card className="!p-4"><div className="text-xs text-muted">Permit cost</div><div className="text-2xl font-semibold">{moneyHidden() ? '—' : `$${total.toLocaleString()}`}</div><div className="text-xs text-muted">charged to Job {jobNo}</div></Card>
      <Card className="!p-4"><div className="text-xs text-muted">Escorts / pilot cars</div><div className="text-2xl font-semibold">{escortNeeds.length}</div><div className="text-xs text-muted">{escorts.filter(e => e.status === 'Confirmed').length} booked</div></Card>
    </div>
    <Card pad={false}><div className="px-5 py-3 border-b hairline flex items-center gap-2"><FileBadge className="size-4" /><span className="font-semibold flex-1">Loads & permits by state</span><Button size="sm" variant="primary" data-testid="permit-order-all" onClick={orderAll}>Order all needed permits</Button></div>
      <div className="divide-y hairline">{loads.map(x => <div key={x.l.id} className="px-5 py-3" data-testid="permit-load">
        <div className="flex items-center gap-2 flex-wrap text-sm"><Truck className="size-4 text-muted" /><b>Load {x.l.no}</b><span className="text-muted">{x.tr?.name} · {x.comps.map(c => c.name).slice(0, 2).join(', ')}{x.comps.length > 2 ? ` +${x.comps.length - 2}` : ''}</span><span className="ml-auto text-xs text-muted">{ft(x.w)} W · {ft(x.h)} H · {Math.round(x.len)} ft L · {(x.lbs / 1000).toFixed(1)}k lb gross</span></div>
        <div className="flex flex-wrap gap-2 mt-2">{x.states.map(s => { const r = rec(x.l.no, s.s)
          return <div key={s.s} className={cn('rounded-xl px-3 py-2 text-xs min-w-56 border', s.need ? 'border-warn/40 bg-warn/5' : 'hairline')} data-testid="permit-state"><div className="flex items-center gap-2"><b>{s.s}</b>{s.need ? <Badge tone={r?.status === 'Issued' ? 'ok' : r ? 'info' : 'warn'}>{r?.status ?? 'Permit needed'}</Badge> : <Badge tone="ok">Legal</Badge>}{s.cost > 0 && <span className="ml-auto font-semibold">{moneyHidden() ? '—' : `$${s.cost}`}</span>}</div>
            {s.why.length > 0 && <div className="text-muted mt-1">{s.why.join(' · ')}</div>}{s.escorts.map(e => <div key={e} className="text-info mt-0.5 flex items-center gap-1"><Car className="size-3" />{e}</div>)}
            {r && <div className="text-muted mt-1">Job {r.jobNo}{r.permitNo ? ` · ${r.permitNo}` : ''}</div>}
            {r?.status === 'Ordered' && <button data-testid="permit-issue" onClick={() => useG.getState().setPermit({ ...r, status: 'Issued', permitNo: `${s.s}-${Math.floor(100000 + Math.random() * 899999)}` } as PermitRec)} className="mt-1 text-accent font-semibold">Mark issued</button>}</div> })}</div></div>)}</div></Card>
    <div className="grid lg:grid-cols-2 gap-4">
      <Card data-testid="escorts"><div className="font-semibold mb-2 flex items-center gap-2"><Car className="size-4" />Escorts & pilot cars · {date}</div>
        {escortNeeds.length ? escortNeeds.map(n => { const [st, kind] = n.split('|'); const b = escorts.find(e => e.key === n); const vs = ESCORT_VENDORS.filter(v => v.states.includes(st) && (!/Height/.test(kind) || v.height))
          return <div key={n} className="py-2 border-b hairline last:border-0 text-sm" data-testid="escort-need"><div className="flex items-center gap-2"><b>{st}</b><span className="flex-1">{kind}</span>{b && <Badge tone="ok">{b.vendor} · {b.status}</Badge>}</div>
            {!b && <div className="flex flex-wrap gap-1.5 mt-1.5">{vs.map(v => <button key={v.id} data-testid="escort-book" onClick={() => { useG.getState().book({ key: n, vendor: v.name, state: st, date, kind, rate: v.rate, status: 'Confirmed' }); toast.success(`${v.name} booked (simulated)`, { description: `${kind} · ${st} · ${date}${moneyHidden() ? '' : ` · $${v.rate}/mi`}` }) }} className="rounded-full bg-surface-2 px-3 py-1 text-xs">{v.name}{moneyHidden() ? '' : ` · $${v.rate}/mi`} · ★{v.rating}</button>)}</div>}</div> }) : <div className="text-sm text-muted">No escorts needed on this route.</div>}</Card>
      <Card data-testid="restrictions"><div className="font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="size-4 text-warn" />Route restrictions & curfews <span className="text-xs text-muted font-normal">(demo data)</span></div>
        {route.states.filter((s, i, a) => a.indexOf(s) === i).map(s => <div key={s} className="mb-3 text-sm"><b>{s}</b>{STATE_RULES[s].restrictions.map(r => <div key={r} className="text-muted flex gap-1.5 mt-1"><AlertTriangle className="size-3.5 mt-0.5 shrink-0" />{r}</div>)}{STATE_RULES[s].curfew.map(r => <div key={r} className="text-muted flex gap-1.5 mt-1"><Clock className="size-3.5 mt-0.5 shrink-0" />{r}</div>)}</div>)}
        <div className="text-xs text-muted flex items-center gap-1"><Check className="size-3" />Permits attach to the load and the driver’s phone when issued.</div></Card>
    </div>
  </div>
}
