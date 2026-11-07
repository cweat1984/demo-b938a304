/** dive2 fix: city → county for union-local lookup (people search "Kilgore", not "Gregg County").
 *  Southern branch cities + the towns its jobs run in (OK / TX / NM / KS / AR / LA). Lowercase keys. */
export const CITY_COUNTY: Record<string, [string, string]> = {
  'oklahoma city': ['Oklahoma', 'OK'], okc: ['Oklahoma', 'OK'], 'midwest city': ['Oklahoma', 'OK'], edmond: ['Oklahoma', 'OK'], moore: ['Cleveland', 'OK'], norman: ['Cleveland', 'OK'],
  tulsa: ['Tulsa', 'OK'], 'broken arrow': ['Tulsa', 'OK'], enid: ['Garfield', 'OK'], stillwater: ['Payne', 'OK'], lawton: ['Comanche', 'OK'], ardmore: ['Carter', 'OK'], woodward: ['Woodward', 'OK'],
  shawnee: ['Pottawatomie', 'OK'], muskogee: ['Muskogee', 'OK'], 'ponca city': ['Kay', 'OK'], duncan: ['Stephens', 'OK'], elk: ['Beckham', 'OK'], 'elk city': ['Beckham', 'OK'], weatherford: ['Custer', 'OK'], guymon: ['Texas', 'OK'],
  kilgore: ['Gregg', 'TX'], longview: ['Gregg', 'TX'], tyler: ['Smith', 'TX'], marshall: ['Harrison', 'TX'], texarkana: ['Bowie', 'TX'], lufkin: ['Angelina', 'TX'], nacogdoches: ['Nacogdoches', 'TX'],
  midland: ['Midland', 'TX'], odessa: ['Ector', 'TX'], 'big spring': ['Howard', 'TX'], pecos: ['Reeves', 'TX'], monahans: ['Ward', 'TX'], andrews: ['Andrews', 'TX'], 'san angelo': ['Tom Green', 'TX'],
  sweetwater: ['Nolan', 'TX'], abilene: ['Taylor', 'TX'], lubbock: ['Lubbock', 'TX'], amarillo: ['Potter', 'TX'], 'wichita falls': ['Wichita', 'TX'], sherman: ['Grayson', 'TX'], denison: ['Grayson', 'TX'],
  dallas: ['Dallas', 'TX'], 'fort worth': ['Tarrant', 'TX'], arlington: ['Tarrant', 'TX'], waco: ['McLennan', 'TX'], austin: ['Travis', 'TX'], houston: ['Harris', 'TX'], beaumont: ['Jefferson', 'TX'],
  'corpus christi': ['Nueces', 'TX'], 'san antonio': ['Bexar', 'TX'], 'el paso': ['El Paso', 'TX'], laredo: ['Webb', 'TX'],
  hobbs: ['Lea', 'NM'], carlsbad: ['Eddy', 'NM'], albuquerque: ['Bernalillo', 'NM'], farmington: ['San Juan', 'NM'],
  wichita: ['Sedgwick', 'KS'], 'dodge city': ['Ford', 'KS'], 'liberal': ['Seward', 'KS'], 'fort smith': ['Sebastian', 'AR'], 'little rock': ['Pulaski', 'AR'], shreveport: ['Caddo', 'LA'], 'lake charles': ['Calcasieu', 'LA'],
}
/** County for a typed city (exact, then prefix ≥ 4 letters). */
export function cityCounty(q: string): [string, string] | null {
  const t = q.trim().toLowerCase().replace(/,?\s+(ok|tx|nm|ks|ar|la)$/, '')
  if (!t) return null
  if (CITY_COUNTY[t]) return CITY_COUNTY[t]
  if (t.length >= 4) { const k = Object.keys(CITY_COUNTY).find(c => c.startsWith(t)); if (k) return CITY_COUNTY[k] }
  return null
}
