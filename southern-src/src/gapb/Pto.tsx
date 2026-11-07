import { useMemo, useState } from 'react'
import { CalendarDays, AlertTriangle, Check, X, RefreshCw, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Modal } from '../components/ui'
import { useStore, actions } from '../data/store'
import { fullName } from '../data/logic'
import { addDays, today, timeAgo, fmtDate } from '../lib/util'
import { ptoBalance, businessDays } from './gstore'
import type * as T from '../data/types'

/** Who else is out or thin on the crew/craft during these dates, and which scheduled days need cover. */
export function coverage(db: T.DB, p: Pick<T.PtoRequest, 'employeeId' | 'from' | 'to'>) {
  const e = db.employees.find(x => x.id === p.employeeId)
  const sched = db.assignments.filter(a => a.employeeId === p.employeeId && a.date >= p.from && a.date <= p.to)
  const sameCraft = db.employees.filter(x => x.id !== p.employeeId && x.craft === e?.craft && x.branchId === e?.branchId && x.status === 'Active')
  const out = sameCraft.filter(x => db.absences.some(a => a.employeeId === x.id && a.from <= p.to && a.to >= p.from))
  const free = sameCraft.filter(x => !out.includes(x) && !db.assignments.some(a => a.employeeId === x.id && a.date >= p.from && a.date <= p.to))
  const warn = sched.length > 0 || (sameCraft.length > 0 && out.length / sameCraft.length >= 0.25)
  return { sched, out, free, sameCraft, warn, craft: e?.craft }
}

