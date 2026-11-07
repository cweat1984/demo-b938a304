/**
 * Crane Moves & Component Inventory (Blueprint 5.1). Self-contained, local-only store (localStorage 'sc-moves-v2')
 * so it never collides with the main db/seed. Cranes reference main-db equipment ids (eq-c28 …) for tap-anything.
 */
import { create } from 'zustand'
import { toast } from 'sonner'
import { today, addDays, uid } from '../lib/util'

export type CompType = 'Counterweight' | 'Carbody CW' | 'Hook block' | 'Headache ball' | 'Winch' | 'Wire rope' | 'Boom section' | 'Jib section' | 'Pins & rigging' | 'Crawler track' | 'Outrigger pad' | 'Mats' | 'Superlift'
export const COMP_ORDER: CompType[] = ['Crawler track', 'Carbody CW', 'Counterweight', 'Superlift', 'Boom section', 'Jib section', 'Hook block', 'Headache ball', 'Winch', 'Wire rope', 'Pins & rigging', 'Outrigger pad', 'Mats']
export type OwnerKind = 'crane' | 'rental' | 'yard'
export type LocKind = 'site' | 'yard' | 'rack' | 'transit' | 'crane'
export interface Component {
  id: string; craneId: string; type: CompType; name: string; serial: string; weightLbs: number
  owner: { kind: OwnerKind; ref: string }   // crane id, rental vendor name, or yard/branch name
  loc: { kind: LocKind; ref: string }       // site name, yard bay, rack, trailer id
  compat: string[]; status: 'OK' | 'Inspection due' | 'Damaged'; rentalId?: string; inspected: string; oversize?: boolean
}
export interface Crane { id: string; unit: string; model: string; kind: 'Crawler' | 'Hydraulic'; branch: string; site: string; jobNo: string; lat: number; lng: number; family: string }
export interface Trailer { id: string; name: string; kind: string; capLbs: number; carrier: 'Southern' | '3P'; carrierName: string; driver: string; samsara: boolean }
export interface CheckIn { source: 'samsara' | 'manual'; at: string; lat: number; lng: number; photo?: string; by: string; note?: string }
export type LoadStatus = 'Planned' | 'En route' | 'Delivered'
export interface Load { id: string; no: number; trailerId: string; status: LoadStatus; departed?: string; checkIn?: CheckIn; kind?: 'move' | 'return' }
export interface MoveItem { compId: string; travels: boolean; loadNo?: number; storage?: string }
export interface Short { id: string; need: string; type: CompType; weightLbs: number; status: 'Open' | 'Requested' | 'Rented'; pick?: string }
export interface Move {
  id: string; craneId: string; fromProject: string; fromJobNo: string; toProject: string; toJobNo: string; toLat: number; toLng: number
  pickup: string; drop: string; status: 'Planning' | 'In progress' | 'Complete'; items: MoveItem[]; loads: Load[]; shorts: Short[]; createdAt: string
}
export interface Rental { id: string; vendor: string; po: string; rate: string; start: string; minDays: number; loadsTotal: number; loadsReturned: number; compIds: string[]; craneId: string }

export const BRANCHES = [
  { name: 'OKC yard', lat: 35.4089, lng: -97.4706 },
  { name: 'Midland yard', lat: 31.9456, lng: -102.1262 },
  { name: 'Kilgore yard', lat: 32.3626, lng: -94.8556 },
]
export const STORAGE = ['OKC yard · Bay 3 (CW pad)', 'OKC yard · Bay 7', 'OKC yard · Rack B (blocks)', 'OKC yard · Rope rack R2', 'Midland yard · Bay 2', 'Kilgore yard · Bay 1', 'Stay on current site (laydown)']
export const PER_TRUCK = 1700

export const miles = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 3959, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 1.18) // road factor
}

