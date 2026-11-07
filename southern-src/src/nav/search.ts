/** Navigation search: finds a destination by what people call it (field slang, everyday words), tolerates typos,
 *  ranks results and says why something matched ("matches: paycheck"), and offers "Did you mean…" when nothing does. */
import { PAGES, type PageKey } from '../data/roles'

/** Extra destinations that live inside a page (so "fuel card" finds My Cards even though it's a section of My Info). */
export const VIRTUAL: { key: string; label: string; page: PageKey; icon: string; hint: string }[] = [
  { key: 'mycards', label: 'My Cards', page: 'myinfo', icon: 'CreditCard', hint: 'in My Info' },
  { key: 'npt', label: 'NPT · non-productive time', page: 'mgmt', icon: 'PauseCircle', hint: 'on the Management Dashboard' },
]

/** Words people actually use → destination. Keep phrases lowercase. */
export const ALIASES: Record<string, string[]> = {
  command: ['home page', 'front page', 'what’s going on', 'whats happening', 'home', 'dashboard', 'command center', 'overview', 'today', 'start', 'main'],
  mgmt: ['management', 'kpi', 'numbers', 'scoreboard', 'big picture', 'reports', 'npt rollup'],
  dispatch: ['who goes where', 'tomorrow', 'today’s jobs', 'lineup', 'whiteboard', 'move crew', 'schedule', 'board', 'dispatch board', 'calendar', 'who is where', 'assign', 'crew schedule', 'boss', 'dispatcher'],
  pickup: ['deadhead', 'hos', 'hours of service', 'logbook', 'eld', 'pickup', 'drivers', 'loads', 'haul', 'who drives', 'driver schedule', 'trucking'],
  jobs: ['project', 'customer', 'work order number', 'po number', 'contract', 'job', 'job number', 'job #', 'projects', 'work', 'customer jobs', 'job list'],
  tickets: ['sign off', 'customer signature', 'delivery ticket', 'job ticket', 'daily report', 'ticket', 'work ticket', 'field ticket', 'signature', 'sign ticket', 'daily ticket', 'tickets'],
  allocations: ['crews', 'teams', 'foreman', 'supervisor', 'boss', 'who works for who', 'crew list'],
  windfarms: ['wtg', 'pad', 'hub height', 'repower', 'main bearing', 'gearbox', 'wind', 'turbine', 'wind farm', 'tower', 'blade', 'nacelle'],
  lifts: ['crane plan', 'lift study', 'ground bearing', 'outrigger', 'matting', 'mats', 'lift plan', 'rigging plan', 'pick plan', 'critical lift', 'load chart', 'boom'],
  weather: ['lightning', 'storm', 'wind limit', 'high wind', 'wind speed', 'gusts', 'weather', 'forecast weather', 'rain', 'standby weather'],
  recon: ['site visit', 'walkdown', 'survey', 'site survey'],
  sitedata: ['site info', 'gate codes', 'directions', 'site', 'locations'],
  changeorders: ['change order', 'co', 'extra work', 'scope change'],
  quotes: ['rate sheet', 'pricing', 'customer quote', 'rfp', 'quote', 'estimate', 'bid', 'price', 'proposal', 'sales'],
  bids: ['vendor', 'vendor quote', 'supplier', 'rfq', 'rental quote'],
  forecast: ['availability', 'crane availability', 'free cranes', 'utilization', 'crane', 'boom'],
  equipment: ['forklift', 'telehandler', 'lowboy', 'flatbed', 'tractor', 'hydraulic crane', 'lattice', 'all terrain', 'rough terrain', 'service truck', 'crane', 'cranes', 'truck', 'trucks', 'semi', 'rig', 'trailer', 'fleet', 'unit', 'boom', 'machine', 'pickup truck'],
  configs: ['crane config', 'setup', 'counterweight', 'boom config', 'load chart'],
  moves: ['crane move', 'move', 'transport', 'load out', 'mobilize', 'demob', 'haul crane'],
  shop: ['wrench', 'tires', 'brakes', 'broke down', 'out of service', 'red tag', 'mechanic', 'repair', 'work order', 'broke', 'broken', 'breakdown', 'fix'],
  maint: ['dvir', 'pre trip', 'pre-trip', 'post trip', 'annual', 'grease', 'hour meter', 'maintenance', 'inspection', 'service', 'oil change', 'pm', 'annual inspection', 'dvir'],
  fuel: ['fuel up', 'fill up', 'gallons', 'def', 'fuel', 'diesel', 'gas', 'ifta', 'mileage', 'miles', 'fuel log'],
  permits: ['wide load', 'escort car', 'pilot car', 'route survey', 'permit', 'oversize', 'overweight', 'os/ow', 'route', 'escort'],
  rigging: ['wire rope', 'hook', 'spreader bar', 'tag line', 'rigging', 'slings', 'shackles', 'chokers', 'rigging inspection', 'color code'],
  invhome: ['scan', 'barcode', 'inventory home', 'stock'],
  inventory: ['parts', 'stock', 'supplies', 'items', 'tools', 'warehouse'],
  purchasing: ['po', 'purchase order', 'order parts', 'buy', 'reorder'],
  requests: ['parts request', 'request parts', 'need parts', 'ask for parts'],
  invguide: ['how to', 'inventory help', 'guide'],
  people: ['coworker', 'team member', 'hire date', 'emergency contacts', 'phone number of', 'hr', 'employees', 'staff', 'personnel', 'roster', 'employee list', 'benefits', 'insurance', 'w-2', 'w2', 'tax', 'tax form', 'directory', /* dive2 HR synonyms */ 'write up', 'write-up', 'writeup', 'discipline', 'disciplinary', 'reprimand', 'warning letter', 'terminate', 'termination', 'fire someone', 'fired', 'let go', 'separation', 'offboarding', 'quit', 'resign', 'rehire', 'performance review', 'review', 'evaluation', 'harassment', 'hr complaint', 'anonymous', 'anonymous report', 'hotline', 'retaliation'],
  myinfo: ['my union hours', 'union history', 'my union history', 'pension', 'annuity', 'union hours', 'my address', 'update my phone', 'direct deposit info', 'my certs', 'my license', 'me', 'my profile', 'profile', 'my stuff', 'my info', 'w-2', 'w2', 'tax', 'benefits', 'insurance', 'emergency contact', 'address'],
  mycards: ['visa', 'amex', 'wex', 'fleet card', 'p-card', 'pcard', 'fuel card', 'credit card', 'company card', 'card', 'cards', 'gas card', 'my cards'],
  onboarding: ['w-4', 'w4', 'i9', 'new hire forms', 'new hire', 'hiring', 'paperwork', 'i-9', 'start date', 'orientation'],
  time: ['payday', 'pay day', 'direct deposit', 'hours worked', 'ot', 'double time', 'my check', 'timesheet', 'time sheet', 'hours', 'clock in', 'clock out', 'punch', 'payroll', 'pay', 'paycheck', 'pay stub', 'check', 'overtime', 'per diem', 'perdiem', 'meal money', 'wages'],
  pto: ['sick', 'off work', 'family leave', 'bereavement', 'personal day', 'pto', 'vacation', 'time off', 'day off', 'sick day', 'leave', 'holiday', 'request off'],
  union: ['union map', 'local map', 'hall map', 'coverage map', 'fringe', 'fringes', 'local 627', 'pay scale', 'pay rate', 'wage scale', 'dispatch hall', 'book', 'out of work list', 'scale', 'union rate', 'union', 'hall', 'local', 'iuoe', '627', /* dive2 */ 'which local', 'local for', 'union local', 'kilgore', 'longview', 'odessa', 'midland local', 'tyler', 'operating engineers', 'call out', 'dues'],
  store: ['company shirt', 'jacket', 'safety points', 'store', 'swag', 'shirts', 'hats', 'merch', 'points', 'rewards', 'gear'],
  safety: ['hazard', 'ppe', 'hard hat', 'harness', 'first aid', 'report injury', 'jsa', 'safety', 'incident', 'near miss', /* dive2 */ 'workers comp', 'workers compensation', 'work comp', 'osha 300', 'osha log', '300 log', '300a', 'recordable', 'trir', 'dart', 'emr', 'fall protection', 'lockout', 'tagout', 'loto', 'stop work', 'inspection', 'crane inspection', 'injury', 'accident', 'jsa', 'jha', 'sds', 'osha', 'toolbox talk'],
  certtracker: ['expired', 'renew', 'osha 10', 'osha 30', 'twic', 'rigger card', 'signal person', 'dot medical', 'certs', 'certification', 'nccco', 'cdl', 'license', 'medical card', 'expiring', 'training'],
  drugalc: ['drug test', 'alcohol', 'random', 'clearinghouse', 'dot test', 'der', 'd&a'],
  analytics: ['are we making money', 'job profit', 'margin by job', 'cost report', 'job cost', 'profit', 'margin', 'p&l', 'losing money', 'costing', 'money'],
  receivables: ['who owes us', 'past due', 'aging', 'statement', 'send invoice', 'payment received', 'ar', 'invoice', 'invoices', 'billing', 'collections', 'customer owes', 'get paid'],
  payables: ['unpaid bills', 'open bills', 'bills to pay', 'vendor invoice', 'pay a bill', 'due to vendors', 'check run', 'ap', 'bill', 'bills', 'vendor bills', 'pay vendors'],
  expenses: ['hotel', 'lodging', 'travel', 'meals', 'reimburse me', 'expense', 'receipt', 'reimbursement', 'per diem', 'meal money', 'mileage', 'spend'],
  acctsync: ['quickbooks', 'qb', 'accounting', 'export', 'sync'],
  npt: ['weather delay', 'waiting on customer', 'idle', 'npt', 'down time', 'downtime', 'standby', 'non productive', 'nonproductive', 'waiting', 'delay'],
  messages: ['texts', 'announcement', 'group chat', 'chat', 'text', 'dm', 'message', 'inbox', 'talk'],
  contacts: ['office number', 'yard phone', 'after hours', 'phone', 'phone numbers', 'call list', 'directory', 'who to call'],
  vault: ['contract pdf', 'insurance cert', 'coi', 'w9', 'w-9', 'manual', 'documents', 'files', 'docs', 'pdf', 'manuals', 'policies', 'handbook'],
  integrations: ['samsara', 'quickbooks', 'connect', 'apps', 'gps'],
  audit: ['history', 'log', 'who changed', 'activity', 'audit trail'],
  settings: ['dark', 'light mode', 'bigger text', 'text size', 'notifications', 'theme', 'colors', 'color', 'dark mode', 'font', 'preferences', 'face id', 'password', 'account'],
  suggest: ['complaint', 'report a bug', 'idea box', 'idea', 'ideas', 'feedback', 'bug', 'suggestion', 'request feature'],
  guests: ['guest', 'share', 'share link', 'visitor link', 'demo link'],
  branding: ['logo', 'brand', 'company colors', 'company name', 'white label'],
}

