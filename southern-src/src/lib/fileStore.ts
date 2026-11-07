// Office fixes: real storage for vault uploads. Small files stay inline (dataUrl); big ones go to IndexedDB
// as blobs (keyed by blobId) instead of being silently dropped. Photos are downsized first.
const DB_NAME = 'sc-files', STORE = 'blobs'
export const INLINE_MAX = 1_500_000
export const FILE_MAX = 25 * 1024 * 1024

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open(DB_NAME, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
}
export async function putBlob(id: string, blob: Blob) {
  const d = await idb(); await new Promise<void>((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(blob, id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
}
export async function getBlob(id: string): Promise<Blob | undefined> {
  const d = await idb(); return new Promise((res, rej) => { const r = d.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => res(r.result as Blob | undefined); r.onerror = () => rej(r.error) })
}
const readUrl = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(b) })

/** Downsize a photo to ≤1600 px JPEG; returns the original if it isn't a decodable image. */
async function shrinkImage(f: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(f); const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
    const out = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.82)); return out && out.size < f.size ? out : f
  } catch { return f }
}

/** Store a file. Throws a plain-English error if it can't be kept. */
export async function storeFile(f: File, id: string): Promise<{ dataUrl?: string; blobId?: string; size: number; note?: string }> {
  if (f.size > FILE_MAX) throw new Error(`${f.name} is ${(f.size / 1048576).toFixed(1)} MB — the limit is ${FILE_MAX / 1048576} MB. Save it as a smaller PDF or split it.`)
  let b: Blob = f; let note: string | undefined
  if (f.type.startsWith('image/') && f.size > INLINE_MAX) { b = await shrinkImage(f); if (b !== f) note = `photo resized ${(f.size / 1048576).toFixed(1)} → ${(b.size / 1048576).toFixed(1)} MB` }
  if (b.size < INLINE_MAX) return { dataUrl: await readUrl(b), size: b.size, note }
  await putBlob(id, b); return { blobId: id, size: b.size, note: note ?? `${(b.size / 1048576).toFixed(1)} MB stored on this device` }
}