// ---------------- seed ----------------
const CRANES: Crane[] = [
  { id: 'eq-c28', unit: '28', model: 'Liebherr LR 1500', kind: 'Crawler', branch: 'OKC', site: 'Sooner Ridge Wind — T-18 rotor set', jobNo: '10125', lat: 36.44, lng: -99.49, family: 'LR 1500' },
  { id: 'eq-c70', unit: '70', model: 'Liebherr LR 1700-1.0', kind: 'Crawler', branch: 'OKC', site: 'Ardmore Refinery — turnaround (exchanger & column picks)', jobNo: '10131', lat: 34.17, lng: -97.13, family: 'LR 1700' },
  { id: 'eq-c31', unit: '31', model: 'Liebherr LTM 1500-8.1', kind: 'Hydraulic', branch: 'Midland', site: 'Odessa Petrochem', jobNo: '10142', lat: 31.85, lng: -102.37, family: 'LTM 1500' },
  { id: 'eq-c80', unit: '80', model: 'Manitowoc MLC300', kind: 'Crawler', branch: 'OKC', site: 'OKC yard', jobNo: '—', lat: 35.4089, lng: -97.4706, family: 'MLC300' },
]
const TRAILERS: Trailer[] = [
  { id: 'tr-401', name: 'T-401 · 9-axle lowboy', kind: 'Lowboy', capLbs: 110000, carrier: 'Southern', carrierName: 'Southern', driver: 'Kirk Owens', samsara: true },
  { id: 'tr-402', name: 'T-402 · RGN', kind: 'RGN', capLbs: 80000, carrier: 'Southern', carrierName: 'Southern', driver: 'Marcus Kelly', samsara: true },
  { id: 'tr-405', name: 'T-405 · Step deck', kind: 'Step deck', capLbs: 48000, carrier: 'Southern', carrierName: 'Southern', driver: 'Shane Ramirez', samsara: true },
  { id: 'tr-408', name: 'T-408 · Flatbed', kind: 'Flatbed', capLbs: 46000, carrier: 'Southern', carrierName: 'Southern', driver: 'Steve Brown', samsara: true },
  { id: 'tr-411', name: 'T-411 · Step deck', kind: 'Step deck', capLbs: 48000, carrier: 'Southern', carrierName: 'Southern', driver: 'Kyle Young', samsara: true },
  { id: 'tr-x1', name: 'Bennett · Live-load flatbed', kind: 'Flatbed', capLbs: 46000, carrier: '3P', carrierName: 'Bennett Heavy Haul', driver: 'B. Kerr', samsara: false },
  { id: 'tr-x2', name: 'Bennett · Live-load step deck', kind: 'Step deck', capLbs: 48000, carrier: '3P', carrierName: 'Bennett Heavy Haul', driver: 'T. Nguyen', samsara: false },
  { id: 'tr-x3', name: 'Lone Star · Live-load lowboy', kind: 'Lowboy', capLbs: 90000, carrier: '3P', carrierName: 'Lone Star Transport', driver: 'D. Hale', samsara: false },
  { id: 'tr-x4', name: 'Lone Star · Live-load flatbed', kind: 'Flatbed', capLbs: 46000, carrier: '3P', carrierName: 'Lone Star Transport', driver: 'K. Ruiz', samsara: false },
]

