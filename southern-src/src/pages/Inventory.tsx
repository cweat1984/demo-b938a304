import { useMemo, useRef, useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { Search, Upload, Download, ArrowUpRight, ArrowDownLeft, ScanLine, Plus, QrCode, MonitorSmartphone, Truck, ClipboardCheck, Printer, X, ShieldAlert, FileText, Camera } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName } from '../data/logic'
import { cn, fmtDate, fmtTs, today, addDays, downloadCsv, parseCsv, money, ctStamp } from '../lib/util'
import { PageHeader, Segmented, Button, Modal, Field, Toggle } from '../components/ui'
import { Ref, EmpRef } from '../components/bits'
import { lowStock } from '../data/invcore'
import { INV_CATS, CAT_ICON, isOpen, openQty, isLow, targetLabel, targetRef, targetUnit, rollup, isSwag, shrinkMoves, resolveScan, qrFor, sdsExpired, itemOf, poIsOpen, shelfOf, ADJ_REASONS, slowMovers, valueByLocation } from '../data/invcore'
import { Tip, deepLink } from '../components/inv/Purchasing'
import { QR, Thumb, Scanner, CheckoutFlow, CheckinFlow, Pill } from '../components/inv/kit'
import { useCompany } from '../data/brand'

type Tab = 'stock' | 'out' | 'ledger' | 'count' | 'reports'
type Flow = { kind: 'out' | 'in'; itemId?: string; checkoutId?: string; jobId?: string; whoId?: string } | null

