import { craneJobsOn, fmtHours, craneDay, jobCranes, PHASE_LABEL } from '../data/rig'
import { schedStyle, phaseCat, outOfState, useSchedColors, type SchedCat } from '../data/schedColors'
import { SchedLegend } from './SchedLegend'
import { FlagMark } from './Flag'
import { useEffect, useMemo, useRef, useState } from 'react'
import { pushOverlay, popOverlay } from '../lib/backstack'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Siren, Wrench, CheckCircle2, Lock, CalendarPlus, Award, Fuel, ClipboardCheck, Satellite, Gauge, Mail } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName, eqLabel, certBand, workStatus, serviceStatus, pingAgeMin, craneBookings, jobsOn, customerOf, siteOf, agingBucket, craneLeague, COST_CATS, isLive } from '../data/logic'
import { today, fmtDate, fmtTs, timeAgo, money, money2, addDays, cn, range, dow } from '../lib/util'
import { EmpInfoPanel } from './MyInfo'
import { CertShareLog } from './CertSend'
import { Sheet, Badge, Button, CallButton, Kv, Avatar, Segmented, Field, Modal, Empty, confirmChoice } from './ui'
import { EqStatus, JobRef, EmpRef, EqRef, DivisionChip, BranchChip } from './bits'
import JobView from './JobView'
import { CustomerView, VendorView, CertView, TicketView, TimeView, OrgView, SiteView, DrillView, drillTitle } from './MoreViews'
import FleetMap from './FleetMap'
import { ItemView, EmpInventory, UnitInventory } from './inv/ItemDetail'
import { PoView, RequestView, ThreeWayPanel } from './inv/Purchasing'
import { UnionHistoryButton } from '../portal/MyUnionHistory'
import { PaymentForm, PaymentList } from './PaymentForm'
import { printInvoice } from './InvoicePreview'

/** Title + subtitle for any entity reference (also used for the back-stack breadcrumb). */
export function refTitle(db: T.DB, ref: T.EntityRef, f: { divisionId: string; branchId: string }): { title: string; sub?: string } {
  switch (ref.type) {
    case 'job': { const j = byId(db.jobs, ref.id); return j ? { title: `#${j.jobNo} · ${customerOf(db, j).name}`, sub: `${j.name} · ${siteOf(db, j).city}, ${siteOf(db, j).state}` } : { title: 'Job' } }
    case 'employee': { const e = byId(db.employees, ref.id); return e ? { title: fullName(e), sub: `${e.craft} · ${e.empNo}` } : { title: 'Employee' } }
    case 'equipment': { const e = byId(db.equipment, ref.id); return e ? { title: eqLabel(e), sub: `${e.year} ${e.make} ${e.model} · ${e.type}` } : { title: 'Unit' } }
    case 'item': { const i = byId(db.items, ref.id); return i ? { title: i.name, sub: `${i.sku} · ${i.category}` } : { title: 'Item' } }
    case 'workorder': { const w = byId(db.workOrders, ref.id); return w ? { title: `${w.woNo} · ${w.title}`, sub: eqLabel(byId(db.equipment, w.unitId)) } : { title: 'Work order' } }
    case 'invoice': { const i = byId(db.invoices, ref.id); return i ? { title: i.invNo, sub: byId(db.customers, i.customerId)?.name } : { title: 'Invoice' } }
    case 'bill': { const b = byId(db.bills, ref.id); return b ? { title: `${byId(db.vendors, b.vendorId)?.name}`, sub: `Bill ${b.billNo}` } : { title: 'Bill' } }
    case 'po': { const p = byId(db.pos, ref.id); return p ? { title: `${p.poNo} · ${byId(db.vendors, p.vendorId)?.name ?? ''}`, sub: `Purchase order · ${p.status}` } : { title: 'Purchase order' } }
    case 'request': { const r = (db.partsRequests ?? []).find(x => x.id === ref.id); return r ? { title: `${r.no} · ${r.byName}`, sub: `Parts request · ${r.from}` } : { title: 'Parts request' } }
    case 'customer': { const c = byId(db.customers, ref.id); return { title: c?.name ?? 'Customer', sub: c ? `${c.industry} · customer` : undefined } }
    case 'vendor': { const v = byId(db.vendors, ref.id); return { title: v?.name ?? 'Vendor', sub: v ? `${v.category} · vendor` : undefined } }
    case 'cert': { const c = byId(db.certs, ref.id); return { title: c ? `${c.type}` : 'Certification', sub: c ? fullName(byId(db.employees, c.employeeId)) : undefined } }
    case 'ticket': { const t = byId(db.tickets, ref.id); const j = t && byId(db.jobs, t.jobId); return { title: t ? `Field ticket · ${fmtDate(t.date)}` : 'Ticket', sub: j ? `#${j.jobNo} · ${customerOf(db, j).name}` : undefined } }
    case 'time': { const t = byId(db.time, ref.id); return { title: t ? `Time · ${fmtDate(t.date)}` : 'Time entry', sub: t ? fullName(byId(db.employees, t.employeeId)) : undefined } }
    case 'branch': { const b = byId(db.branches, ref.id); return { title: b ? `${b.code}` : 'Branch', sub: b ? `${b.city}, ${b.state}${b.hq ? ' · HQ' : ''}` : undefined } }
    case 'division': { const d = byId(db.divisions, ref.id); return { title: d?.name ?? 'Division', sub: d?.tagline } }
    case 'site': { const s = byId(db.sites, ref.id); return { title: s?.name ?? 'Site', sub: s ? `${s.city}, ${s.state}` : undefined } }
    case 'list': return drillTitle(db, ref.id, f)
    default: return { title: 'Details' }
  }
}

