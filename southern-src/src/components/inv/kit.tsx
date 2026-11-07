import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { sizeFor } from '../../data/myinfo'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { ScanLine, Search, Camera, Check, Minus, Plus, X, ArrowUpRight, ArrowDownLeft, ChevronRight, MapPin } from 'lucide-react'
import type * as T from '../../data/types'
import { useStore, actions, measuredUnit } from '../../data/store'
import { useRig, tagProblem } from '../../gapA/rigging'
import { byId, fullName, customerOf } from '../../data/logic'
import { cn, money, fmtDate, today, addDays } from '../../lib/util'
import { Button, Modal, Badge } from '../ui'
import { SignaturePad } from '../../field/kit'
import { TARGETS, resolveScan, itemPhoto, isReturnable, openQty, isOpen, targetLabel, locPath, CAT_ICON, isService, type ScanHit } from '../../data/invcore'

// ---------- QR ----------
export function QR({ value, size = 96, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let on = true; QRCode.toDataURL(value, { margin: 1, width: size * 2, errorCorrectionLevel: 'M' }).then(u => on && setSrc(u)).catch(() => {}); return () => { on = false } }, [value, size])
  return src ? <img src={src} width={size} height={size} alt={value} className={cn('bg-white rounded-md', className)} style={{ width: size, height: size }} data-qr={value} /> : <div style={{ width: size, height: size }} className="bg-white/80 rounded-md" />
}

export function Thumb({ item, size = 44, className }: { item: T.InventoryItem; size?: number; className?: string }) {
  return <img src={itemPhoto(item)} alt="" className={cn('rounded-xl object-cover shrink-0 bg-surface-2', className)} style={{ width: size, height: size }} />
}

export function LocPath({ item, className }: { item: T.InventoryItem; className?: string }) {
  const db = useStore(s => s.db)
  const p = locPath(db, item)
  return <div className={cn('flex flex-wrap items-center gap-1 text-xs', className)} data-testid="loc-path"><MapPin className="size-3.5 text-accent" />{p.map((x, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <ChevronRight className="size-3 text-faint" />}<span className={cn(i === p.length - 1 ? 'font-semibold text-ink' : 'text-muted')}>{x}</span></span>)}</div>
}

// ---------- scanner: camera (BarcodeDetector) with manual-code fallback ----------
type BD = { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> }
export function Scanner({ open, onClose, onCode, title = 'Scan a QR code', hint = 'Item, bin, crane / truck, badge or job' }: { open: boolean; onClose: () => void; onCode: (code: string) => void; title?: string; hint?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const [camErr, setCamErr] = useState<string | null>(null)
  const [code, setCode] = useState('')
  useEffect(() => {
    if (!open) return
    setCode(''); setCamErr(null)
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BD }
    if (!W.BarcodeDetector || !navigator.mediaDevices?.getUserMedia) { setCamErr('Camera scanning isn’t available in this browser — type the code below.'); return }
    let stream: MediaStream | null = null; let raf = 0; let alive = true
    const det = new W.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] })
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(s => {
      if (!alive) { s.getTracks().forEach(t => t.stop()); return }
      stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}) }
      const tick = async () => { if (!alive || !video.current) return; try { const r = await det.detect(video.current); if (r[0]?.rawValue) { onCode(r[0].rawValue); return } } catch { /* frame not ready */ } raf = requestAnimationFrame(tick) }
      raf = requestAnimationFrame(tick)
    }).catch(() => setCamErr('Camera permission denied — type the code below.'))
    return () => { alive = false; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal open={open} onClose={onClose} title={title} sub={hint} z={90}>
      <div className="flex flex-col gap-4" data-testid="scanner">
        <div className="relative aspect-[4/3] rounded-2xl bg-black overflow-hidden grid place-items-center">
          {!camErr && <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />}
          <div className="relative size-48 rounded-3xl border-4 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.35)]" />
          {camErr && <div className="absolute bottom-3 inset-x-3 text-center text-xs text-white/80">{camErr}</div>}
          {!camErr && <ScanLine className="absolute size-10 text-white/80 animate-pulse" />}
        </div>
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (code.trim()) onCode(code.trim()) }}>
          <input className="input flex-1 font-mono" placeholder="Or type code: INV:SLH-RIG-1008, BIN:…, EQ:28, EMP:…" value={code} onChange={e => setCode(e.target.value)} data-testid="scan-manual" autoFocus={!!camErr} />
          <Button type="submit" variant="primary" data-testid="scan-go">Go</Button>
        </form>
      </div>
    </Modal>
  )
}

