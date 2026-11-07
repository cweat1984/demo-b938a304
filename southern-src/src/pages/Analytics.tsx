import { drillRef } from '../data/drill'
import { useKeep } from '../lib/keep'
import { useMemo, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Download } from 'lucide-react'
import { useStore } from '../data/store'
import { inScope, jobCosting, yearSeries, MONTHS, trailing12, groupProfit, craneLeague, customerOf, isLive , costJobs } from '../data/logic'
import { money, cn, downloadCsv, today } from '../lib/util'
import { PageHeader, Card, Segmented, Button } from '../components/ui'
import { YearBars, HBar, Donut } from '../components/charts'
import { HealthPill } from '../components/JobCost'
import { useOrgLabel } from '../components/OrgFilter'

export default function Analytics() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const org = useOrgLabel()
  const [tab, setTab] = useKeep<'jobs' | 'yoy' | 'cranes' | 'compare'>('analytics:tab', 'jobs')
  const [health, setHealth] = useState<'all' | 'ahead' | 'thin' | 'behind'>('all')
  const [cmp, setCmp] = useState<'division' | 'branch' | 'customer' | 'type'>('division')
  const ys = useMemo(() => yearSeries(db, f), [db, f])
  const live = useMemo(() => costJobs(db, f).map(j => ({ j, c: jobCosting(db, j) })).sort((a, b) => a.c.projMargin - b.c.projMargin), [db, f])
  const rows = useMemo(() => trailing12(db, f), [db, f])
  const league = useMemo(() => craneLeague(db, f), [db, f])
  const groups = useMemo(() => {
    const key = cmp === 'division' ? (h: { divisionId: string }) => h.divisionId : cmp === 'branch' ? (h: { branchId: string }) => h.branchId : cmp === 'customer' ? (h: { customerId: string }) => h.customerId : (h: { type: string }) => h.type
    return groupProfit(rows, key as never).map(g => ({ ...g, label: cmp === 'division' ? db.divisions.find(d => d.id === g.key)?.name : cmp === 'branch' ? `${db.branches.find(b => b.id === g.key)?.code} · ${db.branches.find(b => b.id === g.key)?.city}` : cmp === 'customer' ? db.customers.find(c => c.id === g.key)?.name : g.key, color: cmp === 'division' ? db.divisions.find(d => d.id === g.key)?.color : undefined }))
  }, [rows, cmp, db])
  const totRev = live.reduce((s, x) => s + x.c.revenue, 0), totCost = live.reduce((s, x) => s + x.c.cost, 0)
  const yoy = (ys.ytd - ys.ytdPrev) / (ys.ytdPrev || 1)
  const shown = live.filter(x => health === 'all' || x.c.health === health)
  const maxRev = Math.max(...groups.map(g => g.revenue), 1)
  const maxCrane = Math.max(...league.map(l => l.revenue), 1)
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow={org} title="Job costing & analytics" sub="Every hour, gallon, per diem, bill and crane-day posts to a job number automatically." actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'jobs', label: 'Job P&L' }, { value: 'yoy', label: 'Year over year' }, { value: 'cranes', label: 'Cranes' }, { value: 'compare', label: 'Compare' }]} />} />
      {tab === 'jobs' && <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="drill" onClick={() => open(drillRef('jobs:all'))}><div className="label">Earned on active jobs</div><div className="display text-3xl font-semibold num mt-2">{money(totRev, true)}</div></Card>
          <Card className="drill" onClick={() => open(drillRef('jobs:all'))}><div className="label">Cost posted</div><div className="display text-3xl font-semibold num mt-2">{money(totCost, true)}</div></Card>
          <Card className="drill" onClick={() => open(drillRef('jobs:all'))}><div className="label">Blended margin (to date)</div><div className={cn('display text-3xl font-semibold num mt-2', totRev - totCost > 0 ? 'text-ok' : 'text-bad')}>{totRev ? Math.round((totRev - totCost) / totRev * 100) : 0}%</div></Card>
          <Card className="drill" onClick={() => open(drillRef('jobs:behind'))}><div className="label">Losing money (at finish)</div><div className="display text-3xl font-semibold num mt-2 text-bad">{live.filter(x => x.c.health === 'behind').length}</div></Card>
        </div>
        <div className="flex items-center gap-2 flex-wrap"><Segmented size="sm" value={health} onChange={setHealth} options={[{ value: 'all', label: 'All', count: live.length }, { value: 'behind', label: 'Losing money', count: live.filter(x => x.c.health === 'behind').length }, { value: 'thin', label: 'Thin', count: live.filter(x => x.c.health === 'thin').length }, { value: 'ahead', label: 'Ahead', count: live.filter(x => x.c.health === 'ahead').length }]} />
          <Button size="sm" variant="ghost" className="ml-auto" icon={<Download className="size-4" />} onClick={() => downloadCsv('job-costing.csv', [['Job', 'Customer', 'Earned', 'Cost', 'Margin', 'Budget', 'Projected cost', 'Absorbed cost (in Cost)', 'Health'], ...live.map(({ j, c }) => [j.jobNo, customerOf(db, j).name, Math.round(c.revenue), Math.round(c.cost), (c.margin * 100).toFixed(1) + '%', j.quote.costBudget, Math.round(c.projCost), Math.round(c.extras?.absorbed ?? 0), c.health])])}>Export</Button></div>
        <div className="card p-0 overflow-hidden">
          <div className="hidden lg:flex px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-faint border-b hairline"><span className="flex-1">Job</span><span className="w-28 text-right">Earned</span><span className="w-28 text-right">Cost</span><span className="w-40 px-4">Cost vs budget to date</span><span className="w-20 text-right">To date</span><span className="w-24 text-right">At finish (proj.)</span><span className="w-36 text-right">Outlook</span></div>
          {shown.map(({ j, c }) => {
            const mc = (m: number) => m >= 0.15 ? 'text-ok' : m >= 0 ? 'text-warn' : 'text-bad'
            return (
            <button key={j.id} data-testid="jpl-row" onClick={() => open({ type: 'job', id: j.id, tab: 'cost' })} className="w-full border-b hairline last:border-0 hover:bg-surface-2 text-left">
              {/* dive3 M11: below lg a stacked card, so the job name always shows on phones and tablets */}
              <span className="lg:hidden flex flex-col gap-1.5 px-4 py-3">
                <span className="flex items-start gap-2"><span className="flex-1 min-w-0"><span className="block font-semibold leading-snug break-words" data-testid="jpl-name">#{j.jobNo} · {customerOf(db, j).name}</span><span className="block text-xs text-muted">{j.name} · {c.earnedDays}/{c.totalDays} days</span></span><HealthPill health={c.health} /></span>
                <span className="grid grid-cols-4 gap-2 text-xs"><span><span className="block text-faint">Earned</span><b className="num">{money(c.revenue, true)}</b></span><span><span className="block text-faint">Cost</span><b className="num">{money(c.cost, true)}</b></span><span><span className="block text-faint">To date</span><b className={cn('num', mc(c.margin))}>{(c.margin * 100).toFixed(0)}%</b></span><span><span className="block text-faint">At finish</span><b className={cn('num', mc(c.projMargin))}>{(c.projMargin * 100).toFixed(0)}%</b></span></span>
                <BudgetBar cost={c.cost} budget={c.budgetToDate} />
              </span>
              <span className="hidden lg:flex items-center gap-2 px-5 py-3.5">
              <span className="flex-1 min-w-0"><span className="block font-semibold truncate" data-testid="jpl-name-lg">#{j.jobNo} · {customerOf(db, j).name}</span><span className="block text-xs text-muted truncate">{j.name} · {c.earnedDays}/{c.totalDays} days</span></span>
              <span className="w-28 text-right num font-semibold">{money(c.revenue, true)}</span>
              <span className="w-28 text-right num">{money(c.cost, true)}</span>
              <span className="w-40 px-4"><BudgetBar cost={c.cost} budget={c.budgetToDate} /></span>
              <span className={cn('w-20 text-right num text-sm', mc(c.margin))}>{(c.margin * 100).toFixed(0)}%</span>
              <span className={cn('w-24 text-right num font-semibold', mc(c.projMargin))}>{(c.projMargin * 100).toFixed(0)}%</span>
              <span className="w-36 text-right"><HealthPill health={c.health} /></span>
              </span>
            </button>
          )})}
        </div>
      </div>}
      {tab === 'yoy' && <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[ys.curY - 2, ys.curY - 1, ys.curY].map(y => <Card key={y}><div className="label">{y}{y === ys.curY ? ' YTD' : ''}</div><div className="display text-4xl font-semibold num mt-2">{money(y === ys.curY ? ys.ytd : ys.full(y), true)}</div>{y === ys.curY && <div className={cn('text-sm font-semibold mt-1 inline-flex items-center gap-1', yoy >= 0 ? 'text-ok' : 'text-bad')}>{yoy >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}{(Math.abs(yoy) * 100).toFixed(1)}% vs same point {y - 1}</div>}</Card>)}
        </div>
        <Card><div className="font-semibold mb-6">Monthly sales</div><YearBars height={320} labels={MONTHS} curMonth={ys.curM - 1} mtdLabel onBar={(k, i) => open(drillRef(`month:${ys.series[k].year}:${i + 1}`))} colors={['#475569', '#94a3b8', 'var(--accent)']} series={ys.series.map((s, k) => ({ name: String(s.year), values: s.months.map((m, i) => (k === 2 && i > ys.curM - 1 ? null : m.revenue)) }))} /></Card>
        <Card><div className="font-semibold mb-4">Gross margin by year</div><div className="flex gap-10 flex-wrap">{ys.series.map(s => { const r = s.months.reduce((t, m) => t + m.revenue, 0), c = s.months.reduce((t, m) => t + m.cost, 0); return <Donut key={s.year} value={r ? (r - c) / r : 0} label={`${Math.round(r ? (r - c) / r * 100 : 0)}%`} sub={String(s.year)} /> })}</div></Card>
      </div>}
      {tab === 'cranes' && <div className="card p-0 overflow-hidden">
        <div className="px-5 py-4 border-b hairline"><div className="font-semibold">Crane league table</div><div className="text-xs text-muted">Last 12 months · revenue, utilization, and profit after internal ownership cost</div></div>
        {league.map((l, i) => (
          <button key={l.crane.id} onClick={() => open({ type: 'equipment', id: l.crane.id })} className="w-full flex items-center gap-4 px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2 text-left">
            <span className="w-6 text-faint num text-sm">{i + 1}</span>
            <span className="w-16 display text-xl font-semibold num">{l.crane.unit}</span>
            <span className="w-44 text-sm min-w-0 truncate">{l.crane.capacity}t {l.crane.make} {l.crane.model}</span>
            <span className="flex-1 hidden md:block"><HBar value={l.revenue} max={maxCrane} /></span>
            <span className="w-20 text-right num font-semibold">{money(l.revenue, true)}</span>
            <span className="w-16 text-right num text-sm text-muted">{Math.round(l.util * 100)}% util</span>
            <span className={cn('w-20 text-right num font-semibold', l.margin >= 0.25 ? 'text-ok' : l.margin >= 0.1 ? 'text-warn' : 'text-bad')}>{money(l.profit, true)}</span>
          </button>
        ))}
      </div>}
      {tab === 'compare' && <Card>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6"><div><div className="font-semibold">Who makes the money</div><div className="text-xs text-muted">Last 12 months</div></div><Segmented size="sm" value={cmp} onChange={setCmp} options={[{ value: 'division', label: 'Division vs division' }, { value: 'branch', label: 'Branch vs branch' }, { value: 'customer', label: 'Customers' }, { value: 'type', label: 'Job types' }]} /></div>
        <div className="flex flex-col gap-4">{groups.slice(0, 14).map(g => (
          <button key={g.key} onClick={() => open(drillRef(`hist:${cmp}:${g.key}`))} className="flex items-center gap-4 text-left rounded-xl -mx-2 px-2 py-1.5 hover:bg-surface-2 transition"><span className="w-56 truncate font-medium">{g.label}</span><span className="flex-1"><HBar value={g.revenue} max={maxRev} color={g.color ?? 'var(--accent)'} height={12} /></span><span className="w-24 text-right num font-semibold">{money(g.revenue, true)}</span><span className="w-24 text-right num text-sm">{money(g.profit, true)} profit</span><span className={cn('w-14 text-right num font-semibold', g.margin >= 0.25 ? 'text-ok' : g.margin >= 0.15 ? 'text-warn' : 'text-bad')}>{Math.round(g.margin * 100)}%</span></button>
        ))}</div>
      </Card>}
    </div>
  )
}

/** Actual ÷ budget-to-date, with a 100% tick. */
function BudgetBar({ cost, budget }: { cost: number; budget: number }) {
  const r = budget > 0 ? cost / budget : 0
  const w = Math.min(r / 1.5, 1) * 100
  return <span className="flex items-center gap-2"><span className="relative flex-1 h-2 rounded-full bg-surface-3 overflow-hidden"><span className={cn('absolute inset-y-0 left-0 rounded-full', r > 1.05 ? 'bg-bad' : r > 0.95 ? 'bg-warn' : 'bg-ok')} style={{ width: `${w}%` }} /><span className="absolute inset-y-[-2px] w-px bg-ink/70" style={{ left: `${100 / 1.5}%` }} /></span><span className="num text-[11px] text-muted w-9 text-right">{Math.round(r * 100)}%</span></span>
}
