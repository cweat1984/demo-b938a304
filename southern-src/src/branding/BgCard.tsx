/** Branding page card: import background photos (shrunk on the device, kept in IndexedDB), where they show, rotation and overlay. */
import { useEffect, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, Toggle, Field, Segmented } from '../components/ui'
import { useBg, listPhotos, addPhoto, deletePhoto, deleteBrandPhotos, brandKey, BG_MAX, ROTATE_OPTS, type BgPhoto, type BgWhere } from './backgrounds'
import { useBranding } from '../data/branding'
import { audit } from '../gapA/util'

export function BgCard() {
  const { s, set, bump, rev } = useBg(), company = useBranding(x => x.b.name), brand = brandKey(company) // dive3 shop M11: photos follow the customer
  const [photos, setPhotos] = useState<(BgPhoto & { url: string })[]>([]), [busy, setBusy] = useState(false)
  useEffect(() => { let made: string[] = []; listPhotos(brand).then(ps => { made = ps.map(p => URL.createObjectURL(p.blob)); setPhotos(ps.map((p, i) => ({ ...p, url: made[i] }))) }, () => setPhotos([])); return () => { setTimeout(() => made.forEach(u => URL.revokeObjectURL(u)), 60000) } }, [rev, brand])
  const onFiles = async (fs: FileList | null) => { if (!fs?.length) return; setBusy(true); let n = 0
    const room = Math.max(0, BG_MAX - photos.length), list = [...fs]; if (list.length > room) toast.warning(`${list.length - room} photo${list.length - room === 1 ? '' : 's'} skipped — up to ${BG_MAX} per customer`, { description: room ? `Added the first ${room}` : 'Remove some first' })
    for (const f of list.slice(0, room)) { try { await addPhoto(f, brand); n++ } catch (e) { toast.error((e as Error)?.message || 'Could not add that photo') } }
    setBusy(false); if (n) { bump(); if (!s.on) set({ on: true }); audit('Background photos added', 'Company branding', `${n} photo${n > 1 ? 's' : ''}`); toast.success(`${n} photo${n > 1 ? 's' : ''} added`, { description: 'Shrunk on this device and saved in this browser' }) } }
  return <Card className="flex flex-col gap-3" data-testid="bg-card">
    <div className="font-semibold">Background photos · {company}</div>
    <Toggle checked={s.on} onChange={v => { set({ on: v }); audit('Background photos', 'Company branding', v ? 'on' : 'off') }} label={<span data-testid="bg-on">Show background photos</span>} />
    <label className="btn inline-flex items-center justify-center gap-2 h-11 pointer-coarse:h-[48px] px-4 rounded-xl bg-surface-2 font-semibold text-sm cursor-pointer"><ImagePlus className="size-4" />{busy ? 'Adding…' : 'Import photos'}<input type="file" accept="image/*" multiple className="hidden" data-testid="bg-upload" onChange={e => { void onFiles(e.target.files); e.currentTarget.value = '' }} /></label>
    {photos.length > 0 && <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">{photos.map(p => <div key={p.id} className="relative rounded-xl overflow-hidden border hairline aspect-video" data-testid="bg-photo" data-w={p.w}>
      <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
      <button aria-label={`Remove ${p.name}`} data-testid="bg-photo-del" onClick={() => { void deletePhoto(p.id).then(() => { bump(); audit('Background photo removed', 'Company branding', p.name) }) }} className="absolute top-1 right-1 size-9 pointer-coarse:size-11 grid place-items-center rounded-lg bg-black/60 text-white"><Trash2 className="size-4" /></button></div>)}</div>}
    {photos.length > 0 && <button type="button" data-testid="bg-del-all" className="self-start text-sm text-bad underline min-h-11" onClick={() => { if (!confirm(`Remove all ${photos.length} photos for ${company}?`)) return; void deleteBrandPhotos(brand).then(n => { bump(); audit('Background photos removed', 'Company branding', `${n} for ${company}`); toast.success(`${n} photo${n === 1 ? '' : 's'} removed`) }) }}>Remove all photos</button>}
    <Field label="Where"><Segmented value={s.where} onChange={(v: BgWhere) => set({ where: v })} options={[{ value: 'login', label: 'Sign-in' }, { value: 'app', label: 'In the app' }, { value: 'both', label: 'Both' }]} /></Field>
    <Field label="Rotation"><select className="input text-base sm:text-sm" data-testid="bg-rotate" value={s.rotateMin} onChange={e => set({ rotateMin: Number(e.target.value) })}>{ROTATE_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}</select></Field>
    <Field label={`Overlay · ${s.overlay}% (keeps text readable)`}><input type="range" min={45} max={85} step={5} data-testid="bg-overlay" value={s.overlay} onChange={e => set({ overlay: Number(e.target.value) })} className="w-full text-[16px] accent-[var(--accent)]" /></Field>
    <div className="text-xs text-muted">Cards stay solid so text keeps its contrast. The field app and guest views don’t show photos (outdoor readability, privacy).</div>
  </Card>
}
