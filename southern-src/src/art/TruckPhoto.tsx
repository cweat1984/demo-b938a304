import type { CSSProperties } from 'react'
import type { ThemeKey, Palette } from '../data/themes'
import slh from './trucks/slh.webp'
import jen from './trucks/jen-mode.webp'
import light from './trucks/light-mode.webp'
import miami from './trucks/miami-vice.webp'
import cotton from './trucks/cotton-candy.webp'
import purple from './trucks/purple-pressure.webp'
import ivy from './trucks/ivys-poison.webp'
import artillery from './trucks/heavy-artillery.webp'
import southern from './trucks/southern-style.webp'
import customBase from './trucks/custom-base.webp'
import maskPrimary from './trucks/custom-mask-primary.webp'
import maskSecondary from './trucks/custom-mask-secondary.webp'
import maskAccent from './trucks/custom-mask-accent.webp'

/**
 * Photo-real truck per theme (960px WebP, < 80 KB each). All are transparent studio cut-outs except Light Mode, which keeps
 * its own studio backdrop as a rounded card image. Custom repaints a neutral 389 tri-drive render live:
 * primary = cab/sleeper/hood paint, secondary = frame + drive fenders, accent = pinstripes
 * (per-region alpha masks via CSS mask + multiply, so chrome, glass, tires and shadows stay untouched).
 */
const TRUCK_SRC: Record<Exclude<ThemeKey, 'custom'>, string> = { slh, jen, light, miami, cotton, purple, ivy, artillery, southern }
// Intrinsic sizes (truck-art/renders/manifest.json). Renders keep their own framing; `fit` centers them in a fixed-aspect stage.
const SIZE: Record<ThemeKey, { w: number; h: number }> = {
  slh: { w: 960, h: 323 }, jen: { w: 960, h: 465 }, light: { w: 960, h: 468 }, custom: { w: 960, h: 465 }, miami: { w: 960, h: 465 },
  cotton: { w: 960, h: 571 }, purple: { w: 960, h: 442 }, ivy: { w: 960, h: 424 }, artillery: { w: 960, h: 478 }, southern: { w: 960, h: 466 },
}
const ALT: Partial<Record<ThemeKey, string>> = {
  slh: 'Southern Lifting & Hoisting gray Liebherr all-terrain crane with Southern script on the boom',
  jen: 'Gloss-black Peterbilt 389 sleeper, tri-drive',
  light: 'Pearl white Peterbilt 389 sleeper with slate pinstripes, tri-drive',
  custom: 'Peterbilt 389 sleeper, tri-drive, painted in your custom colors',
  miami: 'Peach, cream and turquoise Peterbilt 389 sleeper, tri-drive',
  artillery: 'Olive blacked-out Peterbilt 389 day cab, tri-drive',
  cotton: 'Magenta Peterbilt 389 sleeper with turquoise frame, tri-drive',
  purple: 'Lavender-silver Peterbilt 389 sleeper with violet pinstripes, tri-drive',
  southern: 'Southern Style Peterbilt: root-beer burgundy over champagne-tan, chrome stacks, Southern Companies script on the step box',
  ivy: 'Candy royal blue 1986 Peterbilt 359 with silver tribal flames, tri-drive',
}

export default function TruckPhoto({ k, p, className, style, eager, fit }: { k: ThemeKey; p?: Palette; className?: string; style?: CSSProperties; eager?: boolean; fit?: boolean }) {
  const size = SIZE[k]
  const cls = `block select-none ${fit ? 'max-w-full max-h-full w-auto h-auto object-contain' : 'w-full h-auto'}`
  if (k === 'custom') {
    const layer = (mask: string, color: string): CSSProperties => ({ position: 'absolute', inset: 0, background: color, mixBlendMode: 'multiply', WebkitMaskImage: `url(${mask})`, maskImage: `url(${mask})`, WebkitMaskSize: '100% 100%', maskSize: '100% 100%' })
    return (
      <div className={`relative isolate select-none ${fit ? 'max-w-full max-h-full' : ''} ${className ?? ''}`} style={{ aspectRatio: `${size.w} / ${size.h}`, ...(fit ? { width: '100%' } : null), ...style }} data-truck="custom">
        <img src={customBase} alt={ALT.custom} width={size.w} height={size.h} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} className="block w-full h-auto" />
        {p && <><div aria-hidden data-paint="primary" style={layer(maskPrimary, p.primary)} /><div aria-hidden data-paint="secondary" style={layer(maskSecondary, p.secondary)} /><div aria-hidden data-paint="accent" style={layer(maskAccent, p.accent)} /></>}
      </div>
    )
  }
  return <img src={TRUCK_SRC[k]} alt={ALT[k] ?? 'Peterbilt 389 sleeper'} width={size.w} height={size.h} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false}
    className={`${cls} ${className ?? ''}`} style={style} data-truck={k} />
}
