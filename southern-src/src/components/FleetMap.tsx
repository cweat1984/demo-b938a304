import { removeLeafletMap } from '../lib/leafletCanvas'
import { useEffect, useRef } from 'react'
import { tokens, resolvePalette } from '../data/themes'
import L from 'leaflet'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import states from '../data/states.json'
import { EQ_STATUS_COLOR } from './bits'
import { eqLabel } from '../data/logic'

const SPEED = 60 // demo time-lapse for vehicles in transit (1 min real = 1 hr on the road)
export function routePos(r: NonNullable<T.Equipment['route']>, mountedAt: number): [number, number] {
  const d = new Date(r.depart).getTime(), e = new Date(r.eta).getTime()
  const t = Math.max(0.03, Math.min(0.985, (Date.now() - d + (Date.now() - mountedAt) * SPEED) / (e - d)))
  return [r.from[0] + (r.to[0] - r.from[0]) * t, r.from[1] + (r.to[1] - r.from[1]) * t]
}

function icon(e: T.Equipment, selected: boolean) {
  const c = EQ_STATUS_COLOR[e.status]
  if (e.category === 'Crane') {
    const s = selected ? 36 : 28
    return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<div class="sc-marker" style="width:${s}px;height:${s}px">${e.status === 'Out of Service' || e.status === 'In Transit' || selected ? `<span class="ring" style="background:${c}"></span>` : ''}<div class="sc-pin" style="position:relative;width:${s}px;height:${s}px;background:${c};color:${inkOn(c)};text-shadow:none;font-size:${e.unit.length > 3 ? 9 : 11}px">${e.unit}</div></div>` })
  }
  if (e.category === 'Semi' || e.category === 'Pickup') {
    const s = selected ? 26 : 20
    return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<div class="sc-marker" style="width:${s}px;height:${s}px">${e.status === 'In Transit' || e.status === 'Out of Service' ? `<span class="ring" style="background:${c}"></span>` : ''}<div class="sc-pin" style="position:relative;width:${s}px;height:${s}px;border-radius:7px;background:${c}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg></div></div>` })
  }
  const s = 10
  return L.divIcon({ className: '', iconSize: [s, s], iconAnchor: [s / 2, s / 2], html: `<div style="width:${s}px;height:${s}px;border-radius:3px;background:${c};opacity:.8;box-shadow:0 0 0 2px rgba(0,0,0,.35)"></div>` })
}

