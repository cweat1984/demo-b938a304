// Time reconciliation: daily timecard vs SUM of customer-signed ticket hours (all jobs that day) + paid travel allowance.
import type * as T from './types'
import { today, addDays } from '../lib/util'

export const RECON_REASONS = ['Breakdown / roadside wait', 'Serviced crane', 'Serviced truck', 'Training', 'Moved to another site', 'Drove home / to yard for days off', 'Shop work', 'Other'] as const
export type ReconReason = typeof RECON_REASONS[number]
/** Where the extra hours' cost lands by default. */
export const REASON_COST: Record<ReconReason, 'unit' | 'job' | 'overhead'> = { 'Breakdown / roadside wait': 'unit', 'Serviced crane': 'unit', 'Serviced truck': 'unit', Training: 'overhead', 'Moved to another site': 'job', 'Drove home / to yard for days off': 'overhead', 'Shop work': 'overhead', Other: 'job' }
export const SIGNED: T.EodTicket['status'][] = ['Signed', 'Submitted', 'Reviewed']
const TOL = 0.25

const R = 3958.8
const miles = (a: [number, number], b: [number, number]) => { const toR = (d: number) => d * Math.PI / 180; const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]); const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }
/** Travel allowance each way for a job: job override → site override → branch rule (by distance from the yard). */
export function travelEach(db: T.DB, job: T.Job, emp?: T.Employee): number {
  if (job.travelEach != null) return job.travelEach
  const site = db.sites.find(s => s.id === job.siteId)
  if (site?.travelEach != null) return site.travelEach
  const br = db.branches.find(b => b.id === (emp?.branchId ?? job.branchId)) ?? db.branches[0]
  const rule = db.reconRules ?? { min: 0.5, max: 1, perMiles: 60 }
  if (br.travelEach != null) return br.travelEach
  const d = site ? miles([br.lat, br.lng], [site.lat, site.lng]) : rule.perMiles
  return Math.round(Math.min(rule.max, Math.max(rule.min, d / rule.perMiles)) * 4) / 4
}
export const ticketHours = (t: T.EodTicket) => Object.values(t.hours).reduce((s: number, h) => s + (h ?? 0), 0)

export type ReconStatus = 'green' | 'yellow' | 'red'
export interface ReconDay {
  key: string; employeeId: string; date: string
  tickets: { t: T.EodTicket; job: T.Job; hrs: number }[]; ticketHrs: number
  travel: { job: T.Job; each: number }[]; travelMax: number
  entries: T.TimeEntry[]; timecard: number
  expectedMax: number; diff: number // timecard − expected max (positive = over) or timecard − tickets (negative = under)
  kind: 'ok' | 'over' | 'under'; status: ReconStatus; rec?: T.TimeRec
}
export const reconKey = (empId: string, date: string) => `${empId}|${date}`
export function reconDay(db: T.DB, empId: string, date: string): ReconDay | null {
  const tks = db.tickets.filter(t => t.date === date && t.crewIds.includes(empId) && SIGNED.includes(t.status))
  if (!tks.length) return null
  const emp = db.employees.find(e => e.id === empId)
  const tickets = tks.map(t => ({ t, job: db.jobs.find(j => j.id === t.jobId)!, hrs: ticketHours(t) })).filter(x => x.job)
  const ticketHrs = tickets.reduce((s, x) => s + x.hrs, 0)
  const jobs = [...new Map(tickets.map(x => [x.job.id, x.job])).values()]
  const travel = jobs.map(job => ({ job, each: travelEach(db, job, emp) }))
  const travelMax = travel.reduce((s, x) => s + x.each * 2, 0)
  const entries = db.time.filter(t => t.employeeId === empId && t.date === date)
  const timecard = Math.round(entries.reduce((s, t) => s + t.hours, 0) * 100) / 100
  const expectedMax = ticketHrs + travelMax
  const rec = (db.timeRecs ?? []).find(r => r.employeeId === empId && r.date === date)
  const kind = timecard > expectedMax + TOL ? 'over' : timecard < ticketHrs - TOL ? 'under' : 'ok'
  const diff = kind === 'under' ? timecard - ticketHrs : timecard - expectedMax
  const status: ReconStatus = kind === 'ok' || rec?.status === 'Approved' ? 'green' : rec && rec.status === 'Pending' ? 'yellow' : 'red'
  return { key: reconKey(empId, date), employeeId: empId, date, tickets, ticketHrs, travel, travelMax, entries, timecard, expectedMax, diff, kind, status, rec }
}
/** All employee-days with signed tickets in the window. */
export function reconDays(db: T.DB, from = addDays(today(), -14), to = today()): ReconDay[] {
  const keys = new Set<string>()
  db.tickets.filter(t => t.date >= from && t.date <= to && SIGNED.includes(t.status)).forEach(t => t.crewIds.forEach(id => keys.add(reconKey(id, t.date))))
  return [...keys].map(k => { const [e, d] = k.split('|'); return reconDay(db, e, d) }).filter((x): x is ReconDay => !!x && x.entries.length > 0)
}
export const needsReason = (r: ReconDay) => r.status === 'red'
export const fmtH = (h: number) => `${Math.round(h * 100) / 100}h`
export function promptText(r: ReconDay) {
  return r.kind === 'under'
    ? `Your signed tickets total ${fmtH(r.ticketHrs)}, but you entered ${fmtH(r.timecard)}. What happened to the other ${fmtH(-r.diff)}?`
    : `Your tickets total ${fmtH(r.ticketHrs)} + ${fmtH(r.travelMax)} travel. You entered ${fmtH(r.timecard)} — what was the extra ${fmtH(r.diff)}?`
}
