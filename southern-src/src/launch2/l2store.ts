import { addDays, today } from '../lib/util'
// Launch-2 modules (customer portal, onboarding, store, expenses). Local-only demo state,
// kept in its own persisted slice so it never collides with the main DB/seed.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type HireStage = 'Invited' | 'Profile' | 'Paperwork' | 'Training' | 'Gear ordered' | 'Field-ready'
export const HIRE_STAGES: HireStage[] = ['Invited', 'Profile', 'Paperwork', 'Training', 'Gear ordered', 'Field-ready']
export interface NewHire {
  id: string; first: string; last: string; personalEmail: string; phone: string; division: string; branch: string; position: string
  start: string; supervisor: string; temp: boolean; hired: boolean; steps: Record<string, boolean>; sizes: Record<string, string>
  badgePhoto?: string; idFront?: string; idBack?: string; trainings: Record<string, 'none' | 'pending' | 'verified'>; created: string
  /** Link to the real HR record (db.hires) — one onboarding list; activation turns it into an employee. */
  coreId?: string; rate?: number; activated?: boolean
  /** dive2 E M7: day-one paperwork answers (bank account kept as last 4 only). */
  paper?: Record<string, string>
}
export const ONBOARD_STEPS = ['welcome', 'personal', 'w4', 'deposit', 'i9', 'handbook', 'emergency', 'badge', 'ids', 'training', 'benefits', 'gear'] as const
export const workEmail = (h: Pick<NewHire, 'first' | 'last'>) => `${h.first}.${h.last}`.toLowerCase().replace(/[^a-z.]/g, '') + '@slh-demo.example'
export const stageOf = (h: NewHire): HireStage => {
  const s = h.steps
  if (s.gear && s.training && s.i9 && s.w4) return Object.values(h.trainings).some(v => v === 'pending') ? 'Gear ordered' : 'Field-ready'
  if (s.training) return 'Training'
  if (s.w4 || s.deposit || s.i9 || s.handbook) return 'Paperwork'
  if (s.personal || s.welcome) return 'Profile'
  return 'Invited'
}
export const pctOf = (h: NewHire) => Math.round(ONBOARD_STEPS.filter(k => h.steps[k]).length / ONBOARD_STEPS.length * 100)
export const PPE_TEMP = ['hardhat', 'vest', 'gloves', 'fr']
export const GEAR = [
  { k: 'shirt', label: 'Shirt', opts: ['S', 'M', 'L', 'XL', '2XL', '3XL'] },
  { k: 'pants', label: 'Pants (waist × inseam)', opts: ['30×30', '32×30', '32×32', '34×32', '36×32', '38×32', '40×32'] },
  { k: 'jacket', label: 'Jacket', opts: ['S', 'M', 'L', 'XL', '2XL', '3XL'] },
  { k: 'vest', label: 'Hi-vis vest', opts: ['S/M', 'L/XL', '2XL/3XL'] },
  { k: 'fr', label: 'FR coveralls', opts: ['M', 'L', 'XL', '2XL', '3XL'] },
  { k: 'gloves', label: 'Gloves', opts: ['M', 'L', 'XL', '2XL'] },
  { k: 'boots', label: 'Boots (size / width)', opts: ['9 D', '9.5 D', '10 D', '10.5 EE', '11 D', '11 EE', '12 EE', '13 EE'] },
  { k: 'hat', label: 'Cap', opts: ['S/M', 'L/XL', 'Fitted 7⅜'] },
  { k: 'hardhat', label: 'Hard hat style', opts: ['Cap style', 'Full brim', 'Type II vented'] },
] as const
export const gearReady = (h: NewHire) => GEAR.filter(g => !h.temp || PPE_TEMP.includes(g.k)).every(g => h.sizes[g.k])

export interface StoreItem { sku: string; name: string; section: 'New Arrivals' | 'Field Gear' | 'Family' | 'Limited Drops' | 'Overstock & Sale'; price: number; was?: number; sizes: string[]; colors: string[]; stock: Record<string, number>; hue: string; blurb: string }
export interface Order { id: string; at: string; who: string; lines: { sku: string; name: string; size: string; color: string; qty: number; price: number }[]; total: number; status: 'Placed' | 'Picking' | 'Shipped' }
export interface CreditRule { event: 'Onboarding' | 'Birthday' | 'Anniversary' | 'Milestone' | 'Suggest shipped' | 'Spot award'; amount: string; demo: number; eligibility: 'Long-term only' | 'Temps after 90 days' }

export type ExpStatus = 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'In QuickBooks'
export interface Expense { id: string; source: 'receipt' | 'card' | 'perdiem' | 'mileage'; merchant: string; date: string; amount: number; category: string; jobNo?: string; rule?: string; why?: string; confidence?: number; status: ExpStatus; last4?: string; image?: string; who: string; miles?: number; qbId?: string }

