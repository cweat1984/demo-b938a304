import { useMemo } from 'react'
import { ChevronRight, Navigation } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName, certBand, customerOf, siteOf, jobCosting, agingBucket, groupProfit, isLive, inScope, MONTHS } from '../data/logic'
import { drill, drillRef } from '../data/drill'
import { today, fmtDate, fmtTs, money, cn } from '../lib/util'
import { Badge, Button, CallButton, Kv, Stat } from './ui'
import { EmpRef, JobRef, EqRef, CustRef, VendorRef, Ref } from './bits'
import { navUrl } from '../field/kit'
import { HealthPill } from './JobCost'
import { VendorPOs } from './inv/Purchasing'

const tone = (t?: string) => (t === 'bad' ? 'bg-bad' : t === 'warn' ? 'bg-warn' : t === 'ok' ? 'bg-ok' : 'bg-info')
export function RowLink({ to, children, right, dot }: { to?: T.EntityRef; children: React.ReactNode; right?: React.ReactNode; dot?: string }) {
  const open = useStore(s => s.open)
  const inner = <>{dot && <span className={cn('size-2 rounded-full shrink-0', tone(dot))} />}<span className="flex-1 min-w-0">{children}</span>{right && <span className="num text-sm font-semibold shrink-0">{right}</span>}{to && <ChevronRight className="size-4 text-faint shrink-0" />}</>
  return to ? <button onClick={() => open(to)} data-ref={to.type} className="w-full flex items-center gap-3 px-4 py-3 border-b hairline last:border-0 text-left hover:bg-surface-2 active:bg-surface-3 transition">{inner}</button> : <div className="flex items-center gap-3 px-4 py-3 border-b hairline last:border-0">{inner}</div>
}
const Title = ({ children }: { children: React.ReactNode }) => <div className="label mb-2 mt-1">{children}</div>

export function DrillView({ id }: { id: string }) {
  const db = useStore(s => s.db), f = useStore(s => s.ui.filter)
  const d = useMemo(() => drill(db, id, f), [db, id, f])
  return (
    <div className="flex flex-col gap-3" data-testid="drill">
      {d.total && <div className="card-flat p-4 flex items-baseline gap-3"><span className="label">Total</span><span className="display text-3xl font-semibold num">{d.total}</span></div>}
      <div className="card p-0 overflow-hidden">{d.items.length ? d.items.map((it, i) => <RowLink key={i} to={it.ref} right={it.right} dot={it.tone}><div className="font-semibold truncate">{it.label}</div>{it.sub && <div className="text-xs text-muted truncate">{it.sub}</div>}</RowLink>) : <div className="p-5 text-sm text-muted">Nothing here right now.</div>}</div>
    </div>
  )
}
export const drillTitle = (db: T.DB, id: string, f: { divisionId: string; branchId: string }) => { const d = drill(db, id, f); return { title: d.title, sub: d.sub } }

