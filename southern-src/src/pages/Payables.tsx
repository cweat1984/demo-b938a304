import Linkify from '../components/Linkify'
import { useKeep } from '../lib/keep'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Check, X, Sparkles } from 'lucide-react'
import JobPicker from '../components/JobPicker'
import type * as T from '../data/types'
import { useStore, actions, BILL_MAX } from '../data/store'
import { byId, customerOf, COST_CATS, inScope, suggestJob } from '../data/logic'
import { fmtDate, money, money2, today, addDays, uid } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Modal, Field, Empty, confirmChoice } from '../components/ui'
import { ThreeWayBadge, Tip } from '../components/inv/Purchasing'
import { threeWay } from '../data/invcore'
import { parseNum, typing } from '../lib/num'

export default function Payables() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const [tab, setTab] = useKeep<T.VendorBill['status']>('payables:tab', 'Needs Coding')
  const [add, setAdd] = useState(false)
  const bills = useMemo(() => db.bills.filter(b => f.branchId === 'all' || b.branchId === f.branchId), [db.bills, f])
  const total = (b: T.VendorBill) => b.lines.reduce((s, l) => s + l.amount, 0)
  const jobs = db.jobs.filter(j => inScope(j, f) && j.stage !== 'Quote' && j.stage !== 'Paid').sort((a, b) => b.jobNo.localeCompare(a.jobNo))
  const list = bills.filter(b => b.status === tab)
  const sugg = list.flatMap(b => b.poId ? [] : b.lines.filter(l => !l.jobId).map(l => ({ b, l, s: suggestJob(db, b, l) }))).filter(x => x.s)
  const unpaid = bills.filter(b => b.status !== 'Paid' && b.status !== 'Rejected').reduce((s, b) => s + total(b) - (b.payments ?? []).reduce((a, q) => a + q.amount, 0), 0)
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow="Accounts payable" title="Vendor bills" sub={`${money(unpaid, true)} unpaid · every line is coded to a job number so it lands in job costing`} actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setAdd(true)}>Enter bill</Button>} />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={(['Needs Coding', 'Pending Approval', 'Approved', 'Paid', 'Rejected'] as const).map(s => ({ value: s, label: s, count: bills.filter(b => b.status === s).length }))} />
      {bills.some(b => b.poId) && <Tip id="ap-3way" className="mb-4">Bills with a <b>3-way</b> badge came from a purchase order. The app checks PO (ordered) vs receipt (what showed up in good shape) vs invoice (what they billed). <b>Hold</b> means they billed for something we didn’t get — ask for a credit before paying.</Tip>}
      {sugg.length > 0 && <div className="mb-4 flex items-center gap-3 rounded-2xl bg-accent/10 border border-accent/30 px-4 py-3"><Sparkles className="size-5 text-accent" /><div className="flex-1 text-sm"><b>{sugg.length} line{sugg.length === 1 ? '' : 's'}</b> matched to a job from the site, city or customer in the text.</div><Button variant="primary" size="sm" data-testid="accept-all" onClick={() => { sugg.forEach(x => actions.codeBillLine(x.b.id, x.l.id, x.s!.job.id, x.l.category)); toast.success(`${sugg.length} lines coded`, { description: 'Posted to job costing' }) }}>Accept all suggestions</Button></div>}
      <div className="flex flex-col gap-3">{list.map(b => { const v = byId(db.vendors, b.vendorId)!; return (
        <div key={b.id} className="card p-0">
          <div className="flex items-center gap-4 px-5 py-3 border-b hairline">
            <button onClick={() => open({ type: 'bill', id: b.id })} className="flex-1 min-w-0 text-left"><span className="block font-semibold">{v.name} · {b.billNo}</span><span className="block text-xs text-muted">{v.category} · {fmtDate(b.date)} · due {fmtDate(b.due)} · {byId(db.branches, b.branchId)?.code}{b.poId ? ` · ${byId(db.pos, b.poId)?.poNo ?? 'PO'}` : ''}</span></button>
            {b.poId && <span data-testid="bill-3way"><ThreeWayBadge m={threeWay(db, b)} /></span>}
            <span className="num font-semibold">{money(total(b))}</span>
            {b.status === 'Pending Approval' && <><Button size="sm" variant="ok" icon={<Check className="size-4" />} onClick={async () => { const m = b.poId ? threeWay(db, b) : null; if (m && !m.ok) { const c = await confirmChoice(`Hold — 3-way match failed on ${m.po.poNo}`, m.lines.filter(l => !l.ok).map(l => `${l.item?.name}: ${l.issues[0]}`).join(' · '), [{ label: 'Keep on hold', value: false }, { label: 'Approve anyway', value: true, tone: 'danger' }]); if (!c?.value) return } const r = actions.setBillStatus(b.id, 'Approved'); r.ok ? toast.success('Approved — posted to job cost') : toast.error(r.reason) }}>Approve</Button><Button size="sm" variant="ghost" icon={<X className="size-4" />} onClick={() => actions.setBillStatus(b.id, 'Rejected')}>Reject</Button></>}
            {b.status === 'Approved' && <Button size="sm" data-testid="bill-pay" onClick={() => open({ type: 'bill', id: b.id })}>{b.payments?.length ? 'Pay rest…' : 'Pay…'}</Button>}
          </div>
          {b.lines.map(l => (
            <div key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-b hairline last:border-0 text-sm">
              <Linkify text={l.description} className="flex-1 min-w-[180px]" />
              <span className="w-24 num text-right">{money(l.amount)}</span>
              {b.poId ? <span className="text-muted text-xs">Shop stock · PO receipt (no job code needed)</span> : b.status === 'Needs Coding' || b.status === 'Pending Approval' ? <>
                {(() => { const sg = !l.jobId ? suggestJob(db, b, l) : null; return sg ? <button className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-accent/12 text-accent text-xs font-semibold hover:bg-accent/20" title={`Suggested because the line ${sg.why}`} data-testid="accept-suggest" onClick={() => { actions.codeBillLine(b.id, l.id, sg.job.id, l.category); toast.success(`Coded to #${sg.job.jobNo}`, { description: `Line ${sg.why} · hits job costing now` }) }}><Sparkles className="size-3.5" />#{sg.job.jobNo}?</button> : null })()}
                <JobPicker className="w-56" value={l.jobId} jobs={jobs} onPick={id => { actions.codeBillLine(b.id, l.id, id, l.category); toast.success(`Coded to #${byId(db.jobs, id)?.jobNo}`, { description: 'Hits job costing now' }) }} />
                <select className="input w-44 h-9 py-1 text-sm disabled:opacity-60" disabled={!l.jobId} title={l.jobId ? undefined : 'Pick a job first'} value={l.category} onChange={e => l.jobId && actions.codeBillLine(b.id, l.id, l.jobId, e.target.value as T.CostCategory)}>{COST_CATS.map(c => <option key={c}>{c}</option>)}</select>
              </> : <span className="text-muted">{l.jobId ? `#${byId(db.jobs, l.jobId)?.jobNo} · ${l.category}` : '—'}</span>}
            </div>))}
        </div>) })}{!list.length && <Empty title="Nothing in this stage" />}</div>
      <AddBill open={add} onClose={() => setAdd(false)} />
    </div>
  )
}

function AddBill({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [vendor, setVendor] = useState(db.vendors[0].id), [no, setNo] = useState('')
  const v = byId(db.vendors, vendor)!
  // dive3 M10: real bill date + due date, several lines (each its own category / job), "$1,250.00" accepted
  type L = { id: string; desc: string; cat: T.CostCategory; amt: string; job: string }
  const blank = (c: T.CostCategory): L => ({ id: uid('bl'), desc: '', cat: c, amt: '', job: '' })
  const [lines, setLines] = useState<L[]>(() => [blank(db.vendors[0].category)])
  const [date, setDate] = useState(today()), [due, setDue] = useState(''), dueV = due || addDays(date || today(), v.terms)
  const fBr = useStore(s => s.ui.filter.branchId), me = useStore(s => s.session?.employeeId)
  const [branch, setBranch] = useState(() => (fBr && fBr !== 'all' ? fBr : byId(db.employees, me ?? '')?.branchId) ?? db.branches.find(b => b.hq)?.id ?? 'br-okc')
  const parsed = lines.map(l => parseNum(l.amt, { cents: true, max: BILL_MAX, min: 0.01, label: 'Amount' }))
  const total = parsed.reduce((t, p) => t + (p.ok ? p.n : 0), 0)
  const err = !no.trim() ? 'Bill # is required' : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? 'Pick the bill date' : dueV < date ? 'Due date is before the bill date' : parsed.find(p => !p.ok && !p.empty) ? (parsed.find(p => !p.ok) as { msg: string }).msg : parsed.some(p => !p.ok) ? 'Enter an amount on every line' : total > BILL_MAX ? `Total over ${money(BILL_MAX)} — check the number` : ''
  const set = (i: number, x: Partial<L>) => setLines(ls => ls.map((l, k) => k === i ? { ...l, ...x } : l))
  const jobs = db.jobs.filter(j => j.stage === 'In Progress' || j.stage === 'Complete')
  return (
    <Modal open={open} onClose={onClose} title="Enter vendor bill" sub="Duplicate bill numbers are blocked. Bills over $5,000 need a second person to approve.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Field label="Vendor"><select className="input" value={vendor} onChange={e => { const nv = byId(db.vendors, e.target.value)!; setVendor(nv.id); setLines(ls => ls.map(l => l.amt || l.desc ? l : { ...l, cat: nv.category })) }}>{db.vendors.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field><Field label="Bill #"><input className="input" data-testid="bill-no" value={no} onChange={e => setNo(e.target.value)} /></Field></div>
        <div className="grid grid-cols-3 gap-3"><Field label="Bill date"><input type="date" className="input" data-testid="bill-date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label={`Due (${v.terms} days)`}><input type="date" className="input" data-testid="bill-due" value={dueV} onChange={e => setDue(e.target.value)} /></Field><Field label="Branch"><select className="input" data-testid="bill-branch" value={branch} onChange={e => setBranch(e.target.value)}>{db.branches.map(b => <option key={b.id} value={b.id}>{b.code}</option>)}</select></Field></div>
        <div className="flex flex-col gap-2" data-testid="bill-lines">
          {lines.map((l, i) => <div key={l.id} className="card-flat p-2 grid grid-cols-2 sm:grid-cols-[2fr_1.3fr_1fr_1fr_auto] gap-2 items-end" data-testid="bill-line">
            <Field label="Description" className="col-span-2 sm:col-span-1"><input className="input" value={l.desc} onChange={e => set(i, { desc: e.target.value })} placeholder="Pilot car escort, 2 days" data-testid="bill-line-desc" /></Field>
            <Field label="Category"><select className="input" value={l.cat} data-testid="bill-line-cat" onChange={e => set(i, { cat: e.target.value as T.CostCategory })}>{COST_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Amount" hint={l.amt !== '' && !parsed[i].ok ? <span className="text-bad" data-testid="bill-amt-err">{(parsed[i] as { msg: string }).msg}</span> : undefined}><input className="input" inputMode="decimal" data-testid={i === 0 ? 'bill-amount' : 'bill-line-amt'} value={l.amt} onChange={e => set(i, { amt: typing(e.target.value, true) })} placeholder="$0.00" /></Field>
            <Field label="Job"><select className="input" value={l.job} data-testid="bill-line-job" onChange={e => { set(i, { job: e.target.value }); const jb = byId(db.jobs, e.target.value); if (jb) setBranch(jb.branchId) }}><option value="">Code later</option>{jobs.map(j => <option key={j.id} value={j.id}>#{j.jobNo}</option>)}</select></Field>
            {lines.length > 1 ? <Button size="sm" variant="ghost" aria-label="Remove line" data-testid="bill-line-del" onClick={() => setLines(ls => ls.filter((_, k) => k !== i))}><X className="size-4" /></Button> : <span />}
          </div>)}
          <div className="flex items-center justify-between"><Button size="sm" variant="ghost" icon={<Plus className="size-4" />} data-testid="bill-add-line" onClick={() => setLines(ls => ls.length >= 30 ? ls : [...ls, blank(v.category)])}>Split / add line</Button><span className="text-sm">Total <b className="num" data-testid="bill-total">{money2(total)}</b></span></div>
        </div>
        {err && no.trim() && <div className="text-xs text-bad" data-testid="bill-err">{err}</div>}
        <Button variant="primary" size="lg" disabled={!!err} data-testid="bill-save" onClick={() => { const r = actions.addBill({ vendorId: vendor, billNo: no.trim(), date, due: dueV, lines: lines.map((l, i) => ({ id: l.id, jobId: l.job || undefined, category: l.cat, description: l.desc.trim() || l.cat, amount: (parsed[i] as { n: number }).n })), status: lines.every(l => l.job) ? 'Pending Approval' : 'Needs Coding', branchId: branch }); if (!r.ok) toast.error(r.reason); else { toast.success(`Bill entered · ${money2(total)}`); setNo(''); setLines([blank(v.category)]); setDue(''); onClose() } }}>Save bill</Button>
      </div>
    </Modal>
  )
}
