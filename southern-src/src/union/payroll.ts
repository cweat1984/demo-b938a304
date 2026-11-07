// Union payroll rules: job county → IUOE local → scale; job rate profiles apply only while a worker is on that job.
import type * as T from '../data/types'
import { countyOfJobTurbine } from './turbine'

export interface URate { c: string; cr: boolean; oi: boolean; b: number; f: number | null; ft: string; eff: string; ct: string; wd: string; u: string; n: number; st: string; co: string[] }
export interface ULocal { local: number | string; name: string; designation: string; hq_city: string | null; hq_state: string | null; website: string | null; offices: { city: string; state: string; phone: string }[]; counties: [string, string][]; rates: URate[]; cba: Record<string, unknown>; pri: boolean; nr: number }

/** Seeded job sites → county (from city; checked against Census county seats/place lists). */
export const SITE_COUNTY: Record<string, string> = {
  'Oklahoma City|OK': 'Oklahoma', 'Midwest City|OK': 'Oklahoma', 'Ponca City|OK': 'Kay', 'Ardmore|OK': 'Carter', 'Woodward|OK': 'Woodward', 'Hinton|OK': 'Caddo', 'Kingfisher|OK': 'Kingfisher', 'Catoosa|OK': 'Rogers', 'Muskogee|OK': 'Muskogee', 'Enid|OK': 'Garfield', 'Lawton|OK': 'Comanche', 'Guymon|OK': 'Texas', 'Stillwater|OK': 'Payne', 'Norman|OK': 'Cleveland', 'Elk City|OK': 'Beckham', 'Duncan|OK': 'Stephens', 'Tulsa|OK': 'Tulsa',
  'Amarillo|TX': 'Potter', 'Wichita Falls|TX': 'Wichita', 'Fort Worth|TX': 'Tarrant', 'Dallas|TX': 'Dallas', 'Sherman|TX': 'Grayson', 'Childress|TX': 'Childress', 'Midland|TX': 'Midland', 'Odessa|TX': 'Ector', 'Big Spring|TX': 'Howard', 'Pecos|TX': 'Reeves', 'Andrews|TX': 'Andrews', 'Sweetwater|TX': 'Nolan', 'Lubbock|TX': 'Lubbock', 'Lufkin|TX': 'Angelina', 'Longview|TX': 'Gregg', 'Tyler|TX': 'Smith', 'Marshall|TX': 'Harrison', 'Kilgore|TX': 'Gregg', 'Texarkana|TX': 'Bowie', 'Nacogdoches|TX': 'Nacogdoches', 'Houston|TX': 'Harris',
}
export const countyOf = (s?: T.Site) => s ? (SITE_COUNTY[`${s.city}|${s.state}`] ?? null) : null

export type UClass = 'Crane — large (≥100 t)' | 'Crane — standard' | 'Oiler' | 'None'
export function classFor(e: T.Employee, cap?: number, override?: UClass): UClass {
  if (override) return override
  if (e.craft === 'Operator') return (cap ?? 0) >= 100 ? 'Crane — large (≥100 t)' : 'Crane — standard'
  if (e.craft === 'Oiler') return 'Oiler'
  return 'None'
}

export function localsForCounty(all: ULocal[], county: string | null, state: string): ULocal[] {
  if (!county) return []
  const hit = all.filter(l => l.counties.some(([c, s]) => s === state && c.toLowerCase() === county.toLowerCase()))
  // prefer locals with crane scales in that state, then most rate lines
  return hit.sort((a, b) => score(b, state) - score(a, state))
}
const score = (l: ULocal, st: string) => l.rates.filter(r => r.st === st && (r.cr || r.oi)).length * 100 + l.nr

export function scaleFor(l: ULocal | undefined, cls: UClass, county: string | null, state: string): URate | undefined {
  if (!l || cls === 'None') return undefined
  const inState = l.rates.filter(r => r.st === state)
  const inCounty = county ? inState.filter(r => r.co.some(c => c.toLowerCase() === county.toLowerCase())) : []
  const pool = (inCounty.length ? inCounty : inState).filter(r => cls === 'Oiler' ? r.oi : r.cr && !r.oi)
  if (!pool.length) return undefined
  const sorted = [...pool].sort((a, b) => a.b - b.b)
  return cls === 'Crane — large (≥100 t)' ? sorted[sorted.length - 1] : sorted[0]
}

