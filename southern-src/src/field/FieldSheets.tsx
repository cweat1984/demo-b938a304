import { savePhotos, PhotoThumb } from '../lib/photos'
import { useState } from 'react'
import { companyOf } from '../data/brand'
import { toast } from 'sonner'
import { CheckCircle2, Minus, Plus, Camera, Check, X, AlertTriangle, ChevronLeft } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName, crewOn, customerOf, certBand, eqLabel } from '../data/logic'
import { today, addDays, cn, fmtDate, uid, fmtTs } from '../lib/util'
import { Button, Field, Badge, confirmChoice, useBackClose } from '../components/ui'
import { SignaturePad } from './kit'
import { MyCertsPanel } from '../components/CertSend'
import { useMe } from './FieldApp'
import { ptoBalance } from '../gapb/gstore'

const PER_DIEMS: T.PerDiem[] = ['Semi Truck', 'Hotel', 'Daily Truck']
const ACTS: T.Activity[] = ['Lifting & Hoisting', 'Rigging', 'Crane Mobe', 'Truck Mobe', 'Crane A/D', 'Onsite Standby', 'Offsite Standby', 'Oiling', 'Yard / Shop', 'Safety / Training']

function Stepper({ v, set, step = 0.5 }: { v: number; set: (n: number) => void; step?: number }) {
  return <div className="flex items-center gap-2"><button className="grid size-10 place-items-center rounded-full bg-surface-2" onClick={() => set(Math.max(0, v - step))} aria-label="Less"><Minus className="size-4" /></button><span className="w-10 text-center font-semibold num">{v}</span><button className="grid size-10 place-items-center rounded-full bg-surface-2" onClick={() => set(v + step)} aria-label="More"><Plus className="size-4" /></button></div>
}
function Chips<V extends string>({ all, on, toggle, disabled = [] }: { all: V[]; on: V[]; toggle: (v: V) => void; disabled?: V[] }) {
  return <div className="flex flex-wrap gap-2">{all.map(v => <button key={v} disabled={disabled.includes(v)} onClick={() => toggle(v)} className={cn('rounded-full px-4 h-11 text-sm font-semibold border transition', on.includes(v) ? 'bg-accent text-accent-ink border-transparent' : 'border-line', disabled.includes(v) && 'opacity-30 line-through')}>{v}</button>)}</div>
}

import { NptForm, NptList, NptButton } from '../gapA/npt'
import { TicketExtras } from '../components/JobExtras'