/** Office fixes: the stockroom follows the branch filter (falls back to OKC on "All branches"). */
function useInvBranch(): string { const b = useStore(s => s.ui.filter.branchId); return b && b !== 'all' ? b : 'br-okc' }
export default function Inventory() {
  const db = useStore(s => s.db)
  const brId = useInvBranch(); const brCode = db.branches.find(b => b.id === brId)?.code.replace(/^SLH-/, '') ?? 'OKC'
  const open = useStore(s => s.open)
  const go = useStore(s => s.go)
  const [tab, setTab] = useState<Tab>(() => { const t = (deepLink.inv as Tab) ?? 'stock'; deepLink.inv = undefined; return t })
  const [cat, setCat] = useKeep<T.InvCategory | 'all' | 'low'>('inventory:cat', 'all')
  const [q, setQ] = useKeep('inventory:q', '')
  const [flow, setFlow] = useState<Flow>(null)
  const [scan, setScan] = useState(false)
  const [bin, setBin] = useState<string | null>(null)
  const [add, setAdd] = useState(false)
  const [labels, setLabels] = useState(false)
  const [kiosk, setKiosk] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const okc = db.items.filter(i => (i.branchId ?? 'br-okc') === brId)
  const items = useMemo(() => okc.filter(i => (cat === 'all' || (cat === 'low' ? isLow(i) && !i.oos : i.category === cat)) && (!q || `${i.name} ${i.sku} ${i.manufacturer} ${i.bin} ${i.sub ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [okc, cat, q])
  const out = db.checkouts.filter(c => isOpen(c))
  const outRet = out.filter(c => c.returnable)
  const overdue = outRet.filter(c => c.due < today())
  const ls = lowStock(db, brId); const low = ls.low
  const inspDue = okc.filter(i => i.inspectionDue && i.inspectionDue <= addDays(today(), 14))
  const shrink30 = shrinkMoves(db).filter(m => m.at >= addDays(today(), -30)).reduce((s, m) => s + -m.qty * m.unitCost, 0)
  const onScan = (code: string) => {
    setScan(false); const h = resolveScan(db, code)
    if (h.kind === 'item') { open({ type: 'item', id: h.item.id }); return }
    if (h.kind === 'bin') { setBin(h.code); return }
    if (h.kind === 'unit') { open({ type: 'equipment', id: h.unit.id }); return }
    if (h.kind === 'emp') { open({ type: 'employee', id: h.emp.id }); return }
    if (h.kind === 'job') { open({ type: 'job', id: h.job.id }); return }
    if (h.kind === 'wo') { open({ type: 'workorder', id: h.wo.id }); return }
    toast.error(`Nothing matches “${code}”`)
  }
  const importCsv = async (file: File) => {
    const rows = parseCsv(await file.text()); const [h, ...body] = rows; const idx = (k: string) => h.findIndex(x => x.trim().toLowerCase() === k)
    if (['sku', 'name', 'category', 'onhand'].some(k => idx(k) < 0)) { toast.error('CSV needs columns: sku, name, category, onHand'); return }
    const parsed = body.map(r => ({ sku: r[idx('sku')], name: r[idx('name')], category: (INV_CATS.find(c => c.toLowerCase() === r[idx('category')]?.toLowerCase()) ?? 'Parts') as T.InvCategory, onHand: Number(r[idx('onhand')]) || 0, min: Number(r[idx('min')]) || 0, unit: r[idx('unit')] || 'ea', bin: r[idx('bin')] || `${brCode}-RCV`, branchId: (r[idx('branch')] && db.branches.find(b => b.code.toLowerCase() === r[idx('branch')].trim().toLowerCase())?.id) || brId, manufacturer: r[idx('manufacturer')] || '—', cost: Number(r[idx('cost')]) || 0, serialized: false })).filter(r => r.sku && r.name)
    const res = actions.importItems(parsed); toast.success(`${res.added} items imported`, { description: res.skipped ? `${res.skipped} duplicate SKUs skipped` : 'No duplicates' })
  }
  return (
    <div className="max-w-[1400px] mx-auto" data-testid="inventory">
      <PageHeader eyebrow="Inventory · everything is checked out" title="Inventory" sub={`${okc.length} items at ${brCode} · ${money(okc.reduce((s, i) => s + i.onHand * i.cost, 0))} on the shelves`} actions={<>
        <Button icon={<Plus className="size-4" />} onClick={() => setAdd(true)} data-testid="add-item">New item</Button>
        <Button icon={<QrCode className="size-4" />} onClick={() => setLabels(true)} data-testid="labels">Labels</Button>
        <Button icon={<MonitorSmartphone className="size-4" />} onClick={() => setKiosk(true)} data-testid="kiosk">Kiosk</Button>
      </>} />
      {/* the main focus: three huge actions */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <BigAction icon={<ScanLine className="size-7" />} label="Scan" sub="Item · bin · unit · badge" onClick={() => setScan(true)} testid="inv-scan" />
        <BigAction icon={<ArrowUpRight className="size-7" />} label="Check out" sub="Who · what · used on · why" onClick={() => setFlow({ kind: 'out' })} testid="inv-checkout" primary />
        <BigAction icon={<ArrowDownLeft className="size-7" />} label="Check in" sub="Returns credit the job" onClick={() => setFlow({ kind: 'in' })} testid="inv-checkin" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <Kpi testid="kpi-low" label={ls.label} value={low.length} sub={`${ls.toReorder.length} to reorder · rest on order`} tone={low.length ? 'warn' : undefined} onClick={() => { setTab('stock'); setCat('low') }} />
        <Kpi label="Out now" value={outRet.length} sub="returnables" onClick={() => setTab('out')} />
        <Kpi label="Overdue" value={overdue.length} tone={overdue.length ? 'bad' : undefined} onClick={() => setTab('out')} testid="kpi-overdue" />
        <Kpi label="Inspections due" value={inspDue.length} tone={inspDue.length ? 'warn' : undefined} sub="rigging · 14 days" onClick={() => setTab('reports')} />
        <Kpi label="Shrink · 30 days" value={money(shrink30)} tone={shrink30 > 0 ? 'bad' : undefined} onClick={() => setTab('reports')} />
        <Kpi label="Open POs" value={db.pos.filter(poIsOpen).length} sub="Purchasing" onClick={() => { deepLink.purch = 'pos'; go('purchasing') }} />
      </div>
      <Tip id="inv-stock" className="mb-4">Every row is one item in one bin. Red numbers are at or below <b>min</b> — they show up in Purchasing → Reorder. Tap any row for photo, location, who has it and full history.</Tip>
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'stock', label: 'Stock' }, { value: 'out', label: 'Who has what', count: outRet.length }, { value: 'ledger', label: 'Ledger' }, { value: 'count', label: 'Cycle count', count: (db.cycleCounts ?? []).filter(c => c.status === 'Due').length || undefined }, { value: 'reports', label: 'Reports' }]} />
      {tab === 'stock' && <>
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <div className="relative w-full sm:w-72"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Search name, SKU, bin" value={q} onChange={e => setQ(e.target.value)} data-testid="stock-search" /></div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar max-w-full">{(['all', 'low', ...INV_CATS] as const).map(c => <button key={c} onClick={() => setCat(c)} className={cn('shrink-0 rounded-full px-3 h-8 pointer-coarse:h-[44px] pointer-coarse:px-3.5 text-xs font-semibold transition', cat === c ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')}>{c === 'all' ? 'All' : c === 'low' ? `Low (${low.length})` : `${CAT_ICON[c]} ${c}`}</button>)}</div>
          <div className="flex-1" />
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importCsv(f); e.target.value = '' }} />
          <Button size="sm" variant="ghost" icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>Import</Button>
          <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadCsv('inventory.csv', [['sku', 'name', 'category', 'onHand', 'min', 'unit', 'bin', 'manufacturer', 'cost', 'branch', 'value'], ...okc.map(i => [i.sku, i.name, i.category, i.onHand, i.min, i.unit, i.bin, i.manufacturer, i.cost, db.branches.find(b => b.id === (i.branchId ?? 'br-okc'))?.code ?? '', Math.round(i.onHand * i.cost * 100) / 100])])}>Export</Button>
        </div>
        <div className="card p-0 overflow-hidden">{items.map(i => <StockRow key={i.id} i={i} onOut={() => setFlow({ kind: 'out', itemId: i.id })} />)}{!items.length && <div className="p-6 text-sm text-muted">No items.</div>}</div>
      </>}
      {tab === 'out' && <WhoHasWhat onIn={id => setFlow({ kind: 'in', checkoutId: id })} />}
      {tab === 'ledger' && <Ledger />}
      {tab === 'count' && <CycleCount />}
      {tab === 'reports' && <Reports />}
      <CheckoutFlow open={flow?.kind === 'out'} onClose={() => setFlow(null)} itemId={flow?.itemId} whoId={flow?.whoId} />
      <CheckinFlow open={flow?.kind === 'in'} onClose={() => setFlow(null)} checkoutId={flow?.checkoutId} itemId={flow?.itemId} jobId={flow?.jobId} whoId={flow?.whoId} />
      <Scanner open={scan} onClose={() => setScan(false)} onCode={onScan} />
      <BinSheet code={bin} onClose={() => setBin(null)} onOut={id => { setBin(null); setFlow({ kind: 'out', itemId: id }) }} />
      <AddItem open={add} onClose={() => setAdd(false)} />
      <Labels open={labels} onClose={() => setLabels(false)} />
      {kiosk && <Kiosk onClose={() => setKiosk(false)} />}
    </div>
  )
}

function BigAction({ icon, label, sub, onClick, primary, testid }: { icon: React.ReactNode; label: string; sub: string; onClick: () => void; primary?: boolean; testid: string }) {
  return <button onClick={onClick} data-testid={testid} className={cn('rounded-3xl p-4 sm:p-6 text-left press flex flex-col gap-3 min-h-[118px] sm:min-h-[150px] transition', primary ? 'bg-accent text-accent-ink shadow-[0_12px_32px_-12px_var(--accent)]' : 'bg-surface border hairline hover:bg-surface-2')}>
    {icon}<span><span className="block display text-lg sm:text-2xl font-semibold leading-tight">{label}</span><span className={cn('hidden sm:block text-xs mt-1', primary ? 'opacity-75' : 'text-muted')}>{sub}</span></span>
  </button>
}
function Kpi({ label, value, sub, tone, onClick, testid }: { label: string; value: React.ReactNode; sub?: string; tone?: 'warn' | 'bad'; onClick: () => void; testid?: string }) {
  return <button onClick={onClick} data-testid={testid} className="card p-4 text-left press hover:bg-surface-2"><div className="label">{label}</div><div className={cn('display text-2xl font-semibold num mt-1', tone === 'bad' && 'text-bad', tone === 'warn' && 'text-warn')}>{value}</div>{sub && <div className="text-[11px] text-faint">{sub}</div>}</button>
}

function StockRow({ i, onOut }: { i: T.InventoryItem; onOut: () => void }) {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const outN = db.checkouts.filter(c => c.itemId === i.id && isOpen(c) && c.returnable).reduce((s, c) => s + openQty(c), 0)
  const sds = byId(db.sds, i.sdsId)
  return <div className="flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-2.5 border-b hairline last:border-0 hover:bg-surface-2 transition" data-testid="stock-row">
    <button onClick={() => open({ type: 'item', id: i.id })} className="flex items-center gap-3 flex-1 min-w-0 text-left"><Thumb item={i} size={46} /><span className="min-w-0"><span className="block font-semibold text-sm truncate">{i.name}</span><span className="block text-xs text-muted truncate">{i.sku} · {i.bin}{i.wll ? ` · WLL ${i.wll}` : ''}</span></span></button>
    <span className="hidden md:block w-20 text-sm text-right num text-muted">{money(i.cost)}</span>
    <span className="w-24 text-right"><span className={cn('font-semibold num', isLow(i) && 'text-bad')}>{i.onHand}</span><span className="text-xs text-muted"> {i.unit}</span>{outN > 0 && <span className="block text-[11px] text-muted">{outN} out</span>}</span>
    <span className="w-32 hidden sm:flex justify-end gap-1">{i.oos ? <Pill tone="bad">Out of service</Pill> : isLow(i) ? <Pill tone="warn">Reorder</Pill> : i.chemical && (!sds || sdsExpired(sds)) ? <Pill tone="bad">{sds ? 'SDS expired' : 'SDS missing'}</Pill> : i.inspectionDue && i.inspectionDue < addDays(today(), 14) ? <Pill tone="warn">Inspect {fmtDate(i.inspectionDue)}</Pill> : <Pill tone="ok">OK</Pill>}</span>
    <Button size="sm" disabled={i.onHand <= 0 || !!i.oos} icon={<ArrowUpRight className="size-4" />} onClick={onOut} data-testid="row-checkout"><span className="hidden sm:inline">Check out</span></Button>
  </div>
}

function WhoHasWhat({ onIn }: { onIn: (id: string) => void }) {
  const db = useStore(s => s.db)
  const [by, setBy] = useState<'person' | 'unit' | 'job' | 'all'>('person')
  const out = db.checkouts.filter(c => isOpen(c) && (by === 'all' || c.returnable || by === 'job'))
  const groups = useMemo(() => {
    const m = new Map<string, { ref?: T.EntityRef; label: string; rows: T.Checkout[] }>()
    out.forEach(c => {
      let k = '', label = '', ref: T.EntityRef | undefined
      if (by === 'person') { k = c.employeeId || c.byName || '?'; label = c.byName ?? '—'; ref = c.employeeId ? { type: 'employee', id: c.employeeId } : undefined }
      else if (by === 'unit') { const u = targetUnit(db, c.target); if (!u) return; k = u; label = byId(db.equipment, u)?.unit ? `Unit ${byId(db.equipment, u)!.unit}` : u; ref = { type: 'equipment', id: u } }
      else if (by === 'job') { if (!c.jobId) return; k = c.jobId; label = targetLabel(db, c.target); ref = { type: 'job', id: c.jobId } }
      else { k = 'all'; label = 'Everything open' }
      const g = m.get(k) ?? { ref, label, rows: [] }; g.rows.push(c); m.set(k, g)
    })
    return [...m.values()].sort((a, b) => b.rows.length - a.rows.length)
  }, [out, by, db])
  return <div className="flex flex-col gap-4">
    <Segmented size="sm" value={by} onChange={setBy} options={[{ value: 'person', label: 'By person' }, { value: 'unit', label: 'By crane / truck' }, { value: 'job', label: 'By job' }, { value: 'all', label: 'All open (incl. consumables)' }]} />
    {groups.map(g => <div key={g.label} className="card p-0 overflow-hidden">
      <div className="px-5 py-3 border-b hairline flex items-center gap-3">{g.ref ? <Ref to={g.ref} className="font-semibold">{g.label}</Ref> : <span className="font-semibold">{g.label}</span>}<span className="text-xs text-muted">{g.rows.length} open</span></div>
      {g.rows.map(c => <OutRow key={c.id} c={c} onIn={() => onIn(c.id)} />)}
    </div>)}
    {!groups.length && <div className="card p-6 text-sm text-muted">Nothing out.</div>}
  </div>
}
export function OutRow({ c, onIn }: { c: T.Checkout; onIn: () => void }) {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const i = byId(db.items, c.itemId); if (!i) return null
  const tr = targetRef(c.target)
  return <div className="flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0" data-testid="out-row">
    <button onClick={() => open({ type: 'item', id: i.id })} className="flex items-center gap-3 flex-1 min-w-0 text-left"><Thumb item={i} size={38} /><span className="min-w-0"><span className="block font-semibold text-sm truncate">{openQty(c)} × {i.name}</span><span className="block text-xs text-muted truncate">{c.reason} · {c.byName} · {fmtDate(c.out)}</span></span></button>
    {tr && <Ref to={tr} className="hidden md:inline text-sm">{targetLabel(db, c.target)}</Ref>}
    <span className="w-28 text-xs text-right">{c.returnable ? (c.due < today() ? <span className="text-bad font-semibold">Overdue {fmtDate(c.due)}</span> : `Due ${fmtDate(c.due)}`) : <span className="text-muted">consumable</span>}</span>
    <Button size="sm" variant="ok" icon={<ArrowDownLeft className="size-4" />} onClick={onIn} data-testid="out-checkin">Check in</Button>
  </div>
}

function Ledger() {
  const db = useStore(s => s.db)
  const [kind, setKind] = useState<T.InvMoveKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(addDays(today(), -30))
  const rows = db.invLedger.filter(m => (kind === 'all' || m.kind === kind) && m.at.slice(0, 10) >= from && (!q || `${itemOf(db, m)?.name} ${itemOf(db, m)?.sku} ${m.byName} ${targetLabel(db, m.target)} ${m.reason}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 300)
  return <div className="flex flex-col gap-3">
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative w-full sm:w-80"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Person, item, crane, job #, reason" value={q} onChange={e => setQ(e.target.value)} data-testid="ledger-search" /></div>
      <select className="input w-auto" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{(['all', 'Check-out', 'Return', 'Receive', 'Adjust', 'Count', 'Transfer', 'Write-off'] as const).map(k => <option key={k} value={k}>{k === 'all' ? 'All movements' : k}</option>)}</select>
      <label className="text-sm text-muted flex items-center gap-2">Since <input type="date" className="input h-10 w-auto" value={from} onChange={e => setFrom(e.target.value)} /></label>
      <div className="flex-1" /><span className="text-xs text-muted">Immutable — corrections are new lines, never edits</span>
      <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadCsv('inventory-ledger.csv', [['at (CT)', 'kind', 'sku', 'item', 'qty', 'unitCost', 'who', 'usedOn', 'reason'], ...rows.map(m => [ctStamp(m.at), m.kind, itemOf(db, m)?.sku, itemOf(db, m)?.name, m.qty, m.unitCost, m.byName, targetLabel(db, m.target), m.reason])])}>CSV</Button>
    </div>
    <div className="card p-0 overflow-hidden">{rows.map(m => <LedgerRow key={m.id} m={m} />)}{!rows.length && <div className="p-6 text-sm text-muted">No movements.</div>}</div>
  </div>
}
export function LedgerRow({ m, hideItem }: { m: T.InvMove; hideItem?: boolean }) {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const i = itemOf(db, m); const tr = targetRef(m.target)
  const tone = m.kind === 'Check-out' ? 'text-accent' : m.kind === 'Return' || m.kind === 'Receive' ? 'text-ok' : m.qty < 0 ? 'text-bad' : 'text-muted'
  return <div className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm" data-testid="ledger-row">
    <span className={cn('w-20 shrink-0 text-xs font-bold uppercase tracking-wide', tone)}>{m.kind}</span>
    {!hideItem && i && <button onClick={() => open({ type: 'item', id: i.id })} className="flex-1 min-w-0 text-left truncate font-medium hover:underline">{i.name}</button>}
    <span className={cn('w-16 text-right num font-semibold', tone)}>{m.qty > 0 ? '+' : ''}{m.qty}</span>
    <span className={cn('min-w-0 truncate text-muted', hideItem ? 'flex-1' : 'hidden md:block w-56')}>{tr ? <Ref to={tr}>{targetLabel(db, m.target)}</Ref> : null}{tr && m.reason ? ' · ' : ''}{m.reason}</span>
    <span className="hidden sm:block w-32 truncate">{m.by ? <EmpRef id={m.by} /> : m.byName}</span>
    <span className="w-28 text-right text-xs text-muted">{fmtTs(m.at)}</span>
  </div>
}

function CycleCount() {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const brId = useInvBranch()
  const okc = db.items.filter(i => (i.branchId ?? 'br-okc') === brId)
  const shelves = useMemo(() => [...new Set(okc.map(shelfOf))].sort(), [okc])
  const tasks = db.cycleCounts ?? []
  const due = tasks.find(c => c.status === 'Due')
  const [countId, setCountId] = useState<string | undefined>(() => { const c = deepLink.countId; deepLink.countId = undefined; return c ?? due?.id })
  const task = tasks.find(c => c.id === countId && c.status === 'Due')
  const [shelf, setShelf] = useState(task?.shelf ?? due?.shelf ?? shelves[0] ?? '')
  const [cnt, setCnt] = useState<Record<string, string>>({})
  const [why, setWhy] = useState<Record<string, string>>({})
  const [note, setNote] = useState<Record<string, string>>({})
  const [hist, setHist] = useState<string | null>(null)
  const its = okc.filter(i => shelfOf(i) === shelf)
  const has = (i: T.InventoryItem) => cnt[i.id] !== undefined && cnt[i.id] !== ''
  const vari = its.filter(i => has(i) && Number(cnt[i.id]) !== i.onHand)
  const ready = its.length > 0 && its.every(has) && vari.every(i => (why[i.id] ?? '').trim())
  const label = its[0]?.loc ? `${its[0].loc.building} · ${its[0].loc.aisle} · ${its[0].loc.shelf}` : shelf
  const done = tasks.filter(c => c.status === 'Done')
  const post = () => { try { actions.invPostCount({ countId: task?.shelf === shelf ? task.id : undefined, shelf, label, lines: its.map(i => ({ itemId: i.id, counted: Number(cnt[i.id]), reason: why[i.id], note: note[i.id] })) }); toast.success(`Shelf ${shelf} counted`, { description: vari.length ? `${vari.length} variance${vari.length === 1 ? '' : 's'} posted to the ledger and audit log` : 'Everything matched' }); setCnt({}); setWhy({}); setNote({}); const nx = (useStore.getState().db.cycleCounts ?? []).find(c => c.status === 'Due'); setCountId(nx?.id); if (nx) setShelf(nx.shelf) } catch (e) { toast.error((e as Error).message) } }
  const h = done.find(c => c.id === hist)
  return <div className="grid lg:grid-cols-[1fr_340px] gap-4">
    <div className="flex flex-col gap-4">
      <Tip id="cc-blind">This is a <b>blind count</b>: count what’s physically in each bin and type it in. The expected number only appears after you enter yours. If it’s off, pick why — that reason is how you find the leak.</Tip>
      {due && <div className="card p-4 flex items-center gap-3" data-testid="cc-task"><ClipboardCheck className="size-5 text-accent" /><span className="flex-1 min-w-0 text-sm"><b>This week:</b> {due.label} · <span className="font-mono">{due.shelf}</span> · due {fmtDate(due.due)}</span>{shelf !== due.shelf && <Button size="sm" onClick={() => { setShelf(due.shelf); setCountId(due.id); setCnt({}); setWhy({}) }}>Count it</Button>}</div>}
      <div className="flex flex-wrap items-center gap-3"><span className="text-sm text-muted">Shelf:</span><select className="input w-auto font-mono" value={shelf} onChange={e => { setShelf(e.target.value); setCnt({}); setWhy({}) }} data-testid="count-bin">{shelves.map(b => <option key={b}>{b}</option>)}</select><span className="text-sm text-muted">{label} · {its.length} items</span></div>
      <div className="card p-0 overflow-hidden">{its.map(i => { const v = cnt[i.id]; const off = has(i) && Number(v) !== i.onHand; return <div key={i.id} className="px-5 py-3 border-b hairline last:border-0 flex flex-wrap items-center gap-3" data-testid="count-row">
        <button onClick={() => open({ type: 'item', id: i.id })} className="flex items-center gap-3 flex-1 min-w-[200px] text-left"><Thumb item={i} size={40} /><span><span className="block text-sm font-semibold">{i.name}</span><span className="text-xs text-muted font-mono">{i.bin}</span>{i.countedAt && <span className="text-xs text-muted"> · last counted {fmtDate(i.countedAt)}</span>}</span></button>
        <input type="number" inputMode="decimal" className="input h-11 w-24 text-right text-lg" placeholder="Count" value={v ?? ''} onChange={e => setCnt({ ...cnt, [i.id]: e.target.value })} data-testid="count-input" />
        {has(i) && <span className={cn('w-28 text-sm', off ? 'text-bad font-semibold' : 'text-ok')}>{off ? `${Number(v) - i.onHand > 0 ? '+' : ''}${Number(v) - i.onHand} vs ${i.onHand}` : '✓ Matches'}</span>}
        {off && <div className="w-full flex flex-wrap gap-2"><select className="input h-10 flex-1 min-w-[220px]" value={why[i.id] ?? ''} onChange={e => setWhy({ ...why, [i.id]: e.target.value })} data-testid="count-reason"><option value="">Why is it off? (required)</option>{ADJ_REASONS.map(r => <option key={r}>{r}</option>)}</select><input className="input h-10 flex-1 min-w-[180px]" placeholder="Note (optional)" value={note[i.id] ?? ''} onChange={e => setNote({ ...note, [i.id]: e.target.value })} /><span className="text-xs text-muted self-center">{money(Math.abs(Number(v) - i.onHand) * i.cost)} {Number(v) < i.onHand ? 'missing' : 'found'}</span></div>}
      </div> })}</div>
      <div className="flex items-center gap-3"><Button variant="primary" size="lg" disabled={!ready} icon={<ClipboardCheck className="size-5" />} data-testid="count-post" onClick={post}>Post count</Button>{vari.length > 0 && <span className="text-sm text-bad">{vari.length} variance{vari.length === 1 ? '' : 's'} · {money(vari.reduce((s2, i) => s2 + (Number(cnt[i.id]) - i.onHand) * i.cost, 0))}</span>}{!ready && !vari.length && <span className="text-sm text-muted">Enter a count for every item on the shelf</span>}</div>
    </div>
    <div className="card p-0 overflow-hidden self-start" data-testid="cc-history"><div className="px-5 py-3 border-b hairline font-semibold">Count history</div>{done.map(c => { const lines = c.lines ?? []; const off = lines.filter(l => l.counted !== l.expected); const $ = off.reduce((s2, l) => s2 + (l.counted - l.expected) * l.unitCost, 0); return <button key={c.id} onClick={() => setHist(c.id)} className="w-full text-left px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2"><div className="text-sm font-semibold">{c.label}</div><div className="text-xs text-muted">{c.countedAt ? fmtTs(c.countedAt) : ''} · {c.countedBy} · {lines.length} items · <span className={off.length ? 'text-bad' : 'text-ok'}>{off.length ? `${off.length} off · ${money($)}` : 'all matched'}</span></div></button> })}{!done.length && <div className="p-5 text-sm text-muted">No counts yet.</div>}</div>
    <Modal open={!!h} onClose={() => setHist(null)} title={h ? `Count · ${h.label}` : ''} sub={h ? `${h.countedBy} · ${h.countedAt ? fmtTs(h.countedAt) : ''}` : ''}>
      {h && <div className="flex flex-col">{(h.lines ?? []).map(l => { const it = byId(db.items, l.itemId); const d = l.counted - l.expected; return <div key={l.itemId} className="flex items-center gap-3 py-2 border-b hairline last:border-0 text-sm"><span className="flex-1 min-w-0"><span className="block truncate font-medium">{it?.name}</span>{l.reason && <span className="text-xs text-muted">{l.reason}{l.note ? ` — ${l.note}` : ''}</span>}</span><span className="num text-muted">{l.expected} → {l.counted}</span><span className={cn('w-12 text-right num font-semibold', d < 0 ? 'text-bad' : d > 0 ? 'text-ok' : 'text-faint')}>{d > 0 ? '+' : ''}{d}</span></div> })}</div>}
    </Modal>
  </div>
}

function Reports() {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const brId = useInvBranch()
  const since = addDays(today(), -30)
  const recent = (m: T.InvMove) => m.at.slice(0, 10) >= since
  const byJob = rollup(db, m => m.jobId, recent).slice(0, 8)
  const byUnit = rollup(db, m => targetUnit(db, m.target), recent).slice(0, 8)
  const swagRep = rollup(db, m => m.by || m.byName, m => recent(m) && isSwag(db, m))
  const swagCust = rollup(db, m => (m.target?.kind === 'customer' ? m.target.id : undefined), m => recent(m) && isSwag(db, m)).slice(0, 8)
  const shrink = shrinkMoves(db).filter(recent)
  const insp = db.items.filter(i => (i.branchId ?? 'br-okc') === brId && (i.inspectionDue || i.oos)).sort((a, b) => (a.oos ? '0' : a.inspectionDue!).localeCompare(b.oos ? '0' : b.inspectionDue!)).slice(0, 12)
  const overdue = db.checkouts.filter(c => isOpen(c) && c.returnable && c.due < today())
  const Box = ({ title, children, icon, testid }: { title: string; children: React.ReactNode; icon?: React.ReactNode; testid?: string }) => <div className="card p-0 overflow-hidden" data-testid={testid}><div className="px-5 py-3 border-b hairline font-semibold flex items-center gap-2">{icon}{title}<span className="text-xs text-muted font-normal ml-auto">last 30 days</span></div>{children}</div>
  const Line = ({ to, label, sub, value }: { to?: T.EntityRef; label: string; sub?: string; value: string }) => <div className="flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0 text-sm"><span className="flex-1 min-w-0 truncate">{to ? <Ref to={to} className="font-medium">{label}</Ref> : label}{sub && <span className="text-xs text-muted"> · {sub}</span>}</span><span className="num font-semibold">{value}</span></div>
  return <div className="grid md:grid-cols-2 gap-4">
    <WhoTookWhat />
    <Box title="Posted to jobs (net of returns)" icon={<FileText className="size-4" />}>{byJob.map(r => <Line key={r.key} to={{ type: 'job', id: r.key, tab: 'cost' }} label={targetLabel(db, { kind: 'job', id: r.key })} sub={`${r.lines.length} moves`} value={money(r.cost)} />)}</Box>
    <Box title="Parts & supplies by crane / truck" icon={<Truck className="size-4" />}>{byUnit.map(r => <Line key={r.key} to={{ type: 'equipment', id: r.key }} label={`Unit ${byId(db.equipment, r.key)?.unit ?? ''} · ${byId(db.equipment, r.key)?.category ?? ''}`} sub={`${r.lines.length} moves`} value={money(r.cost)} />)}</Box>
    <Box title="Swag by salesperson" testid="swag-by-rep">{swagRep.map(r => <Line key={r.key} to={byId(db.employees, r.key) ? { type: 'employee', id: r.key } : undefined} label={byId(db.employees, r.key) ? fullName(byId(db.employees, r.key)) : r.key} sub={`${r.qty} pcs`} value={money(r.cost)} />)}</Box>
    <Box title="Swag by customer">{swagCust.map(r => <Line key={r.key} to={{ type: 'customer', id: r.key }} label={byId(db.customers, r.key)?.name ?? r.key} sub={`${r.qty} pcs`} value={money(r.cost)} />)}</Box>
    <Box title="Unaccounted shrink" icon={<ShieldAlert className="size-4 text-bad" />}>{shrink.map(m => <Line key={m.id} label={itemOf(db, m)?.name ?? ''} sub={`${m.kind} · ${m.reason} · ${m.byName}`} value={money(-m.qty * m.unitCost)} />)}<div className="px-5 py-2.5 text-sm flex"><span className="flex-1 text-muted">Total</span><b className="num text-bad">{money(shrink.reduce((s, m) => s + -m.qty * m.unitCost, 0))}</b></div></Box>
    <div className="card p-0 overflow-hidden"><div className="px-5 py-3 border-b hairline font-semibold">Rigging inspections & out-of-service</div>{insp.map(i => <button key={i.id} onClick={() => open({ type: 'item', id: i.id })} className="w-full flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0 text-sm text-left hover:bg-surface-2"><Thumb item={i} size={32} /><span className="flex-1 min-w-0 truncate">{i.name}{i.serialNo ? <span className="text-xs text-muted"> · S/N {i.serialNo}</span> : null}</span>{i.oos ? <Pill tone="bad">Tagged out</Pill> : <Pill tone={i.inspectionDue! < today() ? 'bad' : i.inspectionDue! < addDays(today(), 14) ? 'warn' : undefined}>{i.inspectionDue! < today() ? 'Overdue' : 'Due'} {fmtDate(i.inspectionDue!)}</Pill>}</button>)}</div>
    <div className="card p-0 overflow-hidden" data-testid="value-by-loc"><div className="px-5 py-3 border-b hairline font-semibold flex items-center gap-2">Inventory value by location<span className="text-xs text-muted font-normal ml-auto">on the shelves now</span></div>{valueByLocation(db).map(r => <Line key={r.branchId + r.building} label={`${byId(db.branches, r.branchId)?.code ?? r.branchId} › ${r.building}`} sub={`${r.items} items`} value={money(r.value)} />)}<div className="px-5 py-2.5 text-sm flex"><span className="flex-1 text-muted">Total</span><b className="num">{money(db.items.reduce((s2, i) => s2 + i.onHand * i.cost, 0))}</b></div></div>
    <div className="card p-0 overflow-hidden" data-testid="slow-movers"><div className="px-5 py-3 border-b hairline font-semibold flex items-center gap-2">Slow-moving (no check-out in 21 days)<span className="text-xs text-muted font-normal ml-auto">cash on shelves</span></div>{slowMovers(db).slice(0, 10).map(r => <button key={r.item.id} onClick={() => open({ type: 'item', id: r.item.id })} className="w-full flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0 text-sm text-left hover:bg-surface-2"><span className="flex-1 min-w-0 truncate">{r.item.name}<span className="text-xs text-muted"> · {r.item.onHand} {r.item.unit} · {r.lastOut ? `last out ${fmtDate(r.lastOut.slice(0, 10))}` : 'no check-outs on record'}</span></span><span className="num font-semibold">{money(r.value)}</span></button>)}<div className="px-5 py-2.5 text-xs text-muted">Big dollars here? Lower the max, return to vendor, or transfer to a branch that uses it.</div></div>
    <div className="card p-0 overflow-hidden md:col-span-2"><div className="px-5 py-3 border-b hairline font-semibold">Overdue returnables</div>{overdue.map(c => <OutRow key={c.id} c={c} onIn={() => open({ type: 'item', id: c.itemId })} />)}{!overdue.length && <div className="p-5 text-sm text-muted">None.</div>}</div>
  </div>
}

function BinSheet({ code, onClose, onOut }: { code: string | null; onClose: () => void; onOut: (id: string) => void }) {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const its = code ? db.items.filter(i => i.bin === code) : []
  return <Modal open={!!code} onClose={onClose} title={`Bin ${code ?? ''}`} sub={its[0] ? `${its[0].loc?.building ?? ''} · ${its[0].loc?.aisle ?? ''} · ${its[0].loc?.shelf ?? ''}` : ''}>
    <div className="flex flex-col gap-2" data-testid="bin-sheet">{its.map(i => <div key={i.id} className="flex items-center gap-3"><button onClick={() => open({ type: 'item', id: i.id })} className="flex items-center gap-3 flex-1 min-w-0 text-left"><Thumb item={i} size={56} /><span className="min-w-0"><span className="block font-semibold truncate">{i.name}</span><span className="text-xs text-muted">{i.onHand} {i.unit} · {i.sku}</span></span></button><Button size="sm" onClick={() => onOut(i.id)} disabled={i.onHand <= 0 || !!i.oos}>Check out</Button></div>)}</div>
  </Modal>
}

// ---------- receive a NEW item: photo + location required; chemicals require an SDS PDF ----------
function AddItem({ open: isOpen_, onClose }: { open: boolean; onClose: () => void }) {
  const company = useCompany()
  const [f, setF] = useState({ name: '', category: 'Parts' as T.InvCategory, sku: '', onHand: 1, min: 1, unit: 'ea', cost: 0, manufacturer: '', vendorId: '', building: 'Parts Room', aisle: 'Aisle A', shelf: 'Shelf 1', bin: 'Bin 01', returnable: false, chemical: false })
  const [photo, setPhoto] = useState<string>()
  const [sds, setSds] = useState({ pdf: '', pdfName: '', product: '', signal: 'Warning' as T.Sds['signal'], pictograms: [] as string[], ppe: 'Nitrile gloves, Safety glasses', firstAid: '', revised: today(), storage: '' })
  const db = useStore(s => s.db)
  const brId = useInvBranch(); const brCode = db.branches.find(b => b.id === brId)?.code.replace(/^SLH-/, '') ?? 'OKC'
  const binCode = `${brCode}-${f.building.split(' ').map(w => w[0]).join('').toUpperCase()}-${f.aisle.slice(-1)}${f.shelf.slice(-1)}-B${f.bin.replace(/\D/g, '').padStart(2, '0')}`
  const read = (file: File | undefined, cb: (u: string, n: string) => void, max = 2_500_000) => { if (!file) return; if (file.size > max) { toast.error('File too large'); return } const r = new FileReader(); r.onload = () => cb(String(r.result), file.name); r.readAsDataURL(file) }
  const missing = [!f.name && 'name', !photo && 'photo', f.chemical && !sds.pdf && 'SDS PDF'].filter(Boolean) as string[]
  const save = () => {
    try {
      const sku = f.sku || `${company.shortName}-${f.category.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}-${2000 + db.items.length}`
      actions.invAddItem({ sku, name: f.name, category: f.category, onHand: f.onHand, min: f.min, unit: f.unit, cost: f.cost, manufacturer: f.manufacturer || '—', vendorId: f.vendorId || undefined, bin: binCode, loc: { building: f.building, aisle: f.aisle, shelf: f.shelf, bin: f.bin }, branchId: brId, serialized: false, returnable: f.returnable, chemical: f.chemical, photo },
        f.chemical ? { product: sds.product || f.name, manufacturer: f.manufacturer || '—', use: f.category, signal: sds.signal, hazards: sds.pictograms.map(p => PICTO[p]), ppe: sds.ppe.split(',').map(s => s.trim()).filter(Boolean), firstAid: sds.firstAid || 'See attached SDS section 4.', revised: sds.revised, pictograms: sds.pictograms, storage: sds.storage || `${f.building} · ${f.aisle}`, pdf: sds.pdf, pdfName: sds.pdfName } : undefined)
      toast.success(`${f.name} added`, { description: `Bin ${binCode}` }); onClose(); setPhoto(undefined); setF({ ...f, name: '', sku: '' })
    } catch (e) { toast.error((e as Error).message) }
  }
  return <Modal open={isOpen_} onClose={onClose} title="Receive a new item" sub="Photo and storage location are required. Chemicals need their SDS." width={640}>
    <div className="flex flex-col gap-4" data-testid="add-item-form">
      <div className="flex gap-4 items-start">
        <label className={cn('size-28 shrink-0 rounded-2xl grid place-items-center cursor-pointer overflow-hidden border-2 border-dashed', photo ? 'border-transparent' : 'border-hairline bg-surface-2')}>{photo ? <img src={photo} className="w-full h-full object-cover" alt="" /> : <span className="text-center text-xs text-muted px-2"><Camera className="size-6 mx-auto mb-1" />Take or upload photo</span>}<input type="file" accept="image/*" capture="environment" className="hidden" data-testid="add-photo" onChange={e => read(e.target.files?.[0], u => setPhoto(u))} /></label>
        <div className="flex-1 grid gap-3">
          <Field label="Name"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} data-testid="add-name" /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Category"><select className="input" value={f.category} onChange={e => { const c = e.target.value as T.InvCategory; setF({ ...f, category: c, chemical: c === 'Fluids & Oils' ? true : f.chemical, returnable: c === 'Tools' || c === 'Rigging' }) }}>{INV_CATS.map(c => <option key={c}>{c}</option>)}</select></Field><Field label="SKU / part #"><input className="input" placeholder="auto" value={f.sku} onChange={e => setF({ ...f, sku: e.target.value })} /></Field></div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Qty received"><input type="number" className="input" value={f.onHand} onChange={e => setF({ ...f, onHand: Number(e.target.value) })} /></Field>
        <Field label="Reorder at"><input type="number" className="input" value={f.min} onChange={e => setF({ ...f, min: Number(e.target.value) })} /></Field>
        <Field label="Unit"><input className="input" value={f.unit} onChange={e => setF({ ...f, unit: e.target.value })} /></Field>
        <Field label="Unit cost"><input type="number" className="input" value={f.cost} onChange={e => setF({ ...f, cost: Number(e.target.value) })} /></Field>
        <Field label="Manufacturer"><input className="input" value={f.manufacturer} onChange={e => setF({ ...f, manufacturer: e.target.value })} data-testid="add-mfr" /></Field>
        <Field label="Vendor"><select className="input" value={f.vendorId} onChange={e => setF({ ...f, vendorId: e.target.value })}><option value="">—</option>{db.vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
      </div>
      <div className="card-flat p-3"><div className="label mb-2">Storage location</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <select className="input" value={f.building} onChange={e => setF({ ...f, building: e.target.value })}>{['Parts Room', 'Tool Crib', 'Rigging Loft', 'Lube Bay', 'Office', 'Yard'].map(b => <option key={b}>{b}</option>)}</select>
          <input className="input" value={f.aisle} onChange={e => setF({ ...f, aisle: e.target.value })} aria-label="Aisle / rack" />
          <input className="input" value={f.shelf} onChange={e => setF({ ...f, shelf: e.target.value })} aria-label="Shelf" />
          <input className="input" value={f.bin} onChange={e => setF({ ...f, bin: e.target.value })} aria-label="Bin" data-testid="add-bin" />
        </div>
        <div className="text-xs text-muted mt-2">Oklahoma City › {f.building} › {f.aisle} › {f.shelf} › {f.bin} · bin label <span className="font-mono text-ink">{binCode}</span></div>
      </div>
      <div className="flex flex-wrap gap-6"><Toggle checked={f.returnable} onChange={v => setF({ ...f, returnable: v })} label="Returnable (tool / rigging / radio)" /><span data-testid="add-chemical"><Toggle checked={f.chemical} onChange={v => setF({ ...f, chemical: v })} label="Hazardous chemical (SDS required)" /></span></div>
      {f.chemical && <div className="card-flat p-3 flex flex-col gap-3 border border-warn/40" data-testid="sds-section">
        <div className="flex items-center gap-3"><FileText className="size-5 text-warn" /><span className="font-semibold flex-1">Safety Data Sheet</span>
          <label className="btn inline-flex items-center h-10 px-4 rounded-xl bg-surface-2 font-semibold text-sm cursor-pointer">{sds.pdf ? 'Replace PDF' : 'Upload SDS PDF'}<input type="file" accept="application/pdf" className="hidden" data-testid="add-sds" onChange={e => read(e.target.files?.[0], (u, n) => setSds({ ...sds, pdf: u, pdfName: n }), 6_000_000)} /></label></div>
        {sds.pdf ? <div className="text-xs text-ok">✓ {sds.pdfName}</div> : <div className="text-xs text-bad">Required — can’t save a chemical without its SDS.</div>}
        <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="Product name (as on SDS)" value={sds.product} onChange={e => setSds({ ...sds, product: e.target.value })} /><select className="input" value={sds.signal} onChange={e => setSds({ ...sds, signal: e.target.value as T.Sds['signal'] })}><option>Danger</option><option>Warning</option><option value="None">No signal word</option></select></div>
        <div className="flex flex-wrap gap-2">{Object.keys(PICTO).map(p => <button key={p} type="button" onClick={() => setSds({ ...sds, pictograms: sds.pictograms.includes(p) ? sds.pictograms.filter(x => x !== p) : [...sds.pictograms, p] })} className={cn('px-3 h-8 rounded-full text-xs font-semibold', sds.pictograms.includes(p) ? 'bg-bad-solid text-white' : 'bg-surface-2')}>{GHS[p]} {p}</button>)}</div>
        <div className="grid grid-cols-2 gap-2"><input className="input" placeholder="PPE required (comma separated)" value={sds.ppe} onChange={e => setSds({ ...sds, ppe: e.target.value })} /><input type="date" className="input" value={sds.revised} onChange={e => setSds({ ...sds, revised: e.target.value })} aria-label="SDS revision date" /></div>
      </div>}
      <Button variant="primary" size="lg" disabled={missing.length > 0} onClick={save} data-testid="add-save">{missing.length ? `Needs ${missing.join(', ')}` : 'Save & receive'}</Button>
    </div>
  </Modal>
}
export const PICTO: Record<string, string> = { flame: 'Flammable', exclamation: 'Irritant / harmful', health: 'Health hazard', corrosion: 'Corrosive', environment: 'Aquatic toxicity', gas: 'Gas under pressure', skull: 'Acute toxicity', oxidizer: 'Oxidizer', explosive: 'Explosive' }
export const GHS: Record<string, string> = { flame: '🔥', exclamation: '❗', health: '🫁', corrosion: '🧪', environment: '🐟', gas: '🫙', skull: '☠️', oxidizer: '⭕', explosive: '💥' }

// ---------- printable QR label sheets ----------
function Labels({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [kind, setKind] = useState<'items' | 'bins' | 'units' | 'badges'>('items')
  const brId = useInvBranch()
  const okcItems = db.items.filter(i => (i.branchId ?? 'br-okc') === brId)
  const cells: { code: string; title: string; sub: string }[] =
    kind === 'items' ? okcItems.map(i => ({ code: qrFor.item(i), title: i.name, sub: `${i.sku} · ${i.bin}` }))
      : kind === 'bins' ? [...new Set(okcItems.map(i => i.bin))].sort().map(b => { const its = okcItems.filter(i => i.bin === b); return { code: qrFor.bin(b), title: b, sub: its.map(i => i.name).slice(0, 2).join(', ') + (its.length > 2 ? ` +${its.length - 2}` : '') } })
        : kind === 'units' ? db.equipment.filter(e => e.branchId === brId).map(e => ({ code: qrFor.unit(e), title: `${e.category} ${e.unit}`, sub: `${e.make} ${e.model}` }))
          : db.employees.filter(e => e.branchId === brId && e.status === 'Active').map(e => ({ code: qrFor.emp(e), title: fullName(e), sub: `${e.craft} · ${e.empNo}` }))
  return <Modal open={open} onClose={onClose} title="QR labels" sub="Print on 2×1 or Avery 5160 stock. Scanning opens the item, bin, unit or badge." width={980}>
    <div className="flex items-center gap-3 mb-4"><Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'items', label: 'Items' }, { value: 'bins', label: 'Bins / shelves' }, { value: 'units', label: 'Cranes & trucks' }, { value: 'badges', label: 'Employee badges' }]} /><div className="flex-1" /><Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button></div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto" data-print data-testid="label-sheet">{cells.slice(0, 120).map(c => <div key={c.code} className="flex items-center gap-2 rounded-xl border hairline p-2 bg-white text-black"><QR value={c.code} size={64} /><div className="min-w-0"><div className="text-[11px] font-bold leading-tight line-clamp-2">{c.title}</div><div className="text-[10px] text-black/60 truncate">{c.sub}</div><div className="text-[9px] font-mono text-black/50 truncate">{c.code}</div></div></div>)}</div>
  </Modal>
}

