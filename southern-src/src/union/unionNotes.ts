/** Admin-entered union contacts and "working in this local" rules — saved in localStorage (sc-union-notes). */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { RuleKey } from './contacts'
export interface LocalNotes { contactName?: string; contactRole?: string; contactPhone?: string; dispatcher?: string; rules?: Partial<Record<RuleKey, string>>; fringeNote?: string; updatedBy?: string; updatedAt?: string }
interface S { notes: Record<string, LocalNotes>; save: (local: string, patch: Partial<LocalNotes>, by?: string) => void }
export const useUnionNotes = create<S>()(persist(set => ({
  notes: {},
  save: (local, patch, by) => set(s => ({ notes: { ...s.notes, [local]: { ...s.notes[local], ...patch, rules: { ...s.notes[local]?.rules, ...patch.rules }, updatedBy: by, updatedAt: new Date().toISOString() } } })),
}), { name: 'sc-union-notes' }))
/** Roles that may edit contacts/rules. */
export const UNION_ADMIN = ['owner', 'ops', 'payroll', 'hr', 'branch']
