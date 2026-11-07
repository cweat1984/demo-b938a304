import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, History, Check, AlertTriangle } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName } from '../data/logic'
import { cn, fmtTs } from '../lib/util'
import { Button, Badge } from './ui'
import { MYINFO_FIELDS, INFO_SECTIONS, RELATIONS, getPath, emergencyOf } from '../data/myinfo'

/** Self-service profile form. Driven entirely by MYINFO_FIELDS — add a field there and it appears here, in history and in HR's view. */
export function MyInfoForm({ empId, big }: { empId: string; big?: boolean }) {
  const db = useStore(s => s.db)
  const e = byId(db.employees, empId)!
  const init = useMemo(() => Object.fromEntries(MYINFO_FIELDS.map(f => [f.key, getPath(e, f.path)])), [e])
  const [v, setV] = useState<Record<string, string>>(init)
  const [ec, setEc] = useState<T.EmergencyContact[]>(() => emergencyOf(e).map(c => ({ ...c })))
  const dirty = MYINFO_FIELDS.some(f => (v[f.key] ?? '').trim() !== init[f.key]) || JSON.stringify(ec) !== JSON.stringify(emergencyOf(e))
  const ecOk = ec.every(c => c.name.trim() && c.phone.replace(/\D/g, '').length >= 10)
  // n8: emails must look like emails
  const badEmail = MYINFO_FIELDS.filter(f => f.type === 'email' || /email/i.test(f.key)).find(f => (v[f.key] ?? '').trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((v[f.key] ?? '').trim()))
  const blankRow = ec.some(c => !c.name.trim() && !c.phone.trim())
  const save = () => {
    const payroll = MYINFO_FIELDS.some(f => f.payroll && (v[f.key] ?? '').trim() !== init[f.key])
    const n = actions.updateMyInfo(empId, v, ec)
    if (n) toast.success('Saved — HR notified', { description: payroll ? 'Address changed: payroll will update tax withholding' : `${n} change${n === 1 ? '' : 's'} recorded` })
  }
  const inp = cn('input scroll-mb-28', big && 'h-14 text-[17px]')
  return (
    <div className="space-y-6" data-testid="myinfo-form">
      <section>
        <div className="label mb-2">Emergency contacts</div>
        <div className="space-y-3">
          {ec.map((c, i) => (
            <div key={i} className="rounded-2xl border border-line p-3 grid gap-2 sm:grid-cols-[1fr_9rem_11rem_auto]" data-testid="ec-row">
              <input className={inp} placeholder="Name" value={c.name} onChange={x => setEc(ec.map((y, k) => k === i ? { ...y, name: x.target.value } : y))} data-testid={`ec-name-${i}`} />
              <select className={inp} value={c.relation} onChange={x => setEc(ec.map((y, k) => k === i ? { ...y, relation: x.target.value } : y))}>{RELATIONS.map(r => <option key={r}>{r}</option>)}</select>
              <input className={inp} type="tel" placeholder="Phone" value={c.phone} onChange={x => setEc(ec.map((y, k) => k === i ? { ...y, phone: x.target.value } : y))} data-testid={`ec-phone-${i}`} />
              <button className="btn-icon justify-self-end" aria-label="Remove contact" onClick={() => setEc(ec.filter((_, k) => k !== i))}><Trash2 className="size-4" /></button>
            </div>
          ))}
          <Button icon={<Plus className="size-4" />} disabled={blankRow} onClick={() => setEc([...ec, { name: '', relation: 'Spouse', phone: '' }])} data-testid="ec-add">Add contact</Button>
        </div>
      </section>
      {INFO_SECTIONS.map(sec => (
        <section key={sec}>
          <div className="label mb-2">{sec}</div>
          <div className={cn('grid gap-3', sec === 'Swag & uniform sizes' ? 'grid-cols-2 sm:grid-cols-3' : 'sm:grid-cols-2')}>
            {MYINFO_FIELDS.filter(f => f.section === sec).map(f => (
              <label key={f.key} className={cn('block', f.type === 'textarea' && 'sm:col-span-2')}>
                <span className="text-xs text-muted">{f.label}{f.payroll && ' · updates payroll/tax'}</span>
                {f.type === 'select' ? <select className={inp} value={v[f.key]} onChange={x => setV({ ...v, [f.key]: x.target.value })} data-testid={`mi-${f.key}`}><option value="">—</option>{f.options!.map(o => <option key={o}>{o}</option>)}</select>
                  : f.type === 'textarea' ? <textarea className={cn('input min-h-16', big && 'text-[17px]')} placeholder={f.placeholder} value={v[f.key]} onChange={x => setV({ ...v, [f.key]: x.target.value })} data-testid={`mi-${f.key}`} />
                  : <input className={inp} type={f.type ?? 'text'} placeholder={f.placeholder} value={v[f.key]} onChange={x => setV({ ...v, [f.key]: x.target.value })} data-testid={`mi-${f.key}`} />}
              </label>
            ))}
          </div>
        </section>
      ))}
      <div className="h-4" aria-hidden />
      <div className="sticky bottom-0 bg-bg/90 backdrop-blur py-3">
        <Button variant="primary" size="lg" className="w-full" disabled={!dirty || !ecOk || !!badEmail} onClick={save} data-testid="myinfo-save">{dirty ? 'Save changes' : 'All saved'}</Button>
        {!ecOk && <div className="text-xs text-bad mt-1">Each emergency contact needs a name and a 10-digit phone.</div>}
        {badEmail && <div className="text-xs text-bad mt-1" data-testid="mi-bad-email">{badEmail.label}: enter a real email, like name@example.com.</div>}
      </div>
      <InfoHistory empId={empId} />
    </div>
  )
}

