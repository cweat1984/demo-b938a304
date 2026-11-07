import { useEffect, useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { Search, FileText, Image as ImageIcon, Map as MapIcon, FileCheck2, Receipt, Upload, PenTool, Award } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { byId, customerOf, inScope, fullName } from '../data/logic'
import { cn, fmtDate, today, uid } from '../lib/util'
import { PageHeader, Badge, Button, Empty, Modal, Field } from '../components/ui'
import Linkify from '../components/Linkify'
import JobPicker from '../components/JobPicker'
import { storeFile, getBlob, FILE_MAX } from '../lib/fileStore'

type Kind = T.Job['docs'][number]['kind'] | 'Certification' | 'Company'
const COMPANY_KINDS = ['Insurance / COI', 'W-9', 'MSA / Contract', 'Policy', 'Other'] as const
const ICON: Record<string, typeof FileText> = { 'Lift Plan': FileCheck2, Permit: FileText, 'Site Map': MapIcon, Photo: ImageIcon, 'Customer PO': Receipt, Drawing: PenTool, Ticket: FileText, Certification: Award }
interface Doc { id: string; name: string; kind: Kind; added: string; by: string; jobId?: string; empId?: string; dataUrl?: string; blobId?: string; sub?: string }

/** One vault for every lift plan, permit, PO, photo and cert — searchable from anywhere, attached to the record it belongs to. */
export default function Vault() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const [q, setQ] = useKeep('vault:q', ''), [kind, setKind] = useKeep<Kind | 'All'>('vault:kind', 'All')
  const [up, setUp] = useState(false)
  const [preview, setPreview] = useState<Doc | null>(null)
  const docs = useMemo<Doc[]>(() => {
    const out: Doc[] = []
    ;(db.companyDocs ?? []).forEach(d => out.push({ ...d, kind: 'Company', sub: d.kind }))
    db.jobs.filter(j => inScope(j, f)).forEach(j => j.docs.forEach(d => out.push({ ...d, jobId: j.id })))
    db.certs.filter(c => { const e = byId(db.employees, c.employeeId); return e && inScope(e, f) }).slice(0, 120).forEach(c => out.push({ id: c.id, name: `${c.type} — ${c.credentialNo}.pdf`, kind: "Certification", added: c.issued ?? today(), by: c.provider, empId: c.employeeId }))
    db.tickets.filter(t => t.photos > 0).forEach(t => { const j = byId(db.jobs, t.jobId); if (!j || !inScope(j, f)) return; for (let i = 0; i < Math.min(3, t.photos); i++) out.push({ id: `${t.id}-ph${i}`, name: `#${j.jobNo} ${t.date.slice(5)} — field photo ${i + 1}.jpg`, kind: 'Photo', added: t.date, by: (() => { const e = byId(db.employees, t.supervisorId); return e ? fullName(e) : 'Field crew' })(), jobId: j.id }) })
    const rank = (d: Doc) => (d.kind === 'Certification' ? 1 : 0)
    return out.sort((a, b) => rank(a) - rank(b) || b.added.localeCompare(a.added))
  }, [db, f])
  const kinds = ['All', ...Array.from(new Set(docs.map(d => d.kind)))] as (Kind | 'All')[]
  const list = docs.filter(d => (kind === 'All' || d.kind === kind) && (!q || `${d.name} ${d.kind} ${d.jobId ? '#' + byId(db.jobs, d.jobId)?.jobNo + ' ' + customerOf(db, byId(db.jobs, d.jobId)!).name : ''} ${d.empId ? fullName(byId(db.employees, d.empId)!) : ''}`.toLowerCase().includes(q.toLowerCase())))
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow="Document & photo vault" title="Documents" sub={`${docs.length} files · lift plans, permits, POs, site maps, photos and certs — each attached to its job or person`} actions={<Button variant="primary" icon={<Upload className="size-4" />} onClick={() => setUp(true)} data-testid="vault-upload">Upload</Button>} />
      <div className="flex gap-2 items-center mb-3"><div className="relative flex-1 sm:flex-none sm:w-96"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Job #, customer, person, file name" value={q} onChange={e => setQ(e.target.value)} data-testid="vault-search" /></div></div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">{kinds.map(k => <button key={k} onClick={() => setKind(k)} className={cn('shrink-0 rounded-full px-3.5 h-9 text-sm font-semibold border transition', kind === k ? 'bg-surface-3 border-accent text-ink' : 'border-line text-muted hover:text-ink')}>{k === 'All' ? 'All' : k} <span className="num text-xs opacity-70">{k === 'All' ? docs.length : docs.filter(d => d.kind === k).length}</span></button>)}</div>
      {list.length ? <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{list.slice(0, 120).map(d => { const Icon = ICON[d.kind] ?? FileText; const j = d.jobId ? byId(db.jobs, d.jobId) : undefined; const e = d.empId ? byId(db.employees, d.empId) : undefined; return (
        <div key={d.id} className="card p-4 flex gap-3 items-start" data-testid="vault-doc">
          <button onClick={() => setPreview(d)} aria-label={`Preview ${d.name}`} className={cn('grid size-12 shrink-0 place-items-center rounded-xl overflow-hidden', d.kind === 'Photo' ? 'bg-accent/15 text-accent' : 'bg-surface-2')}>{d.dataUrl && d.kind === 'Photo' ? <img src={d.dataUrl} alt="" className="size-full object-cover" /> : <Icon className="size-5" />}</button>
          <div className="min-w-0 flex-1">
            <button onClick={() => setPreview(d)} className="ref-link text-left font-semibold text-sm truncate block max-w-full">{d.name}</button>
            <div className="text-xs text-muted mt-0.5">{d.kind}{d.sub ? ` · ${d.sub}` : ''} · {fmtDate(d.added)} · <Linkify text={d.by} /></div>
            <div className="text-xs mt-1">{j && <button className="ref-link" onClick={() => open({ type: 'job', id: j.id })}>#{j.jobNo} · {customerOf(db, j).name}</button>}{e && <button className="ref-link" onClick={() => open({ type: 'employee', id: e.id })}>{fullName(e)}</button>}</div>
          </div>
        </div>) })}</div> : <Empty title="No files match" />}
      {list.length > 120 && <div className="text-sm text-muted mt-3">Showing 120 of {list.length} — search to narrow.</div>}
      {preview && <Modal open onClose={() => setPreview(null)} title={preview.name} sub={`${preview.kind} · added ${fmtDate(preview.added)} by ${preview.by}`} width={620}>
        {preview.blobId ? <BlobLink id={preview.blobId} name={preview.name} /> : preview.dataUrl ? (preview.dataUrl.startsWith('data:image') ? <img src={preview.dataUrl} alt="" className="rounded-xl w-full" /> : <a className="ref-link" href={preview.dataUrl} download={preview.name}>Download file</a>) : <div className="rounded-2xl bg-surface-2 p-8 text-center text-sm text-muted"><FileText className="size-10 mx-auto mb-3 opacity-60" />Demo file — the real PDF lives here once storage is connected.</div>}
        <div className="flex gap-2 mt-4">{preview.jobId && <Button onClick={() => { open({ type: 'job', id: preview.jobId! }); setPreview(null) }}>Open job</Button>}{preview.empId && <Button onClick={() => { open({ type: 'employee', id: preview.empId! }); setPreview(null) }}>Open person</Button>}<Badge>Version history · 1 rev</Badge></div>
      </Modal>}
      {up && <UploadDoc onClose={() => setUp(false)} />}
    </div>
  )
}

