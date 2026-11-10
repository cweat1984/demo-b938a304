import { DeleteJobButton } from '../components/DeleteJob'
import { createPortal } from 'react-dom'
import { useMemo, useState } from 'react'
import { craneBusy, jobCranes } from '../data/rig'
import { useKeep } from '../lib/keep'
import { companyOf } from '../data/brand'
import { Logo } from '../shell/Splash'
import { toast } from 'sonner'
import { Plus, Trophy, XCircle, Send, Printer, FileText, Sparkles } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, customerOf, siteOf, inScope } from '../data/logic'
import { requiredPositions } from '../data/seed'
import { money, fmtDate, diffDays, cn, today, dateOf, addDays } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Card, Empty, Stat, Modal, Field } from '../components/ui'
import { CustRef, EqRef, SiteRef } from '../components/bits'

/** Build the quote lines from the job so price, budget and job costing all agree (cost lines sum to the budget). */
/** dive3 M6: repricing changes what gets invoiced — the day rate (and the itemized crane lines) scale with the new price;
 *  mob/demob stays as quoted. invoiceDraft = day rate × days + mob, so the invoice matches the accepted proposal. */
export function repriced(j: T.Job, price: number): Pick<T.Job, 'dayRate' | 'quote'> {
  const mob = j.quote.mobDemob, days = Math.max(1, diffDays(j.endDate, j.startDate) + 1)
  const dayRate = Math.max(0, Math.round(((price - mob) / days) * 100) / 100), f = j.dayRate ? dayRate / j.dayRate : 1
  // The leftover cents that a single day rate cannot express sit on mob, so day rate × days + mob equals the accepted price.
  const mobDemob = Math.round((price - dayRate * days) * 100) / 100
  const priceLines = j.quote.priceLines?.map(l => /Mobilization/.test(l.k) ? { ...l, v: mobDemob } : { ...l, v: Math.round(l.v * f * 100) / 100 })
  return { dayRate, quote: { ...j.quote, revenue: price, mobDemob, ...(priceLines ? { priceLines } : {}) } }
}
function fitDollars<X extends { v: number }>(parts: X[], total: number): X[] {
  if (!parts.length) return parts
  const s = parts.reduce((a, x) => a + x.v, 0) || 1
  const out = parts.map(x => ({ ...x, v: Math.round((x.v / s) * total) }))
  const drift = total - out.reduce((a, x) => a + x.v, 0)
  if (!drift) return out
  let i = 0
  out.forEach((x, k) => { if (Math.abs(x.v) > Math.abs(out[i].v)) i = k })
  out[i] = { ...out[i], v: out[i].v + drift }
  return out
}
export function quoteLines(db: T.DB, j: T.Job) {
  const days = diffDays(j.endDate, j.startDate) + 1
  const crane = byId(db.equipment, j.craneId)
  const crew = requiredPositions(j, j.startDate).length
  const rawCost = [
    { k: 'Crane ownership & fuel', v: crane ? days * j.dayRate * 0.34 : 0 },
    { k: `Crew labor (${crew} × ${days} d, burdened)`, v: crew * days * 10.5 * 58 * 1.32 },
    { k: 'Mobilization / demob (trucks, permits, escorts)', v: j.quote.mobDemob * 0.82 },
    { k: 'Per diem & lodging', v: crew * days * (siteOf(db, j).state === 'OK' ? 45 : 140) },
    ...(j.liftPlan !== 'Not Required' ? [{ k: 'Engineered lift plan', v: (crane?.capacity ?? 0) >= 300 ? 4800 : 1600 }] : []),
    ...((crane?.capacity ?? 0) >= 200 ? [{ k: 'Crane mats & site prep', v: 3600 }] : []),
  ].filter(x => x.v > 0)
  // dive3 M6/M8: jobs built since dive3 carry their own itemized price & cost (every crane) — use them as stored
  if (j.quote.priceLines?.length) {
    const cl = j.quote.costLines ?? []
    return { days, crane, cost: fitDollars(cl, j.quote.costBudget), price: j.quote.priceLines, margin: (j.quote.revenue - j.quote.costBudget) / (j.quote.revenue || 1) }
  }
  const cost = fitDollars(rawCost, j.quote.costBudget)
  const billedMob = j.quote.mobDemob
  const craneRental = crane ? Math.max(0, j.quote.revenue - billedMob - crew * days * 10.5 * 95) : 0
  const labor = j.quote.revenue - billedMob - craneRental
  const price = [
    ...(crane ? [{ k: `${crane.capacity}t crane, operated — ${days} day${days === 1 ? '' : 's'}`, v: craneRental }] : []),
    { k: `Rigging crew — ${crew} hands × ${days} d`, v: labor },
    { k: 'Mobilization & demobilization', v: billedMob },
  ]
  return { days, crane, cost, price, margin: (j.quote.revenue - j.quote.costBudget) / j.quote.revenue }
}

