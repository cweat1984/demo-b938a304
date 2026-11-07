// Office fixes (AR "Record payment" + AP "Pay bill"): real amount / date / method / check # entry,
// partial payments, and an Undo on each posted payment.
import { useState } from 'react'
import { Button, Field } from './ui'
import { today, money, fmtDate } from '../lib/util'
import { parseNum, typing } from '../lib/num'

export type Pay = { id?: string; date: string; amount: number; method: string; ref: string }
export const PAY_METHODS = ['Check', 'ACH', 'Wire', 'Card'] as const

/** Validates a payment entry. Returns an error string or null. */
/** dive3 m5: the books are closed before the 1st of last month — payments can't be back-dated into a closed month. */
export const periodOpenFrom = () => { const t = today(); const [y, m] = t.split('-').map(Number); const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y; return `${py}-${String(pm).padStart(2, '0')}-01` }
export function payError(amount: number, open: number, method: string, ref: string, date: string, minDate?: string): string | null {
  if (!Number.isFinite(amount) || amount < 0.01) return 'Enter an amount of at least $0.01'
  if (amount > open + 0.005) return `That’s more than the ${money(open)} still open`
  if (!date || date > today()) return 'Payment date can’t be in the future'
  if (minDate && date < minDate) return `Payment date can’t be before ${fmtDate(minDate)} (the document date)`
  if (date < periodOpenFrom()) return `${fmtDate(date)} is in a closed month — payments start ${fmtDate(periodOpenFrom())}`
  if ((method === 'Check' || method === 'Wire') && !ref.trim()) return `${method} # is required`
  return null
}

export function PaymentForm({ open, verb, onPay, testid, minDate }: { open: number; verb: string; onPay: (p: Pay) => void; testid: string; minDate?: string }) {
  const [amt, setAmt] = useState(String(Math.round(open * 100) / 100))
  const [date, setDate] = useState(today())
  const [method, setMethod] = useState<string>('Check')
  const [ref, setRef] = useState('')
  const pa = parseNum(amt, { label: 'Amount', cents: true })
  const a = pa.ok ? Math.round(pa.n * 100) / 100 : NaN
  const err = !pa.ok && amt.trim() ? pa.msg : payError(a, open, method, ref, date, minDate)
  return (
    <div className="card p-4 flex flex-col gap-3" data-testid={testid}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount" hint={a > 0 && a < open ? `Partial — ${money(open - a)} stays open` : undefined}><input className="input num" inputMode="decimal" data-testid="pay-amount" value={amt} onChange={e => setAmt(typing(e.target.value, true))} /></Field>
        <Field label="Date"><input type="date" className="input" data-testid="pay-date" max={today()} min={minDate && minDate > periodOpenFrom() ? minDate : periodOpenFrom()} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Method"><select className="input" data-testid="pay-method" value={method} onChange={e => setMethod(e.target.value)}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</select></Field>
        <Field label={method === 'Check' ? 'Check #' : 'Reference / trace #'}><input className="input" data-testid="pay-ref" value={ref} onChange={e => setRef(e.target.value)} /></Field>
      </div>
      {err && amt !== '' && <div className="text-xs text-bad" data-testid="pay-error">{err}</div>}
      <Button variant="ok" disabled={!!err} data-testid="pay-submit" onClick={() => { onPay({ date, amount: Math.round(a * 100) / 100, method, ref: ref.trim() }); setRef('') }}>{verb} {a > 0 ? money(a) : ''}</Button>
    </div>
  )
}

export function PaymentList({ pays, onUndo, canUndo }: { pays: Pay[]; onUndo: (i: number) => void; canUndo: boolean }) {
  if (!pays.length) return null
  return <div className="card p-0" data-testid="pay-list">{pays.map((p, i) => <div key={p.id ?? i} className="flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm"><span className="flex-1">{fmtDate(p.date)} · {p.method} {p.ref}</span><span className="num text-ok">{money(p.amount)}</span>{canUndo && <Button size="sm" variant="ghost" data-testid="pay-undo" onClick={() => onUndo(i)}>Undo</Button>}</div>)}</div>
}
