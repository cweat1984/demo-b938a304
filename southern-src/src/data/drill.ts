/** Drill-down registry: every KPI number and chart element opens the filtered list behind it. Key = 'kind:arg:arg'. */
import type * as T from './types'
import { costJobs, byId, jobsOn, isLive, jobCosting, certBand, agingBucket, serviceStatus, inScope, customerOf, siteOf, MONTHS, HEALTH_LABEL, type OrgFilter } from './logic'
import { today, money, fmtDate } from '../lib/util'
import { canSeeMoney } from './roles'

export interface DrillItem { label: string; sub?: string; right?: string; ref?: T.EntityRef; tone?: 'ok' | 'warn' | 'bad' | 'info' }
export interface Drill { title: string; sub?: string; items: DrillItem[]; total?: string }

export const drillRef = (key: string): T.EntityRef => ({ type: 'list', id: key })

const jobItem = (db: T.DB, j: T.Job, right?: string, tone?: DrillItem['tone']): DrillItem => ({ label: `#${j.jobNo} · ${customerOf(db, j).name}`, sub: `${j.name} · ${siteOf(db, j).city}, ${siteOf(db, j).state} · ${fmtDate(j.startDate)}–${fmtDate(j.endDate)}`, right, tone, ref: { type: 'job', id: j.id } })
function histItems(db: T.DB, rows: T.HistJob[]): DrillItem[] {
  return rows.sort((a, b) => b.revenue - a.revenue).slice(0, 200).map(h => { const c = byId(db.customers, h.customerId), e = byId(db.equipment, h.craneId); const m = h.revenue ? (h.revenue - h.cost) / h.revenue : 0
    return { label: `${c?.name ?? 'Customer'} · ${h.type}`, sub: `${MONTHS[h.month - 1]} ${h.year}${e ? ` · Crane ${e.unit}` : ''} · ${h.days} days · ${Math.round(m * 100)}% margin`, right: money(h.revenue, true), tone: m < 0 ? 'bad' : m < 0.15 ? 'warn' : 'ok', ref: c ? { type: 'customer', id: c.id } : undefined } })
}

