/** Milestone 2b: the customer company's background photos. Photos are shrunk on the device (≤1920 px JPEG) and kept in
 *  IndexedDB ('sc-backgrounds'); settings (on/off, where, rotation, overlay) in localStorage. Guests never write here. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

const DB = 'sc-backgrounds', ST = 'photos'
export interface BgPhoto { id: string; name: string; added: string; w: number; h: number; blob: Blob; /** dive3 shop M11: whose photos (brand key) */ brand?: string }
/** dive3 shop M11: photos belong to one customer brand; untagged (older) photos belong to the Southern default. */
export const brandKey = (name?: string) => (name || 'Southern Lifting & Hoisting').toLowerCase().replace(/\(fictional\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
export const BG_MAX = 12
function idb(): Promise<IDBDatabase> { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) }) }
const tx = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T> | void) => { const d = await idb(); return new Promise<T>((res, rej) => { const t = d.transaction(ST, mode); const r = f(t.objectStore(ST)); t.oncomplete = () => res(r ? (r as IDBRequest<T>).result : (undefined as T)); t.onerror = t.onabort = () => rej(t.error ?? new Error('Could not save in this browser’s storage')) }) }
/** Stored as bytes (ArrayBuffer) — some Safari/WebKit builds refuse Blobs in IndexedDB. */
type Stored = Omit<BgPhoto, 'blob'> & { bytes?: ArrayBuffer; type?: string; blob?: Blob }
export const listPhotos = (brand?: string) => tx<Stored[]>('readonly', s => s.getAll()).then(a => (a ?? []).filter(r => brand == null || (r.brand ?? brandKey()) === brand).map(r => ({ id: r.id, name: r.name, added: r.added, w: r.w, h: r.h, brand: r.brand ?? brandKey(), blob: r.blob ?? new Blob([r.bytes!], { type: r.type || 'image/jpeg' }) }) as BgPhoto).sort((x, y) => x.added.localeCompare(y.added)))
export const deletePhoto = (id: string) => tx('readwrite', s => { s.delete(id) })
export const deleteBrandPhotos = async (brand: string) => { const ps = await listPhotos(brand); for (const p of ps) await deletePhoto(p.id); return ps.length }
export async function addPhoto(f: File, brand = brandKey()): Promise<BgPhoto> {
  const bmp = await createImageBitmap(f).catch(() => { throw new Error('That file isn’t a photo we can read — try JPG, PNG or HEIC exported as JPG') })
  const k = Math.min(1, 1920 / Math.max(bmp.width, bmp.height)); const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const blob = await new Promise<Blob>((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Could not shrink the photo')), 'image/jpeg', 0.82))
  const p: BgPhoto = { id: 'bg-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: f.name.slice(0, 60), added: new Date().toISOString(), w: c.width, h: c.height, blob, brand }
  const rec: Stored = { id: p.id, name: p.name, added: p.added, w: p.w, h: p.h, brand, bytes: await blob.arrayBuffer(), type: blob.type }
  await tx('readwrite', s => { s.put(rec) }); return p
}
export type BgWhere = 'login' | 'app' | 'both'
export interface BgSettings { on: boolean; where: BgWhere; rotateMin: number; overlay: number }
export const BG_DEFAULTS: BgSettings = { on: false, where: 'both', rotateMin: 0, overlay: 55 }
export const ROTATE_OPTS = [{ v: 0, label: 'New photo each sign-in' }, { v: 1, label: 'Every minute' }, { v: 5, label: 'Every 5 min' }, { v: 30, label: 'Every 30 min' }, { v: 1440, label: 'Once a day' }]
export const useBg = create<{ s: BgSettings; rev: number; set: (p: Partial<BgSettings>) => void; bump: () => void }>()(persist(set => ({
  s: BG_DEFAULTS, rev: 0, set: p => set(x => ({ s: { ...x.s, ...p } })), bump: () => set(x => ({ rev: x.rev + 1 })),
}), { name: 'sc-bg-v1', partialize: x => ({ s: x.s }) as never, merge: (saved, cur) => { const s = (saved as { s?: Partial<BgSettings> })?.s; if (!s || typeof s !== 'object') return cur
  const ov = Number(s.overlay); return { ...cur, s: { on: !!s.on, where: (['login', 'app', 'both'] as const).includes(s.where as BgWhere) ? s.where as BgWhere : 'both', rotateMin: ROTATE_OPTS.some(o => o.v === s.rotateMin) ? s.rotateMin! : 0, overlay: Number.isFinite(ov) ? Math.max(45, Math.min(85, ov)) : 55 } } } }))
/** Which photo shows now: by the clock for timed rotation, else one random pick per sign-in (sessionStorage). */
export function pickIndex(n: number, rotateMin: number, now = Date.now()) {
  if (!n) return -1
  if (rotateMin > 0) return Math.floor(now / (rotateMin * 60000)) % n
  const k = 'sc-bg-pick'; let v = Number(sessionStorage.getItem(k)); if (!Number.isFinite(v) || sessionStorage.getItem(k) == null) { v = Math.floor(Math.random() * 1e6); sessionStorage.setItem(k, String(v)) }
  return v % n
}
