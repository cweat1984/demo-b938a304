// Pure business logic over the DB. No React here — a real backend could run the same rules.
import type * as T from './types'
import { today, between, diffDays, addDays, range, startOfWeek } from '../lib/util'
import { extrasSummary, extraLabel } from './extras'
import { jobCranes, phaseOn, sharedOn } from './rig'
import { BURDEN, PER_DIEM_RATES, TRAILER_DAY_COST, distMiles, requiredPositions } from './seed'

export { requiredPositions }

export type OrgFilter = { divisionId: string; branchId: string } // 'all' allowed
export const inScope = (o: { divisionId: string; branchId: string } | undefined, f: OrgFilter) =>
  !o || ((f.divisionId === 'all' || o.divisionId === f.divisionId) && (f.branchId === 'all' || o.branchId === f.branchId))

// ---------- lookups ----------
export const byId = <X extends { id: string }>(arr: X[], id?: string) => (id ? arr.find(x => x.id === id) : undefined)
export const fullName = (e?: T.Employee) => (e ? `${e.first} ${e.last}` : '—')
export const initials = (e?: T.Employee) => (e ? e.first[0] + e.last[0] : '?')
export const eqLabel = (e?: T.Equipment) => (e ? (e.category === 'Crane' ? `${e.unit} · ${e.code}` : e.unit) : '—')
export const isLive = (j: T.Job) => j.stage !== 'Quote' && j.stage !== 'Awarded'
export const siteOf = (db: T.DB, j: T.Job) => byId(db.sites, j.siteId)!
export const customerOf = (db: T.DB, j: T.Job) => byId(db.customers, j.customerId)!
export const branchOf = (db: T.DB, id: string) => byId(db.branches, id)
export const divisionOf = (db: T.DB, id: string) => byId(db.divisions, id)
export const FIELD_CRAFTS: T.Craft[] = ['Operator', 'Rigger', 'Oiler', 'Truck Driver', 'Supervisor', 'Uptower Tech', 'Millwright']
export const isField = (e: T.Employee) => FIELD_CRAFTS.includes(e.craft)

export const jobsOn = (db: T.DB, date: string) => db.jobs.filter(j => isLive(j) && between(date, j.startDate, j.endDate))
export const crewOn = (db: T.DB, jobId: string, date: string) => db.assignments.filter(a => a.jobId === jobId && a.date === date)
export const assignmentsFor = (db: T.DB, empId: string, date: string) => db.assignments.filter(a => a.employeeId === empId && a.date === date)
export const absenceOn = (db: T.DB, empId: string, date: string) => db.absences.find(a => a.employeeId === empId && between(date, a.from, a.to))
export const travelOn = (db: T.DB, empId: string, date: string) => db.travel.find(t => t.employeeId === empId && t.date === date)

// ---------- workforce status ----------
export type WorkStatus = 'Working' | 'Available' | 'Traveling To Site' | 'Traveling From Site' | 'Scheduled Off' | 'Vacation / PTO' | 'Training' | 'Unavailable'
export const STATUS_ORDER: WorkStatus[] = ['Available', 'Working', 'Traveling To Site', 'Traveling From Site', 'Scheduled Off', 'Vacation / PTO', 'Training', 'Unavailable']
export function workStatus(db: T.DB, empId: string, date: string): WorkStatus {
  { const eh = byId(db.employees, empId); if (eh?.ssHold && date >= eh.ssHold) return 'Unavailable' } // D&A hold (any employee) until cleared
  const ab = absenceOn(db, empId, date)
  if (ab) return ab.kind
  if (assignmentsFor(db, empId, date).length) return 'Working'
  const tr = travelOn(db, empId, date)
  if (tr) return tr.direction === 'To Site' || tr.direction === 'Between Sites' ? 'Traveling To Site' : 'Traveling From Site'
  const e = byId(db.employees, empId)
  if (e && e.status !== 'Active') return 'Unavailable'
  return 'Available'
}

