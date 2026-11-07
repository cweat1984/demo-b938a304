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
 *  Prefixes this app's storage so opening a preview cannot read or write the live demo,
 *  even if both are on the same origin. Not a password and not a guest key. */
const ON = import.meta.env.VITE_PREVIEW_ISOLATE === '1'
const PREFIX = 'sc-preview-'

function mapKey(k: string) {
  if (!k.startsWith('sc-') || k.startsWith(PREFIX)) return k
  return PREFIX + k.slice(3)
}

if (ON) {
  for (const store of [localStorage, sessionStorage]) {
    const get = store.getItem.bind(store)
    const set = store.setItem.bind(store)
    const rm = store.removeItem.bind(store)
    store.getItem = (k: string) => get(mapKey(k))
    store.setItem = (k: string, v: string) => set(mapKey(k), v)
    store.removeItem = (k: string) => rm(mapKey(k))
  }
  const origOpen = IDBFactory.prototype.open
  IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
    const next = name === 'southern-command' || name.startsWith('sc-') ? PREFIX + name : name
    return origOpen.call(this, next, version)
  }
  document.documentElement.dataset.previewIsolate = '1'
}
