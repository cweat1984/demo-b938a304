import Linkify from './Linkify'
import { useMemo, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Plus, Zap } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { jobCosting, COST_CATS, HEALTH_LABEL } from '../data/logic'
import { money, fmtDate, cn, today, moneyHidden } from '../lib/util'
import { Badge, Button, Collapsible, Field, Modal } from './ui'
import { HBar } from './charts'
import { toast } from 'sonner'

export function HealthPill({ health, big }: { health: 'ahead' | 'thin' | 'behind' | 'pending'; big?: boolean }) {
  if (moneyHidden()) return null // margin is money: hidden on guest passes
  const I = health === 'ahead' ? TrendingUp : health === 'behind' ? TrendingDown : Minus
  const cls = health === 'ahead' ? 'bg-ok/15 text-ok' : health === 'behind' ? 'bg-bad/15 text-bad' : health === 'thin' ? 'bg-warn/15 text-warn' : 'bg-surface-2 text-muted'
  return <span className={cn('inline-flex items-center gap-1.5 rounded-full font-semibold', cls, big ? 'px-4 py-2 text-sm' : 'px-2.5 py-0.5 text-[11px]')}><I className={big ? 'size-4' : 'size-3'} />{HEALTH_LABEL[health]}</span>
}

const SRC_TONE: Record<string, 'info' | 'ok' | 'warn' | 'neutral' | 'accent'> = { 'Time Entry': 'info', 'Per Diem': 'info', 'Fuel Log': 'ok', 'Equipment Usage': 'accent', 'Vendor Bill': 'warn', Manual: 'neutral' }

