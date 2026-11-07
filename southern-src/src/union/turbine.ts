/** Per-TURBINE county → IUOE local. County comes from each turbine's own lat/lon, point-in-polygon against
 *  US Census county boundaries (done once at data-prep time and bundled with the USWTDB turbine files, element [5]).
 *  Admins can override a turbine's county; every override is audit-logged. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { useStore } from '../data/store'
import type * as T from '../data/types'
import type { WTurbine, WFarm } from '../data/wind'
import { localsForCounty, type ULocal } from './payroll'

export interface CountyOv { county: string; st: string; by: string; at: string; was: string; why?: string }
interface S { ov: Record<string, CountyOv>; setOv: (caseId: number, label: string, o: Omit<CountyOv, 'by' | 'at'> | null) => void }
export const useTurbineCounty = create<S>()(persist((set, get) => ({
  ov: {},
  setOv: (caseId, label, o) => {
    const by = useStore.getState().session?.name ?? 'Admin', prev = get().ov[caseId]
    const n = { ...get().ov }; if (o) n[caseId] = { ...o, by, at: new Date().toISOString() }; else delete n[caseId]
    set({ ov: n })
    useStore.getState().commit(o ? 'Turbine county overridden' : 'Turbine county reset', `Turbine ${label}`, o ? `${prev?.county ?? o.was} → ${o.county} Co., ${o.st}${o.why ? ' — ' + o.why : ''}` : `back to Census boundary (${prev?.was ?? ''})`, () => {})
  },
}), { name: 'sc-turbine-county' }))
export const turbineOv = () => useTurbineCounty.getState().ov

export interface TCounty { county: string | null; st: string; src: 'Census boundary' | 'Admin override' | 'Farm county'; ov?: CountyOv }
/** From a USWTDB tuple (farm view). */
export function countyOfTurbine(t: WTurbine, farm: WFarm, ov = turbineOv()): TCounty {
  const o = ov[t[0]]; if (o) return { county: o.county, st: o.st, src: 'Admin override', ov: o }
  const a = t as unknown as (string | number)[]
  return a[5] ? { county: String(a[5]), st: String(a[6] ?? farm.st), src: 'Census boundary' } : { county: farm.county.split(',')[0] || null, st: farm.st, src: 'Farm county' }
}
/** From a turbine attached to a job (pay). */
export function countyOfJobTurbine(t: T.JobTurbine, st: string, ov = turbineOv()): TCounty | null {
  const o = ov[t.caseId]; if (o) return { county: o.county, st: o.st, src: 'Admin override', ov: o }
  return t.county ? { county: t.county, st: t.countySt ?? st, src: 'Census boundary' } : null
}
export const localOf = (locals: ULocal[] | null, c: TCounty | null) => (locals && c?.county ? localsForCounty(locals, c.county, c.st)[0] : undefined)
export const tag = (c: TCounty | null, l?: ULocal) => `${c?.county ? `${c.county} Co.` : 'County ?'} · ${l ? `Local ${l.local}` : 'no local'}`
