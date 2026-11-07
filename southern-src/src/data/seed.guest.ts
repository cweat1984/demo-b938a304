// Guest-only build: replaces seed.ts. There is no data generator here — only a dataset scrubbed at build time
// (scripts/guest-data.ts). Dates are slid forward so "today" in the demo stays today.
import type * as T from './types'
import data from 'virtual:guest-data'
import { today, diffDays } from '../lib/util'
import { DB_VERSION } from './seedBase'
export { DB_VERSION, BURDEN, PER_DIEM_RATES, TRAILER_DAY_COST, DVIR_ITEMS, DIVISIONS, BRANCHES, emailFor, distMiles, requiredPositions } from './seedBase'

const DAY = /^(\d{4}-\d{2}-\d{2})(T[\d:.]+Z?)?$/
const shiftStr = (s: string, d: number) => { const m = DAY.exec(s); if (!m) return s; const t = new Date(m[2] ? s : m[1] + 'T12:00:00Z'); if (isNaN(+t)) return s; t.setUTCDate(t.getUTCDate() + d); return m[2] ? t.toISOString() : t.toISOString().slice(0, 10) }
function slide<X>(v: X, d: number): X {
  if (!d) return v
  if (typeof v === 'string') return shiftStr(v, d) as X
  if (Array.isArray(v)) return v.map(x => slide(x, d)) as X
  if (v && typeof v === 'object') { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v)) o[k] = slide(x, d); return o as X }
  return v
}
const delta = () => (data.day ? diffDays(today(), data.day) : 0)
const finish = (db: T.DB): T.DB => ({ ...db, version: DB_VERSION, seededAt: new Date().toISOString() })
export function seed(): T.DB { return finish(slide(structuredClone(data.base) as T.DB, delta())) }
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0))
/** "Everything" passes only: decrypt the copy that includes money (pay rates, bills, invoices, job values). */
export async function fullSeed(k?: string): Promise<T.DB | null> {
  if (!k || !data.all) return null
  try {
    const key = await crypto.subtle.importKey('raw', unb64u(k), 'AES-GCM', false, ['decrypt'])
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(data.all.iv) }, key, unb64u(data.all.ct))
    return finish(slide(JSON.parse(new TextDecoder().decode(pt)) as T.DB, delta()))
  } catch { return null }
}
