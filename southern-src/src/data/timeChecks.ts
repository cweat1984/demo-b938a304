// Office fixes: payroll exceptions the recon queue doesn't catch — the same person on two overlapping
// time entries, or more than 16 paid hours in one day. These are held out of "Approve all clean".
import type * as T from './types'

const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h || 0) * 60 + (m || 0) }
export const MAX_DAY_HOURS = 16

/** id → human reason, for every entry that overlaps another entry of the same person, or sits on a >16 h day. */
export function timeConflicts(entries: T.TimeEntry[], jobNo: (id?: string) => string = id => id ?? ''): Map<string, string> {
  const out = new Map<string, string>()
  const groups = new Map<string, T.TimeEntry[]>()
  for (const t of entries) { const k = `${t.employeeId}|${t.date}`; groups.set(k, [...(groups.get(k) ?? []), t]) }
  for (const list of groups.values()) {
    const span = list.map(t => { const s = mins(t.start); let e = mins(t.end); if (e <= s) e += 1440; return { t, s, e } }).sort((a, b) => a.s - b.s)
    for (let i = 0; i < span.length; i++) for (let j = i + 1; j < span.length; j++) {
      const a = span[i], b = span[j]
      if (b.s < a.e) {
        out.set(a.t.id, `Overlaps ${b.t.start}–${b.t.end}${b.t.jobId ? ` on job ${jobNo(b.t.jobId)}` : ''}`)
        out.set(b.t.id, `Overlaps ${a.t.start}–${a.t.end}${a.t.jobId ? ` on job ${jobNo(a.t.jobId)}` : ''}`)
      }
    }
    const day = list.reduce((s, t) => s + t.hours, 0)
    if (day > MAX_DAY_HOURS) list.forEach(t => { if (!out.has(t.id)) out.set(t.id, `${day} h on ${t.date} — over ${MAX_DAY_HOURS} h`) })
  }
  return out
}