export function CustomerView({ c }: { c: T.Customer }) {
  const db = useStore(s => s.db)
  const jobs = db.jobs.filter(j => j.customerId === c.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const inv = db.invoices.filter(i => i.customerId === c.id)
  const open = inv.reduce((s, i) => s + i.amount - i.paid, 0)
  const hist = db.history.filter(h => h.customerId === c.id)
  const byYear = groupProfit(hist, h => String(h.year)).sort((a, b) => a.key.localeCompare(b.key))
  const life = hist.reduce((s, h) => s + h.revenue, 0)
  const marg = life ? hist.reduce((s, h) => s + h.revenue - h.cost, 0) / life : 0
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap"><Badge>{c.industry}</Badge>{open > 0 && <Badge tone="warn">{money(open)} open A/R</Badge>}</div>
      <div className="grid grid-cols-3 gap-3"><Stat label="Lifetime sales" value={money(life, true)} onClick={() => useStore.getState().open(drillRef(`hist:customer:${c.id}`))} /><Stat label="Margin" value={`${Math.round(marg * 100)}%`} /><Stat label="Jobs" value={jobs.length + hist.length} /></div>
      <div className="card p-4"><Kv k="Contact" v={<span className="inline-flex items-center gap-2">{c.contact}<CallButton phone={c.phone} size="sm" label="Call" /></span>} /><Kv k="Phone" v={c.phone} /></div>
      <div><Title>Sales by year</Title><div className="card p-0">{byYear.map(y => <RowLink key={y.key} to={drillRef(`year:${y.key}`)} right={money(y.revenue, true)}><div className="font-semibold">{y.key}</div><div className="text-xs text-muted">{Math.round(y.margin * 100)}% margin</div></RowLink>)}</div></div>
      <div><Title>Jobs</Title><div className="card p-0">{jobs.slice(0, 20).map(j => <RowLink key={j.id} to={{ type: 'job', id: j.id }} right={money(j.quote.revenue, true)}><div className="font-semibold truncate">#{j.jobNo} · {j.name}</div><div className="text-xs text-muted">{siteOf(db, j).name} · {fmtDate(j.startDate)} · {j.stage}</div></RowLink>)}{!jobs.length && <div className="p-4 text-sm text-muted">No active jobs.</div>}</div></div>
      <div><Title>Invoices</Title><div className="card p-0">{inv.map(i => <RowLink key={i.id} to={{ type: 'invoice', id: i.id }} right={money(i.amount)} dot={i.paid >= i.amount ? 'ok' : agingBucket(i) === 'Current' ? 'info' : 'warn'}><div className="font-semibold">{i.invNo}</div><div className="text-xs text-muted">Due {fmtDate(i.due)} · {agingBucket(i)}</div></RowLink>)}{!inv.length && <div className="p-4 text-sm text-muted">No invoices.</div>}</div></div>
    </div>
  )
}

export function VendorView({ v }: { v: T.Vendor }) {
  const db = useStore(s => s.db)
  const bills = db.bills.filter(b => b.vendorId === v.id)
  const total = bills.reduce((s, b) => s + b.lines.reduce((q, l) => q + l.amount, 0), 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3"><Stat label="Billed" value={money(total, true)} /><Stat label="Bills" value={bills.length} /></div>
      <div className="card p-4"><Kv k="Category" v={v.kind ?? v.category} />{v.contact && <Kv k="Contact" v={v.contact} />}{v.email && <Kv k="Email" v={v.email} />}{v.account && <Kv k="Our account #" v={v.account} />}{v.leadDays !== undefined && <Kv k="Lead time" v={`~${v.leadDays} days`} />}<Kv k="Terms" v={`Net ${v.terms}`} /><Kv k="Phone" v={<span className="inline-flex items-center gap-2">{v.phone}<CallButton phone={v.phone} size="sm" label="Call" /></span>} /></div>
      <VendorPOs vendorId={v.id} />
      <div><Title>Bills</Title><div className="card p-0">{bills.map(b => <RowLink key={b.id} to={{ type: 'bill', id: b.id }} right={money(b.lines.reduce((q, l) => q + l.amount, 0))} dot={b.status === 'Needs Coding' ? 'warn' : b.status === 'Paid' ? 'ok' : 'info'}><div className="font-semibold">{b.billNo}</div><div className="text-xs text-muted">{b.status} · due {fmtDate(b.due)}</div></RowLink>)}</div></div>
    </div>
  )
}

export function CertView({ c }: { c: T.Cert }) {
  const b = certBand(c)
  const role = useStore(s => s.session!.role)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2"><Badge tone={b.days < 0 ? 'bad' : b.days <= 30 ? 'warn' : b.days <= 90 ? 'info' : 'ok'}>{b.days < 0 ? `Expired ${-b.days}d ago` : `${b.days} days left`}</Badge><Badge tone={c.verified === 'Verified' ? 'ok' : c.verified === 'Rejected' ? 'bad' : 'warn'}>{c.verified}</Badge></div>
      <div className="card p-4"><Kv k="Employee" v={<EmpRef id={c.employeeId} />} /><Kv k="Credential #" v={c.credentialNo} /><Kv k="Provider" v={c.provider} /><Kv k="Issued" v={fmtDate(c.issued, { month: 'short', day: 'numeric', year: 'numeric' })} /><Kv k="Expires" v={fmtDate(c.expires, { month: 'short', day: 'numeric', year: 'numeric' })} /></div>
      {['safety', 'hr', 'owner'].includes(role) && <div className="flex gap-2"><Button variant="ok" onClick={() => actions.verifyCert(c.id, 'Verified')}>Verify</Button><Button onClick={() => actions.renewCert(c.id, `${Number(c.expires.slice(0, 4)) + (c.type.startsWith('NCCCO') ? 5 : 2)}${c.expires.slice(4)}`)}>Log renewal</Button></div>}
    </div>
  )
}

export function TicketView({ t }: { t: T.EodTicket }) {
  const db = useStore(s => s.db)
  const j = byId(db.jobs, t.jobId)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2"><Badge tone={t.status === 'Needs Correction' ? 'bad' : t.status === 'Signed' || t.status === 'Reviewed' ? 'ok' : 'info'}>{t.status}</Badge><Badge>{t.pctComplete}% complete</Badge>{t.photos > 0 && <Badge>{t.photos} photos</Badge>}</div>
      <div className="card p-4"><Kv k="Job" v={<JobRef id={t.jobId} long />} />{j && <Kv k="Customer" v={<CustRef id={j.customerId} />} />}<Kv k="Date" v={fmtDate(t.date)} /><Kv k="Supervisor" v={<EmpRef id={t.supervisorId} />} /><Kv k="Expected finish" v={fmtDate(t.expectedFinish)} /></div>
      <div className="card p-4 text-sm flex flex-col gap-2"><div><b>Work:</b> {t.work}</div>{t.delays && <div><b>Delays:</b> {t.delays}</div>}<div><b>Equipment in/out:</b> {t.equipmentIn} / {t.equipmentOut}</div><div className="flex flex-wrap gap-2">{Object.entries(t.hours).map(([k, v]) => <Badge key={k}>{k} {v}h</Badge>)}</div></div>
      <div><Title>Crew</Title><div className="card p-0">{t.crewIds.map(id => <RowLink key={id} to={{ type: 'employee', id }}>{fullName(byId(db.employees, id))}</RowLink>)}</div></div>
      {t.signature && <div className="card p-4"><div className="label mb-2">Customer signature</div><img src={t.signature} alt="Signature" className="bg-white rounded-xl h-28" /><div className="text-sm text-muted mt-2">{t.signerName}{t.signerTitle ? `, ${t.signerTitle}` : ''} · {t.signedAt && fmtTs(t.signedAt)}</div></div>}
    </div>
  )
}

