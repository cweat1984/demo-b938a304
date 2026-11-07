// Inventory Command — the inventory / purchasing person's home. One job: scan. Then today's short queue.
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { ScanLine, ArrowUpRight, ArrowDownLeft, PackageCheck, ClipboardList, AlertTriangle, Clock, ChevronRight, ClipboardCheck, BookOpen, ShoppingCart } from 'lucide-react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { byId } from '../data/logic'
import { cn, fmtDate, fmtLong, money, today } from '../lib/util'
import { Button, Modal, Badge } from '../components/ui'
import { Thumb, Scanner, CheckoutFlow, CheckinFlow } from '../components/inv/kit'
import { ReceiveModal, Tip, deepLink, reqTone, PoBadge } from '../components/inv/Purchasing'
import { isOpen, openQty, resolveScan, reorderByVendor, targetLabel, poTotal } from '../data/invcore'

type Flow = { kind: 'out' | 'in'; itemId?: string; checkoutId?: string; whoId?: string } | null

export default function InvCommand() {
  const db = useStore(s => s.db); const open = useStore(s => s.open); const go = useStore(s => s.go)
  const session = useStore(s => s.session)!
  const [scan, setScan] = useState(false)
  const [hit, setHit] = useState<T.InventoryItem | null>(null)
  const [flow, setFlow] = useState<Flow>(null)
  const [recv, setRecv] = useState<T.PurchaseOrder | null>(null)
  const t = today()
  const reqs = (db.partsRequests ?? []).filter(r => r.status === 'Waiting' || r.status === 'Approved').sort((a, b) => a.needBy.localeCompare(b.needBy))
  const toReceive = db.pos.filter(p => p.status === 'Sent' || p.status === 'Partially Received').sort((a, b) => (a.expected ?? '').localeCompare(b.expected ?? ''))
  const overdue = db.checkouts.filter(c => isOpen(c) && c.returnable && c.due < t).sort((a, b) => a.due.localeCompare(b.due))
  const reorder = reorderByVendor(db)
  const reorderN = reorder.reduce((s, g) => s + g.rows.length, 0)
  const count = (db.cycleCounts ?? []).find(c => c.status === 'Due')
  const first = session.name.split(' ')[0]

  const onCode = (code: string) => {
    setScan(false)
    const po = db.pos.find(p => p.poNo.toUpperCase() === code.toUpperCase().replace(/^PO:/, ''))
    if (po) { if (po.status === 'Sent' || po.status === 'Partially Received') setRecv(po); else open({ type: 'po', id: po.id }); return }
    const h = resolveScan(db, code)
    if (h.kind === 'item') { setHit(h.item); return }
    if (h.kind === 'bin') { if (h.items.length === 1) setHit(h.items[0]); else open({ type: 'item', id: h.items[0].id }); return }
    if (h.kind === 'emp') { setFlow({ kind: 'out', whoId: h.emp.id }); toast(`Checking out for ${h.emp.first} ${h.emp.last}`); return }
    if (h.kind === 'unit') { open({ type: 'equipment', id: h.unit.id }); return }
    if (h.kind === 'job') { open({ type: 'job', id: h.job.id }); return }
    if (h.kind === 'wo') { open({ type: 'workorder', id: h.wo.id }); return }
    toast.error(`Nothing matches “${code}”`)
  }
  const outsFor = (id: string) => db.checkouts.filter(c => c.itemId === id && isOpen(c))

  return <div className="max-w-3xl mx-auto flex flex-col gap-6" data-testid="inv-command">
    <div>
      <div className="text-sm text-muted">{fmtLong(t)} · Inventory Command · Oklahoma City</div>
      <h1 className="display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">{new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {first}.</h1>
    </div>
    <Tip id="cmd-welcome">New to running inventory? Start with <button className="text-accent font-semibold" onClick={() => go('invguide')}>How inventory works</button> — 5 minutes, plain English. Everything below is your to-do list for today.</Tip>

    {/* the one big thing */}
    <button onClick={() => setScan(true)} data-testid="cmd-scan" className="rounded-[32px] bg-accent text-accent-ink p-6 sm:p-8 text-left press shadow-[0_18px_44px_-18px_var(--accent)] flex items-center gap-5 min-h-[150px] sm:min-h-[180px]">
      <span className="size-16 sm:size-20 rounded-3xl bg-black/15 grid place-items-center shrink-0"><ScanLine className="size-9 sm:size-11" /></span>
      <span><span className="block display text-3xl sm:text-4xl font-semibold leading-none">Scan QR</span><span className="block mt-2 opacity-80 text-sm sm:text-base">Check out · check in · receive a PO · scan a badge</span></span>
    </button>
    <div className="grid grid-cols-2 gap-3 -mt-2">
      <Button size="lg" icon={<ArrowUpRight className="size-5" />} onClick={() => setFlow({ kind: 'out' })} data-testid="cmd-out">Check out</Button>
      <Button size="lg" icon={<ArrowDownLeft className="size-5" />} onClick={() => setFlow({ kind: 'in' })} data-testid="cmd-in">Check in</Button>
    </div>

    <div>
      <div className="flex items-baseline gap-3 mb-3"><h2 className="display text-xl font-semibold">Today</h2><span className="text-sm text-muted">{reqs.length + toReceive.length + overdue.length + (reorderN ? 1 : 0)} things</span></div>
      <div className="flex flex-col gap-3">
        <Queue icon={<ClipboardList className="size-5" />} title="Requests waiting" n={reqs.length} tone="warn" empty="No one is waiting on you" onAll={() => go('requests')} testid="q-requests">
          {reqs.slice(0, 3).map(r => <QRow key={r.id} onClick={() => open({ type: 'request', id: r.id })} title={`${r.byName} · ${r.lines.map(l => `${l.qty} × ${byId(db.items, l.itemId)?.name ?? ''}`).join(', ')}`} sub={`${r.no} · ${r.target ? targetLabel(db, r.target) : '—'} · need ${r.needBy <= t ? 'today' : fmtDate(r.needBy)}`} right={<Badge tone={reqTone(r.status) as 'warn'}>{r.status === 'Waiting' ? 'Approve' : 'Pick'}</Badge>} />)}
        </Queue>
        <Queue icon={<PackageCheck className="size-5" />} title="POs to receive" n={toReceive.length} tone="info" empty="Nothing on the way" onAll={() => { deepLink.purch = 'pos'; go('purchasing') }} testid="q-receive">
          {toReceive.slice(0, 3).map(p => <QRow key={p.id} onClick={() => open({ type: 'po', id: p.id })} title={`${p.poNo} · ${byId(db.vendors, p.vendorId)?.name}`} sub={`${p.lines.length} lines · ${money(poTotal(p))} · ${p.expected ? (p.expected <= t ? 'due today' : `expected ${fmtDate(p.expected)}`) : ''}`} right={<span className="flex items-center gap-2"><span className="hidden sm:inline"><PoBadge s={p.status} /></span><Button size="sm" variant="primary" onClick={e => { e.stopPropagation(); setRecv(p) }} data-testid="q-receive-btn">Receive</Button></span>} />)}
        </Queue>
        <Queue icon={<Clock className="size-5" />} title="Overdue for return" n={overdue.length} tone="bad" empty="Everything returnable is back or not due" onAll={() => { deepLink.inv = 'out'; go('inventory') }} testid="q-overdue">
          {overdue.slice(0, 3).map(c => { const it = byId(db.items, c.itemId); return it ? <QRow key={c.id} thumb={it} onClick={() => open({ type: 'item', id: it.id })} title={`${openQty(c)} × ${it.name}`} sub={`${c.byName} · ${targetLabel(db, c.target)} · due ${fmtDate(c.due)}`} right={<Button size="sm" variant="ok" onClick={e => { e.stopPropagation(); setFlow({ kind: 'in', checkoutId: c.id }) }}>Check in</Button>} /> : null })}
        </Queue>
        <Queue icon={<AlertTriangle className="size-5" />} title="To reorder — at or below min, not on order" n={reorderN} tone="warn" empty="Everything is above its reorder point or on order" onAll={() => { deepLink.purch = 'reorder'; go('purchasing') }} testid="q-reorder">
          {reorder.slice(0, 3).map(g => <QRow key={g.vendorId} onClick={() => { deepLink.purch = 'reorder'; go('purchasing') }} title={byId(db.vendors, g.vendorId)?.name ?? 'Vendor'} sub={g.rows.map(r => r.item.name).slice(0, 3).join(', ') + (g.rows.length > 3 ? ` +${g.rows.length - 3}` : '')} right={<span className="flex items-center gap-2 text-sm"><span className="num font-semibold">{money(g.total)}</span><ShoppingCart className="size-4 text-muted" /></span>} />)}
        </Queue>
      </div>
    </div>

    {count && <button onClick={() => { deepLink.inv = 'count'; deepLink.countId = count.id; go('inventory') }} className="card p-5 text-left press hover:bg-surface-2 flex items-center gap-4" data-testid="cmd-count">
      <span className="size-12 rounded-2xl bg-surface-2 grid place-items-center"><ClipboardCheck className="size-6" /></span>
      <span className="flex-1 min-w-0"><span className="block font-semibold">This week’s cycle count</span><span className="block text-sm text-muted truncate">{count.label} · <span className="font-mono">{count.shelf}</span> · due {fmtDate(count.due)}</span></span>
      <span className="text-sm font-semibold text-accent">Start</span><ChevronRight className="size-5 text-faint" />
    </button>}
    <button onClick={() => go('invguide')} className="flex items-center justify-center gap-2 text-sm text-muted hover:text-ink py-2"><BookOpen className="size-4" />How inventory works</button>

    <Scanner open={scan} onClose={() => setScan(false)} onCode={onCode} title="Scan anything" hint="Item or bin QR · PO number · employee badge · crane / truck" />
    <ScanHit item={hit} onClose={() => setHit(null)} outs={hit ? outsFor(hit.id) : []} onOut={() => { const i = hit!; setHit(null); setFlow({ kind: 'out', itemId: i.id }) }} onIn={() => { const i = hit!; setHit(null); setFlow({ kind: 'in', itemId: i.id }) }} onDetails={() => { const i = hit!; setHit(null); open({ type: 'item', id: i.id }) }} />
    <CheckoutFlow open={flow?.kind === 'out'} onClose={() => setFlow(null)} itemId={flow?.itemId} whoId={flow?.whoId} />
    <CheckinFlow open={flow?.kind === 'in'} onClose={() => setFlow(null)} checkoutId={flow?.checkoutId} itemId={flow?.itemId} />
    <ReceiveModal po={recv} onClose={() => setRecv(null)} />
  </div>
}

function Queue({ icon, title, n, tone, empty, onAll, children, testid }: { icon: ReactNode; title: string; n: number; tone: 'warn' | 'bad' | 'info'; empty: string; onAll: () => void; children: ReactNode; testid: string }) {
  return <div className="card p-0 overflow-hidden" data-testid={testid}>
    <button onClick={onAll} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-surface-2">
      <span className={cn('size-9 rounded-xl grid place-items-center', n ? (tone === 'bad' ? 'bg-bad/15 text-bad' : tone === 'warn' ? 'bg-warn/15 text-warn' : 'bg-info/15 text-info') : 'bg-surface-2 text-muted')}>{icon}</span>
      <span className="flex-1 font-semibold">{title}</span>
      <span className={cn('display text-2xl font-semibold num', !n && 'text-faint')}>{n}</span><ChevronRight className="size-4 text-faint" />
    </button>
    {n ? <div className="border-t hairline">{children}</div> : <div className="px-5 pb-3.5 -mt-1 text-sm text-muted">{empty}</div>}
  </div>
}
function QRow({ title, sub, right, onClick, thumb }: { title: string; sub: string; right?: ReactNode; onClick: () => void; thumb?: T.InventoryItem }) {
  return <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => e.key === 'Enter' && onClick()} className="flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0 hover:bg-surface-2 cursor-pointer" data-testid="q-row">
    {thumb && <Thumb item={thumb} size={36} />}
    <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{title}</span><span className="block text-xs text-muted truncate">{sub}</span></span>{right}
  </div>
}
function ScanHit({ item, outs, onClose, onOut, onIn, onDetails }: { item: T.InventoryItem | null; outs: T.Checkout[]; onClose: () => void; onOut: () => void; onIn: () => void; onDetails: () => void }) {
  return <Modal open={!!item} onClose={onClose} title={item?.name} sub={item ? `${item.sku} · bin ${item.bin}` : ''} z={80}>
    {item && <div className="flex flex-col gap-4" data-testid="scan-hit">
      <div className="flex items-center gap-4"><Thumb item={item} size={88} /><div><div className="display text-4xl font-semibold num">{item.onHand}<span className="text-base text-muted font-normal"> {item.unit} on shelf</span></div><div className="text-sm text-muted">{outs.reduce((s, c) => s + openQty(c), 0)} checked out right now{item.oos ? ' · TAGGED OUT' : ''}</div></div></div>
      <div className="grid grid-cols-2 gap-3">
        <button disabled={item.onHand <= 0 || !!item.oos} onClick={onOut} className="rounded-3xl bg-accent text-accent-ink p-5 text-left press disabled:opacity-40" data-testid="hit-out"><ArrowUpRight className="size-8" /><div className="display text-2xl font-semibold mt-3">Check out</div></button>
        <button disabled={!outs.length} onClick={onIn} className="rounded-3xl bg-surface-2 p-5 text-left press disabled:opacity-40" data-testid="hit-in"><ArrowDownLeft className="size-8" /><div className="display text-2xl font-semibold mt-3">Check in</div></button>
      </div>
      <Button variant="ghost" onClick={onDetails}>Item details</Button>
    </div>}
  </Modal>
}
