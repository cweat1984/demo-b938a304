import { useEffect, useMemo, useRef, useState } from 'react'
import { pushOverlay, popOverlay } from '../lib/backstack'
import { GuestSwitchChip, openGuestSwitch } from '../guest/GuestSwitch'
import { motion, AnimatePresence } from 'motion/react'
import { toast } from 'sonner'
import { FileText, Phone, Home, CalendarDays, FileSignature, Clock, LayoutGrid, Navigation, MapPin, Construction, Users, ChevronRight, CheckCircle2, WifiOff, Siren, Coffee, Play, Square, ClipboardCheck, Fuel, ShieldCheck, Package, HardHat, Plane, FlaskConical, Moon, Sun, LogOut, StickyNote } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName, assignmentsFor, customerOf, siteOf, crewOn, workStatus, certBand, travelOn } from '../data/logic'
import { today, addDays, fmtDate, dow, cn, range, fmtLong, fmtTs } from '../lib/util'
import { Avatar, Badge, CallButton } from '../components/ui'
import { FSheet, useNow, dur, navUrl, BigTile } from './kit'
import { SdsLibrary } from '../components/inv/Sds'
import RoleBriefing from '../components/RoleBriefing'
import { FieldReconCard, ReconPrompt } from '../components/TimeRecon'
import { MyInfoForm } from '../components/MyInfo'
import { UserCircle, ClipboardList } from 'lucide-react'
import { RequestForm, MyRequestsField } from '../components/inv/Purchasing'
import { targetUnit } from '../data/invcore'
import { TicketFlow, ClockOutForm, ManualTime, DvirForm, FuelForm, PtoForm, JsaList, SdsList, CertList, GearList } from './FieldSheets'
import { BreakdownForm } from '../components/Breakdown'
import ThemePicker from '../components/ThemePicker'
import WindJobCard from '../components/WindJob'
import { FieldCheckIn } from '../moves/FieldCheckIn'
import { Container } from 'lucide-react'
import { PoweredBy } from '../components/PoweredBy'
import { currentJobFor as currentJobFor3b } from '../data/certshare'

type Tab = 'home' | 'schedule' | 'ticket' | 'time' | 'more'
type SheetKey = null | 'myinfo' | 'union' | 'ticket' | 'clockout' | 'manual' | 'dvir' | 'fuel' | 'breakdown' | 'contacts' | 'certs' | 'gear' | 'jsa' | 'pto' | 'sds' | 'theme' | 'parts' | 'checkin' | 'rigging' | 'riginspect' | 'npt' | 'cards' | 'expenses' | 'pay' | 'incident' | 'crew' | 'site' | 'workorders' | { job: string; date: string }

/** field fixes (N-B2): tickets/NPT only go on today's dispatched job — never a future one. */
function NoJobToday({ phone, name, what }: { phone: string; name: string; what: string }) {
  const tel = phone.replace(/[^0-9+]/g, '')
  return <div className="flex flex-col gap-3 text-center py-4" data-testid="no-job-today">
    <div className="display text-2xl font-semibold">No job today</div>
    <div className="text-muted">You’re not dispatched to a job today, so there’s nothing to put {what} on. If you’re on a job, dispatch needs to add you first.</div>
    <a href={`sms:${tel}?&body=${encodeURIComponent(`${name} here — I'm on a job today but my phone says I'm not dispatched. Can you add me?`)}`} className="h-14 rounded-2xl bg-accent text-accent-ink font-semibold grid place-items-center" data-testid="ask-dispatch">Ask dispatch</a>
    <a href={`tel:${tel}`} className="h-12 rounded-2xl bg-surface-2 font-semibold grid place-items-center">Call dispatch</a>
  </div>
}

/** dive3 F1: a fast double tap on Clock in must not land on Clock out (same spot) */
let lastClockTap = 0
export function useMe() {
  const db = useStore(s => s.db)
  const session = useStore(s => s.session)!
  const me = byId(db.employees, session.employeeId) ?? db.employees.find(e => e.craft === 'Operator')!
  const t = today()
  const todayAsg = assignmentsFor(db, me.id, t)[0]
  const upcoming = useMemo(() => range(t, addDays(t, 13)).map(d => ({ date: d, a: assignmentsFor(db, me.id, d)[0], status: workStatus(db, me.id, d), travel: travelOn(db, me.id, d) })), [db, me.id, t])
  const current = todayAsg ? byId(db.jobs, todayAsg.jobId) : byId(db.jobs, upcoming.find(u => u.a)?.a?.jobId)
  return { db, me, current, todayAsg, upcoming, clock: db.clocks.find(c => c.employeeId === me.id) }
}

import { useGapA } from '../gapA/intent'
import AskHero from '../gapA/AskHero'
import { RigPhone } from '../gapA/Rigging'
import { NptForm } from '../gapA/npt'
import MyCards from '../gapA/MyCards'
import MyUnionHistory from '../portal/MyUnionHistory'
import Expenses from '../launch2/Expenses'
import { Anchor, CreditCard, Wallet, Receipt, Hourglass } from 'lucide-react'
import { MyPay, IncidentForm, MyCrew, CrewUpdates } from './FieldExtras'
import JobRig from '../components/JobRig'
import { jobCranes, hoursOf, fmtHours, sharedOn } from '../data/rig'
import { PhotoThumb } from '../lib/photos'
import { MyWorkOrders } from './MechTools'

