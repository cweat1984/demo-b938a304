import type { RigPlan } from './types'
// Deterministic DEMO data generator. Everything here is fictional demo data.
import type * as T from './types'
import { rng, today, addDays, range, diffDays, hoursBetween, between } from '../lib/util'
import { WIND_DEMO } from './wind/demo'
import { seedInventory, enrichSds } from './seedInventory'
import { seedRecon } from './seedRecon'
import { seedMyInfo, seedCertShares } from './seedMyInfo'

import { byIdS, DB_VERSION, BURDEN, PER_DIEM_RATES, TRAILER_DAY_COST, DVIR_ITEMS, DIVISIONS, BRANCHES, SITES, CUSTOMERS, CONTACT_NAMES, CRANES, DOWN_CRANES, FLEET, FIRST, LAST, LOCALS, emailFor, distMiles, requiredPositions } from './seedBase'
import type { SiteRow } from './seedBase'
export { DB_VERSION, BURDEN, PER_DIEM_RATES, TRAILER_DAY_COST, DVIR_ITEMS, DIVISIONS, BRANCHES, emailFor, distMiles, requiredPositions } from './seedBase'
/** Main build: the full seed is generated locally, nothing extra to unlock (the guest-only build swaps this module). */
export async function fullSeed(_k?: string): Promise<T.DB | null> { return null }
export function seed(): T.DB {
  const r = rng(20261011)
  const T0 = today()
  const now = new Date()
  const ts = (dayOffset: number, h: number, m = 0) => { const d = new Date(now); d.setDate(d.getDate() + dayOffset); d.setHours(h, m, 0, 0); return d.toISOString() }
  const br = (id: string) => BRANCHES.find(b => b.id === id)!

  // ---------- sites & customers ----------
  const sites: T.Site[] = SITES.map(([name, city, state, lat, lng], i) => ({
    id: `site-${i + 1}`, name, city, state, lat, lng,
    gate: `Gate ${r.pick(['A', 'B', 'C', '2', '4'])} — check in with security`,
    hospital: `${city} Regional Medical Center`,
  }))
  const siteBranch = (s: T.Site) => SITES[Number(s.id.split('-')[1]) - 1][5]
  const siteType = (s: T.Site) => SITES[Number(s.id.split('-')[1]) - 1][6]
  const customers: T.Customer[] = CUSTOMERS.map(([name, industry, , , ac], i) => ({
    id: `cus-${i + 1}`, name, industry, contact: CONTACT_NAMES[i], phone: `(${ac}) 555-01${String(60 + i).padStart(2, '0')}`,
  }))
  const regionOf = (s?: T.Site) => !s ? 'ok' : siteBranch(s) === 'br-mid' ? 'mid' : siteBranch(s) === 'br-kil' ? 'kil' : s.state === 'TX' ? 'ntx' : 'ok'
  /** Customers only work where they plausibly are: match job type AND the site's region. */
  const customerFor = (t: T.JobType, site?: T.Site) => {
    const all = CUSTOMERS.map((x, i) => [x, i] as const).filter(([x]) => x[2].includes(t))
    const local = all.filter(([x]) => x[3].includes(regionOf(site)))
    return customers[r.pick(local.length ? local : all)[1]]
  }

  // ---------- equipment ----------
  const equipment: T.Equipment[] = []
  CRANES.forEach(([unit, code, make, model, type, cap, b], i) => {
    const B = br(b)
    const dayRate = Math.round((cap * (type === 'Crawler' ? 25 : 22) + 2200) / 100) * 100
    const hours = r.int(1800, 14500)
    equipment.push({
      id: `eq-c${unit}`, unit, code, category: 'Crane', type, make, model, year: r.int(2014, 2025), capacity: cap,
      serial: `${make.slice(0, 2).toUpperCase()}${r.int(100000, 999999)}`, status: DOWN_CRANES[unit] ?? 'Available', yard: B.code,
      lat: B.lat + (r.next() - 0.5) * 0.01, lng: B.lng + (r.next() - 0.5) * 0.01, lastPing: new Date(now.getTime() - r.int(1, 9) * 60000).toISOString(),
      samsaraId: `SAM-${r.int(281000, 289999)}`, hours, nextServiceAt: hours + r.int(60, 450), nextServiceDate: addDays(T0, r.int(5, 70)),
      dayRate, costDay: Math.round(dayRate * r.int(33, 39) / 100), annualInspection: addDays(T0, r.int(-20, 340)),
      divisionId: 'div-slh', branchId: b,
      notes: i === 0 ? 'Permanent crew: John Smith (Operator), Mike Jones (Rigger).' : undefined,
    })
  })
  FLEET.forEach(([unit, code, category, type, make, model, year, b, d]) => {
    const B = br(b)
    const miles = category === 'Semi' ? r.int(60000, 620000) : category === 'Pickup' ? r.int(8000, 140000) : 0
    const hours = category === 'Support' ? r.int(300, 6000) : undefined
    equipment.push({
      id: `eq-${unit.toLowerCase()}`, unit, code, category, type, make, model, year, status: 'Available', yard: B.code,
      vin: category === 'Semi' || category === 'Pickup' || category === 'Trailer' ? `1XP${r.int(1000000, 9999999)}${r.pick(['K', 'L', 'M', 'N'])}${r.int(100000, 999999)}` : undefined,
      serial: category === 'Support' ? `SN${r.int(1000000, 9999999)}` : undefined,
      plate: category !== 'Support' ? `${B.state}-${r.int(100, 999)}${r.pick(['AB', 'HX', 'TR', 'SL'])}` : undefined,
      lat: B.lat + (r.next() - 0.5) * 0.012, lng: B.lng + (r.next() - 0.5) * 0.012, lastPing: new Date(now.getTime() - r.int(1, 14) * 60000).toISOString(),
      samsaraId: category === 'Trailer' && r.chance(0.3) ? undefined : `SAM-${r.int(281000, 289999)}`,
      miles: miles || undefined, hours, nextServiceAt: miles ? miles + r.int(2600, 9000) : hours ? hours + r.int(80, 300) : undefined,
      nextServiceDate: addDays(T0, r.int(8, 75)), annualInspection: addDays(T0, r.int(-10, 330)),
      costMile: category === 'Semi' ? 1.18 + r.int(0, 30) / 100 : category === 'Pickup' ? 0.42 : undefined,
      costDay: category === 'Trailer' ? TRAILER_DAY_COST : category === 'Support' ? r.int(120, 650) : category === 'Semi' ? 310 : 95,
      dayRate: category === 'Support' ? r.int(250, 1400) : category === 'Semi' ? 1950 : undefined,
      divisionId: d, branchId: b,
    })
  })
  const eq = (unit: string) => equipment.find(e => e.unit === unit)!
  eq('TR-411').lastPing = new Date(now.getTime() - 7 * 3600000).toISOString()
  eq('58').lastPing = new Date(now.getTime() - 20 * 3600000).toISOString()
  // Shop looks on top of it: 2 units past interval, a handful due this week
  eq('T-201').nextServiceAt = (eq('T-201').miles ?? 0) - 340; eq('41').nextServiceDate = addDays(T0, -2)
  ;['36', 'T-203', 'P-302', '54'].forEach((u, i) => { eq(u).nextServiceDate = addDays(T0, 1 + i) })
  const trailers = equipment.filter(e => e.category === 'Trailer')

  // ---------- crane configurations: real load lists (company trailers + third-party haulers) ----------
  const configs: T.CraneConfig[] = []
  const brTrailers = (b: string) => trailers.filter(t => t.branchId === b)
  const prefer = (b: string, types: RegExp[]) => types.map(rx => brTrailers(b).find(t => rx.test(t.type))?.id).filter((x, i, a): x is string => !!x && a.indexOf(x) === i)
  equipment.filter(e => e.category === 'Crane').forEach(c => {
    const cap = c.capacity ?? 0
    const crawler = c.type === 'Crawler'
    if (!crawler && cap < 150) return // self-contained taxi cranes travel on their own carrier
    if (crawler) {
      const cw = Math.round(cap / 80), boom = Math.round(cap / 140) + 1
      const base = [{ kind: 'Counterweight', n: cw }, { kind: 'Crawler tracks', n: 2 }, { kind: 'Carbody / upper', n: 1 }, { kind: 'Boom sections', n: boom }, { kind: 'Hook blocks & rigging', n: 1 }, { kind: 'Crane mats', n: 1 }]
      const own = prefer(c.branchId, [/Counterweight/, /9-Axle|120T/, /110T|55T/, /Stepdeck/])
      configs.push({ id: `cfg-${c.unit}-1`, craneId: c.id, name: 'Main boom', trailerIds: own, loads: base })
      configs.push({ id: `cfg-${c.unit}-2`, craneId: c.id, name: 'Main boom + luffing jib', trailerIds: own, loads: [...base, { kind: 'Luffing jib', n: 3 }, { kind: 'Counterweight', n: 1 }] })
      if (cap >= 500) configs.push({ id: `cfg-${c.unit}-3`, craneId: c.id, name: 'Wind package (luffer + superlift)', trailerIds: [...own, ...prefer(c.branchId, [/Boom Dolly/])], loads: [...base, { kind: 'Luffing jib', n: 3 }, { kind: 'Superlift counterweight', n: 2 }], notes: 'Copied from Main boom + luffing jib and expanded for turbine erection.' })
    } else {
      const cw = Math.max(1, Math.round(cap / (cap >= 300 ? 110 : 120)))
      const own = prefer(c.branchId, cap >= 300 ? [/Counterweight/, /Stepdeck/] : [/Stepdeck/])
      const base = [{ kind: 'Counterweight', n: cw }, { kind: 'Crane mats & outrigger pads', n: 1 }]
      configs.push({ id: `cfg-${c.unit}-1`, craneId: c.id, name: 'Main boom — partial counterweight', trailerIds: own.slice(0, 1), loads: [{ kind: 'Counterweight', n: Math.max(1, cw - 1) }, { kind: 'Crane mats & outrigger pads', n: 1 }] })
      configs.push({ id: `cfg-${c.unit}-2`, craneId: c.id, name: cap >= 300 ? 'Full counterweight + luffing jib' : 'Full counterweight + jib', trailerIds: own, loads: [...base, { kind: cap >= 300 ? 'Luffing jib & Y-guying' : 'Swing-away jib', n: cap >= 500 ? 3 : 1 }] })
    }
  })
  configs.forEach(c => { if (!c.loads) return; const m = new Map<string, number>(); c.loads.forEach(l => m.set(l.kind, (m.get(l.kind) ?? 0) + l.n)); c.loads = [...m].map(([kind, n]) => ({ kind, n })) })
  const totalLoads = (c?: T.CraneConfig) => c?.loads?.reduce((s, l) => s + l.n, 0) ?? c?.trailerIds.length ?? 0
  void totalLoads

  // ---------- employees ----------
  const employees: T.Employee[] = []
  let empSeq = 1001
  const used = new Set<string>()
  const RATE: Record<string, [number, number]> = { Operator: [38, 47], Rigger: [26, 33], Oiler: [27, 31], 'Truck Driver': [29, 35], Supervisor: [44, 52], Safety: [36, 42], Mechanic: [34, 42], 'Uptower Tech': [30, 37], Millwright: [32, 39] }
  const mk = (first: string, last: string, craft: T.Craft, b: string, d: string, extra: Partial<T.Employee> = {}): T.Employee => {
    used.add(first + last)
    const rr = RATE[craft] ?? [28, 55]
    const ac = AREA[b] ?? '405'
    const e: T.Employee = {
      id: `emp-${empSeq}`, empNo: `SLH-${empSeq++}`, first, last, craft, phone: `(${ac}) 555-${r.int(2000, 2999)}`,
      email: emailFor(first, last), status: 'Active', perDiemBlocked: [], hireDate: addDays(T0, -r.int(120, 4200)), city: br(b).city,
      local: ['Operator', 'Rigger', 'Oiler'].includes(craft) ? r.pick(LOCALS) : undefined, rate: r.int(rr[0], rr[1]),
      shirt: r.pick(['M', 'L', 'XL', '2XL', '3XL']), boot: String(r.int(8, 13)), divisionId: d, branchId: b,
      emergencyContact: { name: `${r.pick(['Sarah', 'Amanda', 'Linda', 'Maria', 'Beth', 'Rachel', 'Tom', 'Dale'])} ${last}`, relation: r.pick(['Spouse', 'Parent', 'Sibling']), phone: `(${ac}) 555-${r.int(3000, 3999)}` },
      address: `${r.int(100, 9999)} ${r.pick(['NW 23rd St', 'SE 44th St', 'N Western Ave', 'Oak Ridge Dr', 'County Rd 1220', 'Main St', 'Pine Hollow Ln'])}, ${br(b).city}, ${br(b).state}`,
      ...extra,
    }
    employees.push(e)
    return e
  }
  const AREA: Record<string, string> = { 'br-okc': '405', 'br-mid': '432', 'br-kil': '903' }
  const randName = () => { for (;;) { const f = r.pick(FIRST), l = r.pick(LAST); if (!used.has(f + l)) return [f, l] as const } }

  const chad = mk('Chad', 'Weathers', 'Field Ops Manager', 'br-okc', 'div-slh', { phone: '(405) 555-0160' })
  mk('Lori', 'Haynes', 'Dispatcher', 'br-okc', 'div-slh', { phone: '(405) 555-0100' })
  mk('Travis', 'Cole', 'Dispatcher', 'br-mid', 'div-slh', { phone: '(432) 555-0100' })
  mk('Ben', 'Harper', 'Project Manager', 'br-okc', 'div-slh')
  mk('Megan', 'Price', 'Project Manager', 'br-kil', 'div-smm')
  mk('Dana', 'Whitfield', 'HR', 'br-okc', 'div-slh', { phone: '(405) 555-0110' })
  mk('Karen', 'Ortiz', 'Payroll', 'br-okc', 'div-slh', { phone: '(405) 555-0140' })
  mk('Greg', 'Lindsey', 'Accounting', 'br-okc', 'div-slh', { phone: '(405) 555-0145' })
  const chrisR = mk('Chris', 'Ramos', 'Sales', 'br-okc', 'div-slh', { phone: '(405) 555-0150' })
  const tylerB = mk('Tyler', 'Brooks', 'Sales', 'br-mid', 'div-slh', { phone: '(432) 555-0150' })
  mk('Brian', 'Morris', 'Inventory', 'br-okc', 'div-slh', { phone: '(405) 555-0125' })
  const robert = mk('Robert', 'Adams', 'Mechanic', 'br-okc', 'div-slh', { phone: '(405) 555-0120' })
  const adam = mk('Adam', 'Webb', 'Mechanic', 'br-okc', 'div-slh', { phone: '(405) 555-0121' })
  const luis = mk('Luis', 'Ortega', 'Mechanic', 'br-mid', 'div-slh')
  const jake = mk('Jake', 'Dalton', 'Mechanic', 'br-kil', 'div-slh')
  const cale = mk('Cale', 'Smith', 'Safety', 'br-okc', 'div-slh', { phone: '(405) 555-0130' })
  mk('Chris', 'White', 'Safety', 'br-okc', 'div-slh')
  mk('Rosa', 'Delgado', 'Safety', 'br-mid', 'div-slh')
  const mechanics = [robert, adam, luis, jake]

  const supOKC = [mk('David', 'Miller', 'Supervisor', 'br-okc', 'div-slh'), mk(...randName(), 'Supervisor', 'br-okc', 'div-slh'), mk(...randName(), 'Supervisor', 'br-okc', 'div-slh'), mk(...randName(), 'Supervisor', 'br-okc', 'div-slh')]
  const supMID = [mk(...randName(), 'Supervisor', 'br-mid', 'div-slh')]
  const supKIL = [mk(...randName(), 'Supervisor', 'br-kil', 'div-slh')]
  const supSUP = mk(...randName(), 'Supervisor', 'br-okc', 'div-sup')
  const supSMM = mk(...randName(), 'Supervisor', 'br-kil', 'div-smm')
  const supsFor = (b: string) => (b === 'br-mid' ? supMID : b === 'br-kil' ? supKIL : supOKC)

  const cranes = equipment.filter(e => e.category === 'Crane')
  cranes.forEach((c, i) => {
    const nm = i === 0 ? (['John', 'Smith'] as const) : randName()
    mk(nm[0], nm[1], 'Operator', c.branchId, 'div-slh', { homeCraneId: c.id, supervisorId: r.pick(supsFor(c.branchId)).id })
  })
  const rigCranes = r.shuffle(cranes.filter(c => !DOWN_CRANES[c.unit] && c.id !== cranes[0].id))
  for (let i = 0; i < 32; i++) {
    const nm = i === 0 ? (['Mike', 'Jones'] as const) : randName()
    const hall = i >= 27
    const home = i === 0 ? cranes[0] : !hall ? rigCranes[(i - 1) % rigCranes.length] : undefined
    const b = home?.branchId ?? r.pick(['br-okc', 'br-okc', 'br-okc', 'br-mid', 'br-kil'])
    mk(nm[0], nm[1], 'Rigger', b, 'div-slh', { homeCraneId: home?.id, hallHand: hall, supervisorId: hall ? undefined : r.pick(supsFor(b)).id })
  }
  ;['28', '59', '70', '80', '84'].forEach(u => { const c = eq(u); mk(...randName(), 'Oiler', c.branchId, 'div-slh', { homeCraneId: c.id, supervisorId: r.pick(supsFor(c.branchId)).id }) })
  mk(...randName(), 'Oiler', 'br-okc', 'div-slh', { hallHand: true })
  const semis = equipment.filter(e => e.category === 'Semi')
  semis.forEach((s, i) => {
    const nm = i === 0 ? (['Steve', 'Brown'] as const) : randName()
    const d = mk(nm[0], nm[1], 'Truck Driver', s.branchId, 'div-str', { homeTruckId: s.id, supervisorId: r.pick(supsFor(s.branchId)).id })
    s.assignedTo = d.id
  })
  for (let i = 0; i < 3; i++) mk(...randName(), 'Truck Driver', 'br-okc', 'div-str', { supervisorId: supOKC[2].id })
  for (let i = 0; i < 7; i++) mk(...randName(), 'Uptower Tech', 'br-okc', 'div-sup', { supervisorId: supSUP.id })
  for (let i = 0; i < 6; i++) mk(...randName(), 'Millwright', 'br-kil', 'div-smm', { supervisorId: supSMM.id })
  const pick = (u: string, emp: T.Employee) => { eq(u).assignedTo = emp.id; emp.pickupId = eq(u).id }
  pick('P-302', supOKC[0]); pick('P-303', supMID[0]); pick('P-304', supSMM); pick('P-301', supSUP); pick('P-305', chad)
  // Supervisor teams: max 15 each (David Miller sits exactly at the cap so it's visible); overflow goes to the unallocated pool
  ;(['br-okc', 'br-mid', 'br-kil'] as const).forEach(b => {
    const sups = supsFor(b)
    const team = employees.filter(e => e.supervisorId && sups.some(x => x.id === e.supervisorId))
    const caps = sups.map((_, i) => (i === 0 ? 15 : 12 - i))
    const counts = sups.map(() => 0)
    team.forEach(e => { let k = 0; while (k < sups.length && counts[k] >= caps[k]) k++; if (k < sups.length) { e.supervisorId = sups[k].id; counts[k]++ } else e.supervisorId = undefined })
  })
  const john = employees.find(e => e.first === 'John' && e.last === 'Smith')!
  const mike = employees.find(e => e.first === 'Mike' && e.last === 'Jones')!
  const steve = employees.find(e => e.first === 'Steve' && e.last === 'Brown')!
  john.phone = '(405) 555-2200'
  employees.filter(e => e.craft === 'Rigger').slice(18, 22).forEach(e => e.perDiemBlocked = ['Daily Truck', 'Semi Truck'])
  employees.filter(e => e.craft === 'Operator').forEach(e => e.perDiemBlocked = ['Semi Truck'])
  // Veterans (company honors service) — deterministic ~15%
  const BRANCHES_SVC: T.ServiceBranch[] = ['Army', 'Marine Corps', 'Navy', 'Air Force', 'National Guard', 'Coast Guard', 'Army', 'Marine Corps']
  employees.forEach((e, i) => { if (i % 7 === 3) e.veteran = { branch: BRANCHES_SVC[(i / 7 | 0) % BRANCHES_SVC.length], years: 3 + (i % 9) } })
  mike.veteran = { branch: 'Marine Corps', years: 8 }

  const field = employees.filter(e => ['Operator', 'Rigger', 'Oiler', 'Truck Driver', 'Supervisor', 'Uptower Tech', 'Millwright', 'Safety'].includes(e.craft))

  // ---------- certifications ----------
  const certs: T.Cert[] = []
  let certN = 0
  const exp = () => { const x = r.next(); return x < 0.006 ? addDays(T0, -r.int(1, 60)) : x < 0.035 ? addDays(T0, r.int(2, 30)) : x < 0.16 ? addDays(T0, r.int(31, 60)) : x < 0.22 ? addDays(T0, r.int(61, 90)) : addDays(T0, r.int(91, 1100)) }
  const PROV: Partial<Record<T.CertType, string>> = { 'OSHA 10': 'ClickSafety', 'OSHA 30': 'ClickSafety', 'CPR / First Aid': 'American Red Cross', 'Tower Rescue': 'ENSA North America', Forklift: 'Southern Safety Dept.', 'NCCCO Mobile Operator': 'NCCCO', 'NCCCO Crawler Operator': 'NCCCO', 'NCCCO Rigger II': 'NCCCO', 'NCCCO Signalperson': 'NCCCO', 'H2S Awareness': 'PEC Safety', 'Smith Driving': 'Smith System', 'CDL Class A': 'State DPS', 'DOT Medical Card': 'Concentra', TWIC: 'TSA' }
  const add = (e: T.Employee, type: T.CertType, expires?: string) => {
    const ex = expires ?? exp()
    certs.push({ id: `cert-${++certN}`, employeeId: e.id, type, credentialNo: `${type.replace(/[^A-Z0-9]/gi, '').slice(0, 4).toUpperCase()}-${r.int(100000, 999999)}`, provider: PROV[type] ?? 'Provider', issued: addDays(ex, -r.int(365, 1460)), expires: ex, verified: r.chance(0.9) ? 'Verified' : 'Needs Review' })
  }
  field.forEach(e => {
    add(e, e.craft === 'Supervisor' || e.craft === 'Safety' ? 'OSHA 30' : 'OSHA 10', addDays(T0, r.int(60, 1500)))
    if (r.chance(0.94) || e.craft === 'Uptower Tech') add(e, 'CPR / First Aid')
    if (r.chance(0.9)) add(e, 'H2S Awareness')
    if (e.craft === 'Truck Driver' || r.chance(0.55)) add(e, 'Smith Driving')
    if (e.craft === 'Operator') { add(e, 'NCCCO Mobile Operator', addDays(T0, r.int(40, 1600))); if (cranes.find(c => c.id === e.homeCraneId)?.type === 'Crawler' || r.chance(0.35)) add(e, 'NCCCO Crawler Operator', addDays(T0, r.int(40, 1600))) }
    if (e.craft === 'Rigger' || e.craft === 'Millwright') { if (r.chance(0.75)) add(e, 'NCCCO Rigger II'); if (r.chance(0.6)) add(e, 'NCCCO Signalperson'); if (r.chance(0.5)) add(e, 'Forklift') }
    if (e.craft === 'Truck Driver') { add(e, 'CDL Class A', addDays(T0, r.int(200, 1500))); add(e, 'DOT Medical Card') }
    if (e.craft === 'Uptower Tech' || (e.craft === 'Rigger' && r.chance(0.3))) add(e, 'Tower Rescue')
  })
  certs.filter(c => c.employeeId === john.id).forEach(c => { if (c.expires < addDays(T0, 95)) c.expires = addDays(T0, r.int(200, 700)) })
  if (!certs.some(c => c.employeeId === john.id && c.type === 'Smith Driving')) add(john, 'Smith Driving')
  certs.filter(c => c.employeeId === john.id && c.type === 'Smith Driving').forEach(c => c.expires = addDays(T0, 24))
  ;[john, mike].forEach(e => { if (!certs.some(c => c.employeeId === e.id && c.type === 'CPR / First Aid')) add(e, 'CPR / First Aid', addDays(T0, 400)) })
  certs.filter(c => c.employeeId === mike.id).forEach(c => { if (c.expires < T0) c.expires = addDays(T0, 300) })

  employees.filter(e => e.hallHand).slice(0, 2).forEach((e, i) => { const c = certs.find(x => x.employeeId === e.id && x.type !== 'OSHA 10' && x.type !== 'OSHA 30'); if (c) c.expires = addDays(T0, -(6 + i * 9)) })
  const certOk = (e: T.Employee, list: T.CertType[], date: string) => list.every(t => certs.some(c => c.employeeId === e.id && (c.type === t || (t === 'OSHA 10' && c.type === 'OSHA 30')) && c.expires >= date))

  // ---------- absences ----------
  const absences: T.Absence[] = []
  let absN = 0
  const kinds: T.AbsenceKind[] = ['Scheduled Off', 'Vacation / PTO', 'Training', 'Unavailable']
  r.shuffle(field.filter(e => e !== john && e !== mike && e !== steve && e.craft !== 'Safety')).slice(0, 16).forEach((e, i) => {
    const from = i < 6 ? addDays(T0, -r.int(0, 2)) : addDays(T0, r.int(-12, 18))
    absences.push({ id: `abs-${++absN}`, employeeId: e.id, from, to: addDays(from, r.int(i < 6 ? 2 : 0, 4)), kind: kinds[i % 4], note: i % 4 === 2 ? 'NCCCO recert class' : undefined })
  })
  const absentOn = (id: string, d: string) => absences.find(a => a.employeeId === id && between(d, a.from, a.to))

  // ---------- jobs ----------
  const jobs: T.Job[] = []
  const pms = employees.filter(e => e.craft === 'Project Manager')
  const sitesFor = (b: string) => sites.filter(s => siteBranch(s) === b)
  const jobName: Record<T.JobType, string[]> = {
    Wind: ['Turbine main component exchange', 'Gearbox change-out', 'Blade replacement', 'Repower — nacelle sets', 'Rotor removal'],
    Refinery: ['Turnaround — exchanger bundle pulls', 'Column section set', 'Coker drum support', 'Reactor head lift'],
    Power: ['Transformer set', 'Turbine outage support', 'Boiler steel erection', 'Substation reactor set'],
    Commercial: ['Steel erection', 'Rooftop HVAC picks', 'Precast panel set', 'Generator & chiller set'],
    Industrial: ['Plant equipment install', 'Tank set', 'Conveyor gallery set', 'Press installation'],
    'Oil & Gas': ['Compressor skid set', 'Pipe rack modules', 'Separator vessel set', 'Frac tank lifts'],
    Infrastructure: ['Bridge girder set'],
    'Heavy Haul': ['Transformer haul', 'Crane component move', 'Vessel transport', 'Oversize skid haul'],
    Uptower: ['Uptower bolt torque campaign', 'Blade inspection & repair', 'Yaw system service', 'Main bearing inspection'],
    'Machine Moving': ['Production line relocation', 'CNC machine rigging', 'Press relocation', 'Paper machine roll change'],
  }
  const SMALL_NAMES: Partial<Record<T.JobType, string[]>> = {
    Refinery: ['Turnaround support — valve & PSV picks', 'Exchanger bundle handling support', 'Maintenance picks — pumps & motors'],
    Commercial: ['Rooftop HVAC picks', 'Glass & sign set', 'Generator set'],
    Industrial: ['Plant maintenance picks', 'Pump & motor change-out', 'Conveyor section swap'],
    'Oil & Gas': ['Separator / pump skid set', 'Wellsite equipment picks'],
    Power: ['Substation maintenance picks', 'Breaker & bushing change-out'],
  }
  let jobSeq = 10061
  // never hand out a number an anchored job already uses (was: Q-10170 duplicated #10170)
  const nextJobNo = () => { while (jobSeq === 10125 || jobSeq === 10124 || jobSeq === 10050 || jobs.some(j => j.jobNo === String(jobSeq))) jobSeq++; return String(jobSeq++) }
  type JobSeed = Partial<T.Job> & { siteId: string; startDate: string; endDate: string; type: T.JobType; divisionId: string; branchId: string }
  const makeJob = (o: JobSeed): T.Job => {
    const site = sites.find(s => s.id === o.siteId)!
    const crane = equipment.find(e => e.id === o.craneId)
    const cap = crane?.capacity ?? 0
    const days = diffDays(o.endDate, o.startDate) + 1
    let positions: T.CrewPosition[]
    if (o.type === 'Heavy Haul') positions = ['Truck Driver', 'Truck Driver']
    else if (o.type === 'Uptower') positions = ['Supervisor', 'Uptower Tech', 'Uptower Tech', 'Uptower Tech']
    else if (o.type === 'Machine Moving') positions = ['Supervisor', 'Millwright', 'Millwright', 'Rigger']
    else if (crane?.type === 'Crawler') positions = ['Operator', 'Oiler', 'Rigger', 'Rigger', 'Truck Driver', ...(cap >= 500 ? ['Supervisor' as const] : [])]
    else if (cap >= 400) positions = ['Operator', 'Rigger', 'Rigger', 'Truck Driver', 'Supervisor']
    else if (cap >= 150) positions = ['Operator', 'Rigger', 'Rigger', 'Truck Driver']
    else positions = ['Operator', 'Rigger']
    if (o.type === 'Wind' && !positions.includes('Supervisor')) positions.push('Supervisor')
    const dayRate = o.type === 'Heavy Haul' ? r.int(40, 62) * 100 : o.type === 'Uptower' ? r.int(36, 46) * 100 : o.type === 'Machine Moving' ? r.int(34, 50) * 100 : Math.round((crane?.dayRate ?? 5000) * (0.95 + r.next() * 0.2) / 50) * 50
    const cfg = configs.filter(c => c.craneId === o.craneId)
    const cfgPick = cfg.length ? cfg[Math.min(cfg.length - 1, o.type === 'Wind' ? 2 : 0)] : undefined
    const nLoads = cfgPick?.loads?.reduce((s, l) => s + l.n, 0) ?? 0
    const haulMi = Math.round(distMiles([br(o.branchId).lat, br(o.branchId).lng], [site.lat, site.lng]) * 1.25)
    const mobDemob = o.type === 'Heavy Haul' ? 0 : !crane ? 2500 : Math.round(((nLoads * 2 * Math.max(1800, haulMi * 7)) * 1.18 + (cap >= 150 ? 3500 : 1500)) * (0.95 + r.next() * 0.2) / 100) * 100
    const qRev = dayRate * days + mobDemob
    const rc: T.CertType[] = o.type === 'Refinery' || o.type === 'Oil & Gas' ? ['OSHA 10', 'H2S Awareness'] : o.type === 'Uptower' ? ['Tower Rescue', 'CPR / First Aid'] : o.type === 'Wind' ? ['OSHA 10', 'CPR / First Aid'] : o.type === 'Heavy Haul' ? ['CDL Class A'] : ['OSHA 10']
    const salesId = o.branchId === 'br-mid' ? tylerB.id : chrisR.id
    const n = jobs.length
    return {
      id: `job-${n + 1}`, jobNo: o.jobNo ?? nextJobNo(), name: r.pick(crane && cap < 150 && SMALL_NAMES[o.type] ? SMALL_NAMES[o.type]! : jobName[o.type]), customerId: customerFor(o.type, site).id,
      startTime: r.pick(['05:30', '06:00', '06:00', '06:30', '07:00']), trailerIds: cfgPick?.trailerIds ?? [], configId: cfgPick?.id,
      extraEquipment: r.shuffle(['Crane mats', 'Forklift', 'Manlift', 'Light towers', 'Porta potty', 'Generator', 'Spreader bar', 'Tag lines']).slice(0, r.int(1, 4)),
      requiredCerts: rc, pmId: o.branchId === 'br-kil' ? pms[1].id : pms[0].id,
      supervisorId: o.type === 'Uptower' ? supSUP.id : o.type === 'Machine Moving' ? supSMM.id : r.pick(supsFor(o.branchId)).id,
      status: 'Planned', dayRate, local: r.pick(LOCALS), liftPlan: cap >= 300 || o.type === 'Wind' ? r.pick(['Approved', 'Approved', 'Approved', 'In Review'] as const) : cap >= 150 ? r.pick(['Not Required', 'Approved'] as const) : 'Not Required',
      shift: r.chance(0.08) ? 'Night' : 'Day', positions, stage: 'Scheduled',
      quote: { revenue: qRev, costBudget: Math.round(qRev * (0.6 + r.next() * 0.12)), mobDemob, quotedAt: addDays(o.startDate, -r.int(10, 45)), salesId },
      lift: crane ? (() => { const load = Math.round(cap * (0.05 + r.next() * 0.12)); const radius = r.int(30, 110); const b0 = r.int(120, 330); const rigging = r.int(2, 12); const maxBoom = cap >= 500 ? 420 : cap >= 300 ? 260 : cap >= 200 ? 230 : cap >= 100 ? 190 : 140; const boom = Math.min(maxBoom, Math.max(Math.round(radius * 1.35 + 30), Math.round(b0 * 0.6))); return { load, radius, boom, rigging, notes: 'Demo values — verify with OEM load chart & engineered lift plan.' } })() : undefined,
      docs: [
        ...(cap >= 300 || o.type === 'Wind' ? [{ id: `doc-${n}-1`, name: 'Engineered lift plan rev B.pdf', kind: 'Lift Plan' as const, added: addDays(o.startDate, -5), by: 'Prairie Lift Engineering' }] : []),
        { id: `doc-${n}-2`, name: 'Customer PO.pdf', kind: 'Customer PO' as const, added: addDays(o.startDate, -9), by: 'Sales' },
        { id: `doc-${n}-3`, name: `${site.name} site map.pdf`, kind: 'Site Map' as const, added: addDays(o.startDate, -6), by: 'Operations' },
      ],
      notes: r.pick(['Check in at main gate, safety orientation 30 min.', 'Ground bearing report on file — use 40 mats.', 'Customer requires daily JSA signed before first pick.', 'Night lighting required for last two days.', 'Escort required for crawler components.']),
      ...o,
    } as T.Job
  }
  cranes.forEach((c, ci) => {
    if (DOWN_CRANES[c.unit]) return
    const crawler = c.type === 'Crawler'
    let start = ci === 0 ? addDays(T0, -3) : c.unit === '28' ? addDays(T0, -4) : r.chance(0.2) ? addDays(T0, r.int(1, 6)) : addDays(T0, -r.int(0, 10))
    let guard = 0
    while (start < addDays(T0, 42) && guard++ < 6) {
      const first1200 = ci === 0 && guard === 1
      const dur = first1200 ? 8 : crawler ? r.int(6, 18) : r.int(2, 9)
      const end = addDays(start, dur - 1)
      // Capacity decides the work: wind main-component work needs 300 t+ / crawlers; small cranes do plant & maintenance picks
      const cap = c.capacity ?? 0
      const okType = (t: T.JobType) => t !== 'Machine Moving' && (t !== 'Wind' || crawler || cap >= 300) && (cap >= 120 || ['Commercial', 'Industrial', 'Refinery', 'Oil & Gas', 'Power'].includes(t))
      const branchSites = sitesFor(c.branchId).filter(s => okType(siteType(s)))
      const first28 = c.unit === '28' && guard === 1
      const s = first1200 || first28 ? sites.find(x => x.name === 'Sooner Ridge Wind')! : r.pick(branchSites)
      const sDate = first28 ? addDays(T0, -4) : start, eDate = first28 ? addDays(T0, 7) : end
      jobs.push(makeJob({ siteId: s.id, startDate: sDate, endDate: eDate, craneId: c.id, type: siteType(s), divisionId: 'div-slh', branchId: c.branchId,
        ...(first1200 ? { jobNo: '10124', startTime: '06:00', name: 'Tailing crane — rotor lift T-18 (assist to Job #10125, Crane 28)' } : {}),
        ...(first28 ? { jobNo: '10125', startTime: '06:00', name: 'Main component exchange — rotor & gearbox T-18 / T-22 (Crane 28 LR 1500 + Crane 1200 tailing)' } : {}) }))
      if (first28) { start = addDays(eDate, r.int(3, 6)); continue }
      start = addDays(end, r.chance(0.15) ? 1 : r.int(2, 8))
    }
  })
  const hh: [string, number, number][] = [['Muskogee Power Station', -6, -1], ['Sherman Semiconductor Fab', -1, 1], ['Big Spring Refinery', 0, 2], ['Marshall Power Plant', 2, 4], ['Pecos Frac Site', 5, 6], ['Dallas Data Center', 8, 9], ['Enid Grain Terminal', -3, -2], ['Tulsa Port Terminal', 12, 14]]
  hh.forEach(([sn, a, b], i) => { const s = sites.find(x => x.name === sn)!; jobs.push(makeJob({ siteId: s.id, startDate: addDays(T0, a), endDate: addDays(T0, b), type: 'Heavy Haul', divisionId: 'div-str', branchId: siteBranch(s), trailerIds: [trailers[i % trailers.length].id], ...(i === 0 ? { jobNo: '10050', name: 'Transformer haul — Muskogee to OKC yard' } : {}) })) })
  ;([['Canadian Hills Wind', -4, 3], ['Childress Wind', 6, 14], ['Panhandle Wind', 17, 26], ['Amarillo Wind Hub', -14, -8]] as [string, number, number][]).forEach(([sn, a, b]) => { const s = sites.find(x => x.name === sn)!; jobs.push(makeJob({ siteId: s.id, startDate: addDays(T0, a), endDate: addDays(T0, b), type: 'Uptower', divisionId: 'div-sup', branchId: 'br-okc', extraEquipment: ['Uptower tool trailer', 'Torque tools', 'Rescue kit'] })) })
  ;([['Kilgore Plant Relocation', -2, 6], ['Texarkana Manufacturing', 9, 15], ['Longview Steel Works', -12, -6], ['Duncan Steel Fab', 3, 7]] as [string, number, number][]).forEach(([sn, a, b]) => { const s = sites.find(x => x.name === sn)!; jobs.push(makeJob({ siteId: s.id, startDate: addDays(T0, a), endDate: addDays(T0, b), type: 'Machine Moving', divisionId: 'div-smm', branchId: siteBranch(s) === 'br-okc' ? 'br-okc' : 'br-kil', extraEquipment: ['Hydraulic gantry', 'Machinery skates', 'Forklift 15K'] })) })

  // Anchor jobs: the crane-move, pickup, bids and weather modules tell one story. Pin those jobs here so every screen agrees.
  {
    const anchor = (no: string, unit: string | null, siteName: string, custName: string, name: string, a: number, b: number) => {
      const site = sites.find(x => x.name === siteName)!, cust = customers.find(c => c.name === custName)!
      const crane = unit ? cranes.find(c => c.unit === unit) : undefined
      const sD = addDays(T0, a), eD = addDays(T0, b)
      if (crane) for (let i = jobs.length - 1; i >= 0; i--) { const j = jobs[i]; if (j.craneId === crane.id && j.jobNo !== no && !['10125', '10124'].includes(j.jobNo) && j.startDate <= addDays(eD, 1) && j.endDate >= addDays(sD, -1)) jobs.splice(i, 1) }
      let j = jobs.find(x => x.jobNo === no)
      // A different job already owns this number: give it a fresh number instead of overwriting it (keeps its tickets/customer)
      if (j && j.siteId !== site.id) { j.jobNo = nextJobNo(); j = undefined }
      if (!j) { j = makeJob({ jobNo: no, siteId: site.id, startDate: sD, endDate: eD, type: siteType(site), divisionId: 'div-slh', branchId: SITES[Number(site.id.split('-')[1]) - 1][5] as string }); jobs.push(j) }
      Object.assign(j, { siteId: site.id, customerId: cust.id, name, startDate: sD, endDate: eD, type: siteType(site), branchId: SITES[Number(site.id.split('-')[1]) - 1][5] as string, craneId: crane?.id ?? j.craneId })
    }
    const j25 = jobs.find(j => j.jobNo === '10125')!; j25.endDate = addDays(T0, 1)
    const j24 = jobs.find(j => j.jobNo === '10124')!; j24.endDate = addDays(T0, 1)
    anchor('10158', '28', 'Ardmore Refinery', 'Red River Refining', 'Unit 4 reactor set', 3, 12)
    anchor('10131', '70', 'Ardmore Refinery', 'Red River Refining', 'Turnaround — exchanger & column picks', -10, 6)
    anchor('10142', '31', 'Odessa Petrochem', 'Lone Star Petrochem', 'Separator vessel set', -6, 6)
    anchor('10170', '80', 'Ponca City Refinery', 'Red River Refining', 'Turnaround — exchanger bundle pulls', 7, 18)
    // Crane 80 sits in the OKC yard until Thursday's haul to Ponca City
    { const c80 = cranes.find(c => c.unit === '80')!; for (let i = jobs.length - 1; i >= 0; i--) { const j = jobs[i]; if (j.craneId === c80.id && j.jobNo !== '10170' && j.endDate >= addDays(T0, -1) && j.startDate <= addDays(T0, 6)) jobs.splice(i, 1) } }
    anchor('10163', null, 'Enid Grain Terminal', 'Turner-Bowen Builders', 'Grain leg replacement', 6, 8)
  }
  jobs.forEach(j => {
    if (j.closedOut) return
    if (j.endDate < T0) { j.status = 'Complete'; j.stage = j.endDate < addDays(T0, -6) ? r.pick(['Paid', 'Invoiced', 'Invoiced'] as const) : r.pick(['Complete', 'Invoiced'] as const) }
    else if (j.startDate <= T0) { j.status = r.chance(0.12) && j.jobNo !== '10125' ? 'Delayed' : 'On Site'; j.stage = 'In Progress' }
    else if (j.startDate === addDays(T0, 1)) { j.status = 'Confirmed'; j.stage = 'Scheduled' }
    else { j.status = r.chance(0.5) ? 'Confirmed' : 'Planned'; j.stage = 'Scheduled' }
  })
  ;([['Ponca City Refinery', 20, 34, '34', 'Quote'], ['Dallas Data Center', 25, 30, '12', 'Quote'], ['Odessa Petrochem', 18, 28, '31', 'Awarded'], ['Sweetwater Wind', 30, 44, '31', 'Quote'], ['Tyler Hospital Expansion', 22, 25, '84', 'Awarded'], ['Norman Medical Tower', 35, 38, '36', 'Quote']] as [string, number, number, string, T.JobStage][]).forEach(([sn, a, b, cu, st]) => {
    const s = sites.find(x => x.name === sn)!; const c = eq(cu)
    const j = makeJob({ siteId: s.id, startDate: addDays(T0, a), endDate: addDays(T0, b), type: siteType(s), divisionId: 'div-slh', branchId: c.branchId, craneId: c.id })
    j.stage = st; j.status = 'Planned'; j.quote.quotedAt = addDays(T0, -r.int(1, 12)); jobs.push(j)
  })
  // Older completed jobs (45–120 days back) so receivables have real jobs, customers and dates behind them
  cranes.filter(c => !DOWN_CRANES[c.unit]).forEach((c, i) => {
    if (i % 3 === 2 && c.branchId !== 'br-okc') return
    const cap = c.capacity ?? 0
    const okType = (t: T.JobType) => t !== 'Machine Moving' && (t !== 'Wind' || c.type === 'Crawler' || cap >= 300) && (cap >= 120 || t !== 'Wind')
    const st = addDays(T0, -r.int(50, 118)); const s = r.pick(sitesFor(c.branchId).filter(x => okType(siteType(x))))
    const j = makeJob({ siteId: s.id, startDate: st, endDate: addDays(st, r.int(2, c.type === 'Crawler' ? 12 : 6)), craneId: c.id, type: siteType(s), divisionId: 'div-slh', branchId: c.branchId })
    j.status = 'Complete'; j.stage = diffDays(T0, j.endDate) > 75 || r.chance(0.55) ? 'Paid' : 'Invoiced'; j.closedOut = true; jobs.push(j)
  })
  jobs.sort((a, b) => a.startDate.localeCompare(b.startDate))
  jobs.forEach((j, i) => { j.id = `job-${i + 1}` })
  const live = (j: T.Job) => j.stage !== 'Quote' && j.stage !== 'Awarded'
  // Company trailers: a trailer is only "busy" on the mob and demob days it hauls. Allocate per job, the rest of the load list goes to third-party haulers.
  const haulDays = new Map<string, Set<string>>()
  const busyT = (tid: string, d: string) => !!haulDays.get(tid)?.has(d)
  const bookT = (tid: string, ds: string[]) => { if (!haulDays.has(tid)) haulDays.set(tid, new Set()); ds.forEach(d => haulDays.get(tid)!.add(d)) }
  jobs.filter(j => j.type === 'Heavy Haul').forEach(j => j.trailerIds.forEach(t => bookT(t, range(j.startDate, j.endDate))))
  jobs.filter(j => j.craneId && j.type !== 'Heavy Haul').forEach(j => {
    const cfg = configs.find(c => c.id === j.configId)
    const want = cfg?.trailerIds ?? []
    const ds = [j.startDate, j.endDate]
    const got: string[] = []
    want.forEach(tid => {
      const t0 = equipment.find(e => e.id === tid)!
      const pickT = [t0, ...trailers.filter(t => t.branchId === t0.branchId && t.type === t0.type && t.id !== tid)].find(t => !got.includes(t.id) && ds.every(d => !busyT(t.id, d)))
      if (pickT) { got.push(pickT.id); bookT(pickT.id, ds) }
    })
    j.trailerIds = got
  })
  // One real trailer conflict for the story: tomorrow's mob wants a counterweight trailer that's still hauling demob elsewhere
  {
    const tmr = addDays(T0, 1)
    const a = jobs.find(j => live(j) && j.craneId && j.startDate === tmr && j.branchId === 'br-okc')
    const b = jobs.find(j => live(j) && j !== a && j.endDate === tmr && j.trailerIds.length && j.branchId === 'br-okc')
    if (a && b && !a.trailerIds.includes(b.trailerIds[0])) a.trailerIds = [b.trailerIds[0], ...a.trailerIds]
  }

  // ---------- assignments ----------
  const assignments: T.Assignment[] = []
  let asgN = 0
  const busy = new Map<string, Set<string>>()
  const isBusy = (d: string, id: string) => !!busy.get(d)?.has(id)
  const mark = (d: string, id: string) => { if (!busy.has(d)) busy.set(d, new Set()); busy.get(d)!.add(id) }
  const prev = new Map<string, string>()
  for (const d of range(addDays(T0, -14), addDays(T0, 28))) {
    for (const j of jobs.filter(x => live(x) && between(d, x.startDate, x.endDate))) {
      const crew = field.filter(e => e.homeCraneId && e.homeCraneId === j.craneId)
      const counts: Record<string, number> = {}
      for (const pos of requiredPositions(j, d)) {
        counts[pos] = (counts[pos] ?? 0) + 1
        const k = `${j.id}|${pos}|${counts[pos]}`
        const free = (e: T.Employee) => !isBusy(d, e.id) && !absentOn(e.id, d) && certOk(e, j.requiredCerts, d)
        let pickE: T.Employee | undefined
        let source: T.Assignment['source'] = 'Dispatch'
        const pvId = prev.get(k)
        const pv = pvId ? employees.find(e => e.id === pvId) : undefined
        if (pv && free(pv)) { pickE = pv; source = pv.homeCraneId === j.craneId ? 'Crane crew' : pv.homeCraneId ? 'Replacement' : 'Dispatch' }
        if (!pickE) { pickE = crew.find(e => e.craft === pos && free(e)); if (pickE) source = 'Crane crew' }
        if (!pickE && pos === 'Supervisor' && j.supervisorId) { const s = employees.find(e => e.id === j.supervisorId)!; if (free(s)) pickE = s }
        if (!pickE && pos === 'Supervisor') pickE = field.find(e => e.craft === 'Supervisor' && free(e) && e.divisionId === j.divisionId) ?? field.find(e => e.craft === 'Supervisor' && free(e) && e.branchId === j.branchId)
        if (!pickE && pos === 'Truck Driver') pickE = field.find(e => e.craft === 'Truck Driver' && e.branchId === j.branchId && free(e))
        if (!pickE) {
          const pool = field.filter(e => e.craft === pos && free(e) && !e.homeCraneId)
          pickE = pool.find(e => e.branchId === j.branchId) ?? pool[0]
          if (!pickE) {
            // borrow someone whose home crane is idle (or down) that day
            pickE = field.find(e => e.craft === pos && free(e) && e.branchId === j.branchId && !jobs.some(x => live(x) && x.craneId === e.homeCraneId && between(d, x.startDate, x.endDate)))
            if (pickE) source = 'Replacement'
          }
        }
        if (!pickE) continue
        mark(d, pickE.id); prev.set(k, pickE.id)
        assignments.push({ id: `asg-${++asgN}`, jobId: j.id, date: d, employeeId: pickE.id, position: pos, source })
      }
    }
  }
  // ----- demo conflict injections -----
  const j10125 = jobs.find(j => j.jobNo === '10125')!
  absences.push({ id: `abs-${++absN}`, employeeId: mike.id, from: addDays(T0, 1), to: addDays(T0, 1), kind: 'Scheduled Off', note: 'Approved day off (family event)' })
  if (!assignments.some(a => a.employeeId === mike.id && a.date === addDays(T0, 1))) assignments.push({ id: `asg-${++asgN}`, jobId: j10125.id, date: addDays(T0, 1), employeeId: mike.id, position: 'Rigger', source: 'Crane crew' })
  const todayJobs = jobs.filter(j => live(j) && between(T0, j.startDate, j.endDate) && j.craneId && j.id !== j10125.id)
  const j28 = todayJobs.find(j => j.craneId === eq('28').id)
  const opA = assignments.find(a => a.date === T0 && a.position === 'Operator' && a.jobId === j28?.id) ?? assignments.find(a => a.date === T0 && a.position === 'Operator' && todayJobs.some(j => j.id === a.jobId) && a.employeeId !== john.id)
  if (opA) absences.push({ id: `abs-${++absN}`, employeeId: opA.employeeId, from: T0, to: addDays(T0, 3), kind: 'Vacation / PTO', note: 'PTO approved by HR after schedule was posted' })
  const tmrRig = assignments.filter(a => a.date === addDays(T0, 1) && a.position === 'Rigger' && a.employeeId !== mike.id)
  const otherJob = tmrRig.find(a => a.jobId !== tmrRig[0]?.jobId)
  if (tmrRig[0] && otherJob) assignments.push({ id: `asg-${++asgN}`, jobId: otherJob.jobId, date: addDays(T0, 1), employeeId: tmrRig[0].employeeId, position: 'Rigger', source: 'Dispatch' })

  // ---------- travel ----------
  const travel: T.Travel[] = []
  let trN = 0
  const siteOf = (j: T.Job) => sites.find(s => s.id === j.siteId)!
  jobs.filter(j => live(j) && j.startDate === addDays(T0, 1)).forEach(j => {
    assignments.filter(a => a.jobId === j.id && a.date === j.startDate).slice(0, 3).forEach(a => {
      const e = employees.find(x => x.id === a.employeeId)!
      if (assignments.some(x => x.employeeId === e.id && x.date === T0) || travel.some(t => t.employeeId === e.id)) return
      travel.push({ id: `tr-${++trN}`, employeeId: e.id, date: T0, direction: 'To Site', from: `${br(j.branchId).code} Yard`, to: `${siteOf(j).name} · ${siteOf(j).city}`, jobId: j.id, truckId: e.homeTruckId, trailerId: e.craft === 'Truck Driver' ? j.trailerIds[0] : undefined })
    })
  })
  const j10050 = jobs.find(j => j.jobNo === '10050')!
  travel.push({ id: `tr-${++trN}`, employeeId: steve.id, date: T0, direction: 'From Site', from: `Job #10050 · ${siteOf(j10050).city}`, to: 'SLH-OKC Yard', jobId: j10050.id, truckId: steve.homeTruckId, trailerId: j10050.trailerIds[0] })
  jobs.filter(j => j.endDate === addDays(T0, -1) && j.id !== j10050.id).slice(0, 2).forEach(j => {
    assignments.filter(a => a.jobId === j.id && a.date === j.endDate).slice(0, 2).forEach(a => {
      if (assignments.some(x => x.employeeId === a.employeeId && x.date === T0) || travel.some(t => t.employeeId === a.employeeId)) return
      const home = r.chance(0.5)
      travel.push({ id: `tr-${++trN}`, employeeId: a.employeeId, date: T0, direction: home ? 'Home' : 'To Yard', from: siteOf(j).name, to: home ? 'Home' : `${br(j.branchId).code} Yard`, jobId: j.id })
    })
  })

  // ---------- equipment live state ----------
  cranes.forEach(c => {
    if (DOWN_CRANES[c.unit]) return
    const jt = jobs.find(j => live(j) && j.craneId === c.id && between(T0, j.startDate, j.endDate))
    if (jt) { const s = siteOf(jt); c.status = 'On Job'; c.lat = s.lat + (r.next() - 0.5) * 0.01; c.lng = s.lng + (r.next() - 0.5) * 0.01; return }
    const jn = jobs.find(j => live(j) && j.craneId === c.id && j.startDate === addDays(T0, 1))
    if (jn) {
      const s = siteOf(jn); const B = br(c.branchId)
      c.status = 'In Transit'; c.route = { from: [B.lat, B.lng], to: [s.lat, s.lng], fromName: `${B.code} Yard`, toName: s.name, depart: ts(0, 5, 30), eta: ts(0, 19, 0), jobId: jn.id }
    }
  })
  travel.forEach(t => {
    if (!t.truckId) return
    const truck = equipment.find(e => e.id === t.truckId)!
    const j = jobs.find(x => x.id === t.jobId)!
    const s = siteOf(j); const B = br(truck.branchId)
    truck.status = 'In Transit'
    truck.route = t.direction === 'To Site'
      ? { from: [B.lat, B.lng], to: [s.lat, s.lng], fromName: `${B.code} Yard`, toName: s.name, depart: ts(0, 5, 0), eta: ts(0, 17, 30), jobId: j.id }
      : { from: [s.lat, s.lng], to: [B.lat, B.lng], fromName: s.name, toName: `${B.code} Yard`, depart: ts(0, 6, 0), eta: ts(0, 15, 0), jobId: j.id }
    if (t.trailerId) { const tr = equipment.find(e => e.id === t.trailerId)!; tr.status = 'In Transit'; tr.route = { ...truck.route } }
  })
  jobs.filter(j => live(j) && j.type === 'Heavy Haul' && between(T0, j.startDate, j.endDate)).forEach(j => {
    const truck = equipment.find(e => e.category === 'Semi' && e.status === 'Available' && e.branchId === j.branchId)
    if (!truck) return
    const s = siteOf(j); const B = br(truck.branchId)
    truck.status = 'In Transit'; truck.route = { from: [B.lat + 0.35, B.lng - 0.5], to: [s.lat, s.lng], fromName: 'Customer pickup', toName: s.name, depart: ts(0, 4, 0), eta: ts(0, 21, 0), jobId: j.id }
  })
  jobs.filter(j => live(j) && between(T0, j.startDate, j.endDate)).forEach(j => {
    const s = siteOf(j)
    j.trailerIds.forEach(tid => { const t = equipment.find(e => e.id === tid)!; if (t.status === 'Available') { t.status = 'On Job'; t.lat = s.lat + (r.next() - 0.5) * 0.02; t.lng = s.lng + (r.next() - 0.5) * 0.02 } })
  })
  const place = (u: string, sn: string) => { const s = sites.find(x => x.name === sn)!; const e = eq(u); e.status = 'On Job'; e.lat = s.lat + 0.004; e.lng = s.lng - 0.004 }
  place('S-506', 'Kilgore Plant Relocation'); place('S-508', 'Canadian Hills Wind'); place('S-504', 'Sooner Ridge Wind')
  const t204 = eq('T-204'); t204.status = 'Out of Service'; t204.route = undefined; t204.lat = 34.29; t204.lng = -97.12

  // ---------- time entries ----------
  const time: T.TimeEntry[] = []
  let teN = 0
  const actFor = (pos: T.CrewPosition, j: T.Job, d: string): T.Activity => {
    if (pos === 'Truck Driver') return j.craneId ? 'Crane Mobe' : 'Truck Mobe'
    if (d === j.startDate && pos === 'Operator') return 'Crane A/D'
    if (pos === 'Rigger' || pos === 'Millwright') return 'Rigging'
    if (pos === 'Oiler') return 'Oiling'
    return 'Lifting & Hoisting'
  }
  assignments.filter(a => a.date < T0 && a.date >= addDays(T0, -14)).forEach(a => {
    const j = jobs.find(x => x.id === a.jobId)!
    const e = employees.find(x => x.id === a.employeeId)!
    const s = siteOf(j)
    const far = distMiles([br(e.branchId).lat, br(e.branchId).lng], [s.lat, s.lng]) > 70
    const startH = Number(j.startTime.split(':')[0])
    const len = r.chance(0.03) ? 15 : r.int(9, 12)
    const end = `${String((startH + len) % 24).padStart(2, '0')}:${r.pick(['00', '30', '00'])}`
    const pd: T.PerDiem[] = []
    if (far) pd.push('Hotel')
    if (a.position === 'Truck Driver') pd.push('Semi Truck')
    if (a.position === 'Supervisor') pd.push('Daily Truck')
    const age = diffDays(T0, a.date)
    const hours = hoursBetween(j.startTime, end, 30)
    const act = r.chance(0.05) ? 'Onsite Standby' : actFor(a.position, j, a.date)
    time.push({
      id: `te-${++teN}`, employeeId: e.id, jobId: j.id, date: a.date, activity: act, start: j.startTime, end, mealMin: 30, hours,
      perDiems: pd.filter(p => !e.perDiemBlocked.includes(p)),
      status: hours > 14 && age <= 6 ? 'Flagged' : age > 7 ? 'Exported' : age > 3 ? 'Approved' : 'Submitted',
      note: hours > 14 ? 'Long shift — verify punch' : undefined, approvedBy: age > 3 ? 'Karen Ortiz' : undefined, submittedAt: ts(-age, Math.min(23, startH + len), 15),
    })
  })

  // ---------- fuel logs ----------
  const fuel: T.FuelLog[] = []
  let fuN = 0
  jobs.filter(j => live(j) && j.startDate <= T0 && j.endDate >= addDays(T0, -14)).forEach(j => {
    const from = j.startDate < addDays(T0, -14) ? addDays(T0, -14) : j.startDate
    const to = j.endDate < T0 ? j.endDate : addDays(T0, -1)
    if (to < from) return
    range(from, to).forEach((d, i) => {
      if (j.craneId && i % 2 === 0) { const op = assignments.find(a => a.jobId === j.id && a.date === d && a.position === 'Operator'); fuel.push({ id: `fu-${++fuN}`, unitId: j.craneId, jobId: j.id, employeeId: op?.employeeId ?? john.id, date: d, gallons: r.int(35, 95), price: 3.39 + r.int(0, 45) / 100, vendor: r.pick(['Cross Timbers Fuel', 'Permian Fuel Supply', "Love's Travel Stop", 'Pilot Flying J']) }) }
      if (d === j.startDate || d === j.endDate || j.type === 'Heavy Haul') {
        const dr = assignments.find(a => a.jobId === j.id && a.date === d && a.position === 'Truck Driver')
        const de = dr ? employees.find(e => e.id === dr.employeeId) : undefined
        if (de?.homeTruckId) fuel.push({ id: `fu-${++fuN}`, unitId: de.homeTruckId, jobId: j.id, employeeId: de.id, date: d, gallons: r.int(110, 210), price: 3.49 + r.int(0, 40) / 100, odometer: r.int(100000, 600000), vendor: r.pick(["Love's Travel Stop", 'Pilot Flying J', 'Cross Timbers Fuel']) })
      }
    })
  })

  // ---------- vendors, bills, manual job costs ----------
  const vendors: T.Vendor[] = ([
    ['Cross Timbers Fuel', 'Fuel', 15], ['Red River Truck & Trailer', 'Semis & Trucks', 30], ['Prairie Lift Engineering', 'Engineering / Lift Plan', 30], ['Lone Star Pilot Cars', 'Permits & Escorts', 15],
    ['OS/OW Permit Service', 'Permits & Escorts', 0], ['Sooner Mat Rentals', 'Equipment Rental', 30], ['Caddo Hydraulics', 'Materials', 30], ['Mid-Plains Hotel Group', 'Per Diem', 15],
    ['Bluestem Site Services', 'Subcontractors', 30], ['OK Steel & Rigging Supply', 'Materials', 30], ['Panhandle Electric (sub)', 'Subcontractors', 45],
  ] as [string, T.CostCategory, number][]).map(([name, category, terms], i) => ({ id: `ven-${i + 1}`, name, category, terms, phone: `(405) 555-07${10 + i}` }))
  const costs: T.JobCost[] = []
  let coN = 0
  const bills: T.VendorBill[] = []
  let biN = 0
  const activeOrDone = jobs.filter(j => live(j) && j.startDate <= T0 && j.endDate >= addDays(T0, -45))
  activeOrDone.forEach(j => {
    const crane = equipment.find(e => e.id === j.craneId)
    const big = (crane?.capacity ?? 0) >= 300 || crane?.type === 'Crawler'
    const lines: { v: string; cat: T.CostCategory; desc: string; amt: number }[] = []
    if (j.liftPlan === 'Approved' || j.liftPlan === 'In Review') lines.push({ v: 'Prairie Lift Engineering', cat: 'Engineering / Lift Plan', desc: 'Engineered lift plan & ground bearing calc', amt: big ? r.int(28, 65) * 100 : r.int(9, 18) * 100 })
    if (big || j.type === 'Heavy Haul') { lines.push({ v: 'OS/OW Permit Service', cat: 'Permits & Escorts', desc: 'Oversize/overweight permits (OK/TX)', amt: r.int(6, 28) * 100 }); lines.push({ v: 'Lone Star Pilot Cars', cat: 'Permits & Escorts', desc: 'Pilot car escorts — mob', amt: r.int(9, 32) * 100 }) }
    const small = !!crane && (crane.capacity ?? 0) < 150
    if (!small && r.chance(0.5)) lines.push({ v: 'Sooner Mat Rentals', cat: 'Equipment Rental', desc: 'Crane mat rental (20 ea)', amt: r.int(18, 55) * 100 })
    if (big && r.chance(0.3)) lines.push({ v: 'Bluestem Site Services', cat: 'Subcontractors', desc: 'Site prep / dirt work for crane pad', amt: r.int(25, 80) * 100 })
    if (r.chance(0.35)) lines.push({ v: 'OK Steel & Rigging Supply', cat: 'Materials', desc: 'Rigging consumables & tag line', amt: r.int(3, 14) * 100 })
    lines.forEach(l => {
      const ven = vendors.find(v => v.name === l.v)!
      const date = addDays(j.startDate, r.int(-4, 3))
      const age = diffDays(T0, date)
      const status: T.VendorBill['status'] = age > 25 ? 'Paid' : age > 8 ? 'Approved' : r.pick(['Pending Approval', 'Pending Approval', 'Approved', 'Needs Coding'] as const)
      biN++
      bills.push({ id: `bill-${biN}`, vendorId: ven.id, billNo: `${ven.name.replace(/[^A-Z]/gi, '').slice(0, 4).toUpperCase()}-${r.int(10000, 99999)}`, date, due: addDays(date, ven.terms || 10), branchId: j.branchId,
        lines: [{ id: `bl-${biN}`, jobId: status === 'Needs Coding' ? undefined : j.id, category: l.cat, description: `${l.desc}${status === 'Needs Coding' ? ` — ${siteOf(j).name}` : ''}`, amount: l.amt }], status, approvedBy: status === 'Approved' || status === 'Paid' ? 'Chad Weathers' : undefined, paidOn: status === 'Paid' ? addDays(date, ven.terms) : undefined })
    })
  })
  const losers = activeOrDone.filter(j => j.craneId && j.stage === 'In Progress' && j.jobNo !== '10125').slice(1, 4)
  losers.forEach((j, i) => {
    costs.push({ id: `co-${++coN}`, jobId: j.id, date: addDays(j.startDate, 1), category: 'Subcontractors', description: ['Unplanned crane pad rebuild after rain — customer dispute', 'Assist crane rented (third-party) for tail lift', 'Standby — customer steel late, crew held on site'][i], amount: [Math.round(j.quote.revenue * 0.5), Math.round(j.quote.revenue * 0.26), Math.round(j.quote.revenue * 0.1)][i], source: 'Manual', by: 'Ben Harper' })
  })
  activeOrDone.slice(0, 14).forEach(j => { if (r.chance(0.5)) costs.push({ id: `co-${++coN}`, jobId: j.id, date: j.startDate, category: 'Other', description: r.pick(['Site safety orientation fees', 'Dumpster & porta-john', 'Customer badging / drug screens', 'Tolls & scale tickets']), amount: r.int(2, 9) * 100, source: 'Manual', by: 'Ben Harper' }) })
  biN++; bills.push({ id: `bill-${biN}`, vendorId: vendors[1].id, billNo: 'REDR-55821', date: addDays(T0, -2), due: addDays(T0, 28), branchId: 'br-okc', lines: [{ id: `bl-${biN}`, category: 'Semis & Trucks', description: 'T-204 steer tires (2) + alignment', amount: 1840 }], status: 'Needs Coding' })
  biN++; bills.push({ id: `bill-${biN}`, vendorId: vendors[7].id, billNo: 'MIDP-1189', date: addDays(T0, -1), due: addDays(T0, 14), branchId: 'br-okc', lines: [{ id: `bl-${biN}`, category: 'Per Diem', description: 'Crew hotel block — Woodward (6 rooms × 4 nights)', amount: 3360 }], status: 'Needs Coding' })

  // ---------- invoices ----------
  const invoices: T.Invoice[] = []
  let invN = 4410
  jobs.filter(j => j.stage === 'Invoiced' || j.stage === 'Paid').forEach(j => {
    const days = diffDays(j.endDate, j.startDate) + 1
    const lines = [{ description: `${j.craneId ? 'Crane & crew' : 'Crew & equipment'} day rate — ${days} days`, qty: days, rate: j.dayRate }, ...(j.quote.mobDemob ? [{ description: 'Mobilization / demobilization', qty: 1, rate: j.quote.mobDemob }] : [])]
    const amount = lines.reduce((s, l) => s + l.qty * l.rate, 0)
    const date = addDays(j.endDate, r.int(1, 3)) > T0 ? T0 : addDays(j.endDate, r.int(1, 3))
    const due = addDays(date, 30)
    const paid = j.stage === 'Paid' ? amount : 0
    j.invoiceNo = `INV-${++invN}`
    invoices.push({ id: `inv-${invN}`, invNo: j.invoiceNo, jobId: j.id, customerId: j.customerId, date, due, lines, amount, paid, status: paid ? 'Paid' : due < T0 ? 'Overdue' : 'Sent', collections: paid ? 'Paid' : due < T0 ? 'Reminder Sent' : 'Current', payments: paid ? [{ date: addDays(date, r.int(14, 32)) > T0 ? T0 : addDays(date, r.int(14, 32)), amount, method: r.pick(['ACH', 'Check', 'Wire']), ref: `PMT-${r.int(10000, 99999)}` }] : [] })
  })
  // A couple of slow payers so the aging buckets tell a story (all tied to real jobs, customers and dates)
  invoices.filter(i => i.paid === 0 && diffDays(T0, i.due) > 0).slice(0, 2).forEach(i => { i.paid = Math.round(i.amount * 0.5); i.status = 'Partial'; i.payments = [{ date: addDays(i.date, 28) > T0 ? T0 : addDays(i.date, 28), amount: i.paid, method: 'Check', ref: `PMT-${r.int(10000, 99999)}` }] })
  invoices.forEach(i => { const late = diffDays(T0, i.due); if (i.paid < i.amount) i.collections = late > 60 ? 'Collections' : late > 30 ? 'Call Scheduled' : late > 0 ? 'Reminder Sent' : 'Current' })
  // Closed-out jobs carry their final cost from accounting (labor, equipment, subs rolled up)
  jobs.filter(j => j.closedOut).forEach(j => costs.push({ id: `co-${++coN}`, jobId: j.id, date: j.endDate, category: 'Other', description: 'Closed-out job cost from accounting (labor, crane, trucking, subs)', amount: Math.round(j.quote.revenue * (0.66 + r.next() * 0.14)), source: 'Manual', by: 'Greg Lindsey' }))

  // ---------- EOD tickets ----------
  const tickets: T.EodTicket[] = []
  let tkN = 0
  jobs.filter(j => live(j) && j.startDate <= addDays(T0, -1) && j.endDate >= addDays(T0, -3)).forEach(j => {
    const a0 = j.startDate < addDays(T0, -3) ? addDays(T0, -3) : j.startDate
    const a1 = j.endDate < addDays(T0, -1) ? j.endDate : addDays(T0, -1)
    if (a1 < a0) return
    range(a0, a1).forEach(d => {
      const crew = assignments.filter(a => a.jobId === j.id && a.date === d).map(a => a.employeeId)
      if (!crew.length) return
      const age = diffDays(T0, d)
      const signed = j.jobNo === '10125' || j.endDate < addDays(T0, -1) ? true : r.chance(0.8)
      const cust = customers.find(c => c.id === j.customerId)!
      tickets.push({ id: `tk-${++tkN}`, jobId: j.id, date: d, supervisorId: j.supervisorId ?? crew[0], crewIds: crew, hours: { 'Lifting & Hoisting': r.int(6, 9), Rigging: r.int(1, 3), ...(r.chance(0.2) ? { 'Onsite Standby': r.int(1, 2) } : {}) },
        work: r.pick(['Set 6 picks per lift plan, all within chart.', 'Rigged and flew main components; demobed counterweight.', 'Assembled boom, set 4 modules, secured for wind at 3 PM.', 'Completed tandem lift; customer walked down final position.']),
        equipmentIn: d === j.startDate ? `Crane + ${j.trailerIds.length} trailer loads arrived` : '', equipmentOut: d === j.endDate ? 'Demob complete' : '',
        delays: r.chance(0.25) ? r.pick(['Wind hold 1.5 hrs (gusts > 30 mph)', 'Customer late with permits — 1 hr standby', 'Rain delay 45 min']) : '',
        pctComplete: Math.min(100, Math.round(((diffDays(d, j.startDate) + 1) / (diffDays(j.endDate, j.startDate) + 1)) * 100)), expectedFinish: j.endDate,
        status: signed ? (age > 1 ? 'Reviewed' : 'Submitted') : 'Draft', photos: r.int(0, 5), submittedAt: ts(-age, 18, r.int(0, 59)),
        signerName: signed ? cust.contact : undefined, signerTitle: signed ? 'Site Superintendent' : undefined, signedAt: signed ? ts(-age, 17, r.int(10, 50)) : undefined })
    })
  })

  // one critical lift (75-90% of chart) so Lift Planning shows the engineering review path
  { const cj = jobs.find(j => j.jobNo === '10108') ?? jobs.find(j => j.lift && j.liftPlan === 'In Review'); const cc = cj && equipment.find(e => e.id === cj.craneId)
    if (cj?.lift && cc?.capacity) { cj.lift.radius = 110; const capR = cc.capacity * Math.pow(20 / 110, 0.75); cj.lift.load = Math.round(capR * 0.82 - cj.lift.rigging) } }
  // two tickets bounced back by the office so the correction loop is visible
  tickets.filter(t => t.status === 'Reviewed' && byIdS(jobs, t.jobId)?.branchId === 'br-okc').slice(0, 2).forEach((t, i) => { t.status = 'Needs Correction'; t.correction = ['Rigging hours (2) don\'t match the crew sheet (3) — confirm with customer.', 'Missing photo of the ground-bearing mats under outrigger 3.'][i] })

  // ---------- shop: work orders & breakdowns ----------
  const workOrders: T.WorkOrder[] = []
  let woN = 7300
  const wo = (unit: string, title: string, complaint: string, priority: T.WorkOrder['priority'], status: T.WoStatus, source: T.WorkOrder['source'], tech?: T.Employee, parts: T.WorkOrder['parts'] = [], labor = 0, opened = -2, due = 2) => {
    const e = eq(unit); woN++
    workOrders.push({ id: `wo-${woN}`, woNo: `WO-${woN}`, unitId: e.id, title, complaint, priority, techId: tech?.id, status, opened: addDays(T0, opened), due: addDays(T0, due), parts, laborHrs: labor, laborRate: 115, source })
    return `wo-${woN}`
  }
  wo('44', 'Hydraulic pump replacement', 'Main hoist pump whining, pressure drop under load.', 'High', 'Waiting Parts', 'Inspection', robert, [{ name: 'Hydraulic pump assy (OEM)', qty: 1, cost: 14850 }, { name: 'Hydraulic fluid 55 gal', qty: 2, cost: 690 }], 14, -5, 3)
  wo('19', 'Swing bearing inspection — OUT OF SERVICE', 'Excessive play in swing bearing found on frequent inspection. Locked out.', 'Critical', 'In Progress', 'Inspection', adam, [{ name: 'Swing bearing seal kit', qty: 1, cost: 2400 }], 22, -8, 1)
  wo('41', '1,000-hr service', 'Scheduled service: engine oil, filters, hydraulic sampling.', 'Normal', 'Open', 'Service Plan', luis, [{ name: 'Filter kit', qty: 1, cost: 640 }, { name: 'Engine oil 15W-40 (gal)', qty: 12, cost: 22 }], 6, -1, 1)
  const woT204 = wo('T-204', 'Steer tire blowout & hub inspection', 'Driver reported blowout on I-35 near Ardmore.', 'Critical', 'Open', 'Breakdown', undefined, [], 0, 0, 0)
  wo('T-201', 'PM-B service', 'Due by miles.', 'Normal', 'Open', 'Service Plan', robert, [], 0, 0, 4)
  const woTR404 = wo('TR-404', 'Air leak — rear axle', 'Driver report on pre-trip (DVIR).', 'High', 'Ready for Release', 'Driver Report', adam, [{ name: 'Air brake chamber', qty: 1, cost: 185 }], 2.5, -3, -1)
  wo('36', 'Annual inspection prep', 'Annual 3rd-party inspection scheduled.', 'Normal', 'Open', 'Service Plan', undefined, [], 0, 1, 9)
  wo('80', 'Track pad replacement (6)', 'Cracked pads noticed during assembly.', 'Normal', 'Open', 'Inspection', adam, [{ name: 'Track pad', qty: 6, cost: 1150 }], 0, -1, 6)
  wo('P-302', 'Oil change & tire rotation', 'Driver report via app — 10k service.', 'Low', 'Open', 'Driver Report', undefined, [], 0, -1, 7)
  wo('S-501', 'Boom chain adjustment', 'Telehandler boom extend chain slack.', 'Normal', 'In Progress', 'Inspection', jake, [], 1.5, -1, 2)
  wo('TR-411', 'Landoll axle bearing repack', 'Scheduled service.', 'Low', 'Waiting Parts', 'Service Plan', adam, [{ name: 'Bearing kit', qty: 2, cost: 240 }], 0, -4, 5)
  const wo86 = wo('84', 'Load moment indicator calibration', 'LMI showing 4% high vs test weight.', 'High', 'Open', 'Inspection', jake, [], 0, 0, 2)
  const j84 = jobs.find(j => live(j) && j.craneId === eq('84').id && between(T0, j.startDate, j.endDate)) ?? jobs.find(j => j.craneId === eq('84').id && j.startDate <= T0)
  const bd2Loc = j84 ? `${siteOf(j84).name}, ${siteOf(j84).city} — crane pad` : 'SLH-KIL yard'
  const op84 = employees.find(e => e.homeCraneId === eq('84').id && e.craft === 'Operator')
  const bd2Op = op84 ? `${op84.first} ${op84.last}` : 'Crane 84 operator'
  const hNow = now.getHours()
  const breakdowns: T.Breakdown[] = [
    { id: 'bd-1', unitId: eq('T-204').id, kind: 'Tire Blowout', severity: 'Down — Can’t Move', lat: 34.29, lng: -97.12, locationText: 'I-35 SB mile marker 42, shoulder', contactName: employees.find(e => e.homeTruckId === eq('T-204').id)?.first + ' ' + employees.find(e => e.homeTruckId === eq('T-204').id)?.last, contactPhone: '(405) 555-1188', notes: 'Steer tire blowout, no injuries. Load secured, flashers & triangles out.', photos: [], reportedBy: 'Field app', reportedAt: new Date(now.getTime() - 50 * 60000).toISOString(), status: 'New', workOrderId: woT204 },
    { id: 'bd-2', unitId: eq('84').id, kind: 'Electrical', severity: 'Limping — Needs Service', lat: eq('84').lat, lng: eq('84').lng, locationText: bd2Loc, contactName: bd2Op, contactPhone: '(903) 555-0142', notes: 'LMI reading high, operating derated per supervisor.', photos: [], reportedBy: 'Dispatch', reportedAt: ts(-1, 15, 20), status: 'Acknowledged', workOrderId: wo86 },
  ]
  void hNow

  // ---------- DVIRs ----------
  const dvirs: T.Dvir[] = []
  employees.filter(e => e.homeTruckId).forEach((e, i) => {
    for (let k = 1; k <= 3; k++) {
      const defect = i === 3 && k === 2
      dvirs.push({ id: `dv-${dvirs.length + 1}`, unitId: e.homeTruckId!, employeeId: e.id, date: addDays(T0, -k), at: ts(-k, 5, 20), items: Object.fromEntries(DVIR_ITEMS.map(x => [x, defect && x === 'Brakes' ? 'defect' : 'ok'])) as Record<string, 'ok' | 'defect'>, defects: defect ? 'Air leak at rear axle chamber' : '', safeToOperate: !defect, workOrderId: defect ? woTR404 : undefined })
    }
  })

  // ---------- inventory ----------
  type IR = [string, string, number, number, string, string, string, number, boolean, string?]
  const INV: IR[] = [
    ['Polyester round sling 10 ft — purple (2,600 lb)', 'Slings', 24, 10, 'ea', 'A-01', 'Lift-All', 38, false, '2,600 lb vertical'],
    ['Polyester round sling 20 ft — green (5,300 lb)', 'Slings', 16, 8, 'ea', 'A-01', 'Lift-All', 74, false, '5,300 lb vertical'],
    ['Polyester round sling 20 ft — red (13,200 lb)', 'Slings', 8, 6, 'ea', 'A-02', 'Lift-All', 168, false, '13,200 lb vertical'],
    ['Wire rope sling 1" × 20 ft EIPS', 'Slings', 12, 6, 'ea', 'A-03', 'Bridon-Bekaert', 312, true, '9.8 t vertical'],
    ['Wire rope sling 1-1/2" × 30 ft EIPS', 'Slings', 4, 4, 'ea', 'A-03', 'Bridon-Bekaert', 845, true, '21 t vertical'],
    ['Synthetic web sling 4" × 12 ft', 'Slings', 30, 12, 'ea', 'A-04', 'Lift-All', 44, false, '6,400 lb vertical'],
    ['Chain sling 3/8" G100 double leg', 'Slings', 3, 4, 'ea', 'A-05', 'Peerless', 690, true, '10,600 lb'],
    ['Screw pin shackle 1/2" (2 t)', 'Shackles', 60, 20, 'ea', 'B-01', 'Crosby G-209', 14, false, '2 t'],
    ['Bolt-type shackle 1" (8.5 t)', 'Shackles', 28, 12, 'ea', 'B-01', 'Crosby G-2130', 72, false, '8.5 t'],
    ['Bolt-type shackle 1-1/2" (17 t)', 'Shackles', 14, 6, 'ea', 'B-02', 'Crosby G-2130', 198, true, '17 t'],
    ['Bolt-type shackle 2-1/2" (55 t)', 'Shackles', 4, 2, 'ea', 'B-02', 'Crosby G-2140', 1350, true, '55 t'],
    ['Bolt-type shackle 3" (85 t)', 'Shackles', 2, 2, 'ea', 'B-03', 'Crosby G-2140', 2480, true, '85 t'],
    ['Binder chain 3/8" G70 × 20 ft', 'Chains & Binders', 48, 24, 'ea', 'C-01', 'Peerless', 62, false],
    ['Binder chain 1/2" G70 × 20 ft', 'Chains & Binders', 36, 24, 'ea', 'C-01', 'Peerless', 98, false],
    ['Ratchet binder 1/2"–5/8"', 'Chains & Binders', 40, 20, 'ea', 'C-02', 'Peerless', 58, false],
    ['Ratchet strap 4" × 30 ft', 'Chains & Binders', 18, 30, 'ea', 'C-03', 'Kinedyne', 32, false],
    ['Spreader bar 20 t × 20 ft (modular)', 'Spreaders & Beams', 2, 1, 'ea', 'Yard-SB', 'Modulift', 9800, true, '20 t'],
    ['Lifting beam 50 t × 12 ft', 'Spreaders & Beams', 1, 1, 'ea', 'Yard-SB', 'Caldwell', 14500, true, '50 t'],
    ['Wind blade yoke attachment', 'Spreaders & Beams', 1, 1, 'ea', 'Yard-SB', 'Liftra', 38000, true],
    ['Swivel hoist ring 1"', 'Rigging Hardware', 10, 6, 'ea', 'B-04', 'Crosby HR-125', 210, false],
    ['Turnbuckle 1" jaw-jaw', 'Rigging Hardware', 12, 6, 'ea', 'B-05', 'Crosby HG-228', 88, false],
    ['Tag line 5/8" × 100 ft', 'Rigging Hardware', 22, 15, 'ea', 'B-06', 'Samson', 64, false],
    ['Hard hat — Southern red', 'PPE', 46, 25, 'ea', 'P-01', 'MSA V-Gard', 24, false],
    ['Safety glasses — clear', 'PPE', 180, 100, 'pr', 'P-02', '3M SecureFit', 4, false],
    ['Impact gloves (L)', 'PPE', 22, 60, 'pr', 'P-03', 'Ironclad', 16, false],
    ['FR shirt — 2XL', 'PPE', 18, 12, 'ea', 'P-04', 'Carhartt FR', 62, false],
    ['Full-body harness w/ SRL', 'PPE', 14, 10, 'ea', 'P-05', 'DBI-SALA ExoFit', 389, true],
    ['Hi-vis vest Class 2', 'PPE', 64, 30, 'ea', 'P-06', 'Radians', 9, false],
    ['Hearing protection (box 200)', 'PPE', 6, 4, 'box', 'P-07', 'Howard Leight', 42, false],
    ['4-gas monitor', 'Gas Monitors', 9, 6, 'ea', 'G-01', 'BW MicroClip X3', 520, true],
    ['H2S single-gas clip', 'Gas Monitors', 16, 12, 'ea', 'G-01', 'BW Clip', 128, true],
    ['Calibration gas cylinder', 'Gas Monitors', 3, 4, 'ea', 'G-02', 'BW', 145, false],
    ['Crane mat 4 ft × 20 ft hardwood', 'Mats & Cribbing', 64, 40, 'ea', 'Yard-M', 'Sterling', 1450, false],
    ['Outrigger pad 4 ft × 4 ft composite', 'Mats & Cribbing', 22, 16, 'ea', 'Yard-M', 'DICA', 980, false],
    ['Cribbing 6×6 × 4 ft', 'Mats & Cribbing', 120, 60, 'ea', 'Yard-M', 'Local', 18, false],
    ['Torque multiplier 1" drive', 'Tools', 3, 2, 'ea', 'T-01', 'Norbar', 2650, true],
    ['Hydraulic torque wrench set', 'Tools', 2, 2, 'set', 'T-01', 'HYTORC', 11800, true],
    ['Load cell 50 t wireless', 'Tools', 2, 1, 'ea', 'T-02', 'Straightpoint', 4900, true],
    ['Anemometer (crane mounted)', 'Tools', 4, 2, 'ea', 'T-03', 'Hirschmann', 640, true],
    ['Mud flap 24×30', 'Truck & Trailer Parts', 14, 8, 'ea', 'S-01', 'Minimizer', 38, false],
    ['Air brake chamber 30/30', 'Truck & Trailer Parts', 5, 6, 'ea', 'S-02', 'Haldex', 185, false],
    ['LED marker light kit', 'Truck & Trailer Parts', 20, 10, 'kit', 'S-03', 'Grote', 26, false],
    ['Glad hand seal (pk 10)', 'Truck & Trailer Parts', 12, 6, 'pk', 'S-03', 'Phillips', 11, false],
    ['Steer tire 315/80R22.5', 'Truck & Trailer Parts', 2, 4, 'ea', 'S-04', 'Michelin', 640, false],
    ['Engine oil 15W-40 (55 gal drum)', 'Fluids & Filters', 4, 2, 'drum', 'F-01', 'Shell Rotella T4', 940, false],
    ['Hydraulic fluid AW46 (55 gal)', 'Fluids & Filters', 3, 2, 'drum', 'F-01', 'Mobil DTE 25', 1020, false],
    ['DEF (2.5 gal jug)', 'Fluids & Filters', 30, 20, 'jug', 'F-02', 'BlueDEF', 18, false],
    ['Antifreeze ELC 50/50 (gal)', 'Fluids & Filters', 24, 12, 'gal', 'F-02', 'Shell Rotella ELC', 19, false],
    ['Multipurpose grease (14 oz)', 'Fluids & Filters', 48, 24, 'tube', 'F-03', 'Mobilgrease XHP 222', 9, false],
    ['Penetrating catalyst (11 oz)', 'Fluids & Filters', 30, 12, 'can', 'F-03', "B'laster PB", 8, false],
    ['Multi-use lubricant (12 oz)', 'Fluids & Filters', 36, 12, 'can', 'F-03', 'WD-40', 7, false],
    ['Brake parts cleaner (14 oz)', 'Fluids & Filters', 20, 24, 'can', 'F-03', 'CRC Brakleen', 6, false],
    ['Oil spill kit 20 gal', 'Fluids & Filters', 7, 6, 'kit', 'F-04', 'Brady SPC', 165, false],
  ]
  const sdsMap: Record<string, string> = { 'Shell Rotella T4': 'sds-1', 'Mobil DTE 25': 'sds-2', BlueDEF: 'sds-3', 'Shell Rotella ELC': 'sds-4', 'Mobilgrease XHP 222': 'sds-5', "B'laster PB": 'sds-6', 'WD-40': 'sds-7', 'CRC Brakleen': 'sds-8', BW: 'sds-9' }
  const legacyItems = INV.map(([name, category, onHand, min, unit, bin, manufacturer, cost, serialized, wll], i) => ({
    id: `itm-${i + 1}`, sku: `SLH-${category.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase()}-${100 + i}`, name, category, onHand, min, unit, bin, manufacturer, cost, serialized, wll,
    inspectionDue: ['Slings', 'Shackles', 'Spreaders & Beams', 'Gas Monitors'].includes(category) || (category === 'PPE' && serialized) ? addDays(T0, r.int(-5, 90)) : undefined,
    sdsId: sdsMap[manufacturer],
  }))
  const legacyCheckouts: T.Checkout[] = []
  const coItems = legacyItems.filter(i => ['Slings', 'Shackles', 'Gas Monitors', 'Tools', 'PPE', 'Spreaders & Beams', 'Chains & Binders'].includes(i.category))
  const coJobs = jobs.filter(x => live(x) && x.startDate <= T0 && x.endDate >= addDays(T0, -10))
  for (let i = 0; i < 28; i++) {
    const it = r.pick(coItems); const e = r.pick(field.filter(x => x.craft !== 'Safety'))
    const outD = addDays(T0, -r.int(1, 30)); const j = r.pick(coJobs)
    const returned = r.chance(0.3) ? addDays(outD, r.int(1, 6)) : undefined
    legacyCheckouts.push({ id: `chk-${i + 1}`, itemId: it.id, qty: it.serialized ? 1 : r.int(1, 6), employeeId: e.id, jobId: j.id, out: outD, due: addDays(outD, r.int(5, 21)), returned: returned && returned > T0 ? T0 : returned, condition: returned ? (r.chance(0.15) ? 'Damaged' : 'Good') : undefined })
  }
  void legacyCheckouts // legacy RNG draws kept so the rest of the seed stays byte-identical
  const inv = seedInventory({ T0, now, employees, equipment, jobs, workOrders, customers, vendors, costs, bills })
  const { items, checkouts, invLedger, pos, partsRequests, cycleCounts } = inv
  const infoChanges = seedMyInfo(T0, employees)
  const certShares = seedCertShares(T0, employees, certs, assignments)
  const timeRecs = seedRecon({ T0, employees, jobs, sites, branches: BRANCHES, tickets, time, equipment })
  const sds: T.Sds[] = [
    { id: 'sds-1', product: 'Rotella T4 Triple Protection 15W-40', manufacturer: 'Shell', use: 'Diesel engine oil', signal: 'None', hazards: ['Used oil may contain harmful impurities', 'Prolonged skin contact may cause irritation'], ppe: ['Nitrile gloves', 'Safety glasses'], firstAid: 'Skin: wash with soap and water. Eyes: flush 15 min. Ingestion: do not induce vomiting.', revised: '2025-03-12' },
    { id: 'sds-2', product: 'DTE 25 Hydraulic Oil (AW46)', manufacturer: 'Mobil', use: 'Crane hydraulic systems', signal: 'None', hazards: ['High-pressure injection injury risk', 'Combustible when heated'], ppe: ['Nitrile gloves', 'Safety glasses', 'Face shield for pressurized work'], firstAid: 'Injection injury: seek immediate medical attention even if wound appears minor.', revised: '2024-11-02' },
    { id: 'sds-3', product: 'BlueDEF Diesel Exhaust Fluid', manufacturer: 'Old World Industries', use: 'SCR emissions systems', signal: 'None', hazards: ['Not classified as hazardous', 'Slippery when spilled'], ppe: ['Gloves', 'Safety glasses'], firstAid: 'Eyes: rinse with water. Skin: wash.', revised: '2025-01-20' },
    { id: 'sds-4', product: 'Rotella ELC Antifreeze/Coolant 50/50', manufacturer: 'Shell', use: 'Engine coolant', signal: 'Warning', hazards: ['Harmful if swallowed (ethylene glycol)', 'May cause kidney damage through prolonged exposure'], ppe: ['Nitrile gloves', 'Safety glasses'], firstAid: 'If swallowed: call Poison Control immediately (1-800-222-1222).', revised: '2024-08-30' },
    { id: 'sds-5', product: 'Mobilgrease XHP 222', manufacturer: 'Mobil', use: 'Pins, bushings, slew bearings', signal: 'None', hazards: ['High-pressure grease gun injection risk'], ppe: ['Gloves', 'Safety glasses'], firstAid: 'Injection: emergency medical care.', revised: '2024-06-14' },
    { id: 'sds-6', product: 'PB B’laster Penetrating Catalyst', manufacturer: "B'laster", use: 'Freeing rusted bolts & pins', signal: 'Danger', hazards: ['Extremely flammable aerosol', 'Pressurized container — may burst if heated', 'May be fatal if swallowed and enters airways'], ppe: ['Gloves', 'Safety glasses', 'Use in ventilated area'], firstAid: 'If swallowed: do NOT induce vomiting; call Poison Control.', revised: '2025-02-01' },
    { id: 'sds-7', product: 'WD-40 Multi-Use Product (aerosol)', manufacturer: 'WD-40 Company', use: 'Lubricant / moisture displacement', signal: 'Danger', hazards: ['Extremely flammable aerosol', 'Aspiration hazard'], ppe: ['Safety glasses', 'Keep away from ignition sources'], firstAid: 'Ingestion: do not induce vomiting. Inhalation: move to fresh air.', revised: '2025-04-09' },
    { id: 'sds-8', product: 'Brakleen Brake Parts Cleaner', manufacturer: 'CRC Industries', use: 'Degreasing brake components', signal: 'Danger', hazards: ['Extremely flammable aerosol', 'Causes skin & serious eye irritation', 'May cause drowsiness or dizziness'], ppe: ['Chemical gloves', 'Goggles', 'Ventilation'], firstAid: 'Inhalation: fresh air; seek medical attention if symptoms persist.', revised: '2024-12-18' },
    { id: 'sds-9', product: 'Calibration Gas (H2S/CO/O2/LEL mix)', manufacturer: 'BW Technologies', use: 'Gas monitor bump test & calibration', signal: 'Danger', hazards: ['Contains gas under pressure', 'Toxic if inhaled (H2S component)'], ppe: ['Use regulator only', 'Ventilated area'], firstAid: 'Inhalation: move to fresh air, call 911 if symptoms.', revised: '2024-10-05' },
    { id: 'sds-10', product: 'Ultra-Low Sulfur Diesel #2', manufacturer: 'Various', use: 'Crane & truck fuel', signal: 'Danger', hazards: ['Flammable liquid & vapor', 'Suspected of causing cancer', 'Toxic to aquatic life'], ppe: ['Nitrile gloves', 'Safety glasses', 'Spill kit at fueling'], firstAid: 'Skin: wash. Ingestion: do not induce vomiting.', revised: '2025-05-22' },
    { id: 'sds-11', product: 'Marking Paint (inverted, aerosol)', manufacturer: 'Rust-Oleum', use: 'Outrigger & pad layout marking', signal: 'Danger', hazards: ['Extremely flammable aerosol', 'Causes eye irritation'], ppe: ['Glasses', 'Ventilation'], firstAid: 'Eyes: rinse cautiously with water for several minutes.', revised: '2024-07-11' },
    { id: 'sds-12', product: 'Propane (forklift cylinder)', manufacturer: 'Various', use: 'Forklift fuel', signal: 'Danger', hazards: ['Extremely flammable gas', 'Contains gas under pressure', 'May displace oxygen'], ppe: ['Insulated gloves for cylinder change', 'Glasses'], firstAid: 'Frostbite: thaw with lukewarm water; seek medical care.', revised: '2025-01-09' },
  ]
  enrichSds(sds, T0)

  // ---------- HR ----------
  const hires: T.Hire[] = [
    { id: 'hire-1', first: 'Caleb', last: 'Riggins', email: emailFor('Caleb', 'Riggins'), empNo: `SLH-${empSeq++}`, craft: 'Rigger', start: addDays(T0, 2), phone: '(405) 555-2231', supervisorId: supOKC[1].id, steps: { account: true, profile: true, id: true, emergency: true, sizes: false, training: false, sds: false }, created: ts(-3, 9) },
    { id: 'hire-2', first: 'Maria', last: 'Delacruz', email: emailFor('Maria', 'Delacruz'), empNo: `SLH-${empSeq++}`, craft: 'Truck Driver', start: addDays(T0, 6), phone: '(432) 555-2290', supervisorId: supMID[0].id, steps: { account: true, profile: false, id: false, emergency: false, sizes: false, training: false, sds: false }, created: ts(-1, 14) },
  ]
  const pto: T.PtoRequest[] = []
  r.shuffle(field.filter(e => e !== john)).slice(0, 9).forEach((e, i) => { const from = addDays(T0, r.int(3, 40)); const d = r.int(1, 5); pto.push({ id: `pto-${i + 1}`, employeeId: e.id, from, to: addDays(from, d - 1), kind: r.pick(['Vacation', 'Vacation', 'Personal', 'Sick'] as const), hours: d * 10, status: i < 4 ? 'Pending' : i < 8 ? 'Approved' : 'Denied', requestedAt: ts(-r.int(0, 8), 8), decidedBy: i >= 4 ? 'Dana Whitfield' : undefined, note: i === 8 ? 'Denied — coverage: 3 operators already off that week' : undefined }) })
  const hrRecords: T.HrRecord[] = []
  const HRT: Record<T.HrRecord['kind'], [string, string]> = {
    Review: ['Annual performance review', 'Meets/exceeds on safety & quality. Goal: Rigger II certification.'],
    Commendation: ['Customer commendation — zero-incident outage', 'Customer superintendent called to recognize crew professionalism.'],
    'Write-Up': ['Late to site — verbal warning documented', 'Arrived 45 min late without calling dispatch. Reviewed call-in policy.'],
    Document: ['Signed handbook acknowledgment', 'Employee handbook v2026 acknowledged.'],
    'Pay Change': ['Merit increase', 'Effective next pay period (amount restricted to HR/Payroll).'],
  }
  r.shuffle(field).slice(0, 18).forEach((e, i) => {
    const kind = (['Review', 'Review', 'Commendation', 'Write-Up', 'Document', 'Pay Change'] as const)[i % 6]
    hrRecords.push({ id: `hr-${i + 1}`, employeeId: e.id, date: addDays(T0, -r.int(5, 300)), kind, title: HRT[kind][0], detail: HRT[kind][1], by: 'Dana Whitfield', rating: kind === 'Review' ? r.int(3, 5) : undefined, acknowledged: r.chance(0.8), confidential: kind === 'Write-Up' || kind === 'Pay Change' })
  })

  // ---------- Safety ----------
  const onSite = jobs.find(j => j.status === 'On Site' && j.type === 'Wind')
  const incidents: T.Incident[] = [
    { id: 'inc-1', no: 'INC-2026-041', date: addDays(T0, -1), jobId: onSite?.id, kind: 'Near Miss', severity: 'High', description: 'Tag line slipped during blade pick; load rotated toward tower. Area was clear; no contact.', rootCause: 'Single tag line in 25 mph gusts', correctiveAction: 'Two tag lines required on all blade picks; wind limit briefing at JSA.', status: 'Corrective Action', reportedBy: 'David Miller', photos: 2 },
    { id: 'inc-2', no: 'INC-2026-040', date: addDays(T0, -4), kind: 'First Aid', severity: 'Low', description: 'Laceration to hand while handling cribbing. Bandage applied, returned to work.', rootCause: 'Gloves not worn for material handling', correctiveAction: 'Toolbox talk on hand protection.', status: 'Closed', reportedBy: 'Cale Smith', photos: 1, employeeId: field[10].id },
    { id: 'inc-3', no: 'INC-2026-039', date: addDays(T0, -9), unitId: eq('T-203').id, kind: 'Near Miss', severity: 'Medium', description: 'Trailer tracked close to the gate post at a customer entrance; spotter stopped the turn. No contact.', status: 'Investigating', reportedBy: 'Steve Brown', photos: 3 },
    { id: 'inc-4', no: 'INC-2026-038', date: addDays(T0, -16), kind: 'Environmental', severity: 'Low', description: 'Hydraulic hose weep — 1 gal on mat. Spill kit used, soil removed.', correctiveAction: 'Hose replaced; pre-use inspection reminder.', status: 'Closed', reportedBy: 'Cale Smith', photos: 2 },
    { id: 'inc-5', no: 'INC-2026-037', date: addDays(T0, -27), kind: 'Property Damage', severity: 'Medium', description: 'Outrigger pad cracked under load on soft ground.', rootCause: 'No ground bearing report for temporary pad', correctiveAction: 'Ground bearing report now required in Job Builder for all >200 t jobs.', status: 'Closed', reportedBy: 'Rosa Delgado', photos: 4 },
  ]
  incidents.push({ id: 'inc-6', no: 'INC-2025-012', date: addDays(T0, -412), kind: 'Recordable', severity: 'Medium', description: 'Rigger strained lower back lifting cribbing; physical therapy, returned to full duty after 6 days.', rootCause: 'Manual lift of oversized cribbing', correctiveAction: 'Cribbing over 60 lb moved by forklift or two-person lift.', status: 'Closed', reportedBy: 'Cale Smith', photos: 1 })
  const talks: T.SafetyTalk[] = []
  jobs.filter(j => live(j) && between(T0, j.startDate, j.endDate)).slice(0, 14).forEach((j, i) => {
    const crew = assignments.filter(a => a.jobId === j.id && a.date === T0).map(a => a.employeeId)
    talks.push({ id: `jsa-${i + 1}`, kind: 'JSA', title: `Daily JSA — Job #${j.jobNo}`, jobId: j.id, date: T0, leaderId: j.supervisorId ?? crew[0] ?? cale.id, attendeeIds: crew, hazards: ['Suspended loads', 'Wind', 'Pinch points', 'Overhead power lines'].slice(0, r.int(2, 4)), controls: ['Exclusion zone barricaded', 'Wind limits reviewed', 'Tag lines on every pick', 'Spotter assigned'].slice(0, r.int(2, 4)), signed: i % 4 !== 3 && j.jobNo !== '10125' })
  })
  ;['Hand protection & pinch points', 'Heat stress — hydration plan', 'Working near power lines (OSHA 1926.1408)', 'Pre-trip inspections save lives'].forEach((t, i) => talks.push({ id: `tbt-${i + 1}`, kind: 'Toolbox Talk', title: t, date: addDays(T0, -i * 7 - 1), leaderId: cale.id, attendeeIds: r.shuffle(field).slice(0, r.int(12, 30)).map(e => e.id), hazards: [], controls: [], signed: true }))
  const inspections: T.Inspection[] = []
  cranes.forEach(c => inspections.push({ id: `ins-${inspections.length + 1}`, kind: 'Crane Annual', unitId: c.id, date: addDays(c.annualInspection, -365), due: c.annualInspection, inspectorId: cale.id, result: c.annualInspection < T0 ? 'Due' : 'Pass', notes: 'Third-party annual (demo)' }))
  cranes.slice(0, 12).forEach(c => inspections.push({ id: `ins-${inspections.length + 1}`, kind: 'Crane Frequent', unitId: c.id, date: addDays(T0, -r.int(0, 25)), due: addDays(T0, r.int(1, 30)), inspectorId: mechanics[r.int(0, 3)].id, result: 'Pass' }))
  inspections.push({ id: `ins-${inspections.length + 1}`, kind: 'Crane Frequent', unitId: eq('19').id, date: addDays(T0, -8), due: addDays(T0, -8), inspectorId: adam.id, result: 'Fail', notes: 'Swing bearing play — tagged out' })
  items.filter(i => i.inspectionDue).forEach(it => inspections.push({ id: `ins-${inspections.length + 1}`, kind: 'Rigging', itemId: it.id, date: addDays(it.inspectionDue!, -90), due: it.inspectionDue!, inspectorId: cale.id, result: it.inspectionDue! < T0 ? 'Due' : 'Pass' }))
  for (let i = 0; i < 6; i++) inspections.push({ id: `ins-${inspections.length + 1}`, kind: 'Fire Extinguisher', unitId: semis[i].id, date: addDays(T0, -r.int(20, 330)), due: addDays(T0, r.int(-3, 40)), inspectorId: cale.id, result: i === 2 ? 'Fail' : 'Pass', notes: i === 2 ? 'Gauge in red — replace' : undefined })

  // ---------- multi-year history for analytics ----------
  const history: T.HistJob[] = []
  let hN = 0
  const curY = Number(T0.slice(0, 4)), curM = Number(T0.slice(5, 7))
  const season = [0.72, 0.76, 0.92, 1.0, 1.06, 1.1, 1.04, 1.02, 1.08, 1.12, 0.96, 0.78]
  const growth: Record<number, number> = { [curY - 2]: 0.84, [curY - 1]: 0.95, [curY]: 1.07 }
  for (let y = curY - 2; y <= curY; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === curY && m >= curM) break
      cranes.forEach(c => {
        if (y === curY - 2 && ['70', '66'].includes(c.unit) && m < 6) return // newer fleet additions
        const util = Math.min(0.97, (0.5 + r.next() * 0.32) * season[m - 1] * growth[y] * (c.type === 'Crawler' ? 1.05 : 1))
        const days = Math.round(util * 23)
        if (days < 2) return
        const siteT: T.JobType = r.pick(c.branchId === 'br-mid' ? ['Oil & Gas', 'Refinery', 'Oil & Gas', 'Wind', 'Commercial'] as const : c.branchId === 'br-kil' ? ['Industrial', 'Power', 'Industrial', 'Commercial'] as const : ['Wind', 'Refinery', 'Commercial', 'Industrial', 'Power', 'Oil & Gas'] as const)
        const revenue = Math.round(days * (c.dayRate ?? 5000) * (0.9 + r.next() * 0.22))
        const marginBias = siteT === 'Wind' ? 0.34 : siteT === 'Refinery' ? 0.31 : siteT === 'Commercial' ? 0.2 : siteT === 'Oil & Gas' ? 0.29 : 0.26
        const cost = Math.round(revenue * (1 - marginBias + (r.next() - 0.5) * 0.14 + (c.unit === '19' ? 0.12 : 0)))
        history.push({ id: `h-${++hN}`, year: y, month: m, craneId: c.id, customerId: customerFor(siteT, sitesFor(c.branchId).find(x => siteType(x) === siteT)).id, type: siteT, revenue, cost, days, divisionId: 'div-slh', branchId: c.branchId })
      })
      ;([['div-str', 'Heavy Haul', 'br-okc', 150000], ['div-str', 'Heavy Haul', 'br-mid', 45000], ['div-sup', 'Uptower', 'br-okc', 110000], ['div-smm', 'Machine Moving', 'br-kil', 95000], ['div-smm', 'Machine Moving', 'br-okc', 35000]] as const).forEach(([d, t, b, base]) => {
        const revenue = Math.round(base * season[m - 1] * growth[y] * (0.85 + r.next() * 0.3) * (d === 'div-sup' && y === curY ? 1.25 : 1))
        const cost = Math.round(revenue * (t === 'Heavy Haul' ? 0.76 : t === 'Uptower' ? 0.64 : 0.7) * (0.94 + r.next() * 0.12))
        history.push({ id: `h-${++hN}`, year: y, month: m, craneId: '', customerId: customerFor(t, sitesFor(b)[0]).id, type: t, revenue, cost, days: r.int(14, 28), divisionId: d, branchId: b })
      })
    }
  }

  // Single-branch scale: OKC is the business; Midland and Kilgore are small satellites. Pin last year's totals to believable levels for the fleet.
  const TARGET_LAST_YEAR: Record<string, number> = { 'br-okc': 28_800_000, 'br-mid': 4_300_000, 'br-kil': 3_100_000 }
  Object.entries(TARGET_LAST_YEAR).forEach(([b, target]) => {
    const got = history.filter(h => h.branchId === b && h.year === curY - 1).reduce((s, h) => s + h.revenue, 0)
    const k = got ? target / got : 1
    history.filter(h => h.branchId === b).forEach(h => { h.revenue = Math.round(h.revenue * k); h.cost = Math.round(h.cost * k) })
  })

  // ---------- company contacts (DEMO numbers, editable in Settings) ----------
  const contacts: T.Contact[] = [
    { id: 'ct-1', label: 'Dispatch (24/7)', name: 'Lori Haynes · OKC Dispatch', phone: '(405) 555-0100', group: 'Dispatch', primary: true },
    { id: 'ct-2', label: 'Dispatch — Midland', name: 'Travis Cole', phone: '(432) 555-0100', group: 'Dispatch' },
    { id: 'ct-3', label: 'Front Desk', name: 'Southern Lifting & Hoisting — HQ', phone: '(405) 555-0101', group: 'Office' },
    { id: 'ct-4', label: 'Field Operations', name: 'Chad Weathers', phone: '(405) 555-0160', group: 'Office' },
    { id: 'ct-5', label: 'Shop / Mechanics', name: 'Robert Adams', phone: '(405) 555-0120', group: 'Shop' },
    { id: 'ct-6', label: 'Shop — Service Planning', name: 'Adam Webb', phone: '(405) 555-0121', group: 'Shop' },
    { id: 'ct-7', label: 'Safety', name: 'Cale Smith', phone: '(405) 555-0130', group: 'Safety' },
    { id: 'ct-8', label: 'HR', name: 'Dana Whitfield', phone: '(405) 555-0110', group: 'HR' },
    { id: 'ct-9', label: 'Payroll', name: 'Karen Ortiz', phone: '(405) 555-0140', group: 'Payroll' },
    { id: 'ct-10', label: 'Sales — Projects', name: 'Chris Ramos', phone: '(405) 555-0150', group: 'Sales' },
    { id: 'ct-11', label: 'Rigging & Inventory', name: 'Brian Morris', phone: '(405) 555-0125', group: 'Shop' },
    { id: 'ct-12', label: 'Emergency', name: 'Police · Fire · EMS', phone: '911', group: 'Emergency' },
  ]

  const notices: T.Notice[] = [
    { id: 'n-1', at: new Date(now.getTime() - 50 * 60000).toISOString(), severity: 'Urgent', title: 'Breakdown: T-204 steer tire blowout', body: 'I-35 SB MM 42 near Ardmore. Unit down. Shop notified.', mandatory: true, roles: ['owner', 'dispatch', 'shop'], ref: { type: 'equipment', id: eq('T-204').id }, read: false },
    { id: 'n-2', at: ts(0, 7, 5), severity: 'Action Required', title: 'Crane 19 tagged OUT OF SERVICE', body: 'Swing bearing — cannot be dispatched until Shop release.', mandatory: true, roles: ['owner', 'dispatch', 'shop', 'safety'], ref: { type: 'equipment', id: eq('19').id }, read: false },
    { id: 'n-3', at: ts(-1, 16, 40), severity: 'Info', title: 'Lift plan approved — Job #10125', body: 'Prairie Lift Engineering rev B uploaded to the job vault.', mandatory: false, roles: ['owner', 'dispatch', 'ops', 'field'], ref: { type: 'job', id: j10125.id }, read: false },
  ]
  const audit: T.AuditEvent[] = ([
    [-2, 9, 'Lori Haynes', 'dispatch', 'Assigned crane', `Job #${j10125.jobNo}`, 'Crane 28 · LR 1500 (main) + Crane 1200 tailing (Job #10124), permanent crew (auto)'],
    [-1, 14, 'Dana Whitfield', 'hr', 'Created new hire', 'Maria Delacruz', 'Email maria.delacruz@slh-demo.example issued'],
    [-1, 16, 'Karen Ortiz', 'payroll', 'Bulk approved time', '42 entries', 'Week ending — 6 jobs'],
    [-1, 17, 'Cale Smith', 'safety', 'Verified certification', 'NCCCO Rigger II', 'Credential verified with NCCCO lookup'],
    [0, 6, 'Robert Adams', 'shop', 'Tagged out of service', 'Crane 19 · RT90-1', 'Swing bearing play — lockout'],
    [0, 7, 'Greg Lindsey', 'accounting', 'Coded vendor bill', 'PRAI-48812', `Job #${j10125.jobNo} · Engineering`],
  ] as [number, number, string, T.RoleKey, string, string, string][]).map(([d, h, actor, role, action, entity, detail], i) => ({ id: `au-${i + 1}`, at: ts(d, h, 10 + i), actor, role, action, entity, detail }))
  {
    // ~40 more believable events across the last 10 days, with before/after diffs
    const ar = rng(4242)
    const okcJobs = jobs.filter(j => j.branchId === 'br-okc' && j.stage !== 'Quote' && !j.closedOut)
    const ops = employees.filter(e => e.craft === 'Operator' && e.branchId === 'br-okc')
    const cranes = equipment.filter(e => e.category === 'Crane' && e.branchId === 'br-okc')
    const mk: (() => [string, T.RoleKey, string, string, string, T.AuditEvent['diff']])[] = [
      () => { const j = ar.pick(okcJobs); const a = ar.pick(ops), b = ar.pick(ops); return ['Lori Haynes', 'dispatch', 'Moved crew member', `Job #${j.jobNo}`, `Operator swap on ${j.name}`, [{ field: 'Operator', from: `${a.first} ${a.last}`, to: `${b.first} ${b.last}` }]] },
      () => { const j = ar.pick(okcJobs); return ['Chad Weathers', 'ops', 'Changed job dates', `Job #${j.jobNo}`, j.name, [{ field: 'End date', from: addDays(j.endDate, -2), to: j.endDate }]] },
      () => { const j = ar.pick(okcJobs); return ['Chad Weathers', 'ops', 'Updated start time', `Job #${j.jobNo}`, 'Customer requested earlier start', [{ field: 'Start time', from: '07:00', to: j.startTime }]] },
      () => { const j = ar.pick(okcJobs); return ['Greg Lindsey', 'accounting', 'Approved vendor bill', `Job #${j.jobNo}`, 'Posted to job costing', [{ field: 'Status', from: 'Pending Approval', to: 'Approved' }]] },
      () => { const e = ar.pick(ops); return ['Karen Ortiz', 'payroll', 'Edited time entry', `${e.first} ${e.last}`, 'Corrected lunch deduction', [{ field: 'Hours', from: '10.5', to: '10.0' }]] },
      () => { const e = ar.pick(ops); return ['Dana Whitfield', 'hr', 'Approved PTO', `${e.first} ${e.last}`, 'Vacation request', [{ field: 'PTO status', from: 'Requested', to: 'Approved' }]] },
      () => { const c = ar.pick(cranes); return ['Robert Adams', 'shop', 'Closed work order', `Crane ${c.unit}`, 'Annual + 250-hr service', [{ field: 'Status', from: 'In Service', to: 'Available' }, { field: 'Next service', from: 'Due now', to: '+250 hrs' }]] },
      () => { const c = ar.pick(cranes); return ['Robert Adams', 'shop', 'Logged hour meter', `Crane ${c.unit}`, 'DVIR + hours', [{ field: 'Hours', from: String((c.hours ?? 4000) - 9), to: String(c.hours ?? 4000) }]] },
      () => { const j = ar.pick(okcJobs); return ['John Smith', 'field', 'Customer signed ticket', `Job #${j.jobNo}`, 'Signature captured on phone', [{ field: 'Ticket', from: 'Unsigned', to: 'Signed' }]] },
      () => { const e = ar.pick(ops); return ['Cale Smith', 'safety', 'Uploaded certification', `${e.first} ${e.last}`, 'NCCCO card scan', [{ field: 'Expires', from: '—', to: addDays(T0, 1400) }]] },
      () => { const j = ar.pick(okcJobs); return ['Ownership Team', 'owner', 'Viewed job costing', `Job #${j.jobNo}`, 'Profit waterfall', undefined] },
      () => ['Greg Lindsey', 'accounting', 'Exported', 'AR aging', 'CSV export · 62 rows', undefined],
    ]
    for (let i = 0; i < 40; i++) {
      const [actor, role, action, entity, detail, diff] = ar.pick(mk)()
      const dd = -ar.int(0, 10); const hh = dd === 0 ? ar.int(5, Math.max(5, new Date().getHours() - 1)) : ar.int(6, 18)
      audit.push({ id: `au-x${i}`, at: ts(dd, hh, ar.int(0, 59)), actor, role, action, entity, detail, diff })
    }
    audit.sort((a, b) => b.at.localeCompare(a.at))
  }

  // ---------- wind farms: link seeded wind sites to real USWTDB farms ----------
  const windSites: Record<string, T.WindSite> = {}
  sites.forEach(s => {
    const w = WIND_DEMO[s.name]; if (!w) return
    windSites[w.farmId] = { farmId: w.farmId, demo: true, autoNumber: true, labels: {}, gate: s.gate, notes: `Demo notes: ${w.count} turbines (${w.model}). Check in at the O&M building before driving pads. Site radio channel 4.`,
      contacts: [{ name: 'Site Manager (demo)', role: 'O&M site manager', phone: '(580) 555-0141' }, { name: 'HSE Lead (demo)', role: 'Safety', phone: '(580) 555-0167' }],
      pins: [{ id: `pin-${w.farmId}-om`, kind: 'O&M', label: 'O&M building (demo pin)', lat: w.om.lat, lng: w.om.lng, demo: true }, ...(s.name === 'Sooner Ridge Wind' ? [{ id: `pin-${w.farmId}-gate`, kind: 'Gate' as const, label: 'Main gate (demo pin)', lat: w.om.lat - 0.008, lng: w.om.lng + 0.03, demo: true }, { id: `pin-${w.farmId}-lay`, kind: 'Laydown' as const, label: 'Laydown yard (demo pin)', lat: w.om.lat + 0.006, lng: w.om.lng - 0.035, demo: true }] : [])] }
    jobs.filter(j => j.siteId === s.id).forEach(j => { j.windFarmId = w.farmId; j.turbines = (j.jobNo === '10125' || w.farmId === 'TX-horse-hollow-ii' ? w.turbines : w.turbines.slice(0, 1)).map(t => ({ ...t, model: w.model, hh: w.hh })); const tt = j.turbines; time.filter(te => te.jobId === j.id).forEach((te, i) => { te.turbineId = tt[i % tt.length].caseId }) })
    s.windFarmId = w.farmId; s.name = /\b(wind|project|farm)\b/i.test(w.farmName) ? w.farmName : `${w.farmName} Wind`; s.lat = w.lat; s.lng = w.lng
  })

  // ---------- Chad's adds (Oct 23): appended last and without the RNG so every other seeded record stays the same ----------
  // Placeholder demo contact info (555 numbers, example.com emails) — edit in People → employee → Edit.
  ;([['Brent', 'Strawn', 'Supervisor', 48, '(405) 555-0187', 2001], ['Sammy', 'Tinsley', 'Supervisor', 48, '(405) 555-0193', 2002], ['John', 'Wayne', 'Supervisor', 48, '(405) 555-0196', 2003]] as const).forEach(([first, last, craft, rate, phone, n]) => {
    if (employees.some(e => e.first === first && e.last === last)) return
    employees.push({ id: `emp-${n}`, empNo: `SLH-${n}`, first, last, craft, phone, email: `${first}.${last}@example.com`.toLowerCase(), status: 'Active', perDiemBlocked: [], hireDate: addDays(T0, -14), city: 'Oklahoma City',
      rate, shirt: 'XL', boot: '11', divisionId: 'div-slh', branchId: 'br-okc', emergencyContact: { name: 'Emergency contact (demo)', relation: 'Spouse', phone: '(405) 555-0199' }, address: '100 Demo St, Oklahoma City, OK' })
  })

  // site maps are named from the FINAL site (wind farms are renamed above)
  jobs.forEach(j => { const st = sites.find(x => x.id === j.siteId); if (st) j.docs.forEach(d => { if (d.kind === 'Site Map') d.name = `${st.name} site map.pdf` }) })
  // Chad's three supervisor logins run real crews: each takes over one job that has a crew today (different areas), its
  // supervisor slots, tickets and crew roll-up. No RNG, so the rest of the seed is unchanged.
  {
    const taken = new Set<string>(), areas = new Set<string>()
    const live = jobs.filter(j => j.status !== 'Complete' && assignments.some(a => a.jobId === j.id && a.date === T0)).sort((a, b) => a.jobNo.localeCompare(b.jobNo))
    ;['emp-2001', 'emp-2002', 'emp-2003'].forEach(sid => {
      if (!employees.some(e => e.id === sid)) return
      // they are OKC supervisors (Chad): prefer OKC jobs, one per division
      const j = live.find(x => !taken.has(x.id) && x.branchId === 'br-okc' && !areas.has(x.divisionId)) ?? live.find(x => !taken.has(x.id) && x.branchId === 'br-okc') ?? live.find(x => !taken.has(x.id)); if (!j) return
      taken.add(j.id); areas.add(j.divisionId)
      const old = j.supervisorId; j.supervisorId = sid
      const dates = [...new Set(assignments.filter(a => a.jobId === j.id).map(a => a.date))]
      dates.forEach(d => {
        const supA = assignments.find(a => a.jobId === j.id && a.date === d && (a.position === 'Supervisor' || a.employeeId === old))
        if (supA) { supA.employeeId = sid; supA.position = 'Supervisor' } else assignments.push({ id: `asg-${sid}-${d}`, jobId: j.id, date: d, employeeId: sid, position: 'Supervisor' as T.CrewPosition, source: 'Dispatch' })
      })
      tickets.filter(t => t.jobId === j.id).forEach(t => { t.supervisorId = sid; t.crewIds = t.crewIds.map(c => c === old ? sid : c) })
      const sup = employees.find(e => e.id === sid)!; sup.divisionId = j.divisionId
      new Set(assignments.filter(a => a.jobId === j.id && a.date === T0).map(a => a.employeeId)).forEach(id => { const e = employees.find(x => x.id === id); if (e && e.id !== sid && e.craft !== 'Supervisor') e.supervisorId = sid })
    })
  }

  // union local follows the site (same rule the screens use): OK → IUOE 627, north TX → 178, Gulf TX → 450, elsewhere open shop
  jobs.forEach(j => { const st = sites.find(x => x.id === j.siteId); if (!st) return; j.local = st.state === 'OK' ? 'IUOE Local 627' : st.state === 'TX' ? (st.lat > 31.5 ? 'IUOE Local 178' : 'IUOE Local 450') : 'Non-Union' })
  // demo rig plans (rig up before Hook ready, rig down after the last working day) on a few live crane jobs
  {
    const ad = (d: string, n: number) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
    const cand = jobs.filter(j => j.craneId && j.stage !== 'Quote' && j.stage !== 'Awarded' && j.stage !== 'Complete' && j.endDate >= T0).sort((a, b) => a.startDate.localeCompare(b.startDate))
    const clear = (j: typeof jobs[number]) => !jobs.some(o => o.id !== j.id && o.craneId === j.craneId && o.stage !== 'Quote' && o.stage !== 'Awarded' && o.startDate <= ad(j.endDate, 8) && ad(j.startDate, -6) <= o.endDate)
    const upcoming = cand.filter(j => j.startDate > T0 && clear(j)), running = cand.filter(j => j.startDate <= T0 && clear(j))
    const mk = (j: typeof jobs[number], x: Partial<RigPlan>): RigPlan => ({ craneId: j.craneId!, hookReady: j.startDate, travelDays: 1, upMode: 'days', upDays: 2, downStart: ad(j.endDate, 1), downAmount: 1, downUnit: 'd', ...x })
    const plan: [typeof jobs[number] | undefined, Partial<RigPlan>][] = [
      [upcoming[0], { upDays: 2, travelDays: 1, downAmount: 2, downUnit: 'h', downStart: ad(upcoming[0]?.endDate ?? T0, 0), notes: 'Short pick — rig down same afternoon' }],
      [upcoming[1], { upDays: 3, travelDays: 2, downAmount: 7, downUnit: 'd', notes: 'Full crawler teardown — about a week' }],
      [upcoming[2], { upDays: 2, travelDays: 1, plannedMoveIn: upcoming[2] ? ad(upcoming[2].startDate, -1) : undefined, downAmount: 4, downUnit: 'h' }],
      [running[0], { upDays: 2, travelDays: 1, downAmount: 1.5, downUnit: 'd' }],
    ]
    plan.forEach(([j, x]) => { if (j) j.rig = [mk(j, x)] })
    // a project with more than one crane: lead + assist crane, each with its own rig days
    const big = upcoming[1]
    if (big) { const free = equipment.filter(e => e.category === 'Crane' && e.status !== 'Out of Service' && e.status !== 'Maintenance' && !jobs.some(o => o.craneId === e.id && o.stage !== 'Quote' && o.stage !== 'Awarded' && o.startDate <= ad(big.endDate, 3) && ad(big.startDate, -4) <= o.endDate))
      free.slice(0, 2).forEach((e, i) => { big.craneIds = [...(big.craneIds ?? []), e.id]; big.rig!.push(mk(big, { craneId: e.id, upDays: 1 + i, travelDays: 1, downAmount: 3 + i, downUnit: 'h', notes: 'Assist crane' })) }) }
  }
  // outside crane companies + a hired cover crane and a rig-down assist on demo jobs
  const craneVendors: T.CraneVendor[] = [
    { id: 'cv-1', name: 'Red Dirt Crane Rental', contact: 'Darla Pruitt', phone: '(405) 555-0181', notes: 'Demo vendor · 90–300t ATs' },
    { id: 'cv-2', name: 'Prairie Heavy Lift', contact: 'Cody Barnes', phone: '(918) 555-0142', notes: 'Demo vendor · crawlers' },
    { id: 'cv-3', name: 'Panhandle Crane Co.', contact: 'Rita Gomez', phone: '(806) 555-0119' },
  ]
  {
    const live = jobs.filter(j => j.stage !== 'Quote' && j.stage !== 'Awarded' && j.stage !== 'Complete' && j.endDate >= T0).sort((a, b) => a.startDate.localeCompare(b.startDate))
    const ad = (d: string, n: number) => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10) }
    const today = jobs.filter(j => j.craneId && j.stage !== 'Quote' && j.stage !== 'Awarded' && j.stage !== 'Complete' && j.status !== 'Complete' && j.startDate <= T0 && j.endDate >= T0).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.jobNo.localeCompare(b.jobNo))
    const now = today[0] ?? live.find(j => j.startDate <= T0 && j.craneId), nxt = live.find(j => j.jobNo === '10158') ?? live.find(j => j.startDate > T0 && j.rig?.length)
    // demo: one project with several cranes — lead + a crane shared with another job today (AM here, PM there) + a free crane + a hired outside crane
    if (now && today[1]) {
      const shared = today[1].craneId!; const busyToday = new Set(today.map(j => j.craneId))
      const free = equipment.find(e => e.category === 'Crane' && !busyToday.has(e.id) && e.status === 'Available' && !jobs.some(o => o.craneId === e.id && o.stage !== 'Quote' && o.startDate <= now.endDate && now.startDate <= o.endDate))
      now.craneIds = [shared, ...(free ? [free.id] : [])]
      now.craneHours = { [shared]: { from: '07:00', to: '11:00' } }
      today[1].craneHours = { ...(today[1].craneHours ?? {}), [shared]: { from: '12:00', to: '17:00' } }
    }
    if (now) now.outside = [{ id: 'oc-1', vendorId: 'cv-1', size: '220t', type: 'All-terrain', operator: 'Wade (Red Dirt)', phone: '(405) 555-0182', role: 'Work assist', from: T0, to: T0, hours: { from: '07:00', to: '12:00' }, rate: 4200, po: 'PO-7731', status: 'Confirmed' }]
    if (nxt) nxt.outside = [{ id: 'oc-2', vendorId: 'cv-2', size: '110t', type: 'All-terrain', operator: 'Cody Barnes', phone: '(918) 555-0142', role: 'Rig-up assist', from: nxt.rig?.length ? ad(nxt.rig[0].hookReady, -nxt.rig[0].upDays) : ad(nxt.startDate, -2), to: ad(nxt.rig?.[0]?.hookReady ?? nxt.startDate, -1), rate: 2800, status: 'Requested' }]
  }
  // one answer for "who supervises this job": the Supervisor on its crew (today, else its first crew day) — same rule as field/jobFacts siteSupervisor
  jobs.forEach(j => {
    const mine = assignments.filter(a => a.jobId === j.id).sort((a, b) => Number(b.date === T0) - Number(a.date === T0) || a.date.localeCompare(b.date))
    const sup = mine.map(a => employees.find(e => e.id === a.employeeId)).find(e => e?.craft === 'Supervisor')
    if (sup) j.supervisorId = sup.id
  })
  // dive3 m3: quotes we lost this year (fictional) so the win rate is a real ratio, not 100%
  const LOST_WHY = ['Price', 'Price', 'Crane not available', 'Schedule', 'Customer went in-house', 'No decision', 'Price']
  const tmpl = jobs.find(j => j.stage === 'Scheduled') ?? jobs[0]
  for (let i = 0; i < 24; i++) {
    const q = addDays(T0, -12 - i * 11), st = addDays(q, 6) /* all in the past, so lost quotes never sit on a schedule */, days = 2 + (i % 5), cu = customers[(i * 7) % customers.length], si = sites[(i * 5) % sites.length]
    const rate = [4500, 6200, 8800, 12500, 19100][i % 5], mob = [3500, 9000, 26000][i % 3], rev = rate * days + mob
    jobs.push({ ...structuredClone(tmpl), id: `job-lost-${i + 1}`, jobNo: String(9800 + i), name: ['Tank set', 'Boiler pick', 'Turbine blade change', 'Machine move', 'Steel erection', 'Exchanger pull'][i % 6], customerId: cu.id, siteId: si.id,
      startDate: st, endDate: addDays(st, days - 1), craneId: undefined, craneIds: undefined, rig: undefined, outside: undefined, trailerIds: [], extras: undefined, stage: 'Quote', status: 'Planned', dayRate: rate, invoiceNo: undefined, closedOut: undefined,
      quote: { revenue: rev, costBudget: Math.round(rev * (0.6 + (i % 4) * 0.03)), mobDemob: mob, quotedAt: q, salesId: tmpl.quote.salesId }, quoteSentAt: q + 'T15:00:00.000Z', quoteLost: { at: addDays(q, 4), reason: LOST_WHY[i % LOST_WHY.length] }, docs: [], notes: 'Lost quote (demo history).' })
  }
  return {
    windSites,
    version: DB_VERSION, tenantId: 'tenant-slh', company: { id: 'tenant-slh', name: 'Southern Lifting & Hoisting', shortName: 'SLH', assistantName: 'Southern', phone: '(405) 555-0100', modules: { craneRigging: true } }, seededAt: new Date().toISOString(), employees, certs, equipment, configs, customers, sites, jobs, assignments, absences, travel, time, tickets, breakdowns, workOrders, items, checkouts, invLedger, pos, partsRequests, cycleCounts, timeRecs, infoChanges, certShares, sds, hires, notices, audit,
    craneVendors, contacts, clocks: [], costs, fuel, dvirs, history, divisions: DIVISIONS, branches: BRANCHES, vendors, bills, invoices, pto, hrRecords, incidents, talks, inspections,
  }
}
