// Purchasing: suggested reorder (grouped by vendor, one tap → PO), purchase orders by status, vendors, min/max per item per location.
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ShoppingCart, Plus, Search, PackageCheck, Send, Phone, Mail, Truck } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId } from '../data/logic'
import { cn, fmtDate, money, today, addDays } from '../lib/util'
import { PageHeader, Segmented, Button, Modal, Field, Badge } from '../components/ui'
import { Thumb } from '../components/inv/kit'
import { Tip, PoBadge, ReceiveModal, deepLink, ThreeWayBadge } from '../components/inv/Purchasing'
import { reorderByVendor, poTotal, poIsOpen, PO_FLOW, maxOf, onOrderQty, isLow, threeWay, INV_CATS, lowStock } from '../data/invcore'

type Tab = 'reorder' | 'pos' | 'vendors' | 'minmax'
export default function Purchasing() {
  const db = useStore(s => s.db)
  const [tab, setTab] = useState<Tab>(() => { const t = (deepLink.purch as Tab) ?? 'reorder'; deepLink.purch = undefined; return t })
  const brF = useStore(s => s.ui.filter.branchId); const inBr = (p: { branchId?: string }) => !brF || brF === 'all' || (p.branchId ?? 'br-okc') === brF
  const brCode = brF && brF !== 'all' ? db.branches.find(b => b.id === brF)?.code : 'all branches'
  const open = db.pos.filter(p => poIsOpen(p) && inBr(p))
  const groups = reorderByVendor(db, brF && brF !== 'all' ? brF : 'br-okc')
  const holds = db.bills.filter(b => b.status !== 'Paid' && b.status !== 'Rejected' && threeWay(db, b) && !threeWay(db, b)!.ok)
  return <div className="max-w-[1300px] mx-auto" data-testid="purchasing">
    <PageHeader eyebrow="Inventory · purchasing" title="Purchasing" sub={`${open.length} open POs at ${brCode} · ${money(open.reduce((s, p) => s + poTotal(p), 0))} on order`} />
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <Kpi label="To reorder" value={groups.reduce((s, g) => s + g.rows.length, 0)} sub={`of ${lowStock(db, brF && brF !== 'all' ? brF : 'br-okc').low.length} at or below min (rest on order) · ${groups.length} vendor${groups.length === 1 ? '' : 's'}`} tone="warn" onClick={() => setTab('reorder')} />
      <Kpi label="Drafts to send" value={db.pos.filter(p => p.status === 'Draft' && inBr(p)).length} onClick={() => setTab('pos')} />
      <Kpi label="To receive" value={db.pos.filter(p => (p.status === 'Sent' || p.status === 'Partially Received') && inBr(p)).length} onClick={() => setTab('pos')} />
      <Kpi label="Invoices on hold" value={holds.length} sub="3-way mismatch" tone={holds.length ? 'bad' : undefined} onClick={() => useStore.getState().go('payables')} />
    </div>
    <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'reorder', label: 'Reorder', count: groups.reduce((s, g) => s + g.rows.length, 0) || undefined }, { value: 'pos', label: 'Purchase orders', count: open.length }, { value: 'vendors', label: 'Vendors' }, { value: 'minmax', label: 'Min / max' }]} />
    {tab === 'reorder' && <Reorder />}
    {tab === 'pos' && <Pos />}
    {tab === 'vendors' && <Vendors />}
    {tab === 'minmax' && <MinMax />}
  </div>
}
function Kpi({ label, value, sub, tone, onClick }: { label: string; value: React.ReactNode; sub?: string; tone?: 'warn' | 'bad'; onClick: () => void }) {
  return <button onClick={onClick} className="card p-4 text-left press hover:bg-surface-2"><div className="label">{label}</div><div className={cn('display text-2xl font-semibold num mt-1', tone === 'bad' && value ? 'text-bad' : tone === 'warn' && value ? 'text-warn' : '')}>{value}</div>{sub && <div className="text-[11px] text-faint">{sub}</div>}</button>
}