export function TimeView({ e }: { e: T.TimeEntry }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2"><Badge tone={e.status === 'Flagged' ? 'bad' : e.status === 'Approved' || e.status === 'Exported' ? 'ok' : 'info'}>{e.status}</Badge><Badge>{e.activity}</Badge></div>
      <div className="grid grid-cols-3 gap-3"><Stat label="Hours" value={e.hours.toFixed(1)} /><Stat label="Start" value={e.start} /><Stat label="End" value={e.end} /></div>
      <div className="card p-4"><Kv k="Employee" v={<EmpRef id={e.employeeId} />} /><Kv k="Job" v={e.jobId ? <JobRef id={e.jobId} long /> : 'Shop / yard'} /><Kv k="Date" v={fmtDate(e.date)} /><Kv k="Meal" v={`${e.mealMin} min`} /><Kv k="Per diems" v={e.perDiems.length ? e.perDiems.join(', ') : 'None'} />{e.approvedBy && <Kv k="Approved by" v={e.approvedBy} />}<Kv k="Submitted" v={fmtTs(e.submittedAt)} />{e.note && <Kv k="Note" v={e.note} />}</div>
      {e.status === 'Submitted' && <Button variant="ok" onClick={() => actions.approveTime([e.id])}>Approve</Button>}
    </div>
  )
}

