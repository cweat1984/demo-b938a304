import { useEffect, useMemo, useState } from 'react'
import { BookMarked, Plus, KeyRound, Phone, Route, MapPinned, BedDouble, Wind, StickyNote, Camera, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge } from '../components/ui'
import { useStore } from '../data/store'
import { cn } from '../lib/util'
import { useB3, SITE_KINDS, SITE_FORMS, type SiteKind, type SiteNote } from './b3store'
import { defaultJob } from './Recon'

const ICON: Record<SiteKind, typeof Wind> = { 'Turbine pad': Wind, Road: Route, 'Gate code': KeyRound, 'O&M contact': Phone, Laydown: MapPinned, Hotel: BedDouble, Other: StickyNote }
const age = (at: string) => { const d = Math.round((Date.now() - new Date(at).getTime()) / 864e5); return { d, label: d < 1 ? 'today' : d < 45 ? `${d}d ago` : `${Math.round(d / 30)} mo ago`, stale: d > 365 } }
const crewRoles = ['owner', 'ops', 'dispatch', 'field', 'branch', 'safety']

/** Site memory card: what earlier crews captured. Shown on every future job at this site. */
export default function SiteMemory({ siteId, compact }: { siteId: string; compact?: boolean }) {
  const notes = useB3(s => s.notes).filter(n => n.siteId === siteId)
  const role = useStore(s => s.session?.role) ?? 'owner'
  const site = useStore(s => s.db.sites.find(x => x.id === siteId))
  if (!notes.length) return compact ? null : <Card><div className="font-semibold flex items-center gap-2"><BookMarked className="size-4" />Site memory</div><div className="text-sm text-muted mt-1">Nothing captured at {site?.name} yet.</div></Card>
  return <Card data-testid="site-memory"><div className="font-semibold flex items-center gap-2"><BookMarked className="size-4 text-accent" />Site memory · {site?.name}<span className="text-xs text-muted font-normal ml-auto">{notes.length} notes from past crews</span></div>
    <div className={cn('grid gap-2 mt-3', compact ? 'sm:grid-cols-2' : 'md:grid-cols-2')}>{notes.map(n => { const I = ICON[n.kind], a = age(n.at); const hide = n.kind === 'Gate code' && !crewRoles.includes(role)
      return <div key={n.id} className="rounded-xl bg-surface-2 p-3 text-sm" data-testid="site-note"><div className="flex items-center gap-2"><I className="size-4 text-muted" /><b>{n.kind}</b>{a.stale && <Badge tone="warn">verify</Badge>}<span className="ml-auto text-[11px] text-muted">{n.by} · {a.label}</span></div>
        <div className="mt-1.5 text-[13px] leading-snug">{Object.entries(n.fields).filter(([, v]) => v).map(([k, v]) => <span key={k} className="mr-2"><span className="text-muted">{k}:</span> {hide && k === 'Code' ? <span className="inline-flex items-center gap-1 text-muted"><Lock className="size-3" />dispatched crew only</span> : v}</span>)}</div>{n.photo && <img src={n.photo} className="mt-2 h-20 rounded-lg object-cover" />}</div> })}</div></Card>
}

export function SiteForm({ siteId, onSaved }: { siteId: string; onSaved?: () => void }) {
  const who = useStore(s => s.session?.name) ?? 'Field crew'
  const [kind, setKind] = useState<SiteKind>('Turbine pad')
  const [f, setF] = useState<Record<string, string>>({})
  const [photo, setPhoto] = useState<string>()
  return <div className="flex flex-col gap-3" data-testid="site-form">
    <div className="flex flex-wrap gap-1.5">{SITE_KINDS.map(k => <button key={k} data-testid={`sf-kind-${k}`} onClick={() => { setKind(k); setF({}) }} className={cn('h-9 px-3 rounded-xl text-sm border', kind === k ? 'bg-ink text-bg border-ink' : 'hairline')}>{k}</button>)}</div>
    {SITE_FORMS[kind].map(k => <label key={k} className="block"><span className="text-xs text-muted">{k}</span><input data-testid="sf-field" value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} type={k === 'Code' ? 'password' : 'text'} className="mt-1 w-full h-11 rounded-xl bg-surface-2 px-3 outline-none" /></label>)}
    <label className="h-11 rounded-xl border border-dashed hairline flex items-center justify-center gap-2 text-sm text-muted cursor-pointer"><Camera className="size-4" />{photo ? 'Photo attached' : 'Add photo'}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={e => { const fl = e.target.files?.[0]; if (fl) { const r = new FileReader(); r.onload = () => setPhoto(r.result as string); r.readAsDataURL(fl) } }} /></label>
    <Button variant="primary" data-testid="sf-save" icon={<Plus className="size-4" />} onClick={() => { if (!Object.values(f).some(Boolean)) return toast.error('Fill at least one field'); useB3.getState().addNote({ siteId, kind, fields: f, by: who, photo } as Omit<SiteNote, 'id' | 'at'>); setF({}); setPhoto(undefined); toast.success('Saved to the site — every future job here will see it'); onSaved?.() }}>Save to site</Button>
  </div>
}

export function SiteDataPage() {
  const db = useStore(s => s.db)
  useEffect(() => { useB3.getState().seed(db, defaultJob(db)?.id) }, [db])
  const notes = useB3(s => s.notes)
  const [siteId, setSiteId] = useState(() => defaultJob(db)?.siteId ?? db.sites[0].id)
  const sites = useMemo(() => [...db.sites].sort((a, b) => (notes.filter(n => n.siteId === b.id).length - notes.filter(n => n.siteId === a.id).length) || a.name.localeCompare(b.name)), [db.sites, notes])
  const upcoming = db.jobs.filter(j => j.siteId === siteId && j.status !== 'Complete')
  return <div className="flex flex-col gap-5" data-testid="sitedata-page">
    <PageHeader eyebrow="Run" title="Site library" sub="Pads, roads, gate codes and O&M contacts — captured once, shown on every future job at the site." actions={<select data-testid="sd-site" value={siteId} onChange={e => setSiteId(e.target.value)} className="h-10 rounded-xl bg-surface-2 px-3 text-sm max-w-72">{sites.map(s => <option key={s.id} value={s.id}>{s.name} ({notes.filter(n => n.siteId === s.id).length})</option>)}</select>} />
    <div className="grid lg:grid-cols-[360px_1fr] gap-5 items-start">
      <Card><div className="font-semibold mb-3">Capture site data</div><SiteForm siteId={siteId} /></Card>
      <div className="flex flex-col gap-4"><SiteMemory siteId={siteId} />
        <Card><div className="font-semibold">Upcoming jobs at this site</div><div className="text-sm text-muted mt-1">{upcoming.length ? upcoming.map(j => `#${j.jobNo} ${j.name}`).join(' · ') : 'None scheduled'} — site memory shows on each job card.</div></Card></div>
    </div>
  </div>
}
