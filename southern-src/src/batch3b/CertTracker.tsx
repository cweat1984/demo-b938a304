import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, BellRing, UserCheck, UserX, ArrowRightLeft, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge } from '../components/ui'
import { useStore, actions } from '../data/store'
import { fullName, certBand } from '../data/logic'
import { crewIdsOn } from '../data/certshare'
import { cn, fmtDate, today, iso } from '../lib/util'
import { useB3 } from './b3store'
import { ncccoCard, catFor } from '../gapA/nccco'
import type * as T from '../data/types'

/** Is employee current on every required cert through the job's end date? */
export function clearance(db: T.DB, empId: string, job: T.Job) {
  return [...certClear(db, empId, job), ...ncccoClear(db, empId, job)]
}
/** NCCCO (gap batch A): an operator must hold the category for this job's crane, current through the job's end date. */
function ncccoClear(db: T.DB, empId: string, job: T.Job) {
  const e = db.employees.find(x => x.id === empId), crane = db.equipment.find(x => x.id === job.craneId)
  const cat = catFor(crane); if (!e || e.craft !== 'Operator' || !cat) return []
  const card = ncccoCard(db, empId), has = !!card && card.cats.includes(cat)
  const ok = has && card!.expires >= job.endDate
  return [{ type: `NCCCO ${cat}` as T.CertType, cert: undefined as T.Cert | undefined, ok, why: !card ? 'No NCCCO card on file' : !has ? `NCCCO card has no ${cat} category for Crane ${crane!.unit}` : ok ? '' : `NCCCO recert due ${fmtDate(card.expires)}, before the job ends` }]
}
function certClear(db: T.DB, empId: string, job: T.Job) {
  return job.requiredCerts.map(type => { const c = db.certs.filter(x => x.employeeId === empId && x.type === type && x.verified !== 'Rejected').sort((a, b) => b.expires.localeCompare(a.expires))[0]
    return { type, cert: c, ok: !!c && c.expires >= job.endDate, why: !c ? `No ${type} on file` : c.expires < today() ? `${type} expired ${fmtDate(c.expires)}` : c.expires < job.endDate ? `${type} expires ${fmtDate(c.expires)}, the job runs to ${fmtDate(job.endDate)}` : '' } })
}