/** Dark ink on bright status colours (sky, green, amber), white on red/dark, so unit numbers stay readable in every theme. */
function inkOn(hex: string) { const m = hex.replace('#', '').match(/../g); if (!m || m.length < 3) return '#fff'; const [r, g, b] = m.slice(0, 3).map(x => parseInt(x, 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0b0d10' : '#fff' }

export default function FleetMap({ units, height = 520, sites = [], onSelect, selected, center, zoom, branches = true, className, pick }: {
  units: T.Equipment[]; height?: number | string; sites?: { lat: number; lng: number; label: string; tone?: string; onClick?: () => void }[]; onSelect?: (e: T.Equipment) => void; selected?: string
  center?: [number, number]; zoom?: number; branches?: boolean; className?: string; pick?: (lat: number, lng: number) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const tiles = useRef<L.TileLayer | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const mounted = useRef(Date.now())
  const prefs = useStore(s => s.prefs)
  const db = useStore(s => s.db)
  const tk = tokens(resolvePalette(prefs, matchMedia('(prefers-color-scheme: dark)').matches))
  const dark = tk.dark
  const fitted = useRef(false)

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, preferCanvas: false }).setView(center ?? [33.6, -98.4], zoom ?? 6)
    m.attributionControl.setPrefix('')
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    L.geoJSON(states as GeoJSON.FeatureCollection, {
      style: f => ({ color: f?.properties?.name === 'Oklahoma' || f?.properties?.name === 'Texas' ? tk.primary : '#64748b', weight: f?.properties?.name === 'Oklahoma' || f?.properties?.name === 'Texas' ? 1.4 : 0.6, opacity: 0.55, fillOpacity: f?.properties?.name === 'Oklahoma' || f?.properties?.name === 'Texas' ? 0.04 : 0, fillColor: tk.primary }),
      interactive: false,
    }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    if (pick) m.on('click', e => pick(e.latlng.lat, e.latlng.lng))
    const ro = new ResizeObserver(() => { if ((m as unknown as { _loaded?: boolean })._loaded && m.getContainer().isConnected) m.invalidateSize({ pan: false }) }); ro.observe(el.current)
    return () => { ro.disconnect(); removeLeafletMap(m); map.current = null; markers.current.clear() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const m = map.current; if (!m) return
    tiles.current?.remove()
    tiles.current = L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base'}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 16, attribution: 'Tiles © Esri — Esri, HERE, Garmin, © OpenStreetMap contributors', crossOrigin: true }).addTo(m)
    tiles.current.bringToBack()
  }, [dark])

  useEffect(() => { if (center && map.current) map.current.setView(center, zoom ?? map.current.getZoom(), { animate: true }) }, [center?.[0], center?.[1], zoom])

  useEffect(() => {
    const m = map.current, lg = layer.current; if (!m || !lg) return
    lg.clearLayers(); markers.current.clear()
    if (branches) db.branches.forEach(b => L.marker([b.lat, b.lng], { zIndexOffset: 1000, icon: L.divIcon({ className: '', iconSize: [70, 22], iconAnchor: [35, 40], html: `<div style="display:flex;align-items:center;justify-content:center;height:22px;border-radius:7px;background:#0b0d10;color:white;border:1px solid rgba(255,255,255,.25);font:700 10px 'Barlow Condensed',sans-serif;letter-spacing:.06em">${b.code}${b.hq ? ' ★' : ''}</div>` }), interactive: false }).addTo(lg))
    sites.forEach(s => L.circleMarker([s.lat, s.lng], { radius: 5, color: s.tone ?? '#38bdf8', weight: 1.5, fillOpacity: 0.25 }).bindTooltip(s.label, { className: 'sc-tip', direction: 'top' }).on('click', () => s.onClick?.()).addTo(lg))
    units.forEach(u => {
      if (u.route && u.status === 'In Transit') L.polyline([u.route.from, u.route.to], { color: '#f59e0b', weight: 2, opacity: 0.55, dashArray: '4 6' }).addTo(lg)
      const pos: [number, number] = u.route && u.status === 'In Transit' ? routePos(u.route, mounted.current) : [u.lat, u.lng]
      const mk = L.marker(pos, { icon: icon(u, u.id === selected), zIndexOffset: u.category === 'Crane' ? 500 : u.category === 'Semi' ? 300 : 0 })
        .bindTooltip(`<b>${eqLabel(u)}</b><br/><span style="opacity:.7">${u.make} ${u.model} · ${u.status}${u.route && u.status === 'In Transit' ? `<br/>→ ${u.route.toName}` : ''}</span>`, { className: 'sc-tip', direction: 'top', offset: [0, -10] })
      if (onSelect) mk.on('click', () => onSelect(u))
      mk.addTo(lg); markers.current.set(u.id, mk)
    })
    if (!center && !fitted.current && units.length > 1) {
      fitted.current = true
      const pts = units.map(u => [u.lat, u.lng] as [number, number])
      m.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 8, animate: false })
    }
  }, [units, sites, selected, db.branches, branches, onSelect])

  useEffect(() => {
    const t = setInterval(() => { units.forEach(u => { if (u.route && u.status === 'In Transit') markers.current.get(u.id)?.setLatLng(routePos(u.route, mounted.current)) }) }, 1000)
    return () => clearInterval(t)
  }, [units])

  return <div ref={el} className={`themed-map ${className ?? ''}`} style={{ height, width: '100%', borderRadius: 'inherit' }} />
}
