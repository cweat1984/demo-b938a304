import { useId, useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
class MousePointerSensor extends PointerSensor {
  static activators = [{ eventName: 'onPointerDown' as const, handler: ({ nativeEvent: e }: { nativeEvent: PointerEvent }) => e.pointerType !== 'touch' && e.isPrimary && e.button === 0 }]
}
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, AlertTriangle, Construction, X, Search, PanelRightClose, PanelRightOpen, Plane, Users, Clock, MapPin, Check } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions, annualExpired } from '../data/store'
import { divMark } from '../data/schedColors'
import { jobsOn, inScope, byId, fullName, crewOn, jobConflicts, requiredPositions, availablePool, eligibility, defaultPosition, customerOf, siteOf, workStatus, craftFits, isField } from '../data/logic'
import { today, addDays, dow, fmtDate, cn, range } from '../lib/util'
import { Button, Badge, Segmented, Avatar, Modal, confirmChoice, Empty } from '../components/ui'
import FixCrew, { type FixTarget } from '../components/FixCrew'
import { absenceOn } from '../data/logic'
import { distMiles } from '../data/seed'
import { JOB_STATUS_TONE } from '../components/bits'
import { liftCheck } from '../components/JobView'
import { useMoves } from '../data/moves'
import { OutsideTag } from '../components/OutsideCranes'
import { outsideOn, vendorOf, outsidePhase, sharedOn, hoursOf, fmtHours, jobCranes, phaseOn, plansOf, craneDay, fmtDown, PHASE_LABEL, firstClash, type RigPhase } from '../data/rig'
import { PhaseBadge } from '../components/JobRig'
import { BoardExtras } from '../components/JobExtras'

type DragData = { empId: string; fromJobId?: string; position?: T.CrewPosition }

