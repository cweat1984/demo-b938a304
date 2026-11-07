import { useMemo } from 'react'
import { toast } from 'sonner'
import { Award, MapPin, Clock, Crown, Wand2 } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName, rankReplacements, absenceOn, branchOf } from '../data/logic'
import { range, fmtDate } from '../lib/util'
import { Modal, Button, Badge, Avatar } from './ui'

export interface FixTarget { jobId: string; empId: string; position: T.CrewPosition; date: string }

/** "The software thinks like a dispatcher": ranked replacements for an absent / blocked crew member. */
export default function FixCrew({ target, onClose }: { target: FixTarget | null; onClose: () => void }) {
  const db = useStore(s => s.db)
  const job = target ? byId(db.jobs, target.jobId) : undefined
  const out = target ? byId(db.employees, target.empId) : undefined
  const ab = target ? absenceOn(db, target.empId, target.date) : undefined
  const dates = useMemo(() => !target || !job ? [] : range(target.date, job.endDate).filter(d => !ab || (d >= ab.from && d <= ab.to)).filter(d => db.assignments.some(a => a.jobId === job.id && a.employeeId === target.empId && a.date === d)), [target, job, ab, db.assignments])
  const ranked = useMemo(() => (target && job ? rankReplacements(db, job, target.date, target.position, [target.empId]) : []), [db, target, job])
  if (!target || !job || !out) return null
  return (
    <Modal open={!!target} onClose={onClose} title={`Replace ${fullName(out)}`} sub={`${target.position} on Job #${job.jobNo}${ab ? ` · ${ab.kind} ${fmtDate(ab.from)}–${fmtDate(ab.to)}` : ''} · ${dates.length || 1} day${dates.length === 1 ? '' : 's'}`} width={620}>
      <div className="flex flex-col gap-2" data-testid="fix-crew">
        <div className="text-xs text-muted mb-1 flex items-center gap-1.5"><Wand2 className="size-3.5 text-accent" />Ranked by: certified & free, distance from home branch, hours this week, knows this crane.</div>
        {ranked.map((r, i) => (
          <div key={r.e.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <span className="num text-sm font-bold w-5 text-muted">{i + 1}</span>
            <Avatar name={fullName(r.e)} size={38} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold flex items-center gap-2">{fullName(r.e)}{i === 0 && <Badge tone="ok">Best match</Badge>}{r.home && <Badge tone="accent"><Crown className="size-3" />Home crane</Badge>}</div>
              <div className="text-xs text-muted flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5"><span className="inline-flex items-center gap-1"><Award className="size-3" />Certs OK</span><span className="inline-flex items-center gap-1"><MapPin className="size-3" />{branchOf(db, r.e.branchId)?.code} · {r.miles} mi</span><span className={`inline-flex items-center gap-1 ${r.hrs > 40 ? 'text-warn' : ''}`}><Clock className="size-3" />{r.hrs.toFixed(0)} h this week</span>{r.perDiem && <span>{r.perDiem}</span>}{r.el.warns.length > 0 && <span className="text-warn">{r.el.warns[0]}</span>}</div>
            </div>
            <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'} data-testid="fix-assign" onClick={() => { actions.replaceCrew(job.id, out.id, r.e.id, target.position, dates.length ? dates : [target.date]); toast.success(`${fullName(r.e)} is on Job #${job.jobNo}`, { description: `${fullName(out)} released · board and alerts updated` }); onClose() }}>Assign</Button>
          </div>
        ))}
        {!ranked.length && <div className="text-sm text-muted p-4">No certified, available {target.position.toLowerCase()} right now. Try a Hall Hand call-out or move someone from a lower-priority job.</div>}
      </div>
    </Modal>
  )
}