function Reorder() {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const brF = useStore(s => s.ui.filter.branchId)
  const groups = reorderByVendor(db, brF && brF !== 'all' ? brF : 'br-okc')
  const [qty, setQty] = useState<Record<string, number>>({})
  const make = (g: (typeof groups)[number]) => { const ids = actions.invDraftPOs(g.rows.map(r => ({ itemId: r.item.id, qty: qty[r.item.id] ?? r.qty }))); toast.success(`Draft ${byId(db.pos, ids[0])?.poNo ?? 'PO'} created for ${byId(db.vendors, g.vendorId)?.name}`, { description: 'Review it, then Send', action: { label: 'Open', onClick: () => open({ type: 'po', id: ids[0] }) } }) }
  return <div className="flex flex-col gap-4">
    <Tip id="reorder-how">These items dropped to their <b>min</b> (reorder point) and nothing is on order. The suggested qty fills the shelf back up to <b>max</b>. One tap makes a draft PO per vendor — nothing is sent until you press Send.</Tip>
    {groups.length > 1 && <div className="flex justify-end"><Button variant="primary" icon={<ShoppingCart className="size-4" />} onClick={() => { const ids = actions.invDraftPOs(groups.flatMap(g => g.rows.map(r => ({ itemId: r.item.id, qty: qty[r.item.id] ?? r.qty })))); toast.success(`${ids.length} draft POs created`, { description: 'One per vendor' }) }} data-testid="draft-all">Create all {groups.length} POs</Button></div>}
    {groups.map(g => { const v = byId(db.vendors, g.vendorId); const total = g.rows.reduce((s, r) => s + (qty[r.item.id] ?? r.qty) * r.item.cost, 0); return <div key={g.vendorId} className="card p-0 overflow-hidden" data-testid="reorder-vendor">
      <div className="flex items-center gap-3 px-5 py-3 border-b hairline">
        <button onClick={() => open({ type: 'vendor', id: g.vendorId })} className="flex-1 min-w-0 text-left"><span className="block font-semibold">{v?.name}</span><span className="block text-xs text-muted">{v?.kind ?? v?.category} · lead time ~{v?.leadDays ?? 3} days · Net {v?.terms}</span></button>
        <span className="num font-semibold">{money(total)}</span>
        <Button variant="primary" size="sm" icon={<ShoppingCart className="size-4" />} onClick={() => make(g)} data-testid="create-po">Create PO</Button>
      </div>
      {g.rows.map(r => <div key={r.item.id} className="flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0">
        <button onClick={() => open({ type: 'item', id: r.item.id })} className="flex items-center gap-3 flex-1 min-w-0 text-left"><Thumb item={r.item} size={38} /><span className="min-w-0"><span className="block text-sm font-semibold truncate">{r.item.name}</span><span className="block text-xs text-muted"><b className="text-bad">{r.item.onHand}</b> on hand · min {r.item.min} · max {maxOf(r.item)} · {r.item.loc?.building ?? r.item.bin}</span></span></button>
        <input type="number" className="input h-9 w-20 text-right" value={qty[r.item.id] ?? r.qty} onChange={e => setQty({ ...qty, [r.item.id]: Math.max(0, Number(e.target.value)) })} aria-label="Order qty" />
        <span className="hidden sm:block w-20 text-right text-sm num">{money((qty[r.item.id] ?? r.qty) * r.item.cost)}</span>
      </div>)}
    </div> })}
    {!groups.length && <div className="card p-8 text-center text-sm text-muted">Everything is above its reorder point (or already on order). Nice.</div>}
  </div>
}

function Pos() {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const [st, setSt] = useState<T.PurchaseOrder['status'] | 'open' | 'all'>(() => (deepLink.poStatus as 'open') ?? 'open')
  const [recv, setRecv] = useState<T.PurchaseOrder | null>(null)
  const brF = useStore(s => s.ui.filter.branchId)
  const list = db.pos.filter(p => (!brF || brF === 'all' || (p.branchId ?? 'br-okc') === brF) && (st === 'all' || (st === 'open' ? poIsOpen(p) : p.status === st)))
  return <div className="flex flex-col gap-3">
    <Tip id="po-flow">A PO goes <b>Draft</b> (you’re building it) → <b>Sent</b> (vendor has it) → <b>Partially received</b> (some came) → <b>Received</b> (all here) → <b>Closed</b> (invoice matched and paid, or rest cancelled).</Tip>
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar">{(['open', ...PO_FLOW, 'all'] as const).map(s => <button key={s} onClick={() => setSt(s)} className={cn('shrink-0 rounded-full px-3 h-8 text-xs font-semibold', st === s ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')} data-testid={`po-filter-${s}`}>{s === 'open' ? 'Open' : s === 'all' ? 'All' : s} <span className="opacity-60">{s === 'all' ? db.pos.length : s === 'open' ? db.pos.filter(poIsOpen).length : db.pos.filter(p => p.status === s).length}</span></button>)}</div>
    <div className="card p-0 overflow-hidden">{list.map(p => { const bill = db.bills.find(b => b.poId === p.id || p.billIds?.includes(b.id)); const m = bill ? threeWay(db, bill) : null; return <div key={p.id} className="flex items-center gap-3 px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2" data-testid="po-row">
      <button onClick={() => open({ type: 'po', id: p.id })} className="flex-1 min-w-0 text-left"><span className="block text-sm font-semibold">{p.poNo} · {byId(db.vendors, p.vendorId)?.name}</span><span className="block text-xs text-muted truncate">{p.lines.length} lines · {money(poTotal(p))} · {fmtDate(p.created)}{p.expected && poIsOpen(p) && p.status !== 'Draft' ? ` · expected ${fmtDate(p.expected)}` : ''}{p.jobId ? ` · Job #${byId(db.jobs, p.jobId)?.jobNo}` : ''}</span></button>
      {m && <span className="hidden sm:inline"><ThreeWayBadge m={m} /></span>}
      <PoBadge s={p.status} />
      {p.status === 'Draft' && <Button size="sm" icon={<Send className="size-4" />} onClick={() => { actions.invSendPO(p.id); toast.success(`${p.poNo} sent`, { description: 'Demo — nothing is emailed' }) }} data-testid="po-send-row">Send</Button>}
      {(p.status === 'Sent' || p.status === 'Partially Received') && <Button size="sm" variant="primary" icon={<PackageCheck className="size-4" />} onClick={() => setRecv(p)} data-testid="po-receive-row">Receive</Button>}
    </div> })}{!list.length && <div className="p-6 text-sm text-muted">No POs here.</div>}</div>
    <ReceiveModal po={recv} onClose={() => setRecv(null)} />
  </div>
}

