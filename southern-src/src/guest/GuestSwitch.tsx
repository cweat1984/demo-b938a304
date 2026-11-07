/** "Switch role" for guest passes: most guests want to see the whole app the way each person uses it.
 *  The session stays a view-only guest (scrubbed data, nothing saved); only roles whose pages the pass allows are offered. */
import { useEffect, useState } from 'react'
import { Repeat, Check, X, Smartphone } from 'lucide-react'
import { useStore } from '../data/store'
import { guestViews, PHONE_VIEWS } from '../data/roles'
import { Sheet } from '../components/ui'
import { cn } from '../lib/util'

const HINT_KEY = 'sc-guest-hint'
let openFn: ((v: boolean) => void) | null = null
export const openGuestSwitch = () => openFn?.(true)

function ViewList({ onPick }: { onPick?: () => void }) {
  const cur = useStore(s => s.session?.view) ?? 'owner', sw = useStore(s => s.guestSwitch)
  return <div className="flex flex-col gap-2" data-testid="guest-views">{guestViews().map(v => (
    <button key={v.k} data-testid={`guest-view-${v.k}`} aria-current={cur === v.k} onClick={() => { sw(v.k); onPick?.() }}
      className={cn('min-h-14 rounded-2xl border hairline px-4 py-2.5 text-left flex items-center gap-3 active:scale-[.99] transition', cur === v.k ? 'border-accent bg-accent/10' : 'bg-surface hover:bg-surface-2')}>
      <span className="flex-1 min-w-0"><span className="block font-semibold">{v.label}</span><span className="block text-xs text-muted">{v.sub}</span></span>
      {PHONE_VIEWS.includes(v.k) && <Smartphone className="size-4 text-muted" />}
      {cur === v.k && <Check className="size-5 text-accent" />}
    </button>))}</div>
}
/** The sheet (mount once per app shell). */
export function GuestSwitchSheet() {
  const [open, setOpen] = useState(false)
  useEffect(() => { openFn = setOpen; return () => { if (openFn === setOpen) openFn = null } }, [])
  return <Sheet open={open} onClose={() => setOpen(false)} title="Switch role" sub="See the app the way each person does. Still view-only — nothing is saved.">
    <ViewList onPick={() => setOpen(false)} />
  </Sheet>
}
/** Labeled chip for the top bar. */
export function GuestSwitchChip({ className }: { className?: string }) {
  const g = useStore(s => s.session?.role === 'guest'); if (!g) return null
  return <button data-testid="guest-switch" onClick={openGuestSwitch} className={cn('shrink-0 h-[44px] min-h-[44px] px-3.5 max-[420px]:px-2.5 max-[420px]:text-[13px] max-[420px]:gap-1 rounded-full bg-accent text-accent-ink font-semibold text-sm inline-flex items-center gap-1.5 shadow-md active:scale-95 transition', className)}>
    <Repeat className="size-4" />Switch role</button>
}
/** One-time first-visit hint pointing at the chip. */
export function GuestHint() {
  const g = useStore(s => s.session?.role === 'guest')
  const [show, setShow] = useState(() => { try { return !localStorage.getItem(HINT_KEY) } catch { return true } })
  // m13: point at the real Switch role chip (it moves between phone and desktop layouts)
  const [at, setAt] = useState<{ left: number; top: number; arrow: number } | null>(null)
  useEffect(() => { if (!g || !show) return; const place = () => { const boxes = [...document.querySelectorAll('[data-testid=guest-switch]')].map(el => el.getBoundingClientRect()).filter(r => r.width >= 8 && r.height >= 8); const b = boxes.sort((a, c) => a.top - c.top)[0]; if (!b) { setAt(null); return } const w = Math.min(300, innerWidth - 24), cx = b.left + b.width / 2, left = Math.max(12, Math.min(innerWidth - w - 12, cx - w / 2)); setAt({ left, top: b.bottom + 10, arrow: Math.max(10, Math.min(w - 16, cx - left - 6)) }) }; place(); const raf = requestAnimationFrame(place); const t = setTimeout(place, 600); addEventListener('resize', place); return () => { cancelAnimationFrame(raf); clearTimeout(t); removeEventListener('resize', place) } }, [g, show])
  if (!g || !show || !at) return null
  const done = () => { try { localStorage.setItem(HINT_KEY, '1') } catch { /* */ } setShow(false) }
  return <div className="fixed z-[95] max-w-[300px] w-[calc(100vw-24px)]" style={{ left: at.left, top: at.top }} data-testid="guest-hint" role="status">
    <div className="absolute -top-1.5 size-3 rotate-45 bg-accent" style={{ left: at.arrow }} />
    <div className="relative rounded-2xl bg-accent text-accent-ink p-3.5 shadow-xl">
      <button aria-label="Close tip" onClick={done} className="absolute top-1 right-1 size-9 grid place-items-center"><X className="size-4" /></button>
      <div className="font-semibold pr-6">See the whole app</div>
      <div className="text-sm mt-1 opacity-90">Tap <b>Switch role</b> to look around as a dispatcher, a field hand, a supervisor and more.</div>
      <div className="mt-2.5 flex gap-2"><button data-testid="guest-hint-try" onClick={() => { done(); openGuestSwitch() }} className="h-[44px] px-4 rounded-xl bg-black/20 font-semibold">Show me</button><button data-testid="guest-hint-ok" onClick={done} className="h-[44px] px-3 rounded-xl font-semibold opacity-90">Got it</button></div>
    </div>
  </div>
}
/** Home-screen card: one tap into each role. */
export function GuestRolesCard() {
  const g = useStore(s => s.session?.role === 'guest'); if (!g) return null
  return <div className="card p-4 md:p-5" data-testid="guest-roles-home">
    <div className="flex items-center gap-2 mb-3"><Repeat className="size-5 text-accent" /><div className="font-semibold text-lg">See the app as…</div><span className="text-xs text-muted ml-auto hidden sm:inline">view-only · switch any time</span></div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">{guestViews().filter(v => v.k !== 'owner').slice(0, 8).map(v => (
      <button key={v.k} data-testid={`guest-home-${v.k}`} onClick={() => useStore.getState().guestSwitch(v.k)} className="min-h-12 rounded-xl bg-surface-2 hover:bg-surface-3 px-3 py-2 text-left">
        <span className="block font-semibold text-sm leading-tight">{v.label}</span><span className="block text-[12px] text-muted leading-tight mt-0.5">{v.sub}</span></button>))}</div>
  </div>
}
/** Row at the top of the More sheet. */
export function GuestSwitchRow({ onOpen }: { onOpen?: () => void }) {
  const g = useStore(s => s.session?.role === 'guest'); const cur = useStore(s => s.session?.view); if (!g) return null
  const label = guestViews().find(v => v.k === (cur ?? 'owner'))?.label ?? 'Owner overview'
  return <button data-testid="more-guest-switch" onClick={() => { onOpen?.(); setTimeout(openGuestSwitch, 50) }} className="mb-4 w-full min-h-14 rounded-2xl bg-accent text-accent-ink px-4 flex items-center gap-3 font-semibold">
    <Repeat className="size-5" /><span className="flex-1 text-left">Switch role<span className="block text-xs font-normal opacity-90">Now viewing: {label}</span></span></button>
}
