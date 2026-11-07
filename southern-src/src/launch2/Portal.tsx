import { companyOf } from '../data/brand'
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Mail, ArrowRight, CheckCircle2, AlertTriangle, MapPin, Truck, Users, Clock, FileText, ShieldCheck, Camera, ClipboardCheck, Radio, ChevronLeft, LogOut, Download, Sun, Inbox, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../data/store'
import { useCompany } from '../data/brand'
import { byId, fullName, siteOf } from '../data/logic'
import { fmtDate, cn } from '../lib/util'
import { Logo } from '../shell/Splash'
import { PoweredBy } from '../components/PoweredBy'
import { useL2 } from './l2store'
import { certPacketPdf } from '../data/certshare'
import type * as T from '../data/types'
import { PortalRecon, PortalChangeOrders } from '../batch3b/PortalExtras'

export const PORTAL_CUSTOMER = 'Plains Wind Partners'
const ACCOUNTS: Record<string, { name: string; title: string; role: 'Approver' | 'Viewer' }> = { 'rick.dawson@plainswind.com': { name: 'Rick Dawson', title: 'O&M Site Manager', role: 'Approver' } }
/** Demo invite list: only known customer contacts get a link. Production needs real auth (signed, single-use, expiring links issued server-side). */
export const portalInvited = (email: string, contactName?: string) => { const e = email.trim().toLowerCase(); const n = (contactName ?? '').toLowerCase().split(/\s+/).filter(Boolean); return !!ACCOUNTS[e] || (n.length >= 2 && e === `${n[0]}.${n[n.length - 1]}@plainswind.com`.replace(/[^a-z.@]/g, '')) }
const statusLine = (j: T.Job, crane?: T.Equipment) => j.status === 'En Route' && crane?.route ? `Crane in transit · ETA ${new Date(crane.route.eta).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : j.status === 'On Site' ? 'Crew on site · working' : j.status === 'Complete' ? 'Work complete' : j.status === 'Delayed' ? 'Delayed — see today’s notes' : `Starts ${fmtDate(j.startDate)} at ${j.startTime}`
const tone = (s: T.JobStatus) => s === 'On Site' ? 'bg-ok/15 text-ok' : s === 'En Route' ? 'bg-info/15 text-info' : s === 'Delayed' ? 'bg-warn/15 text-warn' : s === 'Complete' ? 'bg-surface-3 text-muted' : 'bg-accent/15 text-accent'
const hrs = (t: T.EodTicket) => Object.values(t.hours).reduce((s: number, h) => s + (h ?? 0), 0)

function Photo({ seed, label }: { seed: number; label: string }) {
  const hues = ['#0f2d52', '#3f6212', '#7c2d12', '#155e75', '#4c1d95', '#713f12']
  return <div className="aspect-[4/3] rounded-xl relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${hues[seed % 6]}, #0b0f17)` }}><svg viewBox="0 0 100 75" className="absolute inset-0 w-full h-full opacity-40"><path d={`M0 60 L${30 + seed % 20} 40 L60 55 L100 35 L100 75 L0 75Z`} fill="#fff" fillOpacity=".15" /><path d={`M${50 + seed % 15} 70 L${52 + seed % 15} 10 L${80 - seed % 9} 14`} stroke="#fff" strokeWidth="1.2" fill="none" /></svg><span className="absolute bottom-1.5 left-2 text-[10px] text-white/80 font-semibold">{label}</span></div>
}

