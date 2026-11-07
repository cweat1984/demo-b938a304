import { removeLeafletMap } from '../lib/leafletCanvas'
import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import { useStore } from '../data/store'
import { tokens, resolvePalette } from '../data/themes'
import type * as T from '../data/types'
import type { WFarm, WTurbine } from '../data/wind'

const esri = (layer: string) => `https://server.arcgisonline.com/ArcGIS/rest/services/${layer}/MapServer/tile/{z}/{y}/{x}`
function useTk() { const prefs = useStore(s => s.prefs); return tokens(resolvePalette(prefs, matchMedia('(prefers-color-scheme: dark)').matches)) }
export const PIN_COLORS: Record<T.SitePinKind, string> = { 'O&M': '#38bdf8', Gate: '#f59e0b', Laydown: '#a78bfa', Substation: '#f472b6', Other: '#94a3b8' }
const PIN_GLYPH: Record<T.SitePinKind, string> = { 'O&M': 'O&amp;M', Gate: 'GATE', Laydown: 'LAY', Substation: 'SUB', Other: 'PIN' }
export const pinIcon = (kind: T.SitePinKind) => L.divIcon({ className: '', iconSize: [46, 30], iconAnchor: [23, 30], html: `<div style="display:flex;flex-direction:column;align-items:center"><div style="background:${PIN_COLORS[kind]};color:#0b0d10;font:800 9px/1 Inter,system-ui;padding:5px 6px;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,.45);border:1.5px solid #fff;white-space:nowrap">${PIN_GLYPH[kind]}</div><div style="width:2px;height:8px;background:#fff"></div></div>` })

/** Directory map: every farm, clustered. */
export function FarmClusterMap({ farms, onOpen, height = 560 }: { farms: WFarm[]; onOpen: (id: string) => void; height?: number }) {
  const el = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), layer = useRef<L.MarkerClusterGroup | null>(null)
  const tk = useTk()
  useEffect(() => {
    const m = L.map(el.current!, { scrollWheelZoom: true, attributionControl: true }).setView([34.8, -99.5], 6)
    m.attributionControl.setPrefix('')
    L.tileLayer(esri(tk.dark ? 'Canvas/World_Dark_Gray_Base' : 'Canvas/World_Light_Gray_Base'), { maxZoom: 16, attribution: 'Tiles © Esri · Turbines: USWTDB (USGS/LBNL/ACP)', crossOrigin: true }).addTo(m)
    map.current = m
    const ro = new ResizeObserver(() => { if ((m as unknown as { _loaded?: boolean })._loaded && m.getContainer().isConnected) m.invalidateSize({ pan: false }) }); ro.observe(el.current!)
    return () => { ro.disconnect(); removeLeafletMap(m); map.current = null }
  }, [tk.dark])
  useEffect(() => {
    const m = map.current; if (!m) return
    layer.current?.remove()
    const g = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 48, iconCreateFunction: c => { const n = c.getChildCount(); const s = n < 10 ? 34 : n < 50 ? 42 : 50; return L.divIcon({ className: '', iconSize: [s, s], html: `<div style="width:${s}px;height:${s}px;border-radius:999px;display:grid;place-items:center;background:${tk.primary};color:${tk.accentInk};font:700 12px Inter,system-ui;box-shadow:0 0 0 6px ${tk.primary}33">${n}</div>` }) } })
    farms.forEach(f => { const r = Math.max(5, Math.min(14, Math.sqrt(f.mw || 1) * 0.9)); const mk = L.circleMarker([f.lat, f.lng], { radius: r, color: '#fff', weight: 1.2, fillColor: '#38bdf8', fillOpacity: 0.85 }); mk.bindTooltip(`<b>${f.name}</b><br>${f.st} · ${f.n} turbines · ${Math.round(f.mw)} MW`); mk.on('click', () => onOpen(f.id)); g.addLayer(mk as unknown as L.Marker) })
    g.addTo(m); layer.current = g
    if (farms.length && farms.length < 400) { const b = L.latLngBounds(farms.map(f => [f.lat, f.lng] as [number, number])); m.fitBounds(b.pad(0.15), { maxZoom: 10, animate: false }) }
  }, [farms, tk.dark])
  return <div ref={el} style={{ height }} className="rounded-3xl overflow-hidden border hairline z-0" data-testid="farm-cluster-map" />
}

