import { useEffect, useMemo, useState } from 'react'
import type React from 'react'
import { toast } from 'sonner'
import { Check, MessageCircleQuestion, CheckCheck, AlertTriangle } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { inScope, byId, fullName } from '../data/logic'
import { cn, fmtDate, money } from '../lib/util'
import { Segmented, Badge, Button, Card, Empty, Modal, Stat } from './ui'
import { EmpRef, JobRef, EqRef } from './bits'
import { reconDays, reconDay, RECON_REASONS, REASON_COST, promptText, fmtH, type ReconDay, type ReconReason } from '../data/recon'

const DOT: Record<string, string> = { green: 'bg-ok-solid', yellow: 'bg-warn', red: 'bg-bad-solid' }
const LABEL: Record<string, string> = { green: 'OK', yellow: 'Explained', red: 'Needs reason' }

/** Reason picker — used by the field employee at time entry and by supervisors/payroll. */
export function ReasonForm({ day, onDone }: { day: ReconDay; onDone: () => void }) {
  const db = useStore(s => s.db)
  const [reason, setReason] = useState<ReconReason | ''>((day.rec?.reason as ReconReason) || '')
  const [note, setNote] = useState(day.rec?.note ?? '')
  const emp = byId(db.employees, day.employeeId)
  const lands = reason ? REASON_COST[reason] : undefined
  const units = db.equipment.filter(e => reason === 'Serviced truck' ? e.category !== 'Crane' : reason === 'Serviced crane' ? e.category === 'Crane' : true)
  const defUnit = reason === 'Serviced crane' ? day.tickets.map(x => x.job.craneId).find(Boolean) : emp?.homeTruckId
  const [unitId, setUnit] = useState<string>(day.rec?.unitId ?? '')
  const [jobId, setJob] = useState<string>(day.rec?.jobId ?? day.tickets[0]?.job.id ?? '')
  const needNote = reason === 'Other' || day.kind === 'under'
  const ok = !!reason && (!needNote || note.trim().length > 2) && (lands !== 'unit' || !!(unitId || defUnit))
  const save = () => {
    actions.timeReason({ employeeId: day.employeeId, date: day.date, reason, note: note.trim() || undefined, unitId: lands === 'unit' ? (unitId || defUnit) : undefined, jobId: lands === 'job' ? jobId : undefined })
    toast.success('Reason saved', { description: lands === 'unit' ? 'Extra time will cost to the unit' : lands === 'job' ? 'Extra time will cost to the job' : 'Extra time goes to overhead' }); onDone()
  }
  return (
    <div className="space-y-4" data-testid="reason-form">
      <div className="rounded-2xl bg-warn/10 p-4 text-[15px] font-medium leading-snug">{promptText(day)}</div>
      <div className="grid grid-cols-2 gap-2">
        {RECON_REASONS.map(r => <button key={r} data-testid={`reason-${r}`} onClick={() => setReason(r)} className={cn('rounded-xl border px-3 py-3 text-left text-sm font-semibold min-h-12 press', reason === r ? 'border-accent bg-accent/10 text-accent' : 'border-line')}>{r}</button>)}
      </div>
      {lands === 'unit' && <label className="block"><span className="label">Which unit?</span><select className="input" value={unitId || defUnit || ''} onChange={e => setUnit(e.target.value)} data-testid="reason-unit"><option value="">Pick a unit…</option>{units.map(u => <option key={u.id} value={u.id}>{u.unit} · {u.make} {u.model}</option>)}</select></label>}
      {lands === 'job' && <label className="block"><span className="label">Which job?</span><select className="input" value={jobId} onChange={e => setJob(e.target.value)}>{[...new Map([...day.tickets.map(x => x.job), ...db.jobs.filter(j => j.status === 'On Site' || j.status === 'Confirmed' || j.status === 'En Route')].map(j => [j.id, j])).values()].slice(0, 40).map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {j.name}</option>)}</select></label>}
      <label className="block"><span className="label">Note{needNote ? ' (required)' : ''}</span><textarea className="input min-h-20" value={note} onChange={e => setNote(e.target.value)} placeholder="What happened?" data-testid="reason-note" /></label>
      {lands && <div className="text-xs text-muted">Cost lands on: <b>{lands === 'unit' ? 'unit repair cost' : lands === 'job' ? 'the job' : 'overhead'}</b>. Travel to/from the site is paid, not billed.</div>}
      <Button variant="primary" size="lg" className="w-full" disabled={!ok} onClick={save} data-testid="reason-save">Save reason</Button>
    </div>
  )
}

