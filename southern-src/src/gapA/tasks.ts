/** "What do you need to do?" — plain-English tasks mapped to the exact screen or action (Gap analysis §3.1 table). */
import type * as T from '../data/types'
import type { PageKey } from '../data/roles'
import { roleDef } from '../data/roles'
import { useStore } from '../data/store'
import { useGapA } from './intent'
import { dqSummary } from './dq'
import { useRig, rigAlerts } from './rigging'
import { recert } from './nccco'
import { useDa, pool, chStatus, quarterOf } from './drug'
import { today } from '../lib/util'
import { billsToCode, billsToApprove, timeToApprove } from '../data/counts'

export interface Task { id: string; verb: 'Snap' | 'Sign' | 'Report' | 'Request' | 'Approve' | 'Open' | 'Send' | 'Check'; label: string; keys: string; pages?: PageKey[]; field?: string; ui?: () => void; tab?: string; der?: boolean; old?: string }
const ui = (p: Record<string, unknown>) => () => useStore.getState().setUI(p as never)
const certTab = (t: string) => () => sessionStorage.setItem('sc-certhub-tab', t)
const rig = (kind: 'rig-report' | 'rig-inspect') => (q?: string) => useGapA.setState({ intent: { kind, q } })
export const TASKS: Task[] = [
  { id: 'job', verb: 'Open', label: 'See tomorrow’s job and crew', keys: 'tomorrow job crew schedule where am i working dispatch board', pages: ['dispatch', 'jobs'], field: 'tab:schedule' },
  { id: 'clock', verb: 'Open', label: 'Clock in or out', keys: 'clock in out punch time timesheet hours', pages: ['time', 'myinfo'], field: 'tab:time' },
  { id: 'ticket', verb: 'Sign', label: 'Get the customer to sign the ticket', keys: 'sign ticket field ticket signature customer sign off', pages: ['tickets'], field: 'ticket' },
  { id: 'npt', verb: 'Report', label: 'Log nonproductive time (NPT)', keys: 'npt nonproductive downtime standby wind waiting weather delay no work stand down', pages: ['tickets'], field: 'npt' },
  { id: 'receipt', verb: 'Snap', label: 'Turn in a receipt', keys: 'receipt expense turn in submit receipt reimburse concur expensify', pages: ['expenses'], field: 'expenses', old: 'Concur' },
  { id: 'perdiem', verb: 'Check', label: 'Check my per diem', keys: 'per diem perdiem meals travel pay', pages: ['time', 'myinfo'], field: 'tab:time' },
  { id: 'pto', verb: 'Request', label: 'Request time off', keys: 'pto time off vacation sick day off leave request pto i m sick tomorrow', pages: ['myinfo', 'people'], field: 'pto' },
  { id: 'pay', verb: 'Open', label: 'See my pay stub or W-2', keys: 'pay stub paycheck check stub my pay w2 w-2 paychex direct deposit overtime how much did i make', pages: ['myinfo'], field: 'pay', old: 'Paychex' },
  { id: 'myunion', verb: 'Open', label: 'My union local, scale & per diem', keys: 'union local hall dues scale business agent iuoe my local union rate', pages: ['union'], field: 'union' },
  { id: 'unionhrs', verb: 'Check', label: 'My union hours by year', keys: 'union hours my hours local hours worked this year pension hours fringe hours', pages: ['myinfo', 'union'], field: 'union' },
  { id: 'ptobal', verb: 'Check', label: 'How much PTO do I have left', keys: 'pto balance how much pto vacation left sick hours left vacation balance hours left', pages: ['myinfo'], field: 'pto' },
  { id: 'address', verb: 'Open', label: 'Change my address or phone', keys: 'address phone change my info emergency contact', pages: ['myinfo'], field: 'myinfo' },
  { id: 'mycerts', verb: 'Send', label: 'Send my certs / show them at the gate', keys: 'send my certs certifications cards gate show wallet card', pages: ['myinfo', 'certtracker'], field: 'certs' },
  { id: 'crewcerts', verb: 'Send', label: 'Send crew certs to a customer', keys: 'send crew certs customer prequal packet', pages: ['jobs', 'certtracker'], field: 'certs' },
  { id: 'cards', verb: 'Open', label: 'My company & fuel cards', keys: 'my cards credit card fuel card wex comdata card limit transactions last 4', pages: ['myinfo'], field: 'cards' },
  { id: 'breakdown', verb: 'Report', label: 'Report a breakdown or defect', keys: 'breakdown broke down defect flat tire crane broke truck broke emergency', ui: ui({ breakdownOpen: true }), pages: ['shop'], field: 'breakdown' },
  { id: 'shackle', verb: 'Report', label: 'Report a broken shackle or damaged sling', keys: 'report broken shackle damaged sling bent shackle cut sling rigging tag out remove from service', pages: ['rigging'], field: 'rigging' },
  { id: 'riginspect', verb: 'Check', label: 'Inspect rigging (frequent / periodic)', keys: 'inspect rigging sling inspection shackle inspection color code b30.9', pages: ['rigging'], field: 'riginspect' },
  { id: 'dvir', verb: 'Check', label: 'Do my pre-trip or crane pre-shift', keys: 'pre trip pretrip dvir pre shift inspection walkaround', pages: ['maint'], field: 'dvir' },
  { id: 'incident', verb: 'Report', label: 'Report an injury or near miss', keys: 'incident injury near miss hurt i got hurt accident report safety', pages: ['safety'], field: 'incident' },
  { id: 'jsa', verb: 'Sign', label: 'Sign a JSA or toolbox talk', keys: 'jsa toolbox talk safety brief sign in sheet', pages: ['safety'], field: 'jsa' },
  { id: 'sds', verb: 'Open', label: 'Look up an SDS', keys: 'sds msds safety data sheet chemical', pages: ['inventory', 'safety'], field: 'sds' },
  { id: 'checkout', verb: 'Open', label: 'Check out a tool, sling or PPE', keys: 'check out checkout tool sling ppe scan qr borrow', pages: ['invhome', 'inventory'], field: 'gear' },
  { id: 'parts', verb: 'Request', label: 'Request parts or supplies', keys: 'parts supplies order request need po', pages: ['requests', 'purchasing'], field: 'parts' },
  { id: 'quotes', verb: 'Request', label: 'Get quotes from vendors', keys: 'vendor quotes bids rfq trucking quote', pages: ['bids'] },
  { id: 'where', verb: 'Open', label: 'See where a crane or truck is', keys: 'where is crane truck location gps samsara map', pages: ['command', 'equipment'] },
  { id: 'lift', verb: 'Open', label: 'Read the lift plan', keys: 'lift plan rigging plan pick plan', pages: ['lifts', 'jobs'], field: 'site' },
  { id: 'gate', verb: 'Open', label: 'Find the gate code and site notes', keys: 'gate code site notes directions pad road', pages: ['sitedata', 'jobs'], field: 'site' },
  { id: 'msg', verb: 'Open', label: 'Message the crew', keys: 'message crew chat text group job channel', pages: ['messages'] },
  { id: 'approvetime', verb: 'Approve', label: 'Approve time', keys: 'approve time timecards payroll hours', pages: ['time'] },
  { id: 'approvebill', verb: 'Approve', label: 'Approve a vendor bill', keys: 'approve bill vendor invoice payables ap quickbooks', pages: ['payables'], old: 'QuickBooks' },
  { id: 'invoice', verb: 'Send', label: 'Send an invoice', keys: 'send invoice bill customer receivables ar', pages: ['receivables'] },
  { id: 'status', verb: 'Send', label: 'Share a customer’s project status', keys: 'customer project status portal link', pages: ['jobs'] },
  { id: 'newhire', verb: 'Send', label: 'Do new-hire paperwork', keys: 'new hire onboarding paperwork welcome packet w4 i9', pages: ['onboarding', 'people'] },
  { id: 'store', verb: 'Open', label: 'Order swag with credits', keys: 'store swag shirt hoodie credits gear logo', pages: ['store'] },
  { id: 'suggest', verb: 'Send', label: 'Suggest an idea', keys: 'suggest idea feedback bug improvement', pages: ['suggest'] },
  { id: 'dq', verb: 'Check', label: 'DOT driver qualification files', keys: 'dq driver file mvr medical card road test annual review dot driver qualification', pages: ['certtracker'], ui: certTab('dq') },
  { id: 'nccco', verb: 'Check', label: 'Verify an operator’s NCCCO card', keys: 'nccco verify operator certification cco recert', pages: ['certtracker'], ui: certTab('nccco') },
  { id: 'random', verb: 'Open', label: 'Drug & alcohol random selection', keys: 'drug test alcohol random clearinghouse der', pages: ['drugalc'], der: true },
  { id: 'quickbase', verb: 'Open', label: 'Quickbase is here now', keys: 'quickbase', pages: ['jobs', 'dispatch'], old: 'Quickbase' },
]
const STOP = new Set(['i', 'a', 'an', 'the', 'my', 'to', 'do', 'need', 'want', 'how', 'can', 'please', 'of', 'for', 'in', 'on', 'it', 'is', 'me'])
export const words = (q: string) => q.toLowerCase().replace(/[^a-z0-9.\- ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w))
export function taskAvail(t: Task, role: T.RoleKey) {
  if (t.der && role !== 'der') return false
  if (role === 'field') return !!t.field
  const rd = roleDef(role); return !!(t.pages?.some(p => rd.pages.includes(p)) || (t.ui && !t.pages))
}
export function matchTasks(q: string, role: T.RoleKey) {
  const ws = words(q); if (!ws.length) return []
  return TASKS.filter(t => taskAvail(t, role)).map(t => { const hay = `${t.label} ${t.keys}`.toLowerCase(); const s = ws.reduce((n, w) => n + (hay.includes(w) ? (w.length > 3 ? 2 : 1) : 0), 0); return { t, s } })
    .filter(x => x.s >= Math.min(2, ws.length)).sort((a, b) => b.s - a.s).map(x => x.t)
}
/** Run a task: field role opens the phone sheet; office roles go to the exact screen (and pre-open the right tab/form). */
export function runTask(t: Task, q = '') {
  const st = useStore.getState(), role = st.session!.role
  if (role === 'field') { useGapA.setState({ intent: { kind: 'field-sheet', sheet: t.field! } }); return }
  t.ui?.()
  if (t.id === 'shackle') rig('rig-report')(/shackle/i.test(q) ? 'shackle' : /sling/i.test(q) ? 'sling' : undefined)
  if (t.id === 'riginspect') rig('rig-inspect')()
  const rd = roleDef(role), page = t.pages?.find(p => rd.pages.includes(p))
  if (page) st.go(page)
}

