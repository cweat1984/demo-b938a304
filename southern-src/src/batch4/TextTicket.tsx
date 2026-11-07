import { useEffect, useRef, useState } from 'react'
import { MessageSquareText, Send, PenLine, CheckCircle2, Clock, Users, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { Button, Modal } from '../components/ui'
import { useStore, actions } from '../data/store'
import { useCompany } from '../data/brand'
import { PoweredBy } from '../components/PoweredBy'
import { Logo } from '../shell/Splash'
import { fmtDate, today } from '../lib/util'
import { useL2 } from '../launch2/l2store'
import { useB4 } from './b4store'
import type * as T from '../data/types'
import { TicketExtras } from '../components/JobExtras'

const hrs = (t: T.EodTicket) => Object.values(t.hours).reduce((s: number, h) => s + (h ?? 0), 0)
export const signUrl = (id: string) => `${location.origin}${location.pathname}?sign=${id}`

export function TextTicketButton({ t }: { t: T.EodTicket }) {
  const db = useStore(s => s.db), company = useCompany()
  const job = db.jobs.find(j => j.id === t.jobId), cust = db.customers.find(c => c.id === job?.customerId)
  const sent = useB4(s => s.texts.find(x => x.ticketId === t.id))
  const [open, setOpen] = useState(false), [phone, setPhone] = useState(cust?.phone ?? ''), [name, setName] = useState(cust?.contact ?? '')
  const body = `${company.name}: Today’s ticket for Job #${job?.jobNo} (${fmtDate(t.date)}) — ${hrs(t)} hrs, ${t.crewIds.length} crew. Review & sign: ${signUrl(t.id)}`
  return <>
    <Button icon={<MessageSquareText className="size-4" />} data-testid="text-ticket" onClick={() => setOpen(true)}>{sent ? (sent.signedAt ? 'Signed by text ✓' : 'Text sent · resend') : 'Text ticket to customer'}</Button>
    <Modal open={open} onClose={() => setOpen(false)} title="Text ticket to customer" sub="They sign on their phone — no app, no login.">
      <div className="grid grid-cols-2 gap-3"><label className="text-xs text-muted">Name<input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-2 px-3 text-sm text-ink" /></label><label className="text-xs text-muted">Mobile<input data-testid="tt-phone" value={phone} onChange={e => setPhone(e.target.value)} className="mt-1 w-full h-10 rounded-xl bg-surface-2 px-3 text-sm text-ink" /></label></div>
      <div className="mt-4 mx-auto w-72 rounded-[32px] bg-[#0b0b0d] p-4 pb-6" data-testid="sms-preview" data-ticket={t.id}><div className="text-center text-[11px] text-white/50">{phone || 'Customer'} · Text Message</div><div className="mt-3 rounded-2xl rounded-bl-md bg-[#26262a] text-white text-[13px] leading-snug px-3 py-2">{body}</div><div className="text-[10px] text-white/35 mt-1">Delivered · now</div></div>
      <div className="flex justify-end gap-2 mt-4"><a href={signUrl(t.id)} target="_blank" className="h-10 px-4 rounded-xl bg-surface-2 text-sm grid place-items-center" data-testid="tt-open">Open signing page</a><Button variant="primary" icon={<Send className="size-4" />} data-testid="tt-send" onClick={() => { useB4.getState().textTicket({ ticketId: t.id, phone, name, at: new Date().toISOString() }); setOpen(false); toast.success(`Text sent to ${name} (demo — nothing sent)`) }}>Send text</Button></div>
    </Modal>
  </>
}

/** Render the signed ticket as an image to attach to the project. */
function ticketImage(db: T.DB, t: T.EodTicket, sig: string, signer: string, title: string, companyName: string): Promise<string> {
  return new Promise(res => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 1160; const x = c.getContext('2d')!
    const job = db.jobs.find(j => j.id === t.jobId)!, site = db.sites.find(s => s.id === job.siteId)
    x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 1160); x.fillStyle = '#0f2d52'; x.fillRect(0, 0, 900, 110); x.fillStyle = '#c4581c'; x.fillRect(0, 110, 900, 6)
    x.fillStyle = '#fff'; x.font = 'bold 34px Helvetica, Arial'; x.fillText(companyName, 40, 58); x.font = '20px Helvetica, Arial'; x.fillText('Daily field ticket · customer signed', 40, 90)
    x.fillStyle = '#111'; x.font = 'bold 30px Helvetica, Arial'; x.fillText(`Job #${job.jobNo} · ${fmtDate(t.date, { month: 'long', day: 'numeric', year: 'numeric' })}`, 40, 175)
    x.font = '22px Helvetica, Arial'; x.fillStyle = '#444'; x.fillText(`${job.name}`.slice(0, 60), 40, 210); x.fillText(`${site?.name ?? ''}`, 40, 240)
    const rows: [string, string][] = [['Work', t.work], ['Crew', t.crewIds.map(id => { const e = db.employees.find(z => z.id === id); return e ? `${e.first} ${e.last}` : '' }).join(', ')], ['Hours', `${hrs(t)} h · ${Object.entries(t.hours).filter(([, h]) => h).map(([k, h]) => `${k} ${h}`).join(', ')}`], ['Equipment', [t.equipmentIn, t.equipmentOut].filter(Boolean).join(' / ') || '—'], ['Delays / notes', t.delays || 'None'], ['Complete', `${t.pctComplete}%`]]
    let y = 300; rows.forEach(([k, v]) => { x.fillStyle = '#888'; x.font = 'bold 16px Helvetica, Arial'; x.fillText(k.toUpperCase(), 40, y); x.fillStyle = '#111'; x.font = '22px Helvetica, Arial'; const words = v.split(' '); let line = ''; y += 30; words.forEach(w => { if (x.measureText(line + w).width > 820) { x.fillText(line, 40, y); y += 28; line = '' } line += w + ' ' }); x.fillText(line, 40, y); y += 44 })
    const img = new Image(); img.onload = () => { x.strokeStyle = '#ddd'; x.strokeRect(40, 880, 820, 170); x.drawImage(img, 60, 890, 560, 140); x.fillStyle = '#111'; x.font = 'bold 22px Helvetica, Arial'; x.fillText(`${signer}${title ? `, ${title}` : ''}`, 40, 1085); x.fillStyle = '#666'; x.font = '18px Helvetica, Arial'; x.fillText(`Signed ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} via text link`, 40, 1112); x.fillStyle = '#999'; x.font = '14px Helvetica, Arial'; x.fillText('Powered by Arrowline', 700, 1140); res(c.toDataURL('image/png')) }
    img.src = sig
  })
}

