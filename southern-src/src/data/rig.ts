/** Rig up / rig down math. One plan per crane per job (job.rig). Annual-sheet colors: dark green = moving & rigging, light green = working. */
import type * as T from './types'
import { addDays, diffDays, today, fmtDate } from '../lib/util'
import { isLive, byId, jobConflicts, siteOf, requiredPositions } from './logic'

export type RigPhase = 'move' | 'rigup' | 'work' | 'rigdown'
export const PHASE_LABEL: Record<RigPhase, string> = { move: 'Moving in', rigup: 'Rig up', work: 'Working', rigdown: 'Rig down' }
/** dark green = moving / rigging (up or down), light green = working day */
export const PHASE_CLS: Record<RigPhase, string> = { move: 'bg-[#1f6b3a] text-white', rigup: 'bg-[#1f6b3a] text-white', work: 'bg-[#9fdcae] text-[#123d22]', rigdown: 'bg-[#1f6b3a] text-white' }

export const upDaysOf = (p: T.RigPlan) => p.upMode === 'dates' ? (p.upDates ?? []).length : p.upDays
export const RIG_MAX = { up: 60, travel: 30, downDays: 90 } // dive3 B4
export const rigUpDates = (p: T.RigPlan): string[] => { if (p.upMode === 'dates') return [...(p.upDates ?? [])].sort(); const n = Math.min(RIG_MAX.up, Math.max(0, Math.round(p.upDays) || 0)); return Array.from({ length: n }, (_, i) => addDays(p.hookReady, -n + i)) }
export const rigUpStart = (p: T.RigPlan) => rigUpDates(p)[0] ?? p.hookReady
/** Start moving in by = hook ready − rig-up days − travel days (for specific dates: first rig-up date − travel days). */
export const moveInBy = (p: T.RigPlan) => addDays(rigUpStart(p), -Math.min(RIG_MAX.travel, Math.max(0, Math.round(p.travelDays) || 0)))
export const downDays = (p: T.RigPlan) => Math.min(RIG_MAX.downDays, p.downUnit === 'h' ? Math.max(1, Math.ceil(p.downAmount / 24)) : Math.max(1, Math.ceil(p.downAmount)))
export const downEnd = (p: T.RigPlan) => addDays(p.downStart, downDays(p) - 1)
export const fmtDown = (p: T.RigPlan) => p.downUnit === 'h' ? `${+p.downAmount.toFixed(2)} h` : `${+p.downAmount.toFixed(2)} day${p.downAmount === 1 ? '' : 's'}`
export const rigWindow = (p: T.RigPlan) => ({ from: [moveInBy(p), p.plannedMoveIn].filter(Boolean).sort()[0] as string, to: downEnd(p) })

export function defaultPlan(job: T.Job, craneId: string): T.RigPlan {
  return { craneId, hookReady: job.startDate, travelDays: 1, upMode: 'days', upDays: 2, downStart: addDays(job.endDate, 1), downAmount: 1, downUnit: 'd' }
}
export const plansOf = (job: T.Job) => job.rig ?? []
export const planFor = (job: T.Job, craneId?: string) => craneId ? plansOf(job).find(p => p.craneId === craneId) : undefined
/** Cranes this job uses: main crane + any crane that has its own rig plan (assist cranes). */
export const jobCranes = (job: T.Job) => [...new Set([job.craneId, ...(job.craneIds ?? []), ...plansOf(job).map(p => p.craneId)].filter(Boolean) as string[])]

