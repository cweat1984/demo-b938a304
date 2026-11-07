import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquareText, Mail, Send, Camera, CheckCircle2, AlertTriangle, FolderCheck, Inbox } from 'lucide-react'
import { Card, Badge, Button } from '../components/ui'
import { useStore } from '../data/store'
import { cn, chiDate } from '../lib/util'
import { useL2, autoMatch, type Expense } from '../launch2/l2store'
import { useG, INBOUND } from './gstore'

const DEMOS = [
  { label: 'Fuel — Love’s (auto-match)', merchant: 'Love’s Travel Stop #612', category: 'Fuel', amount: 214.87, ambiguous: false },
  { label: 'Hotel — Hampton Inn (needs a job)', merchant: 'Hampton Inn Ardmore', category: 'Lodging', amount: 139.0, ambiguous: true },
  { label: 'Uber (Liftra move)', merchant: 'Uber', category: 'Rideshare', amount: 27.65, ambiguous: false },
]
const tinyPng = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160"><rect width="120" height="160" fill="#f4f4f5"/><rect x="14" y="16" width="70" height="8" fill="#999"/><rect x="14" y="34" width="92" height="5" fill="#ccc"/><rect x="14" y="46" width="80" height="5" fill="#ccc"/><rect x="14" y="58" width="88" height="5" fill="#ccc"/><rect x="14" y="120" width="50" height="10" fill="#555"/></svg>')

/** Text or email a receipt; the app reads it, matches it, and asks one question by text when it must. */
export function TextReceipt() {
  const who = useStore(s => s.session?.name) ?? 'Chad Weathers'
  const { bubbles, pending } = useG()
  const [ch, setCh] = useState<'sms' | 'email'>('sms'), [reply, setReply] = useState('')
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [bubbles.length])
  const g = useG.getState(), l2 = useL2.getState()
  const send = (d: typeof DEMOS[number], photo = tinyPng) => {
    g.say({ from: 'me', text: ch === 'email' ? `Fwd: Receipt — ${d.merchant}` : '', photo, channel: ch })
    setTimeout(() => {
      const date = chiDate()
      const m = d.ambiguous ? { rule: 'Rule 5', why: 'Rule 5: two jobs fit (dispatch + location) — asked by text.', confidence: 55 } : autoMatch({ merchant: d.merchant, date: new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), category: d.category }, l2.expenses)
      const job = 'jobNo' in m ? (m as { jobNo?: string }).jobNo : undefined
      const id = 'ex-t' + Math.random().toString(36).slice(2, 6)
      useL2.setState(s => ({ expenses: [{ id, source: 'receipt', merchant: d.merchant, date, amount: d.amount, category: d.category, who, status: job ? 'Submitted' : 'Draft', image: photo, jobNo: job, rule: m.rule, why: m.why + ` · via ${ch === 'sms' ? 'text' : 'email'}`, confidence: m.confidence }, ...s.expenses] }))
      if (job) g.say({ from: 'app', text: `Got it ✓ ${d.merchant} $${d.amount.toFixed(2)} → Job ${job} (${m.rule}). Filed — nothing else to do.`, channel: ch })
      else { g.setPending({ expenseId: id, options: ['10125', '10158'] }); g.say({ from: 'app', text: `Got it: ${d.merchant} $${d.amount.toFixed(2)}. Which job? 1) 10125 Sooner Ridge Wind  2) 10158 Ardmore Refinery — reply 1 or 2`, channel: ch }) }
    }, 700)
  }
  const doReply = () => {
    const r = reply.trim(); if (!r) return; g.say({ from: 'me', text: r, channel: ch }); setReply('')
    setTimeout(() => {
      const p = useG.getState().pending
      if (!p) { g.say({ from: 'app', text: 'Thanks! Send a photo of a receipt any time.', channel: ch }); return }
      const pick = p.options[Number(r) - 1] ?? p.options.find(o => r.includes(o))
      if (!pick) { g.say({ from: 'app', text: `Reply 1 or 2 (or the job number).`, channel: ch }); return }
      useL2.getState().patchExpense(p.expenseId, { jobNo: pick, rule: 'Reply', why: `Employee replied “${r}” by ${ch === 'sms' ? 'text' : 'email'} → Job ${pick}.`, confidence: 100, status: 'Submitted' })
      g.setPending(null); g.say({ from: 'app', text: `Fixed ✓ → Job ${pick}. Filed — no report needed.`, channel: ch })
    }, 500)
  }
  return <Card data-testid="text-receipt"><div className="flex items-center gap-2 mb-3"><MessageSquareText className="size-4" /><div className="font-semibold flex-1">Text or email a receipt</div>
    <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs">{(['sms', 'email'] as const).map(c => <button key={c} data-testid={`tr-ch-${c}`} onClick={() => setCh(c)} className={cn('px-2.5 h-7 pointer-coarse:h-10 pointer-coarse:px-3.5 rounded-md', ch === c && 'bg-surface font-semibold shadow')}>{c === 'sms' ? 'Text' : 'Email'}</button>)}</div></div>
    <div className="text-xs text-muted">{ch === 'sms' ? <>Text a photo to <b className="text-ink">{INBOUND.sms}</b></> : <>Forward to <b className="text-ink">{INBOUND.email}</b></>} — simulated inbound</div>
    <div className="mt-3 rounded-2xl bg-[#0b0b0d] p-3 h-72 overflow-auto flex flex-col gap-2" data-testid="tr-thread">{bubbles.length === 0 && <div className="text-center text-xs text-white/40 mt-24">Send a demo receipt below</div>}
      {bubbles.map(b => <div key={b.id} className={cn('max-w-[78%] rounded-2xl px-3 py-2 text-[13px] leading-snug', b.from === 'me' ? 'self-end bg-[#0a84ff] text-white rounded-br-md' : 'self-start bg-[#26262a] text-white rounded-bl-md')} data-testid={b.from === 'app' ? 'tr-app' : 'tr-me'}>{b.channel === 'email' && <div className="text-[10px] opacity-60 flex items-center gap-1"><Mail className="size-3" />email</div>}{b.photo && <img src={b.photo} className="h-24 rounded-lg mb-1" />}{b.text}</div>)}<div ref={end} /></div>
    <div className="flex flex-wrap gap-1.5 mt-3">{DEMOS.map(d => <button key={d.label} data-testid="tr-demo" onClick={() => send(d)} className="rounded-full bg-surface-2 px-3 py-1.5 text-xs flex items-center gap-1"><Camera className="size-3" />{d.label}</button>)}
      <label className="rounded-full bg-surface-2 px-3 py-1.5 text-xs flex items-center gap-1 cursor-pointer"><Camera className="size-3" />Your photo<input data-testid="tr-file" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => send(DEMOS[0], r.result as string); r.readAsDataURL(f) } }} /></label></div>
    <div className="flex gap-2 mt-2"><input data-testid="tr-reply" value={reply} onChange={e => setReply(e.target.value)} onKeyDown={e => e.key === 'Enter' && doReply()} placeholder={pending ? 'Reply 1 or 2' : 'Reply…'} className="flex-1 h-10 rounded-xl bg-surface-2 px-3 text-sm outline-none" /><Button icon={<Send className="size-4" />} onClick={doReply} data-testid="tr-send">Reply</Button></div>
  </Card>
}

