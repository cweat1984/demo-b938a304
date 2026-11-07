import { useMemo, useState } from 'react'
import Onboarding from '../launch2/Onboarding'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { Search, UserPlus, Check, X, FileText, Plus, Pencil } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { inScope, byId, fullName, workStatus, certBand } from '../data/logic'
import { cn, fmtDate, today, addDays } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Modal, Field, Card, Avatar, Progress, Empty, Toggle, CallButton } from '../components/ui'
import { FlagMark } from '../components/Flag'

const STEPS: [string, string][] = [['account', 'Company account & email'], ['profile', 'Profile & photo'], ['id', 'ID / I-9 / W-4'], ['emergency', 'Emergency contact'], ['sizes', 'Shirt & boot sizes'], ['training', 'Orientation & OSHA'], ['sds', 'SDS / Hazcom sign-off']]
const OFFBOARD: [string, string][] = [['gear', 'Company gear / PPE returned'], ['cards', 'Fuel & company cards deactivated'], ['badge', 'Badge & keys returned'], ['accounts', 'Email / app accounts disabled'], ['pay', 'Final paycheck per state law (OK/TX)'], ['cobra', 'COBRA / benefits notice sent'], ['union', 'Union hall notified (if union)']] // dive2
const SVC: T.ServiceBranch[] = ['Army', 'Navy', 'Air Force', 'Marine Corps', 'Coast Guard', 'Space Force', 'National Guard']

