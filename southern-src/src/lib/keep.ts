import { useEffect, useState } from 'react'
/** Page filters/tabs that survive leaving a page and coming BACK (browser/iOS back, header back arrow).
 *  Going forward to a page (menu, shortcut, search) starts it fresh, so links still land on the default view. */
import { FRAMED } from './backstack'
const PFX = FRAMED ? `sc-keep-f-${new URLSearchParams(location.search).get('as') || 'x'}:` : 'sc-keep:'
export function freshPage(page: string) {
  try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(`${PFX}${page}:`)) sessionStorage.removeItem(k) } catch { /* private mode */ }
}
export function clearKeep() { try { for (const k of Object.keys(sessionStorage)) if (k.startsWith(PFX)) sessionStorage.removeItem(k) } catch { /* */ } }
export function useKeep<T>(key: string, init: T | (() => T)) {
  const [v, setV] = useState<T>(() => {
    try { const raw = sessionStorage.getItem(PFX + key); if (raw != null) return JSON.parse(raw) as T } catch { /* */ }
    return typeof init === 'function' ? (init as () => T)() : init
  })
  useEffect(() => { try { sessionStorage.setItem(PFX + key, JSON.stringify(v)) } catch { /* */ } }, [key, v])
  return [v, setV] as const
}