function seedComponents(): Component[] {
  const out: Component[] = []
  let n = 0
  const add = (craneId: string, type: CompType, name: string, weightLbs: number, compat: string[], o: Partial<Component> = {}, count = 1) => {
    const c = CRANES.find(x => x.id === craneId)!
    for (let i = 0; i < count; i++) out.push({ id: `cp-${++n}`, craneId, type, name: count > 1 ? `${name} #${i + 1}` : name, serial: `${c.unit}-${type.slice(0, 2).toUpperCase()}-${String(n).padStart(4, '0')}`, weightLbs, owner: { kind: 'crane', ref: craneId }, loc: { kind: 'site', ref: c.site }, compat, status: 'OK', inspected: addDays(today(), -((n * 13) % 200)), ...o })
  }
  const lr15 = ['Crane 28', 'Crane 59 (LR 1500)']
  // Crane 28 — LR 1500 (move in progress, so some pieces are already on trailers)
  add('eq-c28', 'Crawler track', 'Crawler track assy L/R', 99200, lr15, { oversize: true }, 2)
  add('eq-c28', 'Carbody CW', 'Carbody counterweight 22 t', 48500, lr15, {}, 2)
  add('eq-c28', 'Counterweight', 'Superstructure CW slab 10 t', 22000, [...lr15, 'Crane 70 (LR 1700, same slab)'], {}, 8)
  add('eq-c28', 'Superlift', 'Superlift tray + guying', 41000, lr15)
  add('eq-c28', 'Boom section', 'Main boom base 10 m', 38000, lr15, { oversize: true })
  add('eq-c28', 'Boom section', 'Boom insert 12 m', 21500, lr15, {}, 3)
  add('eq-c28', 'Boom section', 'Boom insert 6 m', 12800, lr15, {}, 2)
  add('eq-c28', 'Boom section', 'Boom head 6 m', 14100, lr15)
  add('eq-c28', 'Jib section', 'Luffing jib insert 12 m', 9800, lr15, {}, 2)
  add('eq-c28', 'Jib section', 'Luffing jib head', 7600, lr15)
  add('eq-c28', 'Hook block', 'Hook block 500 t (16 sheave)', 18500, ['Crane 28', 'Crane 59', 'Crane 31 (LTM 1500)'])
  add('eq-c28', 'Hook block', 'Hook block 160 t', 6400, ['Crane 28', 'Crane 59', 'Crane 70', 'Crane 31'])
  add('eq-c28', 'Headache ball', 'Headache ball 18 t', 1100, ['Any Southern crawler', 'LTM fleet'])
  add('eq-c28', 'Winch', 'Winch 3 (auxiliary) drum', 9200, lr15)
  add('eq-c28', 'Wire rope', 'Hoist rope 28 mm × 1,400 m (reel)', 11800, ['LR 1500', 'LR 1700'], { inspected: addDays(today(), -14) })
  add('eq-c28', 'Pins & rigging', 'Boom pin kit + pin puller', 3800, lr15)
  add('eq-c28', 'Pins & rigging', 'Rigging box (shackles, spreader bar 40 t)', 7200, ['Any'])
  add('eq-c28', 'Mats', 'Crane mats 4×24 ft (stack of 6)', 30000, ['Any crawler'], { owner: { kind: 'rental', ref: 'Sterling Mats' }, rentalId: 'rn-1' }, 4)
  // Crane 70 — LR 1700
  const lr17 = ['Crane 70', 'Maxim rental LR 1700']
  add('eq-c70', 'Crawler track', 'Crawler track assy L/R', 112000, lr17, { oversize: true }, 2)
  add('eq-c70', 'Carbody CW', 'Carbody counterweight 25 t', 55000, lr17, {}, 2)
  add('eq-c70', 'Counterweight', 'Superstructure CW slab 10 t', 22000, ['Crane 70', 'Crane 28 (LR 1500, same slab)'], {}, 10)
  add('eq-c70', 'Boom section', 'Boom insert 12 m', 24800, lr17, {}, 4)
  add('eq-c70', 'Hook block', 'Hook block 650 t', 23000, lr17)
  add('eq-c70', 'Hook block', 'Hook block 160 t', 6400, ['Crane 28', 'Crane 59', 'Crane 70', 'Crane 31'], { loc: { kind: 'rack', ref: 'OKC yard · Rack B (blocks)' } })
  add('eq-c70', 'Wire rope', 'Hoist rope 30 mm × 1,600 m (reel)', 14200, ['LR 1700'], { status: 'Inspection due', inspected: addDays(today(), -370) })
  add('eq-c70', 'Mats', 'Crane mats 4×24 ft (stack of 6)', 30000, ['Any crawler'], { loc: { kind: 'yard', ref: 'OKC yard · Bay 7' } }, 3)
  // Crane 31 — LTM 1500 (hydraulic)
  const ltm = ['Crane 31', 'Maxim LTM 1500 rental fleet']
  add('eq-c31', 'Counterweight', 'Counterweight slab 15 t', 33000, ltm, {}, 6)
  add('eq-c31', 'Counterweight', 'Counterweight base plate 10 t', 22000, ltm)
  add('eq-c31', 'Superlift', 'Y-guying (superlift) kit', 26500, ltm)
  add('eq-c31', 'Jib section', 'Luffing fly jib 7–42 m kit', 31000, ltm, { oversize: true })
  add('eq-c31', 'Hook block', 'Hook block 250 t', 8600, ['Crane 31', 'Crane 66'])
  add('eq-c31', 'Outrigger pad', 'Outrigger pads 6×6 ft (set of 4)', 6800, ['LTM fleet'])
  add('eq-c31', 'Mats', 'Outrigger mats 8×20 ft', 9000, ['Any'], { loc: { kind: 'yard', ref: 'Midland yard · Bay 2' } }, 4)
  add('eq-c31', 'Counterweight', 'Counterweight slab 15 t (rented)', 33000, ltm, { owner: { kind: 'rental', ref: 'Maxim Crane Works' }, rentalId: 'rn-2' }, 2)
  // Crane 80 — MLC300 sitting in OKC yard
  const mlc = ['Crane 80', 'Crane 81 (MLC300)']
  add('eq-c80', 'Counterweight', 'Upper CW tray 9 t', 19800, mlc, { loc: { kind: 'yard', ref: 'OKC yard · Bay 1' } }, 8)
  add('eq-c80', 'Boom section', 'Boom insert 9 m', 15400, mlc, { loc: { kind: 'yard', ref: 'OKC yard · Bay 1' } }, 4)
  add('eq-c80', 'Boom section', 'Boom insert 12 m', 19600, mlc, { loc: { kind: 'yard', ref: 'OKC yard · Bay 1' } }, 2)
  add('eq-c80', 'Hook block', 'Hook block 300 t', 11200, mlc, { loc: { kind: 'rack', ref: 'OKC yard · Rack A' } })
  add('eq-c80', 'Wire rope', 'Load line 28 mm (reel)', 10200, ['MLC300', 'LR 1500'], { loc: { kind: 'rack', ref: 'OKC yard · Rope rack' }, status: 'Damaged' })
  return out
}

