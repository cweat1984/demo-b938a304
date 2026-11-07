import { useAppName } from '../data/brand'
/** Employee portal "My Cards": company credit + fuel cards. Only the last 4 digits ever exist in the app — there is no field for a
 *  full card number anywhere, so it can't be stored, synced or shown. Fuel transactions come from the fuel-card feed (gap B). */
import { useMemo } from 'react'
import { CreditCard, Fuel, Lock } from 'lucide-react'
import { Badge } from '../components/ui'
import { useStore } from '../data/store'
import { fullName } from '../data/logic'
import { fmtDate } from '../lib/util'
import { useG, seedFuel } from '../gapb/gstore'
import { useL2 } from '../launch2/l2store'
import { h } from './util'
import type * as T from '../data/types'

export interface CompanyCard { id: string; kind: 'Credit' | 'Fuel'; issuer: string; network: string; last4: string; status: 'Active' | 'Locked' | 'Ordered'; limit: number; period: 'month' | 'day'; spent: number; perTxn?: number; rules: string }
export function cardsFor(e: T.Employee | undefined, name: string): CompanyCard[] {
  const k = e?.id ?? name, l4 = (s: string) => String(Math.floor(h(k + s) * 9000) + 1000)
  const out: CompanyCard[] = []
  const drives = !!e && ['Truck Driver', 'Operator', 'Oiler'].includes(String(e.craft))
  if (!e || !drives || h(k + 'cc') < .35) out.push({ id: 'cc', kind: 'Credit', issuer: 'Chase Ink Business', network: 'Visa', last4: name === 'Chad Weathers' ? '4417' : l4('cc'), status: 'Active', limit: name === 'Chad Weathers' ? 15000 : 5000, period: 'month', spent: Math.round(h(k + 's') * 2400), rules: 'Travel, meals, supplies · receipts auto-match in Expenses' })
  if (drives || name === 'Chad Weathers') out.push({ id: 'fc', kind: 'Fuel', issuer: h(k + 'n') < .5 ? 'WEX Fleet' : 'Comdata', network: 'Fleet', last4: name === 'Chad Weathers' ? '9921' : l4('fc'), status: 'Active', limit: 1200, period: 'day', spent: Math.round(h(k + 'f') * 600), perTxn: 600, rules: 'Diesel & DEF only · PIN + unit number at the pump' })
  // dive2 field M6: a brand-new hire has no card history yet — cards show as Ordered with nothing spent
  if (e?.hireDate && (Date.now() - new Date(e.hireDate + 'T12:00').getTime()) / 864e5 < 30) return out.map(c => ({ ...c, status: 'Ordered' as const, spent: 0 }))
  return out
}
export default function MyCards({ empId, big }: { empId?: string; big?: boolean }) {
  const appNm = useAppName()
  const db = useStore(s => s.db), session = useStore(s => s.session!)
  const e = db.employees.find(x => x.id === empId) ?? db.employees.find(x => fullName(x) === session.name)
  const name = e ? fullName(e) : session.name
  const cards = useMemo(() => cardsFor(e, name), [e, name])
  const fuelAll = useG(s => s.fuel), exps = useL2(s => s.expenses)
  const txns = useMemo(() => {
    const fuel = (fuelAll.length ? fuelAll : seedFuel(db))
    let mine = fuel.filter(t => t.driver === name)
    if (!mine.length && cards.some(c => c.kind === 'Fuel')) mine = fuel.filter((_, i) => i % 9 === Math.floor(h(name) * 9)).slice(0, 3)
    const fc = cards.find(c => c.kind === 'Fuel'), cc = cards.find(c => c.kind === 'Credit')
    return [
      ...(fc ? mine.slice(0, 5).map(t => ({ id: t.id, at: t.at.slice(0, 10), what: `${t.station} · Unit ${t.unit}`, amt: t.gallons * t.price, card: fc, flag: t.flags[0] })) : []),
      ...(cc ? exps.filter(x => x.who === name || x.last4 === cc.last4).slice(0, 5).map(x => ({ id: x.id, at: x.date, what: x.merchant, amt: x.amount, card: cc, flag: undefined as string | undefined })) : []),
    ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
  }, [fuelAll, exps, db, name, cards])
  const money = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  return <div className="flex flex-col gap-3" data-testid="my-cards">
    <div className={`grid gap-3 ${big ? '' : 'sm:grid-cols-2'}`}>{cards.map(c => <div key={c.id} className="rounded-2xl p-4 text-white relative overflow-hidden" style={{ background: c.kind === 'Fuel' ? 'linear-gradient(135deg,#14532d,#166534 60%,#15803d)' : 'linear-gradient(135deg,#0f172a,#1e293b 60%,#334155)' }} data-testid="card-tile">
      <div className="flex items-center gap-2 text-xs font-semibold opacity-90">{c.kind === 'Fuel' ? <Fuel className="size-4" /> : <CreditCard className="size-4" />}{c.issuer} · {c.network}<span className="ml-auto rounded-full bg-white/15 px-2 py-0.5">{c.status}</span></div>
      <div className="mt-5 text-xl tracking-[.2em] tabular-nums" data-testid="card-number">•••• •••• •••• {c.last4}</div>
      <div className="mt-3 flex items-end gap-3 text-xs"><div><div className="opacity-70">Limit</div><b>{money(c.limit)}/{c.period}</b></div><div><div className="opacity-70">Used</div><b>{money(c.spent)}</b></div>{c.perTxn && <div><div className="opacity-70">Per fill</div><b>{money(c.perTxn)}</b></div>}<div className="ml-auto opacity-80 text-right max-w-[50%]">{c.rules}</div></div>
      <div className="mt-2 h-1.5 rounded-full bg-white/15"><div className="h-full rounded-full bg-white/80" style={{ width: `${Math.min(100, c.spent / c.limit * 100)}%` }} /></div>
    </div>)}</div>
    <div className="text-[11px] text-muted inline-flex items-center gap-1.5"><Lock className="size-3" />Last 4 digits only — the full number is never stored in {appNm}. Lost card? Call the office to lock it.</div>
    <div><div className="label mb-1.5">Recent transactions</div><div className="flex flex-col divide-y hairline text-sm" data-testid="card-txns">{txns.length ? txns.map(t => <div key={t.id} className="py-2 flex items-center gap-3"><span className="text-xs text-muted w-14">{fmtDate(t.at)}</span><span className="flex-1 min-w-0 min-w-0 break-words">{t.what}{t.flag && <Badge tone="warn" className="ml-2">{t.flag}</Badge>}</span><span className="text-xs text-muted">••{t.card.last4}</span><b className="tabular-nums">{money(t.amt)}</b></div>) : <div className="py-2 text-muted">No transactions in the last 30 days.</div>}</div></div>
  </div>
}
