import { drillRef } from '../data/drill'
import { useCompany } from '../data/brand'
import FixCrew, { type FixTarget } from '../components/FixCrew'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowUpRight, ArrowDownRight, AlertTriangle, Siren, ChevronRight, Radio, Play, Sparkles, MonitorSmartphone } from 'lucide-react'
import { useStore } from '../data/store'
import { jobsOn, inScope, jobCosting, yearSeries, isLive, MONTHS, groupProfit, trailing12, customerOf, costJobs, jobConflicts } from '../data/logic'
import { today, money, fmtLong, cn } from '../lib/util'
import { Card, Segmented, Badge, Button, useIsMobile } from '../components/ui'
import FleetMap from '../components/FleetMap'
import { YearBars, CountUp, HBar } from '../components/charts'
import { HealthPill } from '../components/JobCost'
import { useAlerts } from '../components/Notifications'
import { useOrgLabel } from '../components/OrgFilter'
import type * as T from '../data/types'
import { ObservanceBanner } from '../components/Flag'
import { canSeeMoney } from '../data/roles'
import { GuestRolesCard } from '../guest/GuestSwitch'
import { guestContext } from '../guest/pass'

export default function Command() {
  const company = useCompany()
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const go = useStore(s => s.go)
  const session = useStore(s => s.session)!
  const org = useOrgLabel()
  const showMoney = canSeeMoney(session.role)
  const [layer, setLayer] = useState<'all' | 'cranes' | 'trucks'>('all')
  const [fix, setFix] = useState<FixTarget | null>(null)
  const isMobile = useIsMobile()
  const [cmp, setCmp] = useState<'division' | 'branch' | 'crane' | 'customer' | 'type'>('division')
  const t = today()
  const units = useMemo(() => db.equipment.filter(e => inScope(e, f) && (layer === 'all' ? e.category !== 'Trailer' || e.status === 'In Transit' : layer === 'cranes' ? e.category === 'Crane' : e.category === 'Semi' || e.category === 'Pickup' || e.category === 'Trailer')), [db, f, layer])
  const active = jobsOn(db, t).filter(j => inScope(j, f))
  const cranes = db.equipment.filter(e => e.category === 'Crane' && inScope(e, f))
  const working = cranes.filter(c => active.some(j => j.craneId === c.id)).length
  const util = cranes.length ? working / cranes.length : 0
  const atWork = active.reduce((s, j) => s + j.dayRate, 0)
  const ys = useMemo(() => yearSeries(db, f), [db, f])
  const yoy = (ys.ytd - ys.ytdPrev) / (ys.ytdPrev || 1)
  const health = useMemo(() => costJobs(db, f, t).map(j => ({ j, c: jobCosting(db, j) })), [db, f, t])
  const behind = health.filter(h => h.c.health === 'behind').sort((a, b) => a.c.projMargin - b.c.projMargin)
  const hour = new Date().getHours()
  const allAlerts = useAlerts()
  const actionAlerts = allAlerts.filter(a => a.severity === 'Urgent' || a.severity === 'Action Required')
  const alerts = actionAlerts.slice(0, 5)
  const fyi = allAlerts.length - actionAlerts.length
  const crewConflicts = active.filter(j => jobConflicts(db, j, t).some(c => c.level === 'red')).length
  const downUnits = db.equipment.filter(e => inScope(e, f) && e.status === 'Out of Service')
  const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`
  const summary = [plural(active.length, 'job') + ' running', crewConflicts ? `${plural(crewConflicts, 'crew conflict')} ${crewConflicts === 1 ? 'needs' : 'need'} you` : 'crews all set', behind.length ? `${plural(behind.length, 'job')} projected to lose money` : 'every job in the black']
  const briefingText = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}. ${summary.join(', ')}. ${util ? `${working} of ${cranes.length} cranes are working, about ${money(atWork, true)} a day at work.` : ''}${downUnits.length ? ` ${downUnits.map(u => `${u.category === 'Crane' ? 'Crane ' : ''}${u.unit}`).join(' and ')} ${downUnits.length === 1 ? 'is' : 'are'} down.` : ''} Sales are ${yoy >= 0 ? 'up' : 'down'} ${(Math.abs(yoy) * 100).toFixed(0)}% on last year.`
  const [brief, setBrief] = useState(0)
  const [typed, setTyped] = useState('')
  const [fly, setFly] = useState<{ c: [number, number]; z: number } | undefined>(undefined)
  const playBriefing = () => {
    setBrief(b => b + 1); setTyped('')
    const okc = db.branches.find(b => b.hq) ?? db.branches[0]
    setFly({ c: [okc.lat, okc.lng], z: 9 })
    setTimeout(() => setFly({ c: [34.2, -98.6], z: 6 }), 2600)
    let i = 0
    const iv = setInterval(() => { i += 2; setTyped(briefingText.slice(0, i)); if (i >= briefingText.length) clearInterval(iv) }, 28)
    try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(briefingText); u.rate = 1.02; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u) } } catch { /* no voice on this device */ }
  }
  const rows = useMemo(() => trailing12(db, f), [db, f])
  const comparisons = useMemo(() => {
    if (cmp === 'division') return groupProfit(rows, h => h.divisionId).map(r => ({ ...r, label: db.divisions.find(d => d.id === r.key)?.name ?? r.key, color: db.divisions.find(d => d.id === r.key)?.color }))
    if (cmp === 'branch') return groupProfit(rows, h => h.branchId).map(r => ({ ...r, label: db.branches.find(d => d.id === r.key)?.code ?? r.key, color: undefined }))
    if (cmp === 'crane') return groupProfit(rows.filter(h => h.craneId), h => h.craneId).sort((a, b) => b.profit - a.profit).slice(0, 8).map(r => ({ ...r, label: `Crane ${db.equipment.find(e => e.id === r.key)?.unit}`, color: undefined }))
    if (cmp === 'customer') return groupProfit(rows, h => h.customerId).slice(0, 8).map(r => ({ ...r, label: db.customers.find(c => c.id === r.key)?.name ?? '', color: undefined }))
    return groupProfit(rows, h => h.type).map(r => ({ ...r, label: r.key, color: undefined }))
  }, [rows, cmp, db])
  const maxRev = Math.max(...comparisons.map(c => c.revenue), 1)
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const transit = units.filter(u => u.status === 'In Transit').length
  const down = db.equipment.filter(e => inScope(e, f) && e.status === 'Out of Service').length

  return (
    <div className="flex flex-col gap-6 max-w-[1500px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label mb-2 flex items-center gap-2"><span className="size-2 rounded-full bg-ok blink" />Live · {fmtLong(t)} · {org}</div>
          <h1 className="display text-4xl md:text-5xl font-semibold tracking-tight">{session.role === 'guest' ? `Welcome, ${session.name}` : <>{greet}{session.role === 'owner' ? '' : `, ${session.name.split(' ')[0]}`}</>}.</h1>
          <div className="mt-2 text-muted text-base md:text-lg" data-testid="command-summary">{(showMoney ? summary : summary.slice(0, 2)).map((x, i) => <span key={i}>{i ? ' · ' : ''}<button type="button" data-testid={`summary-${i}`} onClick={() => i === 0 ? open(drillRef('jobs:today')) : i === 1 ? useStore.getState().go('dispatch') : open(drillRef('jobs:behind'))} className={cn('text-left underline decoration-dotted decoration-1 underline-offset-4 decoration-current/30 hover:decoration-current', i === 1 && crewConflicts ? 'text-bad font-semibold' : i === 2 && behind.length ? 'text-warn font-semibold' : '')}>{x}</button></span>)}</div>
        </div>
        {session.role === 'owner' && <Button variant="secondary" icon={<Play className="size-4" />} onClick={playBriefing} data-testid="briefing">Morning briefing</Button>}
        {!guestContext() && <a href={`${location.pathname}?sync=1`} target="_blank" rel="noreferrer" className="hidden md:inline-flex items-center gap-2 h-10 px-4 rounded-full border hairline text-sm font-semibold hover:bg-surface-2" data-testid="demo-mode"><MonitorSmartphone className="size-4" />Phone + office demo</a>}
      </div>
      {session.role === 'guest' && <GuestRolesCard />}

      <ObservanceBanner date={t} />
      {brief > 0 && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card p-5 flex items-start gap-4 accent-glow border-accent/40" data-testid="briefing-card">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Sparkles className="size-5" /></span>
          <div className="flex-1 min-w-0"><div className="label mb-1">Ask {company.assistantName} · briefing</div><div className="text-lg leading-snug">{typed}<span className="blink">▍</span></div></div>
          <button className="text-muted hover:text-ink text-sm" onClick={() => { setBrief(0); try { window.speechSynthesis?.cancel() } catch { /* */ } }}>Close</button>
        </motion.div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { l: 'Revenue at work today', v: <CountUp value={atWork} format={n => money(n, true)} />, s: <EarnedSoFar total={atWork} jobs={active.length} />, page: 'dispatch', d: 'jobs:today', money: true },
          { l: 'Crane utilization', v: <CountUp value={util * 100} format={n => `${Math.round(n)}%`} />, s: `${working} of ${cranes.length} cranes on a job`, page: 'forecast', d: 'cranes:all', money: false },
          { l: `Revenue YTD ${ys.curY} (billed)`, v: <CountUp value={ys.ytd} format={n => money(n, true)} />, s: <span className={cn('inline-flex items-center gap-1 font-semibold', yoy >= 0 ? 'text-ok' : 'text-bad')}>{yoy >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{(Math.abs(yoy) * 100).toFixed(1)}% vs {ys.curY - 1}</span>, page: 'analytics', d: `year:${ys.curY}:${ys.curM}`, money: true },
          { l: 'Jobs losing money', v: <span className={behind.length ? 'text-bad' : 'text-ok'}>{behind.length}</span>, s: `of ${health.length} active · projected at finish`, page: 'analytics', d: 'jobs:behind', money: true },
        ].filter(k => showMoney || !k.money).concat(showMoney ? [] : [
          { l: 'Jobs today', v: <CountUp value={active.length} format={n => String(Math.round(n))} />, s: 'on the dispatch board', page: 'dispatch', d: 'jobs:today', money: false },
          { l: 'Units in fleet', v: <CountUp value={db.equipment.filter(e => inScope(e, f)).length} format={n => String(Math.round(n))} />, s: 'cranes, trucks & trailers', page: 'equipment', d: 'cranes:all', money: false },
          { l: 'Crew in the field', v: <CountUp value={new Set(db.assignments.filter(a => a.date === t && active.some(j => j.id === a.jobId)).map(a => a.employeeId)).size} format={n => String(Math.round(n))} />, s: `across ${active.length} jobs today`, page: 'dispatch', d: 'jobs:today', money: false },
        ]).map((k, i) => (
          <motion.button key={`${k.l}-${brief}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => open(drillRef(k.d))} data-kpi={k.d} className="card drill p-5 text-left">
            <div className="label">{k.l}</div>
            <div className="display text-3xl md:text-[42px] leading-none font-semibold mt-3">{k.v}</div>
            <div className="text-xs text-muted mt-2">{k.s}</div>
          </motion.button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        <div className="card p-0 overflow-hidden relative isolate order-2 lg:order-none">
          <FleetMap center={fly?.c} zoom={fly?.z} units={units} height={isMobile ? '44vh' : 'min(62vh, 640px)'} onSelect={u => open({ type: 'equipment', id: u.id })} sites={active.map(j => { const s = db.sites.find(x => x.id === j.siteId)!; return { lat: s.lat, lng: s.lng, label: `#${j.jobNo} ${customerOf(db, j).name}` } })} />
          <div className="absolute top-4 left-4 right-4 z-[500] flex flex-wrap items-center gap-2 pointer-events-none">
            <div className="pointer-events-auto rounded-2xl bg-surface/85 backdrop-blur-xl border hairline px-4 py-2.5 flex items-center gap-3">
              <Radio className="size-4 text-accent" /><span className="text-sm font-semibold">Live fleet</span>
              <span className="text-xs text-muted hidden sm:inline">{units.filter(u => u.samsaraId).length} reporting GPS · {transit} moving{down ? ` · ${down} down` : ''} · {db.equipment.filter(e => inScope(e, f)).length} units in fleet</span>
            </div>
            <div className="pointer-events-auto ml-auto"><Segmented size="sm" value={layer} onChange={setLayer} options={[{ value: 'all', label: 'All' }, { value: 'cranes', label: 'Cranes' }, { value: 'trucks', label: 'Trucks & trailers' }]} className="bg-surface/85 backdrop-blur-xl" /></div>
          </div>
          <div className="absolute bottom-4 left-4 z-[500] hidden md:flex gap-3 rounded-2xl bg-surface/85 backdrop-blur-xl border hairline px-4 py-2 text-[11px] font-semibold text-muted">
            <span className="text-ink">Pin = crane unit #</span>{[['On job', '#38bdf8'], ['Available', '#22c55e'], ['In transit', '#f59e0b'], ['Maintenance', '#a78bfa'], ['Down', '#ef4444']].map(([l, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: c }} />{l}</span>)}
          </div>
        </div>
        <div className="flex flex-col gap-4 order-1 lg:order-none">
          <Card className="flex-1">
            <div className="flex items-center justify-between mb-3"><div><div className="font-semibold">Needs attention</div><div className="text-xs text-muted">{actionAlerts.length} need action{fyi ? ` · ${fyi} FYI in the bell` : ''}</div></div><Badge tone={actionAlerts.length ? 'bad' : 'ok'}>{actionAlerts.length || 'All clear'}</Badge></div>
            <div className="flex flex-col gap-1">
              {alerts.map(a => (
                <div key={a.id} className="flex items-start gap-2 rounded-xl p-2 -mx-2 hover:bg-surface-2 transition">
                <button onClick={() => a.ref ? open(a.ref) : a.page && go(a.page as never)} className="flex-1 min-w-0 flex items-start gap-3 text-left">
                  {a.severity === 'Urgent' ? <Siren className="size-4 text-bad mt-0.5 shrink-0" /> : <AlertTriangle className="size-4 text-warn mt-0.5 shrink-0" />}
                  <span className="min-w-0"><span className="block text-sm font-semibold leading-snug">{a.title}</span><span className="block text-xs text-muted truncate">{a.body}</span></span>
                </button>
                {a.fix && <Button size="sm" variant="primary" data-testid="alert-fix" onClick={() => setFix(a.fix!)}>Fix</Button>}
                </div>
              ))}
            </div>
          </Card>
          {showMoney && <Card>
            <div className="flex items-center justify-between mb-3"><div className="font-semibold">Coming out behind</div><button onClick={() => go('analytics')} className="text-xs text-muted hover:text-ink inline-flex items-center">Job costing<ChevronRight className="size-3.5" /></button></div>
            {behind.slice(0, 3).map(({ j, c }) => (
              <button key={j.id} onClick={() => open({ type: 'job', id: j.id })} className="w-full flex items-center gap-3 py-2 text-left border-b hairline last:border-0">
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">#{j.jobNo} · {customerOf(db, j).name}</span><span className="block text-xs text-muted">{money(c.cost, true)} cost vs {money(c.revenue, true)} earned</span></span>
                <span className="text-sm font-semibold text-bad num">{(c.projMargin * 100).toFixed(0)}%</span>
              </button>
            ))}
            {!behind.length && <div className="text-sm text-muted">Every active job is projected profitable.</div>}
            <div className="flex gap-2 mt-3 flex-wrap">{(['ahead', 'thin', 'behind'] as const).map(h => <button key={h} onClick={() => open(drillRef(`jobs:${h}`))} className="inline-flex items-center gap-1 rounded-full hover:bg-surface-2 pr-2 transition"><HealthPill health={h} /><span className="text-xs num font-semibold">{health.filter(x => x.c.health === h).length}</span></button>)}</div>
          </Card>}
        </div>
      </div>

      {showMoney && <div className="grid lg:grid-cols-[1.4fr_1fr] gap-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div><div className="font-semibold">Sales — year over year</div><div className="text-xs text-muted mt-0.5">{ys.curY}: {money(ys.ytd, true)} YTD · {ys.curY - 1}: {money(ys.full(ys.curY - 1), true)} · {ys.curY - 2}: {money(ys.full(ys.curY - 2), true)}</div></div>
            <div className="flex gap-3 text-xs font-semibold">{[[ys.curY - 2, '#475569'], [ys.curY - 1, '#94a3b8'], [ys.curY, 'var(--accent)']].map(([y, c]) => <span key={y} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: c as string }} />{y}</span>)}</div>
          </div>
          <YearBars labels={MONTHS} curMonth={ys.curM - 1} mtdLabel onBar={(k, i) => open(drillRef(`month:${ys.series[k].year}:${i + 1}`))} colors={['#475569', '#94a3b8', 'var(--accent)']} series={ys.series.map((s, k) => ({ name: String(s.year), values: s.months.map((m, i) => (k === 2 && i > ys.curM - 1 ? null : m.revenue)) }))} />
        </Card>
        <Card>
          <div className="flex flex-col gap-3 mb-4">
            <div><div className="font-semibold">Who makes the money</div><div className="text-xs text-muted mt-0.5">Last 12 months · revenue and margin</div></div>
            <Segmented size="sm" value={cmp} onChange={setCmp} options={[{ value: 'division', label: 'Divisions' }, { value: 'branch', label: 'Branches' }, { value: 'crane', label: 'Cranes' }, { value: 'customer', label: 'Customers' }, { value: 'type', label: 'Job types' }]} />
          </div>
          <div className="flex flex-col gap-3">
            {comparisons.map(r => (
              <button key={r.key} onClick={() => open(drillRef(`hist:${cmp}:${r.key}`))} className="flex items-center gap-3 text-sm text-left rounded-lg -mx-2 px-2 py-1 hover:bg-surface-2 transition">
                <span className="w-36 truncate font-medium">{r.label}</span>
                <span className="flex-1"><HBar value={r.revenue} max={maxRev} color={r.color ?? 'var(--accent)'} /></span>
                <span className="w-16 text-right num font-semibold">{money(r.revenue, true)}</span>
                <span className={cn('w-12 text-right num text-xs font-semibold', r.margin >= 0.25 ? 'text-ok' : r.margin >= 0.15 ? 'text-warn' : 'text-bad')}>{Math.round(r.margin * 100)}%</span>
              </button>
            ))}
          </div>
        </Card>
      </div>}
      <FixCrew target={fix} onClose={() => setFix(null)} />
    </div>
  )
}
export type { T }

/** Ticks every second: today's day-rate revenue accrued across a 6 AM–5 PM shift. */
function EarnedSoFar({ total, jobs }: { total: number; jobs: number }) {
  const [t, setT] = useState(() => Date.now())
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 1000); return () => clearInterval(i) }, [])
  const d = new Date(t); const h = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
  const frac = Math.max(0, Math.min(1, (h - 6) / 11))
  return <span>{jobs} jobs running · <span className="num text-ink/80" data-testid="earned-so-far">${Math.round(total * frac).toLocaleString()}</span> earned so far</span>
}
