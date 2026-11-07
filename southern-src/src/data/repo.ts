// Data repository. Today: on-device IndexedDB (works offline). Tomorrow: swap for a REST/Quickbase-backed
// implementation with the same interface — UI and business rules do not change.
import type { DB } from './types'
import { seed, DB_VERSION } from './seed'

export interface DataRepository {
  name: string
  load(): Promise<DB>
  save(db: DB): Promise<void>
  reset(): Promise<DB>
}

const DB_NAME = 'southern-command'
const STORE = 'kv'
const KEY = 'db'
/** yyyy-MM-dd in America/Chicago (company HQ). */
export const chicagoDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error)
  })
}
async function get<T>(key: string): Promise<T | undefined> {
  const d = await idb()
  return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readonly').objectStore(STORE).get(key); tx.onsuccess = () => res(tx.result as T); tx.onerror = () => rej(tx.error) })
}
async function put(key: string, val: unknown): Promise<void> {
  const d = await idb()
  return new Promise((res, rej) => { const tx = d.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error) })
}

export const localRepository: DataRepository = {
  name: 'On-device (IndexedDB) — demo',
  async load() {
    try {
      const db = await get<DB>(KEY)
      // Demo data is generated relative to "today" so the demo always looks live. Day = America/Chicago (not UTC, which rolled over at 7 PM CT).
      // Never wipe user changes: re-seed only when empty, on a version bump, or when a stale-day DB has no user edits.
      const touched = !!db && (db.audit ?? []).some(a => a.at > db.seededAt)
      const fresh = db && db.version === DB_VERSION && (chicagoDay(new Date(db.seededAt)) === chicagoDay(new Date()) || touched)
      if (fresh) return db!
    } catch { /* fall through */ }
    return this.reset()
  },
  async save(db) { try { await put(KEY, db) } catch { try { localStorage.setItem('sc-db-fallback', JSON.stringify(db)) } catch { /* quota */ } } },
  async reset() { const db = seed(); await this.save(db); return db },
}

/** Example of how a production adapter would plug in (not active in demo). */
export const restRepositoryExample = (baseUrl: string): DataRepository => ({
  name: `REST API ${baseUrl}`,
  load: async () => (await fetch(`${baseUrl}/snapshot`, { credentials: 'include' })).json(),
  save: async db => { await fetch(`${baseUrl}/snapshot`, { method: 'PUT', body: JSON.stringify(db), credentials: 'include' }) },
  reset: async () => (await fetch(`${baseUrl}/reset`, { method: 'POST', credentials: 'include' })).json(),
})