export default function JobCostPanel({ job }: { job: T.Job }) {
  const db = useStore(s => s.db)
  const c = useMemo(() => jobCosting(db, job), [db, job])
  const [add, setAdd] = useState(false)
  const [group, setGroup] = useState<'all' | 'one' | 'run'>('all')
  const maxCat = Math.max(...Object.values(c.byCat), 1)
  const qCost = c.cost - (c.extras?.absorbed ?? 0) // Req H: quote-vs-actual leaves absorbed (non-billable) cost out — it is shown on its own line
  const budgetPct = c.budgetToDate ? qCost / c.budgetToDate : 0
  return (
    <div className="flex flex-col gap-5">
      <div className={cn('rounded-3xl p-5 border', c.health === 'ahead' ? 'border-ok/30 bg-ok/[.06]' : c.health === 'behind' ? 'border-bad/30 bg-bad/[.06]' : c.health === 'thin' ? 'border-warn/30 bg-warn/[.06]' : 'border-line bg-surface-2')}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <HealthPill health={c.health} big />
          <span className="text-xs text-muted">{c.earnedDays}/{c.totalDays} days worked · {Math.round(c.pct * 100)}% through schedule</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-5">
          <div className="rounded-2xl bg-surface/60 p-4" data-testid="cost-to-date"><div className="label mb-3">To date</div>
            <div className="grid grid-cols-3 gap-3"><div><div className="text-xs text-muted">Earned</div><div className="display text-2xl font-semibold num">{money(c.revenue, true)}</div></div><div><div className="text-xs text-muted">Cost</div><div className="display text-2xl font-semibold num">{money(c.cost, true)}</div></div><div><div className="text-xs text-muted">Margin</div><div className={cn('display text-2xl font-semibold num', c.margin >= 0.15 ? 'text-ok' : c.margin >= 0 ? 'text-warn' : 'text-bad')}>{c.revenue ? `${(c.margin * 100).toFixed(0)}%` : '—'}</div></div></div></div>
          <div className="rounded-2xl bg-surface/60 p-4" data-testid="cost-at-finish"><div className="label mb-3">At finish (projected)</div>
            <div className="grid grid-cols-3 gap-3"><div><div className="text-xs text-muted">Quoted</div><div className="display text-2xl font-semibold num">{money(c.projRevenue, true)}</div></div><div><div className="text-xs text-muted">Proj. cost</div><div className="display text-2xl font-semibold num">{money(c.projCost, true)}</div></div><div><div className="text-xs text-muted">Margin</div><div className={cn('display text-2xl font-semibold num', c.projMargin >= 0.15 ? 'text-ok' : c.projMargin >= 0 ? 'text-warn' : 'text-bad')}>{(c.projMargin * 100).toFixed(0)}%</div></div></div></div>
        </div>
        <div className="mt-3 text-xs text-muted">Projection = one-time costs ({money(c.oneTime, true)} mob, permits, engineering, subs){c.pendingDemob ? ` + demob still to come (${money(c.pendingDemob, true)})` : ''} + daily run-rate ({money(c.earnedDays ? c.runRate / c.earnedDays : 0, true)}/day) × {c.totalDays} days. Outlook uses the at-finish margin. Cost budget {money(job.quote.costBudget, true)}.</div>
      </div>

      <Waterfall c={c} onPick={setGroup} group={group} />

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3"><div className="font-semibold">Budget vs actual (to date)</div><Badge tone={budgetPct > 1.05 ? (c.projMargin > 0.15 ? 'warn' : 'bad') : budgetPct > 0.95 ? 'warn' : 'ok'}>{c.budgetToDate ? budgetPct > 1.05 ? `${Math.round((budgetPct - 1) * 100)}% over budget${c.projMargin > 0 ? ' · still profitable' : ''}` : `${Math.round(budgetPct * 100)}% of budget` : 'Not started'}</Badge></div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3"><span className="w-20 text-muted">Budget</span><HBar value={c.budgetToDate} max={Math.max(c.budgetToDate, qCost)} color="var(--faint)" height={10} /><span className="w-24 text-right num">{money(c.budgetToDate, true)}</span></div>
          <div className="flex items-center gap-3"><span className="w-20 text-muted">Actual</span><HBar value={qCost} max={Math.max(c.budgetToDate, qCost)} color={budgetPct > 1 ? '#ef4444' : '#22c55e'} height={10} /><span className="w-24 text-right num" data-testid="bva-actual">{money(qCost, true)}</span></div>
          {c.extras && c.extras.absorbed !== 0 && <div className="flex items-center gap-3 text-warn" data-testid="bva-absorbed"><span className="w-20">Absorbed</span><span className="flex-1 text-xs">Non-billable extras — in P&amp;L, not in quote vs actual</span><span className="w-24 text-right num">{money(c.extras.absorbed, true)}</span></div>}
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-1">
          <div><div className="font-semibold">Where the money went</div><div className="text-xs text-muted flex items-center gap-1 mt-0.5"><Zap className="size-3 text-accent" />Posted automatically from time, per diem, fuel, equipment usage and coded vendor bills — entered once.</div></div>
          <Button size="sm" variant="outline" icon={<Plus className="size-4" />} onClick={() => setAdd(true)}>Cost</Button>
        </div>
        <div className="mt-3">
          {group !== 'all' && <div className="mb-2 flex items-center gap-2 text-xs"><Badge tone="accent">{group === 'one' ? 'One-time costs only' : 'Run-rate costs only'}</Badge><button className="ref-link text-muted" onClick={() => setGroup('all')}>Show all</button></div>}
          {COST_CATS.filter(k => c.lines.some(l => l.category === k && (group === 'all' || (group === 'one') === !!l.oneTime))).sort((a, b) => c.byCat[b] - c.byCat[a]).map(k => {
            const lines = c.lines.filter(l => l.category === k && (group === 'all' || (group === 'one') === !!l.oneTime))
            return (
              <Collapsible key={k} title={<span className="flex items-center gap-3 w-full"><span className="w-40 shrink-0">{k}</span><span className="flex-1 hidden sm:block"><HBar value={c.byCat[k]} max={maxCat} /></span></span>} right={<span className="num text-sm font-semibold w-24 text-right">{money(c.byCat[k])}</span>} count={lines.length}>
                <div className="flex flex-col">
                  {lines.slice(0, 40).map((l, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5 text-[13px] border-b hairline last:border-0">
                      <span className="text-faint w-14 shrink-0">{fmtDate(l.date)}</span>
                      <span className="flex-1 min-w-0 truncate"><Linkify text={l.description} /></span>
                      {l.oneTime && <Badge>One-time</Badge>}
                      {l.refId && (l.source === 'Time Entry' || l.source === 'Per Diem' || l.source === 'Vendor Bill') ? <button className="ref-link" onClick={() => useStore.getState().open(l.source === 'Vendor Bill' ? { type: 'bill', id: l.refId! } : { type: 'time', id: l.refId! })}><Badge tone={SRC_TONE[l.source]}>{l.source} →</Badge></button> : <Badge tone={SRC_TONE[l.source]}>{l.source}</Badge>}
                      <span className="num w-20 text-right">{money(l.amount)}</span>
                    </div>
                  ))}
                  {lines.length > 40 && <div className="text-xs text-muted pt-2">+{lines.length - 40} more lines</div>}
                </div>
              </Collapsible>
            )
          })}
          {c.cost === 0 && <div className="text-sm text-muted py-6 text-center">No costs yet — they’ll post the moment the crew clocks time on this job.</div>}
        </div>
      </div>
      <AddCost open={add} onClose={() => setAdd(false)} job={job} />
    </div>
  )
}

