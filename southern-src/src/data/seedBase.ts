// Demo constants + pure helpers shared by the seed generator and the guest-only build (no data generation here).
import type * as T from './types'
export function byIdS<X extends { id: string }>(xs: X[], id?: string) { return xs.find(x => x.id === id) }
export const DB_VERSION = 28
export const BURDEN = 1.32 // payroll taxes + insurance + benefits on hourly wages
export const PER_DIEM_RATES: Record<T.PerDiem, number> = { 'Semi Truck': 85, Hotel: 140, 'Daily Truck': 65 }
export const TRAILER_DAY_COST = 185
export const DVIR_ITEMS = ['Brakes', 'Tires & wheels', 'Lights & reflectors', 'Coupling / fifth wheel', 'Steering', 'Horn & wipers', 'Mirrors', 'Fluid leaks', 'Load securement', 'Emergency kit']

export const DIVISIONS: T.Division[] = [
  { id: 'div-slh', name: 'SLH Cranes', short: 'SLH', color: '#ef4444', tagline: 'Crane rental & lifting' },
  { id: 'div-str', name: 'Southern Transport', short: 'STR', color: '#f59e0b', tagline: 'Heavy haul & trucking' },
  { id: 'div-sup', name: 'Southern Uptower', short: 'SUP', color: '#22c55e', tagline: 'Wind uptower services' },
  { id: 'div-smm', name: 'Southern Machine Moving', short: 'SMM', color: '#3b82f6', tagline: 'Rigging & machine moving' },
]
export const BRANCHES: T.Branch[] = [
  { id: 'br-okc', code: 'SLH-OKC', name: 'Oklahoma City (HQ)', city: 'Oklahoma City', state: 'OK', lat: 35.4089, lng: -97.4706, hq: true, divisionIds: ['div-slh', 'div-str', 'div-sup', 'div-smm'] },
  { id: 'br-mid', code: 'SLH-MID', name: 'Midland', city: 'Midland', state: 'TX', lat: 31.9456, lng: -102.1262, divisionIds: ['div-slh', 'div-str'] },
  { id: 'br-kil', code: 'SLH-KIL', name: 'Kilgore', city: 'Kilgore', state: 'TX', lat: 32.3626, lng: -94.8556, divisionIds: ['div-slh', 'div-smm'] },
]