// ---------- certifications ----------
export type CertBand = 'expired' | '30' | '60' | '90' | 'ok'
export function certBand(c: T.Cert, ref = today()): { band: CertBand; days: number } {
  const days = diffDays(c.expires, ref)
  if (days < 0) return { band: 'expired', days }
  if (days <= 30) return { band: '30', days }
  if (days <= 60) return { band: '60', days }
  if (days <= 90) return { band: '90', days }
  return { band: 'ok', days }
}
export const hasCert = (db: T.DB, empId: string, type: T.CertType, date: string) =>
  db.certs.some(c => c.employeeId === empId && (c.type === type || (type === 'OSHA 10' && c.type === 'OSHA 30')) && c.expires >= date && c.verified !== 'Rejected')

const POS_CRAFT: Record<T.CrewPosition, T.Craft[]> = {
  Operator: ['Operator'], Rigger: ['Rigger', 'Millwright', 'Oiler'], Oiler: ['Oiler', 'Rigger'], 'Truck Driver': ['Truck Driver'],
  Supervisor: ['Supervisor'], Safety: ['Safety'], 'Uptower Tech': ['Uptower Tech'], Millwright: ['Millwright', 'Rigger'],
}
export const craftFits = (e: T.Employee, pos: T.CrewPosition) => POS_CRAFT[pos].includes(e.craft)
export const defaultPosition = (e: T.Employee): T.CrewPosition =>
  (({ Operator: 'Operator', Rigger: 'Rigger', Oiler: 'Oiler', 'Truck Driver': 'Truck Driver', Supervisor: 'Supervisor', Safety: 'Safety', 'Uptower Tech': 'Uptower Tech', Millwright: 'Millwright' }) as Record<string, T.CrewPosition>)[e.craft] ?? 'Rigger'

/** Can this employee legally be put on this job/date? Returns blocking reasons (certs) and warnings. */
export function eligibility(db: T.DB, empId: string, job: T.Job, date: string, pos: T.CrewPosition) {
  const e = byId(db.employees, empId)!
  const blocks: string[] = []
  const warns: string[] = []
  job.requiredCerts.forEach(t => { if (!hasCert(db, empId, t, date)) blocks.push(`Missing or expired ${t}`) })
  const crane = byId(db.equipment, job.craneId)
  if (pos === 'Operator' && crane) {
    const need: T.CertType = crane.type === 'Crawler' ? 'NCCCO Crawler Operator' : 'NCCCO Mobile Operator'
    if (!hasCert(db, empId, need, date)) blocks.push(`Not certified to run ${crane.type} cranes (${need})`)
  }
  if (pos === 'Truck Driver' && !hasCert(db, empId, 'CDL Class A', date)) blocks.push('No valid CDL Class A')
  if (!craftFits(e, pos)) warns.push(`${e.craft} filling ${pos} slot`)
  const ab = absenceOn(db, empId, date)
  if (ab) warns.push(`${ab.kind} on this date`)
  if (e.hallHand) warns.push('Hall Hand')
  return { ok: blocks.length === 0, blocks, warns }
}

