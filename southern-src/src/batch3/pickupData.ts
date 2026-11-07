/** Smart Pickup & Dispatch (Blueprint 5.4). Duty logs are simulated per driver; Samsara optional. Local store 'sc-pickup-v2'. */
import { create } from 'zustand'
import type * as T from '../data/types'
import { absenceOn, certBand, fullName } from '../data/logic'
import { today, addDays } from '../lib/util'
import { miles } from '../data/moves'
import { dqCheck } from '../gapA/dq'

export type Endorse = 'Lowboy' | '9-axle' | 'Oversize permits' | 'Hazmat' | 'Tanker' | 'Step deck'
export interface Pickup { id: string; date: string; time: string; label: string; from: string; to: string; lat: number; lng: number; dropMi: number; weightLbs: number; needs: Endorse[]; certs: T.CertType[]; jobNo: string; trailer: string }
export interface Hos { driveLeft: number; shiftLeft: number; cycleLeft: number; weekHrs: number; source: 'Duty log (app)' | 'Samsara' }
export interface DriverInfo { e: T.Employee; lat: number; lng: number; where: string; hos: Hos; endorse: Endorse[]; lanes: number }
export interface Ranked { d: DriverInfo; score: number; ok: boolean; stops: string[]; reasons: { t: string; tone: 'ok' | 'warn' | 'bad' | 'neutral' }[]; deadhead: number; tripHrs: number; offSoon?: string }

const h = (s: string) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return (x >>> 0) / 4294967296 }
const SPOTS = [
  { where: 'OKC yard', lat: 35.4089, lng: -97.4706 }, { where: 'Ardmore Refinery', lat: 34.18, lng: -97.13 }, { where: 'McAlester (US-69)', lat: 34.93, lng: -95.77 },
  { where: 'Midland yard', lat: 31.9456, lng: -102.1262 }, { where: 'Kilgore yard', lat: 32.3626, lng: -94.8556 }, { where: 'Enid', lat: 36.39, lng: -97.88 }, { where: 'Odessa', lat: 31.85, lng: -102.37 }, { where: 'Tulsa', lat: 36.15, lng: -95.99 },
]
const BR: Record<string, number[]> = { 'br-okc': [0, 1, 2, 5, 7], 'br-mid': [3, 6], 'br-kil': [4, 2] }
export function driverInfo(db: T.DB, e: T.Employee): DriverInfo {
  const r = h(e.id), r2 = h(e.id + 'x'), r3 = h(e.id + 'y')
  const opts = BR[e.branchId] ?? [0]
  const sp = SPOTS[opts[Math.floor(r * opts.length)]]
  const driveLeft = Math.round((1.5 + r2 * 9.5) * 4) / 4
  const weekHrs = Math.round(18 + r3 * 44)
  const all: Endorse[] = ['Lowboy', '9-axle', 'Oversize permits', 'Step deck', 'Hazmat', 'Tanker']
  const endorse = all.filter((_, i) => h(e.id + i) < (i < 4 ? 0.62 : 0.25))
  if (!endorse.includes('Step deck')) endorse.push('Step deck')
  void db
  return { e, lat: sp.lat + (r - .5) * .15, lng: sp.lng + (r2 - .5) * .15, where: sp.where, endorse, lanes: Math.floor(r3 * 7), hos: { driveLeft, shiftLeft: Math.min(14, driveLeft + 2.5), cycleLeft: Math.max(0, 70 - weekHrs), weekHrs, source: h(e.id + 's') < 0.7 ? 'Samsara' : 'Duty log (app)' } }
}
export const drivers = (db: T.DB) => db.employees.filter(e => e.craft === 'Truck Driver' && e.status === 'Active').map(e => driverInfo(db, e))

