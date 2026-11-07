/** dive3 B1/M7/M10/m6: one strict number parser for every typed money / quantity field.
 *  Accepts "1,250.50", "$1,250.50", " 4500 ", "-500" (only where negatives are allowed), "1." while typing.
 *  Rejects hex (0x10), exponents (1e3), several dots (8.2.5), letters. Money rounds to cents. */
export const LIMITS = { qty: 10_000, rate: 2_000_000, dayRate: 250_000, invoice: 25_000_000, bill: 2_000_000, payment: 25_000_000, taxPct: 15 }
export type Parsed = { ok: true; n: number } | { ok: false; msg: string; empty?: boolean }
export function parseNum(raw: unknown, o: { neg?: boolean; cents?: boolean; max?: number; min?: number; label?: string; allowEmpty?: boolean } = {}): Parsed {
  const label = o.label ?? 'Amount'
  if (typeof raw === 'number') raw = String(raw)
  let s = String(raw ?? '').trim().replace(/\s+/g, '')
  if (!s) return { ok: false, msg: `${label} is required`, empty: true }
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1) } // accounting style (1,250.00)
  if (s.startsWith('-')) { neg = true; s = s.slice(1) }
  if (s.startsWith('$')) s = s.slice(1)
  if (s.startsWith('-')) { neg = true; s = s.slice(1) } // $-500
  if (!/^(\d{1,3}(,\d{3})+|\d+)?(\.\d*)?$/.test(s) || s === '.' || s === '') return { ok: false, msg: `${label}: use a number like 1,250.50` }
  let n = Number(s.replace(/,/g, '').replace(/\.$/, ''))
  if (!Number.isFinite(n)) return { ok: false, msg: `${label}: use a number like 1,250.50` }
  if (neg) { if (!o.neg) return { ok: false, msg: `${label} can’t be negative` }; n = -n }
  if (o.cents) n = Math.round(n * 100) / 100
  if (o.max != null && Math.abs(n) > o.max) return { ok: false, msg: `${label} over ${o.max.toLocaleString('en-US')} — check the number` }
  if (o.min != null && n < o.min) return { ok: false, msg: `${label} must be at least ${o.min.toLocaleString('en-US')}` }
  return { ok: true, n }
}
/** Number or null (invalid / empty). */
export const num = (raw: unknown, o?: Parameters<typeof parseNum>[1]) => { const p = parseNum(raw, o); return p.ok ? p.n : null }
/** What to keep in a text field while typing: digits, one dot, commas, $ and a leading minus. Never reformats mid-typing. */
export const typing = (v: string, neg = false) => v.replace(neg ? /[^0-9.,$\-() ]/g : /[^0-9.,$ ]/g, '').slice(0, 20)
