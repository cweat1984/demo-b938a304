/** Trucks & trailers on a job: dispatch/ops pick semis, pickups and trailers with a conflict check (another live job on overlapping
 *  dates, or the unit is down). Crane-config trailers stay listed; everything goes through commit → audit. */
import { toast } from 'sonner'
import { useMemo, useState } from 'react'
import { Truck, Plus, X, AlertTriangle } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId } from '../data/logic'
import { Sheet, confirmChoice } from './ui'
import { cn, addDays, fmtDate } from '../lib/util'
import { moveInBy, downEnd } from '../data/rig'

const CATS: T.EquipCategory[] = ['Semi', 'Trailer', 'Pickup', 'Support']
/** Days a unit is needed on a job (dive2 M7: book trucks for move-in / move-out, not always the whole span). */
export const unitWindow = (j: T.Job, id: string) => j.unitDays?.[id] ?? { from: j.startDate, to: j.endDate }
const overlapsW = (a: { from: string; to: string }, b: { from: string; to: string }) => a.from <= b.to && b.from <= a.to
export function unitConflict(db: T.DB, job: T.Job, id: string): string | null {
  const u = byId(db.equipment, id); if (!u) return null
  if (u.status === 'Out of Service' || u.status === 'Maintenance') return `${u.status}`
  const mine = unitWindow(job, id)
  const other = db.jobs.find(j => j.id !== job.id && j.status !== 'Complete' && j.trailerIds.includes(id) && overlapsW(unitWindow(j, id), mine))
  return other ? `On Job #${other.jobNo} ${unitWindow(other, id).from.slice(5)}–${unitWindow(other, id).to.slice(5)}` : null
}
export default function JobUnits({ job }: { job: T.Job }) {
  const db = useStore(s => s.db), role = useStore(s => s.session?.role)
  const canEdit = ['owner', 'ops', 'dispatch', 'branch'].includes(role ?? '')
  const [open, setOpen] = useState(false), [cat, setCat] = useState<T.EquipCategory>('Semi')
  const [daysFor, setDaysFor] = useState<string | null>(null)
  const pick = async (e: T.Equipment, why: string | null) => {
    if (e.status === 'Out of Service' || e.status === 'Maintenance') { const r = await confirmChoice(`${e.category} ${e.unit} is ${e.status}`, 'It is down in the shop. Assign it anyway? It will show red on the job until it is released.', [{ label: 'Pick another unit', value: false, tone: 'primary' }, { label: `Assign anyway (${e.status})`, value: true, tone: 'danger' }]); if (!r?.value) return }
    actions.setJobUnits(job.id, [...job.trailerIds, e.id], why ?? undefined); setOpen(false)
  }
  const plans = job.rig ?? []
  const moveIn = plans.length ? { from: plans.map(moveInBy).sort()[0], to: job.startDate } : { from: addDays(job.startDate, -1), to: job.startDate }
  const moveOut = plans.length ? { from: job.endDate, to: plans.map(downEnd).sort().slice(-1)[0] } : { from: job.endDate, to: addDays(job.endDate, 1) }
  const units = job.trailerIds.map(id => byId(db.equipment, id)).filter(Boolean) as T.Equipment[]
  const pool = useMemo(() => db.equipment.filter(e => e.category === cat && !job.trailerIds.includes(e.id)).map(e => ({ e, why: unitConflict(db, job, e.id) })).sort((a, b) => Number(!!a.why) - Number(!!b.why) || a.e.unit.localeCompare(b.e.unit)), [db, job, cat])
  return <div className="card p-5" data-testid="job-units">
    <div className="flex items-center gap-2 mb-3"><Truck className="size-5 text-accent" /><div className="font-semibold flex-1">Trucks & trailers</div>
      {canEdit && <button data-testid="units-add" onClick={() => setOpen(true)} className="h-10 pointer-coarse:h-[44px] px-3.5 rounded-full bg-surface-2 font-semibold text-sm inline-flex items-center gap-1.5"><Plus className="size-4" />Assign</button>}</div>
    {units.length ? <div className="flex flex-wrap gap-2">{units.map(u => { const w = unitConflict(db, job, u.id); return (
      <span key={u.id} data-testid="unit-chip" className={cn('inline-flex items-center gap-2 rounded-full pl-3 pr-1 h-10 text-sm font-semibold', w ? (/Out of Service|Maintenance/.test(w) ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn') : 'bg-surface-2')}>
        {w && <AlertTriangle className="size-3.5" />}{u.category} {u.unit}<span className="text-xs font-normal text-muted">{u.type}</span>
        <button data-testid="unit-days" onClick={() => canEdit && setDaysFor(u.id)} disabled={!canEdit} className="text-xs font-normal underline decoration-dotted min-h-9 px-1">{job.unitDays?.[u.id] ? `${fmtDate(job.unitDays[u.id].from)}–${fmtDate(job.unitDays[u.id].to)}` : 'whole job'}</button>
        {canEdit && <button aria-label={`Remove ${u.unit}`} data-testid="unit-remove" onClick={() => actions.setJobUnits(job.id, job.trailerIds.filter(x => x !== u.id))} className="size-9 grid place-items-center rounded-full hover:bg-bad/15"><X className="size-4" /></button>}
      </span>) })}</div> : <div className="text-sm text-muted">No trucks or trailers assigned yet.{canEdit ? ' Tap Assign to add a semi, lowboy or pickup.' : ''}</div>}
    <Sheet open={!!daysFor} onClose={() => setDaysFor(null)} title="Days needed" sub={daysFor ? `${byId(db.equipment, daysFor)?.unit} on Job #${job.jobNo}` : ''}>
      {daysFor && <div className="flex flex-col gap-2" data-testid="unit-days-sheet">
        {([['Whole job', null], ['Move-in only', moveIn], ['Move-out only', moveOut]] as const).map(([l, d]) => <button key={l} data-testid="unit-days-opt" onClick={() => { actions.setUnitDays(job.id, daysFor, d ? { ...d } : null); setDaysFor(null) }} className="min-h-12 rounded-xl border hairline px-3 text-left font-semibold">{l}{d ? <span className="text-xs text-muted font-normal"> · {fmtDate(d.from)} – {fmtDate(d.to)}</span> : null}</button>)}
        <div className="flex gap-2 items-end"><label className="flex-1 text-xs">From<input type="date" className="input" id="ud-from" defaultValue={unitWindow(job, daysFor).from} /></label><label className="flex-1 text-xs">To<input type="date" className="input" id="ud-to" defaultValue={unitWindow(job, daysFor).to} /></label>
          <button data-testid="unit-days-custom" className="h-[44px] px-4 rounded-xl bg-accent text-accent-ink font-semibold" onClick={() => { const f = (document.getElementById('ud-from') as HTMLInputElement).value, t = (document.getElementById('ud-to') as HTMLInputElement).value; if (!f || !t) { toast.error('Pick both dates'); return } if (t < f) { toast.error('“To” is before “From”'); return } actions.setUnitDays(job.id, daysFor, { from: f, to: t }); setDaysFor(null) }}>Save</button></div>
      </div>}
    </Sheet>
    <Sheet open={open} onClose={() => setOpen(false)} title={`Assign to Job #${job.jobNo}`} sub={`${job.startDate} → ${job.endDate} · conflicts are flagged`}>
      <div className="flex gap-1.5 mb-3 flex-wrap">{CATS.map(c => <button key={c} data-testid={`units-cat-${c}`} onClick={() => setCat(c)} className={cn('h-10 pointer-coarse:h-[44px] px-3.5 rounded-full text-sm font-semibold', cat === c ? 'bg-ink text-surface' : 'bg-surface-2 text-muted')}>{c === 'Support' ? 'Support' : `${c}s`}</button>)}</div>
      <div className="flex flex-col gap-1.5">{pool.length ? pool.map(({ e, why }) => (
        <button key={e.id} data-testid="units-pick" data-unit={e.id} data-conflict={why ? '1' : ''} onClick={() => void pick(e, why)}
          className="min-h-12 rounded-xl border hairline px-3 py-2 text-left flex items-center gap-3 hover:bg-surface-2">
          <span className="flex-1 min-w-0"><span className="block font-semibold">{e.category} {e.unit} · {e.type}</span><span className="block text-xs text-muted">{e.make} {e.model} · {e.yard}</span></span>
          {why ? <span className="text-xs font-semibold text-warn">{why}</span> : <span className="text-xs font-semibold text-ok">Free</span>}
        </button>)) : <div className="text-sm text-muted p-3">No {cat.toLowerCase()}s left to add.</div>}</div>
    </Sheet>
  </div>
}