// ---------- check-out flow (scan → qty → used on → reason → sign) ----------
const REASONS: Record<string, string[]> = {
  job: ['Rigging for the lift', 'Site setup', 'Consumables for the job', 'Replace worn gear on site'],
  crane: ['Daily grease points', 'Top-off before mobilizing', 'Field repair'],
  employee: ['Replacement — worn out', 'New hire issue', 'Lost on site', 'Size swap'],
  customer: ['Customer visit', 'Thank-you after job', 'Safety stand-down giveaway', 'Trade show'],
  service: ['PM service', 'DVIR defect repair', 'Breakdown repair', 'Worn — replaced at PM'],
}
export function CheckoutFlow({ open, onClose, itemId, whoId, preTarget }: { open: boolean; onClose: () => void; itemId?: string; whoId?: string; preTarget?: T.InvTarget }) {
  const db = useStore(s => s.db)
  const [step, setStep] = useState(0)
  const [item, setItem] = useState<T.InventoryItem | undefined>()
  const [qty, setQty] = useState(1)
  const [kind, setKind] = useState<T.InvTargetKind | undefined>()
  const [target, setTarget] = useState<T.InvTarget | undefined>()
  const [reason, setReason] = useState('')
  const [due, setDue] = useState(addDays(today(), 7))
  const [sig, setSig] = useState<string | null>(null)
  const [scan, setScan] = useState<null | 'item' | 'target'>(null)
  const [q, setQ] = useState('')
  const [tags, setTags] = useState<string[]>([]) // dive3 shop M10: rigging goes out by tag
  useEffect(() => { if (open && item?.category === 'Rigging') useRig.getState().ensure(db) }, [open, item?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const rigAll = useRig(s => s.pieces); const pieces = item ? (rigAll ?? []).filter(p => p.itemId === item.id) : []
  useEffect(() => { if (!open) return; const it = byId(db.items, itemId); setItem(it); setStep(it ? 1 : 0); setQty(1); setTags([]); setKind(preTarget?.kind); setTarget(preTarget); setReason(''); setSig(null); setQ(''); setDue(addDays(today(), 7)) }, [open, itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  const who = actions.invWho(whoId)
  const onScan = (code: string) => {
    const hit = resolveScan(db, code); setScan(null)
    if (scan === 'item') { if (hit.kind === 'item') { setItem(hit.item); setStep(1) } else toast.error(hit.kind === 'none' ? `No item for “${code}”` : 'That code isn’t an item'); return }
    const t = hitToTarget(db, hit); if (t) { setKind(t.kind); setTarget(t); setStep(3) } else toast.error('That code isn’t a crane, badge, job or work order')
  }
  const done = () => {
    if (!item || !target) return
    try { actions.invCheckout({ itemId: item.id, qty, target, reason, due: isReturnable(item) ? due : undefined, signature: sig ?? undefined, whoId, tags: pieces.length ? tags : undefined }); toast.success(`${qty} × ${item.name}`, { description: `Checked out to ${targetLabel(db, target)}` }); onClose() } catch (e) { toast.error((e as Error).message) }
  }
  const steps = ['Item', 'Qty', 'Used on', 'Why', 'Sign']
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><ArrowUpRight className="size-5 text-accent" />Check out</span>} sub={`By ${who.name} · ${fmtDate(today())}`} width={560} z={80}>
      <div className="flex flex-col gap-4" data-testid="checkout-flow">
        <div className="flex gap-1">{steps.map((s, i) => <button key={s} disabled={i > step || (i > 0 && !item)} onClick={() => setStep(i)} className={cn('flex-1 h-1.5 rounded-full transition', i <= step ? 'bg-accent' : 'bg-surface-2')} aria-label={s} />)}</div>
        {item && step > 0 && <ItemChip item={item} onClick={() => setStep(0)} />}
        {step === 0 && <ItemPicker q={q} setQ={setQ} onScan={() => setScan('item')} onPick={it => { setItem(it); setStep(1) }} />}
        {step === 1 && item && <div className="flex flex-col items-center gap-5 py-2">
          <div className="text-sm text-muted">{item.onHand} {item.unit} on the shelf</div>
          <div className="flex items-center gap-6">
            <button className="size-16 rounded-full bg-surface-2 grid place-items-center press" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less"><Minus /></button>
            <input type="number" inputMode={measuredUnit(item.unit) ? 'decimal' : 'numeric'} step={measuredUnit(item.unit) ? 'any' : 1} min={0} className="w-28 text-center display text-5xl font-semibold bg-transparent outline-none num" value={qty} onChange={e => { const v = Number(e.target.value) || 0; setQty(Math.max(0, measuredUnit(item.unit) ? v : Math.floor(v))) }} data-testid="co-qty" />
            <button className="size-16 rounded-full bg-surface-2 grid place-items-center press" onClick={() => setQty(Math.min(item.onHand, qty + 1))} aria-label="More"><Plus /></button>
          </div>
          {qty > item.onHand && <div className="text-bad text-sm">Only {item.onHand} on the shelf</div>}
          {item.oos && <div className="text-bad text-sm font-semibold">Tagged out of service — {item.oos.reason}</div>}
          {pieces.length > 0 && <div className="w-full" data-testid="co-tags"><div className="label mb-1.5">Scan or tap the tag{qty === 1 ? '' : 's'} going out ({tags.length}/{qty})</div>
            <div className="flex flex-wrap gap-2">{pieces.map(p => { const why = tagProblem(p), on = tags.includes(p.tag); return <button key={p.tag} type="button" data-testid="co-tag" data-tag={p.tag} disabled={!!why && !on} title={why ?? 'OK to use'} onClick={() => setTags(on ? tags.filter(t => t !== p.tag) : tags.length < qty ? [...tags, p.tag] : [...tags.slice(1), p.tag])} className={cn('min-h-11 px-3 rounded-xl border text-sm font-mono text-left', on ? 'border-accent bg-accent/10' : 'hairline', why && 'opacity-50 line-through')}>{p.tag}<span className="block font-sans text-[11px] text-muted no-underline">{why ? why.replace(`${p.tag}`, '').replace(/^[: ]+/, '') : 'In service'}</span></button> })}</div></div>}
          <Button variant="primary" size="xl" className="w-full" disabled={qty <= 0 || qty > item.onHand || !!item.oos || (pieces.length > 0 && tags.length !== qty)} onClick={() => setStep(2)} data-testid="co-next">Next</Button>
        </div>}
        {step === 2 && <TargetPicker kind={kind} setKind={setKind} onScan={() => setScan('target')} onPick={t => { setTarget(t); setStep(3) }} isSwag={item?.category === 'Swag'} />}
        {step === 3 && target && <div className="flex flex-col gap-3">
          <div className="text-sm">Used on <b>{targetLabel(db, target)}</b> <button className="text-accent text-xs ml-1" onClick={() => setStep(2)}>change</button></div>
          {item && target.kind === 'employee' && ['Swag', 'PPE & Safety'].includes(item.category) && (() => { const sz = sizeFor(db.employees.find(e => e.id === target.id), item); return sz ? <div className="text-sm rounded-xl bg-info/10 px-3 py-2" data-testid="co-size">Size on file (My Info): <b>{sz}</b></div> : null })()}
          <div className="flex flex-wrap gap-2">{(REASONS[isService(target.kind) ? 'service' : target.kind] ?? []).map(r => <button key={r} onClick={() => setReason(r)} className={cn('px-3 h-9 rounded-full text-sm font-medium', reason === r ? 'bg-ink text-surface' : 'bg-surface-2')}>{r}</button>)}</div>
          <textarea className="input min-h-20" placeholder="Why? (required)" value={reason} onChange={e => setReason(e.target.value)} data-testid="co-reason" />
          {item && isReturnable(item) && <label className="text-sm flex items-center gap-3">Due back <input type="date" min={today()} data-testid="co-due" className="input h-10 w-auto" value={due} onChange={e => setDue(e.target.value)} /></label>}
          <Button variant="primary" size="xl" disabled={!reason.trim()} onClick={() => setStep(4)} data-testid="co-next">Next</Button>
        </div>}
        {step === 4 && item && target && <div className="flex flex-col gap-3">
          <div className="card-flat p-4 text-sm grid gap-1">
            <div><b>{qty} {item.unit}</b> × {item.name} · <span className="num">{money(qty * item.cost)}</span></div>
            <div className="text-muted">→ {targetLabel(db, target)} · {reason}</div>
            <div className="text-muted">Who: {who.name}{isReturnable(item) ? ` · due back ${fmtDate(due)}` : ' · consumable (leftovers can be checked back in)'}</div>
          </div>
          <div className="rounded-2xl border hairline overflow-hidden"><SignaturePad onChange={setSig} height={130} /></div>
          <Button variant="primary" size="xl" onClick={done} data-testid="co-confirm" icon={<Check className="size-5" />}>{sig ? 'Sign & check out' : 'Confirm check out'}</Button>
        </div>}
      </div>
      <Scanner open={!!scan} onClose={() => setScan(null)} onCode={onScan} title={scan === 'item' ? 'Scan the item' : 'Scan what it’s used on'} hint={scan === 'item' ? 'QR on the item or its bin' : 'Crane / truck QR, employee badge, job or work order'} />
    </Modal>
  )
}

function hitToTarget(db: T.DB, h: ScanHit): T.InvTarget | undefined {
  if (h.kind === 'job') return { kind: 'job', id: h.job.id }
  if (h.kind === 'emp') return { kind: 'employee', id: h.emp.id }
  if (h.kind === 'wo') { const u = byId(db.equipment, h.wo.unitId); return { kind: u?.category === 'Crane' ? 'craneService' : u?.category === 'Semi' || u?.category === 'Trailer' ? 'truckService' : 'equipService', id: h.wo.id } }
  if (h.kind === 'unit') {
    if (h.unit.category === 'Crane') return { kind: 'crane', id: h.unit.id }
    const w = db.workOrders.find(x => x.unitId === h.unit.id && x.status !== 'Closed'); if (w) return { kind: h.unit.category === 'Semi' || h.unit.category === 'Trailer' ? 'truckService' : 'equipService', id: w.id }
  }
  return undefined
}

function ItemChip({ item, onClick }: { item: T.InventoryItem; onClick?: () => void }) {
  return <button onClick={onClick} className="flex items-center gap-3 p-2 rounded-2xl bg-surface-2 text-left press"><Thumb item={item} size={52} /><span className="min-w-0 flex-1"><span className="block font-semibold truncate">{item.name}</span><span className="block text-xs text-muted">{item.sku} · bin {item.bin}</span></span></button>
}

export function ItemPicker({ q, setQ, onScan, onPick, filter }: { q: string; setQ: (s: string) => void; onScan: () => void; onPick: (i: T.InventoryItem) => void; filter?: (i: T.InventoryItem) => boolean }) {
  const db = useStore(s => s.db)
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return db.items.filter(i => (i.branchId ?? 'br-okc') === 'br-okc' && (!filter || filter(i)) && (!t || `${i.name} ${i.sku} ${i.bin} ${i.sub ?? ''} ${i.category}`.toLowerCase().includes(t))).slice(0, t ? 12 : 8) }, [q, db.items, filter])
  return <div className="flex flex-col gap-3">
    <Button variant="primary" size="xl" icon={<ScanLine className="size-6" />} onClick={onScan} data-testid="scan-item">Scan item or bin</Button>
    <div className="flex items-center gap-2 px-3 h-12 rounded-2xl bg-surface-2"><Search className="size-4 text-muted" /><input className="flex-1 bg-transparent outline-none" placeholder="Search name, SKU, bin" value={q} onChange={e => setQ(e.target.value)} data-testid="item-search" /></div>
    <div className="flex flex-col max-h-72 overflow-y-auto -mx-1">{hits.map(i => <button key={i.id} onClick={() => onPick(i)} className="flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-surface-2 text-left" data-testid="item-hit"><Thumb item={i} size={40} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{i.name}</span><span className="block text-xs text-muted">{i.sku} · {i.onHand} {i.unit} · {i.bin}</span></span>{i.oos && <Badge tone="bad">OOS</Badge>}</button>)}</div>
  </div>
}

