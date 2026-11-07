// Clock-in/out time math: real elapsed time (DST-correct), overnight shifts, ISO timestamps with offset, overlap of intervals.
const pad = (n: number) => String(n).padStart(2, '0')
/** Local calendar date (YYYY-MM-DD) of an instant. */
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const hhmmOf = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
/** ISO 8601 with the device's UTC offset, e.g. 2026-11-01T06:00:00-06:00. */
export function isoOffset(d: Date) {
  const off = -d.getTimezoneOffset(), s = off >= 0 ? '+' : '-', a = Math.abs(off)
  return `${localDate(d)}T${hhmmOf(d)}:${pad(d.getSeconds())}${s}${pad(Math.floor(a / 60))}:${pad(a % 60)}`
}
export const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return undefined } }
/** Start/end instants of a wall-clock entry. An end at or before the start means the shift ran past midnight into the next day. */
export function entryInstants(date: string, start: string, end: string): [number, number] {
  const [y, m, d] = date.split('-').map(Number), [sh, sm] = start.split(':').map(Number), [eh, em] = end.split(':').map(Number)
  const a = new Date(y, m - 1, d, sh, sm).getTime()
  const overnight = eh * 60 + em <= sh * 60 + sm
  const b = new Date(y, m - 1, d + (overnight ? 1 : 0), eh, em).getTime()
  return [a, b]
}
/** Hours actually worked between two wall-clock times on a date (handles overnight and DST changes), minus meal minutes. */
export function realHours(date: string, start: string, end: string, mealMin = 0) {
  const [a, b] = entryInstants(date, start, end)
  return Math.max(0, Math.round(((b - a) / 6e4 - mealMin) / 60 * 100) / 100)
}
/** Elapsed hours between two instants, minus break minutes. */
export const elapsedHours = (inAt: Date, outAt: Date, breakMin = 0) => Math.max(0, Math.round(((outAt.getTime() - inAt.getTime()) / 6e4 - breakMin) / 60 * 100) / 100)
/** True when two entries' real time spans overlap (works across midnight and across dates). */
export function entriesOverlap(x: { date: string; start: string; end: string; inAt?: string; outAt?: string }, y: { date: string; start: string; end: string; inAt?: string; outAt?: string }) {
  const span = (e: typeof x): [number, number] => e.inAt && e.outAt ? [Date.parse(e.inAt), Date.parse(e.outAt)] : entryInstants(e.date, e.start, e.end)
  const [a1, b1] = span(x), [a2, b2] = span(y)
  return a1 < b2 && a2 < b1
}
/** Over this many hours a clock-out is held for review (likely a missed clock-out). */
export const MAX_SHIFT_H = 16