/** Phase of a crane on a job for a date (null = not on this job that day). */
export function phaseOn(job: T.Job, craneId: string | undefined, d: string): RigPhase | null {
  const p = planFor(job, craneId)
  if (p) {
    const ups = rigUpDates(p)
    if (ups.includes(d)) return 'rigup'
    if (d >= p.downStart && d <= downEnd(p)) return 'rigdown'
    if (d >= p.hookReady && d <= job.endDate) return 'work'
    const w = rigWindow(p)
    if (d >= w.from && d < (ups[0] ?? p.hookReady)) return 'move'
    return null
  }
  return craneId && jobCranes(job).includes(craneId) && d >= job.startDate && d <= job.endDate ? 'work' : null
}
/** The window a crane is tied up by a job (rig plan if any, else the job's working dates). */
export function busyWindow(job: T.Job, craneId: string) {
  const p = planFor(job, craneId)
  if (p) { const w = rigWindow(p); return { from: w.from < job.startDate ? w.from : job.startDate, to: w.to > job.endDate ? w.to : job.endDate } }
  return jobCranes(job).includes(craneId) ? { from: job.startDate, to: job.endDate } : null
}
/** Live jobs using this crane, with the busy window (incl. move-in, rig-up and rig-down). */
export function craneBusy(db: T.DB, craneId: string, exceptJobId?: string, opts?: { awarded?: boolean }) {
  return db.jobs.filter(j => j.id !== exceptJobId && (isLive(j) || (opts?.awarded && j.stage === 'Awarded')) && j.stage !== 'Complete' && j.stage !== 'Invoiced' && j.stage !== 'Paid' && j.status !== 'Complete' && jobCranes(j).includes(craneId)).map(j => ({ job: j, ...busyWindow(j, craneId)! })).filter(x => x.from)
}
/** What a crane is doing on a date across all jobs. */
export function craneDay(db: T.DB, craneId: string, d: string): { job: T.Job; phase: RigPhase } | null {
  for (const j of db.jobs) { if (!isLive(j) || !jobCranes(j).includes(craneId)) continue; const ph = phaseOn(j, craneId, d); if (ph) return { job: j, phase: ph } }
  return null
}

export interface RigCheck { errors: string[]; warnings: string[] }
export function checkPlan(db: T.DB, job: T.Job, p: T.RigPlan, now = today()): RigCheck {
  const errors: string[] = [], warnings: string[] = []
  if (!p.hookReady) errors.push('Pick the Hook ready date')
  if (!(p.travelDays >= 0) || !Number.isInteger(p.travelDays)) errors.push('Travel days must be 0 or more whole days')
  if (p.upMode === 'days' && (!(p.upDays >= 1) || !Number.isInteger(p.upDays))) errors.push('Rig-up needs at least 1 whole day')
  if (p.upMode === 'dates') {
    const ds = p.upDates ?? []
    if (!ds.length) errors.push('Pick at least one rig-up date')
    if (ds.some(d => d >= p.hookReady)) errors.push('Rig-up dates must be before Hook ready')
  }
  if (p.upMode === 'days' && p.upDays > RIG_MAX.up) errors.push(`Rig-up is capped at ${RIG_MAX.up} days`)
  if (p.travelDays > RIG_MAX.travel) errors.push(`Travel is capped at ${RIG_MAX.travel} days`)
  if (p.downUnit === 'd' && p.downAmount > RIG_MAX.downDays) errors.push(`Rig-down is capped at ${RIG_MAX.downDays} days`)
  if (!(p.downAmount > 0)) errors.push(p.downUnit === 'h' ? 'Rig-down hours must be more than 0' : 'Rig-down days must be more than 0')
  if (p.downUnit === 'h' && p.downAmount > 24 * 60) errors.push('That is a lot of hours — switch to days')
  if (!p.downStart) errors.push('Pick the rig-down start date')
  else if (p.hookReady && p.downStart < p.hookReady) errors.push('Rig-down can’t start before Hook ready')
  if (p.plannedMoveIn && p.hookReady && p.plannedMoveIn > p.hookReady) errors.push('Move-in date is after Hook ready')
  if (p.hookReady && p.hookReady > job.endDate) errors.push(`Hook ready is after the job ends (${fmtDate(job.endDate)})`) // dive3 M15
  if (errors.length) return { errors, warnings }
  const by = moveInBy(p)
  if (p.plannedMoveIn && p.plannedMoveIn > by) warnings.push(`Not enough time: moving in ${fmtDate(p.plannedMoveIn)} is ${diffDays(p.plannedMoveIn, by)} day(s) late — must start by ${fmtDate(by)} to be hook ready ${fmtDate(p.hookReady)}`)
  else if (!p.plannedMoveIn && by < now && p.hookReady >= now) warnings.push(`Not enough time: should have started moving in by ${fmtDate(by)} to be hook ready ${fmtDate(p.hookReady)}`)
  if (p.hookReady > job.startDate) warnings.push(`Hook ready ${fmtDate(p.hookReady)} is after the job start ${fmtDate(job.startDate)}`)
  if (p.downStart < job.endDate) warnings.push(`Rig-down starts before the last working day (${fmtDate(job.endDate)})`)
  const w = { from: rigWindow(p).from < job.startDate ? rigWindow(p).from : job.startDate, to: downEnd(p) > job.endDate ? downEnd(p) : job.endDate }
  for (const o of craneBusy(db, p.craneId, job.id)) if (o.from <= w.to && w.from <= o.to) warnings.push(`Crane ${byId(db.equipment, p.craneId)?.unit ?? ''} is also on Job #${o.job.jobNo} ${fmtDate(o.from)}–${fmtDate(o.to)}`)
  return { errors, warnings }
}

