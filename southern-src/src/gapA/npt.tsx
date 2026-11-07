/** NPT — Nonproductive Time on field tickets. Saved on the phone (local store 'sc-npt-v1'); the audit write goes through the
 *  existing offline queue, so an entry made with no signal syncs when the phone reconnects. */
import { savePhotos, PhotoThumb } from '../lib/photos'
import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { PauseCircle, Camera, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Field, Card } from '../components/ui'
import { useStore } from '../data/store'
import { today, addDays, cn, uid } from '../lib/util'
import { audit, load, save } from './util'
import type * as T from '../data/types'

export const NPT_REASONS = ['Weather/wind', 'Waiting on customer', 'Site not ready', 'Equipment breakdown', 'Permits/escort delay', 'Safety stand-down', 'Other'] as const
export type NptReason = typeof NPT_REASONS[number]
export interface Npt { id: string; jobId: string; date: string; start: string; stop: string; hours: number; reason: NptReason; why: string; photos: string[]; by: string; at: string; offline?: boolean }
const KEY = 'sc-npt-v1'
export const hrsBetween = (a: string, b: string) => { const [ah, am] = a.split(':').map(Number), [bh, bm] = b.split(':').map(Number); let m = (bh * 60 + bm) - (ah * 60 + am); if (m < 0) m += 1440; return Math.round(m / 6) / 10 }
function seed(db: T.DB): Npt[] {
  const j = (no: string) => db.jobs.find(x => x.jobNo === no)
  const t = today(), mk = (no: string, d: number, start: string, stop: string, reason: NptReason, why: string, by: string): Npt | null => { const job = j(no); return job ? { id: 'npt-s' + no + d, jobId: job.id, date: addDays(t, d), start, stop, hours: hrsBetween(start, stop), reason, why, photos: [], by, at: addDays(t, d) + 'T18:00:00.000Z' } : null }
  return [mk('10125', -1, '10:20', '13:05', 'Weather/wind', 'Gusts 31 mph at hub height — over the 20 mph limit for the rotor pick. Crew held on the ground.', 'John Smith'),
    mk('10125', -3, '07:00', '08:30', 'Waiting on customer', 'Turbine not locked out — waited on the customer’s tech to release T-18.', 'John Smith'),
    mk('10131', -2, '06:00', '09:00', 'Site not ready', 'Pad not graded where the outriggers go. Customer brought a dozer at 8:15.', 'Wade Parker'),
    mk('10142', -1, '13:00', '15:30', 'Permits/escort delay', 'TxDMV permit amended for route change; escort arrived 2 h late.', 'Andre Clark'),
  ].filter(Boolean) as Npt[]
}
interface S { list: Npt[] | null; ensure(db: T.DB): Npt[]; add(n: Npt): void; reset(): void }
export const useNpt = create<S>((set, get) => ({
  list: load<Npt[]>(KEY, 'array'),
  ensure(db) { let l = get().list; if (!l) { l = seed(db); save(KEY, l); set({ list: l }) } return l },
  add(n) { const list = [n, ...(get().list ?? [])]; save(KEY, list); set({ list }); audit('NPT logged', `Job ${n.jobId}`, `${n.hours} h · ${n.reason} · ${n.why.slice(0, 80)}`) },
  reset() { localStorage.removeItem(KEY); set({ list: null }) },
}))
export const nptFor = (db: T.DB, jobId: string, date?: string) => (useNpt.getState().list ?? useNpt.getState().ensure(db)).filter(n => n.jobId === jobId && (!date || n.date === date))

