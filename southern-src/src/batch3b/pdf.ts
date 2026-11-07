import type * as T from '../data/types'
import { companyOf, VENDOR_BRAND } from '../data/brand'
import { vendorFooter } from '../data/certshare'
import type { Recon } from './b3store'

/** Customer-ready hazard report: no prices, no internal notes. Tenant header, Arrowline mark + credit. */
export async function hazardPdf(db: T.DB, r: Recon): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight()
  const co = companyOf(db), job = db.jobs.find(j => j.id === r.jobId)!, site = db.sites.find(s => s.id === r.siteId)!, cust = db.customers.find(c => c.id === job.customerId)
  const bar = () => {
    doc.setFillColor(15, 45, 82); doc.rect(0, 0, W, 70, 'F'); doc.setFillColor(196, 88, 28); doc.rect(0, 70, W, 3, 'F')
    try { doc.addImage(VENDOR_BRAND.logo.pdfPng, 'PNG', W - 60, 20, 30 * VENDOR_BRAND.logo.aspect / 1.6, 30 / 1.6) } catch { /* skip */ }
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(co.name, 32, 32)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(`Site hazard report · ${co.phone ?? ''}`, 32, 50)
  }
  bar()
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.text('Site hazard report', 32, 112)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(90, 90, 90)
  ;[`${cust?.name ?? ''} · Job #${job.jobNo} · ${job.name}`, `${site.name}, ${site.city}, ${site.state}`, `Recon by ${r.by} on ${new Date(r.at).toLocaleDateString('en-US', { dateStyle: 'medium' })}${r.approvedBy ? ` · approved by ${r.approvedBy}` : ''}`].forEach((m, i) => doc.text(m, 32, 132 + i * 15))
  let y = 190
  const fix = r.hazards.filter(h => h.customerVisible && h.fixBy === 'Customer')
  doc.setFillColor(254, 242, 232); doc.roundedRect(32, y, W - 64, 28 + fix.length * 15, 6, 6, 'F'); doc.setTextColor(150, 60, 10); doc.setFont('helvetica', 'bold'); doc.setFontSize(11)
  doc.text(fix.length ? `Please fix before work starts (${fix.length})` : 'Nothing for you to fix before work starts', 44, y + 18); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  fix.forEach((h, i) => doc.text(`•  ${h.kind}: ${h.control}`.slice(0, 120), 44, y + 34 + i * 15)); y += 46 + fix.length * 15
  doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('All hazards and controls', 32, y); y += 14
  r.hazards.filter(h => h.customerVisible).forEach(h => {
    if (y > H - 90) { vendorFooter(doc, W, H); doc.addPage(); bar(); y = 100 }
    const sev = h.severity === 'High' ? [200, 30, 40] : h.severity === 'Medium' ? [200, 130, 20] : [60, 130, 80]
    doc.setFillColor(sev[0], sev[1], sev[2]); doc.roundedRect(32, y + 4, 48, 14, 7, 7, 'F'); doc.setTextColor(255, 255, 255); doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.text(h.severity.toUpperCase(), 56, y + 13.5, { align: 'center' })
    doc.setTextColor(20, 20, 20); doc.setFontSize(10.5); doc.text(h.kind, 90, y + 14); doc.setFont('helvetica', 'normal'); doc.setTextColor(80, 80, 80)
    const lines = doc.splitTextToSize(`${h.detail}. Control: ${h.control} (${h.fixBy === 'Customer' ? 'customer action' : `${co.shortName} will handle`})`, W - 130); doc.text(lines, 90, y + 28); y += 26 + lines.length * 12
  })
  if (r.photos.length) { if (y > H - 200) { vendorFooter(doc, W, H); doc.addPage(); bar(); y = 100 } y += 10; doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20); doc.text('Photos', 32, y); y += 8
    r.photos.slice(0, 4).forEach((p, i) => { try { doc.addImage(p, 32 + i * 136, y, 128, 96) } catch { /* skip */ } }) }
  doc.setFontSize(7.5); doc.setTextColor(150, 150, 150); doc.text('Prepared for the customer. Prices and internal notes are not included.', 32, H - 24)
  vendorFooter(doc, W, H)
  return doc.output('blob')
}
