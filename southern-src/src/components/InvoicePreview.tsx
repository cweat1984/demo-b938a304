// Office fixes (AR): preview + edit invoice lines before anything is sent, and print / save-as-PDF any invoice.
import { useState } from 'react'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId } from '../data/logic'
import { money, money2, fmtDate, today, addDays } from '../lib/util'
import { companyOf } from '../data/brand'
import { Modal, Button, Field } from './ui'
import { parseNum, typing, LIMITS } from '../lib/num'
import { branding } from '../data/branding'
import { cn } from '../lib/util'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

/** Opens a clean printable invoice (Print → Save as PDF). */
export function printInvoice(db: T.DB, inv: Pick<T.Invoice, 'invNo' | 'jobId' | 'customerId' | 'date' | 'due' | 'lines' | 'amount' | 'paid'> & { customerPo?: string }) {
  const j = byId(db.jobs, inv.jobId), c = byId(db.customers, inv.customerId), co = companyOf(db), b = branding()
  const rows = inv.lines.map(l => `<tr><td>${esc(l.description)}</td><td class=n>${l.qty}</td><td class=n>${money2(l.rate)}</td><td class=n>${money2(l.qty * l.rate)}</td></tr>`).join('')
  const html = `<!doctype html><title>${esc(inv.invNo)}</title><style>body{font:14px system-ui,sans-serif;margin:40px;color:#111}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}td,th{padding:8px;border-bottom:1px solid #ddd;text-align:left}.n{text-align:right}.t td{font-weight:700;border-top:2px solid #111}.m{color:#555}</style>
${b.logo ? `<img src="${esc(b.logo)}" alt="" style="max-height:56px;max-width:220px;margin-bottom:8px">` : ''}<h1>${esc(b.name || co?.name || 'Invoice')}</h1><div class=m>${esc(co?.phone ?? '')}</div>
<h2>Invoice ${esc(inv.invNo)}</h2><div>Bill to: <b>${esc(c?.name ?? '')}</b></div><div class=m>Job #${esc(j?.jobNo ?? '')} · ${esc(j?.name ?? '')}${inv.customerPo ? ` · PO ${esc(inv.customerPo)}` : ''}</div><div class=m>Date ${fmtDate(inv.date)} · Due ${fmtDate(inv.due)}</div>
<table><tr><th>Description</th><th class=n>Qty</th><th class=n>Rate</th><th class=n>Amount</th></tr>${rows}<tr class=t><td colspan=3>Total</td><td class=n>${money2(inv.amount)}</td></tr>${inv.paid ? `<tr><td colspan=3>Paid</td><td class=n>${money2(inv.paid)}</td></tr><tr class=t><td colspan=3>Balance due</td><td class=n>${money2(inv.amount - inv.paid)}</td></tr>` : ''}</table>
<script>setTimeout(()=>print(),300)</script>`
  const w = window.open('', '_blank'); if (!w) { toast.error('Allow pop-ups to print the invoice'); return false }
  w.document.write(html); w.document.close(); return true
}

type Row = { description: string; qty: string; rate: string; late?: boolean }
const fmtIn = (n: number) => String(n)
/** dive3 M4: extras logged after the customer signed the last ticket (or after it was drafted) are flagged in the preview. */
function lateExtras(db: T.DB, jobId: string) {
  const j = byId(db.jobs, jobId)!; const signed = db.tickets.filter(t => t.jobId === jobId && t.signedAt).map(t => t.signedAt!).sort().at(-1)
  return new Set((j.extras ?? []).filter(x => x.billable && signed && x.at > signed).map(x => `${x.qty} × ${x.role}`))
}

