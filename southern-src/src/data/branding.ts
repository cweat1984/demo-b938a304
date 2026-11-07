/** White-label branding for the customer company (owner-only). Stored in this browser; changes are audit-logged.
 *  The vendor credit ("Powered by Arrowline", VENDOR_BRAND) is NOT part of this and can't be edited. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Branding { name: string; shortName: string; appName: string; logo?: string; primary: string; accent: string; secondary?: string; /** dive3 M14: phone printed on proposals / invoices */ phone?: string }
export const SOUTHERN_DEFAULTS: Branding = { name: 'Southern Lifting & Hoisting', shortName: 'SLH', appName: 'Southern Command', primary: '#0f2d52', accent: '#c4581c' }
export const PRESETS: { name: string; primary: string; accent: string; secondary?: string }[] = [
  { name: 'Southern (navy + orange)', primary: '#0f2d52', accent: '#c4581c' },
  { name: 'Safety yellow', primary: '#1f2937', accent: '#eab308', secondary: '#475569' },
  { name: 'Crane red', primary: '#b91c1c', accent: '#111827', secondary: '#6b7280' },
  { name: 'Forest', primary: '#14532d', accent: '#ca8a04', secondary: '#4b5563' },
  { name: 'Steel blue', primary: '#1d4ed8', accent: '#0ea5e9', secondary: '#334155' },
]
interface S { b: Branding; set: (patch: Partial<Branding>, actor?: string) => void; reset: () => void }
type Committer = (action: string, entity: string, detail: string) => void
let audit: Committer = () => {}
export const setBrandingAudit = (f: Committer) => { audit = f }
const LABEL: Record<keyof Branding, string> = { name: 'Company name', shortName: 'Short name', appName: 'App name', logo: 'Logo', primary: 'Primary', accent: 'Accent', secondary: 'Secondary', phone: 'Phone' }
export const useBranding = create<S>()(persist((set, get) => ({
  b: SOUTHERN_DEFAULTS,
  set: patch => {
    const cur = get().b, changes = (Object.keys(patch) as (keyof Branding)[]).filter(k => patch[k] !== cur[k])
    if (!changes.length) return
    set({ b: { ...cur, ...patch } })
    audit('Branding updated', 'Company branding', changes.map(k => k === 'logo' ? (patch.logo ? 'logo uploaded' : 'logo removed') : `${LABEL[k]}: ${cur[k] ?? '—'} → ${patch[k] ?? '—'}`).join(' · '))
  },
  reset: () => { set({ b: SOUTHERN_DEFAULTS }); audit('Branding reset', 'Company branding', 'Back to Southern Lifting & Hoisting defaults') },
}), { name: 'sc-branding-v1',
  // a saved value of the wrong shape falls back to the defaults field by field (never a white screen)
  merge: (saved, cur) => { if (saved == null) return cur /* nothing saved yet (fresh browser) is not a reset */; const b = (saved as { b?: Partial<Branding> } | undefined)?.b; const note = () => { const g = globalThis as { __scResetLog?: string[] }; (g.__scResetLog ??= []).push('Company branding') }; if (!b || typeof b !== 'object') { note(); return cur } if ((Object.keys(SOUTHERN_DEFAULTS) as (keyof Branding)[]).some(k => k in b && typeof b[k] !== 'string')) note(); const ok = (k: keyof Branding) => typeof b[k] === 'string' && (b[k] as string).length > 0; return { ...cur, b: { ...SOUTHERN_DEFAULTS, ...Object.fromEntries((Object.keys(b) as (keyof Branding)[]).filter(ok).map(k => [k, b[k]])) } as Branding } } }))
