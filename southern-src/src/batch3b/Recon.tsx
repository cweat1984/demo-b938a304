import { useEffect, useMemo, useState } from 'react'
import { Camera, ClipboardCheck, FileDown, Plus, Sparkles, Check, Smartphone, MapPin, History } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge } from '../components/ui'
import { useStore, actions } from '../data/store'
import { downloadBlob } from '../data/certshare'
import { cn } from '../lib/util'
import { useB3, deriveFromRecon, similarJobs, type Recon } from './b3store'
import { hazardPdf } from './pdf'
import { PORTAL_CUSTOMER } from '../launch2/Portal'
import type * as T from '../data/types'
import SiteMemory from './SiteMemory'

export const defaultJob = (db: T.DB) => { const c = db.customers.find(x => x.name === PORTAL_CUSTOMER); const js = db.jobs.filter(j => j.customerId === c?.id); return js.find(j => db.tickets.some(t => t.jobId === j.id) && j.status !== 'Complete') ?? js[0] ?? db.jobs[0] }
const SECTIONS: { k: string; label: string; type: 'text' | 'choice' | 'num'; opts?: string[]; ph?: string }[] = [
  { k: 'access', label: 'Access road, bridges & culverts', type: 'text', ph: 'e.g. Culvert at CR 140 washed out on the east side' },
  { k: 'turning', label: 'Turning & clearance', type: 'text', ph: 'Tight left at mile 3 — 120 ft radius' },
  { k: 'ground', label: 'Ground conditions at pad', type: 'choice', opts: ['Firm', 'Soft', 'Wet / rutted', 'Rock'] },
  { k: 'mats', label: 'Mats needed (count)', type: 'num', ph: '24' },
  { k: 'overhead', label: 'Overhead / power lines', type: 'text', ph: '34.5 kV collector line' },
  { k: 'overheadFt', label: 'Distance from swing radius (ft)', type: 'num', ph: '18' },
  { k: 'underground', label: 'Underground hazards', type: 'text', ph: 'Buried collector cable along the pad edge' },
  { k: 'pad', label: 'Crane pad & staging', type: 'text', ph: 'Pad 30 ft short of spec; laydown not cleared' },
  { k: 'gateGuard', label: 'Gate guard on site?', type: 'choice', opts: ['No', 'Yes'] },
  { k: 'gateContact', label: 'Gate guard contact', type: 'text', ph: 'Earl — (325) 555-0190' },
  { k: 'cell', label: 'Cell coverage', type: 'choice', opts: ['Good', 'Spotty', 'None'] },
  { k: 'customerNeeds', label: 'Customer needs', type: 'text', ph: 'Main bearing swap on T-14; outage window 3 days' },
]
const readFile = (f: File) => new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f) })

