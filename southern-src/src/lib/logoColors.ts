/** Milestone 2: logo → theme. Pull the main colors out of a logo (canvas histogram), then build theme options that pass WCAG. */
import { contrast } from '../data/themes'

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
export const rgbOf = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)) as [number, number, number]
export function hsl(h: string) { const [r, g, b] = rgbOf(h).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)); let hu = 0
  if (d) hu = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: (hu * 60 + 360) % 360, s, l } }
const dist = (a: string, b: string) => { const x = rgbOf(a), y = rgbOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) }

/** Up to 6 distinct colors, most used first. Near-white / near-transparent pixels (logo backgrounds) are skipped. */
export async function extractColors(src: string, max = 6): Promise<string[]> {
  const img = new Image(); img.crossOrigin = 'anonymous'
  await new Promise<void>((ok, bad) => { img.onload = () => ok(); img.onerror = () => bad(new Error('load')); img.src = src })
  const N = 72, c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d', { willReadFrequently: true })!
  x.drawImage(img, 0, 0, N, N); const d = x.getImageData(0, 0, N, N).data
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>()
  for (let i = 0; i < d.length; i += 4) { const [r, g, b, a] = [d[i], d[i + 1], d[i + 2], d[i + 3]]; if (a < 128) continue; if (r > 240 && g > 240 && b > 240) continue
    const k = `${r >> 4},${g >> 4},${b >> 4}`; const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 }; e.n++; e.r += r; e.g += g; e.b += b; buckets.set(k, e) }
  const all = [...buckets.values()].sort((a, b) => b.n - a.n).map(e => hex(e.r / e.n, e.g / e.n, e.b / e.n))
  const out: string[] = []; for (const h of all) { if (out.every(o => dist(o, h) > 70)) out.push(h); if (out.length >= max) break }
  return out
}
/** Fetch a logo from a web address into a data URL (needs the site to allow it — many do not). */
const toDataUrl = (b: Blob) => new Promise<string>((ok, bad) => { const f = new FileReader(); f.onload = () => ok(f.result as string); f.onerror = () => bad(new Error('read')); f.readAsDataURL(b) })
export class LogoUrlError extends Error { kind: 'address' | 'blocked' | 'none' | 'http'; constructor(msg: string, kind: 'address' | 'blocked' | 'none' | 'http') { super(msg); this.kind = kind } }
/** dive3 M14: "paste their website → logo". Accepts a direct image URL, a homepage ("bobsmachinemoving.com" or https://…/),
 *  reading og:image / apple-touch-icon / icon links from the page, then the usual icon paths. Browsers only let us read
 *  another site when it allows it (CORS); when it doesn't we say so plainly and point at Upload. No proxy, nothing sent elsewhere. */
export async function logoFromUrl(raw: string): Promise<string> {
  let t = raw.trim(); if (!t) throw new LogoUrlError('Paste the company website or a logo address', 'address')
  if (!/^https?:\/\//i.test(t)) t = 'https://' + t.replace(/^\/+/, '')
  let u: URL; try { u = new URL(t) } catch { throw new LogoUrlError('That doesn’t look like a web address — e.g. bobsmachinemoving.com', 'address') }
  if (!/\./.test(u.hostname)) throw new LogoUrlError('That doesn’t look like a web address — e.g. bobsmachinemoving.com', 'address')
  const get = async (x: string) => { const r = await fetch(x, { mode: 'cors', credentials: 'omit' }); if (!r.ok) throw new LogoUrlError(`The site answered ${r.status}`, 'http'); return r }
  const img = async (x: string) => { const r = await get(x); const b = await r.blob(); if (!b.type.startsWith('image/') || b.size < 100) throw new LogoUrlError('not an image', 'none'); return toDataUrl(b) }
  let first: Response
  try { first = await get(u.href) } catch (e) { if (e instanceof LogoUrlError) throw e; throw new LogoUrlError(`${u.hostname} doesn’t let other apps read its logo (browser security). Save the logo from their site and use Upload instead.`, 'blocked') }
  const type = first.headers.get('content-type') ?? ''
  if (type.startsWith('image/')) return toDataUrl(await first.blob())
  const cands: string[] = []
  if (/html/i.test(type)) {
    const doc = new DOMParser().parseFromString(await first.text(), 'text/html'), base = new URL(doc.querySelector('base')?.getAttribute('href') ?? first.url ?? u.href, u.href)
    const add = (v?: string | null) => { if (v) try { cands.push(new URL(v, base).href) } catch { /* bad link */ } }
    add(doc.querySelector('meta[property="og:logo"]')?.getAttribute('content'))
    doc.querySelectorAll('img').forEach(im => { if (/logo/i.test((im.getAttribute('src') ?? '') + (im.getAttribute('alt') ?? '') + (im.className ?? ''))) add(im.getAttribute('src')) })
    add(doc.querySelector('link[rel~="apple-touch-icon"]')?.getAttribute('href'))
    doc.querySelectorAll('link[rel~="icon"]').forEach(l => add(l.getAttribute('href')))
    add(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'))
  }
  cands.push(new URL('/apple-touch-icon.png', u.origin).href, new URL('/favicon.png', u.origin).href, new URL('/favicon.ico', u.origin).href)
  for (const c of [...new Set(cands)].slice(0, 12)) { try { return await img(c) } catch { /* next */ } }
  throw new LogoUrlError(`Couldn’t find a logo we’re allowed to read on ${u.hostname}. Save the logo from their site and use Upload instead.`, 'none')
}
/** Darken / lighten until it reaches `need`:1 on `bg`. */
export function fit(h: string, bg: string, need: number) { let [r, g, b] = rgbOf(h); const dark = contrast('#000000', bg) > contrast('#ffffff', bg)
  for (let i = 0; i < 40 && contrast(hex(r, g, b), bg) < need; i++) { const f = dark ? 0.9 : 1.1; r = dark ? r * f : r + (255 - r) * .1; g = dark ? g * f : g + (255 - g) * .1; b = dark ? b * f : b + (255 - b) * .1 }
  return hex(r, g, b) }
export interface ThemeOption { id: string; name: string; primary: string; accent: string; secondary?: string; aa: boolean }
/** 4 options from the logo colors. Every option is nudged so primary and accent read on white (≥4.5:1 for text use) — WCAG AA. */
export function themeOptions(colors: string[]): ThemeOption[] {
  if (!colors.length) return []
  const sat = [...colors].sort((a, b) => hsl(b).s - hsl(a).s), darkest = [...colors].sort((a, b) => hsl(a).l - hsl(b).l)
  const main = colors[0], vivid = sat[0] === main ? (sat[1] ?? main) : sat[0], deep = darkest[0], third = colors.find(c => c !== main && c !== vivid)
  const mk = (id: string, name: string, p: string, a: string, s?: string): ThemeOption => { const P = fit(p, '#ffffff', 4.5), A = fit(a, '#ffffff', 3); return { id, name, primary: P, accent: A, secondary: s ? fit(s, '#ffffff', 3) : undefined, aa: contrast(P, '#ffffff') >= 4.5 && contrast(A, '#ffffff') >= 3 } }
  const opts = [mk('logo', 'From the logo', deep, vivid, third), mk('swap', 'Swapped', vivid, deep, third), mk('neutral', 'Neutral + logo accent', '#1f2937', vivid), mk('main', 'Main color', main, third ?? vivid)]
  return opts.filter((o, i) => opts.findIndex(x => x.primary === o.primary && x.accent === o.accent) === i)
}
