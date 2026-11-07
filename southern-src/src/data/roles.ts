import { setHideMoney } from '../lib/util'
import type { RoleKey } from './types'

export type PageKey =
  | 'command' | 'analytics' | 'dispatch' | 'forecast' | 'jobs' | 'configs' | 'allocations' | 'equipment' | 'shop'
  | 'inventory' | 'safety' | 'time' | 'tickets' | 'people' | 'payables' | 'receivables' | 'integrations' | 'audit' | 'settings' | 'contacts' | 'field' | 'windfarms' | 'quotes' | 'lifts' | 'vault' | 'myinfo'
  | 'invhome' | 'purchasing' | 'requests' | 'invguide' | 'moves' | 'suggest' | 'pickup' | 'bids' | 'weather'
  | 'onboarding' | 'store' | 'expenses'
  | 'recon' | 'changeorders' | 'certtracker' | 'sitedata'
  | 'maint' | 'messages' | 'mgmt' | 'acctsync'
  | 'rigging' | 'drugalc' | 'guests' | 'branding'
  | 'fuel' | 'pto' | 'permits'
  | 'union'

export interface PageDef { key: PageKey; label: string; icon: string; group: 'Run' | 'Assets' | 'People' | 'Money' | 'System'; /** Mobile tab-bar label (defaults to the first word of label). */ short?: string }
export const PAGES: PageDef[] = [
  { key: 'command', label: 'Command', icon: 'Radar', group: 'Run' },
  { key: 'dispatch', label: 'Dispatch', icon: 'CalendarRange', group: 'Run' },
  { key: 'jobs', label: 'Jobs', icon: 'Briefcase', group: 'Run' },
  { key: 'forecast', label: 'Crane Forecast', icon: 'GanttChart', group: 'Run' },
  { key: 'tickets', label: 'Field Tickets', icon: 'FileSignature', group: 'Run' },
  { key: 'windfarms', label: 'Wind Farms', icon: 'Wind', group: 'Run' },
  { key: 'quotes', label: 'Quotes', icon: 'FileText', group: 'Run' },
  { key: 'lifts', label: 'Lift Planning', icon: 'Ruler', group: 'Run' },
  { key: 'vault', label: 'Documents', icon: 'FolderOpen', group: 'System' },
  { key: 'equipment', label: 'Equipment', icon: 'Truck', group: 'Assets' },
  { key: 'configs', label: 'Crane Configs', icon: 'Layers', group: 'Assets' },
  { key: 'shop', label: 'Shop', icon: 'Wrench', group: 'Assets' },
  { key: 'invhome', label: 'Inventory Command', icon: 'ScanLine', group: 'Assets', short: 'Today' },
  { key: 'inventory', label: 'Inventory', icon: 'Boxes', group: 'Assets' },
  { key: 'purchasing', label: 'Purchasing', icon: 'ShoppingCart', group: 'Assets' },
  { key: 'requests', label: 'Parts Requests', icon: 'ClipboardList', group: 'Assets', short: 'Requests' },
  { key: 'invguide', label: 'How inventory works', icon: 'BookOpen', group: 'Assets', short: 'Guide' },
  { key: 'people', label: 'People & HR', icon: 'Users', group: 'People' },
  { key: 'allocations', label: 'Field Allocations', icon: 'Network', group: 'People' },
  { key: 'safety', label: 'Safety', icon: 'ShieldCheck', group: 'People' },
  { key: 'time', label: 'Time & Payroll', icon: 'Clock', group: 'People' },
  { key: 'analytics', label: 'Job Costing', icon: 'LineChart', group: 'Money' },
  { key: 'receivables', label: 'Receivables', icon: 'HandCoins', group: 'Money' },
  { key: 'payables', label: 'Payables', icon: 'Receipt', group: 'Money' },
  { key: 'contacts', label: 'Contacts', icon: 'Phone', group: 'System' },
  { key: 'integrations', label: 'Integrations', icon: 'Plug', group: 'System' },
  { key: 'audit', label: 'Audit Log', icon: 'History', group: 'System' },
  { key: 'settings', label: 'Settings', icon: 'Settings', group: 'System' },
  { key: 'myinfo', label: 'My Info', icon: 'UserCircle', group: 'People' },
  { key: 'pickup', label: 'Smart Pickup', icon: 'Route', group: 'Run', short: 'Pickup' },
  { key: 'bids', label: 'Vendor Quotes', icon: 'Gavel', group: 'Run', short: 'Bids' },
  { key: 'weather', label: 'Weather Log', icon: 'CloudSun', group: 'Run', short: 'Weather' },
  { key: 'moves', label: 'Crane Moves', icon: 'Container', group: 'Assets', short: 'Moves' },
  { key: 'suggest', label: 'Suggest Board', icon: 'Lightbulb', group: 'System', short: 'Suggest' },
  { key: 'onboarding', label: 'Onboarding', icon: 'UserPlus', group: 'People' },
  { key: 'store', label: 'Southern Store', icon: 'ShoppingBag', group: 'People', short: 'Store' },
  { key: 'expenses', label: 'Expenses', icon: 'Receipt', group: 'Money' },
  { key: 'recon', label: 'Site Recon', icon: 'ClipboardCheck', group: 'Run', short: 'Recon' },
  { key: 'changeorders', label: 'Change Orders', icon: 'FilePlus2', group: 'Run', short: 'COs' },
  { key: 'certtracker', label: 'Cert Tracker', icon: 'BadgeCheck', group: 'People', short: 'Certs' },
  { key: 'sitedata', label: 'Site Library', icon: 'BookMarked', group: 'Run', short: 'Sites' },
  { key: 'maint', label: 'Maintenance & Inspections', icon: 'ClipboardCheck', group: 'Assets', short: 'PM' },
  { key: 'messages', label: 'Messages', icon: 'MessagesSquare', group: 'System', short: 'Chat' },
  { key: 'mgmt', label: 'Management Dashboard', icon: 'LayoutDashboard', group: 'Run', short: 'Mgmt' },
  { key: 'rigging', label: 'Rigging Inspections', icon: 'Anchor', group: 'Assets', short: 'Rigging' },
  { key: 'drugalc', label: 'Drug & Alcohol (DER)', icon: 'FlaskRound', group: 'People', short: 'D&A' },
  { key: 'acctsync', label: 'Accounting Sync', icon: 'RefreshCw', group: 'Money', short: 'Sync' },
  { key: 'fuel', label: 'Fuel, IFTA & Mileage', icon: 'Fuel', group: 'Assets', short: 'Fuel' },
  { key: 'pto', label: 'Time Off', icon: 'CalendarDays', group: 'People', short: 'PTO' },
  { key: 'permits', label: 'OS/OW Permits', icon: 'FileBadge', group: 'Run', short: 'Permits' },
  { key: 'union', label: 'Union Locals', icon: 'HardHat', group: 'People', short: 'Union' },
  { key: 'guests', label: 'Guest Passes', icon: 'Link2', group: 'System', short: 'Guests' },
  { key: 'branding', label: 'Company Branding', icon: 'Palette', group: 'System', short: 'Brand' },
]

