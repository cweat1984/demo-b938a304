/** NCCCO operator certification: card number, categories, simulated registry verification. Local store 'sc-nccco-v1'.
 *  The "Verify with NCCCO" lookup is SIMULATED in the demo — production would use NCCCO's online verification. */
import { create } from 'zustand'
import type * as T from '../data/types'
import { today } from '../lib/util'
import { h, daysBetween, audit, load, save, type Tone } from './util'

export const NCCCO_CATS: Record<string, string> = { LBC: 'Lattice Boom Crawler', LBT: 'Lattice Boom Truck', TLL: 'Telescopic Boom — Swing Cab (>21 t)', TSS: 'Telescopic Boom — Swing Cab (≤21 t)', BTF: 'Boom Truck — Fixed Cab' }
export interface Verify { at: string; by: string; result: 'Verified' | 'Expired on registry' | 'Not found' }
const KEY = 'sc-nccco-v1'
interface S { checks: Record<string, Verify>; busy: string | null; verify(db: T.DB, empId: string, who: string): Promise<Verify>; reset(): void }
export const useNccco = create<S>((set, get) => ({
  checks: load<Record<string, Verify>>(KEY, 'object') ?? {}, busy: null,
  async verify(db, empId, who) {
    set({ busy: empId }); await new Promise(r => setTimeout(r, 900))
    const c = ncccoCard(db, empId)
    const result: Verify['result'] = !c ? 'Not found' : c.expires < today() ? 'Expired on registry' : 'Verified'
    const v: Verify = { at: new Date().toISOString(), by: who, result }
    const checks = { ...get().checks, [empId]: v }; save(KEY, checks); set({ checks, busy: null })
    audit('NCCCO lookup (simulated)', c?.certNo ?? empId, `${result} · ${c?.cats.join(', ') ?? '—'}`)
    return v
  },
  reset() { localStorage.removeItem(KEY); set({ checks: {} }) },
}))

/** Card derived from the operator's NCCCO certs in the cert tracker, so dates always match. */
export function ncccoCard(db: T.DB, empId: string) {
  const cs = db.certs.filter(c => c.employeeId === empId && (c.type === 'NCCCO Mobile Operator' || c.type === 'NCCCO Crawler Operator') && c.verified !== 'Rejected')
  if (!cs.length) return null
  const cats: string[] = []
  if (cs.some(c => c.type === 'NCCCO Crawler Operator')) cats.push('LBC')
  if (cs.some(c => c.type === 'NCCCO Mobile Operator')) { cats.push('TLL', 'TSS') }
  if (h(empId + 'lbt') < .3) cats.push('LBT')
  const expires = cs.map(c => c.expires).sort()[0]
  return { certNo: `${String(Math.floor(h(empId + 'no') * 900000) + 100000)}`, cats, expires, certs: cs }
}
export const catFor = (crane?: T.Equipment) => !crane ? null : crane.type === 'Crawler' ? 'LBC' : (crane.capacity ?? 0) > 23 ? 'TLL' : 'TSS'
export function recert(db: T.DB, empId: string): { tone: Tone; days: number } | null {
  const c = ncccoCard(db, empId); if (!c) return null
  const days = daysBetween(today(), c.expires)
  return { tone: days < 0 ? 'bad' : days <= 90 ? 'warn' : 'ok', days }
}
