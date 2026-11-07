import { useMemo, useState } from 'react'
import { Wrench, ClipboardCheck, Camera, Check, X, ChevronLeft, ChevronRight, Smartphone, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Segmented } from '../components/ui'
import { useStore } from '../data/store'
import { cn, today, iso, fmtDate } from '../lib/util'
import { useB4, pmFor, annualDue, ragOf, CHECKLISTS, defectToWorkOrder, type InspKind, type Inspection, type RAG } from './b4store'

const dot: Record<RAG, string> = { red: 'bg-bad', amber: 'bg-warn', green: 'bg-ok-solid' }
const readFile = (f: File) => new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f) })

/** Phone inspection: checklist, pass/fail, photo + note per defect, defect → work order. Also standalone at ?inspect=<unitId>. */
export function InspectionForm({ unitId, kind: k0 = 'Daily', onDone }: { unitId: string; kind?: InspKind; onDone?: () => void }) {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Operator'
  const unit = db.equipment.find(e => e.id === unitId)!
  // field fixes (N-M10): OSHA 1926.1412 — monthly needs a competent person (supervisor/mechanic/safety), annual a qualified inspector (mechanic or office)
  const sess = useStore(s => s.session), me = db.employees.find(e => e.id === sess?.employeeId)
  const fieldUser = sess?.role === 'field'
  const may = (k: InspKind) => k === 'Daily' || !fieldUser || me?.craft === 'Mechanic' || (k === 'Monthly' && (me?.craft === 'Supervisor' || me?.craft === 'Safety'))
  const [cert, setCert] = useState(''), [inspSig, setInspSig] = useState('')
  const [kind, setKind] = useState<InspKind>(k0)
  const [items, setItems] = useState(() => CHECKLISTS[k0].map(k => ({ k, ok: null as boolean | null, note: '', photo: undefined as string | undefined })))
  const set = (i: number, p: Partial<typeof items[number]>) => setItems(items.map((x, j) => j === i ? { ...x, ...p } : x))
  const done = items.every(x => x.ok !== null)
  return <div className="flex flex-col gap-3" data-testid="insp-form">
    <div><div className="label">{unit.unit} · {unit.make} {unit.model}</div><div className="text-xl font-semibold">Crane inspection</div></div>
    <Segmented value={kind} onChange={v => { setKind(v); setItems(CHECKLISTS[v].map(k => ({ k, ok: null, note: '', photo: undefined }))) }} options={(['Daily', 'Monthly', 'Annual'] as const).filter(may).map(v => ({ value: v, label: v }))} />
    {fieldUser && !may('Annual') && <div className="text-xs text-muted" data-testid="insp-qual-note">{may('Monthly') ? 'Annual' : 'Monthly and annual'} inspections are done by a qualified inspector (OSHA 1926.1412). Call the shop if one is due.</div>}
    {kind === 'Daily' && <Button size="sm" onClick={() => setItems(items.map(x => ({ ...x, ok: x.ok ?? true })))} data-testid="insp-allpass">Mark remaining as pass</Button>}
    {items.map((x, i) => <div key={x.k} className={cn('rounded-2xl p-3 border', x.ok === false ? 'border-bad/40 bg-bad/5' : 'hairline')} data-testid="insp-item">
      <div className="flex items-center gap-2"><span className="flex-1 text-[15px]">{x.k}</span>
        <button aria-label="Pass" data-testid="insp-pass" onClick={() => set(i, { ok: true })} className={cn('size-11 rounded-xl grid place-items-center', x.ok === true ? 'bg-ok-solid text-white' : 'bg-surface-2')}><Check className="size-5" /></button>
        <button aria-label="Fail" data-testid="insp-fail" onClick={() => set(i, { ok: false })} className={cn('size-11 rounded-xl grid place-items-center', x.ok === false ? 'bg-bad text-white' : 'bg-surface-2')}><X className="size-5" /></button></div>
      {x.ok === false && <div className="mt-2 flex gap-2"><input data-testid="insp-note" value={x.note} onChange={e => set(i, { note: e.target.value })} placeholder="What’s wrong?" className="flex-1 h-10 rounded-xl bg-surface-2 px-3 text-sm outline-none" /><label className="size-10 rounded-xl bg-surface-2 grid place-items-center cursor-pointer overflow-hidden">{x.photo ? <img src={x.photo} className="size-10 object-cover" /> : <Camera className="size-4" />}<input data-testid="insp-photo" type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) set(i, { photo: await readFile(f) }) }} /></label></div>}
    </div>)}
    {kind !== 'Daily' && <div className="grid grid-cols-1 gap-2" data-testid="insp-signoff"><input className="input" value={cert} onChange={e => setCert(e.target.value)} placeholder={kind === 'Annual' ? 'Inspector cert / license no.' : 'Competent person — cert or employee no.'} data-testid="insp-cert" /><input className="input" value={inspSig} onChange={e => setInspSig(e.target.value)} placeholder={`Type your full name to sign (${who})`} data-testid="insp-sign" /></div>}
    <Button variant="primary" size="lg" data-testid="insp-submit" disabled={!done || !may(kind) || (kind !== 'Daily' && (cert.trim().length < 3 || inspSig.trim().length < 3))} onClick={() => {
      const defects = items.filter(x => x.ok === false)
      const rec: Inspection = { id: 'in-' + Math.random().toString(36).slice(2, 7), unitId, kind, at: new Date().toISOString(), by: kind !== 'Daily' ? `${inspSig.trim()} (cert ${cert.trim()})` : who, items: items.map(x => x.ok === false ? { ...x, woId: defectToWorkOrder(unitId, x.k, x.note, kind) } : x) }
      useB4.getState().saveInspection(rec)
      toast.success(defects.length ? `${kind} inspection saved — ${defects.length} defect(s) sent to Shop as work orders` : `${kind} inspection passed`, { description: defects.length ? rec.items.filter(x => x.woId).map(x => x.woId).join(', ') : undefined }); onDone?.()
    }}>{done ? `Submit ${kind.toLowerCase()} inspection` : `${items.filter(x => x.ok === null).length} items left`}</Button>
  </div>
}

