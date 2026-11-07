import { DeleteJobButton } from './DeleteJob'
import { CrewCertsButton } from './CertSend'
import SiteMemory from '../batch3b/SiteMemory'
import { useMemo, useRef, useState } from 'react'
import { Navigation, Share2, Camera, FileText, Check, Users, Clock, AlertTriangle, Siren, Ruler } from 'lucide-react'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, customerOf, siteOf, crewOn, fullName, jobConflicts, requiredPositions } from '../data/logic'
import { today, fmtDate, fmtLong, range, dow, cn, money, uid } from '../lib/util'
import { Badge, Button, CallButton, Segmented, Kv, Avatar, Progress, confirmChoice } from './ui'
import { EmpRef, EqRef, JOB_STATUS_TONE, DivisionChip, BranchChip } from './bits'
import JobCostPanel, { HealthPill } from './JobCost'
import { jobCosting } from '../data/logic'
import WindJobCard from './WindJob'
import FixCrew, { type FixTarget } from './FixCrew'
import { absenceOn } from '../data/logic'
import { isOpen, openQty } from '../data/invcore'
import { CheckinFlow, Thumb } from './inv/kit'
import { useJobLocal, siteSupervisor } from '../field/jobFacts'
import JobUnits from './JobUnits'
import JobRig from './JobRig'
import { RescheduleButton, JobLog } from './Reschedule'
import { jobCranes } from '../data/rig'
import JobExtras, { BillingReviewList } from './JobExtras'

const STAGES: T.JobStage[] = ['Quote', 'Awarded', 'Scheduled', 'In Progress', 'Complete', 'Invoiced', 'Paid']
export const navUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

export function liftCheck(job: T.Job, crane?: T.Equipment) {
  if (!job.lift || !crane?.capacity) return null
  const capAtR = crane.capacity * Math.pow(20 / Math.max(20, job.lift.radius), 0.75)
  const pct = (job.lift.load + job.lift.rigging) / capAtR
  return { capAtR, pct, tone: pct < 0.75 ? 'ok' : pct < 0.9 ? 'warn' : 'bad' } as const
}

export function StageTrack({ stage, status }: { stage: T.JobStage; status?: T.JobStatus }) {
  const i = STAGES.indexOf(stage)
  return (
    <div className="flex items-center gap-1">
      {STAGES.map((s, k) => (
        <div key={s} className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className={cn('h-1.5 rounded-full', k < i ? 'bg-accent' : k === i ? 'bg-accent blink' : 'bg-surface-3')} />
          <div className={cn('text-[10px] font-semibold truncate', k === i ? 'text-ink' : 'text-faint')}>{s === 'In Progress' && status === 'On Site' ? 'On site' : s}{s === 'In Progress' && status === 'Delayed' && k === i ? <span className="ml-1 text-warn">· delayed</span> : null}</div>
        </div>
      ))}
    </div>
  )
}

