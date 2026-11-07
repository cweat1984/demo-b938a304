/** Shrink any picked image (10 MB phone photo, big PNG) on the device before saving — no "must be under 400 KB" dead end.
 *  SVG is kept as-is when small. Returns a data URL. */
export async function downscaleImage(file: File, max = 512, type: 'image/png' | 'image/jpeg' | 'image/webp' = 'image/png', quality = 0.85): Promise<string> {
  const read = () => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsDataURL(file) })
  if (file.type === 'image/svg+xml' && file.size < 300_000) return read()
  const src = await read()
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Not an image we can read')); i.src = src })
  const k = Math.min(1, max / Math.max(img.naturalWidth || 1, img.naturalHeight || 1))
  if (k === 1 && file.size < 400_000 && file.type === type) return src
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k))
  const ctx = c.getContext('2d'); if (!ctx) return src
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL(type, quality)
}
