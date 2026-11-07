// Time-reconciliation demo data: make timecards line up with signed tickets + travel for most employee-days,
// then inject the stories: multi-job days, a blowout, a training day, a drive home for days off, unexplained overs, one under.
import type * as T from './types'
import { rng } from '../lib/util'
import { reconDay, travelEach, ticketHours, SIGNED } from './recon'

export function seedRecon(c: { T0: string; employees: T.Employee[]; jobs: T.Job[]; sites: T.Site[]; branches: T.Branch[]; tickets: T.EodTicket[]; time: T.TimeEntry[]; equipment: T.Equipment[] }): T.TimeRec[] {
  const r = rng(4242)
  const db = { employees: c.employees, jobs: c.jobs, sites: c.sites, branches: c.branches, tickets: c.tickets, time: c.time, timeRecs: [] } as unknown as T.DB
  const fmtEnd = (start: string, hrs: number) => { const [h, m] = start.split(':').map(Number); const mins = h * 60 + m + Math.round((hrs + 0.5) * 60); return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}` }
  const setDay = (empId: string, date: string, total: number) => {
    const es = c.time.filter(t => t.employeeId === empId && t.date === date); if (!es.length) return
    const cur = es.reduce((s, t) => s + t.hours, 0) || 1
    let left = Math.round(total * 4) / 4
    es.forEach((t, k) => { const h = k === es.length - 1 ? left : Math.round(t.hours / cur * total * 4) / 4; left -= h; t.hours = h; t.end = fmtEnd(t.start, h); if (t.status === 'Flagged') { t.status = 'Submitted'; t.note = undefined } })
  }
  // 1) baseline: timecard = tickets + 60-100% of the travel allowance
  const keys = new Set<string>(); c.tickets.filter(t => SIGNED.includes(t.status)).forEach(t => t.crewIds.forEach(id => keys.add(`${id}|${t.date}`)))
  const days = [...keys].map(k => k.split('|') as [string, string]).filter(([e, d]) => c.time.some(t => t.employeeId === e && t.date === d))
  days.forEach(([e, d]) => { const x = reconDay(db, e, d); if (x) setDay(e, d, x.ticketHrs + x.travelMax * (0.6 + r.next() * 0.4)) })

  const recs: T.TimeRec[] = []
  const pool = r.shuffle(days)
  const used = new Set<string>()
  const take = (pred: (e: T.Employee, d: string) => boolean) => { const hit = pool.find(([e, d]) => !used.has(e) && pred(c.employees.find(x => x.id === e)!, d)); if (hit) used.add(hit[0]); return hit }
  const bump = (e: string, d: string, extra: number) => { const x = reconDay(db, e, d)!; setDay(e, d, x.expectedMax + extra); return x }
  const rec = (e: string, d: string, o: Partial<T.TimeRec>) => recs.push({ id: `trec-${recs.length + 1}`, employeeId: e, date: d, reason: '', by: c.employees.find(x => x.id === e) ? `${c.employees.find(x => x.id === e)!.first} ${c.employees.find(x => x.id === e)!.last}` : '', at: `${d}T23:10:00.000Z`, status: 'Pending', ...o })

  // 2) multi-job days: a short second signed ticket on another job the same day
  for (let k = 0; k < 3; k++) {
    const hit = take((e, d) => c.tickets.some(t => t.date === d && !t.crewIds.includes(e.id) && SIGNED.includes(t.status)))
    if (!hit) break
    const [e, d] = hit
    const other = c.tickets.find(t => t.date === d && !t.crewIds.includes(e) && SIGNED.includes(t.status))!
    const own = c.tickets.find(t => t.date === d && t.crewIds.includes(e))!
    const morning = Math.max(3, ticketHours(own) - 4)
    c.tickets.push({ ...other, id: `tk-split-${k + 1}`, crewIds: [e], hours: { 'Lifting & Hoisting': 3, Rigging: 1 }, work: 'Afternoon pick — moved over from the morning job', photos: 1 })
    const te = c.time.find(t => t.employeeId === e && t.date === d)!
    c.time.push({ ...te, id: `te-split-${k + 1}`, jobId: other.jobId, start: '13:30', end: '18:00' })
    const x = reconDay(db, e, d)!; setDay(e, d, x.ticketHrs + x.travelMax * 0.8 + (morning ? 0 : 0))
  }
  // 3) blowout: truck driver waited roadside — reason attached to the truck (cost → unit repair)
  const drv = take(e => e.craft === 'Truck Driver' && !!e.homeTruckId && e.branchId === 'br-okc') ?? take(e => e.craft === 'Truck Driver' && !!e.homeTruckId) // El Reno is an OKC lane
  if (drv) { bump(drv[0], drv[1], 2.5); const e = c.employees.find(x => x.id === drv[0])!; rec(drv[0], drv[1], { reason: 'Breakdown / roadside wait', unitId: e.homeTruckId, note: 'Steer tire blowout on I-40 near El Reno — 2.5 hrs waiting on road service' }) }
  // 4) training day (approved, overhead)
  const trn = take(e => e.craft === 'Rigger' || e.craft === 'Oiler')
  if (trn) { bump(trn[0], trn[1], 3); rec(trn[0], trn[1], { reason: 'Training', note: 'NCCCO rigger practical prep at the yard after the job', status: 'Approved', approvedBy: 'Karen Ortiz', approvedAt: `${trn[1]}T23:40:00.000Z`, costPosted: 'overhead' }) }
  // 5) drove home / to yard to start days off
  const home = take(e => e.craft === 'Operator' && e.branchId === 'br-okc' && !(e.first === 'John' && e.last === 'Smith')) // John keeps his unexplained-over demo day
  if (home) bump(home[0], home[1], 3.5), rec(home[0], home[1], { reason: 'Drove home / to yard for days off', note: 'Job wrapped — drove the pickup back to OKC for 4 days off' })
  // 6) unexplained overs (one for the demo field employee if he has a ticketed day) and one under
  const john = c.employees.find(e => e.first === 'John' && e.last === 'Smith')
  const jd = john && pool.find(([e]) => e === john.id)
  if (jd) { used.add(john!.id); bump(jd[0], jd[1], 1.5) }
  const o1 = take(() => true); if (o1) bump(o1[0], o1[1], 2.25)
  if (!jd) { const o2 = take(() => true); if (o2) bump(o2[0], o2[1], 1.5) }
  const un = take(() => true); if (un) { const x = reconDay(db, un[0], un[1])!; setDay(un[0], un[1], x.ticketHrs - 1.5) }
  void travelEach
  return recs
}
