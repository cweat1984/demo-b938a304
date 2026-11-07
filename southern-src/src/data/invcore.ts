// Inventory core — pure functions shared by seed, store actions and UI. No store imports.
import type * as T from './types'
import { today, addDays } from '../lib/util'

export const INV_CATS: T.InvCategory[] = ['Parts', 'Fluids & Oils', 'Filters', 'Tires', 'Rigging', 'Tools', 'PPE & Safety', 'Shop Consumables', 'Office', 'Swag']
export const CAT_ICON: Record<T.InvCategory, string> = { Parts: '⚙️', 'Fluids & Oils': '🛢️', Filters: '🧪', Tires: '🛞', Rigging: '⛓️', Tools: '🔧', 'PPE & Safety': '🦺', 'Shop Consumables': '🧴', Office: '📎', Swag: '🧢' }
const CAT_HUE: Record<T.InvCategory, number> = { Parts: 215, 'Fluids & Oils': 30, Filters: 190, Tires: 0, Rigging: 355, Tools: 260, 'PPE & Safety': 48, 'Shop Consumables': 160, Office: 230, Swag: 335 }

export const TARGETS: { kind: T.InvTargetKind; label: string; hint: string }[] = [
  { kind: 'job', label: 'Job', hint: 'Job number' },
  { kind: 'crane', label: 'Crane', hint: 'Crane unit' },
  { kind: 'craneService', label: 'Crane service', hint: 'Work order on a crane' },
  { kind: 'truckService', label: 'Truck service', hint: 'Work order on a semi / trailer' },
  { kind: 'equipService', label: 'Equipment service', hint: 'Work order on other equipment' },
  { kind: 'employee', label: 'Employee', hint: 'Issued to a person' },
  { kind: 'customer', label: 'Sales customer', hint: 'Swag / giveaways' },
]
export const targetName = (k: T.InvTargetKind) => TARGETS.find(t => t.kind === k)?.label ?? k
export const isService = (k?: T.InvTargetKind) => k === 'truckService' || k === 'craneService' || k === 'equipService'

/** Units still out on a checkout. */
export const openQty = (c: T.Checkout) => Math.max(0, c.qty - (c.returnedQty ?? 0) - (c.usedUp ?? 0))
export const isOpen = (c: T.Checkout) => !c.returned && openQty(c) > 0
export const isReturnable = (i?: T.InventoryItem) => !!i && (i.returnable ?? (i.category === 'Tools' || i.category === 'Rigging'))
export const isLow = (i: T.InventoryItem) => i.onHand <= i.min
export const sdsExpired = (s?: T.Sds) => !!s && s.revised < addDays(today(), -365 * 3)

export function targetLabel(db: T.DB, t?: T.InvTarget): string {
  if (!t) return '—'
  switch (t.kind) {
    case 'job': { const j = db.jobs.find(x => x.id === t.id); return j ? `Job #${j.jobNo}` : 'Job' }
    case 'crane': { const e = db.equipment.find(x => x.id === t.id); return e ? `Crane ${e.unit}` : 'Crane' }
    case 'employee': { const e = db.employees.find(x => x.id === t.id); return e ? `${e.first} ${e.last}` : 'Employee' }
    case 'customer': return db.customers.find(x => x.id === t.id)?.name ?? 'Customer'
    default: { const w = db.workOrders.find(x => x.id === t.id); const u = w && db.equipment.find(e => e.id === w.unitId); return w ? `${w.woNo} · ${u?.unit ?? ''}` : 'Work order' }
  }
}
export function targetRef(t?: T.InvTarget): T.EntityRef | undefined {
  if (!t) return undefined
  if (t.kind === 'job') return { type: 'job', id: t.id }
  if (t.kind === 'crane') return { type: 'equipment', id: t.id }
  if (t.kind === 'employee') return { type: 'employee', id: t.id }
  if (t.kind === 'customer') return { type: 'customer', id: t.id }
  return { type: 'workorder', id: t.id }
}
/** Equipment unit a target ultimately lands on (crane or the unit behind a work order). */
export const targetUnit = (db: T.DB, t?: T.InvTarget) => !t ? undefined : t.kind === 'crane' ? t.id : isService(t.kind) ? db.workOrders.find(w => w.id === t.id)?.unitId : undefined