function planLoads(items: MoveItem[], comps: Component[], trailerPool: Trailer[], base = 0): { items: MoveItem[]; loads: Load[] } {
  const travel = items.filter(i => i.travels).map(i => ({ i, c: comps.find(c => c.id === i.compId)! })).filter(x => x.c).sort((a, b) => b.c.weightLbs - a.c.weightLbs)
  const bins: { trailer: Trailer; used: number; no: number }[] = []
  const pool = trailerPool.length ? trailerPool : TRAILERS
  for (const { i, c } of travel) {
    let bin = bins.find(b => b.trailer.capLbs - b.used >= c.weightLbs)
    if (!bin) {
      const unused = pool.filter(x => !bins.some(b => b.trailer.id === x.id) && x.capLbs >= c.weightLbs)
      const pick = (c.weightLbs > 50000 ? unused.sort((a, b) => b.capLbs - a.capLbs)[0] : unused.sort((a, b) => a.capLbs - b.capLbs)[0])
        ?? pool.filter(x => x.capLbs >= c.weightLbs)[bins.length % Math.max(1, pool.filter(x => x.capLbs >= c.weightLbs).length)] ?? pool[0]
      bin = { trailer: pick, used: 0, no: base + bins.length + 1 }; bins.push(bin)
    }
    bin.used += c.weightLbs; i.loadNo = bin.no
  }
  items.filter(i => !i.travels).forEach(i => { i.loadNo = undefined })
  return { items, loads: bins.map(b => ({ id: uid('ld'), no: b.no, trailerId: b.trailer.id, status: 'Planned' as LoadStatus, kind: 'move' as const })) }
}

