import { useLayoutEffect, useRef, useState } from 'react'
import { VENDOR_BRAND } from '../data/brand'
import { cn } from '../lib/util'

/** Small "Powered by [mark] ARROWLINE" credit. It can never be hidden by a theme or color choice: it measures the real
 *  background behind it (and any ancestor opacity) and picks white or navy ink with ≥ 4.5:1 contrast. If neither reaches
 *  4.5:1 (e.g. a mid-gray custom theme) or an ancestor fades it, it draws on its own navy chip. Inline styles keep it visible.
 *  `tone` is only the first-paint guess (e.g. splash/login). */
const NAVY = '#0f2d52', WHITE = '#ffffff', MIN = 4.5
type Ink = { fg: 'white' | 'navy'; chip: boolean }
let cx: CanvasRenderingContext2D | null | undefined
const rgba = (c: string): [number, number, number, number] => {
  if (cx === undefined) { try { const cv = document.createElement('canvas'); cv.width = cv.height = 1; cx = cv.getContext('2d', { willReadFrequently: true }) } catch { cx = null } }
  if (!cx) return [0, 0, 0, 0]
  cx.clearRect(0, 0, 1, 1); cx.fillStyle = 'rgba(0,0,0,0)'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]
}
const lum = ([r, g, b]: number[]) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
export const contrastRatio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
/** Composited background color behind an element, plus the product of ancestor opacities. */
export function backdropOf(el: Element): { bg: number[]; opacity: number } {
  const layers: number[][] = []; let e: Element | null = el, op = 1
  for (let n = el.parentElement; n; n = n.parentElement) op *= parseFloat(getComputedStyle(n).opacity || '1')
  while (e) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break } e = e.parentElement }
  let acc = e ? [255, 255, 255] : rgba(getComputedStyle(document.body).backgroundColor).slice(0, 3)
  if (!e && rgba(getComputedStyle(document.body).backgroundColor)[3] === 0) acc = [255, 255, 255]
  for (const l of layers.reverse()) acc = [0, 1, 2].map(i => l[i] * l[3] + acc[i] * (1 - l[3]))
  return { bg: acc, opacity: op }
}
function pickInk(el: Element): Ink {
  const { bg, opacity } = backdropOf(el.parentElement ?? el) // measure what's BEHIND the credit (its own chip must not count)
  const w = contrastRatio([255, 255, 255], bg), n = contrastRatio([15, 45, 82], bg)
  const fg = w >= n ? 'white' : 'navy'
  return { fg, chip: Math.max(w, n) < MIN || opacity < 0.99 }
}

export function PoweredBy({ size = 14, tone, className }: { size?: number; tone?: 'dark' | 'light'; className?: string }) {
  const v = VENDOR_BRAND
  const ref = useRef<HTMLSpanElement>(null)
  const [ink, setInk] = useState<Ink>({ fg: tone === 'light' ? 'navy' : 'white', chip: false })
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return
    const run = () => { if (!el.isConnected) return; const n = pickInk(el); setInk(p => (p.fg === n.fg && p.chip === n.chip ? p : n)) }
    run()
    const mo = new MutationObserver(run); mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] })
    const t = window.setInterval(run, 1500) // also catches a parent sheet/card changing color
    return () => { mo.disconnect(); clearInterval(t) }
  }, [])
  const white = ink.chip || ink.fg === 'white', color = white ? WHITE : NAVY
  const w = Math.round(size * v.logo.aspect)
  return (
    <span ref={ref} data-testid="powered-by" data-ink={ink.chip ? 'chip' : ink.fg} aria-label={v.poweredBy} title={v.poweredBy}
      className={cn('inline-flex items-center gap-1.5 text-[10px] leading-none select-none', className)}
      style={{ color, opacity: 1, visibility: 'visible', display: 'inline-flex', filter: 'none', ...(ink.chip ? { background: NAVY, padding: '4px 9px', borderRadius: 999 } : {}) }}>
      <span className="tracking-wide" style={{ color }}>Powered by</span>
      <img src={white ? v.logo.onDark : v.logo.onLight} alt="" aria-hidden width={w} height={size} style={{ width: w, height: size, opacity: 1, display: 'inline' }} />
      <span className="font-[450] tracking-[.32em]" style={{ fontFamily: v.font, fontSize: size * 0.78, color }}>{v.wordmark}</span>
    </span>
  )
}
