import { useEffect, useMemo, useState } from 'react'
import { SdsLibrary } from '../components/inv/Sds'
import { CertShareLog } from '../components/CertSend'
import { toast } from 'sonner'
import { Plus, ShieldAlert, HardHat, ClipboardCheck, FlaskConical, BadgeCheck } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { inScope, byId, fullName, certBand, customerOf, eqLabel } from '../data/logic'
import { cn, fmtDate, today, addDays, diffDays } from '../lib/util'
import { certValidDays } from '../data/certValidity'
import { PageHeader, Segmented, Badge, Button, Modal, Field, Card, Empty } from '../components/ui'
import { EmpRef } from '../components/bits'

const BAND_TONE = { expired: 'bad', '30': 'bad', '60': 'warn', '90': 'warn', ok: 'ok' } as const
const BAND_LABEL = { expired: 'Expired', '30': '≤ 30 days', '60': '31–60 days', '90': '61–90 days', ok: 'Current' }

export default function Safety() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const role = useStore(s => s.session!.role)
  const [tab, setTab] = useState<'certs' | 'incidents' | 'talks' | 'inspections' | 'sds' | 'osha'>(() => { const v = sessionStorage.getItem('page-sub:safety'); sessionStorage.removeItem('page-sub:safety'); return (['incidents', 'talks', 'inspections', 'sds', 'osha'].includes(v ?? '') ? v : 'certs') as 'certs' })
  useEffect(() => { const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.page === 'safety' && d.hash) { sessionStorage.removeItem('page-sub:safety'); setTab(d.hash); setTimeout(() => document.querySelector('[data-testid=safety-tabs]')?.scrollIntoView({ behavior: 'smooth' }), 50) } }; window.addEventListener('page-sub', h); return () => window.removeEventListener('page-sub', h) }, [])
  const [band, setBand] = useState<'expired' | '30' | '60' | '90'>('30')
  const [newInc, setNewInc] = useState(false)
  const [newTalk, setNewTalk] = useState(false)
  const [openInc, setOpenInc] = useState<string | null>(null), [renew, setRenew] = useState<T.Cert | null>(null), [insp1, setInsp1] = useState<{ id: string; result: 'Pass' | 'Fail' } | null>(null) // dive2
  const people = new Set(db.employees.filter(e => inScope(e, f) && e.status === 'Active').map(e => e.id))
  const certs = useMemo(() => db.certs.filter(c => people.has(c.employeeId)).map(c => ({ c, b: certBand(c) })), [db, f])
  const counts = { expired: 0, '30': 0, '60': 0, '90': 0, ok: 0 } as Record<string, number>
  certs.forEach(x => counts[x.b.band]++)
  const review = certs.filter(x => x.c.verified === 'Needs Review')
  const can = role === 'safety' || role === 'owner' || role === 'hr'
  const incidents = db.incidents
  const days = (() => { const rec = incidents.filter(i => i.kind === 'Recordable').sort((a, b) => b.date.localeCompare(a.date))[0]; return rec ? Math.max(0, diffDays(today(), rec.date)) : 365 })() // dive2: local calendar days (was UTC-parsed → "1 days" on the same day)
  const insp = [...db.inspections].sort((a, b) => a.due.localeCompare(b.due))
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow="Safety" title={<span><span className="num" data-testid="days-no-recordable">{days}</span> {days === 1 ? 'day' : 'days'} without a recordable</span>} sub={`${counts.expired} expired · ${counts['30']} expiring in 30 days · ${incidents.filter(i => i.status !== 'Closed').length} open incidents`} actions={<>
        <Button icon={<HardHat className="size-4" />} onClick={() => setNewTalk(true)}>JSA / Toolbox talk</Button>
        <Button variant="danger" icon={<ShieldAlert className="size-4" />} onClick={() => setNewInc(true)}>Report incident</Button>
      </>} />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: 'certs', label: 'Certifications' }, { value: 'incidents', label: 'Incidents', count: incidents.filter(i => i.status !== 'Closed').length }, { value: 'talks', label: 'JSAs & talks' }, { value: 'inspections', label: 'Inspections', count: insp.filter(i => i.due < today()).length }, { value: 'sds', label: 'SDS' }, { value: 'osha', label: 'OSHA 300' }]} />
      {tab === 'certs' && <div className="flex flex-col gap-4">
        <div className="card p-5" data-testid="safety-cert-sends"><div className="flex items-center mb-3"><div className="font-semibold">Certs sent from the field</div><span className="ml-auto text-xs text-muted">Demo log — nothing sent externally</span></div><CertShareLog limit={8} /></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(['expired', '30', '60', '90'] as const).map(b => (
            <button key={b} onClick={() => setBand(b)} className={cn('card p-5 text-left transition', band === b && 'accent-glow border-accent')}>
              <div className="label">{BAND_LABEL[b]}</div>
              <div className={cn('display text-4xl font-semibold num mt-2', b === 'expired' || b === '30' ? 'text-bad' : 'text-warn')}>{counts[b]}</div>
            </button>
          ))}
        </div>
        <div className="card p-0 overflow-hidden">
          {certs.filter(x => x.b.band === band).sort((a, b) => a.b.days - b.b.days).map(({ c, b }) => (
            <div key={c.id} className="flex items-center gap-4 px-5 py-3 border-b hairline last:border-0">
              <span className="flex-1 min-w-0"><EmpRef id={c.employeeId} className="font-semibold" /><span className="block text-xs text-muted">{byId(db.employees, c.employeeId)?.craft} · {c.provider}</span></span>
              <span className="w-48 text-sm font-medium">{c.type}</span>
              <span className="w-32 text-sm num">{fmtDate(c.expires, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <Badge tone={BAND_TONE[b.band]}>{b.band === 'expired' ? `${-b.days}d ago` : `${b.days}d left`}</Badge>
              {c.pendingExpires ? <Badge tone="info">Renewal pending · {fmtDate(c.pendingExpires, { month: 'short', day: 'numeric', year: 'numeric' })}</Badge> : can && <Button size="sm" data-testid="log-renewal" onClick={() => setRenew(c)}>Log renewal</Button>}
            </div>
          ))}
          {!certs.some(x => x.b.band === band) && <Empty title="Nobody in this window" />}
        </div>
        {review.length > 0 && <Card><div className="font-semibold mb-3 flex items-center gap-2"><BadgeCheck className="size-4" />Uploaded by field — needs review ({review.length})</div>
          {review.map(({ c }) => <div key={c.id} className="flex items-center gap-3 py-2 border-b hairline last:border-0"><span className="flex-1"><EmpRef id={c.employeeId} className="font-semibold" /> · {c.type} <span className="text-muted text-xs">#{c.credentialNo}</span>{c.pendingExpires && <span className="block text-xs text-info" data-testid="pending-renewal">Renewal: new expiry {fmtDate(c.pendingExpires, { month: 'short', day: 'numeric', year: 'numeric' })}{c.pendingProof ? ` · proof ${c.pendingProof}` : ''} — current date stays until verified</span>}</span>{can && <><Button size="sm" variant="ok" onClick={() => actions.verifyCert(c.id, 'Verified')}>Verify</Button><Button size="sm" variant="ghost" onClick={() => actions.verifyCert(c.id, 'Rejected')}>Reject</Button></>}</div>)}
        </Card>}
      </div>}
      {tab === 'incidents' && <div className="flex flex-col gap-3">{incidents.map(i => (
        <Card key={i.id}>
          <div className="flex flex-wrap gap-4 items-start">
            <div className="flex-1 min-w-[240px] cursor-pointer" role="button" tabIndex={0} data-testid="incident-open" onClick={() => setOpenInc(i.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenInc(i.id) }}>
              <div className="flex items-center gap-2 flex-wrap"><span className="font-semibold">{i.no}</span><Badge tone={i.kind === 'Recordable' ? 'bad' : i.kind === 'Near Miss' ? 'info' : 'warn'}>{i.kind}</Badge><Badge tone={i.severity === 'High' ? 'bad' : i.severity === 'Medium' ? 'warn' : 'neutral'}>{i.severity}</Badge><span className="text-xs text-muted">{fmtDate(i.date)}</span></div>
              <div className="mt-2">{i.description}</div>
              <div className="text-xs text-muted mt-1">{i.jobId ? `Job #${byId(db.jobs, i.jobId)?.jobNo} · ` : ''}{i.unitId ? `${eqLabel(byId(db.equipment, i.unitId))} · ` : ''}{i.employeeId ? `Injured: ${fullName(byId(db.employees, i.employeeId))} · ` : ''}{i.time ? `${i.time} · ` : ''}{i.location ? `${i.location} · ` : ''}reported by {i.reportedBy}{i.wc?.claimNo ? ` · WC claim ${i.wc.claimNo}` : ''}</div>
              {i.correctiveAction && <div className="text-sm mt-2"><span className="text-muted">Corrective action:</span> {i.correctiveAction}</div>}
            </div>
            {can ? <select className="input w-48" data-testid="incident-status" value={i.status} onChange={e => { if (!actions.updateIncident(i.id, { status: e.target.value as T.Incident['status'] })) { toast.error('A Recordable can’t be closed yet', { description: 'Add the root cause and corrective action first.' }); setOpenInc(i.id) } }}>{['Reported', 'Investigating', 'Corrective Action', 'Closed'].map(s => <option key={s}>{s}</option>)}</select> : <Badge>{i.status}</Badge>}
          </div>
        </Card>))}</div>}
      {tab === 'talks' && <div className="grid gap-3 md:grid-cols-2">{db.talks.slice(0, 30).map(t => (
        <Card key={t.id}>
          <div className="flex items-center gap-2"><Badge tone={t.kind === 'JSA' ? 'warn' : 'info'}>{t.kind}</Badge><span className="text-xs text-muted">{fmtDate(t.date)}{t.jobId ? ` · Job #${byId(db.jobs, t.jobId)?.jobNo}` : ''}</span><span className="ml-auto text-xs font-semibold num" data-testid="talk-signed">{(r => `${t.attendeeIds.length}${r.length ? ` of ${new Set([...r, ...t.attendeeIds]).size}` : ''} signed`)(crewFor(db, t))}</span></div>
          <div className="font-semibold mt-2">{t.title}</div>
          {t.hazards.length > 0 && <div className="text-sm text-muted mt-1">Hazards: {t.hazards.join(', ')}</div>}
          {t.controls.length > 0 && <div className="text-sm text-muted">Controls: {t.controls.join(', ')}</div>}
          <div className="text-xs text-muted mt-2">Led by {fullName(byId(db.employees, t.leaderId))}</div>
          {(miss => miss.length > 0 && <div className="text-xs mt-1 text-warn" data-testid="talk-unsigned">Not signed yet: {miss.slice(0, 8).map(id => fullName(byId(db.employees, id))).join(', ')}{miss.length > 8 ? ` +${miss.length - 8} more` : ''}</div>)(crewFor(db, t).filter(id => !t.attendeeIds.includes(id)))}
        </Card>))}</div>}
      {tab === 'inspections' && <div className="card p-0 overflow-hidden">{insp.map(i => (
        <div key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 sm:px-5 py-3 border-b hairline last:border-0" data-testid="insp-row">
          <ClipboardCheck className={cn('size-5', i.result === 'Fail' ? 'text-bad' : i.due < today() ? 'text-warn' : 'text-ok')} />
          <span className="flex-1 min-w-[calc(100%-3rem)] sm:min-w-0"><span className="block font-semibold text-sm">{i.kind}</span><span className="block text-sm truncate">{i.unitId ? eqLabel(byId(db.equipment, i.unitId)) : i.itemId ? byId(db.items, i.itemId)?.name : 'Yard'}</span>{i.notes && <span className="block text-xs text-muted truncate">{i.notes} · {fullName(byId(db.employees, i.inspectorId))} {fmtDate(i.date)}</span>}</span>
          <span className="pl-9 sm:pl-0 sm:w-32 text-sm">{i.due < today() ? <span className="text-bad">Due {fmtDate(i.due)}</span> : `Due ${fmtDate(i.due)}`}</span>
          <Badge tone={i.result === 'Pass' ? 'ok' : i.result === 'Fail' ? 'bad' : 'warn'}>{i.result}</Badge>
          {can && <span className="ml-auto flex items-center gap-6 sm:gap-2"><Button size="sm" variant="ok" data-testid="insp-pass" onClick={() => setInsp1({ id: i.id, result: 'Pass' })}>Pass</Button><Button size="sm" variant="ghost" data-testid="insp-fail" onClick={() => setInsp1({ id: i.id, result: 'Fail' })}>Fail</Button></span>}
        </div>))}</div>}
      {tab === 'sds' && <SdsLibrary />}
      {tab === 'osha' && <OshaLog />}
      <IncidentDetail id={openInc} onClose={() => setOpenInc(null)} />
      <RenewCert c={renew} onClose={() => setRenew(null)} />
      <InspectSheet v={insp1} onClose={() => setInsp1(null)} />
      <NewIncident open={newInc} onClose={() => setNewInc(false)} />
      <NewTalk open={newTalk} onClose={() => setNewTalk(false)} />
    </div>
  )
}

function NewIncident({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const me = useStore(s => s.session!.name)
  const [kind, setKind] = useState<T.Incident['kind']>('Near Miss')
  const [sev, setSev] = useState<T.Incident['severity']>('Low')
  const [jobId, setJob] = useState('')
  const [desc, setDesc] = useState('')
  const [injured, setInjured] = useState(''), [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5)), [location, setLocation] = useState(''), [witnesses, setWitnesses] = useState(''), [date, setDate] = useState(today()) // dive2
  // dive3: the time is "now" each time the form opens, and can't be in the future
  useEffect(() => { if (open) { setTime(new Date().toTimeString().slice(0, 5)); setDate(today()) } }, [open])
  const nowHM = new Date().toTimeString().slice(0, 5), futureT = (date || today()) === today() && !!time && time > nowHM
  const live = db.jobs.filter(j => j.stage === 'In Progress' || (j.endDate >= addDays(today(), -14) && j.startDate <= today()))
  return (
    <Modal open={open} onClose={onClose} title="Report incident" sub="Near misses count. Report them all.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3"><Field label="Type"><select className="input" value={kind} onChange={e => setKind(e.target.value as never)}>{['Near Miss', 'First Aid', 'Recordable', 'Property Damage', 'Vehicle', 'Environmental'].map(k => <option key={k}>{k}</option>)}</select></Field><Field label="Severity"><select className="input" value={sev} onChange={e => setSev(e.target.value as never)}>{['Low', 'Medium', 'High'].map(k => <option key={k}>{k}</option>)}</select></Field></div>
        <Field label="Job"><select className="input" value={jobId} onChange={e => setJob(e.target.value)}><option value="">— None / yard —</option>{live.map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {customerOf(db, j).name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Date"><input type="date" className="input" data-testid="inc-date" value={date} max={today()} onChange={e => setDate(e.target.value)} /></Field><Field label="Time"><input type="time" className="input" data-testid="inc-time" value={time} onChange={e => setTime(e.target.value)} />{futureT && <span className="text-xs text-warn" data-testid="inc-time-future">That time hasn’t happened yet</span>}</Field></div>
        <Field label="Injured / involved person"><select className="input" data-testid="inc-injured" value={injured} onChange={e => setInjured(e.target.value)}><option value="">— Nobody hurt —</option>{[...db.employees].filter(e => e.status !== 'Inactive').sort((a, b) => a.last.localeCompare(b.last)).map(e => <option key={e.id} value={e.id}>{fullName(e)} · {e.craft}</option>)}</select></Field>
        <Field label="Where exactly"><input className="input" data-testid="inc-location" placeholder="Pad T-14, north outrigger / yard bay 3" value={location} onChange={e => setLocation(e.target.value)} /></Field>
        <Field label="What happened"><textarea className="input min-h-24" data-testid="inc-desc" value={desc} onChange={e => setDesc(e.target.value)} /></Field>
        <Field label="Witnesses (names, phone)"><input className="input" data-testid="inc-witnesses" value={witnesses} onChange={e => setWitnesses(e.target.value)} /></Field>
        {(kind === 'Recordable' || kind === 'Vehicle' || !!injured) && <div className="text-xs text-warn" data-testid="inc-der">The DER is notified to decide on a DOT post-accident test (alcohol within 8 h, drugs within 32 h).</div>}
        <Button variant="danger" size="lg" data-testid="inc-submit" disabled={!desc.trim() || futureT} onClick={() => { actions.addIncident({ date: date || today(), time, jobId: jobId || undefined, employeeId: injured || undefined, location: location.trim() || undefined, witnesses: witnesses.trim() || undefined, kind, severity: sev, description: desc.trim(), status: 'Reported', reportedBy: me, photos: 0 }); toast.success('Incident reported — Safety notified'); setDesc(''); setInjured(''); setLocation(''); setWitnesses(''); onClose() }}>Submit report</Button>
      </div>
    </Modal>
  )
}
function NewTalk({ open, onClose }: { open: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [kind, setKind] = useState<T.SafetyTalk['kind']>('JSA')
  const [title, setTitle] = useState('')
  const [jobId, setJob] = useState('')
  const [hazards, setHazards] = useState('')
  const [controls, setControls] = useState('')
  const live = db.jobs.filter(j => j.stage === 'In Progress')
  const myId = useStore(s => s.session?.employeeId) // dive2: the person publishing leads it
  const leader = db.employees.find(e => e.id === myId) ?? db.employees.find(e => e.craft === 'Safety')!
  return (
    <Modal open={open} onClose={onClose} title="New JSA / toolbox talk" sub="Crew signs on their phones.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3"><Field label="Kind"><select className="input" value={kind} onChange={e => setKind(e.target.value as never)}><option>JSA</option><option>Toolbox Talk</option></select></Field><Field label="Job"><select className="input" value={jobId} onChange={e => setJob(e.target.value)}><option value="">All crews</option>{live.map(j => <option key={j.id} value={j.id}>#{j.jobNo}</option>)}</select></Field></div>
        <Field label="Title"><input className="input" data-testid="talk-title" placeholder="Critical lift — tandem pick" value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label="Hazards (comma separated)"><input className="input" placeholder="Suspended loads, pinch points, wind" value={hazards} onChange={e => setHazards(e.target.value)} /></Field>
        <Field label="Controls"><input className="input" placeholder="Tag lines, exclusion zone, wind limit 20 mph" value={controls} onChange={e => setControls(e.target.value)} /></Field>
        <div className="text-xs text-muted">{jobId ? 'Shows on the phones of everyone on this job today.' : 'Shows on every field phone today.'} Each person reads and signs their own.</div>
        <Button variant="primary" size="lg" data-testid="talk-publish" disabled={!title.trim()} onClick={() => { actions.addTalk({ kind, title, jobId: jobId || undefined, date: today(), leaderId: leader.id, attendeeIds: [], hazards: hazards.split(',').map(s => s.trim()).filter(Boolean), controls: controls.split(',').map(s => s.trim()).filter(Boolean), signed: false }); toast.success('Sent to crew phones'); onClose() }}>Publish</Button>
      </div>
    </Modal>
  )
}

/** dive2: who should sign a talk — crew on that job that day, or everyone scheduled anywhere that day for an all-crews JSA. */
function crewFor(db: T.DB, t: T.SafetyTalk): string[] {
  if (t.kind !== 'JSA') return []
  return Array.from(new Set(db.assignments.filter(a => a.date === t.date && (!t.jobId || a.jobId === t.jobId)).map(a => a.employeeId))).filter(id => byId(db.employees, id)?.status !== 'Inactive')
}

/** dive2: incident investigation — injured person, time, witnesses, root cause, corrective action, OSHA days, workers' comp claim. */
function IncidentDetail({ id, onClose }: { id: string | null; onClose: () => void }) {
  const db = useStore(s => s.db), role = useStore(s => s.session!.role)
  const i = id ? db.incidents.find(x => x.id === id) : undefined
  return <Modal open={!!i} onClose={onClose} width={640} title={i ? `${i.no} · ${i.kind}` : ''} sub={i ? `${fmtDate(i.date)}${i.time ? ' ' + i.time : ''} · reported by ${i.reportedBy}` : ''}>{i && <IncidentForm key={i.id} i={i} can={role === 'safety' || role === 'owner' || role === 'hr'} onClose={onClose} />}</Modal>
}
function IncidentForm({ i, can, onClose }: { i: T.Incident; can: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [f, setF] = useState<T.Incident>(() => ({ ...i, wc: { ...(i.wc ?? {}) } }))
  const set = (p: Partial<T.Incident>) => setF(x => ({ ...x, ...p }))
  const setWc = (p: Partial<NonNullable<T.Incident['wc']>>) => setF(x => ({ ...x, wc: { ...(x.wc ?? {}), ...p } }))
  const injuryCase = f.kind === 'Recordable' || f.kind === 'First Aid' || !!f.employeeId
  const num = (v: string) => (v === '' ? undefined : Math.max(0, Math.round(Number(v)) || 0))
  const save = (close?: boolean) => {
    const patch: Partial<T.Incident> = { employeeId: f.employeeId || undefined, time: f.time, location: f.location, witnesses: f.witnesses, injury: f.injury, treatment: f.treatment, rootCause: f.rootCause, correctiveAction: f.correctiveAction, daysAway: f.daysAway, daysRestricted: f.daysRestricted, wc: f.wc, kind: f.kind, derNotified: f.derNotified, description: f.description.trim() || i.description, status: f.status }
    if (!actions.updateIncident(i.id, patch)) { toast.error(f.kind === 'Recordable' ? 'A Recordable can’t be closed yet' : 'Can’t close yet', { description: f.kind === 'Recordable' ? 'Fill in the root cause and corrective action first.' : 'Fill in the corrective action first.' }); return }
    toast.success(f.status === 'Closed' ? 'Incident closed' : 'Investigation saved'); if (close) onClose()
  }
  const ro = !can
  return <div className="flex flex-col gap-3" data-testid="incident-detail">
    {/* dive3 S1: classification can change as the investigation learns more (first aid → recordable, etc.) */}
    <Field label="Classification"><select className="input" disabled={ro} data-testid="incd-kind" value={f.kind} onChange={e => set({ kind: e.target.value as T.Incident['kind'] })}>{['Near Miss', 'First Aid', 'Recordable', 'Property Damage', 'Vehicle', 'Environmental'].map(x => <option key={x}>{x}</option>)}</select></Field>
    {f.kind !== i.kind && <div className="text-xs text-warn" data-testid="incd-kind-note">Reclassifying {i.kind} → {f.kind}{f.kind === 'Recordable' ? ' — it goes on the OSHA 300 log' : i.kind === 'Recordable' ? ' — it comes off the OSHA 300 log' : ''}. Logged in the audit trail when you save.</div>}
    {/* dive3: any injury prompts the DER about DOT post-accident testing */}
    {injuryCase && f.employeeId && (f.derNotified ? <div className="text-xs text-muted" data-testid="incd-der-done">DER notified {fmtDate(f.derNotified.slice(0, 10))}</div> : <div className="rounded-2xl bg-warn/10 border border-warn/30 p-3 text-sm flex flex-col gap-2" data-testid="incd-der"><span><b>Injury — tell the DER.</b> If a DOT vehicle was involved, post-accident testing may be required (alcohol within 8 h, drug within 32 h).</span>{!ro && <button className="self-start min-h-[44px] px-4 rounded-xl bg-surface font-semibold" data-testid="incd-der-mark" onClick={() => set({ derNotified: new Date().toISOString() })}>DER notified</button>}</div>)}
    <Field label="What happened"><textarea className="input min-h-20" disabled={ro} value={f.description} onChange={e => set({ description: e.target.value })} /></Field>
    <div className="grid grid-cols-2 gap-3">
      <Field label="Injured / involved"><select className="input" disabled={ro} data-testid="incd-injured" value={f.employeeId ?? ''} onChange={e => set({ employeeId: e.target.value || undefined })}><option value="">— Nobody hurt —</option>{[...db.employees].sort((a, b) => a.last.localeCompare(b.last)).map(e => <option key={e.id} value={e.id}>{fullName(e)}</option>)}</select></Field>
      <Field label="Time"><input type="time" className="input" disabled={ro} value={f.time ?? ''} onChange={e => set({ time: e.target.value })} /></Field>
    </div>
    <Field label="Where"><input className="input" disabled={ro} value={f.location ?? ''} onChange={e => set({ location: e.target.value })} /></Field>
    <Field label="Witnesses"><input className="input" disabled={ro} data-testid="incd-witnesses" value={f.witnesses ?? ''} onChange={e => set({ witnesses: e.target.value })} /></Field>
    {injuryCase && <div className="grid grid-cols-2 gap-3"><Field label="Injury / body part"><input className="input" disabled={ro} placeholder="Laceration, left index finger" value={f.injury ?? ''} onChange={e => set({ injury: e.target.value })} /></Field>
      <Field label="Treatment"><select className="input" disabled={ro} value={f.treatment ?? ''} onChange={e => set({ treatment: (e.target.value || undefined) as T.Incident['treatment'] })}><option value="">—</option>{['None', 'First aid on site', 'Clinic', 'ER / hospital'].map(x => <option key={x}>{x}</option>)}</select></Field></div>}
    <Field label="Root cause"><textarea className="input min-h-16" disabled={ro} data-testid="incd-root" placeholder="Why did it happen? (ask why 5 times)" value={f.rootCause ?? ''} onChange={e => set({ rootCause: e.target.value })} /></Field>
    <Field label="Corrective action"><textarea className="input min-h-16" disabled={ro} data-testid="incd-ca" placeholder="What changes so it doesn't happen again — who, by when" value={f.correctiveAction ?? ''} onChange={e => set({ correctiveAction: e.target.value })} /></Field>
    {f.kind === 'Recordable' && <div className="grid grid-cols-2 gap-3"><Field label="Days away from work (OSHA 300 col. K)"><input className="input num" disabled={ro} inputMode="numeric" data-testid="incd-away" value={f.daysAway ?? ''} onChange={e => set({ daysAway: num(e.target.value) })} /></Field><Field label="Days restricted / transfer (col. L)"><input className="input num" disabled={ro} inputMode="numeric" value={f.daysRestricted ?? ''} onChange={e => set({ daysRestricted: num(e.target.value) })} /></Field></div>}
    {injuryCase && <div className="rounded-2xl bg-surface-2 p-3 flex flex-col gap-2" data-testid="incd-wc"><div className="font-semibold text-sm">Workers’ comp claim</div>
      <div className="grid grid-cols-3 gap-2"><Field label="Status"><select className="input" disabled={ro} data-testid="incd-wc-status" value={f.wc?.status ?? 'Not filed'} onChange={e => setWc({ status: e.target.value as 'Filed', reportedToCarrier: e.target.value !== 'Not filed' ? (f.wc?.reportedToCarrier ?? today()) : undefined })}>{['Not filed', 'Filed', 'Open', 'Closed'].map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Claim #"><input className="input" disabled={ro} data-testid="incd-wc-claim" value={f.wc?.claimNo ?? ''} onChange={e => setWc({ claimNo: e.target.value })} /></Field>
        <Field label="Carrier"><input className="input" disabled={ro} placeholder="Carrier / TPA" value={f.wc?.carrier ?? ''} onChange={e => setWc({ carrier: e.target.value })} /></Field></div>
      {f.wc?.reportedToCarrier && <div className="text-xs text-muted">Reported to carrier {fmtDate(f.wc.reportedToCarrier)}</div>}</div>}
    <div className="flex gap-2 items-end flex-wrap">
      <Field label="Status"><select className="input w-52" disabled={ro} data-testid="incd-status" value={f.status} onChange={e => set({ status: e.target.value as T.Incident['status'] })}>{['Reported', 'Investigating', 'Corrective Action', 'Closed'].map(s => <option key={s}>{s}</option>)}</select></Field>
      {can && <Button variant="primary" data-testid="incd-save" onClick={() => save(true)}>Save</Button>}
      {i.closedBy && <span className="text-xs text-muted">Closed by {i.closedBy}</span>}
    </div>
  </div>
}

/** dive2: log a renewal — the date printed on the new card + proof; stays "pending verification" (old date in force) until Safety verifies. */
function RenewCert({ c, onClose }: { c: T.Cert | null; onClose: () => void }) {
  const [exp, setExp] = useState(''), [file, setFile] = useState<File | null>(null)
  useEffect(() => { if (c) { setExp(''); setFile(null) } }, [c]) // dive3 S5: no guessed date — type the one printed on the card
  const err = !exp ? 'Enter the expiration date printed on the card' : exp <= today() ? 'That date is already past — check the card' : exp > addDays(today(), 3660) ? 'More than 10 years out — check the card' : ''
  return <Modal open={!!c} onClose={onClose} title={c ? `Log renewal · ${c.type}` : ''} sub="Type the expiration date printed on the new card. It takes effect when Safety verifies it.">{c && <div className="flex flex-col gap-3" data-testid="renew-modal">
    <Field label={`New expiration (typical: ${Math.round(certValidDays(c.type) / 365)} yr)`}><input type="date" className="input" data-testid="renew-exp" value={exp} onChange={e => setExp(e.target.value)} /></Field>
    <Field label="Photo or PDF of the new card"><input type="file" accept="image/*,application/pdf" className="input" data-testid="renew-file" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
    {err && <div className="text-xs text-warn" data-testid="renew-err">{err}</div>}
    <Button variant="primary" size="lg" data-testid="renew-save" disabled={!!err || !file} onClick={() => { actions.renewCert(c.id, exp, file?.name); toast.success(`${c.type} renewal logged — pending verification`, { description: `New expiry ${fmtDate(exp, { month: 'short', day: 'numeric', year: 'numeric' })} applies once verified. Current date stays in force.` }); onClose() }}>Save — pending verification</Button>
  </div>}</Modal>
}

/** dive2: pass/fail with a short note (required on Fail); stamps the inspector and keeps the history. */
function InspectSheet({ v, onClose }: { v: { id: string; result: 'Pass' | 'Fail' } | null; onClose: () => void }) {
  const db = useStore(s => s.db), me = useStore(s => s.session?.employeeId)
  const [note, setNote] = useState('')
  useEffect(() => { setNote('') }, [v])
  const i = v ? db.inspections.find(x => x.id === v.id) : undefined
  return <Modal open={!!i} onClose={onClose} title={i ? `${v!.result} · ${i.kind}` : ''} sub={i ? (i.unitId ? eqLabel(byId(db.equipment, i.unitId)) : i.itemId ? byId(db.items, i.itemId)?.name : 'Yard') : ''}>{i && v && <div className="flex flex-col gap-3" data-testid="insp-sheet">
    {i.notes && <div className="text-sm rounded-xl bg-surface-2 px-3 py-2"><span className="text-muted">Last note:</span> {i.notes}</div>}
    <Field label={v.result === 'Fail' ? 'Defect found (required)' : 'Note (optional)'}><input className="input" data-testid="insp-note" placeholder={v.result === 'Fail' ? 'Swing bearing play, hook latch broken…' : 'All items OK'} value={note} onChange={e => setNote(e.target.value)} /></Field>
    {v.result === 'Fail' && i.unitId && <div className="text-xs text-bad" data-testid="insp-fail-warn">Saving tags the unit out of service, opens a Critical shop work order and alerts dispatch and the crews on it.</div>}
    <Button variant={v.result === 'Fail' ? 'danger' : 'ok'} size="lg" data-testid="insp-save" disabled={v.result === 'Fail' && !note.trim()} onClick={() => { actions.recordInspection(i.id, v.result, note.trim() || undefined, me); if (v.result === 'Pass') toast.success('Inspection passed — next due date set'); else toast.error('Failed — unit tagged out'); onClose() }}>Record {v.result}</Button>
    {(i.history?.length ?? 0) > 0 && <div className="text-xs text-muted" data-testid="insp-history">{i.history!.slice(-4).reverse().map((h, k) => <div key={k}>{fmtDate(h.date)} · {h.result} · {fullName(byId(db.employees, h.by))}{h.notes ? ` · ${h.notes}` : ''}</div>)}</div>}
  </div>}</Modal>
}

/** dive2: OSHA 300 log (this year's recordables) with TRIR / DART from timecard hours. */
function OshaLog() {
  const db = useStore(s => s.db)
  // dive3 T3: pick the year (keep 5 years) and show the 300A summary
  const cy = Number(today().slice(0, 4)), [yrN, setYr] = useState(cy), yr = String(yrN)
  const rows = db.incidents.filter(i => i.kind === 'Recordable' && i.date.startsWith(yr)).sort((a, b) => a.date.localeCompare(b.date))
  const te = db.time.filter(t => t.date.startsWith(yr))
  const logged = te.reduce((a, t) => a + (t.hours || 0), 0)
  const dates = te.map(t => t.date).sort(), span = dates.length ? diffDays(dates[dates.length - 1], dates[0]) + 1 : 0
  const ytdDays = yrN < cy ? diffDays(`${yr}-12-31`, `${yr}-01-01`) + 1 : diffDays(today(), `${yr}-01-01`) + 1
  const hours = span > 0 && span < ytdDays ? Math.round(logged * ytdDays / span) : Math.round(logged)
  const dart = rows.filter(r => (r.daysAway ?? 0) > 0 || (r.daysRestricted ?? 0) > 0).length
  const rate = (n: number) => (hours > 0 ? (n * 200000 / hours).toFixed(2) : '—')
  const caseType = (r: T.Incident) => (r.daysAway ?? 0) > 0 ? 'Days away (K)' : (r.daysRestricted ?? 0) > 0 ? 'Restricted / transfer (L)' : 'Other recordable (J)'
  return <div className="flex flex-col gap-4" data-testid="osha-log">
    <div className="flex items-center gap-2 flex-wrap"><label className="text-sm text-muted" htmlFor="osha-year">Year</label><select id="osha-year" className="input w-auto" data-testid="osha-year" value={yrN} onChange={e => setYr(Number(e.target.value))}>{[0, 1, 2, 3, 4].map(k => <option key={k} value={cy - k}>{cy - k}</option>)}</select></div>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Card><div className="label">Recordables {yr}</div><div className="display text-4xl font-semibold num mt-1">{rows.length}</div></Card>
      <Card><div className="label">TRIR</div><div className="display text-4xl font-semibold num mt-1" data-testid="osha-trir">{rate(rows.length)}</div><div className="text-xs text-muted">cases × 200,000 ÷ hours</div></Card>
      <Card><div className="label">DART</div><div className="display text-4xl font-semibold num mt-1" data-testid="osha-dart">{rate(dart)}</div><div className="text-xs text-muted">days away / restricted cases</div></Card>
      <Card><div className="label">Hours worked {yrN < cy ? yr : 'YTD'}</div><div className="display text-4xl font-semibold num mt-1">{hours.toLocaleString()}</div><div className="text-xs text-muted">{span && span < ytdDays ? `from timecards (${span} days on file, extended to the year)` : 'from timecards'}</div></Card>
    </div>
    <div className="card p-0 overflow-x-auto"><table className="w-full text-sm min-w-[720px]"><thead><tr className="text-left text-xs text-muted"><th className="px-4 py-2">Case</th><th>Employee</th><th>Date</th><th>Where</th><th>Injury / description</th><th>Classification</th><th className="text-right pr-4">Away / restr.</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.id} className="border-t hairline align-top" data-testid="osha-row"><td className="px-4 py-2 font-semibold">{r.no}</td><td>{r.employeeId ? fullName(byId(db.employees, r.employeeId)) : <span className="text-warn">not entered</span>}</td><td>{fmtDate(r.date)}</td><td>{r.location ?? (r.jobId ? `Job #${byId(db.jobs, r.jobId)?.jobNo}` : '—')}</td><td className="max-w-72">{r.injury ? `${r.injury} — ` : ''}{r.description}</td><td>{caseType(r)}</td><td className="text-right pr-4 num">{r.daysAway ?? 0} / {r.daysRestricted ?? 0}</td></tr>)}
      {!rows.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-muted">No recordables in {yr}.</td></tr>}
    </tbody></table></div>
    <Card data-testid="osha-300a"><div className="font-semibold mb-2">Form 300A summary · {yr}</div><div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
      <div><div className="text-muted text-xs">Deaths (G)</div><div className="num font-semibold">0</div></div>
      <div><div className="text-muted text-xs">Days-away cases (H)</div><div className="num font-semibold" data-testid="osha-300a-h">{rows.filter(r => (r.daysAway ?? 0) > 0).length}</div></div>
      <div><div className="text-muted text-xs">Restricted / transfer cases (I)</div><div className="num font-semibold">{rows.filter(r => !(r.daysAway ?? 0) && (r.daysRestricted ?? 0) > 0).length}</div></div>
      <div><div className="text-muted text-xs">Other recordable (J)</div><div className="num font-semibold">{rows.filter(r => !(r.daysAway ?? 0) && !(r.daysRestricted ?? 0)).length}</div></div>
      <div><div className="text-muted text-xs">Total days away (K)</div><div className="num font-semibold">{rows.reduce((a, r) => a + (r.daysAway ?? 0), 0)}</div></div>
      <div><div className="text-muted text-xs">Total days restricted (L)</div><div className="num font-semibold">{rows.reduce((a, r) => a + (r.daysRestricted ?? 0), 0)}</div></div>
      <div><div className="text-muted text-xs">Total injuries (M1)</div><div className="num font-semibold">{rows.length}</div></div>
      <div><div className="text-muted text-xs">Hours worked</div><div className="num font-semibold">{hours.toLocaleString()}</div></div>
    </div><div className="text-xs text-muted mt-2">A company executive must certify and sign the 300A before posting.</div></Card>
    <div className="text-xs text-muted">OSHA Form 300 view (29 CFR 1904). Post the 300A summary Feb 1 – Apr 30; keep 5 years. Privacy cases: replace the name with “privacy case” before posting.</div>
  </div>
}
