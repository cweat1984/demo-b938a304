import { moneyHidden } from '../lib/util'
/** Field app additions from the field review: My pay, one-tap injury / near-miss report, and the supervisor's My crew. */
import { canSeeMoney } from '../data/roles'
import { useEffect, useState } from 'react'
import { savePhotos, PhotoThumb } from '../lib/photos'
import { toast } from 'sonner'
import { Construction, Siren, Users, CheckCircle2, Camera, FileText } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName, crewOn, customerOf, siteOf } from '../data/logic'
import { today, addDays, cn, fmtDate } from '../lib/util'
import { Button, Field, Badge, Avatar, CallButton, confirmChoice } from '../components/ui'
import { PER_DIEM_RATES } from '../data/seed'
import WindJobCard from '../components/WindJob'
import { useMe } from './FieldApp'
import { useJobLocal, siteSupervisor } from './jobFacts'
import JobExtras from '../components/JobExtras'

const money = (n: number) => moneyHidden() ? '—' : `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
/** Monday of the week containing d */
const monday = (d: string) => { const x = new Date(d + 'T12:00:00'); const k = (x.getDay() + 6) % 7; return addDays(d, -k) }
function weekPay(entries: T.TimeEntry[], rate: number) {
  const hours = entries.reduce((s, t) => s + t.hours, 0), reg = Math.min(40, hours), ot = Math.max(0, hours - 40)
  const pd = entries.reduce((s, t) => s + t.perDiems.reduce((a, p) => a + (PER_DIEM_RATES[p] ?? 0), 0), 0)
  const wages = reg * rate + ot * rate * 1.5
  return { hours, reg, ot, pd, wages, gross: wages + pd, net: wages * 0.76 + pd }
}

export function MyPay() {
  const guest = useStore(s => s.session?.role === 'guest')
  if (guest && !canSeeMoney('guest')) return <div className="rounded-3xl bg-surface p-6 text-center" data-testid="pay-guest"><div className="font-semibold">Pay isn’t part of this guest pass</div><div className="text-sm text-muted mt-1">Crew members see this week’s hours, overtime, per diem and past pay stubs here.</div></div>
  return <MyPayInner />
}
function MyPayInner() {
  const { db, me, current } = useMe()
  const jobLocal = useJobLocal(current)
  const t = today(), wk = monday(t)
  const mine = db.time.filter(x => x.employeeId === me.id)
  const thisWeek = weekPay(mine.filter(x => x.date >= wk && x.date <= t), me.rate)
  // past weeks: real approved time where we have it, otherwise a typical demo week (5 × 10 h, hotel per diem)
  const demoWeek = (from: string, n: number): T.TimeEntry[] => [0, 1, 2, 3, 4].map(d => ({ id: `demo-${n}-${d}`, employeeId: me.id, date: addDays(from, d), activity: 'Lifting & Hoisting', start: '06:00', end: '16:30', mealMin: 30, hours: n % 2 ? 10 : 9, perDiems: ['Hotel'], status: 'Exported', submittedAt: '' }))
  const stubs = [1, 2, 3, 4].map(n => { const from = addDays(wk, -7 * n), to = addDays(from, 6); const real = mine.filter(x => x.date >= from && x.date <= to); if (!real.length && (me.hireDate ?? '') > from) return null; return { from, to, paid: addDays(to, 5), ...weekPay(real.length ? real : demoWeek(from, n), me.rate) } }).filter((x): x is NonNullable<typeof x> => !!x) // dive2 field M6: no invented stubs before the hire date
  const [stub, setStub] = useState<string | null>(null)
  return <div className="flex flex-col gap-4 pb-8" data-testid="my-pay">
    <div className="rounded-3xl bg-surface p-5">
      <div className="label">This week so far · {fmtDate(wk)} – today</div>
      <div className="display text-4xl font-semibold num mt-1" data-testid="pay-week-gross">{money(thisWeek.gross)}</div>
      <div className="text-xs text-muted">{money(thisWeek.wages)} wages before taxes + {money(thisWeek.pd)} per diem (not taxed, shown apart) · paid Friday {fmtDate(addDays(wk, 11))}</div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center">
        <div className="rounded-2xl bg-surface-2 p-3"><div className="text-xs text-muted">Regular</div><div className="font-semibold num">{thisWeek.reg.toFixed(1)}h</div></div>
        <div className="rounded-2xl bg-surface-2 p-3"><div className="text-xs text-muted">Overtime</div><div className="font-semibold num">{thisWeek.ot.toFixed(1)}h</div></div>
        <div className="rounded-2xl bg-surface-2 p-3"><div className="text-xs text-muted">Per diem</div><div className="font-semibold num">{money(thisWeek.pd)}</div></div>
      </div>
      <div className="text-sm text-muted mt-3">Rate <b className="text-ink num">${me.rate}/hr</b> · OT 1.5× after 40 h{me.local ? <> · home local {me.local}</> : null}{current ? <> · job #{current.jobNo} pays <span data-testid="pay-job-local">{jobLocal}</span></> : null}</div>
    </div>
    <div className="label px-1">Pay stubs</div>
    <div className="rounded-3xl bg-surface divide-y divide-[var(--line)]">{stubs.length ? stubs.map(s => <div key={s.from}><button className="w-full flex items-center gap-3 px-4 py-3 text-left min-h-[56px]" data-testid="pay-stub" aria-expanded={stub === s.from} onClick={() => setStub(stub === s.from ? null : s.from)}>
      <FileText className="size-5 text-muted" /><span className="flex-1"><span className="block font-semibold">Paid {fmtDate(s.paid)}</span><span className="block text-xs text-muted">{fmtDate(s.from)} – {fmtDate(s.to)} · {s.hours.toFixed(1)} h{s.ot ? ` (${s.ot.toFixed(1)} OT)` : ''}</span></span>
      <span className="text-right"><span className="block font-semibold num">{money(s.net)}</span><span className="block text-[11px] text-muted">take-home</span></span></button>{stub === s.from && <div className="px-4 pb-4 text-sm grid grid-cols-2 gap-y-1" data-testid="stub-detail"><span className="text-muted">Regular {s.reg.toFixed(1)} h</span><span className="text-right num">{money(s.reg * me.rate)}</span><span className="text-muted">Overtime {s.ot.toFixed(1)} h × 1.5</span><span className="text-right num">{money(s.ot * me.rate * 1.5)}</span><span className="font-semibold">Gross wages</span><span className="text-right num font-semibold">{money(s.wages)}</span><span className="text-muted">Taxes & withholding (est.)</span><span className="text-right num">−{money(s.wages * 0.24)}</span><span className="text-muted">Per diem (not taxed)</span><span className="text-right num">+{money(s.pd)}</span><span className="font-semibold border-t hairline pt-1">Take-home</span><span className="text-right num font-semibold border-t hairline pt-1">{money(s.net)}</span></div>}</div>) : <div className="p-4 text-sm text-muted">No paid weeks yet — your first stub shows here after your first payday (Friday after your first full week).</div>}</div>
    <button className="rounded-3xl bg-surface p-4 flex items-center gap-3 text-left min-h-[56px]" onClick={() => toast('W-2 for 2025', { description: 'Demo: opens the PDF from Paychex. Your real W-2 comes from payroll in January.' })} data-testid="pay-w2"><FileText className="size-5 text-muted" /><span className="flex-1 font-semibold">W-2 · 2025</span><span className="text-sm text-accent font-semibold">Open</span></button>
    <div className="text-xs text-muted px-1">Demo figures worked out from your approved time. Questions? Call payroll from More → Call the office.</div>
  </div>
}

const KINDS: { k: T.Incident['kind']; label: string }[] = [{ k: 'Near Miss', label: 'Near miss' }, { k: 'First Aid', label: 'Someone got hurt' }, { k: 'Property Damage', label: 'Property damage' }, { k: 'Vehicle', label: 'Vehicle' }, { k: 'Environmental', label: 'Spill / environmental' }]
export function IncidentForm({ onDone }: { onDone: () => void }) {
  const { db, me, current } = useMe()
  const [kind, setKind] = useState<T.Incident['kind']>('Near Miss')
  const [desc, setDesc] = useState(''), [stop, setStop] = useState(false), [refs, setRefs] = useState<string[]>([]), [upl, setUpl] = useState(false), [busy, setBusy] = useState(false)
  // field fixes: real GPS only when the phone shares it — never claim a location we don't have
  const [loc, setLoc] = useState<{ lat: number; lng: number } | 'off' | null>(null)
  useEffect(() => { try { navigator.geolocation?.getCurrentPosition(p => setLoc({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5) }), () => setLoc('off'), { timeout: 8000, maximumAge: 120000 }) } catch { setLoc('off') }; if (!navigator.geolocation) setLoc('off') }, [])
  const safety = db.employees.find(e => e.craft === 'Safety')
  const sup = siteSupervisor(db, current, today()) // field fixes: the supervisor on today's crew
  const send = () => {
    if (busy) return; setBusy(true)
    const gps = loc && loc !== 'off' ? loc : undefined
    actions.addIncident({ date: today(), jobId: current?.id, employeeId: me.id, kind, severity: stop || kind === 'First Aid' ? 'High' : 'Medium', description: `${stop ? 'STOP WORK called. ' : ''}${desc.trim()}`, status: 'Reported', reportedBy: fullName(me), photos: refs.length, photoRefs: refs, ...(gps ?? {}) })
    if (!navigator.onLine) toast.warning('Saved on this phone — not sent yet', { description: `It goes to Safety the moment you have signal.${sup?.phone ? ` If someone is hurt, call ${sup.first} now: ${sup.phone}.` : ' If someone is hurt, call your supervisor now.'}`, duration: 12000 })
    else toast.success('Report sent', { description: `Safety${safety ? ` (${safety.first})` : ''}${sup ? ` and ${sup.first}` : ''} have it now. Thank you for speaking up.` }); onDone()
  }
  return <div className="flex flex-col gap-4 pb-8" data-testid="incident-form">
    <div className="rounded-2xl bg-bad/12 text-bad p-3 text-sm font-semibold">If someone is badly hurt, call 911 first.</div>
    <div className="grid grid-cols-2 gap-2">{KINDS.map(o => <button key={o.k} onClick={() => setKind(o.k)} data-testid={`inc-${o.k.replace(/\s/g, '')}`} className={cn('min-h-[48px] rounded-2xl px-3 font-semibold text-sm border', kind === o.k ? 'bg-bad-solid text-white border-transparent' : 'bg-surface-2 border-line')}>{o.label}</button>)}</div>
    <Field label="What happened? (talk-to-text works)"><textarea className="input min-h-[110px]" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Where, who, what you saw" data-testid="inc-desc" /></Field>
    <div className="flex gap-2"><label className="flex-1 min-h-[48px] rounded-2xl bg-surface-2 font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"><Camera className="size-5" />{upl ? 'Saving…' : refs.length ? `${refs.length} photo${refs.length > 1 ? 's' : ''}` : 'Add photo'}<input type="file" accept="image/*" capture="environment" multiple className="hidden" data-testid="inc-photo" onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (!fs.length) return; setUpl(true); savePhotos(fs, 'inc', 6).then(r => setRefs(p => [...p, ...r])).catch(err => toast.error(String(err.message ?? err))).finally(() => setUpl(false)) }} /></label>
      <button className={cn('flex-1 min-h-[48px] rounded-2xl font-semibold border', stop ? 'bg-bad/15 border-bad text-bad' : 'border-line')} onClick={() => setStop(!stop)} data-testid="inc-stop">{stop ? '✓ Stop work called' : 'Stop work?'}</button></div>
    {refs.length > 0 && <div className="flex gap-2 flex-wrap">{refs.map(r => <PhotoThumb key={r} src={r} />)}</div>}
    <div className="text-xs text-muted" data-testid="inc-loc">{current ? `Job #${current.jobNo} · ${siteOf(db, current).name}` : 'No job today'} · {loc === null ? 'getting your location…' : loc === 'off' ? 'location not shared (allow Location for this site to attach it)' : 'your location is attached'} · works with no signal</div>
    <Button size="xl" variant="danger" disabled={desc.trim().length < 3 || busy || upl} onClick={send} data-testid="inc-send">Send to Safety</Button>
  </div>
}