export interface RoleDef { key: RoleKey; label: string; who: string; empName?: string; blurb: string; icon: string; home: PageKey; pages: PageKey[]; emergency: boolean }
const ALL = PAGES.map(p => p.key).filter(k => k !== 'drugalc' && k !== 'guests' && k !== 'branding') // D&A is DER-only, even for owners
export const ROLES: RoleDef[] = [
  { key: 'owner', label: 'Owner / Executive', who: 'Ownership Team', blurb: 'Live fleet, money, and risk — the whole company at a glance.', icon: 'Crown', home: 'command', pages: ALL, emergency: false },
  { key: 'dispatch', label: 'Dispatch', who: 'Lori Haynes', empName: 'Lori Haynes', blurb: 'Drag-and-drop crews and cranes with instant conflict checks.', icon: 'CalendarRange', home: 'dispatch', pages: ['dispatch', 'forecast', 'jobs', 'windfarms', 'tickets', 'equipment', 'configs', 'allocations', 'people', 'safety', 'shop', 'contacts', 'settings', 'lifts', 'vault'], emergency: true },
  { key: 'ops', label: 'Operations / PM', who: 'Chad Weathers', empName: 'Chad Weathers', blurb: 'Build jobs, watch job costs, keep every project on track.', icon: 'HardHat', home: 'jobs', pages: ['command', 'jobs', 'windfarms', 'dispatch', 'forecast', 'analytics', 'tickets', 'equipment', 'configs', 'allocations', 'shop', 'inventory', 'invhome', 'purchasing', 'requests', 'invguide', 'safety', 'people', 'time', 'contacts', 'integrations', 'audit', 'settings', 'quotes', 'lifts', 'vault'], emergency: true },
  { key: 'field', label: 'Field Employee', who: 'John Smith', empName: 'John Smith', blurb: 'My job, my tickets, my time — on my phone.', icon: 'Smartphone', home: 'field', pages: ['field'], emergency: true },
  { key: 'shop', label: 'Shop / Mechanic', who: 'Robert Adams', empName: 'Robert Adams', blurb: 'Breakdowns, work orders and service due by hours & miles.', icon: 'Wrench', home: 'shop', pages: ['shop', 'equipment', 'inventory', 'requests', 'contacts', 'settings'], emergency: false },
  { key: 'safety', label: 'Safety', who: 'Cale Smith', empName: 'Cale Smith', blurb: 'Certs, incidents, JSAs, inspections and SDS.', icon: 'ShieldCheck', home: 'safety', pages: ['safety', 'people', 'inventory', 'equipment', 'contacts', 'settings', 'lifts', 'vault'], emergency: false },
  { key: 'hr', label: 'HR', who: 'Dana Whitfield', empName: 'Dana Whitfield', blurb: 'Onboarding, PTO, documents, reviews.', icon: 'Users', home: 'people', pages: ['people', 'allocations', 'safety', 'contacts', 'settings', 'vault'], emergency: false },
  { key: 'payroll', label: 'Payroll', who: 'Karen Ortiz', empName: 'Karen Ortiz', blurb: 'Approve time in bulk, per diems, export to payroll.', icon: 'Clock', home: 'time', pages: ['time', 'people', 'contacts', 'settings'], emergency: false },
  { key: 'accounting', label: 'Accounting (AP / AR)', who: 'Greg Lindsey', empName: 'Greg Lindsey', blurb: 'Code bills to jobs, invoice tickets, chase collections.', icon: 'Landmark', home: 'receivables', pages: ['receivables', 'payables', 'purchasing', 'analytics', 'jobs', 'contacts', 'audit', 'settings', 'quotes', 'vault'], emergency: false },
  { key: 'sales', label: 'Sales', who: 'Chris Ramos', empName: 'Chris Ramos', blurb: 'Quotes, follow-ups, customer jobs and swag.', icon: 'Handshake', home: 'quotes', pages: ['quotes', 'jobs', 'windfarms', 'forecast', 'contacts', 'inventory', 'requests', 'vault', 'settings'], emergency: false },
  { key: 'frontdesk', label: 'Front Desk', who: 'Tammy Rhodes', empName: 'Tammy Rhodes', blurb: 'Visitors, deliveries, who’s in and the call list.', icon: 'ConciergeBell', home: 'contacts', pages: ['contacts', 'people', 'jobs', 'inventory', 'settings'], emergency: true },
  { key: 'inventory', label: 'Inventory / Purchasing', who: 'Brian Morris', empName: 'Brian Morris', blurb: 'Scan it out, scan it in, order before you run out.', icon: 'Boxes', home: 'invhome', pages: ['invhome', 'inventory', 'purchasing', 'requests', 'invguide', 'shop', 'equipment', 'jobs', 'payables', 'contacts', 'audit', 'vault', 'settings'], emergency: false },
  { key: 'der', label: 'DER (Drug & Alcohol)', who: 'Dana Whitfield', empName: 'Dana Whitfield', blurb: 'Random pool, tests, results and Clearinghouse — confidential.', icon: 'FlaskRound', home: 'drugalc', pages: ['drugalc', 'people', 'onboarding', 'contacts', 'settings'], emergency: false },
  { key: 'branch', label: 'Branch Manager', who: 'Wade Parker', empName: 'Wade Parker', blurb: 'Branch P&L, utilization and today’s problems.', icon: 'Building2', home: 'command', pages: ALL.filter(k => k !== 'integrations'), emergency: false },
]
// Every role gets the My Info self-service page.
ROLES.forEach(r => { if (!r.pages.includes('myinfo')) r.pages.push('myinfo') })
// Crane moves for the people who run moves; the Suggest board for everyone.
ROLES.forEach(r => { if (['dispatch', 'ops', 'shop'].includes(r.key) && !r.pages.includes('moves')) r.pages.push('moves'); if (!r.pages.includes('suggest')) r.pages.push('suggest') })
const B3MOVE: Partial<Record<RoleKey, PageKey[]>> = { dispatch: ['pickup', 'bids', 'weather'], ops: ['pickup', 'bids', 'weather'], accounting: ['bids'], safety: ['weather'], sales: ['weather'], inventory: ['bids'] }
ROLES.forEach(r => (B3MOVE[r.key] ?? []).forEach(k => { if (!r.pages.includes(k)) r.pages.push(k) }))
// Batch 3b: recon / change orders / site library for job runners; cert tracker for safety, HR and dispatch.
const B3B_PAGES: Partial<Record<string, PageKey[]>> = { ops: ['recon', 'changeorders', 'certtracker', 'sitedata'], dispatch: ['recon', 'certtracker', 'sitedata'], safety: ['recon', 'certtracker', 'sitedata'], hr: ['certtracker'], sales: ['recon', 'changeorders', 'sitedata'], accounting: ['changeorders'], branch: ['recon', 'changeorders', 'certtracker', 'sitedata'] }
ROLES.forEach(r => (B3B_PAGES[r.key] ?? []).forEach(k => { if (!r.pages.includes(k)) r.pages.push(k) }))
// Batch 4: maintenance for shop/fleet, messages for every office role, mgmt dashboard for leaders, accounting sync for money roles.
const B4_PAGES: Partial<Record<string, PageKey[]>> = { ops: ['maint', 'mgmt', 'acctsync'], shop: ['maint'], dispatch: ['maint'], safety: ['maint'], accounting: ['acctsync', 'mgmt'], payroll: ['acctsync'], branch: ['maint', 'mgmt', 'acctsync'] }
ROLES.forEach(r => { [...(B4_PAGES[r.key] ?? []), ...(r.key !== 'field' ? ['messages' as PageKey] : [])].forEach(k => { if (!r.pages.includes(k)) r.pages.push(k) }) })
// Gap B: fuel/IFTA for fleet + money, permits for move runners, time off for every office role.
const GAPB_PAGES: Partial<Record<string, PageKey[]>> = { ops: ['fuel', 'permits'], dispatch: ['fuel', 'permits'], shop: ['fuel'], accounting: ['fuel'], inventory: ['permits'], branch: ['fuel', 'permits'] }
ROLES.forEach(r => { [...(GAPB_PAGES[r.key] ?? []), ...(r.key !== 'field' ? ['pto' as PageKey] : [])].forEach(k => { if (!r.pages.includes(k)) r.pages.push(k) }) })
// Union locals: payroll / HR / ops / accounting / branch.
ROLES.forEach(r => { if (['ops', 'payroll', 'hr', 'accounting', 'branch'].includes(r.key) && !r.pages.includes('union')) r.pages.push('union') })
// Launch 2: everyone gets the store + expenses; HR runs onboarding.
ROLES.forEach(r => { (['store', 'expenses'] as PageKey[]).forEach(k => { if (r.key !== 'field' && !r.pages.includes(k)) r.pages.push(k) }); if (r.key === 'hr' && !r.pages.includes('onboarding')) r.pages.push('onboarding') })
// Office review (Oct 24): in a ~100-person office payroll and HR overlap — payroll sees new hires + certs, HR can approve time.
ROLES.forEach(r => { const add: PageKey[] = r.key === 'payroll' ? ['onboarding', 'certtracker'] : r.key === 'hr' ? ['time'] : r.key === 'sales' ? ['lifts', 'configs', 'equipment'] : []; add.forEach(k => { if (!r.pages.includes(k)) r.pages.push(k) }) })
export const roleDef = (k: RoleKey) => ROLES.find(r => r.key === k)!
/** Pages a role can never reach by typing the address (guest passes, branding, D&A) unless it's in its list. */
export const GATED_PAGES: PageKey[] = ['guests', 'branding', 'drugalc']
/** Pages that personalization can never hide (mandatory). */
export const LOCKED_PAGES: PageKey[] = ['command', 'dispatch', 'safety', 'time', 'settings']
// Gap batch A: rigging program for the people who rig, inspect or stock it.
const GAPA_PAGES: Partial<Record<string, PageKey[]>> = { safety: ['rigging'], shop: ['rigging'], inventory: ['rigging'], ops: ['rigging'], dispatch: ['rigging'] }
ROLES.forEach(r => (GAPA_PAGES[r.key] ?? []).forEach(k => { if (!r.pages.includes(k)) r.pages.push(k) }))

