/** Wind farm directory data: real USWTDB data (public domain), lazy loaded so the app stays fast. */
import { useEffect, useState } from 'react'
import type * as T from './types'

export interface WModel { manu: string; model: string; n: number; kw: number | null; hh: number | null; rd: number | null; th: number | null }
export interface WFarm { id: string; name: string; st: string; county: string; lat: number; lng: number; n: number; mw: number; year: number | null; eia: string | null; models: WModel[] }
export interface WMeta { source: string; version: string; date: string; doi: string; license: string; turbines: number; projects: number }
/** [case_id, faa_ors, lng, lat, modelIndex] — turbines in each farm are pre-sorted west→east. */
export type WTurbine = [number, string, number, number, number]
export interface WindIndex { meta: WMeta; farms: WFarm[]; byId: Map<string, WFarm> }

let cache: WindIndex | null = null
let pending: Promise<WindIndex> | null = null
export const windSync = () => cache
export function loadWind(): Promise<WindIndex> {
  return (pending ??= import('./wind/farms.json').then(m => {
    const d = m.default as unknown as { meta: WMeta; farms: WFarm[] }
    cache = { ...d, byId: new Map(d.farms.map(f => [f.id, f])) }
    return cache
  }))
}
const TURB = import.meta.glob('./wind/t/*.json') as Record<string, () => Promise<{ default: Record<string, WTurbine[]> }>>
const tCache = new Map<string, Record<string, WTurbine[]>>()
export async function loadTurbines(st: string): Promise<Record<string, WTurbine[]>> {
  if (tCache.has(st)) return tCache.get(st)!
  const f = TURB[`./wind/t/${st}.json`]; const d = f ? (await f()).default : {}
  tCache.set(st, d); return d
}
export function useWind() {
  const [w, setW] = useState<WindIndex | null>(cache)
  useEffect(() => { if (!w) loadWind().then(setW) }, [w])
  return w
}
export function useTurbines(farm?: WFarm | null) {
  const [t, setT] = useState<WTurbine[] | null>(null)
  useEffect(() => { setT(null); if (farm) loadTurbines(farm.st).then(d => setT(d[farm.id] ?? [])) }, [farm?.id])
  return t
}

export const ft = (m?: number | null) => (m == null ? null : Math.round(m * 3.28084))
export const mft = (m?: number | null) => (m == null ? '—' : `${Math.round(m)} m / ${ft(m)} ft`)
export const mainModel = (f: WFarm) => f.models[0]
export const maxHub = (f: WFarm) => Math.max(0, ...f.models.map(m => m.hh ?? 0)) || null

/** Site turbine number: user label → auto-number (west→east) → USWTDB case id. */
export function turbineLabel(ws: T.WindSite | undefined, t: WTurbine, i: number) {
  return ws?.labels[String(t[0])] ?? (ws?.autoNumber ? `T-${i + 1}` : `#${t[0]}`)
}

/** Rule-based DEMO estimate only — real picks need the OEM nacelle weight and an engineered lift plan. */
export function nacelleTons(kw?: number | null) { return kw ? Math.round(25 + 16 * (kw / 1000)) : null }
export function suggestCrane(m: WModel | undefined, fleet: T.Equipment[]) {
  if (!m) return null
  const hh = m.hh ?? 80, nac = nacelleTons(m.kw) ?? 60
  const hook = hh + 8 // rigging + clearance over the hub
  const cls = hh <= 82 && nac <= 70 ? { min: 500, label: '500–600 t crawler or large AT with luffing jib', ex: 'LR 1500 · LTM 1650' }
    : hh <= 96 ? { min: 700, label: '750 t class crawler', ex: 'LR 1750 · CC 2800' }
    : hh <= 118 ? { min: 1000, label: '1,000 t class crawler with long main boom', ex: 'LR 11000 · CC 3800' }
    : { min: 1350, label: '1,350 t+ crawler or ring crane', ex: 'LR 11350 · LG 1750 SX' }
  const ours = fleet.filter(e => e.category === 'Crane' && (e.capacity ?? 0) >= cls.min).sort((a, b) => (a.capacity ?? 0) - (b.capacity ?? 0))
  const component = fleet.filter(e => e.category === 'Crane' && (e.capacity ?? 0) >= 300 && (e.capacity ?? 0) < cls.min).slice(0, 2)
  return { hook, nac, ...cls, ours, component }
}
