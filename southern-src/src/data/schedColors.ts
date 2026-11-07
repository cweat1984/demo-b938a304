/** Milestone 2c: customizable schedule / forecast colors with a legend and color-blind-safe patterns.
 *  Defaults follow the customer's Annual sheet: very light green = working, dark green = moving / rigging up,
 *  light blue = travel, purple = out of state. Red is reserved for conflicts — it can never mean "available". */
import type React from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { hexToRgb, contrast } from './themes'
import type { RigPhase } from './rig'

export type SchedCat = 'working' | 'moving' | 'travel' | 'outstate' | 'off' | 'open' | 'conflict'
export type Pattern = 'none' | 'diag' | 'dots' | 'cross' | 'hlines' | 'dense'
export const SCHED_CATS: { id: SchedCat; label: string; hint: string }[] = [
  { id: 'working', label: 'Working', hint: 'On the job, lifting' },
  { id: 'moving', label: 'Moving / rigging up', hint: 'Rig up, rig down, moving on site' },
  { id: 'travel', label: 'Travel', hint: 'Driving in or out' },
  { id: 'outstate', label: 'Out of state', hint: 'Job site outside the home branch’s state' },
  { id: 'off', label: 'Off / shop / down', hint: 'Maintenance, out of service, PTO' },
  { id: 'open', label: 'Available', hint: 'Open time to sell' },
  { id: 'conflict', label: 'Conflict', hint: 'Double-booked — needs a fix' }]
export const SCHED_DEFAULTS: Record<SchedCat, string> = { working: '#cdeccf', moving: '#1f6b3a', travel: '#a9d4f5', outstate: '#7b4fb5', off: '#9aa0a6', open: '#e6e9ee', conflict: '#c62828' }
export const SCHED_PATTERNS: Record<SchedCat, Pattern> = { working: 'none', moving: 'diag', travel: 'dots', outstate: 'cross', off: 'hlines', open: 'none', conflict: 'dense' }

/** Hue (0–360) and saturation (0–1) of a hex color. */
export function hsl(hex: string) { const [r, g, b] = hexToRgb(hex).map(v => v / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
  if (!d) return { h: 0, s: 0, l }; const s = d / (1 - Math.abs(2 * l - 1)); let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; return { h, s, l } }
export const isReddish = (hex: string) => { const { h, s, l } = hsl(hex); return (h >= 340 || h <= 25) && s >= 0.3 && l > 0.12 && l < 0.88 }
/** CIE76 ΔE between two colours (≥ 15 reads as clearly different on a projector). */
export function deltaE(a: string, b: string) {
  const lab = (hex: string) => { const [r, g, bl] = hexToRgb(hex).map(v => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92 })
    const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
    const x = f((r * 0.4124 + g * 0.3576 + bl * 0.1805) / 0.95047), y = f(r * 0.2126 + g * 0.7152 + bl * 0.0722), z = f((r * 0.0193 + g * 0.1192 + bl * 0.9505) / 1.08883)
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)] }
  const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]) }
export const MIN_DELTA_E = 15
/** Division markers never borrow the conflict red (dive3 dispatch M7): a red division colour shows as neutral slate. */
export const divMark = (c?: string) => !c ? '#64748b' : /^#[0-9a-f]{6}$/i.test(c) && isReddish(c) ? '#64748b' : c
/** Why a color can't be used for a category (or null when it's fine). */
export function colorProblem(cat: SchedCat, hex: string, all: Record<SchedCat, string>): string | null {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return 'Use a 6-digit color like #1F6B3A'
  // dive3 dispatch M7: red is locked to Conflict, and Conflict is locked to red
  if (cat === 'conflict' && !isReddish(hex)) return 'Conflict must stay a red — red always means “needs a fix”'
  if (cat !== 'conflict' && isReddish(hex)) return `Red means conflict — it can’t be used for “${SCHED_CATS.find(c => c.id === cat)!.label}”`
  const twin = SCHED_CATS.find(c => c.id !== cat && all[c.id].toLowerCase() === hex.toLowerCase()); if (twin) return `Same color as “${twin.label}” — pick a different one so the legend stays clear`
  const near = SCHED_CATS.find(c => c.id !== cat && deltaE(all[c.id], hex) < MIN_DELTA_E); if (near) return `Too close to “${near.label}” — pick a color that’s easier to tell apart`
  return null }