// Guest passes: owner-only page; 'guest' is a view-only role reached only through a signed ?guest= link (hidden from Login)
ROLES.find(r => r.key === 'owner')!.pages.push('guests', 'branding')
/** Guest passes are an ALLOW-list. The owner picks a scope when making the pass; it is signed into the link.
 *  show (default) = safe showcase, no payroll / HR / money pages. ops = + day-to-day operations. all = everything but admin. */
export type GuestScope = 'show' | 'ops' | 'all'
const GUEST_SHOW: PageKey[] = ['command', 'dispatch', 'jobs', 'equipment', 'windfarms', 'forecast', 'safety', 'configs', 'weather', 'suggest', 'store']
const GUEST_OPS: PageKey[] = [...GUEST_SHOW, 'tickets', 'lifts', 'moves', 'shop', 'maint', 'rigging', 'inventory', 'invhome', 'invguide', 'requests', 'permits', 'sitedata', 'pickup']
/** Pages a guest never sees, whatever the scope. */
export const GUEST_NEVER: PageKey[] = ['integrations', 'settings', 'vault', 'audit', 'guests', 'branding', 'drugalc', 'myinfo', 'messages']
/** Payroll, HR and money pages: only on an "Everything" pass. */
export const GUEST_SENSITIVE: PageKey[] = ['time', 'people', 'onboarding', 'union', 'payables', 'receivables', 'analytics', 'acctsync', 'expenses', 'pto', 'mgmt', 'allocations', 'quotes', 'bids', 'changeorders', 'purchasing', 'fuel', 'certtracker', 'recon', 'contacts']
export const GUEST_SCOPES: { k: GuestScope; label: string; sub: string }[] = [
  { k: 'show', label: 'Showcase (safe)', sub: 'Home, dispatch board, jobs, cranes, wind farms, safety. No pay, HR or money pages.' },
  { k: 'ops', label: 'Operations', sub: 'Showcase + tickets, lift plans, moves, shop, inventory, permits. Still no pay, HR or money.' },
  { k: 'all', label: 'Everything', sub: 'Includes payroll, HR, bills and invoices. Only for people you trust with the books.' },
]
export const guestPagesFor = (sc: GuestScope = 'show'): PageKey[] => {
  const base: PageKey[] = sc === 'all' ? [...ALL] : sc === 'ops' ? GUEST_OPS : GUEST_SHOW
  return base.filter(k => (ALL as PageKey[]).includes(k) && !GUEST_NEVER.includes(k) && (sc === 'all' || !GUEST_SENSITIVE.includes(k)))
}
export const GUEST_ROLE: RoleDef = { key: 'guest', label: 'Guest (view-only)', who: 'Guest', blurb: 'Time-limited view-only pass.', icon: 'Link2', home: 'command', pages: guestPagesFor('show'), emergency: false }
let guestScope: GuestScope = 'show'
export const currentGuestScope = () => guestScope
/** Money (revenue, margins, job cost, pay) is hidden from guests unless the pass was made with the full-app scope. */
export const canSeeMoney = (role?: string) => role !== 'guest' || guestScope === 'all'
/** Apply the scope signed into the guest link (unknown/missing → safe showcase). */
export function setGuestScope(sc: unknown) { guestScope = sc === 'ops' || sc === 'all' ? sc : 'show'; setHideMoney(guestScope !== 'all'); GUEST_ROLE.pages.splice(0, GUEST_ROLE.pages.length, ...guestPagesFor(guestScope)); if (guestView) setGuestView(guestView) }
ROLES.push(GUEST_ROLE)
/** Guests can look at the app the way each person sees it ("Switch role"). The session stays a view-only guest:
 *  same scrubbed data, no saves, and only pages the pass allows. Money/HR roles appear only on an "Everything" pass. */
