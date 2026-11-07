/** Paints the chosen background photo behind the app (body background) with a readability overlay. Field app and guests excluded. */
import { useEffect, useState } from 'react'
import { useStore } from '../data/store'
import { useBg, listPhotos, pickIndex, brandKey } from './backgrounds'
import { useBranding } from '../data/branding'
import { guestContext } from '../guest/pass'

export default function BrandBackground() {
  const { s, rev } = useBg(), session = useStore(x => x.session), brand = brandKey(useBranding(x => x.b.name)) // dive3 shop M11
  const [urls, setUrls] = useState<string[]>([]), [tick, setTick] = useState(0)
  const excluded = session?.role === 'field' || session?.role === 'guest' || !!guestContext()
  useEffect(() => { let live = true, made: string[] = []
    if (!s.on || excluded) { setUrls([]); return }
    listPhotos(brand).then(ps => { if (!live) return; made = ps.map(p => URL.createObjectURL(p.blob)); setUrls(made) }, () => setUrls([]))
    return () => { live = false; setTimeout(() => made.forEach(u => URL.revokeObjectURL(u)), 60000) } }, [s.on, rev, excluded, brand])
  useEffect(() => { if (!s.rotateMin) return; const t = setInterval(() => setTick(x => x + 1), 30000); return () => clearInterval(t) }, [s.rotateMin])
  const inApp = !!session, field = session?.role === 'field', guest = session?.role === 'guest' || !!guestContext()
  const show = s.on && urls.length > 0 && !field && !guest && (s.where === 'both' || (s.where === 'login' ? !inApp : inApp))
  const idx = show ? pickIndex(urls.length, s.rotateMin) : -1
  useEffect(() => { const h = document.documentElement
    if (idx < 0) { delete h.dataset.bgphoto; h.style.removeProperty('--bg-photo'); return }
    h.dataset.bgphoto = '1'; h.style.setProperty('--bg-photo', `url("${urls[idx]}")`); h.style.setProperty('--bg-ov', String(Math.max(45, s.overlay) / 100)) }, [idx, urls, s.overlay, tick])
  return null
}
