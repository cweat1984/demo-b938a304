/** Presentation mode: bigger type, stronger contrast, no dev/feedback clutter — for projectors and screen-sharing. Shift+P toggles. */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
export const usePresent = create<{ on: boolean; set: (v: boolean) => void }>()(persist(set => ({ on: false, set: on => set({ on }) }), { name: 'sc-present' }))
export function bindPresent() {
  const apply = (on: boolean) => document.documentElement.classList.toggle('presenting', on)
  apply(usePresent.getState().on); usePresent.subscribe(s => apply(s.on))
  // Presentation mode belongs to the presenter's session — turn it off on sign-out so the next person doesn't inherit it.
  import('../data/store').then(({ useStore }) => useStore.subscribe((s, p) => { if (p.session && !s.session && usePresent.getState().on) usePresent.getState().set(false) }))
  window.addEventListener('keydown', e => { if (e.shiftKey && (e.key === 'P' || e.key === 'p') && !(e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable]')) { const on = !usePresent.getState().on; usePresent.getState().set(on); toast(on ? 'Presentation mode on' : 'Presentation mode off', { id: 'present', description: on ? 'Bigger type for the projector. Shift+P again to turn it off.' : undefined, duration: 2200 }) } })
}