function seedMove(comps: Component[]): Move {
  const c28 = comps.filter(c => c.craneId === 'eq-c28')
  const items: MoveItem[] = c28.map(c => ({ compId: c.id, travels: !(c.name.startsWith('Boom insert 6 m') || c.name.includes('Luffing jib insert 12 m #2')), storage: undefined }))
  items.filter(i => !i.travels).forEach(i => { i.storage = 'OKC yard · Bay 7' })
  const { loads } = planLoads(items, comps, TRAILERS)
  const now = Date.now()
  loads.forEach((l, k) => {
    if (k < 5) { l.status = 'Delivered'; l.departed = new Date(now - (9 - k) * 3600e3).toISOString(); const t = TRAILERS.find(t => t.id === l.trailerId)!; l.checkIn = { source: t.samsara ? 'samsara' : 'manual', at: new Date(now - (6 - k) * 3600e3).toISOString(), lat: 34.181, lng: -97.129, by: t.samsara ? 'Samsara geofence' : 'Tony Reyes (crew)' } }
    else if (k < 9) { l.status = 'En route'; l.departed = new Date(now - (k - 4) * 1800e3).toISOString() }
  })
  return {
    id: 'mv-1', craneId: 'eq-c28', fromProject: 'Sooner Ridge Wind — T-18 rotor set', fromJobNo: '10125', toProject: 'Ardmore Refinery — Unit 4 reactor set', toJobNo: '10158', toLat: 34.18, toLng: -97.13,
    pickup: addDays(today(), -1), drop: addDays(today(), 1), status: 'In progress', items, loads, createdAt: new Date(now - 3 * 864e5).toISOString(),
    shorts: [
      { id: 'sh-1', need: 'Hook block 160 t (2nd block for tandem pick)', type: 'Hook block', weightLbs: 6400, status: 'Open' },
      { id: 'sh-2', need: 'Superstructure CW slab 10 t × 2 (heavier config)', type: 'Counterweight', weightLbs: 44000, status: 'Open' },
      { id: 'sh-3', need: 'Crane mats 4×24 ft × 2 stacks (soft ground)', type: 'Mats', weightLbs: 60000, status: 'Requested', pick: 'Sterling Mats — Ardmore' },
    ],
  }
}

function seedRentals(): Rental[] {
  return [
    { id: 'rn-1', vendor: 'Sterling Mats', po: 'PO-24871', rate: '$185 / mat / week', start: addDays(today(), -41), minDays: 28, loadsTotal: 4, loadsReturned: 0, compIds: [], craneId: 'eq-c28' },
    { id: 'rn-2', vendor: 'Maxim Crane Works', po: 'PO-24903', rate: '$1,250 / slab / month', start: addDays(today(), -19), minDays: 30, loadsTotal: 2, loadsReturned: 1, compIds: [], craneId: 'eq-c31' },
    { id: 'rn-3', vendor: 'Maxim Crane Works', po: 'PO-24960', rate: '$4,800 / week', start: addDays(today(), -9), minDays: 14, loadsTotal: 5, loadsReturned: 2, compIds: [], craneId: 'eq-c70' },
  ]
}

export interface MovesState {
  cranes: Crane[]; components: Component[]; trailers: Trailer[]; moves: Move[]; rentals: Rental[]; v: number
}
const KEY = 'sc-moves-v2'
function fresh(): MovesState {
  const components = seedComponents()
  const rentals = seedRentals()
  rentals.forEach(r => { r.compIds = components.filter(c => c.rentalId === r.id).map(c => c.id) })
  const move = seedMove(components)
  // pieces on trailers en route / delivered get live locations
  move.items.forEach(i => { const c = components.find(c => c.id === i.compId)!; const l = move.loads.find(l => l.no === i.loadNo); if (!i.travels) c.loc = { kind: 'yard', ref: i.storage! }; else if (l?.status === 'En route') c.loc = { kind: 'transit', ref: l.trailerId }; else if (l?.status === 'Delivered') c.loc = { kind: 'site', ref: move.toProject } })
  return { cranes: CRANES, components, trailers: TRAILERS, moves: [move], rentals, v: 1 }
}
const load = (): MovesState => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && s.v === 1) return s } catch { /* */ } return fresh() }

export const useMoves = create<MovesState>(() => load())
let t: number | undefined
const save = () => { clearTimeout(t); t = window.setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(useMoves.getState())) } catch { toast.error('Couldn’t save on this phone', { description: 'Storage is full — your last load/check-in change may not be kept. Free up space.' }) /* field fixes: surface quota errors */ } }, 200) }
const mut = (fn: (s: MovesState) => void) => { const s = structuredClone(useMoves.getState()); fn(s); useMoves.setState(s); save() }