export function TicketFlow({ onDone }: { onDone: () => void }) {
  const { db, me, current } = useMe()
  const job = current!
  const existing = db.tickets.find(t => t.jobId === job.id && t.date === today())
  const crew = crewOn(db, job.id, today())
  const fixing = existing?.status === 'Needs Correction' // dive3: a ticket the office sent back opens for editing (and a new signature), not on the signed copy
  const [step, setStep] = useState(existing?.signedAt && !fixing ? 2 : 0)
  const [hours, setHours] = useState<Partial<Record<T.Activity, number>>>(() => { if (existing?.hours) return existing.hours; const clk = db.clocks.find(c => c.employeeId === me.id); const onH = clk ? Math.round(Math.max(0, (Date.now() - new Date(clk.inAt).getTime()) / 36e5 - clk.breakMin / 60) * 2) / 2 : 0; return clk ? { 'Lifting & Hoisting': onH } : { 'Lifting & Hoisting': 8, Rigging: 1.5 } }) /* dive3 F2: on the clock → start from the clock, never a made-up 8 + 1.5 */ // from the clock when clocked in
  const [work, setWork] = useState(existing?.work ?? `${job.name}. `)
  const [delays, setDelays] = useState(existing?.delays ?? '')
  const [pct, setPct] = useState(existing?.pctComplete ?? 60)
  const [photos, setPhotos] = useState(existing?.photos ?? 0)
  const [photoRefs, setPhotoRefs] = useState<string[]>(existing?.photoRefs ?? []), [upl, setUpl] = useState(false) // field fixes: real photos
  const [signer, setSigner] = useState(customerOf(db, job).contact)
  const [title, setTitle] = useState('Site Superintendent')
  const [sig, setSig] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const total = Object.values(hours).reduce((s, n) => s + (n ?? 0), 0)
  const [nptOpen, setNptOpen] = useState(false)
  const save = () => {
    if (busy || !sig) return
    setBusy(true)
    const t: T.EodTicket = { id: existing?.id ?? uid('tk'), jobId: job.id, date: today(), supervisorId: me.id, crewIds: crew.map(a => a.employeeId), hours, work, equipmentIn: eqLabel(byId(db.equipment, job.craneId)), equipmentOut: '', delays, pctComplete: pct, expectedFinish: job.endDate, status: 'Signed', photos, photoRefs, submittedAt: new Date().toISOString(), signerName: signer, signerTitle: title, signature: sig, signedAt: new Date().toISOString() }
    const r = actions.saveTicket(t)
    if (!r.ok) { setBusy(false); toast.error(r.reason); return } // field fixes: stay busy after success so a 2nd tap is ignored
    toast.success('Ticket signed & sent to office')
    setStep(2)
  }
  const tk = db.tickets.find(t => t.jobId === job.id && t.date === today())
  useBackClose(nptOpen, () => setNptOpen(false)) // field fixes (N-M8): phone Back from NPT returns to the ticket
  if (nptOpen) return <div className="flex flex-col gap-3"><button className="self-start h-11 -ml-1 pr-3 inline-flex items-center gap-1 text-sm font-semibold text-accent" onClick={() => setNptOpen(false)} data-testid="npt-back-ticket"><ChevronLeft className="size-5" />Back to ticket</button><NptForm jobId={job.id} onDone={() => setNptOpen(false)} /></div>
  if (step === 2 && tk?.signedAt && tk.status !== 'Needs Correction') return (
    <div className="flex flex-col items-center text-center gap-3 py-2 pb-8" data-testid="ticket-signed">
      <div className="flex items-center gap-2 text-ok font-semibold"><CheckCircle2 className="size-6" />Signed · {fmtTs(tk.signedAt)}</div>
      <div className="w-full rounded-xl bg-white text-[#111] text-left shadow-xl p-4 text-[12px] leading-snug" data-testid="ticket-pdf">
        <div className="flex items-center justify-between border-b border-black/15 pb-2 mb-2"><div><div className="font-bold text-[13px] tracking-tight"><span className="uppercase">{companyOf(db).name}</span></div><div className="text-[10px] text-black/55">Daily field ticket · Job #{job.jobNo}</div></div><div className="text-right text-[10px] text-black/55">{fmtDate(tk.date, { month: 'short', day: 'numeric', year: 'numeric' })}<br />{customerOf(db, job).name}</div></div>
        <div className="text-black/70 mb-1.5">{job.name}</div>
        <div className="grid grid-cols-2 gap-x-3">{Object.entries(tk.hours).filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between border-b border-black/10 py-0.5"><span>{k}</span><b>{v} h</b></div>)}</div>
        <div className="mt-1.5 text-black/70">Crew: {tk.crewIds.map(id => { const e = byId(db.employees, id); return e ? `${e.first} ${e.last}` : '' }).join(', ')}</div>
        <div className="mt-1 text-black/70">Work: {tk.work}</div>
        {tk.delays && <div className="mt-1 text-black/70">Delays: {tk.delays}</div>}
        {tk.photoRefs?.length ? <div className="flex gap-2 flex-wrap mt-2" data-testid="ticket-signed-photos">{tk.photoRefs.map(r => <PhotoThumb key={r} src={r} className="size-16 rounded-md object-cover bg-black/5" />)}</div> : null}
        <TicketExtras job={job} date={tk.date} paper />
        <NptList jobId={job.id} date={tk.date} paper />
        <div className="flex items-end justify-between mt-2 pt-2 border-t border-black/15">{tk.signature ? <img src={tk.signature} alt="Customer signature" className="h-12 max-w-[60%] object-contain" /> : <span className="italic">signed</span>}<div className="text-right text-[10px] min-w-0 max-w-[40%] break-words">{tk.signerName}{tk.signerTitle ? <><br />{tk.signerTitle}</> : null}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-2 w-full">
        <a className="btn inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-surface-2 font-semibold" href={`sms:${customerOf(db, job).phone}?&body=${encodeURIComponent(`${companyOf(db).name} — your signed ticket for Job #${job.jobNo} (${fmtDate(tk.date)}): ${location.origin}${location.pathname}?status=${job.jobNo}`)}`} onClick={() => toast.success(`Copy texted to ${tk.signerName?.split(' ')[0] ?? 'customer'}`)}>Text a copy</a>
        <a className="btn inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-surface-2 font-semibold" href={`mailto:?subject=${encodeURIComponent(`Signed ticket — Job #${job.jobNo}`)}&body=${encodeURIComponent(`${location.origin}${location.pathname}?status=${job.jobNo}`)}`}>Email a copy</a>
      </div>
      <div className="text-xs text-muted">Accounting can invoice from this ticket — no re-typing.</div>
      <Button size="lg" variant="primary" className="w-full mt-1" onClick={onDone}>Done</Button>
    </div>
  )
  return (
    <div className="flex flex-col gap-5 pb-8">
      <div className="flex gap-2">{[0, 1].map(i => <div key={i} className={cn('h-1.5 flex-1 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-3')} />)}</div>
      {step === 0 && fixing && <div className="rounded-2xl bg-warn/10 border border-warn/30 p-3 text-sm" data-testid="ticket-fix"><b>The office sent this back.</b> {existing?.correction ?? 'Fix it and get the customer to sign again.'}</div>}
      {step === 0 && <>
        <div><div className="text-xs text-muted">#{job.jobNo} · {fmtDate(today())}</div><div className="font-semibold text-lg">{customerOf(db, job).name}</div></div>
        <div className="flex flex-col gap-1">{(['Lifting & Hoisting', 'Rigging', 'Crane Mobe', 'Onsite Standby'] as T.Activity[]).map(a => <div key={a} className="flex items-center justify-between py-1.5"><span className="font-medium">{a}</span><Stepper v={hours[a] ?? 0} set={n => setHours({ ...hours, [a]: n })} /></div>)}</div>
        <Field label="Work performed"><textarea className="input min-h-24" value={work} onChange={e => setWork(e.target.value)} /></Field>
        <Field label="Delays / standby (optional)"><input className="input" value={delays} onChange={e => setDelays(e.target.value)} placeholder="Wind hold 10:20–11:05" /></Field>
        <NptList jobId={job.id} date={today()} />
        <NptButton onClick={() => setNptOpen(true)} />
        <Field label={`Percent complete · ${pct}%`}><input type="range" min={0} max={100} step={5} value={pct} onChange={e => setPct(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></Field>
        <div className="flex items-center gap-2 flex-wrap"><label className="inline-flex items-center gap-2 text-sm font-semibold text-muted cursor-pointer"><Camera className="size-5" />{upl ? 'Saving photo…' : photos ? `${photos} photos · add more` : 'Add photos'}<input type="file" accept="image/*" multiple capture="environment" className="hidden" data-testid="ticket-photo" onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; if (!fs.length) return; setUpl(true); savePhotos(fs, 'tk', 8).then(r => { setPhotoRefs(p => [...p, ...r]); setPhotos(n => n + r.length) }).catch(err => toast.error(String(err.message ?? err))).finally(() => setUpl(false)) }} /></label>{photoRefs.map(r => <PhotoThumb key={r} src={r} />)}</div>
        {(total > 24 || total <= 0) && <div className="text-sm text-bad" data-testid="ticket-hours-err">{total > 24 ? `${total} h is more than a day — max 24 h on one ticket` : 'Add the hours worked'}</div>}
        <Button size="xl" variant="primary" disabled={upl || total > 24 || total <= 0} onClick={() => setStep(1)} data-testid="ticket-next">Hand to customer to sign</Button>
      </>}
      {step === 1 && <>
        <div className="rounded-3xl bg-surface p-4 text-sm flex flex-col gap-1">
          <div className="font-semibold text-base">{customerOf(db, job).name} · #{job.jobNo}</div>
          <div className="text-muted">{fmtDate(today(), { weekday: 'long', month: 'long', day: 'numeric' })} · crane {byId(db.equipment, job.craneId)?.unit ?? '—'} · {crew.length} crew</div>
          <div className="mt-2">{work}</div>
          <div className="mt-2 font-semibold num">{total} hrs · {pct}% complete</div>
        </div>
        <TicketExtras job={job} date={today()} />
        <NptList jobId={job.id} date={today()} />
        <div className="grid grid-cols-1 gap-3"><Field label="Name"><input className="input" value={signer} onChange={e => setSigner(e.target.value)} data-testid="signer" /></Field><Field label="Title"><input className="input" value={title} onChange={e => setTitle(e.target.value)} /></Field></div>
        <SignaturePad onChange={setSig} />
        <div className="text-[11px] text-muted">By signing, the customer confirms the work, hours, and equipment listed for this date.</div>
        <Button size="xl" variant="primary" disabled={!sig || !signer || busy} onClick={save} data-testid="ticket-save">Save signed ticket</Button>
        <Button variant="ghost" onClick={() => setStep(0)}>Back</Button>
      </>}
    </div>
  )
}

export function ClockOutForm({ onDone }: { onDone: () => void }) {
  const { me, db, current, clock } = useMe()
  const tk = current && db.tickets.find(t => t.jobId === current.id && t.date === today() && t.crewIds.includes(me.id))
  const split = tk ? (Object.entries(tk.hours) as [T.Activity, number][]).filter(([, h]) => h > 0).sort((x, y) => y[1] - x[1]) : []
  const [act, setAct] = useState<T.Activity>(split[0]?.[0] ?? 'Lifting & Hoisting')
  const [pd, setPd] = useState<T.PerDiem[]>([])
  const [note, setNote] = useState(split.length > 1 ? `Ticket split: ${split.map(([a, h]) => `${h} ${a}`).join(' + ')}` : '')
  const onMin = clock ? (Date.now() - new Date(clock.inAt).getTime()) / 60000 : 0
  const submit = async () => {
    if (onMin < 1) { // dive3 A3: an instant clock-out is almost always a mis-tap — offer to throw the punch away instead of saving a 0 h entry
      const c = await confirmChoice('Discard this punch?', 'You clocked in less than a minute ago. Discard it, or save a clock-out anyway?', [{ label: 'Discard punch', value: 'd' as const, tone: 'danger' }, { label: 'Save clock-out', value: 'k' as const }]); if (!c) return
      if (c.value === 'd') { actions.discardPunch(me.id); toast.success('Punch discarded', { description: 'Nothing was sent.' }); onDone(); return }
    } else if (onMin < 15) { const ok = await confirmChoice('Clock out already?', `You've only been on the clock ${Math.max(0, Math.round(onMin))} min. Clock out anyway?`, [{ label: 'Yes, clock out', value: 1, tone: 'danger' }]); if (!ok) return }
    const r = actions.clockOut(me.id, act, pd, note || undefined); if (!r.ok) toast.error(r.reason); else if (r.reason) { toast.warning('Time held for review', { description: r.reason }); onDone() } else { toast.success('Time submitted', { description: pd.length ? `Per diem: ${pd.join(', ')}` : 'Sent for approval' }); onDone(); window.dispatchEvent(new CustomEvent('time-saved', { detail: { employeeId: me.id, date: today() } })) } }
  return (
    <div className="flex flex-col gap-5 pb-8">
      {split.length > 0 && (() => { const tkH = split.reduce((t, [, h]) => t + h, 0), clkH = Math.max(0, Math.round((onMin - (clock?.breakMin ?? 0)) / 6) / 10), off = Math.abs(tkH - clkH) > 0.5
        return <div data-testid="clockout-ticket" className={cn('rounded-2xl text-sm px-4 py-3', off ? 'bg-warn/10 text-warn' : 'bg-ok/10 text-ok')}>Signed ticket: {split.map(([a2, h]) => `${h} h ${a2}`).join(' + ')}. Your time is saved from the clock: <b>{clkH} h</b>.{off ? ' They don’t match — your supervisor will see both and fix it before payroll.' : ' The ticket split is added to the note.'}</div> })()}
      <Field label="What were you doing most of the day?"><select className="input h-12" value={act} onChange={e => setAct(e.target.value as T.Activity)}>{ACTS.map(a => <option key={a}>{a}</option>)}</select></Field>
      <div><div className="text-xs font-semibold text-muted mb-2">Per diem today</div><Chips all={PER_DIEMS} on={pd} disabled={me.perDiemBlocked} toggle={v => setPd(pd.includes(v) ? pd.filter(x => x !== v) : [...pd, v])} /></div>
      <Field label="Note (optional)"><input className="input" value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Button size="xl" variant="danger" onClick={submit} data-testid="clockout-submit">Clock out & submit</Button>
    </div>
  )
}

export function ManualTime({ onDone }: { onDone: () => void }) {
  const { me, current } = useMe()
  const [date, setDate] = useState(today())
  const [act, setAct] = useState<T.Activity>('Lifting & Hoisting')
  const [start, setStart] = useState('06:00'), [end, setEnd] = useState('16:30'), [meal, setMeal] = useState(30)
  const [pd, setPd] = useState<T.PerDiem[]>([])
  const [busy, setBusy] = useState(false)
  // field fixes: no future dates, end after start, meal 0–120, max 16 h
  const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
  const span = start && end ? mins(end) - mins(start) - (Number.isFinite(meal) ? meal : 0) : 0
  // dive3 F6/U2: no older than 14 days (or the hire date) and charged to the job you were on THAT day
  const minD = [addDays(today(), -14), me.hireDate ?? ''].sort().at(-1)!
  const dayJob = useStore.getState().db.assignments.find(x => x.employeeId === me.id && x.date === date)?.jobId
  const err = !date ? 'Pick the date' : date > today() ? 'Can’t add time for a future day' : date < minD ? `Time older than ${fmtDate(minD)} goes through your supervisor` : !start || !end ? 'Enter start and end' : mins(end) <= mins(start) ? 'End must be after start (split overnight shifts at midnight)' : !Number.isFinite(meal) || meal < 0 || meal > 120 ? 'Meal break must be 0–120 min' : span <= 0 ? 'Meal break is longer than the shift' : span > 16 * 60 ? `${(span / 60).toFixed(1)} h is over the 16 h max — check the times` : ''
  const submit = () => { if (busy || err) return; setBusy(true); const r = actions.submitTime({ employeeId: me.id, jobId: date === today() ? (dayJob ?? current?.id) : dayJob, date, activity: act, start, end, mealMin: meal, perDiems: pd }); setBusy(false); if (!r.ok) toast.error(r.reason); else if (r.reason) { toast.warning('Time held for review', { description: r.reason }); if (!/flag/i.test(r.reason)) { onDone(); window.dispatchEvent(new CustomEvent('time-saved', { detail: { employeeId: me.id, date } })) } } else { toast.success('Time submitted'); onDone(); window.dispatchEvent(new CustomEvent('time-saved', { detail: { employeeId: me.id, date } })) } }
  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="grid grid-cols-2 gap-3"><Field label="Date"><input type="date" className="input" value={date} min={minD} max={today()} onChange={e => setDate(e.target.value)} data-testid="manual-date" /></Field><Field label="Activity"><select className="input" value={act} onChange={e => setAct(e.target.value as T.Activity)}>{ACTS.map(a => <option key={a}>{a}</option>)}</select></Field></div>
      <div className="grid grid-cols-3 gap-3"><Field label="Start"><input type="time" className="input" value={start} onChange={e => setStart(e.target.value)} /></Field><Field label="End"><input type="time" className="input" value={end} onChange={e => setEnd(e.target.value)} /></Field><Field label="Meal min"><input type="number" inputMode="numeric" min={0} max={120} className="input" value={Number.isFinite(meal) ? meal : ''} onChange={e => setMeal(e.target.value === '' ? NaN : Number(e.target.value))} data-testid="manual-meal" /></Field></div>
      <div><div className="text-xs font-semibold text-muted mb-2">Per diem</div><Chips all={PER_DIEMS} on={pd} disabled={me.perDiemBlocked} toggle={v => setPd(pd.includes(v) ? pd.filter(x => x !== v) : [...pd, v])} /></div>
      {(() => { const jid = date === today() ? (dayJob ?? current?.id) : dayJob, j = jid ? useStore.getState().db.jobs.find(x => x.id === jid) : undefined; return <div className="text-xs text-muted" data-testid="manual-job">{j ? `Charges to Job #${j.jobNo} (your assignment that day)` : 'No job assignment that day — charged as shop / yard time'}</div> })()}
      {err && <div className="text-sm text-bad" data-testid="manual-err">{err}</div>}
      <Button size="xl" variant="primary" onClick={submit} disabled={busy || !!err} data-testid="manual-save">Submit time</Button>
    </div>
  )
}

const DVIR_ITEMS = ['Brakes', 'Tires & wheels', 'Lights & reflectors', 'Horn & backup alarm', 'Mirrors & glass', 'Coupling / 5th wheel', 'Fluid leaks', 'Fire extinguisher', 'Boom & hoist', 'Outriggers / pads', 'Load chart & LMI', 'Wire rope']
/** dive2 field M4: the checklist depends on the unit — crane, tractor, trailer, pickup (FMCSA 396.11 covers tractor and trailer). */
const DVIR_BY: Record<string, string[]> = {
  Crane: DVIR_ITEMS,
  Semi: ['Brakes & air system', 'Tires & wheels', 'Lights & reflectors', 'Horn & backup alarm', 'Mirrors & glass', 'Coupling / 5th wheel', 'Steering', 'Wipers & washers', 'Fluid leaks', 'Fire extinguisher', 'Emergency triangles'],
  Trailer: ['Brakes', 'Tires & wheels', 'Lights & reflectors', 'Kingpin / coupling', 'Air lines & glad hands', 'Deck & tie-downs / chains', 'Landing gear', 'Mud flaps & placards'],
  Pickup: ['Brakes', 'Tires & wheels', 'Lights', 'Horn', 'Mirrors & glass', 'Wipers & washers', 'Fluid leaks', 'Fire extinguisher'],
}
const dvirItems = (u?: T.Equipment) => DVIR_BY[u?.category ?? 'Crane'] ?? DVIR_BY.Pickup
export function DvirForm({ onDone }: { onDone: () => void }) {
  const { db, me } = useMe()
  const [unit, setUnit] = useState(me.homeTruckId ?? me.homeCraneId ?? me.pickupId ?? db.equipment[0].id)
  // every item starts unchecked: the driver has to look at each one (FMCSA 396.11/396.13), defects need a note + a safe/not-safe call
  const [items, setItems] = useState<Record<string, 'ok' | 'defect' | undefined>>({})
  const [defects, setDefects] = useState('')
  const [safe, setSafe] = useState<boolean | null>(null)
  const [odo, setOdo] = useState('')
  const nDef = Object.values(items).filter(v => v === 'defect').length
  const LIST = dvirItems(byId(db.equipment, unit))
  const nSet = LIST.filter(i => items[i]).length
  const missing = nSet < LIST.length ? `Check ${LIST.length - nSet} more item${LIST.length - nSet > 1 ? 's' : ''}` : nDef && defects.trim().length < 5 ? 'Describe the defect' : nDef && safe === null ? 'Pick Safe or NOT safe' : !odo.trim() ? 'Enter odometer / hours' : !/^\d[\d,.]*$/.test(odo.trim()) ? 'Odometer / hours: numbers only' : ''
  const submit = () => { if (missing) { toast.error(missing); return } const r = actions.submitDvir({ unitId: unit, employeeId: me.id, date: today(), items: items as Record<string, 'ok' | 'defect'>, defects: `${defects}${odo ? ` · odometer/hours ${odo}` : ''}`, safeToOperate: nDef ? !!safe : true }); if (!r.ok) toast.error(r.reason); else { ((!navigator.onLine || useStore.getState().ui.online === false) ? toast.warning(nDef ? 'Saved — will send when you’re back online' : 'Pre-trip saved — will send when online', { description: nDef ? 'Unit tagged out on this phone. Call the shop — the work order opens when this sends.' : undefined }) : toast.success(nDef ? 'Pre-trip sent — Shop work order opened' : 'Pre-trip complete — no defects')); onDone() } }
  return (
    <div className="flex flex-col gap-4 pb-8">
      <Field label="Unit"><select className="input h-12" data-testid="dvir-unit" value={unit} onChange={e => { setUnit(e.target.value); setItems({}); setSafe(null) }}>{[...db.equipment.filter(e => e.category !== 'Support' && [me.homeTruckId, me.homeCraneId, me.pickupId].includes(e.id)), ...db.equipment.filter(e => e.category !== 'Support' && ![me.homeTruckId, me.homeCraneId, me.pickupId].includes(e.id))].map(e => <option key={e.id} value={e.id}>{eqLabel(e)} · {e.make} {e.model}</option>)}</select></Field>
      <Field label="Odometer or hour meter"><input className="input h-12" inputMode="numeric" value={odo} onChange={e => setOdo(e.target.value)} placeholder="e.g. 184220" data-testid="dvir-odo" /></Field>
      <div className="flex items-center justify-between px-1 text-sm"><span className="text-muted" data-testid="dvir-progress">{nSet} of {LIST.length} checked</span>{nSet > 0 && nSet < LIST.length && <button className="h-11 px-3 rounded-full bg-surface-2 font-semibold" data-testid="dvir-rest-ok" onClick={() => setItems(Object.fromEntries(LIST.map(i => [i, items[i] ?? 'ok'])))}>Mark the rest OK</button>}</div>
      <div className="rounded-3xl bg-surface divide-y divide-[var(--line)]" data-testid="dvir-items">{LIST.map(i => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5"><span className="flex-1 font-medium text-sm">{i}</span>
          <button onClick={() => setItems({ ...items, [i]: 'ok' })} className={cn('grid size-11 place-items-center rounded-full', items[i] === 'ok' ? 'bg-ok-solid text-white' : 'bg-surface-2 text-muted')} aria-label={`${i} OK`}><Check className="size-5" /></button>
          <button onClick={() => setItems({ ...items, [i]: 'defect' })} className={cn('grid size-11 place-items-center rounded-full', items[i] === 'defect' ? 'bg-bad-solid text-white' : 'bg-surface-2 text-muted')} aria-label={`${i} defect`}><X className="size-5" /></button>
        </div>))}</div>
      {nDef > 0 && <>
        <Field label="Describe the defect (required)"><textarea className="input" data-testid="dvir-defect-text" value={defects} onChange={e => setDefects(e.target.value)} /></Field>
        <div className="flex gap-2"><button onClick={() => setSafe(true)} data-testid="dvir-safe" className={cn('flex-1 h-12 rounded-2xl font-semibold border', safe === true ? 'bg-warn/15 border-warn text-warn' : 'border-line')}>Safe to operate</button><button onClick={() => setSafe(false)} data-testid="dvir-notsafe" className={cn('flex-1 h-12 rounded-2xl font-semibold border', safe === false ? 'bg-bad/15 border-bad text-bad' : 'border-line')}>NOT safe — tag out</button></div>
      </>}
      <Button size="xl" variant={nDef ? 'danger' : 'primary'} onClick={submit} disabled={!!missing} data-testid="dvir-submit">{missing || (nDef ? `Submit ${nDef} defect${nDef > 1 ? 's' : ''}` : 'All good — submit')}</Button>
    </div>
  )
}

export function FuelForm({ onDone }: { onDone: () => void }) {
  const { db, me, current } = useMe()
  const [unit, setUnit] = useState(me.homeTruckId ?? me.homeCraneId ?? me.pickupId ?? db.equipment[0].id)
  const [gal, setGal] = useState('85'), [price, setPrice] = useState('3.89'), [odo, setOdo] = useState(''), [vendor, setVendor] = useState("Love's Travel Stop")
  // field fixes: real ranges, no negatives/NaN, one save per tap
  const [busy, setBusy] = useState(false)
  const g = Number(gal), pr = Number(price), od = odo.trim() ? Number(odo) : undefined
  const err = !gal.trim() || !Number.isFinite(g) || g <= 0 ? 'Enter the gallons pumped' : g > 300 ? 'Over 300 gal — check the gallons' : !Number.isFinite(pr) || pr <= 0 ? 'Enter the price per gallon' : pr > 10 ? 'Over $10/gal — check the price' : od !== undefined && (!Number.isFinite(od) || od < 0 || od > 2_000_000) ? 'Check the odometer (numbers only)' : !vendor.trim() ? 'Where did you fuel?' : ''
  const submit = () => { if (busy || err) return; setBusy(true); actions.logFuel({ unitId: unit, jobId: current?.id, employeeId: me.id, date: today(), gallons: Number(gal), price: Number(price), odometer: odo ? Number(odo) : undefined, vendor }); toast.success(`$${(Number(gal) * Number(price)).toFixed(2)} fuel logged`, { description: current ? `Charged to Job #${current.jobNo}` : 'Overhead' }); onDone() }
  return (
    <div className="flex flex-col gap-4 pb-8">
      <Field label="Unit"><select className="input h-12" value={unit} onChange={e => setUnit(e.target.value)}>{db.equipment.filter(e => e.category !== 'Trailer').map(e => <option key={e.id} value={e.id}>{eqLabel(e)}</option>)}</select></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="Gallons"><input className="input text-lg" inputMode="decimal" value={gal} onChange={e => setGal(e.target.value)} /></Field><Field label="$/gal"><input className="input text-lg" inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} /></Field></div>
      <div className="grid grid-cols-2 gap-3"><Field label="Odometer"><input className="input" inputMode="numeric" value={odo} onChange={e => setOdo(e.target.value)} /></Field><Field label="Where"><input className="input" value={vendor} onChange={e => setVendor(e.target.value)} /></Field></div>
      <div className="text-sm text-muted">Total <b className="text-ink num">${(err ? 0 : g * pr).toFixed(2)}</b>{current ? ` → Job #${current.jobNo}` : ''}</div>
      {err && <div className="text-sm text-bad" data-testid="fuel-err">{err}</div>}
      <Button size="xl" variant="primary" onClick={submit} disabled={!!err || busy} data-testid="fuel-save">Log fuel</Button>
    </div>
  )
}