export type SiteRow = [string, string, 'OK' | 'TX', number, number, string, T.JobType]
export const SITES: SiteRow[] = [
  ['Bricktown Tower', 'Oklahoma City', 'OK', 35.4676, -97.5137, 'br-okc', 'Commercial'],
  ['Tinker Hangar 9', 'Midwest City', 'OK', 35.4147, -97.3866, 'br-okc', 'Industrial'],
  ['Ponca City Refinery', 'Ponca City', 'OK', 36.693, -97.085, 'br-okc', 'Refinery'],
  ['Ardmore Refinery', 'Ardmore', 'OK', 34.178, -97.084, 'br-okc', 'Refinery'],
  ['Sooner Ridge Wind', 'Woodward', 'OK', 36.44, -99.49, 'br-okc', 'Wind'],
  ['Canadian Hills Wind', 'Hinton', 'OK', 35.53, -98.25, 'br-okc', 'Wind'],
  ['Cimarron Gas Plant', 'Kingfisher', 'OK', 35.86, -97.93, 'br-okc', 'Oil & Gas'],
  ['Tulsa Port Terminal', 'Catoosa', 'OK', 36.23, -95.74, 'br-okc', 'Industrial'],
  ['Muskogee Power Station', 'Muskogee', 'OK', 35.76, -95.29, 'br-okc', 'Power'],
  ['Enid Grain Terminal', 'Enid', 'OK', 36.3956, -97.8784, 'br-okc', 'Industrial'],
  ['Lawton Distribution Center', 'Lawton', 'OK', 34.6036, -98.3959, 'br-okc', 'Commercial'],
  ['Panhandle Wind', 'Guymon', 'OK', 36.6828, -101.4816, 'br-okc', 'Wind'],
  ['Stillwater Research Park', 'Stillwater', 'OK', 36.1156, -97.0584, 'br-okc', 'Commercial'],
  ['Norman Medical Tower', 'Norman', 'OK', 35.2226, -97.4395, 'br-okc', 'Commercial'],
  ['Elk City Compressor Station', 'Elk City', 'OK', 35.412, -99.404, 'br-okc', 'Oil & Gas'],
  ['Duncan Steel Fab', 'Duncan', 'OK', 34.5023, -97.9578, 'br-okc', 'Industrial'],
  ['Amarillo Wind Hub', 'Amarillo', 'TX', 35.222, -101.8313, 'br-okc', 'Wind'],
  ['Wichita Falls Power Plant', 'Wichita Falls', 'TX', 33.9137, -98.4934, 'br-okc', 'Power'],
  ['Fort Worth Logistics Park', 'Fort Worth', 'TX', 32.9, -97.32, 'br-okc', 'Commercial'],
  ['Dallas Data Center', 'Dallas', 'TX', 32.82, -96.87, 'br-okc', 'Commercial'],
  ['Sherman Semiconductor Fab', 'Sherman', 'TX', 33.6357, -96.6089, 'br-okc', 'Industrial'],
  ['Childress Wind', 'Childress', 'TX', 34.4265, -100.204, 'br-okc', 'Wind'],
  ['Permian Gas Plant', 'Midland', 'TX', 32.05, -102.15, 'br-mid', 'Oil & Gas'],
  ['Odessa Petrochem', 'Odessa', 'TX', 31.8457, -102.3676, 'br-mid', 'Refinery'],
  ['Big Spring Refinery', 'Big Spring', 'TX', 32.2504, -101.4787, 'br-mid', 'Refinery'],
  ['Pecos Frac Site', 'Pecos', 'TX', 31.4229, -103.4932, 'br-mid', 'Oil & Gas'],
  ['Andrews Compressor Station', 'Andrews', 'TX', 32.3187, -102.5457, 'br-mid', 'Oil & Gas'],
  ['Sweetwater Wind', 'Sweetwater', 'TX', 32.4709, -100.4059, 'br-mid', 'Wind'],
  ['Lubbock Distribution', 'Lubbock', 'TX', 33.5779, -101.8552, 'br-mid', 'Commercial'],
  ['East Texas Paper Mill', 'Lufkin', 'TX', 31.3382, -94.7291, 'br-kil', 'Industrial'],
  ['Longview Steel Works', 'Longview', 'TX', 32.5007, -94.7405, 'br-kil', 'Industrial'],
  ['Tyler Hospital Expansion', 'Tyler', 'TX', 32.3513, -95.3011, 'br-kil', 'Commercial'],
  ['Marshall Power Plant', 'Marshall', 'TX', 32.5449, -94.3674, 'br-kil', 'Power'],
  ['Kilgore Plant Relocation', 'Kilgore', 'TX', 32.4, -94.86, 'br-kil', 'Machine Moving'],
  ['Texarkana Manufacturing', 'Texarkana', 'TX', 33.4251, -94.0477, 'br-kil', 'Industrial'],
  ['Nacogdoches Mill', 'Nacogdoches', 'TX', 31.6035, -94.6555, 'br-kil', 'Industrial'],
]

// [name, industry, job types, regions served, area code] — regions: ok = Oklahoma, ntx = TX sites run from OKC (DFW, Panhandle, Red River), mid = Permian, kil = East Texas
export const CUSTOMERS: [string, string, T.JobType[], string[], string][] = [
  ['Plains Wind Partners', 'Wind', ['Wind', 'Uptower'], ['ok', 'ntx'], '405'],
  ['Westex Wind', 'Wind', ['Wind', 'Uptower'], ['ntx', 'mid'], '806'],
  ['Red River Refining', 'Refinery', ['Refinery'], ['ok'], '580'],
  ['Sooner Power & Light', 'Power', ['Power'], ['ok', 'ntx'], '405'],
  ['Cimarron Midstream', 'Oil & Gas', ['Oil & Gas'], ['ok'], '405'],
  ['Permian Basin Energy', 'Oil & Gas', ['Oil & Gas', 'Refinery'], ['mid'], '432'],
  ['Turner-Bowen Builders', 'Commercial', ['Commercial'], ['ok', 'ntx', 'mid'], '405'],
  ['Prairie Data Systems', 'Commercial', ['Commercial'], ['ok', 'ntx'], '405'],
  ['Lone Star Petrochem', 'Industrial', ['Refinery', 'Industrial'], ['mid', 'kil'], '432'],
  ['Piney Woods Paper', 'Industrial', ['Industrial', 'Machine Moving'], ['kil'], '936'],
  ['Caddo Steel', 'Industrial', ['Industrial', 'Machine Moving'], ['kil'], '903'],
  ['Heartland Grain Co-op', 'Industrial', ['Industrial'], ['ok'], '580'],
  ['Tinker Aero Services', 'Industrial', ['Industrial'], ['ok'], '405'],
  ['East Texas Medical Group', 'Commercial', ['Commercial'], ['kil'], '903'],
  ['Brazos Transmission', 'Power', ['Power', 'Heavy Haul'], ['ntx', 'mid', 'kil'], '817'],
  ['Arbuckle Manufacturing', 'Industrial', ['Machine Moving', 'Heavy Haul', 'Industrial'], ['ok', 'ntx'], '580'],
]
export const CONTACT_NAMES = ['Rick Dawson', 'Sheila Moore', 'Hank Patel', 'Jolene Price', 'Marcus Lee', 'Tanya Ruiz', 'Brent Coleman', 'Amy Nguyen', 'Doug Fields', 'Carla Banks', 'Wade Turner', 'Nina Hart', 'Russ Kemp', 'Lana Shaw', 'Earl Benson', 'Kim Dupree']