function Timeline({ d }: { d: ReconDay }) {
  return (
    <div className="grid md:grid-cols-2 gap-3 mt-3" data-testid="recon-timeline">
      <div className="rounded-xl bg-surface-2 p-3">
        <div className="label mb-2">Customer-signed tickets · {fmtH(d.ticketHrs)}</div>
        {d.tickets.map(x => <div key={x.t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm border-b border-line/60 last:border-0"><span className="truncate"><JobRef id={x.job.id} /> <span className="text-muted">signed by {x.t.signerName || '—'}</span></span><b className="tabular-nums">{fmtH(x.hrs)}</b></div>)}
        {d.travel.map(x => <div key={x.job.id} className="flex items-center justify-between py-1.5 text-sm text-muted"><span>Travel allowance #{x.job.jobNo} ({x.each}h each way)</span><span className="tabular-nums">+{fmtH(x.each * 2)}</span></div>)}
        <div className="flex justify-between pt-2 text-sm font-semibold"><span>Expected</span><span className="tabular-nums">{fmtH(d.ticketHrs)} – {fmtH(d.expectedMax)}</span></div>
      </div>
      <div className="rounded-xl bg-surface-2 p-3">
        <div className="label mb-2">Timecard · {fmtH(d.timecard)}</div>
        {d.entries.map(t => <div key={t.id} className="flex items-center justify-between gap-2 py-1.5 text-sm border-b border-line/60 last:border-0"><span className="truncate">{t.start}–{t.end} · {t.activity} {t.jobId && <JobRef id={t.jobId} />}</span><b className="tabular-nums">{fmtH(t.hours)}</b></div>)}
        <div className={cn('flex justify-between pt-2 text-sm font-semibold', d.kind !== 'ok' && 'text-bad')}><span>{d.kind === 'over' ? 'Over expected max' : d.kind === 'under' ? 'Under signed tickets' : 'Difference'}</span><span className="tabular-nums">{d.kind === 'ok' ? '—' : `${d.diff > 0 ? '+' : ''}${fmtH(d.diff)}`}</span></div>
      </div>
    </div>
  )
}

function Row({ d, can, onReason, open, setOpen }: { d: ReconDay; can: boolean; onReason: () => void; open: boolean; setOpen: () => void }) {
  const r = d.rec
  return (
    <Card className="!p-0" >
      <div className="flex flex-wrap items-center gap-3 p-4 cursor-pointer press" onClick={setOpen} data-testid={`recon-${d.key}`} data-status={d.status}>
        <span className={cn('size-3 rounded-full shrink-0', DOT[d.status])} aria-label={LABEL[d.status]} />
        <div className="min-w-0 flex-1">
          <div className="font-semibold" onClick={e => e.stopPropagation()}><EmpRef id={d.employeeId} /> <span className="text-muted font-normal text-sm">· {fmtDate(d.date)}{d.tickets.length > 1 ? ` · ${d.tickets.length} jobs` : ''}</span></div>
          <div className="text-sm text-muted tabular-nums">Tickets {fmtH(d.ticketHrs)} + travel ≤{fmtH(d.travelMax)} · timecard <b className="text-ink">{fmtH(d.timecard)}</b>{d.kind !== 'ok' && <b className="text-bad"> ({d.diff > 0 ? '+' : ''}{fmtH(d.diff)})</b>}</div>
          {r?.reason && <div className="text-sm mt-1"><Badge tone={r.status === 'Approved' ? 'ok' : 'warn'}>{r.reason}</Badge> {r.unitId && <EqRef id={r.unitId} />} {r.note && <span className="text-muted">“{r.note}”</span>}</div>}
          {r?.status === 'Asked' && <div className="text-sm mt-1 text-info">Asked: {r.question}</div>}
        </div>
        <Badge tone={d.status === 'green' ? 'ok' : d.status === 'yellow' ? 'warn' : 'bad'}>{r?.status === 'Approved' && d.kind !== 'ok' ? 'Approved' : LABEL[d.status]}</Badge>
        {can && <div className="flex gap-2" onClick={e => e.stopPropagation()}>
          {d.kind !== 'ok' && d.rec?.status !== 'Approved' && <Button size="sm" onClick={onReason} data-testid="recon-add-reason">{r?.reason ? 'Edit reason' : 'Add reason'}</Button>}
          {d.status !== 'red' && r?.status !== 'Approved' && <Button size="sm" variant="primary" icon={<Check className="size-4" />} data-testid="recon-approve" onClick={() => { actions.timeReconApprove([{ employeeId: d.employeeId, date: d.date, overHrs: d.kind === 'over' ? d.diff : 0 }]); toast.success('Approved') }}>Approve</Button>}
          {d.kind !== 'ok' && r?.status !== 'Approved' && <Button size="sm" variant="ghost" icon={<MessageCircleQuestion className="size-4" />} data-testid="recon-ask" onClick={() => { const q = window.prompt('Ask the employee:', `Your timecard is ${fmtH(Math.abs(d.diff))} ${d.kind} — what happened?`); if (q) { actions.timeReconAsk(d.employeeId, d.date, q); toast.success('Question sent', { description: 'Shows on their phone at time entry' }) } }}>Ask why</Button>}
        </div>}
      </div>
      {open && <div className="px-4 pb-4"><Timeline d={d} /></div>}
    </Card>
  )
}

export function ReconQueue() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const role = useStore(s => s.session!.role)
  const can = ['payroll', 'owner', 'ops', 'dispatch', 'hr', 'branch', 'accounting'].includes(role)
  const [tab, setTab] = useState<'queue' | 'patterns' | 'rules'>('queue')
  const [st, setSt] = useState<'all' | 'red' | 'yellow' | 'green'>('all')
  const [open, setOpen] = useState<string | null>(null)
  const [edit, setEdit] = useState<string | null>(null)
  const days = useMemo(() => reconDays(db).filter(d => inScope(byId(db.employees, d.employeeId), f)).sort((a, b) => b.date.localeCompare(a.date) || ({ red: 0, yellow: 1, green: 2 }[a.status] - { red: 0, yellow: 1, green: 2 }[b.status])), [db, f])
  const pending = days.filter(d => d.rec?.status !== 'Approved' && !(d.entries.every(e => e.status === 'Approved' || e.status === 'Exported') && d.kind === 'ok'))
  const cnt = (s: string) => days.filter(d => d.status === s).length
  const shown = days.filter(d => st === 'all' || d.status === st)
  const greens = pending.filter(d => d.status === 'green')
  const editing = edit ? days.find(d => d.key === edit) : undefined
  return (
    <div data-testid="recon">
      <div className="grid grid-cols-3 gap-3 mb-4">
        <Stat label="Needs reason" value={cnt('red')} tone="bad" onClick={() => { setTab('queue'); setSt('red') }} icon={<AlertTriangle className="size-4" />} />
        <Stat label="Explained · review" value={cnt('yellow')} tone="warn" onClick={() => { setTab('queue'); setSt('yellow') }} />
        <Stat label="Within tickets + travel" value={cnt('green')} tone="ok" onClick={() => { setTab('queue'); setSt('green') }} />
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'queue', label: 'Review queue', count: pending.length }, { value: 'patterns', label: 'Patterns' }, { value: 'rules', label: 'Travel rule' }]} />
        {tab === 'queue' && <Segmented size="sm" value={st} onChange={setSt} options={[{ value: 'all', label: 'All' }, { value: 'red', label: 'Red', count: cnt('red') }, { value: 'yellow', label: 'Yellow', count: cnt('yellow') }, { value: 'green', label: 'Green', count: cnt('green') }]} />}
        {tab === 'queue' && can && greens.length > 0 && <Button variant="primary" className="ml-auto" icon={<CheckCheck className="size-4" />} data-testid="recon-bulk" onClick={() => { actions.timeReconApprove(greens.map(d => ({ employeeId: d.employeeId, date: d.date, overHrs: 0 }))); toast.success(`${greens.length} green days approved`) }}>Approve {greens.length} greens</Button>}
      </div>
      {tab === 'queue' && (shown.length ? <div className="space-y-2">{shown.map(d => <Row key={d.key} d={d} can={can} open={open === d.key} setOpen={() => setOpen(open === d.key ? null : d.key)} onReason={() => setEdit(d.key)} />)}</div> : <Empty title="Nothing here" body="Every timecard lines up with signed tickets + travel." />)}
      {tab === 'patterns' && <Patterns days={days} />}
      {tab === 'rules' && <Rules />}
      <Modal open={!!editing} onClose={() => setEdit(null)} title="Explain the difference" sub={editing && `${fullName(byId(db.employees, editing.employeeId)!)} · ${fmtDate(editing.date)}`}>{editing && <ReasonForm day={editing} onDone={() => setEdit(null)} />}</Modal>
    </div>
  )
}

function Patterns({ days }: { days: ReconDay[] }) {
  const db = useStore(s => s.db)
  const over = days.filter(d => d.kind !== 'ok')
  const byEmp = new Map<string, { n: number; hrs: number; reasons: Map<string, number> }>()
  over.forEach(d => { const x = byEmp.get(d.employeeId) ?? { n: 0, hrs: 0, reasons: new Map() }; x.n++; x.hrs += d.diff; const rr = d.rec?.reason || 'No reason yet'; x.reasons.set(rr, (x.reasons.get(rr) ?? 0) + 1); byEmp.set(d.employeeId, x) })
  const byReason = new Map<string, { n: number; hrs: number; cost: number }>()
  over.forEach(d => { const k = d.rec?.reason || 'No reason yet'; const e = byId(db.employees, d.employeeId); const x = byReason.get(k) ?? { n: 0, hrs: 0, cost: 0 }; x.n++; x.hrs += Math.abs(d.diff); x.cost += Math.abs(d.diff) * (e?.rate ?? 0) * 1.32; byReason.set(k, x) })
  return (
    <div className="grid lg:grid-cols-2 gap-4" data-testid="recon-patterns">
      <Card><div className="label mb-3">Who is frequently over / under (14 days)</div>
        {[...byEmp].sort((a, b) => b[1].n - a[1].n).map(([id, x]) => <div key={id} className="flex items-center justify-between gap-2 py-2 border-b border-line/60 last:border-0 text-sm"><span className="truncate"><EmpRef id={id} /> <span className="text-muted">{[...x.reasons.keys()].join(', ')}</span></span><span className="tabular-nums whitespace-nowrap"><b>{x.n}×</b> · {x.hrs > 0 ? '+' : ''}{fmtH(x.hrs)}</span></div>)}
        {!byEmp.size && <div className="text-muted text-sm">No variances.</div>}
      </Card>
      <Card><div className="label mb-3">By reason</div>
        {[...byReason].sort((a, b) => b[1].hrs - a[1].hrs).map(([k, x]) => <div key={k} className="flex items-center justify-between py-2 border-b border-line/60 last:border-0 text-sm"><span>{k}</span><span className="tabular-nums">{x.n} days · {fmtH(x.hrs)} · {money(x.cost)}</span></div>)}
      </Card>
    </div>
  )
}

function Rules() {
  const db = useStore(s => s.db)
  const r = db.reconRules ?? { min: 0.5, max: 1, perMiles: 60 }
  const [v, setV] = useState(r)
  return (
    <Card className="max-w-xl">
      <div className="font-semibold mb-1">Paid travel allowance (not billed)</div>
      <p className="text-sm text-muted mb-4">Each way, per job: 1 hour per <b>{v.perMiles}</b> miles from the branch yard, between {v.min}h and {v.max}h. A job or site can override it (travelEach). Expected day = signed ticket hours + travel both ways.</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <label><span className="label">Min h / way</span><input className="input" type="number" step="0.25" value={v.min} onChange={e => setV({ ...v, min: +e.target.value })} /></label>
        <label><span className="label">Max h / way</span><input className="input" type="number" step="0.25" value={v.max} onChange={e => setV({ ...v, max: +e.target.value })} /></label>
        <label><span className="label">Miles per hour</span><input className="input" type="number" value={v.perMiles} onChange={e => setV({ ...v, perMiles: +e.target.value })} /></label>
      </div>
      <Button variant="primary" onClick={() => { actions.setReconRules(v); toast.success('Travel rule saved') }}>Save rule</Button>
    </Card>
  )
}

/** My employee-days that need a reason (field prompt + briefings). */
export const myReconFlags = (db: T.DB, empId: string) => reconDays(db).filter(d => d.employeeId === empId && d.status === 'red')
export { reconDay }

/** Field phone: list of my days needing a reason + auto-prompt right after time is submitted. */
export function FieldReconCard({ empId }: { empId: string }) {
  const db = useStore(s => s.db)
  const flags = myReconFlags(db, empId)
  if (!flags.length) return null
  return (
    <div className="rounded-[28px] bg-bad/10 p-5" data-testid="field-recon">
      <div className="flex items-center gap-2 font-semibold text-bad"><AlertTriangle className="size-5" />{flags.length} timecard{flags.length === 1 ? ' needs' : 's need'} a reason</div>
      <div className="mt-3 flex flex-col gap-2">
        {flags.map(d => <button key={d.key} data-testid="field-recon-day" onClick={() => window.dispatchEvent(new CustomEvent('recon-open', { detail: { employeeId: d.employeeId, date: d.date } }))} className="rounded-2xl bg-surface p-4 text-left press min-h-14">
          <div className="font-semibold">{fmtDate(d.date)} · {d.diff > 0 ? '+' : ''}{fmtH(d.diff)}</div>
          <div className="text-sm text-muted">{d.rec?.status === 'Asked' ? `Supervisor asks: ${d.rec.question}` : promptText(d)}</div>
        </button>)}
      </div>
    </div>
  )
}
export function ReconPrompt({ empId, Sheet }: { empId: string; Sheet: (p: { open: boolean; onClose: () => void; title?: React.ReactNode; children: React.ReactNode; tall?: boolean }) => React.ReactNode }) {
  const db = useStore(s => s.db)
  const [date, setDate] = useState<string | null>(null)
  useEffect(() => {
    const onSaved = (e: Event) => { const d = (e as CustomEvent).detail as { employeeId: string; date: string }; if (d.employeeId !== empId) return; setTimeout(() => { const x = reconDay(useStore.getState().db, d.employeeId, d.date); if (x && x.status === 'red') setDate(d.date) }, 50) }
    const onOpen = (e: Event) => { const d = (e as CustomEvent).detail as { employeeId: string; date: string }; if (d.employeeId === empId) setDate(d.date) }
    window.addEventListener('time-saved', onSaved); window.addEventListener('recon-open', onOpen)
    return () => { window.removeEventListener('time-saved', onSaved); window.removeEventListener('recon-open', onOpen) }
  }, [empId])
  const day = date ? reconDay(db, empId, date) : null
  return <Sheet open={!!day} onClose={() => setDate(null)} title="What was the extra time?" tall>{day && <><Timeline d={day} /><div className="h-4" /><ReasonForm day={day} onDone={() => setDate(null)} /></>}</Sheet>
}
