import { companyOf } from '../data/brand'
import { useEffect, useRef, useState } from 'react'
import { ClipboardCheck, FileDown, PenLine, CalendarClock, DollarSign, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../data/store'
import { downloadBlob } from '../data/certshare'
import { cn } from '../lib/util'
import { useB3 } from './b3store'
import { hazardPdf } from './pdf'
import { applyApprovedCO } from './ChangeOrders'
import { defaultJob } from './Recon'
import type * as T from '../data/types'

/** Approved recon → customer-ready hazard summary (no prices, no internal notes). */
export function PortalRecon({ job }: { job: T.Job }) {
  const db = useStore(s => s.db)
  const r = useB3(s => s.recons.find(x => x.jobId === job.id && x.status === 'Approved'))
  if (!r) return <div className="mt-6 card p-5 text-muted" data-testid="portal-recon">{companyOf().shortName} hasn’t published a site recon for this project yet.</div>
  const hz = r.hazards.filter(h => h.customerVisible), fix = hz.filter(h => h.fixBy === 'Customer')
  return <div className="mt-6 flex flex-col gap-4" data-testid="portal-recon">
    <div className="card p-5"><div className="flex items-center gap-2 flex-wrap"><ClipboardCheck className="size-5 text-ok" /><div className="font-semibold flex-1">Site hazard report — approved by {r.approvedBy}</div><button data-testid="portal-hazard-pdf" onClick={async () => { downloadBlob(await hazardPdf(db, r), `hazard-report-${job.jobNo}.pdf`); toast.success('Hazard report downloaded') }} className="h-9 px-3 rounded-xl bg-surface-2 text-sm font-semibold flex items-center gap-1.5"><FileDown className="size-4" />PDF</button></div>
      {fix.length > 0 && <div className="mt-4 rounded-xl bg-warn/10 p-4"><div className="font-semibold text-warn text-sm">Please fix before work starts ({fix.length})</div><ul className="mt-2 text-sm flex flex-col gap-1">{fix.map(h => <li key={h.id} data-testid="portal-fix">• <b>{h.kind}:</b> {h.control}</li>)}</ul></div>}
      <div className="mt-4 flex flex-col divide-y hairline">{hz.map(h => <div key={h.id} className="py-2.5 text-sm flex gap-3"><span className={cn('rounded-full px-2 h-5 text-[10px] font-bold grid place-items-center text-white', h.severity === 'High' ? 'bg-bad' : h.severity === 'Medium' ? 'bg-warn' : 'bg-ok-solid')}>{h.severity}</span><div><b>{h.kind}</b> — {h.detail}<div className="text-muted text-xs">{h.control}</div></div></div>)}</div>
      {r.photos.length > 0 && <div className="grid grid-cols-4 gap-2 mt-3">{r.photos.map((p, i) => <img key={i} src={p} className="aspect-[4/3] object-cover rounded-xl" />)}</div>}
      <div className="text-xs text-muted mt-3">Internal notes and pricing are never shown in the portal.</div></div>
  </div>
}

function SignPad({ onSigned }: { onSigned: (data: string) => void }) {
  const c = useRef<HTMLCanvasElement>(null), drawing = useRef(false), [inked, setInked] = useState(false)
  useEffect(() => { const ctx = c.current!.getContext('2d')!; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#111' }, [])
  const pos = (e: React.PointerEvent) => { const r = c.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (c.current!.width / r.width), (e.clientY - r.top) * (c.current!.height / r.height)] }
  return <div><canvas data-testid="sign-pad" ref={c} width={560} height={140} className="w-full h-28 rounded-xl bg-white touch-none cursor-crosshair"
    onPointerDown={e => { drawing.current = true; const [x, y] = pos(e); const ctx = c.current!.getContext('2d')!; ctx.beginPath(); ctx.moveTo(x, y) }}
    onPointerMove={e => { if (!drawing.current) return; const [x, y] = pos(e); const ctx = c.current!.getContext('2d')!; ctx.lineTo(x, y); ctx.stroke(); setInked(true) }}
    onPointerUp={() => { drawing.current = false }} onPointerLeave={() => { drawing.current = false }} />
    <button data-testid="sign-submit" disabled={!inked} onClick={() => onSigned(c.current!.toDataURL('image/png'))} className="mt-2 h-10 px-4 rounded-xl bg-ok-solid text-white font-semibold text-sm disabled:opacity-40 flex items-center gap-1.5"><PenLine className="size-4" />Sign & approve</button></div>
}

export function PortalChangeOrders({ job, me }: { job: T.Job; me: { name: string; role: string } }) {
  const db = useStore(s => s.db)
  useEffect(() => { useB3.getState().seed(db, defaultJob(db)?.id) }, [db])
  const cos = useB3(s => s.cos).filter(c => c.jobId === job.id && c.status !== 'Draft')
  const [signing, setSigning] = useState<string | null>(null)
  return <div className="mt-6 flex flex-col gap-4" data-testid="portal-co">
    {!cos.length && <div className="text-muted">No change orders on this project.</div>}
    {cos.map(c => <div key={c.id} className="card p-5" data-testid="portal-co-row">
      <div className="flex items-center gap-2 flex-wrap"><b>{c.no}</b><span className="font-semibold">{c.title}</span><span className={cn('ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-bold', c.status === 'Approved' ? 'bg-ok/15 text-ok' : c.status === 'Declined' ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn')}>{c.status === 'Approved' ? `Signed by ${c.signer}` : c.status === 'Declined' ? 'Declined' : 'Awaiting your signature'}</span></div>
      <p className="text-sm text-muted mt-2">{c.why}</p>
      <div className="flex flex-wrap gap-5 mt-3 text-sm">{me.role === 'Approver' && <span className="flex items-center gap-1"><DollarSign className="size-4" />${c.cost.toLocaleString()}</span>}<span className="flex items-center gap-1"><CalendarClock className="size-4" />{c.schedule}</span></div>
      {c.signature && <img src={c.signature} className="h-12 mt-3 bg-white rounded-lg p-1" />}
      {me.role === 'Approver' && (c.status === 'Sent' || c.status === 'Verbal') && (signing === c.id
        ? <div className="mt-4"><div className="text-xs text-muted mb-1.5">Sign below — {me.name}</div><SignPad onSigned={sig => { useB3.getState().coAct(c.id, { status: 'Approved', signer: me.name, signature: sig }, me.name, 'Customer signed in portal'); applyApprovedCO(c); setSigning(null); toast.success(`${c.no} approved`, { description: 'Budget, billing and schedule updated.' }) }} /></div>
        : <div className="flex gap-2 mt-4"><button data-testid="portal-co-sign" onClick={() => setSigning(c.id)} className="h-10 px-4 rounded-xl bg-ok-solid text-white font-semibold text-sm flex items-center gap-1.5"><CheckCircle2 className="size-4" />Review & sign</button><button onClick={() => { useB3.getState().coAct(c.id, { status: 'Declined' }, me.name, 'Customer declined in portal'); toast('Declined — PM notified') }} className="h-10 px-4 rounded-xl bg-surface-2 text-sm font-semibold">Decline</button></div>)}
    </div>)}
  </div>
}
