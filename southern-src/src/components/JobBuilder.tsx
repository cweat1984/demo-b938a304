import { useEffect, useMemo, useRef, useState } from 'react'
import { pushOverlay, popOverlay } from '../lib/backstack'
import { parseNum, typing, LIMITS } from '../lib/num'
import { craneBusy } from '../data/rig'
import { unitConflict } from './JobUnits'
import { MapPin } from 'lucide-react'
import { useWind, mft, type WFarm } from '../data/wind'
import { FarmAutocomplete, TurbinePicker } from './WindPick'
import { toast } from 'sonner'
import { Check, ChevronLeft, Sparkles, AlertTriangle } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions, annualExpired } from '../data/store'
import { byId, fullName, isLive, defaultPosition, eligibility, workStatus, isField, craftFits } from '../data/logic'
import { today, addDays, range, money, cn, fmtDate, diffDays, uid } from '../lib/util'
import { Sheet, Button, Field, Badge, Segmented } from './ui'

const TYPES: T.JobType[] = ['Wind', 'Refinery', 'Industrial', 'Commercial', 'Power', 'Oil & Gas', 'Infrastructure', 'Heavy Haul', 'Uptower', 'Machine Moving']
function positionsFor(type: T.JobType, crane?: T.Equipment): T.CrewPosition[] {
  const cap = crane?.capacity ?? 0
  if (type === 'Heavy Haul') return ['Truck Driver', 'Truck Driver']
  if (type === 'Uptower') return ['Supervisor', 'Uptower Tech', 'Uptower Tech', 'Uptower Tech']
  if (type === 'Machine Moving') return ['Supervisor', 'Millwright', 'Millwright', 'Rigger']
  const p: T.CrewPosition[] = cap >= 400 || crane?.type === 'Crawler' ? ['Operator', 'Oiler', 'Rigger', 'Rigger', 'Truck Driver'] : cap >= 150 ? ['Operator', 'Rigger', 'Rigger', 'Truck Driver'] : ['Operator', 'Rigger']
  if (type === 'Wind' || cap >= 500) p.push('Supervisor')
  return p
}

const DRAFT_KEY = 'sc-jb-draft'
type Draft = Record<string, unknown> & { prefillKey?: string; step?: number }
function jbDraftLoad(): Draft | null { try { const r = sessionStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) as Draft : null } catch { return null } }
export function jbDraftClear() { try { sessionStorage.removeItem(DRAFT_KEY) } catch { /* private mode */ } }
function jbDraftDirty() { const d = jbDraftLoad(); return !!d && ((d.step ?? 0) > 0 || (d.customerId ?? '') !== (d.pfCu ?? '') || String(d.name ?? '').trim() !== String(d.pfName ?? '').trim()) }
const pfKey = (p?: Partial<T.Job>) => p ? JSON.stringify([p.customerId, p.siteId, p.name, p.craneId, p.windFarmId, p.startDate]) : ''

export default function JobBuilder() {
  const jb = useStore(s => s.ui.jobBuilder)
  const setUI = useStore(s => s.setUI)
  // dive3 M15: closing (X, Esc, back on step 1) keeps the half-built quote as a draft; reopening picks it up
  const close = () => {
    setUI({ jobBuilder: null })
    if (jbDraftDirty()) toast('Job Builder draft kept', { id: 'jb-draft', description: 'Open Job Builder again to carry on where you left off.', action: { label: 'Discard draft', onClick: () => { jbDraftClear(); toast.success('Draft discarded', { id: 'jb-draft' }) } } })
  }
  const back = useRef<null | (() => boolean)>(null)
  return <Sheet open={!!jb} onClose={close} onBack={() => { if (!back.current?.()) close() }} title="Job Builder" sub="Customer → crane → crew → quote. Everything downstream (dispatch, field app, job cost, invoice) builds from this once." width={720}>{jb && <Builder onDone={close} prefill={jb.prefill} backRef={back} />}</Sheet>
}

