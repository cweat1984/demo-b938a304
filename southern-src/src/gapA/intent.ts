/** Cross-screen intents from the "What do you need to do?" bar (e.g. open the rigging report already searching "shackle"). */
import { create } from 'zustand'
export type Intent = { kind: 'rig-report' | 'rig-inspect'; q?: string } | { kind: 'field-sheet'; sheet: string } | null
export const useGapA = create<{ intent: Intent }>(() => ({ intent: null }))
