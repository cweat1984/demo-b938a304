/** Requirement H: extra people / support equipment on a job (or ones taken off), charged or credited per day,
 *  billable to the customer or absorbed (non-billable — job costing / P&L only). Pure helpers, no store import. */
import type * as T from './types'
import { diffDays, dateOf } from '../lib/util'

export const PEOPLE: { role: string; rate: number; cost: number }[] = [
  { role: 'Operator', rate: 1450, cost: 880 }, { role: 'Rigger', rate: 1150, cost: 690 }, { role: 'Oiler', rate: 1050, cost: 620 },
  { role: 'Truck Driver', rate: 980, cost: 600 }, { role: 'HSE', rate: 1250, cost: 760 }, { role: 'Supervisor', rate: 1550, cost: 940 },
  { role: 'Crane Manager', rate: 1850, cost: 1120 }, { role: 'Field Superintendent', rate: 1750, cost: 1060 }, { role: 'Mechanic', rate: 1200, cost: 720 },
]
export const EQUIP: { role: string; rate: number; cost: number }[] = [
  { role: 'Manlift', rate: 450, cost: 240 }, { role: 'Forklift', rate: 420, cost: 220 }, { role: 'Light tower', rate: 160, cost: 70 },
  { role: 'Service truck', rate: 620, cost: 310 }, { role: 'Pickup', rate: 180, cost: 90 }, { role: 'Generator', rate: 210, cost: 95 },
  { role: 'Support equipment (other)', rate: 500, cost: 250 },
]
export const rateFor = (kind: T.ExtraKind, role: string) => (kind === 'person' ? PEOPLE : EQUIP).find(x => x.role === role) ?? { role, rate: 0, cost: 0 }
/** Roles who may add/remove extras and set billable (dispatch, ops/PM, superintendent = branch, owner). */
export const EXTRA_EDITORS: T.RoleKey[] = ['owner', 'ops', 'dispatch', 'branch']
/** Roles who see dollars on extras (finance). */
export const EXTRA_MONEY: T.RoleKey[] = ['owner', 'ops', 'accounting']

/** Last day an extra counts: its own end, else the job end — and for equipment, the day it was picked up (call-off). */
export function extraEnd(job: T.Job, x: T.JobExtra) {
  let end = x.to && x.to < job.endDate ? x.to : job.endDate
  if (x.calloff?.status === 'Picked up') { const d = dateOf(x.calloff.at); if (d < end) end = d }
  return end
}
export function extraDays(job: T.Job, x: T.JobExtra, upTo?: string) {
  const from = x.from > job.startDate ? x.from : job.startDate
  let to = extraEnd(job, x); if (upTo && upTo < to) to = upTo
  return to < from ? 0 : diffDays(to, from) + 1
}
const sign = (x: T.JobExtra) => x.action === 'remove' ? -1 : 1
/** Money for one extra over `days`: charge (+) or credit (−) to the customer if billable, cost always. */
export function extraMoney(x: T.JobExtra, days: number) {
  const s = sign(x), cost = s * x.cost * x.qty * days, bill = x.billable ? s * x.rate * x.qty * days : 0
  return { cost, bill, absorbed: x.billable ? 0 : cost, marginImpact: bill - cost }
}
export function extrasSummary(job: T.Job, upTo?: string) {
  const xs = job.extras ?? []
  const rows = xs.map(x => { const d = extraDays(job, x, upTo); return { x, days: d, ...extraMoney(x, d) } })
  const sum = (k: 'cost' | 'bill' | 'absorbed' | 'marginImpact') => rows.reduce((a, r) => a + r[k], 0)
  return { rows, cost: sum('cost'), billable: sum('bill'), absorbed: sum('absorbed'), marginImpact: sum('marginImpact') }
}
export const extraLabel = (x: T.JobExtra) => `${x.action === 'remove' ? '−' : '+'}${x.qty} ${x.role}${x.qty > 1 && x.kind === 'person' ? 's' : ''}`
/** Customer-facing lines (tickets, invoices, proposals) — billable only, never absorbed cost. */
export function customerExtraLines(job: T.Job, upTo?: string) {
  return extrasSummary(job, upTo).rows.filter(r => r.x.billable && r.days > 0).map(r => ({ description: `${r.x.action === 'remove' ? 'Credit — removed' : 'Added'} ${r.x.qty} × ${r.x.role} · ${r.days} day${r.days > 1 ? 's' : ''} from ${r.x.from}`, qty: r.days * r.x.qty, rate: (r.x.action === 'remove' ? -1 : 1) * r.x.rate }))
}
export const isOnTicketDates = (db: T.DB, jobId: string, from: string, to: string) => db.tickets.some(t => t.jobId === jobId && (t.signedAt || t.signerName) && t.date >= from && t.date <= to)
