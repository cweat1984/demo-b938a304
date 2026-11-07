// Gap batch B: text-a-receipt, zero-report expenses, fuel cards + IFTA + GPS mileage, PTO balances, OS/OW permits. Own persisted slice.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type * as T from '../data/types'
import { addDays, today } from '../lib/util'

const rid = () => Math.random().toString(36).slice(2, 8)
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)

// ── Text / email a receipt ─────────────────────────────────────────────────
export const INBOUND = { sms: '(405) 555-0199', email: 'receipts@slh-demo.example' }
export interface Bubble { id: string; from: 'me' | 'app'; text: string; photo?: string; at: string; channel: 'sms' | 'email' }
export interface Pending { expenseId: string; options: string[] }

// ── Fuel cards ─────────────────────────────────────────────────────────────
export type FuelNet = 'WEX' | 'Comdata' | 'Coast'
export interface FuelTxn { id: string; net: FuelNet; at: string; unitId: string; unit: string; driver: string; station: string; state: string; lat: number; lng: number; gallons: number; price: number; tank: number; truckLat: number; truckLng: number; jobNo?: string; how: string; flags: string[] }
export const STATIONS = [
  { name: 'Love’s #612 Ardmore', state: 'OK', lat: 34.17, lng: -97.12 }, { name: 'Pilot #437 Oklahoma City', state: 'OK', lat: 35.47, lng: -97.6 }, { name: 'Love’s #301 Woodward', state: 'OK', lat: 36.43, lng: -99.4 },
  { name: 'TA Amarillo East', state: 'TX', lat: 35.19, lng: -101.75 }, { name: 'Pilot #1022 Midland', state: 'TX', lat: 31.99, lng: -102.08 }, { name: 'Love’s #255 Sweetwater', state: 'TX', lat: 32.47, lng: -100.4 },
  { name: 'Flying J Wichita', state: 'KS', lat: 37.62, lng: -97.33 }, { name: 'Love’s #788 Shreveport', state: 'LA', lat: 32.45, lng: -93.75 },
]
export const IFTA_RATE: Record<string, number> = { OK: 0.19, TX: 0.20, KS: 0.26, LA: 0.20, NM: 0.21, AR: 0.285 }
export const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => { const R = 3959, r = (d: number) => d * Math.PI / 180; const dl = r(b.lat - a.lat), dg = r(b.lng - a.lng); const x = Math.sin(dl / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dg / 2) ** 2; return Math.round(R * 2 * Math.asin(Math.sqrt(x))) }
export function seedFuel(db: T.DB): FuelTxn[] {
  const trucks = db.equipment.filter(e => e.category === 'Semi' || e.category === 'Crane').slice(0, 14)
  const out: FuelTxn[] = []
  const nets: FuelNet[] = ['WEX', 'Comdata', 'Coast']
  for (let i = 0; i < 36; i++) {
    const u = trucks[i % trucks.length]; if (!u) break
    const h = hash(u.id + i), st = STATIONS[h % STATIONS.length]
    const far = i === 5 || i === 17, over = i === 9 || i === 23
    const tank = u.category === 'Semi' ? 300 : 150
    const truck = far ? { lat: st.lat + 2.4, lng: st.lng - 1.8 } : { lat: st.lat + ((h % 7) - 3) * 0.04, lng: st.lng + ((h % 5) - 2) * 0.04 }
    const asg = db.assignments.find(a => a.date === addDays(today(), -(i % 20)) && db.employees.find(e => e.id === a.employeeId)?.craft?.toString().match(/Driver|Operator/))
    const drv = asg ? db.employees.find(e => e.id === asg.employeeId) : db.employees[h % db.employees.length]
    const job = asg ? db.jobs.find(j => j.id === asg.jobId) : undefined
    const gallons = over ? tank + 40 + (h % 30) : Math.round((40 + (h % Math.max(1, tank - 60))) * 10) / 10
    const t: FuelTxn = { id: 'ft-' + i, net: nets[i % 3], at: new Date(Date.now() - (i * 19 + (h % 9)) * 36e5).toISOString(), unitId: u.id, unit: u.unit, driver: drv ? `${drv.first} ${drv.last}` : 'Unassigned', station: st.name, state: st.state, lat: st.lat, lng: st.lng, gallons, price: Math.round((3.39 + (h % 40) / 100) * 100) / 100, tank, truckLat: truck.lat, truckLng: truck.lng, jobNo: job?.jobNo, how: job ? `Dispatch: ${drv?.first} on #${job.jobNo} that day${i % 2 ? ' · Samsara location within 3 mi' : ''}` : 'No dispatch that day — matched to unit only', flags: [] }
    const d = miles(t, { lat: t.truckLat, lng: t.truckLng })
    if (d > 50) t.flags.push(`Bought ${d} mi from the truck’s location`)
    if (t.gallons > t.tank) t.flags.push(`${t.gallons} gal > ${t.tank} gal tank`)
    out.push(t)
  }
  return out
}
export const quarterOf = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}` }
/** IFTA: miles (ELD/Samsara or app GPS, demo split) + fuel-card gallons by state. */
export function iftaSummary(txns: FuelTxn[]) {
  const by: Record<string, { gallons: number; miles: number }> = {}
  txns.forEach(t => { by[t.state] = by[t.state] ?? { gallons: 0, miles: 0 }; by[t.state].gallons += t.gallons })
  const share: Record<string, number> = { OK: 0.46, TX: 0.38, KS: 0.08, LA: 0.08 }
  const totalGal = Object.values(by).reduce((a, b) => a + b.gallons, 0), totalMi = Math.round(totalGal * 5.6)
  Object.keys(share).forEach(s => { by[s] = by[s] ?? { gallons: 0, miles: 0 }; by[s].miles = Math.round(totalMi * share[s]) })
  const mpg = totalMi / Math.max(1, totalGal)
  return { mpg, totalMi, totalGal, rows: Object.entries(by).map(([state, v]) => { const taxable = v.miles / mpg, net = (taxable - v.gallons) * (IFTA_RATE[state] ?? 0.2); return { state, miles: v.miles, gallons: Math.round(v.gallons), taxable: Math.round(taxable), rate: IFTA_RATE[state] ?? 0.2, net: Math.round(net * 100) / 100 } }).sort((a, b) => b.miles - a.miles) }
}
export interface Trip { id: string; who: string; date: string; from: string; to: string; miles: number; jobNo?: string; source: 'Phone GPS'; added: boolean }

// ── PTO balances (Paychex, simulated) ──────────────────────────────────────
export const ptoBalance = (empId: string, hireDate?: string) => { const h = hash(empId); const wks = hireDate ? Math.floor((Date.now() - new Date(hireDate + 'T12:00').getTime()) / 6048e5) : 999
  // dive2 field M6: new hires start at zero and accrue (no invented 64 h on day one)
  if (wks < 13) return { vacation: Math.max(0, Math.round(wks * 3.08 * 10) / 10), sick: 0, personal: 0, accrual: 3.08, syncedAt: new Date(Date.now() - 36e5 * 2).toISOString() }
  return { vacation: 16 + (h % 9) * 8, sick: 8 + (h % 4) * 8, personal: (h % 3) * 8, accrual: 3.08, syncedAt: new Date(Date.now() - 36e5 * 2).toISOString() } }

/** Chargeable PTO days in [from, to]: Mon–Fri plus weekend days the person is scheduled to work (0 if reversed). 10h each. */
export const businessDays = (from: string, to: string, workedWeekend: (iso: string) => boolean = () => false) => { if (!from || !to || to < from) return 0; let n = 0; for (let d = new Date(from + 'T12:00:00'), end = new Date(to + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) { const w = d.getDay(); if ((w !== 0 && w !== 6) || workedWeekend(d.toISOString().slice(0, 10))) n++ } return n }

// ── OS/OW permits ──────────────────────────────────────────────────────────
export const DIMS: Record<string, { w: number; h: number; l: number }> = {
  'Crawler track': { w: 4.9, h: 4.2, l: 36 }, 'Carbody CW': { w: 11.5, h: 3.2, l: 14 }, Counterweight: { w: 10.5, h: 2.6, l: 12 }, Superlift: { w: 12.2, h: 3.0, l: 16 }, 'Boom section': { w: 9.8, h: 9.2, l: 40 }, 'Jib section': { w: 7.4, h: 6.8, l: 36 }, 'Hook block': { w: 5.2, h: 6.6, l: 7 }, 'Headache ball': { w: 3, h: 3, l: 3 }, Winch: { w: 8.2, h: 5.4, l: 10 }, 'Wire rope': { w: 7, h: 6, l: 7 }, 'Pins & rigging': { w: 8, h: 4, l: 20 }, Mats: { w: 8, h: 4, l: 24 },
}
export const DECK: Record<string, { h: number; tare: number }> = { Lowboy: { h: 2, tare: 42000 }, RGN: { h: 2.2, tare: 38000 }, 'Step deck': { h: 3.5, tare: 32000 }, Flatbed: { h: 5, tare: 30000 } }
export interface StateRule { state: string; legal: { w: number; h: number; lbs: number }; escort: (w: number, h: number, l: number) => string[]; base: number; perTon: number; curfew: string[]; restrictions: string[] }
export const STATE_RULES: Record<string, StateRule> = {
  OK: { state: 'OK', legal: { w: 8.5, h: 13.5, lbs: 80000 }, base: 40, perTon: 1.5, escort: (w, h, l) => [...(w > 14 ? ['Front + rear escort (> 14 ft wide)'] : w > 12 ? ['One escort (> 12 ft wide)'] : []), ...(h > 15 ? ['Height pole car (> 15 ft)'] : []), ...(l > 110 ? ['Rear escort (> 110 ft long)'] : [])], curfew: ['No travel 30 min before sunset to 30 min after sunrise when over 10 ft wide', 'No movement on major holidays and the day before after noon'], restrictions: ['US-270 bridge at Woodward: 90,000 lb max per axle group — use SH-34 detour', 'I-35 through OKC: oversize not permitted 7–9 AM and 4–6 PM'] },
  TX: { state: 'TX', legal: { w: 8.5, h: 14, lbs: 80000 }, base: 90, perTon: 2.2, escort: (w, h, l) => [...(w > 16 ? ['Front + rear escort (> 16 ft wide)'] : w > 14 ? ['Front escort on two-lane roads (> 14 ft wide)'] : []), ...(h > 17 ? ['Height pole car (> 17 ft)'] : []), ...(l > 110 ? ['Rear escort (> 110 ft long)'] : [])], curfew: ['DFW and Houston metros: no movement 6:30–9 AM and 3:30–7 PM', 'Daylight only when over 14 ft wide'], restrictions: ['US-287 Wichita Falls: low overpass 16 ft 2 in at Kemp St', 'FM roads under 24 ft wide: no loads over 14 ft wide'] },
}
export interface RouteOpt { id: string; label: string; states: string[]; miles: Record<string, number> }
export const ROUTES: RouteOpt[] = [
  { id: 'r1', label: 'Sooner Ridge Wind → Ardmore (current move)', states: ['OK'], miles: { OK: 212 } },
  { id: 'r2', label: 'Ardmore → Sweetwater TX (next move, demo)', states: ['OK', 'TX'], miles: { OK: 34, TX: 236 } },
]
export interface PermitRec { key: string; moveId: string; loadNo: number; state: string; status: 'Needed' | 'Ordered' | 'Issued'; cost: number; jobNo: string; date: string; permitNo?: string }
export interface EscortBooking { key: string; vendor: string; state: string; date: string; kind: string; rate: number; status: 'Requested' | 'Confirmed' }
export const ESCORT_VENDORS = [
  { id: 'ev-1', name: 'Red Dirt Pilot Cars', states: ['OK', 'TX'], rate: 1.95, height: true, rating: 4.8 },
  { id: 'ev-2', name: 'Lone Star Escort Services', states: ['TX'], rate: 1.85, height: true, rating: 4.6 },
  { id: 'ev-3', name: 'Sooner Escort & Pole Car', states: ['OK'], rate: 1.75, height: false, rating: 4.4 },
]

interface G {
  bubbles: Bubble[]; pending: Pending | null; perDiemRate: number; trips: Trip[]; fuelConn: Record<FuelNet, boolean>; fuel: FuelTxn[]
  permits: PermitRec[]; escorts: EscortBooking[]
  say: (b: Omit<Bubble, 'id' | 'at'>) => void; setPending: (p: Pending | null) => void; setRate: (n: number) => void
  setTrips: (t: Trip[]) => void; connectFuel: (n: FuelNet, v: boolean, db: T.DB) => void
  setPermit: (p: PermitRec) => void; book: (e: EscortBooking) => void
}
export const useG = create<G>()(persist((set, get) => ({
  bubbles: [], pending: null, perDiemRate: 55, trips: [], fuelConn: { WEX: false, Comdata: false, Coast: false }, fuel: [], permits: [], escorts: [],
  say(b) { set({ bubbles: [...get().bubbles, { ...b, id: rid(), at: new Date().toISOString() }] }) },
  setPending(p) { set({ pending: p }) },
  setRate(n) { set({ perDiemRate: n }) },
  setTrips(t) { set({ trips: t }) },
  connectFuel(n, v, db) { const conn = { ...get().fuelConn, [n]: v }; const all = get().fuel.length ? get().fuel : seedFuel(db); set({ fuelConn: conn, fuel: all }) },
  setPermit(p) { set({ permits: [p, ...get().permits.filter(x => x.key !== p.key)] }) },
  book(e) { set({ escorts: [e, ...get().escorts.filter(x => x.key !== e.key)] }) },
}), { name: 'sc-gapb', version: 1 }))