// ---------------- selectors ----------------
export const trailerOf = (s: MovesState, id: string) => s.trailers.find(t => t.id === id)
export const compOf = (s: MovesState, id: string) => s.components.find(c => c.id === id)
export const loadWeight = (s: MovesState, m: Move, no: number) => m.items.filter(i => i.travels && i.loadNo === no).reduce((a, i) => a + (compOf(s, i.compId)?.weightLbs ?? 0), 0)
export const moveStats = (s: MovesState, m: Move) => {
  const travel = m.items.filter(i => i.travels)
  const weight = travel.reduce((a, i) => a + (compOf(s, i.compId)?.weightLbs ?? 0), 0)
  const delivered = m.loads.filter(l => l.status === 'Delivered').length
  const permits = travel.filter(i => compOf(s, i.compId)?.oversize || (compOf(s, i.compId)?.weightLbs ?? 0) > 80000).length
  return { weight, loads: m.loads.length, delivered, enroute: m.loads.filter(l => l.status === 'En route').length, planned: m.loads.filter(l => l.status === 'Planned').length, pct: m.loads.length ? Math.round(delivered / m.loads.length * 100) : 0, permits, own: m.loads.filter(l => trailerOf(s, l.trailerId)?.carrier === 'Southern').length }
}
export function sourcesFor(s: MovesState, sh: Short, m: Move) {
  const to = { lat: m.toLat, lng: m.toLng }
  const out: { label: string; kind: 'Southern crane' | 'Southern yard' | 'Rental'; mi: number; cost: string }[] = []
  s.components.filter(c => c.type === sh.type && c.craneId !== m.craneId && c.owner.kind !== 'rental').forEach(c => {
    const cr = s.cranes.find(x => x.id === c.craneId)!
    const inYard = c.loc.kind === 'yard' || c.loc.kind === 'rack'
    const pos = inYard ? (BRANCHES.find(b => c.loc.ref.startsWith(b.name.split(' ')[0])) ?? cr) : cr
    const label = inYard ? `${c.loc.ref} (Crane ${cr.unit}'s)` : `Crane ${cr.unit} site — ${cr.site}`
    if (!out.some(o => o.label === label)) out.push({ label, kind: inYard ? 'Southern yard' : 'Southern crane', mi: miles(pos, to), cost: 'Internal · freight only' })
  })
  out.push({ label: sh.type === 'Mats' ? 'Sterling Mats — Ardmore' : 'Maxim Crane Works — Oklahoma City', kind: 'Rental', mi: miles(sh.type === 'Mats' ? { lat: 34.17, lng: -97.14 } : BRANCHES[0], to), cost: sh.type === 'Mats' ? '$185 / mat / wk' : '$1,250 / mo' })
  return out.sort((a, b) => a.mi - b.mi).slice(0, 4)
}

