import { useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, ArrowDownLeft, SlidersHorizontal, Tag, Repeat, FileText } from 'lucide-react'
import type * as T from '../../data/types'
import { useStore, actions } from '../../data/store'
import { byId } from '../../data/logic'
import { cn, money, fmtDate, today, addDays } from '../../lib/util'
import { Button, Kv, Modal, Field } from '../ui'
import { Ref, VendorRef } from '../bits'
import { QR, Thumb, LocPath, CheckoutFlow, CheckinFlow, Pill } from './kit'
import { itemPhoto, isOpen, openQty, isReturnable, qrFor, targetLabel, targetRef, sdsExpired, rollup, isSwag, targetUnit } from '../../data/invcore'
import { LedgerRow } from '../../pages/Inventory'
import { SdsSheet } from './Sds'

export function ItemView({ i }: { i: T.InventoryItem }) {
  const db = useStore(s => s.db)
  const [flow, setFlow] = useState<null | { k: 'out' } | { k: 'in'; id?: string }>(null)
  const [adj, setAdj] = useState<null | 'adjust' | 'transfer' | 'oos'>(null)
  const [sdsOpen, setSdsOpen] = useState(false)
  const outs = db.checkouts.filter(c => c.itemId === i.id && isOpen(c))
  const out = outs.reduce((s, c) => s + openQty(c), 0)
  const sds = byId(db.sds, i.sdsId)
  const moves = db.invLedger.filter(m => m.itemId === i.id).slice(0, 25)
  return (
    <div className="flex flex-col gap-4" data-testid="item-view">
      <div className="relative rounded-3xl overflow-hidden bg-surface-2"><img src={itemPhoto(i)} alt={i.name} className="w-full aspect-[4/3] object-cover" data-testid="item-photo" />
        <div className="absolute top-3 right-3 rounded-2xl bg-white p-1.5 shadow"><QR value={qrFor.item(i)} size={72} /></div>
        {i.oos && <div className="absolute bottom-0 inset-x-0 bg-bad-solid text-white text-sm font-semibold px-4 py-2">OUT OF SERVICE — {i.oos.reason} · {i.oos.by} {fmtDate(i.oos.at)}</div>}
      </div>
      <LocPath item={i} className="text-sm" />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="primary" size="lg" icon={<ArrowUpRight className="size-5" />} disabled={i.onHand <= 0 || !!i.oos} onClick={() => setFlow({ k: 'out' })} data-testid="item-checkout">Check out</Button>
        <Button size="lg" icon={<ArrowDownLeft className="size-5" />} disabled={!outs.length} onClick={() => setFlow({ k: 'in' })} data-testid="item-checkin">Check in</Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="card-flat p-4"><div className="label">On shelf</div><div className={cn('display text-3xl font-semibold num', i.onHand <= i.min && 'text-warn')} data-testid="item-onhand">{i.onHand}</div></div>
        <div className="card-flat p-4"><div className="label">Out</div><div className="display text-3xl font-semibold num">{out}</div></div>
        <div className="card-flat p-4"><div className="label">Reorder at</div><div className="display text-3xl font-semibold num">{i.min}</div></div>
      </div>
      <div className="card p-4"><Kv k="SKU / part #" v={<span className="font-mono">{i.sku}</span>} /><Kv k="Category" v={`${i.category}${i.sub ? ` · ${i.sub}` : ''}`} /><Kv k="Bin" v={<span className="font-mono">{i.bin}</span>} /><Kv k="Manufacturer" v={i.manufacturer} />{i.vendorId && <Kv k="Vendor" v={<VendorRef id={i.vendorId} />} />}<Kv k="Unit cost" v={money(i.cost)} /><Kv k="Type" v={isReturnable(i) ? 'Returnable — due back' : 'Consumable — leftovers can be checked in'} />
        {i.wll && <Kv k="WLL" v={i.wll} />}{i.serialNo && <Kv k="Serial #" v={<span className="font-mono">{i.serialNo}</span>} />}{i.certDate && <Kv k="Cert / last inspected" v={fmtDate(i.certDate)} />}
        {i.inspectionDue && <Kv k="Inspection due" v={<span className={cn(i.inspectionDue < today() && 'text-bad font-semibold')}>{fmtDate(i.inspectionDue)}</span>} />}</div>
      {i.chemical && <button onClick={() => sds && setSdsOpen(true)} className={cn('card p-4 text-left flex items-center gap-3', sds && 'press hover:bg-surface-2')} data-testid="item-sds"><FileText className={cn('size-6', !sds || sdsExpired(sds) ? 'text-bad' : 'text-warn')} /><span className="flex-1"><span className="block font-semibold">{sds ? sds.product : 'SDS missing'}</span><span className="text-xs text-muted">{sds ? `${sds.signal === 'None' ? 'No signal word' : sds.signal} · rev ${fmtDate(sds.revised)}${sdsExpired(sds) ? ' · older than 3 years' : ''}` : 'Required for every chemical — upload in Safety › SDS library'}</span></span>{sds && sdsExpired(sds) && <Pill tone="bad">Expired</Pill>}</button>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<SlidersHorizontal className="size-4" />} onClick={() => setAdj('adjust')} data-testid="item-adjust">Adjust</Button>
        <Button size="sm" icon={<Repeat className="size-4" />} onClick={() => setAdj('transfer')}>Transfer</Button>
        {(i.category === 'Rigging' || i.serialized) && <Button size="sm" variant={i.oos ? 'ok' : 'ghost'} icon={<Tag className="size-4" />} onClick={() => i.oos ? (actions.invSetOos(i.id, null), toast.success('Back in service — inspection logged')) : setAdj('oos')}>{i.oos ? 'Inspected OK — return to service' : 'Tag out of service'}</Button>}
      </div>
      <div><div className="label mb-2">Who has it now</div><div className="card p-0">{outs.length ? outs.map(c => { const tr = targetRef(c.target); return <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm"><span className="flex-1 min-w-0 truncate">{c.employeeId ? <Ref to={{ type: 'employee', id: c.employeeId }}>{c.byName}</Ref> : c.byName} → {tr ? <Ref to={tr}>{targetLabel(db, c.target)}</Ref> : '—'}</span><span className="num">×{openQty(c)}</span>{c.returnable && <span className={cn('text-xs', c.due < today() ? 'text-bad font-semibold' : 'text-muted')}>{fmtDate(c.due)}</span>}<Button size="sm" variant="ok" onClick={() => setFlow({ k: 'in', id: c.id })}>In</Button></div> }) : <div className="px-4 py-3 text-sm text-muted">Nothing out.</div>}</div></div>
      <div><div className="label mb-2">History</div><div className="card p-0">{moves.length ? moves.map(m => <LedgerRow key={m.id} m={m} hideItem />) : <div className="px-4 py-3 text-sm text-muted">No movements yet.</div>}</div></div>
      <CheckoutFlow open={flow?.k === 'out'} onClose={() => setFlow(null)} itemId={i.id} />
      <CheckinFlow open={flow?.k === 'in'} onClose={() => setFlow(null)} itemId={i.id} checkoutId={flow?.k === 'in' ? flow.id : undefined} />
      <AdjustModal i={i} mode={adj} onClose={() => setAdj(null)} />
      {sds && <SdsSheet sds={sds} open={sdsOpen} onClose={() => setSdsOpen(false)} />}
    </div>
  )
}

function AdjustModal({ i, mode, onClose }: { i: T.InventoryItem; mode: null | 'adjust' | 'transfer' | 'oos'; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [n, setN] = useState(i.onHand); const [why, setWhy] = useState(''); const [br, setBr] = useState(() => db.branches.find(b => b.id !== (i.branchId ?? 'br-okc'))?.id ?? '') /* dive3 shop M9: never default to the same branch */; const [wo, setWo] = useState(false)
  return <Modal open={!!mode} onClose={onClose} title={mode === 'adjust' ? 'Adjust stock' : mode === 'transfer' ? 'Transfer to another branch' : 'Tag out of service'} sub={i.name}>
    <div className="flex flex-col gap-3" data-testid="adjust-modal">
      {mode === 'adjust' && <><Field label={`New on-shelf qty (now ${i.onHand})`}><input type="number" min={0} step={1} className="input" value={n} onChange={e => setN(Number(e.target.value))} data-testid="adj-qty" />{n < 0 && <span className="text-xs text-bad" data-testid="adj-err">Can’t be below 0</span>}</Field><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={wo} onChange={e => setWo(e.target.checked)} />Write-off (lost / damaged / expired)</label></>}
      {mode === 'transfer' && <div className="grid grid-cols-2 gap-3"><Field label="Qty"><input type="number" min={1} step={1} inputMode="numeric" data-testid="tr-qty" className="input" value={n} onChange={e => setN(Number(e.target.value))} /></Field><Field label="To branch"><select className="input" value={br} onChange={e => setBr(e.target.value)}>{db.branches.filter(b => b.id !== (i.branchId ?? 'br-okc')).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field></div>}
      <Field label="Reason (required)"><textarea className="input min-h-20" value={why} onChange={e => setWhy(e.target.value)} data-testid="adj-reason" placeholder={mode === 'oos' ? 'e.g. cut webbing, bent pin, missing tag' : 'Why?'} /></Field>
      <Button variant="primary" size="lg" disabled={!why.trim()} data-testid="adj-save" onClick={() => {
        try {
          if (mode === 'adjust') actions.invAdjust(i.id, n, why, wo ? 'Write-off' : 'Adjust')
          if (mode === 'transfer') { actions.invTransfer(i.id, n, br, why) }
          if (mode === 'oos') actions.invSetOos(i.id, why)
          toast.success('Saved to the ledger'); setWhy(''); onClose()
        } catch (e) { toast.error((e as Error).message) }
      }}>Save</Button>
    </div>
  </Modal>
}

/** Inventory sections for the employee drawer: gear they have now + swag they gave (sales). */
export function EmpInventory({ e }: { e: T.Employee }) {
  const db = useStore(s => s.db)
  const outs = db.checkouts.filter(c => c.employeeId === e.id && isOpen(c) && c.returnable)
  const swag = rollup(db, m => (m.by === e.id ? 'me' : undefined), m => isSwag(db, m) && m.at.slice(0, 10) >= addDays(today(), -90))[0]
  const byCust = rollup(db, m => (m.target?.kind === 'customer' ? m.target.id : undefined), m => m.by === e.id && isSwag(db, m) && m.at.slice(0, 10) >= addDays(today(), -90)).slice(0, 5)
  return <>
    {outs.length > 0 && <div><div className="label mb-2">Has right now</div><div className="card p-0">{outs.map(c => { const it = byId(db.items, c.itemId); return it ? <div key={c.id} className="flex items-center gap-3 px-4 py-2 border-b hairline last:border-0 text-sm"><Thumb item={it} size={30} /><Ref to={{ type: 'item', id: it.id }} className="flex-1 truncate">{openQty(c)} × {it.name}</Ref><span className={cn('text-xs', c.due < today() ? 'text-bad font-semibold' : 'text-muted')}>due {fmtDate(c.due)}</span></div> : null })}</div></div>}
    {swag && <div data-testid="emp-swag"><div className="label mb-2">Swag given · 90 days</div><div className="card p-4"><div className="flex items-baseline gap-2"><span className="display text-2xl font-semibold num">{money(swag.cost)}</span><span className="text-sm text-muted">{swag.qty} pieces</span></div>{byCust.map(r => <div key={r.key} className="flex text-sm mt-1"><Ref to={{ type: 'customer', id: r.key }} className="flex-1">{byId(db.customers, r.key)?.name}</Ref><span className="num">{money(r.cost)}</span></div>)}</div></div>}
  </>
}
/** Equipment drawer: parts & supplies drawn from inventory onto this unit (direct + via work orders). */
export function UnitInventory({ e }: { e: T.Equipment }) {
  const db = useStore(s => s.db)
  const r = rollup(db, m => (targetUnit(db, m.target) === e.id ? 'u' : undefined), m => m.at.slice(0, 10) >= addDays(today(), -90))[0]
  if (!r) return null
  const top = rollup(db, m => (targetUnit(db, m.target) === e.id ? m.itemId : undefined), m => m.at.slice(0, 10) >= addDays(today(), -90)).slice(0, 4)
  return <div data-testid="unit-inventory"><div className="label mb-2">Parts & supplies from inventory · 90 days</div><div className="card p-4"><div className="display text-2xl font-semibold num">{money(r.cost)}</div>{top.map(t => <div key={t.key} className="flex text-sm mt-1"><Ref to={{ type: 'item', id: t.key }} className="flex-1 truncate">{byId(db.items, t.key)?.name}</Ref><span className="num">{money(t.cost)}</span></div>)}</div></div>
}
