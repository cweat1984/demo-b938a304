/** Rigging inspection program — ASME B30.9 (slings) and B30.26 (rigging hardware). Each physical sling/shackle gets a QR tag
 *  tied to its inventory SKU. Frequent = before every shift/use (visual, by the rigger); periodic = documented, at least every
 *  12 months (monthly–quarterly in severe service). Monthly color code: a piece whose tag isn't this month's color isn't used.
 *  Local store 'sc-rig-v1'. */
import { create } from 'zustand'
import type * as T from '../data/types'
import { today, addDays } from '../lib/util'
import { h, daysBetween, audit, load, save, type Tone } from './util'

export const MONTH_COLORS = [['January', 'White', '#f8fafc'], ['February', 'Green', '#22c55e'], ['March', 'Red', '#ef4444'], ['April', 'Orange', '#f97316'], ['May', 'Blue', '#3b82f6'], ['June', 'Yellow', '#facc15'], ['July', 'Purple', '#a855f7'], ['August', 'Brown', '#92400e'], ['September', 'Pink', '#ec4899'], ['October', 'Gray', '#9ca3af'], ['November', 'Black', '#111827'], ['December', 'Teal', '#14b8a6']] as const
export const colorOf = (d: string) => MONTH_COLORS[Number(d.slice(5, 7)) - 1]
export const SLING_CHECKS = ['ID tag present and legible (WLL, maker, type)', 'No cuts, tears, snags or crushing', 'No heat, chemical or UV damage (melting, charring, brittle)', 'Wire rope: no broken wires, kinks, birdcaging or core protrusion', 'Chain: no stretched, gouged or bent links; latches work', 'Fittings and eyes: no distortion, cracks or excessive wear']
export const HARDWARE_CHECKS = ['Rated load and maker marking legible', 'No bending, twisting, cracks or nicks in the bow/body', 'Pin straight, full thread engagement, cotter/nut present', 'Wear < 10% of original dimension', 'No heat damage, weld spatter or unauthorized repairs']
export const REMOVE_REASONS = ['Tag missing or illegible', 'Cut, tear or abrasion', 'Heat / chemical damage', 'Broken wires / kink / birdcage', 'Stretched or bent link', 'Bent or cracked shackle body', 'Bent pin / wrong pin', 'Excessive wear', 'Other']

export type RigStatus = 'In service' | 'Removed'
export interface RigInspection { at: string; by: string; kind: 'Frequent' | 'Periodic'; pass: boolean; notes?: string; failed?: string[] }
export interface RigPiece { tag: string; /** dive3 M10: checkout id while out */ out?: string; itemId: string; name: string; kind: 'Sling' | 'Shackle'; std: 'B30.9' | 'B30.26'; serial: string; wll: string; branchId: string; severe: boolean; colorDate: string; lastFrequent: string; lastPeriodic: string; status: RigStatus; removed?: { at: string; by: string; reason: string; note?: string }; history: RigInspection[] }

