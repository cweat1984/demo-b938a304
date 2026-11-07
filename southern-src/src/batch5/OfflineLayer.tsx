import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { WifiOff, RefreshCw, CheckCircle2, CloudUpload } from 'lucide-react'
import { useStore } from '../data/store'
import { useQueue, installOfflineQueue, setSimulatedOffline } from './offline'
import { useSec } from './security'

installOfflineQueue()

/** Offline banner + sync indicator + idle sign-out. Rendered once at the app root. */
export default function OfflineLayer() {
  const online = useStore(s => s.ui.online)
  const session = useStore(s => s.session)
  const { items, simulated } = useQueue()
  const off = !online || simulated
  const queued = items.filter(i => i.state === 'queued').length
  const syncing = items.some(i => i.state === 'syncing')
  const sent = items.filter(i => i.state === 'sent').length
  useEffect(() => { const on = (e: Event) => toast.success(`Back online — ${(e as CustomEvent).detail} queued action${(e as CustomEvent).detail === 1 ? '' : 's'} sent`); window.addEventListener('sc-synced', on); return () => window.removeEventListener('sc-synced', on) }, [])
  useIdleSignOut(!!session)
  const kinds = [...new Set(items.filter(i => i.state === 'queued').map(i => i.kind))].join(' · ')
  return (
    <AnimatePresence>
      {off && <motion.div key="off" data-testid="offline-banner" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} className="fixed top-0 inset-x-0 z-[70] flex justify-center pointer-events-none pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-auto mt-2 mx-3 rounded-full bg-warn text-black shadow-lg px-4 h-9 flex items-center gap-2 text-[13px] font-semibold">
          <WifiOff className="size-4 shrink-0" /><span className="whitespace-nowrap">No signal<span className="hidden sm:inline"> — working offline</span></span><span className="font-normal hidden md:inline whitespace-nowrap">· saved on this device</span>
          {queued > 0 && <span className="rounded-full bg-black/15 px-2 num whitespace-nowrap" data-testid="queue-count">{queued} will send<span className="hidden sm:inline">{kinds ? ` · ${kinds}` : ''}</span></span>}
          {simulated && <button className="ml-1 underline font-normal" onClick={() => setSimulatedOffline(false)} data-testid="reconnect">Reconnect</button>}
        </div>
      </motion.div>}
      {!off && (syncing || sent > 0) && <motion.div key="sync" data-testid="sync-indicator" initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -40, opacity: 0 }} className="fixed top-0 inset-x-0 z-[70] flex justify-center pointer-events-none">
        <div className="mt-2 rounded-full bg-surface border hairline shadow-lg px-4 h-9 flex items-center gap-2 text-[13px] font-semibold">
          {syncing ? <><RefreshCw className="size-4 animate-spin text-accent" />Syncing {sent + 1} of {items.length}…</> : <><CheckCircle2 className="size-4 text-ok" />All synced</>}
        </div>
      </motion.div>}
    </AnimatePresence>
  )
}

/** Small status chip for headers: queued count while offline / after edits. */
export function SyncChip() {
  const online = useStore(s => s.ui.online); const { items, simulated } = useQueue()
  const q = items.filter(i => i.state === 'queued').length
  if (online && !simulated && !q) return null
  return <span className="inline-flex items-center gap-1 rounded-full bg-warn/15 text-warn px-2 h-6 text-[11px] font-semibold" data-testid="sync-chip"><CloudUpload className="size-3.5" />{q} queued</span>
}

function useIdleSignOut(active: boolean) {
  const min = useSec(s => s.timeoutMin)
  const last = useRef(Date.now())
  useEffect(() => {
    if (!active) return
    const bump = () => { last.current = Date.now() }
    const ev = ['pointerdown', 'keydown', 'scroll', 'touchstart']; ev.forEach(e => window.addEventListener(e, bump, { passive: true }))
    let warned = false
    const t = setInterval(() => {
      const idle = (Date.now() - last.current) / 60000
      if (idle > min - 1 && !warned) { warned = true; toast.warning('Signing out soon for security', { description: 'No activity — tap anywhere to stay signed in.' }) }
      if (idle < min - 1) warned = false
      if (idle >= min) { toast('Signed out after inactivity'); useStore.getState().signOut() }
    }, 15000)
    return () => { clearInterval(t); ev.forEach(e => window.removeEventListener(e, bump)) }
  }, [active, min])
}
