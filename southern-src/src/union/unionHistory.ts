/** "My union history": every hour an employee worked under each IUOE local for their whole time at Southern.
 *  • Real app time entries are used where they exist (source 'app').
 *  • Before the first real entry, a believable DEMO history is generated back to the hire date from a deterministic seed
 *    (employee id), using real Southern sites and the same county → local rules as payroll. Always labelled DEMO.
 *  • Fringe contributions = hours × the local's published fringe rate (DOL WD), only for hours on/after that WD's effective
 *    date — older hours are credited but the $ are left blank ("rate not on file"), never estimated. */
import type * as T from '../data/types'
import { addDays, today } from '../lib/util'
import { computeEmployee, countyOf, localsForCounty, scaleFor, classFor, type ULocal, type RateProfile, type UClass } from './payroll'

export interface HRow {
  key: string; source: 'demo' | 'app'; local: string; localName: string; state: string; year: number; jobKey: string; jobLabel: string; jobId?: string; site: string
  from: string; to: string; days: number; reg: number; ot: number; night: number; travel: number
  wage: number; fringeRate: number | null; fringeHrs: number; fringe: number | null; fringeSrc?: { wd: string; u: string; eff: string }
  perDiemDays: number; perDiem: number; jobPay: number; jobPayWhy: string[]
}
export interface History { rows: HRow[]; firstReal: string | null; hire: string; demoTo: string | null; homeLocal: string | null; cls: UClass }
export const NO_LOCAL = 'none'
export const HISTORY_VIEWERS = ['owner', 'ops', 'hr', 'payroll', 'branch', 'accounting']

const hash = (s: string) => { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
function rng(seed: number) { let a = seed; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => { const R = 3959, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)) }
const mdy = (s: string) => { const [m, d, y] = s.split('/'); return y && m && d ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : '9999-12-31' }
const dow = (d: string) => new Date(d + 'T12:00:00').getDay()
const r2 = (n: number) => Math.round(n * 100) / 100

export function homeLocalOf(e: T.Employee): string | null {
  const m = e.local?.match(/(\d+)/); if (m) return m[1]
  if (e.first === 'Chad' && e.last === 'Weathers') return '627' // Chad: IUOE Local 627 (OKC)
  return null
}

