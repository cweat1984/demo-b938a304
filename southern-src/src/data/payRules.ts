// Pay rules. One table on the company, one rule per person. Not hard-coded in the screens.
// An hour is paid once, at the highest multiplier that applies. The entry's calendar date
// is the day (an overnight shift split at midnight is two entries; a clocked night kept on
// the start day, including a daylight-saving night, uses that start day's rule).
import type * as T from './types'
import { startOfWeek } from '../lib/util'

export const WEEKLY_RULE_ID = 'pay-weekly'
export const DAILY_RULE_ID = 'pay-daily'

export const DEFAULT_PAY_RULES: T.PayRule[] = [
  { id: WEEKLY_RULE_ID, name: 'Weekly after 40', kind: 'weekly', otAfter: 40, otMult: 1.5, satMult: 1, sunMult: 1, dtMult: 2 },
  { id: DAILY_RULE_ID, name: 'Daily after 8, Saturday OT, Sunday double', kind: 'daily', otAfter: 8, otMult: 1.5, satMult: 1.5, sunMult: 2, dtMult: 2 },
]

const clamp = (n: number, lo: number, hi: number, dflt: number) => !Number.isFinite(n) ? dflt : Math.min(hi, Math.max(lo, n))
const r2 = (n: number) => Math.round(n * 100) / 100

export function cleanRule(r: T.PayRule): T.PayRule {
  const kind = r.kind === 'daily' ? 'daily' : 'weekly'
  const otMult = clamp(r.otMult, 1, 4, 1.5)
  const dtMult = clamp(r.dtMult, Math.max(1, otMult), 4, 2)
  return {
    id: r.id || (kind === 'daily' ? DAILY_RULE_ID : WEEKLY_RULE_ID),
    name: (r.name || '').trim() || (kind === 'daily' ? 'Daily' : 'Weekly'),
    kind,
    otAfter: clamp(r.otAfter, 1, kind === 'weekly' ? 168 : 24, kind === 'weekly' ? 40 : 8),
    otMult,
    satMult: kind === 'daily' ? clamp(r.satMult, 1, 4, 1.5) : 1,
    sunMult: kind === 'daily' ? clamp(r.sunMult, 1, 4, 2) : 1,
    dtMult,
  }
}

export function payRulesOf(db: { payRules?: T.PayRule[] } | undefined): T.PayRule[] {
  const rows = (db?.payRules ?? []).map(cleanRule).filter(r => r.id)
  const byId = new Map<string, T.PayRule>()
  for (const r of DEFAULT_PAY_RULES) byId.set(r.id, r)
  for (const r of rows) byId.set(r.id, r)
  return [...byId.values()]
}

export function ruleFor(rules: T.PayRule[], emp?: { payRuleId?: string } | null): T.PayRule {
  const id = emp?.payRuleId || WEEKLY_RULE_ID
  return rules.find(r => r.id === id) ?? rules.find(r => r.kind === 'weekly') ?? DEFAULT_PAY_RULES[0]
}

export function ruleBlurb(r: T.PayRule): string {
  if (r.kind === 'weekly' && r.otAfter === 40 && r.otMult === 1.5) return 'OT 1.5× after 40 h'
  if (r.kind === 'weekly') return `OT ${r.otMult}× after ${r.otAfter} h in the week`
  return `OT after ${r.otAfter} h · Saturday ${r.satMult}× · Sunday ${r.sunMult}×`
}

/** Fill missing rules and point every person with no rule at weekly. Mutates and returns the same db. */
export function ensurePayRules<D extends { payRules?: T.PayRule[]; employees?: { payRuleId?: string }[] }>(db: D): D {
  db.payRules = payRulesOf(db)
  for (const e of db.employees ?? []) if (!e.payRuleId) e.payRuleId = WEEKLY_RULE_ID
  return db
}

export interface PaySlice {
  reg: number
  ot: number
  dt: number
  /** Hours × the multiplier that won, so mixed rates in one entry still add up. */
  otWeight: number
  dtWeight: number
  otMult: number
  dtMult: number
}

const emptySlice = (otMult: number, dtMult: number): PaySlice => ({ reg: 0, ot: 0, dt: 0, otWeight: 0, dtWeight: 0, otMult, dtMult })

export function wagesOf(rate: number, s: PaySlice) {
  return r2((s.reg + s.otWeight + s.dtWeight) * rate)
}

