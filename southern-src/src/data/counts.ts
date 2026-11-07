/** One source of truth for the "how many need me" numbers, so home chips, alerts and the pages always agree.
 *  Every count respects the branch / division filter the user has picked. */
import type * as T from './types'
import { inScope, byId } from './logic'
import { today, addDays, startOfWeek } from '../lib/util'
type F = { divisionId: string; branchId: string }
const inBranch = (b: { branchId?: string }, f: F) => f.branchId === 'all' || b.branchId === f.branchId
export const billsToCode = (db: T.DB, f: F) => db.bills.filter(b => b.status === 'Needs Coding' && inBranch(b, f))
export const billsToApprove = (db: T.DB, f: F) => db.bills.filter(b => b.status === 'Pending Approval' && inBranch(b, f))
/** Same set as Time & Payroll → "Needs approval" for this week. */
export const timeToApprove = (db: T.DB, f: F, wk = startOfWeek(today())) => { const end = addDays(wk, 6); return db.time.filter(t => t.date >= wk && t.date <= end && (t.status === 'Submitted' || t.status === 'Flagged') && inScope(byId(db.employees, t.employeeId), f)) }
export const timeFlagged = (db: T.DB, f: F) => timeToApprove(db, f).filter(t => t.status === 'Flagged')