export default function Portal() {
  const db = useStore(s => s.db), ready = useStore(s => s.ready)
  const company = useCompany()
  const [email, setEmail] = useState('rick.dawson@plainswind.com')
  const [stage, setStage] = useState<'signin' | 'sent' | 'in'>(() => sessionStorage.getItem('sc-portal') ? 'in' : 'signin')
  const [jobId, setJobId] = useState<string | null>(null)
  const [tab, setTab] = useState<'projects' | 'digest'>('projects')
  if (!ready) return null
  const cust = db.customers.find(c => c.name === PORTAL_CUSTOMER) ?? db.customers[0]
  const me = ACCOUNTS[sessionStorage.getItem('sc-portal') ?? email] ?? { name: cust.contact, title: 'Site representative', role: 'Approver' as const }
  if (stage !== 'in') return (
    <div className="min-h-screen bg-[#05070b] text-white grid place-items-center px-5" data-testid="portal-signin">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10"><Logo size={36} /><div><div className="font-semibold">{company.name}</div><div className="text-xs text-white/50">Customer portal</div></div></div>
        <AnimatePresence mode="wait">{stage === 'signin' ? (
          <motion.div key="a" exit={{ opacity: 0, y: -10 }}>
            <h1 className="text-4xl font-semibold tracking-tight">Your projects, live.</h1>
            <p className="text-white/55 mt-3">Daily tickets, photos, crew and cert packets — every day of every job. No password needed.</p>
            <label className="block mt-8 text-xs text-white/50">Work email</label>
            <input data-testid="portal-email" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full h-14 rounded-2xl bg-white/5 border border-white/10 px-4 text-lg outline-none focus:border-white/30" />
            <button data-testid="portal-send" onClick={() => { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error('Enter your work email'); if (!portalInvited(email, cust.contact)) return toast.error('That email isn’t on the invite list', { id: 'portal-denied', description: 'Ask your Southern project manager to invite you.' }); setEmail(email.trim().toLowerCase()); setStage('sent') }} className="mt-4 w-full h-14 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-2">Email me a sign-in link <ArrowRight className="size-4" /></button>
            <div className="mt-4 text-xs text-white/40 flex items-center gap-1.5"><Lock className="size-3.5" />Invite-only. You’ll only see {cust.name}’s projects.</div>
            <div className="mt-2 text-[11px] text-white/30" data-testid="portal-demo-auth">Demo: checks the invite list only — production needs real authentication (signed one-time links).</div>
          </motion.div>) : (
          <motion.div key="b" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="size-16 rounded-2xl bg-white/10 grid place-items-center"><Inbox className="size-8" /></div>
            <h1 className="text-3xl font-semibold tracking-tight mt-6">Check your inbox</h1>
            <p className="text-white/55 mt-2">We sent a one-time link to <b className="text-white">{email}</b>. It expires in 15 minutes.</p>
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/[.04] p-4 text-sm"><div className="text-white/45 text-xs flex items-center gap-1.5"><Mail className="size-3.5" />Preview · from portal@slh-demo.example</div><div className="font-semibold mt-2">Sign in to {company.name}</div><div className="text-white/55 mt-1">Tap the button to open your projects. Didn’t ask for this? Ignore it.</div>
              <button data-testid="portal-magic" onClick={() => { if (!portalInvited(email, cust.contact)) { setStage('signin'); return } sessionStorage.setItem('sc-portal', email); setStage('in') }} className="mt-4 h-11 px-5 rounded-xl bg-[#ef3b3b] font-semibold">Open my projects</button></div>
            <button onClick={() => setStage('signin')} className="mt-4 text-sm text-white/50">Use a different email</button>
          </motion.div>)}</AnimatePresence>
        <div className="mt-14"><PoweredBy tone="dark" /></div>
      </motion.div>
    </div>
  )
  // Customers only see their own company's jobs — scoped here, by customerId.
  const jobs = db.jobs.filter(j => j.customerId === cust.id && !j.quoteLost && (j.stage !== 'Quote' || !!j.quoteSentAt)) // dive3: lost quotes and unsent drafts never show to the customer.sort((a, b) => (a.status === 'Complete' ? 1 : 0) - (b.status === 'Complete' ? 1 : 0) || b.startDate.localeCompare(a.startDate))
  const job = jobs.find(j => j.id === jobId)
  return (
    <div className="min-h-screen bg-bg text-ink" data-testid="portal">
      <header className="sticky top-0 z-20 backdrop-blur-xl bg-bg/80 border-b hairline"><div className="max-w-5xl mx-auto px-5 h-16 flex items-center gap-3">
        <Logo size={28} /><div className="flex-1 min-w-0"><div className="font-semibold leading-tight">{cust.name}</div><div className="text-xs text-muted">{me.name} · {me.title} · {me.role}</div></div>
        <div className="hidden sm:flex rounded-xl bg-surface-2 p-1 text-sm">{(['projects', 'digest'] as const).map(t => <button key={t} data-testid={`portal-tab-${t}`} onClick={() => { setTab(t); setJobId(null) }} className={cn('px-3 h-8 rounded-lg capitalize', tab === t && 'bg-surface shadow font-semibold')}>{t === 'digest' ? 'Daily digest' : 'Projects'}</button>)}</div>
        <button aria-label="Sign out" onClick={() => { sessionStorage.removeItem('sc-portal'); setStage('signin') }} className="size-9 grid place-items-center rounded-xl hover:bg-surface-2"><LogOut className="size-4" /></button>
      </div></header>
      <main className="max-w-5xl mx-auto px-5 py-8">
        <div className="sm:hidden flex rounded-xl bg-surface-2 p-1 text-sm mb-5">{(['projects', 'digest'] as const).map(t => <button key={t} onClick={() => { setTab(t); setJobId(null) }} className={cn('flex-1 h-8 rounded-lg capitalize', tab === t && 'bg-surface font-semibold')}>{t === 'digest' ? 'Daily digest' : 'Projects'}</button>)}</div>
        {tab === 'digest' ? <Digest db={db} jobs={jobs} cust={cust} /> : job ? <ProjectView db={db} job={job} me={me} onBack={() => setJobId(null)} /> : <>
          <h1 className="display text-4xl font-semibold tracking-tight">Your projects</h1>
          <p className="text-muted mt-1">{jobs.filter(j => j.status !== 'Complete').length} active · {jobs.length} total with {company.name}</p>
          <div className="grid md:grid-cols-2 gap-4 mt-6">{jobs.map((j, i) => { const crane = byId(db.equipment, j.craneId); const site = siteOf(db, j); const t = db.tickets.filter(x => x.jobId === j.id); const last = t.sort((a, b) => b.date.localeCompare(a.date))[0]
            return <motion.button key={j.id} data-testid="portal-job" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} onClick={() => setJobId(j.id)} className="card p-5 text-left hover:border-faint/50 transition">
              <div className="flex items-center gap-2"><span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold inline-flex items-center gap-1.5', tone(j.status))}>{(j.status === 'On Site' || j.status === 'En Route') && <Radio className="size-3 blink" />}{j.status}</span><span className="text-xs text-muted ml-auto">#{j.jobNo}</span></div>
              <div className="font-semibold text-lg mt-3 leading-snug">{j.name}</div>
              <div className="text-sm text-muted mt-1 flex items-center gap-1.5"><MapPin className="size-3.5" />{site.name}</div>
              <div className="text-sm mt-3">{statusLine(j, crane)}</div>
              {last && <div className="mt-3 h-1.5 rounded-full bg-surface-3 overflow-hidden"><div className="h-full bg-accent" style={{ width: `${last.pctComplete}%` }} /></div>}
              <div className="text-xs text-muted mt-2">{t.length} daily ticket{t.length === 1 ? '' : 's'} · {fmtDate(j.startDate)} – {fmtDate(j.endDate)}</div>
            </motion.button> })}
            {!jobs.length && <div className="text-muted">No projects yet.</div>}</div>
        </>}
        <footer className="mt-16 pb-8 flex justify-center"><PoweredBy /></footer>
      </main>
    </div>
  )
}

