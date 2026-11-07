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
/** Revoked pass ids (not the signed links). Readable so this browser honors a revoke; not writable from a guest page. */
const REV_READ = 'sc-guest-revoked'

if (guestContext()) {
  const get = Storage.prototype.getItem
  const set = Storage.prototype.setItem
  const rm = Storage.prototype.removeItem
  Storage.prototype.getItem = function (k: string) {
    if (this === localStorage && staffKey(k) && k !== REV_READ) return null
    return get.call(this, k)
  }
  Storage.prototype.setItem = function (k: string, v: string) {
    if (this === localStorage && (staffKey(k) || k === REV_READ)) return
    return set.call(this, k, v)
  }
  Storage.prototype.removeItem = function (k: string) {
    if (this === localStorage && (staffKey(k) || k === REV_READ)) return
    return rm.call(this, k)
  }

  const origOpen = IDBFactory.prototype.open
  // A fresh empty database per guest page. Callers may create their own stores.
  // Do not open or copy the staff databases, and do not pre-create stores (that collides with the caller's upgrade).
  const part = sessionStorage.getItem('sc-guest-idb') || ('__sc_guest_' + Math.random().toString(36).slice(2))
  try { sessionStorage.setItem('sc-guest-idb', part) } catch { /* private mode */ }
  IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
    if (!STAFF_DB.has(name)) return origOpen.call(this, name, version)
    return origOpen.call(this, part, version ?? 1)
  }
}