export type GuestView = 'owner' | 'dispatch' | 'ops' | 'field' | 'supervisor' | 'shop' | 'safety' | 'inventory' | 'sales' | 'hr' | 'payroll' | 'accounting'
const GV: { k: GuestView; label: string; sub: string }[] = [
  { k: 'owner', label: 'Owner overview', sub: 'Live fleet and today at a glance' },
  { k: 'dispatch', label: 'Dispatcher', sub: 'Who and what goes where' },
  { k: 'ops', label: 'Operations / PM', sub: 'Jobs and lift planning' },
  { k: 'field', label: 'Field hand (phone)', sub: 'My job, my time, my tickets' },
  { k: 'supervisor', label: 'Field supervisor (phone)', sub: 'My crew, JSAs, tickets' },
  { k: 'shop', label: 'Shop / mechanic', sub: 'Breakdowns and service' },
  { k: 'safety', label: 'Safety', sub: 'Certs, inspections, JSAs' },
  { k: 'inventory', label: 'Inventory', sub: 'Stock and checkouts' },
  { k: 'sales', label: 'Sales', sub: 'Quotes and customers' },
  { k: 'hr', label: 'HR', sub: 'People and onboarding' },
  { k: 'payroll', label: 'Payroll', sub: 'Time and pay' },
  { k: 'accounting', label: 'Accounting', sub: 'Bills and invoices' },
]
export const PHONE_VIEWS: GuestView[] = ['field', 'supervisor']
let guestView: GuestView | null = null
export const currentGuestView = () => guestView
/** The views this pass allows: a role shows up only when its home page is part of the pass. */
export function guestViews(sc: GuestScope = guestScope) {
  const ok = guestPagesFor(sc)
  return GV.filter(v => PHONE_VIEWS.includes(v.k) || v.k === 'owner' || ok.includes(roleDef(v.k as RoleKey).home))
}
/** Apply a view: the guest menu becomes that role's pages ∩ the pass, home becomes that role's home. Unknown → owner overview. */
export function setGuestView(v?: unknown) {
  const vw = guestViews().find(x => x.k === v)
  const all = guestPagesFor(guestScope)
  let pages = all, home: PageKey = 'command'
  if (vw && vw.k !== 'owner' && !PHONE_VIEWS.includes(vw.k)) { const rd = roleDef(vw.k as RoleKey); pages = all.filter(p => rd.pages.includes(p)); if (all.includes(rd.home)) home = rd.home; if (!pages.includes(home)) pages = [home, ...pages] }
  guestView = vw?.k ?? null
  GUEST_ROLE.pages.splice(0, GUEST_ROLE.pages.length, ...pages); GUEST_ROLE.home = home
  return { home, view: guestView }
}
