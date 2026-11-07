import { useEffect, useMemo, useState } from 'react'
import { ScanLine, ShieldAlert, CheckCircle2, XCircle, Link2, Undo2, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Badge, Button, Segmented, Sheet } from '../components/ui'
import { QR } from '../components/inv/kit'
import { useStore } from '../data/store'
import { fmtDate, today, cn } from '../lib/util'
import { useRig, rigState, rigAlerts, colorOf, MONTH_COLORS, SLING_CHECKS, HARDWARE_CHECKS, REMOVE_REASONS, periodicDays, type RigPiece } from './rigging'
import { useGapA } from './intent'

const tb = (t: string) => (t === 'bad' ? 'bad' : t === 'warn' ? 'warn' : 'ok') as 'bad' | 'warn' | 'ok'
export const Swatch = ({ d, className }: { d: string; className?: string }) => { const c = colorOf(d); return <span title={`${c[1]} (${c[0]})`} className={cn('inline-block size-3.5 rounded-full ring-1 ring-black/30 shrink-0', className)} style={{ background: c[2] }} /> }

export default function RiggingPage() {
  const db = useStore(s => s.db)
  const pieces = useRig(s => s.pieces) ?? useRig.getState().ensure(db)
  useEffect(() => { useRig.getState().ensure(db) }, [db])
  const intent = useGapA(s => s.intent)
  const [f, setF] = useState<'all' | 'due' | 'removed' | 'Sling' | 'Shackle'>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [phone, setPhone] = useState<null | { mode: 'inspect' | 'report'; q?: string }>(null)
  useEffect(() => { if (intent?.kind === 'rig-report' || intent?.kind === 'rig-inspect') { setPhone({ mode: intent.kind === 'rig-report' ? 'report' : 'inspect', q: intent.q }); useGapA.setState({ intent: null }) } }, [intent])
  const al = useMemo(() => rigAlerts(pieces), [pieces])
  const month = colorOf(today())
  const rows = pieces.filter(p => (f === 'all' || (f === 'due' ? rigState(p).tone !== 'ok' && p.status !== 'Removed' : f === 'removed' ? p.status === 'Removed' : p.kind === f)) && (!q || `${p.tag} ${p.name} ${p.serial}`.toLowerCase().includes(q.toLowerCase())))
  const sel = pieces.find(p => p.tag === open)
  return <div className="max-w-[1300px] mx-auto flex flex-col gap-5" data-testid="rigging-page">
    <PageHeader eyebrow="Safety · ASME B30.9 / B30.26" title="Rigging inspections" sub="Every sling and shackle has a QR tag tied to its inventory item. Frequent check before each shift, documented periodic inspection, remove from service with a reason."
      actions={<><Button icon={<Smartphone className="size-4" />} data-testid="rig-phone" onClick={() => setPhone({ mode: 'inspect' })}>Inspect on phone</Button><Button variant="primary" icon={<ShieldAlert className="size-4" />} data-testid="rig-report-btn" onClick={() => setPhone({ mode: 'report' })}>Report damaged rigging</Button></>} />
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="!p-4" data-testid="rig-color"><div className="text-xs text-muted">This month’s color</div><div className="flex items-center gap-2 mt-1"><span className="size-6 rounded-full ring-2 ring-black/20" style={{ background: month[2] }} /><span className="text-2xl font-semibold">{month[1]}</span></div><div className="text-[11px] text-muted mt-1">Not {month[1].toLowerCase()}? Don’t use it — inspect and re-tag.</div></Card>
      <Card className="!p-4 cursor-pointer" onClick={() => setF('due')} data-testid="rig-overdue"><div className="text-xs text-muted">Overdue</div><div className="text-3xl font-semibold text-bad">{al.overdue.length}</div></Card>
      <Card className="!p-4 cursor-pointer" onClick={() => setF('due')}><div className="text-xs text-muted">Due ≤ 30 d / wrong color</div><div className="text-3xl font-semibold text-warn">{al.soon.length}</div></Card>
      <Card className="!p-4 cursor-pointer" onClick={() => setF('removed')}><div className="text-xs text-muted">Removed from service</div><div className="text-3xl font-semibold">{al.removed.length}</div></Card>
    </div>
    <div className="flex flex-wrap gap-2 items-center">
      <Segmented value={f} onChange={setF} size="sm" options={[{ value: 'all', label: 'All', count: pieces.length }, { value: 'due', label: 'Needs attention', count: al.overdue.length + al.soon.length }, { value: 'removed', label: 'Removed', count: al.removed.length }, { value: 'Sling', label: 'Slings' }, { value: 'Shackle', label: 'Shackles' }]} />
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tag, serial or name" className="input h-9 max-w-64" data-testid="rig-search" />
      <div className="ml-auto flex gap-1 items-center text-[11px] text-muted">Color code {MONTH_COLORS.map(m => <span key={m[0]} title={`${m[0]} · ${m[1]}`} className="size-3 rounded-full ring-1 ring-black/20" style={{ background: m[2] }} />)}</div>
    </div>
    <Card pad={false} className="divide-y hairline">
      {rows.slice(0, 80).map(p => { const s = rigState(p)
        return <button key={p.tag} onClick={() => setOpen(p.tag)} className="w-full text-left p-3 flex items-center gap-3 hover:bg-surface-2" data-testid="rig-row" data-tag={p.tag}>
          <Swatch d={p.colorDate} />
          <div className="min-w-0 flex-1"><div className="font-semibold text-sm truncate"><span className="tabular-nums">{p.tag}</span> · {p.name}</div><div className="text-xs text-muted">{p.std} · S/N {p.serial} · {p.branchId.replace('br-', '').toUpperCase()}{p.severe ? ' · severe service (quarterly)' : ''}</div></div>
          <div className="text-right text-xs shrink-0"><Badge tone={tb(s.tone)}>{s.label}</Badge><div className="text-muted mt-0.5">periodic due {fmtDate(s.due)}</div></div>
        </button> })}
      {rows.length > 80 && <div className="p-3 text-xs text-muted">+{rows.length - 80} more — search by tag</div>}
    </Card>
    <Sheet open={!!sel} onClose={() => setOpen(null)} title={sel ? `${sel.tag} · ${sel.kind}` : ''} sub={sel?.name}>{sel && <PieceDetail p={sel} onInspect={() => setPhone({ mode: 'inspect', q: sel.tag })} />}</Sheet>
    <Sheet open={!!phone} onClose={() => setPhone(null)} title={phone?.mode === 'report' ? 'Report damaged rigging' : 'Rigging inspection'} sub="Works on the phone — scan the tag or type the number">{phone && <RigPhone mode={phone.mode} initial={phone.q} onDone={() => setPhone(null)} />}</Sheet>
  </div>
}

