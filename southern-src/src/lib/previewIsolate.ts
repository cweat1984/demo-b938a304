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

if (ON) {
  const nativeKey = Storage.prototype.key
  const nativeLength = Object.getOwnPropertyDescriptor(Storage.prototype, 'length')?.get
  const previewNames = (store: Storage) => {
    const out: string[] = []
    const n = nativeLength ? nativeLength.call(store) : store.length
    for (let i = 0; i < n; i++) {
      const k = nativeKey.call(store, i)
      if (k && k.startsWith(PREFIX)) out.push(k)
    }
    return out
  }
  for (const store of [localStorage, sessionStorage]) {
    const get = store.getItem.bind(store)
    const set = store.setItem.bind(store)
    const rm = store.removeItem.bind(store)
    store.getItem = (k: string) => get(mapKey(k))
    store.setItem = (k: string, v: string) => set(mapKey(k), v)
    store.removeItem = (k: string) => rm(mapKey(k))
    store.clear = () => { for (const k of previewNames(store)) rm(k) }
    store.key = (i: number) => previewNames(store)[i] ?? null
    if (nativeLength) Object.defineProperty(store, 'length', { configurable: true, get: () => previewNames(store).length })
  }

  const origOpen = IDBFactory.prototype.open
  const origDelete = IDBFactory.prototype.deleteDatabase
  IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
    return origOpen.call(this, mapDb(name), version)
  }
  IDBFactory.prototype.deleteDatabase = function (this: IDBFactory, name: string) {
    return origDelete.call(this, mapDb(name))
  }

  if (typeof BroadcastChannel !== 'undefined') {
    const OrigBC = BroadcastChannel
    const Wrapped = function (this: BroadcastChannel, name: string) {
      return new OrigBC(name.startsWith(PREFIX) ? name : PREFIX + name)
    } as unknown as typeof BroadcastChannel
    Wrapped.prototype = OrigBC.prototype
    window.BroadcastChannel = Wrapped
  }

  const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
  if (cookieDesc?.get && cookieDesc?.set) {
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
  }

  if ('caches' in window) {
    const open = caches.open.bind(caches)
    const del = caches.delete.bind(caches)
    const keys = caches.keys.bind(caches)
    caches.open = (name: string) => open(mapDb(name))
    caches.delete = (name: string) => del(mapDb(name))
    caches.keys = async () => (await keys()).filter(k => k.startsWith(PREFIX))
  }

  if (navigator.serviceWorker) {
    const sw = navigator.serviceWorker
    sw.register = (() => Promise.resolve(null)) as unknown as typeof sw.register
    sw.getRegistrations = async () => []
    sw.getRegistration = async () => undefined
  }

  document.documentElement.dataset.previewIsolate = '1'
}
