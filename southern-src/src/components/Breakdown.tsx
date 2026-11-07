import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { Phone, Siren, LocateFixed, Camera, CheckCircle2, CircleDot, Truck, Construction, Container, Droplets, Zap, Cog } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, eqLabel, fullName } from '../data/logic'
import { cn } from '../lib/util'
import { Sheet, Button, CallButton, Field } from './ui'

const KINDS: { k: T.BreakdownKind; icon: typeof Truck }[] = [
  { k: 'Tire Blowout', icon: CircleDot }, { k: 'Truck Issue', icon: Truck }, { k: 'Crane Issue', icon: Construction },
  { k: 'Trailer Issue', icon: Container }, { k: 'Hydraulic Leak', icon: Droplets }, { k: 'Electrical', icon: Zap }, { k: 'Equipment Issue', icon: Cog },
]
const SEV: T.Breakdown['severity'][] = ['Down — Can’t Move', 'Limping — Needs Service', 'Safe — Schedule Repair']

export function BreakdownForm({ onDone, defaultUnit }: { onDone: () => void; defaultUnit?: string }) {
  const db = useStore(s => s.db)
  const session = useStore(s => s.session)!
  const me = byId(db.employees, session.employeeId)
  const myUnit = defaultUnit ?? me?.homeTruckId ?? me?.homeCraneId ?? me?.pickupId
  const [unit, setUnit] = useState(myUnit ?? '')
  const [kind, setKind] = useState<T.BreakdownKind | null>(null)
  const [sev, setSev] = useState<T.Breakdown['severity']>('Down — Can’t Move')
  const [loc, setLoc] = useState<{ lat: number; lng: number; text: string } | null>(null)
  const [hit, setHit] = useState<string[]>([]) // dive2 M11: jobs this unit is on
  const [contact, setContact] = useState(me ? fullName(me) : session.name)
  const [phone, setPhone] = useState(me?.phone ?? '')
  const [notes, setNotes] = useState('')
  const [photos, setPhotos] = useState(0)
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const u = byId(db.equipment, unit)
  const units = useMemo(() => [...db.equipment].sort((a, b) => a.category.localeCompare(b.category) || a.unit.localeCompare(b.unit, undefined, { numeric: true })), [db.equipment])
  const shop = db.contacts.find(c => c.group === 'Shop'), disp = db.contacts.find(c => c.group === 'Dispatch')
  const gps = () => {
    const fallback = () => u && setLoc({ lat: u.lat, lng: u.lng, text: `Last GPS of ${u.unit} (${u.lat.toFixed(4)}, ${u.lng.toFixed(4)})` })
    if (!navigator.geolocation) return fallback()
    navigator.geolocation.getCurrentPosition(p => setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, text: `My location (${p.coords.latitude.toFixed(4)}, ${p.coords.longitude.toFixed(4)})` }), fallback, { timeout: 4000 })
  }
  const submit = () => {
    if (busy) return
    setBusy(true)
    const l = loc ?? (u ? { lat: u.lat, lng: u.lng, text: `Last GPS of ${u.unit}` } : { lat: 35.4, lng: -97.5, text: 'Unknown' })
    const r = actions.reportBreakdown({ unitId: unit, kind: kind!, severity: sev, lat: l.lat, lng: l.lng, locationText: l.text, contactName: contact, contactPhone: phone, notes, photos: Array.from({ length: photos }, (_, i) => `photo-${i + 1}`), reportedBy: session.name })
    setBusy(false)
    if (!r.ok) { toast.error(r.reason); return }
    setHit(r.jobs ?? []); setDone(true)
  }
  if (done) return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center gap-4 py-8">
      <div className="grid size-20 place-items-center rounded-full bg-ok/15 text-ok"><CheckCircle2 className="size-10" /></div>
      <div className="display text-2xl font-semibold">Shop & Dispatch notified</div>
      <div className="text-muted max-w-xs">Work order opened for {u?.unit}. {sev.startsWith('Down') ? 'Unit marked Out of Service so nobody dispatches it.' : ''}</div>
      <div className="flex flex-col gap-2 w-full max-w-xs mt-2">
        {hit.length > 0 && <div className="rounded-2xl border border-warn/40 bg-warn/10 p-3 text-left text-sm" data-testid="bd-affected"><b>{u?.unit} is on {hit.length} job{hit.length > 1 ? 's' : ''}</b>{hit.map(id => { const j = db.jobs.find(x => x.id === id); return j ? <div key={id} className="mt-2 rounded-xl bg-surface p-2 flex flex-col gap-1.5"><button data-testid="bd-affected-job" onClick={() => { onDone(); useStore.getState().open({ type: 'job', id }) }} className="min-h-[44px] px-2 text-left font-semibold">Job #{j.jobNo} · {j.startDate.slice(5)}–{j.endDate.slice(5)}</button>
          {/* dive3 dispatch m8: real next steps, not just "open the job" */}
          <div className="grid grid-cols-2 gap-1.5"><button data-testid="bd-swap" className="min-h-[44px] rounded-lg bg-surface-2 text-sm font-semibold" onClick={() => { try { sessionStorage.setItem('sc-bd-intent', JSON.stringify({ kind: 'swap', jobId: id })) } catch { /* */ } onDone(); useStore.getState().go('dispatch') }}>Swap crane</button><button data-testid="bd-hire" className="min-h-[44px] rounded-lg bg-surface-2 text-sm font-semibold" onClick={() => { try { sessionStorage.setItem('sc-bd-intent', JSON.stringify({ kind: 'hire', jobId: id })) } catch { /* */ } onDone(); useStore.getState().open({ type: 'job', id }) }}>Hire outside</button></div></div> : null })}</div>}
        {shop && <CallButton phone={shop.phone} label="Call Shop" size="lg" variant="ok" />}
        {disp && <CallButton phone={disp.phone} label="Call Dispatch" size="lg" />}
        <Button variant="ghost" onClick={onDone}>Done</Button>
      </div>
    </motion.div>
  )
  return (
    <div className="flex flex-col gap-5">
      <a href="tel:911" className="flex items-center gap-3 rounded-2xl bg-bad-solid text-white px-4 py-3 font-semibold active:scale-[0.99] transition" data-testid="call-911"><Phone className="size-5" /><span className="flex-1">Anyone hurt? Call 911 first</span><span className="display text-xl">911</span></a>
      <Field label="Unit">
        <select className="input h-12 text-base" value={unit} onChange={e => setUnit(e.target.value)} data-testid="bd-unit">
          <option value="">Pick the truck, crane or trailer…</option>
          {units.map(e => <option key={e.id} value={e.id}>{eqLabel(e)} — {e.make} {e.model}</option>)}
        </select>
      </Field>
      <div>
        <div className="text-xs font-semibold text-muted mb-2">What happened?</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {KINDS.map(({ k, icon: I }) => <button key={k} onClick={() => setKind(k)} className={cn('rounded-2xl border p-3 flex flex-col items-center gap-2 text-xs font-semibold transition', kind === k ? 'border-bad bg-bad/10 text-bad' : 'border-line hover:bg-surface-2')}><I className="size-6" />{k}</button>)}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {SEV.map(s => <button key={s} onClick={() => setSev(s)} className={cn('rounded-2xl border px-4 py-3 text-left font-semibold text-sm transition', sev === s ? 'border-bad bg-bad/10 text-bad' : 'border-line')}>{s}</button>)}
      </div>
      <div className="flex flex-col gap-2">
        <Button size="lg" variant="outline" icon={<LocateFixed className="size-5" />} onClick={gps}>{loc ? 'Location captured ✓' : 'Use my location'}</Button>
        {loc && <div className="text-xs text-muted">{loc.text}</div>}
      </div>
      <div className="grid grid-cols-2 gap-3"><Field label="On-scene contact"><input className="input" value={contact} onChange={e => setContact(e.target.value)} /></Field><Field label="Phone"><input className="input" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" /></Field></div>
      <Field label="Notes"><textarea className="input min-h-20" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Injuries? Load secure? Blocking traffic?" /></Field>
      <label className="inline-flex items-center gap-2 text-sm font-semibold text-muted cursor-pointer"><Camera className="size-5" />{photos ? `${photos} photo${photos > 1 ? 's' : ''} attached` : 'Add photos'}<input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={e => setPhotos(photos + (e.target.files?.length ?? 0))} /></label>
      <Button variant="danger" size="xl" disabled={!unit || !kind || busy} onClick={submit} icon={<Siren className="size-6" />} data-testid="bd-submit">Send to Shop & Dispatch</Button>
    </div>
  )
}

export default function BreakdownSheet() {
  const open = useStore(s => s.ui.breakdownOpen)
  const unit = useStore(s => s.ui.breakdownUnit)
  const setUI = useStore(s => s.setUI)
  const close = () => setUI({ breakdownOpen: false, breakdownUnit: undefined })
  return <Sheet open={open} onClose={close} title={<span className="inline-flex items-center gap-2 text-bad"><Siren className="size-6" />Breakdown / Emergency</span>} sub="Shop, Dispatch and Safety get it instantly." width={560}>{open && <BreakdownForm onDone={close} defaultUnit={unit} />}</Sheet>
}