// ---------------- actions ----------------
export const moveActions = {
  reset() { localStorage.removeItem(KEY); useMoves.setState(fresh()) },
  toggleItem(moveId: string, compId: string, travels: boolean, storage?: string) {
    mut(s => {
      const m = s.moves.find(m => m.id === moveId)!; const it = m.items.find(i => i.compId === compId)!
      it.travels = travels; it.storage = travels ? undefined : (storage ?? it.storage ?? STORAGE[1])
      const keep = m.loads.filter(l => l.status !== 'Planned')
      const kept = new Set(keep.map(l => l.no))
      const replan = m.items.filter(i => !(i.travels && i.loadNo && kept.has(i.loadNo)))
      const pool = s.trailers.filter(t => !keep.some(l => l.trailerId === t.id && l.status === 'En route'))
      const { loads } = planLoads(replan, s.components, pool, keep.length ? Math.max(...keep.map(l => l.no)) : 0)
      m.loads = [...keep, ...loads]
      const c = s.components.find(c => c.id === compId)!
      if (!travels) c.loc = { kind: 'yard', ref: it.storage! }
    })
  },
  setStorage(moveId: string, compId: string, storage: string) { mut(s => { const it = s.moves.find(m => m.id === moveId)!.items.find(i => i.compId === compId)!; it.storage = storage; const c = s.components.find(c => c.id === compId)!; c.loc = { kind: storage.startsWith('Stay') ? 'site' : 'yard', ref: storage } }) },
  assignLoad(moveId: string, compId: string, no: number) { mut(s => { const it = s.moves.find(m => m.id === moveId)!.items.find(i => i.compId === compId)!; it.loadNo = no }) },
  setTrailer(moveId: string, loadId: string, trailerId: string) { mut(s => { const l = s.moves.find(m => m.id === moveId)!.loads.find(l => l.id === loadId)!; l.trailerId = trailerId }) },
  depart(moveId: string, loadId: string) { mut(s => { const m = s.moves.find(m => m.id === moveId)!; const l = m.loads.find(l => l.id === loadId)!; l.status = 'En route'; l.departed = new Date().toISOString(); m.status = 'In progress'; m.items.filter(i => i.loadNo === l.no && i.travels).forEach(i => { const c = s.components.find(c => c.id === i.compId)!; c.loc = { kind: 'transit', ref: l.trailerId } }) }) },
  checkIn(moveId: string, loadId: string, ci: CheckIn) {
    mut(s => {
      const m = s.moves.find(m => m.id === moveId)!; const l = m.loads.find(l => l.id === loadId)!
      l.status = 'Delivered'; l.checkIn = ci; if (!l.departed) l.departed = ci.at
      m.items.filter(i => i.loadNo === l.no && i.travels).forEach(i => { const c = s.components.find(c => c.id === i.compId)!; c.loc = { kind: 'site', ref: m.toProject } })
      if (m.loads.every(x => x.status === 'Delivered')) { m.status = 'Complete'; const cr = s.cranes.find(c => c.id === m.craneId)!; cr.site = m.toProject; cr.jobNo = m.toJobNo; cr.lat = m.toLat; cr.lng = m.toLng }
    })
  },
  sourceShort(moveId: string, shortId: string, pick: string, rent: boolean) {
    mut(s => {
      const m = s.moves.find(m => m.id === moveId)!; const sh = m.shorts.find(x => x.id === shortId)!; sh.status = rent ? 'Rented' : 'Requested'; sh.pick = pick
      if (rent) s.rentals.unshift({ id: uid('rn'), vendor: pick.split(' — ')[0], po: `PO-${24990 + s.rentals.length}`, rate: pick.includes('Mats') ? '$185 / mat / week' : '$1,250 / month', start: m.drop, minDays: 28, loadsTotal: 1, loadsReturned: 0, compIds: [], craneId: m.craneId })
    })
  },
  returnLoad(rentalId: string) { mut(s => { const r = s.rentals.find(r => r.id === rentalId)!; if (r.loadsReturned < r.loadsTotal) r.loadsReturned++ }) },
  createMove(p: { craneId: string; toProject: string; toJobNo: string; pickup: string; drop: string; toLat: number; toLng: number }) {
    let id = ''
    mut(s => {
      const cr = s.cranes.find(c => c.id === p.craneId)!
      const prior = [...s.moves].reverse().find(m => m.craneId === p.craneId)
      const comps = s.components.filter(c => c.craneId === p.craneId)
      const items: MoveItem[] = comps.map(c => { const was = prior?.items.find(i => i.compId === c.id); return { compId: c.id, travels: was ? was.travels : c.status !== 'Damaged' } })
      items.filter(i => !i.travels).forEach(i => { i.storage = STORAGE[1] })
      const busy = new Set(s.moves.filter(m => m.status !== 'Complete').flatMap(m => m.loads.filter(l => l.status !== 'Delivered').map(l => l.trailerId)))
      const pool = s.trailers.filter(t => !busy.has(t.id))
      const { loads } = planLoads(items, s.components, pool.length ? pool : s.trailers)
      const shorts: Short[] = comps.filter(c => c.status !== 'OK').map(c => ({ id: uid('sh'), need: `${c.name} — ${c.status.toLowerCase()}`, type: c.type, weightLbs: c.weightLbs, status: 'Open' as const }))
      if (!comps.some(c => c.type === 'Mats')) shorts.push({ id: uid('sh'), need: 'Crane mats for new site (none assigned)', type: 'Mats', weightLbs: 30000, status: 'Open' })
      if (!shorts.length) shorts.push({ id: uid('sh'), need: 'Hook block 160 t (spare for new config)', type: 'Hook block', weightLbs: 6400, status: 'Open' })
      id = uid('mv')
      s.moves.unshift({ id, craneId: p.craneId, fromProject: cr.site, fromJobNo: cr.jobNo, toProject: p.toProject, toJobNo: p.toJobNo, toLat: p.toLat, toLng: p.toLng, pickup: p.pickup, drop: p.drop, status: 'Planning', items, loads, shorts, createdAt: new Date().toISOString() })
    })
    return id
  },
}
