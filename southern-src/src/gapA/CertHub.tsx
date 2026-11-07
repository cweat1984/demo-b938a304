import { useMemo, useState } from 'react'
import { ShieldCheck, BadgeCheck, Truck, Loader2, Ban, CalendarClock, FileCheck2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, Badge, Button, Segmented, Sheet } from '../components/ui'
import { useStore } from '../data/store'
import { fullName } from '../data/logic'
import { fmtDate, today, cn } from '../lib/util'
import CertTracker from '../batch3b/CertTracker'
import { useDq, dqSummary, dqCheck, DQ_LABEL, DQ_RULE, type DqKey } from './dq'
import { useNccco, ncccoCard, recert, NCCCO_CATS } from './nccco'

type Tab = 'exp' | 'dq' | 'nccco'
/** Cert tracker hub: expirations (existing) + DOT driver qualification files + NCCCO operator verification. */
export default function CertHub() {
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('sc-certhub-tab') as Tab) || 'exp')
  const pick = (t: Tab) => { sessionStorage.setItem('sc-certhub-tab', t); setTab(t) }
  return <div className="flex flex-col gap-4">
    <Segmented value={tab} onChange={pick} options={[{ value: 'exp', label: 'Expirations & job clearance' }, { value: 'dq', label: 'DOT driver files' }, { value: 'nccco', label: 'NCCCO operators' }]} className="self-start max-w-full overflow-x-auto" />
    {tab === 'exp' && <CertTracker />}
    {tab === 'dq' && <DqFiles />}
    {tab === 'nccco' && <Nccco />}
  </div>
}

const toneBadge = (t: string) => (t === 'bad' ? 'bad' : t === 'warn' ? 'warn' : 'ok') as 'bad' | 'warn' | 'ok'