/** Split one entry. dayBefore is every hour already worked that calendar day. weekBefore is every hour already worked that Monday-start week. siteBefore is hours already worked that day on the job or site that owns the double-time threshold. */
export function splitOne(opts: {
  date: string
  hours: number
  dayBefore: number
  weekBefore: number
  siteBefore: number
  rule: T.PayRule
  dtAfter?: number
  otMult?: number
  dtMult?: number
}): PaySlice {
  const rule = cleanRule(opts.rule)
  const hours = Math.max(0, opts.hours)
  const otM = opts.otMult != null && opts.otMult >= 1 ? opts.otMult : rule.otMult
  const dtM = opts.dtMult != null && opts.dtMult > 0 ? Math.max(opts.dtMult, otM) : rule.dtMult
  const dtAfter = opts.dtAfter != null && opts.dtAfter > 0 ? opts.dtAfter : undefined
  if (hours === 0) return emptySlice(otM, dtM)
  const cuts = new Set<number>([0, hours])
  const add = (at: number) => { if (at > 1e-6 && at < hours - 1e-6) cuts.add(at) }
  if (rule.kind === 'daily') add(rule.otAfter - opts.dayBefore)
  else add(rule.otAfter - opts.weekBefore)
  if (dtAfter != null) add(dtAfter - opts.siteBefore)
  const pts = [...cuts].sort((a, b) => a - b)
  const dow = new Date(opts.date + 'T12:00:00').getDay()
  let reg = 0, ot = 0, dt = 0, otWeight = 0, dtWeight = 0
  let usedOt = otM, usedDt = dtM
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i]
    const len = pts[i + 1] - p
    if (len <= 1e-9) continue
    const won: { mult: number; kind: 'reg' | 'ot' | 'dt' } = { mult: 1, kind: 'reg' }
    const offer = (m: number, as: 'ot' | 'dt') => {
      if (!(m > 1)) return
      if (m > won.mult + 1e-9) { won.mult = m; won.kind = as }
      else if (Math.abs(m - won.mult) <= 1e-9 && as === 'dt' && won.kind !== 'dt') won.kind = 'dt'
    }
    if (rule.kind === 'daily') {
      if (dow === 6) offer(rule.satMult, rule.satMult + 1e-9 >= dtM ? 'dt' : 'ot')
      if (dow === 0) offer(rule.sunMult, 'dt')
      if (opts.dayBefore + p >= rule.otAfter - 1e-9) offer(otM, 'ot')
    } else if (opts.weekBefore + p >= rule.otAfter - 1e-9) offer(otM, 'ot')
    if (dtAfter != null && opts.siteBefore + p >= dtAfter - 1e-9) offer(dtM, 'dt')
    if (won.kind === 'dt') { dt += len; dtWeight += len * won.mult; usedDt = won.mult }
    else if (won.kind === 'ot') { ot += len; otWeight += len * won.mult; usedOt = won.mult }
    else reg += len
  }
  const drift = r2(hours - (reg + ot + dt))
  return { reg: r2(reg + drift), ot: r2(ot), dt: r2(dt), otWeight: r2(otWeight), dtWeight: r2(dtWeight), otMult: ot > 0 ? r2(otWeight / ot) : usedOt, dtMult: dt > 0 ? r2(dtWeight / dt) : usedDt }
}

export interface PayEntry { id: string; employeeId?: string; date: string; start?: string; hours: number; jobId?: string }

/** Job threshold wins over the site. Hours toward a job threshold are that job only; hours toward a site threshold are every job on that site. */
export function dtContext(db: { jobs?: { id: string; siteId: string; dtAfter?: number }[]; sites?: { id: string; dtAfter?: number }[] }, jobId?: string): { key: string; after?: number } {
  if (!jobId) return { key: '' }
  const job = db.jobs?.find(j => j.id === jobId)
  if (!job) return { key: 'job:' + jobId }
  if (job.dtAfter && job.dtAfter > 0) return { key: 'job:' + job.id, after: job.dtAfter }
  const site = db.sites?.find(s => s.id === job.siteId)
  if (site?.dtAfter && site.dtAfter > 0) return { key: 'site:' + site.id, after: site.dtAfter }
  return { key: 'job:' + job.id }
}

export function splitEntries(entries: PayEntry[], rule: T.PayRule, dtOf: (e: PayEntry) => { key: string; after?: number; otMult?: number; dtMult?: number }): Map<string, PaySlice> {
  const out = new Map<string, PaySlice>()
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.start || '').localeCompare(b.start || '') || a.id.localeCompare(b.id))
  const week = new Map<string, number>()
  const day = new Map<string, number>()
  const site = new Map<string, number>()
  for (const e of sorted) {
    const wk = startOfWeek(e.date)
    const ctx = dtOf(e)
    const dayBefore = day.get(e.date) ?? 0
    const weekBefore = week.get(wk) ?? 0
    const siteKey = e.date + '|' + (ctx.key || e.jobId || '')
    const siteBefore = ctx.after ? (site.get(siteKey) ?? 0) : 0
    const slice = splitOne({ date: e.date, hours: e.hours, dayBefore, weekBefore, siteBefore, rule, dtAfter: ctx.after, otMult: ctx.otMult, dtMult: ctx.dtMult })
    out.set(e.id, slice)
    const h = Math.max(0, e.hours)
    day.set(e.date, dayBefore + h)
    week.set(wk, weekBefore + h)
    if (ctx.key) site.set(siteKey, (site.get(siteKey) ?? 0) + h)
  }
  return out
}

export function sumSlices(list: PaySlice[]): PaySlice {
  const s = emptySlice(list[0]?.otMult ?? 1.5, list[0]?.dtMult ?? 2)
  for (const x of list) { s.reg += x.reg; s.ot += x.ot; s.dt += x.dt; s.otWeight += x.otWeight; s.dtWeight += x.dtWeight }
  s.reg = r2(s.reg); s.ot = r2(s.ot); s.dt = r2(s.dt); s.otWeight = r2(s.otWeight); s.dtWeight = r2(s.dtWeight)
  if (s.ot > 0) s.otMult = r2(s.otWeight / s.ot)
  if (s.dt > 0) s.dtMult = r2(s.dtWeight / s.dt)
  return s
}