/** One-hand phone recon form. Used in the office page (phone frame) and standalone at ?recon=<jobId>. */
export function ReconForm({ job, onSaved }: { job: T.Job; onSaved?: (r: Recon) => void }) {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Chad Weathers'
  const site = db.sites.find(s => s.id === job.siteId)!
  const [f, setF] = useState<Record<string, string>>({ ground: 'Soft', mats: '24', overhead: '34.5 kV collector line', overheadFt: '18', gateGuard: 'Yes', gateContact: 'Earl — (325) 555-0190', cell: 'Spotty', access: 'Culvert at CR 140 washed out on the east side', underground: 'Buried collector cable along the pad edge' })
  const [photos, setPhotos] = useState<string[]>([])
  const [internal, setInternal] = useState('Customer pushed back on mat cost last time — quote mats separately.')
  return <div className="flex flex-col gap-4" data-testid="recon-form">
    <div><div className="label">Site recon · Job #{job.jobNo}</div><div className="text-xl font-semibold mt-0.5">{site.name}</div><div className="text-xs text-muted flex items-center gap-1"><MapPin className="size-3" />{site.city}, {site.state}</div></div>
    <label className="h-24 rounded-2xl border border-dashed hairline grid place-items-center cursor-pointer text-sm text-muted">{photos.length ? <div className="flex gap-1.5">{photos.map((p, i) => <img key={i} src={p} className="size-16 rounded-lg object-cover" />)}</div> : <span className="flex items-center gap-2"><Camera className="size-5" />Snap pad, road, lines</span>}<input data-testid="recon-photo" type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={async e => { const fs = [...(e.target.files ?? [])]; const d = await Promise.all(fs.map(readFile)); setPhotos([...photos, ...d]) }} /></label>
    {SECTIONS.map(s => <label key={s.k} className="block"><span className="text-xs text-muted">{s.label}</span>
      {s.type === 'choice' ? <div className="flex flex-wrap gap-1.5 mt-1.5">{s.opts!.map(o => <button type="button" key={o} data-testid={`recon-${s.k}-${o}`} onClick={() => setF({ ...f, [s.k]: o })} className={cn('h-10 px-3.5 rounded-xl text-sm border', f[s.k] === o ? 'bg-ink text-bg border-ink' : 'hairline')}>{o}</button>)}</div>
        : <input data-testid={`recon-${s.k}`} inputMode={s.type === 'num' ? 'numeric' : undefined} value={f[s.k] ?? ''} placeholder={s.ph} onChange={e => setF({ ...f, [s.k]: s.type === 'num' ? e.target.value.replace(/[^0-9.]/g, '').slice(0, 6) : e.target.value })} className="mt-1.5 w-full h-12 rounded-xl bg-surface-2 px-3.5 text-[15px] outline-none" />}</label>)}
    <label className="block"><span className="text-xs text-muted">Internal notes (never shown to the customer)</span><textarea value={internal} onChange={e => setInternal(e.target.value)} className="mt-1.5 w-full min-h-16 rounded-xl bg-surface-2 p-3 text-sm outline-none" /></label>
    <Button variant="primary" size="lg" data-testid="recon-save" onClick={() => { const d = deriveFromRecon(f, site.name); const r: Recon = { id: 'rc-' + Math.random().toString(36).slice(2, 7), jobId: job.id, siteId: site.id, by: who, at: new Date().toISOString(), status: 'Draft', f, photos, internal, ...d }; useB3.getState().saveRecon(r); toast.success(`Recon saved — ${d.hazards.length} hazards, ${d.required.length} required items`); onSaved?.(r) }}>Save recon</Button>
  </div>
}

