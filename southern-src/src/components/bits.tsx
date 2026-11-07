import type { ReactNode } from 'react'
import { useStore } from '../data/store'
import type * as T from '../data/types'
import { cn } from '../lib/util'
import { byId, eqLabel, fullName, inScope } from '../data/logic'
import { Badge } from './ui'

export const useDb = () => useStore(s => s.db)
export const useFilter = () => useStore(s => s.ui.filter)
export const useScoped = <X extends { divisionId: string; branchId: string }>(arr: X[]) => { const f = useFilter(); return arr.filter(x => inScope(x, f)) }

/** Anything clickable that opens a detail window. A span, not a button: these sit inside row buttons, and a button inside a button is invalid HTML. */
export function Ref({ to, children, className }: { to: T.EntityRef; children: ReactNode; className?: string }) {
  const open = useStore(s => s.open)
  const go = (e: { preventDefault: () => void; stopPropagation: () => void }) => { e.preventDefault(); e.stopPropagation(); open(to) }
  return <span role="link" tabIndex={0} onClick={go} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') go(e) }} data-ref={to.type} className={cn('ref-link text-left', className)}>{children}</span>
}
export function EmpRef({ id, className }: { id?: string; className?: string }) {
  const db = useDb(); const e = byId(db.employees, id)
  if (!e) return <span className="text-faint">—</span>
  return <Ref to={{ type: 'employee', id: e.id }} className={className}>{fullName(e)}</Ref>
}
export function EqRef({ id, className }: { id?: string; className?: string }) {
  const db = useDb(); const e = byId(db.equipment, id)
  if (!e) return <span className="text-faint">—</span>
  return <Ref to={{ type: 'equipment', id: e.id }} className={className}>{eqLabel(e)}</Ref>
}
export function JobRef({ id, className, long }: { id?: string; className?: string; long?: boolean }) {
  const db = useDb(); const j = byId(db.jobs, id)
  if (!j) return <span className="text-faint">—</span>
  return <Ref to={{ type: 'job', id: j.id }} className={className}>#{j.jobNo}{long ? ` · ${j.name}` : ''}</Ref>
}

export const EQ_STATUS_TONE: Record<T.EquipStatus, 'ok' | 'info' | 'warn' | 'bad' | 'accent'> = { Available: 'ok', 'On Job': 'info', 'In Transit': 'accent', Maintenance: 'warn', 'Out of Service': 'bad' }
export const EQ_STATUS_COLOR: Record<T.EquipStatus, string> = { Available: '#22c55e', 'On Job': '#38bdf8', 'In Transit': '#f59e0b', Maintenance: '#a78bfa', 'Out of Service': '#ef4444' }
export function EqStatus({ s }: { s: T.EquipStatus }) { return <Badge tone={EQ_STATUS_TONE[s]} dot>{s}</Badge> }

export const JOB_STATUS_TONE: Record<T.JobStatus, 'ok' | 'info' | 'warn' | 'bad' | 'neutral' | 'accent'> = { Planned: 'neutral', Confirmed: 'info', 'En Route': 'accent', 'On Site': 'ok', Complete: 'neutral', Delayed: 'bad' }
export function DivisionChip({ id }: { id: string }) {
  const db = useDb(); const d = byId(db.divisions, id)
  if (!d) return null
  return <Ref to={{ type: 'division', id: d.id }} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted"><span className="size-2 rounded-full" style={{ background: d.color }} />{d.short}</Ref>
}
export function BranchChip({ id }: { id: string }) {
  const db = useDb(); const b = byId(db.branches, id)
  return b ? <Ref to={{ type: 'branch', id: b.id }} className="text-[11px] font-semibold text-faint cond tracking-wide">{b.code}</Ref> : null
}

export function CustRef({ id, className, children }: { id?: string; className?: string; children?: ReactNode }) {
  const db = useDb(); const c = byId(db.customers, id)
  return c ? <Ref to={{ type: 'customer', id: c.id }} className={className}>{children ?? c.name}</Ref> : <span className="text-faint">—</span>
}
export function VendorRef({ id, className }: { id?: string; className?: string }) {
  const db = useDb(); const v = byId(db.vendors, id)
  return v ? <Ref to={{ type: 'vendor', id: v.id }} className={className}>{v.name}</Ref> : <span className="text-faint">—</span>
}
export function SiteRef({ id, className }: { id?: string; className?: string }) {
  const db = useDb(); const s = byId(db.sites, id)
  return s ? <Ref to={s.windFarmId ? { type: 'windfarm', id: s.windFarmId } : { type: 'site', id: s.id }} className={className}>{s.name}</Ref> : <span className="text-faint">—</span>
}