export function InfoHistory({ empId, hr }: { empId: string; hr?: boolean }) {
  const db = useStore(s => s.db)
  const ch = (db.infoChanges ?? []).filter(c => c.employeeId === empId)
  if (!ch.length) return null
  const unseen = ch.filter(c => !c.hrSeen)
  return (
    <section data-testid="info-history">
      <div className="flex items-center gap-2 mb-2"><History className="size-4 text-muted" /><span className="label">Change history</span>
        {hr && unseen.length > 0 && <Button size="sm" className="ml-auto" icon={<Check className="size-4" />} onClick={() => actions.hrSeenInfo(unseen.map(c => c.id))} data-testid="info-reviewed">Mark {unseen.length} reviewed</Button>}</div>
      <div className="space-y-1.5">
        {ch.slice(0, 12).map(c => <div key={c.id} className="text-sm rounded-xl bg-surface-2 px-3 py-2">
          <div className="flex items-center gap-2"><b>{c.label}</b>{c.payroll && <Badge tone="warn">Payroll / tax</Badge>}{!c.hrSeen && <Badge tone="info">New to HR</Badge>}<span className="ml-auto text-xs text-muted">{fmtTs(c.at)} · {c.by}</span></div>
          <div className="text-muted truncate"><s>{c.from || '—'}</s> → <span className="text-ink">{c.to || '—'}</span></div>
        </div>)}
      </div>
    </section>
  )
}

/** HR / owner read view inside the employee drawer. */
export function EmpInfoPanel({ e }: { e: T.Employee }) {
  const role = useStore(s => s.session!.role)
  const [edit, setEdit] = useState(false)
  const hr = ['hr', 'owner', 'payroll'].includes(role)
  const ec = emergencyOf(e)
  if (!hr) return e.sizes ? <div className="text-sm text-muted mt-2">Sizes: {MYINFO_FIELDS.filter(f => f.section === 'Swag & uniform sizes' && getPath(e, f.path)).map(f => `${f.label} ${getPath(e, f.path)}`).join(' · ')}</div> : null
  return (
    <div className="mt-4 rounded-2xl border border-line p-4" data-testid="emp-info">
      <div className="flex items-center mb-2"><div className="font-semibold">My Info (self-service)</div><Button size="sm" className="ml-auto" onClick={() => setEdit(!edit)}>{edit ? 'Done' : 'Edit for employee'}</Button></div>
      {edit ? <MyInfoForm empId={e.id} /> : <>
        <div className="text-sm space-y-1">
          {ec.map((c, i) => <div key={i}><span className="text-muted">Emergency {i + 1}:</span> {c.name} ({c.relation}) <a className="underline" href={`tel:${c.phone}`}>{c.phone}</a></div>)}
          {!ec.length && <div className="text-bad flex items-center gap-1"><AlertTriangle className="size-4" />No emergency contact on file</div>}
          {MYINFO_FIELDS.map(f => getPath(e, f.path) && <div key={f.key}><span className="text-muted">{f.label}:</span> {getPath(e, f.path)}</div>)}
        </div>
        <div className="mt-3"><InfoHistory empId={e.id} hr /></div>
      </>}
    </div>
  )
}
