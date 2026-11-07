import { useMemo, useState } from 'react'
import { Search, ScanLine, FileText, ShieldAlert, HeartPulse, HardHat, Droplets, Warehouse, Download } from 'lucide-react'
import { toast } from 'sonner'
import type * as T from '../../data/types'
import { useStore } from '../../data/store'
import { byId } from '../../data/logic'
import { cn, fmtDate } from '../../lib/util'
import { Modal, Button, Segmented } from '../ui'
import { QR, Thumb, Scanner, Pill } from './kit'
import { resolveScan, sdsExpired, locPath } from '../../data/invcore'

export const GHS_ICON: Record<string, string> = { flame: '🔥', exclamation: '❗', health: '🫁', corrosion: '🧪', environment: '🐟', gas: '🫙', skull: '☠️', oxidizer: '⭕', explosive: '💥' }
const pdfHref = (s: T.Sds) => (s.pdf?.startsWith('data:') ? s.pdf : `${import.meta.env.BASE_URL}${s.pdf ?? ''}`)

/** One sheet, field-first: first aid, PPE and spill response big at the top; full PDF one tap away. */
export function SdsSheet({ sds, open, onClose }: { sds: T.Sds; open: boolean; onClose: () => void }) {
  const db = useStore(s => s.db)
  const where = db.items.filter(i => i.sdsId === sds.id)
  return <Modal open={open} onClose={onClose} title={sds.product} sub={`${sds.manufacturer} · ${sds.use}`} width={620} z={85}>
    <div className="flex flex-col gap-3" data-testid="sds-sheet">
      <div className="flex items-center gap-2 flex-wrap">
        <span className={cn('px-3 h-8 rounded-full inline-flex items-center text-sm font-bold', sds.signal === 'Danger' ? 'bg-bad-solid text-white' : sds.signal === 'Warning' ? 'bg-warn text-black' : 'bg-surface-2')}>{sds.signal === 'None' ? 'No signal word' : sds.signal.toUpperCase()}</span>
        {(sds.pictograms ?? []).map(p => <span key={p} title={p} className="size-9 grid place-items-center rotate-45 border-2 border-bad bg-white rounded-md"><span className="-rotate-45 text-lg">{GHS_ICON[p]}</span></span>)}
        <div className="flex-1" />{sdsExpired(sds) && <Pill tone="bad">Older than 3 years</Pill>}<span className="text-xs text-muted">rev {fmtDate(sds.revised)}</span>
      </div>
      <Big icon={<HeartPulse className="size-6" />} tone="bad" title="First aid">{sds.firstAid}</Big>
      <Big icon={<HardHat className="size-6" />} tone="warn" title="PPE required">{sds.ppe.join(' · ')}</Big>
      <Big icon={<Droplets className="size-6" />} tone="info" title="Spill / leak">{sds.spill ?? 'Contain with the spill kit; keep out of drains.'}</Big>
      <div className="card p-4"><div className="label mb-1 flex items-center gap-1"><ShieldAlert className="size-4" />Hazards</div><ul className="text-sm list-disc pl-5">{sds.hazards.map(h => <li key={h}>{h}</li>)}</ul></div>
      <div className="card p-4 text-sm flex gap-3 items-center"><Warehouse className="size-5 text-muted" /><span className="flex-1">{sds.storage ?? '—'}{where.length > 0 && <span className="block text-xs text-muted">{where.map(i => locPath(db, i).join(' › ')).slice(0, 2).join(' · ')}</span>}</span><QR value={`SDS:${sds.id}`} size={56} /></div>
      <a href={pdfHref(sds)} target="_blank" rel="noreferrer" download={sds.pdfName} className="btn inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-surface-2 font-semibold" data-testid="sds-pdf"><FileText className="size-5" />Open full SDS (PDF)<Download className="size-4 opacity-60" /></a>
    </div>
  </Modal>
}
function Big({ icon, title, children, tone }: { icon: React.ReactNode; title: string; children: React.ReactNode; tone: 'bad' | 'warn' | 'info' }) {
  return <div className={cn('rounded-2xl p-4 border-l-4', tone === 'bad' ? 'border-bad bg-bad/10' : tone === 'warn' ? 'border-warn bg-warn/10' : 'border-info bg-info/10')}><div className="flex items-center gap-2 font-bold text-base mb-1">{icon}{title}</div><div className="text-[17px] leading-snug">{children}</div></div>
}

