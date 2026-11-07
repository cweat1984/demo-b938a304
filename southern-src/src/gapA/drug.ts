/** DOT Drug & Alcohol program (49 CFR 382 / 40). Restricted to the DER (Designated Employer Representative).
 *  Random pool, selections, test scheduling + results, FMCSA Clearinghouse queries (pre-employment full + annual limited).
 *  Kept in its own store ('sc-da-v1') — never in the main db, never searchable, every view is audit-logged. */
import { create } from 'zustand'
import type * as T from '../data/types'
import { today, addDays } from '../lib/util'
import { h, daysBetween, audit, load, save } from './util'
import { fullName } from '../data/logic'

export const RATES = { drug: 0.5, alcohol: 0.1 } // FMCSA minimum annual random rates
export type Result = 'Pending' | 'Negative' | 'Positive' | 'Refusal' | 'Cancelled'
export interface DaTest { id: string; empId: string; kind: 'Random' | 'Pre-employment' | 'Post-accident' | 'Reasonable suspicion' | 'Return-to-duty' | 'Follow-up'; panel: 'Drug (5-panel)' | 'Alcohol (breath)'; selectedAt: string; scheduled?: { at: string; site: string }; notified?: string; result: Result; resultAt?: string; mro?: string; /** DER-only: reasonable-suspicion observation — never written to the shared audit (dive3 B1). */ note?: string }
export interface ChQuery { empId: string; kind: 'Full (pre-employment)' | 'Limited (annual)'; at: string; consent: boolean; result: 'No violations' | 'Pending'; by: string }
export interface Selection { id: string; quarter: string; at: string; seed: string; pool: number; drug: string[]; alcohol: string[]; by: string }
export const SITES = ['Concentra — OKC South (2601 S Meridian)', 'Any Lab Test Now — Midland', 'Concentra — Longview', 'Mobile collector at job site']
/** dive2: nearest collection site for the employee's branch (Kilgore → Longview). */
export const siteFor = (db: T.DB, empId: string) => { const b = db.employees.find(e => e.id === empId)?.branchId; return b === 'br-mid' ? SITES[1] : b === 'br-kil' ? SITES[2] : SITES[0] }
interface S { tests: DaTest[]; queries: ChQuery[]; selections: Selection[]; seeded: boolean
  ensure(db: T.DB): void; select(db: T.DB, by: string): Selection; schedule(id: string, at: string, site: string, by: string): void; record(id: string, r: Result, by: string): void
  query(empId: string, kind: ChQuery['kind'], by: string, name: string): void; reveal(id: string, by: string): void; reset(): void
  /** dive3: move a hire's pre-employment tests/queries to their new employee id on activation */ relink(fromId: string, toId: string): void
  order(empId: string, kind: DaTest['kind'], panel: DaTest['panel'], site: string, by: string, note?: string): DaTest }
