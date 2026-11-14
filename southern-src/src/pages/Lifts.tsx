import { useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { Ruler, ShieldCheck, Check, AlertTriangle, Wind, Weight, FileCheck2 } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, customerOf, siteOf, inScope } from '../data/logic'
import { liftCheck } from '../components/JobView'
import { cn, fmtDate, today, uid } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Card, Empty, Field, Progress, Stat } from '../components/ui'
import { JobRef, EqRef, CustRef } from '../components/bits'

const SOILS = [{ k: 'Soft clay / fill', psf: 2000 }, { k: 'Compacted gravel pad', psf: 4000 }, { k: 'Dense gravel / caliche', psf: 6000 }, { k: 'Concrete / rock', psf: 10000 }]

/** Ground bearing (demo approximation): worst outrigger ≈ 75% of (crane + counterweight + load) spread over the mats. */
export function groundBearing(crane: T.Equipment | undefined, lift: NonNullable<T.Job['lift']>, matSqft: number) {
  const craneT = crane?.capacity ? crane.capacity * 0.55 + 35 : 60
  const total = craneT + lift.load + lift.rigging
  return { psf: Math.round((total * 0.75 * 2000) / matSqft), total: Math.round(total) }
}

export default function Lifts() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const role = useStore(s => s.session?.role)
  const jobs = db.jobs.filter(j => inScope(j, f) && j.liftPlan !== 'Not Required' && !j.closedOut && ['Quote', 'Awarded', 'Scheduled', 'In Progress'].includes(j.stage)).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const [tab, setTab] = useKeep<'review' | 'approved' | 'all'>('lifts:tab', 'review')
  const list = jobs.filter(j => tab === 'all' || (tab === 'review' ? j.liftPlan !== 'Approved' : j.liftPlan === 'Approved'))
  const [sel, setSel] = useState<string | null>(() => { const pre = sessionStorage.getItem('lift-sel'); sessionStorage.removeItem('lift-sel'); return (pre && jobs.some(j => j.id === pre) ? pre : null) ?? jobs.find(j => j.liftPlan === 'In Review')?.id ?? jobs[0]?.id ?? null })
  const cur = sel ? byId(db.jobs, sel) : undefined
  const critical = jobs.filter(j => { const c = liftCheck(j, byId(db.equipment, j.craneId)); return c && c.pct >= 0.75 }).length
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow="Engineering" title="Lift Planning" sub="Load chart, ground bearing and sign-off for every engineered lift — before the crane leaves the yard." />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Need sign-off" value={jobs.filter(j => j.liftPlan !== 'Approved').length} tone={jobs.some(j => j.liftPlan === 'Missing') ? 'bad' : 'warn'} onClick={() => setTab('review')} />
        <Stat label="Approved" value={jobs.filter(j => j.liftPlan === 'Approved').length} tone="ok" onClick={() => setTab('approved')} />
        <Stat label="Critical lifts (≥75% chart)" value={critical} sub="need a written plan + rigging review" />
        {(() => { const nx = jobs.find(j => j.startDate >= today()); return <Stat label="Next lift" value={nx ? fmtDate(nx.startDate) : '—'} sub={nx ? <JobRef id={nx.id} /> : ''} /> })()}
      </div>
      <div className="grid lg:grid-cols-[380px_1fr] gap-5">
        <div>
          <Segmented className="mb-3" value={tab} onChange={setTab} options={[{ value: 'review', label: 'To review' }, { value: 'approved', label: 'Approved' }, { value: 'all', label: 'All' }]} />
          <div className="card p-0 overflow-hidden max-h-[70vh] overflow-y-auto">{list.map(j => { const cr = byId(db.equipment, j.craneId); const c = liftCheck(j, cr); return (
            <button key={j.id} onClick={() => setSel(j.id)} data-testid="lift-row" className={cn('w-full text-left flex items-center gap-3 px-4 py-3 border-b hairline last:border-0 hover:bg-surface-2', sel === j.id && 'bg-surface-2')}>
              <div className="flex-1 min-w-0"><div className="font-semibold truncate text-sm">#{j.jobNo} · {customerOf(db, j).name}</div><div className="text-xs text-muted truncate">{cr ? `Crane ${cr.unit} · ${cr.capacity}t` : 'No crane'} · {fmtDate(j.startDate)}</div></div>
              {c && <span className={cn('text-xs num font-semibold', c.tone === 'ok' ? 'text-ok' : c.tone === 'warn' ? 'text-warn' : 'text-bad')}>{Math.round(c.pct * 100)}%</span>}
              <Badge tone={j.liftPlan === 'Approved' ? 'ok' : j.liftPlan === 'Missing' ? 'bad' : 'warn'}>{j.liftPlan}</Badge>
            </button>) })}{!list.length && <Empty title="All lift plans signed off" />}</div>
        </div>
        {cur ? <LiftPlan key={cur.id} job={cur} canApprove={['owner', 'ops', 'safety'].includes(role ?? '')} /> : <Empty title="Pick a lift" />}
      </div>
    </div>
  )
}