function TargetPicker({ kind, setKind, onScan, onPick, isSwag }: { kind?: T.InvTargetKind; setKind: (k: T.InvTargetKind) => void; onScan: () => void; onPick: (t: T.InvTarget) => void; isSwag?: boolean }) {
  const db = useStore(s => s.db)
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const t = q.trim().toLowerCase(); const m = (s: string) => !t || s.toLowerCase().includes(t)
    const okc = (x: { branchId?: string }) => !x.branchId || x.branchId === 'br-okc'
    const wo = (cats: T.EquipCategory[]) => db.workOrders.filter(w => { const u = byId(db.equipment, w.unitId); return u && cats.includes(u.category) && okc(u) && (w.status !== 'Closed' || w.opened >= addDays(today(), -3)) }).map(w => ({ id: w.id, label: `${w.woNo} · ${byId(db.equipment, w.unitId)?.unit}`, sub: `${w.title} · ${w.status}` }))
    let rows: { id: string; label: string; sub: string }[] = []
    if (kind === 'job') rows = db.jobs.filter(j => okc(j) && ['Scheduled', 'In Progress'].includes(j.stage)).map(j => ({ id: j.id, label: `#${j.jobNo} · ${customerOf(db, j).name}`, sub: j.name }))
    if (kind === 'crane') rows = db.equipment.filter(e => e.category === 'Crane' && okc(e)).map(e => ({ id: e.id, label: `Crane ${e.unit}`, sub: `${e.make} ${e.model}` }))
    if (kind === 'employee') rows = db.employees.filter(e => e.status === 'Active' && okc(e)).map(e => ({ id: e.id, label: fullName(e), sub: `${e.craft} · ${e.empNo}` }))
    if (kind === 'customer') rows = db.customers.map(c => ({ id: c.id, label: c.name, sub: c.industry }))
    if (kind === 'truckService') rows = wo(['Semi', 'Trailer'])
    if (kind === 'craneService') rows = wo(['Crane'])
    if (kind === 'equipService') rows = wo(['Support', 'Pickup'])
    return rows.filter(r => m(`${r.label} ${r.sub}`)).slice(0, 40)
  }, [kind, q, db])
  const order = isSwag ? [...TARGETS].sort((a, b) => (a.kind === 'customer' ? -1 : b.kind === 'customer' ? 1 : 0)) : TARGETS
  return <div className="flex flex-col gap-3">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{order.map(t => <button key={t.kind} onClick={() => { setKind(t.kind); setQ('') }} data-testid={`target-${t.kind}`} className={cn('rounded-2xl px-3 py-3 text-left press border', kind === t.kind ? 'bg-ink text-surface border-transparent' : 'bg-surface-2 border-transparent')}><div className="text-sm font-semibold leading-tight">{t.label}</div><div className={cn('text-[11px] mt-0.5', kind === t.kind ? 'opacity-70' : 'text-muted')}>{t.hint}</div></button>)}</div>
    <Button icon={<ScanLine className="size-5" />} onClick={onScan} data-testid="scan-target">Scan crane / truck / badge / job</Button>
    {kind && <>
      <div className="flex items-center gap-2 px-3 h-11 rounded-2xl bg-surface-2"><Search className="size-4 text-muted" /><input className="flex-1 bg-transparent outline-none text-sm" placeholder={`Find ${TARGETS.find(t => t.kind === kind)?.label.toLowerCase()}`} value={q} onChange={e => setQ(e.target.value)} data-testid="target-search" autoFocus /></div>
      <div className="flex flex-col max-h-64 overflow-y-auto">{list.map(r => <button key={r.id} onClick={() => onPick({ kind, id: r.id })} className="text-left px-3 py-2 rounded-xl hover:bg-surface-2" data-testid="target-hit"><div className="text-sm font-semibold">{r.label}</div><div className="text-xs text-muted truncate">{r.sub}</div></button>)}{!list.length && <div className="text-sm text-muted p-3">Nothing open here{kind.includes('Service') ? ' — open a work order in Shop first' : ''}.</div>}</div>
    </>}
  </div>
}

