import { canSeeMoney } from './roles'
// "Ask Southern" — rule-based natural-language answers straight from company data. No cloud AI needed; works offline.
import type * as T from './types'
import { windSync, loadWind, maxHub, mft, ft, type WFarm } from './wind'
import { today, addDays, fmtDate, money, parse, iso } from '../lib/util'
import { costJobs } from './logic'
import { byId, certBand, fullName, jobsOn, workStatus, isField, serviceStatus, jobCosting, isLive, agingBucket, craneLeague, yearSeries, eqLabel, siteOf, customerOf, absenceOn, inScope, type OrgFilter } from './logic'

export interface AskItem { label: string; sub?: string; ref?: T.EntityRef; tone?: 'ok' | 'warn' | 'bad' | 'info' }
export interface AskAnswer { headline: string; detail?: string; items: AskItem[]; page?: string }

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
export function parseDay(q: string): { date: string; label: string } {
  const t = today()
  if (/tomorrow/.test(q)) return { date: addDays(t, 1), label: 'tomorrow' }
  if (/next week/.test(q)) return { date: addDays(t, 7), label: 'next week' }
  const m = q.match(/(\d{1,2})\/(\d{1,2})/)
  if (m) { const d = new Date(parse(t).getFullYear(), Number(m[1]) - 1, Number(m[2])); return { date: iso(d), label: fmtDate(iso(d)) } }
  for (let i = 0; i < 7; i++) if (q.includes(DAYS[i]) || q.includes(DAYS[i].slice(0, 3) + ' ')) {
    const cur = parse(t).getDay(); const diff = (i - cur + 7) % 7
    const d = addDays(t, diff); return { date: d, label: diff === 0 ? 'today' : DAYS[i][0].toUpperCase() + DAYS[i].slice(1) + ` (${fmtDate(d)})` }
  }
  return { date: t, label: 'today' }
}