/** Farm map: every turbine as a pin (USWTDB coordinates) + company site pins (O&M, gate, laydown, substation). */
export function TurbineMap({ farm, turbines, labels, info, selected, onToggle, pins, dropKind, onDrop, onMovePin, height = 520, satellite = true, focus, compact }: {
  farm: WFarm; turbines: WTurbine[]; labels: (t: WTurbine, i: number) => string; info?: (t: WTurbine) => string; selected: Set<number>; onToggle?: (t: WTurbine, i: number) => void
  pins: T.SitePin[]; dropKind?: T.SitePinKind | null; onDrop?: (lat: number, lng: number) => void; onMovePin?: (id: string, lat: number, lng: number) => void; height?: number; satellite?: boolean; focus?: [number, number] | null; compact?: boolean
}) {
  const online = useStore(s => s.ui.online) // field fixes (n12): say so when tiles can't load
  const el = useRef<HTMLDivElement>(null), map = useRef<L.Map | null>(null), tl = useRef<L.LayerGroup | null>(null), pl = useRef<L.LayerGroup | null>(null), base = useRef<L.TileLayer | null>(null)
  const drop = useRef(onDrop); drop.current = onDrop
  const dk = useRef(dropKind); dk.current = dropKind
  const tk = useTk()
  useEffect(() => {
    const m = L.map(el.current!, { scrollWheelZoom: !compact, zoomControl: !compact, preferCanvas: true }).setView([farm.lat, farm.lng], 12)
    ;(el.current as unknown as { __map: L.Map }).__map = m
    m.attributionControl.setPrefix('')
    tl.current = L.layerGroup().addTo(m); pl.current = L.layerGroup().addTo(m)
    m.on('click', e => { if (dk.current && drop.current) drop.current(e.latlng.lat, e.latlng.lng) })
    map.current = m
    const ro = new ResizeObserver(() => { if ((m as unknown as { _loaded?: boolean })._loaded && m.getContainer().isConnected) m.invalidateSize({ pan: false }) }); ro.observe(el.current!)
    return () => { ro.disconnect(); removeLeafletMap(m); map.current = null }
  }, [farm.id])
  useEffect(() => {
    const m = map.current; if (!m) return
    base.current?.remove()
    base.current = L.tileLayer(esri(satellite ? 'World_Imagery' : tk.dark ? 'Canvas/World_Dark_Gray_Base' : 'Canvas/World_Light_Gray_Base'), { maxZoom: 18, attribution: satellite ? 'Imagery © Esri, Maxar, Earthstar Geographics · Turbines: USWTDB' : 'Tiles © Esri · Turbines: USWTDB', crossOrigin: true }).addTo(m)
    base.current.bringToBack()
  }, [satellite, tk.dark, farm.id])
  useEffect(() => {
    const m = map.current, g = tl.current; if (!m || !g) return
    g.clearLayers()
    let nOn = 0 // alternate label sides so neighbouring selected turbines don't cover each other
    turbines.forEach((t, i) => {
      const on = selected.has(t[0])
      const mk = L.circleMarker([t[3], t[2]], { radius: on ? 9 : 5.5, color: on ? '#fff' : '#0b0d10', weight: on ? 3 : 1.2, fillColor: on ? tk.primary : '#e5e7eb', fillOpacity: 1, className: `${on ? 'turbine-on ' : ''}t-${t[0]}` })
      if (compact) { const left = on && (nOn++ % 2 === 1); mk.bindTooltip(labels(t, i) + (info ? ` · ${info(t)}` : ''), { permanent: true, direction: left ? 'left' : 'right', offset: [left ? -8 : 8, 0], className: 'tlabel' }) }
      else mk.bindTooltip(`<b>${labels(t, i)}</b> · USWTDB ${t[0]}${info ? `<br>${info(t)}` : ''}${t[1] ? `<br>FAA ${t[1]}` : ''}`, { permanent: on, direction: 'top', offset: [0, -8] })
      ;(mk as unknown as { __caseId: number }).__caseId = t[0]
      if (onToggle) mk.on('click', e => { L.DomEvent.stopPropagation(e); onToggle(t, i) })
      g.addLayer(mk)
    })
  }, [turbines, selected, labels, info, tk.primary])
  useEffect(() => {
    const g = pl.current; if (!g) return
    g.clearLayers()
    pins.forEach(p => { const mk = L.marker([p.lat, p.lng], { icon: pinIcon(p.kind), draggable: !!onMovePin, zIndexOffset: 1000 }); if (!compact) mk.bindTooltip(`${p.label}${p.demo ? ' · demo' : ''}`, { direction: 'top', offset: [0, -28] }); if (onMovePin) mk.on('dragend', () => { const ll = mk.getLatLng(); onMovePin(p.id, ll.lat, ll.lng) }); g.addLayer(mk) })
  }, [pins, onMovePin])
  useEffect(() => {
    const m = map.current; if (!m) return
    if (focus) { m.setView(focus, 15, { animate: true }); return }
    const pts = [...turbines.map(t => [t[3], t[2]] as [number, number]), ...pins.map(p => [p.lat, p.lng] as [number, number])]
    if (pts.length) m.fitBounds(L.latLngBounds(pts).pad(compact ? 0.3 : 0.08), { maxZoom: compact ? 14 : 15, animate: false })
  }, [turbines.length, farm.id, focus?.[0], focus?.[1]])
  useEffect(() => { el.current?.classList.toggle('cursor-crosshair', !!dropKind) }, [dropKind])
  return <div className="relative"><div ref={el} style={{ height }} className="rounded-3xl overflow-hidden border hairline z-0 [&.cursor-crosshair_.leaflet-container]:cursor-crosshair" data-testid="turbine-map" />{!online && <div className="absolute left-2 right-2 top-2 z-[500] rounded-xl bg-black/75 text-white text-sm px-3 py-2 pointer-events-none" data-testid="map-offline">No signal — map pictures won’t load. Pins, turbine list and Directions still work.</div>}</div>
}