// ---------- conflict detection ----------
export type Conflict = { level: 'red' | 'amber'; text: string; empId?: string }
export function jobConflicts(db: T.DB, job: T.Job, date: string): Conflict[] {
  const out: Conflict[] = []
  const crane = byId(db.equipment, job.craneId)
  const crew = crewOn(db, job.id, date)
  const craneName = crane ? `Crane ${crane.unit}` : `Job #${job.jobNo}`
  crew.forEach(a => {
    const e = byId(db.employees, a.employeeId)
    const ab = absenceOn(db, a.employeeId, date)
    if (ab) out.push({ level: 'red', empId: a.employeeId, text: ab.kind === 'Scheduled Off' ? `${a.position} Scheduled Off — Replacement Needed (${fullName(e)})` : `${craneName} — Assigned ${a.position} Unavailable (${fullName(e)}, ${ab.kind})` })
    const dbl = db.assignments.filter(x => x.employeeId === a.employeeId && x.date === date && x.jobId !== job.id)
    if (dbl.length) out.push({ level: 'red', empId: a.employeeId, text: `${fullName(e)} double-booked on Job #${byId(db.jobs, dbl[0].jobId)?.jobNo}` })
    const el = eligibility(db, a.employeeId, job, date, a.position)
    el.blocks.forEach(b => out.push({ level: 'red', empId: a.employeeId, text: `${fullName(e)}: ${b}` }))
  })
  // crew gaps
  const need = requiredPositions(job, date)
  const have: Record<string, number> = {}
  crew.forEach(a => (have[a.position] = (have[a.position] ?? 0) + 1))
  const needC: Record<string, number> = {}
  need.forEach(p => (needC[p] = (needC[p] ?? 0) + 1))
  Object.entries(needC).forEach(([p, n]) => { const h = have[p] ?? 0; if (h < n) out.push({ level: 'amber', text: `Crew gap: ${n - h} ${p}${n - h > 1 ? 's' : ''} needed` }) })
  // dive3 B1/M1: every crane on the job that day (lead + assist + rig-plan cranes), one shared rule with the swap picker and forecast
  for (const cid of jobCranes(job)) {
    if (!phaseOn(job, cid, date)) continue
    const c = byId(db.equipment, cid); if (!c) continue
    const cn = `Crane ${c.unit}`
    if (c.status === 'Maintenance' || c.status === 'Out of Service') out.push({ level: 'red', text: `${cn} is ${c.status} — Shop release required` })
    else if (c.category === 'Crane' && c.annualInspection && c.annualInspection < date) out.push({ level: 'red', text: `${cn} annual inspection expired ${c.annualInspection} — locked out until certified` }) // dive3 shop M7
    sharedOn(db, job, cid, date).forEach(x => out.push(x.clash ? { level: 'red', text: `${cn} double-booked: Job #${x.job.jobNo}${x.hours ? ` ${x.hours.from}–${x.hours.to}` : ''} (${x.why})` } : { level: 'amber', text: `${cn} also on Job #${x.job.jobNo} today${x.hours ? `, ${x.hours.from}–${x.hours.to}` : ''}` }))
  }
  job.trailerIds.forEach(tid => {
    const other = jobsOn(db, date).find(j => j.id !== job.id && j.trailerIds.includes(tid) && (date === j.startDate || date === j.endDate) && (date === job.startDate || date === job.endDate))
    if (other) out.push({ level: 'amber', text: `Trailer ${byId(db.equipment, tid)?.unit} also needed on Job #${other.jobNo}` })
  })
  if (job.liftPlan === 'Missing') out.push({ level: 'amber', text: 'Lift plan missing' })
  return out
}

export function availablePool(db: T.DB, date: string, f: OrgFilter) {
  return db.employees.filter(e => isField(e) && e.status === 'Active' && inScope(e, f) && workStatus(db, e.id, date) === 'Available')
}

// ---------- equipment ----------
export function craneBookings(db: T.DB, craneId: string) {
  return db.jobs.filter(j => j.craneId === craneId && isLive(j)).sort((a, b) => a.startDate.localeCompare(b.startDate))
}
export function nextGap(db: T.DB, craneId: string, from = today()) {
  const b = craneBookings(db, craneId).filter(j => j.endDate >= from)
  const cur = b.find(j => j.startDate <= from)
  const nextJob = b.find(j => j.startDate > from)
  if (!cur) return { freeNow: true, until: nextJob?.startDate, days: nextJob ? diffDays(nextJob.startDate, from) : undefined, nextJob }
  return { freeNow: false, until: undefined, days: undefined, nextJob, freeFrom: addDays(cur.endDate, 1) }
}
export function serviceStatus(e: T.Equipment, ref = today()) {
  const meter = e.category === 'Semi' || e.category === 'Pickup' ? e.miles : e.hours
  const remaining = e.nextServiceAt != null && meter != null ? e.nextServiceAt - meter : undefined
  const unit = e.category === 'Semi' || e.category === 'Pickup' ? 'mi' : 'hrs'
  const daysLeft = diffDays(e.nextServiceDate, ref)
  const overdue = (remaining != null && remaining < 0) || daysLeft < 0
  const dueSoon = !overdue && ((remaining != null && remaining < (unit === 'mi' ? 2500 : 75)) || daysLeft <= 7)
  return { remaining, unit, daysLeft, overdue, dueSoon, dueToday: daysLeft === 0 }
}
export const pingAgeMin = (e: T.Equipment) => Math.round((Date.now() - new Date(e.lastPing).getTime()) / 60000)
export const isStale = (e: T.Equipment) => pingAgeMin(e) > 120