function UploadDoc({ onClose }: { onClose: () => void }) {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const [jobId, setJob] = useState(''), [kind, setKind] = useState<T.Job['docs'][number]['kind']>('Permit'), [file, setFile] = useState<File | null>(null)
  const [scope, setScope] = useState<'job' | 'company'>('job'), [ckind, setCkind] = useState<string>(COMPANY_KINDS[0]), [busy, setBusy] = useState(false)
  const jobs = db.jobs.filter(j => inScope(j, f) && !j.closedOut).sort((a, b) => b.jobNo.localeCompare(a.jobNo))
  const tooBig = !!file && file.size > FILE_MAX
  const save = async () => {
    const j = byId(db.jobs, jobId); if ((scope === 'job' && !j) || !file) return
    setBusy(true)
    try {
      const id = uid('doc'); const s = await storeFile(file, id); const by = useStore.getState().session?.name ?? 'Office'
      const doc = { id, name: file.name, added: today(), by, dataUrl: s.dataUrl, blobId: s.blobId, size: s.size }
      if (scope === 'company') { actions.addCompanyDoc({ ...doc, kind: ckind }); toast.success(`${file.name} filed to company documents`, { description: s.note }) }
      else { const jj = byId(useStore.getState().db.jobs, j!.id)!; actions.updateJob(jj.id, { docs: [...jj.docs, { ...doc, kind }] }, 'Uploaded document'); toast.success(`${file.name} filed to #${jj.jobNo}`, { description: `Crew sees it in the field app${s.note ? ` · ${s.note}` : ''}` }) }
      onClose()
    } catch (e) { toast.error('File not saved', { description: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title="Upload to the vault" width={480}>
      <div className="flex flex-col gap-3">
        <Field label="File to"><select className="input" data-testid="vault-scope" value={scope} onChange={e => setScope(e.target.value as 'job' | 'company')}><option value="job">A job</option><option value="company">Company (not tied to a job)</option></select></Field>
        {scope === 'job' ? <><Field label="Job"><JobPicker value={jobId} jobs={jobs} onPick={setJob} placeholder="Pick a job…" /></Field>
        <Field label="Type"><select className="input" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>{['Lift Plan', 'Permit', 'Site Map', 'Photo', 'Customer PO', 'Drawing'].map(k => <option key={k}>{k}</option>)}</select></Field></>
        : <Field label="Type"><select className="input" data-testid="vault-ckind" value={ckind} onChange={e => setCkind(e.target.value)}>{COMPANY_KINDS.map(k => <option key={k}>{k}</option>)}</select></Field>}
        <Field label="File"><input type="file" className="input" accept="image/*,.pdf,.doc,.docx,.xlsx" capture={kind === 'Photo' ? 'environment' : undefined} onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
        {tooBig && <div className="text-xs text-bad" data-testid="vault-toobig">{file!.name} is {(file!.size / 1048576).toFixed(1)} MB — the limit is {FILE_MAX / 1048576} MB.</div>}
        <Button variant="primary" data-testid="vault-save" disabled={(scope === 'job' && !jobId) || !file || tooBig || busy} onClick={save}>{busy ? 'Saving…' : 'File it'}</Button>
      </div>
    </Modal>
  )
}

/** Big uploads live in IndexedDB on this device; load on demand for download / image preview. */
function BlobLink({ id, name }: { id: string; name: string }) {
  const [url, setUrl] = useState<string | null>(null), [err, setErr] = useState(false), [img, setImg] = useState(false)
  useEffect(() => { let u = ''; getBlob(id).then(b => { if (!b) { setErr(true); return } u = URL.createObjectURL(b); setImg(b.type.startsWith('image/')); setUrl(u) }).catch(() => setErr(true)); return () => { if (u) URL.revokeObjectURL(u) } }, [id])
  if (err) return <div className="text-sm text-bad">File not found on this device.</div>
  if (!url) return <div className="text-sm text-muted">Loading…</div>
  return img ? <img src={url} alt="" className="rounded-xl w-full" /> : <a className="ref-link" href={url} download={name} data-testid="vault-download">Download file</a>
}
