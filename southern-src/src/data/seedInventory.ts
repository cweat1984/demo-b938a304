// Inventory demo data: OKC-centred catalog with locations, photos (placeholders), SDS links,
// three weeks of ledger history (check-outs to jobs / work orders / cranes / people / customers, returns,
// receipts against POs, counts, adjustments, write-offs). Own RNG so the rest of the seed is untouched.
import type * as T from './types'
import { rng, addDays } from '../lib/util'
import { postInvCost, isReturnable } from './invcore'

type Ctx = { T0: string; now: Date; employees: T.Employee[]; equipment: T.Equipment[]; jobs: T.Job[]; workOrders: T.WorkOrder[]; customers: T.Customer[]; vendors: T.Vendor[]; costs: T.JobCost[]; bills: T.VendorBill[] }
// [name, category, sub, onHand, min, unit, manufacturer, cost, flags(S=serialized R=returnable C=chemical), extra (WLL or SDS key), icon?]
type Row = [string, T.InvCategory, string, number, number, string, string, number, string, string?, string?]
const ROWS: Row[] = [
  // Rigging (serialized slings/shackles carry serial + cert + inspection)
  ['Polyester round sling 10 ft — purple (2,600 lb)', 'Rigging', 'Slings', 24, 10, 'ea', 'Lift-All', 38, 'R', '2,600 lb vertical'],
  ['Polyester round sling 20 ft — green (5,300 lb)', 'Rigging', 'Slings', 16, 8, 'ea', 'Lift-All', 74, 'R', '5,300 lb vertical'],
  ['Polyester round sling 20 ft — red (13,200 lb)', 'Rigging', 'Slings', 8, 6, 'ea', 'Lift-All', 168, 'R', '13,200 lb vertical'],
  ['Wire rope sling 1" × 20 ft EIPS', 'Rigging', 'Slings', 12, 6, 'ea', 'Bridon-Bekaert', 312, 'SR', '9.8 t vertical'],
  ['Wire rope sling 1-1/2" × 30 ft EIPS', 'Rigging', 'Slings', 4, 4, 'ea', 'Bridon-Bekaert', 845, 'SR', '21 t vertical'],
  ['Synthetic web sling 4" × 12 ft', 'Rigging', 'Slings', 30, 12, 'ea', 'Lift-All', 44, 'R', '6,400 lb vertical'],
  ['Chain sling 3/8" G100 double leg', 'Rigging', 'Slings', 3, 4, 'ea', 'Peerless', 690, 'SR', '10,600 lb'],
  ['Screw pin shackle 1/2" (2 t)', 'Rigging', 'Shackles', 60, 20, 'ea', 'Crosby G-209', 14, 'R', '2 t'],
  ['Bolt-type shackle 1" (8.5 t)', 'Rigging', 'Shackles', 28, 12, 'ea', 'Crosby G-2130', 72, 'R', '8.5 t'],
  ['Bolt-type shackle 1-1/2" (17 t)', 'Rigging', 'Shackles', 14, 6, 'ea', 'Crosby G-2130', 198, 'SR', '17 t'],
  ['Bolt-type shackle 2-1/2" (55 t)', 'Rigging', 'Shackles', 4, 2, 'ea', 'Crosby G-2140', 1350, 'SR', '55 t'],
  ['Bolt-type shackle 3" (85 t)', 'Rigging', 'Shackles', 2, 2, 'ea', 'Crosby G-2140', 2480, 'SR', '85 t'],
  ['Binder chain 3/8" G70 × 20 ft', 'Rigging', 'Chains & binders', 48, 24, 'ea', 'Peerless', 62, 'R'],
  ['Ratchet binder 1/2"–5/8"', 'Rigging', 'Chains & binders', 40, 20, 'ea', 'Peerless', 58, 'R'],
  ['Ratchet strap 4" × 30 ft', 'Rigging', 'Chains & binders', 18, 30, 'ea', 'Kinedyne', 32, ''],
  ['Spreader bar 20 t × 20 ft (modular)', 'Rigging', 'Spreaders & beams', 2, 1, 'ea', 'Modulift', 9800, 'SR', '20 t'],
  ['Lifting beam 50 t × 12 ft', 'Rigging', 'Spreaders & beams', 1, 1, 'ea', 'Caldwell', 14500, 'SR', '50 t'],
  ['Wind blade yoke attachment', 'Rigging', 'Spreaders & beams', 1, 1, 'ea', 'Liftra', 38000, 'SR'],
  ['Swivel hoist ring 1"', 'Rigging', 'Hardware', 10, 6, 'ea', 'Crosby HR-125', 210, 'R'],
  ['Tag line 5/8" × 100 ft', 'Rigging', 'Hardware', 22, 15, 'ea', 'Samson', 64, ''],
  ['Crane mat 4 ft × 20 ft hardwood', 'Rigging', 'Mats & cribbing', 64, 40, 'ea', 'Sterling', 1450, 'R'],
  ['Outrigger pad 4 ft × 4 ft composite', 'Rigging', 'Mats & cribbing', 22, 16, 'ea', 'DICA', 980, 'R'],
  ['Cribbing 6×6 × 4 ft', 'Rigging', 'Mats & cribbing', 120, 60, 'ea', 'Local mill', 18, ''],
  // Tools (serialized, returnable)
  ['Torque multiplier 1" drive', 'Tools', 'Torque', 3, 2, 'ea', 'Norbar', 2650, 'SR'],
  ['Hydraulic torque wrench set', 'Tools', 'Torque', 2, 2, 'set', 'HYTORC', 11800, 'SR'],
  ['Load cell 50 t wireless', 'Tools', 'Measuring', 2, 1, 'ea', 'Straightpoint', 4900, 'SR'],
  ['Anemometer (crane mounted)', 'Tools', 'Measuring', 4, 2, 'ea', 'Hirschmann', 640, 'SR'],
  ['Two-way radio (UHF)', 'Tools', 'Radios', 18, 8, 'ea', 'Motorola CP200d', 420, 'SR', undefined, '📻'],
  ['Radio spare battery', 'Tools', 'Radios', 14, 8, 'ea', 'Motorola', 62, 'R', undefined, '🔋'],
  ['1/2" impact wrench (cordless)', 'Tools', 'Power tools', 6, 3, 'ea', 'Milwaukee M18', 389, 'SR'],
  ['Magnetic drill', 'Tools', 'Power tools', 2, 1, 'ea', 'Hougen HMD904', 2150, 'SR'],
  ['Laser level', 'Tools', 'Measuring', 3, 1, 'ea', 'DeWalt', 540, 'SR'],
  // PPE & Safety
  ['Hard hat — Southern red', 'PPE & Safety', 'Head', 46, 25, 'ea', 'MSA V-Gard', 24, '', undefined, '⛑️'],
  ['Safety glasses — clear', 'PPE & Safety', 'Eye', 180, 100, 'pr', '3M SecureFit', 4, '', undefined, '🥽'],
  ['Impact gloves (L)', 'PPE & Safety', 'Hands', 22, 60, 'pr', 'Ironclad', 16, '', undefined, '🧤'],
  ['FR shirt — 2XL', 'PPE & Safety', 'FR clothing', 18, 12, 'ea', 'Carhartt FR', 62, ''],
  ['Full-body harness w/ SRL', 'PPE & Safety', 'Fall protection', 14, 10, 'ea', 'DBI-SALA ExoFit', 389, 'SR'],
  ['Hi-vis vest Class 2', 'PPE & Safety', 'Hi-vis', 64, 30, 'ea', 'Radians', 9, ''],
  ['Hearing protection (box 200)', 'PPE & Safety', 'Hearing', 6, 4, 'box', 'Howard Leight', 42, ''],
  ['4-gas monitor', 'PPE & Safety', 'Gas monitors', 9, 6, 'ea', 'BW MicroClip X3', 520, 'SR'],
  ['H2S single-gas clip', 'PPE & Safety', 'Gas monitors', 16, 12, 'ea', 'BW Clip', 128, 'SR'],
  ['Calibration gas cylinder', 'PPE & Safety', 'Gas monitors', 3, 4, 'ea', 'BW', 145, 'C', 'cal'],
  ['First aid kit refill (50-person)', 'PPE & Safety', 'First aid', 8, 4, 'kit', 'Zee Medical', 74, '', undefined, '🩹'],
  ['Fire extinguisher 10 lb ABC', 'PPE & Safety', 'Fire', 12, 6, 'ea', 'Amerex', 68, '', undefined, '🧯'],
  // Parts
  ['Mud flap 24×30', 'Parts', 'Truck & trailer', 14, 8, 'ea', 'Minimizer', 38, ''],
  ['Air brake chamber 30/30', 'Parts', 'Brakes', 5, 6, 'ea', 'Haldex', 185, ''],
  ['Brake shoe kit (Q+ 16.5×7)', 'Parts', 'Brakes', 8, 4, 'kit', 'Meritor', 142, ''],
  ['Slack adjuster (automatic)', 'Parts', 'Brakes', 6, 4, 'ea', 'Haldex', 96, ''],
  ['LED marker light kit', 'Parts', 'Lighting', 20, 10, 'kit', 'Grote', 26, ''],
  ['LED headlight 7" round', 'Parts', 'Lighting', 4, 4, 'ea', 'Truck-Lite', 168, ''],
  ['Glad hand seal (pk 10)', 'Parts', 'Air system', 12, 6, 'pk', 'Phillips', 11, ''],
  ['Air line coil 15 ft', 'Parts', 'Air system', 6, 4, 'ea', 'Phillips', 48, ''],
  ['Serpentine belt (X15)', 'Parts', 'Engine', 5, 3, 'ea', 'Gates', 64, ''],
  ['Wiper blade 22"', 'Parts', 'Cab', 16, 8, 'ea', 'Trico', 14, ''],
  ['Hydraulic hose 1/2" × 48" (2-wire)', 'Parts', 'Hydraulics', 10, 6, 'ea', 'Parker', 58, ''],
  ['Hydraulic hose 3/4" × 72" (4-wire)', 'Parts', 'Hydraulics', 5, 4, 'ea', 'Parker', 126, ''],
  ['Wire rope 19 mm hoist (per ft)', 'Parts', 'Crane', 820, 400, 'ft', 'Casar Starlift', 9.4, ''],
  ['Wear pad — outrigger beam', 'Parts', 'Crane', 12, 8, 'ea', 'Liebherr OEM', 210, ''],
  ['Fifth wheel lube plate', 'Parts', 'Truck & trailer', 8, 4, 'ea', 'SAF-Holland', 32, ''],
  // Filters
  ['Oil filter — Cummins X15', 'Filters', 'Engine', 14, 8, 'ea', 'Fleetguard LF9080', 46, ''],
  ['Fuel filter — Cummins X15', 'Filters', 'Fuel', 12, 8, 'ea', 'Fleetguard FF5644', 52, ''],
  ['Air filter — Peterbilt 389', 'Filters', 'Air', 6, 4, 'ea', 'Donaldson P608667', 118, ''],
  ['Oil filter — Liebherr D936', 'Filters', 'Engine', 6, 4, 'ea', 'Liebherr OEM', 74, ''],
  ['Hydraulic return filter element', 'Filters', 'Hydraulic', 5, 4, 'ea', 'Hydac', 165, ''],
  ['Cabin air filter', 'Filters', 'Cab', 10, 4, 'ea', 'Baldwin', 28, ''],
  ['DEF filter', 'Filters', 'Emissions', 4, 4, 'ea', 'Fleetguard', 61, ''],
  // Tires
  ['Steer tire 315/80R22.5', 'Tires', 'Truck', 2, 4, 'ea', 'Michelin X Line', 640, ''],
  ['Drive tire 11R22.5', 'Tires', 'Truck', 6, 4, 'ea', 'Bridgestone M726', 520, ''],
  ['Trailer tire 255/70R22.5', 'Tires', 'Trailer', 8, 6, 'ea', 'Goodyear G316', 410, ''],
  ['Crane tire 445/95R25', 'Tires', 'Crane', 2, 2, 'ea', 'Michelin XCRANE', 4200, ''],
  // Fluids & Oils (chemicals → SDS)
  ['Engine oil 15W-40 (55 gal drum)', 'Fluids & Oils', 'Engine oil', 4, 2, 'drum', 'Shell Rotella T4', 940, 'C', 'rotella'],
  ['Hydraulic fluid AW46 (55 gal)', 'Fluids & Oils', 'Hydraulic', 3, 2, 'drum', 'Mobil DTE 25', 1020, 'C', 'dte'],
  ['DEF (2.5 gal jug)', 'Fluids & Oils', 'DEF', 30, 20, 'jug', 'BlueDEF', 18, 'C', 'def'],
  ['Antifreeze ELC 50/50 (gal)', 'Fluids & Oils', 'Coolant', 24, 12, 'gal', 'Shell Rotella ELC', 19, 'C', 'elc'],
  ['Gear oil 80W-90 (gal)', 'Fluids & Oils', 'Gear oil', 10, 6, 'gal', 'Mobilube HD', 31, 'C', 'gear'],
  ['Multipurpose grease (14 oz)', 'Fluids & Oils', 'Grease', 48, 24, 'tube', 'Mobilgrease XHP 222', 9, 'C', 'grease'],
  // Shop consumables (several chemicals)
  ['Penetrating catalyst (11 oz)', 'Shop Consumables', 'Aerosols', 30, 12, 'can', "B'laster PB", 8, 'C', 'pb'],
  ['Multi-use lubricant (12 oz)', 'Shop Consumables', 'Aerosols', 36, 12, 'can', 'WD-40', 7, 'C', 'wd40'],
  ['Brake parts cleaner (14 oz)', 'Shop Consumables', 'Aerosols', 20, 24, 'can', 'CRC Brakleen', 6, 'C', 'brakleen'],
  ['Marking paint — orange (17 oz)', 'Shop Consumables', 'Paint', 24, 12, 'can', 'Rust-Oleum', 7, 'C', 'paint'],
  ['Oil spill kit 20 gal', 'Shop Consumables', 'Spill', 7, 6, 'kit', 'Brady SPC', 165, ''],
  ['Absorbent pads (bale 100)', 'Shop Consumables', 'Spill', 5, 3, 'bale', 'Brady', 58, ''],
  ['Shop rags (25 lb box)', 'Shop Consumables', 'General', 6, 3, 'box', 'Hospeco', 39, ''],
  ['Nitrile gloves (box 100)', 'Shop Consumables', 'General', 18, 10, 'box', 'Grease Monkey', 14, ''],
  ['Zip ties 14" (bag 100)', 'Shop Consumables', 'General', 25, 10, 'bag', 'Gardner Bender', 9, ''],
  ['Grade 8 bolt assortment', 'Shop Consumables', 'Hardware', 4, 2, 'kit', 'Fastenal', 89, ''],
  // Office
  ['Copy paper (case 10 reams)', 'Office', 'Paper', 6, 4, 'case', 'HammerMill', 52, ''],
  ['Toner — HP 58X', 'Office', 'Printer', 3, 2, 'ea', 'HP', 178, ''],
  ['Ticket books (carbonless, 50)', 'Office', 'Forms', 40, 20, 'book', 'NEBS', 6, ''],
  ['Label stock 2×1 (roll 1,000)', 'Office', 'Labels', 6, 3, 'roll', 'Zebra', 22, ''],
  // Swag
  ['Hat — SLH red/black trucker', 'Swag', 'Hats', 84, 40, 'ea', 'Richardson 112', 11, '', undefined, '🧢'],
  ['Hat — SLH flex-fit charcoal', 'Swag', 'Hats', 46, 24, 'ea', 'Flexfit', 13, '', undefined, '🧢'],
  ['T-shirt — SLH crane logo (L)', 'Swag', 'Shirts', 52, 30, 'ea', 'Bella+Canvas', 9, '', undefined, '👕'],
  ['T-shirt — SLH crane logo (XL)', 'Swag', 'Shirts', 18, 30, 'ea', 'Bella+Canvas', 9, '', undefined, '👕'],
  ['Hoodie — SLH charcoal', 'Swag', 'Shirts', 22, 12, 'ea', 'Independent', 32, '', undefined, '🧥'],
  ['Koozie — "We lift Oklahoma"', 'Swag', 'Koozies', 240, 100, 'ea', '4imprint', 1.6, '', undefined, '🥤'],
  ['Tumbler 30 oz — SLH', 'Swag', 'Drinkware', 36, 20, 'ea', 'YETI', 38, '', undefined, '🥤'],
  ['Die-cast crane model 1:87', 'Swag', 'Models', 6, 4, 'ea', 'Conrad', 145, '', undefined, '🏗️'],
  ['Decal pack — SLH', 'Swag', 'Stickers', 400, 150, 'pk', 'StickerMule', 0.8, '', undefined, '🏷️'],
]
const BLD: Record<T.InvCategory, [string, string]> = { Parts: ['Parts Room', 'PR'], Filters: ['Parts Room', 'PR'], Tires: ['Yard', 'YD'], 'Fluids & Oils': ['Lube Bay', 'LB'], 'Shop Consumables': ['Parts Room', 'PR'], Rigging: ['Rigging Loft', 'RL'], Tools: ['Tool Crib', 'TC'], 'PPE & Safety': ['Tool Crib', 'TC'], Office: ['Office', 'OF'], Swag: ['Office', 'OF'] }
const VEND: Partial<Record<T.InvCategory, string>> = { Rigging: 'ven-10', Tools: 'ven-10', 'PPE & Safety': 'ven-14', Parts: 'ven-2', Filters: 'ven-2', Tires: 'ven-2', 'Fluids & Oils': 'ven-1', 'Shop Consumables': 'ven-2', Office: 'ven-12', Swag: 'ven-13' }
export const SDS_KEY: Record<string, string> = { rotella: 'sds-1', dte: 'sds-2', def: 'sds-3', elc: 'sds-4', grease: 'sds-5', pb: 'sds-6', wd40: 'sds-7', brakleen: 'sds-8', cal: 'sds-9', paint: 'sds-11', gear: 'sds-13' }