export function NptForm({ jobId, date = today(), onDone }: { jobId: string; date?: string; onDone: () => void }) {
  const who = useStore(s => s.session?.name) ?? 'Crew', online = useStore(s => s.ui.online)
  const [start, setStart] = useState('10:00'), [stop, setStop] = useState('11:30')
  const [reason, setReason] = useState<NptReason | null>(null), [why, setWhy] = useState(''), [photos, setPhotos] = useState<string[]>([])
  const [by, setBy] = useState(who), [tried, setTried] = useState(false)
  const hours = hrsBetween(start, stop)
  // field fixes: stop must be after start (same day), max 16 h, clear messages, one save per tap
  const timeErr = !start || !stop ? 'Enter both times' : stop <= start ? 'Restarted must be after Stopped (split overnight NPT at midnight)' : hours > 16 ? 'NPT can’t be more than 16 h in one entry' : ''
  const [busy, setBusy] = useState(false), [upl, setUpl] = useState(false)
  const ok = !!reason && why.trim().length >= 8 && !timeErr
  const submit = () => {
    if (busy) return
    setTried(true); if (!ok) { toast.error(timeErr || (!reason ? 'Pick a reason' : 'Add a few more words about why (8+ letters)')); return }
    setBusy(true)
    useNpt.getState().add({ id: uid('npt'), jobId, date, start, stop, hours, reason: reason!, why: why.trim(), photos, by, at: new Date().toISOString(), offline: !online })
    toast.success(`${hours} h NPT logged — ${reason}`, { description: online ? 'On the ticket and the job’s NPT roll-up.' : 'Saved on this phone — syncs when you’re back in signal.' }); onDone()
  }
  return <div className="flex flex-col gap-4 pb-6" data-testid="npt-form">
    <div className="grid grid-cols-3 gap-3 items-end"><Field label="Stopped"><input type="time" className="input" value={start} onChange={e => setStart(e.target.value)} data-testid="npt-start" /></Field><Field label="Restarted"><input type="time" className="input" value={stop} onChange={e => setStop(e.target.value)} data-testid="npt-stop" /></Field><div className="pb-2"><div className="text-xs text-muted">Duration</div><div className="text-2xl font-semibold tabular-nums" data-testid="npt-dur">{timeErr ? '—' : `${hours} h`}</div></div></div>
    {timeErr && <div className="text-sm text-bad -mt-2" data-testid="npt-time-err">{timeErr}</div>}
    <div><div className="label mb-2">Reason</div><div className="flex flex-wrap gap-2">{NPT_REASONS.map(r => <button key={r} onClick={() => setReason(r)} data-testid="npt-reason" className={cn('rounded-full px-3.5 h-10 text-sm font-semibold', reason === r ? 'bg-accent text-accent-ink' : 'bg-surface-2')}>{r}</button>)}</div>{tried && !reason && <div className="text-xs text-bad mt-1">Required</div>}</div>
    <Field label="Why no work happened (required)"><textarea className={cn('input min-h-24', tried && why.trim().length < 8 && 'ring-2 ring-bad')} value={why} onChange={e => setWhy(e.target.value)} placeholder="Gusts 28 mph at hub height — over the limit for this pick." data-testid="npt-why" /></Field>
    <div className="flex items-center gap-3 flex-wrap"><label className="inline-flex items-center gap-2 text-sm font-semibold text-muted cursor-pointer"><Camera className="size-5" />Add photos (optional)<input type="file" accept="image/*" multiple capture="environment" className="hidden" data-testid="npt-photo" onChange={e => { const fs = [...(e.target.files ?? [])]; e.target.value = ''; const room = 4 - photos.length; if (fs.length > room) toast.warning(`Up to 4 photos — kept the first ${Math.max(room, 0)}`); setUpl(true); savePhotos(fs.slice(0, Math.max(room, 0)), 'npt').then(r => setPhotos(p => [...p, ...r].slice(0, 4))).catch(err => toast.error(String(err.message ?? err))).finally(() => setUpl(false)) }} /></label>
      {upl && <span className="text-xs text-muted" data-testid="npt-photo-busy">Saving photo…</span>}
      {photos.map((p, i) => <span key={i} className="relative"><PhotoThumb src={p} /><button aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 size-5 rounded-full bg-black text-white grid place-items-center"><X className="size-3" /></button></span>)}</div>
    <Field label="Reported by"><input className="input" value={by} onChange={e => setBy(e.target.value)} data-testid="npt-by" /></Field>
    <Button size="xl" variant="primary" onClick={submit} disabled={busy || upl} data-testid="npt-save">{timeErr ? 'Fix the times' : `Log ${hours} h NPT`}</Button>
  </div>
}

/** NPT lines on a ticket / customer sign-off. `paper` = white printable ticket style. */
export function NptList({ jobId, date, paper }: { jobId: string; date: string; paper?: boolean }) {
  const db = useStore(s => s.db); useNpt(s => s.list)
  const l = nptFor(db, jobId, date)
  if (!l.length) return null
  const tot = l.reduce((s, n) => s + n.hours, 0)
  return <div className={cn(paper ? 'mt-1.5 text-black/75' : 'rounded-2xl bg-warn/10 border border-warn/25 p-3 text-sm')} data-testid="npt-list">
    <div className={cn('font-semibold', paper ? '' : 'text-warn')}>Nonproductive time · {Math.round(tot * 10) / 10} h</div>
    {l.map(n => <div key={n.id} className={paper ? 'text-[11px]' : 'mt-1'} data-testid="npt-line"><b>{n.start}–{n.stop} · {n.hours} h · {n.reason}</b> — {n.why} <span className={paper ? 'text-black/50' : 'text-muted'}>({n.by}{n.photos.length ? ` · ${n.photos.length} photo${n.photos.length > 1 ? 's' : ''}` : ''})</span></div>)}
  </div>
}
export function NptButton({ onClick }: { onClick: () => void }) {
  return <Button size="lg" icon={<PauseCircle className="size-5" />} onClick={onClick} data-testid="npt-btn">NPT — log nonproductive time</Button>
}

/** Dashboard roll-up: NPT hours per job, by reason. */
export function NptRollup() {
  const db = useStore(s => s.db), list = useNpt(s => s.list) ?? useNpt.getState().ensure(db)
  const rows = useMemo(() => { const m = new Map<string, Record<string, number>>(); list.forEach(n => { const r = m.get(n.jobId) ?? {}; r[n.reason] = (r[n.reason] ?? 0) + n.hours; m.set(n.jobId, r) }); return [...m.entries()].map(([jobId, r]) => ({ job: db.jobs.find(j => j.id === jobId), r, tot: Object.values(r).reduce((a, b) => a + b, 0) })).sort((a, b) => b.tot - a.tot) }, [list, db])
  const COLORS: Record<string, string> = { 'Weather/wind': '#38bdf8', 'Waiting on customer': '#f59e0b', 'Site not ready': '#a78bfa', 'Equipment breakdown': '#ef4444', 'Permits/escort delay': '#f472b6', 'Safety stand-down': '#22c55e', Other: '#94a3b8' }
  const total = rows.reduce((s, r) => s + r.tot, 0)
  return <Card data-testid="npt-rollup"><div className="flex items-center gap-2"><PauseCircle className="size-4 text-warn" /><div className="font-semibold flex-1">Nonproductive time by job</div><div className="text-sm text-muted">{Math.round(total * 10) / 10} h · last 30 days</div></div>
    <div className="flex flex-wrap gap-3 mt-2 text-[11px] text-muted">{NPT_REASONS.map(r => <span key={r} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: COLORS[r] }} />{r}</span>)}</div>
    <div className="mt-3 flex flex-col gap-2.5">{rows.map(({ job, r, tot }) => <button key={job?.id} onClick={() => job && useStore.getState().open({ type: 'job', id: job.id })} className="text-left" data-testid="npt-roll-row">
      <div className="flex text-sm"><b className="flex-1 truncate">#{job?.jobNo} · {job?.name}</b><span className="tabular-nums">{Math.round(tot * 10) / 10} h</span></div>
      <div className="mt-1 h-2.5 rounded-full bg-surface-2 flex overflow-hidden">{Object.entries(r).map(([k, v]) => <span key={k} title={`${k}: ${v} h`} style={{ width: `${v / Math.max(...rows.map(x => x.tot)) * 100}%`, background: COLORS[k] }} />)}</div>
    </button>)}</div></Card>
}