const KEY = 'sc-rig-v1'
export const periodicDays = (p: RigPiece) => p.severe ? 90 : 365
export function seedPieces(db: T.DB): RigPiece[] {
  const items = db.items.filter(i => i.category === 'Rigging' && (i.sub === 'Slings' || i.sub === 'Shackles'))
  const t = today(), out: RigPiece[] = []
  let n = 0
  items.forEach(it => {
    const isSling = /sling/i.test(it.name), qty = Math.min(6, Math.max(1, Math.round((it.onHand ?? 4) / 4)))
    for (let k = 0; k < qty; k++) {
      n++; const r = h(it.id + k)
      const severe = /wire|chain|55 t|85 t/i.test(it.name)
      const lastPeriodic = addDays(t, -Math.round(r * (severe ? 80 : 330)))
      out.push({ tag: `RG-${String(n).padStart(4, '0')}`, itemId: it.id, name: it.name, kind: isSling ? 'Sling' : 'Shackle', std: isSling ? 'B30.9' : 'B30.26', serial: `${(it.manufacturer ?? 'SN').split(' ')[0].slice(0, 3).toUpperCase()}-${Math.floor(r * 90000 + 10000)}`, wll: it.wll ?? '', branchId: it.branchId ?? 'br-okc', severe,
        colorDate: r < .12 ? addDays(t, -40) : lastPeriodic > addDays(t, -25) && lastPeriodic >= t.slice(0, 8) + '01' ? lastPeriodic : [addDays(t, -Math.round(r * 10)), t.slice(0, 8) + '01'].sort()[1], /* dive3 M10: in-service demo tags carry this month's colour */ lastFrequent: addDays(t, -Math.round(h(it.id + k + 'f') * 4)), lastPeriodic, status: 'In service', history: [{ at: lastPeriodic + 'T15:00:00.000Z', by: 'Cale Smith', kind: 'Periodic', pass: true }] })
    }
  })
  // Demo states: one overdue periodic, one wire-rope sling already removed (matches the inventory tag-out).
  if (out[2]) out[2].lastPeriodic = addDays(t, -380)
  const chain = out.find(p => /Chain sling/.test(p.name)); if (chain) { chain.status = 'Removed'; chain.removed = { at: addDays(t, -2), by: 'Cale Smith', reason: 'Stretched or bent link', note: 'Bent link on leg B — failed frequent inspection' } }
  return out
}
export function rigState(p: RigPiece): { tone: Tone; label: string; due: string } {
  const due = addDays(p.lastPeriodic, periodicDays(p)), left = daysBetween(today(), due)
  if (p.status === 'Removed') return { tone: 'bad', label: 'Removed from service', due }
  if (left < 0) return { tone: 'bad', label: `Periodic overdue ${-left} d`, due }
  if (colorOf(p.colorDate)[1] !== colorOf(today())[1]) return { tone: 'warn', label: `Wrong color (${colorOf(p.colorDate)[1]}) — inspect & re-tag`, due }
  if (left <= 30) return { tone: 'warn', label: `Periodic due in ${left} d`, due }
  return { tone: 'ok', label: 'In service', due }
}
interface S { pieces: RigPiece[] | null; ensure(db: T.DB): RigPiece[]; inspect(tag: string, i: Omit<RigInspection, 'at'>): void; remove(tag: string, by: string, reason: string, note?: string): void; restore(tag: string, by: string): void; reset(): void }
export const useRig = create<S>((set, get) => ({
  pieces: load<RigPiece[]>(KEY, 'array'),
  ensure(db) { let p = get().pieces; if (!p || !p.length) { p = seedPieces(db); save(KEY, p); set({ pieces: p }) } return p },
  inspect(tag, i) {
    const at = new Date().toISOString(), d = today()
    const pieces = (get().pieces ?? []).map(p => p.tag !== tag ? p : { ...p, history: [{ ...i, at }, ...p.history], lastFrequent: d, ...(i.kind === 'Periodic' && i.pass ? { lastPeriodic: d, colorDate: d } : {}) })
    save(KEY, pieces); set({ pieces }); audit(`Rigging ${i.kind.toLowerCase()} inspection`, tag, `${i.pass ? 'Pass' : 'Fail'}${i.failed?.length ? ' · ' + i.failed.join('; ') : ''}`)
  },
  remove(tag, by, reason, note) {
    const pieces = (get().pieces ?? []).map(p => p.tag !== tag ? p : { ...p, status: 'Removed' as const, removed: { at: today(), by, reason, note } })
    save(KEY, pieces); set({ pieces }); audit('Rigging removed from service', tag, `${reason}${note ? ' — ' + note : ''}`)
  },
  restore(tag, by) {
    const pieces = (get().pieces ?? []).map(p => p.tag !== tag ? p : { ...p, status: 'In service' as const, removed: undefined, lastPeriodic: today(), colorDate: today(), history: [{ at: new Date().toISOString(), by, kind: 'Periodic' as const, pass: true, notes: 'Repaired by manufacturer & proof-tested' }, ...p.history] })
    save(KEY, pieces); set({ pieces }); audit('Rigging returned to service', tag, `by ${by}`)
  },
  reset() { localStorage.removeItem(KEY); set({ pieces: null }) },
}))
export function rigAlerts(pieces: RigPiece[]) {
  const st = pieces.map(p => ({ p, s: rigState(p) }))
  return { overdue: st.filter(x => x.p.status !== 'Removed' && x.s.tone === 'bad'), soon: st.filter(x => x.s.tone === 'warn'), removed: st.filter(x => x.p.status === 'Removed') }
}