function Vendors() {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const [add, setAdd] = useState(false)
  const stockVendorIds = new Set([...db.items.map(i => i.vendorId), ...db.pos.map(p => p.vendorId)].filter(Boolean) as string[])
  const vs = db.vendors.filter(v => stockVendorIds.has(v.id))
  const since = addDays(today(), -90)
  return <div className="flex flex-col gap-3">
    <div className="flex items-center gap-3"><div className="text-sm text-muted flex-1">Who you buy stock from. Every item has a default vendor — that’s how reorders get grouped.</div><Button icon={<Plus className="size-4" />} onClick={() => setAdd(true)} data-testid="add-vendor">Add vendor</Button></div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{vs.map(v => { const pos = db.pos.filter(p => p.vendorId === v.id); const spend = pos.filter(p => p.created >= since).reduce((s, p) => s + poTotal(p), 0); const items = db.items.filter(i => i.vendorId === v.id && (i.branchId ?? 'br-okc') === 'br-okc'); return <button key={v.id} onClick={() => open({ type: 'vendor', id: v.id })} className="card p-5 text-left press hover:bg-surface-2" data-testid="vendor-card">
      <div className="flex items-start gap-3"><span className="size-10 rounded-xl bg-surface-2 grid place-items-center"><Truck className="size-5 text-muted" /></span><span className="flex-1 min-w-0"><span className="block font-semibold">{v.name}</span><span className="block text-xs text-muted">{v.kind ?? v.category}</span></span></div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center"><div><div className="num font-semibold">{items.length}</div><div className="text-[11px] text-muted">items</div></div><div><div className="num font-semibold">{pos.filter(poIsOpen).length}</div><div className="text-[11px] text-muted">open POs</div></div><div><div className="num font-semibold">{money(spend, true)}</div><div className="text-[11px] text-muted">90 days</div></div></div>
      <div className="mt-3 text-xs text-muted flex flex-wrap gap-x-3 gap-y-1">{v.contact && <span>{v.contact}</span>}<span className="inline-flex items-center gap-1"><Phone className="size-3" />{v.phone}</span>{v.email && <span className="inline-flex items-center gap-1"><Mail className="size-3" />{v.email}</span>}<span>Net {v.terms} · ~{v.leadDays ?? 3}d lead</span></div>
    </button> })}</div>
    <AddVendor open={add} onClose={() => setAdd(false)} />
  </div>
}
function AddVendor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState({ name: '', kind: '', contact: '', phone: '', email: '', terms: 30, leadDays: 3, account: '' })
  return <Modal open={open} onClose={onClose} title="Add vendor" sub="Who you buy from, how to reach them, and how long they take">
    <div className="grid grid-cols-2 gap-3">
      <Field label="Name" className="col-span-2"><input className="input" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} data-testid="vendor-name" /></Field>
      <Field label="What you buy there"><input className="input" placeholder="e.g. Hydraulic hose" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })} /></Field>
      <Field label="Contact"><input className="input" value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} /></Field>
      <Field label="Phone"><input className="input" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Email (where POs go)"><input className="input" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="Terms (Net days)"><input type="number" className="input" value={f.terms} onChange={e => setF({ ...f, terms: Number(e.target.value) })} /></Field>
      <Field label="Lead time (days)" hint="How long from PO to dock — drives your min"><input type="number" className="input" value={f.leadDays} onChange={e => setF({ ...f, leadDays: Number(e.target.value) })} /></Field>
      <Field label="Our account #" className="col-span-2"><input className="input" value={f.account} onChange={e => setF({ ...f, account: e.target.value })} /></Field>
      <Button variant="primary" size="lg" className="col-span-2" disabled={!f.name.trim()} onClick={() => { actions.addVendor({ name: f.name.trim(), category: 'Materials', kind: f.kind || undefined, contact: f.contact || undefined, phone: f.phone || '—', email: f.email || undefined, terms: f.terms, leadDays: f.leadDays, account: f.account || undefined }); toast.success(`${f.name} added`); onClose() }}>Save vendor</Button>
    </div>
  </Modal>
}