/** Keep only stored colours that still pass today's rules (older saves may hold a red "Available"). */
export function cleanColors(raw?: Partial<Record<string, string>>): Record<SchedCat, string> {
  const out = { ...SCHED_DEFAULTS }
  for (const c of SCHED_CATS) { const v = raw?.[c.id]; if (typeof v === 'string' && !colorProblem(c.id, v, { ...out, [c.id]: SCHED_DEFAULTS[c.id] })) out[c.id] = v.toLowerCase() }
  return out }
export const useSchedColors = create<{ colors: Record<SchedCat, string>; patterns: boolean; set: (cat: SchedCat, hex: string) => string | null; setPatterns: (v: boolean) => void; reset: () => void; adopt: (c?: Partial<Record<string, string>>) => void }>()(persist((set, get) => ({
  colors: { ...SCHED_DEFAULTS }, patterns: true,
  set: (cat, hex) => { const p = colorProblem(cat, hex, get().colors); if (p) return p; set({ colors: { ...get().colors, [cat]: hex.toLowerCase() } }); return null },
  setPatterns: v => set({ patterns: v }), reset: () => set({ colors: { ...SCHED_DEFAULTS }, patterns: true }),
  adopt: c => { if (!c) return; const next = cleanColors(c); if (SCHED_CATS.some(x => next[x.id] !== get().colors[x.id])) set({ colors: next }) } }),
  { name: 'sc-sched-colors-v1', partialize: s => ({ colors: s.colors, patterns: s.patterns }), merge: (p, c) => { const q = (p ?? {}) as Partial<{ colors: Record<SchedCat, string>; patterns: boolean }>; return { ...c, patterns: q.patterns ?? true, colors: cleanColors(q.colors) } } }))

const ink = (bg: string) => contrast('#111111', bg) >= contrast('#ffffff', bg) ? '#111111' : '#ffffff'
function pattern(p: Pattern, fg: string): string | undefined {
  const c = fg === '#ffffff' ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.22)'
  switch (p) {
    case 'diag': return `repeating-linear-gradient(45deg, ${c} 0 2px, transparent 2px 7px)`
    case 'dense': return `repeating-linear-gradient(-45deg, ${c} 0 3px, transparent 3px 6px)`
    case 'cross': return `repeating-linear-gradient(45deg, ${c} 0 1.5px, transparent 1.5px 7px), repeating-linear-gradient(-45deg, ${c} 0 1.5px, transparent 1.5px 7px)`
    case 'dots': return `radial-gradient(${c} 1.3px, transparent 1.6px)`
    case 'hlines': return `repeating-linear-gradient(0deg, ${c} 0 1.5px, transparent 1.5px 6px)`
    default: return undefined } }
/** Inline style for a schedule cell / bar / chip of this category (color + optional pattern + readable text color). */
export function schedStyle(cat: SchedCat, colors: Record<SchedCat, string>, patterns: boolean): React.CSSProperties {
  const bg = colors[cat], fg = ink(bg), img = patterns ? pattern(SCHED_PATTERNS[cat], fg) : undefined
  return { backgroundColor: bg, color: fg, backgroundImage: img, backgroundSize: SCHED_PATTERNS[cat] === 'dots' ? '6px 6px' : undefined } }
export const useSchedStyle = () => { const { colors, patterns } = useSchedColors(); return (cat: SchedCat) => schedStyle(cat, colors, patterns) }
/** Rig phase → schedule category. Move-in days are the travel days; rig up / down are moving & rigging. */
export const phaseCat = (ph: RigPhase): SchedCat => ph === 'work' ? 'working' : ph === 'move' ? 'travel' : 'moving'
/** True when the job's site is in a different state than the home branch (crane's or job's branch). */
export function outOfState(db: { sites: { id: string; state: string }[]; branches: { id: string; state: string }[] }, job: { siteId: string; branchId?: string }, branchId?: string) {
  const s = db.sites.find(x => x.id === job.siteId)?.state, b = db.branches.find(x => x.id === (branchId ?? job.branchId))?.state
  return !!s && !!b && s.trim().toUpperCase() !== b.trim().toUpperCase() }
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') (window as unknown as { __colors: unknown }).__colors = { colorProblem, cleanColors, deltaE, divMark, useSchedColors }
