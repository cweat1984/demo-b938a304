import { downscaleImage } from '../lib/image'
import { useEffect, useState } from 'react'
import { Lock, RotateCcw, Check, AlertTriangle, Upload, Palette as PaletteIcon } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Field, Badge, Toggle } from '../components/ui'
import { PoweredBy } from '../components/PoweredBy'
import { useStore } from '../data/store'
import { VENDOR_BRAND } from '../data/brand'
import { useBranding, useBrandPresets, SOUTHERN_DEFAULTS, PRESETS, contrastReport, validHex, brandPalette, type Branding, type SavedPreset } from '../data/branding'
import { BgCard } from './BgCard'
import { SchedColorsCard } from './SchedColorsCard'
import { extractColors, logoFromUrl, themeOptions, type ThemeOption } from '../lib/logoColors'
import { tokens, type Palette } from '../data/themes'
import { cn } from '../lib/util'

const LIGHT: Palette = { primary: '#d62f2f', secondary: '#475467', accent: '#d62f2f', bg: '#f6f7f9', surface: '#ffffff', text: '#0d1014' }
const DARK: Palette = { primary: '#ffffff', secondary: '#9ca1a8', accent: '#9ca1a8', bg: '#141517', surface: '#1f2124', text: '#f2f4f7' }

function ColorInput({ label, value, onChange, id }: { label: string; value: string; onChange: (v: string) => void; id: string }) {
  const [txt, setTxt] = useState(value); const bad = !validHex(txt)
  if (!bad && txt.toLowerCase() !== value.toLowerCase()) setTxt(value)
  return <Field label={label}><div className="flex items-center gap-2">
    <input type="color" value={validHex(value) ? value : '#000000'} onChange={e => { setTxt(e.target.value); onChange(e.target.value) }} className="size-11 rounded-xl border hairline bg-transparent cursor-pointer" data-testid={`brand-${id}-picker`} aria-label={`${label} color`} />
    <input className={cn('input font-mono uppercase', bad && 'border-bad')} value={txt} maxLength={7} data-testid={`brand-${id}`} onChange={e => { const v = e.target.value.startsWith('#') ? e.target.value : '#' + e.target.value; setTxt(v); if (validHex(v)) onChange(v.toLowerCase()) }} />
  </div>{bad && <div className="text-xs text-bad mt-1">Use a 6-digit hex like #0F2D52</div>}</Field>
}

function Preview({ b, mode }: { b: Branding; mode: 'light' | 'dark' }) {
  const t = tokens(brandPalette(mode === 'light' ? LIGHT : DARK, { ...b, primary: b.primary, accent: b.accent }))
  return <div className="rounded-2xl overflow-hidden border hairline" style={{ background: t.bg, color: t.text }} data-testid={`brand-preview-${mode}`}>
    <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: t.surface, borderBottom: `1px solid ${t.line}` }}>
      {b.logo ? <img src={b.logo} alt="" className="size-8 rounded-lg object-contain bg-white" /> : <div className="size-8 rounded-lg grid place-items-center font-bold text-xs" style={{ background: t.primary, color: t.accentInk }}>{b.shortName.slice(0, 3)}</div>}
      <div><div className="font-semibold leading-none text-sm">{b.appName}</div><div className="text-[10px] uppercase tracking-wide mt-1" style={{ color: t.muted }}>{b.name}</div></div>
      <span className="ml-auto text-[10px] uppercase font-semibold" style={{ color: t.muted }}>{mode}</span></div>
    <div className="p-4 flex flex-col gap-3" style={{ background: t.surface }}>
      <div className="text-sm">Job #10125 · <b style={{ color: t.accentFg }}>On site</b> · crane LTM 1300</div>
      <div className="flex gap-2 flex-wrap"><span className="rounded-full px-4 h-9 inline-flex items-center text-sm font-semibold" style={{ background: t.primary, color: t.accentInk }}>Dispatch crew</span>
        <span className="rounded-full px-3 h-9 inline-flex items-center text-sm font-semibold border" style={{ borderColor: t.accent, color: t.accent }}>Accent</span>
        {b.secondary && <span className="rounded-full px-3 h-9 inline-flex items-center text-sm font-semibold" style={{ background: t.secondary, color: tokens({ ...LIGHT, primary: t.secondary }).accentInk }}>Secondary</span>}</div>
      <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${t.primary}, ${t.accent})` }} />
      <div className="flex justify-end"><PoweredBy tone={mode === 'dark' ? 'dark' : 'light'} size={11} /></div>
    </div></div>
}

/** Owner-only white-label settings: customer company name, app name, logo and colors. Stored in this browser, audit-logged. */
export default function BrandingPage() {
  const role = useStore(s => s.session?.role)
  const saved = useBranding(s => s.b), save = useBranding(s => s.set), reset = useBranding(s => s.reset)
  const [d, setD] = useState<Branding>(saved)
  const [useSec, setUseSec] = useState(!!saved.secondary)
  if (role !== 'owner') return <Card className="max-w-lg mx-auto mt-16 text-center">Company branding is owner-only.</Card>
  const draft: Branding = { ...d, secondary: useSec ? (d.secondary ?? '#475467') : undefined }
  const dirty = JSON.stringify(draft) !== JSON.stringify({ ...saved, secondary: saved.secondary })
  const report = contrastReport(draft), warn = report.filter(r => !r.ok)
  const valid = draft.name.trim() && draft.shortName.trim() && draft.appName.trim() && validHex(draft.primary) && validHex(draft.accent) && (!useSec || validHex(draft.secondary))
  const onLogo = (f?: File) => { if (!f) return; void downscaleImage(f, 512).then(logo => setD(x => ({ ...x, logo })), () => toast.error('That file isn’t an image we can read — try a PNG, JPG or SVG')) }
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [cols, setCols] = useState<string[]>([]), [presetName, setPresetName] = useState('')
  const presets = useBrandPresets(s => s.list), addPreset = useBrandPresets(s => s.add), delPreset = useBrandPresets(s => s.remove)
  const [colsFor, setColsFor] = useState<string | undefined>()
  useEffect(() => { setCols([]); if (!d.logo) { setColsFor(undefined); return } let live = true; extractColors(d.logo).then(c => { if (live) { setCols(c); setColsFor(d.logo) } }, () => { if (live) { setCols([]); setColsFor(d.logo) } }); return () => { live = false } }, [d.logo])
  const opts: ThemeOption[] = themeOptions(cols)
  const [urlMsg, setUrlMsg] = useState('')
  const fromUrl = async () => { setBusy(true); setUrlMsg(''); try { const raw = await logoFromUrl(url); const r = await fetch(raw); const f = new File([await r.blob()], 'logo', { type: 'image/png' }); const logo = await downscaleImage(f, 512).catch(() => raw); setD(x => ({ ...x, logo })); toast.success('Logo loaded from the website') } catch (e) { const m = (e as Error).message; setUrlMsg(m); toast.error('Couldn’t load that logo', { description: m }) } finally { setBusy(false) } }
  const pick = (o: { primary: string; accent: string; secondary?: string; company?: SavedPreset['company'] }) => { setD(x => ({ ...x, primary: o.primary, accent: o.accent, secondary: o.secondary, ...(o.company ? { name: o.company.name, shortName: o.company.shortName, appName: o.company.appName, logo: o.company.logo, phone: o.company.phone } : {}) })); setUseSec(!!o.secondary) }
  const apply = () => { save({ ...draft, name: draft.name.trim(), shortName: draft.shortName.trim(), appName: draft.appName.trim() }); toast.success('Branding applied across the app', { description: warn.length ? `${warn.length} contrast warning${warn.length > 1 ? 's' : ''} — colors are auto-adjusted where needed.` : 'Logged in the audit trail.' }) }
  return <div className="max-w-[1100px] mx-auto flex flex-col gap-5" data-testid="branding-page">
    <PageHeader eyebrow="Office · owner only" title="Company branding" sub="White-label the app for the customer company: name, app name, logo and colors. Saved in this browser and logged in the audit trail." />
    <div className="grid lg:grid-cols-[1.2fr_1fr] gap-5">
      <div className="flex flex-col gap-5">
        <Card className="flex flex-col gap-3" data-testid="brand-names">
          <div className="font-semibold">Names</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Customer company name"><input className="input" value={d.name} maxLength={60} onChange={e => setD({ ...d, name: e.target.value })} data-testid="brand-name" /></Field>
            <Field label="Short name" hint="Badges, texts, PDFs"><input className="input" value={d.shortName} maxLength={12} onChange={e => setD({ ...d, shortName: e.target.value })} data-testid="brand-short" /></Field>
            <Field label="App name" hint="Sidebar, login, splash, page title"><input className="input" value={d.appName} maxLength={40} onChange={e => setD({ ...d, appName: e.target.value })} data-testid="brand-app" /></Field>
            <Field label="Phone" hint="Printed on proposals and invoices"><input className="input" inputMode="tel" value={d.phone ?? ''} maxLength={24} placeholder="(405) 555-0100" onChange={e => setD({ ...d, phone: e.target.value || undefined })} data-testid="brand-phone" /></Field>
            <Field label="Logo (optional)"><div className="flex gap-2 items-center">{d.logo && <img src={d.logo} alt="" className="size-11 rounded-xl object-contain bg-white border hairline" />}<label className="btn inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-surface-2 font-semibold text-sm cursor-pointer"><Upload className="size-4" />Upload<input type="file" accept="image/*" className="hidden" data-testid="brand-logo" onChange={e => { onLogo(e.target.files?.[0]); e.target.value = '' }} /></label>{d.logo && <Button variant="ghost" onClick={() => setD({ ...d, logo: undefined })} data-testid="brand-logo-remove">Remove</Button>}</div></Field>
          </div>
        </Card>
        <Card className="flex flex-col gap-3" data-testid="brand-logo-theme">
          <div className="font-semibold">Theme from your logo</div>
          <div className="flex gap-2 flex-wrap"><input className="input flex-1 min-w-[200px]" placeholder="Company website or logo address, e.g. bobsmachinemoving.com" value={url} onChange={e => { setUrl(e.target.value); setUrlMsg('') }} onKeyDown={e => { if (e.key === 'Enter' && url.trim() && !busy) void fromUrl() }} data-testid="brand-logo-url" /><Button onClick={() => void fromUrl()} disabled={!url.trim() || busy} data-testid="brand-logo-fetch">{busy ? 'Loading…' : 'Use this logo'}</Button></div>
          {urlMsg && <div className="text-xs text-bad flex items-center gap-2 flex-wrap" data-testid="brand-url-msg"><AlertTriangle className="size-3.5 shrink-0" /><span className="flex-1 min-w-0">{urlMsg}</span><label className="btn inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-surface-2 text-ink font-semibold cursor-pointer"><Upload className="size-3.5" />Upload logo<input type="file" accept="image/*" className="hidden" onChange={e => { setUrlMsg(''); onLogo(e.target.files?.[0]); e.target.value = '' }} /></label></div>}
          {!d.logo && <div className="text-xs text-muted">Upload a logo above or paste its web address — we pull its colors and suggest themes that stay readable.</div>}
          {d.logo && colsFor === d.logo && cols.length === 0 && <div className="text-xs text-warn flex items-center gap-2" data-testid="brand-no-colors"><AlertTriangle className="size-3.5 shrink-0" />This logo has no usable colors (it’s white, black or see-through). Pick a preset or set the colors below.</div>}
          {cols.length > 0 && <div className="flex items-center gap-2 flex-wrap" data-testid="brand-logo-colors"><span className="text-xs text-muted">Colors in the logo:</span>{cols.map(c => <span key={c} data-testid="brand-logo-color" title={c} className="size-7 rounded-lg border hairline" style={{ background: c }} />)}</div>}
          {opts.length > 0 && <div className="grid sm:grid-cols-2 gap-2">{opts.map(o => <button key={o.id} data-testid="brand-theme-option" data-aa={o.aa ? '1' : '0'} onClick={() => pick(o)} className={cn('rounded-xl border p-3 text-left min-h-[44px] hover:bg-surface-2', draft.primary === o.primary && draft.accent === o.accent ? 'border-accent ring-2 ring-accent/30' : 'hairline')}>
            <div className="flex items-center gap-1.5 mb-1.5"><span className="size-6 rounded-md" style={{ background: o.primary }} /><span className="size-6 rounded-md" style={{ background: o.accent }} />{o.secondary && <span className="size-6 rounded-md" style={{ background: o.secondary }} />}{(() => { const bad = contrastReport({ ...d, primary: o.primary, accent: o.accent, secondary: o.secondary }).filter(r => !r.ok).length; return <span data-testid="brand-option-aa" data-bad={bad} title={bad ? `${bad} contrast warning${bad === 1 ? '' : 's'} on the light, dark or field themes` : 'Passes on light, dark and field themes'} className={cn('ml-auto text-[10px] font-bold rounded-full px-2 py-0.5', bad ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok')}>{bad ? `${bad} contrast warning${bad === 1 ? '' : 's'}` : 'AA · light + dark'}</span> })()}</div>
            <div className="text-sm font-semibold">{o.name}</div></button>)}</div>}
          <div className="border-t hairline pt-3 flex flex-col gap-2"><div className="text-sm font-semibold">Saved presets</div>
            <div className="flex gap-2 flex-wrap"><input className="input flex-1 min-w-[160px]" placeholder="Name this preset (colors, company name, logo)" value={presetName} maxLength={30} onChange={e => setPresetName(e.target.value)} data-testid="brand-preset-name" /><Button disabled={!presetName.trim() || !valid} data-testid="brand-preset-save" onClick={() => { const big = !!d.logo && d.logo.length > 250_000; addPreset({ name: presetName.trim(), primary: draft.primary, accent: draft.accent, secondary: draft.secondary, company: { name: d.name, shortName: d.shortName, appName: d.appName, logo: big ? undefined : d.logo, phone: d.phone } }); setPresetName(''); toast.success('Preset saved', { description: `Colors + ${d.name}${d.logo ? big ? ' (logo too large to keep in a preset)' : ' + logo' : ''}` }) }}>Save preset</Button></div>
            {presets.length > 0 && <div className="flex flex-wrap gap-2">{presets.map(p => <span key={p.id} className="inline-flex items-center rounded-full border hairline" data-testid="brand-saved-preset"><button onClick={() => pick(p)} className="pl-1.5 pr-2 h-9 pointer-coarse:h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold"><span className="size-5 rounded-full" style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.accent} 50%)` }} />{p.name}</button><button aria-label={`Delete ${p.name}`} data-testid="brand-saved-preset-del" onClick={() => delPreset(p.id)} className="pr-2 h-9 pointer-coarse:h-[44px] text-muted">×</button></span>)}</div>}
          </div>
        </Card>
        <Card className="flex flex-col gap-3" data-testid="brand-colors">
          <div className="font-semibold flex items-center gap-2"><PaletteIcon className="size-4" />Colors</div>
          <div className="flex flex-wrap gap-2">{PRESETS.map(p => <button key={p.name} data-testid="brand-preset" onClick={() => { setD({ ...d, primary: p.primary, accent: p.accent, secondary: p.secondary }); setUseSec(!!p.secondary) }} className="rounded-full pl-1.5 pr-3 h-9 border hairline text-xs font-semibold inline-flex items-center gap-2 hover:bg-surface-2"><span className="flex"><span className="size-5 rounded-full border border-white/40" style={{ background: p.primary }} /><span className="size-5 -ml-1.5 rounded-full border border-white/40" style={{ background: p.accent }} /></span>{p.name}</button>)}</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <ColorInput label="Primary color" id="primary" value={d.primary} onChange={v => setD(x => ({ ...x, primary: v }))} />
            <ColorInput label="Accent color" id="accent" value={d.accent} onChange={v => setD(x => ({ ...x, accent: v }))} />
          </div>
          <Toggle checked={useSec} onChange={setUseSec} label={<span data-testid="brand-sec-toggle">Use a secondary color</span>} />
          {useSec && <div className="grid sm:grid-cols-2 gap-3"><ColorInput label="Secondary" id="secondary" value={draft.secondary!} onChange={v => setD(x => ({ ...x, secondary: v }))} /></div>}
          <div data-testid="brand-contrast" className="rounded-xl bg-surface-2 p-3 text-sm">
            <div className="font-semibold mb-1.5 flex items-center gap-2">{warn.length ? <><AlertTriangle className="size-4 text-warn" />Low contrast in {warn.length} place{warn.length > 1 ? 's' : ''}</> : <><Check className="size-4 text-ok" />Readable everywhere</>}</div>
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1">{report.map((r, i) => <div key={i} className="flex items-center gap-2 text-xs" data-testid="brand-contrast-row" data-ok={r.ok}><span className="size-3 rounded-full" style={{ background: r.color }} />{r.which} · {r.ctx}<span className="ml-auto num">{r.ratio.toFixed(1)}:1</span>{r.ok ? <Badge tone="ok">OK</Badge> : <Badge tone="warn">Low</Badge>}</div>)}</div>
            {warn.length > 0 && <div className="text-xs text-muted mt-2">Below {warn.some(w => w.need === 4.5) ? '4.5:1 (text / outdoors)' : '3:1'}. The app automatically lightens or darkens the color on that theme so text stays readable, but the result will look different from your pick.</div>}
          </div>
        </Card>
      </div>
      <div className="flex flex-col gap-4">
        <BgCard />
        <SchedColorsCard />
        <Card className="flex flex-col gap-3" data-testid="brand-preview"><div className="font-semibold">Live preview</div><Preview b={draft} mode="light" /><Preview b={draft} mode="dark" /></Card>
        <Card className="text-sm flex items-start gap-3" data-testid="brand-vendor"><Lock className="size-4 mt-0.5 text-muted shrink-0" /><div><b>{VENDOR_BRAND.poweredBy}</b> always shows on the login, sidebar, printouts and portal. It's the platform credit and can't be edited here.</div></Card>
        <div className="flex gap-2 flex-wrap scroll-mb-28 [&>*]:scroll-mb-28">
          <Button variant="primary" disabled={!dirty || !valid} onClick={apply} data-testid="brand-save" icon={<Check className="size-4" />}>Apply branding</Button>
          <Button onClick={() => { const prev = useBranding.getState().b; reset(); setD(SOUTHERN_DEFAULTS); setUseSec(false); toast('Back to Southern defaults', { action: prev ? { label: 'Undo', onClick: () => { save(prev); setD(prev); setUseSec(!!prev.secondary) } } : undefined }) }} data-testid="brand-reset" icon={<RotateCcw className="size-4" />}>Reset to Southern defaults</Button>
          {dirty && <Button variant="ghost" onClick={() => { setD(saved); setUseSec(!!saved.secondary) }}>Discard changes</Button>}
        </div>
      </div>
    </div>
  </div>
}
