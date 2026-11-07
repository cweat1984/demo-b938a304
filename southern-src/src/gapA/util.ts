/** Gap batch A — shared helpers. All gapA stores are local-only (localStorage), separate from the main db. */
import { useStore } from '../data/store'
import { toast } from 'sonner'
export const h = (s: string) => { let x = 2166136261; for (const c of s) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return (x >>> 0) / 4294967296 }
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00') - Date.parse(a + 'T12:00')) / 864e5)
export type Tone = 'ok' | 'warn' | 'bad'
/** Writes an audit-log line without touching the main db. */
export const audit = (action: string, entity: string, detail: string) => useStore.getState().commit(action, entity, detail, () => {}, { silent: true })
/** `kind` = the shape the caller expects; a saved value of the wrong shape is treated as missing (→ defaults), never a crash. */
export const load = <T,>(k: string, kind?: 'array' | 'object'): T | null => { try { const v = localStorage.getItem(k); if (!v) return null; const x = JSON.parse(v); if (kind === 'array' ? !Array.isArray(x) || x.some(i => !i || typeof i !== 'object') : kind === 'object' ? !x || typeof x !== 'object' || Array.isArray(x) : false) return null; return x as T } catch { return null } }
// field fixes: never swallow a failed save — tell the user (once per 10 s) and return false so callers can react
let lastWarn = 0
export const storageFull = () => { if (Date.now() - lastWarn > 10000) { lastWarn = Date.now(); toast.error('Couldn’t save on this phone', { description: 'Storage is full. Delete old photos or free up space — your last change may not be kept.' }) } }
export const save = (k: string, v: unknown): boolean => { try { localStorage.setItem(k, JSON.stringify(v)); return true } catch { storageFull(); return false } }
