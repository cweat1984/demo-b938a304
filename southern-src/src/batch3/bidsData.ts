import { companyOf } from '../data/brand'
/** Vendor Quotes & Bidding (Blueprint 5.3). Local store 'sc-bids-v2'. Nothing is ever emailed — previews only. */
import { create } from 'zustand'
import { uid, today, addDays } from '../lib/util'

export interface HaulVendor { id: string; name: string; contact: string; email: string; lanes: string[]; rating: number; onTime: number; insured: boolean; dot: string; authority: 'Active' | 'Inactive'; claims: number }
export const VENDORS: HaulVendor[] = [
  { id: 'hv-1', name: 'Bennett Heavy Haul', contact: 'Rita Bennett', email: 'rita@bennett-hh.example', lanes: ['OK', 'TX'], rating: 4.7, onTime: 96, insured: true, dot: 'USDOT 2219034 · MC 771203', authority: 'Active', claims: 0 },
  { id: 'hv-2', name: 'Lone Star Transport', contact: 'Dale Hale', email: 'dispatch@lonestar-t.example', lanes: ['TX', 'OK', 'NM'], rating: 4.4, onTime: 91, insured: true, dot: 'USDOT 1880211 · MC 640092', authority: 'Active', claims: 1 },
  { id: 'hv-3', name: 'Red River Specialized', contact: 'Amos Cole', email: 'quotes@redriver-sp.example', lanes: ['OK', 'TX', 'AR'], rating: 4.1, onTime: 88, insured: true, dot: 'USDOT 3120876 · MC 902114', authority: 'Active', claims: 2 },
  { id: 'hv-4', name: 'Prairie Lowboy Co.', contact: 'June Watts', email: 'june@prairielowboy.example', lanes: ['OK', 'KS'], rating: 4.5, onTime: 94, insured: false, dot: 'USDOT 2770415 · MC 811650', authority: 'Active', claims: 0 },
  { id: 'hv-5', name: 'Gulf Coast Rigging Haul', contact: 'Ty Broussard', email: 'ty@gulfcoast-rh.example', lanes: ['TX', 'LA'], rating: 3.9, onTime: 84, insured: true, dot: 'USDOT 1450339 · MC 512778', authority: 'Inactive', claims: 3 },
]
export interface RfqLine { desc: string; weightLbs: number; dims: string; trailer: string }
export interface Quote { id: string; vendorId: string; amount: number; transitHrs: number; validUntil: string; note?: string; at: string }
export interface Award { quoteId: string; po: string; billable: boolean; markupPct: number; at: string; invoice?: number; reason?: string }
export interface Rfq {
  id: string; moveId?: string; jobNo: string; title: string; customer: string; site: string; pickupRegion: string; dropRegion: string; pickupDate: string; dropDate: string; lane: string
  lines: RfqLine[]; vendorIds: string[]; dueAt: string; sealed: boolean; status: 'Draft' | 'Out for quote' | 'Awarded'; sentAt?: string; quotes: Quote[]; award?: Award
}
export const LANE_HISTORY: Record<string, number[]> = { 'SE OK → S-central OK': [3650, 3900, 4100, 3800, 4250, 3720], 'W TX → W TX': [1650, 1800, 1720, 1900], 'S-central OK → OKC metro': [3100, 3300, 2950, 3400, 3250, 3150] }
const ago = (d: number) => addDays(today(), -d)
function seed(): Rfq[] {
  return [
    { id: 'rfq-1', moveId: 'mv-1', jobNo: '10158', title: 'Crane 28 move — 4 live-load trailers', customer: 'Red River Refining', site: 'Ardmore Refinery, 1700 Refinery Rd, Gate 4 (Mike Shaw 580-555-0142)', pickupRegion: 'Southeast Oklahoma (Pushmataha Co.)', dropRegion: 'South-central Oklahoma (Carter Co.)', pickupDate: ago(1), dropDate: addDays(today(), 1), lane: 'SE OK → S-central OK',
      lines: [{ desc: 'Superstructure counterweight slabs (4 × 10 t)', weightLbs: 88000, dims: '13.1 × 3.9 × 1.6 ft each', trailer: 'Step deck ×2' }, { desc: 'Boom head + crane mats (6)', weightLbs: 44100, dims: '20 × 8.5 × 9 ft', trailer: 'Flatbed' }, { desc: 'Carbody counterweight 22 t', weightLbs: 48500, dims: '16 × 9.8 × 3.6 ft · oversize width', trailer: 'Lowboy' }],
      vendorIds: ['hv-1', 'hv-2', 'hv-3', 'hv-4'], dueAt: addDays(today(), 1), sealed: true, status: 'Out for quote', sentAt: ago(4),
      quotes: [
        { id: 'q-1', vendorId: 'hv-1', amount: 14200, transitHrs: 5, validUntil: addDays(today(), 10), at: ago(3), note: 'Includes OK oversize permit for carbody.' },
        { id: 'q-2', vendorId: 'hv-2', amount: 12950, transitHrs: 6, validUntil: addDays(today(), 7), at: ago(3) },
        { id: 'q-3', vendorId: 'hv-3', amount: 15800, transitHrs: 5, validUntil: addDays(today(), 14), at: ago(2), note: 'Escort car extra if required.' },
        { id: 'q-4', vendorId: 'hv-4', amount: 12400, transitHrs: 7, validUntil: addDays(today(), 5), at: ago(2), note: 'Cert of insurance to follow.' },
      ] },
    { id: 'rfq-2', jobNo: '10142', title: 'Crane 31 counterweight — Odessa → Midland', customer: 'Lone Star Petrochem', site: 'Odessa Petrochem, Gate 2', pickupRegion: 'West Texas (Ector Co.)', dropRegion: 'West Texas (Midland Co.)', pickupDate: ago(12), dropDate: ago(12), lane: 'W TX → W TX',
      lines: [{ desc: 'Counterweight slabs 15 t × 2', weightLbs: 66000, dims: '12 × 8 × 2 ft', trailer: 'RGN' }], vendorIds: ['hv-2', 'hv-5'], dueAt: ago(15), sealed: false, status: 'Awarded', sentAt: ago(17),
      quotes: [{ id: 'q-5', vendorId: 'hv-2', amount: 1850, transitHrs: 1, validUntil: ago(5), at: ago(16) }, { id: 'q-6', vendorId: 'hv-5', amount: 1690, transitHrs: 2, validUntil: ago(5), at: ago(16) }],
      award: { quoteId: 'q-5', po: 'PO-24918', billable: true, markupPct: 12, at: ago(15), invoice: 2310, reason: 'Detention 3 h at gate (TWIC escort)' } },
    { id: 'rfq-3', jobNo: '10131', title: 'Crane 70 boom inserts — Ardmore → OKC', customer: 'Red River Refining', site: 'Ardmore Refinery, Gate 4', pickupRegion: 'South-central Oklahoma', dropRegion: 'OKC metro', pickupDate: ago(25), dropDate: ago(25), lane: 'S-central OK → OKC metro',
      lines: [{ desc: 'Boom inserts 12 m × 2', weightLbs: 49600, dims: '40 × 8.5 × 8 ft', trailer: 'Step deck' }], vendorIds: ['hv-1', 'hv-3'], dueAt: ago(28), sealed: false, status: 'Awarded', sentAt: ago(30),
      quotes: [{ id: 'q-7', vendorId: 'hv-1', amount: 3200, transitHrs: 3, validUntil: ago(20), at: ago(29) }, { id: 'q-8', vendorId: 'hv-3', amount: 3450, transitHrs: 3, validUntil: ago(20), at: ago(29) }],
      award: { quoteId: 'q-7', po: 'PO-24877', billable: true, markupPct: 12, at: ago(27), invoice: 3200, reason: 'Matches quote' } },
  ]
}
interface BState { rfqs: Rfq[]; v: number }
const KEY = 'sc-bids-v2'
const load = (): BState => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s?.v === 1) return s } catch { /* */ } return { rfqs: seed(), v: 1 } }
export const useBids = create<BState>(() => load())
const mut = (fn: (s: BState) => void) => { const s = structuredClone(useBids.getState()); fn(s); useBids.setState(s); localStorage.setItem(KEY, JSON.stringify(s)) }
export const vendor = (id: string) => VENDORS.find(v => v.id === id)!
export const money = (n: number) => `$${Math.round(n).toLocaleString()}`
export const laneAvg = (lane: string) => { const h = LANE_HISTORY[lane]; return h?.length ? h.reduce((a, b) => a + b, 0) / h.length : undefined }

