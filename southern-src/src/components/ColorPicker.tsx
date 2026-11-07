/** Any-color picker: quick swatches, native color wheel, hex field, hue/saturation/lightness sliders (all iOS-Safari friendly),
 *  a live preview, and a WCAG check that offers a one-tap readable fix. */
import { useEffect, useState } from 'react'
import { Check, AlertTriangle, Wand2 } from 'lucide-react'
import { contrast, ensure, hexToRgb, rgbToHex } from '../data/themes'
import { cn } from '../lib/util'

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v)
export function hexToHsl(h: string): [number, number, number] {
  const [r, g, b] = hexToRgb(h).map(x => x / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2
  if (mx === mn) return [0, 0, Math.round(l * 100)]
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
  const hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(hh * 60), Math.round(s * 100), Math.round(l * 100)]
}
export function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100; const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255)
}
/** Best label color on a filled button of this color. */
export const inkOn = (c: string) => (contrast('#ffffff', c) >= contrast('#0b0b0c', c) ? '#ffffff' : '#0b0b0c')

export default function ColorPicker({ value, onChange, bg, surface, swatches, id = 'color' }: { value: string; onChange: (hex: string) => void; bg: string; surface: string; swatches: { name: string; hex: string }[]; id?: string }) {
  const [txt, setTxt] = useState(value)
  useEffect(() => setTxt(value), [value])
  const [h, s, l] = hexToHsl(isHex(value) ? value : '#d62f2f')
  const set = (hex: string) => { setTxt(hex); if (isHex(hex)) onChange(hex.toLowerCase()) }
  const ink = inkOn(value)
  const checks = [
    { l: 'Button label on your color', v: contrast(ink, value), min: 4.5 },
    { l: 'Your color as text on cards', v: contrast(value, surface), min: 4.5 },
    { l: 'Your color vs. the background', v: contrast(value, bg), min: 3 },
  ]
  const poor = checks.some(c => c.v < c.min)
  const fix = () => { const toward = contrast('#ffffff', surface) > contrast('#000000', surface) ? '#ffffff' : '#000000'; set(ensure(ensure(value, surface, 4.5, toward), bg, 3, toward)) }
  const track = (stops: string[]) => ({ background: `linear-gradient(to right, ${stops.join(',')})` })
  const slider = 'w-full h-9 appearance-none rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black/40 [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white'
  return (
    <div className="flex flex-col gap-4 max-w-2xl" data-testid={`${id}-picker-ui`}>
      <div className="flex flex-wrap gap-2" role="list" aria-label="Quick colors">{swatches.map(a => <button key={a.hex} role="listitem" title={a.name} aria-label={a.name} onClick={() => set(a.hex)} data-swatch={a.hex} className={cn('size-11 rounded-full border-2 grid place-items-center', value.toLowerCase() === a.hex.toLowerCase() ? 'border-ink' : 'border-transparent')} style={{ background: a.hex }}>{value.toLowerCase() === a.hex.toLowerCase() && <Check className="size-4" style={{ color: inkOn(a.hex) }} />}</button>)}</div>
      <div className="flex items-center gap-3">
        <label className="relative size-14 shrink-0 rounded-2xl border hairline overflow-hidden cursor-pointer" style={{ background: value }} title="Open the color wheel">
          <input type="color" value={isHex(value) ? value : '#000000'} onChange={e => set(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" data-testid={`${id}-wheel`} aria-label="Color wheel" /></label>
        <label className="flex-1"><span className="text-xs font-semibold text-muted">Hex code</span>
          <input value={txt} onChange={e => { const v = e.target.value.trim(); const hex = v.startsWith('#') ? v : '#' + v; setTxt(v); if (isHex(hex)) onChange(hex.toLowerCase()) }} maxLength={7} spellCheck={false} autoCapitalize="none" autoCorrect="off" className={cn('input !text-[16px] font-mono w-full mt-1', !isHex(txt.startsWith('#') ? txt : '#' + txt) && 'border-bad')} data-testid={`${id}-hex`} aria-label="Hex color" /></label>
      </div>
      <div className="flex flex-col gap-2.5">
        <label className="text-xs font-semibold text-muted">Hue<input type="range" min={0} max={359} value={h} onChange={e => set(hslToHex(+e.target.value, Math.max(s, 25), l))} className={slider} style={track(['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#f00'])} data-testid={`${id}-hue`} /></label>
        <label className="text-xs font-semibold text-muted">Saturation<input type="range" min={0} max={100} value={s} onChange={e => set(hslToHex(h, +e.target.value, l))} className={slider} style={track([hslToHex(h, 0, l), hslToHex(h, 100, l)])} data-testid={`${id}-sat`} /></label>
        <label className="text-xs font-semibold text-muted">Lightness<input type="range" min={5} max={95} value={l} onChange={e => set(hslToHex(h, s, +e.target.value))} className={slider} style={track([hslToHex(h, s, 5), hslToHex(h, s, 50), hslToHex(h, s, 95)])} data-testid={`${id}-light`} /></label>
      </div>
      <div className="rounded-2xl p-4 border hairline" style={{ background: bg }} data-testid={`${id}-preview`}>
        <div className="rounded-xl p-3" style={{ background: surface }}>
          <div className="text-sm font-semibold" style={{ color: value }}>Job #10125 · Plains Wind Partners</div>
          <div className="mt-2 flex gap-2"><span className="rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ background: value, color: ink }}>Dispatch</span><span className="rounded-full px-2.5 py-1 text-xs font-semibold border" style={{ borderColor: value, color: value }}>Selected</span></div>
        </div>
      </div>
      <div className="flex flex-col gap-1" data-testid={`${id}-contrast`}>{checks.map(c => <div key={c.l} className="flex items-center gap-2 text-xs"><span className="flex-1 text-muted">{c.l}</span><span className={cn('num font-semibold', c.v >= c.min ? 'text-ok' : 'text-bad')}>{c.v.toFixed(1)}:1</span>{c.v >= c.min ? <Check className="size-3.5 text-ok" /> : <AlertTriangle className="size-3.5 text-bad" />}</div>)}</div>
      {poor && <div className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-xs flex items-center gap-3" data-testid={`${id}-warn`}><AlertTriangle className="size-4 text-warn shrink-0" /><span className="flex-1">Hard to read in this theme (WCAG wants 4.5:1 for text, 3:1 for buttons). Button labels already switch to {ink === '#ffffff' ? 'white' : 'black'} automatically.</span><button onClick={fix} data-testid={`${id}-fix`} className="shrink-0 h-9 px-3 rounded-full bg-surface-2 font-semibold inline-flex items-center gap-1.5"><Wand2 className="size-3.5" />Make readable</button></div>}
    </div>
  )
}