/** Supervisor's crew view: today's jobs I run, roll call with clock status, approve crew time, crane status, turbines. */
export function MyCrew() {
  const { db, me } = useMe(); const t = today()
  const jobs = db.jobs.filter(j => j.supervisorId === me.id && j.status !== 'Complete' && db.assignments.some(a => a.jobId === j.id && a.date >= t))
  if (!jobs.length) return <div className="rounded-3xl bg-surface p-6 text-center text-muted" data-testid="my-crew">No crews assigned to you yet. Dispatch sets this on the job.</div>
  return <div className="flex flex-col gap-4 pb-8" data-testid="my-crew">{jobs.map(j => {
    const crew = crewOn(db, j.id, t).map(a => ({ a, e: byId(db.employees, a.employeeId)! })).filter(x => x.e)
    const ids = crew.map(c => c.e.id)
    const pending = db.time.filter(x => ids.includes(x.employeeId) && x.employeeId !== me.id && x.jobId === j.id && x.status === 'Submitted' && x.date >= addDays(t, -7)) // dive3 M1: only time on THIS job
    const flagged = db.time.filter(x => ids.includes(x.employeeId) && x.employeeId !== me.id && x.jobId === j.id && x.status === 'Flagged' && x.date >= addDays(t, -7))
    const crane = byId(db.equipment, j.craneId)
    return <div key={j.id} className="rounded-3xl bg-surface p-4 flex flex-col gap-3" data-testid="crew-job">
      <div><div className="text-xs text-muted font-semibold">Job #{j.jobNo} · {siteOf(db, j).city}</div><div className="font-semibold text-lg">{customerOf(db, j).name}</div></div>
      {crane && <div className="flex items-center gap-2 text-sm"><Construction className="size-4 text-muted" />Crane {crane.unit}<Badge tone={crane.status === 'Out of Service' || crane.status === 'Maintenance' ? 'bad' : 'ok'} dot>{crane.status}</Badge></div>}
      <div className="label flex items-center gap-1.5"><Users className="size-3.5" />Roll call · {crew.length}</div>
      <div className="flex flex-col">{crew.map(({ a, e }) => { const c = db.clocks.find(x => x.employeeId === e.id); return <div key={a.id} className="flex items-center gap-3 py-1.5" data-testid="roll-row"><Avatar name={fullName(e)} size={34} /><div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{fullName(e)}</div><div className="text-xs text-muted">{a.position}</div></div><Badge tone={c ? 'ok' : 'neutral'}>{c ? 'On the clock' : 'Not clocked in'}</Badge>{e.id !== me.id && <CallButton phone={e.phone} label="Call" size="md" className="h-11 rounded-full px-3" />}</div> })}</div>
      {pending.length > 0 || flagged.length > 0 ? <CrewApprove pending={pending} flagged={flagged} /> : <div className="text-sm text-muted inline-flex items-center gap-1.5"><CheckCircle2 className="size-4 text-ok" />Crew time is all approved</div>}
      <JobExtras job={j} field />
      <WindJobCard job={j} field />
    </div>
  })}</div>
}
export const SirenIcon = Siren

