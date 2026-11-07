import { useState } from 'react'
import { toast } from 'sonner'
import { Mail, Lock, Trophy, ShieldCheck, ShieldAlert, Plus, RotateCcw, EyeOff, FileCheck2 } from 'lucide-react'
import { useBids, bidActions, VENDORS, vendor, vendorEmail, money, laneAvg, type Rfq } from './bidsData'
import { useMoves, trailerOf, compOf } from '../data/moves'
import { PageHeader, Badge, Button, Card, Segmented, Modal, Field, Toggle } from '../components/ui'
import { cn, today, addDays } from '../lib/util'
import { useStore } from '../data/store'

type Tab = 'rfqs' | 'variance' | 'scorecard'
export default function Bids() {
  const { rfqs } = useBids()
  const [tab, setTab] = useState<Tab>('rfqs')
  const [sel, setSel] = useState(rfqs[0]?.id)
  const [build, setBuild] = useState(false)
  const r = rfqs.find(x => x.id === sel) ?? rfqs[0]
  return (
    <div className="max-w-[1500px] mx-auto" data-testid="bids-page">
      <PageHeader eyebrow="Jobs · Vendor quotes" title="Vendor Quotes & Bidding" sub="One-to-one requests, details sealed until award, and every invoice checked against its quote."
        actions={<>{useStore.getState().session?.role === 'owner' && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { bidActions.reset(); setSel(useBids.getState().rfqs[0].id); toast('Quotes reset') }}>Reset demo</Button>}<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setBuild(true)} data-testid="new-rfq">Get quotes from a move</Button></>} />
      <Segmented className="mb-5" value={tab} onChange={setTab} options={[{ value: 'rfqs', label: 'Requests', count: rfqs.length }, { value: 'variance', label: 'Price variance' }, { value: 'scorecard', label: 'Vendor scorecard' }]} />
      {tab === 'rfqs' && <div className="grid xl:grid-cols-[340px_minmax(0,1fr)] gap-5 min-w-0">
        <div className="flex flex-col gap-2">{rfqs.map(x => <button key={x.id} onClick={() => setSel(x.id)} data-testid="rfq-row" className={cn('card p-4 text-left', x.id === r?.id && 'ring-2 ring-accent')}><div className="flex items-center gap-2"><span className="font-semibold flex-1 truncate">{x.title}</span><Badge tone={x.status === 'Awarded' ? 'ok' : x.status === 'Draft' ? 'neutral' : 'accent'}>{x.status}</Badge></div><div className="text-xs text-muted mt-0.5">#{x.jobNo} · {x.quotes.length}/{x.vendorIds.length} quotes · {x.lane}</div></button>)}</div>
        {r && <RfqDetail key={r.id} r={r} />}
      </div>}
      {tab === 'variance' && <Variance />}
      {tab === 'scorecard' && <Scorecard />}
      <Builder open={build} onClose={() => setBuild(false)} onDone={id => { setSel(id); setBuild(false); setTab('rfqs') }} />
    </div>
  )
}

function EmailPreview({ r, vid, awarded }: { r: Rfq; vid: string; awarded?: boolean }) {
  const m = vendorEmail(r, vendor(vid), awarded)
  return <div className="rounded-2xl border hairline bg-surface-2/50 p-4 text-sm" data-testid="email-preview"><div className="text-xs text-muted"><b>To:</b> {m.to}</div><div className="text-xs text-muted"><b>Subject:</b> {m.subject}</div><pre className="mt-3 whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{m.body}</pre></div>
}

