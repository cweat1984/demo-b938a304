/** Browser/iOS back for overlays: every open sheet (and each drill-down level inside the record drawer) gets a history entry,
 *  so the back button / edge-swipe closes the top one instead of leaving the app. Closing from the UI rewinds the entry. */
/** Inside an iframe (side-by-side phone + office demo, tour frames) the browser shares ONE back history with the
 *  outer page, so framed copies keep their own in-memory history instead of touching the real one. */
export const FRAMED = (() => { try { return window.self !== window.top } catch { return true } })()
/** Set the URL hash; framed copies replace (no shared-history entry). */
export function setHash(h: string, state?: object) { if (FRAMED) history.replaceState(state ?? history.state, '', '#' + h); else { location.hash = h; if (state) history.replaceState(state, '') } }
/** In-memory page history for framed copies. */
export const memPages: string[] = []
type Entry = { id: number; close: () => void; restore?: () => void }
const stack: Entry[] = []
let closed: Entry[] = []
let seq = Number(history.state?.scO ?? 0), pendingBacks = 0
const queue: (() => void)[] = []
/** Run fn after any rewind we started has landed (so a hash change right after closing a sheet isn't undone). */
export function afterBack(fn: () => void) { if (pendingBacks > 0) queue.push(fn); else fn() }
export function pushOverlay(close: () => void, restore?: () => void) { const id = ++seq; stack.push({ id, close, restore }); closed = closed.filter(e => e.id !== id); if (!FRAMED) afterBack(() => history.pushState({ ...(history.state ?? {}), scO: id }, '')); return id }
/** The UI closed overlay `id` (and anything above it): drop their history entries. */
export function popOverlay(id: number) {
  const i = stack.findIndex(e => e.id === id); if (i < 0) return
  const n = stack.length - i; stack.splice(i)
  if (!FRAMED && Number(history.state?.scO ?? 0) >= id) { pendingBacks++; history.go(-n) }
}
export const overlayDepth = () => stack.length
if (typeof window !== 'undefined') window.addEventListener('popstate', () => {
  if (pendingBacks > 0) { pendingBacks--; if (!pendingBacks) queue.splice(0).forEach(f => f()); return }
  const cur = Number(history.state?.scO ?? 0)
  const top = stack.length ? stack[stack.length - 1].id : 0
  if (top > cur) { while (stack.length && stack[stack.length - 1].id > cur) { const e = stack.pop()!; closed.push(e); e.close() } }
  else if (cur > top) {
    const back = closed.filter(e => e.id > top && e.id <= cur).sort((a, b) => a.id - b.id)
    closed = closed.filter(e => e.id <= top || e.id > cur)
    back.forEach(e => { stack.push(e); e.restore?.() })
  }
})
