// Theme system — design tokens. Visual only: themes change colors, never which alerts show.
// Every screen reads CSS variables set from these palettes. THEMES.md is generated from this file.

export type ThemeKey = 'slh' | 'jen' | 'light' | 'miami' | 'cotton' | 'purple' | 'ivy' | 'artillery' | 'southern' | 'custom'
export type Mode = 'dark' | 'light'
/** The six core colors of a scheme. Everything else is derived (and contrast-checked). */
export interface Palette { primary: string; secondary: string; accent: string; bg: string; surface: string; text: string }
export interface ThemeDef { key: ThemeKey; name: string; truck: string; blurb: string; variants: Partial<Record<Mode, Palette>>; defaultMode: Mode }

// ===== SLH BRAND TOKENS — sampled from SLH crane photos (crane-photos/*.jpeg); edit here only =====
// Glossy primer-gray carriers & booms, black logo/outriggers/boom tips, white upper boom, red-and-white hazard chevrons.
export const SLH_BRAND = {
  craneGray: '#9ca1a8',     // core crane primer gray (photo samples ≈ #99a0ac under blue sky, neutralized)
  craneGrayLight: '#c9cdd2',// lighter primer step — light-variant background
  craneGrayDark: '#5e636b', // darker step — secondary in light variant
  charcoal: '#2b2e33',      // charcoal step
  satinBlack: '#141517',    // satin black lower body / chassis on the SLH 389 — dark-variant background
  satinSurface: '#1f2124',  // dark-variant card surface
  charcoalSurface: '#363a40', // dark-variant card surface
  sheen: '#e6e8eb',         // light-variant card surface (glossy highlight)
  black: '#0b0b0c',         // 'Southern' script logo, outriggers, boom tips
  white: '#ffffff',         // upper boom sections
  chevronRed: '#d62f2f',    // hazard chevrons / logo red — restrained highlight only
  textOnDark: '#f5f6f7',
  textOnLight: '#0b0b0c',
}
// ===================================================================================================