// [unit, code, make, model, type, capacity tons, branch]
export const CRANES: [string, string, string, string, string, number, string][] = [
  ['1200', 'LTM1200-1', 'Liebherr', 'LTM 1200-5.1', 'All-Terrain', 220, 'br-okc'],
  ['28', 'CR1500-2', 'Liebherr', 'LR 1500', 'Crawler', 550, 'br-okc'],
  ['59', 'CR1500-4', 'Liebherr', 'LR 1500', 'Crawler', 550, 'br-okc'],
  ['66', 'AT1650-2', 'Liebherr', 'LTM 1650-8.1', 'All-Terrain', 770, 'br-okc'],
  ['70', 'CR1700-1', 'Liebherr', 'LR 1700-1.0', 'Crawler', 750, 'br-okc'],
  ['34', 'AT300-2', 'Liebherr', 'LTM 1300-6.2', 'All-Terrain', 330, 'br-okc'],
  ['36', 'AT250-1', 'Liebherr', 'LTM 1230-5.1', 'All-Terrain', 250, 'br-okc'],
  ['41', 'AT160-3', 'Liebherr', 'LTM 1160-5.2', 'All-Terrain', 180, 'br-okc'],
  ['44', 'AT110-1', 'Liebherr', 'LTM 1110-5.1', 'All-Terrain', 120, 'br-okc'],
  ['12', 'GMK300-1', 'Grove', 'GMK6300L-1', 'All-Terrain', 350, 'br-okc'],
  ['14', 'GMK250-2', 'Grove', 'GMK5250XL-1', 'All-Terrain', 300, 'br-okc'],
  ['19', 'RT90-1', 'Grove', 'RT890E', 'Rough-Terrain', 90, 'br-okc'],
  ['50', 'AC450-1', 'Tadano', 'AC 7.450-1', 'All-Terrain', 500, 'br-okc'],
  ['54', 'GR1000-1', 'Tadano', 'GR-1000XL-4', 'Rough-Terrain', 100, 'br-okc'],
  ['80', 'MLC300-1', 'Manitowoc', 'MLC300', 'Crawler', 330, 'br-okc'],
  ['90', 'TMS500-1', 'Grove', 'TMS500-2', 'Truck-Mount', 40, 'br-okc'],
  ['31', 'AT500-1', 'Liebherr', 'LTM 1500-8.1', 'All-Terrain', 550, 'br-mid'],
  ['52', 'ATF220-2', 'Tadano', 'ATF 220G-5', 'All-Terrain', 245, 'br-mid'],
  ['56', 'GR1600-2', 'Tadano', 'GR-1600XL-2', 'Rough-Terrain', 160, 'br-mid'],
  ['84', 'M2250-2', 'Manitowoc', '2250', 'Crawler', 300, 'br-kil'],
  ['58', 'GR550-1', 'Tadano', 'GR-550XL-3', 'Rough-Terrain', 50, 'br-kil'],
]
export const DOWN_CRANES: Record<string, T.EquipStatus> = { '44': 'Maintenance', '19': 'Out of Service' }