export function InvoicePreview({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const db = useStore(s => s.db)
  const j = byId(db.jobs, jobId)!
  const [lines, setLines] = useState<Row[]>(() => { const late = lateExtras(db, jobId); return actions.invoiceDraft(jobId).map(l => ({ description: l.description, qty: fmtIn(l.qty), rate: fmtIn(l.rate), late: [...late].some(k => l.description.includes(k)) })) })
  const [po, setPo] = useState(''), [tax, setTax] = useState(''), [busy, setBusy] = useState(false)
  // parse every field the same way createInvoice will (B1): raw text stays as typed, numbers come from the strict parser
  const parsed = lines.map((l, i) => { const q = parseNum(l.qty, { label: `Line ${i + 1} qty`, max: LIMITS.qty, neg: true }), r = parseNum(l.rate, { label: `Line ${i + 1} rate`, max: LIMITS.rate, cents: true, neg: true })
    return { ...l, q: q.ok ? q.n : 0, r: r.ok ? r.n : 0, err: !l.description.trim() ? `Line ${i + 1} needs a description` : !q.ok ? q.msg : !r.ok ? r.msg : null } })
  const t = tax.trim() ? parseNum(tax, { label: 'Sales tax %', max: LIMITS.taxPct }) : { ok: true as const, n: 0 }
  const taxPct = t.ok ? t.n : 0
  const kept = parsed.filter(l => l.q * l.r !== 0)
  const sub = Math.round(kept.reduce((s, l) => s + l.q * l.r, 0) * 100) / 100
  const taxAmt = taxPct > 0 ? Math.round(sub * taxPct) / 100 : 0
  const total = Math.round((sub + taxAmt) * 100) / 100
  const set = (i: number, k: 'description' | 'qty' | 'rate', v: string) => setLines(ls => ls.map((l, x) => x !== i ? l : { ...l, [k]: k === 'description' ? v : typing(v, true) }))
  const reason = parsed.find(l => l.err)?.err ?? (!t.ok ? t.msg : null) ?? (!kept.length ? 'Add at least one line with an amount' : null) ?? (total <= 0 ? 'Credits are larger than the charges — the total must be more than $0' : null) ?? (total > LIMITS.invoice ? `Total over $${LIMITS.invoice.toLocaleString('en-US')} — check the numbers` : null)
  const late = parsed.filter(l => l.late)
  const send = () => { if (reason || busy) return; setBusy(true)
    const out = [...kept.map(l => ({ description: l.description.trim(), qty: l.q, rate: l.r })), ...(taxAmt ? [{ description: `Sales tax ${taxPct}%`, qty: 1, rate: taxAmt }] : [])]
    const r = actions.createInvoice(jobId, { lines: out, customerPo: po }); if (!r.ok) { setBusy(false); toast.error(r.reason); return }
    const saved = useStore.getState().db.invoices.find(x => x.invNo === r.invNo)?.amount ?? total
    toast.success(`${r.invNo} sent · ${money(saved)}`, { description: 'Queued for QuickBooks in Accounting Sync' }); onClose() }
  const draftLines = [...kept.map(l => ({ description: l.description, qty: l.q, rate: l.r })), ...(taxAmt ? [{ description: `Sales tax ${taxPct}%`, qty: 1, rate: taxAmt }] : [])]
  return (
    <Modal open onClose={onClose} title={`Invoice preview — Job #${j.jobNo}`} sub="Check the lines before it goes to the customer. Nothing is sent until you press Send." width={720}>
      <div className="flex flex-col gap-3" data-testid="inv-preview">
        {late.length > 0 && <div role="alert" data-testid="inv-late" className="rounded-xl border-2 border-[var(--warn)]/50 bg-warn/10 px-3 py-2 text-sm"><b>Added after the customer signed:</b> {late.map(l => l.description).join('; ')}. Make sure the customer agreed before sending.</div>}
        {parsed.map((l, i) => <div key={i} data-testid="inv-line" data-credit={l.q * l.r < 0 ? '1' : ''} className={cn('grid gap-2 items-center text-sm grid-cols-[1fr_1fr_auto_auto] sm:grid-cols-[1fr_80px_110px_90px_36px] rounded-xl sm:rounded-none p-2 sm:p-0 bg-surface-2 sm:bg-transparent', l.late && 'ring-2 ring-[var(--warn)]/60 sm:ring-0')}>
          <input className={cn('input col-span-4 sm:col-span-1 text-base sm:text-sm', !l.description.trim() && 'border-[var(--bad)]')} value={l.description} placeholder="Description" onChange={e => set(i, 'description', e.target.value)} data-testid="inv-line-desc" aria-label={`Line ${i + 1} description`} />
          <input className="input num text-right text-base sm:text-sm" inputMode="decimal" value={l.qty} onChange={e => set(i, 'qty', e.target.value)} data-testid="inv-line-qty" aria-label="Qty" aria-invalid={!!l.err && /qty/.test(l.err)} />
          <input className="input num text-right text-base sm:text-sm" inputMode="decimal" value={l.rate} onChange={e => set(i, 'rate', e.target.value)} data-testid="inv-line-rate" aria-label="Rate" aria-invalid={!!l.err && /rate/.test(l.err)} />
          <span className={cn('num text-right', l.q * l.r < 0 && 'text-ok')} data-testid="inv-line-amt">{money2(l.q * l.r)}</span>
          <button className="btn-icon size-9 pointer-coarse:size-11" aria-label={`Remove line ${i + 1}`} data-testid="inv-line-del" onClick={() => setLines(ls => ls.filter((_, x) => x !== i))}>×</button>
        </div>)}
        <div className="flex gap-2"><Button size="sm" data-testid="inv-add-line" onClick={() => setLines(ls => [...ls, { description: 'Rigging / additional labor', qty: '1', rate: '0' }])}>Add line</Button></div>
        <div className="grid grid-cols-2 gap-3"><Field label="Customer PO #"><input className="input text-base sm:text-sm" value={po} onChange={e => setPo(e.target.value.slice(0, 40))} data-testid="inv-po" /></Field><Field label="Sales tax %" hint="Leave blank if exempt"><input className={cn('input num text-base sm:text-sm', !t.ok && 'border-[var(--bad)]')} inputMode="decimal" value={tax} onChange={e => setTax(typing(e.target.value))} data-testid="inv-tax" /></Field></div>
        <div className="flex items-center justify-between border-t hairline pt-3"><span className="text-sm text-muted" data-testid="inv-sub">{taxAmt ? `Subtotal ${money2(sub)} + tax ${money2(taxAmt)}` : 'No tax'}</span><span className="display text-2xl font-semibold num" data-testid="inv-total">{money2(total)}</span></div>
        {reason && <div role="alert" data-testid="inv-reason" className="text-sm font-semibold text-bad">{reason}</div>}
        <div className="flex gap-2 justify-end flex-wrap">
          <Button variant="ghost" onClick={() => printInvoice(db, { invNo: 'DRAFT', jobId, customerId: j.customerId, date: today(), due: addDays(today(), 30), lines: draftLines, amount: total, paid: 0, customerPo: po })}>Print draft</Button>
          <Button variant="primary" disabled={!!reason || busy} data-testid="inv-send" onClick={send}>Send invoice</Button>
        </div>
      </div>
    </Modal>
  )
}