export function OrgView({ kind, id }: { kind: 'branch' | 'division'; id: string }) {
  const db = useStore(s => s.db)
  const setUI = useStore(s => s.setUI)
  const key = kind === 'branch' ? 'branchId' : 'divisionId'
  const jobs = db.jobs.filter(j => j[key] === id && isLive(j))
  const people = db.employees.filter(e => e[key] === id)
  const eq = db.equipment.filter(e => e[key] === id)
  const hist = db.history.filter(h => h[key] === id && h.year === new Date().getFullYear())
  const ytd = hist.reduce((s, h) => s + h.revenue, 0)
  const o = { divisionId: kind === 'division' ? id : 'all', branchId: kind === 'branch' ? id : 'all' }
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Sales YTD" value={money(ytd, true)} onClick={() => useStore.getState().open(drillRef(`hist:${kind}:${id}`))} />
        <Stat label="Active jobs" value={jobs.length} /><Stat label="People" value={people.length} /><Stat label="Equipment" value={eq.length} />
      </div>
      <Button variant="primary" onClick={() => { setUI({ filter: o }); useStore.getState().open(null) }}>Filter the whole app to this {kind}</Button>
      <div><Title>Active jobs</Title><div className="card p-0">{jobs.slice(0, 25).map(j => { const c = jobCosting(db, j); return <RowLink key={j.id} to={{ type: 'job', id: j.id }} right={<HealthPill health={c.health} />}><div className="font-semibold truncate">#{j.jobNo} · {customerOf(db, j).name}</div><div className="text-xs text-muted truncate">{j.name}</div></RowLink> })}</div></div>
      <div><Title>Equipment</Title><div className="card p-0">{eq.slice(0, 30).map(e => <RowLink key={e.id} to={{ type: 'equipment', id: e.id }} right={e.status}>{e.category === 'Crane' ? 'Crane ' : ''}{e.unit} · {e.make} {e.model}</RowLink>)}</div></div>
      <div><Title>People</Title><div className="card p-0">{people.slice(0, 30).map(e => <RowLink key={e.id} to={{ type: 'employee', id: e.id }} right={e.craft}>{fullName(e)}</RowLink>)}</div></div>
    </div>
  )
}

export function SiteView({ s }: { s: T.Site }) {
  const db = useStore(st => st.db)
  const jobs = db.jobs.filter(j => j.siteId === s.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4"><Kv k="Location" v={`${s.city}, ${s.state}`} /><Kv k="Coordinates" v={`${s.lat.toFixed(5)}, ${s.lng.toFixed(5)}`} />{s.gate && <Kv k="Gate" v={s.gate} />}{s.hospital && <Kv k="Nearest hospital" v={s.hospital} />}</div>
      <a href={navUrl(s.lat, s.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-info/15 text-info font-semibold"><Navigation className="size-4" />Navigate</a>
      {s.windFarmId && <Ref to={{ type: 'windfarm', id: s.windFarmId }} className="font-semibold">Open wind farm record →</Ref>}
      <div><Title>Jobs at this site</Title><div className="card p-0">{jobs.map(j => <RowLink key={j.id} to={{ type: 'job', id: j.id }} right={j.stage}><div className="font-semibold truncate">#{j.jobNo} · {customerOf(db, j).name}</div><div className="text-xs text-muted">{j.name} · {fmtDate(j.startDate)}</div></RowLink>)}</div></div>
    </div>
  )
}
void inScope; void MONTHS; void today; void EqRef; void VendorRef