function RfqDetail({ r }: { r: Rfq }) {
  const [pv, setPv] = useState(r.vendorIds[0])
  const [opened, setOpened] = useState(false)
  const [aw, setAw] = useState<string | null>(null)
  const [bill, setBill] = useState(true); const [mk, setMk] = useState(12)
  const sealed = r.sealed && r.status !== 'Awarded' && r.dueAt >= today() && !opened
  const avg = laneAvg(r.lane)
  const low = Math.min(...r.quotes.map(q => q.amount))
  const win = r.award && r.quotes.find(q => q.id === r.award!.quoteId)
  return (
    <div className="flex flex-col gap-4" data-testid="rfq-detail">
      <Card>
        <div className="flex flex-wrap items-start gap-3"><div className="flex-1 min-w-0"><div className="display text-2xl font-semibold">{r.title}</div><div className="text-sm text-muted mt-1">#{r.jobNo} · {r.pickupRegion} → {r.dropRegion} · pickup {r.pickupDate} · due {r.dueAt}</div></div>{r.sealed && <Badge tone="info"><Lock className="size-3" />Sealed bids</Badge>}</div>
        <div className="mt-3 grid sm:grid-cols-3 gap-2">{r.lines.map(l => <div key={l.desc} className="card-flat p-3 text-sm"><div className="font-semibold">{l.desc}</div><div className="text-xs text-muted">{l.weightLbs.toLocaleString()} lb · {l.dims} · {l.trailer}</div></div>)}</div>
        <div className="mt-3 text-xs text-muted flex items-center gap-1.5"><EyeOff className="size-3.5" />Hidden from vendors until award: customer ({r.customer}), exact site and gate contacts, competing prices.</div>
      </Card>
      <Card>
        <div className="flex items-center gap-2 mb-3"><Mail className="size-4" /><span className="font-semibold">Individual requests</span><span className="text-xs text-muted">— one email per vendor, never a group blast (preview only)</span></div>
        <div className="flex flex-wrap gap-1.5 mb-3">{r.vendorIds.map(v => <button key={v} onClick={() => setPv(v)} data-testid="email-tab" className={cn('rounded-full px-3 h-8 text-xs font-semibold border hairline', pv === v ? 'bg-surface-3' : 'text-muted')}>{vendor(v).name}</button>)}</div>
        <EmailPreview r={r} vid={pv} />
        {r.status === 'Draft' && <Button variant="primary" className="mt-3" data-testid="send-rfq" onClick={() => { bidActions.send(r.id); toast.success(`${r.vendorIds.length} individual requests queued (demo — nothing emailed)`, { description: 'Demo: first replies have arrived' }) }}>Send {r.vendorIds.length} individual requests</Button>}
      </Card>
      {r.quotes.length > 0 && <Card pad={false} className="overflow-hidden">
        <div className="p-4 flex items-center gap-2 border-b hairline"><span className="font-semibold">Comparison</span>{avg && <span className="text-xs text-muted">Lane avg {money(avg)} · last {6} awards</span>}<div className="flex-1" />{sealed && <Button size="sm" variant="outline" icon={<Lock className="size-3.5" />} onClick={() => setOpened(true)} data-testid="unseal">Open sealed bids (demo)</Button>}</div>
        <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="compare"><thead><tr className="text-left label"><th className="p-3">Vendor</th><th className="p-3">Price</th><th className="p-3">vs lane</th><th className="p-3">Transit</th><th className="p-3">Insurance</th><th className="p-3">DOT / MC</th><th className="p-3">On-time</th><th className="p-3"></th></tr></thead><tbody>
          {[...r.quotes].sort((a, b) => a.amount - b.amount).map(q => { const v = vendor(q.vendorId); const d = avg ? (q.amount - avg) / avg * 100 : 0; const won = r.award?.quoteId === q.id; return (
            <tr key={q.id} className={cn('border-t hairline', won && 'bg-ok/10')} data-testid="quote-row">
              <td className="p-3"><div className="font-semibold">{v.name}</div>{q.note && <div className="text-[11px] text-muted">{q.note}</div>}</td>
              <td className="p-3 font-semibold num">{sealed ? <span className="text-muted flex items-center gap-1"><Lock className="size-3.5" />sealed</span> : <>{money(q.amount)}{q.amount === low && <Badge tone="ok" className="ml-1.5">Low</Badge>}</>}</td>
              <td className={cn('p-3 num', d > 10 ? 'text-bad' : d < -5 ? 'text-ok' : 'text-muted')}>{sealed || !avg ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(0)}%`}</td>
              <td className="p-3 num">{q.transitHrs} h</td>
              <td className="p-3">{v.insured ? <span className="text-ok flex items-center gap-1"><ShieldCheck className="size-4" />COI on file</span> : <span className="text-warn flex items-center gap-1"><ShieldAlert className="size-4" />Missing COI</span>}</td>
              <td className="p-3 text-xs">{v.authority === 'Active' ? <span className="text-ok">Active</span> : <span className="text-bad font-semibold">Inactive</span>}<div className="text-muted">{v.dot}</div></td>
              <td className="p-3 num">{v.onTime}%</td>
              <td className="p-3">{won ? <Badge tone="ok"><Trophy className="size-3" />Awarded</Badge> : r.status !== 'Awarded' && !sealed && <Button size="sm" variant={q.amount === low ? 'primary' : 'secondary'} onClick={() => setAw(q.id)} data-testid="award-btn">Award</Button>}</td>
            </tr>) })}
        </tbody></table></div>
      </Card>}
      {r.award && win && <Card>
        <div className="flex items-center gap-2"><FileCheck2 className="size-5 text-ok" /><span className="font-semibold">Awarded to {vendor(win.vendorId).name} · {r.award.po}</span></div>
        <div className="text-sm text-muted mt-1" data-testid="award-summary">Attached to project #{r.jobNo} · {r.award.billable ? <b className="text-ink">flagged for customer invoicing — bill {money(win.amount * (1 + r.award.markupPct / 100))} ({r.award.markupPct}% markup)</b> : 'not billable'}</div>
        <div className="grid md:grid-cols-2 gap-3 mt-3"><div><div className="label mb-1.5">Winner — details revealed</div><EmailPreview r={r} vid={win.vendorId} awarded /></div>
          <div><div className="label mb-1.5">Everyone else — automatic</div><div className="rounded-2xl border hairline bg-surface-2/50 p-4 text-sm">{r.vendorIds.filter(v => v !== win.vendorId).map(v => <div key={v} className="mb-2"><b>{vendor(v).name}:</b> “Thanks for quoting {r.title.split(' — ')[0]}. Not this time — we'll keep you on the list.”</div>)}</div></div></div>
      </Card>}
      <Modal open={!!aw} onClose={() => setAw(null)} title="Award quote" sub={aw ? `${vendor(r.quotes.find(q => q.id === aw)!.vendorId).name} · ${money(r.quotes.find(q => q.id === aw)!.amount)}` : ''}>
        <div className="flex flex-col gap-3"><Toggle checked={bill} onChange={setBill} label="Billable to the customer" /><Field label="Markup %"><input type="number" className="input" value={mk} onChange={e => setMk(+e.target.value)} /></Field>
          <div className="text-xs text-muted">Creates the PO, attaches it to project #{r.jobNo}, reveals full details to the winner and sends a polite “not this time” to the others (preview only).</div>
          <Button variant="primary" data-testid="award-confirm" onClick={() => { bidActions.award(r.id, aw!, bill, mk); toast.success('Awarded — PO created and attached to the project'); setAw(null) }}>Award</Button></div>
      </Modal>
    </div>
  )
}

function Variance() {
  const { rfqs } = useBids()
  const aw = rfqs.filter(r => r.award)
  const [edit, setEdit] = useState<Rfq | null>(null); const [amt, setAmt] = useState(''); const [why, setWhy] = useState('')
  return (
    <Card pad={false} className="overflow-hidden"><table className="w-full text-sm" data-testid="variance-table"><thead><tr className="text-left label"><th className="p-3">Award</th><th className="p-3">Vendor</th><th className="p-3">Quote</th><th className="p-3">Invoice</th><th className="p-3">Variance</th><th className="p-3">Reason</th><th className="p-3"></th></tr></thead><tbody>
      {aw.map(r => { const q = r.quotes.find(q => q.id === r.award!.quoteId)!; const inv = r.award!.invoice; const d = inv != null ? inv - q.amount : null; return (
        <tr key={r.id} className="border-t hairline"><td className="p-3"><div className="font-semibold">{r.title}</div><div className="text-xs text-muted">#{r.jobNo} · {r.award!.po}</div></td><td className="p-3">{vendor(q.vendorId).name}</td><td className="p-3 num">{money(q.amount)}</td><td className="p-3 num">{inv != null ? money(inv) : <span className="text-faint">awaiting bill</span>}</td>
          <td className="p-3 num">{d == null ? '—' : d === 0 ? <Badge tone="ok">Matches</Badge> : <Badge tone={d / q.amount > 0.05 ? 'bad' : 'warn'}>{d > 0 ? '+' : ''}{money(d)} ({(d / q.amount * 100).toFixed(0)}%){d / q.amount > 0.05 ? ' · Hold for review' : ''}</Badge>}</td>
          <td className="p-3 text-xs text-muted">{r.award!.reason ?? '—'}</td><td className="p-3"><Button size="sm" onClick={() => { setEdit(r); setAmt(String(inv ?? q.amount)); setWhy(r.award!.reason ?? '') }} data-testid="enter-invoice">Enter invoice</Button></td></tr>) })}
    </tbody></table>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Vendor invoice" sub={edit?.title}><div className="flex flex-col gap-3"><Field label="Invoice amount"><input className="input" type="number" value={amt} onChange={e => setAmt(e.target.value)} data-testid="invoice-amt" /></Field><Field label="Reason for any difference"><select className="input" value={why} onChange={e => setWhy(e.target.value)} data-testid="invoice-reason"><option value="">Pick a reason…</option>{['Matches quote', 'Detention at gate', 'Escort added', 'Permit re-route', 'Fuel surcharge', 'Extra stop', 'Billing error — dispute'].map(x => <option key={x}>{x}</option>)}</select></Field><Button variant="primary" disabled={!amt || !why} onClick={() => { bidActions.invoice(edit!.id, +amt, why); setEdit(null); toast.success('Invoice checked against quote') }} data-testid="invoice-save">Save</Button></div></Modal>
    </Card>
  )
}

function Scorecard() {
  const { rfqs } = useBids()
  return <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="scorecard">{VENDORS.map(v => { const asked = rfqs.filter(r => r.vendorIds.includes(v.id)); const won = rfqs.filter(r => r.award && r.quotes.find(q => q.id === r.award!.quoteId)?.vendorId === v.id); const vars = won.filter(r => r.award!.invoice != null).map(r => { const q = r.quotes.find(q => q.id === r.award!.quoteId)!; return (r.award!.invoice! - q.amount) / q.amount * 100 }); return (
    <Card key={v.id}><div className="flex items-center gap-2"><div className="font-semibold text-lg flex-1">{v.name}</div><Badge tone={v.rating >= 4.4 ? 'ok' : 'neutral'}>★ {v.rating}</Badge></div><div className="text-xs text-muted">{v.lanes.join(' · ')} · {v.dot}</div>
      <div className="grid grid-cols-4 gap-2 mt-3 text-center">{[['Won', won.length], ['Lost', asked.filter(r => r.status === 'Awarded').length - won.length], ['On-time', `${v.onTime}%`], ['Claims', v.claims]].map(([k, x]) => <div key={k as string} className="card-flat py-2"><div className="font-semibold num">{x}</div><div className="text-[10px] text-muted">{k}</div></div>)}</div>
      <div className="text-xs text-muted mt-2">Avg variance to quote: <b className="text-ink num">{vars.length ? `${(vars.reduce((a, b) => a + b, 0) / vars.length).toFixed(1)}%` : '—'}</b></div></Card>) })}</div>
}

function Builder({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const ms = useMoves()
  const [moveId, setMoveId] = useState(ms.moves[0]?.id)
  const m = ms.moves.find(x => x.id === moveId)
  const loads = m ? m.loads.filter(l => l.status !== 'Delivered') : []
  const [pick, setPick] = useState<string[] | null>(null)
  const chosen = pick ?? loads.filter(l => trailerOf(ms, l.trailerId)?.carrier === '3P').map(l => l.id)
  const [vids, setVids] = useState<string[]>(['hv-1', 'hv-2', 'hv-3'])
  const [sealed, setSealed] = useState(true)
  const create = () => {
    const cr = ms.cranes.find(c => c.id === m!.craneId)!
    const lines = loads.filter(l => chosen.includes(l.id)).map(l => { const items = m!.items.filter(i => i.travels && i.loadNo === l.no).map(i => compOf(ms, i.compId)!); return { desc: `Load ${l.no}: ${[...new Set(items.map(c => c.name.replace(/ #\d+$/, '')))].join(', ')}`, weightLbs: items.reduce((a, c) => a + c.weightLbs, 0), dims: items.some(c => c.oversize) ? 'oversize width — permit' : 'legal dims', trailer: trailerOf(ms, l.trailerId)!.kind } })
    const id = bidActions.create({ moveId: m!.id, jobNo: m!.toJobNo, title: `Crane ${cr.unit} move — ${lines.length} load${lines.length > 1 ? 's' : ''}`, customer: m!.toProject.split(' — ')[0], site: m!.toProject, pickupRegion: 'Region of ' + m!.fromProject.split(' — ')[0].replace(/^[^ ]+ /, ''), dropRegion: 'Region of ' + m!.toProject.split(' — ')[0].split(' ').slice(-1)[0], pickupDate: m!.pickup, dropDate: m!.drop, lane: 'SE OK → S-central OK', lines, vendorIds: vids, dueAt: addDays(today(), 2), sealed })
    toast.success('Request built — review each vendor email, then send'); setPick(null); onDone(id)
  }
  return (
    <Modal open={open} onClose={onClose} title="Get quotes" sub="From a move's load list" width={620}>
      <div className="flex flex-col gap-3" data-testid="rfq-builder">
        <Field label="Move"><select className="input" value={moveId} onChange={e => { setMoveId(e.target.value); setPick(null) }}>{ms.moves.map(x => <option key={x.id} value={x.id}>Crane {ms.cranes.find(c => c.id === x.craneId)?.unit} → #{x.toJobNo} {x.toProject}</option>)}</select></Field>
        <Field label="Loads to quote"><div className="flex flex-col gap-1 max-h-48 overflow-y-auto">{loads.map(l => <label key={l.id} className="flex items-center gap-2 text-sm card-flat px-3 py-2"><input type="checkbox" checked={chosen.includes(l.id)} onChange={e => setPick(e.target.checked ? [...chosen, l.id] : chosen.filter(x => x !== l.id))} data-testid="rfq-load" />Load {l.no} · {trailerOf(ms, l.trailerId)?.name} <span className="text-muted text-xs ml-auto">{l.status}</span></label>)}</div></Field>
        <Field label="Vendors (each gets their own email)"><div className="grid grid-cols-2 gap-1.5">{VENDORS.map(v => <label key={v.id} className="flex items-center gap-2 text-sm card-flat px-3 py-2"><input type="checkbox" checked={vids.includes(v.id)} onChange={e => setVids(e.target.checked ? [...vids, v.id] : vids.filter(x => x !== v.id))} data-testid="rfq-vendor" /><span className="truncate">{v.name}</span><span className="ml-auto text-xs text-muted">★{v.rating}</span></label>)}</div></Field>
        <Toggle checked={sealed} onChange={setSealed} label="Sealed until the deadline" />
        <Button variant="primary" disabled={!chosen.length || !vids.length} onClick={create} data-testid="rfq-create">Build request</Button>
      </div>
    </Modal>
  )
}