export function rank(db: T.DB, p: Pickup, exclude = new Set<string>()): Ranked[] {
  return drivers(db).filter(d => !exclude.has(d.e.id)).map(d => {
    const deadhead = miles(d, p)
    const tripHrs = Math.round(((deadhead + p.dropMi) / 48) * 4) / 4
    const stops: string[] = []; const reasons: Ranked['reasons'] = []
    const ab = absenceOn(db, d.e.id, p.date)
    const dq = dqCheck(db, d.e) // DOT driver qualification file (gap batch A)
    if (dq.blocked) stops.push(`DQ file: ${dq.reasons.join('; ')}`)
    else if (dq.soon.length) reasons.push({ t: `DQ: ${dq.soon[0].label.split(' · ')[0]} ${dq.soon[0].status.toLowerCase()}`, tone: 'warn' })
    if (ab) stops.push(`${ab.kind} on ${p.date.slice(5)}`)
    const mine = db.certs.filter(c => c.employeeId === d.e.id && certBand(c).band !== 'expired').map(c => c.type)
    // drivers are CDL A by definition in the demo; DOT med card from certs when present
    const missingCert = p.certs.filter(c => !mine.includes(c) && c !== 'CDL Class A')
    if (missingCert.length) stops.push(`Missing ${missingCert.join(', ')}`)
    const missingEnd = p.needs.filter(n => !d.endorse.includes(n))
    if (missingEnd.length) stops.push(`No ${missingEnd.join(' / ')}`)
    if (d.hos.driveLeft < tripHrs) stops.push(`Out of hours: ${d.hos.driveLeft}h left, trip ${tripHrs}h`)
    if (d.hos.cycleLeft < tripHrs) stops.push(`70-hr cycle: ${d.hos.cycleLeft}h left`)
    let offSoon: string | undefined
    for (let k = 1; k <= 3; k++) { const a = absenceOn(db, d.e.id, addDays(p.date, k)); if (a) { offSoon = `${a.kind} ${addDays(p.date, k).slice(5)}`; break } }
    reasons.push({ t: `${d.hos.driveLeft}h drive left${d.hos.source === 'Samsara' ? ' (Samsara)' : ' (duty log)'}`, tone: d.hos.driveLeft - tripHrs > 3 ? 'ok' : 'warn' })
    reasons.push({ t: `${deadhead} mi deadhead from ${d.where}`, tone: deadhead < 60 ? 'ok' : deadhead < 160 ? 'neutral' : 'warn' })
    if (p.needs.length && !missingEnd.length) reasons.push({ t: p.needs.join(' · '), tone: 'ok' })
    if (d.lanes) reasons.push({ t: `ran this lane ${d.lanes}×`, tone: 'neutral' })
    reasons.push({ t: `${d.hos.weekHrs}h this week`, tone: d.hos.weekHrs > 50 ? 'warn' : 'neutral' })
    if (offSoon) reasons.push({ t: `off soon: ${offSoon}`, tone: 'warn' })
    const score = stops.length ? -1000 - stops.length : Math.round(100 - deadhead * 0.12 + (d.hos.driveLeft - tripHrs) * 3 + d.lanes * 2 - Math.max(0, d.hos.weekHrs - 40) * 0.8 - (offSoon ? 6 : 0))
    return { d, score, ok: !stops.length, stops, reasons, deadhead, tripHrs, offSoon }
  }).sort((a, b) => b.score - a.score)
}