export function seedInventory(c: Ctx) {
  const r = rng(8812)
  const { T0, now } = c
  // never in the future: today's afternoon rows are clamped to just before the time the demo was seeded
  const ts = (off: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + off); d.setHours(h, m, 0, 0); return new Date(Math.min(d.getTime(), +new Date(now) - (60 - m) * 60_000)).toISOString() }
  // extra vendors for office/swag
  c.vendors.push({ id: 'ven-12', name: 'Staples Business', category: 'Other', terms: 30, phone: '(405) 555-0722' }, { id: 'ven-13', name: 'Brand Outfitters OKC', category: 'Other', terms: 30, phone: '(405) 555-0723' }, { id: 'ven-14', name: 'Sooner Safety Supply', category: 'Materials', terms: 30, phone: '(405) 555-0724' })
  // purchasing details for the stock vendors (inventory role)
  const VINFO: Record<string, Partial<T.Vendor>> = {
    'ven-10': { kind: 'Rigging supply', contact: 'Mike Dorsey', email: 'orders@oksteelrigging.example', account: 'SLH-4410', leadDays: 3 },
    'ven-2': { kind: 'Truck, trailer & crane parts', contact: 'Parts counter', email: 'parts@redrivertt.example', account: 'C-20931', leadDays: 2 },
    'ven-14': { kind: 'Safety & PPE', contact: 'Angie Fuller', email: 'angie@soonersafety.example', account: 'SLH-OKC', leadDays: 2 },
    'ven-1': { kind: 'Fuel, oil & lube', contact: 'Dispatch desk', email: 'lube@crosstimbersfuel.example', account: '7781', leadDays: 1 },
    'ven-13': { kind: 'Promo swag', contact: 'Kelsey Baird', email: 'kelsey@brandoutfitters.example', account: 'SOUTHERN', leadDays: 10 },
    'ven-12': { kind: 'Office supplies', contact: 'Online', email: 'business@staples.example', account: '1100-882', leadDays: 2 },
  }
  c.vendors.forEach(v => Object.assign(v, VINFO[v.id] ?? {}))
  // a second OKC salesperson (copy of Chris's record shape)
  const chris = c.employees.find(e => e.first === 'Chris' && e.last === 'Ramos')!
  const jess: T.Employee = { ...chris, id: 'emp-sales-2', empNo: 'SLH-9051', first: 'Jess', last: 'Whitaker', phone: '(405) 555-0151', email: 'jess.whitaker@slh-demo.example' }
  c.employees.push(jess)
  // office roles used by the role briefings
  c.employees.push({ ...chris, id: 'emp-fd-1', empNo: 'SLH-9052', first: 'Tammy', last: 'Rhodes', craft: 'Front Desk', phone: '(405) 555-0101', email: 'tammy.rhodes@slh-demo.example', hireDate: '2019-10-14' })
  c.employees.push({ ...chris, id: 'emp-bm-1', empNo: 'SLH-9053', first: 'Wade', last: 'Parker', craft: 'Branch Manager', phone: '(405) 555-0102', email: 'wade.parker@slh-demo.example', hireDate: '2012-03-05' })

  const aisleN: Record<string, number> = {}
  const items: T.InventoryItem[] = ROWS.map(([name, category, sub, onHand, min, unit, manufacturer, cost, flags, extra, icon], i) => {
    const [building, bc] = BLD[category]
    const k = `${bc}-${sub}`; if (!(k in aisleN)) aisleN[k] = Object.keys(aisleN).filter(x => x.startsWith(bc)).length
    const aisle = String.fromCharCode(65 + (aisleN[k] % 6)); const shelf = 1 + (i % 4); const binNo = String(1 + (i % 12)).padStart(2, '0')
    const yardish = category === 'Tires' || sub === 'Mats & cribbing' || sub === 'Spreaders & beams'
    const loc = yardish ? { building: 'Yard', aisle: sub === 'Mats & cribbing' ? 'Mat rack M' : sub === 'Tires' ? 'Tire cage' : 'Beam rack B', shelf: '—', bin: `Row ${1 + (i % 3)}` } : { building, aisle: `Aisle ${aisle}`, shelf: `Shelf ${shelf}`, bin: `Bin ${binNo}` }
    const bin = yardish ? `OKC-YD-${loc.aisle.split(' ').pop()}${1 + (i % 3)}` : `OKC-${bc}-${aisle}${shelf}-B${binNo}`
    const S = flags.includes('S'), R = flags.includes('R'), C = flags.includes('C')
    const rigging = category === 'Rigging' || sub === 'Fall protection' || sub === 'Gas monitors'
    const sku = `SLH-${category.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}-${1000 + i}`
    return {
      id: `itm-${i + 1}`, sku, name, category, sub, onHand, min, reorderQty: Math.max(min, Math.round(min * 1.5)), unit, bin, loc, branchId: 'br-okc', vendorId: VEND[category], manufacturer, cost, serialized: S, returnable: R || S, chemical: C,
      wll: extra && !C ? extra : undefined, sdsId: C && extra ? SDS_KEY[extra] : undefined, icon,
      serialNo: S ? `${manufacturer.split(' ')[0].slice(0, 3).toUpperCase()}-${r.int(10000, 99999)}${onHand > 1 ? ` … +${onHand - 1}` : ''}` : undefined,
      certDate: rigging && (S || category === 'Rigging') ? addDays(T0, -r.int(60, 330)) : undefined,
      inspectionDue: rigging ? addDays(T0, r.int(-6, 80)) : undefined,
      countedAt: addDays(T0, -r.int(3, 70)),
    }
  })
  const by = (n: string) => items.find(i => i.name.startsWith(n))!
  // demo states: one sling tagged out, one chemical missing its SDS
  const chainSling = by('Chain sling'); chainSling.oos = { at: addDays(T0, -2), by: 'Cale Smith', reason: 'Bent link on leg B — failed frequent inspection' }
  const mp = by('Marking paint'); mp.sdsId = undefined // flagged "SDS missing" in Safety
  // a few secondary-branch copies
  const sec: [string, string, number][] = [['Engine oil 15W-40', 'br-mid', 2], ['DEF (2.5', 'br-mid', 14], ['Hard hat', 'br-mid', 12], ['Screw pin shackle', 'br-mid', 20], ['Oil filter — Cummins', 'br-kil', 6], ['Hi-vis vest', 'br-kil', 18], ['Hat — SLH red', 'br-mid', 20], ['Koozie', 'br-kil', 60]]
  sec.forEach(([n, b, q], k) => { const s = by(n); const code = b === 'br-mid' ? 'MID' : 'KIL'; items.push({ ...s, id: `itm-x${k + 1}`, branchId: b, onHand: q, min: Math.ceil(s.min / 3), bin: `${code}-SH-A1-B${String(k + 1).padStart(2, '0')}`, loc: { building: 'Shop', aisle: 'Aisle A', shelf: 'Shelf 1', bin: `Bin ${String(k + 1).padStart(2, '0')}` }, serialNo: undefined }) })

  // ---------- people & targets ----------
  const okc = (e: T.Employee) => e.branchId === 'br-okc' && e.status === 'Active'
  const mech = c.employees.filter(e => e.craft === 'Mechanic' && okc(e))
  const crew = c.employees.filter(e => ['Rigger', 'Operator', 'Oiler', 'Supervisor'].includes(e.craft) && okc(e))
  const drivers = c.employees.filter(e => e.craft === 'Truck Driver' && okc(e))
  const sales = [chris, jess]
  const brian = c.employees.find(e => e.first === 'Brian' && e.last === 'Morris') ?? mech[0]
  const cranes = c.equipment.filter(e => e.category === 'Crane' && e.branchId === 'br-okc')
  const semis = c.equipment.filter(e => (e.category === 'Semi' || e.category === 'Trailer') && e.branchId === 'br-okc')
  const support = c.equipment.filter(e => (e.category === 'Support' || e.category === 'Pickup') && e.branchId === 'br-okc')
  const jobsOn = (d: string) => c.jobs.filter(j => j.branchId === 'br-okc' && j.stage !== 'Quote' && j.stage !== 'Awarded' && j.startDate <= d && j.endDate >= d)
  const custs = c.customers.filter(x => c.jobs.some(j => j.customerId === x.id && j.branchId === 'br-okc'))
  // historical PM work orders so service check-outs have something real to land on
  let woN = Math.max(...c.workOrders.map(w => Number(w.woNo.replace(/\D/g, '')) || 0), 7300)
  const mkWo = (u: T.Equipment, off: number, title: string): T.WorkOrder => { woN++; const w: T.WorkOrder = { id: `wo-${woN}`, woNo: `WO-${woN}`, unitId: u.id, title, complaint: title, priority: 'Normal', techId: r.pick(mech)?.id, status: off < -2 || (/\bPM\b|PM-/.test(title) && c.workOrders.some(x => x.unitId === u.id && x.status !== 'Closed' && /\bPM\b|PM-/.test(x.title))) ? 'Closed' : 'In Progress', opened: addDays(T0, off), due: addDays(T0, off + 2), parts: [], laborHrs: r.int(2, 8), laborRate: 115, source: 'Service Plan' }; c.workOrders.push(w); return w }

  const db = { items, costs: c.costs, workOrders: c.workOrders } as unknown as T.DB
  const checkouts: T.Checkout[] = []; const ledger: T.InvMove[] = []; let n = 0
  const move = (m: Omit<T.InvMove, 'id' | 'byName' | 'branchId' | 'unitCost' | 'by' | 'itemId'> & { item: T.InventoryItem; who: T.Employee }) => { const { item, who, ...rest } = m; ledger.push({ ...rest, id: `mv-${++n}`, itemId: item.id, by: who.id, byName: `${who.first} ${who.last}`, branchId: item.branchId ?? 'br-okc', unitCost: item.cost, bin: item.bin }) }
  const checkout = (off: number, h: number, item: T.InventoryItem, qty: number, who: T.Employee, target: T.InvTarget, reason: string) => {
    if (item.oos && off > -2) return null
    qty = Math.min(qty, item.onHand); if (qty <= 0) return null
    const at = ts(off, h, r.int(0, 59)); const id = `chk-${checkouts.length + 1}`; const d = addDays(T0, off)
    const ret = isReturnable(item); const jobId = target.kind === 'job' ? target.id : undefined
    const co: T.Checkout = { id, itemId: item.id, qty, employeeId: who.id, byName: `${who.first} ${who.last}`, jobId, target, reason, unitCost: item.cost, returnable: ret, at, out: d, due: ret ? addDays(d, r.int(5, 14)) : d }
    checkouts.push(co); item.onHand -= qty
    move({ at, item, who, kind: 'Check-out', qty: -qty, target, jobId, reason, checkoutId: id })
    postInvCost(db, co, qty, d, co.byName!, id)
    return co
  }
  const checkin = (co: T.Checkout, off: number, qty: number, cond: 'Good' | 'Damaged' | 'Used up', who: T.Employee) => {
    const item = items.find(i => i.id === co.itemId)!; const d = addDays(T0, off)
    if (cond === 'Used up') co.usedUp = (co.usedUp ?? 0) + qty
    else {
      co.returnedQty = (co.returnedQty ?? 0) + qty; if (cond === 'Good') item.onHand += qty
      postInvCost(db, co, -qty, d, `${who.first} ${who.last}`, `${co.id}-r${co.returnedQty}`)
      move({ at: ts(off, r.int(14, 17), r.int(0, 59)), item, who, kind: 'Return', qty: cond === 'Good' ? qty : 0, target: co.target, jobId: co.jobId, reason: cond === 'Damaged' ? 'Returned damaged' : r.pick(['Job finished — leftovers back to stock', 'Back from site', 'No longer needed']), checkoutId: co.id, condition: cond })
    }
    if (co.qty - (co.returnedQty ?? 0) - (co.usedUp ?? 0) <= 0) { co.returned = d; co.condition = cond }
  }

  // ---------- 3 weeks of history ----------
  const pick = <X,>(a: X[]) => r.pick(a)
  const cat = (k: T.InvCategory, sub?: string) => items.filter(i => i.branchId === 'br-okc' && i.category === k && (!sub || i.sub === sub))
  for (let off = -21; off <= 0; off++) {
    const d = addDays(T0, off); const dow = new Date(d + 'T12:00').getDay(); if (dow === 0) continue
    const jobs = jobsOn(d)
    // field crews grab rigging / tools / PPE for jobs (returnables come back 2-6 days later)
    for (let k = 0; k < (dow === 6 ? 1 : r.int(3, 5)) && jobs.length; k++) {
      const j = pick(jobs); const it = pick([...cat('Rigging'), ...cat('Tools'), ...cat('PPE & Safety', 'Gas monitors')])
      const who = j.supervisorId ? c.employees.find(e => e.id === j.supervisorId) ?? pick(crew) : pick(crew)
      const co = checkout(off, r.int(5, 7), it, it.serialized ? 1 : r.int(1, it.unit === 'ea' && it.cost < 100 ? 6 : 2), who, { kind: 'job', id: j.id }, r.pick([`Rigging for ${j.name}`, 'Pick plan rigging', 'Site setup', 'Replacement for worn gear on site', 'Mats under outriggers']))
      if (co && off < -1 && r.chance(0.72)) checkin(co, Math.min(0, off + r.int(2, 6)), co.qty, r.chance(0.08) ? 'Damaged' : 'Good', pick([who, brian]))
    }
    // job consumables (marking paint, glasses, tag lines, cribbing, DEF) — mostly used up, some leftovers returned
    for (let k = 0; k < r.int(1, 3) && jobs.length; k++) {
      const j = pick(jobs); const it = pick([by('Marking paint'), by('Safety glasses'), by('Tag line'), by('Cribbing'), by('DEF (2.5'), by('Impact gloves'), by('Multipurpose grease'), by('Ratchet strap')])
      const co = checkout(off, r.int(6, 8), it, r.int(2, 8), pick(crew), { kind: 'job', id: j.id }, r.pick(['Consumables for the job', 'Daily crew supplies', 'Layout marking', 'Blocking for the load']))
      if (co && off < -2) { if (r.chance(0.35)) checkin(co, off + 2, Math.max(1, Math.floor(co.qty / 3)), 'Good', brian); if (r.chance(0.7)) checkin(co, off + 2, co.qty - (co.returnedQty ?? 0), 'Used up', brian) }
    }
    // shop: PM services on semis/trailers and cranes
    if (dow >= 1 && dow <= 5) {
      const truck = pick(semis); const w = mkWo(truck, off, `PM-A service · ${truck.unit}`); const m = pick(mech)
      ;[by('Oil filter — Cummins'), by('Fuel filter — Cummins'), by('Engine oil 15W-40'), by('Multipurpose grease'), by('Glad hand seal')].forEach(it => checkout(off, r.int(8, 11), it, it.unit === 'drum' ? 1 : r.int(1, 2), m, { kind: 'truckService', id: w.id }, `PM-A on ${truck.unit}`))
      if (r.chance(0.45)) { const it = pick([by('Air brake chamber'), by('Brake shoe kit'), by('LED marker light'), by('Mud flap'), by('Drive tire'), by('Trailer tire'), by('Slack adjuster')]); checkout(off, 13, it, r.int(1, 2), m, { kind: 'truckService', id: w.id }, r.pick(['DVIR defect repair', 'Failed DOT pre-trip item', 'Worn — replaced at PM'])) }
      if (r.chance(0.5)) { const cr = pick(cranes); const w2 = mkWo(cr, off, `${r.pick(['250-hr service', 'Hydraulic leak repair', 'Annual prep'])} · ${cr.unit}`); [by('Oil filter — Liebherr'), by('Hydraulic return filter'), by('Hydraulic hose 1/2'), by('Wear pad')].slice(0, r.int(2, 4)).forEach(it => checkout(off, r.int(9, 14), it, 1, pick(mech), { kind: 'craneService', id: w2.id }, w2.title)) }
      if (r.chance(0.25) && support.length) { const u = pick(support); const w3 = mkWo(u, off, `Service · ${u.unit}`); checkout(off, 10, by('Cabin air filter'), 1, pick(mech), { kind: 'equipService', id: w3.id }, w3.title) }
      // grease/fluids straight to a crane (field top-ups)
      if (r.chance(0.6)) { const cr = pick(cranes); checkout(off, r.int(6, 9), pick([by('Multipurpose grease'), by('Gear oil'), by('Antifreeze ELC')]), r.int(1, 4), pick(crew.filter(e => e.craft === 'Operator' || e.craft === 'Oiler')), { kind: 'crane', id: cr.id }, r.pick(['Daily grease points', 'Top-off before mobilizing', 'Slew bearing lube'])) }
      // PPE issued to people
      if (r.chance(0.7)) { const e = pick([...crew, ...drivers]); checkout(off, 6, pick([by('Hard hat'), by('Impact gloves'), by('FR shirt'), by('Hi-vis vest'), by('Safety glasses')]), 1, e, { kind: 'employee', id: e.id }, r.pick(['Replacement — worn out', 'New hire issue', 'Lost on site', 'Size swap'])) }
      // radios issued to people (returnable)
      if (r.chance(0.3)) { const e = pick(crew); const co = checkout(off, 6, by('Two-way radio'), 1, e, { kind: 'employee', id: e.id }, 'Radio for signal person'); if (co && off < -3 && r.chance(0.5)) checkin(co, off + 3, 1, 'Good', e) }
      // sales swag
      if (r.chance(0.55)) { const s = pick(sales); const cu = pick(custs); const it = pick(cat('Swag')); checkout(off, r.int(9, 16), it, it.name.startsWith('Koozie') || it.name.startsWith('Decal') ? r.int(12, 48) : it.cost > 100 ? 1 : r.int(2, 8), s, { kind: 'customer', id: cu.id }, r.pick(['Customer lunch & learn', 'Safety stand-down giveaway', 'Thank-you after job close-out', 'Trade show booth', 'Bid walk — site super', 'Quarterly customer visit'])) }
      // office
      if (r.chance(0.2)) { const e = c.employees.find(x => x.first === 'Lori') ?? brian; checkout(off, 9, pick(cat('Office')), 1, e, { kind: 'employee', id: e.id }, 'Dispatch office supplies') }
    }
  }
  // a recently finished job with leftovers still out → "Return leftovers" prompt
  const done = c.jobs.filter(j => j.branchId === 'br-okc' && (j.status === 'Complete' || j.stage === 'Complete') && j.endDate >= addDays(T0, -12) && j.endDate <= T0).sort((a, b) => b.endDate.localeCompare(a.endDate))[0]
  if (done) {
    const sup = c.employees.find(e => e.id === done.supervisorId) ?? crew[0]
    ;[[by('Crane mat 4 ft'), 6], [by('Bolt-type shackle 1"'), 4], [by('Cribbing'), 20], [by('Marking paint'), 3]].forEach(([it, q]) => checkout(-Math.max(1, Math.min(9, Math.round((Date.parse(T0) - Date.parse(done.startDate)) / 864e5))), 6, it as T.InventoryItem, q as number, sup, { kind: 'job', id: done.id }, `Setup for ${done.name}`))
  }

  // ---------- POs in every state: draft > sent > partially received > received > closed ----------
  const pos: T.PurchaseOrder[] = []
  type PL = [T.InventoryItem, number, number?, number?] // item, ordered, received good, damaged
  const mkPo = (no: number, off: number, vendorId: string, lines: PL[], status: T.PurchaseOrder['status'], o: { jobId?: string; note?: string; bill?: T.VendorBill['status']} = {}) => {
    const v = c.vendors.find(x => x.id === vendorId)
    const po: T.PurchaseOrder = { id: `po-${no}`, poNo: `PO-${no}`, vendorId, branchId: 'br-okc', created: addDays(T0, off), by: `${brian.first} ${brian.last}`, status, jobId: o.jobId, note: o.note,
      sentAt: status === 'Draft' ? undefined : addDays(T0, off), expected: status === 'Draft' ? undefined : addDays(T0, off + (v?.leadDays ?? 3)),
      lines: lines.map(([i, q, rc, dm]) => ({ itemId: i.id, qty: q, received: rc ?? (status === 'Received' || status === 'Closed' ? q : 0), damaged: dm || undefined, cost: i.cost, jobId: o.jobId })) }
    const got = po.lines.filter(l => l.received || l.damaged)
    if (got.length) {
      const rOff = Math.min(0, off + (v?.leadDays ?? 3))
      po.receipts = [{ id: `rcv-${no}`, at: ts(rOff, 10), by: `${brian.first} ${brian.last}`, lines: got.map(l => ({ itemId: l.itemId, qty: l.received, damaged: l.damaged ?? 0 })), note: got.some(l => l.damaged) ? 'Two shackles arrived with cracked pins — set aside for vendor credit' : undefined }]
      got.forEach(l => { const i = items.find(x => x.id === l.itemId)!; if (l.received) { i.onHand += l.received; move({ at: ts(rOff, 10), item: i, who: brian, kind: 'Receive', qty: l.received, poId: po.id, reason: `Received on ${po.poNo}` }) } })
      // the vendor invoices what they shipped (good + damaged) at PO price — AP matches it against PO and receipt
      const inv = got.map(l => ({ itemId: l.itemId, qty: l.received + (l.damaged ?? 0), price: l.cost }))
      const amt = Math.round(inv.reduce((s2, l) => s2 + l.qty * l.price, 0) * 100) / 100
      const st = o.bill ?? (off < -12 ? 'Paid' : 'Approved')
      const billId = `bill-po-${no}`
      c.bills.push({ id: billId, vendorId, billNo: `${(v?.name ?? 'INV').replace(/[^A-Z]/g, '').slice(0, 4)}-${88000 + no}`, date: addDays(T0, rOff), due: addDays(T0, rOff + (v?.terms ?? 30)), branchId: 'br-okc', status: st, paidOn: st === 'Paid' ? addDays(T0, rOff + 8) : undefined, approvedBy: st === 'Approved' || st === 'Paid' ? 'Greg Lindsey' : undefined, poId: po.id, invoiceLines: inv, lines: [{ id: `bl-po-${no}`, category: 'Materials', description: `Stock on ${po.poNo} (${v?.name ?? ''})`, amount: amt }] })
      po.billIds = [billId]
    }
    if (status === 'Closed') po.closedAt = addDays(T0, off + 12)
    pos.push(po)
  }
  const liveJobs = jobsOn(T0)
  const jobPoJob = liveJobs.find(j => j.stage === 'In Progress') ?? liveJobs[0]
  mkPo(4096, -18, 'ven-2', [[by('Oil filter — Cummins'), 24], [by('Fuel filter — Cummins'), 24], [by('Brake parts cleaner'), 24]], 'Closed')
  mkPo(4097, -9, 'ven-13', [[by('Hat — SLH red'), 72], [by('Koozie'), 250]], 'Received')
  mkPo(4098, -1, 'ven-14', [[by('Impact gloves'), 72], [by('Hi-vis vest'), 24], [by('Safety glasses'), 100]], 'Sent')
  mkPo(4099, -5, 'ven-10', [[by('Polyester round sling 20 ft — green'), 8, 8], [by('Bolt-type shackle 1"'), 12, 6, 2], [by('Ratchet strap'), 30, 12]], 'Partially Received', { bill: 'Pending Approval' })
  if (jobPoJob) mkPo(4100, -2, 'ven-10', [[by('Tag line'), 6], [by('Cribbing'), 40]], 'Sent', { jobId: jobPoJob.id, note: `Bought for Job #${jobPoJob.jobNo} — cost goes straight to the job when received` })
  mkPo(4101, 0, 'ven-1', [[by('Engine oil 15W-40'), 2], [by('DEF (2.5'), 24]], 'Draft')
  mkPo(4102, -6, 'ven-1', [[by('Gear oil'), 6], [by('Antifreeze ELC'), 12]], 'Received', { bill: 'Pending Approval' })
  mkPo(4103, 0, 'ven-12', [[by('Copy paper'), 4], [by('Toner — HP 58X'), 2]], 'Draft')

  // ---------- counts, adjustments, write-offs (shrink) ----------
  const adj = (off: number, it: T.InventoryItem, d: number, kind: 'Adjust' | 'Count' | 'Write-off', reason: string) => { if (it.onHand + d < 0) return; it.onHand += d; if (kind === 'Count') it.countedAt = addDays(T0, off); move({ at: ts(off, 15, 30), item: it, who: brian, kind, qty: d, reason }) }
  adj(-15, by('Hat — SLH red'), -6, 'Count', 'Cycle count variance — not signed out (sales event?)')
  adj(-11, by('Safety glasses'), -14, 'Count', 'Cycle count: dispenser left open on counter')
  adj(-8, by('Radio spare battery'), -1, 'Write-off', 'Lost on site — Jones yard, reported by crew')
  adj(-6, by('Multi-use lubricant'), 2, 'Count', 'Found case behind receiving shelf')
  adj(-4, by('Tumbler 30 oz'), -3, 'Adjust', 'Unaccounted — not on any checkout')
  adj(-3, by('Ratchet strap'), -2, 'Write-off', 'Cut on load edge — scrapped')
  adj(-2, by('Two-way radio'), -1, 'Write-off', 'Dropped from boom tip — destroyed')

  // keep a couple of returnables comfortably overdue for the demo
  checkouts.filter(x => x.returnable && !x.returned).slice(0, 3).forEach((x, k) => { x.due = addDays(T0, -1 - k * 2) })
  // last 3 days: consumables still open (live jobs); older ones auto-closed as used up
  checkouts.filter(x => !x.returnable && !x.returned && x.out < addDays(T0, -3) && !(done && x.jobId === done.id)).forEach(x => { x.usedUp = x.qty - (x.returnedQty ?? 0); x.returned = addDays(x.out, 1); x.condition = 'Used up' })
  // stock was replenished by regular weekly orders not modelled line-by-line: top everything back up, then pick a few to be genuinely low
  const LOW = ['Steer tire', 'Air brake chamber', 'T-shirt — SLH crane logo (XL)', 'DEF filter', 'Calibration gas', 'Impact gloves', 'Ratchet strap', 'LED headlight']
  items.filter(i => i.branchId === 'br-okc' && i.onHand <= i.min && !LOW.some(n => i.name.startsWith(n))).forEach(i => { i.onHand = i.min + Math.max(1, Math.ceil(i.min * (0.3 + r.next() * 0.6))) })
  // only a handful of returnables genuinely overdue
  checkouts.filter(x => x.returnable && !x.returned && x.due < T0).slice(3).forEach(x => { x.due = addDays(T0, r.int(1, 9)) })
  // low-stock demo: a few items right at/below reorder point
  ;LOW.slice(0, 5).forEach(nm => { const it = by(nm); it.onHand = Math.min(it.onHand, Math.max(0, it.min - 1)) })
  items.forEach(i => { i.onHand = Math.max(0, Math.round(i.onHand * 10) / 10) })

  // order-up-to (max) for every item; reorder point (min) already set
  items.forEach(i => { i.max = Math.ceil(i.min + (i.reorderQty ?? i.min)) })

  // ---------- parts requests from the field, shop and sales ----------
  const john = c.employees.find(e => e.first === 'John' && e.last === 'Smith') ?? crew[0]
  const robert = c.employees.find(e => e.first === 'Robert' && e.last === 'Adams') ?? mech[0]
  const openWo = c.workOrders.find(w => w.status !== 'Closed' && semis.some(u => u.id === w.unitId)) ?? c.workOrders.find(w => w.status !== 'Closed')
  const woKind = (w?: T.WorkOrder): T.InvTargetKind => { const u = c.equipment.find(e => e.id === w?.unitId); return u?.category === 'Crane' ? 'craneService' : u?.category === 'Semi' || u?.category === 'Trailer' ? 'truckService' : 'equipService' }
  const nm = (e: T.Employee) => `${e.first} ${e.last}`
  const j1 = liveJobs[0], j2 = liveJobs[1] ?? liveJobs[0]
  const partsRequests: T.PartsRequest[] = []
  if (j1) partsRequests.push({ id: 'req-1', no: 'RQ-1201', at: ts(0, 6, 12), byId: john.id, byName: nm(john), from: 'Field', lines: [{ itemId: by('Polyester round sling 20 ft — green').id, qty: 2 }, { itemId: by('Bolt-type shackle 1"').id, qty: 4 }], target: { kind: 'job', id: j1.id }, reason: 'Second pick point for the tailing crane', needBy: T0, status: 'Waiting' })
  if (openWo) partsRequests.push({ id: 'req-2', no: 'RQ-1202', at: ts(0, 7, 40), byId: robert.id, byName: nm(robert), from: 'Shop', lines: [{ itemId: by('Oil filter — Cummins').id, qty: 2 }, { itemId: by('Fuel filter — Cummins').id, qty: 2 }], target: { kind: woKind(openWo), id: openWo.id }, reason: `PM service on ${openWo.woNo}`, needBy: addDays(T0, 1), status: 'Waiting' })
  if (custs[0]) partsRequests.push({ id: 'req-3', no: 'RQ-1203', at: ts(-1, 15, 5), byId: chris.id, byName: nm(chris), from: 'Sales', lines: [{ itemId: by('Koozie').id, qty: 48 }, { itemId: by('Hat — SLH red').id, qty: 6 }], target: { kind: 'customer', id: custs[0].id }, reason: 'Lunch & learn at their yard Thursday', needBy: addDays(T0, 2), status: 'Waiting' })
  const cw = crew[2] ?? crew[0]
  partsRequests.push({ id: 'req-4', no: 'RQ-1200', at: ts(-1, 16, 30), byId: cw.id, byName: nm(cw), from: 'Field', lines: [{ itemId: by('Radio spare battery').id, qty: 2 }], target: { kind: 'employee', id: cw.id }, reason: 'Batteries won’t hold a charge past noon', needBy: T0, status: 'Approved', decidedBy: nm(brian), decidedAt: ts(-1, 17) })
  const cw2 = crew[3] ?? crew[0]
  if (j2) partsRequests.push({ id: 'req-5', no: 'RQ-1199', at: ts(-2, 6, 5), byId: cw2.id, byName: nm(cw2), from: 'Field', lines: [{ itemId: by('Hi-vis vest').id, qty: 2 }], target: { kind: 'job', id: j2.id }, reason: 'Customer requires Class 2 on site', needBy: addDays(T0, -2), status: 'Checked out', decidedBy: nm(brian), decidedAt: ts(-2, 6, 30) })

  // ---------- cycle counts: one shelf a week ----------
  const shelf = (i: T.InventoryItem) => i.bin.replace(/-B\d+$/, '')
  const onShelf = (sh: string) => items.filter(i => i.branchId === 'br-okc' && shelf(i) === sh)
  const lbl = (i: T.InventoryItem) => i.loc ? `${i.loc.building} · ${i.loc.aisle} · ${i.loc.shelf}` : i.bin
  const doneCount = (id: string, off: number, it: T.InventoryItem, varItem: string, d: number, reason: string): T.CycleCount => ({ id, shelf: shelf(it), label: lbl(it), due: addDays(T0, off), status: 'Done', countedBy: nm(brian), countedAt: ts(off, 15, 30), lines: onShelf(shelf(it)).map(x => ({ itemId: x.id, expected: x.name.startsWith(varItem) ? x.onHand - d : x.onHand, counted: x.onHand, reason: x.name.startsWith(varItem) ? reason : undefined, unitCost: x.cost })) })
  const cycleCounts: T.CycleCount[] = [
    { id: 'cc-3', shelf: shelf(by('Bolt-type shackle 1"')), label: lbl(by('Bolt-type shackle 1"')), due: addDays(T0, 2), status: 'Due' },
    doneCount('cc-2', -6, by('Multi-use lubricant'), 'Multi-use lubricant', 2, 'Found stock (wrong bin or behind shelf)'),
    doneCount('cc-1', -11, by('Safety glasses'), 'Safety glasses', -14, 'Not checked out (taken without scanning)'),
  ]

  return { items, checkouts: checkouts.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')), invLedger: ledger.sort((a, b) => b.at.localeCompare(a.at)), pos: pos.reverse(), partsRequests, cycleCounts }
}

