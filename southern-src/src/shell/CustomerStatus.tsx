import { CheckCircle2, Phone, Truck, MapPin, FileSignature, ShieldCheck, Radio, Clock } from 'lucide-react'
import { useCompany } from '../data/brand'
import { useStore } from '../data/store'
import { byId, customerOf, siteOf, fullName, crewOn } from '../data/logic'
import { fmtDate, today, cn, timeAgo } from '../lib/util'
import { Logo } from './Splash'
import FleetMap from '../components/FleetMap'

const STEPS = ['Booked', 'Crane en route', 'On site', 'Work complete', 'Invoiced'] as const

/** What the customer sees from the status link: no login, no prices, just "where's my crane and how's it going". */
export default function CustomerStatus({ jobNo }: { jobNo: string }) {
  const db = useStore(s => s.db)
  const company = useCompany()
  const ready = useStore(s => s.ready)
  if (!ready) return null
  const job = db.jobs.find(j => j.jobNo === jobNo)
  if (!job) return <div className="min-h-screen grid place-items-center text-muted">This status link has expired.</div>
  const crane = byId(db.equipment, job.craneId)
  const site = siteOf(db, job), cust = customerOf(db, job)
  const step = job.stage === 'Invoiced' || job.stage === 'Paid' ? 4 : job.stage === 'Complete' || job.status === 'Complete' ? 3 : job.status === 'On Site' || job.stage === 'In Progress' ? 2 : job.status === 'En Route' || crane?.route ? 1 : 0
  const tickets = db.tickets.filter(t => t.jobId === job.id).sort((a, b) => b.date.localeCompare(a.date))
  const last = tickets[0]
  const sup = byId(db.employees, job.supervisorId), pm = byId(db.employees, job.pmId)
  const crew = crewOn(db, job.id, today())
  const pct = last?.pctComplete ?? (step >= 3 ? 100 : 0)
  return (
    <div className="min-h-screen bg-bg text-ink" data-testid="customer-status">
      <header className="flex items-center gap-3 px-5 py-4 border-b hairline max-w-3xl mx-auto"><Logo size={30} /><div className="flex-1"><div className="font-semibold">{company.name}</div><div className="text-xs text-muted">Job status for {cust.name}</div></div><span className="inline-flex items-center gap-1.5 rounded-full bg-ok/15 text-ok px-3 py-1 text-xs font-bold"><Radio className="size-3.5 blink" />Live</span></header>
      <main className="max-w-3xl mx-auto px-5 py-8 flex flex-col gap-5">
        <div><div className="label">Job #{job.jobNo}</div><h1 className="display text-4xl font-semibold tracking-tight mt-1">{job.name}</h1><div className="text-muted mt-1 flex items-center gap-1.5"><MapPin className="size-4" />{site.name} · {site.city}, {site.state} · {fmtDate(job.startDate)} – {fmtDate(job.endDate)}</div></div>
        <div className="card p-5">
          <div className="flex items-center gap-2">{STEPS.map((s, i) => <div key={s} className="flex-1 flex flex-col gap-2"><div className={cn('h-1.5 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-3')} /><div className={cn('text-[11px] font-semibold', i === step ? 'text-ink' : 'text-muted')}>{s}</div></div>)}</div>
          <div className="display text-2xl font-semibold mt-5">{STEPS[step]}{step === 2 && ` · ${pct}% complete`}</div>
          <div className="text-sm text-muted mt-1">{step === 1 && crane?.route ? `ETA ${new Date(crane.route.eta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${crane.route.fromName} → ${crane.route.toName}` : step === 0 ? `Crew reports ${fmtDate(job.startDate)} at ${job.startTime}.` : last ? `Last update ${timeAgo(last.submittedAt ?? last.date)} — ${last.work}` : ''}</div>
          {step >= 2 && step < 4 && <div className="h-2 rounded-full bg-surface-3 mt-4 overflow-hidden"><div className="h-full bg-ok-solid rounded-full transition-all" style={{ width: `${pct}%` }} /></div>}
        </div>
        {crane && <div className="card p-0 overflow-hidden"><FleetMap units={[crane]} branches={false} height={220} center={crane.route && crane.status === 'In Transit' ? [(crane.route.from[0] + crane.route.to[0]) / 2, (crane.route.from[1] + crane.route.to[1]) / 2] : [crane.lat, crane.lng]} zoom={crane.route ? 8 : 11} /></div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="card p-4 flex items-center gap-3"><Truck className="size-5 text-accent" /><div><div className="label">Equipment</div><div className="font-semibold">{crane ? `${crane.capacity}t ${crane.make} ${crane.model}` : 'Rigging crew'}</div></div></div>
          <div className="card p-4 flex items-center gap-3"><Clock className="size-5 text-accent" /><div><div className="label">Crew on site today</div><div className="font-semibold">{crew.length ? `${crew.length} hands${sup ? ` · lead ${sup.first} ${sup.last[0]}.` : ''}` : 'Not today'}</div></div></div>
          <div className="card p-4 flex items-center gap-3"><ShieldCheck className="size-5 text-ok" /><div><div className="label">Lift plan</div><div className="font-semibold">{job.liftPlan === 'Approved' ? 'Engineered & approved' : job.liftPlan === 'Not Required' ? 'Standard lift' : 'In engineering review'}</div></div></div>
          {(sup || pm) && <a href={`tel:${(sup ?? pm)!.phone}`} className="card p-4 flex items-center gap-3 hover:bg-surface-2"><Phone className="size-5 text-accent" /><div><div className="label">Your contact</div><div className="font-semibold">{fullName((pm ?? sup)!)} · {(pm ?? sup)!.phone}</div></div></a>}
        </div>
        <div className="card p-0 overflow-hidden"><div className="px-5 py-3 font-semibold flex items-center gap-2 border-b hairline"><FileSignature className="size-4" />Daily tickets</div>
          {tickets.length ? tickets.map(t => <div key={t.id} className="flex items-center gap-3 px-5 py-3 border-b hairline last:border-0 text-sm"><span className="w-20 num text-muted">{fmtDate(t.date)}</span><span className="flex-1 truncate">{t.work}</span><span className="num text-muted">{Object.values(t.hours).reduce((s, h) => s + (h ?? 0), 0)} h</span>{t.signedAt ? <span className="inline-flex items-center gap-1 text-ok text-xs font-semibold"><CheckCircle2 className="size-4" />Signed · {t.signerName}</span> : <span className="text-xs text-warn font-semibold">Awaiting your signature</span>}</div>) : <div className="px-5 py-4 text-sm text-muted">Tickets appear here at the end of each shift.</div>}
        </div>
        <div className="text-center text-xs text-muted">Updates live from the crew’s phones · no prices shown · link for {cust.contact}</div>
      </main>
    </div>
  )
}