export default function Quotes() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const setUI = useStore(s => s.setUI)
  const [tab, setTab] = useKeep<'open' | 'won' | 'lost'>('quotes:tab', 'open')
  const [sel, setSel] = useState<string | null>(null)
  const all = db.jobs.filter(j => inScope(j, f))
  const open = all.filter(j => j.stage === 'Quote' && !j.quoteLost).sort((a, b) => a.startDate.localeCompare(b.startDate))
  const y0 = today().slice(0, 4) + '-01-01'
  const won = all.filter(j => j.stage !== 'Quote' && !j.quoteLost && j.quote.quotedAt >= y0).sort((a, b) => b.quote.quotedAt.localeCompare(a.quote.quotedAt))
  const lost = all.filter(j => j.quoteLost && j.quoteLost.at >= y0)
  const pipe = open.reduce((s, j) => s + j.quote.revenue, 0)
  // real ratio: quotes won ÷ quotes decided (won + lost) — no padding
  const winRate = won.length / Math.max(1, won.length + lost.length)
  const list = tab === 'open' ? open : tab === 'won' ? won.slice(0, 30) : lost
  const cur = sel ? byId(db.jobs, sel) : undefined
  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader eyebrow="Sales" title="Quotes" sub="Price it once — a won quote becomes the job, and the quote becomes its cost budget." actions={<Button variant="primary" icon={<Plus className="size-4" />} data-testid="new-quote" onClick={() => setUI({ jobBuilder: { prefill: { stage: 'Quote' } } })}>New quote</Button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Open pipeline" value={money(pipe, true)} sub={`${open.length} quotes out`} onClick={() => setTab('open')} />
        <Stat label="Quotes won this year (booked)" value={money(won.reduce((s, j) => s + j.quote.revenue, 0), true)} sub={`${won.length} jobs`} onClick={() => setTab('won')} />
        <Stat label="Win rate" value={`${Math.round(winRate * 100)}%`} sub={`${won.length} won · ${lost.length} lost · YTD`} />
        <Stat label="Avg quoted margin" value={`${Math.round((open.reduce((s, j) => s + (j.quote.revenue - j.quote.costBudget), 0) / Math.max(1, pipe)) * 100)}%`} sub="open quotes" />
      </div>
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'open', label: 'Open', count: open.length }, { value: 'won', label: 'Won', count: won.length }, { value: 'lost', label: 'Lost', count: lost.length }]} />
      {list.length ? <div className="grid gap-3 grid-cols-1 md:grid-cols-2">{list.map(j => { const q = quoteLines(db, j); return (
        <Card key={j.id} onClick={() => setSel(j.id)} className="cursor-pointer hover:-translate-y-0.5 transition">
          <div className="flex items-start gap-3" data-testid="quote-card">
            <div className="grid size-11 place-items-center rounded-2xl bg-surface-2"><FileText className="size-5" /></div>
            <div className="flex-1 min-w-0">
              <span className="font-semibold truncate block" data-testid="quote-cust">{customerOf(db, j).name}</span>
              <div className="text-xs text-muted truncate">Q-{j.jobNo} · {j.name} · {siteOf(db, j).city}, {siteOf(db, j).state}</div>
            </div>
            <div className="text-right"><div className="display text-xl font-semibold num">{money(j.quote.revenue, true)}</div><div className={cn('text-xs font-semibold num', q.margin >= 0.3 ? 'text-ok' : q.margin >= 0.2 ? 'text-warn' : 'text-bad')}>{Math.round(q.margin * 100)}% margin</div></div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 text-xs text-muted">
            {q.crane && <Badge>Crane {q.crane.unit} · {q.crane.capacity}t</Badge>}<Badge>{q.days} days from {fmtDate(j.startDate)}</Badge>
            {j.quoteSentAt && <Badge tone="info">Sent {fmtDate(j.quoteSentAt.slice(0, 10))}</Badge>}
            {j.stage !== 'Quote' && <Badge tone="ok">Won → Job #{j.jobNo}</Badge>}{j.quoteLost && <Badge tone="bad">Lost · {j.quoteLost.reason}</Badge>}
          </div>
        </Card>) })}</div> : <Empty title="Nothing here" body="Build a quote from the Job Builder, a wind farm or a crane's open window." />}
      {cur && <QuoteSheet job={cur} onClose={() => setSel(null)} />}
    </div>
  )
}

