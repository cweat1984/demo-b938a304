import { PhotoThumb } from '../lib/photos'
import { useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { TextTicketButton } from '../batch4/TextTicket'
import { toast } from 'sonner'
import { FileSignature, Check, RotateCcw, Camera } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { inScope, byId, fullName, customerOf } from '../data/logic'
import { fmtDate, fmtTs, cn } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Sheet, Empty, Kv, Modal } from '../components/ui'
import { NptForm, NptList, NptButton } from '../gapA/npt'
import { TicketExtras } from '../components/JobExtras'

export default function Tickets() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const [tab, setTab] = useKeep<'review' | 'done' | 'fix' | 'draft'>('tickets:tab', 'review')
  const [sel, setSel] = useState<T.EodTicket | null>(null)
  const [nptFor, setNptFor] = useState<{ jobId: string; date: string } | null>(null)
  const all = useMemo(() => db.tickets.filter(t => inScope(byId(db.jobs, t.jobId), f)).sort((a, b) => b.date.localeCompare(a.date)), [db, f])
  const list = all.filter(t => tab === 'review' ? t.status === 'Signed' || t.status === 'Submitted' : tab === 'done' ? t.status === 'Reviewed' : tab === 'draft' ? t.status === 'Draft' : t.status === 'Needs Correction')
  const cur = sel && db.tickets.find(t => t.id === sel.id)
  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader eyebrow="End-of-day" title="Field tickets" sub="Customer-signed on the phone. Review once — they feed payroll checks, job cost and invoicing." />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'review', label: 'To review', count: all.filter(t => t.status === 'Signed' || t.status === 'Submitted').length }, { value: 'fix', label: 'Needs correction', count: all.filter(t => t.status === 'Needs Correction').length }, { value: 'draft', label: 'Awaiting signature', count: all.filter(t => t.status === 'Draft').length }, { value: 'done', label: 'Reviewed' }]} />
      <div className="card p-0 overflow-hidden">{list.slice(0, 80).map(t => { const j = byId(db.jobs, t.jobId)!; const hrs = Object.values(t.hours).reduce((s, n) => s + (n ?? 0), 0); return (
        <button key={t.id} onClick={() => setSel(t)} className="w-full flex items-center gap-4 px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2 text-left">
          <FileSignature className={cn('size-5', t.signedAt ? 'text-ok' : 'text-muted')} />
          <span className="flex-1 min-w-0"><span className="block font-semibold text-sm truncate">#{j.jobNo} · {customerOf(db, j).name}</span><span className="block text-xs text-muted truncate">{fmtDate(t.date, { weekday: 'short', month: 'short', day: 'numeric' })} · {fullName(byId(db.employees, t.supervisorId))} · {t.crewIds.length} crew · {hrs}h · {t.pctComplete}%</span>{t.status === 'Needs Correction' && t.correction && <span className="block text-xs text-bad truncate mt-0.5">{t.correction}</span>}</span>
          <span className="hidden md:block text-xs text-muted w-48 truncate">{t.signerName ? `Signed by ${t.signerName}` : 'Not signed'}</span>
          <Badge tone={t.status === 'Reviewed' ? 'ok' : t.status === 'Needs Correction' ? 'bad' : t.status === 'Signed' ? 'info' : 'neutral'}>{t.status}</Badge>
        </button>) })}{!list.length && <Empty title="All caught up" />}</div>
      <Modal open={!!nptFor} onClose={() => setNptFor(null)} title="Nonproductive time" sub="Shows on the ticket and the customer sign-off" width={560}>{nptFor && <NptForm jobId={nptFor.jobId} date={nptFor.date} onDone={() => setNptFor(null)} />}</Modal>
      <Sheet open={!!cur} onClose={() => setSel(null)} title={cur ? `Ticket · #${byId(db.jobs, cur.jobId)?.jobNo}` : ''} sub={cur ? fmtDate(cur.date, { weekday: 'long', month: 'long', day: 'numeric' }) : ''}>
        {cur && <div className="flex flex-col gap-5">
          {cur.correction && <div className="rounded-2xl bg-bad/10 border border-bad/30 p-4 text-sm"><b className="text-bad">Sent back by the office:</b> {cur.correction}</div>}
          <div className="rounded-2xl bg-surface-2 p-4 text-sm">{cur.work}</div>
          <div>{Object.entries(cur.hours).filter(([, v]) => v).map(([k, v]) => <Kv key={k} k={k} v={`${v} h`} />)}<Kv k="Crew" v={cur.crewIds.map(id => byId(db.employees, id)?.first).join(', ')} /><Kv k="Percent complete" v={`${cur.pctComplete}%`} />{(() => { const jj = byId(db.jobs, cur.jobId); return jj ? <TicketExtras job={jj} date={cur.date} /> : null })()}<Kv k="Delays" v={cur.delays || '—'} /><Kv k="Photos" v={<span className="inline-flex items-center gap-1"><Camera className="size-3.5" />{cur.photos}</span>} />{cur.photoRefs?.length ? <div className="flex gap-2 flex-wrap py-2" data-testid="ticket-photos">{cur.photoRefs.map(r => <PhotoThumb key={r} src={r} className="size-20 rounded-lg object-cover bg-surface-2" />)}</div> : null}</div>
          {cur.signedAt ? <div className="rounded-2xl border hairline p-4"><div className="text-xs text-muted mb-2">Customer signature</div>{cur.signature ? <img src={cur.signature} alt="Signature" className="w-full max-h-40 object-contain rounded-xl bg-white" /> : <div className="h-24 rounded-xl bg-white grid place-items-center font-[cursive] text-3xl text-slate-800">{cur.signerName}</div>}<div className="text-sm mt-2 font-semibold">{cur.signerName}{cur.signerTitle ? `, ${cur.signerTitle}` : ''}</div><div className="text-xs text-muted">{fmtTs(cur.signedAt)}</div></div> : <Badge tone="warn">Not signed by customer</Badge>}
          <NptList jobId={cur.jobId} date={cur.date} />
          <NptButton onClick={() => setNptFor({ jobId: cur.jobId, date: cur.date })} />
          {!cur.signedAt && <TextTicketButton t={cur} />}
          {cur.status !== 'Reviewed' && <div className="flex gap-2"><Button variant="ok" size="lg" className="flex-1" icon={<Check className="size-5" />} onClick={() => { actions.reviewTicket(cur.id, 'Reviewed'); toast.success('Ticket reviewed'); setSel(null) }}>Mark reviewed</Button><Button size="lg" icon={<RotateCcw className="size-5" />} onClick={() => { actions.reviewTicket(cur.id, 'Needs Correction'); toast('Sent back to supervisor') }}>Needs correction</Button></div>}
        </div>}
      </Sheet>
    </div>
  )
}