// ---------- check-in flow (any item; partial OK; credits job / WO) ----------
export function CheckinFlow({ open, onClose, checkoutId, itemId, jobId, whoId }: { open: boolean; onClose: () => void; checkoutId?: string; itemId?: string; jobId?: string; whoId?: string }) {
  const db = useStore(s => s.db)
  const [sel, setSel] = useState<string | undefined>()
  const [qty, setQty] = useState(1)
  const [cond, setCond] = useState<'Good' | 'Damaged' | 'Used up'>('Good')
  const [by, setBy] = useState<string>('')
  const [bin, setBin] = useState('')
  const [scan, setScan] = useState(false)
  const [fItem, setFItem] = useState<string | undefined>(itemId)
  const [q, setQ] = useState('')
  useEffect(() => { if (!open) return; setSel(checkoutId); setFItem(itemId); setCond('Good'); setQ(''); const me = actions.invWho(whoId); setBy(me.id); const c = byId(db.checkouts, checkoutId); if (c) { setQty(openQty(c)); setBin(byId(db.items, c.itemId)?.bin ?? '') } }, [open, checkoutId, itemId]) // eslint-disable-line react-hooks/exhaustive-deps
  const opens = db.checkouts.filter(c => isOpen(c) && (!fItem || c.itemId === fItem) && (!jobId || c.jobId === jobId)).filter(c => { const t = q.trim().toLowerCase(); if (!t) return true; const i = byId(db.items, c.itemId); return `${i?.name} ${i?.sku} ${targetLabel(db, c.target)} ${c.byName}`.toLowerCase().includes(t) })
  const c = byId(db.checkouts, sel); const it = c && byId(db.items, c.itemId)
  const pick = (id: string) => { const x = byId(db.checkouts, id)!; setSel(id); setQty(openQty(x)); setBin(byId(db.items, x.itemId)?.bin ?? '') }
  const onScan = (code: string) => { setScan(false); const h = resolveScan(db, code); if (h.kind === 'item') { setFItem(h.item.id); const os = db.checkouts.filter(x => isOpen(x) && x.itemId === h.item.id); if (os.length === 1) pick(os[0].id); else if (!os.length) toast('Nothing checked out for that item') } else toast.error('Scan an item QR') }
  const credit = c && cond !== 'Used up' && (c.jobId || isService(c.target?.kind)) ? qty * (c.unitCost ?? it?.cost ?? 0) : 0
  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><ArrowDownLeft className="size-5 text-ok" />Check in</span>} sub="Returned quantity is credited back to the job or work order" width={560} z={80}>
      <div className="flex flex-col gap-4" data-testid="checkin-flow">
        {!c && <>
          <Button variant="primary" size="xl" icon={<ScanLine className="size-6" />} onClick={() => setScan(true)} data-testid="ci-scan">Scan item</Button>
          <div className="flex items-center gap-2 px-3 h-11 rounded-2xl bg-surface-2"><Search className="size-4 text-muted" /><input className="flex-1 bg-transparent outline-none text-sm" placeholder="Search open checkouts — item, job, person" value={q} onChange={e => setQ(e.target.value)} data-testid="ci-search" />{fItem && <button onClick={() => setFItem(undefined)} className="text-xs text-accent">clear item</button>}</div>
          <div className="flex flex-col max-h-80 overflow-y-auto">{opens.slice(0, 40).map(x => { const i = byId(db.items, x.itemId)!; return <button key={x.id} onClick={() => pick(x.id)} className="flex items-center gap-3 px-1 py-2 rounded-xl hover:bg-surface-2 text-left" data-testid="ci-open"><Thumb item={i} size={40} /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{openQty(x)} × {i.name}</span><span className="block text-xs text-muted truncate">{targetLabel(db, x.target)} · {x.byName} · {fmtDate(x.out)}</span></span>{x.returnable && x.due < today() && <Badge tone="bad">Overdue</Badge>}</button> })}{!opens.length && <div className="text-sm text-muted p-3">Nothing open.</div>}</div>
        </>}
        {c && it && <>
          <ItemChip item={it} onClick={() => setSel(undefined)} />
          <div className="text-sm text-muted">Out to <b className="text-ink">{targetLabel(db, c.target)}</b> · {openQty(c)} of {c.qty} {it.unit} still out · by {c.byName}</div>
          <div className="flex items-center justify-center gap-6">
            <button className="size-14 rounded-full bg-surface-2 grid place-items-center press" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Less"><Minus /></button>
            <input type="number" inputMode={measuredUnit(it.unit) ? 'decimal' : 'numeric'} step={measuredUnit(it.unit) ? 'any' : 1} min={0} className="w-24 text-center display text-4xl font-semibold bg-transparent outline-none num" value={qty} onChange={e => { const v = Number(e.target.value) || 0; setQty(Math.min(openQty(c), Math.max(0, measuredUnit(it.unit) ? v : Math.floor(v)))) }} data-testid="ci-qty" />
            <button className="size-14 rounded-full bg-surface-2 grid place-items-center press" onClick={() => setQty(Math.min(openQty(c), qty + 1))} aria-label="More"><Plus /></button>
          </div>
          <div className="grid grid-cols-3 gap-2">{(['Good', 'Damaged', 'Used up'] as const).map(k => <button key={k} onClick={() => setCond(k)} data-testid={`ci-cond-${k.replace(' ', '')}`} className={cn('h-12 rounded-2xl font-semibold press', cond === k ? (k === 'Good' ? 'bg-ok-solid text-white' : k === 'Damaged' ? 'bg-bad-solid text-white' : 'bg-ink text-surface') : 'bg-surface-2')}>{k}</button>)}</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted">Returned by<select className="input mt-1" value={by} onChange={e => setBy(e.target.value)} data-testid="ci-by">{!by && <option value="">—</option>}{db.employees.filter(e => e.status === 'Active' && (!e.branchId || e.branchId === 'br-okc')).sort((a, b) => a.last.localeCompare(b.last)).map(e => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</select></label>
            <label className="text-xs text-muted">Back to bin<input className="input mt-1 font-mono" value={bin} onChange={e => setBin(e.target.value)} disabled={cond !== 'Good'} data-testid="ci-bin" /></label>
          </div>
          <div className="text-sm text-muted">{cond === 'Good' ? `${qty} back on the shelf` : cond === 'Damaged' ? 'Credited, then written off (not restocked)' : 'Closes the remainder — no credit'}{credit ? <> · <b className="text-ok">{money(credit)} credited</b> to {targetLabel(db, c.target)}</> : null}</div>
          <Button variant="primary" size="xl" icon={<Check className="size-5" />} disabled={qty <= 0} data-testid="ci-confirm" onClick={() => { actions.invCheckin({ checkoutId: c.id, qty, condition: cond, whoId: by || undefined, bin: cond === 'Good' ? bin : undefined }); toast.success(`${cond === 'Used up' ? 'Marked used up' : 'Checked in'} · ${qty} × ${it.name}`, { description: credit ? `${money(credit)} credited to ${targetLabel(db, c.target)}` : undefined }); if (jobId && db.checkouts.filter(x => isOpen(x) && x.jobId === jobId).length > 1) setSel(undefined); else onClose() }}>Check in</Button>
        </>}
      </div>
      <Scanner open={scan} onClose={() => setScan(false)} onCode={onScan} title="Scan the item coming back" />
    </Modal>
  )
}

export function Pill({ children, tone }: { children: ReactNode; tone?: 'bad' | 'warn' | 'ok' }) { return <span className={cn('inline-flex items-center h-6 px-2 rounded-full text-[11px] font-semibold', tone === 'bad' ? 'bg-bad/15 text-bad' : tone === 'warn' ? 'bg-warn/15 text-warn' : tone === 'ok' ? 'bg-ok/15 text-ok' : 'bg-surface-2 text-muted')}>{children}</span> }
export const catIcon = (c: T.InvCategory) => CAT_ICON[c]
export { X, Camera }