export default function CertTracker() {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Cale Smith'
  const reminders = useB3(s => s.reminders)
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [day, setDay] = useState<string | null>(null)
  const empName = (id: string) => fullName(db.employees.find(e => e.id === id))
  const bands = useMemo(() => { const b = { expired: 0, '30': 0, '60': 0, '90': 0 } as Record<string, number>; db.certs.forEach(c => { const x = certBand(c).band; if (x in b) b[x]++ }); return b }, [db.certs])
  const days = useMemo(() => { const first = new Date(m), start = new Date(first); start.setDate(1 - first.getDay()); return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return iso(d) }) }, [m])
  const byDay = useMemo(() => { const map = new Map<string, T.Cert[]>(); db.certs.forEach(c => { if (days.includes(c.expires)) map.set(c.expires, [...(map.get(c.expires) ?? []), c]) }); return map }, [db.certs, days])
  const remind = (c: T.Cert) => { useB3.getState().remind({ certId: c.id, at: new Date().toISOString(), to: empName(c.employeeId) }); toast.success(`Reminder sent to ${empName(c.employeeId)} + supervisor (demo)`, { description: `${c.type} expires ${fmtDate(c.expires)}` }) }
  const reminded = (id: string) => reminders.some(r => r.certId === id)
  const soon = db.certs.filter(c => { const b = certBand(c).band; return b === '30' || b === '60' }).sort((a, b) => a.expires.localeCompare(b.expires))
  // who's current
  const jobs = useMemo(() => db.jobs.filter(j => j.status !== 'Complete' && j.requiredCerts.length && j.endDate >= today()).sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 60), [db.jobs])
  const [jobId, setJobId] = useState(() => jobs.find(j => crewIdsOn(db, j).some(id => clearance(db, id, j).some(c => !c.ok)))?.id ?? jobs[0]?.id)
  const job = db.jobs.find(j => j.id === jobId)
  const crew = job ? crewIdsOn(db, job) : []
  const busy = new Set(job ? db.assignments.filter(a => a.date >= job.startDate && a.date <= job.endDate).map(a => a.employeeId) : [])
  const replacements = job ? db.employees.filter(e => e.status === 'Active' && !crew.includes(e.id) && !busy.has(e.id) && clearance(db, e.id, job).every(c => c.ok)).slice(0, 6) : []
  return <div className="flex flex-col gap-5" data-testid="cert-tracker">
    <PageHeader eyebrow="Safety" title="Cert tracker" sub="Expirations, reminders, and who is current for each job — through its end date." actions={<Button icon={<BellRing className="size-4" />} data-testid="cert-remind-all" onClick={() => { soon.filter(c => !reminded(c.id)).forEach(remind) }}>Remind everyone ≤ 60 days ({soon.filter(c => !reminded(c.id)).length})</Button>} />
    <div className="grid grid-cols-4 gap-3">{([['expired', 'Expired', 'bad'], ['30', '≤ 30 days', 'bad'], ['60', '≤ 60 days', 'warn'], ['90', '≤ 90 days', 'info']] as const).map(([k, l, t]) => <Card key={k} className="!p-4"><div className="text-xs text-muted">{l}</div><div className={cn('text-3xl font-semibold', t === 'bad' ? 'text-bad' : t === 'warn' ? 'text-warn' : 'text-info')}>{bands[k]}</div></Card>)}</div>
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5 items-start">
      <Card data-testid="cert-calendar"><div className="flex items-center gap-2 mb-3"><CalendarDays className="size-4" /><div className="font-semibold flex-1">{m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div><button aria-label="Previous month" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><ChevronLeft className="size-4" /></button><button aria-label="Next month" data-testid="cal-next" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="size-8 grid place-items-center rounded-lg hover:bg-surface-2"><ChevronRight className="size-4" /></button></div>
        <div className="grid grid-cols-7 gap-1 text-[11px] text-muted mb-1">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="text-center">{d}</div>)}</div>
        <div className="grid grid-cols-7 gap-1">{days.map(d => { const cs = byDay.get(d) ?? [], inM = new Date(d + 'T12:00').getMonth() === m.getMonth(); const exp = d < today()
          return <button key={d} data-testid={cs.length ? 'cal-day-hit' : undefined} onClick={() => setDay(d)} className={cn('aspect-square rounded-lg p-1 text-left text-xs flex flex-col', inM ? 'bg-surface-2' : 'opacity-35', d === today() && 'ring-1 ring-accent', day === d && 'ring-2 ring-ink')}><span>{Number(d.slice(8))}</span>{cs.length > 0 && <span className={cn('mt-auto rounded px-1 text-[10px] font-bold text-white', exp ? 'bg-bad' : 'bg-warn')}>{cs.length}</span>}</button> })}</div>
        {day && <div className="mt-4 flex flex-col divide-y hairline">{(byDay.get(day) ?? []).length ? (byDay.get(day) ?? []).map(c => <div key={c.id} className="py-2 flex items-center gap-3 text-sm"><span className="flex-1"><b>{empName(c.employeeId)}</b> · {c.type}</span>{reminded(c.id) ? <Badge tone="ok">Reminded</Badge> : <Button size="sm" onClick={() => remind(c)}>Remind</Button>}</div>) : <div className="text-sm text-muted py-2">No expirations on {fmtDate(day)}.</div>}</div>}
      </Card>
      <Card><div className="font-semibold mb-2">Reminders · next 60 days</div><div className="flex flex-col divide-y hairline max-h-[420px] overflow-auto">{soon.slice(0, 25).map(c => <div key={c.id} className="py-2 flex items-center gap-3 text-sm" data-testid="cert-soon"><span className="flex-1"><b>{empName(c.employeeId)}</b> · {c.type}<div className="text-xs text-muted">expires {fmtDate(c.expires)} · {certBand(c).days} days</div></span>{reminded(c.id) ? <Badge tone="ok">Reminded</Badge> : <Button size="sm" data-testid="cert-remind" icon={<BellRing className="size-3.5" />} onClick={() => remind(c)}>Remind</Button>}</div>)}</div><div className="text-xs text-muted mt-2">At 60 days the person and their supervisor are notified and the next class is suggested for dispatch as Training.</div></Card>
    </div>
    <Card data-testid="who-current"><div className="flex items-center gap-3 flex-wrap"><div className="font-semibold flex-1">Who is current for this job</div><select data-testid="wc-job" value={jobId} onChange={e => setJobId(e.target.value)} className="h-10 rounded-xl bg-surface-2 px-3 text-sm max-w-96">{jobs.map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {j.name} (to {fmtDate(j.endDate)})</option>)}</select></div>
      {job && <><div className="text-xs text-muted mt-1">Requires {job.requiredCerts.join(', ')} · checked through {fmtDate(job.endDate)}</div>
        <div className="mt-3 flex flex-col divide-y hairline">{crew.length ? crew.map(id => { const cl = clearance(db, id, job), ok = cl.every(c => c.ok)
          return <div key={id} className="py-2.5 flex items-start gap-3 text-sm" data-testid="wc-row"><span className={cn('mt-0.5', ok ? 'text-ok' : 'text-bad')}>{ok ? <UserCheck className="size-4" /> : <UserX className="size-4" />}</span><div className="flex-1"><b>{empName(id)}</b><div className="flex flex-wrap gap-1 mt-1">{cl.map(c => <Badge key={c.type} tone={c.ok ? 'ok' : 'bad'}>{c.type}{c.cert ? ` · ${fmtDate(c.cert.expires, { month: 'short', day: 'numeric', year: '2-digit' })}` : ' · none'}</Badge>)}</div>{!ok && <div className="text-xs text-bad mt-1">{cl.filter(c => !c.ok).map(c => c.why).join(' · ')}</div>}</div>
            {!ok && replacements[0] && <Button size="sm" icon={<ArrowRightLeft className="size-3.5" />} data-testid="wc-replace" onClick={() => { const pos = db.assignments.find(a => a.jobId === job.id && a.employeeId === id)?.position; const dates = db.assignments.filter(a => a.jobId === job.id && a.employeeId === id).map(a => a.date); if (pos && dates.length) { actions.replaceCrew(job.id, id, replacements[0].id, pos, dates); toast.success(`${empName(id)} → ${fullName(replacements[0])}`, { description: `By ${who} · logged in audit` }) } }}>Swap for {replacements[0].first}</Button>}</div> }) : <div className="text-sm text-muted py-2">No crew assigned yet.</div>}</div>
        <div className="mt-4"><div className="label mb-2">Qualified & available replacements</div><div className="flex flex-wrap gap-2" data-testid="wc-replacements">{replacements.length ? replacements.map(e => <span key={e.id} className="rounded-full bg-ok/10 text-ok px-3 py-1 text-xs font-semibold">{fullName(e)} · {e.craft}</span>) : <span className="text-sm text-muted">No one else is current and free for these dates.</span>}</div></div></>}
    </Card>
  </div>
}