// ---------- job costing ----------
export const COST_CATS: T.CostCategory[] = ['Labor', 'Per Diem', 'Crane', 'Semis & Trucks', 'Trailers', 'Fuel', 'Engineering / Lift Plan', 'Permits & Escorts', 'Subcontractors', 'Materials', 'Equipment Rental', 'Other']
export type CostLine = { category: T.CostCategory; description: string; amount: number; source: T.JobCost['source']; date: string; refId?: string; oneTime?: boolean; /** Req H: non-billable extra — absorbed cost (internal only). */ absorbed?: boolean; extra?: boolean }
/** One-time costs (mob/demob, permits, engineering, materials, subs, incidents) don't scale with job days; run-rate costs (labor, per diem, crane-days, fuel, rentals) do. */
const ONE_TIME_CATS: T.CostCategory[] = ['Engineering / Lift Plan', 'Permits & Escorts', 'Materials', 'Subcontractors', 'Other']
export const isOneTime = (l: CostLine) => ONE_TIME_CATS.includes(l.category) || /\b(mob|demob|mobiliz|haul-in|assist crane|pad rebuild|standby)\b/i.test(l.description)

/** Overtime hours by time-entry id. Same rule as the Time screen and the Paychex file: over 40 hours in the week, in date order, not after 10 hours in a day. The company may still have a daily OT rule; this file follows the screen until that is confirmed. */
function weeklyOtHours(db: T.DB) {
  const split = new Map<string, number>()
  const byEmp = new Map<string, T.TimeEntry[]>()
  for (const t of db.time) {
    const list = byEmp.get(t.employeeId)
    if (list) list.push(t)
    else byEmp.set(t.employeeId, [t])
  }
  for (const list of byEmp.values()) {
    const weeks = new Map<string, T.TimeEntry[]>()
    for (const t of list) {
      const wk = startOfWeek(t.date)
      const arr = weeks.get(wk)
      if (arr) arr.push(t)
      else weeks.set(wk, [t])
    }
    for (const arr of weeks.values()) {
      let h0 = 0
      for (const t of [...arr].sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')))) {
        const reg = Math.max(0, Math.min(t.hours, 40 - h0))
        split.set(t.id, Math.round((t.hours - reg) * 100) / 100)
        h0 += t.hours
      }
    }
  }
  return split
}
export function entryCost(e: T.Employee | undefined, te: T.TimeEntry, otHours = 0) {
  const rate = e?.rate ?? 30
  const ot = Math.max(0, Math.min(otHours, te.hours))
  const reg = Math.max(0, te.hours - ot)
  return { labor: (reg + ot * 1.5) * rate * BURDEN, perDiem: te.perDiems.reduce((s, p) => s + PER_DIEM_RATES[p], 0) }
}

