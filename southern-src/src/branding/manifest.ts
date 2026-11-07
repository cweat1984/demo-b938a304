/** Install name follows the white-label app name: swap the PWA manifest for a generated one when the owner renames the app.
 *  Icons stay the Arrowline marks (absolute URLs so they resolve from a blob manifest). */
import { PRODUCT_NAME } from '../data/brand'
let url: string | null = null
export function applyManifest(appName: string, company: string, theme = '#0b0d10') {
  const head = document.head; let link = head.querySelector<HTMLLinkElement>('link[rel=manifest]')
  const abs = (p: string) => new URL(p, location.href.split('#')[0].split('?')[0]).href
  if (appName === PRODUCT_NAME) { if (url && link) link.href = abs('./manifest.webmanifest'); return }
  const m = { name: `${appName} — ${company}`, short_name: appName.slice(0, 24), description: `${appName} for ${company}. Powered by Arrowline.`, start_url: abs('./'), scope: abs('./'), display: 'standalone', background_color: theme, theme_color: theme,
    icons: [{ src: abs('./arrowline-192.png'), sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: abs('./arrowline-512.png'), sizes: '512x512', type: 'image/png', purpose: 'any maskable' }] }
  if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(new Blob([JSON.stringify(m)], { type: 'application/manifest+json' }))
  if (!link) { link = document.createElement('link'); link.rel = 'manifest'; head.appendChild(link) }
  link.href = url
  let t = head.querySelector<HTMLMetaElement>('meta[name=apple-mobile-web-app-title]'); if (!t) { t = document.createElement('meta'); t.name = 'apple-mobile-web-app-title'; head.appendChild(t) } t.content = appName
}