// ── one crane, several jobs in a day ────────────────────────────────────────────
export const hoursOf = (job: T.Job, craneId: string) => job.craneHours?.[craneId]
const t12 = (t: string) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''}${h < 12 ? 'a' : 'p'}` }
export const fmtHours = (h?: { from: string; to: string }) => h ? `${t12(h.from)}–${t12(h.to)}` : 'all day'
/** Every job a crane is on for a date (any phase), ordered by start hour. */
export function craneJobsOn(db: T.DB, craneId: string, d: string) {
  return db.jobs.filter(j => isLive(j) && jobCranes(j).includes(craneId)).map(j => ({ job: j, phase: phaseOn(j, craneId, d), hours: hoursOf(j, craneId) })).filter(x => x.phase)
    .sort((a, b) => (a.hours?.from ?? '00:00').localeCompare(b.hours?.from ?? '00:00')) as { job: T.Job; phase: RigPhase; hours?: { from: string; to: string } }[]
}
/** dive3 B1 — THE one rule for a crane on two jobs the same day (board, forecast, swap picker, Add crane, Job Builder):
 *  it's a CLASH (red) when either job has no hours set for it, the hours overlap, or either side is moving / rigging up / rigging down
 *  (those are all-day). Only two working jobs with set, non-overlapping hours share the crane (info). */
export function clashWhy(mine: { from: string; to: string } | undefined, myPhase: RigPhase, o: { phase: RigPhase; hours?: { from: string; to: string } }): string | null {
  if (myPhase !== 'work' || o.phase !== 'work') return o.phase === 'work' && myPhase !== 'work' ? `${PHASE_WORD[myPhase]} here` : `${PHASE_WORD[o.phase]} there`
  if (!mine || !o.hours) return 'no hours set'
  return mine.from < o.hours.to && o.hours.from < mine.to ? 'hours overlap' : null
}
/** dive3 dispatch M11: two set, non-overlapping half-days only share a crane if it can drive between the sites in the gap.
 *  Road miles ≈ straight line × 1.2 at 45 mph for a crane, plus nothing for set-up (that's rig time). */
export const CRANE_MPH = 45
function hm(t: string) { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60 }
export function driveHours(db: T.DB, a: T.Job, b: T.Job) {
  const s1 = siteOf(db, a), s2 = siteOf(db, b)
  if (!s1 || !s2 || s1.id === s2.id) return 0
  const R = 3958.8, rad = Math.PI / 180, dLat = (s2.lat - s1.lat) * rad, dLng = (s2.lng - s1.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(s1.lat * rad) * Math.cos(s2.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h)) * 1.2 / CRANE_MPH
}
export function driveWhy(db: T.DB, job: T.Job, mine: { from: string; to: string } | undefined, other: T.Job, theirs: { from: string; to: string } | undefined): string | null {
  if (!mine || !theirs) return null
  const need = driveHours(db, job, other); if (!need) return null
  const gap = mine.to <= theirs.from ? hm(theirs.from) - hm(mine.to) : hm(mine.from) - hm(theirs.to)
  return gap + 1e-9 < need ? `≈${need.toFixed(1)} h drive, ${Math.max(0, gap).toFixed(1)} h gap` : null
}
const PHASE_WORD: Record<RigPhase, string> = { work: 'working', move: 'moving', rigup: 'rigging up', rigdown: 'rigging down' }
/** Other jobs this crane is on that day, each marked clash (red) or shared (info). A crane not yet on `job` is treated as working all day. */
export function sharedOn(db: T.DB, job: T.Job, craneId: string, d: string) {
  const mine = hoursOf(job, craneId), myPhase = phaseOn(job, craneId, d) ?? 'work'
  return craneJobsOn(db, craneId, d).filter(x => x.job.id !== job.id).map(x => {
    const why = clashWhy(mine, myPhase, x) ?? driveWhy(db, job, mine, x.job, x.hours), clash = !!why
    return { job: x.job, hours: x.hours, clash, why, text: clash ? `Double-booked: also on Job #${x.job.jobNo} ${d === today() ? 'today' : fmtDate(d)}${x.hours ? ` ${fmtHours(x.hours)}` : ''} (${why})` : `Also on Job #${x.job.jobNo} ${d === today() ? 'today' : fmtDate(d)}${x.hours ? `, ${fmtHours(x.hours)}` : ''}` }
  })
}
/** First day in [from, to] (capped at 400 days) where putting craneId on job clashes with another job. */
export function firstClash(db: T.DB, job: T.Job, craneId: string, from: string, to: string) {
  let n = 0
  for (let d = from; d <= to && n < 400; d = addDays(d, 1), n++) { const x = sharedOn(db, job, craneId, d).find(y => y.clash); if (x) return { d, ...x } }
  return null
}
/** Forecast: first day in a window where two jobs clash on this crane (same rule as the board). */
export function craneClashDay(db: T.DB, craneId: string, from: string, to: string) {
  let n = 0
  for (let d = from; d <= to && n < 400; d = addDays(d, 1), n++) { const on = craneJobsOn(db, craneId, d); for (let i = 0; i < on.length; i++) for (let k = i + 1; k < on.length; k++) if (clashWhy(on[i].hours, on[i].phase, on[k]) ?? driveWhy(db, on[i].job, on[i].hours, on[k].job, on[k].hours)) return d }
  return null
}
/** Shared days across the whole job (for the job view), first few. */
export function sharedDays(db: T.DB, job: T.Job, craneId: string, limit = 4) {
  const p = planFor(job, craneId); const from = p ? rigWindow(p).from : job.startDate, to = p ? downEnd(p) : job.endDate
  const out: { d: string; text: string; clash: boolean }[] = []
  for (let d = from < job.startDate ? from : job.startDate; d <= (to > job.endDate ? to : job.endDate) && out.length < limit; d = addDays(d, 1)) sharedOn(db, job, craneId, d).forEach(x => out.length < limit && out.push({ d, text: x.text.replace(' today', ` ${fmtDate(d)}`), clash: x.clash }))
  return out
}

