/** DOT Driver Qualification files (49 CFR 391). One file per CDL driver; any red item blocks Smart Pickup. Local store 'sc-dq-v1'. */
import { create } from 'zustand'
import type * as T from '../data/types'
import { today, addDays } from '../lib/util'
import { h, daysBetween, audit, load, save, type Tone } from './util'
import { fullName } from '../data/logic'
import { dotCleared } from './drug'

export type DqKey = 'cdl' | 'med' | 'mvr' | 'road' | 'app' | 'prior' | 'review'
export const DQ_LABEL: Record<DqKey, string> = { cdl: 'CDL', med: 'DOT medical card', mvr: 'Annual MVR', road: 'Road test', app: 'Employment application', prior: 'Prior-employer checks (3 yr)', review: 'Annual review of driving record' }
export const DQ_RULE: Record<DqKey, string> = { cdl: 'Valid license, class and endorsements for the load (§391.11)', med: 'Medical examiner’s certificate, max 2 years (§391.43)', mvr: 'Motor vehicle record from each state, every 12 months (§391.25)', road: 'Road test or equivalent on hire (§391.31)', app: 'Signed application on hire (§391.21)', prior: 'Safety-performance history from DOT employers, past 3 years, within 30 days of hire (§391.23)', review: 'Annual review + driver’s list of violations (§391.25/27)' }
export interface DqOverride { mvr?: string; road?: string; app?: string; prior?: 'Complete' | 'Pending'; review?: string; endorse?: string[]; cls?: 'A' | 'B' }
export interface DqItem { key: DqKey; label: string; tone: Tone; status: string; due?: string }

export const isDriver = (e: T.Employee) => e.craft === 'Truck Driver' && e.status !== 'Inactive'
export const drivers = (db: T.DB) => db.employees.filter(isDriver)

const KEY = 'sc-dq-v1'
interface S { over: Record<string, DqOverride>; set(empId: string, who: string, p: DqOverride, what: string): void; reset(): void }
export const useDq = create<S>((set, get) => ({
  over: load<Record<string, DqOverride>>(KEY, 'object') ?? {},
  set(empId, who, p, what) { const over = { ...get().over, [empId]: { ...get().over[empId], ...p } }; save(KEY, over); set({ over }); audit('DQ file updated', who, what) },
  reset() { localStorage.removeItem(KEY); set({ over: {} }) },
}))

/** Deterministic seeded file. Two drivers are out of date on purpose so the demo shows a block. */
export function dqFile(db: T.DB, e: T.Employee, over: DqOverride = {}) {
  const t = today(), r = h(e.id + 'dq')
  const list = drivers(db).map(x => x.id).sort()
  const idx = list.indexOf(e.id)
  const cdl = db.certs.filter(c => c.employeeId === e.id && c.type === 'CDL Class A').sort((a, b) => b.expires.localeCompare(a.expires))[0]
  const med = db.certs.filter(c => c.employeeId === e.id && c.type === 'DOT Medical Card').sort((a, b) => b.expires.localeCompare(a.expires))[0]
  const hire = e.hireDate ?? addDays(t, -900)
  const base = {
    cls: 'A' as const, endorse: ['N (tank)', 'T (doubles)', 'H (hazmat)'].filter((_, i) => h(e.id + 'en' + i) < .45),
    mvr: addDays(t, -Math.round(20 + r * 300)), road: addDays(hire, 1), app: addDays(hire, -6),
    prior: 'Complete' as 'Complete' | 'Pending', review: addDays(t, -Math.round(30 + h(e.id + 'rv') * 300)),
  }
  // Demo states: one MVR lapsed, one annual review coming due, one new driver still waiting on prior-employer checks.
  if (idx === 3) base.mvr = addDays(t, -372)
  if (idx === 6) base.review = addDays(t, -351)
  if (idx === 9) base.prior = 'Pending'
  const f = { ...base, ...over }
  return { e, cdl, med, ...f, hire }
}
const annual = (d: string): { tone: Tone; status: string; due: string } => { const due = addDays(d, 365), left = daysBetween(today(), due); return { tone: left < 0 ? 'bad' : left <= 30 ? 'warn' : 'ok', status: left < 0 ? `Overdue ${-left} d` : left <= 30 ? `Due in ${left} d` : 'Current', due } }
const exp = (d?: string): { tone: Tone; status: string; due?: string } => { if (!d) return { tone: 'bad', status: 'Missing' }; const left = daysBetween(today(), d); return { tone: left < 0 ? 'bad' : left <= 30 ? 'warn' : 'ok', status: left < 0 ? `Expired ${-left} d ago` : left <= 30 ? `Expires in ${left} d` : 'Current', due: d } }

export function dqItems(db: T.DB, e: T.Employee, over?: DqOverride): DqItem[] {
  const f = dqFile(db, e, over)
  const hireAge = daysBetween(f.hire, today())
  return [
    { key: 'cdl', label: `CDL Class ${f.cls}${f.endorse.length ? ' · ' + f.endorse.join(', ') : ''}`, ...exp(f.cdl?.expires) },
    { key: 'med', label: DQ_LABEL.med, ...exp(f.med?.expires) },
    { key: 'mvr', label: DQ_LABEL.mvr, ...annual(f.mvr) },
    { key: 'road', label: DQ_LABEL.road, tone: f.road ? 'ok' : 'bad', status: f.road ? 'On file' : 'Missing' },
    { key: 'app', label: DQ_LABEL.app, tone: f.app ? 'ok' : 'bad', status: f.app ? 'On file' : 'Missing' },
    { key: 'prior', label: DQ_LABEL.prior, tone: f.prior === 'Complete' ? 'ok' : hireAge > 30 ? 'bad' : 'warn', status: f.prior === 'Complete' ? 'Complete' : 'Pending — 2 of 3 employers replied' },
    { key: 'review', label: DQ_LABEL.review, ...annual(f.review) },
  ].map(x => ({ ...x, label: x.label ?? DQ_LABEL[x.key as DqKey] })) as DqItem[]
}
/** The one rule Smart Pickup uses: anything red or still pending = not dispatchable. */
export function dqCheck(db: T.DB, e: T.Employee, over?: DqOverride) {
  const items = dqItems(db, e, over ?? useDq.getState().over[e.id])
  const bad = items.filter(i => i.tone === 'bad' || (i.key === 'prior' && i.tone !== 'ok'))
  const hold = e.ssHold ? ['Not cleared for safety-sensitive work — contact the DER'] : [] // dive2: D&A hold (reason stays with the DER)
  if (e.noDrive && !dotCleared(e.id)) hold.push('Non-driving until DOT cleared (pre-employment test + Clearinghouse query)') // dive3 M3
  return { items, blocked: bad.length > 0 || hold.length > 0, reasons: [...hold, ...bad.map(i => `${DQ_LABEL[i.key]}: ${i.status.toLowerCase()}`)], soon: items.filter(i => i.tone === 'warn') }
}
export function dqSummary(db: T.DB) {
  const over = useDq.getState().over
  const rows = drivers(db).map(e => ({ e, name: fullName(e), ...dqCheck(db, e, over[e.id]) }))
  return { rows, blocked: rows.filter(r => r.blocked), soon: rows.filter(r => !r.blocked && r.soon.length) }
}