function PieceDetail({ p, onInspect }: { p: RigPiece; onInspect: () => void }) {
  const openRef = useStore(s => s.open), who = useStore(s => s.session?.name) ?? 'Cale Smith'
  const s = rigState(p)
  return <div className="flex flex-col gap-4" data-testid="rig-detail">
    <div className="flex gap-4 items-center"><QR value={`SC-RIG:${p.tag}`} size={96} /><div className="text-sm"><div className="flex items-center gap-2"><Swatch d={p.colorDate} />Tag color: <b>{colorOf(p.colorDate)[1]}</b></div><div className="mt-1">WLL {p.wll || '—'} · {p.std}</div><div className="text-muted">Periodic every {periodicDays(p)} days · next {fmtDate(s.due, { month: 'short', day: 'numeric', year: 'numeric' })}</div><div className="mt-1"><Badge tone={tb(s.tone)}>{s.label}</Badge></div></div></div>
    {p.removed && <div className="rounded-2xl bg-bad/10 text-bad p-3 text-sm"><b>Removed {fmtDate(p.removed.at)}</b> by {p.removed.by} — {p.removed.reason}{p.removed.note ? `. ${p.removed.note}` : ''}</div>}
    <div className="flex gap-2 flex-wrap">
      <Button icon={<Link2 className="size-4" />} onClick={() => openRef({ type: 'item', id: p.itemId })} data-testid="rig-inv-link">Inventory item</Button>
      {p.status !== 'Removed' ? <Button variant="primary" icon={<ScanLine className="size-4" />} onClick={onInspect}>Inspect now</Button> : <Button icon={<Undo2 className="size-4" />} onClick={() => { useRig.getState().restore(p.tag, who); toast.success(`${p.tag} back in service`) }}>Return to service (repaired + proof-tested)</Button>}
    </div>
    <div><div className="label mb-2">History</div><div className="flex flex-col divide-y hairline text-sm">{p.history.map((h, i) => <div key={i} className="py-2 flex gap-2">{h.pass ? <CheckCircle2 className="size-4 text-ok mt-0.5" /> : <XCircle className="size-4 text-bad mt-0.5" />}<div><b>{h.kind}</b> · {h.by} · {fmtDate(h.at.slice(0, 10))}{h.failed?.length ? <div className="text-xs text-bad">{h.failed.join('; ')}</div> : null}{h.notes && <div className="text-xs text-muted">{h.notes}</div>}</div></div>)}</div></div>
  </div>
}