export default function JobView({ job, initialTab }: { job: T.Job; initialTab?: 'overview' | 'crew' | 'cost' | 'docs' | 'tickets' }) {
  const db = useStore(s => s.db)
  const jobLocal = useJobLocal(job) // same answer as the field app (turbine county → local)
  const role = useStore(s => s.session!.role)
  const setUI = useStore(s => s.setUI)
  const [fix, setFix] = useState<FixTarget | null>(null)
  const [tab, setTab] = useState<'overview' | 'crew' | 'cost' | 'docs' | 'tickets'>(initialTab ?? 'overview')
  const c = customerOf(db, job), site = siteOf(db, job)
  const crane = byId(db.equipment, job.craneId)
  const t = today()
  const day = t >= job.startDate && t <= job.endDate ? t : job.startDate
  const crew = crewOn(db, job.id, day)
  const conflicts = jobConflicts(db, job, day)
  const sales = byId(db.employees, job.quote.salesId)
  const lc = liftCheck(job, crane)
  const showMoney = ['owner', 'ops', 'accounting'].includes(role)
  const jc = useMemo(() => jobCosting(db, job), [db, job])
  const tickets = db.tickets.filter(x => x.jobId === job.id).sort((a, b) => b.date.localeCompare(a.date))
  const cfg = byId(db.configs, job.configId)
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={JOB_STATUS_TONE[job.status]} dot>{job.status}</Badge>
        <Badge>{job.type}</Badge>
        <DivisionChip id={job.divisionId} /><BranchChip id={job.branchId} />
        {showMoney && jc.health !== 'pending' && <HealthPill health={jc.health} />}
      </div>
      <StageTrack stage={job.stage} status={job.status} />
      <Leftovers job={job} />
      <FixCrew target={fix} onClose={() => setFix(null)} />
      <Segmented value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'crew', label: 'Crew' }, ...(showMoney ? [{ value: 'cost' as const, label: 'Job cost' }] : []), { value: 'docs', label: 'Docs', count: job.docs.length }, { value: 'tickets', label: 'Tickets', count: tickets.length }]} />

      {tab === 'overview' && (
        <div className="flex flex-col gap-4">
          <SiteMemory siteId={job.siteId} compact />
          {conflicts.length > 0 && (
            <div className="rounded-2xl border border-bad/30 bg-bad/[.06] p-4">
              {conflicts.map((x, i) => <div key={i} className={cn('flex items-center gap-2 text-sm py-0.5', x.level === 'red' ? 'text-bad' : 'text-warn')}><AlertTriangle className="size-4 shrink-0" />{x.text}</div>)}
            </div>
          )}
          <div className="card p-5">
            <div className="label">Site</div>
            <div className="display text-xl font-semibold mt-1">{site.name}</div>
            <div className="text-sm text-muted">{site.city}, {site.state} · {site.gate}</div>
            <div className="flex flex-wrap gap-2 mt-4">
              <a href={navUrl(site.lat, site.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-info/15 text-info font-semibold text-sm"><Navigation className="size-4" />Navigate</a>
              <CallButton phone={c.phone} label={`${c.contact} (site)`} />
              {sales && <CallButton phone={sales.phone} label={`Sales · ${sales.first}`} variant="ghost" />}
            </div>
            <div className="mt-4 text-sm text-muted">Nearest hospital: {site.hospital}</div>
          </div>
          <WindJobCard job={job} />
          <div className="card p-5">
            <Kv k="Customer" v={c.name} />
            <Kv k="Dates" v={<span className="inline-flex flex-wrap items-center gap-2"><span data-testid="job-dates">{`${fmtDate(job.startDate)} → ${fmtDate(job.endDate)} · ${job.shift} shift · start ${job.startTime}`}</span><RescheduleButton job={job} /></span>} />
            <Kv k={jobCranes(job).length > 1 ? `Cranes (${jobCranes(job).length})` : 'Crane'} v={crane ? <span className="inline-flex flex-wrap gap-x-2 gap-y-1" data-testid="job-cranes">{jobCranes(job).map(c => <EqRef key={c} id={c} />)}</span> : 'No crane (crew job)'} />
            {cfg && <Kv k="Configuration" v={`${cfg.name} · ${cfg.loads ? cfg.loads.reduce((s, l) => s + l.n, 0) : job.trailerIds.length} loads (${job.trailerIds.length} ours${cfg.loads ? ` + ${Math.max(0, cfg.loads.reduce((s, l) => s + l.n, 0) - job.trailerIds.length)} third-party` : ''})`} />}
            {!cfg && job.trailerIds.length > 0 && <Kv k="Trailers" v={job.trailerIds.map(id => byId(db.equipment, id)?.unit).join(', ')} />}
            <Kv k="Extra equipment" v={job.extraEquipment.join(', ') || '—'} />
            <Kv k="Required certs" v={job.requiredCerts.join(', ')} />
            <Kv k="Supervisor" v={<EmpRef id={siteSupervisor(db, job, today())?.id ?? job.supervisorId} />} />
            <Kv k="Project manager" v={<EmpRef id={job.pmId} />} />
            <Kv k="Union / local" v={jobLocal} />
            {showMoney && <Kv k="Day rate · Quote" v={`${money(job.dayRate)}/day · ${money(job.quote.revenue)}`} />}
            {job.invoiceNo && <Kv k="Invoice" v={job.invoiceNo} />}
          </div>
          <JobUnits job={job} />
          <JobExtras job={job} />
          {showMoney && <BillingReviewList jobId={job.id} compact />}
          <JobRig job={job} />
          <JobLog job={job} />
          {job.lift && crane && lc && (
            <div className="card p-5">
              <div className="flex items-center justify-between"><div className="font-semibold">Lift plan & load chart check</div><Badge tone={job.liftPlan === 'Approved' ? 'ok' : job.liftPlan === 'Missing' ? 'bad' : 'warn'}>{job.liftPlan}</Badge></div>
              <div className="grid grid-cols-4 gap-3 mt-4 text-center">
                {[['Load', `${job.lift.load} t`], ['Rigging', `${job.lift.rigging} t`], ['Radius', `${job.lift.radius} ft`], ['Boom', `${job.lift.boom} ft`]].map(([k, v]) => <div key={k} className="card-flat py-3"><div className="text-[10px] text-muted font-semibold uppercase tracking-wider">{k}</div><div className="display text-lg font-semibold num">{v}</div></div>)}
              </div>
              <div className="mt-4 flex items-center gap-3"><span className="text-sm text-muted w-28">Chart capacity</span><Progress value={lc.pct * 100} tone={lc.tone} className="flex-1 h-2.5" /><span className={cn('num font-semibold text-sm', lc.tone === 'ok' ? 'text-ok' : lc.tone === 'warn' ? 'text-warn' : 'text-bad')}>{Math.round(lc.pct * 100)}%</span></div>
              <div className="text-[11px] text-faint mt-2">{Math.round(lc.capAtR)} t at {job.lift.radius} ft (demo approximation) — always verify against the OEM load chart and the engineered lift plan.</div>
              {['owner', 'ops', 'dispatch', 'safety'].includes(role) && <Button size="sm" className="mt-3" icon={<Ruler className="size-4" />} data-testid="open-lift" onClick={() => { sessionStorage.setItem('lift-sel', job.id); useStore.getState().go('lifts') }}>Open lift plan · ground bearing</Button>}
            </div>
          )}
          <div className="card p-5"><div className="label mb-2">Notes</div><div className="text-[15px]">{job.notes}</div></div>
          {['owner', 'dispatch', 'ops'].includes(role) && (
            <div className="flex flex-wrap gap-2">
              {job.stage === 'Quote' && <Button variant="primary" onClick={() => actions.setStage(job.id, 'Awarded')}>Mark awarded</Button>}
              {job.stage === 'Awarded' && <Button variant="primary" onClick={() => { actions.setStage(job.id, 'Scheduled'); toast.success('Scheduled — it’s on the dispatch board') }}>Schedule it</Button>}
              {job.stage === 'Scheduled' && job.status !== 'En Route' && <Button onClick={() => actions.setJobStatus(job.id, 'En Route')}>Mark en route</Button>}
              {(job.stage === 'Scheduled' || job.stage === 'In Progress') && job.status !== 'On Site' && <Button onClick={() => { actions.setJobStatus(job.id, 'On Site'); actions.setStage(job.id, 'In Progress') }}>Mark on site</Button>}
              {job.stage === 'In Progress' && <Button data-testid="job-complete" onClick={async () => {
                // Billing waits on signed tickets — say why before closing the job out.
                const db0 = useStore.getState().db, tk = db0.tickets.filter(t => t.jobId === job.id)
                const unsigned = tk.filter(t => !t.signedAt && !t.signerName), signedDays = new Set(tk.filter(t => t.signedAt || t.signerName).map(t => t.date))
                const worked = range(job.startDate, today() < job.endDate ? today() : job.endDate)
                const missing = worked.filter(d => !tk.some(t => t.date === d))
                const early = today() < job.endDate
                if (unsigned.length || missing.length || early) {
                  const r = await confirmChoice(`Complete #${job.jobNo}?`, <div className="flex flex-col gap-1 text-sm" data-testid="complete-reasons">
                    {unsigned.length > 0 && <div className="text-bad">• {unsigned.length} ticket{unsigned.length > 1 ? 's' : ''} not signed by the customer ({unsigned.map(t => fmtDate(t.date)).join(', ')}) — can’t invoice until signed.</div>}
                    {missing.length > 0 && <div className="text-warn">• No ticket for {missing.length} worked day{missing.length > 1 ? 's' : ''} ({missing.slice(0, 5).map(d => fmtDate(d)).join(', ')}{missing.length > 5 ? '…' : ''}) — those days won’t be billed.</div>}
                    {early && <div className="text-warn">• Scheduled through {fmtDate(job.endDate)} — completing early frees the crew and crane.</div>}
                    <div className="text-muted mt-1">Invoice will bill {signedDays.size} signed ticket day{signedDays.size === 1 ? '' : 's'}.</div></div>,
                    [{ label: 'Complete anyway', value: 'go', tone: 'primary' }, { label: 'Not yet', value: 'no' }])
                  if (r?.value !== 'go') return
                }
                actions.setJobStatus(job.id, 'Complete')
              }}>Complete job</Button>}
              <Button variant="ghost" icon={<Share2 className="size-4" />} data-testid="status-link" onClick={() => { const url = `${location.origin}${location.pathname}?status=${job.jobNo}`; navigator.clipboard?.writeText(url).catch(() => {}); toast.success('Customer status link copied', { description: 'Live stage, crane ETA and signed tickets — no prices.', action: { label: 'Preview', onClick: () => window.open(url, '_blank') } }) }}>Customer status link</Button>
              {role !== 'ops' && <Button variant="ghost" icon={<Siren className="size-4" />} onClick={() => setUI({ breakdownOpen: true, breakdownUnit: crane?.id })}>Breakdown</Button>}
              {role !== 'guest' && <DeleteJobButton job={job} />}
            </div>
          )}
        </div>
      )}

      {tab === 'crew' && (
        <div className="flex flex-col gap-4">
          {['dispatch', 'ops', 'owner', 'safety', 'branch'].includes(useStore.getState().session?.role ?? '') && <div className="flex justify-end -mb-2"><CrewCertsButton job={job} /></div>}
          <div className="card p-0 overflow-hidden">
            <div className="px-5 pt-4 pb-2 flex items-center justify-between"><div className="font-semibold">{day === t ? 'Today' : fmtLong(day)}</div><span className={cn('text-xs font-semibold', crew.filter(a => !absenceOn(db, a.employeeId, day)).length < requiredPositions(job, day).length ? 'text-bad' : 'text-muted')}>{crew.filter(a => !absenceOn(db, a.employeeId, day)).length}/{requiredPositions(job, day).length} filled</span></div>
            {crew.map(a => { const e = byId(db.employees, a.employeeId)!; const ab = absenceOn(db, e.id, day); return (
              <div key={a.id} className={cn('flex items-center gap-3 px-5 py-3 border-t hairline', ab && 'bg-bad/[.07]')} data-testid={ab ? 'crew-absent' : undefined}>
                <Avatar name={fullName(e)} size={36} />
                <div className="flex-1 min-w-0"><EmpRef id={e.id} className="font-semibold" /><div className={cn('text-xs', ab ? 'text-bad font-semibold' : 'text-muted')}>{a.position} · {ab ? `On ${ab.kind} — replace` : a.source}</div></div>
                {ab ? <Button size="sm" variant="primary" data-testid="fix-btn" onClick={() => setFix({ jobId: job.id, empId: e.id, position: a.position, date: day })}>Fix</Button> : <CallButton phone={e.phone} size="sm" label="Call" />}
              </div>
            ) })}
            {crew.length === 0 && <div className="px-5 py-6 text-sm text-muted border-t hairline">No crew assigned for this day.</div>}
          </div>
          <div className="card p-4 overflow-x-auto">
            <div className="label mb-3">Schedule</div>
            <table className="text-xs w-full">
              <thead><tr>{range(job.startDate, job.endDate).slice(0, 14).map(d => <th key={d} className={cn('px-1 py-1 font-semibold', d === t ? 'text-accent' : 'text-muted')}>{dow(d)}<br />{fmtDate(d)}</th>)}</tr></thead>
              <tbody><tr>{range(job.startDate, job.endDate).slice(0, 14).map(d => { const n = crewOn(db, job.id, d).filter(a => !absenceOn(db, a.employeeId, d)).length, need = requiredPositions(job, d).length; return <td key={d} className="px-1 py-1 text-center"><span className={cn('inline-grid place-items-center size-8 rounded-lg font-semibold num', n >= need ? 'bg-ok/15 text-ok' : n ? 'bg-warn/15 text-warn' : 'bg-surface-2 text-faint')}>{n}/{need}</span></td> })}</tr></tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'cost' && showMoney && <JobCostPanel job={job} />}

      {tab === 'docs' && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Button icon={<Camera className="size-4" />} onClick={() => fileRef.current?.click()}>Add photo / file</Button>
            <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={e => {
              const f = e.target.files?.[0]; if (!f) return
              const rd = new FileReader(); rd.onload = () => { actions.updateJob(job.id, { docs: [...job.docs, { id: uid('doc'), name: f.name, kind: f.type.startsWith('image') ? 'Photo' : 'Drawing', added: today(), by: useStore.getState().session?.name ?? '', dataUrl: f.size < 400000 ? String(rd.result) : undefined }] }, 'Uploaded document'); toast.success('Added to job vault') }; rd.readAsDataURL(f)
            }} />
          </div>
          {job.docs.map(d => (
            <div key={d.id} className="card p-4 flex items-center gap-3">
              {d.dataUrl && d.kind === 'Photo' ? <img src={d.dataUrl} className="size-12 rounded-xl object-cover" /> : <span className="grid size-12 place-items-center rounded-xl bg-surface-2"><FileText className="size-5 text-muted" /></span>}
              <div className="flex-1 min-w-0"><div className="font-semibold truncate">{d.name}</div><div className="text-xs text-muted">{d.kind} · {fmtDate(d.added)} · {d.by}</div></div>
              <Badge>{d.kind}</Badge>
            </div>
          ))}
        </div>
      )}

      {tab === 'tickets' && (
        <div className="flex flex-col gap-2">
          {tickets.map(tk => (
            <div key={tk.id} className="card p-4">
              <div className="flex items-center gap-2"><div className="font-semibold">{fmtLong(tk.date)}</div><span className="ml-auto">{tk.signerName ? <Badge tone="ok"><Check className="size-3" />Signed</Badge> : <Badge tone="warn">Needs signature</Badge>}</span></div>
              <div className="text-sm text-muted mt-1">{tk.work}</div>
              <div className="text-xs text-faint mt-2 flex flex-wrap gap-3"><span className="inline-flex items-center gap-1"><Users className="size-3" />{tk.crewIds.length} crew</span><span className="inline-flex items-center gap-1"><Clock className="size-3" />{Object.values(tk.hours).reduce((s, h) => s + (h ?? 0), 0)} hrs</span>{tk.signerName && <span>Signed by {tk.signerName}</span>}<span>{tk.pctComplete}% complete</span></div>
              {tk.signature && <img src={tk.signature} className="mt-3 h-14 rounded-lg bg-white p-1" alt="signature" />}
            </div>
          ))}
          {tickets.length === 0 && <div className="text-sm text-muted py-8 text-center">No tickets yet.</div>}
        </div>
      )}
    </div>
  )
}