export default function EntityDrawer() {
  const ref = useStore(s => s.ui.drawer)
  const stack = useStore(s => s.ui.drawerStack)
  const open = useStore(s => s.open)
  const back = useStore(s => s.back)
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const close = () => open(null)
  // each drill-down level inside the drawer gets its own history entry → back/swipe returns to the previous record
  const levels = useRef<number[]>([])
  useEffect(() => {
    while (levels.current.length < stack.length) levels.current.push(pushOverlay(() => useStore.getState().back()))
    if (levels.current.length > stack.length) { popOverlay(levels.current[stack.length]); levels.current = levels.current.slice(0, stack.length) }
  }, [stack.length])
  let body: React.ReactNode = null, width = 600
  if (ref?.type === 'job') { const j = byId(db.jobs, ref.id); if (j) { body = <JobView key={j.id + (ref.tab ?? '')} job={j} initialTab={ref.tab} />; width = 680 } }
  if (ref?.type === 'employee') { const e = byId(db.employees, ref.id); if (e) body = <EmployeeView e={e} /> }
  if (ref?.type === 'equipment') { const e = byId(db.equipment, ref.id); if (e) { body = <EquipmentView e={e} />; width = 640 } }
  if (ref?.type === 'item') { const i = byId(db.items, ref.id); if (i) body = <ItemView i={i} /> }
  if (ref?.type === 'workorder') { const w = byId(db.workOrders, ref.id); if (w) body = <WorkOrderView w={w} /> }
  if (ref?.type === 'invoice') { const i = byId(db.invoices, ref.id); if (i) body = <InvoiceView inv={i} /> }
  if (ref?.type === 'bill') { const b = byId(db.bills, ref.id); if (b) body = <BillView b={b} /> }
  if (ref?.type === 'po') { const p = byId(db.pos, ref.id); if (p) body = <PoView po={p} /> }
  if (ref?.type === 'request') { const r = (db.partsRequests ?? []).find(x => x.id === ref.id); if (r) body = <RequestView r={r} /> }
  if (ref?.type === 'customer') { const c = byId(db.customers, ref.id); if (c) body = <CustomerView c={c} /> }
  if (ref?.type === 'vendor') { const v = byId(db.vendors, ref.id); if (v) body = <VendorView v={v} /> }
  if (ref?.type === 'cert') { const c = byId(db.certs, ref.id); if (c) body = <CertView c={c} /> }
  if (ref?.type === 'ticket') { const t = byId(db.tickets, ref.id); if (t) body = <TicketView t={t} /> }
  if (ref?.type === 'time') { const t = byId(db.time, ref.id); if (t) body = <TimeView e={t} /> }
  if (ref?.type === 'branch' || ref?.type === 'division') body = <OrgView kind={ref.type} id={ref.id} />
  if (ref?.type === 'site') { const s = byId(db.sites, ref.id); if (s) body = <SiteView s={s} /> }
  if (ref?.type === 'list') { body = <DrillView id={ref.id} />; width = 620 }
  const head = ref ? refTitle(db, ref, f) : { title: '' }
  const crumbs = stack.length > 0 && (
    <div className="flex items-center gap-1.5 text-xs text-muted -mt-1 mb-1 flex-wrap" data-testid="drawer-crumbs">
      <button onClick={back} className="inline-flex items-center gap-1 rounded-full bg-surface-2 hover:bg-surface-3 px-3 h-8 font-semibold text-ink" data-testid="drawer-back"><ChevronLeft className="size-3.5" />Back</button>
      {stack.slice(-3).map((r, i) => <span key={i} className="inline-flex items-center gap-1.5"><button className="ref-link truncate max-w-40" onClick={() => open(r)}>{refTitle(db, r, f).title}</button><ChevronRight className="size-3 text-faint" /></span>)}
    </div>
  )
  return <Sheet open={!!ref && !!body} onClose={close} onBack={stack.length ? back : undefined} title={head.title} sub={head.sub} width={width}>{crumbs}{body}</Sheet>
}

