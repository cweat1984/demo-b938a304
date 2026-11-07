import { useMemo, useState } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { useStore } from '../data/store'
import { THEMES, LIGHT_ACCENTS, knownTheme, tokens, resolvePalette, contrast, type ThemeKey, type Mode, type Palette } from '../data/themes'
import { cn } from '../lib/util'
import TruckPhoto from '../art/TruckPhoto'
import ColorPicker from './ColorPicker'
import { userKey } from '../nav/prefs'
import { useBranding, brandPalette } from '../data/branding'
import { toast } from 'sonner'

/** Theme swatch: the theme's photo-real Peterbilt 389 (transparent WebP, lazy-loaded) parked on the theme's background. */
export function TruckSwatch({ p, k, className }: { p: Palette; k?: ThemeKey; className?: string }) {
  const t = tokens(p)
  return (
    <div className={cn('overflow-hidden px-2 pt-3 pb-1', className)} style={{ background: `radial-gradient(130% 85% at 50% 0%, ${t.surface3}, ${t.bg} 72%)` }}>
      <div className="aspect-[2/1] flex items-center justify-center">
        <TruckPhoto k={k ?? 'custom'} p={p} fit />
      </div>
    </div>
  )
}

export default function ThemePicker({ compact }: { compact?: boolean }) {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const current = prefs.theme === 'system' || !knownTheme(prefs.theme) ? 'slh' : prefs.theme
  const def = THEMES.find(t => t.key === current)!
  const pick = (k: ThemeKey) => { const d = THEMES.find(t => t.key === k)!; setPrefs({ theme: k, mode: d.variants[prefs.mode ?? d.defaultMode] ? prefs.mode : d.defaultMode, custom: k === 'custom' ? prefs.custom ?? resolvePalette(prefs) : prefs.custom }) }
  return (
    <div className="flex flex-col gap-5 pb-6">
      {!compact && <HeroPreview k={current} />}
      <div className={cn('grid gap-3', compact ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4')}>
        {THEMES.map(t => { const p = t.key === 'custom' ? (prefs.custom ?? t.variants.dark!) : t.key === 'light' ? { ...t.variants.light!, primary: prefs.accent, accent: prefs.accent } : t.variants[t.defaultMode]!; const on = current === t.key; return (
          <button key={t.key} onClick={() => pick(t.key)} data-theme={t.key} className={cn('rounded-3xl border p-2 text-left transition hover:-translate-y-0.5', on ? 'border-accent accent-glow' : 'border-line')}>
            <TruckSwatch p={p} k={t.key} className="w-full rounded-2xl" />
            <div className="px-2 pt-2 pb-1 flex items-start gap-2"><div className="flex-1 min-w-0"><div className="font-semibold text-sm truncate">{t.name}</div><div className="text-[11px] text-muted truncate">{t.truck}</div></div>{on && <Check className="size-4 text-accent shrink-0" />}</div>
          </button>) })}
      </div>
      <div className="text-sm text-muted">{def.blurb} Themes are visual only — safety and mandatory alerts always show in every theme.</div>
      {Object.keys(def.variants).length > 1 && <div className="flex gap-2">{(['dark', 'light'] as Mode[]).filter(m => def.variants[m]).map(m => <button key={m} onClick={() => setPrefs({ mode: m })} className={cn('rounded-full px-4 h-10 text-sm font-semibold border', (prefs.mode ?? def.defaultMode) === m ? 'bg-accent text-accent-ink border-transparent' : 'border-line')}>{m === 'dark' ? 'Dark' : 'Light'}</button>)}</div>}
      {!compact && <MyColorCard />}
      {current === 'custom' && <CustomEditor />}
    </div>
  )
}

const FIELDS: { k: keyof Palette; l: string }[] = [{ k: 'primary', l: 'Primary (buttons)' }, { k: 'secondary', l: 'Secondary' }, { k: 'accent', l: 'Accent' }, { k: 'bg', l: 'Background' }, { k: 'surface', l: 'Surface (cards)' }, { k: 'text', l: 'Text' }]
function CustomEditor() {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const p = prefs.custom ?? THEMES.find(t => t.key === 'custom')!.variants.dark!
  const [draft, setDraft] = useState(p)
  const t = useMemo(() => tokens(draft), [draft])
  const checks = [
    { l: 'Text on background', v: contrast(draft.text, draft.bg), min: 4.5 },
    { l: 'Text on cards', v: contrast(draft.text, draft.surface), min: 4.5 },
    { l: 'Secondary text on cards', v: contrast(t.muted, draft.surface), min: 4.5 },
    { l: 'Button label on primary', v: contrast(t.accentInk, draft.primary), min: 4.5 },
    { l: 'Primary vs background (UI)', v: contrast(draft.primary, draft.bg), min: 3 },
    { l: 'Card edge vs background (UI)', v: Math.max(contrast(draft.surface, draft.bg), contrast(t.line, draft.bg)), min: 1.2 },
  ]
  const set = (k: keyof Palette, v: string) => { const n = { ...draft, [k]: v }; setDraft(n); if (/^#[0-9a-f]{6}$/i.test(v)) setPrefs({ custom: n }) }
  const presets = THEMES.filter(x => x.key !== 'custom').map(x => ({ n: x.name, p: x.variants[x.defaultMode]! }))
  return (
    <div className="grid md:grid-cols-[1fr_280px] gap-5">
      <div className="flex flex-col gap-3">
        {FIELDS.map(f => <label key={f.k} className="flex items-center gap-3"><input type="color" value={draft[f.k]} onChange={e => set(f.k, e.target.value)} className="size-10 rounded-xl border hairline bg-transparent cursor-pointer" /><span className="flex-1 text-sm font-medium">{f.l}</span><input className="input w-28 font-mono text-sm" value={draft[f.k]} onChange={e => set(f.k, e.target.value)} /></label>)}
        <div className="text-xs text-muted mt-1">Start from a scheme:</div>
        <div className="flex flex-wrap gap-1.5">{presets.map(x => <button key={x.n} onClick={() => { setDraft(x.p); setPrefs({ custom: x.p }) }} className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold">{x.n}</button>)}</div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-3xl p-4 border" style={{ background: t.bg, borderColor: t.line }}>
          <div className="rounded-2xl p-4" style={{ background: t.surface, color: t.text }}>
            <div className="font-semibold">Job #10125</div><div className="text-sm" style={{ color: t.muted }}>Plains Wind Partners · Woodward</div>
            <div className="mt-3 flex gap-2"><span className="rounded-xl px-3 py-1.5 text-sm font-semibold" style={{ background: t.primary, color: t.accentInk }}>Dispatch</span><span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ color: t.bad, background: t.bad + '22' }}>Conflict</span><span className="rounded-full px-2 py-1 text-xs font-semibold" style={{ color: t.ok, background: t.ok + '22' }}>OK</span></div>
          </div>
        </div>
        <div className="flex flex-col gap-1">{checks.map(c => <div key={c.l} className="flex items-center gap-2 text-xs"><span className="flex-1 text-muted">{c.l}</span><span className={cn('num font-semibold', c.v >= c.min ? 'text-ok' : 'text-bad')}>{c.v.toFixed(2)}:1</span>{c.v >= c.min ? <Check className="size-3.5 text-ok" /> : <AlertTriangle className="size-3.5 text-bad" />}</div>)}</div>
        {checks.some(c => c.v < c.min) && <div className="text-xs text-warn">Below WCAG minimum (4.5:1 text, 3:1 UI). Alert colors are auto-adjusted so red/amber/green stay readable.</div>}
      </div>
    </div>
  )
}

function HeroPreview({ k }: { k: ThemeKey }) {
  const prefs = useStore(s => s.prefs)
  const p = resolvePalette(prefs)
  const t = tokens(p)
  const def = THEMES.find(x => x.key === k)!
  return (
    <div className="relative rounded-3xl overflow-hidden border hairline" data-testid="truck-hero" style={{ background: `radial-gradient(120% 90% at 70% 10%, ${t.surface3}, ${t.bg} 70%)` }}>
      <div className="absolute left-6 top-5 z-10"><div className="label">Now showing</div><div className="display text-2xl font-semibold mt-1">{def.name}</div><div className="text-sm text-muted">{def.truck}</div></div>
      <div className="mx-auto max-w-[640px] px-4 pt-16 pb-3 aspect-[640/400] flex items-center justify-center">
        <TruckPhoto key={k + (prefs.mode ?? '')} k={k} p={p} eager fit className="animate-[truckin_.7s_cubic-bezier(.2,.8,.2,1)]" />
      </div>
    </div>
  )
}

/** "Your color": any main color for this person on this device, on top of whichever theme they picked. */
function MyColorCard() {
  const prefs = useStore(s => s.prefs), setPrefs = useStore(s => s.setPrefs), session = useStore(s => s.session)
  const brand = useBranding(s => s.b)
  const u = userKey(session)
  const base = tokens(brandPalette(resolvePalette(prefs, matchMedia('(prefers-color-scheme: dark)').matches), brand))
  const mine = prefs.myColor?.[u]
  const value = mine ?? base.primary
  const set = (hex: string) => setPrefs({ myColor: { ...(prefs.myColor ?? {}), [u]: hex } })
  const reset = () => { const m = { ...(prefs.myColor ?? {}) }; delete m[u]; setPrefs({ myColor: m }); toast('Back to the theme color') }
  const sw = [...LIGHT_ACCENTS, ...THEMES.filter(t => t.key !== 'custom').map(t => ({ name: t.name, hex: t.variants[t.defaultMode]!.primary }))].filter((x, i, a) => a.findIndex(y => y.hex.toLowerCase() === x.hex.toLowerCase()) === i).slice(0, 14)
  return (
    <div className="card p-5" data-testid="my-color">
      <div className="flex items-start gap-3 mb-4"><div className="flex-1"><div className="font-semibold">Main color — pick any color</div><div className="text-sm text-muted">Buttons, highlights and links. Works with every theme above and is saved for {session?.name ?? 'you'} on this device.</div></div>
        {mine && <button onClick={reset} data-testid="my-color-reset" className="shrink-0 h-9 px-3 rounded-full bg-surface-2 text-sm font-semibold">Use theme color</button>}</div>
      <ColorPicker id="my-color" value={value} onChange={set} bg={base.bg} surface={base.surface} swatches={sw} />
    </div>
  )
}
