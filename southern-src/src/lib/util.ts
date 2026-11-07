import { clsx, type ClassValue } from 'clsx'
export const cn = (...a: ClassValue[]) => clsx(a)

// ---- dates (local, yyyy-MM-dd) ----
export const pad = (n: number) => String(n).padStart(2, '0')
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
/** dive3: the business runs on Chicago time — "today" and the date of any timestamp come from America/Chicago, whatever
 *  timezone the laptop / phone is set to (a call-off at 8 PM CT is still today, not tomorrow in UTC). */
const CHI = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })
export const chiDate = (d: Date | string | number = new Date()) => { const x = d instanceof Date ? d : new Date(d); return isNaN(+x) ? String(d).slice(0, 10) : CHI.format(x) }
/** Chicago date (yyyy-MM-dd) of an ISO timestamp; plain dates pass through. */
export const dateOf = (ts?: string | null) => !ts ? '' : /^\d{4}-\d{2}-\d{2}$/.test(ts) ? ts : chiDate(ts)
export const today = () => chiDate(new Date())
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d) }
export const diffDays = (a: string, b: string) => Math.round((parse(a).getTime() - parse(b).getTime()) / 86400000)
export const between = (d: string, a: string, b: string) => d >= a && d <= b
export const dow = (s: string) => parse(s).toLocaleDateString('en-US', { weekday: 'short' })
export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => parse(s).toLocaleDateString('en-US', opts)
export const fmtLong = (s: string) => parse(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
export const range = (a: string, b: string) => { const out: string[] = []; let d = a; while (d <= b) { out.push(d); d = addDays(d, 1) } return out }
export const startOfWeek = (s: string) => { const d = parse(s); const w = d.getDay(); const m = (w + 6) % 7; d.setDate(d.getDate() - m); return iso(d) }
export const timeAgo = (isoTs: string) => {
  const s = (Date.now() - new Date(isoTs).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
export const fmtTs = (isoTs: string) => new Date(isoTs).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' CT' // dive3 M13: real Chicago time, whatever the device zone

/** Guest passes without money scope: every money() renders "—" (set by setGuestScope). */
let hideMoney = false
export const setHideMoney = (b: boolean) => { hideMoney = b }
export const moneyHidden = () => hideMoney
export const money = (n: number, compact = false) =>
  hideMoney ? '—' : compact ? '$' + Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : '$' + Math.round(n).toLocaleString('en-US')
export const num = (n: number) => n.toLocaleString('en-US')
export const money2 = (n: number) => hideMoney ? '—' : (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const hoursBetween = (start: string, end: string, mealMin = 0) => {
  const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number)
  let m = eh * 60 + em - (sh * 60 + sm); if (m < 0) m += 24 * 60
  return Math.max(0, Math.round(((m - mealMin) / 60) * 100) / 100)
}

// ---- seeded RNG ----
export function rng(seed = 42) {
  let s = seed >>> 0
  const next = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  return {
    next,
    int: (a: number, b: number) => Math.floor(next() * (b - a + 1)) + a,
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
    shuffle: <T,>(arr: T[]) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a },
  }
}

let idc = 0
export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${(idc++).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Set by the store so every CSV export lands in the audit log (who, what, rows). */
export const csvHooks: { onExport?: (name: string, rows: number) => void } = {}
/** Box-local Central time for exports, e.g. "2026-10-24 12:28 CT". */
export function ctStamp(iso?: string | null) {
  if (!iso) return ''
  const d = new Date(iso); if (isNaN(+d)) return String(iso)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} CT`
}
export function downloadCsv(name: string, rows: (string | number | undefined | null)[][]) {
  // guest passes without money scope: cost / price / value / rate / amount columns are dropped from every export
  if (hideMoney && rows.length) { const drop = rows[0].map((h, i) => /cost|price|value|rate|amount|total|revenue|margin|budget|pay|wage|\$/i.test(String(h ?? '')) ? i : -1).filter(i => i >= 0); if (drop.length) rows = rows.map(r => r.filter((_, i) => !drop.includes(i))) }
  // guard against spreadsheet formula injection — but keep real numbers (incl. negatives like -2, -151.4%, -$1,200) numeric
  const isNum = (s: string) => /^-?\$?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?%?$/.test(s) && /\d/.test(s)
  const esc = (v: unknown) => { let s = v == null ? '' : String(v); if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s) && !isNum(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = rows.map(r => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  try { csvHooks.onExport?.(name, Math.max(0, rows.length - 1)) } catch { /* audit is best-effort */ }
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim()))
}