export const branding = () => useBranding.getState().b
/** dive3 M14: the owner renamed the company (not just recolored it) — Southern wording gives way to the brand. */
export const customName = (b = branding()) => b.name.trim() !== SOUTHERN_DEFAULTS.name || b.shortName.trim() !== SOUTHERN_DEFAULTS.shortName
/** Login / splash highlight: the brand accent once colors are customized, else the Southern red. */
export const brandHot = (b = branding()) => (b.primary !== SOUTHERN_DEFAULTS.primary || b.accent !== SOUTHERN_DEFAULTS.accent || !!b.secondary) ? b.accent : '#ef3b3b'
/** True once the owner picks colors other than the Southern defaults — then the brand colors re-tint the whole app. */
export const customColors = (b = branding()) => b.primary !== SOUTHERN_DEFAULTS.primary || b.accent !== SOUTHERN_DEFAULTS.accent || !!b.secondary

// ── colors → theme ───────────────────────────────────────────────────────
import { ensure, contrast, isDarkColor, type Palette } from './themes'
const HEX = /^#[0-9a-f]{6}$/i
export const validHex = (h?: string) => !!h && HEX.test(h)
/** Re-tint the active theme with the brand colors, nudged lighter/darker until they read on that theme's surface (≥3:1 UI, the
 *  text variants are guarded again to 4.5:1 by tokens()). Works for every light/dark theme and the field app. */
export function brandPalette(p: Palette, b = branding()): Palette {
  if (!customColors(b) || !validHex(b.primary) || !validHex(b.accent)) return p
  const ext = isDarkColor(p.bg) ? '#ffffff' : '#000000'
  return { ...p, primary: ensure(b.primary, p.surface, 3, ext), accent: ensure(b.accent, p.surface, 3, ext), secondary: validHex(b.secondary) ? ensure(b.secondary!, p.surface, 3, ext) : p.secondary }
}
/** Contrast warnings shown on the branding page (raw colors, before the automatic nudge). */
export const CONTEXTS = [{ k: 'light', label: 'Light theme', bg: '#ffffff' }, { k: 'dark', label: 'Dark theme', bg: '#1f2124' }, { k: 'field', label: 'Field app (outdoors)', bg: '#0b0d10' }] as const
export function contrastReport(b: Branding) {
  const rows: { ctx: string; color: string; which: string; ratio: number; ok: boolean; need: number }[] = []
  for (const c of CONTEXTS) for (const [which, col] of [['Primary', b.primary], ['Accent', b.accent], ...(b.secondary ? [['Secondary', b.secondary]] : [])] as [string, string][]) {
    if (!validHex(col)) continue
    const need = c.k === 'field' ? 4.5 : 3, ratio = contrast(col, c.bg); rows.push({ ctx: c.label, color: col, which, ratio, ok: ratio >= need, need })
  }
  const ink = validHex(b.primary) ? Math.max(contrast('#ffffff', b.primary), contrast('#0b0b0c', b.primary)) : 21
  rows.push({ ctx: 'Button text on primary', color: b.primary, which: 'Primary', ratio: ink, ok: ink >= 4.5, need: 4.5 })
  return rows
}

/** Milestone 2: the owner's own saved color presets (this browser). */
export interface SavedPreset { id: string; name: string; primary: string; accent: string; secondary?: string; /** dive3 acct m12: the customer it's for */ company?: { name: string; shortName: string; appName: string; logo?: string } }
export const useBrandPresets = create<{ list: SavedPreset[]; add: (p: Omit<SavedPreset, 'id'>) => void; remove: (id: string) => void }>()(persist(set => ({
  list: [],
  add: p => set(s => { audit('Branding preset saved', 'Company branding', `${p.name}: ${p.primary} / ${p.accent}${p.secondary ? ` / ${p.secondary}` : ''}`); return { list: [...s.list.filter(x => x.name !== p.name), { ...p, id: 'bp-' + Date.now().toString(36) }].slice(-12) } }),
  remove: id => set(s => ({ list: s.list.filter(x => x.id !== id) })),
}), { name: 'sc-brand-presets-v1', merge: (saved, cur) => { const l = (saved as { list?: unknown })?.list; return Array.isArray(l) ? { ...cur, list: l.filter((x): x is SavedPreset => !!x && typeof x === 'object' && validHex((x as SavedPreset).primary) && validHex((x as SavedPreset).accent)) } : cur } }))