export function buildHistory(db: T.DB, locals: ULocal[], profiles: Record<string, RateProfile>, e: T.Employee, classOv?: UClass): History {
  const home = homeLocalOf(e)
  const cls: UClass = classOv ?? (classFor(e) === 'None' ? (home ? 'Crane — standard' : 'None') : classFor(e))
  const real = db.time.filter(t => t.employeeId === e.id)
  const firstReal = real.length ? real.map(t => t.date).sort()[0] : null
  const rows: HRow[] = [], byKey = new Map<string, HRow>()
  const add = (r: Omit<HRow, 'key'>) => { const key = `${r.source}|${r.local}|${r.year}|${r.jobKey}`; const x = byKey.get(key)
    if (!x) { const n = { ...r, jobPayWhy: [...r.jobPayWhy], key }; rows.push(n); byKey.set(key, n); return } const m = (k: 'days' | 'reg' | 'ot' | 'night' | 'travel' | 'fringeHrs' | 'perDiemDays' | 'perDiem' | 'jobPay') => { x[k] = r2(x[k] + r[k]) }
    ;(['days', 'reg', 'ot', 'night', 'travel', 'fringeHrs', 'perDiemDays', 'perDiem', 'jobPay'] as const).forEach(m); if (r.fringe != null) x.fringe = r2((x.fringe ?? 0) + r.fringe); if (r.from < x.from) x.from = r.from; if (r.to > x.to) x.to = r.to; r.jobPayWhy.forEach(w => { if (!x.jobPayWhy.includes(w)) x.jobPayWhy.push(w) }) }
  const fringeFor = (l: ULocal | undefined, county: string | null, st: string) => { const sc = scaleFor(l, cls === 'None' ? 'Crane — standard' : cls, county, st); return sc && sc.f != null ? { f: sc.f, src: { wd: sc.wd, u: sc.u, eff: mdy(sc.eff) }, b: sc.b } : null }
  const branch = db.branches.find(b => b.id === e.branchId) ?? db.branches[0]

  // ---- real app time entries ----
  if (real.length) {
    const calcs = computeEmployee(db, locals, profiles, e, real, classOv)
    for (const c of calcs) {
      const lk = c.local ? String(c.local.local) : NO_LOCAL, yr = Number(c.entry.date.slice(0, 4)), site = c.job ? db.sites.find(s => s.id === c.job!.siteId) : undefined
      const fr = c.local ? fringeFor(c.local, c.county, c.state) : null, fh = c.stHrs + c.otHrs, ok = fr && c.entry.date >= fr.src.eff
      const travel = c.lines.filter(l => l.label === 'Travel time').reduce((a, l) => a + l.qty, 0) + (c.job?.travelEach ? c.job.travelEach * 2 : 0)
      const pd = c.lines.filter(l => /Per diem|Subsistence/.test(l.label))
      const jp = c.lines.filter(l => !/Straight time|Overtime|Per diem|Subsistence/.test(l.label))
      add({ source: 'app', local: lk, localName: c.local ? `IUOE Local ${lk}` : 'Open shop — no IUOE local', state: c.state, year: yr, jobKey: c.job?.id ?? 'shop', jobLabel: c.job ? `#${c.job.jobNo} · ${c.job.name}` : 'Shop / yard time', jobId: c.job?.id, site: site ? `${site.city}, ${site.state}` : '—',
        from: c.entry.date, to: c.entry.date, days: 1, reg: c.stHrs, ot: c.otHrs, night: c.job?.shift === 'Night' ? c.entry.hours : 0, travel,
        wage: c.baseRate, fringeRate: fr?.f ?? null, fringeHrs: fh, fringe: ok ? r2(fh * fr!.f) : null, fringeSrc: fr?.src,
        perDiemDays: pd.length || c.entry.perDiems.length ? 1 : 0, perDiem: r2(pd.reduce((a, l) => a + l.amount, 0)), jobPay: r2(jp.reduce((a, l) => a + l.amount, 0)), jobPayWhy: jp.map(l => l.label) })
    }
  }

  // ---- demo history: hire date → day before first real entry ----
  const end = firstReal ? addDays(firstReal, -1) : today()
  let demoTo: string | null = null
  if ((home || cls !== 'None') && e.hireDate < end) {
    const R = rng(hash(e.id + '|union-history'))
    const pick = <X,>(a: X[]) => a[Math.floor(R() * a.length)]
    const sites = db.sites.map(s => { const county = countyOf(s); const l = localsForCounty(locals, county, s.state)[0]; return { s, county, l, w: (l && String(l.local) === home ? 6 : l ? 1.5 : 0.8) * (s.state === branch.state ? 2 : 1) * (s.windFarmId ? 1.4 : 1) } }).filter(x => x.s.lat)
    const tot = sites.reduce((a, x) => a + x.w, 0)
    const wpick = () => { let r = R() * tot; for (const x of sites) { r -= x.w; if (r <= 0) return x } return sites[0] }
    const custs = db.customers.length ? db.customers : [{ name: 'Customer' } as T.Customer]
    let d = e.hireDate, seq = 0
    while (d <= end) {
      const x = wpick(), wind = !!x.s.windFarmId, len = Math.round((wind ? 8 : 2) + R() * (wind ? 30 : 14)), night = R() < (wind ? 0.08 : 0.16), yr0 = Number(d.slice(0, 4))
      const dist = miles(branch, x.s), travelDay = dist > 60 ? Math.min(2, Math.round(dist / 90 * 2) / 2) : 0, perDiemOn = dist > 75
      const lk = x.l ? String(x.l.local) : NO_LOCAL, fr = x.l ? fringeFor(x.l, x.county, x.s.state) : null
      const yearsAgo = Math.max(0, new Date().getFullYear() - yr0), wage = r2((fr?.b ?? e.rate) * Math.pow(0.975, yearsAgo))
      const cust = pick(custs), label = `D-${yr0}-${String(++seq).padStart(3, '0')} · ${wind ? 'Turbine work' : pick(['Crane service', 'Steel erection', 'Plant shutdown lift', 'Tank set', 'Bridge beams', 'HVAC set', 'Pipe rack'])} — ${cust.name}`
      let wk = -1, wkHrs = 0, worked = 0, cur = d
      while (worked < len && cur <= end) {
        const wd = dow(cur); if (wd === 0 || (wd === 6 && R() < 0.7)) { cur = addDays(cur, 1); continue }
        const w = Math.floor((new Date(cur + 'T12:00:00').getTime() / 86400000 + 4) / 7); if (w !== wk) { wk = w; wkHrs = 0 }
        const h = [8, 8, 9, 10, 10, 10, 11, 12][Math.floor(R() * 8)], st = Math.max(0, Math.min(h, 40 - wkHrs)), ot = h - st; wkHrs += h
        const yr = Number(cur.slice(0, 4)), okF = fr && cur >= fr.src.eff, pdRate = 55 + Math.min(30, (yr - 2014) * 2.5)
        const showUp = R() < 0.03, bonus = (wind ? 2.5 * h : 0) + (showUp ? 120 : 0)
        add({ source: 'demo', local: lk, localName: x.l ? `IUOE Local ${lk}` : 'Open shop — no IUOE local', state: x.s.state, year: yr, jobKey: label, jobLabel: label, site: `${x.s.name} · ${x.s.city}, ${x.s.state}`,
          from: cur, to: cur, days: 1, reg: st, ot, night: night ? h : 0, travel: travelDay, wage, fringeRate: fr?.f ?? null, fringeHrs: h, fringe: okF ? r2(h * fr!.f) : null, fringeSrc: fr?.src,
          perDiemDays: perDiemOn ? 1 : 0, perDiem: perDiemOn ? pdRate : 0, jobPay: r2(bonus), jobPayWhy: [...(wind ? ['Wind-site premium $2.50/h'] : []), ...(showUp ? ['Show-up pay $120'] : [])] })
        worked++; demoTo = cur; cur = addDays(cur, 1)
      }
      d = addDays(cur, 1 + Math.floor(R() * 9) + (cur.slice(5, 7) === '12' && R() < 0.5 ? 14 : 0))
    }
  }
  rows.sort((a, b) => b.year - a.year || a.local.localeCompare(b.local) || b.from.localeCompare(a.from))
  return { rows, firstReal, hire: e.hireDate, demoTo, homeLocal: home, cls }
}