export function PtoForm({ onDone }: { onDone: () => void }) {
  const { me } = useMe()
  const [from, setFrom] = useState(addDays(today(), 14)), [to, setTo] = useState(addDays(today(), 15))
  const [kind, setKind] = useState<T.PtoRequest['kind']>('Vacation'), [note, setNote] = useState('')
  // dive3 F7: same rules as the desktop form — both dates, from ≤ to, not in the past (sick can be today)
  const ptoErr = !from || !to ? 'Pick both dates' : from < today() ? 'From can’t be in the past' : to < from ? 'To is before From' : ''
  return (
    <div className="flex flex-col gap-4 pb-8">
      {(() => { const b = ptoBalance(me.id, me.hireDate); return <div className="grid grid-cols-3 gap-2 text-center" data-testid="pto-balance">{([['Vacation', b.vacation], ['Sick', b.sick], ['Personal', b.personal]] as const).map(([l, v]) => <div key={l} className="rounded-2xl bg-surface p-3"><div className="text-xs text-muted">{l}</div><div className="font-semibold num">{v} h</div></div>)}</div> })()}
      <div className="flex flex-wrap gap-2">{(['Vacation', 'Sick', 'Personal', 'Unpaid'] as const).map(k => <button key={k} onClick={() => setKind(k)} className={cn('rounded-full px-4 h-11 text-sm font-semibold border', kind === k ? 'bg-accent text-accent-ink border-transparent' : 'border-line')}>{k}</button>)}</div>
      <div className="grid grid-cols-2 gap-3"><Field label="From"><input type="date" className="input" value={from} min={today()} data-testid="pto-from" onChange={e => setFrom(e.target.value)} /></Field><Field label="To"><input type="date" className="input" value={to} min={from || today()} data-testid="pto-to" onChange={e => setTo(e.target.value)} /></Field></div>
      <Field label="Note"><input className="input" value={note} onChange={e => setNote(e.target.value)} /></Field>
      {ptoErr && <div className="text-sm text-bad" data-testid="pto-err">{ptoErr}</div>}<Button size="xl" variant="primary" disabled={!!ptoErr} data-testid="pto-send" onClick={() => { if (ptoErr) return; const r = actions.requestPto({ employeeId: me.id, from, to, kind, hours: 10 * (Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1), note }); if (!r.ok) { toast.error(r.reason ?? 'Already requested'); return } toast.success('Request sent to HR & Dispatch'); onDone() }}>Send request</Button>
    </div>
  )
}

