/** Hired outside cranes on a job: cover or assist (rig-up / rig-down / work). OUTSIDE tag, not our fleet. Dispatch/ops/branch/owner edit.
 *  Rate & PO only for finance roles (owner, ops, branch, accounting) and never for guests. */
import { useState } from 'react'
import { Plus, Phone, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { canSeeMoney } from '../data/roles'
import { Sheet, Button, Field } from './ui'
import { cn, fmtDate, today } from '../lib/util'
import { OUTSIDE_ROLES, outsideOf, outsidePhase, vendorOf, checkOutside, fmtHours } from '../data/rig'
import { schedStyle, phaseCat, useSchedColors } from '../data/schedColors'

export const OUTSIDE_EDITORS = ['owner', 'ops', 'dispatch', 'branch']
const FINANCE = ['owner', 'ops', 'branch', 'accounting']
export const seesRate = (role?: string) => !!role && FINANCE.includes(role) && canSeeMoney(role)
const STATUS: T.OutsideStatus[] = ['Requested', 'Confirmed', 'On site', 'Done']
const stCls = (s: T.OutsideStatus) => s === 'Confirmed' ? 'bg-info/15 text-info' : s === 'On site' ? 'bg-ok/15 text-ok' : s === 'Done' ? 'bg-surface-3 text-muted' : 'bg-warn/15 text-warn'
export const OutsideTag = () => <span data-testid="outside-tag" className="inline-flex items-center rounded-md px-1.5 h-5 text-[10px] font-black tracking-wider bg-[#7c3aed] text-white">OUTSIDE</span>

export default function OutsideCranes({ job, readOnly }: { job: T.Job; readOnly?: boolean }) {
  const db = useStore(s => s.db), role = useStore(s => s.session?.role), sc = useSchedColors()
  const canEdit = !readOnly && OUTSIDE_EDITORS.includes(role ?? '')
  const money = seesRate(role)
  const list = outsideOf(job)
  const [edit, setEdit] = useState<T.OutsideCrane | 'new' | null>(() => { try { const i = JSON.parse(sessionStorage.getItem('sc-bd-intent') ?? 'null'); if (i?.kind === 'hire' && i.jobId === job.id && canEdit) { sessionStorage.removeItem('sc-bd-intent'); return 'new' } } catch { /* */ } return null }) // dive3 m8: from a breakdown
  if (!list.length && !canEdit) return null
  return <div className="flex flex-col gap-2" data-testid="outside-cranes">
    <div className="flex items-center gap-2"><div className="label flex-1">Outside cranes (hired){list.length ? ` · ${list.length}` : ''}</div>
      {canEdit && <button data-testid="outside-add" onClick={() => setEdit('new')} className="h-10 pointer-coarse:h-[44px] px-3.5 rounded-full bg-surface-2 font-semibold text-sm inline-flex items-center gap-1.5"><Plus className="size-4" />Hire a crane</button>}</div>
    {list.map(o => { const v = vendorOf(db, o.vendorId); return <div key={o.id} data-testid="outside-row" data-role={o.role} className="rounded-2xl border-2 border-dashed border-[#7c3aed]/40 p-3 flex flex-col gap-2">
      <div className="flex items-start gap-2 flex-wrap"><OutsideTag /><div className="flex-1 min-w-0"><div className="font-semibold">{v?.name ?? 'Vendor'} · {o.size}{o.type ? ` ${o.type}` : ''}</div>
        <div className="text-xs text-muted">{o.role} · {o.from === o.to ? fmtDate(o.from) : `${fmtDate(o.from)} – ${fmtDate(o.to)}`}{o.hours ? ` · ${fmtHours(o.hours)}` : ''}{o.operator ? ` · ${o.operator}` : ''}</div></div>
        <span data-testid="outside-status" className={cn('rounded-full px-2.5 h-6 inline-flex items-center text-[11px] font-semibold', stCls(o.status))}>{o.status}</span></div>
      <div className="flex items-center gap-2 flex-wrap">
        <span data-cat={phaseCat(outsidePhase(o))} className="rounded-full px-2 h-6 inline-flex items-center text-[11px] font-semibold" style={schedStyle(phaseCat(outsidePhase(o)), sc.colors, sc.patterns)}>{o.role}</span>
        {(o.phone || v?.phone) && <a data-testid="outside-call" href={`tel:${(o.phone || v!.phone!).replace(/[^0-9+]/g, '')}`} className="h-10 pointer-coarse:h-[44px] px-3 rounded-full bg-ok-solid text-white text-xs font-semibold inline-flex items-center gap-1.5"><Phone className="size-3.5" />{o.phone || v?.phone}</a>}
        {money && (o.rate != null || o.po) && <span data-testid="outside-rate" className="text-xs text-muted">{o.rate != null ? `$${o.rate.toLocaleString()}/day` : ''}{o.po ? ` · ${o.po}` : ''}</span>}
        {canEdit && <button data-testid="outside-edit" onClick={() => setEdit(o)} className="ml-auto h-10 pointer-coarse:h-[44px] px-3 rounded-full bg-surface-2 text-xs font-semibold inline-flex items-center gap-1.5"><Pencil className="size-3.5" />Edit</button>}
      </div>
    </div> })}
    {canEdit && edit && <OutsideEditor job={job} init={edit === 'new' ? null : edit} money={money} onClose={() => setEdit(null)} />}
  </div>
}

function OutsideEditor({ job, init, money, onClose }: { job: T.Job; init: T.OutsideCrane | null; money: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [o, setO] = useState<Partial<T.OutsideCrane>>(init ?? { id: `oc-${Date.now().toString(36)}`, role: 'Cover', status: 'Requested', from: job.startDate < today() ? today() : job.startDate, to: job.endDate, size: '' })
  const [hrs, setHrs] = useState(!!init?.hours), [hf, setHf] = useState(init?.hours?.from ?? '07:00'), [ht, setHt] = useState(init?.hours?.to ?? '12:00')
  const [rate, setRate] = useState(init?.rate != null ? String(init.rate) : '')
  const [nv, setNv] = useState<null | { name: string; contact: string; phone: string; notes: string }>(null)
  const set = (x: Partial<T.OutsideCrane>) => setO(p => ({ ...p, ...x }))
  const full: Partial<T.OutsideCrane> = { ...o, hours: hrs ? { from: hf, to: ht } : undefined, rate: money ? (rate.trim() === '' ? undefined : Number(rate)) : init?.rate }
  const errs = checkOutside(full, job)
  const vendors = db.craneVendors ?? []
  const save = () => { if (errs.length) return; actions.saveOutsideCrane(job.id, full as T.OutsideCrane); toast.success('Outside crane saved'); onClose() }
  const seg = (on: boolean) => cn('h-10 pointer-coarse:h-[44px] px-3 rounded-full text-sm font-semibold', on ? 'bg-ink text-surface' : 'bg-surface-2 text-muted')
  return <Sheet open onClose={onClose} title={init ? 'Edit outside crane' : 'Hire an outside crane'} sub={`Job #${job.jobNo} · not part of our fleet`}
    actions={<>{init && <Button variant="ghost" data-testid="outside-remove" onClick={() => { actions.removeOutsideCrane(job.id, init.id); onClose() }}>Remove</Button>}<Button variant="primary" data-testid="outside-save" disabled={errs.length > 0} onClick={save}>Save</Button></>}>
    <div className="flex flex-col gap-4" data-testid="outside-sheet">
      <Field label="Crane company"><select className="input" data-testid="outside-vendor" value={o.vendorId ?? ''} onChange={e => e.target.value === '__new' ? setNv({ name: '', contact: '', phone: '', notes: '' }) : set({ vendorId: e.target.value })}>
        <option value="">Pick a company…</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}<option value="__new">+ Add a new company</option></select></Field>
      {nv && <div className="rounded-2xl bg-surface-2 p-3 grid grid-cols-2 gap-2" data-testid="vendor-new">
        <input className="input col-span-2" placeholder="Company name" data-testid="vendor-name" value={nv.name} onChange={e => setNv({ ...nv, name: e.target.value })} />
        <input className="input" placeholder="Contact" data-testid="vendor-contact" value={nv.contact} onChange={e => setNv({ ...nv, contact: e.target.value })} />
        <input className="input" placeholder="Phone" inputMode="tel" data-testid="vendor-phone" value={nv.phone} onChange={e => setNv({ ...nv, phone: e.target.value })} />
        <input className="input col-span-2" placeholder="Notes" value={nv.notes} onChange={e => setNv({ ...nv, notes: e.target.value })} />
        <Button className="col-span-2" data-testid="vendor-save" disabled={!nv.name.trim()} onClick={() => { const v = { id: `cv-${Date.now().toString(36)}`, name: nv.name.trim(), contact: nv.contact || undefined, phone: nv.phone || undefined, notes: nv.notes || undefined }; actions.saveCraneVendor(v); set({ vendorId: v.id }); setNv(null) }}>Add company</Button>
      </div>}
      <div><div className="text-xs font-semibold text-muted mb-1.5">Role on this job</div><div className="flex flex-wrap gap-1.5">{OUTSIDE_ROLES.map(r => <button key={r} data-testid={`outside-role-${r.split(' ')[0].toLowerCase()}`} className={seg(o.role === r)} onClick={() => set({ role: r })}>{r}</button>)}</div></div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Crane size"><input className="input" data-testid="outside-size" placeholder="e.g. 220t" value={o.size ?? ''} onChange={e => set({ size: e.target.value })} /></Field>
        <Field label="Type"><input className="input" placeholder="All-terrain, crawler…" value={o.type ?? ''} onChange={e => set({ type: e.target.value })} /></Field>
        <Field label="Operator / contact"><input className="input" value={o.operator ?? ''} onChange={e => set({ operator: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" inputMode="tel" data-testid="outside-phone" value={o.phone ?? ''} onChange={e => set({ phone: e.target.value })} /></Field>
        <Field label="From"><input type="date" className="input" data-testid="outside-from" value={o.from ?? ''} onChange={e => set({ from: e.target.value })} /></Field>
        <Field label="To"><input type="date" className="input" data-testid="outside-to" value={o.to ?? ''} onChange={e => set({ to: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-1.5"><button data-testid="outside-allday" className={seg(!hrs)} onClick={() => setHrs(false)}>All day</button><button data-testid="outside-hours" className={seg(hrs)} onClick={() => setHrs(true)}>Set hours</button>
        {hrs && <><input type="time" className="input w-[7.5rem]" data-testid="outside-hf" value={hf} onChange={e => setHf(e.target.value)} /><span>–</span><input type="time" className="input w-[7.5rem]" data-testid="outside-ht" value={ht} onChange={e => setHt(e.target.value)} /></>}</div>
      <div><div className="text-xs font-semibold text-muted mb-1.5">Status</div><div className="flex flex-wrap gap-1.5">{STATUS.map(s => <button key={s} data-testid={`outside-st-${s.split(' ')[0].toLowerCase()}`} className={seg(o.status === s)} onClick={() => set({ status: s })}>{s}</button>)}</div></div>
      {money && <div className="grid grid-cols-2 gap-3"><Field label="Rate / day (optional)"><input className="input" inputMode="decimal" data-testid="outside-rate-in" value={rate} onChange={e => setRate(e.target.value)} /></Field><Field label="PO (optional)"><input className="input" data-testid="outside-po" value={o.po ?? ''} onChange={e => set({ po: e.target.value })} /></Field></div>}
      {errs.map(e => <div key={e} data-testid="outside-error" className="text-sm text-bad font-semibold">{e}</div>)}
    </div>
  </Sheet>
}