function Builder({ onDone, prefill, backRef }: { onDone: () => void; prefill?: Partial<T.Job>; backRef?: { current: null | (() => boolean) } }) {
  const db = useStore(s => s.db)
  const filter = useStore(s => s.ui.filter)
  // dive3 M15: the draft survives Back, closing the sheet and a reload (sessionStorage). A different prefill starts fresh.
  const [D] = useState<Draft | null>(() => { const d = jbDraftLoad(); return d && d.prefillKey === pfKey(prefill) && jbDraftDirty() ? d : null })
  const g = <V,>(k: string, v: V): V => (D && k in D ? D[k] as V : v)
  const [step, setStep] = useState<number>(g('step', 0))
  // dive3 M9/m10: no made-up defaults — pick (or quick-add) the customer and site; sites follow the customer
  const [customerId, setCustomer] = useState<string>(g('customerId', prefill?.customerId ?? ''))
  const [siteId, setSite] = useState<string>(g('siteId', prefill?.siteId ?? ''))
  const [type, setType] = useState<T.JobType>(g('type', prefill?.type ?? (prefill?.windFarmId ? 'Wind' : 'Industrial')))
  const [addCu, setAddCu] = useState<null | { name: string; contact: string; phone: string }>(null), [addSi, setAddSi] = useState<null | { name: string; city: string; state: string }>(null)
  const [farmId, setFarm] = useState<string | undefined>(g('farmId', prefill?.windFarmId ?? db.sites.find(x => x.id === (prefill?.siteId ?? db.sites[4].id))?.windFarmId))
  const [turbines, setTurbines] = useState<T.JobTurbine[]>(g('turbines', prefill?.turbines ?? []))
  const [pickT, setPickT] = useState(false)
  const [jobNotes, setJobNotes] = useState<string>(g('jobNotes', prefill?.notes ?? ''))
  const wind = useWind()
  const farm = farmId ? wind?.byId.get(farmId) : undefined
  const pickFarm = (f: WFarm | null) => {
    if (!f) { setFarm(undefined); setTurbines([]); return }
    setFarm(f.id); setTurbines([]); setSite(actions.ensureWindSite(f))
    const m = f.models[0]; if (m) setJobNotes(`${m.manu} ${m.model} · hub ${mft(m.hh)} · ${f.n} turbines`)
    if (type !== 'Wind' && type !== 'Uptower') setType('Wind')
  }
  const [divisionId, setDiv] = useState<string>(g('divisionId', filter.divisionId !== 'all' ? filter.divisionId : 'div-slh'))
  const [branchId, setBranch] = useState<string>(g('branchId', filter.branchId !== 'all' ? filter.branchId : 'br-okc'))
  const [name, setName] = useState<string>(g('name', prefill?.name ?? ''))
  const [start, setStart] = useState<string>(g('start', prefill?.startDate ?? addDays(today(), 3)))
  const [end, setEnd] = useState<string>(g('end', prefill?.endDate ?? addDays(today(), 7)))
  const [startTime, setStartTime] = useState<string>(g('startTime', '06:00'))
  const [craneId, setCrane] = useState<string | undefined>(g('craneId', prefill?.craneId))
  const [extra, setExtra] = useState<string[]>(g('extra', [])) // dive2 M5: more cranes on the same job
  const [hrsOn, setHrsOn] = useState(false), [hf, setHf] = useState('07:00'), [ht, setHt] = useState('12:00') // dive3 dispatch m6: hours for a shared crane
  const [configId, setConfig] = useState<string | undefined>(g('configId', undefined))
  const [crew, setCrew] = useState<{ empId: string; position: T.CrewPosition }[]>(g('crew', []))
  const [stage, setStage] = useState<T.JobStage>(g('stage', prefill?.stage ?? 'Scheduled'))
  const crane = byId(db.equipment, craneId)
  const days = Math.max(1, diffDays(end, start) + 1)
  const [rateOverride, setRate] = useState<string>(g('rateOverride', '')), [rateTouched, setTouched] = useState<boolean>(g('rateTouched', false))
  const defRate = crane?.dayRate ?? (type === 'Heavy Haul' ? 3800 : type === 'Uptower' ? 4200 : 4000)
  // dive3 M7: "4,500.50" is $4,500.50/day; junk or absurd numbers are refused with a message instead of silently reverting
  const rateP = rateTouched && rateOverride.trim() ? parseNum(rateOverride, { label: 'Day rate', cents: true, min: 1, max: LIMITS.dayRate }) : null
  const dayRate = rateP?.ok ? rateP.n : defRate
  const saved = useRef(false) // dive3 B2: one builder session creates at most one job
  useEffect(() => {
    if (saved.current) return
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ prefillKey: pfKey(prefill), pfCu: prefill?.customerId ?? '', pfName: prefill?.name ?? '', step, customerId, siteId, type, farmId, turbines, jobNotes, divisionId, branchId, name, start, end, startTime, craneId, extra, configId, crew, stage, rateOverride, rateTouched })) } catch { /* private mode */ }
  }, [prefill, step, customerId, siteId, type, farmId, turbines, jobNotes, divisionId, branchId, name, start, end, startTime, craneId, extra, configId, crew, stage, rateOverride, rateTouched])
  useEffect(() => { if (D) toast('Picked up your Job Builder draft', { id: 'jb-draft', action: { label: 'Start over', onClick: () => { jbDraftClear(); useStore.getState().setUI({ jobBuilder: null }); setTimeout(() => useStore.getState().setUI({ jobBuilder: { prefill } }), 50) } } }) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // dive3 M15: each step forward gets a history entry, so browser/Android back or the iOS edge swipe goes to the previous step
  const stepIds = useRef<number[]>([])
  const goStep = (n: number) => {
    if (n > step) { for (let k = step; k < n; k++) { const at = k; stepIds.current[at] = pushOverlay(() => { stepIds.current.length = at; setStep(at) }) } }
    else if (n < step) { const id = stepIds.current[n]; stepIds.current.length = n; if (id) popOverlay(id) }
    setStep(n)
  }
  if (backRef) backRef.current = () => { if (step > 0) { goStep(step - 1); return true } return false }
  // dive3 M8: every crane on the job is priced (its day rate × days + its own mob) and costed (internal cost/day) — the cost
  // budget is built from real costs (cranes, crew, mob, per diem), not a fixed 66% of the price.
  const mobOf = (c?: T.Equipment) => c ? (c.type === 'Crawler' ? 26000 : (c.capacity ?? 0) >= 300 ? 9000 : 3500) : type === 'Heavy Haul' ? 0 : 2500
  const alsoCranes = extra.map(id => byId(db.equipment, id)).filter((x): x is T.Equipment => !!x)
  const craneQ = [...(crane ? [{ c: crane, rate: dayRate, lead: true }] : []), ...alsoCranes.map(c => ({ c, rate: c.dayRate ?? 4000, lead: false }))]
  const mob = crane ? craneQ.reduce((s, q) => s + mobOf(q.c), 0) : mobOf(undefined)
  const totalDayRate = crane ? craneQ.reduce((s, q) => s + q.rate, 0) : dayRate
  const revenue = Math.round((totalDayRate * days + mob) * 100) / 100
  const crewN = positionsFor(type, crane).length + alsoCranes.length * 2 // each extra crane brings an operator + oiler/rigger
  const siteSt = byId(db.sites, siteId)?.state
  const costLines = [
    ...craneQ.map(q => ({ k: `Crane ${q.c.unit} ownership & fuel (${days} d)`, v: Math.round((q.c.costDay ?? q.rate * 0.36) * days) })),
    { k: `Crew labor (${crewN} × ${days} d, burdened)`, v: Math.round(crewN * days * 10.5 * 58 * 1.32) },
    { k: 'Mobilization / demob (trucks, permits, escorts)', v: Math.round(mob * 0.82) },
    { k: 'Per diem & lodging', v: crewN * days * (siteSt === 'OK' ? 45 : 140) },
  ].filter(x => x.v > 0)
  const priceLines = [
    ...(crane ? craneQ.map(q => ({ k: `${q.c.capacity}t ${q.c.type.toLowerCase()} (crane ${q.c.unit}), operated — ${days} day${days === 1 ? '' : 's'} × ${money(q.rate)}`, v: Math.round(q.rate * days * 100) / 100 })) : [{ k: `Crew & equipment — ${days} day${days === 1 ? '' : 's'} × ${money(dayRate)}`, v: dayRate * days }]),
    ...(mob ? [{ k: `Mobilization & demobilization${craneQ.length > 1 ? ` (${craneQ.length} cranes)` : ''}`, v: mob }] : []),
  ]
  const budget = costLines.reduce((s, x) => s + x.v, 0)
  const dates = range(start, end < start ? start : end > addDays(start, 365) ? addDays(start, 365) : end) // dive3 B4: never expand an unbounded span

  const craneRows = useMemo(() => db.equipment.filter(e => e.category === 'Crane').map(c => {
    const clash = craneBusy(db, c.id, undefined, { awarded: true }).find(w => !(w.to < start || w.from > end))?.job
    const down = c.status === 'Maintenance' || c.status === 'Out of Service' || annualExpired(c) // dive3 shop M7
    return { c, clash, down, ok: !down }
  }).sort((a, b) => Number(b.ok) - Number(a.ok) || (a.c.branchId === branchId ? -1 : 1) - (b.c.branchId === branchId ? -1 : 1) || (b.c.capacity ?? 0) - (a.c.capacity ?? 0)), [db, start, end, branchId])

  const autoCrew = (cid?: string) => {
    const cr = byId(db.equipment, cid)
    const pos = positionsFor(type, cr)
    const picks: { empId: string; position: T.CrewPosition }[] = []
    const used = new Set<string>()
    const fake: T.Job = { id: 'tmp', requiredCerts: type === 'Refinery' || type === 'Oil & Gas' ? ['OSHA 10', 'H2S Awareness'] : type === 'Uptower' ? ['Tower Rescue'] : ['OSHA 10'], craneId: cid, startDate: start, endDate: end } as T.Job
    const freeAll = (e: T.Employee) => dates.every(d => workStatus(db, e.id, d) === 'Available' || (workStatus(db, e.id, d) === 'Working' && false))
    pos.forEach(p => {
      const perm = db.employees.find(e => e.homeCraneId === cid && craftFits(e, p) && e.craft === (p === 'Oiler' ? 'Oiler' : p) && !used.has(e.id) && freeAll(e))
      const pool = db.employees.filter(e => isField(e) && !used.has(e.id) && e.craft === p && freeAll(e) && eligibility(db, e.id, fake, start, p).ok).sort((a, b) => Number(b.branchId === branchId) - Number(a.branchId === branchId) || Number(!!a.hallHand) - Number(!!b.hallHand))
      const pick = perm ?? pool[0]
      if (pick) { used.add(pick.id); picks.push({ empId: pick.id, position: p }) }
    })
    setCrew(picks)
  }
  const needs = positionsFor(type, crane)
  const site = byId(db.sites, siteId) ?? { id: '', name: '—', city: '', state: '', lat: 0, lng: 0 }
  const custSites = new Set(db.jobs.filter(j => j.customerId === customerId).map(j => j.siteId))
  const step0Err = !customerId ? 'Pick or add the customer' : !siteId ? 'Pick or add the job site' : !name.trim() ? 'Give the job a name' : !start || !end || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) ? 'Pick start and end dates' : end < start ? 'End date is before the start date' : diffDays(end, start) + 1 > 365 ? `That’s ${diffDays(end, start) + 1} days — a job can’t be longer than 365 days. Check the end date.` : '' // dive3 B4

  const create = () => {
    if (saved.current) return; saved.current = true; jbDraftClear()
    // dive2 M6: don't auto-assign config trailers that are down or already on an overlapping job
    const cfgTr = byId(db.configs, configId)?.trailerIds ?? []; const probe = { id: 'tmp', startDate: start, endDate: end < start ? start : end, trailerIds: [] } as unknown as T.Job
    const freeTrailers = { ok: cfgTr.filter(t => !unitConflict(db, probe, t)), skipped: cfgTr.filter(t => unitConflict(db, probe, t)) }
    const job: T.Job = {
      id: uid('job'), jobNo: actions.nextJobNo(), name, type, customerId, siteId, startDate: start, endDate: end < start ? start : end, startTime, craneId, configId,
      trailerIds: freeTrailers.ok, craneIds: extra.length ? extra : undefined, craneHours: hrsOn && ht > hf ? Object.fromEntries([craneId, ...extra].filter(Boolean).map(id => [id as string, { from: hf, to: ht }])) : undefined, extraEquipment: ['Crane mats', 'Tag lines'], requiredCerts: type === 'Refinery' || type === 'Oil & Gas' ? ['OSHA 10', 'H2S Awareness'] : type === 'Uptower' ? ['Tower Rescue', 'CPR / First Aid'] : ['OSHA 10'],
      pmId: db.employees.find(e => e.craft === 'Project Manager')?.id, supervisorId: crew.find(c => c.position === 'Supervisor')?.empId, status: stage === 'Scheduled' ? 'Confirmed' : 'Planned', dayRate: totalDayRate,
      local: 'Non-Union', liftPlan: (crane?.capacity ?? 0) >= 300 ? 'In Review' : 'Not Required', shift: 'Day', positions: needs, stage,
      quote: { revenue, costBudget: budget, mobDemob: mob, quotedAt: today(), salesId: db.employees.find(e => e.craft === 'Sales')?.id, priceLines, costLines }, docs: [], divisionId, branchId,
      lift: crane ? { load: Math.round((crane.capacity ?? 100) * 0.12), radius: 60, boom: 180, rigging: 4 } : undefined, notes: jobNotes ? `${jobNotes}. Created in Job Builder.` : 'Created in Job Builder.', windFarmId: farmId, turbines: farmId ? turbines : undefined,
    }
    actions.createJob(job, stage === 'Scheduled' ? crew : [])
    if (freeTrailers.skipped.length) toast.warning(`${freeTrailers.skipped.length} config trailer${freeTrailers.skipped.length > 1 ? 's' : ''} not added — already in use or down`, { description: freeTrailers.skipped.map(t => `${byId(db.equipment, t)?.unit}: ${unitConflict(db, probe, t)}`).join(' · ') })
    if (stage === 'Quote') {
      toast.success(`Quote Q-${job.jobNo} saved`, { description: `${money(revenue)} · ${money(budget)} cost budget — mark it won on Quotes and it becomes the job` })
      onDone(); useStore.getState().go('quotes'); return
    }
    toast.success(`Job #${job.jobNo} created`, { description: stage === 'Scheduled' ? `${crew.length} crew booked · on the dispatch board · job cost tracking live` : 'Saved to the pipeline' })
    onDone()
    useStore.getState().open({ type: 'job', id: job.id })
  }

  const steps = ['Customer', 'Crane', 'Crew', 'Quote']
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">{steps.map((s, i) => <button key={s} onClick={() => i < step && goStep(i)} className={cn('flex-1 h-1.5 rounded-full', i <= step ? 'bg-accent' : 'bg-surface-3')} aria-label={s} />)}</div>
      <div className="label">Step {step + 1} of 4 · {steps[step]}</div>

      {step === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Customer" className="sm:col-span-2"><select className="input h-12" data-testid="jb-customer" value={customerId} onChange={e => { if (e.target.value === '__new') { setAddCu({ name: '', contact: '', phone: '' }); return } const v = e.target.value; setCustomer(v); const mine = db.jobs.filter(j => j.customerId === v).map(j => j.siteId); if (siteId && !mine.includes(siteId)) setSite(mine.at(-1) ?? '') }}><option value="">Choose customer…</option>{[...db.customers].sort((a, b) => a.name.localeCompare(b.name)).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}<option value="__new">+ New customer…</option></select></Field>
          {addCu && <div className="sm:col-span-2 card-flat p-3 grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="jb-new-customer"><input className="input text-base sm:text-sm" placeholder="Company name" value={addCu.name} onChange={e => setAddCu({ ...addCu, name: e.target.value })} data-testid="jb-cu-name" /><input className="input text-base sm:text-sm" placeholder="Contact" value={addCu.contact} onChange={e => setAddCu({ ...addCu, contact: e.target.value })} /><input className="input text-base sm:text-sm" placeholder="Phone" value={addCu.phone} onChange={e => setAddCu({ ...addCu, phone: e.target.value })} />
            <div className="sm:col-span-3 flex gap-2"><Button size="sm" variant="primary" data-testid="jb-cu-save" onClick={() => { const r = actions.addCustomer(addCu); if (!r.ok) { toast.error(r.reason); return } setCustomer(r.id); setSite(''); setAddCu(null); toast.success(r.existed ? 'That customer already exists — picked it' : 'Customer added') }}>Add customer</Button><Button size="sm" variant="ghost" onClick={() => setAddCu(null)}>Cancel</Button></div></div>}
          <Field label="Wind farm (USWTDB directory)" className="sm:col-span-2" hint="Prefills site, coordinates, turbine model and hub height."><FarmAutocomplete value={farmId} onPick={pickFarm} /></Field>
          {farm && <div className="sm:col-span-2 card-flat p-3 flex flex-wrap items-center gap-2" data-testid="jb-turbines"><span className="text-sm font-semibold mr-1">Turbines</span>{turbines.length ? turbines.map(t => <Badge key={t.caseId} tone="accent">{t.label}</Badge>) : <span className="text-sm text-muted">None picked yet</span>}<Button size="sm" className="ml-auto" icon={<MapPin className="size-4" />} onClick={() => setPickT(true)} data-testid="jb-pick-turbines">Pick on map</Button></div>}
          <TurbinePicker farm={farm} open={pickT} initial={turbines} onClose={() => setPickT(false)} onDone={t => { setTurbines(t); if (t.length && /Main component exchange|Wind service/.test(name)) setName(`Main component exchange — ${t.map(x => x.label).join(' & ')}`) }} />
          <Field label="Site"><select className="input" data-testid="jb-site" value={siteId} onChange={e => { if (e.target.value === '__new') { setAddSi({ name: '', city: '', state: '' }); return } setSite(e.target.value); setFarm(db.sites.find(x => x.id === e.target.value)?.windFarmId); setTurbines([]) }}><option value="">Choose site…</option>{custSites.size > 0 && <optgroup label="This customer’s sites">{db.sites.filter(x => custSites.has(x.id)).map(s => <option key={s.id} value={s.id}>{s.name} · {s.city}, {s.state}</option>)}</optgroup>}<optgroup label={custSites.size ? 'Other sites' : 'Sites'}>{db.sites.filter(x => !custSites.has(x.id)).map(s => <option key={s.id} value={s.id}>{s.name} · {s.city}, {s.state}</option>)}</optgroup><option value="__new">+ New site…</option></select></Field>
          {addSi && <div className="sm:col-span-2 card-flat p-3 grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="jb-new-site"><input className="input text-base sm:text-sm" placeholder="Site name" value={addSi.name} onChange={e => setAddSi({ ...addSi, name: e.target.value })} data-testid="jb-si-name" /><input className="input text-base sm:text-sm" placeholder="City" value={addSi.city} onChange={e => setAddSi({ ...addSi, city: e.target.value })} data-testid="jb-si-city" /><input className="input text-base sm:text-sm" placeholder="State (OK)" maxLength={2} value={addSi.state} onChange={e => setAddSi({ ...addSi, state: e.target.value })} data-testid="jb-si-state" />
            <div className="sm:col-span-3 flex gap-2"><Button size="sm" variant="primary" data-testid="jb-si-save" onClick={() => { const r = actions.addSite(addSi); if (!r.ok) { toast.error(r.reason); return } setSite(r.id); setAddSi(null); toast.success('Site added') }}>Add site</Button><Button size="sm" variant="ghost" onClick={() => setAddSi(null)}>Cancel</Button></div></div>}
          <Field label="Job type"><select className="input" value={type} onChange={e => setType(e.target.value as T.JobType)}>{TYPES.map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Division"><select className="input" value={divisionId} onChange={e => setDiv(e.target.value)}>{db.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Branch"><select className="input" value={branchId} onChange={e => setBranch(e.target.value)}>{db.branches.map(b => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}</select></Field>
          <Field label="Job name" className="sm:col-span-2"><input className="input" data-testid="jb-name" placeholder={type === 'Wind' ? 'e.g. Main component exchange' : type === 'Machine Moving' ? 'e.g. Press relocation' : 'e.g. Boiler lift'} value={name} onChange={e => setName(e.target.value.slice(0, 120))} /></Field>
          <Field label="Start"><input type="date" className="input" value={start} onChange={e => setStart(e.target.value)} /></Field>
          <Field label="End"><input type="date" className="input" data-testid="jb-end" value={end} max={start ? addDays(start, 364) : undefined} onChange={e => setEnd(e.target.value)} />{start && end && /^\d{4}-\d{2}-\d{2}$/.test(end) && diffDays(end, start) + 1 > 60 && diffDays(end, start) + 1 <= 365 && <span className="text-xs text-warn" data-testid="jb-long">{diffDays(end, start) + 1} days — that’s a long job. Double-check the end date.</span>}</Field>
          <Field label="Start time"><input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
          {jobNotes && <Field label="Notes" className="sm:col-span-2"><input className="input" value={jobNotes} onChange={e => setJobNotes(e.target.value)} /></Field>}
        </div>
      )}

      {step === 1 && (
        <div className="flex flex-col gap-2">
          {type === 'Heavy Haul' || type === 'Uptower' || type === 'Machine Moving' ? <button onClick={() => { setCrane(undefined); setConfig(undefined) }} className={cn('card p-4 text-left', !craneId && 'border-accent')}>No crane — crew & equipment job</button> : null}
          <div className="text-xs text-muted mb-1">Availability for {fmtDate(start)} → {fmtDate(end)} — down cranes are blocked; a booked crane shows red (double-booked) until both jobs have non-overlapping hours. Tap “+ Also” to add more cranes.</div>
          {craneId && <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="jb-hours"><label className="flex items-center gap-2 min-h-[44px]"><input type="checkbox" className="size-5" checked={hrsOn} data-testid="jb-hours-on" onChange={e => setHrsOn(e.target.checked)} />Set crane hours (to share a booked crane)</label>{hrsOn && <><input type="time" className="input w-auto" value={hf} onChange={e => setHf(e.target.value)} data-testid="jb-hours-from" /><span>to</span><input type="time" className="input w-auto" value={ht} onChange={e => setHt(e.target.value)} data-testid="jb-hours-to" />{ht <= hf && <span className="text-xs text-bad">End after start</span>}</>}</div>}
          <div className="max-h-[48vh] overflow-y-auto scroll-thin flex flex-col gap-2 pr-1">
            {craneRows.map(({ c, clash, down, ok }) => (
              <div key={c.id} className="flex items-stretch gap-2"><button disabled={!ok} data-testid="jb-crane" data-unit={c.unit} onClick={() => { setCrane(c.id); setExtra(x => x.filter(y => y !== c.id)); setConfig(db.configs.find(x => x.craneId === c.id)?.id) }} className={cn('card p-4 flex-1 min-w-0 flex items-center gap-4 text-left transition', craneId === c.id && 'border-accent accent-glow', !ok && 'opacity-50')}>
                <span className="display text-2xl font-semibold w-16 num">{c.unit}</span>
                <span className="flex-1 min-w-0"><span className="font-semibold block">{c.code} · {c.capacity} t {c.type}</span><span className="text-xs text-muted">{c.make} {c.model} · {db.branches.find(b => b.id === c.branchId)?.code} · {money(c.dayRate ?? 0)}/day</span></span>
                {down ? <Badge tone="bad">{c.status === 'Maintenance' || c.status === 'Out of Service' ? c.status : 'Annual expired'}</Badge> : clash ? <Badge tone="bad" data-testid="jb-crane-clash">Double-booked #{clash.jobNo} — set hours on both to share</Badge> : <Badge tone="ok">Free</Badge>}
                {(craneId === c.id || extra.includes(c.id)) && <Check className="size-5 text-accent" />}
              </button>{craneId && craneId !== c.id && ok && <button data-testid="jb-also" aria-pressed={extra.includes(c.id)} onClick={() => setExtra(x => x.includes(c.id) ? x.filter(y => y !== c.id) : [...x, c.id])} className={cn('shrink-0 w-20 rounded-2xl border hairline text-sm font-semibold min-h-[44px]', extra.includes(c.id) ? 'bg-accent text-accent-ink' : 'bg-surface-2')}>{extra.includes(c.id) ? '✓ Added' : '+ Also'}</button>}</div>
            ))}
          </div>
          {crane && db.configs.filter(x => x.craneId === crane.id).length > 0 && (
            <div className="mt-2"><div className="text-xs font-semibold text-muted mb-2">Configuration (trailers auto-attach)</div>
              <Segmented value={configId ?? ''} onChange={v => setConfig(v)} options={db.configs.filter(x => x.craneId === crane.id).map(x => ({ value: x.id, label: `${x.name} · ${x.loads ? x.loads.reduce((s, l) => s + l.n, 0) : x.trailerIds.length} loads` }))} />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between"><div className="text-sm text-muted">Needs: {needs.join(', ')}</div><Button size="sm" variant="outline" icon={<Sparkles className="size-4" />} onClick={() => autoCrew(craneId)}>Auto-fill crew</Button></div>
          {needs.map((p, i) => {
            const idx = needs.slice(0, i).filter(x => x === p).length
            const cur = crew.filter(c => c.position === p)[idx]
            const options = db.employees.filter(e => isField(e) && craftFits(e, p))
            return (
              <div key={i} className="card p-3 flex items-center gap-3">
                <span className="w-28 text-sm font-semibold">{p}</span>
                <select className="input flex-1" value={cur?.empId ?? ''} onChange={e => {
                  const others = crew.filter(c => c !== cur)
                  setCrew(e.target.value ? [...others, { empId: e.target.value, position: p }] : others)
                }}>
                  <option value="">— Open (Dispatch will fill) —</option>
                  {options.map(e => { const busy = dates.some(d => workStatus(db, e.id, d) !== 'Available'); return <option key={e.id} value={e.id}>{fullName(e)}{e.homeCraneId === craneId ? ' ★ permanent crew' : ''}{e.hallHand ? ' · Hall Hand' : ''}{busy ? ' · busy some days' : ''}</option> })}
                </select>
                {cur && dates.some(d => workStatus(db, cur.empId, d) !== 'Available') && <AlertTriangle className="size-4 text-warn" />}
              </div>
            )
          })}
          <div className="text-xs text-muted">★ Crane’s permanent crew follows the crane by default. Dispatch can override anything on the board.</div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Day rate ($)"><input className="input num" value={rateTouched ? rateOverride : String(defRate)} placeholder={String(defRate)} inputMode="decimal" data-testid="jb-rate" aria-invalid={rateP ? !rateP.ok : undefined} onChange={e => { setTouched(true); setRate(typing(e.target.value)) }} />{rateP && !rateP.ok && <div className="text-xs text-bad mt-1" data-testid="jb-rate-err">{rateP.msg}</div>}</Field>
            <Field label="Stage"><select className="input" value={stage} onChange={e => setStage(e.target.value as T.JobStage)}>{['Quote', 'Awarded', 'Scheduled'].map(s => <option key={s}>{s}</option>)}</select></Field>
          </div>
          <div className="card p-5">
            <div className="label">Quote</div>
            <div className="display text-4xl font-semibold num mt-2">{money(revenue)}</div>
            <div className="text-sm text-muted mt-1" data-testid="jb-quote-sub">{days} days × {money(totalDayRate)}{craneQ.length > 1 ? ` (${craneQ.length} cranes)` : ''} + {money(mob)} mob/demob · cost budget {money(budget)} ({revenue > 0 ? Math.round((revenue - budget) / revenue * 100) : 0}% margin)</div>
            <div className="mt-3 rounded-xl bg-surface-2 divide-y divide-[var(--line)] text-sm" data-testid="jb-price-lines">{priceLines.map(l => <div key={l.k} className="flex justify-between gap-3 px-3 py-2"><span>{l.k}</span><span className="num font-semibold">{money(l.v)}</span></div>)}</div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="card-flat p-3"><div className="text-xs text-muted">Customer</div><div className="font-semibold">{byId(db.customers, customerId)?.name}</div></div>
              <div className="card-flat p-3"><div className="text-xs text-muted">Site</div><div className="font-semibold">{site.name}</div></div>
              <div className="card-flat p-3"><div className="text-xs text-muted">Crane</div><div className="font-semibold">{crane ? `${crane.unit} · ${crane.code}` : 'None'}</div></div>
              <div className="card-flat p-3"><div className="text-xs text-muted">Crew</div><div className="font-semibold">{crew.length}/{needs.length} booked</div></div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2 border-t hairline">
        {step > 0 && <Button variant="ghost" icon={<ChevronLeft className="size-4" />} onClick={() => goStep(step - 1)} data-testid="jb-back">Back</Button>}
        <div className="flex-1" />
        {step === 0 && step0Err && <span className="text-xs text-bad self-center" data-testid="jb-step-err">{step0Err}</span>}{step < 3 && <Button variant="primary" size="lg" data-testid="jb-continue" disabled={(step === 0 && !!step0Err) || (step === 1 && !craneId && !['Heavy Haul', 'Uptower', 'Machine Moving'].includes(type))} onClick={() => { if (step === 1) autoCrew(craneId); goStep(step + 1) }}>Continue</Button>}
        {step === 3 && (() => { const jbErr = !name.trim() ? 'Give the job a name (step 1)' : !start || !end ? 'Pick start and end dates' : end < start ? `End date ${end} is before start ${start} — fix the dates` : rateP && !rateP.ok ? rateP.msg : ''
          return <>{jbErr && <span className="text-xs text-bad self-center" data-testid="jb-err">{jbErr}</span>}<Button variant="primary" size="lg" disabled={!!jbErr} onClick={create} data-testid="jb-create">{stage === 'Quote' ? 'Save quote' : 'Create job'}</Button></> })()}
      </div>
    </div>
  )
}
