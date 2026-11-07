import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, ChevronLeft } from 'lucide-react'
import { pushOverlay, popOverlay } from '../lib/backstack'
import { cn } from '../lib/util'

/** Bottom sheet that lives INSIDE the phone screen (works in the desktop phone-frame preview and full-screen on phones). */
export function FSheet({ open, onClose, title, children, tall, taps }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; tall?: boolean; taps?: boolean }) {
  // field fixes (N-M8): typed into a form? confirm before Back / X / swipe-back throws it away
  const dirty = useRef(false), body = useRef<HTMLDivElement>(null), [gen, setGen] = useState(0)
  const tapped = useRef(false) // dive2 field M1: tap-only forms (DVIR, injury type, breakdown, NPT, rigging) count as entered too
  useEffect(() => { if (open) { dirty.current = false; tapped.current = false } }, [open])
  const guarded = (fromBack?: unknown) => {
    const hasForm = !!body.current?.querySelector('input:not([type=file]):not([type=range]):not([type=checkbox]), textarea')
    if (((dirty.current && hasForm) || tapped.current) && !window.confirm('Discard what you entered? It won’t be saved.')) { if (fromBack === true) setGen(g => g + 1); return }
    onClose()
  }
  const cb = useRef(guarded); cb.current = guarded
  useEffect(() => { if (!open) return; const id = pushOverlay(() => cb.current(true)); return () => popOverlay(id) }, [open, gen])
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') cb.current() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [open])
  return (
    <AnimatePresence>
      {open && (
        <div className="absolute inset-0 z-40 flex items-end">
          <motion.div className="absolute inset-0 bg-black/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => guarded()} />
          <motion.div role="dialog" aria-modal="true" className={cn('relative w-full bg-bg rounded-t-[28px] border-t hairline flex flex-col', tall ? 'h-[94%]' : 'max-h-[90%]')}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 340 }}>
            <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface-3" />
            <div className="flex items-center gap-2 px-5 pt-3 pb-2">
              <button onClick={() => guarded()} className="-ml-2 size-11 grid place-items-center rounded-full active:bg-surface-2" aria-label="Back" data-testid="fsheet-back"><ChevronLeft className="size-6" /></button>
              <div className="flex-1 display text-xl font-semibold">{title}</div>
              <button onClick={() => guarded()} className="btn-icon" aria-label="Close"><X className="size-5" /></button>
            </div>
            <div ref={body} onInputCapture={() => { dirty.current = true }} onClickCapture={e => { const b = (e.target as HTMLElement).closest('button, [role=radio], [role=checkbox], label'); if (taps && b && !b.closest('[data-nodirty]') && !/^(tel:|http)/.test((b as HTMLAnchorElement).getAttribute?.('href') ?? '')) tapped.current = true }} className="overflow-y-auto scroll-thin px-5 pb-safe flex-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function SignaturePad({ onChange, height = 180 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [empty, setEmpty] = useState(true)
  useEffect(() => {
    const c = ref.current!; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1
    c.width = r.width * dpr; c.height = r.height * dpr
    const ctx = c.getContext('2d')!; ctx.scale(dpr, dpr); ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0f172a'
  }, [])
  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const }
  const down = (e: React.PointerEvent) => { drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = ref.current!.getContext('2d')!; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); if (empty) setEmpty(false) }
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(empty ? null : ref.current!.toDataURL('image/png')) }
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setEmpty(true); onChange(null) }
  return (
    <div className="relative rounded-2xl bg-white border-2 border-dashed border-slate-300 overflow-hidden">
      <canvas ref={ref} style={{ height }} className="w-full touch-none block" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} data-testid="sig-pad" />
      {empty && <div className="pointer-events-none absolute inset-0 grid place-items-center text-slate-400 text-sm font-medium">Customer signs here</div>}
      <div className="pointer-events-none absolute left-5 right-5 bottom-8 border-b border-slate-300" />
      {!empty && <button onClick={clear} className="absolute top-2 right-2 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1">Clear</button>}
    </div>
  )
}

export function BigTile({ icon, label, sub, onClick, tone, testid }: { icon: ReactNode; label: string; sub?: string; onClick: () => void; tone?: 'bad' | 'accent'; testid?: string }) {
  return (
    <button onClick={onClick} data-testid={testid} className={cn('rounded-3xl p-4 text-left flex flex-col gap-3 transition active:scale-[0.98]', tone === 'bad' ? 'bg-bad/12 text-bad' : 'bg-surface')}>
      <span className={cn('grid size-11 place-items-center rounded-2xl', tone === 'bad' ? 'bg-bad-solid text-white' : 'bg-surface-2')}>{icon}</span>
      <span><span className="block font-semibold leading-tight">{label}</span>{sub && <span className="block text-xs text-muted mt-0.5">{sub}</span>}</span>
    </button>
  )
}

export const useNow = (ms = 1000) => { const [n, setN] = useState(Date.now()); useEffect(() => { const t = setInterval(() => setN(Date.now()), ms); return () => clearInterval(t) }, [ms]); return n }
export const dur = (ms: number) => { const m = Math.max(0, Math.floor(ms / 60000)); return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
export const navUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