function LiftPlan({ job, canApprove }: { job: T.Job; canApprove: boolean }) {
  const db = useStore(s => s.db)
  const crane = byId(db.equipment, job.craneId)
  const base = job.lift ?? { load: Math.round((crane?.capacity ?? 100) * 0.18), rigging: 3, radius: 60, boom: 120 }
  const [lift, setLift] = useState(base)
  const [soil, setSoil] = useState(1)
  const [mats, setMats] = useState(3)
  const [windLim, setWindLim] = useState(job.type === 'Wind' ? 20 : 30)
  const [checks, setChecks] = useState<Record<string, boolean>>(job.liftPlan === 'Approved' ? { a: true, b: true, c: true, d: true, e: true } : { a: true })
  const draft = { ...job, lift }
  const lc = liftCheck(draft, crane)
  const matSqft = mats * 4 * 16
  const gb = useMemo(() => groundBearing(crane, lift, matSqft), [crane, lift, matSqft])
  const allow = SOILS[soil].psf
  const gbPct = gb.psf / allow
  const set = (k: keyof typeof lift) => (e: React.ChangeEvent<HTMLInputElement>) => setLift({ ...lift, [k]: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 })
  const CHECKS = [['a', 'Load weight verified (BOL / manufacturer data)'], ['b', 'Rigging inspected & rated for the load'], ['c', 'Site walked: power lines, underground, swing radius'], ['d', `Wind limit set at ${windLim} mph — anemometer on boom tip`], ['e', 'Lift director, signal person and crew briefed (JSA signed)']]
  const ok = lc && lc.pct < 0.9 && gbPct < 0.9 && lift.radius < lift.boom && CHECKS.every(([k]) => checks[k])
  const critical = !!lc && lc.pct >= 0.75
  return (
    <div className="flex flex-col gap-4" data-testid="lift-plan">
      <Card>
        <div className="flex items-start gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-surface-2"><Ruler className="size-5" /></div>
          <div className="flex-1 min-w-0"><div className="display text-xl font-semibold">Lift plan — <JobRef id={job.id} /></div><div className="text-sm text-muted"><CustRef id={job.customerId} /> · {siteOf(db, job).name} · {crane ? <EqRef id={crane.id} /> : 'no crane'} {crane && `· ${crane.make} ${crane.model}`}</div></div>
          {critical && <Badge tone="warn"><AlertTriangle className="size-3" />Critical lift</Badge>}
          <Badge tone={job.liftPlan === 'Approved' ? 'ok' : 'warn'}>{job.liftPlan}</Badge>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <Field label="Load (tons)"><input className="input num" inputMode="decimal" value={lift.load} onChange={set('load')} data-testid="lift-load" /></Field>
          <Field label="Rigging (tons)"><input className="input num" inputMode="decimal" value={lift.rigging} onChange={set('rigging')} /></Field>
          <Field label="Radius (ft)"><input className="input num" inputMode="decimal" value={lift.radius} onChange={set('radius')} data-testid="lift-radius" /></Field>
          <Field label="Boom (ft)"><input className="input num" inputMode="decimal" value={lift.boom} onChange={set('boom')} /></Field>
        </div>
      </Card>
      {lc && <Card><div className="label mb-1">Geometry</div><LiftSketch boom={lift.boom} radius={lift.radius} load={Math.round(lift.load + lift.rigging)} tone={lc.tone} />{lift.radius >= lift.boom && <div className="text-xs text-bad mt-1">Radius can’t exceed boom length — lengthen the boom or move the crane closer.</div>}</Card>}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <div className="label flex items-center gap-2"><Weight className="size-3.5" />Load chart</div>
          {lc ? <>
            <div className={cn('display text-5xl font-semibold num mt-2', lc.tone === 'ok' ? 'text-ok' : lc.tone === 'warn' ? 'text-warn' : 'text-bad')}>{Math.round(lc.pct * 100)}%</div>
            <div className="text-sm text-muted">{(lift.load + lift.rigging).toFixed(1)} t gross vs {Math.round(lc.capAtR)} t rated at {lift.radius} ft</div>
            <Progress value={Math.min(100, lc.pct * 100)} tone={lc.tone} className="h-2.5 mt-3" />
            <div className="text-xs text-muted mt-2">{lc.pct >= 0.9 ? 'Over 90% — not allowed without engineering exception. Shorten radius or upsize the crane.' : lc.pct >= 0.75 ? 'Critical lift (75–90%): written plan, rigging review, lift director on site.' : 'Standard lift.'}</div>
          </> : <div className="text-sm text-muted mt-2">No crane on this job.</div>}
        </Card>
        <Card>
          <div className="label flex items-center gap-2"><ShieldCheck className="size-3.5" />Ground bearing</div>
          <div className={cn('display text-5xl font-semibold num mt-2', gbPct < 0.75 ? 'text-ok' : gbPct < 0.9 ? 'text-warn' : 'text-bad')}>{gb.psf.toLocaleString()}<span className="text-lg text-muted"> psf</span></div>
          <div className="text-sm text-muted">worst outrigger · {gb.total} t total on {mats} mats ({matSqft} ft²) · allowable {allow.toLocaleString()} psf</div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            <select className="input !h-9 text-sm" value={soil} onChange={e => setSoil(Number(e.target.value))}>{SOILS.map((s, i) => <option key={s.k} value={i}>{s.k}</option>)}</select>
            <select className="input !h-9 text-sm" value={mats} onChange={e => setMats(Number(e.target.value))}>{[1, 2, 3, 4, 6].map(n => <option key={n} value={n}>{n} mat{n > 1 ? 's' : ''} / outrigger (4×16)</option>)}</select>
          </div>
        </Card>
      </div>
      <Card>
        <div className="flex items-center gap-3 mb-3"><div className="label flex-1">Pre-lift checklist</div><span className="text-xs text-muted flex items-center gap-1.5"><Wind className="size-3.5" />Wind limit</span><select className="input !h-8 !w-24 text-sm" value={windLim} onChange={e => setWindLim(Number(e.target.value))}>{[15, 20, 25, 30].map(n => <option key={n} value={n}>{n} mph</option>)}</select></div>
        {CHECKS.map(([k, t]) => <button key={k} onClick={() => setChecks({ ...checks, [k]: !checks[k] })} className="w-full flex items-center gap-3 py-2 text-left text-sm"><span className={cn('grid size-6 place-items-center rounded-lg border', checks[k] ? 'bg-ok-solid border-transparent text-white' : 'border-line')}>{checks[k] && <Check className="size-4" />}</span>{t}</button>)}
        <div className="flex flex-wrap gap-2 mt-4">
          <Button onClick={() => { actions.updateJob(job.id, { lift }, 'Updated lift plan'); toast.success('Lift plan saved', { description: `#${job.jobNo} · ${lc ? Math.round(lc.pct * 100) + '% of chart' : ''}` }) }}>Save</Button>
          {canApprove && job.liftPlan !== 'Approved' && <Button variant="primary" icon={<FileCheck2 className="size-4" />} disabled={!ok} data-testid="lift-approve" onClick={() => { actions.updateJob(job.id, { lift, liftPlan: 'Approved', docs: [...job.docs, { id: uid('doc'), name: `Lift plan #${job.jobNo} rev ${String.fromCharCode(65 + job.docs.filter(d => d.kind === 'Lift Plan').length)}.pdf`, kind: 'Lift Plan', added: today(), by: useStore.getState().session?.name ?? 'Engineering' }] }, 'Approved lift plan'); toast.success('Lift plan approved', { description: 'Filed in the job documents · crew sees it on their phones' }) }}>{ok ? 'Approve & file plan' : 'Finish checks to approve'}</Button>}
        </div>
        <div className="text-[11px] text-faint mt-3">Demo approximation — always verify against the OEM load chart and a qualified engineer’s plan.</div>
      </Card>
    </div>
  )
}

