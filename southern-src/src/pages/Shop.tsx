import { useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { Plus, Siren, Wrench, ClipboardCheck, Package } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { inScope, byId, serviceStatus, fullName, eqLabel } from '../data/logic'
import { cn, fmtDate, timeAgo, today, addDays, money, num } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Modal, Field, Card, CallButton } from '../components/ui'
import { EqStatus } from '../components/bits'

const COLS: T.WoStatus[] = ['Open', 'In Progress', 'Waiting Parts', 'Ready for Release']
const PRI_TONE = { Critical: 'bad', High: 'warn', Normal: 'info', Low: 'neutral' } as const

export default function Shop() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const [tab, setTab] = useKeep<'wo' | 'breakdowns' | 'pm' | 'dvir' | 'parts'>('shop:tab', 'wo')
  const [newWo, setNewWo] = useState(false)
  const units = db.equipment.filter(e => inScope(e, f))
  const ids = new Set(units.map(u => u.id))
  const wos = db.workOrders.filter(w => ids.has(w.unitId) && w.status !== 'Closed')
  const bds = db.breakdowns.filter(b => ids.has(b.unitId))
  const openBd = bds.filter(b => b.status !== 'Resolved')
  const pm = useMemo(() => units.filter(u => u.category !== 'Trailer' || u.nextServiceDate).map(u => ({ u, s: serviceStatus(u) })).sort((a, b) => Number(b.s.overdue) - Number(a.s.overdue) || Number(b.s.dueSoon) - Number(a.s.dueSoon) || a.s.daysLeft - b.s.daysLeft), [units])
  const parts = db.items.filter(i => ['Parts', 'Filters', 'Fluids & Oils', 'Tires'].includes(i.category))
  const dvirs = db.dvirs.filter(d => ids.has(d.unitId)).slice(0, 40)
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader eyebrow="Mechanics & service" title="Shop" sub={`${wos.length} open work orders · ${openBd.length} active breakdowns · ${pm.filter(p => p.s.overdue).length} units overdue for service`} actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setNewWo(true)}>Work order</Button>} />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: 'wo', label: 'Work orders', count: wos.length }, { value: 'breakdowns', label: 'Breakdowns', count: openBd.length }, { value: 'pm', label: 'PM schedule' }, { value: 'dvir', label: 'Pre-trips' }, { value: 'parts', label: 'Parts' }]} />
      {tab === 'wo' && <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-4">
        {COLS.map(c => { const col = wos.filter(w => w.status === c).sort((a, b) => ['Critical', 'High', 'Normal', 'Low'].indexOf(a.priority) - ['Critical', 'High', 'Normal', 'Low'].indexOf(b.priority)); return (
          <div key={c}>
            <div className="flex items-center justify-between px-1 mb-2"><span className="font-semibold">{c}</span><span className="text-xs text-muted num">{col.length}</span></div>
            <div className="flex flex-col gap-2">{col.map(w => { const u = byId(db.equipment, w.unitId)!; return (
              <button key={w.id} onClick={() => open({ type: 'workorder', id: w.id })} className="card p-4 text-left hover:-translate-y-0.5 transition">
                <div className="flex items-center gap-2"><span className="display text-lg font-semibold num">{u.unit}</span><Badge tone={PRI_TONE[w.priority]}>{w.priority}</Badge><span className="ml-auto text-[11px] text-muted">{w.woNo}</span></div>
                <div className="text-sm font-medium mt-1.5 leading-snug">{w.title}</div>
                <div className="text-xs text-muted mt-2 flex items-center gap-2"><span>{w.techId ? fullName(byId(db.employees, w.techId)) : 'Unassigned'}</span><span className="ml-auto">{w.due < today() ? <span className="text-bad">Due {fmtDate(w.due)}</span> : `Due ${fmtDate(w.due)}`}</span></div>
              </button>) })}{!col.length && <div className="rounded-2xl border border-dashed hairline p-6 text-center text-sm text-faint">Empty</div>}</div>
          </div>) })}
      </div>}
      {tab === 'breakdowns' && <div className="flex flex-col gap-3">
        {bds.map(b => { const u = byId(db.equipment, b.unitId)!; return (
          <Card key={b.id} className={cn(b.status !== 'Resolved' && b.severity.startsWith('Down') && 'border-bad/40')}>
            <div className="flex flex-wrap items-start gap-4">
              <div className={cn('grid size-12 place-items-center rounded-2xl', b.status === 'Resolved' ? 'bg-surface-2 text-muted' : 'bg-bad/15 text-bad')}><Siren className="size-6" /></div>
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap"><button onClick={() => open({ type: 'equipment', id: u.id })} className="font-semibold hover:text-accent">{eqLabel(u)}</button><span className="text-muted">·</span><span className="font-semibold">{b.kind}</span><Badge tone={b.status === 'Resolved' ? 'ok' : b.status === 'New' ? 'bad' : 'warn'}>{b.status}</Badge></div>
                <div className="text-sm text-muted mt-1">{b.severity} · {b.locationText} · reported {timeAgo(b.reportedAt)} by {b.reportedBy}</div>
                {b.notes && <div className="text-sm mt-2">{b.notes}</div>}
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <CallButton phone={b.contactPhone} label={b.contactName.split(' ')[0]} size="sm" />
                {b.status === 'New' && <Button size="sm" onClick={() => actions.setBreakdown(b.id, 'Acknowledged')}>Acknowledge</Button>}
                {(b.status === 'New' || b.status === 'Acknowledged') && <Button size="sm" variant="primary" onClick={() => { actions.setBreakdown(b.id, 'Tech Dispatched'); toast.success('Road tech dispatched') }}>Dispatch tech</Button>}
                {b.workOrderId && <Button size="sm" variant="ghost" onClick={() => open({ type: 'workorder', id: b.workOrderId! })}>Work order</Button>}
              </div>
            </div>
          </Card>) })}
      </div>}
      {tab === 'pm' && <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b hairline text-sm text-muted">Preventive maintenance by engine hours, miles and calendar — whichever comes first.</div>
        {pm.slice(0, 60).map(({ u, s }) => (
          <button key={u.id} onClick={() => open({ type: 'equipment', id: u.id })} className="w-full flex items-center gap-4 px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2 text-left">
            <span className="w-20 display text-lg font-semibold num">{u.unit}</span>
            <span className="flex-1 min-w-0 text-sm truncate">{u.make} {u.model} <span className="text-muted">· {u.category}</span></span>
            <span className="hidden md:block w-40 text-sm num text-muted">{s.unit === 'mi' ? `${num(u.miles ?? 0)} mi` : `${num(u.hours ?? 0)} hrs`}</span>
            <span className="w-44 text-sm num">{s.remaining != null ? (s.remaining < 0 ? <span className="text-bad font-semibold">{num(-s.remaining)} {s.unit} over</span> : `${num(s.remaining)} ${s.unit} left`) : '—'}</span>
            <span className="w-32 text-sm">{s.daysLeft < 0 ? <span className="text-bad">{-s.daysLeft}d overdue</span> : `${fmtDate(u.nextServiceDate)}`}</span>
            <span className="w-28 text-right">{s.overdue ? <Badge tone="bad">Overdue</Badge> : s.dueSoon ? <Badge tone="warn">Due soon</Badge> : <Badge tone="ok">OK</Badge>}</span>
          </button>
        ))}
      </div>}
      {tab === 'dvir' && <div className="card p-0 overflow-hidden">
        {dvirs.map(d => { const defects = Object.entries(d.items).filter(([, v]) => v === 'defect').map(([k]) => k); return (
          <div key={d.id} className="flex items-center gap-4 px-5 py-3 border-b hairline last:border-0">
            <ClipboardCheck className={cn('size-5', defects.length ? 'text-warn' : 'text-ok')} />
            <span className="w-20 font-semibold num">{byId(db.equipment, d.unitId)?.unit}</span>
            <span className="flex-1 text-sm min-w-0 truncate">{defects.length ? defects.join(', ') : 'No defects'}{d.defects ? ` — ${d.defects}` : ''}</span>
            <span className="hidden md:block text-sm text-muted w-40">{fullName(byId(db.employees, d.employeeId))}</span>
            <span className="text-xs text-muted w-24">{fmtDate(d.date)}</span>
            {!d.safeToOperate ? <Badge tone="bad">Tagged out</Badge> : defects.length ? <Badge tone="warn">Defect</Badge> : <Badge tone="ok">Pass</Badge>}
            {d.workOrderId && <Button size="sm" variant="ghost" onClick={() => open({ type: 'workorder', id: d.workOrderId! })}><Wrench className="size-4" /></Button>}
          </div>) })}
      </div>}
      {tab === 'parts' && <div className="card p-0 overflow-hidden">
        {parts.map(i => (
          <button key={i.id} onClick={() => open({ type: 'item', id: i.id })} className="w-full flex items-center gap-4 px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2 text-left">
            <Package className="size-5 text-muted" /><span className="flex-1 min-w-0"><span className="block font-semibold text-sm truncate">{i.name}</span><span className="block text-xs text-muted">{i.sku} · bin {i.bin}</span></span>
            <span className="w-24 text-sm num text-right">{money(i.cost)}</span>
            <span className={cn('w-28 text-right num font-semibold', i.onHand <= i.min && 'text-bad')}>{i.onHand} {i.unit}</span>
            {i.onHand <= i.min ? <Badge tone="bad">Reorder</Badge> : <Badge tone="ok">Stocked</Badge>}
          </button>
        ))}
      </div>}
      <NewWorkOrder open={newWo} onClose={() => setNewWo(false)} units={units} />
    </div>
  )
}

