import { toast } from 'sonner'

/** Service worker with a demo-safe update flow: never swap code under the presenter — ask first. */
export function registerSW() {
  if (import.meta.env.VITE_PREVIEW_ISOLATE === '1') return // preview copy must not register a worker that could claim another site
  if (import.meta.env.VITE_GUEST_ONLY) return // guest-only page: no service worker
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  if (import.meta.env.MODE === 'standalone') { // single-file build: lightweight offline worker (network-first, cache fallback)
    if (location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw-lite.js', { scope: './' }).catch(() => {})
    return
  }
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload() } })
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      const prompt = (w: ServiceWorker) => toast('New version ready', { description: 'Reload when you’re between screens — nothing is lost.', duration: Infinity, action: { label: 'Reload', onClick: () => w.postMessage({ type: 'SKIP_WAITING' }) } })
      if (reg.waiting && navigator.serviceWorker.controller) prompt(reg.waiting)
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return
        w.addEventListener('statechange', () => {
          if (w.state !== 'installed') return
          if (navigator.serviceWorker.controller) prompt(w) // first install: silently ready offline
        })
      })
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000)
    } catch { /* offline-first is a bonus, never a blocker */ }
  })
}