/** Side-view sketch: boom length, angle and radius to scale, so a PM can sanity-check the geometry at a glance. */
function LiftSketch({ boom, radius, load, tone }: { boom: number; radius: number; load: number; tone: 'ok' | 'warn' | 'bad' }) {
  const W = 420, H = 230, px = 70, py = 190
  const R = Math.min(radius, boom * 0.98), hgt = Math.sqrt(Math.max(0, boom * boom - R * R))
  const sc = Math.min((W - px - 40) / Math.max(R, 1), (py - 24) / Math.max(hgt, 1))
  const tx = px + R * sc, ty = py - hgt * sc
  const ang = Math.round((Math.acos(R / boom) * 180) / Math.PI)
  const col = tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : 'var(--bad)'
  const loadY = Math.max(ty + 24, py - 44)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[460px] h-[220px] mx-auto block" data-testid="lift-sketch" role="img" aria-label={`Boom ${boom} ft at ${ang} degrees, ${radius} ft radius`}>
      <line x1="10" y1={py + 14} x2={W - 10} y2={py + 14} stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <rect x={px - 50} y={py - 6} width="86" height="16" rx="4" fill="currentColor" fillOpacity=".35" />
      <circle cx={px - 36} cy={py + 12} r="6" fill="currentColor" fillOpacity=".5" /><circle cx={px - 14} cy={py + 12} r="6" fill="currentColor" fillOpacity=".5" /><circle cx={px + 22} cy={py + 12} r="6" fill="currentColor" fillOpacity=".5" />
      <rect x={px - 30} y={py - 26} width="40" height="22" rx="3" fill="currentColor" fillOpacity=".55" />
      <line x1={px} y1={py - 10} x2={tx} y2={ty} stroke={col} strokeWidth="7" strokeLinecap="round" />
      <line x1={tx} y1={ty} x2={tx} y2={loadY} stroke="currentColor" strokeOpacity=".7" strokeWidth="1.5" strokeDasharray="3 3" />
      <rect x={tx - 16} y={loadY} width="32" height="20" rx="3" fill={col} fillOpacity=".85" />
      <text x={tx} y={loadY + 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">{load}t</text>
      <line x1={px} y1={py + 26} x2={tx} y2={py + 26} stroke="currentColor" strokeOpacity=".6" markerEnd="url(#ar)" markerStart="url(#ar)" />
      <text x={(px + tx) / 2} y={py + 38} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity=".8">radius {radius} ft</text>
      <text x={(px + tx) / 2 - 14} y={(py + ty) / 2 - 8} fontSize="11" fill="currentColor" fillOpacity=".85" transform={`rotate(${-ang} ${(px + tx) / 2 - 14} ${(py + ty) / 2 - 8})`}>boom {boom} ft</text>
      <text x={px + 18} y={py - 18} fontSize="11" fill="currentColor" fillOpacity=".7">{ang}°</text>
      <defs><marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="currentColor" fillOpacity=".6" /></marker></defs>
    </svg>
  )
}