export interface Agg { reg: number; ot: number; night: number; travel: number; hrs: number; fringe: number; fringeHrs: number; fringeUnpriced: number; perDiem: number; jobPay: number; days: number }
export function agg(rows: HRow[]): Agg {
  const a: Agg = { reg: 0, ot: 0, night: 0, travel: 0, hrs: 0, fringe: 0, fringeHrs: 0, fringeUnpriced: 0, perDiem: 0, jobPay: 0, days: 0 }
  for (const r of rows) { a.reg += r.reg; a.ot += r.ot; a.night += r.night; a.travel += r.travel; a.days += r.days; a.perDiem += r.perDiem; a.jobPay += r.jobPay; if (r.local !== NO_LOCAL) { if (r.fringe != null) { a.fringe += r.fringe } a.fringeHrs += r.fringeHrs } }
  a.hrs = a.reg + a.ot
  // hours credited to a local whose fringe $ we could not price (before the WD effective date, or no WD)
  a.fringeUnpriced = rows.filter(r => r.local !== NO_LOCAL).reduce((s, r) => s + (r.fringeRate != null && r.fringe != null ? r.fringeHrs - r.fringe / r.fringeRate : r.fringeHrs), 0)
  return a
}
export function historyCsv(name: string, h: History): string {
  const q = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const head = ['employee', 'source', 'local', 'year', 'job', 'site', 'from', 'to', 'days', 'regular_hrs', 'ot_hrs', 'night_hrs', 'travel_hrs', 'wage', 'fringe_rate', 'fringe_hours', 'fringe_credited', 'fringe_source_wd', 'fringe_source_url', 'per_diem_days', 'per_diem', 'job_specific_pay', 'job_pay_items']
  return [head.join(','), ...h.rows.map(r => [name, r.source === 'demo' ? 'DEMO (generated)' : 'App time entries', r.localName, r.year, r.jobLabel, r.site, r.from, r.to, r.days, r.reg, r.ot, r.night, r.travel, r.wage, r.fringeRate ?? '', r.fringeHrs, r.fringe ?? 'rate not on file', r.fringeSrc?.wd ?? '', r.fringeSrc?.u ?? '', r.perDiemDays, r.perDiem, r.jobPay, r.jobPayWhy.join('; ')].map(q).join(','))].join('\n')
}
