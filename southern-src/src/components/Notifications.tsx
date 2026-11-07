import { useMemo } from 'react'
import { useB4 } from '../batch4/b4store'
import { AlertTriangle, Bell, CheckCheck, Info, ShieldAlert, Siren } from 'lucide-react'
import { useStore, actions } from '../data/store'
import type * as T from '../data/types'
import { billsToCode, timeFlagged } from '../data/counts'
import { inScope, byId, certBand, fullName, jobConflicts, jobsOn, serviceStatus, agingBucket, isField, absenceOn } from '../data/logic'
import { today, addDays, timeAgo, cn } from '../lib/util'
import { Sheet, Badge } from './ui'

export interface Alert { id: string; severity: T.Notice['severity']; title: string; body: string; ref?: T.EntityRef; mandatory: boolean; read: boolean; at: string; page?: string; fix?: { jobId: string; empId: string; position: T.CrewPosition; date: string } }

/** Live alerts computed from data + stored notices, filtered to the current role. Mandatory alerts can't be hidden by personalization. */
export function useAlerts(): Alert[] {
  const db = useStore(s => s.db)
  const role = useStore(s => s.session?.role) ?? 'owner'
  const b4feed = useB4(s => s.feed)
  const scope = useStore(s => s.ui.filter)
  return useMemo(() => {
    const out: Alert[] = []
    const t = today()
    const now = new Date().toISOString()
    db.notices.filter(n => !n.empIds && (n.roles?.includes(role) || role === 'owner')).forEach(n => out.push({ ...n }))
    if (['owner', 'dispatch', 'ops'].includes(role)) {
      [...new Set(jobsOn(db, t).concat(jobsOn(db, addDays(t, 1))))].filter(j => inScope(j, scope)).forEach(j => {
        const d = j.startDate <= t && j.endDate >= t && jobsOn(db, t).includes(j) ? t : addDays(t, 1)
        jobConflicts(db, j, d).filter(c => c.level === 'red').slice(0, 1).forEach(c => { const asg = c.empId ? db.assignments.find(x => x.jobId === j.id && x.employeeId === c.empId && x.date === d) : undefined; out.push({ id: `cf-${j.id}-${d}`, severity: 'Action Required', title: c.text, body: `Job #${j.jobNo} · ${d === t ? 'today' : 'tomorrow'}`, ref: { type: 'job', id: j.id }, mandatory: true, read: false, at: now, fix: asg && absenceOn(db, asg.employeeId, d) ? { jobId: j.id, empId: asg.employeeId, position: asg.position, date: d } : undefined }) })
      })
    }
    if (['owner', 'safety', 'dispatch', 'ops'].includes(role)) {
      db.jobs.filter(j => inScope(j, scope) && (j.liftPlan === 'In Review' || j.liftPlan === 'Missing') && j.startDate > t && j.startDate <= addDays(t, 4) && ['Awarded', 'Scheduled'].includes(j.stage)).slice(0, 2)
        .forEach(j => out.push({ id: `lp-${j.id}`, severity: 'Upcoming', title: `Lift plan not signed off — #${j.jobNo}`, body: `Starts ${j.startDate.slice(5).replace('-', '/')} · open Lift Planning to approve`, page: 'lifts', mandatory: false, read: false, at: now }))
    }
    if (['owner', 'safety', 'hr', 'dispatch', 'ops'].includes(role)) {
      const exp = db.certs.filter(c => { const b = certBand(c).band; return b === 'expired' || b === '30' }).filter(c => isField(byId(db.employees, c.employeeId)!) && inScope(byId(db.employees, c.employeeId), scope))
      if (exp.length) out.push({ id: 'certs', severity: 'Upcoming', title: `${exp.filter(c => certBand(c).band === 'expired').length} expired · ${exp.filter(c => certBand(c).band === '30').length} expiring within 30 days`, body: 'Certifications — renew before people can be dispatched.', mandatory: true, read: false, at: now, page: 'safety' })
    }
    if (['owner', 'shop', 'dispatch'].includes(role)) {
      const due = db.equipment.filter(e => serviceStatus(e).overdue)
      if (due.length) out.push({ id: 'svc', severity: 'Upcoming', title: `${due.length} units past service interval`, body: due.slice(0, 5).map(e => e.unit).join(', ') + (due.length > 5 ? '…' : ''), mandatory: false, read: false, at: now, page: 'shop' })
    }
    if (['owner', 'accounting'].includes(role)) {
      const late = db.invoices.filter(i => ['61–90', '90+'].includes(agingBucket(i)))
      if (late.length) out.push({ id: 'ar', severity: 'Action Required', title: `${late.length} invoices over 60 days`, body: 'Receivables — collections follow-up.', mandatory: false, read: false, at: now, page: 'receivables' })
      const coding = billsToCode(db, scope)
      if (coding.length) out.push({ id: 'ap', severity: 'Action Required', title: `${coding.length} vendor bills need a job number`, body: 'Payables — code to a job so it hits job costing.', mandatory: false, read: false, at: now, page: 'payables' })
    }
    if (['owner', 'hr'].includes(role)) {
      const p = db.pto.filter(x => x.status === 'Pending' && inScope(byId(db.employees, x.employeeId), scope))
      if (p.length) out.push({ id: 'pto', severity: 'Action Required', title: `${p.length} PTO requests waiting`, body: p.slice(0, 3).map(x => fullName(byId(db.employees, x.employeeId))).join(', '), mandatory: false, read: false, at: now, page: 'people' })
    }
    if (['owner', 'payroll'].includes(role)) {
      const f = timeFlagged(db, scope)
      if (f.length) out.push({ id: 'time', severity: 'Action Required', title: `${f.length} flagged time entr${f.length === 1 ? 'y' : 'ies'}`, body: 'Review before payroll export.', mandatory: false, read: false, at: now, page: 'time' })
    }
    const rank = { Urgent: 0, 'Action Required': 1, Upcoming: 2, Info: 3 }
    const seen = new Set<string>()
    const key = (a: Alert) => a.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    // Batch 4: alert-rule feed (wind, certs, loads, tickets, @mentions)
    b4feed.filter(f => !f.read).slice(0, 6).forEach(f => out.push({ id: 'b4-' + f.id, severity: f.rule === 'wind' ? 'Urgent' : f.rule === 'mention' ? 'Action Required' : 'Info', title: f.title, body: f.body, mandatory: false, read: false, at: f.at, page: f.page }))
    return out.filter(a => { const k = key(a); if (seen.has(k)) return false; seen.add(k); return true }).sort((a, b) => rank[a.severity] - rank[b.severity] || b.at.localeCompare(a.at))
  }, [db, role, b4feed, scope])
}