// ---------- kiosk: shop counter, badge in then big buttons ----------
function Kiosk({ onClose }: { onClose: () => void }) {
  const db = useStore(s => s.db); const company = useCompany()
  const [who, setWho] = useState<string | null>(null)
  const [flow, setFlow] = useState<'out' | 'in' | null>(null)
  const [scan, setScan] = useState(false)
  const [q, setQ] = useState('')
  const people = db.employees.filter(e => e.branchId === 'br-okc' && e.status === 'Active' && (!q || fullName(e).toLowerCase().includes(q.toLowerCase()))).slice(0, 18)
  const me = byId(db.employees, who ?? undefined)
  return <div className="fixed inset-0 z-[75] bg-bg flex flex-col" data-testid="kiosk-mode">
    <div className="flex items-center gap-3 px-6 h-16 border-b hairline"><span className="display font-semibold text-lg">{company.shortName} Parts Counter</span><span className="text-sm text-muted">Kiosk</span><div className="flex-1" />{me && <Button variant="ghost" onClick={() => setWho(null)}>Not {me.first}? Switch</Button>}<Button variant="ghost" icon={<X className="size-4" />} onClick={onClose}>Exit kiosk</Button></div>
    {!me ? <div className="flex-1 overflow-y-auto p-6 max-w-4xl w-full mx-auto">
      <div className="display text-4xl font-semibold mb-2">Who’s grabbing parts?</div><div className="text-muted mb-6">Scan your badge or tap your name.</div>
      <div className="flex gap-3 mb-6"><Button variant="primary" size="xl" icon={<ScanLine className="size-6" />} onClick={() => setScan(true)} data-testid="kiosk-badge">Scan badge</Button><input className="input h-14 text-lg flex-1" placeholder="Search name" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">{people.map(e => <button key={e.id} onClick={() => setWho(e.id)} className="card p-4 text-left press hover:bg-surface-2"><div className="font-semibold">{fullName(e)}</div><div className="text-xs text-muted">{e.craft}</div></button>)}</div>
    </div> : <div className="flex-1 grid place-items-center p-6"><div className="w-full max-w-3xl">
      <div className="display text-4xl font-semibold mb-8 text-center">Hi {me.first}. What are you doing?</div>
      <div className="grid sm:grid-cols-2 gap-4"><button onClick={() => setFlow('out')} className="rounded-[32px] bg-accent text-accent-ink p-10 text-left press min-h-[220px]" data-testid="kiosk-out"><ArrowUpRight className="size-12" /><div className="display text-4xl font-semibold mt-6">Take something</div><div className="opacity-75 mt-1">Check out</div></button><button onClick={() => setFlow('in')} className="rounded-[32px] bg-surface border hairline p-10 text-left press min-h-[220px]"><ArrowDownLeft className="size-12" /><div className="display text-4xl font-semibold mt-6">Bring it back</div><div className="text-muted mt-1">Check in</div></button></div>
    </div></div>}
    <Scanner open={scan} onClose={() => setScan(false)} onCode={c => { setScan(false); const h = resolveScan(db, c); if (h.kind === 'emp') setWho(h.emp.id); else toast.error('Scan an employee badge') }} title="Scan your badge" />
    <CheckoutFlow open={flow === 'out'} onClose={() => { setFlow(null); setWho(null) }} whoId={who ?? undefined} />
    <CheckinFlow open={flow === 'in'} onClose={() => { setFlow(null); setWho(null) }} whoId={who ?? undefined} />
  </div>
}