// dive2 shop M8: tie QR-tagged pieces to inventory checkout — only in-service, in-date tags can go out; a damaged return pulls a tag.
import { rigHooks } from '../data/store'
rigHooks.guard = (db, itemId, qty) => {
  const pieces = useRig.getState().ensure(db).filter(p => p.itemId === itemId); if (!pieces.length) return null
  const bad = pieces.filter(p => p.status === 'Removed' || rigState(p).tone === 'bad').length
  const it = db.items.find(i => i.id === itemId); const free = Math.max(0, (it?.onHand ?? 0) - bad)
  return bad && qty > free ? `Only ${free} can go out — ${bad} tagged piece${bad === 1 ? ' is' : 's are'} removed from service or overdue for inspection. Inspect or re-tag first.` : null
}
/** dive3 shop M10: why one tag can't go out right now (null = OK). Wrong colour counts — re-inspect and re-tag first. */
export function tagProblem(p: RigPiece): string | null {
  if (p.status === 'Removed') return `${p.tag} is removed from service`
  if (p.out) return `${p.tag} is already checked out`
  const s = rigState(p); if (s.tone === 'bad' || /Wrong color/.test(s.label)) return `${p.tag}: ${s.label}`
  return null
}
rigHooks.pick = (db, itemId, qty, tags) => {
  const pieces = useRig.getState().ensure(db).filter(p => p.itemId === itemId); if (!pieces.length) return {}
  if (tags?.length) {
    if (tags.length !== qty) return { error: `Pick ${qty} tag${qty === 1 ? '' : 's'} (${tags.length} picked)` }
    for (const t of tags) { const p = pieces.find(x => x.tag === t); if (!p) return { error: `${t} isn't a tag for this item` }; const why = tagProblem(p); if (why) return { error: why } }
    return { tags: [...tags] }
  }
  const good = pieces.filter(p => !tagProblem(p)).sort((a, b) => a.lastPeriodic.localeCompare(b.lastPeriodic))
  if (good.length < qty) { const bad = pieces.length - good.length; return { error: `Only ${good.length} tag${good.length === 1 ? '' : 's'} can go out — ${bad} removed, out, overdue or wrong colour. Inspect or re-tag first.` } }
  return { tags: good.slice(0, qty).map(p => p.tag) }
}
rigHooks.out = (tags, checkoutId) => { const st = useRig.getState(); const pieces = (st.pieces ?? []).map(p => tags.includes(p.tag) ? { ...p, out: checkoutId } : p); save(KEY, pieces); useRig.setState({ pieces }) }
rigHooks.back = tags => { const st = useRig.getState(); const pieces = (st.pieces ?? []).map(p => tags.includes(p.tag) ? { ...p, out: undefined } : p); save(KEY, pieces); useRig.setState({ pieces }) }
rigHooks.damaged = (itemId, qty, by, note, tags) => {
  if (tags?.length) rigHooks.back?.(tags)
  const st = useRig.getState(); const live = tags?.length ? (st.pieces ?? []).filter(p => tags.includes(p.tag)) : (st.pieces ?? []).filter(p => p.itemId === itemId && p.status !== 'Removed').slice(0, qty)
  live.forEach(p => st.remove(p.tag, by, 'Damaged on return', note))
}
