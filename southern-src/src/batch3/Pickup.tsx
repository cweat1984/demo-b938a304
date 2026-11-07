import { useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { Wand2, CheckCheck, Truck, AlertOctagon, Satellite, RotateCcw, MapPin } from 'lucide-react'
import { useStore } from '../data/store'
import { usePickup, pickActions, rank, nextThursday, fullName, type Pickup as P, type Ranked } from './pickupData'
import { PageHeader, Badge, Button, Card, Segmented, Modal } from '../components/ui'
import { EmpRef } from '../components/bits'
import { SamsaraBadge } from '../moves/CheckIn'
import { cn, today, addDays } from '../lib/util'

export default function Pickup() {
  const db = useStore(s => s.db)
  const { pickups, assigned } = usePickup()
  const days = [...new Set(pickups.map(p => p.date))].sort()
  const thu = nextThursday()
  const [day, setDay] = useState(days.includes(thu) ? thu : days[0])
  const [sel, setSel] = useState<string>(pickups.find(p => p.date === day)?.id ?? pickups[0].id)
  const [ov, setOv] = useState<{ p: P; r: Ranked } | null>(null)
  const [why, setWhy] = useState('')
  const list = pickups.filter(p => p.date === day).sort((a, b) => a.time.localeCompare(b.time))
  const cur = pickups.find(p => p.id === sel && p.date === day) ?? list[0]
  const ranked = cur ? rank(db, cur) : []
  const plan = () => {
    const t0 = performance.now(); const n = pickActions.planDay(db, day)
    toast.success(`${n} of ${list.length} pickups filled in ${((performance.now() - t0) / 1000).toFixed(2)} s`, { description: 'Best legal driver for each · review, then Confirm all' })
  }
  const dlabel = (d: string) => d === today() ? 'Today' : d === addDays(today(), 1) ? 'Tomorrow' : new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <div className="max-w-[1500px] mx-auto" data-testid="pickup-page">
      <PageHeader eyebrow="Dispatch · Smart pickup" title="Smart Pickup" sub="Pick a load — the best legal driver rises to the top, with the reasons." actions={<>{useStore.getState().session?.role === 'owner' && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { pickActions.reset(); toast('Pickups reset') }}>Reset demo</Button>}
        <Button variant="secondary" icon={<Wand2 className="size-4" />} onClick={() => { setDay(thu); setTimeout(() => { const n = pickActions.planDay(db, thu); toast.success(`Thursday planned — ${n} pickups filled`, { description: 'Review the colors, then Confirm all' }) }, 50) }} data-testid="plan-thursday">Plan Thursday</Button></>} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Segmented value={day} onChange={d => { setDay(d); setSel(pickups.find(p => p.date === d)!.id) }} options={days.map(d => ({ value: d, label: dlabel(d), count: pickups.filter(p => p.date === d).length }))} />
        <SamsaraBadge /><span className="text-xs text-muted">Hours from the app's duty log, or live from Samsara / any ELD when connected.</span>
        <div className="flex-1" />
        <Button variant="secondary" icon={<Wand2 className="size-4" />} onClick={plan} data-testid="plan-day">Plan this day</Button>
        <Button variant="primary" icon={<CheckCheck className="size-4" />} disabled={!list.some(p => assigned[p.id] && !assigned[p.id].confirmed)} onClick={() => { pickActions.confirmDay(day); toast.success('Plan confirmed — drivers notified (demo)') }} data-testid="confirm-all">Confirm all</Button>
      </div>
      <div className="grid lg:grid-cols-[400px_1fr] gap-5">
        <div className="flex flex-col gap-2" data-testid="pickup-list">
          {list.map(p => { const a = assigned[p.id]; const r = a && rank(db, p).find(x => x.d.e.id === a.driverId); return (
            <motion.button layout key={p.id} onClick={() => setSel(p.id)} data-testid="pickup-row" data-assigned={!!a} className={cn('card p-4 text-left border-l-4', cur?.id === p.id && 'ring-2 ring-accent', !a ? 'border-l-faint/40' : a.override ? 'border-l-warn' : 'border-l-ok')}>
              <div className="flex items-center gap-2"><span className="font-semibold num text-sm">{p.time}</span><span className="font-semibold flex-1 truncate">{p.label}</span>{a?.confirmed && <Badge tone="ok">Confirmed</Badge>}</div>
              <div className="text-xs text-muted mt-0.5 truncate">{p.from} → {p.to} · {p.dropMi} mi · {(p.weightLbs / 1000).toFixed(1)}k lb · #{p.jobNo}</div>
              <div className="mt-2 text-sm">{a ? <span className="flex items-center gap-1.5"><Truck className="size-4 text-ok" /><b>{fullName(db.employees.find(e => e.id === a.driverId))}</b>{r && <span className="text-xs text-muted">· {r.reasons[0].t}</span>}{a.override && <Badge tone="warn">Override</Badge>}</span> : <span className="text-faint">No driver yet</span>}</div>
            </motion.button>) })}
        </div>
        {cur && <Card pad={false} className="overflow-hidden">
          <div className="p-5 border-b hairline"><div className="label">Recommend driver</div><div className="display text-2xl font-semibold mt-1">{cur.label}</div>
            <div className="text-sm text-muted mt-1 flex flex-wrap gap-x-4"><span><MapPin className="size-3.5 inline" /> {cur.from} → {cur.to}</span><span>{cur.trailer}</span><span>{cur.time} · {dlabel(cur.date)}</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">{cur.needs.map(n => <Badge key={n} tone="info">{n}</Badge>)}{cur.certs.map(c => <Badge key={c}>{c}</Badge>)}</div></div>
          <div className="divide-y divide-[var(--line)]" data-testid="ranked">
            {ranked.slice(0, 12).map((r, i) => { const a = assigned[cur.id]?.driverId === r.d.e.id; return (
              <div key={r.d.e.id} data-testid="ranked-row" data-ok={r.ok} className={cn('p-4 flex items-start gap-3', !r.ok && 'opacity-60')}>
                <div className={cn('size-9 rounded-full grid place-items-center font-bold text-sm shrink-0', r.ok ? (i === 0 ? 'bg-ok text-white' : 'bg-surface-3') : 'bg-bad/15 text-bad')}>{r.ok ? i + 1 : <AlertOctagon className="size-4" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><EmpRef id={r.d.e.id} className="font-semibold" />{r.d.hos.source === 'Samsara' && <Satellite className="size-3.5 text-muted" />}<span className="text-xs text-muted">trip ≈ {r.tripHrs}h</span>{r.ok && <span className="text-xs text-muted num">score {r.score}</span>}</div>
                  <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="reasons">{r.ok ? r.reasons.map(x => <Badge key={x.t} tone={x.tone === 'neutral' ? 'neutral' : x.tone}>{x.t}</Badge>) : r.stops.map(x => <Badge key={x} tone="bad">{x}</Badge>)}</div>
                </div>
                {a ? <Badge tone="ok">Assigned</Badge> : <Button size="sm" variant={r.ok ? (i === 0 ? 'primary' : 'secondary') : 'ghost'} data-testid="assign" onClick={() => { if (r.ok) { pickActions.assign(cur.id, r.d.e.id); toast.success(`${fullName(r.d.e)} assigned`) } else { setWhy(''); setOv({ p: cur, r }) } }}>{r.ok ? 'Assign' : 'Override'}</Button>}
              </div>) })}
          </div>
        </Card>}
      </div>
      <Modal open={!!ov} onClose={() => setOv(null)} title="Override a hard stop?" sub={ov && `${fullName(ov.r.d.e)} · ${ov.r.stops.join(' · ')}`}>
        <div className="flex flex-col gap-3"><textarea className="input min-h-[80px]" placeholder="Reason (logged to the audit trail)" value={why} onChange={e => setWhy(e.target.value)} data-testid="override-reason" />
          <Button variant="danger" disabled={why.trim().length < 4} onClick={() => { const o = ov!; pickActions.assign(o.p.id, o.r.d.e.id, why.trim()); useStore.getState().commit('Dispatch override', o.p.label, `${fullName(o.r.d.e)} — ${o.r.stops.join('; ')} — ${why.trim()}`, () => {}); toast.warning('Override logged'); setOv(null) }}>Assign anyway</Button></div>
      </Modal>
    </div>
  )
}