function AddCost({ open, onClose, job }: { open: boolean; onClose: () => void; job: T.Job }) {
  const [cat, setCat] = useState<T.CostCategory>('Permits & Escorts')
  const [desc, setDesc] = useState('')
  const [amt, setAmt] = useState('')
  const name = useStore(s => s.session?.name ?? '')
  return (
    <Modal open={open} onClose={onClose} title={`Post cost to Job #${job.jobNo}`} sub="For costs that don’t come from time, fuel, equipment or a vendor bill.">
      <div className="flex flex-col gap-3">
        <Field label="Category"><select className="input" value={cat} onChange={e => setCat(e.target.value as T.CostCategory)}>{COST_CATS.map(c => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Description"><input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. City street-use permit" /></Field>
        <Field label="Amount ($)"><input className="input num" inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} /></Field>
        <Button variant="primary" size="lg" disabled={!desc || !Number(amt)} onClick={() => { actions.addCost({ jobId: job.id, date: today(), category: cat, description: desc, amount: Number(amt), source: 'Manual', by: name }); toast.success('Posted to job cost'); setDesc(''); setAmt(''); onClose() }}>Post cost</Button>
      </div>
    </Modal>
  )
}

/** Quoted → one-time → run-rate to date → remaining run-rate → demob → projected profit. Tap a step to filter the cost lines. */
function Waterfall({ c, onPick, group }: { c: ReturnType<typeof jobCosting>; onPick: (g: 'all' | 'one' | 'run') => void; group: string }) {
  const remainingRun = Math.max(0, c.projCost - c.oneTime - c.runRate - c.pendingDemob)
  const steps: { label: string; v: number; kind: 'total' | 'minus' | 'result'; g?: 'one' | 'run' }[] = [
    { label: 'Quoted', v: c.projRevenue, kind: 'total' },
    { label: 'One-time to date', v: c.oneTime, kind: 'minus', g: 'one' },
    { label: 'Daily costs to date', v: c.runRate, kind: 'minus', g: 'run' },
    { label: 'Daily costs to finish', v: remainingRun, kind: 'minus', g: 'run' },
    ...(c.pendingDemob ? [{ label: 'Demob to come', v: c.pendingDemob, kind: 'minus' as const, g: 'one' as const }] : []),
    { label: c.projProfit < 0 ? 'Projected loss' : 'Projected profit', v: c.projProfit, kind: 'result' },
  ]
  // scale straddles zero so a loss draws below a zero line instead of over the labels
  let lo = 0, r0 = c.projRevenue; steps.forEach(st => { if (st.kind === 'minus') { r0 -= st.v; lo = Math.min(lo, r0) } if (st.kind === 'result') lo = Math.min(lo, st.v) })
  const hi = Math.max(c.projRevenue, 1), span = hi - lo || 1, pct = (v: number) => ((v - lo) / span) * 100
  let run = c.projRevenue
  return (
    <div className="card p-5" data-testid="waterfall">
      <div className="font-semibold mb-1">Profit waterfall</div><div className="text-xs text-muted mb-4">Quoted price down to projected profit. Tap a bar to see the cost lines behind it.</div>
      <div className="flex items-end gap-2 h-48">
        {steps.map((s, i) => {
          let a: number, b: number
          if (s.kind === 'total') { a = 0; b = s.v } else if (s.kind === 'minus') { a = run - s.v; b = run; run -= s.v } else { a = Math.min(0, s.v); b = Math.max(0, s.v) }
          const bottomPct = pct(Math.min(a, b)), hPct = Math.max(pct(Math.max(a, b)) - bottomPct, 1.5)
          const color = s.kind === 'total' ? 'var(--color-info)' : s.kind === 'result' ? (s.v >= 0 ? 'var(--color-ok)' : 'var(--color-bad)') : 'color-mix(in srgb, var(--color-warn) 80%, transparent)'
          return (
            <button key={i} onClick={() => s.g && onPick(group === s.g ? 'all' : s.g)} className={cn('flex-1 h-full flex flex-col justify-end items-center gap-1 group', !s.g && 'cursor-default')} data-step={s.label}>
              <span className={cn('text-[11px] num font-semibold', s.kind === 'result' && s.v < 0 && 'text-bad')}>{s.kind === 'minus' || s.v < 0 ? '−' : ''}{money(Math.abs(s.v), true)}</span>
              <span className="relative w-full flex-1">
                <span className={cn('absolute left-1 right-1 rounded-md transition-all duration-700 group-hover:brightness-125', s.g && group === s.g && 'ring-2 ring-ink')} style={{ bottom: `${bottomPct}%`, height: `${hPct}%`, background: color }} />
                {lo < 0 && <span className="absolute left-0 right-0 border-t border-dashed border-faint" style={{ bottom: `${pct(0)}%` }} data-testid="wf-zero" />}
              </span>
              <span className="text-[10px] text-muted text-center leading-tight h-7">{s.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
