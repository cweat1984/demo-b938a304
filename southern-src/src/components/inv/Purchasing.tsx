// Purchasing + requests building blocks shared by Inventory Command, Purchasing, Parts Requests, Payables and the drawer.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { PackageCheck, Send, Lightbulb, X, ScanLine, Check, AlertTriangle, CheckCircle2, ShoppingCart, Minus, Plus, Trash2, ArrowUpRight, Ban } from 'lucide-react'
import type * as T from '../../data/types'
import { useStore, actions, measuredUnit } from '../../data/store'
import { byId, customerOf, fullName } from '../../data/logic'
import { cn, fmtDate, fmtTs, money, today, addDays } from '../../lib/util'
import { Badge, Button, Modal, Kv } from '../ui'
import { Ref, VendorRef, EmpRef } from '../bits'
import { Thumb, Scanner, ItemPicker, Pill } from './kit'
import { PO_FLOW, poTotal, threeWay, targetLabel, targetRef, resolveScan, onOrderQty } from '../../data/invcore'

// ---------- small dismissible tips ----------
const TIP_KEY = 'sc-inv-tips'
const readTips = (): string[] => { try { return JSON.parse(localStorage.getItem(TIP_KEY) || '[]') } catch { return [] } }
export const resetTips = () => { localStorage.removeItem(TIP_KEY); window.dispatchEvent(new Event('sc-tips')) }
export function Tip({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const [hidden, setHidden] = useState(() => readTips().includes(id))
  useEffect(() => { const h = () => setHidden(readTips().includes(id)); window.addEventListener('sc-tips', h); return () => window.removeEventListener('sc-tips', h) }, [id])
  if (hidden) return null
  return <div className={cn('flex items-start gap-2.5 rounded-2xl bg-info/10 border border-info/25 px-3.5 py-2.5 text-[13px] leading-snug', className)} data-testid="inv-tip">
    <Lightbulb className="size-4 text-info shrink-0 mt-0.5" /><div className="flex-1 min-w-0">{children}</div>
    <button aria-label="Dismiss tip" data-tip-dismiss className="grid place-items-center text-muted hover:text-ink -mr-1" onClick={() => { localStorage.setItem(TIP_KEY, JSON.stringify([...new Set([...readTips(), id])])); setHidden(true) }} data-testid="tip-dismiss"><X className="size-4" /></button>
  </div>
}

function RowRef({ to, className, children }: { to: T.EntityRef; className?: string; children: ReactNode }) {
  const open = useStore(s => s.open)
  return <button onClick={() => open(to)} data-ref={to.type} className={cn('text-left hover:bg-surface-2 transition', className)}>{children}</button>
}
// ---------- PO status ----------
export const poTone = (s: T.PurchaseOrder['status']) => s === 'Draft' ? 'neutral' : s === 'Sent' ? 'info' : s === 'Partially Received' ? 'warn' : s === 'Received' ? 'ok' : 'neutral'
export function PoBadge({ s }: { s: T.PurchaseOrder['status'] }) { return <Badge tone={poTone(s) as 'neutral'} dot>{s}</Badge> }
export function PoSteps({ s }: { s: T.PurchaseOrder['status'] }) {
  const at = PO_FLOW.indexOf(s)
  return <div className="flex items-center gap-1" data-testid="po-steps">{PO_FLOW.map((x, i) => <div key={x} className="flex-1 min-w-0"><div className={cn('h-1.5 rounded-full', i <= at ? 'bg-accent' : 'bg-surface-3')} /><div className={cn('mt-1 text-[10px] font-semibold truncate', i === at ? 'text-ink' : 'text-faint')}>{x === 'Partially Received' ? 'Partial' : x}</div></div>)}</div>
}

/** PO detail (drawer). */
export function PoView({ po }: { po: T.PurchaseOrder }) {
  const db = useStore(s => s.db)
  const [recv, setRecv] = useState(false)
  const v = byId(db.vendors, po.vendorId)
  const job = byId(db.jobs, po.jobId)
  const bills = db.bills.filter(b => b.poId === po.id || po.billIds?.includes(b.id))
  const draft = po.status === 'Draft'
  const setQty = (itemId: string, qty: number) => actions.invUpdatePO(po.id, { lines: po.lines.map(l => l.itemId === itemId ? { ...l, qty: Math.max(0, !Number.isFinite(qty) ? 0 : measuredUnit(byId(db.items, itemId)?.unit) ? qty : Math.floor(qty)) } /* dive3 shop M9 */ : l).filter(l => l.qty > 0) })
  const jobs = db.jobs.filter(j => j.branchId === 'br-okc' && ['Scheduled', 'In Progress'].includes(j.stage))
  return <div className="flex flex-col gap-4" data-testid="po-view">
    <div className="flex items-center gap-2 flex-wrap"><PoBadge s={po.status} />{job && <Badge tone="accent">For Job #{job.jobNo}</Badge>}</div>
    <PoSteps s={po.status} />
    <div className="grid grid-cols-2 gap-3">
      <div className="card-flat p-4"><div className="label">PO total</div><div className="display text-3xl font-semibold num">{money(poTotal(po))}</div></div>
      <div className="card-flat p-4"><div className="label">{po.status === 'Draft' ? 'Not sent yet' : po.expected && po.status !== 'Received' && po.status !== 'Closed' ? 'Expected' : 'Sent'}</div><div className="display text-2xl font-semibold">{po.status === 'Draft' ? '—' : fmtDate((po.status === 'Received' || po.status === 'Closed' ? po.sentAt : po.expected) ?? po.created)}</div></div>
    </div>
    <div className="card p-4"><Kv k="Vendor" v={<VendorRef id={po.vendorId} />} />{v?.kind && <Kv k="Buys" v={v.kind} />}{v?.contact && <Kv k="Contact" v={`${v.contact}${v.email ? ` · ${v.email}` : ''}`} />}{v?.account && <Kv k="Our account #" v={<span className="font-mono">{v.account}</span>} />}<Kv k="Created" v={`${fmtDate(po.created)} · ${po.by}`} />
      <Kv k="Job" v={draft ? <select className="input h-9 py-1 text-sm w-56" value={po.jobId ?? ''} onChange={e => actions.invUpdatePO(po.id, { jobId: e.target.value || undefined })} data-testid="po-job"><option value="">Shop stock (no job)</option>{jobs.map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {customerOf(db, j).name}</option>)}</select> : job ? <Ref to={{ type: 'job', id: job.id, tab: 'cost' }}>#{job.jobNo} · {customerOf(db, job).name}</Ref> : 'Shop stock'} />
      {po.note && <Kv k="Note" v={po.note} />}</div>
    {draft && <Tip id="po-job">Buying something for one job? Pick the job above. When it’s received, it’s checked straight out to that job so the cost lands on the job’s P&L.</Tip>}
    <div><div className="label mb-2">Lines</div><div className="card p-0">{po.lines.map(l => { const it = byId(db.items, l.itemId); if (!it) return null; return <div key={l.itemId} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm" data-testid="po-line">
      <Ref to={{ type: 'item', id: it.id }} className="flex items-center gap-3 flex-1 min-w-0"><Thumb item={it} size={36} /><span className="min-w-0"><span className="block font-semibold truncate">{it.name}</span><span className="block text-xs text-muted">{money(l.cost)} / {it.unit} · {it.onHand} on shelf</span></span></Ref>
      {draft ? <span className="flex items-center gap-1"><button className="size-8 rounded-full bg-surface-2 grid place-items-center" onClick={() => setQty(l.itemId, l.qty - 1)} aria-label="Less"><Minus className="size-3.5" /></button><input type="number" className="input h-8 w-16 text-right px-2" value={l.qty} onChange={e => setQty(l.itemId, Number(e.target.value))} /><button className="size-8 rounded-full bg-surface-2 grid place-items-center" onClick={() => setQty(l.itemId, l.qty + 1)} aria-label="More"><Plus className="size-3.5" /></button></span>
        : <span className="text-right text-xs w-28"><span className="block font-semibold text-sm num">{l.received}/{l.qty} in</span>{!!l.damaged && <span className="text-bad">{l.damaged} damaged</span>}</span>}
      <span className="w-20 text-right num font-semibold">{money(l.qty * l.cost)}</span>
    </div> })}</div></div>
    <div className="flex flex-wrap gap-2">
      {draft && <Button variant="primary" icon={<Send className="size-4" />} onClick={() => { actions.invSendPO(po.id); toast.success(`${po.poNo} sent to ${v?.name}`, { description: `Demo — nothing is emailed. Expected in ~${v?.leadDays ?? 3} days.` }) }} data-testid="po-send">Send to vendor</Button>}
      {(po.status === 'Sent' || po.status === 'Partially Received') && <Button variant="primary" icon={<PackageCheck className="size-4" />} onClick={() => setRecv(true)} data-testid="po-receive">Receive</Button>}
      {po.status === 'Received' && <Button icon={<Check className="size-4" />} onClick={() => { actions.invClosePO(po.id); toast.success(`${po.poNo} closed`) }} data-testid="po-close">Close PO</Button>}
      {po.status === 'Partially Received' && <Button variant="ghost" icon={<Ban className="size-4" />} onClick={() => { actions.invClosePO(po.id, 'rest back-ordered / cancelled'); toast(`${po.poNo} closed short`) }}>Close short</Button>}
    </div>
    {!!po.receipts?.length && <div><div className="label mb-2">Receipts</div><div className="card p-0">{po.receipts.map(r => <div key={r.id} className="px-4 py-2.5 border-b hairline last:border-0 text-sm"><div className="font-semibold">{fmtTs(r.at)} · {r.by}</div><div className="text-xs text-muted">{r.lines.map(x => `${x.qty} × ${byId(db.items, x.itemId)?.name ?? ''}${x.damaged ? ` (+${x.damaged} damaged)` : ''}`).join(' · ')}</div>{r.note && <div className="text-xs mt-0.5">{r.note}</div>}</div>)}</div></div>}
    {!!bills.length && <div><div className="label mb-2">Vendor invoices in Payables</div><div className="card p-0">{bills.map(b => { const m = threeWay(db, b); return <RowRef key={b.id} to={{ type: 'bill', id: b.id }} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm w-full"><span className="flex-1 min-w-0 text-left"><span className="block font-semibold">{b.billNo}</span><span className="text-xs text-muted">{b.status} · {fmtDate(b.date)}</span></span><ThreeWayBadge m={m} /><span className="num font-semibold">{money(b.lines.reduce((s, l) => s + l.amount, 0))}</span></RowRef> })}</div></div>}
    <ReceiveModal po={recv ? po : null} onClose={() => setRecv(false)} />
  </div>
}

/** Receive against a PO: scan or type good qty, damaged qty, note. */
export function ReceiveModal({ po, onClose }: { po: T.PurchaseOrder | null; onClose: () => void }) {
  const db = useStore(s => s.db)
  const p = po ? byId(db.pos, po.id) : undefined
  const [good, setGood] = useState<Record<string, number>>({})
  const [dmg, setDmg] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [scan, setScan] = useState(false)
  const [scanned, setScanned] = useState(false)
  useEffect(() => { if (po) { setGood({}); setDmg({}); setNote(''); setScanned(false) } }, [po?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!p) return <Modal open={false} onClose={onClose}>{null}</Modal>
  const open = p.lines.filter(l => l.received < l.qty)
  const rem = (l: T.PurchaseOrder['lines'][number]) => Math.max(0, l.qty - l.received)
  const g = (l: T.PurchaseOrder['lines'][number]) => good[l.itemId] ?? (scanned ? 0 : rem(l))
  const onCode = (code: string) => {
    setScan(false); const h = resolveScan(db, code)
    if (h.kind !== 'item') { toast.error('Scan the item’s QR or barcode'); return }
    const l = p.lines.find(x => x.itemId === h.item.id); if (!l) { toast.error(`${h.item.name} isn’t on ${p.poNo}`); return }
    const base = scanned ? good : Object.fromEntries(p.lines.map(x => [x.itemId, 0]))
    setScanned(true); setGood({ ...base, [l.itemId]: (base[l.itemId] ?? 0) + 1 }); toast.success(`+1 ${h.item.name}`)
  }
  const n = open.reduce((s, l) => s + g(l) + (dmg[l.itemId] ?? 0), 0)
  return <Modal open onClose={onClose} title={`Receive ${p.poNo}`} sub={`${byId(db.vendors, p.vendorId)?.name} · count what came off the truck`} width={620} z={85}>
    <div className="flex flex-col gap-3" data-testid="receive-modal">
      <Tip id="receive-count">Count the boxes in front of you — not the packing slip. Anything broken goes in “Damaged”: it isn’t stocked, and AP asks the vendor for credit.</Tip>
      <Button size="lg" icon={<ScanLine className="size-5" />} onClick={() => setScan(true)} data-testid="recv-scan">Scan each item (+1 per scan)</Button>
      {open.map(l => { const it = byId(db.items, l.itemId)!; return <div key={l.itemId} className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-2 p-3">
        <Thumb item={it} size={44} /><span className="flex-1 min-w-[160px] text-sm"><span className="block font-semibold">{it.name}</span><span className="text-xs text-muted">{l.received}/{l.qty} in · {rem(l)} to come · put away in <span className="font-mono">{it.bin}</span>{(l.jobId ?? p.jobId) ? ` · goes to Job #${byId(db.jobs, l.jobId ?? p.jobId)?.jobNo}` : ''}</span></span>
        <label className="text-[11px] text-muted flex flex-col">Good<input type="number" className="input h-10 w-20 text-right" data-testid="recv-qty" value={g(l)} onChange={e => setGood({ ...good, [l.itemId]: Math.max(0, Math.min(rem(l) - (dmg[l.itemId] ?? 0), Math.floor(Number(e.target.value) || 0))) })} /></label>
        <label className="text-[11px] text-muted flex flex-col">Damaged<input type="number" className="input h-10 w-20 text-right" data-testid="recv-damaged" value={dmg[l.itemId] ?? 0} onChange={e => { const d = Math.max(0, Math.min(rem(l), Math.floor(Number(e.target.value) || 0))); setDmg({ ...dmg, [l.itemId]: d }); if (g(l) + d > rem(l)) setGood({ ...good, [l.itemId]: rem(l) - d }) }} /></label>
      </div> })}
      <input className="input" placeholder="Note (optional) — e.g. box crushed, short 2" value={note} onChange={e => setNote(e.target.value)} />
      <Button variant="primary" size="lg" disabled={!n} data-testid="recv-confirm" icon={<PackageCheck className="size-5" />} onClick={() => { try { actions.invReceive(p.id, Object.fromEntries(open.map(l => [l.itemId, g(l)])), dmg, note || undefined); toast.success(`Received on ${p.poNo}`, { description: `Stock updated · vendor invoice sent to Payables for 3-way match${Object.values(dmg).some(Boolean) ? ' · damaged items not billed — vendor credit requested' : ''}` }); onClose() } catch (e) { toast.error((e as Error).message) } }}>Receive into stock</Button>
    </div>
    <Scanner open={scan} onClose={() => setScan(false)} onCode={onCode} title="Scan received item" hint="QR or barcode on the item" />
  </Modal>
}

// ---------- 3-way match ----------
type TW = ReturnType<typeof threeWay>
export function ThreeWayBadge({ m }: { m: TW }) { if (!m) return null; return m.ok ? <Pill tone="ok">3-way ✓</Pill> : <Pill tone="bad">3-way: hold</Pill> }
export function ThreeWayPanel({ bill }: { bill: T.VendorBill }) {
  const db = useStore(s => s.db)
  const m = threeWay(db, bill); if (!m) return null
  return <div className="card p-0 overflow-hidden" data-testid="three-way">
    <div className={cn('px-4 py-3 flex items-center gap-2 border-b hairline', m.ok ? 'bg-ok/10' : 'bg-bad/10')}>{m.ok ? <CheckCircle2 className="size-5 text-ok" /> : <AlertTriangle className="size-5 text-bad" />}<span className="font-semibold flex-1">{m.ok ? '3-way match — OK to pay' : `Hold — billed ${money(m.overBy)} for goods we didn’t receive in good shape`}</span><Ref to={{ type: 'po', id: m.po.id }} className="text-sm">{m.po.poNo}</Ref></div>
    <div className="grid grid-cols-3 text-center border-b hairline">{[['PO (ordered)', m.ordered], ['Receipt (good)', m.received], ['Invoice (billed)', m.billed]].map(([k, v]) => <div key={k as string} className="py-3 border-r hairline last:border-0"><div className="label">{k}</div><div className="num font-semibold">{money(v as number)}</div></div>)}</div>
    {m.lines.map(l => <div key={l.item?.id} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm"><span className="flex-1 min-w-0"><span className="block truncate font-medium">{l.item?.name}</span><span className="block text-xs text-muted num">ordered {l.ordered} · received {l.received}{l.damaged ? ` + ${l.damaged} damaged` : ''} · billed {l.billed}</span>{!l.ok && <span className="block text-xs text-bad font-semibold">{l.issues.join(' · ')}</span>}</span>{l.ok ? <CheckCircle2 className="size-5 text-ok shrink-0" /> : <AlertTriangle className="size-5 text-bad shrink-0" />}</div>)}
    {!m.ok && <div className="px-4 py-2.5 text-xs text-muted">Ask the vendor for a credit memo, or approve anyway if they’re shipping replacements. Stock purchases don’t need a job code — job items were already costed to the job when they were checked out.</div>}
  </div>
}

// ---------- parts requests ----------
export const reqTone = (s: T.PartsRequest['status']) => s === 'Waiting' ? 'warn' : s === 'Approved' ? 'info' : s === 'Checked out' ? 'ok' : 'bad'
export function RequestView({ r }: { r: T.PartsRequest }) {
  const db = useStore(s => s.db); const role = useStore(s => s.session!.role)
  const can = ['inventory', 'ops', 'owner', 'branch'].includes(role)
  const tr = targetRef(r.target)
  const short = r.lines.filter(l => (byId(db.items, l.itemId)?.onHand ?? 0) < l.qty)
  const fill = () => { try { actions.invFulfillRequest(r.id); toast.success(`${r.no} checked out to ${r.byName}`, { description: r.target ? `Used on ${targetLabel(db, r.target)}` : undefined }) } catch (e) { toast.error((e as Error).message) } }
  return <div className="flex flex-col gap-4" data-testid="request-view">
    <div className="flex items-center gap-2"><Badge tone={reqTone(r.status) as 'warn'} dot>{r.status}</Badge><Badge>{r.from}</Badge>{r.needBy <= today() && r.status !== 'Checked out' && r.status !== 'Denied' && <Badge tone="bad">Needed {r.needBy < today() ? fmtDate(r.needBy) : 'today'}</Badge>}</div>
    <div className="card p-4"><Kv k="Requested by" v={r.byId ? <EmpRef id={r.byId} /> : r.byName} /><Kv k="When" v={fmtTs(r.at)} /><Kv k="Used on" v={tr ? <Ref to={tr}>{targetLabel(db, r.target)}</Ref> : '—'} /><Kv k="Need by" v={fmtDate(r.needBy)} /><Kv k="Why" v={r.reason} />{r.decidedBy && <Kv k="Decided" v={`${r.decidedBy}${r.decidedAt ? ` · ${fmtTs(r.decidedAt)}` : ''}`} />}{r.note && <Kv k="Note" v={r.note} />}</div>
    <div><div className="label mb-2">Items</div><div className="card p-0">{r.lines.map(l => { const it = byId(db.items, l.itemId); if (!it) return null; const ok = it.onHand >= l.qty; return <RowRef key={l.itemId} to={{ type: 'item', id: it.id }} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 w-full"><Thumb item={it} size={38} /><span className="flex-1 min-w-0 text-left text-sm"><span className="block font-semibold truncate">{l.qty} × {it.name}</span><span className="text-xs text-muted">bin <span className="font-mono">{it.bin}</span></span></span>{r.status !== 'Checked out' && <Pill tone={ok ? 'ok' : 'bad'}>{ok ? `${it.onHand} on shelf` : `only ${it.onHand}`}</Pill>}</RowRef> })}</div></div>
    {can && r.status !== 'Checked out' && r.status !== 'Denied' && <>
      <Tip id="req-pick">Approve says “yes, you can have it.” Then pull it from the bin and tap <b>Pick & check out</b> — it’s checked out to the person who asked, on the job or unit they asked for.</Tip>
      <div className="flex flex-wrap gap-2">
        {r.status === 'Waiting' && <Button variant="ok" icon={<Check className="size-4" />} onClick={() => { actions.invDecideRequest(r.id, 'Approved'); toast.success(`${r.no} approved`) }} data-testid="req-approve">Approve</Button>}
        <Button variant="primary" icon={<ArrowUpRight className="size-4" />} disabled={!!short.length} onClick={fill} data-testid="req-fill">Pick & check out</Button>
        {short.length > 0 && <Button icon={<ShoppingCart className="size-4" />} onClick={() => { const ids = actions.invDraftPOs(short.map(l => { const it = byId(db.items, l.itemId)!; return { itemId: it.id, qty: Math.max(l.qty - it.onHand, 1) } }), { jobId: r.target?.kind === 'job' ? r.target.id : undefined, requestId: r.id, note: `For ${r.no} (${r.byName})` }); toast.success('Draft PO created for the shortfall', { action: { label: 'Open', onClick: () => useStore.getState().open({ type: 'po', id: ids[0] }) } }) }} data-testid="req-order">Order the shortfall</Button>}
        {r.status === 'Waiting' && <Button variant="ghost" onClick={() => { actions.invDecideRequest(r.id, 'Denied', 'Use what’s on the truck first'); toast(`${r.no} denied`) }}>Deny</Button>}
      </div></>}
    {r.status === 'Checked out' && !!r.checkoutIds?.length && <div className="text-sm text-muted">Checked out as {r.checkoutIds.length} line{r.checkoutIds.length === 1 ? '' : 's'} — see “Who has what”.</div>}
  </div>
}

/** New request form — used by the field app, shop, sales and office. */
export function RequestForm({ from, onDone, big }: { from: T.PartsRequest['from']; onDone?: () => void; big?: boolean }) {
  const db = useStore(s => s.db); const session = useStore(s => s.session)!
  const me = byId(db.employees, session.employeeId)
  const myJob = useMemo(() => { if (!me) return undefined; const a = db.assignments.filter(x => x.employeeId === me.id && x.date >= today()).sort((x, y) => x.date.localeCompare(y.date))[0]; return byId(db.jobs, a?.jobId) }, [db, me])
  const [lines, setLines] = useState<{ itemId: string; qty: number }[]>([])
  const [q, setQ] = useState('')
  const [scan, setScan] = useState(false)
  const [kind, setKind] = useState<'job' | 'employee' | 'customer' | 'wo'>(from === 'Sales' ? 'customer' : from === 'Shop' ? 'wo' : 'job')
  const [tid, setTid] = useState(from === 'Field' ? myJob?.id ?? '' : '')
  const [reason, setReason] = useState('')
  const [needBy, setNeedBy] = useState(addDays(today(), 1))
  const add = (it: T.InventoryItem) => { setLines(ls => ls.some(l => l.itemId === it.id) ? ls.map(l => l.itemId === it.id ? { ...l, qty: l.qty + 1 } : l) : [...ls, { itemId: it.id, qty: 1 }]); setQ('') }
  const opts = kind === 'job' ? db.jobs.filter(j => j.branchId === 'br-okc' && ['Scheduled', 'In Progress'].includes(j.stage)).map(j => ({ id: j.id, label: `#${j.jobNo} · ${customerOf(db, j).name}` }))
    : kind === 'customer' ? db.customers.map(c => ({ id: c.id, label: c.name }))
      : kind === 'wo' ? db.workOrders.filter(w => w.status !== 'Closed').map(w => ({ id: w.id, label: `${w.woNo} · ${byId(db.equipment, w.unitId)?.unit ?? ''} · ${w.title}` })) : []
  const target = (): T.InvTarget | undefined => {
    if (kind === 'employee') return me ? { kind: 'employee', id: me.id } : undefined
    if (!tid) return undefined
    if (kind === 'wo') { const w = byId(db.workOrders, tid); const u = byId(db.equipment, w?.unitId); return { kind: u?.category === 'Crane' ? 'craneService' : u?.category === 'Semi' || u?.category === 'Trailer' ? 'truckService' : 'equipService', id: tid } }
    return { kind, id: tid }
  }
  const ready = lines.length > 0 && reason.trim() && (kind === 'employee' || tid)
  const submit = () => { try { const id = actions.invRequest({ lines, target: target(), reason, needBy, from }); const no = useStore.getState().db.partsRequests?.find(r => r.id === id)?.no; toast.success(`Request ${no} sent`, { description: 'Inventory gets it now — you’ll see it here when it’s ready' }); setLines([]); setReason(''); onDone?.() } catch (e) { toast.error((e as Error).message) } }
  return <div className="flex flex-col gap-4" data-testid="request-form">
    <div><div className="label mb-2">1 · What do you need?</div>
      {!!lines.length && <div className="flex flex-col gap-2 mb-3">{lines.map(l => { const it = byId(db.items, l.itemId)!; return <div key={l.itemId} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-2" data-testid="req-line"><Thumb item={it} size={40} /><span className="flex-1 min-w-0 text-sm font-semibold truncate">{it.name}</span><button className="size-9 rounded-full bg-surface grid place-items-center" onClick={() => setLines(lines.map(x => x.itemId === l.itemId ? { ...x, qty: Math.max(1, x.qty - 1) } : x))} aria-label="Less"><Minus className="size-4" /></button><input type="number" className="w-14 text-center bg-transparent font-semibold num" value={l.qty} onChange={e => setLines(lines.map(x => x.itemId === l.itemId ? { ...x, qty: Math.min(999, Math.max(1, Math.floor(Number(e.target.value) || 1))) } : x))} data-testid="req-qty" max={999} /><button className="size-9 rounded-full bg-surface grid place-items-center" onClick={() => setLines(lines.map(x => x.itemId === l.itemId ? { ...x, qty: Math.min(999, x.qty + 1) } : x))} aria-label="More"><Plus className="size-4" /></button><button className="size-9 grid place-items-center text-muted" onClick={() => setLines(lines.filter(x => x.itemId !== l.itemId))} aria-label="Remove"><Trash2 className="size-4" /></button></div> })}</div>}
      <ItemPicker q={q} setQ={setQ} onScan={() => setScan(true)} onPick={add} filter={from === 'Sales' ? i => i.category === 'Swag' || i.category === 'Office' : undefined} />
    </div>
    <div><div className="label mb-2">2 · What’s it for?</div>
      <div className="flex flex-wrap gap-2 mb-2">{([['job', 'A job'], ['employee', 'Me'], ...(from !== 'Field' ? [['wo', 'Work order'], ['customer', 'Customer (swag)']] : [])] as [typeof kind, string][]).map(([k, l]) => <button key={k} onClick={() => { setKind(k); setTid(k === 'job' && from === 'Field' ? myJob?.id ?? '' : '') }} className={cn('px-3.5 h-10 rounded-full text-sm font-semibold', kind === k ? 'bg-ink text-surface' : 'bg-surface-2')} data-testid={`req-kind-${k}`}>{l}</button>)}</div>
      {kind !== 'employee' && <select className={cn('input', big && 'h-12')} value={tid} onChange={e => setTid(e.target.value)} data-testid="req-target"><option value="">Pick…</option>{opts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
      <textarea className="input min-h-16 mt-2" placeholder="Why? e.g. second pick point, worn out, customer visit" value={reason} onChange={e => setReason(e.target.value)} data-testid="req-reason" />
    </div>
    <label className="text-sm flex items-center gap-3">Need it by <input type="date" className="input h-10 w-auto" value={needBy} onChange={e => setNeedBy(e.target.value)} /></label>
    {lines.some(l => l.qty > (byId(db.items, l.itemId)?.onHand ?? 0)) && <div className="text-sm text-warn" data-testid="req-over">More than we have on the shelf — Inventory will order the rest.</div>}
    {!ready && <div className="text-sm text-muted" data-testid="req-why">{!lines.length ? 'Add what you need.' : kind !== 'employee' && !tid ? 'Pick what it’s for.' : 'Say why you need it.'}</div>}
    <Button variant="primary" size={big ? 'xl' : 'lg'} disabled={!ready} onClick={submit} data-testid="req-submit">Send request</Button>
    <Scanner open={scan} onClose={() => setScan(false)} onCode={c => { setScan(false); const h = resolveScan(db, c); if (h.kind === 'item') add(h.item); else toast.error('Scan an item QR') }} title="Scan the item" />
  </div>
}

export function MyRequests() {
  const db = useStore(s => s.db); const session = useStore(s => s.session)!
  const open = useStore(s => s.open)
  const mine = (db.partsRequests ?? []).filter(r => r.byId === session.employeeId || r.byName === session.name)
  if (!mine.length) return <div className="text-sm text-muted">No requests yet.</div>
  return <div className="flex flex-col gap-2" data-testid="my-requests">{mine.map(r => <button key={r.id} onClick={() => open({ type: 'request', id: r.id })} className="rounded-2xl bg-surface border hairline p-3 text-left flex items-center gap-3"><span className="flex-1 min-w-0"><span className="block font-semibold text-sm">{r.no} · {r.lines.map(l => `${l.qty} × ${byId(db.items, l.itemId)?.name ?? ''}`).join(', ')}</span><span className="text-xs text-muted">{fmtDate(r.at.slice(0, 10))} · {r.reason}</span></span><Badge tone={reqTone(r.status) as 'warn'}>{r.status === 'Approved' ? 'Approved — being picked' : r.status === 'Checked out' ? 'Ready / checked out' : r.status}</Badge></button>)}</div>
}

/** Field-app version: no drawer, just the list + status. */
export function MyRequestsField() {
  const db = useStore(s => s.db); const session = useStore(s => s.session)!
  const mine = (db.partsRequests ?? []).filter(r => r.byId === session.employeeId || r.byName === session.name)
  return <div className="flex flex-col gap-2">{mine.map(r => <div key={r.id} className="rounded-2xl bg-surface p-3 flex items-center gap-3"><span className="flex-1 min-w-0"><span className="block font-semibold text-sm truncate">{r.no} · {r.lines.map(l => `${l.qty} × ${byId(db.items, l.itemId)?.name ?? ''}`).join(', ')}</span><span className="text-xs text-muted">{r.reason}</span></span><Badge tone={reqTone(r.status) as 'warn'}>{r.status}</Badge></div>)}</div>
}

/** POs for a vendor (vendor drawer). */
export function VendorPOs({ vendorId }: { vendorId: string }) {
  const db = useStore(s => s.db); const open = useStore(s => s.open)
  const pos = db.pos.filter(p => p.vendorId === vendorId)
  if (!pos.length) return null
  return <div><div className="label mb-2">Purchase orders</div><div className="card p-0">{pos.map(p => <button key={p.id} onClick={() => open({ type: 'po', id: p.id })} className="w-full flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-left hover:bg-surface-2"><span className="flex-1 min-w-0"><span className="block font-semibold text-sm">{p.poNo}</span><span className="text-xs text-muted">{fmtDate(p.created)} · {p.lines.length} lines</span></span><PoBadge s={p.status} /><span className="num text-sm font-semibold w-20 text-right">{money(poTotal(p))}</span></button>)}</div></div>
}
export const onOrderLabel = (db: T.DB, itemId: string) => { const n = onOrderQty(db, itemId); return n ? `${n} on order` : '' }
export const empName = (db: T.DB, id?: string) => fullName(byId(db.employees, id))

/** One-shot deep links between the inventory screens (set right before go()). */
export const deepLink: { inv?: string; purch?: string; countId?: string; poStatus?: string } = {}
