import { useEffect, useState } from 'react'
import { RefreshCw, Plug, CheckCircle2, AlertTriangle, Clock, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Segmented, DemoTag } from '../components/ui'
import { useStore } from '../data/store'
import { cn, timeAgo } from '../lib/util'
import { useB4 } from './b4store'
import { useL2 } from '../launch2/l2store'

const MAP: Record<string, [string, string][]> = {
  Invoice: [['Job #', 'Invoice → Class / Project'], ['Customer', 'Customer:Job'], ['Ticket lines (hrs × rate)', 'Line items · Service item “Crane rental”'], ['Per diem / travel', 'Line items · “Travel” (billable)'], ['Tax', 'Sales tax code (by site state)']],
  'Approved expense': [['Merchant', 'Vendor'], ['Category', 'GL account (6100 Fuel, 6400 Travel, 6420 Permits)'], ['Job #', 'Customer:Job + Class'], ['Receipt image', 'Attachment'], ['Card last 4', 'Bank / credit card account']],
  'Job cost': [['Labor hours × burden', 'Journal entry · 5000 Direct labor'], ['Equipment days × cost rate', '5200 Equipment cost'], ['Job #', 'Class / Project']],
  Bill: [['Vendor + PO', 'Bill · Vendor, Ref no.'], ['PO lines', 'Item / expense lines'], ['Job #', 'Customer:Job (billable)']],
  'Payroll hours': [['Employee #', 'Paychex worker ID'], ['Hours by activity', 'Earnings codes (REG, OT, Travel)'], ['Per diem', 'Non-taxable reimbursement code'], ['Job #', 'Labor distribution / department']],
}
export default function AcctSync() {
  const db = useStore(s => s.db)
  const { sync, conn } = useB4()
  const [busy, setBusy] = useState<string | null>(null)
  const [mapK, setMapK] = useState<keyof typeof MAP>('Invoice')
  useEffect(() => { useB4.getState().seed(db) }, [db])
  // approved expenses from the Expenses screen flow in automatically
  const exps = useL2(s => s.expenses)
  useEffect(() => { const have = new Set(useB4.getState().sync.map(s => s.ref)); const add = exps.filter(e => e.status === 'Approved' && !have.has(`EXP-${e.id}`)); if (add.length) useB4.setState(s => ({ sync: [...add.map(e => ({ id: e.id + '-s', kind: 'Approved expense' as const, ref: `EXP-${e.id}`, amount: e.amount, target: 'QuickBooks' as const, status: 'Queued' as const, attempts: 0, at: new Date().toISOString() })), ...s.sync] })) }, [exps])
  // office fixes: invoices and bill payments queue for QuickBooks once each, keyed by payment id so a blank reference cannot hide a second payment. Undoing a payment drops its row.
  useEffect(() => {
    const payIds = new Set(db.bills.flatMap(b => (b.payments ?? []).map(p => p.id).filter((id): id is string => !!id)))
    useB4.setState(s => {
      const kept = s.sync.filter(row => !(row.kind === 'Bill' && row.id.endsWith('-s') && !payIds.has(row.id.slice(0, -2))))
      const haveId = new Set(kept.map(row => row.id))
      const haveRef = new Set(kept.map(row => row.ref))
      const inv = db.invoices.filter(i => i.id.includes('_') && i.status !== 'Draft' && !haveRef.has(i.invNo)).map(i => ({ id: i.id + '-s', kind: 'Invoice' as const, ref: i.invNo, amount: i.amount, target: 'QuickBooks' as const, status: 'Queued' as const, attempts: 0, at: new Date().toISOString() }))
      const bp = db.bills.flatMap(b => (b.payments ?? []).filter(p => p.id && !haveId.has(p.id + '-s')).map(p => ({ id: p.id + '-s', kind: 'Bill' as const, ref: `${b.billNo} · ${p.id}`, amount: p.amount, target: 'QuickBooks' as const, status: 'Queued' as const, attempts: 0, at: new Date().toISOString() })))
      if (!inv.length && !bp.length && kept.length === s.sync.length) return s
      return { sync: [...inv, ...bp, ...kept] }
    })
  }, [db.invoices, db.bills])
  const connect = (k: 'qb' | 'paychex') => { setBusy(k); setTimeout(() => { useB4.getState().connect(k, !conn[k]); setBusy(null); toast.success(conn[k] ? 'Disconnected' : `${k === 'qb' ? 'QuickBooks Online' : 'Paychex Flex'} connected (simulated OAuth)`) }, 900) }
  const counts = { Queued: sync.filter(s => s.status === 'Queued').length, Synced: sync.filter(s => s.status === 'Synced').length, Failed: sync.filter(s => s.status === 'Failed').length }
  return <div className="flex flex-col gap-5" data-testid="acct-sync">
    <PageHeader eyebrow={<span className="inline-flex gap-2 items-center">Money <DemoTag /></span>} title="Accounting integration" sub="Invoices, approved expenses, job costs and bills flow out on their own. Every push has a status and a retry." actions={<Button variant="primary" icon={<RefreshCw className="size-4" />} data-testid="sync-run" onClick={() => { useB4.getState().runSync(); const st = useB4.getState().sync, f = st.filter(x => x.status === 'Failed'); if (f.length) toast.error(`${f.length} didn’t sync`, { description: `${[...new Set(f.map(x => x.error))].join(' · ')}. Connect, then Retry all.` }); else toast.success('Sync run complete — everything synced') }}>Sync now</Button>} />
    <div className="grid md:grid-cols-2 gap-4">{([['qb', 'QuickBooks Online', 'Invoices, bills, expenses, job cost journal entries', '#2ca01c', 'QB'], ['paychex', 'Paychex Flex', 'Payroll hours, per diem, new-hire onboarding data', '#0058a3', 'PX']] as const).map(([k, n, d, c, ab]) => <Card key={k} className="flex items-center gap-4" data-testid={`conn-${k}`}>
      <span className="size-14 rounded-2xl grid place-items-center text-white font-bold text-lg shrink-0" style={{ background: c }}>{ab}</span>
      <div className="flex-1"><div className="font-semibold flex items-center gap-2">{n}{conn[k] ? <Badge tone="ok" dot>Connected</Badge> : <Badge>Not connected</Badge>}</div><div className="text-xs text-muted mt-0.5">{d}</div>{conn[k] && <div className="text-xs text-muted mt-1">Company: Southern Lifting & Hoisting LLC · last sync {timeAgo(new Date(Date.now() - 6e4).toISOString())}</div>}</div>
      <Button variant={conn[k] ? 'secondary' : 'primary'} data-testid={`connect-${k}`} icon={busy === k ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} onClick={() => connect(k)}>{conn[k] ? 'Disconnect' : 'Connect'}</Button></Card>)}</div>
    <div className="grid grid-cols-3 gap-3">{(['Queued', 'Synced', 'Failed'] as const).map(s => <Card key={s} className="!p-4"><div className="text-xs text-muted">{s}</div><div className={cn('text-3xl font-semibold', s === 'Failed' ? 'text-bad' : s === 'Synced' ? 'text-ok' : '')} data-testid={`sync-${s}`}>{counts[s]}</div></Card>)}</div>
    <Card pad={false}><div className="px-5 py-3 border-b hairline font-semibold flex items-center gap-2"><span className="flex-1">Sync queue</span>{counts.Failed > 0 && <Button size="sm" data-testid="sync-retry-all" icon={<RefreshCw className="size-3.5" />} onClick={() => { useB4.getState().retryAll(); const left = useB4.getState().sync.filter(x => x.status === 'Failed').length; left ? toast.error(`${left} still failing — connect ${conn.qb ? 'Paychex' : 'QuickBooks'} first`) : toast.success('All retried — synced') }}>Retry all {counts.Failed}</Button>}</div>
      <div className="divide-y hairline">{sync.map(s => <div key={s.id} className="px-5 py-3 flex items-center gap-3 flex-wrap text-sm" data-testid="sync-row">
        <span className={cn('size-8 rounded-lg grid place-items-center', s.status === 'Synced' ? 'bg-ok/15 text-ok' : s.status === 'Failed' ? 'bg-bad/15 text-bad' : 'bg-surface-2 text-muted')}>{s.status === 'Synced' ? <CheckCircle2 className="size-4" /> : s.status === 'Failed' ? <AlertTriangle className="size-4" /> : <Clock className="size-4" />}</span>
        <div className="flex-1 min-w-48"><div className="font-medium">{s.kind} · {s.ref}</div><div className="text-xs text-muted">{s.target} · {s.attempts} attempt{s.attempts === 1 ? '' : 's'} · {timeAgo(s.at)}{s.error && <span className="text-bad"> · {s.error}</span>}</div></div>
        <span className="font-semibold tabular-nums w-28 text-right">${s.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        <Badge tone={s.status === 'Synced' ? 'ok' : s.status === 'Failed' ? 'bad' : 'neutral'}>{s.status}</Badge>
        {s.status === 'Failed' && <Button size="sm" data-testid="sync-retry" icon={<RefreshCw className="size-3.5" />} onClick={() => { useB4.getState().retry(s.id); toast(useB4.getState().sync.find(x => x.id === s.id)?.status === 'Synced' ? 'Retried — synced' : 'Retry failed — still not connected') }}>Retry</Button>}
      </div>)}</div></Card>
    <Card data-testid="field-map"><div className="flex items-center gap-3 flex-wrap mb-3"><div className="font-semibold flex-1">Field mapping preview</div><Segmented size="sm" value={mapK} onChange={setMapK} options={Object.keys(MAP).map(k => ({ value: k as keyof typeof MAP, label: k }))} /></div>
      <div className="flex flex-col divide-y hairline">{MAP[mapK].map(([a, b]) => <div key={a} className="py-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm"><span className="rounded-lg bg-surface-2 px-3 py-1.5">{a}</span><ArrowRight className="size-4 text-muted" /><span className="rounded-lg bg-accent/10 px-3 py-1.5">{b}</span></div>)}</div>
      <div className="text-xs text-muted mt-2">Mappings are editable per company. Unknown customers or vendors stop in the queue for a person to map — nothing is created silently.</div></Card>
  </div>
}
