/** Rig up & rig down per crane on a job. Dispatch / ops / branch / owner edit; everyone else (and guests) read-only.
 *  Start moving in by = Hook ready − rig-up days − travel days. Colors follow the Annual sheet: dark green = moving & rigging, light green = working. */
import { useMemo, useState } from 'react'
import { Anchor, Plus, AlertTriangle, Pencil, X, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { useStore, actions, annualExpired } from '../data/store'
import { byId } from '../data/logic'
import { Sheet, Button, Field, confirmChoice } from './ui'
import { cn, fmtDate, range, addDays } from '../lib/util'
import OutsideCranes from './OutsideCranes'
import { useSchedStyle, phaseCat, outOfState } from '../data/schedColors'
import { SchedLegend } from './SchedLegend'
import { craneCount, outsideOf } from '../data/rig'
import { firstClash, sharedDays, hoursOf, fmtHours, craneBusy, jobCranes, planFor, defaultPlan, checkPlan, moveInBy, rigUpDates, downEnd, fmtDown, upDaysOf, phaseOn, rigWindow, PHASE_LABEL, type RigPhase } from '../data/rig'

export const RIG_EDITORS = ['owner', 'ops', 'dispatch', 'branch']
const fd = (d: string) => fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })

export function RigStrip({ job, craneId }: { job: T.Job; craneId: string }) {
  const st = useSchedStyle(); const db = useStore(s => s.db)
  const p = planFor(job, craneId); if (!p) return null
  const w = rigWindow(p); const from = w.from < job.startDate ? w.from : job.startDate; const to = downEnd(p) > job.endDate ? downEnd(p) : job.endDate
  const days = range(from, to).slice(0, 60); const crane = db.equipment.find(x => x.id === craneId); const oos = outOfState(db, job, crane?.branchId)
  return <div data-testid="rig-strip">
    <div className="flex gap-[2px]">{days.map(d => { const ph = phaseOn(job, craneId, d); return <span key={d} data-phase={ph ?? ''} title={`${fd(d)} · ${ph ? PHASE_LABEL[ph] : 'open'}`} data-cat={ph ? (ph === 'work' && oos ? 'outstate' : phaseCat(ph)) : 'open'} className={cn('h-6 flex-1 min-w-[3px] rounded-[3px]', !ph && 'bg-surface-3')} style={ph ? st(ph === 'work' && oos ? 'outstate' : phaseCat(ph)) : undefined} /> })}</div>
    <div className="flex justify-between text-[11px] text-muted mt-1"><span>{fmtDate(days[0])}</span><span>{fmtDate(days[days.length - 1])}</span></div>
    <SchedLegend className="mt-1" cats={['travel', 'moving', 'working', ...(oos ? ['outstate' as const] : [])]} />
  </div>
}

export function PhaseBadge({ phase, children }: { phase: RigPhase; children?: React.ReactNode }) {
  const st = useSchedStyle()
  return <span data-testid="rig-phase" data-phase={phase} data-cat={phaseCat(phase)} className="inline-flex items-center gap-1 rounded-full px-2 h-6 text-[11px] font-semibold" style={st(phaseCat(phase))}>{children ?? PHASE_LABEL[phase]}</span>
}