/** Extra SDS fields (pictograms, storage, sample PDF). One sheet is deliberately >3 years old for the demo flag. */
export function enrichSds(sds: T.Sds[], T0: string) {
  const pict: Record<string, string[]> = { 'sds-1': [], 'sds-2': [], 'sds-3': [], 'sds-4': ['health', 'exclamation'], 'sds-5': [], 'sds-6': ['flame', 'exclamation', 'health'], 'sds-7': ['flame', 'health'], 'sds-8': ['flame', 'exclamation', 'health', 'environment'], 'sds-9': ['gas', 'skull', 'flame'], 'sds-10': ['flame', 'health', 'exclamation', 'environment'], 'sds-11': ['flame', 'exclamation'], 'sds-12': ['flame', 'gas'] }
  const store: Record<string, string> = { 'sds-1': 'Lube Bay · drum rack, secondary containment', 'sds-2': 'Lube Bay · drum rack, secondary containment', 'sds-3': 'Parts Room · away from heat', 'sds-4': 'Lube Bay · closed container', 'sds-6': 'Flammable cabinet FC-1', 'sds-7': 'Flammable cabinet FC-1', 'sds-8': 'Flammable cabinet FC-1', 'sds-9': 'Tool Crib · cylinder rack, chained', 'sds-10': 'Fuel island · bulk tank', 'sds-11': 'Flammable cabinet FC-1', 'sds-12': 'Propane cage outside shop' }
  sds.forEach(s => { s.pictograms = pict[s.id] ?? []; s.storage = store[s.id] ?? 'Shop'; s.pdf = `sds/${s.id}.pdf`; s.pdfName = `${s.product}.pdf`; s.spill = s.signal === 'Danger' ? 'Eliminate ignition sources. Ventilate. Contain with absorbent pads from the spill kit; bag and tag as hazardous waste. Keep out of drains.' : 'Stop the leak if safe. Contain with absorbent pads or spill kit; sweep up and dispose per local rules. Keep out of drains and waterways.' })
  const expired = sds.find(s => s.id === 'sds-5'); if (expired) expired.revised = addDays(T0, -365 * 3 - 140)
  sds.push({ id: 'sds-13', product: 'Mobilube HD 80W-90 Gear Oil', manufacturer: 'Mobil', use: 'Swing drives, axles, winch gearboxes', signal: 'None', hazards: ['Not classified as hazardous', 'Used oil may contain harmful impurities'], ppe: ['Nitrile gloves', 'Safety glasses'], firstAid: 'Skin: wash with soap and water. Eyes: flush 15 min. Ingestion: do not induce vomiting; get medical advice.', spill: 'Contain with absorbent pads; keep out of drains.', revised: addDays(T0, -420), pictograms: [], storage: 'Lube Bay · closed container', pdf: 'sds/sds-13.pdf', pdfName: 'Mobilube HD 80W-90.pdf' })
}
