/** Daily weather log per project (Blueprint 5.9). Open-Meteo (free, no key) when reachable; seeded simulation otherwise. */
import { create } from 'zustand'
import { today, addDays } from '../lib/util'

export interface WxHour { t: string; w10: number; w60: number; w80: number; w120: number; w180: number; gust: number; dir: number; temp: number; precip: number }
export interface WxProject { id: string; name: string; jobNo: string; crane: string; lat: number; lng: number; limitMph: number; limitHeight: 'w60' | 'w80' | 'w120' | 'w180'; boomTip: string }
export const PROJECTS: WxProject[] = [
  { id: 'wx-1', name: 'Sooner Ridge Wind — T-18 rotor set', jobNo: '10125', crane: 'Crane 28 · LR 1500', lat: 36.44, lng: -99.49, limitMph: 20, limitHeight: 'w120', boomTip: '118 m boom tip (hub 105 m)' },
  { id: 'wx-2', name: 'Ardmore Refinery — Unit 4 reactor set', jobNo: '10158', crane: 'Crane 28 · LR 1500', lat: 34.18, lng: -97.13, limitMph: 25, limitHeight: 'w80', boomTip: '84 m boom tip' },
  { id: 'wx-3', name: 'Odessa Petrochem — separator vessel set', jobNo: '10142', crane: 'Crane 31 · LTM 1500', lat: 31.85, lng: -102.37, limitMph: 22, limitHeight: 'w60', boomTip: '60 m main boom' },
  { id: 'wx-4', name: 'Ardmore Refinery — turnaround (exchanger & column picks)', jobNo: '10131', crane: 'Crane 70 · LR 1700', lat: 34.17, lng: -97.13, limitMph: 25, limitHeight: 'w80', boomTip: '91 m boom tip' },
]
export const HEIGHTS: { k: keyof WxHour; label: string; color: string }[] = [{ k: 'w10', label: '10 m', color: '#94a3b8' }, { k: 'w60', label: '60 m', color: '#38bdf8' }, { k: 'w80', label: '80 m', color: '#f59e0b' }, { k: 'w120', label: '120 m', color: '#ef4444' }, { k: 'w180', label: '180 m', color: '#a855f7' }]
const rnd = (s: string) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return () => { x = Math.imul(x ^ (x >>> 15), 2246822507); x = Math.imul(x ^ (x >>> 13), 3266489909); return ((x ^= x >>> 16) >>> 0) / 4294967296 } }
const r1 = (n: number) => Math.round(n * 10) / 10
/** 60 m from the 10 m / 80 m pair using a power-law profile. */
const interp = (w10: number, w80: number) => { const a = Math.log(Math.max(w80, .1) / Math.max(w10, .1)) / Math.log(8); return r1(w10 * Math.pow(6, a)) }

export function simulate(p: WxProject, date: string): WxHour[] {
  const r = rnd(p.id + date)
  const windy = date === addDays(today(), -1) || date === addDays(today(), -5) // seeded standby days
  const base = windy ? 17 + r() * 4 : 7 + r() * 6
  return Array.from({ length: 24 }, (_, h) => {
    const diurnal = Math.sin(((h - 6) / 24) * Math.PI * 2) * 3.5 + (windy && h >= 9 && h <= 17 ? 6 : 0)
    const w10 = Math.max(1, r1(base * 0.62 + diurnal * 0.6 + (r() - .5) * 2.4))
    const w80 = r1(w10 * (1.42 + r() * .12) + 1)
    return { t: `${date}T${String(h).padStart(2, '0')}:00`, w10, w60: interp(w10, w80), w80, w120: r1(w80 * 1.1), w180: r1(w80 * 1.22), gust: r1(w10 * (1.45 + r() * .3) + 2), dir: Math.round((180 + h * 6 + r() * 30) % 360), temp: Math.round(58 + Math.sin(((h - 9) / 24) * Math.PI * 2) * 12 + r() * 3), precip: windy && h > 14 && r() > .6 ? r1(r() * .2) : 0 }
  })
}

interface WState { source: 'auto' | 'sim'; live: Record<string, WxHour[]>; status: Record<string, 'idle' | 'loading' | 'live' | 'offline'>; standdowns: Record<string, { by: string; at: string; note: string }> }
export const useWx = create<WState>(() => ({ source: 'auto', live: {}, status: {}, standdowns: (() => { try { const v = JSON.parse(localStorage.getItem('sc-wx-standdowns') || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { return {} } })() }))

export async function fetchLive(p: WxProject) {
  const st = useWx.getState(); if (st.status[p.id] === 'loading' || st.status[p.id] === 'live') return
  useWx.setState(s => ({ status: { ...s.status, [p.id]: 'loading' } }))
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&hourly=wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_80m,wind_gusts_10m,temperature_2m,precipitation&wind_speed_unit=mph&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=America%2FChicago&past_days=7&forecast_days=3`
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000)
    const j = await (await fetch(u, { signal: ctl.signal })).json(); clearTimeout(to)
    const H = j.hourly
    const rows: WxHour[] = H.time.map((t: string, i: number) => { const w10 = r1(H.wind_speed_10m[i] ?? 0), w80 = r1(H.wind_speed_80m[i] ?? 0); return { t, w10, w60: interp(w10, w80), w80, w120: r1(H.wind_speed_120m[i] ?? 0), w180: r1(H.wind_speed_180m[i] ?? 0), gust: r1(H.wind_gusts_10m[i] ?? 0), dir: H.wind_direction_80m[i] ?? 0, temp: Math.round(H.temperature_2m[i] ?? 0), precip: H.precipitation[i] ?? 0 } })
    if (!rows.length) throw new Error('empty')
    useWx.setState(s => ({ live: { ...s.live, [p.id]: rows }, status: { ...s.status, [p.id]: 'live' } }))
  } catch { useWx.setState(s => ({ status: { ...s.status, [p.id]: 'offline' } })) }
}
export function dayData(p: WxProject, date: string): { rows: WxHour[]; src: 'Open-Meteo' | 'Simulated' } {
  const s = useWx.getState()
  if (s.source === 'auto' && s.live[p.id]) { const rows = s.live[p.id].filter(r => r.t.startsWith(date)); if (rows.length === 24) return { rows, src: 'Open-Meteo' } }
  return { rows: simulate(p, date), src: 'Simulated' }
}
export const WORK = [7, 17] as const
export function verdict(p: WxProject, rows: WxHour[]) {
  const work = rows.filter(r => { const h = +r.t.slice(11, 13); return h >= WORK[0] && h < WORK[1] })
  const over = work.filter(r => (r[p.limitHeight] as number) > p.limitMph)
  const peak = rows.reduce((a, r) => (r[p.limitHeight] as number) > (a[p.limitHeight] as number) ? r : a, rows[0])
  return { over, standby: over.length >= 4, peak, peakGust: Math.max(...rows.map(r => r.gust)) }
}
export function recordStanddown(key: string, by: string, note: string) { useWx.setState(s => { const sd = { ...s.standdowns, [key]: { by, at: new Date().toISOString(), note } }; localStorage.setItem('sc-wx-standdowns', JSON.stringify(sd)); return { standdowns: sd } }) }
export const compass = (d: number) => ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(d / 22.5) % 16]
