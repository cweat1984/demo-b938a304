import { PhotoThumb } from '../lib/photos'
import { companyOf } from '../data/brand'
import { useKeep } from '../lib/keep'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import { Truck, Satellite, PackageCheck, MapPin, Plus, AlertTriangle, ArrowRight, Weight, RotateCcw, Play, CheckCircle2, Navigation, Camera } from 'lucide-react'
import { useStore } from '../data/store'
import { useMoves, moveActions, moveStats, loadWeight, trailerOf, compOf, sourcesFor, COMP_ORDER, STORAGE, PER_TRUCK, miles, type Move, type Component, type Load, type MovesState } from '../data/moves'
import { PageHeader, Badge, Button, Card, Segmented, Sheet, Modal, Field, Toggle, Progress, Kv } from '../components/ui'
import { EqRef } from '../components/bits'
import { OutsideTag } from '../components/OutsideCranes'
import { vendorOf, fmtHours } from '../data/rig'
import { CheckInForm, SamsaraBadge } from '../moves/CheckIn'
import { cn, today, addDays } from '../lib/util'

type Tab = 'board' | 'loadout' | 'shorts' | 'rentals' | 'components'
const lbs = (n: number) => n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k lb` : `${n.toLocaleString()} lb`
const tons = (n: number) => `${(n / 2000).toFixed(0)} t`

export default function Moves() {
  const s = useMoves()
  const [moveId, setMoveId] = useState(() => s.moves.find(m => m.status !== 'Complete')?.id ?? s.moves[0]?.id)
  const [tab, setTab] = useKeep<Tab>('moves:tab', 'board')
  const [plan, setPlan] = useState(false)
  const m = s.moves.find(x => x.id === moveId) ?? s.moves[0]
  const st = m ? moveStats(s, m) : null
  return (
    <div className="max-w-[1500px] mx-auto" data-testid="moves-page">
      <PageHeader eyebrow="Fleet · Crane moves" title="Crane Moves" sub="Every counterweight, block and pin — where it is, what it rides on, and when it lands."
        actions={<>{useStore.getState().session?.role === 'owner' && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { moveActions.reset(); setMoveId(useMoves.getState().moves[0].id); toast('Move demo data reset') }}>Reset demo</Button>}<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setPlan(true)} data-testid="plan-move">Plan next move</Button></>} />
      {s.moves.length > 1 && <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">{s.moves.map(x => { const cr = s.cranes.find(c => c.id === x.craneId)!; return <button key={x.id} onClick={() => setMoveId(x.id)} data-testid="move-chip" className={cn('shrink-0 rounded-2xl border hairline px-4 py-2 text-left', x.id === m?.id ? 'bg-surface-3' : 'bg-surface hover:bg-surface-2')}><div className="text-sm font-semibold">Crane {cr.unit} → #{x.toJobNo}</div><div className="text-[11px] text-muted">{x.status} · {moveStats(s, x).pct}%</div></button> })}</div>}
      {m && st && <MoveHero s={s} m={m} st={st} />}
      {m && <MoveOutside jobNos={[m.fromJobNo, m.toJobNo]} />}
      <Segmented className="my-5" value={tab} onChange={setTab} options={[{ value: 'board', label: 'Move board' }, { value: 'loadout', label: 'Load-out list' }, { value: 'shorts', label: 'Shorts & sources', count: m?.shorts.filter(x => x.status === 'Open').length }, { value: 'rentals', label: 'Rentals' }, { value: 'components', label: 'Components' }]} />
      {m && tab === 'board' && <Board s={s} m={m} />}
      {m && tab === 'loadout' && <LoadOut s={s} m={m} />}
      {m && tab === 'shorts' && <Shorts s={s} m={m} />}
      {tab === 'rentals' && <Rentals s={s} />}
      {tab === 'components' && <Components s={s} initial={m?.craneId} />}
      <Planner open={plan} onClose={() => setPlan(false)} onCreated={id => { setMoveId(id); setTab('loadout'); setPlan(false) }} />
    </div>
  )
}

function MoveHero({ s, m, st }: { s: MovesState; m: Move; st: ReturnType<typeof moveStats> }) {
  const cr = s.cranes.find(c => c.id === m.craneId)!
  return (
    <Card className="relative overflow-hidden" pad={false}>
      <div className="absolute inset-0 opacity-[.07] pointer-events-none" style={{ background: 'repeating-linear-gradient(135deg, var(--text) 0 2px, transparent 2px 14px)' }} />
      <div className="relative p-5 md:p-6 grid md:grid-cols-[1fr_auto] gap-6 items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><Badge tone={m.status === 'Complete' ? 'ok' : m.status === 'In progress' ? 'accent' : 'neutral'} dot>{m.status}</Badge><Badge>{cr.kind}</Badge><SamsaraBadge /></div>
          <div className="display text-2xl md:text-3xl font-semibold mt-3 leading-tight"><EqRef id={cr.id} /> <span className="text-muted font-normal">· {cr.model}</span></div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm"><span className="text-muted">#{m.fromJobNo} {m.fromProject}</span><ArrowRight className="size-4 text-accent" /><span className="font-semibold">#{m.toJobNo} {m.toProject}</span></div>
          <div className="mt-1 text-xs text-muted">Pickup {m.pickup} · Drop-off {m.drop} · {miles(cr, { lat: m.toLat, lng: m.toLng })} mi</div>
        </div>
        <div className="flex items-center gap-6">
          <Ring pct={st.pct} />
          <div className="grid grid-cols-3 gap-4 text-center">
            <div><div className="display text-3xl font-semibold num" data-testid="n-planned">{st.planned}</div><div className="label">Planned</div></div>
            <div><div className="display text-3xl font-semibold num text-accent" data-testid="n-enroute">{st.enroute}</div><div className="label">En route</div></div>
            <div><div className="display text-3xl font-semibold num text-ok" data-testid="n-delivered">{st.delivered}</div><div className="label">Delivered</div></div>
          </div>
        </div>
      </div>
      <div className="relative border-t hairline px-5 md:px-6 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
        <span><b className="text-ink num" data-testid="n-loads">{st.loads}</b> loads</span><span><b className="text-ink num">{lbs(st.weight)}</b> ({tons(st.weight)})</span><span><b className="text-ink num">{st.own}</b> Southern · <b className="text-ink num">{st.loads - st.own}</b> third-party</span>
        {st.permits > 0 ? <span className="text-warn font-semibold flex items-center gap-1"><AlertTriangle className="size-4" />{st.permits} oversize / overweight permit{st.permits > 1 ? 's' : ''}</span> : <span className="text-ok font-semibold">No permits needed</span>}
      </div>
    </Card>
  )
}

function Ring({ pct }: { pct: number }) {
  const r = 42, c = 2 * Math.PI * r
  return (
    <div className="relative size-[108px] shrink-0" data-testid="move-pct">
      <svg viewBox="0 0 100 100" className="size-full -rotate-90"><circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="9" /><motion.circle cx="50" cy="50" r={r} fill="none" stroke="var(--ok)" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }} transition={{ duration: 1.1, ease: 'easeOut' }} /></svg>
      <div className="absolute inset-0 grid place-items-center text-center"><div><div className="display text-2xl font-semibold num">{pct}%</div><div className="text-[10px] text-muted -mt-0.5">complete</div></div></div>
    </div>
  )
}

// ---------------- Move board ----------------
const TYPE_COLOR: Record<string, string> = { Counterweight: '#64748b', 'Carbody CW': '#475569', 'Crawler track': '#1f2937', 'Boom section': '#f2b705', 'Jib section': '#f59e0b', 'Hook block': '#ef4444', 'Headache ball': '#dc2626', Winch: '#0ea5e9', 'Wire rope': '#8b5cf6', 'Pins & rigging': '#14b8a6', Mats: '#a16207', Superlift: '#94a3b8', 'Outrigger pad': '#22c55e' }

function TrailerViz({ s, m, l }: { s: MovesState; m: Move; l: Load }) {
  const tr = trailerOf(s, l.trailerId)!
  const items = m.items.filter(i => i.travels && i.loadNo === l.no).map(i => compOf(s, i.compId)!).filter(Boolean)
  const w = items.reduce((a, c) => a + c.weightLbs, 0)
  const fill = Math.min(1, w / tr.capLbs)
  return (
    <div className="relative h-[58px]">
      <svg viewBox="0 0 300 58" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <rect x="236" y="10" width="52" height="30" rx="5" fill={tr.carrier === 'Southern' ? 'var(--accent)' : '#64748b'} />
        <rect x="270" y="14" width="14" height="11" rx="2" fill="rgba(255,255,255,.55)" />
        <rect x="8" y="36" width="232" height="7" rx="2" fill="var(--surface-3)" />
        {[22, 44, 66, 200, 218, 252, 276].map(x => <circle key={x} cx={x} cy="49" r="6" fill="var(--text)" opacity=".8" />)}
      </svg>
      <div className="absolute left-[3%] bottom-[26px] w-[74%] h-[28px] flex items-end gap-[2px]">
        {items.map((c, k) => <motion.div key={c.id} title={`${c.name} · ${lbs(c.weightLbs)}`} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ delay: k * 0.05, type: 'spring', bounce: .3 }} style={{ originY: 1, width: `${(c.weightLbs / tr.capLbs) * 100}%`, background: TYPE_COLOR[c.type] ?? '#999', height: `${Math.min(100, 40 + (c.weightLbs / 1000))}%` }} className="rounded-[3px] min-w-[4px]" />)}
      </div>
      <div className="absolute right-[22%] -top-1 text-[10px] font-bold num text-muted">{Math.round(fill * 100)}% full</div>
    </div>
  )
}

function LoadCard({ s, m, l, onCheckIn }: { s: MovesState; m: Move; l: Load; onCheckIn: (l: Load) => void }) {
  const tr = trailerOf(s, l.trailerId)!
  const [geo, setGeo] = useState(false)
  const trip = m.loads.filter(x => x.trailerId === l.trailerId && x.no <= l.no).length
  const items = m.items.filter(i => i.travels && i.loadNo === l.no).map(i => compOf(s, i.compId)!).filter(Boolean)
  const sim = () => { setGeo(true); setTimeout(() => { moveActions.checkIn(m.id, l.id, { source: 'samsara', at: new Date().toISOString(), lat: m.toLat, lng: m.toLng, by: 'Samsara geofence' }); toast.success(`Load ${l.no} delivered — auto check-in`, { description: `${tr.name} entered the ${m.toProject} geofence` }); setGeo(false) }, 1400) }
  return (
    <motion.div layout layoutId={l.id} className={cn('card p-4 relative overflow-hidden', geo && 'ring-2 ring-accent')} data-testid="load-card" data-status={l.status} data-carrier={tr.carrier}>
      {geo && <motion.div className="absolute inset-0 bg-accent/10" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0, 1] }} transition={{ duration: 1.3 }} />}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1"><div className="font-semibold">Load {l.no} {trip > 1 && <span className="text-[11px] text-muted font-normal">· trip {trip}</span>}</div><div className="text-xs text-muted truncate">{tr.name} · {tr.driver}</div></div>
        {tr.carrier === 'Southern' ? <Badge tone="info">{companyOf().shortName}</Badge> : <Badge tone="warn">3rd-party</Badge>}
      </div>
      <div className="mt-3"><TrailerViz s={s} m={m} l={l} /></div>
      <div className="text-[11.5px] text-muted mt-1 line-clamp-2">{items.map(c => c.name.replace(/ #\d+$/, '')).filter((x, i, a) => a.indexOf(x) === i).join(' · ')}</div>
      <div className="flex items-center justify-between mt-2 text-xs"><span className="font-semibold num">{lbs(items.reduce((a, c) => a + c.weightLbs, 0))} / {lbs(tr.capLbs)}</span>{l.checkIn && <span className="text-ok font-semibold flex items-center gap-1">{l.checkIn.source === 'samsara' ? <Satellite className="size-3.5" /> : <Camera className="size-3.5" />}{new Date(l.checkIn.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}</div>
      {l.status === 'Planned' && <Button size="sm" className="w-full mt-3 pointer-coarse:min-h-[44px]" icon={<Play className="size-3.5" />} onClick={() => { moveActions.depart(m.id, l.id); toast(`Load ${l.no} left the yard`, { description: tr.samsara ? 'Samsara: left yard geofence → In transit' : 'Dispatcher marked departed' }) }} data-testid="depart">Mark departed</Button>}
      {l.status === 'En route' && <div className="flex gap-2 mt-3">
        {tr.samsara && <Button size="sm" variant="outline" className="flex-1" icon={<Satellite className="size-3.5" />} onClick={sim} disabled={geo} data-testid="sim-geofence">{geo ? 'Entering geofence…' : 'Simulate geofence'}</Button>}
        <Button size="sm" variant={tr.samsara ? 'ghost' : 'primary'} className="flex-1" icon={<MapPin className="size-3.5" />} onClick={() => onCheckIn(l)} data-testid="crew-checkin">Crew check-in</Button>
      </div>}
      {l.status === 'Delivered' && l.checkIn?.photo && <PhotoThumb src={l.checkIn.photo} className="mt-3 h-16 w-full object-cover rounded-lg" />}
    </motion.div>
  )
}

function Board({ s, m }: { s: MovesState; m: Move }) {
  const [ci, setCi] = useState<Load | null>(null)
  const [auto, setAuto] = useState(false)
  useEffect(() => {
    if (!auto) return
    const t = setInterval(() => {
      const st = useMoves.getState(); const mm = st.moves.find(x => x.id === m.id)!; const l = mm.loads.find(x => x.status === 'En route' && trailerOf(st, x.trailerId)?.samsara) ?? mm.loads.find(x => x.status === 'Planned')
      if (!l) { setAuto(false); return }
      if (l.status === 'Planned') moveActions.depart(m.id, l.id)
      else { moveActions.checkIn(m.id, l.id, { source: 'samsara', at: new Date().toISOString(), lat: m.toLat, lng: m.toLng, by: 'Samsara geofence' }); toast.success(`Load ${l.no} delivered (Samsara geofence)`) }
    }, 2600)
    return () => clearInterval(t)
  }, [auto, m.id, m.toLat, m.toLng])
  const lanes: { k: Load['status']; label: string; icon: React.ReactNode }[] = [{ k: 'Planned', label: 'Planned · staged', icon: <PackageCheck className="size-4" /> }, { k: 'En route', label: 'En route', icon: <Navigation className="size-4 text-accent" /> }, { k: 'Delivered', label: 'Delivered', icon: <CheckCircle2 className="size-4 text-ok" /> }]
  return (
    <div data-testid="move-board">
      <div className="flex flex-wrap items-center gap-3 mb-4"><Toggle checked={auto} onChange={setAuto} label={<span className="text-sm"><b>Live simulation</b> <span className="text-muted">— Samsara trailers depart and arrive on their own</span></span>} /><div className="flex-1" /><span className="text-xs text-muted">Third-party live loads are always checked in by the crew on the phone (GPS + time + photo).</span></div>
      <div className="grid lg:grid-cols-3 gap-4">
        {lanes.map(ln => { const ls = m.loads.filter(l => l.status === ln.k); return (
          <div key={ln.k} className="rounded-3xl bg-surface-2/60 border hairline p-3 min-h-[200px]" data-testid={`lane-${ln.k}`}>
            <div className="flex items-center gap-2 px-1 pb-3 font-semibold text-sm">{ln.icon}{ln.label}<span className="ml-auto text-muted num">{ls.length}</span></div>
            <div className="flex flex-col gap-3">{ls.map(l => <LoadCard key={l.id} s={s} m={m} l={l} onCheckIn={setCi} />)}{!ls.length && <div className="text-sm text-faint text-center py-8">Nothing here</div>}</div>
          </div>) })}
      </div>
      <Sheet open={!!ci} onClose={() => setCi(null)} title="Delivery check-in" sub="Crew phone · GPS, time and a photo">{ci && <CheckInForm move={m} load={ci} onDone={() => setCi(null)} />}</Sheet>
    </div>
  )
}

// ---------------- Load-out ----------------
function LoadOut({ s, m }: { s: MovesState; m: Move }) {
  const [stay, setStay] = useState<Component | null>(null)
  const [spot, setSpot] = useState(STORAGE[1])
  const st = moveStats(s, m)
  const locked = (no?: number) => !!no && m.loads.find(l => l.no === no)?.status !== 'Planned'
  const flip = (c: Component, travels: boolean, storage?: string) => {
    const before = moveStats(useMoves.getState(), m).loads
    moveActions.toggleItem(m.id, c.id, travels, storage)
    const after = moveStats(useMoves.getState(), useMoves.getState().moves.find(x => x.id === m.id)!).loads
    const d = before - after
    if (d > 0) toast.success(`${d} fewer truck${d > 1 ? 's' : ''} — ${after} loads`, { description: `Saves about $${(d * PER_TRUCK).toLocaleString()}` })
    else if (d < 0) toast(`${-d} more truck${d < -1 ? 's' : ''} — ${after} loads`)
  }
  const groups = COMP_ORDER.map(t => ({ t, rows: m.items.map(i => ({ i, c: compOf(s, i.compId)! })).filter(x => x.c?.type === t) })).filter(g => g.rows.length)
  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-5" data-testid="loadout">
      <Card pad={false}>
        <div className="p-4 border-b hairline flex flex-wrap items-center gap-3"><div className="font-semibold">Load-out list</div><span className="text-xs text-muted">Built from the setup on #{m.fromJobNo}. Toggle what travels; the trailers re-plan instantly.</span><div className="flex-1" /><Badge tone="accent" className="num" >{m.items.filter(i => i.travels).length}/{m.items.length} travel</Badge><Badge className="num">{st.loads} loads · {tons(st.weight)}</Badge></div>
        {groups.map(g => (
          <div key={g.t}>
            <div className="px-4 pt-4 pb-1 label">{g.t}</div>
            {g.rows.map(({ i, c }) => (
              <div key={c.id} className={cn('px-4 py-2.5 flex items-center gap-3 border-b hairline last:border-0', !i.travels && 'opacity-60')} data-testid="loadout-row">
                <input type="checkbox" className="size-5 accent-[var(--accent)]" checked={i.travels} disabled={locked(i.loadNo)} onChange={e => e.target.checked ? flip(c, true) : (setStay(c), setSpot(i.storage ?? STORAGE[1]))} aria-label={`Travels: ${c.name}`} />
                <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{c.name}{c.oversize && <span className="ml-1.5 text-[10px] text-warn font-bold">PERMIT</span>}{c.owner.kind === 'rental' && <span className="ml-1.5 text-[10px] text-info font-bold">RENTAL · {c.owner.ref}</span>}</div><div className="text-[11.5px] text-muted truncate">{c.serial} · {i.travels ? (locked(i.loadNo) ? `Load ${i.loadNo} · ${m.loads.find(l => l.no === i.loadNo)?.status}` : 'Travels') : `Stays · ${i.storage}`}</div></div>
                <div className="text-sm num text-muted w-20 text-right">{lbs(c.weightLbs)}</div>
                {i.travels ? <select className="input !w-[150px] !py-1.5 text-xs" value={i.loadNo ?? ''} disabled={locked(i.loadNo)} onChange={e => moveActions.assignLoad(m.id, c.id, +e.target.value)} aria-label="Load">{m.loads.filter(l => l.status === 'Planned' || l.no === i.loadNo).map(l => <option key={l.id} value={l.no}>Load {l.no} · {trailerOf(s, l.trailerId)?.name.split(' · ')[0]}</option>)}</select>
                  : <select className="input !w-[150px] !py-1.5 text-xs" value={i.storage} onChange={e => moveActions.setStorage(m.id, c.id, e.target.value)} aria-label="Storage">{STORAGE.map(x => <option key={x}>{x}</option>)}</select>}
              </div>
            ))}
          </div>
        ))}
      </Card>
      <div className="flex flex-col gap-3 xl:sticky xl:top-20 self-start w-full">
        <Card><div className="label mb-2">Trailers</div>{m.loads.map(l => { const tr = trailerOf(s, l.trailerId)!; const w = loadWeight(s, m, l.no); return (
          <div key={l.id} className="py-2"><div className="flex items-center gap-2 text-sm"><Truck className={cn('size-4', tr.carrier === 'Southern' ? 'text-accent' : 'text-muted')} /><span className="font-semibold">Load {l.no}</span>
            <select className="ml-auto bg-transparent text-xs text-muted text-right" value={l.trailerId} disabled={l.status !== 'Planned'} onChange={e => moveActions.setTrailer(m.id, l.id, e.target.value)} aria-label="Trailer">{s.trailers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <Progress className="mt-1.5" value={Math.min(100, w / tr.capLbs * 100)} tone={w > tr.capLbs ? 'bad' : l.status === 'Delivered' ? 'ok' : 'accent'} /><div className="text-[11px] text-muted num mt-0.5">{lbs(w)} of {lbs(tr.capLbs)} · {l.status}</div></div>) })}
        </Card>
      </div>
      <Modal open={!!stay} onClose={() => setStay(null)} title="Where does it stay?" sub={stay?.name}>
        <div className="flex flex-col gap-2" data-testid="storage-picker">{STORAGE.map(x => <button key={x} onClick={() => setSpot(x)} className={cn('card-flat p-3 text-left text-sm font-semibold flex items-center gap-2', spot === x && 'ring-2 ring-accent')}><MapPin className="size-4 text-muted" />{x}{x.includes('Bay 7') && <span className="ml-auto text-[11px] text-ok">space for 6</span>}</button>)}
          <Button variant="primary" className="mt-2" data-testid="storage-confirm" onClick={() => { if (stay) flip(stay, false, spot); setStay(null) }}>Leave it here</Button></div>
      </Modal>
    </div>
  )
}

// ---------------- Shorts ----------------
function Shorts({ s, m }: { s: MovesState; m: Move }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4" data-testid="shorts">
      {m.shorts.map(sh => (
        <Card key={sh.id}>
          <div className="flex items-start gap-2"><AlertTriangle className={cn('size-5 shrink-0', sh.status === 'Open' ? 'text-bad' : 'text-ok')} /><div className="flex-1 min-w-0"><div className="font-semibold">{sh.need}</div><div className="text-xs text-muted">{sh.type} · {lbs(sh.weightLbs)} · needed by {m.drop}</div></div><Badge tone={sh.status === 'Open' ? 'bad' : 'ok'}>{sh.status}</Badge></div>
          {sh.pick && <div className="mt-2 text-sm text-ok font-semibold">{sh.status === 'Rented' ? 'Rented from' : 'Requested from'} {sh.pick}</div>}
          <div className="mt-3 flex flex-col gap-2">{sourcesFor(s, sh, m).map((src, k) => (
            <div key={src.label} className="card-flat p-3 flex items-center gap-3"><div className={cn('size-8 rounded-full grid place-items-center text-xs font-bold', k === 0 ? 'bg-ok/15 text-ok' : 'bg-surface-3 text-muted')}>{k + 1}</div>
              <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{src.label}</div><div className="text-[11px] text-muted">{src.kind} · <b className="num">{src.mi} mi</b> · {src.cost}</div></div>
              {sh.status === 'Open' && <Button size="sm" variant={k === 0 ? 'primary' : 'secondary'} data-testid="source-btn" onClick={() => { moveActions.sourceShort(m.id, sh.id, src.label, src.kind === 'Rental'); toast.success(src.kind === 'Rental' ? `Rental requested — ${src.label}` : `Requested from ${src.label}`, { description: `${sh.need} → #${m.toJobNo} by ${m.drop}` }) }}>{src.kind === 'Rental' ? 'Rent' : 'Request'}</Button>}
            </div>))}</div>
        </Card>
      ))}
      {!m.shorts.length && <Card>Nothing short for this configuration.</Card>}
    </div>
  )
}