const MONEY_KINDS = new Set(['month', 'year', 'hist', 'ar', 'bills'])
const MONEY_TXT = /\$|% margin|margin|revenue|earned|cost/i
/** Guests (unless the pass is full-app) never see money in a drill-down: no day rates, totals, margins or sales lists. */
export function drill(db: T.DB, key: string, f: OrgFilter): Drill {
  const d = drillRaw(db, key, f)
  if (!(typeof document !== 'undefined' && document.documentElement.dataset.guest === '1' && !canSeeMoney('guest'))) return d
  const [kind, a] = key.split(':')
  if (MONEY_KINDS.has(kind) || (kind === 'jobs' && a !== 'today')) return { title: 'Not part of this guest pass', sub: 'Sales, job costing and money are only shown to staff.', items: [] }
  return { title: kind === 'jobs' ? 'Jobs running today' : d.title, sub: d.sub && MONEY_TXT.test(d.sub) ? undefined : d.sub, items: d.items.map(i => ({ ...i, right: i.right && MONEY_TXT.test(i.right) ? undefined : i.right, sub: i.sub && /\$/.test(i.sub) ? i.sub.replace(/\s*·?\s*\$[\d,.]+[kKmM]?(\/day)?/g, '') : i.sub })) }
}
function drillRaw(db: T.DB, key: string, f: OrgFilter): Drill {
  const [kind, a, b] = key.split(':')
  const t = today()
  const scoped = <X extends { divisionId: string; branchId: string }>(x: X[]) => x.filter(y => inScope(y, f))
  if (kind === 'cranes') {
    const active = scoped(jobsOn(db, t))
    const cranes = scoped(db.equipment.filter(e => e.category === 'Crane'))
    const rows = cranes.map(c => { const j = active.find(x => x.craneId === c.id); const down = c.status === 'Maintenance' || c.status === 'Out of Service'; return { c, j, down } })
      .filter(r => a === 'on' ? !!r.j : a === 'free' ? !r.j && !r.down : a === 'down' ? r.down : true)
      .sort((x, y) => Number(!!y.j) - Number(!!x.j) || (y.c.capacity ?? 0) - (x.c.capacity ?? 0))
    return { title: a === 'on' ? 'Cranes on a job today' : a === 'free' ? 'Cranes free today' : a === 'down' ? 'Cranes down' : 'Crane utilization today', sub: `${rows.filter(r => r.j).length} of ${cranes.length} crane${cranes.length === 1 ? '' : 's'} working`,
      items: rows.map(r => ({ label: `Crane ${r.c.unit} · ${r.c.capacity}t ${r.c.make} ${r.c.model}`, sub: r.j ? `On #${r.j.jobNo} · ${customerOf(db, r.j).name} · ${siteOf(db, r.j).city}` : r.down ? r.c.status : `Free · ${r.c.yard}`, right: r.j ? money(r.j.dayRate) + '/day' : undefined, tone: r.j ? 'info' : r.down ? 'bad' : 'ok', ref: { type: 'equipment', id: r.c.id } })) }
  }
  if (kind === 'jobs') {
    if (a === 'today') { const js = scoped(jobsOn(db, t)).sort((x, y) => y.dayRate - x.dayRate); return { title: 'Revenue at work today', sub: `${js.length} job${js.length === 1 ? '' : 's'} running`, total: money(js.reduce((s, j) => s + j.dayRate, 0)), items: js.map(j => jobItem(db, j, money(j.dayRate) + '/day')) } }
    const live = costJobs(db, f, t).map(j => ({ j, c: jobCosting(db, j) }))
    const h = a as 'ahead' | 'thin' | 'behind'
    const rows = live.filter(x => !a || a === 'all' || x.c.health === h).sort((x, y) => x.c.projMargin - y.c.projMargin)
    return { title: a && a !== 'all' ? `${HEALTH_LABEL[h]} · projected at finish` : 'Active job health', sub: `${rows.length} active job${rows.length === 1 ? '' : 's'} · right column = projected margin at finish (to date in sub-line)`, items: rows.map(({ j, c }) => ({ ...jobItem(db, j, `${Math.round(c.projMargin * 100)}%`, c.health === 'behind' ? 'bad' : c.health === 'thin' ? 'warn' : 'ok'), sub: `To date ${Math.round(c.margin * 100)}% · at finish ${Math.round(c.projMargin * 100)}% · ${j.name}` })) }
  }
  if (kind === 'month') { const y = Number(a), m = Number(b); const rows = scoped(db.history.filter(h => h.year === y && h.month === m)); const live = scoped(db.jobs.filter(j => j.startDate.startsWith(`${y}-${String(m).padStart(2, '0')}`)))
    return { title: `${MONTHS[m - 1]} ${y} sales`, sub: `${rows.length} closed jobs${live.length ? ` · ${live.length} jobs in the system` : ''}`, total: money(rows.reduce((s, r) => s + r.revenue, 0)), items: [...live.map(j => jobItem(db, j, money(j.quote.revenue, true))), ...histItems(db, rows)] } }
  if (kind === 'year') { const y = Number(a); const rows = scoped(db.history.filter(h => h.year === y && (!b || h.month <= Number(b)))); return { title: `${y} sales${b ? ` through ${MONTHS[Number(b) - 1]}` : ''}`, sub: `${rows.length} job${rows.length === 1 ? '' : 's'}`, total: money(rows.reduce((s, r) => s + r.revenue, 0)), items: histItems(db, rows) } }
  if (kind === 'hist') { // hist:division:id  hist:branch:id  hist:crane:id  hist:customer:id  hist:type:Wind (trailing 12 months)
    const ref = new Date(); const cur = ref.getFullYear() * 12 + ref.getMonth() + 1
    const rows = scoped(db.history.filter(h => h.year * 12 + h.month > cur - 13 && h.year * 12 + h.month < cur && (a === 'division' ? h.divisionId === b : a === 'branch' ? h.branchId === b : a === 'crane' ? h.craneId === b : a === 'customer' ? h.customerId === b : h.type === b)))
    const name = a === 'division' ? byId(db.divisions, b)?.name : a === 'branch' ? byId(db.branches, b)?.code : a === 'crane' ? `Crane ${byId(db.equipment, b)?.unit}` : a === 'customer' ? byId(db.customers, b)?.name : b
    return { title: `${name} · last 12 months`, sub: `${rows.length} job${rows.length === 1 ? '' : 's'}`, total: money(rows.reduce((s, r) => s + r.revenue, 0)), items: histItems(db, rows) }
  }
  if (kind === 'certs') { const days = Number(a ?? 90); const rows = db.certs.filter(c => { const e = byId(db.employees, c.employeeId); return e && inScope(e, f) && certBand(c).days <= days }).sort((x, y) => x.expires.localeCompare(y.expires))
    return { title: `Certs expiring within ${days} days`, sub: `${rows.length} certifications`, items: rows.map(c => { const bd = certBand(c), e = byId(db.employees, c.employeeId); return { label: `${e?.first} ${e?.last} · ${c.type}`, sub: bd.days < 0 ? `Expired ${-bd.days} days ago` : `Expires ${fmtDate(c.expires)}`, right: `${bd.days}d`, tone: bd.days < 0 ? 'bad' : bd.days <= 30 ? 'warn' : 'info', ref: { type: 'cert', id: c.id } } }) } }
  if (kind === 'ar') { const rows = db.invoices.filter(i => { const j = byId(db.jobs, i.jobId); return (!j || inScope(j, f)) && (!a || agingBucket(i) === a) && i.paid < i.amount }).sort((x, y) => x.due.localeCompare(y.due))
    return { title: a ? `Receivables · ${a}` : 'Open receivables', sub: `${rows.length} invoices`, total: money(rows.reduce((s, i) => s + i.amount - i.paid, 0)), items: rows.map(i => ({ label: `${i.invNo} · ${byId(db.customers, i.customerId)?.name}`, sub: `Due ${fmtDate(i.due)} · ${i.collections}`, right: money(i.amount - i.paid), tone: agingBucket(i) === 'Current' ? 'ok' : 'warn', ref: { type: 'invoice', id: i.id } })) } }
  if (kind === 'bills') { const rows = db.bills.filter(x => !a || x.status === a.replace(/_/g, ' ')); return { title: a ? `Vendor bills · ${a.replace(/_/g, ' ')}` : 'Vendor bills', sub: `${rows.length} bills`, total: money(rows.reduce((s, x) => s + x.lines.reduce((q, l) => q + l.amount, 0), 0)), items: rows.map(x => ({ label: `${byId(db.vendors, x.vendorId)?.name} · ${x.billNo}`, sub: `${x.status} · due ${fmtDate(x.due)}`, right: money(x.lines.reduce((q, l) => q + l.amount, 0)), tone: x.status === 'Needs Coding' ? 'warn' : 'info', ref: { type: 'bill', id: x.id } })) } }
  if (kind === 'equipment') { const rows = scoped(db.equipment.filter(e => !a || (a === 'down' ? e.status === 'Out of Service' || e.status === 'Maintenance' : a === 'transit' ? e.status === 'In Transit' : a === 'service' ? (serviceStatus(e).overdue || serviceStatus(e).dueSoon) : e.category === a))); return { title: a === 'down' ? 'Equipment down' : a === 'transit' ? 'In transit now' : a === 'service' ? 'Service due' : `${a ?? 'All'} equipment`, sub: `${rows.length} unit${rows.length === 1 ? '' : 's'}`, items: rows.map(e => ({ label: `${e.category === 'Crane' ? 'Crane ' : ''}${e.unit} · ${e.make} ${e.model}`, sub: `${e.status} · ${e.yard}`, tone: e.status === 'Out of Service' ? 'bad' : e.status === 'Maintenance' ? 'warn' : 'info', ref: { type: 'equipment', id: e.id } })) } }
  if (kind === 'wo') { const rows = db.workOrders.filter(w => !a || w.status === a.replace(/_/g, ' ')); return { title: 'Work orders', sub: `${rows.length}`, items: rows.map(w => ({ label: `${w.woNo} · ${w.title}`, sub: `${byId(db.equipment, w.unitId)?.unit} · ${w.status}`, ref: { type: 'workorder', id: w.id } })) } }
  if (kind === 'people') { const rows = scoped(db.employees.filter(e => !a || e.craft === a || (a === 'veterans' && !!e.veteran))); return { title: a === 'veterans' ? 'Veterans' : a ? `${a}s` : 'People', sub: `${rows.length}`, items: rows.map(e => ({ label: `${e.first} ${e.last}`, sub: `${e.craft} · ${e.empNo}`, ref: { type: 'employee', id: e.id } })) } }
  return { title: 'Details', items: [] }
}