export function jobCosting(db: T.DB, job: T.Job, ref = today()) {
  const lines: CostLine[] = []
  const totalDays = diffDays(job.endDate, job.startDate) + 1
  const started = job.startDate <= ref && isLive(job)
  const lastDay = job.endDate < ref ? job.endDate : addDays(ref, -1) >= job.startDate ? ref : job.startDate
  const earnedDays = !started ? 0 : diffDays(lastDay < job.endDate ? lastDay : job.endDate, job.startDate) + 1
  const pct = Math.min(1, earnedDays / totalDays)
  // labor & per diem from time entries (enter once: time → payroll → job cost). OT matches payroll: over 40h in the week.
  const otOf = weeklyOtHours(db)
  db.time.filter(t => t.jobId === job.id).forEach(t => {
    const e = byId(db.employees, t.employeeId)
    const c = entryCost(e, t, otOf.get(t.id) ?? 0)
    lines.push({ category: 'Labor', description: `${fullName(e)} · ${t.activity} · ${t.hours}h`, amount: c.labor, source: 'Time Entry', date: t.date, refId: t.id })
    if (c.perDiem) lines.push({ category: 'Per Diem', description: `${fullName(e)} · ${t.perDiems.join(' + ')}`, amount: c.perDiem, source: 'Per Diem', date: t.date, refId: t.id })
  })
  const crane = byId(db.equipment, job.craneId)
  const site = siteOf(db, job)
  const b = branchOf(db, job.branchId)!
  const miles = Math.round(distMiles([b.lat, b.lng], [site.lat, site.lng]) * 1.25)
  if (started && crane) lines.push({ category: 'Crane', description: `Crane ${crane.unit} internal rate · ${earnedDays} day${earnedDays > 1 ? 's' : ''} × $${crane.costDay?.toLocaleString()}`, amount: earnedDays * (crane.costDay ?? 0), source: 'Equipment Usage', date: job.startDate })
  if (started) {
    const mobs = [job.startDate, ...(job.endDate <= ref ? [job.endDate] : [])]
    const cfg = byId(db.configs, job.configId)
    const own = Math.max(1, job.trailerIds.length)
    const total = cfg?.loads ? cfg.loads.reduce((s, l) => s + l.n, 0) : own
    const third = Math.max(0, total - job.trailerIds.length)
    mobs.forEach((d, i) => {
      if (job.type === 'Heavy Haul') return
      if (job.trailerIds.length || crane) lines.push({ category: 'Semis & Trucks', description: `${i === 0 ? 'Mob' : 'Demob'} · ${own} company load${own > 1 ? 's' : ''} × ${miles} mi × 2 (round trip)`, amount: own * miles * 2 * 1.3, source: 'Equipment Usage', date: d })
      if (third) lines.push({ category: 'Subcontractors', description: `${i === 0 ? 'Mob' : 'Demob'} · ${third} third-party haul load${third > 1 ? 's' : ''} × $${Math.max(1800, miles * 7).toLocaleString()}`, amount: third * Math.max(1800, miles * 7), source: 'Equipment Usage', date: d })
      if (job.trailerIds.length) lines.push({ category: 'Trailers', description: `${i === 0 ? 'Mob' : 'Demob'} · ${job.trailerIds.length} trailer days × $${TRAILER_DAY_COST}`, amount: job.trailerIds.length * TRAILER_DAY_COST * 2, source: 'Equipment Usage', date: d })
    })
    if (job.type === 'Heavy Haul') {
      lines.push({ category: 'Semis & Trucks', description: `Haul · ${earnedDays} day${earnedDays > 1 ? 's' : ''} × ${miles} mi`, amount: earnedDays * miles * 1.35 * 2, source: 'Equipment Usage', date: job.startDate })
      lines.push({ category: 'Trailers', description: `${job.trailerIds.length || 1} trailer × ${earnedDays} days`, amount: (job.trailerIds.length || 1) * earnedDays * TRAILER_DAY_COST, source: 'Equipment Usage', date: job.startDate })
    }
    if (job.type === 'Uptower' || job.type === 'Machine Moving') {
      const sup = db.equipment.filter(e => e.category === 'Support' && e.divisionId === job.divisionId).slice(0, 2)
      sup.forEach(s => lines.push({ category: 'Equipment Rental', description: `${s.type} ${s.unit} · ${earnedDays} days (internal)`, amount: earnedDays * (s.costDay ?? 200), source: 'Equipment Usage', date: job.startDate }))
    }
  }
  db.fuel.filter(f => f.jobId === job.id).forEach(f => lines.push({ category: 'Fuel', description: `${byId(db.equipment, f.unitId)?.unit} · ${f.gallons} gal @ $${f.price.toFixed(2)} · ${f.vendor}`, amount: f.gallons * f.price, source: 'Fuel Log', date: f.date, refId: f.id }))
  db.bills.forEach(bl => {
    if (bl.status === 'Rejected') return
    bl.lines.forEach(l => { if (l.jobId === job.id) lines.push({ category: l.category, description: `${byId(db.vendors, bl.vendorId)?.name} · ${l.description}${bl.status === 'Pending Approval' ? ' (pending approval)' : ''}`, amount: l.amount, source: 'Vendor Bill', date: bl.date, refId: bl.id }) })
  })
  db.costs.filter(c => c.jobId === job.id).forEach(c => lines.push({ category: c.category, description: c.description, amount: c.amount, source: c.source, date: c.date, refId: c.id }))

  const byCat = Object.fromEntries(COST_CATS.map(c => [c, 0])) as Record<T.CostCategory, number>
  lines.forEach(l => (byCat[l.category] += l.amount))
  const cost = lines.reduce((s, l) => s + l.amount, 0)
  const mobRev = !started ? 0 : job.endDate <= ref || job.status === 'Complete' ? job.quote.mobDemob : job.quote.mobDemob / 2
  const revenue = earnedDays * job.dayRate + mobRev
  lines.forEach(l => { l.oneTime = isOneTime(l) })
  const oneTime = lines.filter(l => l.oneTime).reduce((s, l) => s + l.amount, 0)
  const runRate = cost - oneTime
  // demob still to come: mirror the mob trucking/trailer lines if the job hasn't finished
  const mobLines = lines.filter(l => /^Mob ·/.test(l.description)).reduce((s, l) => s + l.amount, 0)
  const pendingDemob = job.endDate > ref ? mobLines : 0
  const projCost = !started || earnedDays === 0 ? Math.max(cost, job.quote.costBudget) : oneTime + pendingDemob + (runRate / earnedDays) * totalDays
  const projRevenue = job.quote.revenue
  // budget earned to date follows the same shape as cost: one-time mob up front, daily costs as days are worked
  const budgetToDate = started && projCost ? job.quote.costBudget * Math.min(1, cost / projCost) : job.quote.costBudget * pct
  const projProfit = projRevenue - projCost
  const projMargin = projRevenue ? projProfit / projRevenue : 0
  const margin = revenue ? (revenue - cost) / revenue : 0
  // Req H: extras (added/removed people & support equipment). Earned to date in cost/revenue; full span in projections.
  const xs = job.extras ?? []
  let xCost = 0, xRev = 0, xAbs = 0, xProjCost = 0, xProjRev = 0
  if (xs.length) {
    const toDate = extrasSummary(job, started ? (job.endDate < ref ? job.endDate : ref) : addDays(job.startDate, -1)), full = extrasSummary(job)
    toDate.rows.forEach(r => { if (!r.days) return; const cat: T.CostCategory = r.x.kind === 'person' ? 'Labor' : 'Equipment Rental'
      const l: CostLine = { category: cat, description: `${r.x.billable ? 'Extra' : 'Absorbed cost'} · ${extraLabel(r.x)} · ${r.days} day${r.days > 1 ? 's' : ''}${r.x.reason ? ` · ${r.x.reason}` : ''}`, amount: r.cost, source: 'Manual', date: r.x.from, refId: r.x.id, absorbed: !r.x.billable, extra: true }
      lines.push(l); byCat[cat] += r.cost })
    xCost = toDate.cost; xRev = toDate.billable; xAbs = toDate.absorbed; xProjCost = full.cost; xProjRev = full.billable
  }
  const fCost = cost + xCost, fRev = revenue + xRev, fProjCost = projCost + xProjCost, fProjRev = projRevenue + xProjRev, fProjProfit = fProjRev - fProjCost, fProjMargin = fProjRev ? fProjProfit / fProjRev : 0
  const health: 'ahead' | 'thin' | 'behind' | 'pending' = !started ? 'pending' : fProjMargin >= 0.15 ? 'ahead' : fProjMargin >= 0 ? 'thin' : 'behind'
  return { lines: lines.sort((a, b) => b.date.localeCompare(a.date)), byCat, cost: fCost, oneTime, runRate, pendingDemob, revenue: fRev, profit: fRev - fCost, margin: fRev ? (fRev - fCost) / fRev : 0, pct, earnedDays, totalDays, budgetToDate, budgetVar: budgetToDate - fCost, projCost: fProjCost, projRevenue: fProjRev, projProfit: fProjProfit, projMargin: fProjMargin, health, miles, extras: { cost: xCost, billable: xRev, absorbed: xAbs, projCost: xProjCost, projBillable: xProjRev, marginImpact: xProjRev - xProjCost } }
}

