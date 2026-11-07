/** In-memory roster undo. Not written to localStorage. Cleared on role change, reset, and when another tab replaces the database.
 *  Phase one covers dispatch roster edits only (assign, move, replace, unassign). Audit rows are never deleted. */
import { useStore } from '../data/store'
import type { Assignment } from '../data/types'

const MAX = 30
export type RosterPatch = { label: string; added: Assignment[]; removed: Assignment[]; scope: string }

let undoStack: RosterPatch[] = []
let redoStack: RosterPatch[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(fn => fn())

export function undoScope() {
  const s = useStore.getState().session
  if (!s || s.role === 'guest') return ''
  return `${s.role}:${s.employeeId ?? ''}:${s.signedInAt}`
}

export function clearUndo() {
  if (!undoStack.length && !redoStack.length) return
  undoStack = []
  redoStack = []
  publish()
}

let snap = { canUndo: false, canRedo: false, undoLabel: '', redoLabel: '' }
function publish() {
  const scope = undoScope()
  const undo = scope && undoStack[0]?.scope === scope ? undoStack[0] : undefined
  const redo = scope && redoStack[0]?.scope === scope ? redoStack[0] : undefined
  const next = { canUndo: !!undo, canRedo: !!redo, undoLabel: undo?.label ?? '', redoLabel: redo?.label ?? '' }
  if (next.canUndo === snap.canUndo && next.canRedo === snap.canRedo && next.undoLabel === snap.undoLabel && next.redoLabel === snap.redoLabel) return
  snap = next
  emit()
}
export function undoState() { return snap }

export function subscribeUndo(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function sameSlot(a: Assignment, b: Assignment) {
  return a.employeeId === b.employeeId && a.jobId === b.jobId && a.date === b.date && a.position === b.position
}

function conflict(added: Assignment[], removed: Assignment[]) {
  const db = useStore.getState().db
  for (const a of added) {
    const cur = db.assignments.find(x => x.id === a.id)
    if (!cur || !sameSlot(cur, a)) return 'That roster change was already edited'
  }
  for (const a of removed) {
    const person = db.employees.find(e => e.id === a.employeeId)
    if (!person || person.ssHold || person.status === 'Inactive') return 'That person can’t be put back on the board'
    if (db.assignments.some(x => x.id === a.id || (x.employeeId === a.employeeId && x.jobId === a.jobId && x.date === a.date))) return 'That seat is already filled'
  }
  return ''
}

function apply(drop: Assignment[], restore: Assignment[], label: string) {
  useStore.getState().commit(label, 'Roster', label, db => {
    const ids = new Set(drop.map(a => a.id))
    db.assignments = db.assignments.filter(a => !ids.has(a.id))
    for (const a of restore) {
      if (!db.assignments.some(x => x.id === a.id || (x.employeeId === a.employeeId && x.jobId === a.jobId && x.date === a.date))) db.assignments.push({ ...a })
    }
  })
}

/** Record a roster edit. `before` is the assignment list from before the edit. */
export function noteRosterChange(label: string, before: Assignment[]) {
  const scope = undoScope()
  if (!scope) return
  const after = useStore.getState().db.assignments
  const added = after.filter(a => !before.some(b => b.id === a.id)).map(a => ({ ...a }))
  const removed = before.filter(a => !after.some(b => b.id === a.id)).map(a => ({ ...a }))
  if (!added.length && !removed.length) return
  undoStack = [{ label, added, removed, scope }, ...undoStack].slice(0, MAX)
  redoStack = []
  publish()
}

export function undoRoster(): string {
  const scope = undoScope()
  const entry = undoStack[0]
  if (!scope || !entry || entry.scope !== scope) return ''
  const why = conflict(entry.added, entry.removed)
  if (why) { undoStack = undoStack.slice(1); publish(); return why }
  undoStack = undoStack.slice(1)
  apply(entry.added, entry.removed, `Undo: ${entry.label}`)
  redoStack = [entry, ...redoStack].slice(0, MAX)
  publish()
  return ''
}

export function redoRoster(): string {
  const scope = undoScope()
  const entry = redoStack[0]
  if (!scope || !entry || entry.scope !== scope) return ''
  const why = conflict(entry.removed, entry.added)
  if (why) { redoStack = redoStack.slice(1); publish(); return why }
  redoStack = redoStack.slice(1)
  apply(entry.removed, entry.added, `Redo: ${entry.label}`)
  undoStack = [entry, ...undoStack].slice(0, MAX)
  publish()
  return ''
}

let keysOn = false
export function installUndoKeys() {
  if (keysOn || typeof window === 'undefined') return
  keysOn = true
  window.addEventListener('keydown', e => {
    if (e.isComposing || e.repeat) return
    const t = e.target as HTMLElement | null
    if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
    if (t?.isContentEditable) return
    const mod = e.ctrlKey || e.metaKey
    if (!mod || e.altKey) return
    const key = e.key.toLowerCase()
    const undo = key === 'z' && !e.shiftKey
    const redo = (key === 'z' && e.shiftKey) || (key === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey)
    if (!undo && !redo) return
    if (undo && !undoState().canUndo) return
    if (redo && !undoState().canRedo) return
    e.preventDefault()
    const why = undo ? undoRoster() : redoRoster()
    if (why) window.dispatchEvent(new CustomEvent('sc-undo-conflict', { detail: why }))
  })
}