// [unit, code, category, type, make, model, year, branch, division]
export const FLEET: [string, string, T.EquipCategory, string, string, string, number, string, string][] = [
  ['T-201', 'PB389-201', 'Semi', 'Tractor', 'Peterbilt', '389', 2023, 'br-okc', 'div-str'],
  ['T-202', 'KW990-202', 'Semi', 'Tractor', 'Kenworth', 'W990', 2024, 'br-okc', 'div-str'],
  ['T-203', 'KW880-203', 'Semi', 'Tractor', 'Kenworth', 'T880', 2022, 'br-okc', 'div-str'],
  ['T-204', 'MKA-204', 'Semi', 'Tractor', 'Mack', 'Anthem', 2021, 'br-okc', 'div-str'],
  ['T-205', 'PB567-205', 'Semi', 'Heavy-Haul Tractor', 'Peterbilt', '567 Heavy Haul', 2024, 'br-okc', 'div-str'],
  ['T-206', 'KWC5-206', 'Semi', 'Heavy-Haul Tractor', 'Kenworth', 'C500', 2023, 'br-okc', 'div-str'],
  ['T-207', 'PB389-207', 'Semi', 'Tractor', 'Peterbilt', '389', 2022, 'br-mid', 'div-str'],
  ['T-208', 'KW880-208', 'Semi', 'Tractor', 'Kenworth', 'T880', 2023, 'br-mid', 'div-str'],
  ['T-209', 'MKG-209', 'Semi', 'Tractor', 'Mack', 'Granite', 2022, 'br-kil', 'div-str'],
  ['P-301', 'F350-301', 'Pickup', 'Crew Cab', 'Ford', 'F-350 Super Duty', 2024, 'br-okc', 'div-sup'],
  ['P-302', 'RAM35-302', 'Pickup', 'Crew Cab', 'Ram', '3500 Laramie', 2023, 'br-okc', 'div-slh'],
  ['P-303', 'F250-303', 'Pickup', 'Crew Cab', 'Ford', 'F-250 XL', 2022, 'br-mid', 'div-slh'],
  ['P-304', 'SIL35-304', 'Pickup', 'Crew Cab', 'Chevrolet', 'Silverado 3500HD', 2024, 'br-kil', 'div-smm'],
  ['P-305', 'F350-305', 'Pickup', 'Crew Cab', 'Ford', 'F-350 Super Duty', 2025, 'br-okc', 'div-slh'],
  ['TR-401', 'LB55-401', 'Trailer', 'Lowboy 55T', 'Fontaine', 'Magnitude 55H', 2021, 'br-okc', 'div-str'],
  ['TR-402', 'TB9A-402', 'Trailer', '9-Axle 100T', 'Talbert', 'T3DC-100', 2022, 'br-okc', 'div-str'],
  ['TR-403', 'XL120-403', 'Trailer', 'Lowboy 120T', 'XL Specialized', '120HDE', 2023, 'br-okc', 'div-str'],
  ['TR-404', 'TK110-404', 'Trailer', 'Lowboy 110T', 'Trail King', 'TK110HDG', 2020, 'br-okc', 'div-str'],
  ['TR-405', 'SD48-405', 'Trailer', "Stepdeck 48'", 'Fontaine', 'Revolution', 2021, 'br-okc', 'div-str'],
  ['TR-406', 'SD48-406', 'Trailer', "Stepdeck 48'", 'Fontaine', 'Revolution', 2022, 'br-okc', 'div-str'],
  ['TR-407', 'FB53-407', 'Trailer', "Flatbed 53'", 'Utility', '4000AE', 2019, 'br-okc', 'div-str'],
  ['TR-408', 'BD-408', 'Trailer', 'Boom Dolly', 'Aspen', 'BD-2', 2020, 'br-okc', 'div-str'],
  ['TR-409', 'CW-409', 'Trailer', 'Counterweight', 'Kaufman', 'CW-50', 2021, 'br-okc', 'div-str'],
  ['TR-410', 'CW-410', 'Trailer', 'Counterweight', 'Kaufman', 'CW-50', 2021, 'br-okc', 'div-str'],
  ['TR-411', 'LD855-411', 'Trailer', 'Traveling Axle', 'Landoll', '855E', 2018, 'br-okc', 'div-str'],
  ['TR-412', 'MAT-412', 'Trailer', 'Mat Trailer', 'Utility', '4000D-X', 2020, 'br-mid', 'div-str'],
  ['TR-413', 'TB55-413', 'Trailer', 'Lowboy 55T', 'Talbert', '55SA', 2022, 'br-mid', 'div-str'],
  ['TR-414', 'SD48-414', 'Trailer', "Stepdeck 48'", 'Fontaine', 'Revolution', 2023, 'br-kil', 'div-str'],
  ['S-501', 'TELE-501', 'Support', 'Telehandler', 'JLG', 'SkyTrak 10054', 2022, 'br-kil', 'div-smm'],
  ['S-502', 'MAN-502', 'Support', 'Boom Lift', 'JLG', '600S', 2021, 'br-okc', 'div-slh'],
  ['S-503', 'LT-503', 'Support', 'Light Tower', 'Generac', 'MLT6SMD', 2023, 'br-okc', 'div-slh'],
  ['S-504', 'MATS-504', 'Support', 'Crane Mats (40)', 'Sterling', '4x20 Hardwood', 2022, 'br-okc', 'div-slh'],
  ['S-505', 'GEN-505', 'Support', 'Generator', 'CAT', 'XQ60', 2020, 'br-mid', 'div-slh'],
  ['S-506', 'GNT-506', 'Support', 'Hydraulic Gantry', 'J&R Engineering', 'Mega Lift 500', 2021, 'br-kil', 'div-smm'],
  ['S-507', 'SKT-507', 'Support', 'Machinery Skates', 'Hilman', '100-ton Roller Set', 2019, 'br-kil', 'div-smm'],
  ['S-508', 'UPT-508', 'Support', 'Uptower Tool Trailer', 'Southern', 'Custom 24ft', 2023, 'br-okc', 'div-sup'],
  ['S-509', 'FLT-509', 'Support', 'Forklift 15K', 'Toyota', 'THD2200-36', 2022, 'br-okc', 'div-smm'],
]