/** The ONE set of jobs every job-costing screen uses: live jobs that have started (in progress or finishing). */
export const costJobs = (db: T.DB, f: OrgFilter, ref = today()) => db.jobs.filter(j => isLive(j) && j.startDate <= ref && (j.endDate >= ref || j.stage === 'In Progress') && inScope(j, f))
export const HEALTH_LABEL = { ahead: 'Coming out ahead', thin: 'Thin margin', behind: 'Losing money', pending: 'Not started' } as const

// ---------- analytics ----------
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export function liveMonthRollup(db: T.DB, f: OrgFilter, ref = today()) {
  // revenue/cost earned so far this month from live jobs (actuals)
  const m0 = ref.slice(0, 8) + '01'
  let revenue = 0, cost = 0
  db.jobs.filter(j => isLive(j) && inScope(j, f) && j.endDate >= m0 && j.startDate <= ref).forEach(j => {
    const jc = jobCosting(db, j, ref)
    const daysIn = range(j.startDate < m0 ? m0 : j.startDate, j.endDate < ref ? j.endDate : ref).length
    const share = jc.earnedDays ? daysIn / jc.earnedDays : 0
    revenue += jc.revenue * share; cost += jc.cost * share
  })
  return { revenue, cost }
}
export function yearSeries(db: T.DB, f: OrgFilter) {
  const ref = today(); const curY = Number(ref.slice(0, 4)); const curM = Number(ref.slice(5, 7))
  const years = [curY - 2, curY - 1, curY]
  const series = years.map(y => ({ year: y, months: MONTHS.map((_, i) => { const rows = db.history.filter(h => h.year === y && h.month === i + 1 && inScope(h, f)); return { revenue: rows.reduce((s, r) => s + r.revenue, 0), cost: rows.reduce((s, r) => s + r.cost, 0) } }) }))
  const live = liveMonthRollup(db, f, ref)
  series[2].months[curM - 1] = live
  const ytd = (y: number) => series.find(s => s.year === y)!.months.slice(0, curM).reduce((s, m) => s + m.revenue, 0)
  const ytdPrev = series[1].months.slice(0, curM - 1).reduce((s, m) => s + m.revenue, 0) + series[1].months[curM - 1].revenue * (Number(ref.slice(8, 10)) / 30)
  return { series, curY, curM, ytd: ytd(curY), ytdPrev, full: (y: number) => series.find(s => s.year === y)!.months.reduce((s, m) => s + m.revenue, 0) }
}
export function trailing12(db: T.DB, f: OrgFilter) {
  const ref = today(); const curY = Number(ref.slice(0, 4)); const curM = Number(ref.slice(5, 7))
  return db.history.filter(h => inScope(h, f) && (h.year * 12 + h.month) > (curY * 12 + curM - 13) && (h.year * 12 + h.month) < curY * 12 + curM)
}
export function craneLeague(db: T.DB, f: OrgFilter) {
  const rows = trailing12(db, f)
  return db.equipment.filter(e => e.category === 'Crane' && inScope(e, f)).map(c => {
    const r = rows.filter(h => h.craneId === c.id)
    const revenue = r.reduce((s, x) => s + x.revenue, 0), cost = r.reduce((s, x) => s + x.cost, 0), days = r.reduce((s, x) => s + x.days, 0)
    return { crane: c, revenue, cost, profit: revenue - cost, margin: revenue ? (revenue - cost) / revenue : 0, util: days / 365 }
  }).sort((a, b) => b.profit - a.profit)
}
export function groupProfit<K extends string>(rows: T.HistJob[], key: (h: T.HistJob) => K) {
  const m = new Map<K, { revenue: number; cost: number; jobs: number }>()
  rows.forEach(h => { const k = key(h); const v = m.get(k) ?? { revenue: 0, cost: 0, jobs: 0 }; v.revenue += h.revenue; v.cost += h.cost; v.jobs++; m.set(k, v) })
  return [...m.entries()].map(([k, v]) => ({ key: k, ...v, profit: v.revenue - v.cost, margin: v.revenue ? (v.revenue - v.cost) / v.revenue : 0 })).sort((a, b) => b.revenue - a.revenue)
}

