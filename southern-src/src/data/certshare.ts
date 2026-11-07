// "Send my certs": recipients, share tokens and the in-browser PDF packet. DEMO — nothing is sent externally.
import type * as T from './types'
import { byId, fullName, customerOf, siteOf, certBand, crewOn, assignmentsFor } from './logic'
import { companyOf, VENDOR_BRAND } from './brand'
import { today, addDays, fmtDate } from '../lib/util'

export const SHARE_DAYS = 7
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim())
export const isPhone = (s: string) => s.replace(/\D/g, '').length >= 10
export const shareUrl = (token: string) => `${location.origin}${location.pathname}?certs=${token}`
export const shareLive = (s?: T.CertShare) => !!s && s.expires >= new Date().toISOString()
export const certValid = (c: T.Cert) => certBand(c).band !== 'expired' && c.verified !== 'Rejected'

const hash = (s: string) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h }
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'customer'
const FIRST = ['Kim', 'Darren', 'Lisa', 'Marcus', 'Angela', 'Troy', 'Renee', 'Cody']
const LAST = ['Dupree', 'Holt', 'Whitley', 'Fuentes', 'Brandt', 'Nix', 'Yates', 'Coker']

export interface Recipient { name: string; role: string; email?: string; phone?: string; demo?: boolean }
/** Who's at the gate: customer contact + site safety rep (+ wind-site contacts). Emails are demo addresses derived from the customer. */
export function siteRecipients(db: T.DB, job?: T.Job): Recipient[] {
  if (!job) return []
  const c = customerOf(db, job); const dom = `${slug(c.name)}.example.com`
  const h = hash(job.id)
  const safety = `${FIRST[h % FIRST.length]} ${LAST[(h >> 3) % LAST.length]}`
  const em = (n: string) => `${n.toLowerCase().replace(/[^a-z]+/g, '.')}@${dom}`
  const out: Recipient[] = [
    { name: safety, role: `Site safety rep · ${c.name}`, email: em(safety), phone: c.phone.replace(/\d{4}$/, String(1000 + (h % 8999))), demo: true },
    { name: c.contact, role: `Customer contact · ${c.name}`, email: em(c.contact), phone: c.phone, demo: true },
  ]
  const ws = job.windFarmId ? db.windSites?.[job.windFarmId] : undefined
  ws?.contacts?.forEach(x => out.push({ name: x.name, role: x.role, phone: x.phone, email: em(x.name), demo: true }))
  return out
}
/** The job an employee is on today (or next). */
export function currentJobFor(db: T.DB, empId: string): T.Job | undefined {
  const t = today()
  for (let k = 0; k < 8; k++) { const a = assignmentsFor(db, empId, addDays(t, k))[0]; if (a) return byId(db.jobs, a.jobId) }
  return undefined
}
export const crewIdsOn = (db: T.DB, job: T.Job) => { const t = today(); let c = crewOn(db, job.id, t); if (!c.length) for (let k = 1; k < 8 && !c.length; k++) c = crewOn(db, job.id, addDays(t, k)); return [...new Set(c.map(a => a.employeeId))] }

// ---------- PDF packet ----------
async function logoData(db: T.DB): Promise<string | undefined> {
  const custom = db.company?.logo
  if (custom && /^data:image\/(png|jpe?g)/.test(custom)) return custom
  try { const r = await fetch('icon-192.png'); if (!r.ok) return undefined; const b = await r.blob(); return await new Promise(res => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.readAsDataURL(b) }) } catch { return undefined }
}
const ini = (n: string) => n.split(' ').map(x => x[0]).slice(0, 2).join('')
const hue = (n: string) => { let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360; return h }
function hsl(h: number, s: number, l: number): [number, number, number] { s /= 100; l /= 100; const k = (n: number) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [255 * f(0), 255 * f(8), 255 * f(4)] }

