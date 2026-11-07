import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Camera, MapPin, Clock, Satellite, CheckCircle2 } from 'lucide-react'
import { useStore } from '../data/store'
import { useMoves, moveActions, trailerOf, type Move, type Load } from '../data/moves'
import { Badge, Button } from '../components/ui'
import { cn } from '../lib/util'
import { isOnline, enqueue } from '../batch5/offline'
import { savePhoto, PhotoThumb } from '../lib/photos'

export function SamsaraBadge({ className }: { className?: string }) {
  return <span title="Works without Samsara. When connected, Southern trailers check in automatically by geofence." className={cn('inline-flex items-center gap-1 rounded-full border hairline px-2 py-0.5 text-[10.5px] font-semibold text-muted', className)}><Satellite className="size-3" />Samsara optional</span>
}

/** A demo "photo of the load" so desktop testers can complete a check-in without a camera. */
export function demoPhoto(label: string) {
  const c = document.createElement('canvas'); c.width = 480; c.height = 300; const g = c.getContext('2d')!
  const grd = g.createLinearGradient(0, 0, 0, 300); grd.addColorStop(0, '#9cc3e6'); grd.addColorStop(.62, '#dfe9f2'); grd.addColorStop(.62, '#8a7a62'); grd.addColorStop(1, '#5d5141'); g.fillStyle = grd; g.fillRect(0, 0, 480, 300)
  g.fillStyle = '#2b2f36'; g.fillRect(40, 190, 400, 22); g.fillStyle = '#c62828'; g.fillRect(360, 140, 80, 50); g.fillStyle = '#f2b705'; g.fillRect(70, 150, 120, 40); g.fillRect(200, 160, 140, 30)
  g.fillStyle = '#111'; [80, 120, 300, 340, 390, 420].forEach(x => { g.beginPath(); g.arc(x, 218, 12, 0, 7); g.fill() })
  g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 262, 480, 38); g.fillStyle = '#fff'; g.font = '600 15px system-ui'; g.fillText(`${label} · ${new Date().toLocaleString()}`, 12, 286)
  return c.toDataURL('image/jpeg', 0.7)
}

export function CheckInForm({ move, load, onDone }: { move: Move; load: Load; onDone?: () => void }) {
  const s = useMoves()
  const who = useStore(st => st.session?.name) ?? 'Crew'
  const tr = trailerOf(s, load.trailerId)
  const [gps, setGps] = useState<{ lat: number; lng: number; sim: boolean } | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [at] = useState(() => new Date())
  useEffect(() => {
    let done = false
    const sim = () => { if (!done) { done = true; setGps({ lat: +(move.toLat + 0.0012).toFixed(5), lng: +(move.toLng - 0.0008).toFixed(5), sim: true }) } }
    const t = setTimeout(sim, 2500)
    try { navigator.geolocation?.getCurrentPosition(p => { if (!done) { done = true; clearTimeout(t); setGps({ lat: +p.coords.latitude.toFixed(5), lng: +p.coords.longitude.toFixed(5), sim: false }) } }, sim, { timeout: 2400 }) } catch { sim() }
    return () => clearTimeout(t)
  }, [move.toLat, move.toLng])
  const onFile = (f?: File) => { if (!f) return; savePhoto(f, 'load').then(setPhoto).catch(err => toast.error(String(err.message ?? err))) } // field fixes: shrink + IndexedDB, only a ref in moves state
  const submit = () => {
    if (!gps || !photo) return
    if (!isOnline()) { enqueue('Check-in', `Load ${load.no} arrived — ${move.toProject}`); enqueue('Photo', `Load ${load.no} photo`) }
    moveActions.checkIn(move.id, load.id, { source: 'manual', at: at.toISOString(), lat: gps.lat, lng: gps.lng, photo, by: who })
    toast.success(`Load ${load.no} checked in`, { description: `${tr?.name} · ${move.toProject}` })
    onDone?.()
  }
  return (
    <div className="flex flex-col gap-3" data-testid="checkin-form">
      <div className="card-flat p-4">
        <div className="font-semibold">Load {load.no} · {tr?.name}</div>
        <div className="text-xs text-muted mt-0.5">{tr?.carrierName} · driver {tr?.driver} → {move.toProject}</div>
        <div className="mt-2 flex flex-wrap gap-1.5">{tr?.carrier === '3P' ? <Badge tone="warn">Third-party live load · crew check-in</Badge> : <><Badge tone="info">Southern trailer</Badge><SamsaraBadge /></>}</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="card-flat p-3"><div className="label flex items-center gap-1"><MapPin className="size-3" />GPS</div><div className="font-semibold num mt-1" data-testid="checkin-gps">{gps ? `${gps.lat}, ${gps.lng}` : 'Locating…'}</div>{gps?.sim && <div className="text-xs text-warn" data-testid="checkin-gps-sim">Phone location not shared — using the job-site pin</div>}</div>
        <div className="card-flat p-3"><div className="label flex items-center gap-1"><Clock className="size-3" />Time</div><div className="font-semibold num mt-1">{at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div><div className="text-[10.5px] text-faint">{at.toLocaleDateString()}</div></div>
      </div>
      <div className="card-flat p-3">
        <div className="label mb-2 flex items-center gap-1"><Camera className="size-3" />Photo of the load (required)</div>
        {photo ? <span data-testid="checkin-photo"><PhotoThumb src={photo} alt="Load photo" className="rounded-xl w-full max-h-48 object-cover" /></span> : <div className="text-sm text-muted">Snap the load on the trailer before it's unloaded.</div>}
        <div className="flex gap-2 mt-2">
          <label className="flex-1 h-11 rounded-xl bg-surface-3 font-semibold text-sm grid place-items-center cursor-pointer">Take photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFile(e.target.files?.[0])} /></label>
          <button className="flex-1 h-11 rounded-xl bg-surface-3 font-semibold text-sm" data-testid="checkin-demo-photo" onClick={() => setPhoto(demoPhoto(`Load ${load.no}`))}>Use demo photo</button>
        </div>
      </div>
      <Button variant="primary" size="lg" disabled={!gps || !photo} onClick={submit} data-testid="checkin-submit" icon={<CheckCircle2 className="size-5" />}>Arrived — check in load</Button>
    </div>
  )
}