/** Hours this crane works on this job (optional) + the other jobs it does the same day. Overlaps warn, never block. */
function CraneHours({ job, craneId, canEdit }: { job: T.Job; craneId: string; canEdit: boolean }) {
  const db = useStore(s => s.db)
  const h = hoursOf(job, craneId); const [ed, setEd] = useState(false)
  const [from, setFrom] = useState(h?.from ?? '07:00'), [to, setTo] = useState(h?.to ?? '12:00')
  const shared = sharedDays(db, job, craneId)
  const bad = !(from && to && from < to)
  const save = (x: { from: string; to: string } | null) => { const clash = x ? db.jobs.find(o => o.id !== job.id && jobCranes(o).includes(craneId) && o.startDate <= job.endDate && job.startDate <= o.endDate && (() => { const oh = hoursOf(o, craneId); return oh && x.from < oh.to && oh.from < x.to })()) : undefined
    actions.setCraneHours(job.id, craneId, x, clash ? `time overlaps Job #${clash.jobNo}` : undefined); setEd(false); if (clash) toast.warning(`Saved — overlaps Job #${clash.jobNo} ${fmtHours(hoursOf(clash, craneId))}`) }
  return <div className="flex flex-col gap-1.5" data-testid="crane-hours-box">
    <div className="flex items-center gap-2 flex-wrap text-sm"><span className="text-muted">Crane hours on this job:</span><b data-testid="crane-hours">{fmtHours(h)}</b>
      {canEdit && !ed && <button data-testid="crane-hours-edit" onClick={() => setEd(true)} className="h-8 pointer-coarse:h-[44px] px-3 rounded-full bg-surface-2 text-xs font-semibold">Set hours</button>}</div>
    {ed && <div className="flex flex-wrap items-center gap-1.5" data-testid="crane-hours-form">
      <input type="time" className="input w-[7.5rem]" data-testid="crane-hours-from" value={from} onChange={e => setFrom(e.target.value)} /><span>–</span><input type="time" className="input w-[7.5rem]" data-testid="crane-hours-to" value={to} onChange={e => setTo(e.target.value)} />
      {([['AM', '07:00', '12:00'], ['PM', '12:00', '17:00']] as const).map(([l, a, b]) => <button key={l} data-testid={`crane-hours-${l.toLowerCase()}`} onClick={() => { setFrom(a); setTo(b) }} className="h-10 pointer-coarse:h-[44px] px-3 rounded-full bg-surface-2 text-xs font-semibold">{l}</button>)}
      <button data-testid="crane-hours-all" onClick={() => save(null)} className="h-10 pointer-coarse:h-[44px] px-3 rounded-full bg-surface-2 text-xs font-semibold">All day</button>
      <Button size="sm" variant="primary" data-testid="crane-hours-save" disabled={bad} onClick={() => save({ from, to })}>Save</Button>
      {bad && <span className="text-xs text-bad font-semibold" data-testid="crane-hours-error">End must be after start</span>}
    </div>}
    {shared.map(x => <div key={x.d + x.text} data-testid="crane-shared" data-clash={x.clash ? '1' : ''} className={cn('text-xs font-semibold flex gap-1.5', x.clash ? 'text-warn' : 'text-info')}>{x.clash && <AlertTriangle className="size-3.5 shrink-0" />}{x.text}</div>)}
  </div>
}
function RemoveCrane({ job, craneId }: { job: T.Job; craneId: string }) {
  const db = useStore(s => s.db)
  if (craneId === job.craneId) return null
  return <button data-testid="rig-crane-remove" aria-label="Remove crane from job" onClick={async () => { const u = byId(db.equipment, craneId)?.unit ?? ''; const ok = await confirmChoice(`Remove crane ${u} from Job #${job.jobNo}?`, 'Its rig plan and hours go with it. The crew is told.', [{ label: `Remove crane ${u}`, value: 1, tone: 'danger' as const }]); if (!ok) return; const snap = actions.removeJobCrane(job.id, craneId); toast.success(`Crane ${u} removed`, { duration: 10000, action: { label: 'Undo', onClick: () => actions.restoreJobCranes(job.id, snap) } }) }} className="size-10 pointer-coarse:size-[44px] grid place-items-center rounded-full hover:bg-bad/15 text-muted"><X className="size-4" /></button>
}
function CraneRig({ job, craneId, canEdit, onEdit, compact }: { job: T.Job; craneId: string; canEdit: boolean; onEdit: () => void; compact?: boolean }) {
  const db = useStore(s => s.db)
  const crane = byId(db.equipment, craneId); const p = planFor(job, craneId)
  const chk = useMemo(() => p ? checkPlan(db, job, p) : null, [db, job, p])
  if (!p) return <div data-testid="rig-row" data-crane={craneId} className="rounded-2xl border hairline p-3 flex items-center gap-3">
    <div className="flex-1 min-w-0"><div className="font-semibold">Crane {crane?.unit ?? '—'} <span className="text-xs text-muted font-normal">{crane?.model}{craneId === job.craneId && jobCranes(job).length > 1 ? ' · lead' : ''}</span></div><div className="text-sm text-muted">No rig-up / rig-down days yet.</div><div className="mt-1.5"><CraneHours job={job} craneId={craneId} canEdit={canEdit} /></div></div>
    {canEdit && <Button size="sm" data-testid="rig-plan-add" icon={<Plus className="size-4" />} onClick={onEdit}>Plan rig days</Button>}{canEdit && <RemoveCrane job={job} craneId={craneId} />}
  </div>
  const ups = rigUpDates(p)
  return <div data-testid="rig-row" data-crane={craneId} className="rounded-2xl border hairline p-3 flex flex-col gap-3">
    <div className="flex items-center gap-2"><div className="font-semibold flex-1 min-w-0">Crane {crane?.unit ?? '—'} <span className="text-xs text-muted font-normal">{crane?.model}</span></div>
      {canEdit && <button data-testid="rig-edit" onClick={onEdit} className="h-10 pointer-coarse:h-[44px] px-3.5 rounded-full bg-surface-2 font-semibold text-sm inline-flex items-center gap-1.5"><Pencil className="size-4" />Edit</button>}{canEdit && <RemoveCrane job={job} craneId={craneId} />}</div>
    <CraneHours job={job} craneId={craneId} canEdit={canEdit} />
    <div className={cn('grid gap-2 text-sm', compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4')}>
      <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[11px] text-muted font-semibold uppercase tracking-wide">Start moving in by</div><div data-testid="rig-movein-by" className="font-semibold">{fd(moveInBy(p))}</div><div className="text-[11px] text-muted">{p.travelDays} travel day{p.travelDays === 1 ? '' : 's'}{p.plannedMoveIn ? ` · planned ${fmtDate(p.plannedMoveIn)}` : ''}</div></div>
      <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[11px] text-muted font-semibold uppercase tracking-wide">Rig up</div><div data-testid="rig-up" className="font-semibold">{upDaysOf(p)} day{upDaysOf(p) === 1 ? '' : 's'}</div><div className="text-[11px] text-muted">{ups.length ? (ups.length > 3 ? `${fmtDate(ups[0])} – ${fmtDate(ups[ups.length - 1])}` : ups.map(d => fmtDate(d)).join(', ')) : '—'}</div></div>
      <div className="rounded-xl bg-[#1f6b3a]/10 p-2.5 ring-1 ring-[#1f6b3a]/30"><div className="text-[11px] text-muted font-semibold uppercase tracking-wide">Hook ready</div><div data-testid="rig-hook" className="font-semibold">{fd(p.hookReady)}</div><div className="text-[11px] text-muted">working to {fmtDate(job.endDate)}</div></div>
      <div className="rounded-xl bg-surface-2 p-2.5"><div className="text-[11px] text-muted font-semibold uppercase tracking-wide">Rig down</div><div data-testid="rig-down" className="font-semibold">{fmtDown(p)}</div><div className="text-[11px] text-muted">from {fmtDate(p.downStart)}{downEnd(p) !== p.downStart ? ` to ${fmtDate(downEnd(p))}` : ''}</div></div>
    </div>
    <RigStrip job={job} craneId={craneId} />
    {chk && chk.warnings.length > 0 && <div className="flex flex-col gap-1">{chk.warnings.map(w => <div key={w} data-testid="rig-warn" className="text-sm text-warn font-semibold flex gap-1.5"><AlertTriangle className="size-4 shrink-0 mt-0.5" />{w}</div>)}</div>}
    {p.notes && <div className="text-sm text-muted">{p.notes}</div>}
  </div>
}

export default function JobRig({ job, readOnly, compact }: { job: T.Job; readOnly?: boolean; compact?: boolean }) {
  const db = useStore(s => s.db), role = useStore(s => s.session?.role)
  const canEdit = !readOnly && RIG_EDITORS.includes(role ?? '')
  const [edit, setEdit] = useState<string | null>(null), [pick, setPick] = useState(false)
  const cranes = jobCranes(job)
  if (readOnly && !(job.rig ?? []).length && !outsideOf(job).length) return null
  const others = db.equipment.filter(e => e.category === 'Crane' && !cranes.includes(e.id))
  return <div className="card p-5" data-testid="job-rig">
    <div className="flex items-center gap-2 mb-3"><Anchor className="size-5 text-accent" /><div className="font-semibold flex-1">Cranes · rig up & rig down{craneCount(job) > 1 && <span data-testid="rig-crane-count" className="ml-2 text-xs font-semibold text-muted">{craneCount(job)} cranes{outsideOf(job).length ? ` · ${outsideOf(job).length} outside` : ''}</span>}</div>
      {canEdit && <button data-testid="rig-add-crane" onClick={() => setPick(true)} className="h-10 pointer-coarse:h-[44px] px-3.5 rounded-full bg-surface-2 font-semibold text-sm inline-flex items-center gap-1.5"><Plus className="size-4" />Add crane</button>}</div>
    {cranes.length ? <div className="flex flex-col gap-3">{cranes.filter(c => !readOnly || planFor(job, c)).map(c => <CraneRig key={c} job={job} craneId={c} canEdit={canEdit} compact={compact} onEdit={() => setEdit(c)} />)}</div>
      : <div className="text-sm text-muted">No crane on this job.{canEdit ? ' Tap Add crane to plan rig days.' : ''}</div>}
    <div className="mt-3"><OutsideCranes job={job} readOnly={readOnly} /></div>
    {!canEdit && !readOnly && <div className="text-[11px] text-muted mt-2">View only — dispatch, ops and branch managers set rig days.</div>}
    {canEdit && edit && <RigEditor job={job} craneId={edit} onClose={() => setEdit(null)} />}
    <Sheet open={pick} onClose={() => setPick(false)} title="Add a crane to this job" sub="Assist / tail cranes get their own rig days">
      <div className="flex flex-col gap-1.5">{others.map(e => <button key={e.id} data-testid="rig-crane-pick" data-unit={e.id} disabled={e.status === 'Maintenance' || e.status === 'Out of Service' || annualExpired(e)} onClick={() => { const k = firstClash(db, job, e.id, job.startDate, job.endDate); actions.addJobCrane(job.id, e.id, k ? `double-booked with Job #${k.job.jobNo} ${k.d}` : undefined); setPick(false); setEdit(e.id) }} className="min-h-12 rounded-xl border hairline px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50"><span className="block font-semibold">Crane {e.unit} · {e.capacity}t {e.model}</span><span className="block text-xs text-muted">{e.status === 'Maintenance' || e.status === 'Out of Service' ? <b className="text-bad" data-testid="rig-pick-down">{e.status} — can’t be added</b> : e.status} · {e.yard}{(() => { const k = firstClash(db, job, e.id, job.startDate, job.endDate); return k ? <b className="text-bad" data-testid="rig-pick-clash"> · Double-booked: Job #{k.job.jobNo} {fmtDate(k.d)} ({k.why})</b> : null })()}</span></button>)}</div>
    </Sheet>
  </div>
}

const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
function RigEditor({ job, craneId, onClose }: { job: T.Job; craneId: string; onClose: () => void }) {
  const db = useStore(s => s.db)
  const init = planFor(job, craneId) ?? defaultPlan(job, craneId)
  const [p, setP] = useState<T.RigPlan>(init)
  const [travel, setTravel] = useState(String(init.travelDays)), [upDays, setUpDays] = useState(String(init.upDays)), [downAmt, setDownAmt] = useState(String(init.downAmount))
  const [addD, setAddD] = useState('')
  const plan: T.RigPlan = { ...p, travelDays: num(travel), upDays: num(upDays), downAmount: num(downAmt), upDates: p.upMode === 'dates' ? (p.upDates ?? []) : undefined, plannedMoveIn: p.plannedMoveIn || undefined }
  const chk = checkPlan(db, job, plan)
  const crane = byId(db.equipment, craneId)
  const set = (x: Partial<T.RigPlan>) => setP(o => ({ ...o, ...x }))
  const seg = (on: boolean) => cn('h-10 pointer-coarse:h-[44px] px-3.5 rounded-full text-sm font-semibold', on ? 'bg-ink text-surface' : 'bg-surface-2 text-muted')
  const save = () => { if (chk.errors.length) return; actions.setRigPlan(job.id, plan, chk.warnings.join('; ') || undefined); toast.success(`Rig plan saved · Crane ${crane?.unit}`); onClose() }
  return <Sheet open onClose={onClose} title={`Rig days · Crane ${crane?.unit ?? ''}`} sub={`Job #${job.jobNo} · working ${fmtDate(job.startDate)} → ${fmtDate(job.endDate)}`}
    actions={<>{planFor(job, craneId) && <Button variant="ghost" data-testid="rig-remove" icon={<Trash2 className="size-4" />} onClick={() => { actions.removeRigPlan(job.id, craneId); onClose() }}>Remove</Button>}<Button variant="primary" data-testid="rig-save" disabled={chk.errors.length > 0} onClick={save}>Save rig plan</Button></>}>
    <div className="flex flex-col gap-4" data-testid="rig-sheet">
      <div className="label">Rig up</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hook ready (customer)"><input type="date" className="input" data-testid="rig-hookready" value={p.hookReady} onChange={e => set({ hookReady: e.target.value })} /></Field>
        <Field label="Travel / move-in days"><input type="number" inputMode="numeric" min={0} step={1} className="input" data-testid="rig-travel" value={travel} onChange={e => setTravel(e.target.value)} /></Field>
      </div>
      <div className="flex gap-1.5"><button data-testid="rig-mode-days" className={seg(p.upMode === 'days')} onClick={() => set({ upMode: 'days' })}>Number of days</button><button data-testid="rig-mode-dates" className={seg(p.upMode === 'dates')} onClick={() => set({ upMode: 'dates', upDates: p.upDates?.length ? p.upDates : rigUpDates({ ...plan, upMode: 'days', upDays: num(upDays) >= 1 ? num(upDays) : 1 }) })}>Specific dates</button></div>
      {p.upMode === 'days' ? <Field label="Rig-up days (right before Hook ready)"><input type="number" inputMode="numeric" min={1} step={1} className="input" data-testid="rig-updays" value={upDays} onChange={e => setUpDays(e.target.value)} /></Field>
        : <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">{(p.upDates ?? []).slice().sort().map(d => <span key={d} data-testid="rig-date-chip" className="inline-flex items-center gap-1 rounded-full bg-surface-2 pl-3 pr-1 h-10 text-sm font-semibold">{fd(d)}<button aria-label={`Remove ${d}`} onClick={() => set({ upDates: (p.upDates ?? []).filter(x => x !== d) })} className="size-9 grid place-items-center rounded-full hover:bg-bad/15"><X className="size-4" /></button></span>)}</div>
          <div className="flex gap-2"><input type="date" className="input flex-1" data-testid="rig-date-input" value={addD} onChange={e => setAddD(e.target.value)} /><Button data-testid="rig-date-add" disabled={!addD} onClick={() => { if (addD) set({ upDates: [...new Set([...(p.upDates ?? []), addD])] }); setAddD('') }}>Add date</Button></div>
        </div>}
      <Field label="Planned move-in (optional)" hint="We’ll flag it if this doesn’t leave enough time."><input type="date" className="input" data-testid="rig-planned" value={p.plannedMoveIn ?? ''} onChange={e => set({ plannedMoveIn: e.target.value })} /></Field>
      <div className="rounded-2xl bg-[#1f6b3a]/10 ring-1 ring-[#1f6b3a]/30 p-3 text-sm" data-testid="rig-calc">{chk.errors.length ? 'Fix the fields below to see the dates.' : <>Start moving in by <b data-testid="rig-calc-by">{fd(moveInBy(plan))}</b> → rig up {upDaysOf(plan)} day{upDaysOf(plan) === 1 ? '' : 's'} → <b>Hook ready {fd(plan.hookReady)}</b></>}</div>
      <div className="label mt-1">Rig down</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rig-down starts"><input type="date" className="input" data-testid="rig-down-start" value={p.downStart} onChange={e => set({ downStart: e.target.value })} /></Field>
        <Field label={p.downUnit === 'h' ? 'Hours' : 'Days'}><input type="number" inputMode="decimal" min={0} step={p.downUnit === 'h' ? 0.5 : 0.5} className="input" data-testid="rig-down-amt" value={downAmt} onChange={e => setDownAmt(e.target.value)} /></Field>
      </div>
      <div className="flex flex-wrap gap-1.5"><button data-testid="rig-unit-h" className={seg(p.downUnit === 'h')} onClick={() => set({ downUnit: 'h' })}>Hours</button><button data-testid="rig-unit-d" className={seg(p.downUnit === 'd')} onClick={() => set({ downUnit: 'd' })}>Days</button>
        <span className="w-px bg-[var(--line)] mx-1" />{([[2, 'h'], [4, 'h'], [1, 'd'], [3, 'd'], [7, 'd']] as const).map(([n, u]) => <button key={n + u} data-testid={`rig-preset-${n}${u}`} className={seg(false)} onClick={() => { set({ downUnit: u }); setDownAmt(String(n)) }}>{u === 'h' ? `${n} h` : n === 7 ? '1 week' : `${n} d`}</button>)}</div>
      {p.downStart && <div className="text-xs text-muted">Crane is free after {fd(addDays(downEnd({ ...plan, downAmount: plan.downAmount > 0 ? plan.downAmount : 1 }), 0))}.</div>}
      <Field label="Notes (optional)"><input className="input" value={p.notes ?? ''} onChange={e => set({ notes: e.target.value })} placeholder="e.g. assist crane needed day 2" /></Field>
      {chk.errors.map(e => <div key={e} data-testid="rig-error" className="text-sm text-bad font-semibold">{e}</div>)}
      {chk.warnings.map(w => <div key={w} data-testid="rig-sheet-warn" className="text-sm text-warn font-semibold flex gap-1.5"><AlertTriangle className="size-4 shrink-0 mt-0.5" />{w}</div>)}
    </div>
  </Sheet>
}