/** The email each vendor sees: no customer, no exact site, no competing prices — until award. */
export function vendorEmail(r: Rfq, v: HaulVendor, awarded = false) {
  const lines = r.lines.map(l => `  • ${l.desc} — ${l.weightLbs.toLocaleString()} lb · ${l.dims} · ${l.trailer}`).join('\n')
  if (awarded) return { to: `${v.contact} <${v.email}>`, subject: `Awarded: ${r.title} (PO ${r.award?.po})`, body: `Hi ${v.contact.split(' ')[0]},\n\nGood news — your quote is awarded. PO ${r.award?.po}.\n\nNow that it's yours, here are the full details:\n  Customer: ${r.customer}\n  Site: ${r.site}\n  Job #: ${r.jobNo}\n\n${lines}\n\nPickup ${r.pickupDate} · Drop ${r.dropDate}. Please send your COI and driver names.\n\nThanks,\n${companyOf().name}` }
  return { to: `${v.contact} <${v.email}>`, subject: `Request for quote — heavy haul, ${r.pickupRegion.split(' (')[0]} → ${r.dropRegion.split(' (')[0]}`, body: `Hi ${v.contact.split(' ')[0]},\n\n${companyOf().shortName} would like your price on the haul below. This request is just for you.\n\n  Pickup region: ${r.pickupRegion}\n  Drop-off region: ${r.dropRegion}\n  Pickup ${r.pickupDate} · Drop-off ${r.dropDate}\n\n${lines}\n\nPlease reply by ${r.dueAt} with your all-in price, transit time, and COI.\n${r.sealed ? 'Quotes are sealed until the deadline.\n' : ''}Customer and exact site are shared with the awarded carrier.\n\nThanks,\n${companyOf().name}` }
}
export const bidActions = {
  reset() { localStorage.removeItem(KEY); useBids.setState({ rfqs: seed(), v: 1 }) },
  create(p: Omit<Rfq, 'id' | 'status' | 'quotes'>) { const id = uid('rfq'); mut(s => { s.rfqs.unshift({ ...p, id, status: 'Draft', quotes: [] }) }); return id },
  send(id: string) {
    mut(s => { const r = s.rfqs.find(x => x.id === id)!; r.status = 'Out for quote'; r.sentAt = today()
      // demo: replies trickle in (seeded) so the comparison has something to show
      const base = (laneAvg(r.lane) ?? 4000) * Math.max(1, r.lines.length / 2)
      r.vendorIds.forEach((vid, i) => { if (i < 3) r.quotes.push({ id: uid('q'), vendorId: vid, amount: Math.round(base * (0.88 + ((i * 37) % 25) / 100) / 10) * 10, transitHrs: 4 + i, validUntil: addDays(today(), 10), at: new Date().toISOString() }) }) })
  },
  award(id: string, quoteId: string, billable: boolean, markupPct: number) { mut(s => { const r = s.rfqs.find(x => x.id === id)!; r.status = 'Awarded'; r.award = { quoteId, po: `PO-${25010 + s.rfqs.length}`, billable, markupPct, at: today() }; const q = r.quotes.find(q => q.id === quoteId)!; ;(LANE_HISTORY[r.lane] ??= []).push(q.amount) }) },
  invoice(id: string, amount: number, reason: string) { mut(s => { const a = s.rfqs.find(x => x.id === id)!.award!; a.invoice = amount; a.reason = reason }) },
}