export function DqFiles() {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Cale Smith'
  const over = useDq(s => s.over)
  const sum = useMemo(() => dqSummary(db), [db, over]) // eslint-disable-line react-hooks/exhaustive-deps
  const [open, setOpen] = useState<string | null>(null)
  const [f, setF] = useState<'all' | 'blocked' | 'soon'>('all')
  const rows = f === 'blocked' ? sum.blocked : f === 'soon' ? sum.soon : sum.rows
  const sel = sum.rows.find(r => r.e.id === open)
  const fix = (k: DqKey) => {
    if (!sel) return
    const t = today(), name = sel.name
    if (k === 'mvr') useDq.getState().set(sel.e.id, name, { mvr: t }, 'New MVR pulled (OK DPS) — no new violations')
    if (k === 'review') useDq.getState().set(sel.e.id, name, { review: t }, `Annual review signed by ${who}`)
    if (k === 'prior') useDq.getState().set(sel.e.id, name, { prior: 'Complete' }, 'Prior-employer safety history received (3 of 3)')
    if (k === 'road') useDq.getState().set(sel.e.id, name, { road: t }, 'Road test certificate on file')
    toast.success(`${DQ_LABEL[k]} updated for ${name}`)
  }
  return <div className="flex flex-col gap-4" data-testid="dq-files">
    <div className="flex items-start gap-3 flex-wrap"><div className="flex-1 min-w-64"><div className="display text-2xl font-semibold">DOT driver qualification files</div><div className="text-sm text-muted">Everything 49 CFR 391 asks for, per driver. Anything red keeps the driver off Smart Pickup until it’s fixed.</div></div></div>
    <div className="grid grid-cols-3 gap-3">
      <Card className="!p-4 cursor-pointer" onClick={() => setF('all')}><div className="text-xs text-muted">CDL drivers</div><div className="text-3xl font-semibold">{sum.rows.length}</div></Card>
      <Card className="!p-4 cursor-pointer" onClick={() => setF('blocked')} data-testid="dq-blocked-tile"><div className="text-xs text-muted">Blocked from dispatch</div><div className="text-3xl font-semibold text-bad">{sum.blocked.length}</div></Card>
      <Card className="!p-4 cursor-pointer" onClick={() => setF('soon')}><div className="text-xs text-muted">Due in 30 days</div><div className="text-3xl font-semibold text-warn">{sum.soon.length}</div></Card>
    </div>
    <Card pad={false} className="divide-y hairline">
      {rows.map(r => <button key={r.e.id} onClick={() => setOpen(r.e.id)} className="w-full text-left p-3.5 flex items-center gap-3 hover:bg-surface-2 transition" data-testid="dq-row" data-blocked={r.blocked}>
        <span className={cn('size-9 rounded-xl grid place-items-center shrink-0', r.blocked ? 'bg-bad/15 text-bad' : r.soon.length ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok')}>{r.blocked ? <Ban className="size-4" /> : <Truck className="size-4" />}</span>
        <div className="min-w-0 flex-1"><div className="font-semibold">{r.name} <span className="text-xs text-muted font-normal">· {r.e.branchId.replace('br-', '').toUpperCase()}</span></div>
          <div className="flex flex-wrap gap-1 mt-1">{r.items.map(i => <Badge key={i.key} tone={toneBadge(i.tone)}>{DQ_LABEL[i.key].replace('Annual review of driving record', 'Annual review').replace('Prior-employer checks (3 yr)', 'Prior employers').replace('Employment application', 'Application')}</Badge>)}</div></div>
        <div className="text-right text-xs shrink-0 hidden sm:block">{r.blocked ? <span className="text-bad font-semibold">Blocked from Smart Pickup</span> : r.soon.length ? <span className="text-warn font-semibold">{r.soon[0].status}</span> : <span className="text-ok font-semibold">Qualified</span>}</div>
      </button>)}
    </Card>
    <Sheet open={!!sel} onClose={() => setOpen(null)} title={sel ? `${sel.name} — driver file` : ''} sub={sel?.blocked ? 'Blocked from Smart Pickup until the red items are fixed' : 'Qualified to dispatch'}>
      {sel && <div className="flex flex-col gap-3" data-testid="dq-sheet">
        {dqCheck(db, sel.e).items.map(i => <div key={i.key} className="rounded-2xl bg-surface-2 p-3.5 flex items-start gap-3" data-testid={`dq-item-${i.key}`}>
          <FileCheck2 className={cn('size-5 mt-0.5', i.tone === 'bad' ? 'text-bad' : i.tone === 'warn' ? 'text-warn' : 'text-ok')} />
          <div className="flex-1 min-w-0"><div className="font-semibold text-sm">{i.label}</div><div className="text-xs text-muted">{DQ_RULE[i.key]}</div>
            <div className="text-xs mt-1"><Badge tone={toneBadge(i.tone)}>{i.status}</Badge>{i.due && <span className="text-muted ml-2">{i.key === 'cdl' || i.key === 'med' ? 'expires' : 'next due'} {fmtDate(i.due, { month: 'short', day: 'numeric', year: 'numeric' })}</span>}</div></div>
          {(['mvr', 'review', 'prior', 'road'] as DqKey[]).includes(i.key) && i.tone !== 'ok' && <Button size="sm" variant="primary" data-testid={`dq-fix-${i.key}`} onClick={() => fix(i.key)}>{i.key === 'mvr' ? 'Pull new MVR' : i.key === 'review' ? 'Sign annual review' : i.key === 'prior' ? 'Mark received' : 'Record'}</Button>}
        </div>)}
        <div className="text-xs text-muted">CDL and medical card dates come from the cert tracker, so a renewal there clears it here too. Every change is in the audit log.</div>
      </div>}
    </Sheet>
  </div>
}

export function Nccco() {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Cale Smith'
  const checks = useNccco(s => s.checks), busy = useNccco(s => s.busy)
  const ops = useMemo(() => db.employees.filter(e => e.craft === 'Operator' && e.status !== 'Inactive').map(e => ({ e, card: ncccoCard(db, e.id), rc: recert(db, e.id) })).sort((a, b) => (a.rc?.days ?? -999) - (b.rc?.days ?? -999)), [db])
  const soon = ops.filter(o => o.rc && o.rc.tone !== 'ok')
  return <div className="flex flex-col gap-4" data-testid="nccco">
    <div><div className="display text-2xl font-semibold">NCCCO operator certification</div><div className="text-sm text-muted">Card number and categories for every operator. OSHA 1926.1427 requires certification for the crane type. <b>Verify with NCCCO is a simulated lookup in this demo.</b></div></div>
    {soon.length > 0 && <Card className="!p-4 border-warn/40" data-testid="nccco-alerts"><div className="flex items-center gap-2 font-semibold"><CalendarClock className="size-4 text-warn" />Recertification due — {soon.length} operator{soon.length > 1 ? 's' : ''}</div><div className="text-sm text-muted mt-1">{soon.slice(0, 6).map(o => `${fullName(o.e)} (${o.rc!.days < 0 ? 'expired' : o.rc!.days + ' d'})`).join(' · ')}</div></Card>}
    <Card pad={false} className="divide-y hairline">
      {ops.map(({ e, card, rc }) => { const v = checks[e.id]
        return <div key={e.id} className="p-3.5 flex items-center gap-3 flex-wrap" data-testid="nccco-row">
          <ShieldCheck className={cn('size-5 shrink-0', !card || rc?.tone === 'bad' ? 'text-bad' : rc?.tone === 'warn' ? 'text-warn' : 'text-ok')} />
          <div className="flex-1 min-w-48"><div className="font-semibold">{fullName(e)}</div><div className="text-xs text-muted">{card ? <>CCO #{card.certNo} · expires {fmtDate(card.expires, { month: 'short', day: 'numeric', year: 'numeric' })}</> : 'No NCCCO card on file'}</div>
            {card && <div className="flex flex-wrap gap-1 mt-1">{card.cats.map(c => <span key={c} title={NCCCO_CATS[c]} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[11px] font-semibold">{c}</span>)}</div>}</div>
          {v && <span data-testid="nccco-verified"><Badge tone={v.result === 'Verified' ? 'ok' : 'bad'}><BadgeCheck className="size-3" />{v.result} · {fmtDate(v.at.slice(0, 10))}</Badge><div className="text-[10px] text-muted text-right mt-0.5">simulated lookup</div></span>}
          {card && <Button size="sm" data-testid="nccco-verify" disabled={busy === e.id} icon={busy === e.id ? <Loader2 className="size-3.5 animate-spin" /> : <BadgeCheck className="size-3.5" />} onClick={async () => { const r = await useNccco.getState().verify(db, e.id, who); toast[r.result === 'Verified' ? 'success' : 'error'](`NCCCO: ${r.result}`, { description: `${fullName(e)} · simulated registry lookup` }) }}>{v ? 'Re-verify' : 'Verify with NCCCO'}</Button>}
        </div> })}
    </Card>
  </div>
}