export interface Todo { id: string; label: string; tone: 'bad' | 'warn' | 'info' | 'ok'; task?: string; page?: PageKey }
/** Home "your tasks" — only what this person has to do today. */
export function myTodos(db: T.DB, role: T.RoleKey): Todo[] {
  const out: Todo[] = [], t = today()
  const can = (p: PageKey) => role !== 'field' && roleDef(role).pages.includes(p)
  const pieces = useRig.getState().pieces ?? useRig.getState().ensure(db)
  const ra = rigAlerts(pieces)
  if (role === 'field') {
    // worked out from the data: only today's real, unfinished jobs (signed ticket / signed JSA drop off)
    const me = useStore.getState().session?.employeeId
    const asg = db.assignments.find(a => a.employeeId === me && a.date === t)
    if (!asg) return out
    const tk = db.tickets.find(x => x.jobId === asg.jobId && x.date === t)
    if (!tk?.signedAt) out.push({ id: 'f-ticket', label: 'Sign today’s ticket with the customer', tone: 'info', task: 'ticket' })
    out.push({ id: 'f-rig', label: 'Pre-shift rigging check — slings & shackles', tone: 'warn', task: 'riginspect' })
    const jsa = db.talks.filter(x => x.kind === 'JSA' && x.jobId === asg.jobId)
    if (!jsa.length || !jsa.some(x => me && x.attendeeIds.includes(me))) out.push({ id: 'f-jsa', label: 'Sign today’s JSA', tone: 'info', task: 'jsa' })
    return out
  }
  if (can('certtracker') && ['safety', 'dispatch', 'ops', 'hr', 'owner', 'branch'].includes(role)) {
    const s = dqSummary(db); if (s.blocked.length) out.push({ id: 'dq', label: `${s.blocked.length} driver${s.blocked.length > 1 ? 's' : ''} blocked — DQ file out of date`, tone: 'bad', task: 'dq' })
    const ops = db.employees.filter(e => e.craft === 'Operator').map(e => recert(db, e.id)).filter(r => r && r.tone !== 'ok').length
    if (ops && ['safety', 'hr'].includes(role)) out.push({ id: 'nccco', label: `${ops} NCCCO recert${ops > 1 ? 's' : ''} due within 90 days`, tone: 'warn', task: 'nccco' })
  }
  if (can('rigging') && ['safety', 'shop', 'inventory', 'ops', 'owner', 'branch'].includes(role) && ra.overdue.length + ra.soon.length) out.push({ id: 'rig', label: `${ra.overdue.length} rigging overdue · ${ra.soon.length} due or wrong color`, tone: ra.overdue.length ? 'bad' : 'warn', page: 'rigging' })
  if (role === 'der') {
    const da = useDa.getState(); da.ensure(db)
    if (!da.selections.some(s => s.quarter === quarterOf(t))) out.push({ id: 'sel', label: `Run the ${quarterOf(t)} random selection`, tone: 'warn', page: 'drugalc' })
    const due = pool(db).filter(e => chStatus(da.queries, e.id).tone !== 'ok').length
    if (due) out.push({ id: 'ch', label: `${due} Clearinghouse annual quer${due > 1 ? 'ies' : 'y'} due`, tone: 'bad', page: 'drugalc' })
  }
  if (role === 'payroll' || role === 'ops') { const n = timeToApprove(db, useStore.getState().ui.filter).length; if (n) out.push({ id: 'time', label: `Approve ${n} time entr${n === 1 ? 'y' : 'ies'} this week`, tone: 'info', task: 'approvetime' }) }
  if (role === 'accounting') { const sc = useStore.getState().ui.filter, nc = billsToCode(db, sc).length, na = billsToApprove(db, sc).length, n = nc + na; if (n) out.push({ id: 'bills', label: `${nc} bill${nc === 1 ? '' : 's'} to code · ${na} to approve`, tone: 'info', task: 'approvebill' }) }
  return out.slice(0, 5)
}