export async function certPacketPdf(db: T.DB, share: Pick<T.CertShare, 'employeeIds' | 'certIds' | 'jobId' | 'note' | 'to' | 'token' | 'at' | 'expires'>): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const co = companyOf(db); const job = share.jobId ? byId(db.jobs, share.jobId) : undefined
  const logo = await logoData(db)
  const emps = share.employeeIds.map(id => byId(db.employees, id)).filter(Boolean) as T.Employee[]
  const brandBar = (title: string) => {
    doc.setFillColor(17, 20, 26); doc.rect(0, 0, W, 64, 'F'); doc.setFillColor(200, 30, 40); doc.rect(0, 64, W, 4, 'F')
    if (logo) try { doc.addImage(logo, 'PNG', 28, 14, 36, 36) } catch { /* skip */ }
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text(co.name, 74, 32)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`${title} · ${co.phone ?? ''}`, 74, 47)
    doc.setTextColor(200, 30, 40); doc.setFontSize(8); doc.text('DEMO — generated on device, not sent', W - 28, 32, { align: 'right' })
  }
  const footer = (n: number) => { doc.setTextColor(140, 140, 140); doc.setFontSize(8); doc.text(`Verify online: ${shareUrl(share.token)} (link expires ${fmtDate(share.expires.slice(0, 10), { month: 'short', day: 'numeric', year: 'numeric' })})`, 28, H - 22); doc.text(`Page ${n}`, W - 28, H - 22, { align: 'right' }); vendorFooter(doc, W, H) }
  // cover
  brandBar('Certification packet')
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.text(emps.length > 1 ? 'Crew certifications' : 'Certifications', 40, 130)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 90, 90)
  const meta = [job ? `Job #${job.jobNo} · ${job.name}` : undefined, job ? `${siteOf(db, job).name}, ${siteOf(db, job).city}, ${siteOf(db, job).state}` : undefined, `Prepared ${new Date(share.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`, share.to.name || share.to.email || share.to.phone ? `For ${[share.to.name, share.to.email ?? share.to.phone].filter(Boolean).join(' · ')}` : undefined].filter(Boolean) as string[]
  meta.forEach((m, i) => doc.text(m, 40, 156 + i * 16))
  let y = 170 + meta.length * 16
  if (share.note) { doc.setFillColor(245, 245, 245); const lines = doc.splitTextToSize(`Note: ${share.note}`, W - 100); doc.roundedRect(40, y, W - 80, 18 + lines.length * 13, 6, 6, 'F'); doc.setTextColor(40, 40, 40); doc.text(lines, 52, y + 16); y += 30 + lines.length * 13 }
  y += 10
  emps.forEach(e => {
    if (y > H - 120) { footer(doc.getNumberOfPages()); doc.addPage(); brandBar('Certification packet'); y = 100 }
    const n = fullName(e); doc.setFillColor(...hsl(hue(n), 45, 42)); doc.circle(68, y + 26, 26, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(ini(n), 68, y + 32, { align: 'center' })
    doc.setTextColor(20, 20, 20); doc.setFontSize(15); doc.text(n, 106, y + 20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 100, 100)
    const cs = share.certIds.map(id => byId(db.certs, id)).filter(c => c && c.employeeId === e.id) as T.Cert[]
    doc.text(`${e.craft} · ${e.empNo} · ${cs.length} certification${cs.length === 1 ? '' : 's'} enclosed`, 106, y + 36)
    y += 70
  })
  footer(1)
  // cert cards: two per page
  let slot = 0
  emps.forEach(e => share.certIds.map(id => byId(db.certs, id)).filter(c => c && c.employeeId === e.id).forEach(c => {
    const cert = c as T.Cert
    if (slot % 2 === 0) { doc.addPage(); brandBar('Certification card') }
    const top = 100 + (slot % 2) * ((H - 140) / 2), h = (H - 180) / 2
    const b = certBand(cert)
    doc.setDrawColor(210, 210, 210); doc.setLineWidth(1); doc.roundedRect(40, top, W - 80, h, 12, 12, 'S')
    doc.setFillColor(...(b.band === 'expired' ? [200, 40, 40] as [number, number, number] : b.band === '30' ? [220, 150, 20] as [number, number, number] : [30, 140, 80] as [number, number, number])); doc.roundedRect(40, top, 10, h, 5, 5, 'F')
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text(cert.type, 70, top + 40)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(80, 80, 80)
    const rows: [string, string][] = [['Holder', fullName(e)], ['Credential #', cert.credentialNo], ['Issued by', cert.provider], ['Issued', fmtDate(cert.issued, { month: 'short', day: 'numeric', year: 'numeric' })], ['Expires', fmtDate(cert.expires, { month: 'short', day: 'numeric', year: 'numeric' }) + (b.band === 'expired' ? '  (EXPIRED)' : '')], ['Status', cert.verified === 'Verified' ? 'Verified by Safety' : cert.verified]]
    rows.forEach(([k, v], i) => { doc.setTextColor(130, 130, 130); doc.text(k, 70, top + 72 + i * 22); doc.setTextColor(20, 20, 20); doc.text(v, 170, top + 72 + i * 22) })
    doc.setTextColor(160, 160, 160); doc.setFontSize(8); doc.text('Card image on file with Safety — scan copy (demo)', 70, top + h - 16)
    if (slot % 2 === 0) footer(doc.getNumberOfPages())
    slot++
  }))
  return doc.output('blob')
}
export const packetName = (db: T.DB, s: Pick<T.CertShare, 'employeeIds' | 'jobId'>) => {
  const e = byId(db.employees, s.employeeIds[0]); const j = s.jobId ? byId(db.jobs, s.jobId) : undefined
  return `certs-${s.employeeIds.length > 1 ? 'crew' : (e ? `${e.first}-${e.last}` : 'employee').toLowerCase()}${j ? `-job${j.jobNo}` : ''}-${today()}.pdf`
}
export function downloadBlob(b: Blob, name: string) { const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000) }

/** Small centered "Powered by [mark] ARROWLINE" credit at the bottom of every generated PDF page. */
export function vendorFooter(doc: import('jspdf').jsPDF, W: number, H: number) {
  const v = VENDOR_BRAND, y = H - 9, mh = 8, mw = mh * v.logo.aspect
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(150, 150, 150)
  const label = 'Powered by', lw = doc.getTextWidth(label)
  doc.setFont('times', 'normal'); doc.setFontSize(7); doc.setCharSpace(1.6); const ww = doc.getTextWidth(v.wordmark) + v.wordmark.length * 1.6; doc.setCharSpace(0)
  const total = lw + 4 + mw + 3 + ww; let x = (W - total) / 2
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.text(label, x, y); x += lw + 4
  try { doc.addImage(v.logo.pdfPng, 'PNG', x, y - mh + 1.5, mw, mh) } catch { /* skip */ }
  x += mw + 3
  doc.setFont('times', 'normal'); doc.setFontSize(7); doc.setTextColor(15, 45, 82); doc.setCharSpace(1.6); doc.text(v.wordmark, x, y); doc.setCharSpace(0)
}