export function ask(db: T.DB, raw: string, f: OrgFilter): AskAnswer | null {
  const q = ' ' + raw.toLowerCase().trim() + ' '
  if (q.trim().length < 3) return null
  if (typeof document !== 'undefined' && document.documentElement.dataset.guest === '1' && !canSeeMoney('guest') && /(money|revenue|sales|profit|margin|owe|owes|paid|pay\b|payroll|wage|rate|cost|invoice|bill|bills|ar\b|ap\b|cash|earn)/.test(q))
    return { headline: 'Money isn’t part of this guest pass', detail: 'Revenue, job costing, pay and bills are only shown to staff.', items: [] }
  const { date, label } = parseDay(q)
  const cranes = db.equipment.filter(e => e.category === 'Crane' && inScope(e, f))
  // dive3 m14: sales/accounting phrasings that used to fall through (or hit the wind-farm search)
  const qNo = q.match(/\bq-?\s?(\d{4,6})\b/)
  if (qNo) {
    const j = db.jobs.find(x => x.jobNo === qNo[1])
    if (j) return { headline: `Quote Q-${j.jobNo} — ${customerOf(db, j).name}`, detail: `${j.name} · ${money(j.quote.revenue)} · ${j.quoteLost ? `lost ${fmtDate(j.quoteLost.at)} (${j.quoteLost.reason})` : j.stage === 'Quote' ? (j.quoteSentAt ? `sent ${fmtDate(j.quoteSentAt.slice(0, 10))}, waiting on the customer` : 'not sent yet') : `won — now Job #${j.jobNo} (${j.stage})`}`, page: 'quotes', items: [{ label: `Open Q-${j.jobNo}`, sub: j.name, ref: { type: 'job', id: j.id } }] }
  }
  if (/win rate|win-rate|close rate|hit rate|won vs lost|how many (quotes )?(did )?we (win|lose|lost)/.test(q)) {
    const y = today().slice(0, 4), inY = (d?: string) => !!d && d.slice(0, 4) === y
    const won = db.jobs.filter(j => inScope(j, f) && j.stage !== 'Quote' && j.stage !== 'Awarded' && inY(j.quote.quotedAt)).length
    const lost = db.jobs.filter(j => inScope(j, f) && j.quoteLost && inY(j.quoteLost.at))
    const why = Object.entries(lost.reduce<Record<string, number>>((m, j) => { m[j.quoteLost!.reason] = (m[j.quoteLost!.reason] ?? 0) + 1; return m }, {})).sort((a, b) => b[1] - a[1])
    return { headline: `Win rate ${won + lost.length ? Math.round(won / (won + lost.length) * 100) : 0}% this year — ${won} won · ${lost.length} lost`, detail: why.length ? `Lost to: ${why.map(([k, n]) => `${k} ${n}`).join(' · ')}` : undefined, page: 'quotes', items: lost.slice(0, 8).map(j => ({ label: `Q-${j.jobNo} · ${customerOf(db, j).name}`, sub: `${money(j.quote.revenue, true)} · lost ${fmtDate(j.quoteLost!.at)} · ${j.quoteLost!.reason}`, ref: { type: 'job', id: j.id }, tone: 'bad' as const })) }
  }
  if (/backlog|booked work|work on the books/.test(q)) {
    const js = db.jobs.filter(j => inScope(j, f) && ['Awarded', 'Scheduled', 'In Progress'].includes(j.stage) && !j.closedOut).sort((a, b) => a.startDate.localeCompare(b.startDate))
    const left = js.reduce((s, j) => { const c = jobCosting(db, j); return s + Math.max(0, (c.projRevenue || j.quote.revenue) - c.revenue) }, 0)
    return { headline: `${money(left, true)} backlog — ${js.length} booked job${js.length === 1 ? '' : 's'} not yet earned`, detail: 'Awarded, scheduled and in-progress work still to be earned.', page: 'jobs', items: js.slice(0, 12).map(j => ({ label: `#${j.jobNo} · ${customerOf(db, j).name}`, sub: `${j.stage} · starts ${fmtDate(j.startDate)} · ${money(j.quote.revenue, true)}`, ref: { type: 'job', id: j.id } })) }
  }
  if (/compare branch|branch(es)? (compare|vs|versus)|by branch|which branch/.test(q)) {
    const y = today().slice(0, 4)
    const rows = db.branches.map(b => { const js = db.jobs.filter(j => j.branchId === b.id); const rev = db.invoices.filter(i => i.date.slice(0, 4) === y && js.some(j => j.id === i.jobId)).reduce((s, i) => s + i.amount, 0); return { b, rev, active: js.filter(j => j.stage === 'In Progress' || j.stage === 'Scheduled').length } }).sort((a, b) => b.rev - a.rev)
    return { headline: `Branches by invoiced revenue this year — ${rows[0]?.b.code ?? ''} leads`, page: 'analytics', items: rows.map(r => ({ label: `${r.b.code} · ${r.b.city}`, sub: `${money(r.rev, true)} invoiced YTD · ${r.active} active/scheduled jobs` })) }
  }
  if (/absorbed|non-?billable|ate the cost|eating cost/.test(q)) {
    const rows = costJobs(db, f).map(j => ({ j, a: jobCosting(db, j).extras?.absorbed ?? 0 })).filter(x => x.a > 0).sort((a, b) => b.a - a.a)
    return { headline: `${money(rows.reduce((s, x) => s + x.a, 0), true)} absorbed cost on ${rows.length} job${rows.length === 1 ? '' : 's'}`, detail: 'Non-billable extras we carry ourselves — in job cost, never on the invoice.', page: 'analytics', items: rows.slice(0, 10).map(({ j, a }) => ({ label: `#${j.jobNo} · ${customerOf(db, j).name}`, sub: `${money(a)} absorbed`, ref: { type: 'job', id: j.id }, tone: 'warn' as const })) }
  }
  if (/billing review|changes? (that )?affect billing|after (the )?invoice|unbilled change/.test(q)) {
    const rs = (db.billingReview ?? []).filter(r => r.status === 'Open')
    return { headline: `${rs.length} change${rs.length === 1 ? '' : 's'} waiting for billing review`, detail: `${rs.filter(r => r.flags.includes('invoiced')).length} after invoicing (use “Bill this change”) · ${rs.filter(r => r.flags.includes('signed')).length} after the customer signed.`, page: 'receivables', items: rs.slice(0, 10).map(r => { const j = db.jobs.find(x => x.id === r.jobId); return { label: `Job #${j?.jobNo} · ${r.what}`, sub: r.flags.length ? r.flags.map(x => x === 'invoiced' ? 'already invoiced' : 'ticket signed').join(' · ') : r.by, ref: j ? { type: 'job' as const, id: j.id } : undefined, tone: r.flags.length ? 'warn' as const : undefined } }) }
  }
  const wind = askWind(db, q); if (wind) return wind

  if (/(free|available|open|idle|not booked)/.test(q) && /crane/.test(q)) {
    const tons = Number(q.match(/(\d{2,3})\s*(t|ton)/)?.[1] ?? 0)
    const busy = new Set(jobsOn(db, date).map(j => j.craneId))
    const free = cranes.filter(c => !busy.has(c.id) && c.status !== 'Maintenance' && c.status !== 'Out of Service' && (c.capacity ?? 0) >= tons).sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
    return { headline: `${free.length} crane${free.length === 1 ? '' : 's'} free ${label}${tons ? ` ≥ ${tons} t` : ''}`, detail: `${cranes.length - free.length} booked or down.`, page: 'forecast', items: free.map(c => ({ label: `Crane ${c.unit} · ${c.code}`, sub: `${c.capacity} t ${c.type} · ${c.yard}`, ref: { type: 'equipment', id: c.id }, tone: 'ok' })) }
  }
  if (/(cert|expir|licen|ncc|cdl|osha)/.test(q)) {
    const days = Number(q.match(/(\d{2,3})\s*day/)?.[1] ?? 30)
    const rows = db.certs.filter(c => { const e = byId(db.employees, c.employeeId); return e && inScope(e, f) && certBand(c).days <= days }).sort((a, b) => a.expires.localeCompare(b.expires))
    const expired = rows.filter(c => certBand(c).band === 'expired').length
    return { headline: `${rows.length} certifications expired or expiring within ${days} days`, detail: `${expired} already expired — those people are blocked from jobs that require them.`, page: 'safety', items: rows.slice(0, 30).map(c => { const b = certBand(c); return { label: `${fullName(byId(db.employees, c.employeeId))} — ${c.type}`, sub: b.days < 0 ? `Expired ${-b.days} days ago` : `Expires ${fmtDate(c.expires)} · ${b.days} days`, ref: { type: 'employee', id: c.employeeId }, tone: b.days < 0 ? 'bad' : b.days <= 30 ? 'warn' : 'info' } }) }
  }
  if (/(losing|lose money|behind|unprofitable|over budget|not making|in the red)/.test(q)) {
    const rows = costJobs(db, f).map(j => ({ j, c: jobCosting(db, j) })).filter(x => x.c.health === 'behind' || x.c.health === 'thin').sort((a, b) => a.c.projMargin - b.c.projMargin)
    return { headline: `${rows.filter(x => x.c.health === 'behind').length} jobs losing money · ${rows.filter(x => x.c.health === 'thin').length} on thin margin`, page: 'analytics', items: rows.map(({ j, c }) => ({ label: `#${j.jobNo} ${customerOf(db, j).name}`, sub: `${c.health === 'behind' ? 'Losing money' : 'Thin margin'} · projected margin ${(c.projMargin * 100).toFixed(0)}% · cost ${money(c.cost, true)} vs earned ${money(c.revenue, true)}`, ref: { type: 'job', id: j.id }, tone: c.health === 'behind' ? 'bad' : 'warn' })) }
  }
  if (/(year over year|yoy|last year|ytd|sales|revenue)/.test(q) && !/crane \d/.test(q)) {
    const y = yearSeries(db, f); const d = (y.ytd - y.ytdPrev) / (y.ytdPrev || 1)
    return { headline: `${money(y.ytd, true)} revenue year-to-date — ${d >= 0 ? 'up' : 'down'} ${(Math.abs(d) * 100).toFixed(1)}% vs same point last year`, detail: `${y.curY - 1} full year: ${money(y.full(y.curY - 1), true)} · ${y.curY - 2}: ${money(y.full(y.curY - 2), true)}`, page: 'analytics', items: [] }
  }
  if (/(best|top|most profitable|worst|least)/.test(q) && /crane/.test(q)) {
    const rows = craneLeague(db, f); const worst = /worst|least/.test(q)
    const list = worst ? [...rows].reverse() : rows
    return { headline: `${worst ? 'Lowest' : 'Most'} profitable cranes — last 12 months`, page: 'analytics', items: list.slice(0, 8).map(r => ({ label: `Crane ${r.crane.unit} · ${r.crane.code}`, sub: `${money(r.profit, true)} profit · ${(r.margin * 100).toFixed(0)}% margin · ${(r.util * 100).toFixed(0)}% utilized`, ref: { type: 'equipment', id: r.crane.id }, tone: r.margin > 0.25 ? 'ok' : 'warn' })) }
  }
  if (/(down|out of service|broke|breakdown|maintenance|in the shop)/.test(q)) {
    const rows = db.equipment.filter(e => inScope(e, f) && (e.status === 'Out of Service' || e.status === 'Maintenance'))
    return { headline: `${rows.length} units down or in maintenance`, page: 'shop', items: rows.map(e => ({ label: eqLabel(e), sub: `${e.status} · ${db.workOrders.find(w => w.unitId === e.id && w.status !== 'Closed')?.title ?? 'No open WO'}`, ref: { type: 'equipment', id: e.id }, tone: e.status === 'Out of Service' ? 'bad' : 'warn' })) }
  }
  if (/(service|pm |oil change|due for)/.test(q)) {
    const rows = db.equipment.filter(e => inScope(e, f) && (serviceStatus(e).overdue || serviceStatus(e).dueSoon))
    return { headline: `${rows.filter(e => serviceStatus(e).overdue).length} overdue · ${rows.filter(e => serviceStatus(e).dueSoon).length} due soon for service`, page: 'shop', items: rows.map(e => { const s = serviceStatus(e); return { label: eqLabel(e), sub: s.remaining != null ? `${s.remaining < 0 ? 'Over by' : 'Due in'} ${Math.abs(s.remaining).toLocaleString()} ${s.unit}` : `Due ${fmtDate(e.nextServiceDate)}`, ref: { type: 'equipment', id: e.id }, tone: s.overdue ? 'bad' : 'warn' } }) }
  }
  if (/(overdue|past due|late)/.test(q) && /(rigging|checkout|check out|sling|shackle|inventory|gear)/.test(q)) {
    const rows = db.checkouts.filter(c => !c.returned && c.returnable && c.due < today())
    return { headline: `${rows.length} rigging checkouts overdue`, page: 'inventory', items: rows.map(c => ({ label: byId(db.items, c.itemId)?.name ?? '', sub: `${fullName(byId(db.employees, c.employeeId))} · due ${fmtDate(c.due)}`, ref: { type: 'employee', id: c.employeeId }, tone: 'warn' })) }
  }
  if (/(owe|receivable|a\/r| ar |overdue invoice|past due|collections|aging)/.test(q)) {
    const rows = db.invoices.filter(i => i.paid < i.amount && agingBucket(i) !== 'Current').sort((a, b) => a.due.localeCompare(b.due))
    const total = rows.reduce((s, i) => s + i.amount - i.paid, 0)
    return { headline: `${money(total, true)} past due across ${rows.length} invoices`, page: 'receivables', items: rows.map(i => ({ label: `${i.invNo} · ${byId(db.customers, i.customerId)?.name}`, sub: `${money(i.amount - i.paid)} open · ${agingBucket(i)} days · ${i.collections}`, ref: { type: 'invoice', id: i.id }, tone: 'warn' })) }
  }
  if (/(who|anyone|people|crew|operator|rigger|driver|hand).*(available|free|open|off|pool)|available (operator|rigger|driver|people)/.test(q) || /(pto|vacation|off today|off tomorrow|day off)/.test(q)) {
    const wantOff = /(off|pto|vacation)/.test(q) && !/available|free/.test(q)
    const craft = /operator/.test(q) ? 'Operator' : /rigger/.test(q) ? 'Rigger' : /driver/.test(q) ? 'Truck Driver' : /oiler/.test(q) ? 'Oiler' : undefined
    const ppl = db.employees.filter(e => isField(e) && inScope(e, f) && (!craft || e.craft === craft))
    const rows = ppl.filter(e => wantOff ? !!absenceOn(db, e.id, date) : workStatus(db, e.id, date) === 'Available')
    return { headline: `${rows.length} ${craft ? craft.toLowerCase() + 's' : 'people'} ${wantOff ? 'off' : 'available'} ${label}`, page: 'dispatch', items: rows.map(e => ({ label: fullName(e), sub: `${e.craft}${e.hallHand ? ' · Hall Hand' : ''} · ${wantOff ? absenceOn(db, e.id, date)?.kind : e.city}`, ref: { type: 'employee', id: e.id }, tone: wantOff ? 'warn' : 'ok' })) }
  }
  const jobM = q.match(/#?\b(1\d{4})\b/)
  if (jobM) {
    const j = db.jobs.find(x => x.jobNo === jobM[1])
    if (j) { const c = jobCosting(db, j); const crew = db.assignments.filter(a => a.jobId === j.id && a.date === today()); return { headline: `Job #${j.jobNo} — ${customerOf(db, j).name}`, detail: `${j.name} · ${siteOf(db, j).city}, ${siteOf(db, j).state} · ${c.health === 'pending' ? 'not started' : `${(c.projMargin * 100).toFixed(0)}% projected margin`}`, items: [{ label: 'Open job', ref: { type: 'job', id: j.id } }, ...crew.map(a => ({ label: fullName(byId(db.employees, a.employeeId)), sub: a.position, ref: { type: 'employee' as const, id: a.employeeId } }))] } }
  }
  if (/\bquotes?\b|pipeline|bids?\b/.test(q)) {
    const qs = db.jobs.filter(j => j.stage === 'Quote' && !j.quoteLost && inScope(j, f)).sort((a, b) => b.quote.revenue - a.quote.revenue)
    const tot = qs.reduce((s, j) => s + j.quote.revenue, 0)
    return { headline: `${qs.length} open quote${qs.length === 1 ? '' : 's'} · $${Math.round(tot / 1000)}K pipeline`, detail: 'Mark one won and it becomes the job, with the quote as its cost budget.', page: 'quotes', items: qs.map(j => ({ label: `Q-${j.jobNo} · ${customerOf(db, j).name} · $${Math.round(j.quote.revenue / 1000)}K`, sub: `${j.name} · starts ${j.startDate.slice(5)}`, ref: { type: 'job' as const, id: j.id } })) }
  }
  if (/lift plan|engineer|critical lift|ground bearing/.test(q)) {
    const ls = db.jobs.filter(j => inScope(j, f) && j.liftPlan !== 'Not Required' && j.liftPlan !== 'Approved' && !j.closedOut && ['Quote', 'Awarded', 'Scheduled', 'In Progress'].includes(j.stage)).sort((a, b) => a.startDate.localeCompare(b.startDate))
    return { headline: `${ls.length} lift plan${ls.length === 1 ? '' : 's'} waiting on sign-off`, detail: 'Load chart, ground bearing and pre-lift checklist live in Lift Planning.', page: 'lifts', items: ls.map(j => ({ label: `#${j.jobNo} · ${customerOf(db, j).name}`, sub: `${j.liftPlan} · starts ${j.startDate.slice(5)}`, tone: j.liftPlan === 'Missing' ? 'bad' as const : 'warn' as const, ref: { type: 'job' as const, id: j.id } })) }
  }
  const unitM = q.match(/(crane|unit|truck|trailer)\s*#?\s*([a-z]{0,2}-?\d{2,4})/)
  if (unitM || /where/.test(q)) {
    const key = unitM?.[2]?.toUpperCase()
    const e = key ? db.equipment.find(x => x.unit.toUpperCase() === key || x.unit.toUpperCase().endsWith(key)) : undefined
    if (e) {
      const j = jobsOn(db, today()).find(x => x.craneId === e.id)
      const crew = j ? db.assignments.filter(a => a.jobId === j.id && a.date === today()) : []
      const opA = crew.find(a => a.position === 'Operator')
      const op = opA ? byId(db.employees, opA.employeeId) : e.category === 'Crane' ? db.employees.find(x => x.homeCraneId === e.id && x.craft === 'Operator') : undefined
      const opOut = op && absenceOn(db, op.id, today())
      const opTxt = op ? `${opA ? 'Operator today' : 'Home operator'}: ${fullName(op)}${opOut ? ` (on ${opOut.kind} — needs cover)` : ''} · ${op.phone}` : ''
      const items: AskItem[] = [{ label: 'Open unit', ref: { type: 'equipment', id: e.id } }]
      if (op) items.push({ label: `${fullName(op)} — ${opA ? 'operator on this crane today' : 'home operator'}`, sub: op.phone, ref: { type: 'employee', id: op.id } })
      crew.filter(a => a !== opA).forEach(a => { const p = byId(db.employees, a.employeeId); if (p) items.push({ label: `${fullName(p)} — ${a.position}`, sub: p.phone, ref: { type: 'employee', id: p.id } }) })
      if (j) items.push({ label: `Job #${j.jobNo} · ${customerOf(db, j).name}`, ref: { type: 'job', id: j.id } })
      const where = j ? `On Job #${j.jobNo} at ${siteOf(db, j).name}, ${siteOf(db, j).city}` : e.route ? `En route ${e.route.fromName} → ${e.route.toName}` : `At ${e.yard} yard`
      return { headline: `${eqLabel(e)} — ${e.status}`, detail: [where, opTxt].filter(Boolean).join(' · '), items }
    }
  }
  // person lookup
  const words = q.trim().split(/\s+/).filter(w => w.length > 2)
  const person = db.employees.find(e => words.some(w => e.last.toLowerCase() === w) && words.some(w => e.first.toLowerCase() === w)) ?? db.employees.find(e => words.some(w => e.last.toLowerCase() === w))
  if (person) {
    const a = db.assignments.find(x => x.employeeId === person.id && x.date === date)
    const j = a && byId(db.jobs, a.jobId)
    return { headline: `${fullName(person)} — ${workStatus(db, person.id, date)} ${label}`, detail: j ? `${a!.position} on Job #${j.jobNo} · ${customerOf(db, j).name} · ${siteOf(db, j).city}` : person.craft, items: [{ label: 'Open profile', ref: { type: 'employee', id: person.id } }] }
  }
  return null
}

export const ASK_SUGGESTIONS = ['Who is running Crane 28?', 'Open quotes', 'Lift plans waiting on sign-off', 'Wind farms in Oklahoma with GE 2.8 turbines', 'Tallest hub heights in Texas', 'Which cranes are free Thursday?', 'Who has certs expiring in 30 days?', 'Which jobs are losing money?', 'How are sales vs last year?', 'Most profitable cranes', 'What equipment is down?', 'Available riggers tomorrow', 'Who owes us money?', 'Where is crane 1200?', 'Overdue rigging checkouts']
const MONEY_Q = /(money|revenue|sales|profit|margin|owe|owes|paid|pay\b|payroll|wage|rate|cost|invoice|bill|bills|cash|earn|quote|quotes)/i
/** Suggestions to show: guests (unless full-app pass) get no money questions. */
export const askSuggestions = () => typeof document !== 'undefined' && document.documentElement.dataset.guest === '1' && !canSeeMoney('guest') ? ASK_SUGGESTIONS.filter(q => !MONEY_Q.test(q)) : ASK_SUGGESTIONS

const STATES: Record<string, string> = { alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY' }
const MANUS: [RegExp, RegExp][] = [[/\b(ge|general electric)\b/, /^GE/], [/vestas/, /Vestas/], [/siemens/, /Siemens/], [/gamesa/, /Gamesa/], [/nordex/, /Nordex/], [/mitsubishi/, /Mitsubishi/], [/goldwind/, /Goldwind/], [/acciona/, /Acciona/], [/suzlon/, /Suzlon/], [/clipper/, /Clipper/], [/repower|senvion/, /REpower|Senvion/]]
function askWind(db: T.DB, q: string): AskAnswer | null {
  if (!/(wind|turbine|farm|hub height|nacelle)/.test(q)) return null
  const w = windSync()
  if (!w) { void loadWind(); return { headline: 'Loading the wind farm directory…', detail: 'Ask again in a second. USWTDB data loads on first use.', items: [], page: 'windfarms' } }
  let st: string | null = null
  for (const [n, a] of Object.entries(STATES)) if (q.includes(' ' + n + ' ') || q.includes(' ' + n + '?')) { st = a; break }
  if (!st) { const m = q.match(/ (in|of|across) ([a-z]{2})[ ?]/); if (m && Object.values(STATES).includes(m[2].toUpperCase())) st = m[2].toUpperCase() }
  const mf = MANUS.find(([re]) => re.test(q))?.[1]
  const modelTok = q.match(/\b(v\d{2,3}|sg ?\d|n\d{2,3}|gw\d{2,3}|\d\.\d{1,3}(-\d{2,3})?)\b/)?.[1]?.replace(' ', '')
  const named = w.farms.filter(fm => fm.name.length > 4 && q.includes(' ' + fm.name.toLowerCase() + ' ')).sort((a, b) => b.name.length - a.name.length)[0]
  const items = (list: WFarm[], sub: (x: WFarm) => string) => list.slice(0, 25).map(x => ({ label: x.name, sub: sub(x), ref: { type: 'windfarm' as const, id: x.id }, tone: 'info' as const }))
  if (named && !/(tallest|highest|biggest|largest)/.test(q)) {
    const m = named.models[0]
    const jobs = db.jobs.filter(j => j.windFarmId === named.id)
    return { headline: `${named.name}: ${named.n} turbines, ${Math.round(named.mw)} MW`, detail: `${named.county} Co., ${named.st} · online ${named.year ?? '—'} · ${m ? `${m.manu} ${m.model}, hub ${mft(m.hh)}` : ''}${jobs.length ? ` · ${jobs.length} of our jobs` : ''}`, page: 'windfarms', items: [{ label: `Open ${named.name}`, sub: 'Turbine map, models, site pins, suggested crane', ref: { type: 'windfarm', id: named.id }, tone: 'ok' }, ...jobs.map(j => ({ label: `Job #${j.jobNo} · ${j.name}`, sub: j.stage, ref: { type: 'job' as const, id: j.id } }))] }
  }
  let list = w.farms.filter(x => (!st || x.st === st) && (!mf || x.models.some(m => mf.test(m.manu))) && (!modelTok || x.models.some(m => m.model.toLowerCase().replace(/\s/g, '').includes(modelTok))))
  if (/(our|we've|we have|worked)/.test(q)) list = list.filter(x => db.jobs.some(j => j.windFarmId === x.id))
  const where = `${st ? ` in ${st}` : ''}${mf || modelTok ? ` with ${q.match(MANUS.find(([re]) => re.test(q))?.[0] ?? /$^/)?.[0]?.toUpperCase() ?? ''}${modelTok ? ` ${modelTok}` : ''} turbines` : ''}`.replace('  ', ' ')
  if (/(tallest|highest|tall|hub height)/.test(q)) {
    list = list.filter(x => maxHub(x)).sort((a, b) => (maxHub(b) ?? 0) - (maxHub(a) ?? 0))
    const top = list[0]
    return { headline: top ? `Tallest hub${where}: ${Math.round(maxHub(top)!)} m (${ft(maxHub(top))} ft) at ${top.name}` : `No farms found${where}`, detail: `${list.length} farms ranked by hub height.`, page: 'windfarms', items: items(list, x => `${x.st} · hub ${mft(maxHub(x))} · ${x.models[0]?.manu} ${x.models[0]?.model}`) }
  }
  if (/(biggest|largest|most turbines|capacity|mw)/.test(q)) list = [...list].sort((a, b) => b.mw - a.mw)
  else list = [...list].sort((a, b) => b.mw - a.mw)
  const n = list.reduce((s, x) => s + x.n, 0)
  return { headline: `${list.length} wind farm${list.length === 1 ? '' : 's'}${where}`, detail: `${n.toLocaleString()} turbines · ${Math.round(list.reduce((s, x) => s + x.mw, 0)).toLocaleString()} MW · source USWTDB v${w.meta.version}`, page: 'windfarms', items: items(list, x => `${x.county} Co., ${x.st} · ${x.n} turbines · ${Math.round(x.mw)} MW · ${x.models.map(m => m.model).slice(0, 2).join(', ')}`) }
}
