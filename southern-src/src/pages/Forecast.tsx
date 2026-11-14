import { useMemo, useState } from 'react'
import { jobCranes, busyWindow, craneClashDay, sharedOn, phaseOn, planFor, rigWindow, PHASE_LABEL, type RigPhase } from '../data/rig'
import { useStore } from '../data/store'
import { inScope, isLive, customerOf, byId } from '../data/logic'
import { today, addDays, range, dow, cn, fmtDate, diffDays } from '../lib/util'
import { PageHeader, Segmented, Badge } from '../components/ui'
import type * as T from '../data/types'
import { useSchedStyle, outOfState, divMark, phaseCat } from '../data/schedColors'
import { SchedLegend } from '../components/SchedLegend'

/** Stack overlapping bookings into lanes so nothing garbles; overlaps are real conflicts. */
function lanes(bk: T.Job[]) {
  const out: T.Job[][] = []
  bk.slice().sort((a, b) => a.startDate.localeCompare(b.startDate)).forEach(j => {
    const lane = out.find(l => l.every(x => x.endDate < j.startDate || x.startDate > j.endDate))
    if (lane) lane.push(j); else out.push([j])
  })
  return out
}

export default function Forecast() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const [span, setSpan] = useState<'30' | '60' | '120'>('30')
  const st = useSchedStyle()
  const days = range(today(), addDays(today(), Number(span) - 1))
  const last = days[days.length - 1]
  const cranes = db.equipment.filter(e => e.category === 'Crane' && inScope(e, f)).sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
  const jobs = useMemo(() => db.jobs.filter(j => (isLive(j) || j.stage === 'Awarded') && jobCranes(j).length && j.status !== 'Complete'), [db.jobs])
  // one booking per crane per job, stretched over move-in / rig-up / rig-down (assist cranes too)
  const booksOf = (cid: string) => jobs.filter(j => jobCranes(j).includes(cid)).map(j => { const w = busyWindow(j, cid)!; const p = planFor(j, cid); const rw = p ? rigWindow(p) : undefined; return { ...j, startDate: rw ? rw.from : w.from, endDate: rw ? rw.to : w.to, orig: j } })
  const freeToday = cranes.filter(c => c.status !== 'Maintenance' && c.status !== 'Out of Service' && !booksOf(c.id).some(j => j.startDate <= today() && j.endDate >= today())).length
  const cell = 100 / days.length
  const idx = (d: string) => Math.max(0, Math.min(days.length - 1, diffDays(d, days[0])))
  const showDays = span === '30'
  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader eyebrow="Crane availability" title="Forecast" sub={`${freeToday} of ${cranes.length} cranes free today · dashed = open time to sell · hatched = awarded, not yet scheduled`} actions={<Segmented value={span} onChange={setSpan} options={[{ value: '30', label: '30 days' }, { value: '60', label: '60 days' }, { value: '120', label: '120 days' }]} />} />
      <SchedLegend size="md" className="mb-3" cats={['working', 'moving', 'travel', 'outstate', 'open', 'off', 'conflict']} />
      <div className="card p-0 overflow-x-auto" data-testid="forecast">
        <div className="min-w-[900px]">
          <div className="flex border-b hairline sticky top-0 bg-surface z-10"><div className="w-48 shrink-0 px-4 py-2 text-xs font-semibold text-muted sticky left-0 z-20 bg-surface" data-testid="fc-head-crane">Crane</div><div className="flex-1 flex">{days.map((d, i) => <div key={d} className={cn('flex-1 text-center py-2 text-[10px] font-semibold', ['Sat', 'Sun'].includes(dow(d)) ? 'text-faint' : 'text-muted', d === today() && 'text-accent')}>{showDays ? <>{dow(d)[0]}<div className="num">{d.slice(8)}</div></> : d.slice(8) === '01' || i === 0 ? <div className="whitespace-nowrap">{fmtDate(d, { month: 'short' })}</div> : null}</div>)}</div></div>
          {cranes.map(c => {
            const bk = booksOf(c.id).filter(j => j.endDate >= days[0] && j.startDate <= last)
            const down = c.status === 'Maintenance' || c.status === 'Out of Service'
            const L = lanes(bk)
            const conflict = L.length > 1 && (bk.some(j => !isLive(j)) || !!craneClashDay(db, c.id, days[0], last)) // dive3 B1: same rule as the board — overlapping dates alone isn't a clash if both jobs set non-overlapping hours
            // open gaps (≥2 days) between bookings
            const booked = new Set(bk.flatMap(j => range(j.startDate < days[0] ? days[0] : j.startDate, j.endDate > last ? last : j.endDate)))
            const gaps: { s: number; n: number }[] = []
            let run = -1
            // dive3 M8: a down crane isn't available until the shop's return date (open work order due date), or at all if none
            const backOn = down ? db.workOrders.filter(w => w.unitId === c.id && w.status !== 'Closed').map(w => w.due).sort().at(-1) : undefined
            days.forEach((d, i) => { const free = !booked.has(d) && !(down && (!backOn || d <= backOn)); void i; if (free && run < 0) run = i; if ((!free || i === days.length - 1) && run >= 0) { const end = free ? i : i - 1; if (end - run + 1 >= 2) gaps.push({ s: run, n: end - run + 1 }); run = -1 } })
            const needsWork = !down && gaps.some(g => g.s <= 2 && g.n >= 5)
            // dive3 M8: down until the shop's return date (or the whole span when there is none); a booking inside that window is a conflict
            const downTo = down ? (backOn && backOn < last ? backOn : last) : undefined
            const onDown = (j: { startDate: string }) => !!downTo && j.startDate <= downTo
            const bookedDown = bk.some(onDown)
            // dive3 M8: does THIS pair clash on any shared day (hours, phases, drive time) — not just "something on this crane clashes"
            const pairClash = (j: T.Job, x: T.Job) => { const a0 = x.startDate > j.startDate ? x.startDate : j.startDate, b0 = x.endDate < j.endDate ? x.endDate : j.endDate
              const jo = (j as T.Job & { orig?: T.Job }).orig ?? j, xo = (x as T.Job & { orig?: T.Job }).orig ?? x
              if (j.stage === 'Awarded' || x.stage === 'Awarded') return true
              return range(a0 < days[0] ? days[0] : a0, b0 > last ? last : b0).some(d => sharedOn(db, jo, c.id, d).some(s => s.job.id === xo.id && s.clash)) }
            const rowH = Math.max(1, L.length) * 34 + 12
            return (
              <div key={c.id} data-testid="fc-row" data-crane={c.id} className="flex border-b hairline last:border-0 items-stretch" style={{ minHeight: rowH }}>
                <button onClick={() => open({ type: 'equipment', id: c.id })} className="w-48 shrink-0 px-4 py-2.5 text-left hover:bg-surface-2 sticky left-0 z-[5] bg-surface border-r hairline" data-testid="fc-crane-cell">
                  <div className="font-semibold text-sm"><span className="num">{c.unit}</span> · {c.capacity}t</div>
                  <div className="text-[11px] text-muted truncate">{c.make} {c.model} · {byId(db.branches, c.branchId)?.code}</div>
                  {needsWork && <div className="mt-1"><Badge tone="bad">Needs work now</Badge></div>}
                  {conflict && <div className="mt-1"><Badge tone="bad">Double-booked</Badge></div>}
                  {bookedDown && <div className="mt-1"><Badge tone="bad" data-testid="fc-booked-down">Booked while down</Badge></div>}
                </button>
                <div className="flex-1 relative">
                  {days.map((d, i) => ['Sat', 'Sun'].includes(dow(d)) && showDays && <div key={d} className="absolute inset-y-0 bg-surface-2/60" style={{ left: `${i * cell}%`, width: `${cell}%` }} />)}
                  {gaps.map(g => <div key={g.s} data-testid="fc-gap" data-cat="open" className="absolute inset-y-2 rounded-lg border-2 border-dashed border-current/40 text-[10px] font-bold uppercase tracking-wide px-2 flex items-center overflow-hidden whitespace-nowrap" style={{ ...st('open'), left: `${g.s * cell}%`, width: `${g.n * cell}%` }}>{g.n * cell > 6 ? `Available · ${g.n} days` : ''}</div>)}
                  {down && downTo && <div data-cat="off" data-testid="fc-down" className="absolute inset-y-2 left-0 rounded-lg border hairline text-[11px] font-semibold px-2 flex items-center overflow-hidden whitespace-nowrap" style={{ ...st('off'), width: `${(idx(downTo) + 1) * cell}%` }}>{c.status}{backOn ? ` · back ${fmtDate(backOn)}` : ' · no return date'}</div>}
                  {L.map((lane, li) => lane.map(j => {
                    const s = idx(j.startDate < days[0] ? days[0] : j.startDate), e = idx(j.endDate > last ? last : j.endDate)
                    // dive3 M8: hours-aware — only the pairs that really clash go red (two half-day bookings stay normal)
                    const overlaps = onDown(j) || (conflict && bk.some(x => x.id !== j.id && x.startDate <= j.endDate && x.endDate >= j.startDate && pairClash(j, x)))
                    // dive3 M8: one segment per rig phase (move-in / rig-up / rig-down), coloured like the legend
                    const segs: { a: number; b: number; ph: RigPhase }[] = []
                    if (!overlaps) for (let k = s; k <= e; k++) { const ph = phaseOn((j as T.Job & { orig?: T.Job }).orig ?? j, c.id, days[k]); if (!ph) continue; const L0 = segs.at(-1); if (L0 && L0.ph === ph && L0.b === k - 1) L0.b = k; else segs.push({ a: k, b: k, ph }) }
                    const divColor = divMark(db.divisions.find(d => d.id === j.divisionId)?.color)
                    const cat = overlaps ? 'conflict' as const : outOfState(db, j, c.branchId) ? 'outstate' as const : 'working' as const, cs = st(cat), awarded = !overlaps && j.stage === 'Awarded'
                    return (
                      <button key={j.id} data-testid="fc-bar" data-job={j.jobNo} data-cat={awarded ? 'awarded' : cat} onClick={() => open({ type: 'job', id: j.id })} title={`#${j.jobNo} ${customerOf(db, j).name} ${fmtDate(j.startDate)}–${fmtDate(j.endDate)}`}
                        className={cn('absolute rounded-lg px-2 text-[11px] font-semibold truncate text-left hover:brightness-110 transition border', awarded ? 'text-ink border-line' : 'border-black/10')}
                        style={{ ...(awarded ? { backgroundImage: 'repeating-linear-gradient(135deg, var(--surface-3) 0 6px, transparent 6px 12px)' } : cs), top: 6 + li * 34, height: 28, left: `${s * cell}%`, width: `${(e - s + 1) * cell}%`, boxShadow: overlaps ? undefined : `inset 4px 0 0 ${divColor}` }}>
                        {segs.filter(g => g.ph !== 'work').map(g => <span key={g.a} data-testid="fc-seg" data-phase={g.ph} title={PHASE_LABEL[g.ph]} className="absolute inset-y-0 rounded-md pointer-events-none" style={{ ...st(phaseCat(g.ph)), left: `${((g.a - s) / (e - s + 1)) * 100}%`, width: `${((g.b - g.a + 1) / (e - s + 1)) * 100}%` }} />)}
                        <span className="relative">#{j.jobNo} {customerOf(db, j).name}</span>
                      </button>
                    )
                  }))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
