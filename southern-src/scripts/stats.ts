import { seed } from '../src/data/seed'
import { jobCosting, costJobs, serviceStatus, certBand, jobConflicts, jobsOn, isField, byId } from '../src/data/logic'
import { today, addDays } from '../src/lib/util'
const db = seed()
const T0 = today()
const yr = Number(T0.slice(0, 4))
for (const y of [yr - 2, yr - 1, yr]) {
  const by: Record<string, number> = {}
  db.history.filter(h => h.year === y).forEach(h => { by[h.branchId] = (by[h.branchId] ?? 0) + h.revenue })
  const tot = Object.values(by).reduce((a, b) => a + b, 0)
  console.log(y, (tot / 1e6).toFixed(1) + 'M', Object.entries(by).map(([k, v]) => `${k} ${(v / 1e6).toFixed(1)}M`).join(' '))
}
const f = { divisionId: 'all', branchId: 'all' }
const cj = costJobs(db, f).map(j => ({ j, c: jobCosting(db, j) }))
console.log('live jobs', cj.length, 'by branch', ['br-okc', 'br-mid', 'br-kil'].map(b => cj.filter(x => x.j.branchId === b).length).join('/'))
cj.sort((a, b) => a.c.projMargin - b.c.projMargin).forEach(({ j, c }) => console.log(j.jobNo, j.branchId, j.type, byId(db.equipment, j.craneId)?.unit ?? '-', 'quote', Math.round(c.projRevenue / 1000) + 'K', 'proj', (c.projMargin * 100).toFixed(0) + '%', 'todate', (c.margin * 100).toFixed(0) + '%', j.name.slice(0, 40)))
// monthly live rough: sum day rate of on-job cranes
const daily = jobsOn(db, T0).reduce((s, j) => s + j.dayRate, 0)
console.log('today day-rate sum', daily, '≈ month', Math.round(daily * 22 / 1e6 * 10) / 10 + 'M')
const sups = db.employees.filter(e => e.craft === 'Supervisor').map(s => `${s.first} ${s.last}:${db.employees.filter(e => e.supervisorId === s.id).length}`)
console.log('sups', sups.join(', '))
console.log('svc overdue', db.equipment.filter(e => serviceStatus(e).overdue).map(e => e.unit).join(','), 'dueSoon', db.equipment.filter(e => serviceStatus(e).dueSoon).length)
const fieldIds = new Set(db.employees.filter(isField).map(e => e.id))
console.log('certs expired', db.certs.filter(c => fieldIds.has(c.employeeId) && certBand(c).band === 'expired').length, '30d', db.certs.filter(c => fieldIds.has(c.employeeId) && certBand(c).band === '30').length, 'people', db.employees.length)
let conf = 0; const list: string[] = []
for (const d of [T0, addDays(T0, 1)]) jobsOn(db, d).forEach(j => jobConflicts(db, j, d).forEach(c => { conf++; list.push(`${d.slice(5)} #${j.jobNo} ${c.level} ${c.text}`) }))
console.log('conflicts', conf); list.forEach(l => console.log('  ', l))
console.log('AR invoices', db.invoices.length, 'mismatch cust', db.invoices.filter(i => byId(db.jobs, i.jobId)?.customerId !== i.customerId).length, 'before end', db.invoices.filter(i => i.date < byId(db.jobs, i.jobId)!.endDate).length)
db.customers.forEach(c => { const cities = [...new Set(db.jobs.filter(j => j.customerId === c.id).map(j => byId(db.sites, j.siteId)!.city))]; console.log(c.name, c.phone, cities.join(', ')) })
db.configs.filter(c => ['28', '66', '1200', '80'].includes(byId(db.equipment, c.craneId)!.unit)).forEach(c => console.log(byId(db.equipment, c.craneId)!.unit, c.name, c.loads?.reduce((s, l) => s + l.n, 0), 'own', c.trailerIds.length))
