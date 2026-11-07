// Field fixes: phone photos are shrunk on the device (≤1600 px JPEG q0.7) and kept as blobs in IndexedDB
// via lib/fileStore. Stores keep only a short ref ("idb:<id>") so localStorage never fills up.
import { useEffect, useState } from 'react'
import { putBlob, getBlob } from './fileStore'

export const PHOTO_MAX = 1600
export async function compressPhoto(f: Blob, max = PHOTO_MAX, q = 0.7): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f); const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', q)); return out && out.size < f.size ? out : f
  } catch { return f }
}
let n = 0
/** Compress + store one photo; returns a ref to keep in a record. Throws a plain-English error. */
export async function savePhoto(f: File, prefix = 'ph'): Promise<string> {
  const b = await compressPhoto(f); const id = `${prefix}-${Date.now().toString(36)}-${(n++).toString(36)}`
  try { await putBlob(id, b) } catch {
    // some WebKit builds can't put a Blob in IndexedDB — store the bytes instead
    try { await putBlob(id, { type: b.type || 'image/jpeg', buf: await b.arrayBuffer() } as unknown as Blob) } catch { throw new Error('Couldn’t save the photo on this phone — storage is full. Free up space and try again.') }
  }
  return 'idb:' + id
}
export async function savePhotos(files: FileList | File[] | null | undefined, prefix?: string, limit = 6): Promise<string[]> {
  const out: string[] = []; for (const f of [...(files ?? [])].slice(0, limit)) out.push(await savePhoto(f, prefix)); return out
}
/** Resolve a ref ("idb:…", "data:…", or a URL) to something an <img> can show. */
export function usePhotoUrl(ref?: string) {
  const [url, setUrl] = useState<string | undefined>(ref && !ref.startsWith('idb:') ? ref : undefined)
  useEffect(() => {
    if (!ref || !ref.startsWith('idb:')) { setUrl(ref); return }
    let u: string | undefined, live = true
    getBlob(ref.slice(4)).then(r => { const x = r as unknown as { buf?: ArrayBuffer; type?: string } | undefined; const b = x && x.buf ? new Blob([x.buf], { type: x.type }) : r; if (b && live) { u = URL.createObjectURL(b); setUrl(u) } }).catch(() => {})
    return () => { live = false; if (u) URL.revokeObjectURL(u) }
  }, [ref])
  return url
}
export function PhotoThumb({ src, className = 'size-12 rounded-lg object-cover bg-surface-2', alt = '' }: { src: string; className?: string; alt?: string }) {
  const url = usePhotoUrl(src)
  return url ? <img src={url} className={className} alt={alt} data-testid="photo-thumb" /> : <span className={className + ' inline-block'} data-testid="photo-thumb" />
}
