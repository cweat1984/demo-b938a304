/** First module in the app. A foreign frame must stop here, before any import reads
 *  sessionStorage — Chrome denies storage in another site's iframe, and that throw used to
 *  happen before the frame message could render. Same-origin frames (Phone + office) continue. */
const foreignFrame = (() => {
  if (window.top === window.self) return false
  try { return window.parent.location.origin !== location.origin } catch { return true }
})()
if (foreignFrame) {
  const href = location.origin + location.pathname
  document.documentElement.innerHTML = '<head><meta charset="utf-8"><title>Southern Command</title></head><body><div style="font:16px system-ui;padding:40px;text-align:center;color:#ddd;background:#0b0d10;min-height:100vh">This app can’t be shown inside another site. <a style="color:#7cc4ff" target="_top" rel="noopener" href="' + href + '">Open it in its own tab</a>.</div></body>'
  await new Promise(() => {})
}

/** Preview builds only (VITE_PREVIEW_ISOLATE=1). Production builds leave this off.
 *  A preview page on the same origin must not read, write, clear, or sync the live demo.
 *  Not a password and not a guest key. */
const ON = import.meta.env.VITE_PREVIEW_ISOLATE === '1'
const PREFIX = 'sc-preview-'
const COOKIE_PREFIX = 'scpv_'

function mapKey(k: string) {
  if (k.startsWith(PREFIX)) return k
  if (k.startsWith('sc-')) return PREFIX + k.slice(3)
  return PREFIX + 'k-' + k
}

function mapDb(name: string) {
  if (name.startsWith(PREFIX)) return name
  return PREFIX + name
}

function previewPath() {
  const p = location.pathname
  return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1) || '/'
}

function warn(step: string, err: unknown) {
  console.warn('preview isolate:', step, err)
}

/** Patch Storage.prototype, not the localStorage object. Firefox refuses a getter defined on the instance (`can't define a getter/setter for element 'length'`), and that throw used to stop the app before React. Methods stay non-enumerable so they don't appear in Object.keys(localStorage). */
function isolateStorage() {
  const proto = Storage.prototype
  const native = {
    getItem: proto.getItem,
    setItem: proto.setItem,
    removeItem: proto.removeItem,
    clear: proto.clear,
    key: proto.key,
  }
  const nativeLength = Object.getOwnPropertyDescriptor(proto, 'length')?.get
  const ours = (store: Storage) => store === localStorage || store === sessionStorage
  const names = (store: Storage) => {
    const out: string[] = []
    const n = nativeLength ? nativeLength.call(store) : 0
    for (let i = 0; i < n; i++) {
      const k = native.key.call(store, i)
      if (k && k.startsWith(PREFIX)) out.push(k)
    }
    return out
  }
  const hide = (name: 'getItem' | 'setItem' | 'removeItem' | 'clear' | 'key', value: Function) => {
    Object.defineProperty(proto, name, { configurable: true, enumerable: false, writable: true, value })
  }
  hide('getItem', function (this: Storage, k: string) { return ours(this) ? native.getItem.call(this, mapKey(k)) : native.getItem.call(this, k) })
  hide('setItem', function (this: Storage, k: string, v: string) { return ours(this) ? native.setItem.call(this, mapKey(k), v) : native.setItem.call(this, k, v) })
  hide('removeItem', function (this: Storage, k: string) { return ours(this) ? native.removeItem.call(this, mapKey(k)) : native.removeItem.call(this, k) })
  hide('clear', function (this: Storage) { if (!ours(this)) return native.clear.call(this); for (const k of names(this)) native.removeItem.call(this, k) })
  hide('key', function (this: Storage, i: number) { return ours(this) ? (names(this)[i] ?? null) : native.key.call(this, i) })
  if (nativeLength) {
    Object.defineProperty(proto, 'length', {
      configurable: true,
      enumerable: false,
      get() { return ours(this) ? names(this).length : nativeLength.call(this) },
    })
  }
}

if (ON) {
  try {
    const step = (name: string, fn: () => void) => { try { fn() } catch (err) { warn(name, err) } }
    step('storage', isolateStorage)
    step('indexedDB', () => {
      const origOpen = IDBFactory.prototype.open
      const origDelete = IDBFactory.prototype.deleteDatabase
      IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
        return origOpen.call(this, mapDb(name), version)
      }
      IDBFactory.prototype.deleteDatabase = function (this: IDBFactory, name: string) {
        return origDelete.call(this, mapDb(name))
      }
    })
    step('broadcast', () => {
      if (typeof BroadcastChannel === 'undefined') return
      const OrigBC = BroadcastChannel
      const Wrapped = function (this: BroadcastChannel, name: string) {
        return new OrigBC(name.startsWith(PREFIX) ? name : PREFIX + name)
      } as unknown as typeof BroadcastChannel
      Wrapped.prototype = OrigBC.prototype
      window.BroadcastChannel = Wrapped
    })
    step('cookie', () => {
      const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
      if (!cookieDesc?.get || !cookieDesc?.set) return
      const read = cookieDesc.get
      const write = cookieDesc.set
      const show = (raw: string) => raw.split('; ').filter(p => p.startsWith(COOKIE_PREFIX)).map(p => p.slice(COOKIE_PREFIX.length)).join('; ')
      const hide = (cookie: string) => {
        const semi = cookie.indexOf(';')
        const pair = (semi === -1 ? cookie : cookie.slice(0, semi)).trim()
        const rest = semi === -1 ? '' : cookie.slice(semi)
        const eq = pair.indexOf('=')
        const name = (eq === -1 ? pair : pair.slice(0, eq)).trim()
        const value = eq === -1 ? '' : pair.slice(eq + 1)
        if (!name) return cookie
        const nextName = name.startsWith(COOKIE_PREFIX) ? name : COOKIE_PREFIX + name
        const path = previewPath()
        const attrs = /path=/i.test(rest) ? rest.replace(/path=[^;]*/i, 'path=' + path) : rest + '; path=' + path
        return nextName + '=' + value + attrs
      }
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get() { return show(read.call(document)) },
        set(v: string) { write.call(document, hide(v)) },
      })
    })
    step('caches', () => {
      if (!('caches' in window)) return
      const open = caches.open.bind(caches)
      const del = caches.delete.bind(caches)
      const keys = caches.keys.bind(caches)
      caches.open = (name: string) => open(mapDb(name))
      caches.delete = (name: string) => del(mapDb(name))
      caches.keys = async () => (await keys()).filter(k => k.startsWith(PREFIX))
    })
    step('serviceWorker', () => {
      if (!navigator.serviceWorker) return
      const sw = navigator.serviceWorker
      sw.register = (() => Promise.resolve(null)) as unknown as typeof sw.register
      sw.getRegistrations = async () => []
      sw.getRegistration = async () => undefined
    })
    try { document.documentElement.dataset.previewIsolate = '1' } catch (err) { warn('marker', err) }
  } catch (err) { warn('all', err) }
}
