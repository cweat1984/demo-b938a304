import { useState } from 'react'
import { ChevronRight, Truck } from 'lucide-react'
import { useMoves, trailerOf, loadWeight } from '../data/moves'
import { CheckInForm, SamsaraBadge } from './CheckIn'
import { cn } from '../lib/util'

/** Field phone: pick an arriving load and check it in (GPS + time + photo). */
export function FieldCheckIn({ onDone }: { onDone: () => void }) {
  const s = useMoves()
  const [pick, setPick] = useState<{ m: string; l: string } | null>(null)
  const active = s.moves.filter(m => m.status !== 'Complete')
  const sel = pick && s.moves.find(m => m.id === pick.m)
  const ld = sel && sel.loads.find(l => l.id === pick!.l)
  if (sel && ld && ld.status !== 'Delivered') return <div className="pb-8"><button className="text-sm text-accent font-semibold mb-3" onClick={() => setPick(null)}>← All loads</button><CheckInForm move={sel} load={ld} onDone={onDone} /></div>
  return (
    <div className="flex flex-col gap-4 pb-8" data-testid="field-checkin">
      <div className="flex items-center gap-2 text-sm text-muted">Southern trailers check in on their own when Samsara is connected. <SamsaraBadge /></div>
      {active.map(m => { const cr = s.cranes.find(c => c.id === m.craneId)!; const arriving = m.loads.filter(l => l.status === 'En route'); return (
        <div key={m.id}>
          <div className="label mb-2">Crane {cr.unit} → #{m.toJobNo} {m.toProject}</div>
          <div className="flex flex-col gap-2">
            {arriving.map(l => { const tr = trailerOf(s, l.trailerId)!; return (
              <button key={l.id} onClick={() => setPick({ m: m.id, l: l.id })} data-testid="field-load" className="rounded-3xl bg-surface p-4 flex items-center gap-3 text-left press">
                <span className={cn('size-11 rounded-2xl grid place-items-center', tr.carrier === '3P' ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent')}><Truck className="size-5" /></span>
                <span className="flex-1 min-w-0"><span className="block font-semibold">Load {l.no} · {tr.carrier === '3P' ? 'Live load' : 'Southern'}</span><span className="block text-xs text-muted truncate">{tr.name} · {(loadWeight(s, m, l.no) / 1000).toFixed(1)}k lb</span></span>
                <ChevronRight className="size-5 text-faint" />
              </button>) })}
            {!arriving.length && <div className="text-sm text-muted rounded-3xl bg-surface p-4">No loads en route right now.</div>}
          </div>
        </div>) })}
      {!active.length && <div className="text-sm text-muted">No active crane moves.</div>}
    </div>
  )
}