function NewWorkOrder({ open, onClose, units }: { open: boolean; onClose: () => void; units: T.Equipment[] }) {
  const db = useStore(s => s.db)
  const [unitId, setUnit] = useState(units[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [pri, setPri] = useState<T.WorkOrder['priority']>('Normal')
  const [tech, setTech] = useState('')
  const [src, setSrc] = useState<T.WorkOrder['source']>('Breakdown') // dive3 shop M6: a repair isn't a PM by default
  const u = byId(db.equipment, unitId)
  return (
    <Modal open={open} onClose={onClose} title="New work order" width={520}>
      <div className="flex flex-col gap-4">
        <Field label="Unit"><select className="input" value={unitId} onChange={e => setUnit(e.target.value)}>{units.map(e => <option key={e.id} value={e.id}>{eqLabel(e)} · {e.make} {e.model}</option>)}</select></Field>
        {u && <div className="flex items-center gap-2 text-sm"><EqStatus s={u.status} /><span className="text-muted">{u.yard}</span></div>}
        <Field label="What needs doing"><input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="250-hr service, replace hydraulic filter" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Priority"><select className="input" value={pri} onChange={e => setPri(e.target.value as never)}>{['Critical', 'High', 'Normal', 'Low'].map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Source"><select className="input" value={src} onChange={e => setSrc(e.target.value as never)}>{['Service Plan', 'Inspection', 'Driver Report', 'Breakdown'].map(p => <option key={p}>{p}</option>)}</select></Field>
          <Field label="Tech"><select className="input" value={tech} onChange={e => setTech(e.target.value)}><option value="">Unassigned</option>{db.employees.filter(e => e.craft === 'Mechanic').map(e => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</select></Field>
        </div>
        <Button variant="primary" size="lg" disabled={!title.trim() || !unitId} data-testid="wo-save" onClick={() => { const r = actions.createWO({ unitId, title: title.trim(), complaint: title.trim(), priority: pri, techId: tech || undefined, status: 'Open', opened: today(), due: addDays(today(), pri === 'Critical' ? 0 : pri === 'High' ? 2 : 7), parts: [], laborHrs: 0, laborRate: 115, source: src }); if (!r.ok) { toast.error('Already has an open PM', { description: r.reason }); return } toast.success('Work order opened'); setTitle(''); onClose() }}>Open work order</Button>
      </div>
    </Modal>
  )
}