function ProjectView({ db, job, me, onBack }: { db: T.DB; job: T.Job; me: { name: string; role: string }; onBack: () => void }) {
  const crane = byId(db.equipment, job.craneId), site = siteOf(db, job)
  const tickets = useMemo(() => db.tickets.filter(t => t.jobId === job.id).sort((a, b) => b.date.localeCompare(a.date)), [db, job.id])
  const disputes = useL2(s => s.disputes), act = useL2(s => s.ticketAction)
  const [sec, setSec] = useState<'history' | 'docs' | 'recon' | 'photos' | 'co'>('history')
  const [disputing, setDisputing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const crewIds = [...new Set(tickets.flatMap(t => t.crewIds).concat(db.assignments.filter(a => a.jobId === job.id).map(a => a.employeeId)))]
  const certs = db.certs.filter(c => crewIds.includes(c.employeeId))
  const dl = async () => { const blob = await certPacketPdf(db, { employeeIds: crewIds, certIds: certs.map(c => c.id), jobId: job.id, note: 'Customer portal download', to: { name: me.name, role: 'Customer' }, token: 'portal', at: new Date().toISOString(), expires: new Date(Date.now() + 7 * 864e5).toISOString() }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `Cert-packet-${job.jobNo}.pdf`; a.click(); toast.success('Cert packet downloaded') }
  return <div data-testid="portal-project">
    <button onClick={onBack} className="text-sm text-muted flex items-center gap-1 mb-4"><ChevronLeft className="size-4" />All projects</button>
    <div className="label">Job #{job.jobNo}</div>
    <h1 className="display text-4xl font-semibold tracking-tight mt-1">{job.name}</h1>
    <div className="text-muted mt-1 flex items-center gap-1.5"><MapPin className="size-4" />{site.name} · {site.city}, {site.state}</div>
    <div className="card p-5 mt-5 flex flex-wrap items-center gap-6">
      <div><div className="label">Live status</div><div className="text-xl font-semibold mt-1 flex items-center gap-2"><span className={cn('size-2.5 rounded-full', job.status === 'On Site' ? 'bg-ok-solid blink' : 'bg-accent')} />{statusLine(job, crane)}</div></div>
      <div><div className="label">Equipment</div><div className="font-semibold mt-1">{crane ? `${crane.capacity}t ${crane.make} ${crane.model}` : 'Rigging crew'}</div></div>
      <div><div className="label">Crew lead</div><div className="font-semibold mt-1">{fullName(byId(db.employees, job.supervisorId))}</div></div>
      <div><div className="label">Complete</div><div className="font-semibold mt-1">{tickets[0]?.pctComplete ?? 0}%</div></div>
    </div>
    <div className="flex gap-1 mt-6 border-b hairline overflow-x-auto">{([['history', 'Daily history'], ['docs', 'Documents & certs'], ['recon', 'Site recon'], ['co', 'Change orders'], ['photos', 'Photos']] as const).map(([k, l]) => <button key={k} data-testid={`portal-sec-${k}`} onClick={() => setSec(k)} className={cn('px-4 h-11 text-sm whitespace-nowrap border-b-2 -mb-px', sec === k ? 'border-accent font-semibold' : 'border-transparent text-muted')}>{l}</button>)}</div>
    {sec === 'history' && <div className="mt-6 flex flex-col gap-4">{tickets.length ? tickets.map(t => { const d = disputes[t.id]; const signed = ['Signed', 'Submitted', 'Reviewed'].includes(t.status)
      return <div key={t.id} className="card p-5" data-testid="portal-day">
        <div className="flex items-center gap-3 flex-wrap"><div className="text-lg font-semibold">{fmtDate(t.date, { weekday: 'long', month: 'short', day: 'numeric' })}</div>
          {signed && <span className="rounded-full bg-ok/15 text-ok px-2.5 py-0.5 text-[11px] font-bold">Signed{t.signerName ? ` · ${t.signerName}` : ''}</span>}
          {d && <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', d.status === 'approved' ? 'bg-ok/15 text-ok' : 'bg-warn/15 text-warn')}>{d.status === 'approved' ? 'You approved' : 'Disputed'}</span>}
          <span className="ml-auto text-sm text-muted">{t.pctComplete}% complete</span></div>
        <p className="mt-3">{t.work}</p>
        <div className="grid sm:grid-cols-3 gap-3 mt-4 text-sm">
          <div className="flex gap-2"><Users className="size-4 text-muted mt-0.5" /><div><div className="label">Crew</div>{t.crewIds.map(id => fullName(byId(db.employees, id))).join(', ') || '—'}</div></div>
          <div className="flex gap-2"><Clock className="size-4 text-muted mt-0.5" /><div><div className="label">Hours</div>{hrs(t)} h · {Object.entries(t.hours).filter(([, h]) => h).map(([k, h]) => `${k} ${h}`).join(' · ')}</div></div>
          <div className="flex gap-2"><Truck className="size-4 text-muted mt-0.5" /><div><div className="label">Equipment</div>{[t.equipmentIn && `In: ${t.equipmentIn}`, t.equipmentOut && `Out: ${t.equipmentOut}`].filter(Boolean).join(' · ') || (crane ? crane.code : '—')}</div></div>
        </div>
        {t.delays && <div className="mt-3 text-sm text-warn flex gap-2"><AlertTriangle className="size-4 mt-0.5" />Notes: {t.delays}</div>}
        {t.photos > 0 && <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-4">{Array.from({ length: Math.min(6, t.photos) }, (_, i) => <Photo key={i} seed={i + t.date.charCodeAt(9)} label={`${i + 1}/${t.photos}`} />)}</div>}
        {t.signature && <img src={t.signature} alt="signature" className="h-10 mt-3 opacity-80 dark:invert" />}
        {me.role === 'Approver' && !d && <div className="flex gap-2 mt-4"><button data-testid="portal-approve" onClick={() => { act(t.id, 'approved'); toast.success('Ticket approved', { description: `${companyOf().shortName}’s PM was notified.` }) }} className="h-10 px-4 rounded-xl bg-ok-solid text-white font-semibold text-sm flex items-center gap-1.5"><CheckCircle2 className="size-4" />Approve</button><button data-testid="portal-dispute" onClick={() => { setDisputing(t.id); setReason('') }} className="h-10 px-4 rounded-xl bg-surface-2 font-semibold text-sm">Dispute</button></div>}
        {d?.reason && <div className="mt-3 text-sm text-muted">Your note: “{d.reason}” — {companyOf().shortName} will respond within 1 business day.</div>}
        {disputing === t.id && <div className="mt-4 flex flex-col gap-2"><textarea data-testid="portal-reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="What’s off? e.g. Hours show 10, crew left at 3 PM." className="rounded-xl bg-surface-2 p-3 text-sm min-h-20 outline-none" /><div className="flex gap-2"><button data-testid="portal-dispute-send" onClick={() => { if (!reason.trim()) return toast.error('Add a reason'); act(t.id, 'disputed', reason.trim()); setDisputing(null); toast('Dispute sent to the PM') }} className="h-10 px-4 rounded-xl bg-warn text-black font-semibold text-sm">Send dispute</button><button onClick={() => setDisputing(null)} className="h-10 px-4 text-sm text-muted">Cancel</button></div></div>}
      </div> }) : <div className="text-muted">No daily tickets yet — the first one posts at the end of day one.</div>}</div>}
    {sec === 'docs' && <div className="mt-6 grid md:grid-cols-2 gap-4">
      <div className="card p-5"><div className="font-semibold flex items-center gap-2"><FileText className="size-4" />Project documents</div><div className="mt-3 flex flex-col divide-y hairline">{(job.docs ?? []).filter(d => d.kind !== 'Customer PO' || me.role === 'Approver').map(d => <div key={d.id} className="py-2.5 flex items-center gap-3 text-sm">{d.dataUrl && d.kind === 'Ticket' && <img src={d.dataUrl} alt={d.name} data-testid="portal-signed-img" className="h-14 rounded-lg border hairline" />}<span className="flex-1">{d.name}<div className="text-xs text-muted">{d.kind} · {fmtDate(d.added)}{d.kind === 'Ticket' && d.dataUrl ? ` · approved by ${d.by}` : ''}</div></span><Download className="size-4 text-muted" /></div>)}{tickets.filter(t => t.signature || t.status !== 'Draft').slice(0, 5).map(t => <div key={t.id} className="py-2.5 flex items-center gap-3 text-sm"><span className="flex-1">Signed ticket — {fmtDate(t.date)}.pdf<div className="text-xs text-muted">Ticket · {t.signerName ?? 'Site rep'}</div></span><Download className="size-4 text-muted" /></div>)}</div></div>
      <div className="card p-5"><div className="font-semibold flex items-center gap-2"><ShieldCheck className="size-4" />Crew cert packet</div><div className="text-sm text-muted mt-1">{crewIds.length} crew · {certs.filter(c => c.verified === 'Verified').length} verified certs</div><div className="mt-3 flex flex-col gap-1.5 text-sm">{crewIds.slice(0, 8).map(id => { const cs = certs.filter(c => c.employeeId === id); return <div key={id} className="flex justify-between"><span>{fullName(byId(db.employees, id))}</span><span className="text-muted">{cs.map(c => c.type).slice(0, 3).join(', ')}</span></div> })}</div><button data-testid="portal-certs" onClick={dl} className="mt-4 h-10 px-4 rounded-xl bg-accent text-accent-ink font-semibold text-sm flex items-center gap-1.5"><Download className="size-4" />Download cert packet (PDF)</button></div>
    </div>}
    {sec === 'co' && <PortalChangeOrders job={job} me={me} />}
    {sec === 'recon' && <PortalRecon job={job} />}
    {sec === 'photos' && <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="portal-photos">{tickets.flatMap(t => Array.from({ length: Math.min(4, t.photos) }, (_, i) => <Photo key={t.id + i} seed={i + t.date.charCodeAt(9)} label={fmtDate(t.date)} />))}{!tickets.some(t => t.photos) && <div className="text-muted col-span-full flex items-center gap-2"><Camera className="size-4" />Photos appear here as the crew uploads them.</div>}</div>}
  </div>
}

function Digest({ db, jobs, cust }: { db: T.DB; jobs: T.Job[]; cust: T.Customer }) {
  const active = jobs.filter(j => j.status !== 'Complete' && j.status !== 'Planned').slice(0, 3)
  return <div data-testid="portal-digest" className="max-w-xl mx-auto">
    <div className="label mb-2">Email preview · sent 6:00 PM daily</div>
    <div className="rounded-3xl overflow-hidden border hairline bg-white text-[#111]">
      <div className="bg-[#0b0f17] text-white p-6"><div className="text-xs text-white/50">To {cust.contact} · {cust.name}</div><div className="text-2xl font-semibold mt-2 flex items-center gap-2"><Sun className="size-6 text-amber-300" />Today with Southern</div></div>
      <div className="p-6 flex flex-col gap-5">{(active.length ? active : jobs.slice(0, 2)).map(j => { const t = db.tickets.filter(x => x.jobId === j.id).sort((a, b) => b.date.localeCompare(a.date))[0]
        return <div key={j.id}><div className="font-semibold">{siteOf(db, j).name} · #{j.jobNo}</div><div className="text-sm text-[#555] mt-1">{t ? `${t.work} · ${t.photos} photos · ticket ${t.status.toLowerCase()} · ${t.pctComplete}% complete` : j.status}</div></div> })}
        <div className="rounded-xl bg-[#f4f4f5] p-4 text-sm"><b>Needs you:</b> {db.tickets.filter(t => jobs.some(j => j.id === t.jobId) && t.status === 'Signed').length} ticket(s) ready to approve.</div>
        <div className="h-11 rounded-xl bg-[#ef3b3b] text-white font-semibold grid place-items-center">Open the portal</div>
        <div className="flex justify-center"><PoweredBy tone="light" /></div>
      </div>
    </div>
  </div>
}