const sz = (s: string[], n = 6) => Object.fromEntries(s.map((x, i) => [x, Math.max(0, n - i)]))
const ITEMS: StoreItem[] = [
  { sku: 'SLH-HD-01', name: 'Heavyweight Crane Hoodie', section: 'New Arrivals', price: 64, sizes: ['S', 'M', 'L', 'XL', '2XL'], colors: ['Charcoal', 'Navy'], stock: sz(['S', 'M', 'L', 'XL', '2XL'], 9), hue: '#1f2937', blurb: '400gsm fleece, embroidered hook block.' },
  { sku: 'SLH-TE-02', name: 'Flag Pocket Tee', section: 'New Arrivals', price: 28, sizes: ['S', 'M', 'L', 'XL', '2XL', '3XL'], colors: ['Heather', 'Black', 'Olive'], stock: sz(['S', 'M', 'L', 'XL', '2XL', '3XL'], 14), hue: '#4b5563', blurb: 'American flag pocket print, made in USA.' },
  { sku: 'SLH-FR-03', name: 'FR Work Shirt', section: 'Field Gear', price: 72, sizes: ['M', 'L', 'XL', '2XL'], colors: ['Khaki', 'Navy'], stock: sz(['M', 'L', 'XL', '2XL'], 8), hue: '#a16207', blurb: 'CAT 2 rated, vented back.' },
  { sku: 'SLH-JK-04', name: 'Insulated Field Jacket', section: 'Field Gear', price: 129, sizes: ['M', 'L', 'XL', '2XL', '3XL'], colors: ['Black', 'Brown Duck'], stock: sz(['M', 'L', 'XL', '2XL', '3XL'], 5), hue: '#3f3f46', blurb: 'Wind-rated shell for tower days.' },
  { sku: 'SLH-CP-05', name: 'Rope Cap', section: 'Field Gear', price: 26, sizes: ['One size'], colors: ['Navy/White', 'Black/Red'], stock: { 'One size': 40 }, hue: '#0f2d52', blurb: 'Structured, leather patch.' },
  { sku: 'SLH-KD-06', name: 'Kids “Future Operator” Tee', section: 'Family', price: 18, sizes: ['2T', '4T', 'YS', 'YM', 'YL'], colors: ['Safety Orange', 'Royal'], stock: sz(['2T', '4T', 'YS', 'YM', 'YL'], 10), hue: '#ea580c', blurb: 'For the crew at home.' },
  { sku: 'SLH-LD-07', name: 'Record Lift Hoodie — 1,200t', section: 'Limited Drops', price: 85, sizes: ['M', 'L', 'XL', '2XL'], colors: ['Midnight'], stock: sz(['M', 'L', 'XL', '2XL'], 3), hue: '#111827', blurb: 'Numbered run of 150. Southern Wind division.' },
  { sku: 'SLH-OS-08', name: '2025 Safety Week Tee', section: 'Overstock & Sale', price: 12, was: 28, sizes: ['L', 'XL', '2XL'], colors: ['Gray'], stock: { L: 22, XL: 31, '2XL': 18 }, hue: '#6b7280', blurb: 'Last year’s run — 57% off.' },
  { sku: 'SLH-OS-09', name: 'Softshell Vest (old logo)', section: 'Overstock & Sale', price: 35, was: 70, sizes: ['M', 'L', 'XL'], colors: ['Black'], stock: { M: 6, L: 9, XL: 4 }, hue: '#27272a', blurb: 'Half off while it lasts.' },
]
const RULES: CreditRule[] = [
  { event: 'Onboarding', amount: '', demo: 150, eligibility: 'Long-term only' },
  { event: 'Birthday', amount: '', demo: 50, eligibility: 'Long-term only' },
  { event: 'Anniversary', amount: '', demo: 100, eligibility: 'Long-term only' },
  { event: 'Milestone', amount: '', demo: 75, eligibility: 'Long-term only' },
  { event: 'Suggest shipped', amount: '', demo: 50, eligibility: 'Temps after 90 days' },
  { event: 'Spot award', amount: '', demo: 25, eligibility: 'Temps after 90 days' },
]
const d = (off: number) => addDays(today(), off)
const HIRES: NewHire[] = [
  { id: 'nh-1', first: 'Marcus', last: 'Reed', personalEmail: 'marcus.reed77@mail.example', phone: '(405) 555-0142', division: 'SLH Cranes', branch: 'Oklahoma City', position: 'Crane Operator', start: d(3), supervisor: 'Wade Parker', temp: false, hired: true, steps: { welcome: true, personal: true, w4: true, deposit: true, i9: true, handbook: true, emergency: true, badge: true, ids: true, training: true }, sizes: { shirt: 'XL', pants: '36×32', boots: '11 EE' }, trainings: { 'OSHA 30': 'verified', 'NCCCO Mobile': 'pending', 'CPR / First Aid': 'verified' }, created: d(-6) },
  { id: 'nh-2', first: 'Kayla', last: 'Brooks', personalEmail: 'kbrooks.tx@outlook.com', phone: '(806) 555-0119', division: 'Southern Uptower', branch: 'Oklahoma City', position: 'Uptower Tech', start: d(7), supervisor: 'Lori Haynes', temp: true, hired: true, steps: { welcome: true, personal: true }, sizes: {}, trainings: {}, created: d(-2) },
  { id: 'nh-3', first: 'Diego', last: 'Alvarez', personalEmail: 'diego.alvarez@yahoo.com', phone: '(432) 555-0170', division: 'Southern Transport', branch: 'Midland', position: 'CDL Driver', start: d(10), supervisor: 'Wade Parker', temp: false, hired: false, steps: {}, sizes: {}, trainings: {}, created: d(-1) },
]
const EXPENSES: Expense[] = [
  { id: 'ex-1', source: 'card', merchant: 'Southwest Airlines', date: d(-3), amount: 412.6, category: 'Airfare', last4: '4417', who: 'Chad Weathers', status: 'Draft' },
  { id: 'ex-2', source: 'card', merchant: 'Uber', date: d(-3), amount: 38.12, category: 'Rideshare', last4: '4417', who: 'Chad Weathers', status: 'Draft' },
  { id: 'ex-3', source: 'card', merchant: 'Uber', date: d(-2), amount: 22.4, category: 'Rideshare', last4: '4417', who: 'Chad Weathers', status: 'Draft' },
  { id: 'ex-4', source: 'card', merchant: 'TxDMV Oversize Permit', date: d(-1), amount: 90, category: 'Permits', last4: '9921', who: 'Chad Weathers', status: 'Draft' },
  { id: 'ex-5', source: 'card', merchant: 'TxDMV Oversize Permit', date: d(-1), amount: 60, category: 'Permits', last4: '9921', who: 'Chad Weathers', status: 'Draft' },
  { id: 'ex-6', source: 'card', merchant: 'OK Trailer Permit — OKDPS', date: d(-5), amount: 45, category: 'Permits', last4: '9921', who: 'Chad Weathers', status: 'Draft' },
  { id: 'ex-7', source: 'card', merchant: 'Love’s Travel Stop #612', date: d(-4), amount: 186.33, category: 'Fuel', last4: '4417', who: 'Chad Weathers', status: 'Approved', jobNo: '10131', rule: 'Rule 4', why: 'Rule 4: dispatched to 10131 that day; receipt 6 mi from the route.', confidence: 88 },
]
interface L2 {
  hires: NewHire[]; items: StoreItem[]; orders: Order[]; rules: CreditRule[]; credits: number; expenses: Expense[]; disputes: Record<string, { status: 'approved' | 'disputed'; reason?: string; at: string }>
  addHire: (h: Omit<NewHire, 'id' | 'steps' | 'sizes' | 'trainings' | 'created' | 'hired'> & Partial<Pick<NewHire, 'steps' | 'hired'>>) => string
  patchHire: (id: string, p: Partial<NewHire>) => void
  step: (id: string, k: string) => void
  setRule: (i: number, p: Partial<CreditRule>) => void
  order: (o: Omit<Order, 'id' | 'at' | 'status'>) => void
  addExpense: (e: Omit<Expense, 'id'>) => void
  patchExpense: (id: string, p: Partial<Expense>) => void
  ticketAction: (id: string, status: 'approved' | 'disputed', reason?: string) => void
  reset: () => void
}
const init = () => ({ hires: HIRES, items: ITEMS, orders: [] as Order[], rules: RULES, credits: 240, expenses: EXPENSES, disputes: {} })
export const useL2 = create<L2>()(persist((set, get) => ({
  ...init(),
  addHire(h) { const id = 'nh-' + Math.random().toString(36).slice(2, 7); set({ hires: [{ hired: true, steps: {}, ...h, id, sizes: {}, trainings: {}, created: today() }, ...get().hires] }); return id },
  patchHire(id, p) { set({ hires: get().hires.map(h => h.id === id ? { ...h, ...p } : h) }) },
  step(id, k) { set({ hires: get().hires.map(h => h.id === id ? { ...h, steps: { ...h.steps, [k]: true } } : h) }) },
  setRule(i, p) { set({ rules: get().rules.map((r, j) => j === i ? { ...r, ...p } : r) }) },
  order(o) {
    const items = get().items.map(it => { const ls = o.lines.filter(l => l.sku === it.sku); if (!ls.length) return it; const stock = { ...it.stock }; ls.forEach(l => { stock[l.size] = Math.max(0, (stock[l.size] ?? 0) - l.qty) }); return { ...it, stock } })
    set({ items, credits: Math.max(0, get().credits - o.total), orders: [{ ...o, id: 'SO-' + (1040 + get().orders.length), at: new Date().toISOString(), status: 'Placed' }, ...get().orders] })
  },
  addExpense(e) { set({ expenses: [{ ...e, id: 'ex-' + Math.random().toString(36).slice(2, 7) }, ...get().expenses] }) },
  patchExpense(id, p) { set({ expenses: get().expenses.map(e => e.id === id ? { ...e, ...p } : e) }) },
  ticketAction(id, status, reason) { set({ disputes: { ...get().disputes, [id]: { status, reason, at: new Date().toISOString() } } }) },
  reset() { set(init()) },
}), { name: 'sc-launch2', version: 2, migrate: () => init() as never }))