export default function FieldApp() {
  const guest = useStore(s => s.session?.role === 'guest')
  const [tab, setTabRaw] = useState<Tab>('home')
  // Each non-home tab gets its own history entry so Back walks Ticket → Time → Job
  // instead of jumping straight to Job. Home clears that chain in one step.
  const tabHist = useRef<Tab[]>(['home'])
  const tabIds = useRef<number[]>([])
  const setTab = (k: Tab) => {
    if (k === tabHist.current[tabHist.current.length - 1]) return
    if (k === 'home') {
      const id = tabIds.current[0]
      tabIds.current = []
      tabHist.current = ['home']
      if (id != null) popOverlay(id)
      setTabRaw('home')
      return
    }
    const id = pushOverlay(() => {
      tabIds.current.pop()
      tabHist.current.pop()
      const prev = tabHist.current[tabHist.current.length - 1] ?? 'home'
      if (!tabHist.current.length) tabHist.current = ['home']
      setTabRaw(prev)
    })
    tabIds.current.push(id)
    tabHist.current.push(k)
    setTabRaw(k)
  }
  const [sheet, setSheet] = useState<SheetKey>(null)
  const [large, setLargeS] = useState(() => { try { return sessionStorage.getItem('sc-field-large') === '1' } catch { return false } }), setLarge = (v: boolean) => { setLargeS(v); try { sessionStorage.setItem('sc-field-large', v ? '1' : '0') } catch { /* */ } }
  const online = useStore(s => s.ui.online)
  const { db, me, current, todayAsg } = useMe()
  const dispatch = db.contacts.find(c => c.group === 'Dispatch' && c.primary) ?? db.contacts.find(c => c.group === 'Dispatch')!
  const close = () => setSheet(null)
  // "What do you need to do?" bar → open the exact sheet or tab on the phone
  const intent = useGapA(s => s.intent)
  useEffect(() => { if (intent?.kind !== 'field-sheet') return; const k = intent.sheet; useGapA.setState({ intent: null }); if (k.startsWith('tab:')) setTab(k.slice(4) as Tab); else setSheet(k as SheetKey) }, [intent])
  const app = (
    <div className="relative h-full w-full bg-bg flex flex-col overflow-hidden" data-testid="field-app">
      <header className="px-5 pl-[max(20px,env(safe-area-inset-left))] pr-[max(20px,env(safe-area-inset-right))] pt-[max(env(safe-area-inset-top),14px)] pb-3 flex items-center gap-3 landscape-short:pt-2 landscape-short:pb-1.5">
        <button onClick={() => setSheet('myinfo')} aria-label="My Info" data-testid="field-avatar" className="rounded-full press"><Avatar name={fullName(me)} size={40} /></button>
        <div className="flex-1 min-w-0"><div className="text-xs text-muted">{fmtLong(today())}</div><div className="font-semibold truncate">Hi, {me.first}</div></div>
        {guest ? <GuestSwitchChip /> : <a href={`tel:${dispatch.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-2 rounded-full bg-ok-solid text-white font-semibold h-11 px-4 shadow-lg shadow-ok/20 active:scale-95 transition" data-testid="call-dispatch"><Phone className="size-4" />Dispatch</a>}
      </header>
      {!online && <div className="mx-5 mb-2 rounded-2xl bg-warn/15 text-warn text-xs font-semibold px-3 py-2 flex items-center gap-2"><WifiOff className="size-4" />Offline — everything saves on this phone and syncs later.</div>}
      <main className="flex-1 overflow-y-auto scroll-thin px-5 pb-6">
        <AnimatePresence mode="wait">
          <motion.div key={tab} className="w-full max-w-3xl mx-auto" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {tab === 'home' && <AskHero compact />}
            {tab === 'home' && <HomeTab open={setSheet} go={setTab} />}
            {tab === 'schedule' && <ScheduleTab open={setSheet} />}
            {tab === 'ticket' && <TicketTab open={setSheet} />}
            {tab === 'time' && <TimeTab open={setSheet} />}
            {tab === 'more' && <MoreTab open={setSheet} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <nav className="border-t hairline bg-surface/90 backdrop-blur-xl grid grid-cols-5 pb-safe pt-1.5 px-[env(safe-area-inset-left)] landscape-short:pt-0">
        {([['home', Home, 'Job'], ['schedule', CalendarDays, 'Schedule'], ['ticket', FileSignature, 'Ticket'], ['time', Clock, 'Time'], ['more', LayoutGrid, 'More']] as const).map(([k, I, l]) => (
          <button key={k} onClick={() => setTab(k)} className={cn('flex flex-col items-center gap-0.5 py-1.5 text-[12px] font-semibold transition', tab === k ? 'text-accent' : 'text-ink/75')} data-testid={`ftab-${k}`}><I className="size-6" />{l}</button>
        ))}
      </nav>
      <ReconPrompt empId={me.id} Sheet={FSheet} />
      <FSheet open={sheet === 'myinfo'} onClose={close} title="My Info" tall><MyInfoForm empId={me.id} big /></FSheet>
      <FSheet open={sheet === 'union'} onClose={close} title="My union history" tall>{sheet === 'union' && <MyUnionHistory empId={me.id} mine />}</FSheet>
      <FSheet open={sheet === 'ticket'} onClose={close} title="Job ticket" tall taps>{todayAsg && current ? <TicketFlow onDone={close} /> : <NoJobToday phone={dispatch.phone} name={me.first} what="a ticket" />}</FSheet>
      <FSheet open={sheet === 'clockout'} onClose={close} title="Clock out"><ClockOutForm onDone={close} /></FSheet>
      <FSheet open={sheet === 'manual'} onClose={close} title="Add time"><ManualTime onDone={close} /></FSheet>
      <FSheet taps open={sheet === 'dvir'} onClose={close} title="Pre-trip inspection" tall><DvirForm onDone={close} /></FSheet>
      <FSheet open={sheet === 'fuel'} onClose={close} title="Log fuel"><FuelForm onDone={close} /></FSheet>
      <FSheet taps open={sheet === 'breakdown'} onClose={close} title={<span className="text-bad inline-flex items-center gap-2"><Siren className="size-5" />Breakdown</span>} tall><BreakdownForm onDone={close} /></FSheet>
      <FSheet open={sheet === 'contacts'} onClose={close} title="Call the office"><ContactsList /></FSheet>
      <FSheet open={sheet === 'certs'} onClose={close} title="My certifications" tall><CertList /></FSheet>
      <FSheet open={sheet === 'gear'} onClose={close} title="My gear"><GearList /></FSheet>
      <FSheet open={sheet === 'jsa'} onClose={close} title="JSA & toolbox talks"><JsaList /></FSheet>
      <FSheet open={sheet === 'pto'} onClose={close} title="Request time off"><PtoForm onDone={close} /></FSheet>
      <FSheet open={sheet === 'theme'} onClose={close} title="Theme" tall><ThemePicker compact /></FSheet>
      <FSheet open={sheet === 'sds'} onClose={close} title="Safety Sheets" tall><FieldSds /></FSheet>
      <FSheet taps open={sheet === 'rigging'} onClose={close} title="Report damaged rigging" tall><RigPhone mode="report" onDone={close} /></FSheet>
      <FSheet taps open={sheet === 'riginspect'} onClose={close} title="Rigging inspection" tall><RigPhone mode="inspect" onDone={close} /></FSheet>
      <FSheet open={sheet === 'workorders'} onClose={close} title="My work orders" tall><MyWorkOrders /></FSheet>
      <FSheet taps open={sheet === 'npt'} onClose={close} title="Nonproductive time" tall>{todayAsg && current ? <NptForm jobId={current.id} onDone={close} /> : <NoJobToday phone={dispatch.phone} name={me.first} what="NPT" />}</FSheet>
      <FSheet open={sheet === 'cards'} onClose={close} title="My cards" tall><MyCards empId={me.id} big /></FSheet>
      <FSheet open={sheet === 'expenses'} onClose={close} title="Turn in a receipt" tall><Expenses /></FSheet>
      <FSheet open={sheet === 'site'} onClose={close} title="Gate code & site notes" tall>{current ? <SiteSheet job={current} /> : <div className="text-muted">No job today.</div>}</FSheet>
      <FSheet open={sheet === 'pay'} onClose={close} title="My pay" tall><MyPay /></FSheet>
      <FSheet taps open={sheet === 'incident'} onClose={close} title={<span className="text-bad inline-flex items-center gap-2"><Siren className="size-5" />Injury / near miss</span>} tall><IncidentForm onDone={close} /></FSheet>
      <FSheet open={sheet === 'crew'} onClose={close} title="My crew" tall><MyCrew /></FSheet>
      <FSheet open={sheet === 'checkin'} onClose={close} title="Check in load" tall><FieldCheckIn onDone={close} /></FSheet>
      <FSheet open={sheet === 'parts'} onClose={close} title="Request parts" tall><div className="pb-8 flex flex-col gap-5"><RequestForm from="Field" big onDone={close} /><div><div className="label mb-2">My requests</div><MyRequestsField /></div></div></FSheet>
      <FSheet open={typeof sheet === 'object' && !!sheet} onClose={close} title="Dispatch" tall>{typeof sheet === 'object' && sheet && <JobDetail jobId={sheet.job} date={sheet.date} />}</FSheet>
    </div>
  )
  // dive3: "Large" demo mode (state above) — same phone layout, 25% bigger, for a projector
  // dive2: a separated employee can't use the field app (no clock-in, no tickets)
  if (me.status === 'Inactive' && !guest) return <div className="h-full w-full grid place-items-center bg-bg p-8 text-center" data-testid="field-inactive"><div><div className="display text-2xl font-semibold">Your access has ended</div><div className="text-muted mt-2">This account is no longer active. Questions about your final pay or benefits: call HR at the office.</div><button className="mt-6 h-12 px-6 rounded-2xl bg-surface-2 font-semibold" onClick={() => useStore.getState().signOut()}>Sign out</button></div></div>
  return (
    <div className="h-full w-full desk:grid desk:place-items-center desk:bg-[radial-gradient(ellipse_at_top,var(--surface-3),var(--bg))]">
      <div className="h-full w-full desk:phone-frame" style={large ? { width: 520, height: 'calc(100vh - 48px)', borderRadius: 64 } : undefined} data-testid="field-frame"><div className="h-full w-full desk:phone-screen" style={large ? { zoom: 1.25 } : undefined}>{app}</div></div>
      <div className="hidden desk:block fixed bottom-4 left-1/2 -translate-x-1/2 text-xs text-muted">Field app preview · open on a phone for full screen · <button className="underline" data-testid="field-large" onClick={() => setLarge(!large)}>{large ? 'Normal size' : 'Large (projector)'}</button> · <button className="underline" onClick={() => guest ? openGuestSwitch() : useStore.getState().signOut()}>Switch role</button></div>
    </div>
  )
}

function JobHero({ job, date, noCrew }: { job: T.Job; date: string; noCrew?: boolean }) {
  const db = useStore(s => s.db)
  const site = siteOf(db, job), cust = customerOf(db, job), crane = byId(db.equipment, job.craneId)
  const crew = crewOn(db, job.id, date).map(a => ({ a, e: byId(db.employees, a.employeeId)! }))
  const cfg = byId(db.configs, job.configId)
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[28px] bg-surface p-5 flex flex-col gap-4 shadow-[var(--shadow)]" data-testid="current-job">
        <div className="flex items-center gap-2"><Badge tone={job.status === 'On Site' ? 'ok' : 'info'} dot>{job.status}</Badge><span className="text-xs font-bold text-muted num">Job #{job.jobNo}</span><span className="ml-auto text-sm font-semibold num">{date === today() ? 'Today' : fmtDate(date, { weekday: 'short', month: 'short', day: 'numeric' })} · {job.startTime}</span></div>
        <div><div className="display text-[28px] leading-tight font-semibold">{cust.name}</div><div className="text-muted mt-1">{job.name}</div></div>
        <a href={navUrl(site.lat, site.lng)} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5 active:scale-[0.99] transition">
          <span className="grid size-11 place-items-center rounded-xl bg-info/15 text-info"><MapPin className="size-5" /></span>
          <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{site.name}</span><span className="block text-xs text-muted">{site.city}, {site.state}{site.gate ? ` · ${site.gate}` : ''}</span></span>
          <span className="inline-flex items-center gap-1 rounded-full bg-info-solid text-white text-sm font-semibold px-3 h-9"><Navigation className="size-4" />Go</span>
        </a>
        <WindJobCard job={job} field />
        {crane && (crane.status === 'Out of Service' || crane.status === 'Maintenance') && <div role="alert" data-testid="tagged-out" className="rounded-2xl bg-bad-solid text-white px-4 py-3 font-semibold">TAGGED OUT · Crane {crane.unit} is {crane.status === 'Out of Service' ? 'out of service' : 'in the shop'} — don’t run it. Dispatch is on it.</div>}
        {crane && <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-surface-2"><Construction className="size-5" /></span><div className="flex-1"><div className="font-semibold">Crane {crane.unit} · {crane.capacity}t {crane.make}</div>{hoursOf(job, crane.id) && <div className="text-xs font-semibold" data-testid="field-crane-hours">Here {fmtHours(hoursOf(job, crane.id))}</div>}{sharedOn(db, job, crane.id, date).map(x => <div key={x.job.id} data-testid="field-crane-shared" className={cn('text-xs font-semibold', x.clash ? 'text-warn' : 'text-info')}>{x.text}</div>)}{jobCranes(job).length > 1 && <div className="text-xs font-semibold" data-testid="field-more-cranes">+ {jobCranes(job).filter(c => c !== job.craneId).map(c => byId(db.equipment, c)?.unit).join(', ')}</div>}<div className="text-xs text-muted">{cfg ? `${cfg.name} · ${cfg.trailerIds.length} trailers` : crane.model}</div></div></div>}
        <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3.5">
          <div className="flex-1 min-w-0"><div className="text-xs text-muted">Site contact</div><div className="font-semibold truncate">{cust.contact}</div></div>
          <CallButton phone={cust.phone} label="Call" size="md" className="rounded-full h-10 px-4 gap-1.5" />
        </div>
        {job.notes && <div className="flex gap-2 text-sm text-muted"><StickyNote className="size-4 shrink-0 mt-0.5" />{job.notes}</div>}
      </div>
      <JobRig job={job} readOnly compact />
      {job.docs.some(d => d.kind === 'Lift Plan' || d.kind === 'Site Map' || d.kind === 'Permit') && (
        <div className="card p-4" data-testid="field-docs">
          <div className="label mb-2">Job documents</div>
          <div className="flex flex-col gap-1">{job.docs.filter(d => d.kind === 'Lift Plan' || d.kind === 'Site Map' || d.kind === 'Permit').slice(-4).map(d => <a key={d.id} href={d.dataUrl ?? '#'} onClick={e => { if (!d.dataUrl) { e.preventDefault(); toast('Opens the PDF (demo)', { description: d.name }) } }} download={d.dataUrl ? d.name : undefined} className="flex items-center gap-3 min-h-12 rounded-xl px-2 hover:bg-surface-2"><FileText className="size-5 text-accent" /><span className="flex-1 min-w-0 truncate text-[15px] font-medium">{d.name}</span><span className="text-xs text-muted">{d.kind}</span></a>)}</div>
        </div>
      )}
      {!noCrew && <CrewCard crew={crew} />}
    </div>
  )
}

function CrewCard({ crew }: { crew: { a: T.Assignment; e: T.Employee }[] }) {
  if (!crew.length) return null
  return (
      <div className="rounded-[28px] bg-surface p-4">
        <div className="text-xs font-semibold text-muted mb-2 flex items-center gap-1.5"><Users className="size-3.5" />Crew · {crew.length}</div>
        <div className="flex flex-col">{crew.map(({ a, e }) => <div key={a.id} className="flex items-center gap-3 py-2"><Avatar name={fullName(e)} size={34} /><div className="flex-1 min-w-0"><div className="text-sm font-semibold truncate">{fullName(e)}</div><div className="text-xs text-muted">{a.position}</div></div><a href={`tel:${e.phone.replace(/[^0-9]/g, '')}`} className="grid size-10 place-items-center rounded-full bg-ok/15 text-ok" aria-label={`Call ${e.first}`}><Phone className="size-4" /></a></div>)}</div>
      </div>
  )
}

function HomeTab({ open, go }: { open: (s: SheetKey) => void; go: (t: Tab) => void }) {
  const { db, current, todayAsg, upcoming, clock, me } = useMe()
  const now = useNow(30000)
  const ticket = current && db.tickets.find(t => t.jobId === current.id && t.date === today())
  const next = upcoming.filter(u => u.a && u.date > today()).slice(0, 4)
  const onClockH = clock ? (now - new Date(clock.inAt).getTime()) / 3600000 : 0
  // Time-aware: start of day the big card is Clock in; after ~2 pm or 6 h on the clock it's the customer signature
  const sigFirst = !!todayAsg && !ticket?.signedAt && (onClockH >= 6 || new Date(now).getHours() >= 14)
  const sigCard = todayAsg && current && (
        <button onClick={() => open('ticket')} className={cn('rounded-[28px] p-5 flex items-center gap-4 text-left active:scale-[0.99] transition', ticket?.status === 'Signed' || ticket?.status === 'Submitted' || ticket?.status === 'Reviewed' ? 'bg-ok/12' : 'bg-accent text-accent-ink')} data-testid="ticket-cta">
          <span className={cn('grid size-12 place-items-center rounded-2xl', ticket?.signedAt ? 'bg-ok-solid text-white' : 'bg-black/15')}>{ticket?.signedAt ? <CheckCircle2 className="size-6" /> : <FileSignature className="size-6" />}</span>
          <span className="flex-1"><span className="block font-semibold text-lg leading-tight">{ticket?.signedAt ? 'Ticket signed' : 'Get customer signature'}</span><span className={cn('block text-sm', ticket?.signedAt ? 'text-muted' : 'opacity-80')}>{ticket?.signedAt ? `${ticket.signerName} · ${new Date(ticket.signedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : "Today's job ticket"}</span></span>
          <ChevronRight className="size-5 opacity-60" />
        </button>
      )
  const timeCard = <button onClick={() => go('time')} className="rounded-[28px] bg-surface p-5 flex items-center gap-4 text-left" data-testid="time-cta">
        <span className={cn('grid size-12 place-items-center rounded-2xl', clock ? 'bg-ok/15 text-ok' : 'bg-surface-2')}><Clock className="size-6" /></span>
        <span className="flex-1"><span className="block font-semibold text-lg leading-tight">{clock ? (clock.breakStart ? 'On break' : 'On the clock') : 'Clock in'}</span><span className="block text-sm text-muted">{clock ? `${dur(now - new Date(clock.inAt).getTime() - clock.breakMin * 60000)} today` : 'Start your day'}</span></span>
        {clock ? <span className="display text-2xl font-semibold num">{dur(now - new Date(clock.inAt).getTime() - clock.breakMin * 60000)}</span> : <ChevronRight className="size-5 text-muted" />}
      </button>
  const supJobs = db.jobs.filter(j => j.supervisorId === me.id && j.status !== 'Complete' && db.assignments.some(x => x.jobId === j.id && x.date >= today())).length
  const clockBar = <div className="sticky top-0 z-10 -mx-1 rounded-2xl bg-surface p-2 pl-4 flex items-center gap-3 shadow-[var(--shadow)]" data-testid="clock-bar">
        <Clock className={cn('size-5', clock ? 'text-ok' : 'text-muted')} />
        <span className="flex-1 min-w-0"><span className="block font-semibold leading-tight">{clock ? (clock.breakStart ? 'On break' : 'On the clock') : 'Not clocked in'}</span><span className="block text-xs text-muted truncate">{clock ? dur(now - new Date(clock.inAt).getTime() - clock.breakMin * 60000) : todayAsg && current ? `Job #${current.jobNo}` : 'Yard / shop time'}</span></span>
        {clock ? <button className="h-12 px-4 rounded-xl bg-bad-solid text-white font-semibold" data-testid="clockbar-out" onClick={() => { if (Date.now() - lastClockTap < 700) return; open('clockout') }}>Clock out</button>
          : <button className="h-12 px-5 rounded-xl bg-ok-solid text-white font-semibold" data-testid="clockbar-in" onClick={() => { { lastClockTap = Date.now(); const r = actions.clockIn(me.id, todayAsg ? current?.id : undefined); if (!r.ok) { toast.error(r.reason ?? 'Can’t clock in'); return } } toast.success('Clocked in', { description: todayAsg && current ? `Charging to Job #${current.jobNo}` : 'Yard / shop time' }) }}>Clock in</button>}
      </div>
  return (
    <div className="flex flex-col gap-4">
      {me.ssHold && <div role="alert" data-testid="field-held" className="rounded-2xl border border-bad/40 bg-bad/10 p-4 text-sm"><b>You’re not cleared for work right now.</b> You’ve been taken off the schedule until you’re cleared. Contact the DER or your supervisor.</div>}
      {me.ssHold ? null : clockBar}
      {/* dive3 F3: dispatch moved you off the job you're clocked in on */}
      {clock?.jobId && !db.assignments.some(x => x.employeeId === me.id && x.jobId === clock.jobId && x.date === today()) && <div className="rounded-2xl bg-warn/15 border border-warn/40 p-3 text-sm flex flex-col gap-2" role="alert" data-testid="clock-removed">
        <span><b>You were taken off Job #{byId(db.jobs, clock.jobId)?.jobNo ?? '—'}.</b> Your clock is still running on it. {todayAsg && current && current.id !== clock.jobId ? `You’re now on Job #${current.jobNo} — clock out and back in to switch.` : 'Call your supervisor, then clock out.'}</span>
        <button className="self-start min-h-[44px] px-4 rounded-xl bg-surface font-semibold" data-testid="clock-removed-out" onClick={() => open('clockout')}>Clock out</button></div>}
      <CrewUpdates />
      {supJobs > 0 && <button onClick={() => open('crew')} data-testid="tile-crew" className="rounded-[28px] bg-accent text-accent-ink p-5 flex items-center gap-4 text-left"><span className="grid size-12 place-items-center rounded-2xl bg-black/15"><Users className="size-6" /></span><span className="flex-1"><span className="block font-semibold text-lg leading-tight">My crew</span><span className="block text-sm opacity-80">Roll call · approve time · crane status · {supJobs} job{supJobs > 1 ? 's' : ''}</span></span><ChevronRight className="size-5 opacity-60" /></button>}
      <RoleBriefing role="field" compact onItem={to => { if ('fieldJob' in to) { open({ job: to.fieldJob, date: to.date }); return true } if ('page' in to && to.page === 'field') { go('time'); return true } if ('ref' in to && to.ref.type === 'equipment') return true; return false }} />
      {current ? <JobHero noCrew job={current} date={todayAsg ? today() : upcoming.find(u => u.a)!.date} /> : <div className="rounded-[28px] bg-surface p-6 text-center"><div className="display text-2xl font-semibold">No job today</div><div className="text-muted mt-1">{workStatus(db, me.id, today())} — check with Dispatch.</div></div>}
      {sigFirst ? <>{sigCard}{timeCard}</> : <>{timeCard}{sigCard}</>}
      <button onClick={() => open('sds')} data-testid="tile-sds" className="rounded-3xl bg-surface p-4 flex items-center gap-4 text-left press"><span className="size-12 rounded-2xl bg-warn/15 text-warn grid place-items-center"><FlaskConical className="size-6" /></span><span className="flex-1"><span className="block font-semibold text-lg">Safety Sheets</span><span className="block text-xs text-muted">Search or scan any chemical · works with no signal</span></span><ChevronRight className="size-5 text-faint" /></button>
      {current && <CrewCard crew={crewOn(db, current.id, todayAsg ? today() : upcoming.find(u => u.a)!.date).map(a => ({ a, e: byId(db.employees, a.employeeId)! }))} />}
      {next.length > 0 && <div>
        <div className="flex items-center justify-between mb-2 px-1"><div className="font-semibold">Coming up</div><button onClick={() => go('schedule')} className="text-sm text-accent font-semibold">All</button></div>
        <div className="flex gap-3 overflow-x-auto scroll-thin -mx-5 px-5 pb-1">{next.map(u => { const j = byId(db.jobs, u.a!.jobId)!; return (
          <button key={u.date} onClick={() => open({ job: j.id, date: u.date })} className="shrink-0 w-44 rounded-3xl bg-surface p-4 text-left">
            <div className="text-xs text-muted font-semibold">{dow(u.date)} {fmtDate(u.date)}</div><div className="font-semibold mt-1 truncate">{customerOf(db, j).name}</div><div className="text-xs text-muted truncate">{siteOf(db, j).city} · #{j.jobNo}</div>
          </button>) })}</div>
      </div>}
      <div className="flex justify-center pt-1 pb-2" data-testid="field-powered-home"><PoweredBy size={12} /></div>
    </div>
  )
}

function ScheduleTab({ open }: { open: (s: SheetKey) => void }) {
  const { db, upcoming } = useMe()
  return (
    <div className="flex flex-col gap-2">
      <div className="display text-3xl font-semibold mb-2">My schedule</div>
      {upcoming.map(u => {
        const j = u.a && byId(db.jobs, u.a.jobId)
        return (
          <button key={u.date} disabled={!j} onClick={() => j && open({ job: j.id, date: u.date })} className={cn('rounded-3xl p-4 flex items-center gap-4 text-left', j ? 'bg-surface' : 'bg-transparent border hairline')}>
            <div className="w-12 text-center"><div className="text-[11px] font-bold text-muted uppercase">{dow(u.date)}</div><div className={cn('display text-2xl font-semibold num', u.date === today() && 'text-accent')}>{u.date.slice(8)}</div></div>
            {j ? <div className="flex-1 min-w-0"><div className="font-semibold truncate">{customerOf(db, j).name}</div><div className="text-xs text-muted truncate">{siteOf(db, j).city} · {j.startTime} · {u.a!.position}</div>{u.travel && <div className="text-xs text-accent mt-0.5 inline-flex items-center gap-1"><Plane className="size-3" />{u.travel.direction}</div>}</div>
              : <div className="flex-1 text-muted text-sm">{u.status === 'Available' ? 'Not dispatched yet' : u.status}</div>}
            {j && <ChevronRight className="size-5 text-faint" />}
          </button>
        )
      })}
    </div>
  )
}

function JobDetail({ jobId, date }: { jobId: string; date: string }) {
  const db = useStore(s => s.db)
  const j = byId(db.jobs, jobId)!
  return <div className="pb-4"><JobHero job={j} date={date} /></div>
}

function TicketTab({ open }: { open: (s: SheetKey) => void }) {
  const { db, me, current, todayAsg } = useMe()
  const [openTk, setOpenTk] = useState<string | null>(null)
  const mine = db.tickets.filter(t => t.supervisorId === me.id || t.crewIds.includes(me.id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
  return (
    <div className="flex flex-col gap-4">
      <div className="display text-3xl font-semibold">Job tickets</div>
      {todayAsg && current ? <button onClick={() => open('ticket')} className="rounded-[28px] bg-accent text-accent-ink p-6 text-left"><FileSignature className="size-8" /><div className="display text-2xl font-semibold mt-3">Today · #{current.jobNo}</div><div className="opacity-80">{(() => { const tk = db.tickets.find(t => t.jobId === current.id && t.date === today() && t.signedAt); return tk ? `✓ Signed by ${tk.signerName ?? 'customer'} ${fmtTs(tk.signedAt!)} — view` : `Fill in the day and hand the phone to ${customerOf(db, current).contact.split(' ')[0]} to sign.` })()}</div></button> : <div className="text-muted">No job today.</div>}
      <div className="font-semibold mt-2">Recent</div>
      {mine.length === 0 && <div className="rounded-3xl bg-surface p-4 text-muted" data-testid="tickets-empty">No tickets yet. Signed tickets from your jobs show up here.</div>}
      {mine.map(t => { const j = byId(db.jobs, t.jobId); if (!j) return null; const op = openTk === t.id; return (
        <div key={t.id} className="rounded-3xl bg-surface p-4" data-testid="past-ticket"><button className="w-full flex items-center gap-3 text-left" onClick={() => setOpenTk(op ? null : t.id)} aria-expanded={op}><div className="flex-1 min-w-0"><div className="font-semibold truncate">#{j.jobNo} · {customerOf(db, j).name}</div><div className="text-xs text-muted">{fmtDate(t.date)}{t.signerName ? ` · signed by ${t.signerName}` : ''}</div></div><Badge tone={t.status === 'Reviewed' || t.status === 'Signed' ? 'ok' : t.status === 'Needs Correction' ? 'bad' : 'info'}>{t.status}</Badge></button>
          {op && <div className="mt-3 text-sm flex flex-col gap-1" data-testid="past-ticket-detail">{Object.entries(t.hours).filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted">{k}</span><b>{v} h</b></div>)}<div className="mt-1">{t.work}</div>{t.delays && <div className="text-muted">Delays: {t.delays}</div>}{t.correction && <div className="text-bad">Office: {t.correction}</div>}{t.photoRefs?.length ? <div className="flex gap-2 flex-wrap mt-1">{t.photoRefs.map(r => <PhotoThumb key={r} src={r} />)}</div> : t.photos ? <div className="text-muted">{t.photos} photos</div> : null}</div>}
        </div>) })}
    </div>
  )
}

function TimeTab({ open }: { open: (s: SheetKey) => void }) {
  const { db, me, clock, current, todayAsg } = useMe()
  const now = useNow(1000)
  const onClockMs = clock ? now - new Date(clock.inAt).getTime() - clock.breakMin * 60000 - (clock.breakStart ? now - new Date(clock.breakStart).getTime() : 0) : 0
  const week = db.time.filter(t => t.employeeId === me.id && t.date >= addDays(today(), -6)).sort((a, b) => b.date.localeCompare(a.date))
  const total = week.reduce((s, t) => s + t.hours, 0)
  return (
    <div className="flex flex-col gap-4">
      <div className="display text-3xl font-semibold">Time</div>
      <FieldReconCard empId={me.id} />
      <div className="rounded-[28px] bg-surface p-6 flex flex-col items-center gap-5">
        <div className={cn('grid size-48 place-items-center rounded-full border-[10px]', clock ? (clock.breakStart ? 'border-warn' : 'border-ok') : 'border-surface-3')}>
          <div className="text-center"><div className="display text-5xl font-semibold num">{dur(onClockMs)}</div><div className="text-xs text-muted mt-1">{clock ? (clock.breakStart ? 'On break' : `In at ${new Date(clock.inAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`) : 'Not clocked in'}</div></div>
        </div>
        {!clock ? (
          <button onClick={() => { { lastClockTap = Date.now(); const r = actions.clockIn(me.id, todayAsg ? current?.id : undefined); if (!r.ok) { toast.error(r.reason ?? 'Can’t clock in'); return } } toast.success('Clocked in', { description: todayAsg && current ? `Charging to Job #${current.jobNo}` : 'Yard / shop time' }) }} className="w-full h-16 rounded-2xl bg-ok-solid text-white text-lg font-semibold inline-flex items-center justify-center gap-2 active:scale-[0.98]" data-testid="clock-in"><Play className="size-6" />Clock in</button>
        ) : (
          <div className="grid grid-cols-2 gap-3 w-full">
            <button onClick={() => actions.toggleBreak(me.id)} className="h-16 rounded-2xl bg-surface-2 font-semibold inline-flex items-center justify-center gap-2"><Coffee className="size-5" />{clock.breakStart ? 'End break' : 'Break'}</button>
            <button onClick={() => { if (Date.now() - lastClockTap < 700) return; open('clockout') }} className="h-16 rounded-2xl bg-bad-solid text-white font-semibold inline-flex items-center justify-center gap-2" data-testid="clock-out"><Square className="size-5" />Clock out</button>
          </div>
        )}
        {clock?.jobId && <div className="text-xs text-muted">Hours post to Job #{byId(db.jobs, clock.jobId)?.jobNo} automatically</div>}
      </div>
      <div className="flex items-center justify-between px-1"><div className="font-semibold">Last 7 days · <span className="num">{total.toFixed(1)}h</span></div><button onClick={() => open('manual')} className="text-sm text-accent font-semibold">+ Add time</button></div>
      {week.map(t => <div key={t.id} className="rounded-3xl bg-surface p-4 flex items-center gap-3"><div className="w-12 text-center"><div className="text-[11px] font-bold text-muted uppercase">{dow(t.date)}</div><div className="font-semibold num">{t.date.slice(8)}</div></div><div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{t.activity}{t.jobId ? ` · #${byId(db.jobs, t.jobId)?.jobNo}` : ''}</div><div className="text-xs text-muted">{t.start}–{t.end}{t.perDiems.length ? ` · ${t.perDiems.join(', ')}` : ''}</div></div><div className="text-right"><div className="font-semibold num">{t.hours}h</div><div className={cn('text-[10px] font-bold', t.status === 'Flagged' ? 'text-bad' : t.status === 'Approved' || t.status === 'Exported' ? 'text-ok' : 'text-muted')}>{t.status}</div></div></div>)}
    </div>
  )
}

function MoreTab({ open }: { open: (s: SheetKey) => void }) {
  const { db, me } = useMe()
  const prefs = useStore(s => s.prefs)
  const expiring = db.certs.filter(c => c.employeeId === me.id && certBand(c).band !== 'ok').length
  return (
    <div className="flex flex-col gap-4">
      <div className="display text-3xl font-semibold">More</div>
      <div className="grid grid-cols-2 gap-3">
        {me.craft === 'Mechanic' && <BigTile icon={<ClipboardList className="size-5" />} label="My work orders" sub="Labor · parts used · status" onClick={() => open('workorders')} testid="tile-workorders" />}
        <BigTile icon={<Container className="size-5" />} label="Check in load" sub="Crane move delivery · GPS + photo" onClick={() => open('checkin')} testid="tile-checkin" />
        <BigTile icon={<UserCircle className="size-5" />} label="My Info" sub="Contacts, address, sizes" onClick={() => open('myinfo')} testid="tile-myinfo" />
        <BigTile icon={<HardHat className="size-5" />} label="My union hours" sub="Hours & fringe by local" onClick={() => open('union')} testid="tile-union" />
        <BigTile icon={<Siren className="size-5" />} label="Breakdown / Emergency" sub="Tells Shop & Dispatch" tone="bad" onClick={() => open('breakdown')} testid="tile-breakdown" />
        <BigTile icon={<Siren className="size-5" />} label="Injury / near miss" sub="Tells Safety & your super" tone="bad" onClick={() => open('incident')} testid="tile-incident" />
        <BigTile icon={<Wallet className="size-5" />} label="My pay" sub="This week, stubs, W-2" onClick={() => open('pay')} testid="tile-pay" />
        <BigTile icon={<Receipt className="size-5" />} label="Turn in a receipt" sub="Snap it · charges the job" onClick={() => open('expenses')} testid="tile-receipt" />
        <BigTile icon={<Hourglass className="size-5" />} label="Standby / NPT" sub="Weather, waiting, downtime" onClick={() => open('npt')} testid="tile-npt" />
        <BigTile icon={<Phone className="size-5" />} label="Call the office" sub="HR, Shop, Safety…" onClick={() => open('contacts')} />
        <BigTile icon={<ClipboardCheck className="size-5" />} label="Pre-trip (DVIR)" sub="Truck & crane" onClick={() => open('dvir')} />
        <BigTile icon={<Fuel className="size-5" />} label="Log fuel" sub="Charges the job" onClick={() => open('fuel')} />
        <BigTile icon={<HardHat className="size-5" />} label="JSA & toolbox" sub="Sign today’s" onClick={() => open('jsa')} />
        <BigTile icon={<ShieldCheck className="size-5" />} testid="tile-certs" label="My certs" sub={expiring ? `${expiring} need attention · send` : 'Send · show at the gate'} onClick={() => open('certs')} />
        <BigTile icon={<ClipboardCheck className="size-5" />} label="Site recon" sub="Hazards, ground, lines" onClick={() => { location.href = `?recon=${currentJobFor3b(db, me.id)?.id ?? ''}` }} testid="tile-recon" />
        <BigTile icon={<MapPin className="size-5" />} label="Site notes" sub="Pads, roads, gate codes" onClick={() => { const j = currentJobFor3b(db, me.id); location.href = `?sitedata=${j?.siteId ?? ''}` }} testid="tile-sitedata" />
        <BigTile icon={<ClipboardCheck className="size-5" />} label="Crane inspection" sub="Daily · monthly · annual" onClick={() => { const j = currentJobFor3b(db, me.id); location.href = `?inspect=${j?.craneId ?? ''}` }} testid="tile-inspect" />
        <BigTile icon={<Anchor className="size-5" />} label="Rigging check" sub="Slings & shackles · report damage" onClick={() => open('riginspect')} testid="tile-rigging" />
        <BigTile icon={<CreditCard className="size-5" />} label="My cards" sub="Company & fuel cards" onClick={() => open('cards')} testid="tile-cards" />
        <BigTile icon={<Package className="size-5" />} label="My gear" sub="Checked out to me" onClick={() => open('gear')} />
        <BigTile icon={<ClipboardList className="size-5" />} label="Request parts" sub="Rigging, PPE, supplies" onClick={() => open('parts')} testid="tile-parts" />
        <BigTile icon={<CalendarDays className="size-5" />} label="Time off" sub="Request PTO" onClick={() => open('pto')} />
        <BigTile icon={<FlaskConical className="size-5" />} label="Safety Sheets" sub="Works offline" onClick={() => open('sds')} />
        <BigTile icon={prefs.mode === 'light' ? <Moon className="size-5" /> : <Sun className="size-5" />} label="Theme" sub="Truck paint jobs" onClick={() => open('theme')} />
      </div>
      {useStore.getState().session?.role === 'guest' ? <button onClick={openGuestSwitch} data-testid="field-guest-switch" className="rounded-3xl bg-accent text-accent-ink p-4 flex items-center gap-3 font-semibold"><LogOut className="size-5" />Switch role</button> : <button onClick={() => useStore.getState().signOut()} className="rounded-3xl bg-surface p-4 flex items-center gap-3 text-muted font-semibold"><LogOut className="size-5" />Sign out · {fullName(me)}</button>}
      <div className="flex justify-center pt-2 pb-4" data-testid="field-powered"><PoweredBy size={13} /></div>
    </div>
  )
}

export function ContactsList() {
  const db = useStore(s => s.db)
  return <div className="flex flex-col gap-2 pb-4">{db.contacts.map(c => (
    <div key={c.id} className="rounded-3xl bg-surface p-4 flex items-center gap-3"><div className="flex-1 min-w-0"><div className="font-semibold">{c.label}</div><div className="text-xs text-muted truncate">{c.name} · {c.phone}</div></div><CallButton phone={c.phone} label="Call" variant={c.group === 'Emergency' ? 'danger' : 'secondary'} className="rounded-full h-11 px-4 gap-1.5" /></div>
  ))}<div className="text-[11px] text-muted text-center">Demo numbers · office can edit these in Settings</div></div>
}

/** Field SDS: big search, scan a container, and the chemicals on my job / truck first. Data lives on the device → works offline. */
function FieldSds() {
  const { db, me } = useMe()
  const jobIds = new Set(db.assignments.filter(a => a.employeeId === me.id && a.date >= addDays(today(), -1) && a.date <= addDays(today(), 1)).map(a => a.jobId))
  const units = new Set([me.homeTruckId, me.homeCraneId].filter(Boolean) as string[])
  const fromCo = db.checkouts.filter(c => (c.jobId && jobIds.has(c.jobId)) || (c.target && units.has(targetUnit(db, c.target) ?? ''))).map(c => byId(db.items, c.itemId)?.sdsId)
  const truckKit = me.homeTruckId || me.homeCraneId ? ['sds-3', 'sds-5', 'sds-10', 'sds-7'] : []
  const mine = [...new Set([...fromCo, ...truckKit].filter(Boolean) as string[])]
  return <div className="pb-8"><SdsLibrary field mine={mine} /></div>
}

/** Gate code, site notes and the lift plan for today's job: what "gate code" / "lift plan" in search opens. */
function SiteSheet({ job }: { job: T.Job }) {
  const db = useStore(s => s.db); const site = siteOf(db, job)
  const docs = job.docs.filter(d => d.kind === 'Lift Plan' || d.kind === 'Site Map' || d.kind === 'Permit')
  return <div className="flex flex-col gap-4 pb-8" data-testid="site-sheet">
    <div className="rounded-3xl bg-surface p-5"><div className="label">Gate code</div><div className="display text-4xl font-semibold num mt-1" data-testid="site-gate">{site.gate || 'None on file'}</div><div className="text-sm text-muted mt-1">{site.name} · {site.city}, {site.state}</div></div>
    {job.notes && <div className="rounded-3xl bg-surface p-4 text-sm"><div className="label mb-1">Site notes</div>{job.notes}</div>}
    <a href={navUrl(site.lat, site.lng)} target="_blank" rel="noreferrer" className="h-12 rounded-2xl bg-info-solid text-white font-semibold inline-flex items-center justify-center gap-2"><Navigation className="size-5" />Directions</a>
    {docs.length > 0 && <div className="rounded-3xl bg-surface p-4"><div className="label mb-2">Lift plan & documents</div>{docs.map(d => <div key={d.id} className="flex items-center gap-2 py-2 text-sm min-h-[44px]"><FileText className="size-4 text-muted" /><span className="flex-1">{d.name}</span><Badge tone="neutral">{d.kind}</Badge></div>)}</div>}
  </div>
}