export function JsaList() {
  const { db, me, current } = useMe()
  // dive3 J1: today's JSAs for my job are always pinned first; then the last 7 days only; "See all" for older ones
  const [all, setAll] = useState(false), t0 = today(), wk = addDays(t0, -7)
  const mine = db.talks.filter(t => (current && t.jobId === current.id) || t.kind === 'Toolbox Talk' || (t.kind === 'JSA' && !t.jobId && t.date === t0))
  const pinned = mine.filter(t => t.kind === 'JSA' && t.date === t0), rest = mine.filter(t => !pinned.includes(t)).sort((a, b) => b.date.localeCompare(a.date))
  const recent = rest.filter(t => t.date >= wk), talks = [...pinned, ...(all ? rest : recent.slice(0, 8))], hidden = rest.length - (all ? rest.length : Math.min(8, recent.length))
  // field fixes (N-M9): you have to open the talk (hazards + controls) before you can sign it; each person signs for themselves — supervisors only see who has signed
  const [openId, setOpenId] = useState<string | null>(null), [seen, setSeen] = useState<string[]>([])
  const crew = current && me.craft === 'Supervisor' ? crewOn(db, current.id, today()).map(a => a.employeeId).filter(id => id !== me.id) : []
  // dive3: a supervisor can write today's JSA right on the phone
  const [mk, setMk] = useState(false), [jt, setJt] = useState(''), [jh, setJh] = useState(''), [jc, setJc] = useState('')
  const canMake = me.craft === 'Supervisor' && !!current
  const maker = canMake ? (mk ? <div className="rounded-3xl bg-surface p-4 flex flex-col gap-3" data-testid="jsa-new">
      <div className="font-semibold">New JSA · Job #{current!.jobNo}</div>
      <input className="input h-12" placeholder="Task (e.g. Blade pick, T-14)" value={jt} onChange={e => setJt(e.target.value)} data-testid="jsa-new-title" maxLength={80} />
      <textarea className="input min-h-16" placeholder="Hazards, separated by commas" value={jh} onChange={e => setJh(e.target.value)} data-testid="jsa-new-hazards" />
      <textarea className="input min-h-16" placeholder="Controls, separated by commas" value={jc} onChange={e => setJc(e.target.value)} data-testid="jsa-new-controls" />
      <div className="flex gap-2"><Button variant="primary" size="lg" className="flex-1" disabled={!jt.trim() || !jh.trim()} data-testid="jsa-new-publish" onClick={() => { const sp = (x: string) => x.split(',').map(v => v.trim()).filter(Boolean); actions.addTalk({ kind: 'JSA', title: jt.trim(), jobId: current!.id, date: today(), leaderId: me.id, attendeeIds: [], hazards: sp(jh), controls: sp(jc), signed: false }); toast.success('JSA sent to your crew'); setMk(false); setJt(''); setJh(''); setJc('') }}>Publish to crew</Button><Button size="lg" onClick={() => setMk(false)}>Cancel</Button></div>
    </div> : <button className="rounded-3xl bg-surface p-4 font-semibold text-accent min-h-[52px]" data-testid="jsa-new-open" onClick={() => setMk(true)}>+ Write today’s JSA</button>) : null
  if (!talks.length) return <div className="flex flex-col gap-3">{maker}<div className="rounded-3xl bg-surface p-6 text-center text-muted" data-testid="jsa-empty">No JSAs or toolbox talks for today. Your supervisor posts them before the job starts.</div></div>
  return <div className="flex flex-col gap-3 pb-8">{maker}{hidden > 0 && <button className="order-last text-sm font-semibold text-accent self-center min-h-[44px]" data-testid="jsa-see-all" onClick={() => setAll(true)}>See all ({hidden} older)</button>}{talks.map(t => { const signed = t.attendeeIds.includes(me.id), op = openId === t.id, read = seen.includes(t.id) || signed; const leader = byId(db.employees, t.leaderId); const left = crew.filter(id => !t.attendeeIds.includes(id)); return (
    <div key={t.id} className="rounded-3xl bg-surface p-4 flex flex-col gap-2" data-testid="jsa-talk">
      <button className="text-left flex flex-col gap-2" aria-expanded={op} onClick={() => { setOpenId(op ? null : t.id); if (!op) setSeen(x => x.includes(t.id) ? x : [...x, t.id]) }} data-testid="jsa-open">
        <div className="flex items-center gap-2"><Badge tone={t.kind === 'JSA' ? 'warn' : 'info'}>{t.kind}</Badge><span className="text-xs text-muted">{fmtDate(t.date)}</span><span className="ml-auto text-sm font-semibold text-accent">{op ? 'Hide' : 'Read'}</span></div>
        <div className="font-semibold">{t.title}</div>
        {!op && t.hazards.length > 0 && <div className="text-xs text-muted"><AlertTriangle className="inline size-3 mr-1" />{t.hazards.slice(0, 3).join(' · ')}</div>}
      </button>
      {op && <div className="text-sm flex flex-col gap-2 rounded-2xl bg-surface-2 p-3" data-testid="jsa-content">
        {leader && <div className="text-xs text-muted">Led by {leader.first} {leader.last}</div>}
        <div><div className="font-semibold mb-1">Hazards</div><ul className="list-disc pl-5">{t.hazards.map(h => <li key={h}>{h}</li>)}</ul></div>
        <div><div className="font-semibold mb-1">Controls</div>{t.controls.length ? <ul className="list-disc pl-5">{t.controls.map(c => <li key={c}>{c}</li>)}</ul> : <div className="text-muted">Ask your supervisor for the controls before you sign.</div>}</div>
      </div>}
      <Button variant={signed ? 'ghost' : 'primary'} disabled={signed || !read} onClick={() => { actions.signTalk(t.id, me.id); toast.success('Signed') }} data-testid="jsa-sign">{signed ? '✓ You signed' : read ? 'I reviewed this — sign' : 'Read it first to sign'}</Button>
      {crew.length > 0 && <div className="rounded-2xl bg-surface-2 p-3 text-sm" data-testid="jsa-crew-status"><div className="font-semibold mb-1">Crew sign-off · {crew.length - left.length} of {crew.length} signed</div><div className="text-xs text-muted mb-2">Each person signs on their own phone.</div><div className="flex flex-wrap gap-1.5">{crew.map(id => { const e = db.employees.find(x => x.id === id); const done = !left.includes(id); return <span key={id} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${done ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn'}`}>{done ? '✓' : '○'} {e ? `${e.first} ${e.last}` : id}</span> })}</div></div>}
    </div>) })}</div>
}
export function SdsList() {
  const db = useStore(s => s.db)
  const [q, setQ] = useState(''), [open, setOpen] = useState<string | null>(null)
  return <div className="flex flex-col gap-2 pb-8"><input className="input" placeholder="Search products" value={q} onChange={e => setQ(e.target.value)} />{db.sds.filter(s => s.product.toLowerCase().includes(q.toLowerCase())).map(s => (
    <button key={s.id} onClick={() => setOpen(open === s.id ? null : s.id)} className="rounded-3xl bg-surface p-4 text-left"><div className="flex items-center gap-2"><span className="font-semibold flex-1">{s.product}</span><Badge tone={s.signal === 'Danger' ? 'bad' : s.signal === 'Warning' ? 'warn' : 'neutral'}>{s.signal}</Badge></div><div className="text-xs text-muted">{s.manufacturer} · {s.use}</div>
      {open === s.id && <div className="mt-3 text-sm flex flex-col gap-1.5"><div><b>Hazards:</b> {s.hazards.join(', ')}</div><div><b>PPE:</b> {s.ppe.join(', ')}</div><div><b>First aid:</b> {s.firstAid}</div></div>}</button>))}</div>
}
export function CertList() {
  const { me } = useMe()
  return <MyCertsPanel empId={me.id} field inline />
}
export function GearList() {
  const { db, me } = useMe()
  const mine = db.checkouts.filter(c => c.employeeId === me.id && !c.returned && c.returnable)
  return <div className="flex flex-col gap-2 pb-8">{mine.length ? mine.map(c => { const it = byId(db.items, c.itemId)!; return <div key={c.id} className="rounded-3xl bg-surface p-4"><div className="font-semibold">{c.qty} × {it.name}</div><div className="text-xs text-muted">Due back {fmtDate(c.due)}{c.due < today() ? ' · overdue' : ''}</div></div> }) : <div className="text-muted text-center py-6">Nothing checked out to {fullName(me)}.</div>}</div>
}
