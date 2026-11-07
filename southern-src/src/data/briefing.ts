// Role briefings: a spoken summary + tappable items, built from live data for each role.
import type * as T from './types'
import type { PageKey } from './roles'
import { byId, fullName, customerOf, siteOf, certBand, jobConflicts, jobsOn, crewOn, assignmentsFor, serviceStatus, agingBucket, jobCosting, costJobs, yearSeries, isLive, inScope, type OrgFilter } from './logic'
import { today, addDays, money, fmtDate, diffDays } from '../lib/util'
import { isOpen, isLow, sdsExpired, rollup, isSwag, targetUnit } from './invcore'
import { companyOf } from './brand'
import { WIND_DEMO } from './wind/demo'
import { reconDays, promptText, fmtH } from './recon'

export type BriefTo = { ref: T.EntityRef } | { page: PageKey; hash?: string } | { sds: string } | { href: string } | { fieldJob: string; date: string }
export interface BriefItem { label: string; sub?: string; tone?: 'bad' | 'warn' | 'ok' | 'info'; to?: BriefTo; testid?: string }
export interface BriefSection { title: string; icon: string; items: BriefItem[]; empty?: string }
export interface Briefing { title: string; text: string; sections: BriefSection[]; map?: { lat: number; lng: number; label: string } }

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h) }
/** Demo forecast (deterministic per site + day). Swap for a weather API in production. */
export function siteWeather(site: { id: string; lat: number }, date = today()) {
  const h = hash(site.id + date); const wind = 6 + (h % 17); const gust = wind + 4 + (h % 9); const hi = 58 + ((h >> 3) % 26) - Math.round((site.lat - 32) * 1.5)
  const sky = ['Clear', 'Partly cloudy', 'Mostly sunny', 'Overcast', 'Breezy, clear'][(h >> 5) % 5]
  return { wind, gust, hi, sky, ok: gust < 30 }
}
const TALKS = ['Tag lines: never wrap around your hand', 'Pinch points during outrigger setup', 'Overhead power lines — 20 ft minimum clearance', 'Wind limits: check the load chart, not your gut', 'Heat stress: water, rest, shade', 'Three points of contact on crane and truck', 'Rigging inspection before every lift', 'Swing radius barricades and spotters', 'Hand signals — one designated signal person', 'Fatigue and the drive home']
export const talkOfDay = (d = today()) => TALKS[hash(d) % TALKS.length]

