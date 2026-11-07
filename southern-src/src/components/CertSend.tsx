import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Send, Smartphone, Mail, MessageSquare, X, CheckCircle2, Download, Clock, ShieldCheck, Users, Link2, WifiOff } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, fullName, certBand } from '../data/logic'
import { cn, fmtDate } from '../lib/util'
import { Button, Badge, Avatar, Modal } from './ui'
import { QR } from './inv/kit'
import { EmpRef, JobRef } from './bits'
import { useCompany } from '../data/brand'
import { Logo } from '../shell/Splash'
import { siteRecipients, currentJobFor, crewIdsOn, certValid, isEmail, isPhone, shareUrl, shareLive, certPacketPdf, packetName, downloadBlob, SHARE_DAYS } from '../data/certshare'

type SheetLike = (p: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; tall?: boolean }) => ReactNode
const ModalSheet: SheetLike = ({ open, onClose, title, children }) => <Modal open={open} onClose={onClose} title={title} width={560}>{children}</Modal>
const exp = (c: T.Cert) => certBand(c).band === 'expired'

/** The send flow: pick certs → recipient → Email (PDF) or Text (7-day link) → note → Send. DEMO: nothing leaves the device. */
export function SendCerts({ employeeIds, jobId, onDone }: { employeeIds: string[]; jobId?: string; onDone: () => void }) {
  const db = useStore(s => s.db)
  const online = useStore(s => s.ui.online)
  const job = jobId ? byId(db.jobs, jobId) : undefined
  const certs = useMemo(() => db.certs.filter(c => employeeIds.includes(c.employeeId)), [db.certs, employeeIds])
  const [sel, setSel] = useState<Set<string>>(() => new Set(certs.filter(certValid).map(c => c.id)))
  const recips = useMemo(() => siteRecipients(db, job), [db, job])
  const [to, setTo] = useState(recips[0] ? (recips[0].email ?? '') : '')
  const [toName, setToName] = useState(recips[0]?.name ?? '')
  const [channel, setChannel] = useState<'Email' | 'Text'>('Email')
  const [note, setNote] = useState('')
  const [done, setDone] = useState<T.CertShare | null>(null)
  const [busy, setBusy] = useState(false)
  const valid = channel === 'Email' ? isEmail(to) : isPhone(to)
  const pick = (r: (typeof recips)[number]) => { setToName(r.name); setTo(channel === 'Email' ? r.email ?? '' : r.phone ?? '') }
  const setCh = (c: 'Email' | 'Text') => { setChannel(c); const r = recips.find(x => x.name === toName); if (r) setTo(c === 'Email' ? r.email ?? '' : r.phone ?? '') }
  const send = async () => {
    setBusy(true)
    const s = actions.certSend({ employeeIds, certIds: [...sel], jobId, channel, note: note.trim() || undefined, to: { name: toName || undefined, ...(channel === 'Email' ? { email: to.trim() } : { phone: to.trim() }), role: recips.find(r => r.name === toName)?.role } })
    setDone(s); setBusy(false)
    toast.success(s.status === 'Queued' ? 'Queued — sends when signal returns' : `Sent to ${toName || to} (demo)`)
  }
  if (done) return <SentCard share={done} onDone={onDone} />
  const byEmp = employeeIds.map(id => ({ e: byId(db.employees, id)!, cs: certs.filter(c => c.employeeId === id) })).filter(x => x.e)
  return (
    <div className="flex flex-col gap-5" data-testid="send-certs">
      <section>
        <div className="label mb-2">Certs to send · {sel.size} selected</div>
        <div className="flex flex-col gap-3">
          {byEmp.map(({ e, cs }) => <div key={e.id}>
            {byEmp.length > 1 && <div className="flex items-center gap-2 text-sm font-semibold mb-1.5"><Avatar name={fullName(e)} size={24} />{fullName(e)} <span className="text-muted font-normal">· {e.craft}</span></div>}
            <div className="flex flex-col gap-1.5">{cs.map(c => { const on = sel.has(c.id); const x = exp(c); return (
              <label key={c.id} className={cn('flex items-center gap-3 rounded-2xl border px-3 py-3 min-h-14 cursor-pointer', on ? 'border-accent bg-accent/5' : 'border-line', x && 'opacity-80')} data-testid="sc-cert" data-expired={x || undefined}>
                <input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={on} onChange={() => { const n = new Set(sel); on ? n.delete(c.id) : n.add(c.id); setSel(n) }} />
                <span className="flex-1 min-w-0"><span className="block font-semibold text-[15px]">{c.type}</span><span className="block text-xs text-muted">{c.credentialNo} · {x ? 'expired' : 'expires'} {fmtDate(c.expires, { month: 'short', day: 'numeric', year: 'numeric' })}</span></span>
                {x ? <Badge tone="bad">Expired</Badge> : certBand(c).band === '30' ? <Badge tone="warn">Expiring</Badge> : <Badge tone="ok">Valid</Badge>}
              </label>) })}</div>
          </div>)}
        </div>
        {[...sel].some(id => exp(byId(db.certs, id)!)) && <div className="text-xs text-bad mt-2">You've included an expired cert — the recipient will see it marked EXPIRED.</div>}
      </section>
      <section>
        <div className="label mb-2">Send to</div>
        {recips.length > 0 && <div className="flex flex-col gap-1.5 mb-2">{recips.map(r => <button key={r.name} onClick={() => pick(r)} data-testid="sc-recip" className={cn('rounded-2xl border px-3 py-2.5 text-left press', toName === r.name ? 'border-accent bg-accent/5' : 'border-line')}><div className="font-semibold text-sm">{r.name}</div><div className="text-xs text-muted">{r.role}{job ? ` · Job #${job.jobNo}` : ''}</div></button>)}</div>}
        <div className="grid grid-cols-2 gap-2 mb-2">
          {(['Email', 'Text'] as const).map(c => <button key={c} onClick={() => setCh(c)} data-testid={`sc-ch-${c}`} className={cn('h-14 rounded-2xl border font-semibold inline-flex items-center justify-center gap-2 press', channel === c ? 'border-accent bg-accent/10 text-accent' : 'border-line')}>{c === 'Email' ? <Mail className="size-5" /> : <MessageSquare className="size-5" />}{c === 'Email' ? 'Email · PDF' : 'Text · link'}</button>)}
        </div>
        <input className="input h-14 text-[16px]" inputMode={channel === 'Email' ? 'email' : 'tel'} placeholder={channel === 'Email' ? 'Any email address' : 'Any mobile number'} value={to} onChange={e => { setTo(e.target.value); setToName(recips.find(r => r.email === e.target.value || r.phone === e.target.value)?.name ?? '') }} data-testid="sc-to" />
        <div className="text-xs text-muted mt-1.5">{channel === 'Email' ? 'PDF packet: cover page with your name, photo, company and job #, then each cert card.' : `Secure read-only link to your cert page. Expires in ${SHARE_DAYS} days.`}</div>
      </section>
      <label className="block"><span className="label">Note (optional)</span><textarea className="input min-h-16" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Here for the 7 AM pick at the O&M building" data-testid="sc-note" /></label>
      {!online && <div className="rounded-2xl bg-warn/10 text-sm p-3 flex items-center gap-2"><WifiOff className="size-4" />No signal — it will queue and send automatically when you're back online.</div>}
      <Button variant="primary" size="xl" className="w-full" disabled={!sel.size || !valid || busy} onClick={send} icon={<Send className="size-5" />} data-testid="sc-send">{online ? `Send ${sel.size} cert${sel.size === 1 ? '' : 's'}` : 'Queue to send'}</Button>
      <div className="text-[11px] text-faint text-center -mt-2">Demo: nothing is actually emailed or texted.</div>
    </div>
  )
}

function SentCard({ share, onDone }: { share: T.CertShare; onDone: () => void }) {
  const db = useStore(s => s.db)
  const live = (db.certShares ?? []).find(x => x.id === share.id) ?? share
  const pdf = async () => { const b = await certPacketPdf(db, live); downloadBlob(b, packetName(db, live)) }
  return (
    <div className="flex flex-col items-center text-center gap-4 py-2" data-testid="sc-sent" data-status={live.status}>
      <div className={cn('size-20 rounded-full grid place-items-center', live.status === 'Queued' ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok')}>{live.status === 'Queued' ? <Clock className="size-10" /> : <CheckCircle2 className="size-10" />}</div>
      <div><div className="display text-2xl font-semibold">{live.status === 'Queued' ? 'Queued' : 'Sent'}</div>
        <div className="text-muted mt-1">{live.certIds.length} cert{live.certIds.length === 1 ? '' : 's'} {live.status === 'Queued' ? 'will go' : 'went'} to <b className="text-ink">{live.to.name ?? live.to.email ?? live.to.phone}</b><br />{live.channel === 'Email' ? live.to.email : live.to.phone} · {live.channel === 'Email' ? 'PDF attached' : `link expires ${fmtDate(live.expires.slice(0, 10))}`}</div></div>
      <Badge tone="info">DEMO — nothing was actually sent</Badge>
      <div className="grid grid-cols-2 gap-2 w-full">
        <Button icon={<Download className="size-4" />} onClick={pdf} data-testid="sc-pdf">PDF packet</Button>
        <Button icon={<Link2 className="size-4" />} onClick={() => { navigator.clipboard?.writeText(shareUrl(live.token)).catch(() => {}); window.open(shareUrl(live.token), '_blank') }} data-testid="sc-link">Open link</Button>
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={onDone}>Done</Button>
    </div>
  )
}

/** Full-screen wallet for the gate guard: big cert cards + QR to the share page. */
export function CertWallet({ empId, jobId, onClose }: { empId: string; jobId?: string; onClose: () => void }) {
  const db = useStore(s => s.db)
  const company = useCompany()
  const e = byId(db.employees, empId)!
  const cs = db.certs.filter(c => c.employeeId === empId).sort((a, b) => Number(exp(a)) - Number(exp(b)))
  const [share, setShare] = useState<T.CertShare | null>(null)
  useEffect(() => { setShare(actions.certWallet(empId, cs.filter(certValid).map(c => c.id), jobId)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const job = jobId ? byId(db.jobs, jobId) : undefined
  return createPortal(
    <div className="fixed inset-0 z-[95] bg-bg overflow-y-auto" data-testid="cert-wallet">
      <div className="max-w-md mx-auto px-5 pt-[max(env(safe-area-inset-top),16px)] pb-10 flex flex-col gap-4">
        <div className="flex items-center gap-3"><Logo size={32} /><div className="flex-1 min-w-0"><div className="font-semibold truncate">{company.name}</div><div className="text-xs text-muted">Certification wallet{job ? ` · Job #${job.jobNo}` : ''}</div></div><button onClick={onClose} className="size-11 grid place-items-center rounded-full bg-surface" aria-label="Close wallet" data-testid="wallet-close"><X /></button></div>
        <div className="rounded-[28px] bg-surface p-5 flex items-center gap-4"><Avatar name={fullName(e)} size={64} /><div className="min-w-0"><div className="display text-2xl font-semibold leading-tight">{fullName(e)}</div><div className="text-muted">{e.craft} · {e.empNo}</div></div></div>
        <div className="rounded-[28px] bg-white p-5 flex flex-col items-center gap-2 text-black">
          {share ? <QR value={shareUrl(share.token)} size={210} /> : <div className="size-[210px]" />}
          <div className="text-sm font-semibold">Scan to verify my certs</div><div className="text-xs text-neutral-500">Read-only · expires {share ? fmtDate(share.expires.slice(0, 10)) : ''}</div>
        </div>
        {cs.map(c => { const x = exp(c); return (
          <div key={c.id} className={cn('rounded-[24px] p-5 border-l-[10px]', x ? 'bg-bad/10 border-bad' : certBand(c).band === '30' ? 'bg-surface border-warn' : 'bg-surface border-ok')} data-testid="wallet-card">
            <div className="flex items-start gap-2"><div className="display text-xl font-semibold flex-1">{c.type}</div>{x ? <Badge tone="bad">EXPIRED</Badge> : <Badge tone="ok">VALID</Badge>}</div>
            <div className="grid grid-cols-2 gap-y-1 mt-2 text-[15px]"><span className="text-muted">Credential</span><span className="font-semibold num">{c.credentialNo}</span><span className="text-muted">Issued by</span><span>{c.provider}</span><span className="text-muted">Expires</span><span className="font-semibold">{fmtDate(c.expires, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>
          </div>) })}
        <div className="text-center text-xs text-faint">Demo — shown on device</div>
      </div>
    </div>, document.body)
}

/** Read-only page opened from a text link / wallet QR (no login). */
export function CertSharePage({ token }: { token: string }) {
  const db = useStore(s => s.db)
  const ready = useStore(s => s.ready)
  const company = useCompany()
  if (!ready) return null
  const s = (db.certShares ?? []).find(x => x.token === token)
  if (!s || !shareLive(s)) return <div className="min-h-screen grid place-items-center text-muted p-8 text-center" data-testid="cert-share-expired">This certification link has expired or was not found.<br />Ask the employee to send a new one.</div>
  const job = s.jobId ? byId(db.jobs, s.jobId) : undefined
  return (
    <div className="min-h-screen bg-bg text-ink" data-testid="cert-share">
      <header className="flex items-center gap-3 px-5 py-4 border-b hairline max-w-2xl mx-auto"><Logo size={30} /><div className="flex-1"><div className="font-semibold">{company.name}</div><div className="text-xs text-muted">Verified certifications · read-only</div></div><Badge tone="info">Demo</Badge></header>
      <main className="max-w-2xl mx-auto px-5 py-6 flex flex-col gap-5">
        {job && <div className="text-sm text-muted">For Job #{job.jobNo} · {job.name}</div>}
        {s.note && <div className="rounded-2xl bg-surface p-4 text-sm">“{s.note}”</div>}
        {s.employeeIds.map(id => { const e = byId(db.employees, id); if (!e) return null; const cs = s.certIds.map(c => byId(db.certs, c)).filter(c => c && c.employeeId === id) as T.Cert[]; return (
          <section key={id} className="flex flex-col gap-2">
            <div className="flex items-center gap-3"><Avatar name={fullName(e)} size={44} /><div><div className="font-semibold text-lg">{fullName(e)}</div><div className="text-sm text-muted">{e.craft} · {e.empNo}</div></div></div>
            {cs.map(c => <div key={c.id} className="rounded-2xl bg-surface p-4 flex items-center gap-3"><ShieldCheck className={cn('size-6', exp(c) ? 'text-bad' : 'text-ok')} /><div className="flex-1"><div className="font-semibold">{c.type}</div><div className="text-xs text-muted">{c.credentialNo} · {c.provider}</div></div><div className="text-right text-sm"><div className={cn('font-semibold', exp(c) && 'text-bad')}>{exp(c) ? 'EXPIRED' : 'Valid'}</div><div className="text-xs text-muted">thru {fmtDate(c.expires, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div></div>)}
          </section>) })}
        <div className="text-xs text-faint">Link expires {new Date(s.expires).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Shared by {s.by}.</div>
      </main>
    </div>
  )
}

/** Send log (employee profile, Safety). */
export function CertShareLog({ empId, limit = 12 }: { empId?: string; limit?: number }) {
  const db = useStore(s => s.db)
  const rows = (db.certShares ?? []).filter(x => !empId || x.employeeIds.includes(empId)).slice(0, limit)
  if (!rows.length) return <div className="text-sm text-muted" data-testid="cert-log-empty">No certs sent yet.</div>
  return (
    <div className="flex flex-col gap-1.5" data-testid="cert-log">
      {rows.map(x => { const j = x.jobId ? byId(db.jobs, x.jobId) : undefined; return (
        <div key={x.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid="cert-log-row">
          <div className="flex items-center gap-2 flex-wrap"><b>{x.channel === 'Wallet' ? 'Shown on phone' : `${x.channel} → ${x.to.name ?? ''}`}</b><Badge tone={x.status === 'Queued' ? 'warn' : 'ok'}>{x.status}</Badge><Badge tone="info">Demo</Badge><span className="ml-auto text-xs text-muted">{new Date(x.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></div>
          <div className="text-muted text-xs">{x.employeeIds.map((id, k) => <span key={id}>{k ? ', ' : ''}<EmpRef id={id} /></span>)} · {x.certIds.map(id => byId(db.certs, id)?.type).filter(Boolean).join(', ')}{x.to.email || x.to.phone ? ` · ${x.to.email ?? x.to.phone}` : ''}{j && <> · <JobRef id={j.id} /></>} · by {x.byId ? <EmpRef id={x.byId} /> : x.by}</div>
        </div>) })}
    </div>
  )
}

/** Employee "My certs" screen: list + Send my certs + Show on my phone (+ Send crew certs for foremen). */
export function MyCertsPanel({ empId, Sheet = ModalSheet, field, inline }: { empId: string; Sheet?: SheetLike; field?: boolean; inline?: boolean }) {
  const db = useStore(s => s.db)
  const role = useStore(s => s.session?.role)
  const [mode, setMode] = useState<null | 'send' | 'crew' | 'wallet'>(null)
  const job = currentJobFor(db, empId)
  const isForeman = !!job && (job.supervisorId === empId || db.assignments.some(a => a.jobId === job.id && a.employeeId === empId && a.position === 'Supervisor') || ['dispatch', 'ops', 'owner', 'safety', 'branch'].includes(role ?? ''))
  const crew = job ? crewIdsOn(db, job) : []
  const cs = db.certs.filter(c => c.employeeId === empId)
  if (inline && (mode === 'send' || mode === 'crew')) return (
    <div className="flex flex-col gap-3 pb-8">
      <button onClick={() => setMode(null)} className="self-start text-sm text-accent font-semibold" data-testid="sc-back">‹ My certs</button>
      <div className="display text-xl font-semibold">{mode === 'crew' ? `Send crew certs · Job #${job?.jobNo}` : 'Send my certs'}</div>
      <SendCerts employeeIds={mode === 'crew' ? crew : [empId]} jobId={job?.id} onDone={() => setMode(null)} />
    </div>
  )
  return (
    <div className="flex flex-col gap-3 pb-8" data-testid="my-certs">
      <button onClick={() => setMode('send')} className="h-16 rounded-2xl bg-accent text-accent-ink text-lg font-semibold inline-flex items-center justify-center gap-2 press" data-testid="send-my-certs"><Send className="size-5" />Send my certs</button>
      <div className={cn('grid gap-2', isForeman && crew.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        <button onClick={() => setMode('wallet')} className="h-14 rounded-2xl bg-surface border hairline font-semibold inline-flex items-center justify-center gap-2 press" data-testid="show-wallet"><Smartphone className="size-5" />Show on my phone</button>
        {isForeman && crew.length > 1 && <button onClick={() => setMode('crew')} className="h-14 rounded-2xl bg-surface border hairline font-semibold inline-flex items-center justify-center gap-2 press" data-testid="send-crew-certs"><Users className="size-5" />Send crew certs</button>}
      </div>
      {job && <div className="text-xs text-muted px-1">Current job: #{job.jobNo} · {job.name}</div>}
      <div className="flex flex-col gap-2 mt-1">{cs.map(c => { const b = certBand(c); return (
        <div key={c.id} className={cn('rounded-3xl bg-surface p-4 flex items-center gap-3', !field && 'rounded-2xl')}><div className="flex-1"><div className="font-semibold">{c.type}</div><div className="text-xs text-muted">{c.credentialNo} · expires {fmtDate(c.expires, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div>{b.band === 'expired' ? <Badge tone="bad">Expired</Badge> : b.band === 'ok' || b.band === '90' ? <Badge tone="ok">Current</Badge> : <Badge tone="warn">{b.days}d left</Badge>}</div>) })}</div>
      <div className="mt-2"><div className="label mb-1.5">Sent history</div><CertShareLog empId={empId} limit={6} /></div>
      {!inline && <Sheet open={mode === 'send' || mode === 'crew'} onClose={() => setMode(null)} title={mode === 'crew' ? `Send crew certs · Job #${job?.jobNo}` : 'Send my certs'} tall>{(mode === 'send' || mode === 'crew') && <SendCerts employeeIds={mode === 'crew' ? crew : [empId]} jobId={job?.id} onDone={() => setMode(null)} />}</Sheet>}
      {mode === 'wallet' && <CertWallet empId={empId} jobId={job?.id} onClose={() => setMode(null)} />}
    </div>
  )
}

/** Dispatch / office: send a whole job's crew certs from the job drawer. */
export function CrewCertsButton({ job }: { job: T.Job }) {
  const db = useStore(s => s.db)
  const [open, setOpen] = useState(false)
  const crew = crewIdsOn(db, job)
  if (!crew.length) return null
  return <>
    <Button icon={<Users className="size-4" />} onClick={() => setOpen(true)} data-testid="job-crew-certs">Send crew certs</Button>
    <Modal open={open} onClose={() => setOpen(false)} title={`Send crew certs · Job #${job.jobNo}`} sub={`${crew.length} people in one packet`} width={560}>{open && <SendCerts employeeIds={crew} jobId={job.id} onDone={() => setOpen(false)} />}</Modal>
  </>
}