/** Customer proposal — the ONLY thing that prints from a quote. No cost budget, margin, slider or internal history. */
function CustomerProposal({ job, q }: { job: T.Job; q: ReturnType<typeof quoteLines> }) {
  const db = useStore(s => s.db)
  const co = companyOf(db), cust = customerOf(db, job), site = siteOf(db, job)
  const issued = dateOf(job.quoteSentAt) || today()
  const valid = (() => { const d = new Date(issued + 'T12:00'); d.setDate(d.getDate() + 30); return d.toISOString().slice(0, 10) })()
  const L = 'text-[10px] uppercase tracking-wider text-[#555] font-semibold'
  return <div data-print data-testid="proposal" className="hidden print:block text-[#111] bg-white p-2 text-[12px] leading-snug">
    <div className="flex items-center gap-3 border-b border-[#ccc] pb-3"><Logo size={32} /><div className="flex-1"><div className="text-lg font-bold">{co.name}</div><div>{co.phone}</div></div><div className="text-right"><div className="text-lg font-bold">Proposal Q-{job.jobNo}</div><div>Issued {fmtDate(issued, { month: 'short', day: 'numeric', year: 'numeric' })}</div><div data-testid="proposal-valid">Valid until {fmtDate(valid, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div></div>
    <div className="grid grid-cols-3 gap-4 mt-3">
      <div><div className={L}>Customer</div><div className="font-semibold" data-testid="proposal-customer">{cust.name}</div>{cust.contact && <div>{cust.contact}</div>}{cust.phone && <div>{cust.phone}</div>}</div>
      <div><div className={L}>Site</div><div className="font-semibold" data-testid="proposal-site">{site.name}</div><div>{site.city}, {site.state}</div></div>
      <div><div className={L}>Crane</div><div className="font-semibold" data-testid="proposal-crane">{q.crane ? `${q.crane.capacity}t ${q.crane.make} ${q.crane.model}` : 'Crew only'}</div>{q.crane && <div>{q.crane.type}</div>}</div>
    </div>
    <div className="mt-4"><div className={L}>Scope of work</div><div className="font-semibold">{job.name}</div><div>{job.type} · {q.days} day{q.days === 1 ? '' : 's'} starting {fmtDate(job.startDate, { month: 'short', day: 'numeric', year: 'numeric' })} · {job.shift} shift · start {job.startTime}</div>{job.lift && <div>Pick: {Math.round(job.lift.load)} t at {job.lift.radius} ft radius</div>}</div>
    <table className="w-full mt-4 border-collapse"><thead><tr><th className={cn(L, 'text-left border-b border-[#ccc] py-1')}>Description</th><th className={cn(L, 'text-right border-b border-[#ccc] py-1')}>Amount</th></tr></thead>
      <tbody>{q.price.map(l => <tr key={l.k}><td className="py-1 border-b border-[#eee]">{l.k}</td><td className="py-1 border-b border-[#eee] text-right">{money(l.v)}</td></tr>)}
        <tr><td className="py-1.5 font-bold">Total</td><td className="py-1.5 font-bold text-right" data-testid="proposal-total">{money(job.quote.revenue)}</td></tr></tbody></table>
    <div className="mt-4"><div className={L}>Terms</div><ul className="list-disc pl-4"><li>Price valid until {fmtDate(valid, { month: 'short', day: 'numeric', year: 'numeric' })}. Net 30 from invoice.</li><li>Standby, weather delays and added days billed at the daily rate; overtime per the crew agreement.</li><li>Customer provides site access, ground suitable for crane and mats, and a signed lift plan where required.</li><li>Permits, escorts and certificates of insurance included as listed above.</li></ul></div>
    <div className="grid grid-cols-2 gap-10 mt-8"><div><div className="border-b border-[#111] h-8" /><div className={L}>Accepted by (customer) · date</div></div><div><div className="border-b border-[#111] h-8" /><div className={L}>{co.name} · date</div></div></div>
  </div>
}

function QuoteSheet({ job, onClose }: { job: T.Job; onClose: () => void }) {
  const db = useStore(s => s.db)
  const q = useMemo(() => quoteLines(db, job), [db, job])
  const [target, setTarget] = useState(Math.round(q.margin * 100))
  const [lose, setLose] = useState(false), [lostNote, setLostNote] = useState('')
  const price = Math.round(job.quote.costBudget / (1 - target / 100) / 100) * 100
  const isOpen = job.stage === 'Quote' && !job.quoteLost
  return (
    <Modal open onClose={onClose} title={`Quote Q-${job.jobNo}`} sub={`${customerOf(db, job).name} · ${job.name}`} width={760}>
      {createPortal(<CustomerProposal job={job} q={q} />, document.body) /* direct child of <body> so it prints from the top of page 1 */}
      <div className="flex flex-col gap-4 print:hidden" data-testid="quote-sheet">
        <div className="flex items-center gap-3 border-b hairline pb-3" data-testid="quote-company"><Logo size={28} /><div className="flex-1"><div className="font-semibold leading-tight">{companyOf(db).name}</div><div className="text-xs text-muted">{companyOf(db).phone}</div></div><div className="text-xs text-muted">Quote Q-{job.jobNo}</div></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div className="card-flat p-3"><div className="label">Customer</div><CustRef id={job.customerId} className="font-semibold" /></div>
          <div className="card-flat p-3"><div className="label">Site</div><SiteRef id={job.siteId} className="font-semibold" /></div>
          <div className="card-flat p-3"><div className="label">Crane</div>{q.crane ? <EqRef id={q.crane.id} className="font-semibold" /> : 'Crew only'}</div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div><div className="label mb-2">Customer sees</div>
            <div className="rounded-2xl bg-surface-2 overflow-hidden">{q.price.map(l => <div key={l.k} className="flex justify-between gap-3 px-4 py-2.5 border-b hairline text-sm"><span>{l.k}</span><span className="num font-semibold">{money(l.v)}</span></div>)}<div className="flex justify-between px-4 py-3 font-semibold"><span>Total</span><span className="num">{money(job.quote.revenue)}</span></div></div>
          </div>
          <div><div className="label mb-2">Our cost budget → job costing</div>
            <div className="rounded-2xl bg-surface-2 overflow-hidden">{q.cost.map(l => <div key={l.k} className="flex justify-between gap-3 px-4 py-2.5 border-b hairline text-sm"><span className="text-muted">{l.k}</span><span className="num">{money(l.v)}</span></div>)}<div className="flex justify-between px-4 py-3 font-semibold"><span>Budget</span><span className="num">{money(job.quote.costBudget)}</span></div></div>
          </div>
        </div>
        {isOpen && <div className="rounded-2xl border hairline p-4">
          <div className="flex items-center gap-3"><Sparkles className="size-4 text-accent" /><span className="text-sm font-semibold flex-1">Target margin</span><span className="num font-semibold">{target}% → {money(price)}</span></div>
          <input type="range" min={12} max={50} value={target} onChange={e => setTarget(Number(e.target.value))} className="w-full mt-3 accent-[var(--accent)]" data-testid="margin-slider" />
          {(() => { const won = db.jobs.filter(x => x.id !== job.id && x.customerId === job.customerId && x.stage !== 'Quote' && !x.quoteLost && x.quote.revenue > 0 && x.quote.quotedAt >= addDays(today(), -365)).map(x => (x.quote.revenue - x.quote.costBudget) / x.quote.revenue).sort((a, b) => a - b)
            return <div className="text-xs text-muted mt-1" data-testid="margin-history">{won.length >= 2 ? `Last 12 months, ${customerOf(db, job).name} accepted ${won.length} quotes at ${Math.round(won[0] * 100)}–${Math.round(won[won.length - 1] * 100)}% margin.` : `Not enough won quotes from ${customerOf(db, job).name} in the last 12 months to show a margin range.`}</div> })()}
          {price !== job.quote.revenue && <Button size="sm" className="mt-3" data-testid="margin-apply" onClick={() => { const r = repriced(job, price); actions.updateJob(job.id, r, `Repriced quote: ${money(job.quote.revenue)} → ${money(price)}`); toast.success(`Repriced to ${money(price)}`, { description: `Day rate now ${money(r.dayRate)} — the invoice bills the new price` }) }}>Apply {money(price)}</Button>}
        </div>}
        {isOpen ? <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="lg" icon={<Trophy className="size-5" />} data-testid="quote-won" onClick={() => {
            // Won ≠ scheduled: check the crane isn't already booked those dates, and prompt to staff the crew.
            const clashOf = () => { const d = useStore.getState().db; const w = { from: job.startDate, to: job.endDate }; for (const cid of jobCranes(job)) { const hit = craneBusy(d, cid, job.id, { awarded: true }).find(o => o.from <= w.to && w.from <= o.to); if (hit) return { ...hit.job, startDate: hit.from, endDate: hit.to } } return undefined }
            const clash = clashOf(), unit = byId(db.equipment, job.craneId)?.unit
            actions.setStage(job.id, 'Awarded')
            if (clash) toast.warning(`Crane ${unit} is already booked on #${clash.jobNo} (${fmtDate(clash.startDate)}–${fmtDate(clash.endDate)})`, { id: 'won-clash', duration: 12000, description: 'Swap the crane or move dates before scheduling.' })
            toast.success(`Won — Job #${job.jobNo} created`, { description: `${money(job.quote.costBudget)} cost budget is now the job-costing baseline.`, action: { label: 'Schedule it', onClick: () => {
              const c2 = clashOf()
              if (c2) { toast.error(`Can’t schedule — crane ${unit} is on #${c2.jobNo} those dates`, { description: 'Open the job and swap the crane first.', action: { label: 'Open job', onClick: () => useStore.getState().open({ type: 'job', id: job.id }) } }); return }
              actions.setStage(job.id, 'Scheduled')
              const crew = useStore.getState().db.assignments.filter(a => a.jobId === job.id).length
              if (!crew) toast.warning('Scheduled — but no crew yet', { id: 'won-staff', duration: 12000, description: 'It’s on the dispatch board with open slots.', action: { label: 'Staff the crew', onClick: () => useStore.getState().go('dispatch') } })
              else toast.success('Scheduled — it’s on the dispatch board')
            } } }); useStore.getState().open({ type: 'job', id: job.id }); onClose() }}>Mark won → create job</Button>
          <Button icon={<Send className="size-4" />} onClick={() => { actions.updateJob(job.id, { quoteSentAt: new Date().toISOString() }, 'Sent quote'); toast.success('Quote sent (demo)', { description: `To ${customerOf(db, job).contact ?? customerOf(db, job).name}` }) }}>Send to customer</Button>
          <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>Print</Button>
          <Button variant="ghost" icon={<XCircle className="size-4" />} data-testid="quote-lost" onClick={() => setLose(true)}>Mark lost</Button>
          <DeleteJobButton job={job} onDone={onClose} />
        </div> : <div className="flex flex-wrap items-center gap-2 text-sm text-muted"><span data-testid="quote-state">{job.quoteLost ? `Lost ${fmtDate(job.quoteLost.at)} — ${job.quoteLost.reason}${job.quoteLost.note ? ` · ${job.quoteLost.note}` : ''}` : `Won — now Job #${job.jobNo} (${job.stage}).`}</span>
          {job.quoteLost && <Button size="sm" data-testid="quote-reopen" onClick={() => { actions.updateJob(job.id, { quoteLost: undefined }, 'Reopened quote'); toast.success(`Q-${job.jobNo} is open again`) }}>Reopen quote</Button>}
          {job.quoteLost && <DeleteJobButton job={job} onDone={onClose} size="sm" />}</div>}
      </div>
      {lose && <Modal open onClose={() => setLose(false)} title="Why did we lose it?" width={420} z={80}>
        <div className="flex flex-col gap-2"><input className="input text-base sm:text-sm" placeholder="Competitor, their price or a note (optional)" value={lostNote} onChange={e => setLostNote(e.target.value.slice(0, 140))} data-testid="lost-note" />{['Price', 'Crane not available', 'Customer went in-house', 'Schedule', 'No decision'].map(r => <Button key={r} data-testid="lost-reason" onClick={() => { actions.updateJob(job.id, { quoteLost: { at: today(), reason: r, ...(lostNote.trim() ? { note: lostNote.trim() } : {}) } }, 'Marked quote lost'); toast('Quote marked lost', { description: r, duration: 10000, action: { label: 'Undo', onClick: () => { actions.updateJob(job.id, { quoteLost: undefined }, 'Reopened quote'); toast.success(`Q-${job.jobNo} is open again`) } } }); setLose(false); onClose() }}>{r}</Button>)}</div>
      </Modal>}
    </Modal>
  )
}
