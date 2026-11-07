/** Offline field mode: every change made without signal is applied on the device and queued, then "sent" when signal returns. */
import { create } from 'zustand'
import { useStore } from '../data/store'
import { uid } from '../lib/util'

export type QKind = 'Check-in' | 'Photo' | 'Ticket' | 'Time' | 'Other'
export interface QItem { id: string; kind: QKind; label: string; at: string; state: 'queued' | 'syncing' | 'sent' }
interface QS { items: QItem[]; simulated: boolean; lastSync?: string }
const KEY = 'sc-offline-queue'
export const useQueue = create<QS>(() => { try { return { simulated: false, ...JSON.parse(localStorage.getItem(KEY) || '{"items":[]}') } } catch { return { items: [], simulated: false } } })
const save = () => { const s = useQueue.getState(); localStorage.setItem(KEY, JSON.stringify({ items: s.items.filter(i => i.state !== 'sent'), lastSync: s.lastSync })) }
export const isOnline = () => useStore.getState().ui.online && !useQueue.getState().simulated && navigator.onLine !== false
export function enqueue(kind: QKind, label: string) { useQueue.setState(s => ({ items: [...s.items, { id: uid('q'), kind, label, at: new Date().toISOString(), state: 'queued' }] })); save() }
const classify = (a: string): QKind => /ticket|sign/i.test(a) ? 'Ticket' : /clock|time|break|hours/i.test(a) ? 'Time' : /check.?in|arriv/i.test(a) ? 'Check-in' : /photo|picture|upload/i.test(a) ? 'Photo' : 'Other'
const SKIP = /^(Signed in|Read notification|Suggestion shipped)$/

let installed = false
/** Wrap the store's commit so every write made offline is queued (still applied locally — nothing is lost). */
export function installOfflineQueue() {
  if (installed) return; installed = true
  const orig = useStore.getState().commit
  useStore.setState({ commit: ((action: string, entity: string, detail: string, recipe: never, opts: never) => {
    orig(action, entity, detail, recipe, opts)
    if (!isOnline() && !SKIP.test(action)) enqueue(classify(action), `${action} — ${entity}`)
  }) as typeof orig })
  useStore.subscribe((s, p) => { if (s.ui.online && !p.ui.online && !useQueue.getState().simulated) flush() })
  window.addEventListener('online', () => { if (!useQueue.getState().simulated) flush() })
}
export function setSimulatedOffline(v: boolean) {
  useQueue.setState({ simulated: v })
  useStore.getState().setUI({ online: !v && navigator.onLine !== false })
  if (!v) flush()
}
let flushing = false // dive3 O-sync: the online event and the toggle both flush — one pass only, one toast
export async function flush(onDone?: (n: number) => void) {
  if (flushing) return 0
  const pending = useQueue.getState().items.filter(i => i.state === 'queued'); if (!pending.length) return 0
  flushing = true; try {
  for (const it of pending) {
    useQueue.setState(s => ({ items: s.items.map(x => x.id === it.id ? { ...x, state: 'syncing' } : x) }))
    await new Promise(r => setTimeout(r, 260))
    useQueue.setState(s => ({ items: s.items.map(x => x.id === it.id ? { ...x, state: 'sent' } : x) }))
  }
  useQueue.setState({ lastSync: new Date().toISOString() }); save()
  setTimeout(() => { useQueue.setState(s => ({ items: s.items.filter(x => x.state !== 'sent') })); save() }, 2500)
  window.dispatchEvent(new CustomEvent('sc-synced', { detail: pending.length })); onDone?.(pending.length)
  return pending.length
  } finally { flushing = false }
}
