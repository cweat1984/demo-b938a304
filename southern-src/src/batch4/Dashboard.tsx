import { moneyHidden } from '../lib/util'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Truck, FileText, Route, ShieldAlert, Receipt, FilePlus2, Wind, ArrowUpRight } from 'lucide-react'
import { PageHeader, Sheet } from '../components/ui'
import { inScope } from '../data/logic'
import { useStore } from '../data/store'
import { certBand, fullName } from '../data/logic'
import { useMoves } from '../data/moves'
import { usePickup } from '../batch3/pickupData'
import { useBids } from '../batch3/bidsData'
import { useWx } from '../batch3/weatherData'
import { useL2 } from '../launch2/l2store'
import { useB3 } from '../batch3b/b3store'
import { defaultJob } from '../batch3b/Recon'
import { cn, today, addDays, fmtDate } from '../lib/util'

interface Tile { k: string; label: string; icon: typeof Truck; value: string | number; sub: string; tone: string; page: string; rows: { a: string; b: string }[] }
import { NptRollup } from '../gapA/npt'

export default function Dashboard() {
  const db = useStore(s => s.db)
  const moves = useMoves(s => s.moves), pickups = usePickup(s => s.pickups), rfqs = useBids(s => s.rfqs), sd = useWx(s => s.standdowns)
  const exps = useL2(s => s.expenses), cos = useB3(s => s.cos)
  useEffect(() => { useB3.getState().seed(db, defaultJob(db)?.id) }, [db])
  const [open, setOpen] = useState<Tile | null>(null)
  const scope = useStore(s => s.ui.filter)
  const tiles = useMemo<Tile[]>(() => {
    const t = today()
    const activeMoves = moves.filter(m => m.status !== 'Complete')
    const f = scope; const quotes = db.jobs.filter(j => j.stage === 'Quote' && !j.quoteLost && inScope(j, f)), rfqOpen = rfqs.filter(r => r.status !== 'Awarded')
    const up = pickups.filter(p => p.date >= t && p.date <= addDays(t, 7))
    const certs = db.certs.filter(c => { const b = certBand(c).band; return b === '30' || b === '60' || b === 'expired' })
    const pend = exps.filter(e => e.status === 'Submitted' || e.status === 'Draft')
    const coPend = cos.filter(c => c.status === 'Sent' || c.status === 'Verbal')
    const windT = db.tickets.filter(x => /wind/i.test(x.delays ?? '') && x.date >= addDays(t, -30))
    const windDays = windT.length + Object.keys(sd).length
    return [
      { k: 'moves', label: 'Active crane moves', icon: Truck, value: activeMoves.length, sub: `${activeMoves.reduce((a, m) => a + m.loads.filter(l => l.status === 'En route').length, 0)} loads on the road`, tone: 'text-info', page: 'moves', rows: activeMoves.map(m => ({ a: `#${m.fromJobNo} → #${m.toJobNo}`, b: `${m.loads.filter(l => l.status === 'Delivered').length}/${m.loads.length} loads · ${m.status}` })) },
      { k: 'quotes', label: 'Open quotes', icon: FileText, value: quotes.length, sub: moneyHidden() ? `${quotes.length} open` : `$${Math.round(quotes.reduce((a, j) => a + j.quote.revenue, 0) / 1000).toLocaleString()}k to customers · ${rfqOpen.length} vendor RFQs out (not counted)`, tone: 'text-accent', page: 'quotes', rows: [...quotes.slice(0, 8).map(j => ({ a: `#${j.jobNo} ${j.name}`, b: `$${j.quote.revenue.toLocaleString()}` })), ...rfqOpen.map(r => ({ a: `RFQ · ${r.lines[0]?.desc ?? ''}`, b: `${r.quotes.length} bids · ${r.status}` }))] },
      { k: 'pickups', label: 'Upcoming pickups', icon: Route, value: up.length, sub: 'Next 7 days', tone: 'text-ink', page: 'pickup', rows: up.map(p => ({ a: `${p.label}`, b: `${fmtDate(p.date)} ${p.time}` })) },
      { k: 'certs', label: 'Cert expirations', icon: ShieldAlert, value: certs.length, sub: `${certs.filter(c => certBand(c).band === 'expired').length} expired · rest within 60 days`, tone: 'text-bad', page: 'certtracker', rows: certs.sort((a, b) => a.expires.localeCompare(b.expires)).slice(0, 15).map(c => ({ a: `${fullName(db.employees.find(e => e.id === c.employeeId))} · ${c.type}`, b: fmtDate(c.expires) })) },
      { k: 'exp', label: 'Expenses', icon: Receipt, value: moneyHidden() ? '—' : `$${Math.round(pend.reduce((a, e) => a + e.amount, 0)).toLocaleString()}`, sub: `${pend.length} awaiting submit/approval · ${exps.filter(e => e.status === 'In QuickBooks').length} in QuickBooks`, tone: 'text-warn', page: 'expenses', rows: exps.map(e => ({ a: `${e.merchant}${e.jobNo ? ` · ${e.jobNo}` : ''}`, b: `$${e.amount.toFixed(2)} · ${e.status}` })) },
      { k: 'co', label: 'Change orders pending', icon: FilePlus2, value: coPend.length, sub: moneyHidden() ? '—' : `$${coPend.reduce((a, c) => a + c.cost, 0).toLocaleString()} awaiting customer signature`, tone: 'text-warn', page: 'changeorders', rows: coPend.map(c => ({ a: `${c.no} ${c.title}`, b: `$${c.cost.toLocaleString()} · ${c.status}` })) },
      { k: 'wind', label: 'Wind standby days', icon: Wind, value: windDays, sub: 'Last 30 days · billable standby', tone: 'text-info', page: 'weather', rows: [...windT.map(x => ({ a: `#${db.jobs.find(j => j.id === x.jobId)?.jobNo} · ${x.date}`, b: x.delays })), ...Object.entries(sd).map(([k, v]) => ({ a: k, b: `Stand-down by ${v.by}` }))] },
    ]
  }, [db, moves, pickups, rfqs, sd, exps, cos, scope])
  return <div className="flex flex-col gap-5" data-testid="mgmt-dash">
    <PageHeader eyebrow="Command" title="Management dashboard" sub="Everything in motion, one glance. Tap any tile." />
    <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{tiles.map((t, i) => { const I = t.icon
      return <motion.button key={t.k} data-testid={`dash-${t.k}`} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * .04 }} onClick={() => setOpen(t)} className="card p-5 text-left hover:border-faint/50 transition group">
        <div className="flex items-center gap-2 text-sm text-muted"><I className="size-4" />{t.label}<ArrowUpRight className="size-4 ml-auto opacity-0 group-hover:opacity-60" /></div>
        <div className={cn('display text-4xl font-semibold mt-3', t.tone)}>{t.value}</div><div className="text-xs text-muted mt-1">{t.sub}</div></motion.button> })}</div>
    <NptRollup />
    <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.label} sub={open?.sub} actions={open && <button data-testid="dash-go" onClick={() => { const to = open.page; setOpen(null); useStore.getState().go(to as Parameters<ReturnType<typeof useStore.getState>['go']>[0]) }} className="h-9 px-3 rounded-xl bg-accent text-accent-ink text-sm font-semibold">Open</button>}>
      <div className="flex flex-col divide-y hairline" data-testid="dash-detail">{open?.rows.length ? open.rows.map((r, i) => <div key={i} className="py-2.5 flex gap-3 text-sm"><span className="flex-1">{r.a}</span><span className="text-muted text-right">{r.b}</span></div>) : <div className="text-muted text-sm">Nothing here right now.</div>}</div>
    </Sheet>
  </div>
}