// ---------- AR ----------
export function agingBucket(inv: T.Invoice, ref = today()) {
  if (Math.abs(inv.amount - inv.paid) <= 0.005) return 'Paid'
  const late = diffDays(ref, inv.due)
  if (late <= 0) return 'Current'
  if (late <= 30) return '1–30'
  if (late <= 60) return '31–60'
  if (late <= 90) return '61–90'
  return '90+'
}

/** One-tap conflict fix: rank replacement candidates like a dispatcher would — certs, free that day, distance from home branch to site, hours this week (OT), and home-crane familiarity. */
export function rankReplacements(db: T.DB, job: T.Job, date: string, pos: T.CrewPosition, exclude: string[] = []) {
  const site = siteOf(db, job)
  const wkStart = addDays(date, -((new Date(date + 'T12:00').getDay() + 6) % 7))
  return db.employees.filter(e => isField(e) && !exclude.includes(e.id) && craftFits(e, pos) && workStatus(db, e.id, date) === 'Available')
    .map(e => {
      const el = eligibility(db, e.id, job, date, pos)
      const b = branchOf(db, e.branchId)!
      const miles = Math.round(distMiles([b.lat, b.lng], [site.lat, site.lng]) * 1.2)
      const hrs = db.time.filter(t => t.employeeId === e.id && t.date >= wkStart && t.date <= date).reduce((s, t) => s + t.hours, 0)
      const home = e.homeCraneId && e.homeCraneId === job.craneId
      const score = (el.ok ? 100 : -200) - miles / 6 - Math.max(0, hrs - 30) * 2 + (home ? 15 : 0) + (e.craft === pos ? 10 : 0) - (e.hallHand ? 4 : 0)
      return { e, el, miles, hrs, home, score, perDiem: miles > 75 ? 'Hotel per diem' : miles > 40 ? 'Daily truck' : null }
    }).filter(x => x.el.ok).sort((a, b) => b.score - a.score).slice(0, 6)
}

