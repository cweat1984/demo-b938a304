/** Storage robustness: every saved store is checked against its built-in defaults on load. A store whose saved shape is
 *  wrong (null where an object belongs, an object where a list belongs, wrong types…) falls back to its defaults — per
 *  store, per field — instead of white-screening the app. A small "Some saved data was reset" notice is shown. */
import { toast } from 'sonner'
import type { StoreApi } from 'zustand'
import { useBranding } from '../data/branding'
import { useL2 } from '../launch2/l2store'
import { useUnion } from '../union/ustore'
import { useTurbineCounty } from '../union/turbine'
import { useUnionNotes } from '../union/unionNotes'
import { useB4 } from '../batch4/b4store'
import { useB3 } from '../batch3b/b3store'
import { usePresent } from './present'
import { useG } from '../gapb/gstore'
import { useNavPrefs } from '../nav/prefs'

export const resetLog: string[] = []
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
/** Returns a copy of `cur` with every field that doesn't match the shape of `def` replaced by the default. */
export function conform(def: unknown, cur: unknown, depth = 0): { v: unknown; bad: boolean } {
  if (def === undefined || def === null || typeof def === 'function') return { v: cur, bad: false }
  if (Array.isArray(def)) return Array.isArray(cur) ? { v: cur, bad: false } : { v: def, bad: true }
  if (isObj(def)) {
    if (!isObj(cur)) return { v: def, bad: true }
    if (depth > 2) return { v: cur, bad: false }
    let bad = false; const out: Record<string, unknown> = { ...cur }
    for (const k of Object.keys(def)) { if (!(k in cur) || cur[k] === undefined) continue; const r = conform(def[k], cur[k], depth + 1); if (r.bad) { bad = true; out[k] = r.v } }
    return { v: out, bad }
  }
  return typeof cur === typeof def ? { v: cur, bad: false } : { v: def, bad: true }
}
type Persisted = StoreApi<object> & { persist?: { getOptions: () => { name?: string } } }
const STORES: [string, Persisted][] = [['Company branding', useBranding], ['Store & expenses', useL2], ['Union rate profiles', useUnion], ['Turbine counties', useTurbineCounty], ['Union notes', useUnionNotes], ['Maintenance & messages', useB4], ['Recon & site library', useB3], ['Presenter mode', usePresent], ['Fuel, permits & time off', useG], ['Menu & tabs', useNavPrefs]] as unknown as [string, Persisted][]

export function guardStores() {
  window.addEventListener('sc-data-reset', e => { if (document.documentElement.dataset.guest === '1') return; const k = (e as CustomEvent<string[]>).detail ?? []; toast.warning('Some saved data was reset', { id: 'db-reset', description: `${k.length} saved list${k.length === 1 ? ' was' : 's were'} unreadable (${k.slice(0, 4).join(', ')}${k.length > 4 ? '…' : ''}) and went back to the sample data.`, duration: 9000 }) })
  for (const [label, st] of STORES) {
    try {
      const def = st.getInitialState() as Record<string, unknown>, cur = st.getState() as Record<string, unknown>
      const data = Object.fromEntries(Object.entries(cur).filter(([, v]) => typeof v !== 'function'))
      const r = conform(Object.fromEntries(Object.entries(def).filter(([, v]) => typeof v !== 'function')), data)
      if (r.bad) { st.setState(r.v as object); resetLog.push(label) }
    } catch {
      try { const n = st.persist?.getOptions().name; if (n) localStorage.removeItem(n); st.setState(st.getInitialState()); resetLog.push(label) } catch { /* */ }
    }
  }
  resetLog.push(...((globalThis as { __scResetLog?: string[] }).__scResetLog ?? []).filter(x => !resetLog.includes(x)))
  // guests (view-only pass) never see storage housekeeping notices
  const guest = () => { try { return new URLSearchParams(location.search).has('guest') || !!sessionStorage.getItem('sc-guest') || document.documentElement.dataset.guest === '1' } catch { return false } }
  if (resetLog.length && !guest()) setTimeout(() => !guest() && toast.warning('Some saved data was reset', { id: 'storage-reset', description: `Saved data for ${resetLog.join(', ')} was unreadable on this device, so it went back to the defaults.`, duration: 9000 }), 1800)
}
/** Saved-data keys behind each page, for the "Reset this section" button. */
export const PAGE_KEYS: Record<string, string[]> = {
  rigging: ['sc-rig-v1'], moves: ['sc-moves-v2'], permits: ['sc-gapb'], fuel: ['sc-gapb'], pto: ['sc-gapb'], union: ['sc-union', 'sc-union-notes', 'sc-turbine-county'],
  bids: ['sc-bids-v2'], pickup: ['sc-pickup-v2'], branding: ['sc-branding-v1'], store: ['sc-launch2'], expenses: ['sc-launch2'], onboarding: ['sc-launch2'],
  maint: ['sc-batch4'], messages: ['sc-batch4'], mgmt: ['sc-batch4'], acctsync: ['sc-batch4'], recon: ['sc-batch3b'], changeorders: ['sc-batch3b'], sitedata: ['sc-batch3b'],
  certtracker: ['sc-batch3b', 'sc-nccco-v1', 'sc-dq-v1'], drugalc: ['sc-da-v1'], tickets: ['sc-npt-v1'], weather: ['sc-wx-standdowns'], settings: ['sc-prefs', 'sc-nav-v1'],
}
/** Keys never cleared by a section reset (sign-in, guest pass state, PIN lockout). */
const KEEP = /^sc-(guest|gp-|tour|session)/
export function resetSection(page: string) {
  const keys = page !== '*' && PAGE_KEYS[page] ? PAGE_KEYS[page] : Object.keys(localStorage).filter(k => k.startsWith('sc-') && !KEEP.test(k))
  keys.forEach(k => localStorage.removeItem(k))
  if (page === '*') { try { indexedDB.deleteDatabase('southern-command') } catch { /* */ } }
  setTimeout(() => location.reload(), 150)
}