export const THEMES: ThemeDef[] = [
  { key: 'slh', name: 'Southern Lifting & Hoisting', truck: 'Southern crane fleet', blurb: 'Glossy primer gray with satin black and white accents, from Southern Lifting & Hoisting\u2019s Liebherr all-terrain crane fleet. Company default.', defaultMode: 'dark',
    variants: {
      dark: { primary: SLH_BRAND.white, secondary: SLH_BRAND.craneGray, accent: SLH_BRAND.craneGray, /* dive3 m13: primary buttons read as live, not gray/disabled */ bg: SLH_BRAND.satinBlack, surface: SLH_BRAND.satinSurface, text: SLH_BRAND.textOnDark },
      light: { primary: SLH_BRAND.satinBlack, secondary: SLH_BRAND.craneGrayDark, accent: SLH_BRAND.craneGrayDark, bg: SLH_BRAND.craneGrayLight, surface: SLH_BRAND.sheen, text: SLH_BRAND.textOnLight },
    } },
  { key: 'jen', name: 'Jen Mode', truck: 'Dark mode · Peterbilt 389', blurb: 'True black, dark grays, monochrome. Sleek and high-contrast.', defaultMode: 'dark',
    variants: { dark: { primary: '#f5f5f7', secondary: '#3a3a3c', accent: '#8e8e93', bg: '#000000', surface: '#0c0c0d', text: '#f5f5f7' } } },
  { key: 'light', name: 'Light Mode', truck: 'Peterbilt 389', blurb: 'Clean white and off-white. Pick any truck accent.', defaultMode: 'light',
    variants: { light: { primary: '#d62f2f', secondary: '#475467', accent: '#d62f2f', bg: '#f6f7f9', surface: '#ffffff', text: '#0d1014' } } },
  { key: 'miami', name: 'Miami Vice', truck: 'Peterbilt 389', blurb: 'Peach-coral, cream and turquoise sampled from Southern Transport\u2019s real Miami Vice 389. Retro 80s Miami.', defaultMode: 'dark',
    variants: {
      dark: { primary: '#ec9462', secondary: '#1fc4c4', accent: '#f4e6cc', bg: '#0b1a21', surface: '#12252e', text: '#fff6f2' },
      light: { primary: '#b0532a', secondary: '#0d7d7d', accent: '#b0532a', bg: '#fbf4e8', surface: '#ffffff', text: '#1b2a33' },
    } },
  { key: 'cotton', name: 'Cotton Candy', truck: 'Peterbilt 389', blurb: 'Solid gloss magenta with bright turquoise frame, fifth wheel and deck, sampled from Southern Transport\u2019s real Cotton Candy 389. Chrome stacks and wheels.', defaultMode: 'light',
    variants: {
      light: { primary: '#b0256f', secondary: '#0b7d8a', accent: '#0b7d8a', bg: '#fff4fa', surface: '#ffffff', text: '#2a1424' },
      dark: { primary: '#e2398f', secondary: '#4fd6e3', accent: '#5fe0ea', bg: '#1a0f18', surface: '#251622', text: '#fdeef6' },
    } },
  { key: 'purple', name: 'Purple Pressure', truck: 'Peterbilt 389', blurb: 'Pale metallic lavender-silver with deep violet pinstripes and candy-purple frame, sampled from Southern Transport\u2019s real Purple Pressure 389. Chrome fenders.', defaultMode: 'dark',
    variants: {
      dark: { primary: '#bcaee0', secondary: '#8b62da', accent: '#c4cad3', bg: '#120c1d', surface: '#1c1430', text: '#f4f0ff' },
      light: { primary: '#4a2c80', secondary: '#6c5f88', accent: '#69717d', bg: '#f3f0f8', surface: '#ffffff', text: '#1d1530' },
    } },
  { key: 'ivy', name: "Ivy's Poison", truck: '1986 Peterbilt 359', blurb: 'Deep candy metallic royal blue with silver-white tribal flames and chrome, sampled from Southern Transport\u2019s real Ivy\u2019s Poison 359.', defaultMode: 'dark',
    variants: {
      dark: { primary: '#3567e0', secondary: '#b4bfcc', accent: '#ffffff', bg: '#050b1c', surface: '#0c1630', text: '#eef3ff' },
      light: { primary: '#12348f', secondary: '#5d6b7c', accent: '#6f7b8c', bg: '#f1f4fa', surface: '#ffffff', text: '#0b1430' },
    } },
  { key: 'artillery', name: 'Heavy Artillery', truck: 'Peterbilt 389 Day Cab', blurb: 'Satin root-beer olive sampled from Southern Transport\u2019s real Heavy Artillery day cab, blacked-out everything, gunmetal. Stealth heavy haul.', defaultMode: 'dark',
    variants: {
      dark: { primary: '#958a70', secondary: '#756c54', accent: '#8b9298', bg: '#0b0c0a', surface: '#171814', text: '#e9e7df' },
      light: { primary: '#4b4735', secondary: '#6e6650', accent: '#565d64', bg: '#efeee8', surface: '#fbfbf8', text: '#1b1a15' },
    } },
  { key: 'southern', name: 'Southern Style', truck: 'Peterbilt · Southern Transport', blurb: 'Root-beer burgundy over champagne-tan metallic with chrome, sampled from Southern Transport\u2019s real Southern Style Peterbilt.', defaultMode: 'dark',
    variants: {
      dark: { primary: '#c9b79a', secondary: '#b0585b', accent: '#c4cad3', bg: '#140b0a', surface: '#21130f', text: '#f6efe6' },
      light: { primary: '#5a2a2a', secondary: '#7a6a52', accent: '#69717d', bg: '#f6f2ec', surface: '#ffffff', text: '#22130f' },
    } },
  { key: 'custom', name: 'Custom', truck: 'Your paint job', blurb: 'Pick every color. Live preview with contrast checks.', defaultMode: 'dark',
    variants: { dark: { primary: '#ef3b3b', secondary: '#38bdf8', accent: '#f59e0b', bg: '#0b0e12', surface: '#141921', text: '#f2f4f7' } } },
]

/** Accent colors offered for Light Mode — the truck themes' signature colors, tuned to pass 3:1 on white. */
export const LIGHT_ACCENTS: { name: string; hex: string }[] = [
  { name: 'Southern Red', hex: '#d62f2f' }, { name: 'Miami Peach', hex: '#b0532a' }, { name: 'Miami Turquoise', hex: '#0d7d7d' }, { name: 'Cotton Magenta', hex: '#b0256f' },
  { name: 'Purple Pressure', hex: '#4a2c80' }, { name: "Ivy's Poison", hex: '#12348f' }, { name: 'Artillery Olive', hex: '#4b4735' }, { name: 'Gunmetal', hex: '#3d444b' }, { name: 'Highway Blue', hex: '#1d5fd1' },
]