export type Dest = { key: string; page: PageKey; label: string; icon: string; section?: string; hint?: string }
export type Hit = Dest & { score: number; why?: string }

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9#&/\- ]+/g, ' ').replace(/\s+/g, ' ').trim()
/** Optimal-string-alignment distance (Levenshtein + adjacent swaps), capped for speed. */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) { let rowMin = Infinity
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
      rowMin = Math.min(rowMin, d[i][j]) }
    if (rowMin > cap) return cap + 1 }
  return d[a.length][b.length]
}
const tol = (n: number) => (n <= 3 ? 0 : n <= 5 ? 1 : 2)

/** Score one phrase against the query: 100 exact · 80 starts-with · 60 word starts-with · 45 contains · 30–40 typo. */
function phraseScore(q: string, phrase: string): number {
  const p = norm(phrase); if (!p) return 0
  if (p === q) return 100
  if (p.startsWith(q)) return 80
  const pw = p.split(' '), qw = q.split(' ')
  if (pw.some(w => w.startsWith(q))) return 60
  if (q.length >= 3 && p.includes(q)) return 45
  const squash = (s: string) => s.replace(/[\s\-/]/g, '')
  if (q.length >= 4 && squash(p) === squash(q)) return 90 // "perdiem" = "per diem"
  // multi-word query: every query word matches some phrase word (prefix or typo)
  if (qw.length > 1 && qw.every(x => pw.some(w => w.startsWith(x) || (x.length > 3 && editDistance(x, w) <= tol(w.length))))) return 50
  // typo on the whole phrase or a single word
  const dWhole = editDistance(q, p); if (dWhole <= tol(p.length)) return 40 - dWhole * 4
  if (q.length >= 4) for (const w of pw) { const d = editDistance(q, w); if (d <= tol(w.length)) return 34 - d * 4
    if (w.length > q.length && editDistance(q, w.slice(0, q.length)) <= tol(q.length) - 0) { if (tol(q.length) > 0) return 26 } }
  return 0
}