export function buildBriefing(db: T.DB, role: T.RoleKey, me: T.Employee | undefined, f: OrgFilter): Briefing {
  const t = today(), tm = addDays(t, 1)
  const c = companyOf(db)
  const crane = c.modules.craneRigging
  const name = me?.first ? `, ${me.first}` : ''
  const okcJobs = (d: string) => jobsOn(db, d).filter(j => inScope(j, f))
  const jobRef = (j: T.Job): BriefTo => ({ ref: { type: 'job', id: j.id } })
  const jl = (j: T.Job) => `#${j.jobNo} · ${customerOf(db, j).name}`
  const absentToday = db.absences.filter(a => a.from <= t && a.to >= t).map(a => ({ a, e: byId(db.employees, a.employeeId) })).filter(x => x.e && inScope(x.e, f))
  const ptoToday = db.pto.filter(p => p.status === 'Approved' && p.from <= t && p.to >= t)
  const sec = (title: string, icon: string, items: BriefItem[], empty = 'All clear'): BriefSection => ({ title, icon, items, empty })
  const reconSec = () => {
    const rd = reconDays(db).filter(d => d.status !== 'green' && inScope(byId(db.employees, d.employeeId), f))
    const red = rd.filter(d => d.status === 'red')
    return sec('Timecards vs signed tickets', 'Scale', [
      ...red.slice(0, 6).map(d => ({ label: `${fullName(byId(db.employees, d.employeeId))} · ${fmtDate(d.date)}`, sub: `${d.diff > 0 ? '+' : ''}${fmtH(d.diff)} · ${d.rec?.status === 'Asked' ? 'asked, waiting' : 'needs a reason'}`, tone: 'bad', to: { page: 'time', hash: 'recon' }, testid: 'brief-recon' } as BriefItem)),
      ...(rd.length - red.length ? [{ label: `${plural(rd.length - red.length, 'explained day')} ready to review`, sub: rd.filter(d => d.status === 'yellow').map(d => d.rec?.reason).filter(Boolean).slice(0, 3).join(' · '), tone: 'warn', to: { page: 'time', hash: 'recon' } } as BriefItem] : []),
    ], 'Every timecard matches tickets + travel')
  }

  if (role === 'field') {
    const asg = me && (assignmentsFor(db, me.id, t)[0] ?? [1, 2, 3, 4, 5, 6, 7].map(k => assignmentsFor(db, me.id, addDays(t, k))[0]).find(Boolean))
    const job = asg && byId(db.jobs, asg.jobId)
    const site = job && siteOf(db, job); const cust = job && customerOf(db, job)
    const cr = job && byId(db.equipment, job.craneId)
    const crew = job ? crewOn(db, job.id, asg!.date).map(a => byId(db.employees, a.employeeId)).filter(Boolean) as T.Employee[] : []
    const wx = site && siteWeather(site, asg!.date)
    const tickets = job ? db.tickets.filter(x => x.jobId === job.id && (x.status === 'Draft' || x.status === 'Needs Correction')) : []
    const certs = me ? db.certs.filter(x => x.employeeId === me.id && certBand(x).band !== 'ok' && certBand(x).band !== '90') : []
    const jobIds = new Set(job ? [job.id] : [])
    const units = new Set([me?.homeTruckId, me?.homeCraneId, job?.craneId].filter(Boolean) as string[])
    const sdsIds = [...new Set([...db.checkouts.filter(x => (x.jobId && jobIds.has(x.jobId)) || units.has(targetUnit(db, x.target) ?? '')).map(x => byId(db.items, x.itemId)?.sdsId), 'sds-3', 'sds-5', 'sds-10'].filter(Boolean) as string[])].slice(0, 6)
    const week = me ? db.time.filter(x => x.employeeId === me.id && x.date > addDays(t, -7)).reduce((s, x) => s + x.hours, 0) : 0
    const myRecon = me ? reconDays(db).filter(d => d.employeeId === me.id && d.status === 'red') : []
    const when = asg && asg.date !== t ? `${fmtDate(asg.date)}` : 'today'
    const text = job ? `${greet()}${name}. ${when === 'today' ? 'Today' : `Next up, ${when}`} you're on job ${job.jobNo} for ${cust!.name} in ${site!.city}, start time ${job.startTime}.${cr ? ` ${crane ? 'Crane' : 'Unit'} ${cr.unit}.` : ''} Wind ${wx!.wind} gusting ${wx!.gust} miles an hour${wx!.ok ? '' : ' — check limits before you fly anything'}. ${crew.length ? `${plural(crew.length, 'person')} on the crew.` : ''}${tickets.length ? ` ${plural(tickets.length, 'ticket')} to get signed.` : ''}${certs.length ? ` Heads up: ${plural(certs.length, 'cert')} expiring.` : ''} ${week.toFixed(0)} hours so far this week. Be safe out there.` : `${greet()}${name}. You're not on a job today. ${week.toFixed(0)} hours this week.`
    const text2 = text + (myRecon.length ? ` You have ${plural(myRecon.length, 'timecard')} needing a reason.` : '')
    return {
      title: 'Your day', text: text2,
      map: site ? { lat: site.lat, lng: site.lng, label: site.name } : undefined,
      sections: [
        sec('The job', 'Briefcase', job ? [
          { label: `${jl(job)}`, sub: `${job.name} · ${when} · start ${job.startTime}`, to: { fieldJob: job.id, date: asg!.date }, testid: 'brief-job' },
          { label: `${site!.name}`, sub: `${site!.city}, ${site!.state}${site!.gate ? ` · ${site!.gate}` : ''} · tap to navigate`, to: { href: `https://www.google.com/maps/dir/?api=1&destination=${site!.lat},${site!.lng}` } },
          ...(cr ? [{ label: `${crane ? 'Crane' : 'Unit'} ${cr.unit} · ${cr.make} ${cr.model}`, sub: job.trailerIds.length ? `${plural(job.trailerIds.length, 'trailer')} assigned` : undefined, to: { ref: { type: 'equipment', id: cr.id } } as BriefTo }] : []),
          { label: `Customer: ${cust!.contact}`, sub: `${cust!.name} · ${cust!.phone}`, to: { href: `tel:${cust!.phone}` } },
          ...(crane && job.liftPlan !== 'Not Required' ? [{ label: `Lift plan · ${job.liftPlan}`, sub: 'Open the plan and rigging', tone: job.liftPlan === 'Approved' ? 'ok' : 'warn', to: { fieldJob: job.id, date: asg!.date } } as BriefItem] : []),
        ] : [], 'No job assigned'),
        sec('Weather at site', 'Wind', wx ? [{ label: `${wx.sky} · high ${wx.hi}°F`, sub: `Wind ${wx.wind} mph, gusts ${wx.gust} mph${wx.ok ? '' : ' — over typical limits, check the chart'} (demo forecast)`, tone: wx.ok ? 'ok' : 'bad' }] : []),
        sec('Crew', 'Users', crew.map(e => ({ label: fullName(e), sub: `${e.craft} · ${e.phone}`, to: { href: `tel:${e.phone}` } }))),
        sec('Tickets to get signed', 'FileSignature', tickets.map(x => ({ label: `${fmtDate(x.date)} · ${x.status}`, sub: x.correction ?? x.work, tone: x.status === 'Needs Correction' ? 'bad' : 'warn', to: job ? { fieldJob: job.id, date: x.date } : undefined }))),
        sec('Safety', 'ShieldCheck', [
          { label: `Toolbox talk: ${talkOfDay()}`, sub: 'Sign today’s JSA in More › JSA & toolbox' },
          ...(site?.hospital ? [{ label: `Nearest hospital: ${site.hospital}`, tone: 'info' } as BriefItem] : []),
          ...(job?.notes ? [{ label: job.notes, tone: 'warn' } as BriefItem] : []),
          ...certs.map(x => ({ label: `${x.type} ${certBand(x).band === 'expired' ? 'expired' : `expires ${fmtDate(x.expires)}`}`, tone: certBand(x).band === 'expired' ? 'bad' : 'warn', sub: 'Tell Safety / HR' } as BriefItem)),
        ]),
        sec('Chemicals on the job & truck', 'FlaskConical', sdsIds.map(id => byId(db.sds, id)).filter(Boolean).map(s => ({ label: s!.product, sub: `${s!.signal === 'None' ? 'SDS' : s!.signal} · first aid, PPE, spill`, to: { sds: s!.id }, tone: s!.signal === 'Danger' ? 'bad' : undefined } as BriefItem))),
        sec('Timecards needing a reason', 'AlertTriangle', myRecon.map(d => ({ label: `${fmtDate(d.date)} · ${d.diff > 0 ? '+' : ''}${fmtH(d.diff)} vs tickets`, sub: promptText(d), tone: 'bad', to: { page: 'field', hash: 'time' }, testid: 'brief-recon' } as BriefItem))),
        sec('Hours this week', 'Clock', [{ label: `${week.toFixed(1)} hours`, sub: 'Last 7 days · tap for time', to: { page: 'field', hash: 'time' } }]),
      ],
    }
  }

  if (role === 'dispatch') {
    const today_ = okcJobs(t)
    const moves = db.jobs.filter(j => isLive(j) && inScope(j, f) && (j.startDate === t || j.endDate === t || j.status === 'En Route'))
    const conflicts = today_.filter(j => jobConflicts(db, j, t).some(x => x.level === 'red'))
    const unassigned = db.jobs.filter(j => inScope(j, f) && ['Awarded', 'Scheduled'].includes(j.stage) && j.startDate >= t && j.startDate <= addDays(t, 7) && crewOn(db, j.id, j.startDate).length < j.positions.length)
    const permits = db.jobs.filter(j => inScope(j, f) && isLive(j) && j.startDate >= t && j.startDate <= addDays(t, 5) && (j.type === 'Heavy Haul' || j.trailerIds.length > 1) && !j.docs.some(d => d.kind === 'Permit'))
    const bds = db.breakdowns.filter(b => b.status !== 'Resolved')
    const tmr = okcJobs(tm)
    return {
      title: 'Dispatch board', text: `${greet()}${name}. ${plural(today_.length, 'job')} running today, ${plural(moves.length, 'move')} on the road. ${conflicts.length ? `${plural(conflicts.length, 'crew conflict')} to fix first. ` : 'No crew conflicts. '}${unassigned.length ? `${plural(unassigned.length, 'job')} this week still short crew. ` : ''}${permits.length ? `${plural(permits.length, 'permit')} to pull. ` : ''}${bds.length ? `${plural(bds.length, 'breakdown')} open. ` : ''}${absentToday.length + ptoToday.length} people out. Tomorrow: ${plural(tmr.length, 'job')}.`,
      sections: [
        sec('Conflicts', 'AlertTriangle', conflicts.map(j => ({ label: jl(j), sub: jobConflicts(db, j, t).filter(x => x.level === 'red').map(x => x.text).join(' · '), tone: 'bad', to: { ref: { type: 'job', id: j.id, tab: 'crew' } } })), 'No conflicts'),
        sec('Today’s moves', 'Truck', moves.slice(0, 10).map(j => ({ label: jl(j), sub: `${j.startDate === t ? 'Mobilize' : j.endDate === t ? 'Demob' : 'En route'} · ${siteOf(db, j).city} · ${j.startTime}`, to: jobRef(j) }))),
        sec('Short crew this week', 'Users', unassigned.map(j => ({ label: jl(j), sub: `Starts ${fmtDate(j.startDate)} · ${crewOn(db, j.id, j.startDate).length}/${j.positions.length} assigned`, tone: 'warn', to: { ref: { type: 'job', id: j.id, tab: 'crew' } } }))),
        sec('Permits due', 'FileText', permits.map(j => ({ label: jl(j), sub: `Starts ${fmtDate(j.startDate)} · no OS/OW permit on file`, tone: 'warn', to: { ref: { type: 'job', id: j.id, tab: 'docs' } } }))),
        reconSec(),
        sec('Breakdowns', 'Siren', bds.map(b => ({ label: `${byId(db.equipment, b.unitId)?.unit ?? ''} · ${b.kind}`, sub: `${b.severity} · ${b.status}`, tone: 'bad', to: { ref: { type: 'equipment', id: b.unitId } } }))),
        sec('Who’s out', 'UserX', [...absentToday.map(x => ({ label: fullName(x.e), sub: `${x.a.kind}${x.a.to !== t ? ` through ${fmtDate(x.a.to)}` : ''}`, to: { ref: { type: 'employee', id: x.e!.id } } as BriefTo })), ...ptoToday.map(p => ({ label: fullName(byId(db.employees, p.employeeId)), sub: `PTO · ${p.kind}`, to: { ref: { type: 'employee', id: p.employeeId } } as BriefTo }))], 'Everyone in'),
        sec('Tomorrow’s lineup', 'CalendarDays', tmr.slice(0, 12).map(j => ({ label: jl(j), sub: `${siteOf(db, j).city} · ${j.startTime} · ${crewOn(db, j.id, tm).length}/${j.positions.length} crew`, tone: crewOn(db, j.id, tm).length < j.positions.length ? 'warn' : undefined, to: jobRef(j) }))),
      ],
    }
  }

  if (role === 'sales') {
    const mine = (j: T.Job) => !me || j.quote.salesId === me.id || (!j.quote.salesId && j.branchId === me.branchId)
    const quotes = db.jobs.filter(j => j.stage === 'Quote' && !j.quoteLost && mine(j))
    const follow = quotes.filter(j => !j.quoteSentAt || j.quoteSentAt <= addDays(t, -5))
    const starting = db.jobs.filter(j => mine(j) && isLive(j) && j.startDate >= t && j.startDate <= addDays(t, 7))
    const y0 = t.slice(0, 4) + '-01-01'
    const won = db.jobs.filter(j => mine(j) && j.stage !== 'Quote' && j.quote.quotedAt >= y0).reduce((s, j) => s + j.quote.revenue, 0)
    const goal = 9_000_000
    const swag = rollup(db, m => (m.by === me?.id ? 'me' : undefined), m => isSwag(db, m) && m.at.slice(0, 10) >= addDays(t, -30))[0]
    const leads = crane ? Object.values(WIND_DEMO).map(w => ({ w, last: db.jobs.filter(j => j.windFarmId === w.farmId && isLive(j)).sort((a, b) => b.endDate.localeCompare(a.endDate))[0] })).sort((a, b) => (a.last?.endDate ?? '').localeCompare(b.last?.endDate ?? '')).slice(0, 4) : []
    const pctGoal = Math.round(won / goal * 100)
    return {
      title: 'Sales', text: `${greet()}${name}. ${plural(follow.length, 'quote')} need a follow-up, ${plural(quotes.length, 'quote')} pending worth ${money(quotes.reduce((s, j) => s + j.quote.revenue, 0), true)}. ${plural(starting.length, 'customer job')} start this week. You're at ${money(won, true)} year to date, ${pctGoal}% of goal.${swag ? ` ${money(swag.cost)} in swag out this month.` : ''}`,
      sections: [
        sec('Follow-ups due', 'PhoneCall', follow.map(j => ({ label: jl(j), sub: `${money(j.quote.revenue, true)} · ${j.quoteSentAt ? `sent ${fmtDate(j.quoteSentAt)}` : 'not sent yet'} · ${customerOf(db, j).contact} ${customerOf(db, j).phone}`, tone: 'warn', to: jobRef(j) }))),
        sec('Quotes pending', 'FileSignature', quotes.slice(0, 8).map(j => ({ label: jl(j), sub: `${j.name} · ${money(j.quote.revenue, true)}`, to: { page: 'quotes' } }))),
        sec('Jobs starting for your customers', 'CalendarDays', starting.map(j => ({ label: jl(j), sub: `Starts ${fmtDate(j.startDate)} · ${siteOf(db, j).city} — a good day to call`, to: jobRef(j) }))),
        sec('Year to date vs goal', 'Target', [{ label: `${money(won, true)} of ${money(goal, true)} · ${pctGoal}%`, sub: 'Won work booked this year', tone: pctGoal >= Math.round(diffDays(t, y0) / 365 * 100) ? 'ok' : 'warn', to: { page: 'quotes' } }]),
        sec('Swag given · 30 days', 'Gift', swag ? [{ label: `${money(swag.cost)} · ${swag.qty} pieces`, sub: 'Tap to see by customer', to: me ? { ref: { type: 'employee', id: me.id } } : undefined }] : [], 'None this month'),
        ...(crane ? [sec('Wind farm leads', 'Wind', leads.map(({ w, last }) => ({ label: `${w.farmName} · ${w.count} × ${w.model}`, sub: last ? (last.endDate < t ? `Last job ended ${fmtDate(last.endDate)} — ask about the next maintenance window` : `On site now (#${last.jobNo}) — upsell blade/gearbox work`) : 'No work yet — intro call', to: { ref: { type: 'windfarm', id: w.farmId } } as BriefTo })), 'No open leads')] : []),
      ],
    }
  }

  if (role === 'shop') {
    const down = db.equipment.filter(e => inScope(e, f) && (e.status === 'Out of Service' || e.status === 'Maintenance'))
    const pm = db.equipment.filter(e => inScope(e, f) && (serviceStatus(e).overdue || serviceStatus(e).dueSoon)).sort((a, b) => serviceStatus(a).daysLeft - serviceStatus(b).daysLeft)
    const wos = db.workOrders.filter(w => w.status !== 'Closed' && inScope(byId(db.equipment, w.unitId), f)).sort((a, b) => ['Critical', 'High', 'Normal', 'Low'].indexOf(a.priority) - ['Critical', 'High', 'Normal', 'Low'].indexOf(b.priority))
    const parts = db.items.filter(i => (i.branchId ?? 'br-okc') === (f.branchId === 'all' ? 'br-okc' : f.branchId) && ['Parts', 'Filters', 'Fluids & Oils', 'Tires'].includes(i.category) && isLow(i))
    const insp = db.inspections.filter(i => i.result !== 'Pass' && i.due <= addDays(t, 14) && i.unitId).sort((a, b) => a.due.localeCompare(b.due))
    return {
      title: 'Shop', text: `${greet()}${name}. ${plural(down.length, 'unit')} down or in the shop. ${plural(pm.filter(e => serviceStatus(e).overdue).length, 'PM')} overdue and ${pm.filter(e => !serviceStatus(e).overdue).length} coming due. ${plural(wos.length, 'open work order')}${wos.some(w => w.priority === 'Critical') ? ', including critical ones — start there' : ''}. ${parts.length ? `${plural(parts.length, 'part')} below reorder point.` : 'Parts stock looks good.'}`,
      sections: [
        sec('Units down', 'Wrench', down.map(e => ({ label: `${e.category} ${e.unit} · ${e.make} ${e.model}`, sub: e.status, tone: e.status === 'Out of Service' ? 'bad' : 'warn', to: { ref: { type: 'equipment', id: e.id } } }))),
        sec('Open work orders', 'ClipboardList', wos.slice(0, 10).map(w => ({ label: `${w.woNo} · ${byId(db.equipment, w.unitId)?.unit} · ${w.title}`, sub: `${w.priority} · ${w.status} · due ${fmtDate(w.due)}`, tone: w.priority === 'Critical' ? 'bad' : w.priority === 'High' ? 'warn' : undefined, to: { ref: { type: 'workorder', id: w.id } } }))),
        sec('PMs due', 'Gauge', pm.slice(0, 10).map(e => { const s = serviceStatus(e); return { label: `${e.category} ${e.unit}`, sub: s.overdue ? 'Overdue' : `Due in ${s.daysLeft} days${s.remaining != null ? ` · ${Math.round(s.remaining)} ${s.unit}` : ''}`, tone: s.overdue ? 'bad' : 'warn', to: { ref: { type: 'equipment', id: e.id } } } as BriefItem })),
        sec('Parts low', 'Package', parts.map(i => ({ label: i.name, sub: `${i.onHand} ${i.unit} on shelf · reorder at ${i.min}`, tone: 'warn', to: { ref: { type: 'item', id: i.id } } }))),
        sec('Inspections due', 'ClipboardCheck', insp.slice(0, 8).map(i => ({ label: `${i.kind} · ${byId(db.equipment, i.unitId)?.unit ?? ''}`, sub: `Due ${fmtDate(i.due)}`, tone: i.due < t ? 'bad' : 'warn', to: { ref: { type: 'equipment', id: i.unitId! } } }))),
      ],
    }
  }

  if (role === 'safety') {
    const inc = db.incidents.filter(i => i.status !== 'Closed').sort((a, b) => b.date.localeCompare(a.date))
    const certs = db.certs.filter(x => ['expired', '30'].includes(certBand(x).band) && inScope(byId(db.employees, x.employeeId), f)).sort((a, b) => a.expires.localeCompare(b.expires))
    const insp = db.inspections.filter(i => i.result !== 'Pass' && i.due <= addDays(t, 14)).sort((a, b) => a.due.localeCompare(b.due))
    const chems = db.items.filter(i => i.chemical)
    const gaps = chems.filter(i => !byId(db.sds, i.sdsId) || sdsExpired(byId(db.sds, i.sdsId)))
    const rig = db.items.filter(i => i.oos || (i.inspectionDue && i.inspectionDue <= addDays(t, 14))).sort((a, b) => (a.oos ? '0' : a.inspectionDue!).localeCompare(b.oos ? '0' : b.inspectionDue!))
    return {
      title: 'Safety', text: `${greet()}${name}. ${plural(inc.length, 'open incident')}. ${plural(certs.length, 'cert')} expired or expiring within 30 days. ${plural(insp.length, 'inspection')} due in the next two weeks. ${gaps.length ? `${plural(gaps.length, 'chemical')} with a missing or out-of-date SDS. ` : ''}${plural(rig.length, 'rigging item')} due or tagged out. Today's toolbox talk: ${talkOfDay()}.`,
      sections: [
        sec('Toolbox talk of the day', 'Megaphone', [{ label: talkOfDay(), sub: 'Push to every crew’s JSA', tone: 'info', to: { page: 'safety', hash: 'talks' } }]),
        sec('Open incidents', 'AlertTriangle', inc.map(i => ({ label: `${i.no} · ${i.kind}`, sub: `${i.status} · ${fmtDate(i.date)} · ${i.description}`, tone: i.severity === 'High' ? 'bad' : 'warn', to: i.jobId ? { ref: { type: 'job', id: i.jobId } } : i.employeeId ? { ref: { type: 'employee', id: i.employeeId } } : { page: 'safety' } }))),
        sec('Certs expiring', 'Award', certs.slice(0, 10).map(x => ({ label: `${fullName(byId(db.employees, x.employeeId))} · ${x.type}`, sub: certBand(x).band === 'expired' ? `Expired ${fmtDate(x.expires)}` : `Expires ${fmtDate(x.expires)}`, tone: certBand(x).band === 'expired' ? 'bad' : 'warn', to: { ref: { type: 'cert', id: x.id } } }))),
        sec('Inspections due', 'ClipboardCheck', insp.slice(0, 8).map(i => ({ label: `${i.kind}${i.unitId ? ` · ${byId(db.equipment, i.unitId)?.unit}` : i.itemId ? ` · ${byId(db.items, i.itemId)?.name}` : ''}`, sub: `Due ${fmtDate(i.due)}`, tone: i.due < t ? 'bad' : 'warn', to: i.unitId ? { ref: { type: 'equipment', id: i.unitId } } : i.itemId ? { ref: { type: 'item', id: i.itemId } } : { page: 'safety' } }))),
        sec('SDS gaps', 'FlaskConical', gaps.map(i => ({ label: i.name, sub: byId(db.sds, i.sdsId) ? 'SDS older than 3 years' : 'No SDS on file', tone: 'bad', to: { ref: { type: 'item', id: i.id } } })), 'Every chemical has a current SDS'),
        sec('Rigging inspections', 'Link', rig.slice(0, 8).map(i => ({ label: i.name, sub: i.oos ? `Tagged out · ${i.oos.reason}` : `Due ${fmtDate(i.inspectionDue!)}`, tone: i.oos || i.inspectionDue! < t ? 'bad' : 'warn', to: { ref: { type: 'item', id: i.id } } }))),
      ],
    }
  }

  if (role === 'hr') {
    const pto = db.pto.filter(p => p.status === 'Pending')
    const hires = db.hires
    const certs = db.certs.filter(x => ['expired', '30', '60'].includes(certBand(x).band)).sort((a, b) => a.expires.localeCompare(b.expires))
    const md = (d: string) => d.slice(5)
    const soon = (d: string) => { for (let k = 0; k <= 7; k++) if (md(addDays(t, k)) === md(d)) return k; return -1 }
    const active = db.employees.filter(e => e.status === 'Active' && inScope(e, f))
    const anniv = active.filter(e => e.hireDate && e.hireDate < t.slice(0, 4) && soon(e.hireDate) >= 0)
    // demo birthdays: derived from the employee id (no DOB stored in the demo)
    const bday = (e: T.Employee) => addDays(t.slice(0, 4) + '-01-01', hash(e.id) % 365)
    const bdays = active.filter(e => soon(bday(e)) >= 0).slice(0, 6)
    return {
      title: 'People', text: `${greet()}${name}. ${plural(pto.length, 'PTO request')} waiting on you. ${plural(hires.length, 'new hire')} in onboarding. ${plural(certs.length, 'cert or license', 'certs and licenses')} expiring in the next 60 days. ${anniv.length ? `${plural(anniv.length, 'work anniversary', 'work anniversaries')} and ` : ''}${plural(bdays.length, 'birthday')} this week.`,
      sections: [
        sec('PTO requests', 'CalendarDays', pto.map(p => ({ label: `${fullName(byId(db.employees, p.employeeId))} · ${p.kind}`, sub: `${fmtDate(p.from)}–${fmtDate(p.to)} · ${p.hours}h`, tone: 'warn', to: { ref: { type: 'employee', id: p.employeeId } } }))),
        sec('Employee info changes', 'UserCog', (db.infoChanges ?? []).filter(c => !c.hrSeen).slice(0, 8).map(c => ({ label: `${fullName(byId(db.employees, c.employeeId))} · ${c.label}`, sub: `${c.to || 'removed'}${c.payroll ? ' · update payroll / tax withholding' : ''}`, tone: c.payroll ? 'warn' : 'info', to: { ref: { type: 'employee', id: c.employeeId } }, testid: 'brief-infochange' } as BriefItem)), 'No new changes'),
        reconSec(),
        sec('Onboarding', 'UserPlus', hires.map(h => { const done = Object.values(h.steps).filter(Boolean).length; return { label: `${h.first} ${h.last} · ${h.craft}`, sub: `Starts ${fmtDate(h.start)} · ${done}/${Object.keys(h.steps).length} steps done`, to: { page: 'people' } } as BriefItem })),
        sec('Cert & license expirations', 'Award', certs.slice(0, 10).map(x => ({ label: `${fullName(byId(db.employees, x.employeeId))} · ${x.type}`, sub: `${certBand(x).band === 'expired' ? 'Expired' : 'Expires'} ${fmtDate(x.expires)}`, tone: certBand(x).band === 'expired' ? 'bad' : 'warn', to: { ref: { type: 'cert', id: x.id } } }))),
        sec('Anniversaries & birthdays', 'Cake', [...anniv.map(e => ({ label: `${fullName(e)} · ${Number(t.slice(0, 4)) - Number(e.hireDate.slice(0, 4))} years`, sub: `Work anniversary ${fmtDate(t.slice(0, 4) + '-' + md(e.hireDate))}`, tone: 'ok', to: { ref: { type: 'employee', id: e.id } } } as BriefItem)), ...bdays.map(e => ({ label: `${fullName(e)} · birthday`, sub: `${fmtDate(bday(e))} (demo date)`, tone: 'ok', to: { ref: { type: 'employee', id: e.id } } } as BriefItem))], 'None this week'),
      ],
    }
  }

  if (role === 'accounting' || role === 'payroll') {
    if (role === 'payroll') {
      const sub = db.time.filter(x => x.status === 'Submitted'), flag = db.time.filter(x => x.status === 'Flagged')
      return { title: 'Payroll', text: `${greet()}${name}. ${plural(sub.length, 'time entry', 'time entries')} waiting for approval and ${plural(flag.length, 'flagged entry', 'flagged entries')} to review before export.`, sections: [
        sec('Flagged time', 'AlertTriangle', flag.slice(0, 10).map(x => ({ label: `${fullName(byId(db.employees, x.employeeId))} · ${fmtDate(x.date)}`, sub: `${x.hours}h · ${x.note ?? x.activity}`, tone: 'bad', to: { ref: { type: 'time', id: x.id } } }))),
        sec('Address changes (tax)', 'MapPin', (db.infoChanges ?? []).filter(c => c.payroll && c.at > addDays(t, -14)).map(c => ({ label: `${fullName(byId(db.employees, c.employeeId))} · ${c.label}`, sub: c.to, tone: 'warn', to: { ref: { type: 'employee', id: c.employeeId } } } as BriefItem)), 'No address changes'),
        reconSec(),
        sec('Waiting approval', 'Clock', [{ label: `${sub.length} entries · ${sub.reduce((s, x) => s + x.hours, 0).toFixed(0)} hours`, sub: 'Approve in bulk', to: { page: 'time' } }]),
      ] }
    }
    const coding = db.bills.filter(b => b.status === 'Needs Coding')
    const approve = db.bills.filter(b => b.status === 'Pending Approval')
    const open = db.invoices.filter(i => i.status !== 'Paid' && i.status !== 'Draft')
    const overdue = open.filter(i => i.due < t)
    const dueSoon = open.filter(i => i.due >= t && i.due <= addDays(t, 7))
    const cash = db.invoices.flatMap(i => i.payments.filter(p => p.date > addDays(t, -7)).map(p => ({ p, i })))
    const buckets: Record<string, number> = {}
    open.forEach(i => { const b = agingBucket(i); buckets[b] = (buckets[b] ?? 0) + i.amount - i.paid })
    return {
      title: 'Money', text: `${greet()}${name}. ${plural(coding.length, 'bill')} need job numbers and ${plural(approve.length, 'bill')} need approval. ${plural(overdue.length, 'invoice')} overdue totaling ${money(overdue.reduce((s, i) => s + i.amount - i.paid, 0), true)}, ${dueSoon.length} more due this week. ${money(cash.reduce((s, x) => s + x.p.amount, 0), true)} collected in the last 7 days.`,
      sections: [
        sec('Bills needing job numbers', 'Receipt', coding.slice(0, 10).map(b => ({ label: `${byId(db.vendors, b.vendorId)?.name} · ${b.billNo}`, sub: money(b.lines.reduce((s, l) => s + l.amount, 0)), tone: 'warn', to: { ref: { type: 'bill', id: b.id } } }))),
        sec('Approvals', 'CheckCircle2', approve.slice(0, 10).map(b => ({ label: `${byId(db.vendors, b.vendorId)?.name} · ${b.billNo}`, sub: `${money(b.lines.reduce((s, l) => s + l.amount, 0))} · due ${fmtDate(b.due)}`, to: { ref: { type: 'bill', id: b.id } } }))),
        sec('Invoices overdue', 'AlertTriangle', overdue.sort((a, b) => a.due.localeCompare(b.due)).slice(0, 10).map(i => ({ label: `${i.invNo} · ${byId(db.customers, i.customerId)?.name}`, sub: `${money(i.amount - i.paid)} · due ${fmtDate(i.due)} · ${i.collections}`, tone: 'bad', to: { ref: { type: 'invoice', id: i.id } } }))),
        sec('Due this week', 'CalendarDays', dueSoon.map(i => ({ label: `${i.invNo} · ${byId(db.customers, i.customerId)?.name}`, sub: `${money(i.amount - i.paid)} · due ${fmtDate(i.due)}`, to: { ref: { type: 'invoice', id: i.id } } }))),
        sec('Cash collected · 7 days', 'Banknote', cash.slice(0, 8).map(x => ({ label: `${money(x.p.amount)} · ${byId(db.customers, x.i.customerId)?.name}`, sub: `${fmtDate(x.p.date)} · ${x.p.method} ${x.p.ref}`, tone: 'ok', to: { ref: { type: 'invoice', id: x.i.id } } }))),
        sec('Aging', 'BarChart3', Object.entries(buckets).map(([k, v]) => ({ label: `${k}`, sub: money(v), to: { page: 'receivables' } }))),
      ],
    }
  }

  if (role === 'inventory') {
    const reqs = (db.partsRequests ?? []).filter(r => r.status === 'Waiting' || r.status === 'Approved')
    const toRecv = db.pos.filter(p => p.status === 'Sent' || p.status === 'Partially Received')
    const openPo = (id: string) => db.pos.some(p => ['Draft', 'Sent', 'Partially Received'].includes(p.status) && p.lines.some(l => l.itemId === id && l.received < l.qty))
    const low = db.items.filter(i => (i.branchId ?? 'br-okc') === 'br-okc' && isLow(i) && !i.oos && !openPo(i.id))
    const overdue = db.checkouts.filter(x => isOpen(x) && x.returnable && x.due < t)
    const cc = (db.cycleCounts ?? []).find(x => x.status === 'Due')
    const insp = db.items.filter(i => (i.branchId ?? 'br-okc') === 'br-okc' && i.inspectionDue && i.inspectionDue <= addDays(t, 7) && !i.oos)
    return {
      title: 'Inventory & purchasing', text: `${greet()}${name}. ${plural(reqs.length, 'parts request')} waiting, ${plural(toRecv.length, 'PO')} due in, ${plural(overdue.length, 'returnable')} overdue and ${plural(low.length, 'item')} below min.${cc ? ` This week’s count: ${cc.label}.` : ''}`,
      sections: [
        sec('Requests', 'ClipboardList', reqs.slice(0, 6).map(r => ({ label: `${r.byName} · ${r.lines.length} item${r.lines.length === 1 ? '' : 's'}`, sub: `${r.no} · ${r.reason}`, tone: r.needBy <= t ? 'warn' : undefined, to: { ref: { type: 'request', id: r.id } } } as BriefItem)), 'No one is waiting'),
        sec('Deliveries to receive', 'PackageCheck', toRecv.map(p => ({ label: `${p.poNo} · ${byId(db.vendors, p.vendorId)?.name}`, sub: `${p.lines.length} lines${p.expected ? ` · expected ${fmtDate(p.expected)}` : ''}`, to: { ref: { type: 'po', id: p.id } } } as BriefItem)), 'Nothing on the way'),
        sec('Below min', 'AlertTriangle', low.slice(0, 6).map(i => ({ label: i.name, sub: `${i.onHand} on hand · min ${i.min}`, tone: 'warn', to: { page: 'purchasing' } } as BriefItem)), 'Everything stocked'),
        sec('Overdue returns', 'Clock', overdue.slice(0, 5).map(x => ({ label: `${byId(db.items, x.itemId)?.name}`, sub: `${x.byName} · due ${fmtDate(x.due)}`, tone: 'bad', to: { ref: { type: 'item', id: x.itemId } } } as BriefItem)), 'All back'),
        sec('Rigging inspections this week', 'ShieldCheck', insp.slice(0, 5).map(i => ({ label: i.name, sub: `Due ${fmtDate(i.inspectionDue!)}`, tone: i.inspectionDue! < t ? 'bad' : 'warn', to: { ref: { type: 'item', id: i.id } } } as BriefItem)), 'None due'),
      ],
    }
  }

  if (role === 'frontdesk') {
    const deliveries = db.pos.filter(p => p.status === 'Sent' || p.status === 'Partially Received')
    const starting = db.hires.filter(h => h.start >= t && h.start <= addDays(t, 3))
    const custVisits = db.jobs.filter(j => j.stage === 'Quote' && !j.quoteLost && inScope(j, f)).slice(0, 2)
    const inField = okcJobs(t).reduce((s, j) => s + crewOn(db, j.id, t).length, 0)
    const confirm = okcJobs(tm).filter(j => j.startDate === tm)
    return {
      title: 'Front desk', text: `${greet()}${name}. ${plural(deliveries.length, 'delivery', 'deliveries')} expected${starting.length ? ` and ${plural(starting.length, 'new hire')} coming in for orientation` : ''}. ${inField} people are out on jobs, ${absentToday.length + ptoToday.length} out today. ${plural(confirm.length, 'customer')} to call and confirm for tomorrow.`,
      sections: [
        sec('Deliveries expected', 'PackageCheck', deliveries.map(p => ({ label: `${byId(db.vendors, p.vendorId)?.name} · ${p.poNo}`, sub: `${p.lines.length} lines · receive at the parts counter`, to: { page: 'inventory' } }))),
        sec('Visitors', 'DoorOpen', [...starting.map(h => ({ label: `${h.first} ${h.last} · new hire orientation`, sub: `${fmtDate(h.start)} · ${h.craft}`, to: { page: 'people' } } as BriefItem)), ...custVisits.map(j => ({ label: `${customerOf(db, j).contact} (${customerOf(db, j).name})`, sub: `Quote review · ${j.name}`, to: jobRef(j) } as BriefItem))], 'No visitors scheduled'),
        sec('Who’s in / out', 'UserX', [{ label: `${inField} on job sites today`, sub: `${okcJobs(t).length} jobs`, to: { page: 'jobs' } }, ...absentToday.map(x => ({ label: fullName(x.e), sub: `Out · ${x.a.kind}`, to: { ref: { type: 'employee', id: x.e!.id } } as BriefTo })), ...ptoToday.map(p => ({ label: fullName(byId(db.employees, p.employeeId)), sub: 'PTO', to: { ref: { type: 'employee', id: p.employeeId } } as BriefTo }))]),
        sec('Call list', 'PhoneCall', confirm.map(j => ({ label: `${customerOf(db, j).contact} · ${customerOf(db, j).name}`, sub: `Confirm tomorrow ${j.startTime} · #${j.jobNo} · ${customerOf(db, j).phone}`, to: { href: `tel:${customerOf(db, j).phone}` } })), 'No calls queued'),
      ],
    }
  }

  // branch manager / ops / owner fallback: P&L snapshot, utilization, problems
  const ys = yearSeries(db, f)
  const active = okcJobs(t)
  const cranes = db.equipment.filter(e => e.category === 'Crane' && inScope(e, f))
  const working = cranes.filter(cr => active.some(j => j.craneId === cr.id)).length
  const health = costJobs(db, f, t).map(j => ({ j, c: jobCosting(db, j) }))
  const behind = health.filter(h => h.c.health === 'behind')
  const conflicts = active.filter(j => jobConflicts(db, j, t).some(x => x.level === 'red'))
  const down = db.equipment.filter(e => inScope(e, f) && e.status === 'Out of Service')
  const overdueAr = db.invoices.filter(i => i.status !== 'Paid' && i.due < t && inScope(byId(db.jobs, i.jobId), f))
  const br = f.branchId !== 'all' ? db.branches.find(b => b.id === f.branchId)?.name.replace(' (HQ)', '') : 'all branches'
  return {
    title: role === 'ops' ? 'Operations' : 'Branch', text: `${greet()}${name}. ${br}: ${money(ys.ytd, true)} in sales year to date, ${ys.ytdPrev ? `${Math.round((ys.ytd - ys.ytdPrev) / ys.ytdPrev * 100)}% versus last year` : ''}. ${working} of ${cranes.length} ${crane ? 'cranes' : 'units'} working today, ${plural(active.length, 'job')} running. ${behind.length ? `${plural(behind.length, 'job')} projected to lose money. ` : ''}${conflicts.length ? `${plural(conflicts.length, 'crew conflict')}. ` : ''}${down.length ? `${plural(down.length, 'unit')} down. ` : ''}${overdueAr.length ? `${plural(overdueAr.length, 'invoice')} overdue.` : ''}`,
    sections: [
      sec('P&L snapshot', 'LineChart', [{ label: `${money(ys.ytd, true)} sales YTD`, sub: ys.ytdPrev ? `Last year same point ${money(ys.ytdPrev, true)}` : undefined, tone: ys.ytd >= ys.ytdPrev ? 'ok' : 'warn', to: { page: 'analytics' } }, { label: `${money(active.reduce((s, j) => s + j.dayRate, 0), true)} a day at work`, sub: `${plural(active.length, 'job')} today`, to: { page: 'dispatch' } }]),
      sec('Utilization', 'Gauge', [{ label: `${working} of ${cranes.length} ${crane ? 'cranes' : 'units'} working · ${cranes.length ? Math.round(working / cranes.length * 100) : 0}%`, to: { page: 'forecast' } }]),
      sec('Problems', 'AlertTriangle', [
        ...behind.slice(0, 5).map(h => ({ label: jl(h.j), sub: `Projected margin ${Math.round(h.c.projMargin * 100)}%`, tone: 'bad', to: { ref: { type: 'job', id: h.j.id, tab: 'cost' } } } as BriefItem)),
        ...conflicts.map(j => ({ label: jl(j), sub: 'Crew conflict', tone: 'bad', to: { ref: { type: 'job', id: j.id, tab: 'crew' } } } as BriefItem)),
        ...down.map(e => ({ label: `${e.category} ${e.unit} down`, sub: `${e.make} ${e.model}`, tone: 'bad', to: { ref: { type: 'equipment', id: e.id } } } as BriefItem)),
        ...overdueAr.slice(0, 4).map(i => ({ label: `${i.invNo} overdue · ${byId(db.customers, i.customerId)?.name}`, sub: money(i.amount - i.paid), tone: 'warn', to: { ref: { type: 'invoice', id: i.id } } } as BriefItem)),
      ], 'No problems flagged'),
    ],
  }
}
