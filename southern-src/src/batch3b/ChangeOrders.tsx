import { useEffect, useMemo, useState } from 'react'
import { FilePlus2, Send, Mic, CheckCircle2, History, CalendarClock, DollarSign } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Modal, Field } from '../components/ui'
import { useStore, actions } from '../data/store'
import { addDays } from '../lib/util'
import { useB3, scheduleImpact, type ChangeOrder } from './b3store'
import { defaultJob } from './Recon'

const LABOR = 95
const tone = { Draft: 'neutral', Sent: 'info', Verbal: 'warn', Approved: 'ok', Declined: 'bad' } as const
export const coCost = (dayRate: number, h: number, ed: number, xd: number) => h * LABOR + ed * Math.round(dayRate * 0.35) + xd * dayRate
export const applyApprovedCO = (c: ChangeOrder) => { const db = useStore.getState().db; const j = db.jobs.find(x => x.id === c.jobId); if (!j) return; actions.updateJob(j.id, { endDate: addDays(j.endDate, c.extraDays), quote: { ...j.quote, revenue: j.quote.revenue + c.cost } }, `Change order ${c.no} approved — budget, billing and forecast updated`) }

export default function ChangeOrders() {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Chad Weathers'
  useEffect(() => { useB3.getState().seed(db, defaultJob(db)?.id) }, [db])
  const cos = useB3(s => s.cos)
  const [open, setOpen] = useState(false)
  const [audit, setAudit] = useState<ChangeOrder | null>(null)
  const [f, setF] = useState({ jobId: defaultJob(db)?.id ?? '', title: 'Add assist crane for blade tailing', why: 'Gusts above plan at T-14; customer asked for a tailing crane.', laborHrs: 24, equipDays: 3, extraDays: 1 })
  const job = db.jobs.find(j => j.id === f.jobId)
  const cost = job ? coCost(job.dayRate, f.laborHrs, f.equipDays, f.extraDays) : 0
  const sched = useMemo(() => job ? scheduleImpact(db, job, f.extraDays) : '', [db, job, f.extraDays])
  const jobs = useMemo(() => db.jobs.filter(j => j.status !== 'Complete').slice(0, 80), [db.jobs])
  return <div className="flex flex-col gap-5" data-testid="co-page">
    <PageHeader eyebrow="Jobs" title="Change orders" sub="What changed, what it costs, what it moves — signed by the customer." actions={<Button variant="primary" icon={<FilePlus2 className="size-4" />} data-testid="co-new" onClick={() => setOpen(true)}>New change order</Button>} />
    <div className="grid md:grid-cols-4 gap-3">{(['Sent', 'Verbal', 'Approved', 'Declined'] as const).map(s => <Card key={s} className="!p-4"><div className="text-xs text-muted">{s === 'Verbal' ? 'Proceeding on verbal' : s}</div><div className="text-2xl font-semibold">{cos.filter(c => c.status === s).length}</div><div className="text-xs text-muted">${cos.filter(c => c.status === s).reduce((a, c) => a + c.cost, 0).toLocaleString()}</div></Card>)}</div>
    <div className="flex flex-col gap-3">{cos.map(c => { const j = db.jobs.find(x => x.id === c.jobId)
      return <Card key={c.id} className="flex flex-col md:flex-row gap-4 md:items-center" data-testid="co-row">
        <div className="flex-1"><div className="flex items-center gap-2"><b>{c.no}</b><span>{c.title}</span><Badge tone={tone[c.status]}>{c.status === 'Verbal' ? 'Verbal — signature pending' : c.status}</Badge></div>
          <div className="text-xs text-muted mt-1">Job #{j?.jobNo} · {j?.name} · {c.why}</div>
          <div className="text-sm mt-2 flex flex-wrap gap-x-5 gap-y-1"><span className="flex items-center gap-1"><DollarSign className="size-3.5" />${c.cost.toLocaleString()}</span><span className="flex items-center gap-1"><CalendarClock className="size-3.5" />{c.schedule}</span>{c.signer && <span className="text-ok">Signed by {c.signer}</span>}</div></div>
        <div className="flex gap-2 flex-wrap">
          {c.status === 'Draft' && <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} data-testid="co-send" onClick={() => { useB3.getState().coAct(c.id, { status: 'Sent' }, who, 'Sent to customer portal for signature'); toast.success('Sent to the customer portal') }}>Send to customer</Button>}
          {(c.status === 'Draft' || c.status === 'Sent') && <Button size="sm" icon={<Mic className="size-3.5" />} onClick={() => { useB3.getState().coAct(c.id, { status: 'Verbal' }, who, 'Proceeding at customer’s verbal direction — daily reminder until signed'); toast('Marked proceeding on verbal — reminder set') }}>Verbal OK</Button>}
          <Button size="sm" icon={<History className="size-3.5" />} data-testid="co-audit" onClick={() => setAudit(c)}>Audit trail</Button></div>
      </Card> })}</div>
    <Modal open={open} onClose={() => setOpen(false)} title="New change order" sub="Cost comes from rates. Schedule impact comes from the crane forecast." width={600}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Job" className="col-span-2"><select data-testid="co-job" value={f.jobId} onChange={e => setF({ ...f, jobId: e.target.value })} className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm">{(jobs.some(j => j.id === f.jobId) ? jobs : [job!, ...jobs]).filter(Boolean).map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {j.name}</option>)}</select></Field>
        <Field label="What changed" className="col-span-2"><input data-testid="co-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm" /></Field>
        <Field label="Why" className="col-span-2"><input value={f.why} onChange={e => setF({ ...f, why: e.target.value })} className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm" /></Field>
        {([['laborHrs', 'Added labor (hrs)'], ['equipDays', 'Added equipment (days)'], ['extraDays', 'Added job days']] as const).map(([k, l]) => <Field key={k} label={l}><input data-testid={`co-${k}`} type="number" min={0} value={f[k]} onChange={e => setF({ ...f, [k]: Math.max(0, Number(e.target.value)) })} className="h-10 w-full rounded-xl bg-surface-2 px-3 text-sm" /></Field>)}
      </div>
      <div className="mt-4 rounded-2xl bg-surface-2 p-4" data-testid="co-impact"><div className="label">Automatic impact</div><div className="text-2xl font-semibold mt-1">+${cost.toLocaleString()}</div><div className="text-xs text-muted">{f.laborHrs} h × ${LABOR} + {f.equipDays} equip-day(s) + {f.extraDays} crane day(s) × ${job?.dayRate.toLocaleString()}</div><div className="text-sm mt-2 flex gap-1.5"><CalendarClock className="size-4 mt-0.5" />{sched}</div></div>
      <div className="flex justify-end gap-2 mt-4"><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" data-testid="co-create" onClick={() => { if (!job) return; const id = useB3.getState().addCO({ jobId: job.id, title: f.title, why: f.why, laborHrs: f.laborHrs, equipDays: f.equipDays, extraDays: f.extraDays, cost, schedule: sched }, who); useB3.getState().coAct(id, { status: 'Sent' }, who, 'Sent to customer portal for signature'); setOpen(false); toast.success('Change order created and sent to the customer portal') }}>Create & send</Button></div>
    </Modal>
    {audit && <Modal open onClose={() => setAudit(null)} title={`${audit.no} audit trail`} sub={audit.title}><div className="flex flex-col gap-3" data-testid="co-audit-list">{(cos.find(c => c.id === audit.id) ?? audit).audit.map((a, i) => <div key={i} className="flex gap-3 text-sm"><CheckCircle2 className="size-4 text-accent mt-0.5" /><div><div>{a.what}</div><div className="text-xs text-muted">{a.by} · {new Date(a.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div></div></div>)}{audit.signature && <img src={audit.signature} className="h-14 self-start bg-white rounded-lg p-1" />}</div></Modal>}
  </div>
}