export function searchDests(dests: Dest[], query: string): Hit[] {
  const q = norm(query); if (!q) return []
  const hits: Hit[] = []
  for (const d of dests) {
    let best = phraseScore(q, d.label) + 8, why: string | undefined // a title match outranks an alias match
    if (best <= 8) best = 0
    for (const a of ALIASES[d.key] ?? []) { const s = phraseScore(q, a); if (s > best) { best = s; why = a } }
    if (d.section) { const s = phraseScore(q, d.section) * 0.5; if (s > best) { best = s; why = d.section } }
    if (best > 0) hits.push({ ...d, score: best, why: why && norm(why) !== norm(d.label) ? why : undefined })
  }
  return hits.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
}

/** Closest few destinations when nothing matched (by best edit distance to any title/alias word). */
export function didYouMean(dests: Dest[], query: string, n = 3): Hit[] {
  const q = norm(query); if (!q) return []
  const score = (d: Dest) => { let best = 99; for (const ph of [d.label, ...(ALIASES[d.key] ?? [])]) for (const w of [norm(ph), ...norm(ph).split(' ')]) best = Math.min(best, editDistance(q, w, 8)); return best }
  return dests.map(d => ({ ...d, score: score(d) })).sort((a, b) => a.score - b.score || a.label.localeCompare(b.label)).slice(0, n)
}