export default function Dispatch() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const setUI = useStore(s => s.setUI)
  const [date, setDate] = useState(today())
  const [onlyIssues, setOnlyIssues] = useState(false)
  const [rail, setRail] = useState(true)
  const [drag, setDrag] = useState<DragData | null>(null)
  const [craneFor, setCraneFor] = useState<T.Job | null>(() => { try { const i = JSON.parse(sessionStorage.getItem('sc-bd-intent') ?? 'null'); if (i?.kind === 'swap') { sessionStorage.removeItem('sc-bd-intent'); return useStore.getState().db.jobs.find(j => j.id === i.jobId) ?? null } } catch { /* */ } return null }) // dive3 m8: from a breakdown
  const [fix, setFix] = useState<FixTarget | null>(null)
  const [compact, setCompact] = useState(false)
  // dive2 devices M4: mouse/pen drag right away; touch needs a long-press, so a swipe that starts on a chip scrolls the board
  const sensors = useSensors(useSensor(MousePointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }))
  const jobs = useMemo(() => jobsOn(db, date).filter(j => inScope(j, f)).sort((a, b) => a.startTime.localeCompare(b.startTime) || a.jobNo.localeCompare(b.jobNo)), [db, date, f])
  const conflicts = useMemo(() => new Map(jobs.map(j => [j.id, jobConflicts(db, j, date)])), [jobs, db, date])
  const issueCount = [...conflicts.values()].reduce((s, c) => s + c.filter(x => x.level === 'red').length, 0)
  const gaps = [...conflicts.values()].reduce((s, c) => s + c.filter(x => x.text.startsWith('Crew gap')).length, 0)
  const shown = onlyIssues ? jobs.filter(j => conflicts.get(j.id)!.length) : jobs
  const week = range(addDays(date, -3), addDays(date, 3))

  const doAssign = async (d: DragData, job: T.Job, position?: T.CrewPosition) => {
    const e = byId(db.employees, d.empId)!
    if (d.fromJobId === job.id) return
    const pos = position ?? (requiredPositions(job, date).find(p => craftFits(e, p) && crewOn(db, job.id, date).filter(a => a.position === p).length < requiredPositions(job, date).filter(x => x === p).length) ?? defaultPosition(e))
    const el = eligibility(db, e.id, job, date, pos)
    if (!el.ok) {
      const r = await confirmChoice(`${fullName(e)} can’t legally fill this slot`, <div className="flex flex-col gap-1">{el.blocks.map(b => <div key={b} className="text-bad font-medium">• {b}</div>)}<div className="mt-2">Job #{job.jobNo} also asks every crew member for: {job.requiredCerts.join(', ') || 'no extra site certs'}.</div></div>, [{ label: 'Pick someone else', value: 'no', tone: 'primary' as const }])
      void r; return
    }
    const from = d.fromJobId ? byId(db.jobs, d.fromJobId) : undefined
    const other = !from ? db.assignments.find(a => a.employeeId === e.id && a.date === date && a.jobId !== job.id) : undefined
    const removing = from ?? (other ? byId(db.jobs, other.jobId) : undefined)
    const r = await confirmChoice(
      removing ? `Move ${fullName(e)}?` : `Assign ${fullName(e)} as ${pos}?`,
      <div className="flex flex-col gap-2">
        {removing && <div>This removes {e.first} from <b className="text-ink">Job #{removing.jobNo} · {customerOf(db, removing).name}</b>. Dispatch must confirm.</div>}
        <div>To <b className="text-ink">Job #{job.jobNo} · {customerOf(db, job).name}</b> ({siteOf(db, job).city}).</div>
        {(() => { const b = byId(db.branches, e.branchId); const st = siteOf(db, job); if (!b) return null; const mi = Math.round(distMiles([b.lat, b.lng], [st.lat, st.lng]) * 1.2); return <div className={cn('rounded-xl px-3 py-2 text-xs', mi > 75 ? 'bg-warn/10 text-warn' : 'bg-surface-2 text-muted')}>Home branch {b.code} · {mi} mi to site{mi > 150 ? ' · needs Hotel per diem + travel day' : mi > 75 ? ' · Hotel per diem' : mi > 40 ? ' · daily truck' : ' · local'}</div> })()}
        {el.warns.map(w => <div key={w} className="text-warn">⚠ {w}</div>)}
      </div>,
      [{ label: `${fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })} only`, value: 'day', tone: 'primary' as const }, { label: `Rest of job (through ${fmtDate(job.endDate)})`, value: 'rest' }],
    )
    if (!r) return
    actions.assign(job.id, date, e.id, pos, { restOfJob: r.value === 'rest', fromJobId: removing?.id })
    toast.success(`${fullName(e)} → #${job.jobNo}`, { description: `${pos}${removing ? ` · removed from #${removing.jobNo}` : ''} · logged to audit trail` })
  }
  // dive3 dispatch M12: tap an open slot to pick someone (no drag needed on phones)
  const pickFor = async (job: T.Job, position: T.CrewPosition) => {
    const pool = availablePool(db, date, f)
    const fits = [...pool.filter(e => craftFits(e, position)), ...pool.filter(e => !craftFits(e, position))].slice(0, 12)
    if (!fits.length) { toast.error('Nobody is available that day', { description: 'Check the Off / Traveling lists or widen the branch filter.' }); return }
    const r = await confirmChoice(`Fill ${position} · Job #${job.jobNo}`, <div data-testid="slot-pick">Pick who fills this slot. Best craft match first.</div>,
      fits.map((e, i) => ({ label: `${fullName(e)}${craftFits(e, position) ? '' : ' (other craft)'}`, value: e.id, tone: i === 0 ? 'primary' as const : undefined })))
    if (!r) return
    await doAssign({ empId: r.value }, job, position)
  }
  const doRemove = async (empId: string, job: T.Job) => {
    const e = byId(db.employees, empId)!
    const r = await confirmChoice(`Remove ${fullName(e)} from Job #${job.jobNo}?`, `${e.first} goes back to the available pool. This change is recorded in the audit trail.`, [{ label: `Remove for ${fmtDate(date)} only`, value: 'day', tone: 'danger' as const }, { label: 'Remove for the rest of the job', value: 'rest', tone: 'danger' as const }])
    if (!r) return
    actions.unassign(job.id, date, empId, r.value === 'rest')
    toast(`${fullName(e)} returned to pool`)
  }
  const onStart = (ev: DragStartEvent) => setDrag(ev.active.data.current as DragData)
  const onEnd = (ev: DragEndEvent) => {
    setDrag(null)
    const d = ev.active.data.current as DragData
    const over = ev.over?.data.current as { jobId?: string; position?: T.CrewPosition; pool?: boolean } | undefined
    if (!over) return
    if (over.pool && d.fromJobId) { doRemove(d.empId, byId(db.jobs, d.fromJobId)!); return }
    if (over.jobId) doAssign(d, byId(db.jobs, over.jobId)!, over.position)
  }

  return (
    <DndContext sensors={sensors} onDragStart={onStart} onDragEnd={onEnd} onDragCancel={() => setDrag(null)}>
      <div className="flex gap-5 max-w-[1700px] mx-auto">
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <PendingCalloffs />
          <div className="flex flex-wrap items-center gap-3">
            <div className="mr-auto">
              <div className="label">Dispatch board</div>
              <h1 className="display text-3xl md:text-4xl font-semibold tracking-tight mt-1">{date === today() ? 'Today' : dow(date)} · {fmtDate(date, { month: 'long', day: 'numeric' })}</h1>
            </div>
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setUI({ jobBuilder: {} })}>New job</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 min-w-0 max-w-full">
            <button className="btn-icon shrink-0" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft className="size-5" /></button>
            <div className="flex gap-1 overflow-x-auto scroll-thin snap-x min-w-0">
              {week.map(d => (
                <button key={d} onClick={() => setDate(d)} className={cn('snap-start shrink-0 rounded-2xl px-3 py-2 text-center min-w-12 sm:min-w-14 transition', d === date ? 'bg-accent text-accent-ink' : 'hover:bg-surface-2')}>
                  <div className="text-[10px] font-bold uppercase opacity-70">{dow(d)}</div>
                  <div className="font-semibold num">{d.slice(8)}</div>
                  {d === today() && <div className={cn('mx-auto mt-0.5 size-1 rounded-full', d === date ? 'bg-accent-ink' : 'bg-accent')} />}
                </button>
              ))}
            </div>
            <button className="btn-icon shrink-0" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight className="size-5" /></button>
            </div>
            {date !== today() && <Button size="sm" variant="ghost" onClick={() => setDate(today())}>Today</Button>}
            <div className="ml-auto flex items-center gap-2">
              <Segmented size="sm" value={compact ? 'compact' : 'cards'} onChange={v => setCompact(v === 'compact')} options={[{ value: 'cards', label: 'Cards' }, { value: 'compact', label: 'Compact' }]} />
              <button onClick={() => setOnlyIssues(!onlyIssues)} className={cn('rounded-full px-3 py-1.5 text-sm font-semibold inline-flex items-center gap-1.5 border transition', onlyIssues ? 'bg-bad-solid text-white border-transparent' : issueCount ? 'border-bad/40 text-bad bg-bad/10' : 'border-ok/40 text-ok bg-ok/10')} data-testid="issues-toggle">
                {issueCount ? <AlertTriangle className="size-4" /> : <Check className="size-4" />}{issueCount ? `${issueCount} conflict${issueCount > 1 ? 's' : ''}` : 'No conflicts'}{gaps ? ` · ${gaps} gap${gaps > 1 ? 's' : ''}` : ''}
              </button>
              <button className="btn-icon hidden xl:inline-flex" onClick={() => setRail(!rail)} aria-label="Toggle pool">{rail ? <PanelRightClose className="size-5" /> : <PanelRightOpen className="size-5" />}</button>
            </div>
          </div>
          <RiggingToday date={date} />
          {shown.length === 0 ? <Empty icon={<Construction className="size-8" />} title={onlyIssues ? 'Nothing needs fixing' : 'No jobs scheduled'} body="Build a job and it lands here with its crane and crew." action={<Button variant="primary" onClick={() => setUI({ jobBuilder: {} })}>New job</Button>} /> : (
            compact ? <CompactBoard jobs={shown} date={date} conflicts={conflicts} onFix={setFix} /> : <div className="grid gap-4 grid-cols-1 md:grid-cols-2 2xl:grid-cols-3">
              <AnimatePresence>{shown.map(j => <JobCard onFix={setFix} key={j.id} job={j} date={date} conflicts={conflicts.get(j.id)!} onOpen={() => open({ type: 'job', id: j.id })} onRemove={id => doRemove(id, j)} onCrane={() => setCraneFor(j)} onPick={p => pickFor(j, p)} dragging={!!drag} />)}</AnimatePresence>
            </div>
          )}
        </div>
        <AnimatePresence>{rail && <PoolRail date={date} />}</AnimatePresence>
      </div>
      <div className="xl:hidden"><MobilePool date={date} /></div>
      <DragOverlay dropAnimation={null}>{drag && <PersonChip empId={drag.empId} overlay />}</DragOverlay>
      <CranePicker job={craneFor} date={date} onClose={() => setCraneFor(null)} />
      <FixCrew target={fix} onClose={() => setFix(null)} />
    </DndContext>
  )
}

function JobCard({ job, date, conflicts, onOpen, onRemove, onCrane, dragging, onFix, onPick }: { onPick: (p: T.CrewPosition) => void; onFix: (t: FixTarget) => void; job: T.Job; date: string; conflicts: ReturnType<typeof jobConflicts>; onOpen: () => void; onRemove: (id: string) => void; onCrane: () => void; dragging: boolean }) {
  // Same move status as Crane Moves / Equipment: a crane on an active move says where it's headed.
  const mv = useMoves(st => st.moves.find(m => m.status === 'In progress' && st.cranes.find(c => c.id === m.craneId)?.unit === byId(useStore.getState().db.equipment, job.craneId)?.unit))
  const db = useStore(s => s.db)
  const { setNodeRef, isOver } = useDroppable({ id: `job:${job.id}`, data: { jobId: job.id } })
  const crane = byId(db.equipment, job.craneId)
  const crew = crewOn(db, job.id, date)
  const need = requiredPositions(job, date)
  const reds = conflicts.filter(c => c.level === 'red')
  const [showIssues, setShowIssues] = useState(false)
  const div = byId(db.divisions, job.divisionId)
  const slots: { position: T.CrewPosition; a?: T.Assignment }[] = []
  const used = new Set<string>()
  need.forEach(p => { const a = crew.find(x => x.position === p && !used.has(x.id)); if (a) used.add(a.id); slots.push({ position: p, a }) })
  crew.filter(a => !used.has(a.id)).forEach(a => slots.push({ position: a.position, a }))
  const travel = db.travel.filter(t => t.jobId === job.id && t.date === date)
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} ref={setNodeRef} data-testid="job-card" data-job={job.jobNo}
      className={cn('card p-0 overflow-hidden transition', isOver && 'ring-2 ring-accent scale-[1.01]', dragging && !isOver && 'opacity-90', reds.length && 'border-bad/50')}>
      <div className="p-4 pb-3 flex items-start gap-3">
        <button onClick={onCrane} data-testid="card-crane" className="shrink-0 rounded-2xl bg-surface-2 hover:bg-surface-3 px-3 py-2 text-center min-w-[74px] transition" title="Swap crane">
          {crane ? <><div className="display text-2xl font-semibold leading-none num">{crane.unit}</div><div className="text-[10px] text-muted font-semibold mt-1">{crane.capacity}t {crane.type === 'Crawler' ? 'CRAWLER' : 'AT'}</div>{hoursOf(job, crane.id) && <div data-testid="tile-crane-hours" className="text-[11px] font-bold mt-1 num">{fmtHours(hoursOf(job, crane.id))}</div>}{mv && <div className="text-[10px] font-bold text-accent mt-1" data-testid="dispatch-moving" title={`Crane move in progress: #${mv.fromJobNo} → #${mv.toJobNo}`}>{mv.toJobNo === job.jobNo ? 'ARRIVING' : `MOVING → #${mv.toJobNo}`}</div>}</> : <><Users className="size-5 mx-auto text-muted" /><div className="text-[10px] text-muted font-semibold mt-1">CREW JOB</div></>}
        </button>
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2"><span className="size-2 rounded-full shrink-0" style={{ background: divMark(div?.color) }} title={div?.name} /><span className="text-xs font-bold text-muted num">#{job.jobNo}</span><Badge tone={JOB_STATUS_TONE[job.status]}>{job.status}</Badge></div>
          <div className="font-semibold leading-snug mt-1 truncate">{customerOf(db, job).name}</div>
          <RigTile job={job} date={date} />
          <MoreCranes job={job} />
          <CraneShared job={job} date={date} />
          <OutsideTile job={job} date={date} />
          <div className="text-xs text-muted mt-0.5 flex items-center gap-2 truncate"><MapPin className="size-3 shrink-0" />{siteOf(db, job).city}, {siteOf(db, job).state}<Clock className="size-3 shrink-0 ml-1" />{job.startTime}</div>
        </button>
      </div>
      {conflicts.length > 0 && (
        <button onClick={() => setShowIssues(!showIssues)} className={cn('mx-4 mb-2 w-[calc(100%-2rem)] rounded-xl px-3 py-2 text-left text-xs font-semibold flex items-center gap-2', reds.length ? 'bg-bad/10 text-bad' : 'bg-warn/10 text-warn')}>
          <AlertTriangle className="size-3.5 shrink-0" /><span className="flex-1 truncate">{conflicts[0].text}</span>{conflicts.length > 1 && <span>+{conflicts.length - 1}</span>}
        </button>
      )}
      {(() => { const c = conflicts.find(x => x.level === 'red' && x.empId && absenceOn(db, x.empId, date)); const a = c && crew.find(x => x.employeeId === c.empId); return c && a ? <div className="mx-4 mb-2 -mt-1"><Button size="sm" variant="primary" className="w-full" data-testid="board-fix" onClick={() => onFix({ jobId: job.id, empId: c.empId!, position: a.position, date })}>Fix — find a replacement</Button></div> : null })()}
      <AnimatePresence>{showIssues && conflicts.length > 1 && <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden px-4"><div className="pb-2 flex flex-col gap-1">{conflicts.slice(1).map((c, i) => <div key={i} className={cn('text-xs', c.level === 'red' ? 'text-bad' : 'text-warn')}>• {c.text}</div>)}</div></motion.div>}</AnimatePresence>
      <div className="px-4 pb-4 grid grid-cols-2 gap-1.5">
        {slots.map((s, i) => s.a ? (
          <PersonChip key={s.a.id} empId={s.a.employeeId} fromJobId={job.id} position={s.position} source={s.a.source} bad={conflicts.some(c => c.empId === s.a!.employeeId && c.level === 'red')} onRemove={() => onRemove(s.a!.employeeId)} />
        ) : <OpenSlot key={`open-${i}`} jobId={job.id} position={s.position} onPick={() => onPick(s.position)} />)}
      </div>
      <BoardExtras job={job} date={date} />
      {travel.length > 0 && <div className="px-4 pb-3 -mt-2 text-[11px] text-muted flex items-center gap-1.5"><Plane className="size-3" />{travel.length} traveling {travel[0].direction.toLowerCase()}</div>}
    </motion.div>
  )
}

function OpenSlot({ jobId, position, onPick }: { jobId: string; position: T.CrewPosition; onPick: () => void }) {
  const uid = useId()
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${jobId}:${position}:${uid}`, data: { jobId, position } })
  return <button type="button" data-testid="open-slot" onClick={onPick} ref={setNodeRef as never} className={cn('text-left rounded-xl border border-dashed px-2.5 py-2 text-xs font-semibold transition', isOver ? 'border-accent bg-accent/10 text-accent' : 'border-warn/50 text-warn bg-warn/5')}>+ {position}</button>
}

function PersonChip({ empId, fromJobId, position, source, bad, onRemove, overlay, sub }: { empId: string; fromJobId?: string; position?: T.CrewPosition; source?: T.Assignment['source']; bad?: boolean; onRemove?: () => void; overlay?: boolean; sub?: string }) {
  const db = useStore(s => s.db)
  const open = useStore(s => s.open)
  const e = byId(db.employees, empId)!
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `emp:${empId}:${fromJobId ?? 'pool'}`, data: { empId, fromJobId, position }, disabled: overlay })
  return (
    <div ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : listeners)} {...(overlay ? {} : attributes)} data-testid="person-chip"
      className={cn('group relative flex items-center gap-2 rounded-xl px-2 py-1.5 text-left touch-manipulation select-none cursor-grab active:cursor-grabbing transition', bad ? 'bg-bad/10 ring-1 ring-bad/40' : 'bg-surface-2 hover:bg-surface-3', isDragging && 'opacity-30', overlay && 'shadow-2xl ring-2 ring-accent bg-surface w-56 rotate-2')}>
      <Avatar name={fullName(e)} size={26} />
      <span className="min-w-0 flex-1" onDoubleClick={() => open({ type: 'employee', id: e.id })} onClick={() => { if (matchMedia('(pointer: coarse)').matches) open({ type: 'employee', id: e.id }) }}>
        <span className="block text-xs font-semibold truncate">{e.first} {e.last[0]}.{source === 'Crane crew' && <Construction className="inline size-3 ml-1 text-muted" />}</span>
        <span className="block text-[10px] text-muted truncate">{sub ?? position ?? e.craft}{e.hallHand ? ' · Hall' : ''}</span>
      </span>
      {onRemove && <button onPointerDown={ev => ev.stopPropagation()} onClick={ev => { ev.stopPropagation(); onRemove() }} className="opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100 pointer-coarse:size-9 pointer-coarse:-my-1.5 pointer-coarse:-mr-1.5 size-5 grid place-items-center rounded-full hover:bg-bad/20 text-muted hover:text-bad transition" aria-label={`Remove ${e.first}`}><X className="size-3" /></button>}
    </div>
  )
}

function usePool(date: string) {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const avail = availablePool(db, date, f)
  const traveling = db.travel.filter(t => t.date === date && inScope(byId(db.employees, t.employeeId), f))
  const off = db.employees.filter(e => isField(e) && inScope(e, f) && ['Scheduled Off', 'Vacation / PTO', 'Training', 'Unavailable'].includes(workStatus(db, e.id, date)))
  return { avail, traveling, off, db }
}

function PoolBody({ date }: { date: string }) {
  const { avail, traveling, off, db } = usePool(date)
  const [tab, setTab] = useKeep<'avail' | 'travel' | 'off'>('dispatch:tab', 'avail')
  const [q, setQ] = useKeep('dispatch:q', '')
  const [craft, setCraft] = useState('All')
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', data: { pool: true } })
  const crafts = ['All', 'Operator', 'Rigger', 'Truck Driver', 'Supervisor', 'Oiler', 'Uptower Tech', 'Millwright']
  const list = avail.filter(e => (craft === 'All' || e.craft === craft) && `${e.first} ${e.last}`.toLowerCase().includes(q.toLowerCase()))
  return (
    <div ref={setNodeRef} className={cn('flex flex-col gap-3 h-full transition rounded-3xl', isOver && 'ring-2 ring-accent')}>
      <Segmented size="sm" value={tab} onChange={setTab} options={[{ value: 'avail', label: 'Available', count: avail.length }, { value: 'travel', label: 'Traveling', count: traveling.length }, { value: 'off', label: 'Off', count: off.length }]} />
      {tab === 'avail' && <>
        <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9 h-10" placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="flex gap-1 flex-wrap">{crafts.map(c => <button key={c} onClick={() => setCraft(c)} className={cn('rounded-full px-2.5 py-1 text-[11px] font-semibold transition', craft === c ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')}>{c}</button>)}</div>
        <div className="text-[11px] text-muted">Drag onto a job card or open slot. Drop a crew chip here to send them back.</div>
        <div className="flex flex-col gap-1.5 overflow-y-auto scroll-thin pr-1 flex-1 min-h-0" data-testid="pool">{list.map(e => <PersonChip key={e.id} empId={e.id} sub={`${e.craft} · ${byId(db.branches, e.branchId)?.code}`} />)}{!list.length && <div className="text-sm text-muted py-6 text-center">Nobody free matches.</div>}</div>
      </>}
      {tab === 'travel' && <div className="flex flex-col gap-2 overflow-y-auto scroll-thin">{traveling.map(t => { const e = byId(db.employees, t.employeeId)!; return (
        <div key={t.id} className="rounded-2xl bg-surface-2 p-3"><div className="flex items-center gap-2"><Avatar name={fullName(e)} size={26} /><span className="text-sm font-semibold flex-1">{fullName(e)}</span><Badge tone="accent">{t.direction}</Badge></div><div className="text-xs text-muted mt-1.5">{t.from} → {t.to}{t.truckId ? ` · Truck ${byId(db.equipment, t.truckId)?.unit}` : ''}</div></div>) })}{!traveling.length && <div className="text-sm text-muted py-6 text-center">No one traveling.</div>}</div>}
      {tab === 'off' && <div className="flex flex-col gap-1.5 overflow-y-auto scroll-thin">{off.map(e => <div key={e.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2 py-1.5"><Avatar name={fullName(e)} size={26} /><span className="text-xs font-semibold flex-1">{fullName(e)}</span><span className="text-[10px] text-muted">{workStatus(db, e.id, date)}</span></div>)}</div>}
    </div>
  )
}

function PoolRail({ date }: { date: string }) {
  return (
    <motion.aside initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="hidden xl:flex w-[300px] shrink-0 sticky top-20 self-start h-[calc(100vh-7rem)] card p-4 flex-col">
      <div className="font-semibold mb-3">Crew pool</div>
      <PoolBody date={date} />
    </motion.aside>
  )
}
function MobilePool({ date }: { date: string }) {
  const [open, setOpen] = useState(false)
  const { avail } = usePool(date)
  return <>
    <button onClick={() => setOpen(true)} className="fixed bottom-24 md:bottom-6 right-5 z-40 rounded-full bg-accent text-accent-ink shadow-xl px-5 h-12 font-semibold inline-flex items-center gap-2"><Users className="size-5" />Pool · {avail.length}</button>
    <AnimatePresence>{open && <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed inset-x-0 bottom-0 z-50 h-[60vh] bg-surface border-t hairline rounded-t-3xl p-4 flex flex-col shadow-2xl">
      <div className="flex items-center mb-3"><div className="font-semibold flex-1">Crew pool</div><button className="btn-icon" onClick={() => setOpen(false)} aria-label="Close pool"><X className="size-5" /></button></div>
      <PoolBody date={date} />
    </motion.div>}</AnimatePresence>
  </>
}

function CranePicker({ job, date, onClose }: { job: T.Job | null; date: string; onClose: () => void }) {
  const db = useStore(s => s.db)
  if (!job) return <Modal open={false} onClose={onClose}>{null}</Modal>
  const busy = new Set([...jobsOn(db, date).filter(j => j.id !== job.id).map(j => j.craneId), ...db.equipment.filter(e => e.category === 'Crane' && (() => { const c = craneDay(db, e.id, date); return c && c.job.id !== job.id })()).map(e => e.id)])
  // dive3 B1: same clash rule as the board, checked over every remaining day of the job (not only the board day)
  const fromD = date > job.startDate ? date : job.startDate
  const clashes = new Map(db.equipment.filter(c => c.category === 'Crane' && c.id !== job.craneId).map(c => [c.id, firstClash(db, job, c.id, fromD, job.endDate)] as const))
  const cranes = db.equipment.filter(c => c.category === 'Crane').sort((a, b) => Number(!!clashes.get(a.id)) - Number(!!clashes.get(b.id)) || Number(busy.has(a.id)) - Number(busy.has(b.id)) || (b.capacity ?? 0) - (a.capacity ?? 0))
  const pick = async (c: T.Equipment) => {
    // Safety gate: load chart check vs this job's pick, explicit confirm, and operator re-check for the new crane.
    const lc = liftCheck(job, c)
    if (lc && lc.pct > 1) { toast.error(`Crane ${c.unit} is too small for this pick`, { description: `${Math.round(job.lift!.load + job.lift!.rigging)} t gross at ${job.lift!.radius} ft vs ${Math.round(lc.capAtR)} t rated — pick a bigger crane or revise the lift plan.` }); return }
    const swapped = { ...job, craneId: c.id }
    const ops = crewOn(db, job.id, date).filter(a => a.position === 'Operator').map(a => ({ a, el: eligibility(db, a.employeeId, swapped, date, 'Operator') })).filter(x => !x.el.ok)
    const ok = await confirmChoice(`Swap to crane ${c.unit}?`, <div className="flex flex-col gap-1" data-testid="swap-confirm">
      <div>Job #{job.jobNo} · Crane {byId(db.equipment, job.craneId)?.unit ?? '—'} → <b className="text-ink">{c.unit} ({c.capacity}t {c.model})</b>{job.status === 'On Site' ? ' — crew is ON SITE now' : ''}.</div>
      {lc ? <div className={lc.pct > 0.9 ? 'text-bad font-medium' : lc.pct > 0.75 ? 'text-warn' : ''}>Load chart: {Math.round(lc.pct * 100)}% of {Math.round(lc.capAtR)} t rated at {job.lift!.radius} ft{lc.pct > 0.75 ? ' — critical lift, engineered plan required' : ''}.</div> : <div className="text-warn">No lift data on this job — verify the load chart before swapping.</div>}
      {ops.map(x => <div key={x.a.id} className="text-bad">⚠ {fullName(byId(db.employees, x.a.employeeId))}: {x.el.blocks.join('; ')} — replace the operator after swapping.</div>)}
      {(() => { const k = clashes.get(c.id); return k ? <div className="text-bad font-medium" data-testid="swap-clash">⚠ Double-booked: crane {c.unit} is on Job #{k.job.jobNo} {fmtDate(k.d)} ({k.why}). Set non-overlapping hours on both jobs or pick another crane.</div> : null })()}
    </div>, [{ label: clashes.get(c.id) ? `Double-book crane ${c.unit}` : `Swap to crane ${c.unit}`, value: true, tone: clashes.get(c.id) ? 'danger' as const : 'primary' as const }])
    if (!ok) return
    const home = db.employees.filter(e => e.homeCraneId === c.id)
    const decisions: { empId: string; position: T.CrewPosition; decision: 'move' | 'keep' }[] = []
    onClose()
    // dive3 dispatch m9: ONE question for all of the crane's permanent crew who are busy elsewhere
    const busy: { e: T.Employee; a: T.Assignment }[] = []
    for (const e of home) {
      const elsewhere = db.assignments.find(a => a.employeeId === e.id && a.date === date && a.jobId !== job.id)
      if (!elsewhere) decisions.push({ empId: e.id, position: defaultPosition(e), decision: 'move' }); else busy.push({ e, a: elsewhere })
    }
    if (busy.length) {
      const one = busy.length === 1
      const r = await confirmChoice(one ? `${fullName(busy[0].e)} is ${c.unit}’s permanent ${busy[0].e.craft}` : `${busy.length} of ${c.unit}’s permanent crew are on other jobs`,
        <div className="flex flex-col gap-1.5" data-testid="perm-crew">{busy.map(({ e, a }) => <div key={e.id}>• <b className="text-ink">{fullName(e)}</b> ({e.craft}) · on Job #{byId(db.jobs, a.jobId)?.jobNo}</div>)}<div className="mt-1 text-xs">Move {one ? busy[0].e.first : 'them'} with the crane? Removing someone from an assignment needs Dispatch confirmation.</div></div>,
        [{ label: one ? `Move with crane ${c.unit}` : `Move all ${busy.length} with crane ${c.unit}`, value: 'move' as const, tone: 'primary' as const }, { label: one ? `Keep ${busy[0].e.first} where they are` : 'Keep them where they are', value: 'keep' as const }])
      if (r === null) return
      busy.forEach(({ e, a }) => decisions.push({ empId: e.id, position: a.position, decision: r.value }))
    }
    const res = actions.setCrane(job.id, c.id, decisions, date)
    if (res && 'blocked' in res && res.blocked) { toast.error(res.blocked); return } // dive3 shop M7
    toast.success(`Crane ${c.unit} → #${job.jobNo}`, { description: `${decisions.filter(d => d.decision === 'move').length} permanent crew followed the crane · your trucks were kept${res.skipped.length ? ` · not added (busy elsewhere): ${res.skipped.join(', ')}` : ''}` })
  }
  return (
    <Modal open={!!job} onClose={onClose} title={`Crane for #${job.jobNo}`} sub={`${customerOf(db, job).name} · ${fmtDate(date)}`} width={560}>
      <div className="flex flex-col gap-2">
        {cranes.map(c => {
          const isBusy = busy.has(c.id), down = c.status === 'Maintenance' || c.status === 'Out of Service' || annualExpired(c) // dive3 shop M7
          const lc = liftCheck(job, c), small = !!lc && lc.pct > 1
          return (
            <button key={c.id} disabled={down || small} data-testid="swap-crane" data-unit={c.unit} onClick={() => pick(c)} className={cn('rounded-2xl border p-3 flex items-center gap-3 text-left transition hover:bg-surface-2', c.id === job.craneId && 'border-accent', (down || small) && 'opacity-40')}>
              <span className="display text-xl font-semibold w-14 num">{c.unit}</span>
              <span className="flex-1 text-sm"><span className="font-semibold">{c.capacity}t {c.make} {c.model}</span><span className="block text-xs text-muted">{byId(db.branches, c.branchId)?.code} · {db.employees.filter(e => e.homeCraneId === c.id).map(e => e.first).join(', ') || 'No permanent crew'}</span></span>
              {c.id === job.craneId ? <Badge tone="accent">Current</Badge> : down ? <Badge tone="bad">{c.status === 'Maintenance' || c.status === 'Out of Service' ? c.status : 'Annual expired'}</Badge> : small ? <Badge tone="bad">Too small · {Math.round(lc!.capAtR)}t @ {job.lift!.radius} ft</Badge> : (() => { const k = clashes.get(c.id); return k ? <Badge tone="bad" data-testid="swap-badge-clash">Double-booked #{k.job.jobNo} · {fmtDate(k.d)}</Badge> : isBusy ? <Badge tone="info">Also on a job · hours don’t overlap</Badge> : <Badge tone="ok">Free</Badge> })()}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}

/** One row per crane: unit · customer · city · crew initials · status. Red only when something's wrong. */
function CompactBoard({ jobs, date, conflicts, onFix }: { jobs: T.Job[]; date: string; conflicts: Map<string, ReturnType<typeof jobConflicts>>; onFix: (t: FixTarget) => void }) {
  const db = useStore(s => s.db)
  const open = useStore(s => s.open)
  return (
    <div className="card p-0 overflow-hidden" data-testid="compact-board">
      {jobs.map(j => {
        const crane = byId(db.equipment, j.craneId); const crew = crewOn(db, j.id, date); const need = requiredPositions(j, date).length; const cf = conflicts.get(j.id) ?? []; const red = cf.find(c => c.level === 'red')
        const fixC = cf.find(x => x.level === 'red' && x.empId && absenceOn(db, x.empId, date)); const fixA = fixC && crew.find(x => x.employeeId === fixC.empId)
        return (
          <div key={j.id} className={cn('flex items-center gap-3 px-4 py-2.5 border-b hairline last:border-0 text-sm', red && 'bg-bad/[.06]')}>
            <button onClick={() => crane && open({ type: 'equipment', id: crane.id })} className="ref-link display text-lg font-semibold num w-14 shrink-0 text-left">{crane?.unit ?? '—'}{jobCranes(j).length > 1 && <span data-testid="compact-more-cranes" className="block text-[11px] font-semibold text-muted font-sans">+{jobCranes(j).length - 1} crane{jobCranes(j).length > 2 ? 's' : ''}</span>}</button>
            <button onClick={() => open({ type: 'job', id: j.id })} className="min-w-0 flex-1 text-left"><div className="font-semibold truncate">{customerOf(db, j).name}</div><div className="text-xs text-muted truncate">#{j.jobNo} · {siteOf(db, j).city}, {siteOf(db, j).state} · {j.startTime}</div></button>
            <div className="hidden md:flex -space-x-1.5 items-center">{crew.length > 6 && <span className="order-last ml-2.5 text-xs font-semibold text-muted">+{crew.length - 6}</span>}{crew.slice(0, 6).map(a => { const e = byId(db.employees, a.employeeId)!; return <button key={a.id} onClick={() => open({ type: 'employee', id: e.id })} title={`${fullName(e)} · ${a.position}`} className={cn('grid size-7 place-items-center rounded-full border-2 border-surface text-[10px] font-bold', cf.some(c => c.empId === e.id && c.level === 'red') ? 'bg-bad-solid text-white' : 'bg-surface-3')}>{e.first[0]}{e.last[0]}</button> })}</div>
            <span className={cn('text-xs font-semibold num w-10 text-right', crew.length < need ? 'text-warn' : 'text-muted')}>{crew.length}/{need}</span>
            <span className="w-40 hidden lg:block truncate text-xs">{red ? <span className="text-bad font-semibold">{red.text}</span> : cf[0] ? <span className="text-warn">{cf[0].text}</span> : <Badge tone={JOB_STATUS_TONE[j.status]}>{j.status}</Badge>}</span>
            {fixC && fixA ? <Button size="sm" variant="primary" onClick={() => onFix({ jobId: j.id, empId: fixC.empId!, position: fixA.position, date })}>Fix</Button> : <span className="w-[42px]" />}
          </div>
        )
      })}
    </div>
  )
}

/** Rig phase badges on a job tile for the board date (Annual-sheet colors: dark green = moving & rigging, light green = working). */
function RigTile({ job, date }: { job: T.Job; date: string }) {
  const db = useStore(s => s.db)
  const ps = plansOf(job); if (!ps.length) return null
  const items: { k: string; phase: RigPhase; text: string }[] = []
  for (const p of ps) {
    const u = byId(db.equipment, p.craneId)?.unit ?? ''; const ph = phaseOn(job, p.craneId, date)
    if (ph) items.push({ k: p.craneId + ph, phase: ph, text: `${PHASE_LABEL[ph]} · ${u}` })
    if (ph === 'work' && date === job.endDate) items.push({ k: p.craneId + 'next', phase: 'rigdown', text: `Rig down next · ${fmtDown(p)}` })
    if (ph === 'work' && date === p.hookReady) items.push({ k: p.craneId + 'hook', phase: 'work', text: `Hook ready today · ${u}` })
  }
  // several cranes in the same phase collapse into one badge ("Rig down · 4 cranes")
  const groups = new Map<string, { phase: RigPhase; head: string; units: string[] }>()
  for (const i of items) { const [head, u] = i.text.split(' · '); const g = groups.get(head) ?? { phase: i.phase, head, units: [] }; g.units.push(u); groups.set(head, g) }
  return groups.size ? <div className="flex flex-wrap gap-1 mt-1.5" data-testid="rig-tile">{[...groups.values()].map(g => <PhaseBadge key={g.head} phase={g.phase}>{g.head} · {g.units.length > 2 && !/ h$| d| days?$/.test(g.units[0]) ? `${g.units.length} cranes` : g.units.join(', ')}</PhaseBadge>)}</div> : null
}
/** Cranes moving in, rigging up or rigging down on the board date (not working days, so they aren't on a job tile). */
function RiggingToday({ date }: { date: string }) {
  const db = useStore(s => s.db), f = useStore(s => s.ui.filter), open = useStore(s => s.open)
  const rows = db.jobs.filter(j => plansOf(j).length && inScope(j, f)).flatMap(j => plansOf(j).map(p => ({ j, p, ph: phaseOn(j, p.craneId, date) }))).filter(x => x.ph && x.ph !== 'work')
  const outs = db.jobs.filter(j => inScope(j, f) && !jobsOn(db, date).some(x => x.id === j.id)).flatMap(j => outsideOn(j, date).map(o => ({ j, o })))
  if (!rows.length && !outs.length) return null
  return <div className="card p-4" data-testid="dispatch-rigging">
    <div className="label mb-2">Moving & rigging · {fmtDate(date)}</div>
    <div className="flex flex-wrap gap-2">{rows.map(({ j, p, ph }) => <button key={j.id + p.craneId} onClick={() => open({ type: 'job', id: j.id })} data-testid="rigging-item" data-phase={ph} className="rounded-2xl border hairline px-3 py-2 text-left flex items-center gap-3 min-h-[44px] hover:bg-surface-2">
      <span className="display text-xl font-semibold num">{byId(db.equipment, p.craneId)?.unit}</span>
      <span className="min-w-0"><span className="block text-sm font-semibold truncate">#{j.jobNo} · {customerOf(db, j).name}</span><span className="block mt-0.5"><PhaseBadge phase={ph!}>{ph === 'rigdown' ? `Rig down · ${fmtDown(p)}` : ph === 'rigup' ? `Rig up · hook ready ${fmtDate(p.hookReady)}` : `Moving in · hook ready ${fmtDate(p.hookReady)}`}</PhaseBadge></span></span>
    </button>)}{outs.map(({ j, o }) => <button key={o.id} onClick={() => open({ type: 'job', id: j.id })} data-testid="rigging-outside" className="rounded-2xl border-2 border-dashed border-[#7c3aed]/40 px-3 py-2 text-left flex items-center gap-3 min-h-[44px] hover:bg-surface-2"><OutsideTag /><span className="min-w-0"><span className="block text-sm font-semibold truncate">{vendorOf(db, o.vendorId)?.name} {o.size} · #{j.jobNo}</span><span className="block mt-0.5"><PhaseBadge phase={outsidePhase(o)}>{o.role}{o.hours ? ` · ${fmtHours(o.hours)}` : ''}</PhaseBadge></span></span></button>)}</div>
  </div>
}

/** Projects with several cranes: lead crane in the big button, the rest collapse to "+N cranes" and expand. */
function MoreCranes({ job }: { job: T.Job }) {
  const db = useStore(s => s.db), open = useStore(s => s.open)
  const [show, setShow] = useState(false)
  const extra = jobCranes(job).filter(c => c !== job.craneId)
  if (!extra.length) return null
  return <div className="mt-1.5" data-testid="more-cranes">
    <span role="button" tabIndex={0} data-testid="more-cranes-toggle" onClick={e => { e.stopPropagation(); setShow(!show) }} onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); setShow(!show) } }} className="inline-flex items-center h-7 pointer-coarse:h-[44px] px-2.5 rounded-full bg-surface-2 text-xs font-semibold cursor-pointer">+{extra.length} crane{extra.length > 1 ? 's' : ''} {show ? '▴' : '▾'}</span>
    {show && <div className="flex flex-wrap gap-1 mt-1.5" data-testid="more-cranes-list">{extra.map(id => { const e = byId(db.equipment, id); return <span key={id} role="button" tabIndex={0} data-testid="more-crane" onClick={ev => { ev.stopPropagation(); open({ type: 'equipment', id }) }} className="inline-flex items-center h-7 pointer-coarse:h-10 px-2.5 rounded-full border hairline text-xs font-semibold num cursor-pointer">{e?.unit ?? '—'} <span className="ml-1 text-muted font-normal">{e?.capacity}t</span></span> })}</div>}
  </div>
}

/** Same crane on other jobs that day (morning pick here, afternoon there) — info, or a warning when the hours overlap. Never blocks. */
function CraneShared({ job, date }: { job: T.Job; date: string }) {
  const db = useStore(s => s.db)
  const rows = jobCranes(job).flatMap(c => sharedOn(db, job, c, date).map(x => ({ c, ...x })))
  if (!rows.length) return null
  const shown = rows.slice(0, 3)
  return <div className="flex flex-col gap-1 mt-1.5" data-testid="crane-shared-tile">{shown.map(x => <span key={x.c + x.job.id} data-testid="crane-shared-item" data-clash={x.clash ? '1' : ''} className={cn('text-[11px] font-semibold leading-snug', x.clash ? 'text-warn' : 'text-info')}>{x.clash ? '⚠ ' : ''}Crane {byId(db.equipment, x.c)?.unit}: {x.text.replace(/^Also on /, 'also on ').replace(/^Time conflict: also on /, 'time conflict with ')}</span>)}{rows.length > 3 && <span className="text-[11px] text-muted">+{rows.length - 3} more</span>}</div>
}

/** Hired outside cranes working this job on the board date — OUTSIDE tag, vendor, size, role, hours, status. */
function OutsideTile({ job, date }: { job: T.Job; date: string }) {
  const db = useStore(s => s.db)
  const list = outsideOn(job, date); if (!list.length) return null
  return <div className="flex flex-col gap-1 mt-1.5" data-testid="outside-tile">{list.map(o => <span key={o.id} data-testid="outside-tile-item" className="flex items-center gap-1.5 text-[11px] font-semibold min-w-0"><OutsideTag /><span className="truncate">{vendorOf(db, o.vendorId)?.name ?? 'Vendor'} {o.size} · {o.role}{o.hours ? ` · ${fmtHours(o.hours)}` : ''} · {o.status}</span></span>)}</div>
}

/** Req H: support equipment the field asked to release — stays on the ticket until Picked up. */
function PendingCalloffs() {
  const db = useStore(s => s.db), open = useStore(s => s.open)
  const list = db.jobs.flatMap(j => (j.extras ?? []).filter(x => x.calloff && x.calloff.status !== 'Picked up').map(x => ({ j, x })))
  if (!list.length) return null
  return <div className="card p-3 border-warn/40" data-testid="pending-calloffs"><div className="label mb-2">Pending call-offs · {list.length}</div><div className="flex flex-wrap gap-2">{list.map(({ j, x }) => <button key={x.id} data-testid="pending-calloff" onClick={() => open({ type: 'job', id: j.id })} className="rounded-full border border-warn/40 bg-warn/10 px-3 min-h-9 pointer-coarse:min-h-[44px] text-sm">Job #{j.jobNo} · {x.qty} × {x.role} · {x.calloff!.status}</button>)}</div></div>
}