// ── outside (hired) cranes ──────────────────────────────────────────────────────
export const OUTSIDE_ROLES: T.OutsideRole[] = ['Cover', 'Rig-up assist', 'Rig-down assist', 'Work assist']
export const outsidePhase = (o: T.OutsideCrane): RigPhase => o.role === 'Rig-up assist' ? 'rigup' : o.role === 'Rig-down assist' ? 'rigdown' : 'work'
export const outsideOf = (job: T.Job) => job.outside ?? []
export const outsideOn = (job: T.Job, d: string) => outsideOf(job).filter(o => o.status !== 'Done' && o.from <= d && d <= o.to)
export const vendorOf = (db: T.DB, id: string) => (db.craneVendors ?? []).find(v => v.id === id)
/** Total cranes on a job: our fleet + hired. */
export const craneCount = (job: T.Job) => jobCranes(job).length + outsideOf(job).length
export function checkOutside(o: Partial<T.OutsideCrane>, job?: T.Job) {
  const e: string[] = []
  // dive3 m2: hire dates stay near the job (rig-up/rig-down assists can be up to 30 days outside), and no second identical hire
  if (job && o.from && o.to && (o.from < addDays(job.startDate, -30) || o.to > addDays(job.endDate, 30))) e.push(`Dates must be within 30 days of the job (${fmtDate(job.startDate)} – ${fmtDate(job.endDate)})`)
  if (job && o.vendorId && o.size && (job.outside ?? []).some(x => x.id !== o.id && x.vendorId === o.vendorId && x.size.trim().toLowerCase() === o.size!.trim().toLowerCase() && x.status !== 'Done' && o.from && o.to && x.from <= o.to && o.from <= x.to)) e.push('That crane is already hired for these dates on this job')
  if (!o.vendorId) e.push('Pick or add the crane company')
  if (!o.size?.trim()) e.push('Enter the crane size (e.g. 220t)')
  if (!o.from || !o.to) e.push('Pick the dates'); else if (o.to < o.from) e.push('End date is before start date')
  if (o.hours && !(o.hours.from < o.hours.to)) e.push('End time must be after start time')
  if (o.rate != null && !(o.rate >= 0)) e.push('Rate can’t be negative')
  return e
}

// e2e hook (DEV / VITE_E2E only, like __store): the shared crane rule
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') (window as unknown as { __rig: unknown }).__rig = { jobConflicts, sharedOn, firstClash, craneClashDay, rigUpDates, downDays, moveInBy, driveHours, driveWhy, requiredPositions }