const KEY = 'sc-da-v1'
const persist = (s: Pick<S, 'tests' | 'queries' | 'selections'>) => save(KEY, s)
/** DOT-covered pool = everyone who drives a CMV (CDL drivers + operators with a CDL). */
export const pool = (db: T.DB) => db.employees.filter(e => e.status !== 'Inactive' && (e.craft === 'Truck Driver' || db.certs.some(c => c.employeeId === e.id && c.type === 'CDL Class A')))
export const quarterOf = (d: string) => `${d.slice(0, 4)} Q${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`
const rng = (seed: string) => { let i = 0; return () => h(seed + ':' + i++) }
export const useDa = create<S>((set, get) => ({
  ...(((x: Pick<S, 'tests' | 'queries' | 'selections'> | null) => x && Array.isArray(x.tests) && Array.isArray(x.queries) && Array.isArray(x.selections) ? x : null)(load<Pick<S, 'tests' | 'queries' | 'selections'>>(KEY, 'object')) ?? { tests: [], queries: [], selections: [] }), seeded: !!load(KEY),
  ensure(db) {
    if (get().seeded) return
    const t = today(), p = pool(db)
    const queries: ChQuery[] = p.map((e, i) => ({ empId: e.id, kind: 'Limited (annual)', at: addDays(t, -Math.round(h(e.id + 'ch') * 330) - (i === 2 ? 60 : 0)), consent: true, result: 'No violations', by: 'Dana Whitfield' }))
    const prev = quarterOf(addDays(t, -95))
    const r = rng(prev), pick = (n: number) => [...p].sort(() => r() - .5).slice(0, n).map(e => e.id)
    const sel: Selection = { id: 'sel-prev', quarter: prev, at: addDays(t, -95), seed: 'prev', pool: p.length, drug: pick(Math.max(1, Math.round(p.length * RATES.drug / 4))), alcohol: pick(Math.max(1, Math.round(p.length * RATES.alcohol / 4))), by: 'Dana Whitfield' }
    const tests: DaTest[] = [...sel.drug.map((id, i) => ({ id: `t-d${i}`, empId: id, kind: 'Random' as const, panel: 'Drug (5-panel)' as const, selectedAt: sel.at, scheduled: { at: addDays(sel.at, 1) + 'T08:00', site: SITES[0] }, notified: addDays(sel.at, 1), result: 'Negative' as Result, resultAt: addDays(sel.at, 4), mro: 'Dr. A. Patel (MRO)' })),
      ...sel.alcohol.map((id, i) => ({ id: `t-a${i}`, empId: id, kind: 'Random' as const, panel: 'Alcohol (breath)' as const, selectedAt: sel.at, scheduled: { at: addDays(sel.at, 1) + 'T09:00', site: SITES[0] }, notified: addDays(sel.at, 1), result: 'Negative' as Result, resultAt: addDays(sel.at, 1) }))]
    const s = { tests, queries, selections: [sel] }; persist(s); set({ ...s, seeded: true })
  },
  select(db, by) {
    // dive3 S10: one draw per quarter — a second run returns the locked draw instead of re-rolling until someone is (or isn't) picked
    { const q0 = quarterOf(today()), done = get().selections.find(x => x.quarter === q0); if (done) return done }
    const t = today(), q = quarterOf(t), seed = `${q}-${Date.now().toString(36)}`, p = pool(db), r = rng(seed)
    const pick = (n: number) => [...p].map(e => ({ e, k: r() })).sort((a, b) => a.k - b.k).slice(0, n).map(x => x.e.id)
    const sel: Selection = { id: 'sel-' + seed, quarter: q, at: t, seed, pool: p.length, drug: pick(Math.max(1, Math.round(p.length * RATES.drug / 4))), alcohol: pick(Math.max(1, Math.round(p.length * RATES.alcohol / 4))), by }
    const tests = [...sel.drug.map(id => ({ id: 'td-' + seed + id, empId: id, kind: 'Random' as const, panel: 'Drug (5-panel)' as const, selectedAt: t, result: 'Pending' as Result })), ...sel.alcohol.map(id => ({ id: 'ta-' + seed + id, empId: id, kind: 'Random' as const, panel: 'Alcohol (breath)' as const, selectedAt: t, result: 'Pending' as Result })), ...get().tests]
    const s = { tests, queries: get().queries, selections: [sel, ...get().selections] }; persist(s); set(s)
    audit('D&A random selection run', q, `pool ${p.length} · ${sel.drug.length} drug / ${sel.alcohol.length} alcohol · seed ${seed}`)
    return sel
  },
  schedule(id, at, site, by) { const tests = get().tests.map(x => x.id === id ? { ...x, scheduled: { at, site }, notified: today() } : x); const s = { ...get(), tests }; persist({ tests, queries: s.queries, selections: s.selections }); set({ tests }); audit('D&A test scheduled', 'D&A record (confidential)', `by ${by}`) },
  record(id, r, by) { const tests = get().tests.map(x => x.id === id ? { ...x, result: r, resultAt: today(), mro: x.panel.startsWith('Drug') ? 'Dr. A. Patel (MRO)' : undefined } : x); persist({ tests, queries: get().queries, selections: get().selections }); set({ tests }); audit('D&A result recorded', 'D&A record (confidential)', `by ${by}`) },
  query(empId, kind, by, name) { const queries = [{ empId, kind, at: today(), consent: true, result: 'No violations' as const, by }, ...get().queries]; persist({ tests: get().tests, queries, selections: get().selections }); set({ queries }); audit('Clearinghouse query logged', 'D&A record (confidential)', `${kind} · by ${by}`); void name },
  order(empId, kind, panel, site, by, note) { const now = new Date(); const at = `${today()}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; const t: DaTest = { id: `t-${kind.slice(0, 3).toLowerCase()}-${Date.now().toString(36)}`, empId, kind, panel, selectedAt: today(), scheduled: { at, site }, notified: today(), result: 'Pending', ...(note?.trim() ? { note: note.trim().slice(0, 600) } : {}) }; const tests = [t, ...get().tests]; persist({ tests, queries: get().queries, selections: get().selections }); set({ tests }); audit('D&A test ordered', 'D&A record (confidential)', `by ${by}`) /* dive3 B1: no test type or observation in the shared log */; return t }, // dive2: post-accident / reasonable suspicion / RTD / follow-up — go now
  reveal(id, by) { audit('D&A result viewed', 'D&A record (confidential)', `by ${by} · ref ${id.slice(-6)}`) },
  relink(fromId, toId) { if (!fromId || fromId === toId) return; const tests = get().tests.map(t => t.empId === fromId ? { ...t, empId: toId } : t), queries = get().queries.map(q => q.empId === fromId ? { ...q, empId: toId } : q); const s = { tests, queries, selections: get().selections }; persist(s); set(s) },
  reset() { localStorage.removeItem(KEY); set({ tests: [], queries: [], selections: [], seeded: false }) },
}))
export function chStatus(qs: ChQuery[], empId: string) {
  const last = qs.filter(q => q.empId === empId).sort((a, b) => b.at.localeCompare(a.at))[0]
  if (!last) return { tone: 'bad' as const, label: 'No query on file', due: today() }
  const due = addDays(last.at, 365), left = daysBetween(today(), due)
  return { tone: left < 0 ? 'bad' as const : left <= 45 ? 'warn' as const : 'ok' as const, label: left < 0 ? `Annual query overdue ${-left} d` : left <= 45 ? `Annual query due in ${left} d` : `Queried ${last.at}`, due, last }
}
export const nameOf = (db: T.DB, id: string) => fullName(db.employees.find(e => e.id === id))

/** dive3 M3: DOT-cleared to drive = negative pre-employment drug test + full Clearinghouse query on file. */
export function dotCleared(empId: string) { const d = useDa.getState(); return d.queries.some(x => x.empId === empId && x.kind === 'Full (pre-employment)') && d.tests.some(x => x.empId === empId && x.kind === 'Pre-employment' && x.result === 'Negative') }
