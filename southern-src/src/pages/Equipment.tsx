import { useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { Search, Map as MapIcon, LayoutGrid, Radio, Wrench } from 'lucide-react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { inScope, serviceStatus, pingAgeMin, byId, jobsOn, customerOf } from '../data/logic'
import { cn, today, timeAgo } from '../lib/util'
import { PageHeader, Segmented, Badge, DemoTag } from '../components/ui'
import { EqStatus, DivisionChip } from '../components/bits'
import FleetMap from '../components/FleetMap'
import { useMoves } from '../data/moves'
import { OutsideTag } from '../components/OutsideCranes'
import { vendorOf, outsidePhase, fmtHours, craneDay, craneJobsOn, jobCranes, PHASE_LABEL } from '../data/rig'
import { PhaseBadge } from '../components/JobRig'

const CATS: { v: T.EquipCategory | 'all'; l: string }[] = [{ v: 'Crane', l: 'Cranes' }, { v: 'Semi', l: 'Trucks' }, { v: 'Trailer', l: 'Trailers' }, { v: 'Pickup', l: 'Pickups' }, { v: 'Support', l: 'Support' }, { v: 'all', l: 'All' }]

export default function Equipment() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const [cat, setCat] = useState<T.EquipCategory | 'all'>('Crane')
  const [outside, setOutside] = useState(false)
  const [view, setView] = useKeep<'grid' | 'map'>('equipment:view', 'grid')
  const [status, setStatus] = useKeep<'all' | T.EquipStatus>('equipment:status', 'all')
  const [q, setQ] = useKeep('equipment:q', '')
  const all = db.equipment.filter(e => inScope(e, f))
  // Keep Equipment in sync with the Crane Moves board: a crane on an active move shows where it's headed.
  const mv = useMoves()
  const moving = new Map(mv.moves.filter(m => m.status === 'In progress').map(m => [mv.cranes.find(c => c.id === m.craneId)?.unit, m]))
  const list = useMemo(() => all.filter(e => (cat === 'all' || e.category === cat) && (status === 'all' || e.status === status) && (!q || `${e.unit} ${e.code} ${e.make} ${e.model} ${e.type}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.unit.localeCompare(b.unit, undefined, { numeric: true })), [all, cat, status, q])
  const onJob = new Map(jobsOn(db, today()).flatMap(j => [...jobCranes(j).map(c => [c, j]), ...j.trailerIds.map(t => [t, j])] as [string | undefined, T.Job][]))
  const statuses: T.EquipStatus[] = ['Available', 'On Job', 'In Transit', 'Maintenance', 'Out of Service']
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader eyebrow={<span className="inline-flex items-center gap-2"><Radio className="size-3.5 text-ok" />Samsara telematics <DemoTag /></span>} title="Equipment" sub={`${all.length} units · ${all.filter(e => e.status === 'Out of Service' || e.status === 'Maintenance').length} in the shop`} actions={<Segmented value={view} onChange={setView} options={[{ value: 'grid', label: <LayoutGrid className="size-4" /> }, { value: 'map', label: <MapIcon className="size-4" /> }]} />} />
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <button data-testid="equip-outside-toggle" onClick={() => setOutside(!outside)} className={cn('h-10 pointer-coarse:h-[44px] px-3.5 rounded-full text-sm font-semibold inline-flex items-center gap-2 border-2 border-dashed border-[#7c3aed]/40', outside ? 'bg-[#7c3aed] text-white' : '')}>Outside cranes · {db.jobs.reduce((n, j) => n + (j.outside ?? []).filter(o => o.to >= today() && o.status !== 'Done').length, 0)}</button>
        <Segmented value={cat} onChange={setCat} options={CATS.map(c => ({ value: c.v, label: c.l, count: c.v === 'all' ? all.length : all.filter(e => e.category === c.v).length }))} />
        <div className="relative w-full sm:w-64 sm:ml-auto"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Unit, make, model" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <div className="flex gap-1.5 flex-wrap mb-5">{(['all', ...statuses] as const).map(s => <button key={s} onClick={() => setStatus(s)} className={cn('tap-chip rounded-full px-3 py-1 text-xs font-semibold transition', status === s ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')}>{s === 'all' ? 'Any status' : s} <span className="opacity-60 num">{s === 'all' ? '' : all.filter(e => e.status === s && (cat === 'all' || e.category === cat)).length}</span></button>)}</div>
      {outside ? <OutsideList /> : view === 'map' ? <div className="card p-0 overflow-hidden"><FleetMap units={list} height="70vh" onSelect={u => open({ type: 'equipment', id: u.id })} /></div> : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {list.map(e => { const svc = serviceStatus(e); const j = onJob.get(e.id) ?? (e.category === 'Crane' ? craneDay(db, e.id, today())?.job : undefined); return (
            <button key={e.id} onClick={() => open({ type: 'equipment', id: e.id })} className="card p-5 text-left hover:-translate-y-0.5 transition flex flex-col gap-3" data-testid="equip-card">
              <div className="flex items-start justify-between gap-2">
                <div><div className="display text-3xl font-semibold leading-none num">{e.unit}</div><div className="text-xs text-muted mt-1.5">{e.capacity ? `${e.capacity}t · ` : ''}{e.make} {e.model}</div></div>
                <div className="flex flex-col items-end gap-1"><EqStatus s={e.status} />{(() => { const cd = e.category === 'Crane' ? craneDay(db, e.id, today()) : null; return cd && cd.phase !== 'work' ? <span data-testid="equip-rig"><PhaseBadge phase={cd.phase}>{PHASE_LABEL[cd.phase]} #{cd.job.jobNo}</PhaseBadge></span> : null })()}{moving.get(e.unit) && <span data-testid="equip-moving"><Badge tone="accent">Moving → #{moving.get(e.unit)!.toJobNo}</Badge></span>}</div>
              </div>
              <div className="text-sm min-h-5 truncate">{j ? <>#{j.jobNo} · {customerOf(db, j).name}{(() => { const n = e.category === 'Crane' ? craneJobsOn(db, e.id, today()).length : 0; return n > 1 ? <b data-testid="equip-multi" className="text-info"> +{n - 1} more today</b> : null })()}</> : e.route ? <>→ {e.route.toName}</> : <span className="text-muted">{e.status === 'Available' ? 'In the yard' : e.status === 'Maintenance' || e.status === 'Out of Service' ? 'In the shop' : e.yard}</span>}</div>
              <div className="flex items-center gap-2 text-[11px] text-muted pt-3 border-t hairline">
                <DivisionChip id={e.divisionId} /><span>·</span><span>{byId(db.branches, e.branchId)?.code}</span>
                {(() => { const d = e.annualInspection ? Math.round((new Date(e.annualInspection + 'T12:00').getTime() - Date.now()) / 864e5) : 999; return d < 0 ? <Badge tone="bad">Annual overdue</Badge> : d <= 30 ? <Badge tone="warn" data-testid="annual-chip">Annual in {d}d</Badge> : null })()}
                <span className="ml-auto inline-flex items-center gap-1">{svc.overdue ? <Badge tone="bad"><Wrench className="size-3" />Service overdue</Badge> : svc.dueSoon ? <Badge tone="warn">Service soon</Badge> : <span className={cn(pingAgeMin(e) > 120 && 'text-warn')}>GPS {timeAgo(e.lastPing)}</span>}</span>
              </div>
            </button>) })}
        </div>
      )}
    </div>
  )
}

/** Hired outside cranes booked on our jobs (not our fleet — not counted in fleet numbers) + the crane company list. */
function OutsideList() {
  const db = useStore(s => s.db), open = useStore(s => s.open)
  const rows = db.jobs.flatMap(j => (j.outside ?? []).map(o => ({ j, o }))).filter(x => x.o.to >= today()).sort((a, b) => a.o.from.localeCompare(b.o.from))
  return <div className="flex flex-col gap-5" data-testid="outside-list">
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{rows.map(({ j, o }) => <button key={o.id} data-testid="outside-card" onClick={() => open({ type: 'job', id: j.id })} className="card p-5 text-left flex flex-col gap-2 border-2 border-dashed border-[#7c3aed]/40">
      <div className="flex items-center gap-2"><OutsideTag /><span className="text-xs font-semibold text-muted">{o.status}</span></div>
      <div className="display text-2xl font-semibold leading-tight">{o.size} <span className="text-base text-muted font-normal">{o.type}</span></div>
      <div className="text-sm font-semibold">{vendorOf(db, o.vendorId)?.name ?? 'Vendor'}</div>
      <div className="text-xs text-muted">#{j.jobNo} · {customerOf(db, j).name} · {o.role}</div>
      <div className="text-xs"><span className="num">{o.from === o.to ? o.from : `${o.from} → ${o.to}`}</span>{o.hours ? ` · ${fmtHours(o.hours)}` : ''} <span className="sr-only">{outsidePhase(o)}</span></div>
    </button>)}{!rows.length && <div className="text-sm text-muted">No outside cranes booked.</div>}</div>
    <div className="card p-4" data-testid="crane-vendors"><div className="label mb-2">Crane companies we hire</div>
      {(db.craneVendors ?? []).map(v => <div key={v.id} data-testid="crane-vendor" className="flex items-center gap-3 py-2 border-b hairline last:border-0 text-sm"><span className="font-semibold flex-1 min-w-0 truncate">{v.name}</span><span className="text-muted hidden sm:block">{v.contact}</span>{v.phone && <a href={`tel:${v.phone.replace(/[^0-9+]/g, '')}`} className="h-10 pointer-coarse:h-[44px] px-3 rounded-full bg-surface-2 text-xs font-semibold inline-flex items-center">{v.phone}</a>}</div>)}
      <div className="text-[11px] text-muted mt-2">Add a new company from any job: Hire a crane → + Add a new company.</div></div>
  </div>
}