export interface CustomLine { id: string; label: string; amount: number; per: 'day' | 'hour' | 'job' }
export interface RateProfile { jobId: string; name: string; base?: number; night?: number; otMult: number; dtMult: number; /** daily hours after which double time (dtMult) applies; unset = no double time */ dtAfter?: number; travelRate?: number; travelHrs?: number; perDiem?: number; showUp?: number; subsistence?: number; custom: CustomLine[]; localOverride?: string }

export interface Line { label: string; qty: number; rate: number; amount: number; why: string }
export interface Calc { entry: T.TimeEntry; job?: T.Job; turbine?: string; county: string | null; state: string; local?: ULocal; localWhy: string; cls: UClass; scale?: URate; empRate: number; baseRate: number; rule: string; ruleSet: string; profile?: RateProfile; lines: Line[]; total: number; stHrs: number; otHrs: number; dtHrs?: number }

const nn = (v: unknown) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0)
/** Clean a saved rate profile: multipliers ≥ 1, no negative money, hours ≥ 0 (bad values never cut pay). */
export function cleanProfile(p: RateProfile): RateProfile {
  const ot = Math.max(1, nn(p.otMult) || 1.5), dt = nn(p.dtMult) ? Math.max(ot, p.dtMult) : nn(p.dtAfter) ? Math.max(ot, 2) : 0
  return { ...p, base: nn(p.base) || undefined, night: nn(p.night) || undefined, otMult: ot, dtMult: dt, dtAfter: nn(p.dtAfter) || undefined, travelRate: nn(p.travelRate) || undefined, travelHrs: nn(p.travelHrs) || undefined, perDiem: nn(p.perDiem) || undefined, showUp: nn(p.showUp) || undefined, subsistence: nn(p.subsistence) || undefined, custom: (p.custom ?? []).filter(c => nn(c.amount) > 0).map(c => ({ ...c, amount: nn(c.amount) })) }
}