export default function People() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const role = useStore(s => s.session!.role)
  const [tab, setTab] = useKeep<'people' | 'onboarding' | 'pto' | 'records'>('people:tab', 'people')
  const [q, setQ] = useKeep('people:q', '')
  const [craft, setCraft] = useState('All')
  const [vets, setVets] = useState(false)
  const [newHire, setNewHire] = useState(false)
  const [rec, setRec] = useState(false)
  const [edit, setEdit] = useState<T.Employee | null>(null)
  const hr = role === 'hr' || role === 'owner'
  const myId = useStore(s => s.session!.employeeId)
  // dive2: performance reviews only for HR/owner and the person's direct manager; other confidential records HR/owner only
  const canSeeRec = (r: T.HrRecord) => hr || (r.kind === 'Review' ? !!myId && byId(db.employees, r.employeeId)?.supervisorId === myId : !r.confidential)
  const people = useMemo(() => db.employees.filter(e => inScope(e, f) && (craft === 'All' || e.craft === craft) && (!vets || e.veteran) && (!q || `${e.first} ${e.last} ${e.empNo} ${e.craft} ${e.city}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.last.localeCompare(b.last)), [db, f, craft, vets, q])
  const crafts = ['All', ...Array.from(new Set(db.employees.map(e => e.craft))).sort()]
  const pending = db.pto.filter(p => p.status === 'Pending')
  const vetCount = db.employees.filter(e => inScope(e, f) && e.veteran).length
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow="HR" title="People" sub={`${db.employees.filter(e => inScope(e, f)).length} employees · ${db.hires.length} onboarding · ${pending.length} PTO requests · ${vetCount} veterans`} actions={hr && <>
        <Button icon={<FileText className="size-4" />} onClick={() => setRec(true)}>Review / write-up</Button>
        <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setNewHire(true)}>New hire</Button>
      </>} />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: 'people', label: 'Directory' }, { value: 'onboarding', label: 'Onboarding', count: db.hires.length }, { value: 'pto', label: 'Time off', count: pending.length }, { value: 'records', label: 'Records' }]} />
      {tab === 'people' && <>
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <div className="relative w-full sm:w-72"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Name, employee #, city" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-1 px-1" data-testid="people-chips">
          {crafts.map(c => { const n = db.employees.filter(e => inScope(e, f) && (c === 'All' || e.craft === c)).length; const on = craft === c && !vets; return <button key={c} onClick={() => { setCraft(c); setVets(false) }} className={cn('shrink-0 inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-sm font-semibold border transition', on ? 'bg-surface-3 border-accent text-ink' : 'border-line text-muted hover:text-ink')}>{c === 'All' ? 'All' : ({ Accounting: 'Accounting', 'Front Desk': 'Front desk', HR: 'HR', Inventory: 'Inventory', Payroll: 'Payroll', Safety: 'Safety', Sales: 'Sales', Dispatch: 'Dispatch' } as Record<string, string>)[c] ?? (c.endsWith('s') ? c : c + 's')} <span className="num text-xs opacity-70">{n}</span></button> })}
          <button onClick={() => { setVets(!vets); setCraft('All') }} className={cn('shrink-0 inline-flex items-center gap-2 rounded-full px-3.5 h-9 text-sm font-semibold border transition', vets ? 'bg-surface-3 border-accent text-ink' : 'border-line text-muted hover:text-ink')} data-testid="vet-filter"><FlagMark width={18} />Veterans <span className="num text-xs opacity-70">{vetCount}</span></button>
        </div>
        <div className="card p-0 overflow-hidden">{people.map(e => { const ws = workStatus(db, e.id, today()); const bad = db.certs.filter(c => c.employeeId === e.id && ['expired', '30'].includes(certBand(c).band)).length; return (
          <div key={e.id} className="flex items-center gap-4 px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2 transition">
            <button onClick={() => open({ type: 'employee', id: e.id })} className="flex items-center gap-3 flex-1 min-w-0 text-left">
              <Avatar name={fullName(e)} size={36} />
              <span className="min-w-0"><span className="font-semibold flex items-center gap-1.5">{fullName(e)}{e.veteran && <span title={`Veteran${e.veteran.branch ? ` · ${e.veteran.branch}` : ''}`}><FlagMark width={14} /></span>}</span><span className="block text-xs text-muted truncate">{e.status === 'Inactive' && <span className="text-bad font-semibold" data-testid="emp-inactive">Inactive{e.term ? ` since ${fmtDate(e.term.lastDay)}` : ''} · </span>}{e.craft} · {e.empNo} · {byId(db.branches, e.branchId)?.code}</span></span>
            </button>
            <span className="hidden md:block w-40 text-sm text-muted">{ws}</span>
            <span className="hidden lg:block w-32">{bad ? <Badge tone="bad">{bad} cert issue{bad > 1 ? 's' : ''}</Badge> : <Badge tone="ok">Certs OK</Badge>}</span>
            <CallButton phone={e.phone} label="Call" size="sm" />
            {hr && <button className="btn-icon" aria-label="Edit" onClick={() => setEdit(e)}><Pencil className="size-4" /></button>}
          </div>) })}{!people.length && <Empty title="Nobody matches" />}</div>
      </>}
      {tab === 'onboarding' && <Onboarding embedded />}
      {tab === 'pto' && <div className="card p-0 overflow-hidden">{[...pending, ...db.pto.filter(p => p.status !== 'Pending').slice(0, 20)].map(p => { const e = byId(db.employees, p.employeeId)!; const clash = db.assignments.filter(a => a.employeeId === e.id && a.date >= p.from && a.date <= p.to).length; return (
        <div key={p.id} className="flex items-center gap-4 px-5 py-3 border-b hairline last:border-0">
          <Avatar name={fullName(e)} size={32} />
          <span className="flex-1 min-w-0"><span className="block font-semibold text-sm">{fullName(e)} · {p.kind}</span><span className="block text-xs text-muted">{fmtDate(p.from)} – {fmtDate(p.to)} · {p.hours}h{p.note ? ` · ${p.note}` : ''}</span></span>
          {clash > 0 && p.status === 'Pending' && <Badge tone="warn">On {clash} scheduled day{clash > 1 ? 's' : ''}</Badge>}
          {p.status === 'Pending' && hr ? <><Button size="sm" variant="ok" icon={<Check className="size-4" />} onClick={() => { actions.decidePto(p.id, 'Approved'); toast.success('Approved — Dispatch board updated') }}>Approve</Button><Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => actions.decidePto(p.id, 'Denied')}>Deny</Button></> : <Badge tone={p.status === 'Approved' ? 'ok' : p.status === 'Denied' ? 'bad' : 'info'}>{p.status}</Badge>}
        </div>) })}</div>}
      {tab === 'records' && <div className="card p-0 overflow-hidden" data-testid="hr-records">{db.hrRecords.filter(canSeeRec).map(r => (
        <div key={r.id} className="flex items-center gap-4 px-5 py-3 border-b hairline last:border-0">
          <Badge tone={r.kind === 'Write-Up' ? 'bad' : r.kind === 'Commendation' ? 'ok' : r.kind === 'Review' ? 'info' : 'neutral'}>{r.kind}</Badge>
          <span className="flex-1 min-w-0"><span className="block font-semibold text-sm truncate">{fullName(byId(db.employees, r.employeeId))} · {r.title}</span><span className="block text-xs text-muted truncate">{r.detail}</span></span>
          {r.rating && <span className="text-sm num">{'★'.repeat(r.rating)}<span className="text-faint">{'★'.repeat(5 - r.rating)}</span></span>}
          {r.confidential && <Badge>Confidential</Badge>}
          <span className="text-xs text-muted w-20 text-right">{fmtDate(r.date)}</span>
        </div>))}</div>}
      <NewHire open={newHire} onClose={() => setNewHire(false)} />
      <NewRecord open={rec} onClose={() => setRec(false)} />
      <EditEmployee e={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function NewHire({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [first, setFirst] = useState(''), [last, setLast] = useState(''), [craft, setCraft] = useState<T.Craft>('Rigger'), [phone, setPhone] = useState(''), [start, setStart] = useState(addDays(today(), 7)), [sup, setSup] = useState('')
  const scope = useStore(s => s.ui.filter)
  const [branchId, setBranchId] = useState(scope.branchId !== 'all' ? scope.branchId : 'br-okc'), [divisionId, setDivisionId] = useState(scope.divisionId !== 'all' ? scope.divisionId : 'div-slh')
  const CRAFT_RATE: Record<string, number> = { Operator: 42, Rigger: 30, Oiler: 28, 'Truck Driver': 32, Supervisor: 45, 'Uptower Tech': 34, Millwright: 36, Mechanic: 38 }
  const [rate, setRate] = useState('30')
  const nameOk = /[a-z]/i.test(first.trim()) && /[a-z]/i.test(last.trim())
  const phoneDigits = phone.replace(/\D/g, '')
  const hireErr = !nameOk ? 'First and last name are required (letters, not just spaces)' : phone.trim() && phoneDigits.length !== 10 ? 'Phone must be 10 digits' : !(Number(rate) > 0) ? 'Pay rate must be a positive $/hr' : !start ? 'Start date is required' : ''
  const email = first && last ? `${first.trim().toLowerCase().replace(/[^a-z]/g, '')}.${last.trim().toLowerCase().replace(/[^a-z]/g, '')}@slh-demo.example` : 'first.last@slh-demo.example'
  return (
    <Modal open={open} onClose={onClose} title="New hire" sub="Creates the company account, employee # and onboarding checklist.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3"><Field label="First"><input className="input" value={first} onChange={e => setFirst(e.target.value)} /></Field><Field label="Last"><input className="input" value={last} onChange={e => setLast(e.target.value)} /></Field></div>
        <div className="rounded-2xl bg-surface-2 px-4 py-3 text-sm font-mono">{email}</div>
        <div className="grid grid-cols-2 gap-3"><Field label="Craft"><select className="input" data-testid="hire-craft" value={craft} onChange={e => { setCraft(e.target.value as T.Craft); setRate(String(CRAFT_RATE[e.target.value] ?? 30)) }}>{['Operator', 'Rigger', 'Oiler', 'Truck Driver', 'Supervisor', 'Uptower Tech', 'Millwright', 'Mechanic'].map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Start date"><input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></Field></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} /></Field><Field label="Supervisor"><select className="input" value={sup} onChange={e => setSup(e.target.value)}><option value="">—</option>{db.employees.filter(e => e.craft === 'Supervisor').map(e => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</select></Field></div>
        <div className="grid grid-cols-3 gap-3"><Field label="Branch"><select className="input" data-testid="hire-branch" value={branchId} onChange={e => setBranchId(e.target.value)}>{db.branches.map(b => <option key={b.id} value={b.id}>{b.code} · {b.city}</option>)}</select></Field><Field label="Division"><select className="input" data-testid="hire-division" value={divisionId} onChange={e => setDivisionId(e.target.value)}>{db.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field><Field label="Pay rate ($/hr)"><input className="input num" inputMode="decimal" data-testid="hire-rate" value={rate} onChange={e => setRate(e.target.value)} /></Field></div>
        {hireErr && (first || last || phone) && <div className="text-xs text-warn" data-testid="hire-err">{hireErr}</div>}
        <Button variant="primary" size="lg" data-testid="hire-create" disabled={!!hireErr} onClick={() => { const r = actions.createHire({ first: first.trim(), last: last.trim(), craft, phone: phone.trim(), start, supervisorId: sup || undefined, branchId, divisionId, rate: Number(rate) }); if (r.warn) toast.warning(r.warn); toast.success(`${r.hire.empNo} created`, { description: r.hire.email }); setFirst(''); setLast(''); onClose() }}>Create hire</Button>
      </div>
    </Modal>
  )
}
function NewRecord({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const me = useStore(s => s.session!.name)
  const [emp, setEmp] = useState(''), [kind, setKind] = useState<T.HrRecord['kind']>('Review'), [title, setTitle] = useState(''), [detail, setDetail] = useState(''), [rating, setRating] = useState(4), [conf, setConf] = useState(true)
  return (
    <Modal open={open} onClose={onClose} title="Add HR record">
      <div className="flex flex-col gap-4">
        <Field label="Employee"><select className="input" value={emp} onChange={e => setEmp(e.target.value)}><option value="">Pick…</option>{[...db.employees].sort((a, b) => a.last.localeCompare(b.last)).map(e => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</select></Field>
        <Segmented value={kind} onChange={setKind} options={(['Review', 'Write-Up', 'Commendation', 'Document', 'Pay Change'] as const).map(k => ({ value: k, label: k }))} size="sm" />
        <Field label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === 'Write-Up' ? 'PPE violation — no hard hat' : 'Annual review'} /></Field>
        <Field label="Detail"><textarea className="input min-h-20" value={detail} onChange={e => setDetail(e.target.value)} /></Field>
        {kind === 'Review' && <Field label={`Rating · ${rating}/5`}><input type="range" min={1} max={5} value={rating} onChange={e => setRating(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></Field>}
        <Toggle checked={conf} onChange={setConf} label="Confidential (HR & owners only)" />
        <Button variant="primary" size="lg" disabled={!emp || !title} onClick={() => { actions.addHrRecord({ employeeId: emp, date: today(), kind, title, detail, by: me, rating: kind === 'Review' ? rating : undefined, confidential: conf, acknowledged: false }); toast.success('Saved to employee file'); setTitle(''); setDetail(''); onClose() }}><Plus className="size-4" />Save</Button>
      </div>
    </Modal>
  )
}
function EditEmployee({ e, onClose }: { e: T.Employee | null; onClose: () => void }) {
  return <Modal open={!!e} onClose={onClose} title={e ? `Edit ${fullName(e)}` : ''}>{e && <EditForm e={e} onClose={onClose} />}</Modal>
}
const CRAFT_OPTS: T.Craft[] = ['Operator', 'Rigger', 'Oiler', 'Truck Driver', 'Supervisor', 'Safety', 'Uptower Tech', 'Millwright', 'Mechanic', 'Dispatcher', 'Project Manager', 'HR', 'Payroll', 'Sales', 'Inventory', 'Accounting', 'Front Desk', 'Branch Manager', 'Field Ops Manager', 'Executive']
function EditForm({ e, onClose }: { e: T.Employee; onClose: () => void }) {
  const [phone, setPhone] = useState(e.phone), [city, setCity] = useState(e.city), [status, setStatus] = useState(e.status)
  const [first, setFirst] = useState(e.first), [last, setLast] = useState(e.last), [craft, setCraft] = useState<T.Craft>(e.craft), [email, setEmail] = useState(e.email)
  const [vet, setVet] = useState(!!e.veteran), [branch, setBranch] = useState<T.ServiceBranch | ''>(e.veteran?.branch ?? ''), [years, setYears] = useState(String(e.veteran?.years ?? ''))
  const [lastDay, setLastDay] = useState(today()), [reason, setReason] = useState(''), [rehire, setRehire] = useState(true) // dive2
  const separating = status === 'Inactive' && e.status !== 'Inactive'
  const live = useStore(s => s.db.employees.find(x => x.id === e.id)) ?? e
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3"><Field label="First name"><input className="input" data-testid="emp-first" value={first} onChange={ev => setFirst(ev.target.value)} /></Field><Field label="Last name"><input className="input" data-testid="emp-last" value={last} onChange={ev => setLast(ev.target.value)} /></Field>
        <Field label="Role / craft"><select className="input" data-testid="emp-craft" value={craft} onChange={ev => setCraft(ev.target.value as T.Craft)}>{CRAFT_OPTS.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="Email"><input className="input" data-testid="emp-email" value={email} onChange={ev => setEmail(ev.target.value)} /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Phone"><input className="input" value={phone} onChange={ev => setPhone(ev.target.value)} /></Field><Field label="City"><input className="input" value={city} onChange={ev => setCity(ev.target.value)} /></Field></div>
      <Field label="Status"><select className="input" data-testid="emp-status" value={status} onChange={ev => setStatus(ev.target.value as T.Employee['status'])}>{['Active', 'Inactive', 'Pending Onboarding'].map(s => <option key={s}>{s}</option>)}</select></Field>
      {separating && <div className="rounded-2xl border border-bad/30 bg-bad/5 p-4 flex flex-col gap-3" data-testid="term-box"><div className="font-semibold text-sm">Separation</div>
        <div className="grid grid-cols-2 gap-3"><Field label="Last day worked"><input type="date" className="input" data-testid="term-last" value={lastDay} onChange={ev => setLastDay(ev.target.value)} /></Field>
          <Field label="Reason"><select className="input" data-testid="term-reason" value={reason} onChange={ev => setReason(ev.target.value)}><option value="">Pick…</option>{['Voluntary — quit / resigned', 'Voluntary — job abandonment (no call/no show)', 'Involuntary — performance', 'Involuntary — safety / policy violation', 'Involuntary — failed / refused drug test', 'Layoff — lack of work', 'End of temp / project', 'Retired', 'Deceased'].map(x => <option key={x}>{x}</option>)}</select></Field></div>
        <Toggle checked={rehire} onChange={setRehire} label="Eligible for rehire" />
        <div className="text-xs text-muted">Saving removes them from every job after the last day and from their supervisor’s team, and blocks field sign-in and clock-in. Dispatch is told to replace them.</div></div>}
      {live.status !== 'Inactive' && live.term && <div className="rounded-2xl bg-warn/10 p-3 text-sm" data-testid="term-scheduled">Separation scheduled · last day {fmtDate(live.term.lastDay)} · {live.term.reason}. Field access ends the day after.</div>}
      {live.status === 'Inactive' && live.term && <div className="rounded-2xl bg-surface-2 p-4 flex flex-col gap-2" data-testid="offboard"><div className="font-semibold text-sm">Offboarding · last day {fmtDate(live.term.lastDay)} · {live.term.reason} · rehire {live.term.rehire ? 'yes' : 'no'} · {OFFBOARD.filter(([k]) => live.term?.checklist?.[k]).length}/{OFFBOARD.length} done</div>
        {OFFBOARD.map(([k, l]) => <Toggle key={k} checked={!!live.term?.checklist?.[k]} onChange={v => actions.offboardStep(e.id, k, v)} label={l} />)}</div>}
      <div className="rounded-2xl bg-surface-2 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2"><FlagMark width={20} /><Toggle checked={vet} onChange={setVet} label="Veteran" /></div>
        {vet && <div className="grid grid-cols-2 gap-3"><Field label="Branch of service (optional)"><select className="input" value={branch} onChange={ev => setBranch(ev.target.value as T.ServiceBranch)}><option value="">Prefer not to say</option>{SVC.map(s => <option key={s}>{s}</option>)}</select></Field><Field label="Years (optional)"><input className="input" inputMode="numeric" value={years} onChange={ev => setYears(ev.target.value.replace(/\D/g, ''))} /></Field></div>}
      </div>
      <Button variant="primary" size="lg" data-testid="emp-save" disabled={separating && (!lastDay || !reason)} onClick={() => { actions.updateEmployee(e.id, { first: first.trim() || e.first, last: last.trim() || e.last, craft, email: email.trim(), phone, city, status: separating ? e.status : status, veteran: vet ? { branch: branch || undefined, years: years ? Number(years) : undefined } : undefined }); if (separating) { const n = actions.terminateEmployee(e.id, { lastDay, reason, rehire }); (lastDay > today() ? toast.success(`${e.first}’s separation scheduled`, { description: `Works through ${fmtDate(lastDay)} · removed from ${n} later day(s) · field access ends the day after` }) : toast.success(`${e.first} separated`, { description: `Removed from ${n} scheduled day(s) and their team · field access blocked` })) } else toast.success('Saved'); onClose() }}>{separating ? 'Save separation' : 'Save'}</Button>
    </div>
  )
}