/** All destinations a role can open: its pages plus virtual ones whose host page it can open. */
export function destinations(nav: { key: PageKey; label: string; icon: string }[], sectionOf: (k: PageKey) => string | undefined): Dest[] {
  const allowed = new Set(nav.map(p => p.key))
  return [
    ...nav.map(p => ({ key: p.key as string, page: p.key, label: p.label, icon: p.icon, section: sectionOf(p.key) })),
    ...VIRTUAL.filter(v => allowed.has(v.page)).map(v => ({ key: v.key, page: v.page, label: v.label, icon: v.icon, hint: v.hint, section: sectionOf(v.page) })),
  ]
}
export const pageLabel = (k: PageKey) => PAGES.find(p => p.key === k)?.label ?? k

/** Plain-English meanings for the jargon on screen (shown in search and as tooltips). */
export const GLOSSARY: { term: string; means: string; page?: string }[] = [
  { term: 'NPT', means: 'Non-productive time — standby, waiting or downtime on a job that may be billable.', page: 'npt' },
  { term: 'DVIR', means: 'Driver Vehicle Inspection Report — the pre-trip / post-trip truck check.', page: 'maint' },
  { term: 'IFTA', means: 'International Fuel Tax Agreement — the quarterly fuel-tax report by state.', page: 'fuel' },
  { term: 'OS/OW', means: 'Oversize / overweight — loads that need a state permit and sometimes escorts.', page: 'permits' },
  { term: 'JSA', means: 'Job Safety Analysis — the hazards and controls reviewed before the work starts.', page: 'safety' },
  { term: 'SDS', means: 'Safety Data Sheet — the hazard sheet for a chemical or product.', page: 'safety' },
  { term: 'DER', means: 'Designated Employer Representative — runs the DOT drug & alcohol program.', page: 'drugalc' },
  { term: 'NCCCO', means: 'National Commission for the Certification of Crane Operators — crane operator cards.', page: 'certtracker' },
  { term: 'AP', means: 'Accounts payable — bills we owe vendors.', page: 'payables' },
  { term: 'AR', means: 'Accounts receivable — invoices customers owe us.', page: 'receivables' },
  { term: 'PO', means: 'Purchase order — an approved order to a vendor.', page: 'purchasing' },
  { term: 'CO', means: 'Change order — extra or changed work the customer signs off on.', page: 'changeorders' },
  { term: 'PTO', means: 'Paid time off — vacation, sick and personal days.', page: 'pto' },
  { term: 'IUOE', means: 'International Union of Operating Engineers — the operators’ union (locals like 627).', page: 'union' },
  { term: 'P&L', means: 'Profit and loss — money in minus money out.', page: 'analytics' },
  { term: 'Clearinghouse', means: 'FMCSA Drug & Alcohol Clearinghouse — the federal database of CDL drug/alcohol violations.', page: 'drugalc' },
  { term: 'Per diem', means: 'A set daily rate for meals and lodging when working away from home.', page: 'time' },
  { term: 'Deadhead', means: 'Driving empty (no load) to or from a job.', page: 'pickup' },
]
export function defineTerm(query: string) { const q = norm(query).replace(/\s+/g, ''); if (q.length < 2) return null; return GLOSSARY.find(g => norm(g.term).replace(/\s+/g, '') === q) ?? null }
export function termTip(label: string) { const hits = GLOSSARY.filter(g => new RegExp(`(^|[^A-Za-z])${g.term.replace(/[/&]/g, '\\$&')}([^A-Za-z]|$)`).test(label)); return hits.length ? hits.map(h => `${h.term}: ${h.means}`).join('\n') : undefined }
