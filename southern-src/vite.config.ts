import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'
import fs from 'node:fs'
import path from 'node:path'

/** dive3 B1: guest-only build — the demo seed generator is swapped for a pre-scrubbed dataset (no phones, pay or, for
 *  Demo/Operations passes, money); the "Everything" copy is encrypted and only opens with an Everything pass. */
const guestOnly = (on: boolean) => ({
  name: 'guest-only', enforce: 'pre' as const,
  resolveId(id: string, importer?: string) {
    if (id === 'virtual:guest-data') return '\0guest-data'
    if (on && importer && /[\\/]src[\\/]/.test(importer) && !importer.endsWith('seed.guest.ts') && /(^|\/)seed$/.test(id)) return path.resolve(process.cwd(), 'src/data/seed.guest.ts')
  },
  load(id: string) { if (id === '\0guest-data') return `export default ${on && process.env.GUEST_DATA_FILE ? fs.readFileSync(process.env.GUEST_DATA_FILE, 'utf8') : '{"day":"","base":null,"all":null}'}` },
})

export default defineConfig(({ mode }) => {
  const guest = mode === 'guest'
  const standalone = mode === 'standalone' || guest
  return {
    base: './',
    plugins: [
      guestOnly(guest),
      react(),
      tailwindcss(),
      ...(standalone
        ? [viteSingleFile()]
        : [
            VitePWA({
              registerType: 'prompt',
              injectRegister: false,
              includeAssets: ['icon.svg'],
              manifest: {
                name: 'Southern Command — Southern Lifting & Hoisting',
                short_name: 'Southern Command',
                description: 'One system that runs Southern Lifting & Hoisting: dispatch, cranes, crews, safety, time, shop.',
                theme_color: '#0b0d10',
                background_color: '#0b0d10',
                display: 'standalone',
                start_url: './',
                scope: './',
                icons: [
                  { src: 'arrowline-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
                  { src: 'arrowline-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
                  { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2,json,pdf}'],
                maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
                runtimeCaching: [
                  {
                    urlPattern: /^https:\/\/server\.arcgisonline\.com\/.*/,
                    handler: 'CacheFirst',
                    options: { cacheName: 'map-tiles', expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 30 }, plugins: [{ handlerDidError: async () => new Response(null, { status: 204, statusText: 'offline tile' }) }] }, // field fixes: offline tiles fail quietly (no uncaught SW errors)
                  },
                ],
              },
            }),
          ]),
    ],
    build: standalone ? { outDir: guest ? 'dist-guest' : 'dist-standalone', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 } : { chunkSizeWarningLimit: 2000 },
  }
})