export default function SignPage({ ticketId }: { ticketId: string }) {
  const db = useStore(s => s.db), ready = useStore(s => s.ready), company = useCompany()
  const t = ready ? db.tickets.find(x => x.id === ticketId) : undefined
  const text = useB4(s => s.texts.find(x => x.ticketId === ticketId))
  const [name, setName] = useState(''), [title, setTitle] = useState('Site representative'), [img, setImg] = useState<string | null>(null)
  const c = useRef<HTMLCanvasElement>(null), drawing = useRef(false), [inked, setInked] = useState(false)
  const job = t && db.jobs.find(j => j.id === t.jobId), cust = job && db.customers.find(x => x.id === job.customerId)
  useEffect(() => { if (!name && (text?.name || cust?.contact)) setName(text?.name || cust!.contact) }, [text, cust, name])
  useEffect(() => { const x = c.current?.getContext('2d'); if (x) { x.lineWidth = 3; x.lineCap = 'round'; x.strokeStyle = '#111' } })
  if (!ready) return null
  if (!t || !job) return <div className="min-h-screen grid place-items-center text-muted">This signing link has expired.</div>
  const pos = (e: React.PointerEvent) => { const r = c.current!.getBoundingClientRect(); return [(e.clientX - r.left) * (c.current!.width / r.width), (e.clientY - r.top) * (c.current!.height / r.height)] }
  const already = t.signedAt && t.signature && !img
  const sign = async () => {
    const sig = c.current!.toDataURL('image/png')
    const pic = await ticketImage(db, t, sig, name, title, company.name)
    actions.saveTicket({ ...t, status: 'Signed', signature: sig, signerName: name, signerTitle: title, signedAt: new Date().toISOString() })
    const j = useStore.getState().db.jobs.find(x => x.id === t.jobId)!
    actions.updateJob(j.id, { docs: [...(j.docs ?? []), { id: 'doc-sig-' + t.id, name: `Signed ticket ${t.date}.png`, kind: 'Ticket', added: today(), by: name, dataUrl: pic }] }, `Signed ticket image attached (${name}, via text)`)
    useL2.getState().ticketAction(t.id, 'approved')
    useB4.getState().markSigned(t.id); useB4.getState().fire('ticket', `Ticket signed — ${name}`, `Job #${job.jobNo} · ${t.date} signed by text link`, 'tickets')
    setImg(pic)
  }
  return <div className="min-h-screen bg-bg text-ink" data-testid="sign-page"><div className="max-w-md mx-auto px-5 py-6 flex flex-col gap-4">
    <div className="flex items-center gap-3"><Logo size={30} /><div><div className="font-semibold">{company.name}</div><div className="text-xs text-muted">Daily ticket for {cust?.name}</div></div></div>
    {img || already ? <div className="flex flex-col gap-3" data-testid="sign-done"><div className="flex items-center gap-2 text-ok font-semibold text-lg"><CheckCircle2 className="size-6" />Signed — thank you{img ? `, ${name.split(' ')[0]}` : ''}.</div><div className="text-sm text-muted">A copy is attached to the project and shows in your customer portal.</div>{img && <img src={img} alt="Signed ticket" className="rounded-2xl border hairline" data-testid="signed-image" />}</div> : <>
      <div><div className="label">Job #{job.jobNo} · {fmtDate(t.date, { weekday: 'long', month: 'short', day: 'numeric' })}</div><h1 className="text-2xl font-semibold mt-1">{job.name}</h1></div>
      <div className="card p-4 flex flex-col gap-3 text-sm"><p>{t.work}</p>{job && <TicketExtras job={job} date={t.date} />}<div className="flex gap-2"><Users className="size-4 text-muted" />{t.crewIds.map(id => { const e = db.employees.find(z => z.id === id); return e ? `${e.first} ${e.last}` : '' }).join(', ')}</div><div className="flex gap-2"><Clock className="size-4 text-muted" />{hrs(t)} hours · {t.pctComplete}% complete</div><div className="flex gap-2"><Truck className="size-4 text-muted" />{[t.equipmentIn, t.equipmentOut].filter(Boolean).join(' / ') || '—'}</div>{t.delays && <div className="text-warn">Notes: {t.delays}</div>}</div>
      <div className="grid grid-cols-2 gap-2"><input data-testid="sign-name" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" className="h-11 rounded-xl bg-surface-2 px-3 text-sm" /><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title" className="h-11 rounded-xl bg-surface-2 px-3 text-sm" /></div>
      <canvas data-testid="sign-canvas" ref={c} width={600} height={200} className="w-full h-40 rounded-2xl bg-white touch-none" onPointerDown={e => { drawing.current = true; const [a, b] = pos(e); const x = c.current!.getContext('2d')!; x.beginPath(); x.moveTo(a, b) }} onPointerMove={e => { if (!drawing.current) return; const [a, b] = pos(e); const x = c.current!.getContext('2d')!; x.lineTo(a, b); x.stroke(); setInked(true) }} onPointerUp={() => { drawing.current = false }} />
      <Button variant="primary" size="lg" icon={<PenLine className="size-4" />} disabled={!inked || !name} data-testid="sign-go" onClick={sign}>Sign & approve ticket</Button>
      <div className="text-xs text-muted">By signing you approve the hours and work above. Dispute instead? Reply to the text or use your portal.</div></>}
    <div className="flex justify-center pt-4"><PoweredBy /></div>
  </div></div>
}
