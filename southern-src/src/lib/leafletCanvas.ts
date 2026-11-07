/** WebKit throws `this._ctx.clearRect` when a Leaflet canvas redraw runs after the map is removed.
 *  Leaflet cancels the animation frame in `_destroyContainer`, then deletes `_ctx`. WebKit can still
 *  deliver that frame. Swallow only that unmounted redraw. A missing context while the canvas element
 *  is still on the map is a real failure and still throws. */
import L from 'leaflet'

type CanvasSelf = {
  _ctx?: CanvasRenderingContext2D | null
  _container?: HTMLElement | null
  _map?: { _container?: HTMLElement | null } | null
  _redrawRequest?: number | null
  _redrawBounds?: unknown
  _clear: () => void
  _redraw: () => void
  _update: () => void
  _draw: () => void
}

const proto = L.Canvas.prototype as unknown as CanvasSelf
let installed = false

function unmounted(self: CanvasSelf) {
  return !self._ctx && !self._container
}

function guard(self: CanvasSelf) {
  if (self._ctx) return false
  if (unmounted(self)) {
    self._redrawRequest = null
    self._redrawBounds = null
    return true
  }
  throw new TypeError('Leaflet canvas context missing during redraw')
}

export function installLeafletCanvasGuard() {
  if (installed) return
  installed = true
  const clear = proto._clear, redraw = proto._redraw, update = proto._update, draw = proto._draw
  proto._clear = function (this: CanvasSelf) { if (guard(this)) return; return clear.call(this) }
  proto._draw = function (this: CanvasSelf) { if (guard(this)) return; return draw.call(this) }
  proto._redraw = function (this: CanvasSelf) {
    if (guard(this)) return
    return redraw.call(this)
  }
  proto._update = function (this: CanvasSelf) {
    if (!this._map || !this._container) return
    if (guard(this)) return
    return update.call(this)
  }
}

/** Stop animations and drop any queued canvas frame before Leaflet deletes the context. */
export function removeLeafletMap(map: L.Map) {
  installLeafletCanvasGuard()
  try { map.stop() } catch { /* already stopped */ }
  const cancel = (r: { _redrawRequest?: number | null } | null | undefined) => {
    if (!r || r._redrawRequest == null) return
    try { L.Util.cancelAnimFrame(r._redrawRequest) } catch { /* ignore */ }
    r._redrawRequest = null
  }
  try {
    map.eachLayer(layer => cancel((layer as unknown as { _renderer?: { _redrawRequest?: number | null } })._renderer))
    const layers = (map as unknown as { _layers?: Record<string, { _redrawRequest?: number | null; _renderer?: { _redrawRequest?: number | null } }> })._layers
    if (layers) for (const layer of Object.values(layers)) { cancel(layer); cancel(layer._renderer) }
  } catch { /* map is already tearing down */ }
  try { map.off() } catch { /* ignore */ }
  try { map.remove() } catch { /* ignore */ }
}

installLeafletCanvasGuard()