// ---------------- Rentals ----------------
function Rentals({ s }: { s: MovesState }) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="rentals">
      {s.rentals.map(r => { const days = Math.max(0, Math.round((Date.parse(today()) - Date.parse(r.start)) / 864e5)); const left = r.loadsTotal - r.loadsReturned; return (
        <Card key={r.id}>
          <div className="flex items-start gap-2"><div className="flex-1 min-w-0"><div className="label">Owner</div><div className="font-semibold text-lg">{r.vendor}</div></div><Badge tone={left ? 'warn' : 'ok'}>{left ? `${left} load${left > 1 ? 's' : ''} left to return` : 'Closed out'}</Badge></div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 text-sm"><Kv k="PO" v={r.po} /><Kv k="Rate" v={r.rate} /><Kv k="Days out" v={<span className={cn('num', days > r.minDays && 'text-warn font-semibold')}>{days} (min {r.minDays})</span>} /><Kv k="On crane" v={<EqRef id={r.craneId} />} /></div>
          <div className="mt-3"><div className="text-xs text-muted mb-1 num">{r.loadsReturned} of {r.loadsTotal} returned</div><Progress value={r.loadsReturned / r.loadsTotal * 100} tone={left ? 'warn' : 'ok'} /></div>
          {r.compIds.length > 0 && <div className="mt-2 text-xs text-muted">{r.compIds.length} pieces: {compOf(s, r.compIds[0])?.name.replace(/ #\d+$/, '')}</div>}
          {left > 0 && <Button size="sm" className="mt-3 w-full" onClick={() => { moveActions.returnLoad(r.id); toast.success(`Return load delivered to ${r.vendor}`) }} data-testid="return-load">Return a load</Button>}
        </Card>) })}
    </div>
  )
}

// ---------------- Components ----------------
const LOC_LABEL: Record<string, string> = { site: 'On site', yard: 'Yard', rack: 'Rack', transit: 'In transit', crane: 'On crane' }
function Components({ s, initial }: { s: MovesState; initial?: string }) {
  const [cid, setCid] = useState(initial ?? s.cranes[0].id)
  const [sel, setSel] = useState<Component | null>(null)
  const cr = s.cranes.find(c => c.id === cid)!
  const comps = s.components.filter(c => c.craneId === cid)
  const groups = COMP_ORDER.map(t => ({ t, rows: comps.filter(c => c.type === t) })).filter(g => g.rows.length)
  return (
    <div data-testid="components">
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">{s.cranes.map(c => <button key={c.id} onClick={() => setCid(c.id)} data-testid="crane-chip" className={cn('shrink-0 rounded-2xl border hairline px-4 py-2.5 text-left', c.id === cid ? 'bg-surface-3' : 'bg-surface hover:bg-surface-2')}><div className="text-sm font-semibold">Crane {c.unit} · {c.model.replace('Liebherr ', '')}</div><div className="text-[11px] text-muted">{c.kind} · {s.components.filter(x => x.craneId === c.id).length} components</div></button>)}</div>
      <div className="text-sm text-muted mb-3"><EqRef id={cr.id} /> · {cr.kind} · now at <b className="text-ink">{cr.site}</b> · {lbs(comps.reduce((a, c) => a + c.weightLbs, 0))} of components</div>
      <div className="grid lg:grid-cols-2 gap-4">{groups.map(g => (
        <Card key={g.t} pad={false}><div className="px-4 pt-4 pb-2 flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: TYPE_COLOR[g.t] }} /><span className="font-semibold">{g.t}</span><span className="text-xs text-muted ml-auto num">{g.rows.length} · {lbs(g.rows.reduce((a, c) => a + c.weightLbs, 0))}</span></div>
          {g.rows.map(c => <button key={c.id} onClick={() => setSel(c)} data-testid="comp-row" className="w-full text-left px-4 py-2.5 border-t hairline flex items-center gap-3 hover:bg-surface-2">
            <div className="min-w-0 flex-1"><div className="text-sm font-semibold truncate">{c.name}</div><div className="text-[11.5px] text-muted truncate">{LOC_LABEL[c.loc.kind]} · {c.loc.kind === 'transit' ? `on ${trailerOf(s, c.loc.ref)?.name}` : c.loc.ref}</div></div>
            <OwnerBadge s={s} c={c} />{c.status !== 'OK' && <Badge tone={c.status === 'Damaged' ? 'bad' : 'warn'}>{c.status}</Badge>}
          </button>)}
        </Card>))}</div>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name} sub={sel && `${sel.type} · ${sel.serial}`}>{sel && <CompDetail s={s} c={sel} />}</Sheet>
    </div>
  )
}
function OwnerBadge({ s, c }: { s: MovesState; c: Component }) {
  if (c.owner.kind === 'rental') return <Badge tone="info">Rental · {c.owner.ref}</Badge>
  if (c.owner.kind === 'crane' && c.owner.ref !== c.craneId) return <Badge tone="accent">Crane {s.cranes.find(x => x.id === c.owner.ref)?.unit}</Badge>
  return <Badge>This crane</Badge>
}
function CompDetail({ s, c }: { s: MovesState; c: Component }) {
  const rental = s.rentals.find(r => r.id === c.rentalId)
  const onMove = s.moves.find(m => m.items.some(i => i.compId === c.id && i.travels) && m.status !== 'Complete')
  return (
    <div className="flex flex-col gap-4" data-testid="comp-detail">
      <div className="grid grid-cols-2 gap-x-4"><Kv k="Weight" v={lbs(c.weightLbs)} /><Kv k="Serial" v={c.serial} /><Kv k="Owner" v={<OwnerBadge s={s} c={c} />} /><Kv k="Status" v={c.status} /><Kv k="Location" v={`${LOC_LABEL[c.loc.kind]} · ${c.loc.kind === 'transit' ? trailerOf(s, c.loc.ref)?.name : c.loc.ref}`} /><Kv k="Last inspected" v={c.inspected} />{c.oversize && <Kv k="Permit" v={<span className="text-warn font-semibold">Oversize load</span>} />}</div>
      <div><div className="label mb-2">Compatible with</div><div className="flex flex-wrap gap-1.5" data-testid="compat">{c.compat.map(x => <Badge key={x} tone="ok">{x}</Badge>)}</div><div className="text-[11px] text-muted mt-1.5">Set once per model · confirmed by Shop</div></div>
      {rental && <Card className="!p-4"><div className="label">Rental</div><div className="font-semibold">{rental.vendor} · {rental.po}</div><div className="text-sm text-muted">{rental.rate} · {rental.loadsReturned} of {rental.loadsTotal} loads returned</div></Card>}
      {onMove && <div className="text-sm">On move to <b>#{onMove.toJobNo} {onMove.toProject}</b> · Load {onMove.items.find(i => i.compId === c.id)?.loadNo}</div>}
      <div className="text-[11px] text-muted flex items-center gap-1"><Weight className="size-3" />Location from last phone check-in{c.loc.kind === 'transit' ? ' · live from Samsara when connected' : ''}</div>
    </div>
  )
}

// ---------------- Planner ----------------
function Planner({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const s = useMoves()
  const db = useStore(st => st.db)
  const busy = new Set(s.moves.filter(m => m.status !== 'Complete').map(m => m.craneId))
  const [craneId, setCraneId] = useState('')
  const [jobId, setJobId] = useState('')
  const [project, setProject] = useState('')
  const [jobNo, setJobNo] = useState('')
  const [pickup, setPickup] = useState(addDays(today(), 3))
  const [drop, setDrop] = useState(addDays(today(), 5))
  const jobs = useMemo(() => db.jobs.filter(j => j.startDate >= today() && j.status !== 'Complete').sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 40), [db.jobs])
  useEffect(() => { if (open) { const c = s.cranes.find(c => !busy.has(c.id)); setCraneId(c?.id ?? s.cranes[0].id) } }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  const cr = s.cranes.find(c => c.id === craneId)
  const known = db.jobs.find(x => x.jobNo === jobNo.trim().replace(/^#/, ''))
  const planErr = busy.has(craneId) ? `Crane ${cr?.unit ?? ''} is already mid-move — finish that move first` : !project.trim() ? 'Project name is required' : !jobNo.trim() ? 'Job number is required' : !known ? `No job #${jobNo.trim()} — pick a job from the list or enter a real job number` : !pickup || !drop ? 'Pick both dates' : pickup < today() ? 'Pickup date is in the past' : drop < pickup ? 'Drop-off is before pickup' : ''
  const ok = !planErr
  const create = () => {
    const j = db.jobs.find(x => x.id === jobId); const site = j ? db.sites.find(x => x.id === j.siteId) : undefined
    const id = moveActions.createMove({ craneId, toProject: project.trim(), toJobNo: jobNo.trim(), pickup, drop, toLat: site?.lat ?? (cr!.lat + 0.6), toLng: site?.lng ?? (cr!.lng + 0.5) })
    const m = useMoves.getState().moves.find(x => x.id === id)!
    toast.success(`Move planned — ${m.loads.length} loads`, { description: `Setup copied from #${m.fromJobNo}. Review the load-out list.` })
    onCreated(id)
  }
  return (
    <Modal open={open} onClose={onClose} title="Plan the next move" sub="Four fields. Everything else carries forward from the current project." width={560}>
      <div className="flex flex-col gap-3" data-testid="planner">
        <Field label="Crane"><div className="grid grid-cols-2 gap-2">{s.cranes.map(c => <button key={c.id} onClick={() => setCraneId(c.id)} data-testid="planner-crane" className={cn('card-flat p-3 text-left', craneId === c.id && 'ring-2 ring-accent')}><div className="text-sm font-semibold">Crane {c.unit} · {c.kind}</div><div className="text-[11px] text-muted truncate">{c.model} · {busy.has(c.id) ? 'move in progress' : c.site}</div></button>)}</div></Field>
        {cr && <div className="text-xs text-muted -mt-1">Current project: <b className="text-ink">#{cr.jobNo} {cr.site}</b> · {s.components.filter(x => x.craneId === cr.id).length} components will be copied</div>}
        <Field label="New project"><select className="input" data-testid="planner-job" value={jobId} onChange={e => { const j = db.jobs.find(x => x.id === e.target.value); setJobId(e.target.value); if (j) { setProject(j.name); setJobNo(j.jobNo); setPickup(addDays(j.startDate, -2) < today() ? today() : addDays(j.startDate, -2)); setDrop(addDays(j.startDate, -1) < today() ? addDays(today(), 1) : addDays(j.startDate, -1)) } }}><option value="">Pick a scheduled job… (or type below)</option>{jobs.map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {j.name} · {j.startDate}</option>)}</select></Field>
        <div className="grid grid-cols-[1fr_130px] gap-2"><Field label="Project name"><input className="input" data-testid="planner-project" value={project} onChange={e => setProject(e.target.value)} placeholder="e.g. OG&E Mustang — stator set" /></Field><Field label="Job number"><input className="input" data-testid="planner-jobno" value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="10xxx" /></Field></div>
        <div className="grid grid-cols-2 gap-2"><Field label="Pickup date"><input type="date" className="input" data-testid="planner-pickup" value={pickup} onChange={e => setPickup(e.target.value)} /></Field><Field label="Drop-off date"><input type="date" className="input" data-testid="planner-drop" value={drop} onChange={e => setDrop(e.target.value)} /></Field></div>
        {planErr && <div className="text-xs text-warn" data-testid="planner-err">{planErr}</div>}
        <Button variant="primary" size="lg" disabled={!ok} onClick={create} data-testid="planner-create">Build load-out</Button>
      </div>
    </Modal>
  )
}

/** Hired outside cranes on the jobs this move runs between (cover / assist) — shown on the move board too. */
function MoveOutside({ jobNos }: { jobNos: string[] }) {
  const db = useStore(st => st.db), open = useStore(st => st.open)
  const rows = db.jobs.filter(j => jobNos.includes(j.jobNo)).flatMap(j => (j.outside ?? []).filter(o => o.status !== 'Done').map(o => ({ j, o })))
  if (!rows.length) return null
  return <div className="mt-3 flex flex-wrap gap-2" data-testid="move-outside">{rows.map(({ j, o }) => <button key={o.id} onClick={() => open({ type: 'job', id: j.id })} data-testid="move-outside-item" className="rounded-2xl border-2 border-dashed border-[#7c3aed]/40 px-3 py-2 min-h-[44px] text-left flex items-center gap-2 text-sm"><OutsideTag /><span className="font-semibold">{vendorOf(db, o.vendorId)?.name ?? 'Vendor'} {o.size}</span><span className="text-muted">· {o.role} · #{j.jobNo} · {o.from === o.to ? o.from.slice(5) : `${o.from.slice(5)}–${o.to.slice(5)}`}{o.hours ? ` ${fmtHours(o.hours)}` : ''}</span></button>)}</div>
}
