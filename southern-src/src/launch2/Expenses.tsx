import { moneyHidden, today as chiToday } from '../lib/util'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Camera, Upload, CreditCard, Car, BedDouble, Sparkles, Check, X, Send, Mail, Loader2, ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Modal, Segmented } from '../components/ui'
import { TextReceipt, Exceptions, ByJob } from '../gapb/ZeroReport'
import { useG } from '../gapb/gstore'
import { useStore } from '../data/store'
import { cn } from '../lib/util'
import { useL2, autoMatch, DEMO_OCR, JOB_MASTER, type Expense } from './l2store'

const money = (n: number) => moneyHidden() ? '—' : `$${n.toFixed(2)}`
const tone = { Draft: 'neutral', Submitted: 'info', Approved: 'ok', Rejected: 'bad', 'In QuickBooks': 'accent' } as const
const today = () => chiToday()
export default function Expenses() {
  const exps = useL2(s => s.expenses), { addExpense, patchExpense } = useL2.getState()
  const role = useStore(s => s.session?.role)
  const who = useStore(s => s.session?.name) ?? 'Chad Weathers'
  const mgr = role === 'owner' || role === 'accounting' || role === 'ops' || role === 'branch'
  const [scan, setScan] = useState<{ img?: string; phase: 'read' | 'done'; ocr?: typeof DEMO_OCR[number] } | null>(null)
  const [why, setWhy] = useState<Expense | null>(null)
  const [edit, setEdit] = useState<{ merchant?: string; date?: string; amount?: string }>({}) // field fixes (N-M12): the read can be corrected
  const fileRef = useRef<HTMLInputElement>(null)
  // Auto-match anything unmatched (card feed rows included) on open — every match explains itself.
  useEffect(() => { const all = useL2.getState().expenses; all.filter(e => !e.rule && e.source !== 'perdiem' && e.source !== 'mileage').forEach(e => patchExpense(e.id, autoMatch(e, all))) }, [patchExpense])
  const onFile = (f?: File) => { if (!f) return; setEdit({}); const fr = new FileReader(); fr.onload = () => { setScan({ img: fr.result as string, phase: 'read' }); setTimeout(() => setScan(s => s && { ...s, phase: 'done', ocr: DEMO_OCR[Math.floor(Math.random() * DEMO_OCR.length)] }), 1400) }; fr.readAsDataURL(f) }
  const draft = exps.filter(e => e.status === 'Draft'), pending = exps.filter(e => e.status === 'Submitted')
  // ready = matched to a job AND has a receipt when it's $75 or more (company rule shown under Exceptions)
  const needsReceipt = (e: (typeof exps)[number]) => e.amount >= 75 && !e.image && e.source === 'card'
  const ready = draft.filter(e => e.jobNo && !needsReceipt(e)), held = draft.filter(e => needsReceipt(e))
  const allDone = exps.length > 0 && exps.every(e => e.status === 'Approved' || e.status === 'In QuickBooks')
  const rate = useG(s => s.perDiemRate)
  const [view, setView] = useState<'exceptions' | 'byjob' | 'all'>('exceptions')
  return <div className="flex flex-col gap-6" data-testid="expenses">
    <PageHeader eyebrow="Money" title="Expenses" sub="One photo. We read it, match the job and route it." actions={<><Button icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()} data-testid="exp-upload">Upload receipt</Button><label className="h-10 px-4 rounded-xl text-sm bg-accent text-accent-ink font-semibold inline-flex items-center gap-2 cursor-pointer"><Camera className="size-4" />Snap receipt<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => onFile(e.target.files?.[0])} /></label><input ref={fileRef} data-testid="exp-file" type="file" accept="image/*,application/pdf" className="hidden" onChange={e => onFile(e.target.files?.[0])} /></>} />
    <Card className={cn('flex items-center gap-4', allDone ? 'bg-ok/10' : 'bg-gradient-to-r from-accent/10 to-transparent')}><Sparkles className="size-6 text-accent" /><div className="flex-1"><div className="text-lg font-semibold" data-testid="exp-hero">{allDone ? `All ${exps.length} charges are matched and approved. You owe nothing.` : `${exps.filter(e => e.jobNo).length} of ${exps.length} charges auto-matched to a job · ${ready.length} ready to submit${held.length ? ` · ${held.length} need a receipt first` : ''}`}</div><div className="text-xs text-muted">Receipts can also be forwarded to receipts@slh-demo.example</div></div>
      <Button variant="primary" icon={<Send className="size-4" />} disabled={!ready.length} data-testid="exp-submit" onClick={() => { ready.forEach(e => patchExpense(e.id, { status: 'Submitted' })); toast.success(`${ready.length} expense${ready.length === 1 ? '' : 's'} sent to your manager`, held.length ? { description: `${held.length} held back until you add the receipt (≥ $75)` } : undefined) }}>Submit {ready.length || ''}</Button></Card>
    <Segmented value={view} onChange={setView} options={[{ value: 'exceptions', label: 'Exceptions' }, { value: 'byjob', label: 'Filed by job' }, { value: 'all', label: 'Everything' }]} />
    {view === 'exceptions' && <div className="grid lg:grid-cols-[1fr_400px] gap-4 items-start"><Exceptions onWhy={setWhy} /><TextReceipt /></div>}
    {view === 'byjob' && <ByJob />}
    {view === 'all' && <>
    <div className="grid md:grid-cols-3 gap-3">
      <Card><div className="label flex items-center gap-1.5"><BedDouble className="size-3.5" />Per diem (from dispatch)</div><div className="text-sm mt-2 flex items-center gap-1.5 flex-wrap">3 nights · Sweetwater · company flat rate $<input data-testid="perdiem-rate" type="number" min={0} value={rate} onChange={e => useG.getState().setRate(Math.max(0, Number(e.target.value)))} className="w-16 h-7 rounded-lg bg-surface-2 px-2 text-sm" />/day</div><Button size="sm" className="mt-3" data-testid="exp-perdiem" onClick={() => { addExpense({ source: 'perdiem', merchant: `Per diem — flat $${rate}/day (3 days)`, date: today(), amount: rate * 3, category: 'Per diem', who, status: 'Draft', jobNo: '10125', rule: 'Dispatch', why: `Calculated from dispatch: on 10125 for 3 nights × Southern’s set per diem rate $${rate}/day (not GSA).`, confidence: 100 }); toast('Per diem added') }}>Add per diem</Button></Card>
      <Card><div className="label flex items-center gap-1.5"><Car className="size-3.5" />Mileage (personal vehicle)</div><div className="text-sm mt-2">OKC yard → Weatherford · 72 mi × $0.70 (IRS)</div><Button size="sm" className="mt-3" data-testid="exp-mileage" onClick={() => { addExpense({ source: 'mileage', merchant: 'Mileage — OKC yard → Weatherford', date: today(), amount: 50.4, miles: 72, category: 'Mileage', who, status: 'Draft', jobNo: '10072', rule: 'Dispatch', why: 'Trip from yard to the 10072 site per dispatch; rate is IRS 2026.', confidence: 100 }); toast('Mileage added') }}>Add mileage</Button></Card>
      <Card><div className="label flex items-center gap-1.5"><Mail className="size-3.5" />Job master · Rule 0</div><div className="text-xs text-muted mt-1">Read from Cade Alexander’s job emails (cade.alexander@…)</div>{JOB_MASTER.map(j => <div key={j.jobNo} className="text-xs mt-1.5 flex justify-between gap-2"><b>{j.jobNo}</b><span className="text-muted truncate">{j.name}</span></div>)}</Card>
    </div>
    <Card pad={false}>
      <div className="px-5 py-3 border-b hairline flex items-center gap-2 font-semibold"><CreditCard className="size-4" />Card feed & receipts <span className="text-xs text-muted font-normal ml-auto">Live from Amex ••4417, ••9921 (simulated)</span></div>
      <div className="divide-y hairline">{exps.map(e => <div key={e.id} className="px-5 py-3 flex items-center gap-3 flex-wrap" data-testid="exp-row">
        <div className="size-9 rounded-xl bg-surface-2 grid place-items-center shrink-0">{e.source === 'card' ? <CreditCard className="size-4" /> : e.source === 'mileage' ? <Car className="size-4" /> : e.source === 'perdiem' ? <BedDouble className="size-4" /> : e.image ? <img src={e.image} className="size-9 rounded-xl object-cover" /> : <Camera className="size-4" />}</div>
        <div className="flex-1 min-w-40"><div className="font-medium text-sm">{e.merchant}</div><div className="text-xs text-muted">{e.date} · {e.category}{e.last4 ? ` · ••${e.last4}` : ''}{e.source === 'card' && !e.image ? ' · receipt needed' : ''}</div></div>
        <button onClick={() => setWhy(e)} data-testid="exp-why" className={cn('text-xs rounded-full px-2.5 py-1 pointer-coarse:min-h-10 pointer-coarse:inline-flex pointer-coarse:items-center font-semibold', e.jobNo ? 'bg-accent/15 text-accent' : 'bg-warn/15 text-warn')}>{e.jobNo ? `Job ${e.jobNo} · ${e.rule}` : 'Pick job'}</button>
        <div className="w-20 text-right font-semibold tabular-nums">{money(e.amount)}</div>
        <Badge tone={tone[e.status]}>{e.status}</Badge>
        {mgr && e.status === 'Submitted' && <><Button size="sm" variant="ok" data-testid="exp-approve" onClick={() => { patchExpense(e.id, { status: 'Approved' }); toast.success('Approved') }}><Check className="size-3.5" /></Button><Button size="sm" onClick={() => patchExpense(e.id, { status: 'Rejected' })}><X className="size-3.5" /></Button></>}
      </div>)}</div>
    </Card>
    {mgr && <Card className="flex items-center gap-4"><div className="flex-1"><div className="font-semibold">Manager approval & QuickBooks</div><div className="text-sm text-muted">{pending.length} waiting for you · {exps.filter(e => e.status === 'Approved').length} approved, ready to push with GL + job codes</div></div>
      <Button disabled={!pending.length} data-testid="exp-approve-all" onClick={() => { pending.forEach(e => patchExpense(e.id, { status: 'Approved' })); toast.success(`Approved ${pending.length}`) }}>Approve all</Button>
      <Button variant="primary" icon={<ArrowUpRight className="size-4" />} data-testid="exp-qb" disabled={!exps.some(e => e.status === 'Approved')} onClick={() => { const a = exps.filter(e => e.status === 'Approved'); a.forEach((e, i) => patchExpense(e.id, { status: 'In QuickBooks', qbId: `QB-${8800 + i}` })); toast.success(`Pushed ${a.length} to QuickBooks (simulated)`, { description: 'Posted to job cost with GL 6400 Travel / 6420 Permits / 6100 Fuel.' }) }}>Push to QuickBooks</Button></Card>}
    </>}
    <AnimatePresence>{scan && <Modal open onClose={() => setScan(null)} title="Reading your receipt" width={480}>
      <div className="flex gap-4" data-testid="exp-scan">{scan.img && <img src={scan.img} className="w-32 h-44 object-cover rounded-xl" />}
        <div className="flex-1">{scan.phase === 'read' ? <div className="flex items-center gap-2 text-muted h-full"><Loader2 className="size-4 animate-spin" />Reading merchant, date, amount…</div> : scan.ocr && (() => { const m = autoMatch({ ...scan.ocr, date: JOB_MASTER[0].date }, exps); return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-2 text-sm">
          <label><span className="label">Merchant</span><input className="input mt-1" value={edit.merchant ?? scan.ocr.merchant} onChange={e => setEdit({ ...edit, merchant: e.target.value })} data-testid="exp-scan-merchant" /></label><div className="grid grid-cols-2 gap-2"><label><span className="label">Date</span><input type="date" className="input mt-1" max={today()} value={edit.date ?? JOB_MASTER[0].date} onChange={e => setEdit({ ...edit, date: e.target.value })} data-testid="exp-scan-date" /></label><label><span className="label">Amount $</span><input className="input mt-1" inputMode="decimal" value={edit.amount ?? String(scan.ocr.amount)} onChange={e => setEdit({ ...edit, amount: e.target.value })} data-testid="exp-scan-amount" /></label></div>
          <div className="rounded-xl bg-accent/10 p-3 text-xs"><b>{m.jobNo ? `Job ${m.jobNo}` : 'Needs a job'}</b> · {m.confidence}%<div className="text-muted mt-1">{m.why}</div></div>
          {(() => { const a = Number(edit.amount ?? scan.ocr!.amount), d = edit.date ?? JOB_MASTER[0].date, mer = (edit.merchant ?? scan.ocr!.merchant).trim(); const bad = !mer ? 'Enter the merchant' : !Number.isFinite(a) || a <= 0 ? 'Amount must be more than $0' : a > 10000 ? 'Over $10,000 — check the amount' : !d || d > today() ? 'Date can’t be in the future' : ''; return <>{bad && <div className="text-xs text-bad" data-testid="exp-scan-err">{bad}</div>}
          <Button variant="primary" data-testid="exp-scan-save" disabled={!!bad} onClick={() => { addExpense({ source: 'receipt', ...scan.ocr!, merchant: mer, amount: Math.round(a * 100) / 100, date: d, who, status: 'Draft', image: scan.img, ...m }); setScan(null); toast.success('Receipt added and coded') }}>{Object.keys(edit).length ? 'Save receipt' : 'Looks right — add'}</Button>
          <Button variant="ghost" data-testid="exp-scan-retake" onClick={() => { setScan(null); fileRef.current?.click() }}>Not right — retake</Button></> })()}</motion.div> })()}</div></div>
    </Modal>}</AnimatePresence>
    {why && <Modal open onClose={() => setWhy(null)} title={why.jobNo ? `Job ${why.jobNo}` : 'Pick a job'} sub={`${why.merchant} · ${money(why.amount)}`}>
      <div className="text-sm" data-testid="exp-explain"><div className="rounded-xl bg-surface-2 p-4">{why.why}</div><div className="text-xs text-muted mt-2">Confidence {why.confidence}% · rules editable in Settings → Expense matching</div>
        <div className="label mt-4 mb-2">Change job</div><div className="flex flex-wrap gap-2">{JOB_MASTER.map(j => <Button key={j.jobNo} size="sm" variant={why.jobNo === j.jobNo ? 'primary' : 'secondary'} onClick={() => { patchExpense(why.id, { jobNo: j.jobNo, rule: 'Manual', why: `Picked by ${who}: ${j.name}.`, confidence: 100 }); setWhy(null) }}>{j.jobNo}</Button>)}</div></div>
    </Modal>}
  </div>
}