/** When a job wraps up, everything still checked out to it is listed for return (credits flow back to the job). */
function Leftovers({ job }: { job: T.Job }) {
  const db = useStore(s => s.db)
  const [ci, setCi] = useState<string | null | undefined>(undefined)
  const outs = db.checkouts.filter(c => c.jobId === job.id && isOpen(c))
  const done = job.status === 'Complete' || ['Complete', 'Invoiced', 'Paid'].includes(job.stage) || job.closedOut
  if (!outs.length) return null
  const value = outs.reduce((s, c) => s + openQty(c) * (c.unitCost ?? 0), 0)
  return <div className={cn('rounded-2xl p-4 border', done ? 'border-warn/50 bg-warn/10' : 'hairline bg-surface-2')} data-testid="leftovers">
    <div className="flex items-center gap-3 mb-2"><span className="font-semibold flex-1">{done ? 'Return leftovers' : 'Inventory checked out to this job'}</span><span className="text-sm text-muted num">{outs.length} open · {money(value)}</span>{done && <Button size="sm" variant="primary" onClick={() => setCi(null)} data-testid="leftovers-return">Return leftovers</Button>}</div>
    <div className="flex flex-col gap-1">{outs.slice(0, done ? 12 : 4).map(c => { const it = byId(db.items, c.itemId); return it ? <button key={c.id} onClick={() => setCi(c.id)} className="flex items-center gap-3 text-sm text-left rounded-xl hover:bg-surface px-1 py-1"><Thumb item={it} size={28} /><span className="flex-1 truncate">{openQty(c)} {it.unit} × {it.name}</span><span className="text-xs text-muted">{c.byName}</span></button> : null })}</div>
    <CheckinFlow open={ci !== undefined} onClose={() => setCi(undefined)} checkoutId={ci ?? undefined} jobId={job.id} />
  </div>
}