export default function ReconPage() {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Chad Weathers'
  const recons = useB3(s => s.recons)
  const [jobId, setJobId] = useState(() => defaultJob(db)?.id)
  const job = db.jobs.find(j => j.id === jobId)!
  useEffect(() => { useB3.getState().seed(db, defaultJob(db)?.id) }, [db])
  const mine = recons.filter(r => r.jobId === jobId)
  const r = mine[0]
  const sim = useMemo(() => similarJobs(db, job), [db, job])
  const save = (p: Partial<Recon>) => r && useB3.getState().saveRecon({ ...r, ...p })
  const jobs = useMemo(() => [...db.jobs].filter(j => j.status !== 'Complete').sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 60), [db.jobs])
  const listed = jobs.some(j => j.id === job.id) ? jobs : [job, ...jobs]
  return <div className="flex flex-col gap-5" data-testid="recon-page">
    <PageHeader eyebrow="Run" title="Site recon & project setup" sub="Walk the site on your phone. Get the hazard report, the required items, and what similar jobs needed." actions={<><select data-testid="recon-job" value={jobId} onChange={e => setJobId(e.target.value)} className="h-10 rounded-xl bg-surface-2 px-3 text-sm max-w-72">{listed.map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {j.name}</option>)}</select><a href={`?recon=${jobId}`} target="_blank" className="h-10 px-3 rounded-xl bg-surface-2 text-sm inline-flex items-center gap-1.5"><Smartphone className="size-4" />Open on phone</a></>} />
    <div className="grid lg:grid-cols-[380px_1fr] gap-5 items-start">
      <div className="rounded-[36px] border-[10px] border-surface-3 bg-surface p-4 max-h-[820px] overflow-auto"><ReconForm key={jobId} job={job} /></div>
      <div className="flex flex-col gap-4">
        {!r ? <Card><div className="text-muted">No recon yet for this job. Fill the form and save.</div></Card> : <>
          <Card className="flex items-center gap-3 flex-wrap"><ClipboardCheck className="size-5 text-accent" /><div className="flex-1"><div className="font-semibold">Recon by {r.by} · {new Date(r.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div><div className="text-xs text-muted">{r.hazards.length} hazards · {r.required.length} required items · {r.photos.length} photos</div></div>
            <Badge tone={r.status === 'Approved' ? 'ok' : 'warn'}>{r.status === 'Approved' ? 'Approved · in customer portal' : 'Draft'}</Badge>
            <Button icon={<FileDown className="size-4" />} data-testid="recon-pdf" onClick={async () => { downloadBlob(await hazardPdf(db, r), `hazard-report-${job.jobNo}.pdf`); toast.success('Customer hazard report downloaded') }}>Hazard report PDF</Button>
            {r.status !== 'Approved' && <Button variant="primary" icon={<Check className="size-4" />} data-testid="recon-approve" onClick={() => { save({ status: 'Approved', approvedBy: who }); toast.success('Approved — hazard report posted to the customer portal') }}>Approve for customer</Button>}</Card>
          <Card><div className="font-semibold mb-3">Hazards & controls</div><div className="flex flex-col divide-y hairline">{r.hazards.map(h => <div key={h.id} className="py-2.5 flex gap-3 items-start text-sm" data-testid="recon-hazard"><Badge tone={h.severity === 'High' ? 'bad' : h.severity === 'Medium' ? 'warn' : 'ok'}>{h.severity}</Badge><div className="flex-1"><b>{h.kind}</b> — {h.detail}<div className="text-muted text-xs mt-0.5">{h.control} · {h.fixBy === 'Customer' ? 'customer to fix before start' : 'Southern handles'}</div></div><label className="text-xs text-muted flex items-center gap-1"><input type="checkbox" checked={h.customerVisible} onChange={e => save({ hazards: r.hazards.map(x => x.id === h.id ? { ...x, customerVisible: e.target.checked } : x) })} />Customer</label></div>)}</div></Card>
          <Card><div className="flex items-center mb-3"><div className="font-semibold flex-1">Required items</div><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} data-testid="recon-add-items" disabled={!r.required.some(x => x.status === 'Suggested')} onClick={() => { const add = r.required.filter(x => x.status === 'Suggested'); actions.updateJob(job.id, { extraEquipment: [...new Set([...job.extraEquipment, ...add.map(a => `${a.item}${a.qty > 1 ? ` ×${a.qty}` : ''}`)])] }, 'Added required items from site recon'); save({ required: r.required.map(x => ({ ...x, status: 'Added' as const })) }); toast.success(`${add.length} item(s) added to Job #${job.jobNo}`) }}>Add required items to project</Button></div>
            {r.required.map(x => <div key={x.id} className="py-1.5 flex items-center gap-3 text-sm" data-testid="recon-required"><span className="flex-1">{x.item}{x.qty > 1 && ` × ${x.qty}`} <span className="text-muted text-xs">· {x.why}</span></span><Badge tone={x.status === 'Added' ? 'ok' : 'neutral'}>{x.status === 'Added' ? 'On project' : 'Suggested'}</Badge></div>)}</Card>
        </>}
        <Card data-testid="recon-similar"><div className="font-semibold flex items-center gap-2"><Sparkles className="size-4 text-accent" />Recommended from similar past jobs</div>
          <div className="text-sm text-muted mt-1">{sim.past.length ? `${sim.past.length} past ${job.type} jobs with a similar crane class.` : `No completed ${job.type} jobs with a similar crane yet.`}</div>
          {sim.past.length > 0 && <div className="mt-3 flex flex-col gap-2 text-sm">
            <div>Typical crew: <b>{sim.avgCrew}</b> positions{sim.windDays ? ` · ${sim.windDays} wind-delay day(s) logged` : ''}</div>
            {sim.extras.length > 0 && <div className="flex flex-wrap gap-1.5">{sim.extras.map(([e, n]) => <button key={e} onClick={() => { actions.updateJob(job.id, { extraEquipment: [...new Set([...job.extraEquipment, e])] }, 'Added item recommended from similar jobs'); toast.success(`${e} added to project`) }} className={cn('rounded-full px-3 py-1 text-xs border hairline', job.extraEquipment.includes(e) && 'bg-ok/15 text-ok border-transparent')}>{job.extraEquipment.includes(e) ? '✓ ' : '+ '}{e} <span className="text-muted">({n}/{sim.past.length})</span></button>)}</div>}
            {sim.delays.length > 0 && <div className="text-xs text-muted">What went wrong: {sim.delays.join(' · ')}</div>}
            <div className="text-xs text-muted flex items-center gap-1"><History className="size-3" />{sim.past.slice(0, 3).map(j => `#${j.jobNo}`).join(', ')}</div></div>}</Card>
        <SiteMemory siteId={job.siteId} />
      </div>
    </div>
  </div>
}