export const nextThursday = () => { const d = new Date(today() + 'T12:00'); const add = (4 - d.getDay() + 7) % 7 || 7; return addDays(today(), add) }
function seedPickups(): Pickup[] {
  const thu = nextThursday(), t1 = addDays(today(), 1)
  const P = (id: string, date: string, time: string, label: string, from: string, to: string, spot: number, dropMi: number, weightLbs: number, needs: Endorse[], certs: T.CertType[], jobNo: string, trailer: string): Pickup => ({ id, date, time, label, from, to, lat: SPOTS[spot].lat, lng: SPOTS[spot].lng, dropMi, weightLbs, needs, certs, jobNo, trailer })
  return [
    P('pk-1', t1, '06:00', 'Crane 28 · Load 10 (CW slabs)', 'Sooner Ridge Wind T-18', 'Ardmore Refinery', 3, 215, 44000, ['Step deck'], ['CDL Class A', 'DOT Medical Card'], '10158', 'Step deck'),
    P('pk-2', t1, '07:30', 'Crane 28 · crawler track', 'Sooner Ridge Wind T-18', 'Ardmore Refinery', 3, 215, 99200, ['Lowboy', '9-axle', 'Oversize permits'], ['CDL Class A', 'DOT Medical Card'], '10158', '9-axle lowboy'),
    P('pk-3', thu, '05:30', 'Crane 31 · counterweight 15 t × 2', 'Odessa Petrochem', 'Midland yard', 6, 24, 66000, ['Lowboy'], ['CDL Class A', 'H2S Awareness'], '10142', 'RGN'),
    P('pk-4', thu, '06:00', 'Crane 70 · boom inserts', 'Ardmore Refinery', 'OKC yard', 1, 104, 49600, ['Step deck', 'Oversize permits'], ['CDL Class A', 'DOT Medical Card'], '10131', 'Step deck'),
    P('pk-5', thu, '06:30', 'Mats return → Sterling Mats', 'Ardmore Refinery', 'Sterling Mats — Ardmore', 1, 6, 30000, ['Step deck'], ['CDL Class A'], '10158', 'Flatbed'),
    P('pk-6', thu, '07:00', 'Rigging box + 160 t block', 'OKC yard', 'Enid — CHS elevator', 0, 98, 13600, [], ['CDL Class A', 'TWIC'], '10163', 'Flatbed'),
    P('pk-7', thu, '08:00', 'Crane 80 · upper CW trays', 'OKC yard', 'Ponca City Refinery', 0, 100, 79200, ['Lowboy', '9-axle'], ['CDL Class A', 'DOT Medical Card'], '10170', '9-axle lowboy'),
    P('pk-8', thu, '09:30', 'Parts run — hydraulic pump', 'Tulsa (vendor)', 'OKC shop', 7, 106, 900, [], ['CDL Class A'], 'SHOP', 'Hotshot'),
  ]
}
export interface PickState { pickups: Pickup[]; assigned: Record<string, { driverId: string; override?: string; confirmed?: boolean }>; v: number }
const KEY = 'sc-pickup-v2'
const load = (): PickState => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s?.v === 1) return s } catch { /* */ } return { pickups: seedPickups(), assigned: {}, v: 1 } }
export const usePickup = create<PickState>(() => load())
const save = () => localStorage.setItem(KEY, JSON.stringify(usePickup.getState()))
export const pickActions = {
  assign(pid: string, driverId: string, override?: string) { usePickup.setState(s => ({ assigned: { ...s.assigned, [pid]: { driverId, override } } })); save() },
  unassign(pid: string) { usePickup.setState(s => { const a = { ...s.assigned }; delete a[pid]; return { assigned: a } }); save() },
  /** Fill every pickup on a date with the best legal driver (one pickup per driver, earliest first). */
  planDay(db: T.DB, date: string) {
    const used = new Set<string>(); const out: Record<string, { driverId: string }> = {}
    usePickup.getState().pickups.filter(p => p.date === date).sort((a, b) => a.time.localeCompare(b.time)).forEach(p => { const best = rank(db, p, used).find(r => r.ok); if (best) { used.add(best.d.e.id); out[p.id] = { driverId: best.d.e.id } } })
    usePickup.setState(s => ({ assigned: { ...s.assigned, ...out } })); save(); return Object.keys(out).length
  },
  confirmDay(date: string) { usePickup.setState(s => { const a = { ...s.assigned }; s.pickups.filter(p => p.date === date).forEach(p => { if (a[p.id]) a[p.id] = { ...a[p.id], confirmed: true } }); return { assigned: a } }); save() },
  reset() { localStorage.removeItem(KEY); usePickup.setState({ pickups: seedPickups(), assigned: {}, v: 1 }) },
}
export { fullName }