export function PtoRequestForm({ empId, onDone }: { empId: string; onDone?: () => void }) {
  const [from, setFrom] = useState(addDays(today(), 10)), [to, setTo] = useState(addDays(today(), 12)), [kind, setKind] = useState<T.PtoRequest['kind']>('Vacation')
  const ptoList = useStore(s => s.db.pto), [busy, setBusy] = useState(false)
  const asg = useStore(s => s.db.assignments)
  // shown balance = Paychex balance minus requests still waiting for approval (so stacked requests can't overdraw it)
  const pendingH = (k: string) => ptoList.filter(x => x.employeeId === empId && x.status === 'Pending' && x.kind === k).reduce((a, x) => a + x.hours, 0)
  const hire = useStore(s => s.db.employees.find(e => e.id === empId)?.hireDate)
  const b0 = ptoBalance(empId, hire), b = { ...b0, vacation: Math.max(0, b0.vacation - pendingH('Vacation')), sick: Math.max(0, b0.sick - pendingH('Sick')), personal: Math.max(0, b0.personal - pendingH('Personal')) }, days = businessDays(from, to, d => asg.some(a => a.employeeId === empId && a.date === d))
  const bal = kind === 'Sick' ? b.sick : kind === 'Personal' ? b.personal : kind === 'Vacation' ? b.vacation : Infinity
  const err = !from || !to ? 'Pick both dates' : to < from ? '“To” is before “From”' : from < today() && kind !== 'Sick' ? 'Start date is in the past' : ''
  // soft checks (approver sees the same over-balance warning); crews do work weekends, so weekend-only isn't a hard error
  const warn = err ? '' : days === 0 ? 'Weekend only and not scheduled — no hours charged' : days * 10 > bal ? `${days * 10}h is over the ${bal}h ${kind.toLowerCase()} balance — the extra ${days * 10 - bal}h would be unpaid` : ''
  return <div className="flex flex-col gap-3" data-testid="pto-form"><div className="text-xl font-semibold">Request time off</div>
    <div className="grid grid-cols-3 gap-2 text-center">{([['Vacation', b.vacation], ['Sick', b.sick], ['Personal', b.personal]] as const).map(([k, h]) => <div key={k} className="rounded-xl bg-surface-2 p-2"><div className="text-lg font-semibold">{h}h</div><div className="text-[11px] text-muted">{k}</div></div>)}</div>
    <div className="text-[11px] text-muted flex items-center gap-1"><RefreshCw className="size-3" />Balances from Paychex · synced {timeAgo(b.syncedAt)} · accrues {b.accrual}h/check{pendingH(kind) > 0 && <span data-testid="pto-pending-note"> · {pendingH(kind)}h pending held</span>}</div>
    <div className="flex flex-wrap gap-1.5">{(['Vacation', 'Sick', 'Personal', 'Unpaid'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={`h-9 px-3 rounded-xl text-sm border ${kind === k ? 'bg-ink text-bg border-ink' : 'hairline'}`}>{k}</button>)}</div>
    <div className="grid grid-cols-2 gap-2"><label className="text-xs text-muted">From<input data-testid="pto-from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="mt-1 w-full h-11 rounded-xl bg-surface-2 px-3 text-sm text-ink" /></label><label className="text-xs text-muted">To<input data-testid="pto-to" type="date" value={to} onChange={e => setTo(e.target.value)} className="mt-1 w-full h-11 rounded-xl bg-surface-2 px-3 text-sm text-ink" /></label></div>
    {err && <div className="text-xs text-bad" data-testid="pto-err">{err}</div>}{warn && <div className="text-xs text-warn" data-testid="pto-warn">{warn}</div>}
    <Button variant="primary" size="lg" data-testid="pto-submit" disabled={!!err || busy} onClick={() => { if (busy) return; setBusy(true); setTimeout(() => setBusy(false), 1200); const r = actions.requestPto({ employeeId: empId, from, to, kind, hours: days * 10 }); if (!r.ok) { toast.error(r.reason ?? 'Already requested'); return } toast.success('Request sent to your supervisor'); onDone?.() }}>Request {days} work day{days !== 1 ? 's' : ''} ({days * 10}h)</Button></div>
}

export default function PtoPage() {
  const db = useStore(s => s.db), role = useStore(s => s.session?.role)
  const meId = useStore(s => s.session?.employeeId)
  const pending = db.pto.filter(p => p.status === 'Pending')
  const decided = db.pto.filter(p => p.status !== 'Pending').slice(0, 10)
  const [confirm, setConfirm] = useState<T.PtoRequest | null>(null)
  const cov = useMemo(() => confirm ? coverage(db, confirm) : null, [db, confirm])
  const [reqFor, setReqFor] = useState(meId ?? db.employees.find(e => e.craft === 'Operator')?.id ?? db.employees[0].id)
  const name = (id: string) => fullName(db.employees.find(e => e.id === id))
  const approve = (p: T.PtoRequest) => { actions.decidePto(p.id, 'Approved'); setConfirm(null); toast.success(`Approved — ${name(p.employeeId)} is blocked on the dispatch board and in Smart Pickup`) }
  return <div className="flex flex-col gap-5" data-testid="pto-page">
    <PageHeader eyebrow="People" title="Time off" sub="Balances from Paychex. Approve on your phone. Approved PTO blocks dispatch and Smart Pickup automatically." />
    <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
      <div className="flex flex-col gap-4">
        <Card pad={false}><div className="px-5 py-3 border-b hairline font-semibold flex items-center gap-2"><CalendarDays className="size-4" />Waiting for approval<Badge tone="warn">{pending.length}</Badge></div>
          <div className="divide-y hairline">{pending.length ? pending.map(p => { const c = coverage(db, p), b = ptoBalance(p.employeeId), over = Math.max(0, p.hours - (p.kind === 'Sick' ? b.sick : b.vacation))
            return <div key={p.id} className="px-5 py-3 flex items-center gap-3 flex-wrap text-sm" data-testid="pto-row"><div className="flex-1 min-w-48"><div className="font-semibold">{name(p.employeeId)} · {p.kind}</div><div className="text-xs text-muted">{fmtDate(p.from)} – {fmtDate(p.to)} · {p.hours}h · balance {p.kind === 'Sick' ? b.sick : b.vacation}h</div>{over > 0 && <div className="text-xs text-bad font-semibold" data-testid="pto-over">{over}h over balance — approve as unpaid?</div>}{c.warn && <div className="text-xs text-warn flex items-center gap-1 mt-0.5"><AlertTriangle className="size-3" />{c.sched.length ? `Scheduled on ${c.sched.length} day(s)` : `${c.out.length} other ${c.craft}s out`}</div>}</div>
              {role !== 'field' && <><Button size="sm" variant="ok" icon={<Check className="size-3.5" />} data-testid="pto-approve" onClick={() => c.warn || over > 0 ? setConfirm(p) : approve(p)}>Approve</Button><Button size="sm" icon={<X className="size-3.5" />} onClick={() => { actions.decidePto(p.id, 'Denied'); toast('Denied') }}>Deny</Button></>}</div> }) : <div className="px-5 py-8 text-center text-sm text-muted">No pending requests.</div>}</div></Card>
        <Card><div className="font-semibold mb-2">Recently decided</div>{decided.map(p => <div key={p.id} className="text-sm py-1 flex gap-2"><span className="flex-1">{name(p.employeeId)} · {p.kind} · {fmtDate(p.from)}–{fmtDate(p.to)}</span><Badge tone={p.status === 'Approved' ? 'ok' : 'bad'}>{p.status}</Badge></div>)}</Card>
      </div>
      <div className="flex flex-col gap-3"><div className="text-xs text-muted flex items-center gap-1"><Smartphone className="size-3.5" />Phone view {!meId && <>· request as <select data-testid="pto-as" value={reqFor} onChange={e => setReqFor(e.target.value)} className="bg-surface-2 rounded px-1 max-w-40">{db.employees.filter(e => e.status === 'Active').slice(0, 60).map(e => <option key={e.id} value={e.id}>{e.first} {e.last}</option>)}</select></>}</div>
        <div className="rounded-[36px] border-[10px] border-surface-3 bg-surface p-4"><PtoRequestForm key={reqFor} empId={reqFor} /></div></div>
    </div>
    {confirm && cov && <Modal open onClose={() => setConfirm(null)} title="Crew coverage warning" sub={`${name(confirm.employeeId)} · ${fmtDate(confirm.from)} – ${fmtDate(confirm.to)}`}>
      <div className="flex flex-col gap-3 text-sm" data-testid="pto-coverage">
        {(() => { const b = ptoBalance(confirm.employeeId), o = Math.max(0, confirm.hours - (confirm.kind === 'Sick' ? b.sick : b.vacation)); return o > 0 ? <div className="rounded-xl bg-bad/10 p-3" data-testid="pto-over-confirm"><b className="text-bad">{o}h over the {confirm.kind === 'Sick' ? 'sick' : 'vacation'} balance.</b> Approving pays the balance and marks the other {o}h as unpaid.</div> : null })()}
        {cov.sched.length > 0 && <div className="rounded-xl bg-warn/10 p-3"><b className="text-warn">Scheduled on {cov.sched.length} day(s):</b> {[...new Set(cov.sched.map(a => db.jobs.find(j => j.id === a.jobId)?.jobNo))].map(n => `#${n}`).join(', ')} — Dispatch will be asked to pick a replacement.</div>}
        <div>{cov.out.length} of {cov.sameCraft.length} {cov.craft}s at this branch already out these dates{cov.out.length ? `: ${cov.out.map(e => e.first).join(', ')}` : ''}.</div>
        <div>Free to cover: {cov.free.length ? cov.free.slice(0, 5).map(e => `${e.first} ${e.last}`).join(', ') : <b className="text-bad">nobody</b>}</div>
        <div className="flex justify-end gap-2 mt-2"><Button onClick={() => setConfirm(null)}>Cancel</Button><Button variant="primary" data-testid="pto-approve-anyway" onClick={() => approve(confirm)}>Approve anyway</Button></div></div></Modal>}
  </div>
}