// ── Expense auto-match (Chad's rules, Appendix B) ───────────────────────────
export const JOB_MASTER = [
  { jobNo: '10125', kind: 'Liftra move', name: 'Rotor & gearbox exchange — Woodward T-18', route: 'OKC → Woodward', date: d(-2), crew: ['Chad Weathers', 'Diaz'] },
  { jobNo: '10072', kind: 'Crane move', name: 'Turbine main component exchange — Amarillo', route: 'OKC → Amarillo', date: d(-3), crew: ['Chad Weathers'] },
  { jobNo: '10151', kind: 'Heavy haul', name: 'Transformer haul — Sherman', route: 'Fort Worth → Sherman', date: d(-1), crew: ['Chad Weathers'] },
  { jobNo: '10131', kind: 'Dispatch', name: 'Refinery turnaround — Ardmore', route: 'Ardmore', date: d(-4), crew: ['Chad Weathers'] },
]
const days = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 864e5)
export function autoMatch(e: Pick<Expense, 'merchant' | 'date' | 'category'>, all: Expense[] = []): { jobNo?: string; rule: string; why: string; confidence: number } {
  const m = e.merchant.toLowerCase()
  const liftra = JOB_MASTER.find(j => j.kind === 'Liftra move')!
  if (/airline|uber|lyft|delta|american|southwest|united/.test(m)) {
    const dd = days(e.date, liftra.date)
    if (dd >= -2 && dd <= 1) { const n = all.filter(x => /uber|lyft/i.test(x.merchant) && Math.abs(days(x.date, liftra.date)) <= 2).length; return { jobNo: liftra.jobNo, rule: 'Rule 1', why: `Rule 1: Liftra move ${liftra.jobNo} on ${liftra.date}; ${/uber|lyft/.test(m) ? `rideshare ${n > 1 ? `(${n} on this move)` : ''}` : 'flight'} booked ${dd <= 0 ? Math.abs(dd) + ' day(s) before' : dd + ' day(s) after'} the move request, crew member Weathers.`, confidence: 96 } }
  }
  if (/trailer/.test(m)) {
    const cm = JOB_MASTER.find(j => j.kind === 'Crane move')!
    const dd = days(e.date, cm.date)
    if (Math.abs(dd) <= 3) return { jobNo: cm.jobNo, rule: 'Rule 3', why: `Rule 3: trailer permit ${Math.abs(dd)} day(s) from crane move ${cm.jobNo} (${cm.route}), within ±3 days on a matching route.`, confidence: 91 }
  }
  if (/permit/.test(m)) {
    const hh = JOB_MASTER.find(j => j.kind === 'Heavy haul')!
    const same = all.filter(x => /permit/i.test(x.merchant) && !/trailer/i.test(x.merchant) && x.date === e.date).length
    if (e.date === hh.date) return { jobNo: hh.jobNo, rule: 'Rule 2', why: `Rule 2: ${same > 1 ? `${same} permits` : 'permit'} bought ${e.date} for ${hh.route} share job ${hh.jobNo}.`, confidence: 93 }
  }
  const disp = JOB_MASTER.find(j => j.date === e.date)
  if (disp) return { jobNo: disp.jobNo, rule: 'Rule 4', why: `Rule 4: dispatched to ${disp.jobNo} (${disp.name}) on ${e.date}; receipt is on the route.`, confidence: 82 }
  return { rule: 'Rule 5', why: 'Rule 5: no rule reached 80% confidence — pick the job from the suggestions.', confidence: 40 }
}
export const DEMO_OCR = [
  { merchant: 'Love’s Travel Stop #612', category: 'Fuel', amount: 214.87 },
  { merchant: 'Hampton Inn Sweetwater', category: 'Lodging', amount: 139.0 },
  { merchant: 'Uber', category: 'Rideshare', amount: 27.65 },
  { merchant: 'Whataburger #1180', category: 'Meals', amount: 18.42 },
]