export const FIRST = ['James', 'Cody', 'Dustin', 'Brandon', 'Kyle', 'Tyler', 'Justin', 'Wesley', 'Garrett', 'Colton', 'Travis', 'Shane', 'Derek', 'Jesse', 'Luke', 'Clint', 'Bobby', 'Jose', 'Miguel', 'Carlos', 'Juan', 'Hector', 'Ramon', 'Andre', 'Darnell', 'Marcus', 'Trey', 'Austin', 'Blake', 'Chase', 'Dalton', 'Eli', 'Grant', 'Heath', 'Ivan', 'Jared', 'Kirk', 'Lane', 'Mason', 'Nolan', 'Owen', 'Parker', 'Quinn', 'Reid', 'Seth', 'Tanner', 'Wyatt', 'Zane', 'Ross', 'Casey', 'Bryce', 'Logan', 'Ray', 'Troy', 'Corey', 'Danny', 'Rusty', 'Jimmy', 'Hunter', 'Brady']
export const LAST = ['Walker', 'Harris', 'Clark', 'Lewis', 'Young', 'Hall', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Turner', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Rogers', 'Reed', 'Cook', 'Morgan', 'Bell', 'Murphy', 'Bailey', 'Rivera', 'Cooper', 'Richardson', 'Cox', 'Howard', 'Ward', 'Torres', 'Peterson', 'Gray', 'Ramirez', 'Watson', 'Kelly', 'Sanders', 'Bennett', 'Wood', 'Barnes', 'Henderson', 'Jenkins', 'Perry', 'Powell', 'Long', 'Patterson', 'Hughes', 'Flores', 'Washington', 'Butler', 'Simmons', 'Foster', 'Gonzales', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Diaz', 'Hayes', 'Myers', 'Ford', 'Hamilton', 'Graham', 'Sullivan', 'Wallace', 'Woods', 'West', 'Jordan', 'Owens', 'Reynolds', 'Fisher', 'Ellis', 'Harrison', 'Gibson', 'McDonald', 'Cruz', 'Marshall', 'Gomez', 'Murray', 'Freeman', 'Wells', 'Simpson', 'Stevens', 'Tucker']

export const LOCALS = ['IUOE Local 627', 'IUOE Local 178', 'IUOE Local 450', 'Non-Union']

export function emailFor(first: string, last: string) {
  return `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@slh-demo.example'
}
export function distMiles(a: [number, number], b: [number, number]) {
  const R = 3958.8, toR = Math.PI / 180
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function requiredPositions(job: T.Job, date: string): T.CrewPosition[] {
  const mob = date === job.startDate || date === job.endDate
  const out = job.positions.filter(p => p !== 'Truck Driver' || mob || job.type === 'Heavy Haul')
  // dive3 dispatch M10: one Operator per own crane on the job (assist cranes need their own operator)
  const cranes = new Set([job.craneId, ...(job.craneIds ?? [])].filter(Boolean)).size
  for (let n = out.filter(p => p === 'Operator').length; n < cranes; n++) out.push('Operator')
  return out
}

