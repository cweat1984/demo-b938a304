/** Guest sessions on a shared browser must not read or overwrite staff side stores.
 *  Staff rows stay where they are. A guest page sees empty copies and cannot write the staff keys.
 *  Installed only when this document is already a guest context, before stores hydrate. */
import { guestContext } from '../guest/pass'

/** Same allow-list as guest/guard.ts — session, tips, and the guest pass itself. */
const KEY_OK = /^sc-(session|prefs|present|nav-v1|tips?|inv-tips|cmd-q|certhub-tab|fbdock-y|feedback-v1|keep|guest$|guest-hint|guest-device|guest-locked|gp-|brief|role-brief|tour)/
const STAFF_DB = new Set(['sc-backgrounds', 'southern-command', 'sc-files'])

function staffKey(k: string) {
  return k.startsWith('sc-') && !KEY_OK.test(k)
}

if (guestContext()) {
  const get = Storage.prototype.getItem
  const set = Storage.prototype.setItem
  const rm = Storage.prototype.removeItem
  Storage.prototype.getItem = function (k: string) {
    if (this === localStorage && staffKey(k)) return null
    return get.call(this, k)
  }
  Storage.prototype.setItem = function (k: string, v: string) {
    if (this === localStorage && staffKey(k)) return
    return set.call(this, k, v)
  }
  Storage.prototype.removeItem = function (k: string) {
    if (this === localStorage && staffKey(k)) return
    return rm.call(this, k)
  }

  const origOpen = IDBFactory.prototype.open
  IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
    if (!STAFF_DB.has(name)) return origOpen.call(this, name, version)
    const req = origOpen.call(this, '__sc_guest_partition__', 1)
    req.addEventListener('upgradeneeded', () => {
      const db = req.result
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv')
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
    })
    return req
  }
}