const ICON = { Urgent: Siren, 'Action Required': AlertTriangle, Upcoming: ShieldAlert, Info }
const TONE = { Urgent: 'bad', 'Action Required': 'warn', Upcoming: 'info', Info: 'neutral' } as const

export default function Notifications({ open, onClose }: { open: boolean; onClose: () => void }) {
  const alerts = useAlerts()
  const openRef = useStore(s => s.open)
  const go = useStore(s => s.go)
  return (
    <Sheet open={open} onClose={onClose} title="Notifications" sub={`${alerts.length} items · mandatory alerts can't be muted`} width={480}
      actions={<button className="text-xs font-semibold text-muted hover:text-ink inline-flex items-center gap-1 mt-2" onClick={() => alerts.forEach(a => !a.read && a.id.startsWith('n') && actions.markRead(a.id))}><CheckCheck className="size-4" />Mark read</button>}>
      {alerts.length === 0 && <div className="py-16 text-center text-muted"><Bell className="size-8 mx-auto mb-3" />All clear.</div>}
      <div className="flex flex-col gap-2">
        {alerts.map(a => { const I = ICON[a.severity]; return (
          <button key={a.id} onClick={() => { if (a.ref) { onClose(); openRef(a.ref) } else if (a.page) { onClose(); go(a.page as never) } if (!a.read) actions.markRead(a.id) }}
            className={cn('text-left rounded-2xl border hairline p-4 flex gap-3 hover:bg-surface-2 transition', !a.read && 'bg-surface-2/50')}>
            <span className={cn('grid size-9 place-items-center rounded-xl shrink-0', a.severity === 'Urgent' ? 'bg-bad/15 text-bad' : a.severity === 'Action Required' ? 'bg-warn/15 text-warn' : 'bg-info/15 text-info')}><I className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2"><Badge tone={TONE[a.severity]}>{a.severity}</Badge>{a.mandatory && <span className="text-[10px] font-bold text-faint tracking-wider">MANDATORY</span>}<span className="ml-auto text-[11px] text-faint">{timeAgo(a.at)}</span></span>
              <span className="block font-semibold mt-1.5 text-[15px] leading-snug">{a.title}</span>
              <span className="block text-sm text-muted mt-0.5">{a.body}</span>
            </span>
          </button>
        ) })}
      </div>
    </Sheet>
  )
}
