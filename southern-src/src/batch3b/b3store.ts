// Batch 3b: site recon, change orders, cert reminders, site data. Own persisted slice (never touches the main DB/seed).
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type * as T from '../data/types'
import { addDays, today } from '../lib/util'

export type Severity = 'High' | 'Medium' | 'Low'
export interface Hazard { id: string; kind: string; detail: string; severity: Severity; control: string; fixBy: 'Customer' | 'Southern'; customerVisible: boolean }
export interface RequiredItem { id: string; item: string; qty: number; why: string; status: 'Suggested' | 'Added' }
export interface Recon {
  id: string; jobId: string; siteId: string; by: string; at: string; status: 'Draft' | 'Approved'; approvedBy?: string
  f: Record<string, string>; photos: string[]; hazards: Hazard[]; required: RequiredItem[]; internal: string
}
export interface Audit { at: string; by: string; what: string }
export interface ChangeOrder {
  id: string; no: string; jobId: string; title: string; why: string; laborHrs: number; equipDays: number; extraDays: number
  cost: number; schedule: string; status: 'Draft' | 'Sent' | 'Verbal' | 'Approved' | 'Declined'; signer?: string; signature?: string; audit: Audit[]
}
export const SITE_KINDS = ['Turbine pad', 'Road', 'Gate code', 'O&M contact', 'Laydown', 'Hotel', 'Other'] as const
export type SiteKind = typeof SITE_KINDS[number]
export const SITE_FORMS: Record<SiteKind, string[]> = {
  'Turbine pad': ['Pad / turbine #', 'Turbine model', 'Pad condition', 'Crane setup side'],
  Road: ['Road / segment', 'Surface', 'Width & turns', 'Restrictions'],
  'Gate code': ['Gate', 'Code', 'Hours'],
  'O&M contact': ['Name', 'Role', 'Phone'],
  Laydown: ['Area', 'Size', 'Ground'],
  Hotel: ['Hotel', 'Truck parking', 'Notes'],
  Other: ['Title', 'Note'],
}
export interface SiteNote { id: string; siteId: string; kind: SiteKind; fields: Record<string, string>; by: string; at: string; photo?: string }
export interface Reminder { certId: string; at: string; to: string }

const rid = () => Math.random().toString(36).slice(2, 8)
interface B3 {
  seeded: boolean; recons: Recon[]; cos: ChangeOrder[]; notes: SiteNote[]; reminders: Reminder[]
  seed: (db: T.DB, jobId?: string) => void
  saveRecon: (r: Recon) => void
  addCO: (c: Omit<ChangeOrder, 'id' | 'no' | 'audit' | 'status'>, by: string) => string
  coAct: (id: string, p: Partial<ChangeOrder>, by: string, what: string) => void
  addNote: (n: Omit<SiteNote, 'id' | 'at'>) => void
  remind: (r: Reminder) => void
}
export const useB3 = create<B3>()(persist((set, get) => ({
  seeded: false, recons: [], cos: [], notes: [], reminders: [],
  seed(db, jobId) {
    if (get().seeded) return
    const job = db.jobs.find(j => j.id === jobId); if (!job) return
    const at = new Date(Date.now() - 400 * 864e5).toISOString()
    set({ seeded: true,
      notes: [
        { id: rid(), siteId: job.siteId, kind: 'Gate code', fields: { Gate: 'Gate 2 (not Gate 1)', Code: '4471#', Hours: '5 AM – 8 PM' }, by: 'J. Ortiz', at: new Date(Date.now() - 60 * 864e5).toISOString() },
        { id: rid(), siteId: job.siteId, kind: 'Turbine pad', fields: { 'Pad / turbine #': 'T-14', 'Turbine model': 'GE 2.8-127', 'Pad condition': 'Floods after rain — mat the north side', 'Crane setup side': 'North' }, by: 'J. Ortiz', at: new Date(Date.now() - 60 * 864e5).toISOString() },
        { id: rid(), siteId: job.siteId, kind: 'Road', fields: { 'Road / segment': 'CR 140 low-water crossing', Surface: 'Gravel', 'Width & turns': '16 ft, tight left at mile 3', Restrictions: 'Impassable after rain' }, by: 'M. Reed', at },
        { id: rid(), siteId: job.siteId, kind: 'O&M contact', fields: { Name: 'Rick Dawson', Role: 'O&M Site Manager', Phone: '(405) 555-0131' }, by: 'C. Weathers', at: new Date(Date.now() - 20 * 864e5).toISOString() },
        { id: rid(), siteId: job.siteId, kind: 'Hotel', fields: { Hotel: 'Hampton Inn', 'Truck parking': 'Yes — back lot', Notes: 'Crew favorite' }, by: 'J. Ortiz', at: new Date(Date.now() - 60 * 864e5).toISOString() },
      ],
      cos: [{ id: rid(), no: 'CO-001', jobId: job.id, title: 'Extra standby for high wind', why: 'Sustained 28 mph at hub height on two days; customer asked crew to hold.', laborHrs: 40, equipDays: 0, extraDays: 2, cost: 2 * job.dayRate + 40 * 95, schedule: 'Crane stays 2 more days.', status: 'Sent', audit: [{ at: new Date(Date.now() - 864e5).toISOString(), by: 'Chad Weathers', what: 'Created' }, { at: new Date(Date.now() - 864e5 + 6e5).toISOString(), by: 'Chad Weathers', what: 'Sent to customer portal' }] }],
    })
  },
  saveRecon(r) { set({ recons: [r, ...get().recons.filter(x => x.id !== r.id)] }) },
  addCO(c, by) { const id = rid(); set({ cos: [{ ...c, id, no: `CO-${String(get().cos.filter(x => x.jobId === c.jobId).length + 1).padStart(3, '0')}`, status: 'Draft', audit: [{ at: new Date().toISOString(), by, what: `Created · $${c.cost.toLocaleString()} · +${c.extraDays} day(s)` }] }, ...get().cos] }); return id },
  coAct(id, p, by, what) { set({ cos: get().cos.map(c => c.id === id ? { ...c, ...p, audit: [...c.audit, { at: new Date().toISOString(), by, what }] } : c) }) },
  addNote(n) { set({ notes: [{ ...n, id: rid(), at: new Date().toISOString() }, ...get().notes] }) },
  remind(r) { set({ reminders: [r, ...get().reminders] }) },
}), { name: 'sc-batch3b', version: 1 }))