function MinMax() {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const brF0 = useStore(s => s.ui.filter.branchId); const [br, setBr] = useState(brF0 && brF0 !== 'all' ? brF0 : 'br-okc'); const [q, setQ] = useState(''); const [cat, setCat] = useState<string>('all')
  const [edit, setEdit] = useState<Record<string, { min: number; max: number }>>({})
  const rows = useMemo(() => db.items.filter(i => (i.branchId ?? 'br-okc') === br && (cat === 'all' || (cat === 'low' ? isLow(i) : i.category === cat)) && (!q || `${i.name} ${i.sku} ${i.bin}`.toLowerCase().includes(q.toLowerCase()))), [db.items, br, q, cat])
  const branches = db.branches.filter(b => db.items.some(i => (i.branchId ?? 'br-okc') === b.id))
  const save = (i: T.InventoryItem) => { const e = edit[i.id]; if (!e) return; if (e.max < e.min) { toast.error('Max must be at least min'); return } actions.invSetMinMax(i.id, e.min, e.max); const n = { ...edit }; delete n[i.id]; setEdit(n); toast.success(`${i.name}: min ${e.min} · max ${e.max}`) }
  return <div className="flex flex-col gap-3">
    <Tip id="minmax-what"><b>Min</b> = when the shelf gets this low, order. <b>Max</b> = order enough to get back up to this. Set min to what you use while waiting for the vendor (lead time) plus a cushion. Each location has its own min/max.</Tip>
    <div className="flex flex-wrap gap-2 items-center">
      <select className="input w-auto" value={br} onChange={e => setBr(e.target.value)} data-testid="mm-branch">{branches.map(b => <option key={b.id} value={b.id}>{b.name.replace(' (HQ)', '')}</option>)}</select>
      <div className="relative w-full sm:w-64"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} /></div>
      <select className="input w-auto" value={cat} onChange={e => setCat(e.target.value)}><option value="all">All categories</option><option value="low">Below min</option>{INV_CATS.map(c => <option key={c}>{c}</option>)}</select>
    </div>
    <div className="card p-0 overflow-hidden">
      <div className="hidden sm:flex items-center gap-3 px-5 py-2 border-b hairline text-[11px] font-semibold uppercase tracking-wide text-faint"><span className="flex-1">Item · location</span><span className="w-16 text-right">On hand</span><span className="w-16 text-right">On order</span><span className="w-20 text-center">Min</span><span className="w-20 text-center">Max</span><span className="w-16" /></div>
      {rows.map(i => { const e = edit[i.id] ?? { min: i.min, max: maxOf(i) }; const dirty = !!edit[i.id]; const oo = onOrderQty(db, i.id); return <div key={i.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-5 py-2 border-b hairline last:border-0" data-testid="mm-row">
        <button onClick={() => open({ type: 'item', id: i.id })} className="flex items-center gap-3 flex-1 min-w-[200px] text-left"><Thumb item={i} size={34} /><span className="min-w-0"><span className="block text-sm font-semibold truncate">{i.name}</span><span className="block text-xs text-muted truncate">{i.loc ? `${i.loc.building} · ${i.loc.aisle}` : ''} · <span className="font-mono">{i.bin}</span></span></span></button>
        <span className={cn('w-16 text-right num font-semibold', isLow(i) && 'text-bad')}>{i.onHand}</span>
        <span className="w-16 text-right num text-muted">{oo || '—'}</span>
        <input type="number" className="input h-9 w-20 text-center" value={e.min} onChange={x => setEdit({ ...edit, [i.id]: { ...e, min: Math.max(0, Number(x.target.value)) } })} aria-label="Min" data-testid="mm-min" />
        <input type="number" className="input h-9 w-20 text-center" value={e.max} onChange={x => setEdit({ ...edit, [i.id]: { ...e, max: Math.max(0, Number(x.target.value)) } })} aria-label="Max" data-testid="mm-max" />
        <span className="w-16 text-right">{dirty ? <Button size="sm" variant="primary" onClick={() => save(i)} data-testid="mm-save">Save</Button> : isLow(i) ? <Badge tone="warn">Low</Badge> : null}</span>
      </div> })}
    </div>
  </div>
}