/** First open window of `days` consecutive days for a crane (bookings incl. awarded work; down cranes need ~5 days in the shop). */
export function nextWindow(db: T.DB, craneId: string, days: number, from = today(), horizon = 120) {
  const c = byId(db.equipment, craneId)
  const bk = db.jobs.filter(j => j.craneId === craneId && j.status !== 'Complete' && j.stage !== 'Quote' && j.endDate >= from)
  let s = c && (c.status === 'Out of Service' || c.status === 'Maintenance') ? addDays(from, 5) : addDays(from, 1)
  for (let i = 0; i < horizon; i++) {
    const e = addDays(s, days - 1)
    const hit = bk.filter(j => j.startDate <= e && j.endDate >= s).sort((a, b) => b.endDate.localeCompare(a.endDate))[0]
    if (!hit) return { start: s, end: e }
    s = addDays(hit.endDate, 2) // a day to demob / travel
  }
  return null
}

/** AP auto-coding: find the job a bill line most likely belongs to (site / city / customer / crane named in the text, nearest dates). */
export function suggestJob(db: T.DB, bill: T.VendorBill, line: T.VendorBill["lines"][number]): { job: T.Job; why: string } | null {
  const text = line.description.toLowerCase()
  const cands = db.jobs.filter(j => j.stage !== 'Quote' && (bill.branchId ? j.branchId === bill.branchId : true))
  let best: { job: T.Job; why: string; s: number } | null = null
  for (const j of cands) {
    const site = byId(db.sites, j.siteId); const cust = byId(db.customers, j.customerId); const crane = byId(db.equipment, j.craneId)
    let s = 0; let why = ''
    if (site && text.includes(site.name.toLowerCase())) { s += 10; why = `names site "${site.name}"` }
    else if (site && site.city && text.includes(site.city.toLowerCase())) { s += 6; why = `mentions ${site.city}` }
    if (cust && text.includes(cust.name.toLowerCase())) { s += 8; why = why || `names ${cust.name}` }
    if (crane && new RegExp(`\\b(crane|unit) ?${crane.unit}\\b`).test(text)) { s += 7; why = why || `names Crane ${crane.unit}` }
    if (!s) continue
    const d = bill.date < j.startDate ? diffDaysL(j.startDate, bill.date) : bill.date > j.endDate ? diffDaysL(bill.date, j.endDate) : 0
    s -= Math.min(5, d / 6)
    if (j.stage === 'In Progress') s += 1
    if (!best || s > best.s) best = { job: j, why, s }
  }
  return best ? { job: best.job, why: best.why } : null
}
function diffDaysL(a: string, b: string) { return Math.round((new Date(a + 'T12:00').getTime() - new Date(b + 'T12:00').getTime()) / 864e5) }