/** Compute every time entry for one employee in date order so weekly OT (>40) is applied correctly. */
export function computeEmployee(db: T.DB, all: ULocal[], profiles: Record<string, RateProfile>, emp: T.Employee, entries: T.TimeEntry[], classOv?: UClass): Calc[] {
  const weekKey = (d: string) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() - x.getDay()); return x.toISOString().slice(0, 10) }
  const wk: Record<string, number> = {}
  const dayH: Record<string, number> = {}, dayTotal: Record<string, number> = {}, paid = new Set<string>()
  entries.forEach(t => { dayTotal[t.date] = (dayTotal[t.date] ?? 0) + Math.max(0, t.hours) })
  return [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)).map(entry => {
    const job = db.jobs.find(j => j.id === entry.jobId)
    const site = job ? db.sites.find(s => s.id === job.siteId) : undefined
    const turb = entry.turbineId ? job?.turbines?.find(t => t.caseId === entry.turbineId) : undefined
    const tc = turb ? countyOfJobTurbine(turb, site?.state ?? '') : null
    const county = tc?.county ?? countyOf(site), state = tc?.st ?? site?.state ?? ''
    const profile = job && profiles[job.id] ? cleanProfile(profiles[job.id]) : undefined
    const cands = localsForCounty(all, county, state)
    const local = profile?.localOverride ? all.find(l => String(l.local) === profile.localOverride) : cands[0]
    const localWhy = turb && !profile?.localOverride ? `Turbine ${turb.label ?? '#' + turb.caseId}, ${county ?? '?'} Co., ${local ? `Local ${local.local}` : 'no local (open shop)'} — ${tc?.src === 'Admin override' ? 'admin county override' : 'county from the turbine’s own lat/lon'}` : !job ? 'No job on this entry — shop/yard time, no local' : !county ? `County unknown for ${site?.city}, ${state}` : profile?.localOverride ? `Job profile pins Local ${profile.localOverride}` : local ? `${county} Co., ${state} → Local ${local.local}${cands.length > 1 ? ` (also: ${cands.slice(1, 4).map(c => c.local).join(', ')})` : ''}` : `No IUOE scale published for ${county} Co., ${state}`
    const cap = job?.craneId ? db.equipment.find(u => u.id === job.craneId)?.capacity : undefined
    const cls = classFor(emp, cap, classOv)
    const scale = scaleFor(local, cls, county, state)
    const cands2: { r: number; label: string }[] = [{ r: emp.rate, label: 'Employee assigned rate' }]
    if (scale) cands2.push({ r: scale.b, label: `Local ${local!.local} scale` })
    if (profile?.base) cands2.push({ r: profile.base, label: `Job profile base` })
    const night = job?.shift === 'Night' && profile?.night
    if (night) cands2.push({ r: profile!.night!, label: 'Job profile night wage' })
    const win = cands2.reduce((a, b) => b.r > a.r ? b : a)
    const hrs = Math.max(0, entry.hours) // negative hours never reduce the week
    const k = weekKey(entry.date), before = wk[k] ?? 0
    // double time (when the job profile sets it): hours past dtAfter in one day, across split entries
    const d0 = dayH[entry.date] ?? 0, dtAt = profile?.dtMult && profile.dtAfter ? profile.dtAfter : Infinity
    const dtHrs = Math.max(0, Math.min(hrs, d0 + hrs - dtAt)); dayH[entry.date] = d0 + hrs
    const rest = hrs - dtHrs
    const stHrs = Math.max(0, Math.min(rest, 40 - before)), otHrs = rest - stHrs
    wk[k] = before + hrs
    const ot = profile?.otMult ?? 1.5, floor = Math.max(win.r, emp.rate) // never below the assigned rate, on any line
    const lines: Line[] = [{ label: 'Straight time', qty: stHrs, rate: floor, amount: stHrs * floor, why: win.label }]
    if (otHrs > 0) lines.push({ label: `Overtime ×${ot}`, qty: otHrs, rate: floor * ot, amount: otHrs * floor * ot, why: `Week over 40 h${profile ? ' · job profile multiplier' : ' · default 1.5×'}` })
    if (dtHrs > 0) lines.push({ label: `Double time ×${profile!.dtMult}`, qty: dtHrs, rate: floor * profile!.dtMult, amount: dtHrs * floor * profile!.dtMult, why: `Over ${dtAt} h in the day · job profile` })
    const once = (key: string) => (paid.has(key) ? false : (paid.add(key), true))
    if (profile) {
      if (profile.travelRate && profile.travelHrs && once(`${entry.date}|travel|${job?.id}`)) { const tr = Math.max(profile.travelRate, emp.rate); lines.push({ label: 'Travel time', qty: profile.travelHrs, rate: tr, amount: profile.travelHrs * tr, why: 'Job profile' }) }
      if (profile.perDiem && once(`${entry.date}|perdiem`)) lines.push({ label: 'Per diem (set rate)', qty: 1, rate: profile.perDiem, amount: profile.perDiem, why: 'Job profile flat $/day — not GSA · once per day' })
      if (profile.subsistence && once(`${entry.date}|subsistence`)) lines.push({ label: 'Subsistence', qty: 1, rate: profile.subsistence, amount: profile.subsistence, why: 'Job profile · once per day' })
      if (profile.showUp && (dayTotal[entry.date] ?? hrs) < 4 && once(`${entry.date}|showup`)) lines.push({ label: 'Show-up pay', qty: 1, rate: profile.showUp, amount: profile.showUp, why: 'Under 4 h worked that day' })
      profile.custom.forEach(c => { if (c.per === 'hour') { lines.push({ label: c.label, qty: hrs, rate: c.amount, amount: hrs * c.amount, why: 'Custom · per hour' }); return } if (!once(c.per === 'day' ? `${entry.date}|c|${c.id}` : `${entry.date}|${job?.id}|c|${c.id}`)) return; lines.push({ label: c.label, qty: 1, rate: c.amount, amount: c.amount, why: `Custom · per ${c.per}${c.per === 'job' ? ' (once per job per day)' : ' (once per day)'}` }) })
    }
    const ruleSet = profile ? `Job profile: ${profile.name}` : local ? `Local ${local.local} scale` : 'Company default'
    return { entry, job, turbine: turb ? turb.label ?? '#' + turb.caseId : undefined, county, state, local, localWhy, cls, scale, empRate: emp.rate, baseRate: floor, rule: win.label, ruleSet, profile, lines, total: lines.reduce((a, l) => a + l.amount, 0), stHrs, otHrs, dtHrs }
  })
}