/** HazCom / right-to-know binder: searchable library, per-location chemical list, missing/expired flags, scan to open. */
export function SdsLibrary({ field = false, mine }: { field?: boolean; mine?: string[] }) {
  const db = useStore(s => s.db)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<T.Sds | null>(null)
  const [scan, setScan] = useState(false)
  const [view, setView] = useState<'sheets' | 'chemicals'>('sheets')
  const [branch, setBranch] = useState('br-okc')
  const chems = db.items.filter(i => i.chemical && (i.branchId ?? 'br-okc') === branch)
  const missing = chems.filter(i => !byId(db.sds, i.sdsId))
  const expired = db.sds.filter(sdsExpired)
  const sheets = useMemo(() => { const t = q.trim().toLowerCase(); return db.sds.filter(s => !t || `${s.product} ${s.manufacturer} ${s.use}`.toLowerCase().includes(t)).sort((a, b) => a.product.localeCompare(b.product)) }, [db.sds, q])
  const mineSheets = (mine ?? []).map(id => byId(db.sds, id)).filter(Boolean) as T.Sds[]
  const onScan = (code: string) => {
    setScan(false); const c = code.trim().toUpperCase()
    if (c.startsWith('SDS:')) { const s = byId(db.sds, code.trim().slice(4)); if (s) { setOpen(s); return } }
    const h = resolveScan(db, code)
    const it = h.kind === 'item' ? h.item : h.kind === 'bin' ? h.items.find(i => i.sdsId) : undefined
    const s = it && byId(db.sds, it.sdsId)
    if (s) setOpen(s); else toast.error(it ? 'No SDS on file for that item — tell Safety' : 'No chemical found for that code')
  }
  const Row = ({ s }: { s: T.Sds }) => <button onClick={() => setOpen(s)} className={cn('w-full flex items-center gap-3 text-left press', field ? 'rounded-3xl bg-surface p-4' : 'px-5 py-3 border-b hairline last:border-0 hover:bg-surface-2')} data-testid="sds-row">
    <span className={cn('size-11 rounded-2xl grid place-items-center text-lg shrink-0', s.signal === 'Danger' ? 'bg-bad/15' : s.signal === 'Warning' ? 'bg-warn/15' : 'bg-surface-2')}>{(s.pictograms ?? [])[0] ? GHS_ICON[s.pictograms![0]] : '📄'}</span>
    <span className="flex-1 min-w-0"><span className={cn('block font-semibold truncate', field && 'text-lg')}>{s.product}</span><span className="block text-xs text-muted truncate">{s.manufacturer} · {s.use}</span></span>
    {sdsExpired(s) ? <Pill tone="bad">Expired</Pill> : <span className={cn('text-xs font-bold', s.signal === 'Danger' ? 'text-bad' : s.signal === 'Warning' ? 'text-warn' : 'text-muted')}>{s.signal === 'None' ? '' : s.signal}</span>}
  </button>
  return <div className="flex flex-col gap-4" data-testid="sds-library">
    <div className="flex gap-2">
      <div className={cn('flex items-center gap-2 px-4 rounded-2xl bg-surface-2 flex-1', field ? 'h-14' : 'h-11')}><Search className="size-5 text-muted" /><input className={cn('flex-1 bg-transparent outline-none', field && 'text-lg')} placeholder="Search product name" value={q} onChange={e => setQ(e.target.value)} data-testid="sds-search" /></div>
      <Button variant="primary" size={field ? 'xl' : 'md'} icon={<ScanLine className="size-5" />} onClick={() => setScan(true)} data-testid="sds-scan">Scan</Button>
    </div>
    {!field && <div className="flex flex-wrap items-center gap-3">
      <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'sheets', label: `SDS library (${db.sds.length})` }, { value: 'chemicals', label: 'Chemical inventory by location' }]} />
      <select className="input w-auto h-9" value={branch} onChange={e => setBranch(e.target.value)}>{db.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      {missing.length > 0 && <Pill tone="bad">{missing.length} chemical{missing.length === 1 ? '' : 's'} missing SDS</Pill>}{expired.length > 0 && <Pill tone="warn">{expired.length} SDS older than 3 yrs</Pill>}
    </div>}
    {field && mineSheets.length > 0 && !q && <div><div className="label mb-2">Chemicals on my job & truck</div><div className="flex flex-col gap-2" data-testid="sds-mine">{mineSheets.map(s => <Row key={s.id} s={s} />)}</div></div>}
    {(field || view === 'sheets') && <div>{field && <div className="label mb-2">{q ? 'Results' : 'All safety sheets'}</div>}<div className={cn(field ? 'flex flex-col gap-2' : 'card p-0 overflow-hidden')}>{sheets.map(s => <Row key={s.id} s={s} />)}</div>{q && !sheets.length && <div data-testid="sds-none" className="card p-4 text-sm text-muted">No safety sheet matches “{q}”. Check the spelling or try the product or maker name (e.g. “diesel”, “WD-40”).</div>}</div>}
    {!field && view === 'chemicals' && <div className="card p-0 overflow-hidden" data-testid="chem-list">{[...new Set(chems.map(i => i.loc?.building ?? 'Shop'))].map(b => <div key={b}><div className="px-5 py-2 bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">{b}</div>{chems.filter(i => (i.loc?.building ?? 'Shop') === b).map(i => { const s = byId(db.sds, i.sdsId); return <div key={i.id} className="flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0 text-sm"><Thumb item={i} size={34} /><span className="flex-1 min-w-0"><span className="block font-medium truncate">{i.name}</span><span className="text-xs text-muted">{i.bin} · {i.onHand} {i.unit}</span></span>{s ? <button onClick={() => setOpen(s)} className="text-accent text-xs font-semibold">SDS{sdsExpired(s) ? ' (expired)' : ''}</button> : <Pill tone="bad">SDS missing</Pill>}</div> })}</div>)}</div>}
    {open && <SdsSheet sds={open} open onClose={() => setOpen(null)} />}
    <Scanner open={scan} onClose={() => setScan(false)} onCode={onScan} title="Scan a container or bin" hint="Opens its Safety Data Sheet" />
  </div>
}