/** Who took what and why — filter by person, job, crane / unit or reason. */
function WhoTookWhat() {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const [who, setWho] = useState(''); const [job, setJob] = useState(''); const [unit, setUnit] = useState(''); const [why, setWhy] = useState(''); const [days, setDays] = useState(30)
  const since = addDays(today(), -days)
  const outs = db.invLedger.filter(m => m.kind === 'Check-out' && m.at.slice(0, 10) >= since)
  const people = [...new Map(outs.map(m => [m.by || m.byName, m.byName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const jobs = [...new Set(outs.map(m => m.jobId).filter(Boolean) as string[])].map(id => byId(db.jobs, id)).filter(Boolean) as T.Job[]
  const units = [...new Set(outs.map(m => targetUnit(db, m.target)).filter(Boolean) as string[])].map(id => byId(db.equipment, id)).filter(Boolean) as T.Equipment[]
  const rows = outs.filter(m => (!who || (m.by || m.byName) === who) && (!job || m.jobId === job) && (!unit || targetUnit(db, m.target) === unit) && (!why || (m.reason ?? '').toLowerCase().includes(why.toLowerCase())))
  const total = rows.reduce((s2, m) => s2 + -m.qty * m.unitCost, 0)
  return <div className="card p-0 overflow-hidden md:col-span-2" data-testid="who-took-what">
    <div className="px-5 py-3 border-b hairline font-semibold flex items-center gap-2">Who took what, and why<span className="text-xs text-muted font-normal ml-auto">{rows.length} check-outs · {money(total)}</span></div>
    <div className="px-5 py-3 border-b hairline flex flex-wrap gap-2">
      <select className="input h-9 py-1 text-sm w-auto" value={who} onChange={e => setWho(e.target.value)} data-testid="wtw-person"><option value="">Everyone</option>{people.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
      <select className="input h-9 py-1 text-sm w-auto" value={job} onChange={e => setJob(e.target.value)} data-testid="wtw-job"><option value="">Any job</option>{jobs.map(j => <option key={j.id} value={j.id}>#{j.jobNo}</option>)}</select>
      <select className="input h-9 py-1 text-sm w-auto" value={unit} onChange={e => setUnit(e.target.value)} data-testid="wtw-unit"><option value="">Any crane / truck</option>{units.map(u => <option key={u.id} value={u.id}>{u.category} {u.unit}</option>)}</select>
      <input className="input h-9 text-sm w-48" placeholder="Reason contains…" value={why} onChange={e => setWhy(e.target.value)} data-testid="wtw-reason" />
      <select className="input h-9 py-1 text-sm w-auto" value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}</select>
      <Button size="sm" variant="ghost" icon={<Download className="size-4" />} onClick={() => downloadCsv('who-took-what.csv', [['at (CT)', 'who', 'item', 'qty', 'cost', 'usedOn', 'reason'], ...rows.map(m => [ctStamp(m.at), m.byName, itemOf(db, m)?.name, -m.qty, (-m.qty * m.unitCost).toFixed(2), targetLabel(db, m.target), m.reason])])}>CSV</Button>
    </div>
    <div className="max-h-[360px] overflow-y-auto">{rows.slice(0, 150).map(m => { const i = itemOf(db, m); const tr = targetRef(m.target); return <div key={m.id} className="flex items-center gap-3 px-5 py-2 border-b hairline last:border-0 text-sm" data-testid="wtw-row">
      <span className="w-32 shrink-0 truncate">{m.by ? <EmpRef id={m.by} /> : m.byName}</span>
      <button onClick={() => i && open({ type: 'item', id: i.id })} className="flex-1 min-w-0 text-left truncate hover:underline">{-m.qty} × {i?.name}</button>
      <span className="hidden md:block w-44 truncate">{tr ? <Ref to={tr}>{targetLabel(db, m.target)}</Ref> : '—'}</span>
      <span className="hidden lg:block w-56 truncate text-muted">{m.reason}</span>
      <span className="w-20 text-right num">{money(-m.qty * m.unitCost)}</span>
      <span className="hidden sm:block w-24 text-right text-xs text-muted">{fmtTs(m.at)}</span>
    </div> })}{!rows.length && <div className="p-5 text-sm text-muted">No check-outs match.</div>}</div>
  </div>
}
