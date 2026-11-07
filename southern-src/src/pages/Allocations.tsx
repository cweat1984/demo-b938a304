import { useState } from 'react'
import { toast } from 'sonner'
import { Users, UserMinus } from 'lucide-react'
import { useStore, actions } from '../data/store'
import { inScope, byId, fullName, isField } from '../data/logic'
import { cn } from '../lib/util'
import { PageHeader, Avatar, Badge, Card, confirmChoice } from '../components/ui'

const CAP = 15
export default function Allocations() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const [moving, setMoving] = useState<string | null>(null)
  const sups = db.employees.filter(e => e.craft === 'Supervisor' && inScope(e, f))
  const field = db.employees.filter(e => isField(e) && e.craft !== 'Supervisor' && inScope(e, f) && e.status === 'Active')
  const pool = field.filter(e => !e.supervisorId && !e.hallHand)
  const hall = field.filter(e => e.hallHand)
  const assign = async (empId: string, supId: string | undefined) => {
    const e = byId(db.employees, empId)!
    const team = db.employees.filter(x => x.supervisorId === supId).length
    if (supId && team >= CAP) { toast.error(`Team is full (${CAP} max)`); return }
    if (e.supervisorId && e.supervisorId !== supId) { const r = await confirmChoice(`Move ${fullName(e)}?`, `${e.first} leaves ${fullName(byId(db.employees, e.supervisorId))}'s team.`, [{ label: 'Move', value: 1, tone: 'primary' }]); if (!r) return }
    actions.setSupervisor(empId, supId); setMoving(null); toast.success('Allocation updated')
  }
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader eyebrow="Field allocations" title="Teams" sub={`Up to ${CAP} per supervisor · ${pool.length} unallocated · Hall Hands (${hall.length}) stay out of the pool`} />
      {moving && <div className="card p-3 mb-4 flex items-center gap-3 accent-glow border-accent"><span className="text-sm">Moving <b>{fullName(byId(db.employees, moving))}</b> — tap a team</span><button className="ml-auto text-sm text-muted" onClick={() => setMoving(null)}>Cancel</button></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sups.map(s => { const team = db.employees.filter(e => e.supervisorId === s.id); return (
          <Card key={s.id} onClick={moving ? () => assign(moving, s.id) : undefined} className={cn(moving && 'cursor-pointer hover:border-accent')}>
            <div className="flex items-center gap-3 mb-3"><Avatar name={fullName(s)} size={40} /><div className="flex-1"><button onClick={() => open({ type: 'employee', id: s.id })} className="font-semibold hover:text-accent">{fullName(s)}</button><div className="text-xs text-muted">{byId(db.branches, s.branchId)?.code} · {byId(db.divisions, s.divisionId)?.short}</div></div><Badge tone={team.length >= CAP ? 'bad' : team.length >= CAP - 2 ? 'warn' : 'ok'}>{team.length}/{CAP}</Badge></div>
            <div className="flex flex-wrap gap-1.5">{team.map(e => <button key={e.id} onClick={ev => { ev.stopPropagation(); setMoving(e.id) }} className={cn('rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold hover:bg-surface-3', moving === e.id && 'ring-2 ring-accent')}>{e.first} {e.last[0]}. <span className="text-muted font-normal">{e.craft}</span></button>)}</div>
          </Card>) })}
      </div>
      <div className="grid gap-4 md:grid-cols-2 mt-6">
        <Card onClick={moving ? () => assign(moving, undefined) : undefined}><div className="font-semibold mb-3 flex items-center gap-2"><Users className="size-4" />Unallocated pool · {pool.length}</div><div className="flex flex-wrap gap-1.5">{pool.map(e => <button key={e.id} onClick={ev => { ev.stopPropagation(); setMoving(e.id) }} className={cn('rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold', moving === e.id && 'ring-2 ring-accent')}>{fullName(e)} <span className="text-muted font-normal">{e.craft}</span></button>)}{!pool.length && <span className="text-sm text-muted">Everyone is on a team.</span>}</div>{moving && <div className="text-xs text-muted mt-3 inline-flex items-center gap-1"><UserMinus className="size-3.5" />Tap here to return to pool</div>}</Card>
        <Card><div className="font-semibold mb-1">Hall Hands · {hall.length}</div><div className="text-xs text-muted mb-3">Union call-outs — excluded from allocation pool, still dispatchable.</div><div className="flex flex-wrap gap-1.5">{hall.map(e => <button key={e.id} onClick={() => useStore.getState().open({ type: 'employee', id: e.id })} className="rounded-full bg-surface-2 hover:bg-surface-3 px-2.5 py-1 text-xs font-semibold">{fullName(e)} <span className="text-muted font-normal">{e.local}</span></button>)}</div></Card>
      </div>
    </div>
  )
}