/** Hazards + required items derived from what the recon form says. */
export function deriveFromRecon(f: Record<string, string>, siteName: string): { hazards: Hazard[]; required: RequiredItem[] } {
  const hz: Hazard[] = [], rq: RequiredItem[] = []
  const add = (kind: string, detail: string, severity: Severity, control: string, fixBy: Hazard['fixBy']) => hz.push({ id: rid(), kind, detail, severity, control, fixBy, customerVisible: true })
  const req = (item: string, qty: number, why: string) => rq.push({ id: rid(), item, qty, why, status: 'Suggested' })
  if (f.ground === 'Soft' || f.ground === 'Wet / rutted') { add('Ground conditions', `${f.ground} ground at the crane pad`, 'High', 'Crane mats under outriggers and tracks; re-check after rain.', 'Southern'); req('Crane mats (4×16 ft)', Number(f.mats) || 24, 'Soft ground at pad') }
  if (f.overhead && Number(f.overheadFt) <= 20) { add('Overhead power lines', `${f.overhead} — ${f.overheadFt} ft from the swing radius`, 'High', 'Dedicated spotter, energized-line plan; customer to request de-energize or cover.', 'Customer'); req('Spotter', 1, 'Power line within 20 ft'); req('Energized-line lift plan', 1, 'Power line within 20 ft') }
  else if (f.overhead) add('Overhead lines', `${f.overhead} — ${f.overheadFt || '?'} ft away`, 'Medium', 'Flag the line and brief the crew.', 'Southern')
  if (f.underground) add('Underground utilities', f.underground, 'Medium', 'Customer to locate (811) and mark before setup.', 'Customer')
  if (f.access) add('Access road', f.access, f.access.match(/wash|culvert|bridge|narrow/i) ? 'High' : 'Low', 'Customer to grade / repair before mobilization; pilot car on the turn.', 'Customer')
  if (f.gateGuard === 'Yes') req(`Gate guard contact on job card${f.gateContact ? ` (${f.gateContact})` : ''}`, 1, 'Gate guard on site')
  if (f.cell === 'None' || f.cell === 'Spotty') { add('Communications', `Cell coverage ${f.cell.toLowerCase()} at ${siteName}`, 'Low', 'Satellite messenger and handheld radios.', 'Southern'); req('Handheld radios', 4, 'No reliable cell coverage') }
  if (f.pad) add('Crane pad / staging', f.pad, 'Medium', 'Customer to level pad and clear laydown before arrival.', 'Customer')
  return { hazards: hz, required: rq }
}

/** Similar past jobs: same type, similar crane class, completed or in the past. What they used and what went wrong. */
export function similarJobs(db: T.DB, job: T.Job) {
  const cap = db.equipment.find(e => e.id === job.craneId)?.capacity ?? 0
  const past = db.jobs.filter(j => j.id !== job.id && j.type === job.type && j.endDate < today()).map(j => ({ j, cap: db.equipment.find(e => e.id === j.craneId)?.capacity ?? 0 }))
    .filter(x => !cap || !x.cap || Math.abs(x.cap - cap) <= cap * 0.5).slice(0, 5)
  const extras = new Map<string, number>(); past.forEach(({ j }) => j.extraEquipment.forEach(e => extras.set(e, (extras.get(e) ?? 0) + 1)))
  const tix = past.flatMap(({ j }) => db.tickets.filter(t => t.jobId === j.id))
  const delays = tix.filter(t => t.delays).map(t => t.delays)
  const wind = delays.filter(d => /wind/i.test(d)).length
  return { past: past.map(x => x.j), extras: [...extras].sort((a, b) => b[1] - a[1]).slice(0, 5), delays: delays.slice(0, 3), windDays: wind, avgCrew: past.length ? Math.round(past.reduce((s, { j }) => s + j.positions.length, 0) / past.length) : 0 }
}

/** Schedule impact: does keeping this crane N more days bump its next job? */
export function scheduleImpact(db: T.DB, job: T.Job, extraDays: number) {
  if (!extraDays) return 'No schedule change.'
  const crane = db.equipment.find(e => e.id === job.craneId)
  const newEnd = addDays(job.endDate, extraDays)
  const next = db.jobs.filter(j => j.id !== job.id && j.craneId && j.craneId === job.craneId && j.startDate > job.endDate).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  const base = `${crane ? `Crane ${crane.unit}` : 'Crew'} stays ${extraDays} more day${extraDays > 1 ? 's' : ''} (to ${newEnd}).`
  if (next && next.startDate <= newEnd) { const site = db.sites.find(s => s.id === next.siteId); return `${base} That bumps Job ${next.jobNo}${site ? ` at ${site.name}` : ''} to ${addDays(newEnd, 1)}.` }
  return `${base} No conflict with the next booking.`
}
