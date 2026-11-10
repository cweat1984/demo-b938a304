import { useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { Receipt, Download } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { inScope, byId, agingBucket, customerOf } from '../data/logic'
import { cn, fmtDate, money, money2, downloadCsv, today, diffDays } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Card, Empty, CallButton, confirmChoice } from '../components/ui'
import { InvoicePreview } from '../components/InvoicePreview'
import { BillingReviewList } from '../components/JobExtras'

const BUCKETS = ['Current', '1–30', '31–60', '61–90', '90+'] as const

export default function Receivables() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const [tab, setTab] = useKeep<'open' | 'ready' | 'paid'>('receivables:tab', 'open')
  const [bucket, setBucket] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const inv = useMemo(() => db.invoices.filter(i => inScope(byId(db.jobs, i.jobId), f)), [db, f])
  const openInv = inv.filter(i => i.paid < i.amount)
  const totals = Object.fromEntries(BUCKETS.map(b => [b, openInv.filter(i => agingBucket(i) === b).reduce((s, i) => s + i.amount - i.paid, 0)]))
  const ar = openInv.reduce((s, i) => s + i.amount - i.paid, 0)
  // Ready to bill = work is done AND every ticket is customer-signed (customers pay for what they signed)
  const ready = db.jobs.filter(j => inScope(j, f) && !j.invoiceNo && j.stage === 'Complete' && db.tickets.some(t => t.jobId === j.id && t.signedAt) && !db.tickets.some(t => t.jobId === j.id && !t.signedAt))
  // Complete but NOT billable — say why (unsigned / no tickets) so AR knows who to chase.
  const blocked = db.jobs.filter(j => inScope(j, f) && !j.invoiceNo && j.stage === 'Complete' && !ready.includes(j)).map(j => { const tk = db.tickets.filter(t => t.jobId === j.id), un = tk.filter(t => !t.signedAt); return { j, why: !tk.length ? 'No field tickets submitted' : `${un.length} of ${tk.length} ticket${tk.length > 1 ? 's' : ''} not customer-signed (${un.slice(0, 3).map(t => t.date.slice(5)).join(', ')}${un.length > 3 ? '…' : ''})` } })
  const paidMonth = inv.flatMap(i => i.payments).filter(p => p.date.slice(0, 7) === today().slice(0, 7)).reduce((s, p) => s + p.amount, 0)
  const list = (tab === 'open' ? openInv.filter(i => !bucket || agingBucket(i) === bucket) : inv.filter(i => i.paid >= i.amount)).sort((a, b) => a.due.localeCompare(b.due))
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow="Accounts receivable" title={<span><span className="num">{money(ar, true)}</span> outstanding</span>} sub={`${openInv.length} open invoice${openInv.length === 1 ? "" : "s"} · ${money(paidMonth, true)} collected this month · ${ready.length} job${ready.length === 1 ? "" : "s"} ready to bill`} actions={<Button icon={<Download className="size-4" />} onClick={() => downloadCsv('ar-aging.csv', [['Invoice', 'Customer', 'Job', 'Date', 'Due', 'Amount', 'Paid', 'Balance', 'Aging', 'Collections'], ...openInv.map(i => [i.invNo, byId(db.customers, i.customerId)?.name, byId(db.jobs, i.jobId)?.jobNo, i.date, i.due, i.amount, i.paid, i.amount - i.paid, agingBucket(i), i.collections])])}>Aging export</Button>} />
      <div className="card p-4 mb-5" data-testid="ar-billing-review"><BillingReviewList compact /></div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {BUCKETS.map(b => <button key={b} onClick={() => { setTab('open'); setBucket(bucket === b ? null : b) }} className={cn('card p-4 text-left transition', bucket === b && 'accent-glow border-accent')}><div className="label">{b === 'Current' ? 'Not yet due' : `${b} days`}</div><div className={cn('display text-2xl font-semibold num mt-2', b === '90+' || b === '61–90' ? 'text-bad' : b === '31–60' ? 'text-warn' : '')}>{money(totals[b], true)}</div></button>)}
      </div>
      <Segmented className="mb-4" value={tab} onChange={v => { setTab(v); setBucket(null) }} options={[{ value: 'open', label: 'Open', count: openInv.length }, { value: 'ready', label: 'Ready to invoice', count: ready.length }, { value: 'paid', label: 'Paid' }]} />
      {tab === 'ready' && blocked.length > 0 && <div className="card p-4 mb-3 border-warn/40" data-testid="billing-blocked"><div className="font-semibold text-sm mb-1">Complete but can’t bill yet · {blocked.length}</div>{blocked.map(({ j, why }) => <div key={j.id} className="text-sm flex gap-2 py-0.5"><button className="font-medium hover:text-accent" onClick={() => open({ type: 'job', id: j.id })}>#{j.jobNo}</button><span className="text-muted truncate">{customerOf(db, j).name}</span><span className="text-warn ml-auto" data-testid="billing-blocked-why">{why}</span></div>)}</div>}
      {tab === 'ready' ? (ready.length ? <><div className="flex items-center gap-3 mb-3"><div className="text-sm text-muted flex-1">Done and fully signed by the customer — safe to bill.</div><Button variant="primary" data-testid="invoice-all" onClick={async () => {
            // preview every invoice (job, customer, lines total) and confirm before anything goes out
            const rows = ready.map(j => ({ j, total: actions.invoiceDraft(j.id).reduce((s, l) => s + l.qty * l.rate, 0) }))
            const c = await confirmChoice(`Send ${rows.length} invoice${rows.length === 1 ? '' : 's'} — ${money(rows.reduce((s, r) => s + r.total, 0))}?`, <div className="flex flex-col gap-1 text-sm" data-testid="invoice-all-preview">{rows.map(r => <div key={r.j.id} className="flex gap-3"><span className="flex-1">#{r.j.jobNo} · {customerOf(db, r.j).name}</span><span className="num">{money(r.total)}</span></div>)}<div className="text-xs text-muted mt-2">Day rate from signed tickets + mob/demob. To edit lines, PO # or tax, cancel and use Create invoice… on a job.</div></div>, [{ label: `Send ${rows.length} invoice${rows.length === 1 ? '' : 's'}`, value: true, tone: 'primary' }])
            if (!c?.value) return
            let n = 0; ready.forEach(j => { const r = actions.createInvoice(j.id); if (r.ok) n++ }); toast.success(`${n} invoice${n === 1 ? '' : 's'} sent`, { description: 'Built from signed tickets & quotes' }) }}>Invoice {ready.length} job{ready.length === 1 ? '' : 's'} with signed tickets</Button></div><div className="grid gap-3 md:grid-cols-2">{ready.map(j => { const signed = db.tickets.filter(t => t.jobId === j.id && t.signerName).length; return (
        <Card key={j.id}>
          <div className="flex items-start gap-3"><Receipt className="size-5 text-muted mt-1" /><div className="flex-1"><button onClick={() => open({ type: 'job', id: j.id })} className="font-semibold hover:text-accent">#{j.jobNo} · {customerOf(db, j).name}</button><div className="text-xs text-muted">{j.name} · {signed} signed ticket{signed === 1 ? '' : 's'} · {j.stage}</div></div><span className="num font-semibold text-right" data-testid="ar-ready-amt">{money(actions.invoiceDraft(j.id).reduce((s, l) => s + l.qty * l.rate, 0), true)}<span className="block text-[11px] text-muted font-normal">draft invoice · quoted {money(j.quote.revenue, true)}</span></span></div>
          <Button className="mt-4" size="sm" variant="secondary" data-testid="inv-create" onClick={() => setPreview(j.id)}>Create invoice…</Button>
        </Card>) })}</div></> : <Empty title="Nothing waiting to bill" />) : (
        <div className="card p-0 overflow-hidden">{list.map(i => { const c = byId(db.customers, i.customerId)!; const ag = agingBucket(i); const late = diffDays(today(), i.due); return (
          <div key={i.id} className="flex items-center gap-4 px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2 transition">
            <button onClick={() => open({ type: 'invoice', id: i.id })} className="flex-1 min-w-0 text-left"><span className="block font-semibold text-sm">{i.invNo}{i.kind ? ` · ${i.kind === 'Credit' ? 'Credit memo' : 'Supplemental'} to ${i.ofInvNo}` : ''} · {c.name}</span><span className="block text-xs text-muted">Job #{byId(db.jobs, i.jobId)?.jobNo} · issued {fmtDate(i.date)} · due {fmtDate(i.due)}{late > 0 && i.paid < i.amount ? ` · ${late}d late` : ''}</span></button>
            <span className="w-28 text-right num font-semibold">{money2(i.amount - i.paid)}</span>
            <span className="w-20 hidden md:block"><Badge tone={ag === 'Paid' ? 'ok' : ag === 'Current' ? 'neutral' : ag === '1–30' ? 'info' : ag === '31–60' ? 'warn' : 'bad'}>{ag}</Badge></span>
            {tab === 'open' && <select className="input w-44 h-9 py-1 text-sm hidden lg:block" value={i.collections} onChange={e => actions.setCollections(i.id, e.target.value as T.Invoice['collections'])}>{['Current', 'Reminder Sent', 'Call Scheduled', 'Collections'].map(s => <option key={s}>{s}</option>)}</select>}
            {tab === 'open' && <CallButton phone={c.phone} label="Call" size="sm" />}
          </div>) })}{!list.length && <Empty title="Nothing here" />}</div>
      )}
      {preview && <InvoicePreview jobId={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
