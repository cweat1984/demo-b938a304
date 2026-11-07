import { useEffect, useState, useSyncExternalStore } from 'react'
import { Undo2, Redo2, Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import { installUndoKeys, redoRoster, subscribeUndo, undoRoster, undoState } from '../lib/undo'
import { useStore } from '../data/store'
import { Sheet } from './ui'

export default function UndoBar() {
  const guest = useStore(s => s.session?.role === 'guest')
  const snap = useSyncExternalStore(subscribeUndo, undoState, undoState)
  const [help, setHelp] = useState(false)
  useEffect(() => installUndoKeys(), [])
  useEffect(() => {
    const on = (e: Event) => toast('Couldn’t undo that', { description: (e as CustomEvent<string>).detail })
    window.addEventListener('sc-undo-conflict', on)
    return () => window.removeEventListener('sc-undo-conflict', on)
  }, [])
  if (guest || !useStore.getState().session) return null
  const run = (which: 'undo' | 'redo') => {
    const why = which === 'undo' ? undoRoster() : redoRoster()
    if (why) toast('Couldn’t undo that', { description: why })
  }
  return (
    <>
      <div className="flex items-center gap-1 shrink-0" data-testid="undo-bar">
        <button type="button" data-testid="undo-btn" disabled={!snap.canUndo} aria-label={snap.canUndo ? `Undo ${snap.undoLabel}` : 'Undo'} title={snap.canUndo ? `Undo: ${snap.undoLabel}` : 'Nothing to undo'} onClick={() => run('undo')} className="size-[44px] grid place-items-center rounded-full hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none"><Undo2 className="size-5" /></button>
        <button type="button" data-testid="redo-btn" disabled={!snap.canRedo} aria-label={snap.canRedo ? `Redo ${snap.redoLabel}` : 'Redo'} title={snap.canRedo ? `Redo: ${snap.redoLabel}` : 'Nothing to redo'} onClick={() => run('redo')} className="size-[44px] grid place-items-center rounded-full hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none"><Redo2 className="size-5" /></button>
        <button type="button" data-testid="shortcut-help" aria-label="Keyboard shortcuts" title="Keyboard shortcuts" onClick={() => setHelp(true)} className="size-[44px] grid place-items-center rounded-full hover:bg-surface-2"><Keyboard className="size-5" /></button>
        <span className="sr-only" data-testid="undo-label">{snap.undoLabel}</span>
      </div>
      <Sheet open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <div className="text-sm flex flex-col gap-3" data-testid="shortcut-help-body">
          <p>Undo and Redo apply to roster edits in this sign-in only: assigning, moving, replacing, or taking someone off a job.</p>
          <ul className="flex flex-col gap-2">
            <li><b>Undo</b> — Ctrl+Z on Windows, ⌘Z on Mac</li>
            <li><b>Redo</b> — Ctrl+Y or Ctrl+Shift+Z on Windows, ⌘⇧Z on Mac</li>
          </ul>
          <p className="text-muted">Typing in a field keeps the browser’s own undo. These keys do nothing while a text box is focused. The last 30 roster edits are kept in memory and dropped when you change role, reset the demo, or another tab saves newer data.</p>
          <p className="text-muted">Not undone from here: payments, approved or released work, signed JSAs, accident holds, sent messages, and audit history. Those stay as they are.</p>
        </div>
      </Sheet>
    </>
  )
}
