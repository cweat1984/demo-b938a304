// Field fixes (N-M1): one answer for "which local does this job pay" and "who's the supervisor on site today".
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { byId, crewOn } from '../data/logic'
import { useLocals } from '../union/UnionPage'
import { countyOfJobTurbine, localOf, useTurbineCounty } from '../union/turbine'

/** Turbine jobs pay the local of the turbine's county (same rule as the job card); other jobs use job.local. */
export function useJobLocal(job?: T.Job): string | undefined {
  const locals = useLocals(); useTurbineCounty(s => s.ov)
  const site = useStore(s => (job ? s.db.sites.find(x => x.id === job.siteId) : undefined))
  if (!job) return undefined
  const t = job.turbines?.[0]
  if (t) { const c = countyOfJobTurbine(t, site?.state ?? ''); const l = localOf(locals, c); if (l) return `Local ${l.local}` }
  return job.local && !/non/i.test(job.local) ? job.local : 'Non-union'
}
/** The supervisor actually on today's crew; falls back to the job's assigned supervisor. */
export function siteSupervisor(db: T.DB, job: T.Job | undefined, date: string): T.Employee | undefined {
  if (!job) return undefined
  const onSite = crewOn(db, job.id, date).map(a => byId(db.employees, a.employeeId)).find(e => e?.craft === 'Supervisor')
  return onSite ?? (job.supervisorId ? byId(db.employees, job.supervisorId) : undefined)
}