export default function Maintenance() {
  const db = useStore(s => s.db)
  const insp = useB4(s => s.inspections)
  const units = useMemo(() => db.equipment.filter(e => e.category === 'Crane' || e.category === 'Semi').slice(0, 80), [db.equipment])
  const [f, setF] = useState<'all' | RAG>('all')
  const [sel, setSel] = useState<string>(() => units.find(u => u.category === 'Crane')?.id ?? units[0]?.id)
  const [m, setM] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const rag = useMemo(() => Object.fromEntries(units.map(u => [u.id, ragOf(u, insp)])), [units, insp])
  const cnt = (r: RAG) => units.filter(u => rag[u.id] === r).length
  const cranes = units.filter(u => u.category === 'Crane')
  const days = useMemo(() => { const s = new Date(m); s.setDate(1 - m.getDay()); return Array.from({ length: 42 }, (_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return iso(d) }) }, [m])
  const dueOn = (d: string) => cranes.filter(c => annualDue(c) === d)
  const u = db.equipment.find(e => e.id === sel)
  const list = units.filter(x => f === 'all' || rag[x.id] === f)
  return <div className="flex flex-col gap-5" data-testid="maint-page">
    <PageHeader eyebrow="Fleet" title="Maintenance & inspections" sub="PM by hours, miles and days. Crane inspections on the phone. Defects become work orders." actions={u && <a href={`?inspect=${u.id}`} target="_blank" className="tap-chip h-11 px-3 rounded-xl bg-surface-2 text-sm inline-flex items-center gap-1.5"><Smartphone className="size-4" />Inspect on phone</a>} />
    <div className="grid grid-cols-3 gap-3">{(['red', 'amber', 'green'] as const).map(r => <Card key={r} onClick={() => setF(f === r ? 'all' : r)} className={cn('!p-4', f === r && 'ring-2 ring-ink')}><div className="flex items-center gap-2 text-xs text-muted"><span className={cn('size-2.5 rounded-full', dot[r])} />{r === 'red' ? 'Overdue / defect open' : r === 'amber' ? 'Due soon' : 'Good'}</div><div className="text-3xl font-semibold" data-testid={`rag-${r}`}>{cnt(r)}</div></Card>)}</div>
    <div className="grid lg:grid-cols-[1fr_400px] gap-5 items-start">
      <Card pad={false}><div className="px-5 py-3 border-b hairline font-semibold flex items-center gap-2"><Wrench className="size-4" />PM schedule<span className="ml-auto text-xs text-muted font-normal">{list.length} units</span></div>
        <div className="divide-y hairline max-h-[560px] overflow-auto">{list.map(x => { const pm = pmFor(x); const last = insp.find(i => i.unitId === x.id)
          return <button key={x.id} data-testid="pm-row" onClick={() => setSel(x.id)} className={cn('w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-surface-2', sel === x.id && 'bg-surface-2')}>
            <span className={cn('size-3 rounded-full shrink-0', dot[rag[x.id]])} /><div className="w-40 min-w-0"><div className="font-semibold text-sm truncate">{x.unit} · {x.model}</div><div className="text-[11px] text-muted">{x.category}{last ? ` · ${last.kind} insp ${fmtDate(last.at.slice(0, 10))}` : ''}</div></div>
            <div className="flex-1 flex flex-wrap gap-1.5">{pm.map(l => <span key={l.kind} className={cn('text-[11px] rounded-full px-2 py-0.5', l.rag === 'red' ? 'bg-bad/15 text-bad' : l.rag === 'amber' ? 'bg-warn/15 text-warn' : 'bg-surface-3 text-muted')}>{l.label}: {l.left}</span>)}{x.category === 'Crane' && <span className="text-[11px] rounded-full px-2 py-0.5 bg-info/15 text-info">Annual {fmtDate(annualDue(x))}</span>}</div>
          </button> })}</div></Card>
      <div className="flex flex-col gap-4">
        {u && <div className="rounded-[36px] border-[10px] border-surface-3 bg-surface p-4 max-h-[640px] overflow-auto"><InspectionForm key={u.id} unitId={u.id} /></div>}
        <Card data-testid="annual-cal"><div className="flex items-center gap-2 mb-2"><ClipboardCheck className="size-4" /><div className="font-semibold flex-1">Annual / third-party due · {m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div><button aria-label="Previous" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="size-11 grid place-items-center rounded-lg hover:bg-surface-2"><ChevronLeft className="size-4" /></button><button aria-label="Next" onClick={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="size-11 grid place-items-center rounded-lg hover:bg-surface-2"><ChevronRight className="size-4" /></button></div>
          <div className="grid grid-cols-7 gap-1">{days.map(d => { const cs = dueOn(d); const inM = new Date(d + 'T12:00').getMonth() === m.getMonth()
            return <div key={d} title={cs.map(c => c.unit).join(', ')} className={cn('aspect-square rounded-md p-1 text-[10px] flex flex-col', inM ? 'bg-surface-2' : 'opacity-30', d === today() && 'ring-1 ring-accent')}>{Number(d.slice(8))}{cs.length > 0 && <span className={cn('mt-auto rounded text-white text-center font-bold', d < today() ? 'bg-bad' : 'bg-info')}>{cs.length}</span>}</div> })}</div>
          <div className="text-xs text-muted mt-2 flex items-center gap-1"><AlertTriangle className="size-3" />{cranes.filter(c => annualDue(c) < today()).length} crane(s) past their annual — locked out of dispatch until certified.</div></Card>
        {insp.length > 0 && <Card><div className="font-semibold mb-2">Recent inspections</div>{insp.slice(0, 5).map(i => <div key={i.id} className="text-sm py-1 flex gap-2" data-testid="insp-recent"><span className="flex-1">{db.equipment.find(e => e.id === i.unitId)?.unit} · {i.kind} · {i.by}</span>{i.items.some(x => x.woId) ? <Badge tone="bad">{i.items.filter(x => x.woId).map(x => x.woId).join(', ')}</Badge> : <Badge tone="ok">Pass</Badge>}</div>)}</Card>}
      </div>
    </div>
  </div>
}
