// Field fixes (N-M13): a mechanic on a field call gets his work orders on the phone — labor, parts used, status.
import { useState } from 'react'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { actions } from '../data/store'
import { byId, eqLabel } from '../data/logic'
import { fmtDate } from '../lib/util'
import { Badge, Button, Field } from '../components/ui'
import { useMe } from './FieldApp'

const NEXT: T.WoStatus[] = ['In Progress', 'Waiting Parts', 'Ready for Release']
export function MyWorkOrders() {
  const { db, me } = useMe()
  const mine = db.workOrders.filter(w => w.status !== 'Closed' && w.techId === me.id)
  const list = mine.length ? mine : db.workOrders.filter(w => w.status !== 'Closed' && !w.techId && (w.priority === 'Critical' || w.priority === 'High')).slice(0, 8)
  const [open, setOpen] = useState<string | null>(null)
  if (!list.length) return <div className="rounded-3xl bg-surface p-6 text-center text-muted" data-testid="wo-empty">No open work orders for you. The shop assigns them from Maintenance.</div>
  return <div className="flex flex-col gap-3 pb-8" data-testid="my-wo">
    {!mine.length && <div className="text-sm text-muted">Nothing assigned to you — here are open high-priority ones you can take.</div>}
    {list.map(w => <WoCard key={w.id} w={w} unit={eqLabel(byId(db.equipment, w.unitId))} me={me.id} op={open === w.id} toggle={() => setOpen(open === w.id ? null : w.id)} />)}
  </div>
}
function WoCard({ w, unit, me, op, toggle }: { w: T.WorkOrder; unit: string; me: string; op: boolean; toggle: () => void }) {
  const [hrs, setHrs] = useState(''), [part, setPart] = useState(''), [qty, setQty] = useState('1'), [cost, setCost] = useState('')
  const h = Number(hrs), q = Number(qty), c = cost.trim() ? Number(cost) : 0
  const hErr = hrs.trim() && (!Number.isFinite(h) || h <= 0 || h > 16) ? 'Labor 0.25–16 h' : ''
  const pErr = part.trim() && (!Number.isInteger(q) || q < 1 || q > 99 || !Number.isFinite(c) || c < 0) ? 'Qty 1–99, cost $0 or more' : ''
  return <div className="rounded-3xl bg-surface p-4 flex flex-col gap-2" data-testid="wo-card">
    <button className="text-left" onClick={toggle} aria-expanded={op}><div className="flex items-center gap-2"><span className="font-semibold">{w.woNo}</span><Badge tone={w.priority === 'Critical' ? 'bad' : w.priority === 'High' ? 'warn' : 'neutral'}>{w.priority}</Badge><Badge tone="info">{w.status}</Badge></div>
      <div className="font-medium mt-1">{w.title}</div><div className="text-xs text-muted">{unit} · due {fmtDate(w.due)} · {w.laborHrs} h · {w.parts.length} parts</div></button>
    {op && <div className="flex flex-col gap-3 mt-1">
      <div className="text-sm">{w.complaint}</div>
      {w.techId !== me && <Button onClick={() => { actions.updateWO(w.id, { techId: me, status: 'In Progress' }); toast.success(`${w.woNo} is yours`) }} data-testid="wo-take">Take this work order</Button>}
      <div className="flex gap-2 items-end"><Field label="Labor hours"><input className="input" inputMode="decimal" value={hrs} onChange={e => setHrs(e.target.value)} placeholder="1.5" data-testid="wo-hrs" /></Field><Button disabled={!hrs.trim() || !!hErr} onClick={() => { actions.updateWO(w.id, { laborHrs: Math.round((w.laborHrs + h) * 100) / 100 }); setHrs(''); toast.success(`${h} h added to ${w.woNo}`) }} data-testid="wo-addhrs">Add</Button></div>
      {hErr && <div className="text-xs text-bad">{hErr}</div>}
      <div className="grid grid-cols-[1fr_4rem_5rem] gap-2"><Field label="Part used"><input className="input" value={part} onChange={e => setPart(e.target.value)} placeholder="Hydraulic hose" data-testid="wo-part" /></Field><Field label="Qty"><input className="input" inputMode="numeric" value={qty} onChange={e => setQty(e.target.value)} /></Field><Field label="$ each"><input className="input" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} /></Field></div>
      {pErr && <div className="text-xs text-bad">{pErr}</div>}
      <Button disabled={!part.trim() || !!pErr} onClick={() => { actions.updateWO(w.id, { parts: [...w.parts, { name: part.trim(), qty: q, cost: c }] }); setPart(''); setQty('1'); setCost(''); toast.success('Part logged') }} data-testid="wo-addpart">Log part</Button>
      <div className="flex flex-wrap gap-2">{NEXT.filter(s => s !== w.status).map(s => <Button key={s} size="sm" onClick={() => { actions.updateWO(w.id, { status: s }); toast.success(`${w.woNo} → ${s}`) }} data-testid="wo-status">{s}</Button>)}</div>
    </div>}
  </div>
}