function CertList({ e }: { e: T.Employee }) {
  const db = useStore(s => s.db)
  const role = useStore(s => s.session!.role)
  const certs = db.certs.filter(c => c.employeeId === e.id).sort((a, b) => a.expires.localeCompare(b.expires))
  const [renew, setRenew] = useState<T.Cert | null>(null)
  const [exp, setExp] = useState(addDays(today(), 730))
  const canEdit = ['safety', 'hr', 'owner'].includes(role)
  const [adding, setAdding] = useState(false)
  const [nc, setNc] = useState<{ type: T.CertType; credentialNo: string; provider: string; issued: string; expires: string; proof: string }>({ type: 'OSHA 10', credentialNo: '', provider: '', issued: today(), expires: addDays(today(), 1095), proof: '' })
  const ncErr = !nc.credentialNo.trim() ? 'Card / credential number is required' : !nc.proof ? 'Upload a photo or PDF of the card' : nc.expires <= today() ? 'Expiration must be in the future' : nc.issued > today() ? 'Issued date can’t be in the future' : nc.issued >= nc.expires ? 'Issued must be before expiration' : ''
  return (
    <div className="card p-0 overflow-hidden">
      {canEdit && <div className="flex justify-end px-4 pt-3"><Button size="sm" variant="outline" data-testid="cert-add" onClick={() => setAdding(true)}>+ Add certification</Button></div>}
      {certs.map(c => { const b = certBand(c); return (
        <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b hairline last:border-0">
          <Award className={cn('size-4 shrink-0', b.band === 'expired' ? 'text-bad' : b.band === '30' ? 'text-bad' : b.band === '60' ? 'text-warn' : b.band === '90' ? 'text-info' : 'text-ok')} />
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{c.type}</div><div className="text-xs text-muted">{c.provider} · {c.credentialNo}</div></div>
          <div className="text-right"><div className={cn('text-sm num font-semibold', b.days < 0 ? 'text-bad' : b.days <= 30 ? 'text-bad' : b.days <= 60 ? 'text-warn' : '')}>{b.days < 0 ? 'Expired' : `${b.days}d`}</div><div className="text-[11px] text-faint">{fmtDate(c.expires, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>
          {c.verified !== 'Verified' && <Badge tone="warn">{c.verified}</Badge>}
          {['safety', 'hr', 'owner'].includes(role) && b.band !== 'ok' && <Button size="sm" variant="outline" onClick={() => setRenew(c)}>Renew</Button>}
        </div>
      ) })}
      {!certs.length && <div className="p-4 text-sm text-muted">No certifications on file.</div>}
      <Modal open={adding} onClose={() => setAdding(false)} title={`Add certification — ${e.first} ${e.last}`} sub="Counts toward dispatch eligibility right away; Safety verifies the card.">
        <div className="flex flex-col gap-3" data-testid="cert-form">
          <Field label="Certification"><select className="input" data-testid="cert-type" value={nc.type} onChange={ev => setNc({ ...nc, type: ev.target.value as T.CertType, expires: addDays(today(), ev.target.value.startsWith('NCCCO') ? 1825 : ev.target.value === 'DOT Medical Card' ? 730 : 1095) })}>{(['OSHA 10', 'OSHA 30', 'NCCCO Mobile Operator', 'NCCCO Crawler Operator', 'NCCCO Rigger II', 'NCCCO Signalperson', 'CDL Class A', 'DOT Medical Card', 'CPR / First Aid', 'H2S Awareness', 'Forklift', 'Tower Rescue', 'Smith Driving', 'TWIC'] as T.CertType[]).map(t => <option key={t}>{t}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Card / credential #"><input className="input" data-testid="cert-no" value={nc.credentialNo} onChange={ev => setNc({ ...nc, credentialNo: ev.target.value })} /></Field><Field label="Issued by"><input className="input" data-testid="cert-provider" value={nc.provider} placeholder="NCCCO, OSHA trainer, DOT examiner…" onChange={ev => setNc({ ...nc, provider: ev.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-2"><Field label="Issued"><input type="date" className="input" data-testid="cert-issued" value={nc.issued} onChange={ev => setNc({ ...nc, issued: ev.target.value })} /></Field><Field label="Expires"><input type="date" className="input" data-testid="cert-expires" value={nc.expires} onChange={ev => setNc({ ...nc, expires: ev.target.value })} /></Field></div>
          <Field label="Proof (photo or PDF of the card)"><input type="file" accept="image/*,application/pdf" className="input" data-testid="cert-proof" onChange={ev => setNc({ ...nc, proof: ev.target.files?.[0]?.name ?? '' })} /></Field>
          {ncErr && <div className="text-xs text-warn" data-testid="cert-err">{ncErr}</div>}
          <Button variant="primary" data-testid="cert-save" disabled={!!ncErr} onClick={() => { actions.addCert({ employeeId: e.id, type: nc.type, credentialNo: nc.credentialNo.trim(), provider: nc.provider.trim() || '—', issued: nc.issued, expires: nc.expires, verified: 'Needs Review', proof: nc.proof }); setAdding(false); setNc({ ...nc, credentialNo: '', proof: '' }); toast.success(`${nc.type} added for ${e.first}`, { description: 'Counts for dispatch now · pending Safety verification' }) }}>Save certification</Button>
        </div>
      </Modal>
      <Modal open={!!renew} onClose={() => setRenew(null)} title={`Renew ${renew?.type}`} sub="Upload the new card in the Safety module; demo records the new expiration.">
        <div className="flex flex-col gap-3"><Field label="New expiration"><input type="date" className="input" value={exp} onChange={e => setExp(e.target.value)} /></Field><Button variant="primary" onClick={() => { actions.renewCert(renew!.id, exp); setRenew(null); toast.success('Renewed — pending verification') }}>Save</Button></div>
      </Modal>
    </div>
  )
}

function EmployeeView({ e }: { e: T.Employee }) {
  const db = useStore(s => s.db)
  const role = useStore(s => s.session!.role)
  const t = today()
  const st = workStatus(db, e.id, t)
  const a = db.assignments.find(x => x.employeeId === e.id && x.date === t)
  const j = a && byId(db.jobs, a.jobId)
  const sup = byId(db.employees, e.supervisorId)
  const [off, setOff] = useState(false)
  const [from, setFrom] = useState(addDays(t, 1)); const [to, setTo] = useState(addDays(t, 1)); const [kind, setKind] = useState<T.AbsenceKind>('Scheduled Off')
  const upcoming = range(t, addDays(t, 13))
  const hr = db.hrRecords.filter(r => r.employeeId === e.id)
  const outs = db.checkouts.filter(c => c.employeeId === e.id && !c.returned)
  const times = db.time.filter(x => x.employeeId === e.id).sort((a2, b) => b.date.localeCompare(a2.date)).slice(0, 6)
  const tone = st === 'Working' ? 'info' : st === 'Available' ? 'ok' : st.startsWith('Traveling') ? 'accent' : 'warn'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <Avatar name={fullName(e)} size={64} />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2"><Badge tone={tone} dot>{st}</Badge>{e.hallHand && <Badge tone="warn">Hall Hand</Badge>}{e.veteran && <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold" data-testid="veteran-badge"><FlagMark width={14} />Veteran{e.veteran.branch ? ` · ${e.veteran.branch}` : ''}</span>}<DivisionChip id={e.divisionId} /><BranchChip id={e.branchId} /></div>
          {role !== 'guest' && <div className="text-sm text-muted mt-2 flex items-center gap-2 truncate"><Mail className="size-3.5" />{e.email}</div>}
        </div>
      </div>
      {role !== 'guest' && <div className="flex flex-wrap gap-2"><CallButton phone={e.phone} label={`Call ${e.first}`} size="lg" variant="ok" />{sup && <CallButton phone={sup.phone} label={`Supervisor · ${sup.first}`} size="lg" />}</div>}
      {j && <div className="card p-4 cursor-pointer" onClick={() => useStore.getState().open({ type: 'job', id: j.id })}><div className="label">Today</div><div className="font-semibold mt-1">{a!.position} on Job #{j.jobNo}</div><div className="text-sm text-muted">{customerOf(db, j).name} · {siteOf(db, j).city} · start {j.startTime}</div></div>}
      <div>
        <div className="label mb-2">Next 14 days</div>
        <div className="grid grid-cols-7 gap-1.5">
          {upcoming.map(d => { const s = workStatus(db, e.id, d); const jj = db.assignments.find(x => x.employeeId === e.id && x.date === d); return (
            <div key={d} title={s} className={cn('rounded-xl p-1.5 text-center', s === 'Working' ? 'bg-info/15' : s === 'Available' ? 'bg-ok/10' : s.startsWith('Travel') ? 'bg-accent/15' : 'bg-warn/15')}>
              <div className="text-[10px] text-muted">{dow(d)}</div><div className="text-xs font-semibold num">{fmtDate(d, { day: 'numeric' })}</div>
              <div className="text-[9px] font-semibold truncate mt-0.5">{jj ? `#${byId(db.jobs, jj.jobId)?.jobNo}` : s === 'Available' ? 'Free' : s.split(' ')[0]}</div>
            </div>
          ) })}
        </div>
        {['dispatch', 'hr', 'owner', 'ops'].includes(role) && <Button size="sm" variant="ghost" className="mt-2" icon={<CalendarPlus className="size-4" />} onClick={() => setOff(true)}>Add day off / unavailable</Button>}
      </div>
      <div><div className="label mb-2">Certifications</div><CertList e={e} /></div>
      <div className="card p-4">
        <Kv k="Craft" v={e.craft} />
        <Kv k="Supervisor (field allocation)" v={sup ? <EmpRef id={sup.id} /> : 'Unassigned pool'} />
        <Kv k="Home crane" v={e.homeCraneId ? <EqRef id={e.homeCraneId} /> : '—'} />
        {e.homeTruckId && <Kv k="Assigned truck" v={<EqRef id={e.homeTruckId} />} />}
        {e.pickupId && <Kv k="Pickup" v={<EqRef id={e.pickupId} />} />}
        <Kv k="Union / local" v={e.local ?? '—'} />
        <Kv k="Per diem" v={(['Semi Truck', 'Hotel', 'Daily Truck'] as T.PerDiem[]).map(p => <span key={p} className={cn('ml-2', e.perDiemBlocked.includes(p) && 'line-through text-faint')}>{p}</span>)} />
        <Kv k="Hired" v={fmtDate(e.hireDate, { month: 'short', year: 'numeric' })} />
        {['hr', 'owner', 'payroll'].includes(role) && <Kv k="Pay rate" v={<span className="num">${e.rate}/hr</span>} />}
      </div>
      <EmpInfoPanel e={e} />
      {['hr', 'owner', 'safety', 'ops', 'dispatch', 'branch'].includes(role) && <div className="mt-4"><div className="label mb-1.5">Cert sends</div><CertShareLog empId={e.id} /></div>}
      <EmpInventory e={e} />
      <UnionHistoryButton empId={e.id} />
      {['payroll', 'owner', 'hr', 'ops'].includes(role) && times.length > 0 && <div><div className="label mb-2">Recent time</div><div className="card p-0">{times.map(x => <div key={x.id} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm"><span className="w-16 text-muted">{fmtDate(x.date)}</span><span className="flex-1 truncate">{x.activity}{x.jobId && ` · #${byId(db.jobs, x.jobId)?.jobNo}`}</span><span className="num font-semibold">{x.hours}h</span><Badge tone={x.status === 'Flagged' ? 'bad' : x.status === 'Submitted' ? 'warn' : 'ok'}>{x.status}</Badge></div>)}</div></div>}
      {['hr', 'owner'].includes(role) && <div><div className="label mb-2">HR file</div><div className="card p-0">{hr.length ? hr.map(r => <div key={r.id} className="px-4 py-3 border-b hairline last:border-0"><div className="flex items-center gap-2 text-sm"><Badge tone={r.kind === 'Write-Up' ? 'bad' : r.kind === 'Commendation' ? 'ok' : 'neutral'}>{r.kind}</Badge><span className="font-semibold">{r.title}</span>{r.confidential && <Lock className="size-3 text-faint" />}<span className="ml-auto text-xs text-faint">{fmtDate(r.date)}</span></div><div className="text-sm text-muted mt-1">{r.detail}</div></div>) : <div className="p-4 text-sm text-muted">No records.</div>}</div></div>}
      <Modal open={off} onClose={() => setOff(false)} title={`Day off — ${fullName(e)}`} sub="Dispatch will see a red conflict on any job this overlaps. Nobody is moved automatically.">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3"><Field label="From"><input type="date" className="input" value={from} onChange={x => setFrom(x.target.value)} /></Field><Field label="To"><input type="date" className="input" value={to} onChange={x => setTo(x.target.value)} /></Field></div>
          <Field label="Type"><select className="input" value={kind} onChange={x => setKind(x.target.value as T.AbsenceKind)}>{['Scheduled Off', 'Vacation / PTO', 'Training', 'Unavailable'].map(k => <option key={k}>{k}</option>)}</select></Field>
          <Button variant="primary" onClick={() => { actions.addAbsence(e.id, from, to < from ? from : to, kind); setOff(false); toast.success('Saved — Dispatch board updated') }}>Save</Button>
        </div>
      </Modal>
    </div>
  )
}

function EquipmentView({ e }: { e: T.Equipment }) {
  const db = useStore(s => s.db)
  const session = useStore(s => s.session)
  const role = useStore(s => s.session!.role)
  const setUI = useStore(s => s.setUI)
  const [tab, setTab] = useState<'live' | 'service' | 'bookings' | 'money'>('live')
  const svc = serviceStatus(e)
  const wos = db.workOrders.filter(w => w.unitId === e.id)
  const dvirs = db.dvirs.filter(d => d.unitId === e.id).slice(0, 5)
  const fuel = db.fuel.filter(f => f.unitId === e.id).slice(-6).reverse()
  const books = e.category === 'Crane' ? db.jobs.filter(j => isLive(j) && jobCranes(j).includes(e.id)).sort((a, b) => a.startDate.localeCompare(b.startDate)).filter(j => j.endDate >= addDays(today(), -10)) : db.jobs.filter(j => j.trailerIds.includes(e.id) && j.endDate >= today()).slice(0, 8)
  const job = jobsOn(db, today()).find(j => jobCranes(j).includes(e.id) || j.trailerIds.includes(e.id))
  const league = useMemo(() => e.category === 'Crane' ? craneLeague(db, { divisionId: 'all', branchId: 'all' }).find(x => x.crane.id === e.id) : undefined, [db, e])
  const drv = byId(db.employees, e.assignedTo)
  const meter = e.category === 'Semi' || e.category === 'Pickup' ? `${e.miles?.toLocaleString()} mi` : e.hours != null ? `${e.hours.toLocaleString()} hrs` : '—'
  return (
    <div className="flex flex-col gap-5">
      {e.category === 'Crane' && /LTM|AT|GMK|AC |ATF/i.test(`${e.model} ${e.type}`) && <div className="relative rounded-2xl overflow-hidden -mb-1" data-testid="eq-photo"><img src={`${import.meta.env.BASE_URL}fleet-at.jpg`} alt="" className="w-full h-48 object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /><div className="absolute left-4 bottom-3 text-white"><div className="display text-3xl font-semibold num leading-none">{e.unit}</div><div className="text-xs opacity-80">{e.make} {e.model} · fleet photo</div></div></div>}
      <div className="flex flex-wrap items-center gap-2"><EqStatus s={e.status} /><Badge>{e.category}</Badge>{e.capacity && <Badge tone="accent">{e.capacity} t</Badge>}<DivisionChip id={e.divisionId} /><BranchChip id={e.branchId} /></div>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'live', label: 'Live' }, { value: 'service', label: 'Service', count: wos.filter(w => w.status !== 'Closed').length || (serviceStatus(e).overdue || serviceStatus(e).dueSoon ? 1 : undefined) }, { value: 'bookings', label: e.category === 'Crane' ? 'Forecast' : 'Jobs' }, ...(e.category === 'Crane' && ['owner', 'ops', 'accounting'].includes(role) ? [{ value: 'money' as const, label: 'Financials' }] : [])]} />
      {tab === 'live' && (
        <>
          {e.category === 'Crane' && (() => { const tj = craneJobsOn(db, e.id, today()); return tj.length ? <div className="card p-4" data-testid="eq-day-jobs"><div className="text-sm font-semibold mb-2">Today · {tj.length} job{tj.length > 1 ? 's' : ''}{tj.length > 1 ? ' — shared crane' : ''}</div><div className="flex flex-col gap-1.5">{tj.map((x, i) => { const clash = tj.some((y, k) => k !== i && x.hours && y.hours && x.hours.from < y.hours.to && y.hours.from < x.hours.to); return <button key={x.job.id} data-testid="eq-day-job" data-clash={clash ? '1' : ''} onClick={() => useStore.getState().open({ type: 'job', id: x.job.id })} className="min-h-[44px] rounded-xl bg-surface-2 px-3 py-2 text-left flex items-center gap-3"><span className="num font-bold text-sm w-[5.5rem] shrink-0">{fmtHours(x.hours)}</span><span className="flex-1 min-w-0 text-sm truncate">#{x.job.jobNo} · {customerOf(db, x.job).name}</span><span className="text-[11px] text-muted shrink-0">{PHASE_LABEL[x.phase]}</span>{clash && <span className="text-[11px] font-semibold text-warn shrink-0">⚠ overlap</span>}</button> })}</div></div> : null })()}
          {e.category === 'Crane' && (() => { const days = range(today(), addDays(today(), 29)); const cd = (d: string) => craneDay(db, e.id, d); const free = days.filter(d => !cd(d)).length; const sc = useSchedColors.getState(); const down = e.status === 'Maintenance' || e.status === 'Out of Service'; const catOf = (d: string): SchedCat => { const c = cd(d); if (!c) return down ? 'off' : 'open'; /* dive3 shop m6: a down crane's open days aren't sellable */ if (craneJobsOn(db, e.id, d).length > 1) { const tj = craneJobsOn(db, e.id, d); if (tj.some((x, i) => tj.some((y, k) => k !== i && x.hours && y.hours && x.hours.from < y.hours.to && y.hours.from < x.hours.to))) return 'conflict' } const ph = c.job.rig?.length ? phaseCat(c.phase) : 'working'; return ph === 'working' && outOfState(db, c.job, e.branchId) ? 'outstate' : ph }; return (
            <div className="card p-4" data-testid="eq-30d">
              <div className="flex items-center justify-between mb-2"><div className="text-sm font-semibold">Next 30 days</div><span data-testid="eq-30d-sum" className={cn('text-xs font-semibold', down ? 'text-bad' : free > 10 ? 'text-warn' : 'text-muted')}>{30 - free} booked · {down ? `${e.status} — release it before selling open days` : `${free} open${free > 10 ? ' — sell it' : ''}`}</span></div>
              <div className="flex gap-[3px]">{days.map(d => { const c = cd(d); const j = c?.job; const all = c ? craneJobsOn(db, e.id, d) : []; return <button key={d} data-phase={c?.phase ?? ''} data-count={all.length} title={`${fmtDate(d)}${j ? all.map(x => ` · #${x.job.jobNo} ${customerOf(db, x.job).name} ${fmtHours(x.hours)} (${PHASE_LABEL[x.phase]})`).join('') : ' · open'}`} onClick={() => j && useStore.getState().open({ type: 'job', id: j.id })} data-cat={catOf(d)} className={cn('h-7 flex-1 rounded-[4px]', all.length > 1 && 'ring-2 ring-inset ring-[var(--text)]/60')} style={schedStyle(catOf(d), sc.colors, sc.patterns)} /> })}</div>
              <div className="flex justify-between text-[10px] text-muted mt-1"><span>{fmtDate(days[0])}</span><span>{fmtDate(days[29])}</span></div><SchedLegend className="mt-1.5" cats={[...new Set(days.map(catOf))]} />
            </div>) })()}
          <div className="rounded-3xl overflow-hidden border hairline"><FleetMap units={[e]} height={220} center={e.route && e.status === 'In Transit' ? [(e.route.from[0] + e.route.to[0]) / 2, (e.route.from[1] + e.route.to[1]) / 2] : [e.lat, e.lng]} zoom={e.route ? 7 : 10} branches={false} /></div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><Satellite className="size-4 text-accent" />Telematics {e.samsaraId ? <Badge tone="info">Samsara {e.samsaraId}</Badge> : <Badge tone="warn">No GPS unit</Badge>}<span className={cn('ml-auto text-xs', pingAgeMin(e) > 120 ? 'text-warn font-semibold' : 'text-muted')}>last ping {timeAgo(e.lastPing)}</span></div>
            <Kv k="Location" v={job ? `Job #${job.jobNo} · ${siteOf(db, job).name}` : e.route && e.status === 'In Transit' ? `${e.route.fromName} → ${e.route.toName}` : `${e.yard} yard`} />
            {e.route && e.status === 'In Transit' && <Kv k="ETA" v={fmtTs(e.route.eta)} />}
            <Kv k={e.category === 'Semi' || e.category === 'Pickup' ? 'Odometer' : 'Engine hours'} v={<span className="num">{meter}</span>} />
            {drv && <Kv k="Assigned to" v={<span className="inline-flex items-center gap-2"><EmpRef id={drv.id} /><CallButton phone={drv.phone} size="sm" label="Call" /></span>} />}
            {e.plate && <Kv k="Plate" v={e.plate} />}{e.vin && <Kv k="VIN" v={<span className="font-mono text-xs">{e.vin}</span>} />}{e.serial && <Kv k="Serial" v={<span className="font-mono text-xs">{e.serial}</span>} />}
            <Kv k="Annual inspection" v={<span className={cn(e.annualInspection < today() && 'text-bad font-semibold')}>{fmtDate(e.annualInspection, { month: 'short', day: 'numeric', year: 'numeric' })}</span>} />
          </div>
          <div className="flex flex-wrap gap-2">
            {(role === 'dispatch' || role === 'shop') && <Button variant="danger" icon={<Siren className="size-4" />} onClick={() => setUI({ breakdownOpen: true, breakdownUnit: e.id })}>Report breakdown</Button>}
            {role === 'shop' && e.status !== 'Out of Service' && <Button icon={<Lock className="size-4" />} onClick={() => { actions.tagOut(e.id, 'Shop lockout'); toast('Tagged out of service') }}>Tag out</Button>}
            {['shop', 'owner'].includes(role) && (e.status === 'Out of Service' || e.status === 'Maintenance') && (() => {
              // dive3 B2: only when a work order is Ready for Release; confirm names the WO(s) being closed; Critical work blocks it
              const open = db.workOrders.filter(w => w.unitId === e.id && w.status !== 'Closed'), ready = open.filter(w => w.status === 'Ready for Release'), crit = open.filter(w => w.priority === 'Critical' && w.status !== 'Ready for Release')
              if (open.length && !ready.length) return <span className="text-xs text-muted self-center" data-testid="unit-release-blocked">Release after the shop marks {open.map(w => w.woNo).join(', ')} Ready for Release</span>
              if (crit.length) return <span className="text-xs text-bad self-center" data-testid="unit-release-blocked">Out of service until Critical {crit.map(w => w.woNo).join(', ')} is done</span>
              return <Button variant="ok" icon={<CheckCircle2 className="size-4" />} data-testid="unit-release" onClick={async () => {
                const others = open.filter(w => w.status !== 'Ready for Release')
                const ok = await confirmChoice(`Release ${e.unit} to service?`, `${ready.length ? `${ready.map(w => `${w.woNo} “${w.title}”`).join(', ')} will be closed.` : 'No open work orders.'}${others.length ? ` Still open (stays open): ${others.map(w => w.woNo).join(', ')}.` : ''} Released by ${session?.name ?? 'you'}${e.hours != null ? ` · hour meter ${e.hours.toLocaleString()} h` : ''}${e.miles != null ? ` · ${e.miles.toLocaleString()} mi` : ''}. Dispatch will see it as available.`, [{ label: 'Release to service', value: 'go', tone: 'ok' }, { label: 'Cancel', value: 'no' }])
                if (ok?.value !== 'go') return
                const r = actions.releaseToService(e.id); if (!r.ok) { toast.error(r.reason); return }
                toast.success(`${e.unit} released — ${r.status}`, { description: [r.closed.length ? `${r.closed.join(', ')} closed` : '', r.left.length ? `still open: ${r.left.join(', ')}` : ''].filter(Boolean).join(' · ') || undefined }) }}>Release to service</Button>
            })()}
          </div>
        </>
      )}
      {tab === 'service' && (
        <>
          <div className={cn('card p-5', svc.overdue && 'border-bad/40')}>
            <div className="flex items-center gap-2 font-semibold"><Gauge className="size-4" />Next service</div>
            <div className="display text-3xl font-semibold mt-2 num">{svc.remaining != null ? `${svc.remaining < 0 ? 'Over ' : ''}${Math.abs(svc.remaining).toLocaleString()} ${svc.unit}` : fmtDate(e.nextServiceDate)}</div>
            <div className="text-sm text-muted">{svc.remaining != null ? `at ${e.nextServiceAt?.toLocaleString()} ${svc.unit} · ` : ''}or by {fmtDate(e.nextServiceDate)} — whichever comes first</div>
            {svc.overdue && <Badge tone="bad" className="mt-2">Overdue</Badge>}{svc.dueSoon && <Badge tone="warn" className="mt-2">Due soon</Badge>}
          </div>
          <UnitInventory e={e} />
          <div><div className="label mb-2">Work orders</div>{wos.length ? wos.map(w => <div key={w.id} onClick={() => useStore.getState().open({ type: 'workorder', id: w.id })} className="card p-4 mb-2 cursor-pointer flex items-center gap-3"><Wrench className="size-4 text-muted" /><div className="flex-1 min-w-0"><div className="font-semibold text-sm">{w.woNo} · {w.title}</div><div className="text-xs text-muted">{w.source} · opened {fmtDate(w.opened)}</div></div><Badge tone={w.status === 'Closed' ? 'neutral' : w.priority === 'Critical' ? 'bad' : 'warn'}>{w.status}</Badge></div>) : <div className="text-sm text-muted">None.</div>}</div>
          {dvirs.length > 0 && <div><div className="label mb-2">Pre-trip inspections (DVIR)</div><div className="card p-0">{dvirs.map(d => <div key={d.id} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm"><ClipboardCheck className={cn('size-4', d.safeToOperate ? 'text-ok' : 'text-bad')} /><span className="flex-1">{fmtDate(d.date)} · {fullName(byId(db.employees, d.employeeId))}</span><span className={cn('text-xs', d.defects ? 'text-bad' : 'text-muted')}>{d.defects || 'No defects'}</span></div>)}</div></div>}
          {fuel.length > 0 && <div><div className="label mb-2">Fuel</div><div className="card p-0">{fuel.map(f => <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm"><Fuel className="size-4 text-muted" /><span className="flex-1">{fmtDate(f.date)} · {f.vendor}</span><span className="num">{f.gallons} gal</span><span className="num text-muted">{money(f.gallons * f.price)}</span>{f.jobId && <JobRef id={f.jobId} className="text-xs" />}</div>)}</div></div>}
        </>
      )}
      {tab === 'bookings' && (
        <div className="flex flex-col gap-2">
          {books.map(j => <div key={j.id} onClick={() => useStore.getState().open({ type: 'job', id: j.id })} className="card p-4 cursor-pointer flex items-center gap-3"><div className="flex-1 min-w-0"><div className="font-semibold text-sm">#{j.jobNo} · {customerOf(db, j).name}</div><div className="text-xs text-muted">{fmtDate(j.startDate)} → {fmtDate(j.endDate)} · {siteOf(db, j).city}</div></div><Badge tone={j.startDate <= today() && j.endDate >= today() ? 'info' : j.endDate < today() ? 'neutral' : 'ok'}>{j.endDate < today() ? 'Done' : j.startDate <= today() ? 'Now' : j.stage}</Badge></div>)}
          {!books.length && <Empty title="No bookings" body="Free for the next 6 weeks." />}
        </div>
      )}
      {tab === 'money' && league && (
        <div className="card p-5">
          <div className="label">Last 12 months</div>
          <div className="grid grid-cols-3 gap-4 mt-3">
            <div><div className="text-xs text-muted">Revenue</div><div className="display text-2xl font-semibold num">{money(league.revenue, true)}</div></div>
            <div><div className="text-xs text-muted">Profit</div><div className="display text-2xl font-semibold num text-ok">{money(league.profit, true)}</div></div>
            <div><div className="text-xs text-muted">Utilization</div><div className="display text-2xl font-semibold num">{Math.round(league.util * 100)}%</div></div>
          </div>
          <div className="mt-4"><Kv k="Customer day rate" v={money(e.dayRate ?? 0)} /><Kv k="Internal cost / day" v={money(e.costDay ?? 0)} /><Kv k="Margin" v={`${Math.round(league.margin * 100)}%`} /></div>
        </div>
      )}
    </div>
  )
}

function WorkOrderView({ w }: { w: T.WorkOrder }) {
  const db = useStore(s => s.db)
  const role = useStore(s => s.session!.role)
  const techs = db.employees.filter(e => e.craft === 'Mechanic')
  const parts = w.parts.reduce((s, p) => s + p.qty * p.cost, 0)
  const [pn, setPn] = useState(''); const [pc, setPc] = useState(''); const [rd, setRd] = useState('') // dive3 shop M6: hours/miles reading at PM release
  const canEdit = ['shop', 'owner'].includes(role)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 flex-wrap"><Badge tone={w.priority === 'Critical' ? 'bad' : w.priority === 'High' ? 'warn' : 'neutral'}>{w.priority}</Badge><Badge>{w.source}</Badge><Badge tone="info">{w.status}</Badge></div>
      <div className="card p-4"><div className="label mb-1">Complaint</div><div>{w.complaint}</div></div>
      <div className="card p-4"><Kv k="Unit" v={<EqRef id={w.unitId} />} /><Kv k="Opened" v={fmtDate(w.opened)} /><Kv k="Due" v={canEdit ? <input type="date" className="input py-1 h-9 w-auto" data-testid="wo-due" min={w.opened} value={w.due} onChange={e => e.target.value && e.target.value >= w.opened && actions.updateWO(w.id, { due: e.target.value })} /> : fmtDate(w.due)} /><Kv k="Technician" v={canEdit ? <select className="input py-1 h-9" value={w.techId ?? ''} onChange={e => actions.updateWO(w.id, { techId: e.target.value || undefined })}><option value="">Unassigned</option>{techs.map(t => <option key={t.id} value={t.id}>{fullName(t)}</option>)}</select> : fullName(byId(db.employees, w.techId))} /><Kv k="Labor" v={role === 'guest' ? '—' : <span className="num">{w.laborHrs} h × ${w.laborRate} = {money(w.laborHrs * w.laborRate)}</span>} /><Kv k="Parts" v={role === 'guest' ? '—' : money(parts)} /><Kv k="Total" v={role === 'guest' ? '—' : <b className="num">{money(parts + w.laborHrs * w.laborRate)}</b>} /></div>
      <div className="card p-0">{w.parts.map((p, i) => <div key={i} className="flex px-4 py-2.5 border-b hairline last:border-0 text-sm"><span className="flex-1">{p.name}</span><span className="num w-12">×{p.qty}</span><span className="num">{money(p.cost * p.qty)}</span></div>)}{!w.parts.length && <div className="p-4 text-sm text-muted">No parts yet.</div>}</div>
      {canEdit && (
        <>
          <div className="flex gap-2"><input className="input" placeholder="Part name" value={pn} onChange={e => setPn(e.target.value)} /><input className="input w-28 num" placeholder="$" value={pc} onChange={e => setPc(e.target.value.replace(/[^0-9.]/g, ''))} /><Button disabled={!pn || !Number(pc)} onClick={() => { actions.updateWO(w.id, { parts: [...w.parts, { name: pn, qty: 1, cost: Number(pc) }] }); setPn(''); setPc('') }}>Add</Button></div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => actions.updateWO(w.id, { laborHrs: w.laborHrs + 1 })}>+1 labor hr</Button>
            <label className="flex items-center gap-1.5 text-sm">Labor h<input type="number" min={0} max={999} step={0.25} inputMode="decimal" className="input h-9 w-20 num" data-testid="wo-labor" value={w.laborHrs} onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0 && v <= 999) actions.updateWO(w.id, { laborHrs: Math.round(v * 4) / 4 }) }} /></label>
            {(['Open', 'In Progress', 'Waiting Parts', 'Ready for Release', 'Closed'] as T.WoStatus[]).map(s => <Button key={s} size="sm" variant={w.status === s ? 'primary' : 'secondary'} onClick={() => actions.updateWO(w.id, { status: s })}>{s}</Button>)}
          </div>
          {w.status === 'Ready for Release' && ((w as { pm?: boolean }).pm || /\bPM\b|PM-[A-Z]/i.test(w.title)) && (() => { const u = byId(db.equipment, w.unitId); const mi = u?.category !== 'Crane' && u?.miles != null; return <label className="flex items-center gap-2 text-sm" data-testid="wo-reading"><span className="label">{mi ? 'Odometer (mi)' : 'Hour meter'} at service</span><input className="input w-32 num" inputMode="numeric" data-testid="wo-reading-in" placeholder={String((mi ? u?.miles : u?.hours) ?? '')} value={rd} onChange={e => setRd(e.target.value.replace(/[^0-9]/g, ''))} /></label> })()}
          {w.status === 'Ready for Release' && <Button variant="ok" size="lg" icon={<CheckCircle2 className="size-5" />} data-testid="wo-release" onClick={() => { const r = actions.releaseToService(w.unitId, w.id, rd ? Number(rd) : undefined); if (!r.ok) { toast.error(r.reason); return } toast.success(`Released — ${r.status}`, { description: `${r.closed.join(', ')} closed${r.left.length ? ` · still open: ${r.left.join(', ')}` : ''} · Dispatch notified` }) }}>Release unit to service</Button>}
        </>
      )}
    </div>
  )
}

function InvoiceView({ inv }: { inv: T.Invoice }) {
  const role = useStore(s => s.session!.role)
  const db = useStore(s => s.db)
  const cust = byId(db.customers, inv.customerId)!
  const open = inv.amount - inv.paid
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2"><Badge tone={inv.status === 'Paid' ? 'ok' : inv.status === 'Overdue' ? 'bad' : 'info'}>{inv.status}</Badge><Badge>{agingBucket(inv)}</Badge><Badge tone="warn">{inv.collections}</Badge></div>
      <div className="grid grid-cols-2 gap-3"><div className="card-flat p-4"><div className="label">Amount</div><div className="display text-3xl font-semibold num">{money2(inv.amount)}</div></div><div className="card-flat p-4"><div className="label">Open</div><div className={cn('display text-3xl font-semibold num', open > 0.005 && agingBucket(inv) !== 'Current' && 'text-bad')}>{money2(open)}</div></div></div>
      <div className="card p-4"><Kv k="Job" v={<JobRef id={inv.jobId} long />} /><Kv k="Invoice date" v={fmtDate(inv.date)} /><Kv k="Due" v={fmtDate(inv.due)} /><Kv k="Customer contact" v={<span className="inline-flex items-center gap-2">{cust.contact}<CallButton phone={cust.phone} size="sm" label="Call" /></span>} /></div>
      <div className="card p-0">{inv.lines.map((l, i) => <div key={i} className="flex px-4 py-3 border-b hairline last:border-0 text-sm"><span className="flex-1">{l.description}</span><span className="num">{l.qty} × {money2(l.rate)}</span></div>)}</div>
      <div className="flex gap-2"><Button size="sm" data-testid="inv-print" onClick={() => printInvoice(db, inv)}>Print / PDF</Button>{<Button size="sm" variant="ghost" onClick={() => { location.href = `mailto:?subject=${encodeURIComponent(`Invoice ${inv.invNo}`)}&body=${encodeURIComponent(`Invoice ${inv.invNo} for ${money(inv.amount)} is attached. Balance due ${money(inv.amount - inv.paid)} by ${fmtDate(inv.due)}.`)}` }}>Email</Button>}</div>
      {inv.customerPo && <div className="text-sm text-muted">Customer PO {inv.customerPo}</div>}
      <PaymentList pays={inv.payments} canUndo={['accounting', 'owner'].includes(role)} onUndo={i => { actions.undoPayment(inv.id, i); toast('Payment removed', { description: `${inv.invNo} is open again` }) }} />
      {['accounting', 'owner'].includes(role) && open > 0 && (
        <>
          <PaymentForm key={inv.payments.length} open={open} minDate={inv.date} verb="Record payment" testid="ar-pay" onPay={p => { actions.recordPayment(inv.id, p.amount, p.method, p.ref, p.date); toast.success(p.amount < open ? `Partial payment recorded — ${money(open - p.amount)} still open` : 'Paid in full', { description: `${p.method} ${p.ref}`.trim() }) }} />
          <Field label="Collections status"><select className="input" value={inv.collections} onChange={e => actions.setCollections(inv.id, e.target.value as T.Invoice['collections'])}>{['Current', 'Reminder Sent', 'Call Scheduled', 'Collections'].map(c => <option key={c}>{c}</option>)}</select></Field>
        </>
      )}
    </div>
  )
}

function BillView({ b }: { b: T.VendorBill }) {
  const db = useStore(s => s.db)
  const role = useStore(s => s.session!.role)
  const jobs = db.jobs.filter(j => isLive(j) && j.endDate >= addDays(today(), -60)).sort((a, c) => b.branchId === a.branchId ? -1 : c.jobNo.localeCompare(a.jobNo))
  const total = b.lines.reduce((s, l) => s + l.amount, 0)
  const can = ['accounting', 'owner'].includes(role)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2"><Badge tone={b.status === 'Needs Coding' ? 'bad' : b.status === 'Pending Approval' ? 'warn' : b.status === 'Paid' ? 'ok' : 'info'}>{b.status}</Badge><BranchChip id={b.branchId} /></div>
      <div className="card-flat p-4"><div className="label">Total</div><div className="display text-3xl font-semibold num">{money(total)}</div><div className="text-sm text-muted">Bill date {fmtDate(b.date)} · due {fmtDate(b.due)}{b.approvedBy && ` · approved by ${b.approvedBy}`}</div></div>
      <ThreeWayPanel bill={b} />
      <PaymentList pays={b.payments ?? []} canUndo={can} onUndo={i => { actions.undoBillPayment(b.id, i); toast('Bill payment removed') }} />
      {b.lines.map(l => (
        <div key={l.id} className="card p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3"><div className="flex-1 text-sm">{l.description}</div><div className="num font-semibold">{money(l.amount)}</div></div>
          {b.poId ? <div className="text-xs text-muted">Shop stock from a PO — no job code needed. Items are costed to jobs when they’re checked out.</div> : <div className="grid grid-cols-2 gap-2">
            <Field label="Job number (hits job costing)"><select disabled={!can || b.status === 'Paid'} className="input" value={l.jobId ?? ''} onChange={e => e.target.value && actions.codeBillLine(b.id, l.id, e.target.value, l.category)}><option value="">— Pick a job —</option>{jobs.map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {customerOf(db, j).name} · {siteOf(db, j).city}</option>)}</select></Field>
            <Field label="Cost category"><select disabled={!can || b.status === 'Paid'} className="input" value={l.category} onChange={e => l.jobId && actions.codeBillLine(b.id, l.id, l.jobId, e.target.value as T.CostCategory)}>{COST_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
          </div>}
        </div>
      ))}
      {can && (
        <div className="flex flex-wrap gap-2">
          {b.status === 'Pending Approval' && <Button variant="primary" onClick={() => { const r = actions.setBillStatus(b.id, 'Approved'); r.ok ? toast.success('Approved — posted to job cost') : toast.error(r.reason) }}>Approve</Button>}
          {b.status === 'Needs Coding' && <Button variant="primary" onClick={() => { const r = actions.setBillStatus(b.id, 'Approved'); r.ok ? toast.success('Approved') : toast.error(r.reason) }}>Approve</Button>}
          {b.status === 'Approved' && <div className="w-full"><PaymentForm key={(b.payments ?? []).length} minDate={b.date} open={total - (b.payments ?? []).reduce((s, q) => s + q.amount, 0)} verb="Pay bill" testid="ap-pay" onPay={p => { const r = actions.payBill(b.id, p); r.ok ? toast.success('Payment recorded', { description: `${p.method} ${p.ref}`.trim() }) : toast.error(r.reason) }} /></div>}
          {b.status !== 'Paid' && b.status !== 'Rejected' && <Button variant="ghost" onClick={() => actions.setBillStatus(b.id, 'Rejected')}>Reject</Button>}
        </div>
      )}
    </div>
  )
}
