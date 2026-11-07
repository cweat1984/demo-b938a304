/** Per-user navigation prefs (this device): pinned favorites, auto-tracked recents, and the 4 bottom-bar tabs on phones. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PageKey } from '../data/roles'
type ByUser<T> = Record<string, T>
interface NavPrefs { pins: ByUser<string[]>; recent: ByUser<PageKey[]>; tabs: ByUser<PageKey[]>; view: 'sections' | 'az'
  togglePin: (u: string, k: string) => void; visit: (u: string, k: PageKey) => void; toggleTab: (u: string, k: PageKey, fallback: PageKey[]) => 'added' | 'removed' | 'full'; resetTabs: (u: string) => void; setView: (v: 'sections' | 'az') => void }
export const useNavPrefs = create<NavPrefs>()(persist((set, get) => ({
  pins: {}, recent: {}, tabs: {}, view: 'sections',
  togglePin: (u, k) => { const cur = get().pins[u] ?? []; set({ pins: { ...get().pins, [u]: cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k].slice(-8) } }) },
  visit: (u, k) => { const cur = get().recent[u] ?? []; if (cur[0] === k) return; set({ recent: { ...get().recent, [u]: [k, ...cur.filter(x => x !== k)].slice(0, 6) } }) },
  toggleTab: (u, k, fallback) => { const cur = get().tabs[u] ?? fallback
    if (cur.includes(k)) { if (cur.length <= 1) return 'full'; set({ tabs: { ...get().tabs, [u]: cur.filter(x => x !== k) } }); return 'removed' }
    if (cur.length >= 4) return 'full'
    set({ tabs: { ...get().tabs, [u]: [...cur, k] } }); return 'added' },
  resetTabs: u => { const t = { ...get().tabs }; delete t[u]; set({ tabs: t }) },
  setView: view => set({ view }),
}), { name: 'sc-nav-v1' }))
/** One key per person + role so a shared demo device keeps each login's favorites apart. */
export const userKey = (s: { role: string; name: string } | null) => (s ? `${s.role}:${s.name}` : 'anon')