/** Crew notifications: dispatch added, moved or removed me — shown at the top of the field home until I tap Got it. */
export function CrewUpdates() {
  const { db, me } = useMe()
  const mine = db.notices.filter(n => n.empIds?.includes(me.id) && !n.read).slice(0, 3)
  if (!mine.length) return null
  return <div className="rounded-3xl bg-accent/10 border border-accent/40 p-4 flex flex-col gap-2" data-testid="crew-updates">
    <div className="text-xs font-bold uppercase tracking-wide text-accent">From dispatch · {mine.length} update{mine.length === 1 ? '' : 's'}</div>
    {mine.map(n => <div key={n.id} className="flex items-start gap-3" data-testid="crew-update">
      <div className="flex-1 min-w-0"><div className="font-semibold leading-snug">{n.title}</div><div className="text-sm text-muted">{n.body}</div></div>
      <button onClick={() => actions.markRead(n.id)} className="shrink-0 h-[44px] px-4 rounded-xl bg-surface font-semibold" data-testid="crew-update-ok">Got it</button>
    </div>)}
  </div>
}

/** dive2 field M5: per-person crew time approval — see who, which day, how many hours; flagged entries are shown and never bulk-approved. */
function CrewApprove({ pending, flagged }: { pending: T.TimeEntry[]; flagged: T.TimeEntry[] }) {
  const db = useStore(s => s.db)
  const [sel, setSel] = useState<string[]>(() => pending.map(p => p.id))
  const chosen = pending.filter(p => sel.includes(p.id)); const h = chosen.reduce((s, p) => s + p.hours, 0)
  const nm = (id: string) => { const e = byId(db.employees, id); return e ? fullName(e) : id }
  const go = async () => {
    const r = await confirmChoice(`Approve ${chosen.length} entr${chosen.length === 1 ? 'y' : 'ies'}, ${h.toFixed(1)} h?`, 'Payroll sees them right away.', [{ label: 'Approve', value: true, tone: 'primary' }, { label: 'Cancel', value: false }])
    if (!r?.value) return
    actions.approveTime(chosen.map(p => p.id)); toast.success(`Approved ${chosen.length} time entr${chosen.length > 1 ? 'ies' : 'y'}`, { description: 'Payroll sees them now' })
  }
  return <div className="flex flex-col gap-2" data-testid="crew-approve-list">
    <div className="label">Crew time to approve</div>
    {pending.map(p => <label key={p.id} className="flex items-center gap-3 min-h-[44px] rounded-xl bg-surface-2 px-3 text-sm" data-testid="crew-time-row"><input type="checkbox" className="size-5" checked={sel.includes(p.id)} onChange={e => setSel(s => e.target.checked ? [...s, p.id] : s.filter(x => x !== p.id))} /><span className="flex-1 min-w-0"><b>{nm(p.employeeId)}</b><span className="block text-xs text-muted">{fmtDate(p.date)} · {p.activity}{p.perDiems?.length ? ` · per diem ${p.perDiems.join(', ')}` : ''}</span></span><span className="num font-semibold">{p.hours.toFixed(1)} h</span></label>)}
    {flagged.map(p => <div key={p.id} className="flex items-center gap-3 min-h-[44px] rounded-xl bg-warn/10 border border-warn/40 px-3 text-sm" data-testid="crew-time-flagged"><span className="flex-1 min-w-0"><b>{nm(p.employeeId)}</b><span className="block text-xs text-warn">{fmtDate(p.date)} · flagged — the office reviews this one</span></span><span className="num font-semibold">{p.hours.toFixed(1)} h</span></div>)}
    {pending.length > 0 && <Button size="lg" variant="primary" data-testid="crew-approve" disabled={!chosen.length} icon={<CheckCircle2 className="size-5" />} onClick={() => void go()}>Approve {chosen.length} · {h.toFixed(1)} h</Button>}
  </div>
}
