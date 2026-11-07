/** dive2 B3: Reschedule a job after creation (customer moved it). New start / end / start time, optional per-crane rig-plan
 *  shift and crew-day shift, conflict preview, in-app notices, and a customer message DRAFT (copy only, never sent). */
import { useMemo, useState } from 'react'
import { CalendarClock, Copy, History } from 'lucide-react'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { useStore, actions, rescheduleError } from '../data/store'
import { byId, customerOf } from '../data/logic'
import { craneBusy, jobCranes } from '../data/rig'
import { diffDays, addDays, fmtDate, fmtTs, cn, today } from '../lib/util'
import { Button, Field, Modal } from './ui'
import { RIG_EDITORS } from './JobRig'

export function RescheduleButton({ job }: { job: T.Job }) {
  const role = useStore(s => s.session?.role)
  const [open, setOpen] = useState(false)
  if (!RIG_EDITORS.includes(role ?? '')) return null
  return <><Button size="sm" icon={<CalendarClock className="size-4" />} data-testid="job-reschedule" onClick={() => setOpen(true)}>Reschedule</Button>
    {open && <RescheduleSheet job={job} onClose={() => setOpen(false)} />}</>
}

function RescheduleSheet({ job, onClose }: { job: T.Job; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [start, setStart] = useState(job.startDate), [end, setEnd] = useState(job.endDate), [time, setTime] = useState(job.startTime)
  const [keepLen, setKeepLen] = useState(true), [crew, setCrew] = useState(true), [units, setUnits] = useState(true), [reason, setReason] = useState('')
  const cranes = jobCranes(job); const withRig = cranes.filter(c => (job.rig ?? []).some(p => p.craneId === c))
  const [rig, setRig] = useState<string[]>(withRig)
  const len = diffDays(job.endDate, job.startDate)
  const setS = (v: string) => { setStart(v); if (keepLen && v) setEnd(addDays(v, len)) }
  const delta = start ? diffDays(start, job.startDate) : 0
  const err = rescheduleError(job, start, end) // dive3 B4/M3: ≤365 days, no past dates, a started job keeps its start
  const started = job.startDate < today()
  const hasUnits = (job.outside ?? []).length > 0 || Object.keys(job.unitDays ?? {}).length > 0
  // dive3 M2: who gets dropped (their days fall outside the new dates)
  const dropped = useMemo(() => { if (err) return [] as string[]; const now = today(); const moved = (d: string) => crew && delta ? addDays(d, delta) : d
    return [...new Set(db.assignments.filter(a => a.jobId === job.id && a.date >= now).filter(a => { const d = moved(a.date); return d < start || d > end }).map(a => a.employeeId))] }, [db, job.id, start, end, crew, delta, err])
  // dive3 M4: per-person and per-unit conflicts on the new days
  const people = useMemo(() => { if (err || !crew || !delta) return [] as string[]; const now = today(); const out = new Map<string, string>()
    db.assignments.filter(a => a.jobId === job.id && a.date >= now).forEach(a => { const d = addDays(a.date, delta); if (d < start || d > end) return; const o = db.assignments.find(x => x.employeeId === a.employeeId && x.date === d && x.jobId !== job.id); const ab = db.absences.find(x => x.employeeId === a.employeeId && x.from <= d && x.to >= d)
      if ((o || ab) && !out.has(a.employeeId)) { const e = byId(db.employees, a.employeeId); out.set(a.employeeId, `${e ? `${e.first} ${e.last}` : a.employeeId}: ${o ? `on Job #${byId(db.jobs, o.jobId)?.jobNo}` : ab!.kind} ${d.slice(5)}`) } })
    return [...out.values()] }, [db, job.id, start, end, crew, delta, err])
  const clashes = useMemo(() => err ? [] : cranes.flatMap(c => craneBusy(db, c, job.id).filter(b => b.from <= end && b.to >= addDays(start, rig.includes(c) ? -7 : 0)).map(b => `${byId(db.equipment, c)?.unit ?? c}: Job #${b.job.jobNo} ${b.from.slice(5)}–${b.to.slice(5)}`)), [db, cranes, job.id, start, end, rig, err])
  const cust = customerOf(db, job)
  const draft = `Hi ${cust?.contact?.split(' ')[0] ?? 'there'}, confirming Job #${job.jobNo} is now ${fmtDate(start || job.startDate, { weekday: 'short', month: 'short', day: 'numeric' })} – ${fmtDate(end || job.endDate, { weekday: 'short', month: 'short', day: 'numeric' })}, start ${time}.${reason ? ` (${reason})` : ''} Reply if anything changes.`
  // Req H: who hears about it (in the app) and drafts for outside equipment owners + the customer — copy only, never sent
  const crewN = new Set(db.assignments.filter(a => a.jobId === job.id && a.date >= addDays(job.startDate, 0)).map(a => a.employeeId)).size
  const sup = byId(db.employees, job.supervisorId), pm = byId(db.employees, job.pmId)
  const hasEquip = cranes.length > 0 || job.trailerIds.length > 0 || (job.extras ?? []).some(x => x.kind === 'equipment')
  const billing = (job.extras ?? []).length > 0 || !!job.invoiceNo || db.tickets.some(t => t.jobId === job.id && (t.signedAt || t.signerName))
  const told = [`Crew (${crewN})`, sup && `Supervisor ${sup.first} ${sup.last}`, pm && `PM ${pm.first} ${pm.last}`, 'Dispatch', 'Ops', 'Safety', 'Branch', hasEquip && 'Shop / equipment owners', billing && 'Accounting (billing review)'].filter(Boolean) as string[]
  const vendors = (job.outside ?? []).map(o => ({ o, v: db.craneVendors?.find(v => v.id === o.vendorId) })).filter(x => x.v)
  const vDraft = (name: string, size: string) => `Hi ${name}, Job #${job.jobNo} moved: your ${size} is now needed ${fmtDate(addDays(start || job.startDate, 0), { month: 'short', day: 'numeric' })} – ${fmtDate(end || job.endDate, { month: 'short', day: 'numeric' })}. Please confirm.`
  const save = () => {
    if (err) return
    if (actions.rescheduleJob(job.id, { start, end, time, shiftRig: delta ? rig : [], shiftCrew: crew, shiftUnits: units, reason: reason.trim() || undefined })) { toast.success(`Job #${job.jobNo} rescheduled`, { description: `${told.length} groups told in the app. Customer and vendor messages are drafts only.` }); onClose() }
  }
  return <Modal open onClose={onClose} title={`Reschedule Job #${job.jobNo}`} sub="Customer moved it? Change the dates here." width={560}>
    <div className="flex flex-col gap-3" data-testid="reschedule-sheet">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Field label="Start"><input type="date" className="input" data-testid="rs-start" value={start} disabled={started} onChange={e => setS(e.target.value)} /></Field>
        <Field label="End"><input type="date" className="input" data-testid="rs-end" value={end} onChange={e => { setEnd(e.target.value); setKeepLen(false) }} /></Field>
        <Field label="Start time"><input type="time" className="input" data-testid="rs-time" value={time} onChange={e => setTime(e.target.value)} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" className="size-5" checked={keepLen} onChange={e => setKeepLen(e.target.checked)} />Keep the same length ({len + 1} days)</label>
      <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" className="size-5" data-testid="rs-crew" checked={crew} onChange={e => setCrew(e.target.checked)} />Move the crew’s days with it</label>
      {hasUnits && <label className="flex items-center gap-2 text-sm min-h-[44px]"><input type="checkbox" className="size-5" data-testid="rs-units" checked={units} onChange={e => setUnits(e.target.checked)} />Move hired cranes and truck/trailer days with it</label>}
      {started && <div className="text-xs text-muted" data-testid="rs-started">This job has started — you can extend or shorten the end date.</div>}
      {dropped.length > 0 && <div className="rounded-xl bg-bad/10 border border-bad/30 p-3 text-sm" data-testid="rs-dropped"><b>{dropped.length} crew will be taken off</b> (their days fall outside the new dates) — each is told in the app.</div>}
      {people.length > 0 && <div className="rounded-xl bg-warn/10 border border-warn/40 p-3 text-sm" data-testid="rs-people"><b>⚠ Crew conflicts on the new dates</b>{people.slice(0, 6).map(c => <div key={c}>• {c}</div>)}</div>}
      {withRig.length > 0 && <div className="rounded-xl border hairline p-3"><div className="text-sm font-semibold mb-1">Shift rig-up / rig-down plans {delta ? `(${delta > 0 ? '+' : ''}${delta} d)` : ''}</div>
        <div className="flex flex-wrap gap-2">{withRig.map(c => <label key={c} className="inline-flex items-center gap-2 text-sm min-h-[44px] px-3 rounded-full bg-surface-2"><input type="checkbox" className="size-5" data-testid="rs-rig" checked={rig.includes(c)} onChange={e => setRig(r => e.target.checked ? [...r, c] : r.filter(x => x !== c))} />Crane {byId(db.equipment, c)?.unit ?? c}</label>)}</div></div>}
      <Field label="Reason (optional)"><input className="input" data-testid="rs-reason" placeholder="e.g. customer moved it, wind, permits" value={reason} onChange={e => setReason(e.target.value)} /></Field>
      {err && <div className="text-sm text-bad" data-testid="rs-error">{err}</div>}
      {clashes.length > 0 && <div className="rounded-xl bg-warn/10 border border-warn/40 p-3 text-sm" data-testid="rs-clash"><b>⚠ Crane conflicts on the new dates</b> (you can still save){clashes.slice(0, 6).map(c => <div key={c}>• {c}</div>)}</div>}
      <div className="rounded-xl bg-surface-2 p-3 text-sm" data-testid="rs-notify"><b>Told in the app when you save</b><div className="flex flex-wrap gap-1.5 mt-1.5">{told.map(t => <span key={t} className="rounded-full bg-surface px-2.5 py-1 text-xs" data-testid="rs-notify-who">{t}</span>)}</div></div>
      {vendors.map(({ o, v }) => <div key={o.id} className="rounded-xl border hairline p-3 text-sm" data-testid="rs-vendor-draft"><b>{v!.name} — draft only</b><div className="text-muted mt-1 select-all">{vDraft(v!.contact?.split(' ')[0] ?? v!.name, o.size)}</div><div className="text-[11px] text-faint mt-1">Never sent automatically.</div></div>)}
      <div className="rounded-xl border hairline p-3 text-sm" data-testid="rs-draft"><div className="flex items-center justify-between gap-2"><b>Customer message — draft only</b><button className="h-[44px] px-3 rounded-full bg-surface-2 text-xs font-semibold inline-flex items-center gap-1.5" onClick={() => { void navigator.clipboard?.writeText(draft).then(() => toast.success('Copied — send it yourself'), () => toast('Select and copy the text')) }}><Copy className="size-3.5" />Copy</button></div>
        <div className="text-muted mt-1 select-all">{draft}</div><div className="text-[11px] text-faint mt-1">Never sent automatically.</div></div>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="rs-save" disabled={!!err} onClick={save}>Save new dates</Button></div>
    </div>
  </Modal>
}

/** Change log on the job: every audit-logged change to this job (dates, crew, cranes, units, rig plans). */
export function JobLog({ job }: { job: T.Job }) {
  const audit = useStore(s => s.db.audit); const [all, setAll] = useState(false)
  const rows = useMemo(() => audit.filter(a => a.entity.startsWith(`Job #${job.jobNo}`)), [audit, job.jobNo])
  if (!rows.length) return null
  return <div className="card p-5" data-testid="job-log"><div className="font-semibold flex items-center gap-2 mb-2"><History className="size-4" />Change log</div>
    <div className="flex flex-col divide-y hairline text-sm">{(all ? rows : rows.slice(0, 6)).map(a => <div key={a.id} className="py-2" data-testid="job-log-row"><div className="flex justify-between gap-2"><b>{a.action}</b><span className="text-xs text-muted shrink-0">{fmtTs(a.at)}</span></div><div className="text-muted break-words">{a.detail}</div><div className="text-xs text-faint">{a.actor}</div></div>)}</div>
    {rows.length > 6 && <button className={cn('mt-2 h-[44px] px-3 rounded-full bg-surface-2 text-xs font-semibold')} onClick={() => setAll(!all)}>{all ? 'Show less' : `Show all ${rows.length}`}</button>}
  </div>
}
