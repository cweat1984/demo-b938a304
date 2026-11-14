/** Requirement H: one-tap add / remove of extra crew and support equipment on a job, each line billable or non-billable
 *  (absorbed cost), with field call-off for equipment (admin setting, default OFF) and the office billing-review list. */
import { useState } from 'react'
import { Plus, Minus, UserPlus, Truck, Undo2, Pencil, ClipboardCheck, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { PEOPLE, EQUIP, EXTRA_EDITORS, EXTRA_MONEY, extrasSummary, extraLabel, extraEnd } from '../data/extras'
import { Button, Badge, Sheet, Field, Segmented, confirmChoice } from './ui'
import { money, fmtDate, cn, today } from '../lib/util'

const NEXT: Record<string, T.CalloffStatus> = { '': 'Requested', Requested: 'Acknowledged', Acknowledged: 'Pickup scheduled', 'Pickup scheduled': 'Picked up' }

export default function JobExtras({ job, field }: { job: T.Job; field?: boolean }) {
  const role = useStore(s => s.session?.role) as T.RoleKey | undefined
  const calloffOn = useStore(s => !!s.db.company?.modules.fieldCalloff)
  const canEdit = !field && !!role && EXTRA_EDITORS.includes(role)
  const seeMoney = !field && !!role && EXTRA_MONEY.includes(role) && role !== 'guest'
  const [mode, setMode] = useState<'add' | 'remove'>('add'), [edit, setEdit] = useState<string | null>(null)
  const sum = extrasSummary(job), xs = job.extras ?? []
  if (field && !extrasOn(job, today()).length) return null
  if (!canEdit && !xs.length) return null
  const quick = async (kind: T.ExtraKind, r: string) => {
    const res = await addOnce(job.id, { kind, role: r, qty: 1, action: mode })
    if (!res) return
    if (!res.ok) { toast.error(res.reason); return }
    toast.success(`${mode === 'remove' ? 'Removed' : 'Added'} 1 ${r}`, { description: 'Billable · from ' + fmtDate(today() > job.startDate ? today() : job.startDate), action: { label: 'Edit', onClick: () => setEdit(res.id) } })
  }
  const step = async (x: T.JobExtra) => { const nx = NEXT[x.calloff?.status ?? '']; if (!nx) return; const r = actions.calloff(job.id, x.id, nx); if (!r.ok) toast.error(r.reason); else toast.success(`${x.role}: ${nx}`, { description: nx === 'Picked up' ? 'Off the ticket from today' : 'Stays on the ticket until picked up' }) }
  const onToday = field ? new Set(extrasOn(job, today()).map(x => x.id)) : null
  const rows = sum.rows.filter(r => !onToday || onToday.has(r.x.id))
  return <div className="flex flex-col gap-3" data-testid="job-extras">
    <div className="flex items-center gap-2 flex-wrap"><div className="label flex-1">{field ? 'Roster check · extras on today' : 'Extra crew & equipment'}</div>
      {canEdit && <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add' }, { value: 'remove', label: 'Remove' }]} />}</div>
    {canEdit && <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">{PEOPLE.map(p => <button key={p.role} data-testid="jx-add" data-role={p.role} onClick={() => quick('person', p.role)} className={cn('min-h-9 pointer-coarse:min-h-[44px] max-sm:min-h-[44px] px-3 rounded-full border text-sm inline-flex items-center gap-1.5', mode === 'remove' ? 'border-bad/40 text-bad' : 'border-line hover:bg-surface-2')}>{mode === 'remove' ? <Minus className="size-3.5" /> : <UserPlus className="size-3.5" />}{p.role}</button>)}</div>
      <div className="flex flex-wrap gap-1.5">{EQUIP.map(p => <button key={p.role} data-testid="jx-add" data-role={p.role} onClick={() => quick('equipment', p.role)} className={cn('min-h-9 pointer-coarse:min-h-[44px] max-sm:min-h-[44px] px-3 rounded-full border text-sm inline-flex items-center gap-1.5', mode === 'remove' ? 'border-bad/40 text-bad' : 'border-line hover:bg-surface-2')}>{mode === 'remove' ? <Minus className="size-3.5" /> : <Truck className="size-3.5" />}{p.role}</button>)}</div>
    </div>}
    {rows.length > 0 && <div className="flex flex-col divide-y hairline rounded-xl border hairline">{rows.map(({ x, days, bill, cost }) => <div key={x.id} className="p-2.5 flex items-center gap-2 flex-wrap text-sm" data-testid="jx-row" data-billable={x.billable ? '1' : '0'}>
      <div className="flex-1 min-w-[180px]"><div className="font-semibold">{extraLabel(x)}</div><div className="text-xs text-muted">{fmtDate(x.from)}{x.fromTime ? ` ${x.fromTime}` : ''} – {fmtDate(extraEnd(job, x))} · {days} day{days === 1 ? '' : 's'}{x.reason ? ` · ${x.reason}` : ''}</div></div>
      {!field && <Badge tone={x.billable ? 'ok' : 'warn'} data-testid="jx-badge">{x.billable ? 'Billable' : 'Non-billable · absorbed'}</Badge>}
      {x.calloff && <Badge tone={x.calloff.status === 'Picked up' ? 'neutral' : 'warn'} data-testid="jx-calloff-status">Call-off: {x.calloff.status}</Badge>}
      {seeMoney && <span className="num text-xs text-right min-w-[110px]" data-testid="jx-money">{x.billable ? <>{bill >= 0 ? 'Charge' : 'Credit'} {money(Math.abs(bill))}</> : <>Absorbed {money(Math.abs(cost))}</>}</span>}
      {x.kind === 'equipment' && x.action === 'add' && x.calloff?.status !== 'Picked up' && (field ? calloffOn && !x.calloff : canEdit) &&
        <Button size="sm" variant="outline" data-testid="jx-calloff" onClick={() => void step(x)}>{x.calloff ? NEXT[x.calloff.status] : field ? 'Call off (release)' : 'Call off'}</Button>}
      {canEdit && <><button aria-label="Edit" data-testid="jx-edit" onClick={() => setEdit(x.id)} className="size-9 pointer-coarse:size-11 max-sm:size-11 grid place-items-center rounded-lg hover:bg-surface-2"><Pencil className="size-4" /></button>
        <button aria-label="Undo" data-testid="jx-undo" onClick={() => { actions.removeExtra(job.id, x.id); toast('Undone') }} className="size-9 pointer-coarse:size-11 max-sm:size-11 grid place-items-center rounded-lg hover:bg-surface-2"><Undo2 className="size-4" /></button></>}
    </div>)}</div>}
    {seeMoney && xs.length > 0 && <div className="grid grid-cols-3 gap-2 text-center" data-testid="jx-totals">
      <div className="rounded-xl bg-surface-2 p-2"><div className="text-[11px] text-muted">Billable amount</div><div className="num font-semibold" data-testid="jx-billable">{money(sum.billable)}</div></div>
      <div className="rounded-xl bg-surface-2 p-2"><div className="text-[11px] text-muted">Absorbed cost</div><div className="num font-semibold text-warn" data-testid="jx-absorbed">{money(sum.absorbed)}</div></div>
      <div className="rounded-xl bg-surface-2 p-2"><div className="text-[11px] text-muted">Margin impact</div><div className={cn('num font-semibold', sum.marginImpact < 0 ? 'text-bad' : 'text-ok')} data-testid="jx-margin">{money(sum.marginImpact)}</div></div>
    </div>}
    {edit && <ExtraSheet job={job} id={edit} onClose={() => setEdit(null)} />}
  </div>
}

function ExtraSheet({ job, id, onClose }: { job: T.Job; id: string; onClose: () => void }) {
  const x = job.extras?.find(y => y.id === id)
  const [f, setF] = useState(() => ({ qty: String(x?.qty ?? 1), from: x?.from ?? job.startDate, fromTime: x?.fromTime ?? '', to: x?.to ?? '', reason: x?.reason ?? '', billable: x?.billable ?? true }))
  if (!x) return null
  const bad = !(Number(f.qty) >= 1 && Number(f.qty) <= 99) ? 'Quantity 1–99' : !f.from ? 'Pick a start date' : f.from < job.startDate ? 'Start is before the job starts' : f.from > job.endDate ? 'Start is after the job ends' : f.to && f.to < f.from ? 'End is before start' : f.to && f.to > job.endDate ? 'End is after the job ends' : null
  const save = () => { if (bad) return; if (actions.updateExtra(job.id, id, { qty: Math.round(Number(f.qty)), from: f.from, fromTime: f.fromTime || undefined, to: f.to || undefined, reason: f.reason.trim() || undefined, billable: f.billable }) === false) { toast.error('Those dates are outside the job'); return } toast.success('Saved'); onClose() }
  return <Sheet open onClose={onClose} title={extraLabel(x)} sub={`Job #${job.jobNo}`}>
    <div className="flex flex-col gap-3" data-testid="jx-sheet">
      <div className="flex items-end gap-2"><Field label="How many"><div className="flex items-center gap-1"><button aria-label="Less" className="size-11 rounded-xl bg-surface-2 grid place-items-center" onClick={() => setF({ ...f, qty: String(Math.max(1, Number(f.qty) - 1)) })}><Minus className="size-4" /></button><input data-testid="jx-qty" inputMode="numeric" className="input w-20 text-center" value={f.qty} onChange={e => setF({ ...f, qty: e.target.value.replace(/\D/g, '') })} /><button aria-label="More" className="size-11 rounded-xl bg-surface-2 grid place-items-center" onClick={() => setF({ ...f, qty: String(Math.min(99, Number(f.qty) + 1)) })}><Plus className="size-4" /></button></div></Field></div>
      <div className="grid grid-cols-2 gap-2"><Field label="Starts"><input type="date" className="input" data-testid="jx-from" value={f.from} min={job.startDate} max={job.endDate} onChange={e => setF({ ...f, from: e.target.value })} /></Field><Field label="Time (optional)"><input type="time" className="input" data-testid="jx-time" value={f.fromTime} onChange={e => setF({ ...f, fromTime: e.target.value })} /></Field></div>
      <Field label="Ends (blank = end of job)"><input type="date" className="input" data-testid="jx-to" value={f.to} min={f.from} max={job.endDate} onChange={e => setF({ ...f, to: e.target.value })} /></Field>
      <Field label="Reason (optional)"><input className="input" data-testid="jx-reason" value={f.reason} placeholder="e.g. customer asked for a second rigger" onChange={e => setF({ ...f, reason: e.target.value })} /></Field>
      <label className="flex items-start gap-3 rounded-xl border hairline p-3 min-h-[44px]"><input type="checkbox" data-testid="jx-billable-toggle" className="size-5 mt-0.5" checked={f.billable} onChange={e => setF({ ...f, billable: e.target.checked })} /><span><b>Billable to the customer</b><span className="block text-xs text-muted">Off = non-billable: we absorb the cost. It shows in job costing / P&amp;L as “Absorbed cost” and never on tickets, invoices or proposals.</span></span></label>
      {bad && <div className="text-sm text-bad" data-testid="jx-error">{bad}</div>}
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="jx-save" disabled={!!bad} onClick={save}>Save</Button></div>
    </div>
  </Sheet>
}

/** dive3 M4: show the net change (lines + total) and create the supplemental invoice or credit memo. */
async function billThis(jobId: string) {
  const db = useStore.getState().db, j = db.jobs.find(x => x.id === jobId)
  const lines = actions.billChangeLines(jobId), total = Math.round(lines.reduce((s, l) => s + l.qty * l.rate, 0) * 100) / 100
  if (!lines.length || Math.abs(total) < 0.01) { const r = actions.billChange(jobId); if (r.ok) toast.success('Nothing left to bill — the invoice already matches. Marked reviewed.'); else toast.error(r.reason); return }
  const what = total > 0 ? `Supplemental invoice for ${money(total)}` : `Credit memo for ${money(-total)}`
  const ok = await confirmChoice(`Bill the change on Job #${j?.jobNo}?`, <div className="flex flex-col gap-1.5 text-sm" data-testid="bill-change-lines">{lines.map((l, i) => <div key={i} className="flex gap-2"><span className="flex-1">{l.description}</span><b>{money(l.rate)}</b></div>)}<div className="border-t hairline pt-1.5 flex"><span className="flex-1">{total > 0 ? 'Supplemental invoice (net more)' : 'Credit memo (net less) — applied to the open invoice'}</span><b>{money(total)}</b></div></div>, [{ label: `Create ${total > 0 ? 'supplemental invoice' : 'credit memo'}`, value: 'go', tone: 'primary' }, { label: 'Cancel', value: 'no' }])
  if (ok?.value !== 'go') return
  const r = actions.billChange(jobId); if (!r.ok) { toast.error(r.reason); return }
  toast.success(`${what} — ${r.invNo}`, { description: r.onAccount ? `${money(r.onAccount)} left as credit on the customer's account (the invoice was already paid).` : undefined })
}

/** Office review list: changes that affect billing (signed / invoiced tickets flagged). */
export function BillingReviewList({ jobId, compact }: { jobId?: string; compact?: boolean }) {
  const db = useStore(s => s.db), role = useStore(s => s.session?.role)
  const list = (db.billingReview ?? []).filter(r => (!jobId || r.jobId === jobId) && (!compact || r.status === 'Open'))
  if (!role || role === 'guest' || role === 'field') return null
  if (!list.length) return jobId ? null : <div className="text-sm text-muted p-3" data-testid="billing-review-empty">No changes waiting for billing review.</div>
  return <div className="flex flex-col gap-2" data-testid="billing-review">
    <div className="label flex items-center gap-1.5"><ClipboardCheck className="size-3.5" />Changes that affect billing · {list.filter(r => r.status === 'Open').length} open</div>
    {list.slice(0, 40).map(r => { const j = db.jobs.find(x => x.id === r.jobId); return <div key={r.id} className={cn('rounded-xl border p-2.5 text-sm flex items-center gap-2 flex-wrap', r.flags.length && r.status === 'Open' ? 'border-warn/50 bg-warn/5' : 'hairline')} data-testid="billing-review-row" data-flags={r.flags.join(',')}>
      <div className="flex-1 min-w-[200px]"><div className="font-semibold">Job #{j?.jobNo} · {r.what}</div><div className="text-xs text-muted">{new Date(r.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short' })} · {r.by}{r.reason ? ` · ${r.reason}` : ''}</div></div>
      {r.flags.map(f => <Badge key={f} tone="warn" data-testid="billing-review-flag"><AlertTriangle className="size-3" />{f === 'signed' ? 'Ticket already signed' : 'Already invoiced'}</Badge>)}
      {r.status === 'Open' && r.flags.includes('invoiced') && ['owner', 'accounting'].includes(role) && <Button size="sm" variant="primary" data-testid="billing-review-bill" onClick={() => billThis(r.jobId)}>Bill this change</Button>}
      {r.billedOn && <Badge tone="ok" data-testid="billing-review-billed">On {r.billedOn}</Badge>}
      {r.status === 'Open' && ['owner', 'ops', 'accounting'].includes(role) ? <Button size="sm" variant="outline" data-testid="billing-review-done" onClick={() => actions.reviewBilling(r.id)}>Mark reviewed</Button> : <Badge tone="neutral">{r.status}{r.reviewedBy ? ` · ${r.reviewedBy}` : ''}</Badge>}
    </div> })}
  </div>
}

/** Extras active on one date (from ≤ date ≤ end, picked-up call-offs end on pickup). */
export const extrasOn = (job: T.Job, date: string) => (job.extras ?? []).filter(x => x.from <= date && extraEnd(job, x) >= date && date >= job.startDate && date <= job.endDate)

/** Customer-facing: what was added / credited on this day's ticket. Billable lines only — absorbed cost never shows. No dollars. */
export function TicketExtras({ job, date, paper }: { job: T.Job; date: string; paper?: boolean }) {
  const xs = extrasOn(job, date).filter(x => x.billable)
  if (!xs.length) return null
  return <div className={cn(paper ? 'mt-1.5 text-black/70' : 'rounded-2xl bg-surface p-3 text-sm')} data-testid="ticket-extras">
    <div className={cn('font-semibold', paper ? 'text-black/80' : '')}>Changes to crew & equipment this day</div>
    {xs.map(x => <div key={x.id} data-testid="ticket-extra" data-action={x.action}>{x.action === 'remove' ? 'Removed (credit): ' : 'Added: '}{x.qty} × {x.role}{x.calloff && x.calloff.status !== 'Picked up' ? ` · call-off ${x.calloff.status.toLowerCase()}` : ''}</div>)}
  </div>
}

/** Dispatch board / schedule: extras on this job for the board's date + one-tap add / remove for that date. */
/** dive3 M5: a quick second tap on the same role asks "another?" instead of silently billing two. */
async function addOnce(jobId: string, x: Parameters<typeof actions.addExtra>[1]) {
  const r = actions.addExtra(jobId, x); if (r.ok || !('dupe' in r) || !r.dupe) return r
  const c = await confirmChoice(`${x.action === 'remove' ? 'Remove' : 'Add'} another ${x.role}?`, `You just ${x.action === 'remove' ? 'removed' : 'added'} one. Tap again only if the job needs ${x.action === 'remove' ? 'one fewer again' : 'a second one'}.`, [{ label: x.action === 'remove' ? 'Remove another' : 'Add another', value: 1 }])
  return c ? actions.addExtra(jobId, { ...x, again: true }) : null
}
export function BoardExtras({ job, date }: { job: T.Job; date: string }) {
  const role = useStore(s => s.session?.role) as T.RoleKey | undefined
  const canEdit = !!role && EXTRA_EDITORS.includes(role)
  const [open, setOpen] = useState(false), [mode, setMode] = useState<'add' | 'remove'>('add')
  const on = extrasOn(job, date)
  if (!on.length && !canEdit) return null
  const tap = async (kind: T.ExtraKind, r: string) => { const res = await addOnce(job.id, { kind, role: r, qty: 1, action: mode, from: date < job.startDate ? job.startDate : date }); if (!res) return; if (!res.ok) toast.error(res.reason); else toast.success(`${mode === 'remove' ? 'Removed' : 'Added'} 1 ${r} on Job #${job.jobNo}`, { description: `From ${fmtDate(date)} · billable — change on the job` }) }
  return <div className="px-4 pb-3 -mt-1 flex flex-wrap items-center gap-1.5" data-testid="board-extras">
    {on.map(x => <span key={x.id} data-testid="board-extra" className={cn('text-[11px] font-semibold rounded-full px-2 py-0.5', x.action === 'remove' ? 'bg-bad/10 text-bad' : 'bg-accent/10 text-accent')}>{extraLabel(x)}{!x.billable && canEdit ? ' · NB' : ''}{x.calloff && x.calloff.status !== 'Picked up' ? ' · call-off' : ''}</span>)}
    {canEdit && <button data-testid="board-extra-add" onClick={() => setOpen(true)} className="text-[11px] font-semibold rounded-full border border-dashed border-line px-2.5 min-h-7 pointer-coarse:min-h-[44px] hover:bg-surface-2">± Extra</button>}
    {open && <Sheet open onClose={() => setOpen(false)} title={`Job #${job.jobNo} · ${fmtDate(date)}`} sub="One tap adds (or removes) one from this day to the end of the job. Billable by default — edit on the job.">
      <div className="flex flex-col gap-3" data-testid="board-extra-sheet">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'add', label: 'Add' }, { value: 'remove', label: 'Remove' }]} />
        <div className="flex flex-wrap gap-1.5">{PEOPLE.map(p => <button key={p.role} data-testid="board-extra-pick" data-role={p.role} onClick={() => tap('person', p.role)} className="min-h-[44px] px-3 rounded-full border border-line text-sm hover:bg-surface-2">{mode === 'remove' ? '− ' : '+ '}{p.role}</button>)}</div>
        <div className="flex flex-wrap gap-1.5">{EQUIP.map(p => <button key={p.role} data-testid="board-extra-pick" data-role={p.role} onClick={() => tap('equipment', p.role)} className="min-h-[44px] px-3 rounded-full border border-line text-sm hover:bg-surface-2">{mode === 'remove' ? '− ' : '+ '}{p.role}</button>)}</div>
        {on.length > 0 && <div className="text-sm"><div className="label mb-1">On this day</div>{on.map(x => <div key={x.id} className="flex items-center gap-2 min-h-[44px]" data-testid="board-extra-row"><span className="flex-1">{extraLabel(x)}{x.reason ? ` · ${x.reason}` : ''}</span><Button size="sm" variant="ghost" data-testid="board-extra-undo" onClick={() => actions.removeExtra(job.id, x.id)}>Undo</Button></div>)}</div>}
      </div>
    </Sheet>}
  </div>
}