export function locPath(db: T.DB, i: T.InventoryItem): string[] {
  const br = db.branches.find(b => b.id === (i.branchId ?? 'br-okc'))
  return [br?.name.replace(' (HQ)', '') ?? 'Branch', ...(i.loc ? [i.loc.building, i.loc.aisle, i.loc.shelf, i.loc.bin] : [i.bin])]
}

/** Placeholder product photo: category-tinted tile with icon + name (used until a real photo is attached). */
export function itemPhoto(i: T.InventoryItem): string {
  if (i.photo) return i.photo
  const h = CAT_HUE[i.category] ?? 210
  const words = i.name.replace(/[—(].*$/, '').trim().split(/\s+/)
  const l1 = words.slice(0, 3).join(' '), l2 = words.slice(3, 6).join(' ')
  const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 45% 30%)"/><stop offset="1" stop-color="hsl(${h} 50% 14%)"/></linearGradient></defs><rect width="240" height="180" fill="url(#g)"/><circle cx="190" cy="40" r="70" fill="#fff" opacity=".06"/><text x="120" y="92" font-size="64" text-anchor="middle">${i.icon ?? CAT_ICON[i.category]}</text><text x="120" y="140" font-family="Inter,Arial" font-weight="600" font-size="15" fill="#fff" text-anchor="middle">${esc(l1)}</text><text x="120" y="160" font-family="Inter,Arial" font-size="12" fill="#fff" opacity=".7" text-anchor="middle">${esc(l2)}</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

// ---------- QR codes ----------
export const qrFor = {
  item: (i: T.InventoryItem) => `INV:${i.sku}`,
  bin: (code: string) => `BIN:${code}`,
  unit: (e: T.Equipment) => `EQ:${e.unit}`,
  emp: (e: T.Employee) => `EMP:${e.empNo}`,
  job: (j: T.Job) => `JOB:${j.jobNo}`,
  wo: (w: T.WorkOrder) => `WO:${w.woNo}`,
}
export type ScanHit =
  | { kind: 'item'; item: T.InventoryItem }
  | { kind: 'bin'; code: string; items: T.InventoryItem[] }
  | { kind: 'unit'; unit: T.Equipment }
  | { kind: 'emp'; emp: T.Employee }
  | { kind: 'job'; job: T.Job }
  | { kind: 'wo'; wo: T.WorkOrder }
  | { kind: 'none'; code: string }
/** Resolve a scanned or typed code. Accepts prefixed QR payloads or bare SKU / bin / unit / job / WO numbers. */
export function resolveScan(db: T.DB, raw: string): ScanHit {
  const code = raw.trim(); const up = code.toUpperCase()
  const [pre, rest] = up.includes(':') ? [up.slice(0, up.indexOf(':')), up.slice(up.indexOf(':') + 1)] : ['', up]
  const item = db.items.find(i => i.sku.toUpperCase() === rest)
  if ((pre === 'INV' || !pre) && item) return { kind: 'item', item }
  const binItems = db.items.filter(i => i.bin.toUpperCase() === rest)
  if ((pre === 'BIN' || !pre) && binItems.length) return { kind: 'bin', code: binItems[0].bin, items: binItems }
  const unit = db.equipment.find(e => e.unit.toUpperCase() === rest || e.code.toUpperCase() === rest)
  if ((pre === 'EQ' || !pre) && unit) return { kind: 'unit', unit }
  const emp = db.employees.find(e => e.empNo.toUpperCase() === rest)
  if ((pre === 'EMP' || !pre) && emp) return { kind: 'emp', emp }
  const job = db.jobs.find(j => j.jobNo.toUpperCase() === rest.replace(/^#/, ''))
  if ((pre === 'JOB' || !pre) && job) return { kind: 'job', job }
  const wo = db.workOrders.find(w => w.woNo.toUpperCase() === rest)
  if ((pre === 'WO' || !pre) && wo) return { kind: 'wo', wo }
  return { kind: 'none', code }
}

// ---------- cost posting (job / work order) ----------
/** Post (qty > 0) or credit back (qty < 0) the cost of a checkout to its job or work order. Mutates db. */
export function postInvCost(db: T.DB, c: T.Checkout, qty: number, date: string, by: string, idSeed: string) {
  const it = db.items.find(i => i.id === c.itemId); if (!it || !qty) return
  const cost = c.unitCost ?? it.cost
  if (c.jobId) {
    db.costs.push({ id: `ic-${idSeed}`, jobId: c.jobId, date, category: 'Materials', description: `${qty < 0 ? 'Returned' : 'Inventory'}: ${Math.abs(qty)} ${it.unit} × ${it.name}`, amount: Math.round(qty * cost * 100) / 100, qty: Math.abs(qty), unit: it.unit, source: 'Inventory', refId: c.id, by })
  }
  if (c.target && isService(c.target.kind)) {
    const w = db.workOrders.find(x => x.id === c.target!.id)
    if (w) w.parts.push({ name: `${qty < 0 ? 'Returned · ' : ''}${it.name} (${it.sku})`, qty, cost })
  }
}

// ---------- rollups ----------
export interface Rollup { key: string; qty: number; cost: number; lines: T.InvMove[] }
/** Net inventory spend grouped by a key derived from each check-out/return move. */
export function rollup(db: T.DB, keyOf: (m: T.InvMove) => string | undefined, filter: (m: T.InvMove) => boolean = () => true): Rollup[] {
  const map = new Map<string, Rollup>()
  db.invLedger.filter(m => (m.kind === 'Check-out' || m.kind === 'Return') && filter(m)).forEach(m => {
    const k = keyOf(m); if (!k) return
    const r = map.get(k) ?? { key: k, qty: 0, cost: 0, lines: [] }
    r.qty += -m.qty; r.cost += -m.qty * m.unitCost; r.lines.push(m); map.set(k, r)
  })
  return [...map.values()].filter(r => Math.abs(r.cost) > 0.001).sort((a, b) => b.cost - a.cost)
}
export const itemOf = (db: T.DB, m: { itemId: string }) => db.items.find(i => i.id === m.itemId)
export const isSwag = (db: T.DB, m: T.InvMove) => itemOf(db, m)?.category === 'Swag' || m.target?.kind === 'customer'

/** Shrink = stock that disappeared without a checkout: negative adjustments, count variances, write-offs. */
export const shrinkMoves = (db: T.DB) => db.invLedger.filter(m => (m.kind === 'Adjust' || m.kind === 'Count' || m.kind === 'Write-off') && m.qty < 0)

/** Order-up-to level. Falls back to min × 2 (or min + reorder qty) when no max is set. */
export const maxOf = (i: T.InventoryItem) => i.max ?? Math.max(i.min * 2, i.min + (i.reorderQty ?? 1), 1)
const OPEN_PO: T.PurchaseOrder['status'][] = ['Draft', 'Sent', 'Partially Received']
export const poIsOpen = (p: T.PurchaseOrder) => OPEN_PO.includes(p.status)
/** Units ordered but not yet on the shelf (drafts count, so the reorder list never double-orders). */
export const onOrderQty = (db: T.DB, itemId: string) => db.pos.filter(poIsOpen).reduce((s, p) => s + p.lines.filter(l => l.itemId === itemId).reduce((a, l) => a + Math.max(0, l.qty - l.received), 0), 0)
export function suggestedReorder(db: T.DB, branchId?: string) {
  return db.items.filter(i => (!branchId || (i.branchId ?? 'br-okc') === branchId) && isLow(i) && !i.oos)
    .map(i => { const onOrder = onOrderQty(db, i.id); return { item: i, onOrder, qty: Math.max(Math.ceil(maxOf(i) - i.onHand - onOrder), 1) } })
    .filter(x => x.item.onHand + x.onOrder <= x.item.min)
}
/** Single source of truth for low stock on every page: `low` = in service and at or below min;
 *  `toReorder` = the part of `low` not already covered by open POs (what the Reorder list suggests). */
export function lowStock(db: T.DB, branchId = 'br-okc') {
  const low = db.items.filter(i => (i.branchId ?? 'br-okc') === branchId && isLow(i) && !i.oos)
  return { low, toReorder: suggestedReorder(db, branchId), label: 'At or below min' }
}
/** Suggested reorder grouped by vendor → one PO per vendor. */
export function reorderByVendor(db: T.DB, branchId = 'br-okc') {
  const m = new Map<string, ReturnType<typeof suggestedReorder>>()
  suggestedReorder(db, branchId).forEach(x => { const v = x.item.vendorId ?? 'ven-10'; m.set(v, [...(m.get(v) ?? []), x]) })
  return [...m.entries()].map(([vendorId, rows]) => ({ vendorId, rows, total: rows.reduce((s, r) => s + r.qty * r.item.cost, 0) })).sort((a, b) => b.total - a.total)
}
export const poTotal = (p: T.PurchaseOrder) => Math.round(p.lines.reduce((s, l) => s + l.qty * l.cost, 0) * 100) / 100
export const poReceivedValue = (p: T.PurchaseOrder) => Math.round(p.lines.reduce((s, l) => s + l.received * l.cost, 0) * 100) / 100
export const PO_FLOW: T.PurchaseOrder['status'][] = ['Draft', 'Sent', 'Partially Received', 'Received', 'Closed']

/** 3-way match: what we ordered (PO) vs what showed up in good shape (receipt) vs what the vendor billed (invoice). */
export function threeWay(db: T.DB, bill: T.VendorBill) {
  const po = bill.poId ? db.pos.find(p => p.id === bill.poId) : db.pos.find(p => p.billIds?.includes(bill.id))
  if (!po) return null
  // everything billed on this PO so far (all bills), so a second invoice can't re-bill the same units
  const bills = db.bills.filter(b => b.status !== 'Rejected' && (b.poId === po.id || po.billIds?.includes(b.id)))
  const billedQty = (itemId: string) => bills.reduce((s, b) => s + (b.invoiceLines ?? []).filter(l => l.itemId === itemId).reduce((a, l) => a + l.qty, 0), 0)
  const lines = po.lines.map(l => {
    const inv = (bill.invoiceLines ?? []).find(x => x.itemId === l.itemId)
    const billed = billedQty(l.itemId); const price = inv?.price ?? l.cost
    const issues: string[] = []
    if (billed > l.received) issues.push(`billed ${billed}, only ${l.received} received good${l.damaged ? ` (${l.damaged} damaged)` : ''}`)
    if (inv && Math.abs(price - l.cost) > Math.max(0.02 * l.cost, 0.01)) issues.push(`price ${price.toFixed(2)} vs PO ${l.cost.toFixed(2)}`)
    if (billed > l.qty) issues.push(`billed more than ordered (${l.qty})`)
    return { item: db.items.find(i => i.id === l.itemId), ordered: l.qty, received: l.received, damaged: l.damaged ?? 0, billed: inv?.qty ?? 0, billedAll: billed, poPrice: l.cost, price, ok: !issues.length, issues }
  }).filter(x => x.billed || x.received || x.ordered)
  const billedAmt = bill.lines.reduce((s, l) => s + l.amount, 0)
  const ok = lines.every(l => l.ok)
  return { po, lines, ok, ordered: poTotal(po), received: poReceivedValue(po), billed: Math.round(billedAmt * 100) / 100, overBy: Math.round(lines.reduce((s, l) => s + Math.max(0, l.billedAll - l.received) * l.price, 0) * 100) / 100 }
}

/** Why a count didn't match. Picked from a list so shrink reports group cleanly. */
export const ADJ_REASONS = ['Not checked out (taken without scanning)', 'Miscounted last time', 'Damaged / scrapped — not written off', 'Found stock (wrong bin or behind shelf)', 'Received but never logged', 'Used on a job, not checked out', 'Theft suspected', 'Other']

/** Items with stock on the shelf that nobody has checked out in `days` days. */
export function slowMovers(db: T.DB, days = 21, branchId = 'br-okc') {
  const since = addDays(today(), -days)
  const last = new Map<string, string>()
  db.invLedger.forEach(m => { if (m.kind === 'Check-out') { const p = last.get(m.itemId); if (!p || m.at > p) last.set(m.itemId, m.at) } })
  return db.items.filter(i => (i.branchId ?? 'br-okc') === branchId && i.onHand > 0 && (last.get(i.id) ?? '') < since)
    .map(i => ({ item: i, lastOut: last.get(i.id), value: i.onHand * i.cost })).sort((a, b) => b.value - a.value)
}
/** Shelf value grouped by branch › building. */
export function valueByLocation(db: T.DB) {
  const m = new Map<string, { branchId: string; building: string; value: number; items: number }>()
  db.items.forEach(i => { const b = i.branchId ?? 'br-okc'; const bld = i.loc?.building ?? 'Receiving'; const k = `${b}|${bld}`; const r = m.get(k) ?? { branchId: b, building: bld, value: 0, items: 0 }; r.value += i.onHand * i.cost; r.items++; m.set(k, r) })
  return [...m.values()].sort((a, b) => b.value - a.value)
}
/** Shelf code used for cycle counts (bin minus the bin number). */
export const shelfOf = (i: T.InventoryItem) => i.bin.replace(/-B\d+$/, '')