/** Phone flow: find the piece → checklist → pass, or fail → remove from service with a reason. */
export function RigPhone({ mode, initial, onDone }: { mode: 'inspect' | 'report'; initial?: string; onDone: () => void }) {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Crew'
  const pieces = useRig(s => s.pieces) ?? useRig.getState().ensure(db)
  const [q, setQ] = useState(initial ?? '')
  const [tag, setTag] = useState<string | null>(() => pieces.find(p => p.tag === initial)?.tag ?? null)
  const [kind, setKind] = useState<'Frequent' | 'Periodic'>('Frequent')
  const [bad, setBad] = useState<string[]>([])
  const [reason, setReason] = useState<string>(REMOVE_REASONS[0]), [note, setNote] = useState('')
  const p = pieces.find(x => x.tag === tag)
  const words = q.toLowerCase().split(/\s+/).filter(w => w && !['a', 'the', 'my', 'report', 'broken', 'bent', 'damaged', 'cut'].includes(w)).map(w => w.replace(/s$/, ''))
  const hits = words.length ? pieces.filter(x => x.status !== 'Removed' && words.every(w => `${x.tag} ${x.name} ${x.serial}`.toLowerCase().includes(w))).slice(0, 6) : []
  if (!p) return <div className="flex flex-col gap-3" data-testid="rig-phone-find">
    <div className="text-sm text-muted">Point the camera at the tag — or type the tag number.</div>
    <input autoFocus value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && hits.length) setTag(hits[0].tag) }} enterKeyHint="go" placeholder="RG-0012, shackle, round sling…" className="input h-12 text-lg" data-testid="rig-find" />
    {words.length > 0 && !hits.length && <div className="text-sm text-muted" data-testid="rig-none">No rigging found for “{q}”. Check the tag number, or tell your supervisor it isn’t tagged.</div>}
    <div className="flex flex-col gap-2">{hits.map(x => <button key={x.tag} onClick={() => setTag(x.tag)} className="rounded-2xl bg-surface-2 p-3 text-left flex items-center gap-3" data-testid="rig-hit"><Swatch d={x.colorDate} /><div><div className="font-semibold">{x.tag}</div><div className="text-xs text-muted">{x.name}</div></div></button>)}</div>
  </div>
  const checks = p.kind === 'Sling' ? SLING_CHECKS : HARDWARE_CHECKS
  const fail = mode === 'report' || bad.length > 0
  const submit = () => {
    if (fail) { useRig.getState().inspect(p.tag, { by: who, kind, pass: false, failed: bad.length ? bad : [reason] }); useRig.getState().remove(p.tag, who, reason, note || undefined); toast.error(`${p.tag} removed from service`, { description: `${reason} · Safety and the yard were notified (demo)` }) }
    else { useRig.getState().inspect(p.tag, { by: who, kind, pass: true }); toast.success(`${p.tag} passed ${kind.toLowerCase()} inspection`, { description: kind === 'Periodic' ? `Re-tag with ${colorOf(today())[1]}` : 'Logged for today’s shift' }) }
    onDone()
  }
  return <div className="flex flex-col gap-4" data-testid="rig-phone-form">
    <div className="rounded-2xl bg-surface-2 p-3 flex items-center gap-3"><Swatch d={p.colorDate} className="size-5" /><div className="flex-1"><div className="font-semibold">{p.tag} · {p.kind}</div><div className="text-xs text-muted">{p.name} · {p.std}</div></div><Badge tone={tb(rigState(p).tone)}>{rigState(p).label}</Badge></div>
    {mode === 'inspect' && <Segmented value={kind} onChange={setKind} options={[{ value: 'Frequent', label: 'Frequent (pre-shift)' }, { value: 'Periodic', label: 'Periodic (documented)' }]} />}
    {mode === 'inspect' && <div className="flex flex-col gap-2">{checks.map(c => { const no = bad.includes(c)
      return <button key={c} onClick={() => setBad(no ? bad.filter(x => x !== c) : [...bad, c])} className={cn('rounded-2xl p-3 text-left text-sm flex items-center gap-3 min-h-12', no ? 'bg-bad/15 text-bad' : 'bg-surface-2')} data-testid="rig-check">{no ? <XCircle className="size-5 shrink-0" /> : <CheckCircle2 className="size-5 shrink-0 text-ok" />}{c}</button> })}<div className="text-xs text-muted">Tap any item that fails.</div></div>}
    {fail && <div className="flex flex-col gap-2" data-testid="rig-remove"><div className="label">Remove from service — reason</div><div className="flex flex-wrap gap-2">{REMOVE_REASONS.map(r => <button key={r} onClick={() => setReason(r)} className={cn('rounded-full px-3 h-9 text-sm', reason === r ? 'bg-bad text-white' : 'bg-surface-2')} data-testid="rig-reason">{r}</button>)}</div><input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional) — where is it now?" className="input" /></div>}
    <Button size="xl" variant={fail ? 'danger' : 'primary'} onClick={submit} data-testid="rig-submit">{fail ? 'Remove from service' : `Pass — log ${kind.toLowerCase()} inspection`}</Button>
  </div>
}