const RECEIPT_MIN = 75
export const exceptionOf = (e: Expense): string | null => !e.jobNo ? 'No job — pick one' : e.status === 'Rejected' ? 'Rejected by manager' : e.source === 'card' && !e.image && e.amount >= RECEIPT_MIN ? `Receipt needed (≥ $${RECEIPT_MIN})` : /alcohol|liquor|bar\b/i.test(e.merchant) ? 'Policy: alcohol' : null
const period = (d: string) => new Date(d + 'T12:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

/** Zero-report expenses: only exceptions need a person; everything else is filed by job and period automatically. */
export function Exceptions({ onWhy }: { onWhy: (e: Expense) => void }) {
  const exps = useL2(s => s.expenses)
  const ex = exps.map(e => ({ e, why: exceptionOf(e) })).filter(x => x.why)
  return <Card pad={false} data-testid="exp-exceptions"><div className="px-5 py-3 border-b hairline flex items-center gap-2"><AlertTriangle className="size-4 text-warn" /><span className="font-semibold flex-1">Exceptions</span><Badge tone={ex.length ? 'warn' : 'ok'}>{ex.length ? `${ex.length} need you` : 'All clear'}</Badge></div>
    {ex.length ? <div className="divide-y hairline">{ex.map(({ e, why }) => <div key={e.id} className="px-5 py-3 flex items-center gap-3 text-sm" data-testid="exc-row"><div className="flex-1"><div className="font-medium">{e.merchant} · ${e.amount.toFixed(2)}</div><div className="text-xs text-warn">{why}</div></div>
      {!e.jobNo ? <Button size="sm" onClick={() => onWhy(e)} data-testid="exc-fix">Pick job</Button> : why?.startsWith('Receipt') ? <label className="h-8 px-3 rounded-lg bg-surface-2 text-[13px] inline-flex items-center gap-1.5 cursor-pointer"><Camera className="size-3.5" />Add receipt<input type="file" accept="image/*" className="hidden" onChange={e2 => { const f = e2.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => useL2.getState().patchExpense(e.id, { image: r.result as string }); r.readAsDataURL(f) } }} /></label> : null}</div>)}</div>
      : <div className="px-5 py-10 text-center"><CheckCircle2 className="size-8 text-ok mx-auto" /><div className="font-semibold mt-2">Nothing needs you.</div><div className="text-sm text-muted">Every charge is matched, coded and filed.</div></div>}
    <div className="px-5 py-2.5 border-t hairline text-xs text-muted flex items-center gap-1.5"><Inbox className="size-3.5" />No expense reports. Card charges under ${RECEIPT_MIN} don’t need a receipt.</div></Card>
}
export function ByJob() {
  const exps = useL2(s => s.expenses)
  const groups = useMemo(() => { const m = new Map<string, Expense[]>(); exps.filter(e => e.jobNo).forEach(e => { const k = `${e.jobNo}|${period(e.date)}`; m.set(k, [...(m.get(k) ?? []), e]) }); return [...m].sort((a, b) => b[1].length - a[1].length) }, [exps])
  return <div className="grid md:grid-cols-2 gap-3" data-testid="exp-byjob">{groups.map(([k, es]) => { const [job, per] = k.split('|'); const tot = es.reduce((a, e) => a + e.amount, 0); const done = es.every(e => e.status === 'Approved' || e.status === 'In QuickBooks')
    return <Card key={k} data-testid="job-group"><div className="flex items-center gap-2"><FolderCheck className={cn('size-4', done ? 'text-ok' : 'text-accent')} /><b>Job {job}</b><span className="text-xs text-muted">{per}</span><span className="ml-auto font-semibold">${tot.toFixed(2)}</span></div>
      <div className="text-xs text-muted mt-1">{es.length} item(s) · {done ? 'Approved — posted to job cost' : 'Filed automatically · approval in progress'}</div>
      <div className="mt-2 flex flex-col gap-1">{es.slice(0, 5).map(e => <div key={e.id} className="text-xs flex justify-between"><span className="truncate">{e.merchant}</span><span className="text-muted">${e.amount.toFixed(2)} · {e.status}</span></div>)}</div></Card> })}</div>
}