// ---------- color math ----------
const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
export const hexToRgb = (h: string): [number, number, number] => { const s = h.replace('#', ''); const v = s.length === 3 ? s.split('').map(c => c + c).join('') : s; return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)] }
export const rgbToHex = (r: number, g: number, b: number) => '#' + [r, g, b].map(x => clamp(x).toString(16).padStart(2, '0')).join('')
export const mix = (a: string, b: string, t: number) => { const A = hexToRgb(a), B = hexToRgb(b); return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t) }
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
export const luminance = (h: string) => { const [r, g, b] = hexToRgb(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) }
export const contrast = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
export const isDarkColor = (h: string) => luminance(h) < 0.18
/** Move `fg` toward `toward` until it reaches `min` contrast against `bg`. */
export function ensure(fg: string, bg: string, min: number, toward: string) { let c = fg; for (let i = 0; i <= 20 && contrast(c, bg) < min; i++) c = mix(fg, toward, i / 20); return c }

// Status colors are fixed per mode and then contrast-guarded against each theme's surface, so red/amber/green always read.
const STATUS = { dark: { ok: '#22c55e', warn: '#f59e0b', bad: '#f05252', info: '#38bdf8' }, light: { ok: '#15803d', warn: '#b45309', bad: '#dc2626', info: '#0369a1' } }

export interface Tokens extends Palette { dark: boolean; surface2: string; surface3: string; line: string; muted: string; faint: string; accentInk: string; accentFg: string; ok: string; warn: string; bad: string; info: string; glow: string }

export function tokens(p: Palette): Tokens {
  const dark = isDarkColor(p.bg)
  const extreme = dark ? '#ffffff' : '#000000'
  const surface2 = mix(p.surface, p.text, dark ? 0.05 : 0.04)
  const surface3 = mix(p.surface, p.text, dark ? 0.1 : 0.08)
  const line = mix(p.surface, p.text, dark ? 0.12 : 0.11)
  const muted = ensure(mix(p.text, p.surface, 0.4), surface2, 4.5, p.text)
  const faint = ensure(mix(p.text, p.surface, 0.5), p.surface, 4.5, p.text)
  const accentInk = contrast('#ffffff', p.primary) >= contrast('#0b0b0c', p.primary) ? '#ffffff' : '#0b0b0c'
  const accentFg = ensure(p.primary, p.surface, 4.5, extreme === '#ffffff' ? '#ffffff' : p.text)
  const st = STATUS[dark ? 'dark' : 'light']
  const g = (c: string) => ensure(c, p.surface, 4.5, extreme)
  return { ...p, dark, surface2, surface3, line, muted, faint, accentInk, accentFg, ok: g(st.ok), warn: g(st.warn), bad: g(st.bad), info: g(st.info), glow: dark ? p.primary + '38' : 'transparent' }
}

export interface ThemePrefs { theme: ThemeKey | 'system'; mode?: Mode; accent: string; custom?: Palette }
/** Saved settings may name a theme that no longer exists (e.g. the retired Old Glory) — those fall back to SLH. */
export const knownTheme = (k: string | undefined): k is ThemeKey => !!k && THEMES.some(t => t.key === k)
export const resolveKey = (pr: ThemePrefs, systemDark = false): ThemeKey => (pr.theme === 'system' ? (systemDark ? 'jen' : 'light') : knownTheme(pr.theme) ? pr.theme : 'slh')
export function resolvePalette(pr: ThemePrefs, systemDark = false): Palette {
  const key: ThemeKey = pr.theme === 'system' ? (systemDark ? 'jen' : 'light') : pr.theme
  const def = THEMES.find(t => t.key === key) ?? THEMES[0]
  if (key === 'custom') return pr.custom ?? def.variants.dark!
  const mode = pr.mode && def.variants[pr.mode] ? pr.mode : def.defaultMode
  const p = def.variants[mode] ?? def.variants[def.defaultMode]!
  if (key === 'light') return { ...p, primary: pr.accent || p.primary, accent: pr.accent || p.accent }
  return p
}
export function applyTokens(t: Tokens, root = document.documentElement, key?: string) {
  if (key) root.dataset.theme = key
  const set = (k: string, v: string) => root.style.setProperty(k, v)
  set('--bg', t.bg); set('--surface', t.surface); set('--surface-2', t.surface2); set('--surface-3', t.surface3); set('--line', t.line)
  set('--text', t.text); set('--muted', t.muted); set('--faint', t.faint); set('--accent', t.primary); set('--ok-solid', '#15803d'); set('--info-solid', '#0369a1'); set('--bad-solid', '#dc2626'); set('--accent-ink', t.accentInk); set('--accent-fg', t.accentFg)
  set('--secondary', t.secondary); set('--highlight', t.accent); set('--glow', t.glow)
  set('--ok', t.ok); set('--warn', t.warn); set('--bad', t.bad); set('--info', t.info)
  root.classList.toggle('dark', t.dark)
  root.style.colorScheme = t.dark ? 'dark' : 'light'
}
