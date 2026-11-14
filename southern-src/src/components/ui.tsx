import { useEffect, useRef, useState, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { pushOverlay, popOverlay } from '../lib/backstack'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'motion/react'
import { X, Phone, ChevronLeft } from 'lucide-react'
import { cn } from '../lib/util'

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info' | 'ghost'
const toneCls: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink',
  accent: 'bg-accent/15 text-accent',
  ok: 'bg-ok/15 text-ok',
  warn: 'bg-warn/15 text-warn',
  bad: 'bg-bad/15 text-bad',
  info: 'bg-info/15 text-info',
  ghost: 'text-muted',
}
export function Badge({ tone = 'neutral', children, className, dot, 'data-testid': tid }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; 'data-testid'?: string }) {
  return (
    <span data-testid={tid} className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap', toneCls[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ok' | 'outline'
const sizeCls = { sm: 'h-8 pointer-coarse:h-[44px] px-3 text-[13px] rounded-lg gap-1.5', md: 'h-10 pointer-coarse:h-[44px] px-4 text-sm rounded-xl gap-2', lg: 'h-12 px-5 text-[15px] rounded-2xl gap-2', xl: 'h-16 px-6 text-lg rounded-2xl gap-3' }
/** dive3 B2: a second click / tap on the same button within 400 ms is ignored (double-click, 60 ms double-tap), so a Save or
 *  Create can never run twice. Buttons that are meant to repeat (steppers) pass repeat. */
export function useOnce<A extends unknown[]>(f: ((...a: A) => void) | undefined, ms = 400) { const last = useRef(0); return (...a: A) => { const n = Date.now(); if (n - last.current < ms) return; last.current = n; f?.(...a) } }
export function Button({ variant = 'secondary', size = 'md', className, children, icon, repeat, onClick, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' | 'xl'; icon?: ReactNode; repeat?: boolean }) {
  const once = useOnce(onClick)
  const v: Record<BtnVariant, string> = {
    primary: 'bg-accent text-accent-ink hover:brightness-110 shadow-[0_8px_24px_-10px_var(--accent)]',
    secondary: 'bg-surface-2 text-ink hover:bg-surface-3',
    outline: 'border border-line text-ink hover:bg-surface-2',
    ghost: 'text-muted hover:text-ink hover:bg-surface-2',
    danger: 'bg-bad-solid text-white hover:brightness-110',
    ok: 'bg-ok-solid text-white hover:brightness-110',
  }
  return (
    <button className={cn('inline-flex items-center justify-center font-semibold transition-all active:scale-[.98] disabled:opacity-40 disabled:pointer-events-none select-none', v[variant], sizeCls[size], className)} onClick={repeat ? onClick : once} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function IconBtn({ children, className, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button aria-label={label} title={label} className={cn('grid size-10 place-items-center rounded-xl text-muted hover:text-ink hover:bg-surface-2 transition shrink-0', className)} {...rest}>
      {children}
    </button>
  )
}

export function CallButton({ phone, label, size = 'md', variant = 'secondary', className, children }: { phone: string; label?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; variant?: BtnVariant; className?: string; children?: ReactNode }) {
  const tel = phone.replace(/[^0-9+]/g, '')
  const v: Record<BtnVariant, string> = { primary: 'bg-accent text-accent-ink', secondary: 'bg-ok/15 text-ok hover:bg-ok/25', ghost: 'text-ok hover:bg-ok/10', danger: 'bg-bad-solid text-white', ok: 'bg-ok-solid text-white hover:brightness-110', outline: 'border border-line' }
  return (
    <a href={`tel:${tel}`} onClick={e => e.stopPropagation()} className={cn('inline-flex items-center justify-center font-semibold transition active:scale-[.98] select-none', v[variant], sizeCls[size], className)} aria-label={`Call ${label ?? phone}`}>
      <Phone className={size === 'xl' ? 'size-6' : 'size-4'} />
      {children ?? label ?? phone}
    </a>
  )
}

export function Card({ children, className, onClick, pad = true, 'data-testid': testid }: { children: ReactNode; className?: string; onClick?: () => void; pad?: boolean; 'data-testid'?: string }) {
  return (
    <div onClick={onClick} data-testid={testid} className={cn('card', pad && 'p-5', onClick && 'cursor-pointer hover:border-faint/50 transition', className)}>
      {children}
    </div>
  )
}

export function Stat({ label, value, sub, tone, onClick, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; onClick?: () => void; icon?: ReactNode }) {
  const c = tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : tone === 'accent' ? 'text-accent' : 'text-ink'
  return (
    <div onClick={onClick} className={cn('card p-5 flex flex-col gap-1', onClick && 'cursor-pointer hover:-translate-y-0.5 transition')}>
      <div className="flex items-center justify-between label">{label}{icon && <span className="text-faint">{icon}</span>}</div>
      <div className={cn('display text-[34px] leading-none font-semibold num mt-1', c)}>{value}</div>
      {sub && <div className="text-xs text-muted mt-1">{sub}</div>}
    </div>
  )
}

let segN = 0
export function Segmented<V extends string>({ value, onChange, options, className, size = 'md' }: { value: V; onChange: (v: V) => void; options: { value: V; label: ReactNode; count?: number }[]; className?: string; size?: 'sm' | 'md' }) {
  const [id] = useState(() => `seg${segN++}`)
  return (
    <div role="tablist" className={cn('inline-flex rounded-xl bg-surface-2 p-1 gap-1 overflow-x-auto no-scrollbar max-w-full', className)} onKeyDown={e => {
      // ARIA tabs: ←/→ (and Home/End) move between tabs and select; only the selected tab is in the Tab order
      const k = e.key; if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(k)) return
      const i = options.findIndex(o => o.value === value); const n = options.length; if (!n) return
      const j = k === 'Home' ? 0 : k === 'End' ? n - 1 : (i + (k === 'ArrowRight' ? 1 : -1) + n) % n
      e.preventDefault(); onChange(options[j].value)
      const btns = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=tab]'); btns[j]?.focus()
    }}>
      {options.map(o => (
        <button key={o.value} type="button" role="tab" onClick={() => onChange(o.value)} aria-selected={value === o.value} tabIndex={value === o.value || !options.some(x => x.value === value) ? 0 : -1} aria-label={typeof o.label === 'string' ? undefined : String(o.value)} className={cn('seg-btn relative rounded-lg font-semibold whitespace-nowrap transition shrink-0', size === 'sm' ? 'px-2.5 h-7 pointer-coarse:h-10 text-xs' : 'px-3.5 h-8 pointer-coarse:h-10 text-[13px]', value === o.value ? 'text-ink' : 'text-muted hover:text-ink')}>
          {value === o.value && <motion.span layoutId={id} className="absolute inset-0 rounded-lg bg-surface shadow-sm" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
          <span className="relative inline-flex items-center gap-1.5">{o.label}{o.count != null && <span className="text-[10px] text-faint num">{o.count}</span>}</span>
        </button>
      ))}
    </div>
  )
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-faint">{hint}</span>}
    </label>
  )
}

export function Avatar({ name, size = 36, tone, className }: { name: string; size?: number; tone?: string; className?: string }) {
  const parts = name.split(' ')
  const ini = (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return (
    <span className={cn('inline-grid place-items-center rounded-full font-semibold text-white shrink-0', className)} data-avatar style={{ width: size, height: size, fontSize: size * 0.38, ['--av' as string]: `${size * 0.38}px`, background: tone ?? `linear-gradient(135deg, hsl(${h} 45% 42%), hsl(${(h + 40) % 360} 50% 30%))` }}>
      {ini}
    </span>
  )
}

export function Progress({ value, tone = 'accent', className }: { value: number; tone?: 'accent' | 'ok' | 'warn' | 'bad'; className?: string }) {
  const c = { accent: 'bg-accent', ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' }[tone]
  return <div className={cn('h-1.5 rounded-full bg-surface-3 overflow-hidden', className)}><motion.div className={cn('h-full rounded-full', c)} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, value))}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} /></div>
}

export function Toggle({ checked, onChange, label, disabled, 'aria-label': aria }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean; 'aria-label'?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label ? undefined : aria ?? 'Toggle'} disabled={disabled} onClick={() => onChange(!checked)} className="inline-flex items-center gap-3 text-sm disabled:opacity-50 text-left min-h-[44px] min-w-[44px]">
      <span className={cn('relative h-6 w-10 rounded-full transition shrink-0', checked ? 'bg-accent' : 'bg-surface-3')}>
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  )
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 gap-3">
      {icon && <div className="grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">{icon}</div>}
      <div className="font-semibold">{title}</div>
      {body && <div className="text-sm text-muted max-w-sm">{body}</div>}
      {action}
    </div>
  )
}

export function PageHeader({ title, sub, actions, eyebrow }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div className="min-w-0" data-testid="page-header">
        {eyebrow && <div className="label mb-2">{eyebrow}</div>}
        <h1 className="display text-3xl md:text-[40px] font-semibold leading-none tracking-tight">{title}</h1>
        {sub && <div className="text-muted mt-2 text-[15px]">{sub}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

function useEsc(open: boolean, onClose: () => void) {
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [open, onClose])
}
export const useIsMobile = () => { const [m, setM] = useState(() => window.innerWidth < 768); useEffect(() => { const h = () => setM(window.innerWidth < 768); window.addEventListener('resize', h); return () => window.removeEventListener('resize', h) }, []); return m }

/** Right slide-over on desktop, bottom sheet on phones. */
/** Give an open overlay a history entry so iOS swipe-back / the browser back button closes it. */
export function useBackClose(open: boolean, onClose: () => void) {
  const cb = useRef(onClose); cb.current = onClose
  useEffect(() => { if (!open) return; const id = pushOverlay(() => cb.current()); return () => popOverlay(id) }, [open])
}
export function Sheet({ open, onClose, children, title, sub, width = 560, actions, z = 60, onBack }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; sub?: ReactNode; width?: number; actions?: ReactNode; z?: number; onBack?: () => void }) {
  useEsc(open, onClose)
  useBackClose(open, onClose)
  const trap = useFocusTrap(open)
  const mobile = useIsMobile()
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: z }}>
          <motion.div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            ref={trap}
            role="dialog" aria-modal="true"
            className={cn('absolute bg-surface border-line flex flex-col shadow-2xl', mobile ? 'inset-x-0 bottom-0 max-h-[92vh] rounded-t-[28px] border-t' : 'right-0 top-0 bottom-0 border-l')}
            style={mobile ? undefined : { width: Math.min(width, window.innerWidth - 40) }}
            initial={mobile ? { y: '100%' } : { x: '100%' }} animate={mobile ? { y: 0 } : { x: 0 }} exit={mobile ? { y: '100%' } : { x: '100%' }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {mobile && <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface-3" />}
            <div className="flex items-start gap-3 px-6 pt-5 pb-4">
              {(mobile || onBack) && <button type="button" onClick={onBack ?? onClose} aria-label={onBack ? 'Back' : 'Close and go back'} data-testid="sheet-back" className="-ml-3 mt-0.5 shrink-0 size-10 grid place-items-center rounded-full hover:bg-surface-2 text-ink"><ChevronLeft className="size-6" /></button>}
              <div className="min-w-0 flex-1">
                <div className="display text-2xl font-semibold leading-tight">{title}</div>
                {sub && <div className="text-sm text-muted mt-1">{sub}</div>}
              </div>
              {actions}
              <IconBtn label="Close" onClick={onClose}><X className="size-5" /></IconBtn>
            </div>
            {document.documentElement.dataset.guest === '1' && <div className="mx-6 mb-3 rounded-xl bg-warn/15 text-warn px-3 py-2 text-xs font-semibold" data-testid="guest-ro-strip">View-only demo · nothing you change here is saved</div>}
            <div className={cn('flex-1 overflow-y-auto scroll-thin px-6', mobile ? 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]' : 'pb-8')}>{children}</div>{/* dive3 m15: last buttons clear the phone tab bar + home indicator */}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

/** Keyboard users: move focus into an open dialog, keep Tab inside it, and give focus back on close. */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const t = setTimeout(() => { const el = ref.current; if (!el || el.contains(document.activeElement)) return; const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]; (f.find(x => x.matches('input,select,textarea')) ?? f.find(x => x.getAttribute('aria-label') !== 'Close') ?? f[0])?.focus() }, 60)
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current; if (e.key !== 'Tab' || !el) return
      if ([...document.querySelectorAll('[role=dialog]')].at(-1) !== el) return // only the top-most dialog traps
      const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(x => x.offsetParent !== null); if (!f.length) return
      const first = f[0], last = f[f.length - 1]
      if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus() }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); if (prev && document.contains(prev)) setTimeout(() => prev.focus?.(), 0) }
  }, [open])
  return ref
}

export function Modal({ open, onClose, children, title, sub, width = 520, z = 70 }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; sub?: ReactNode; width?: number; z?: number }) {
  useEsc(open, onClose)
  useBackClose(open, onClose)
  const trap = useFocusTrap(open)
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 grid place-items-center p-4 max-md:pb-[calc(4.75rem+env(safe-area-inset-bottom))]" style={{ zIndex: z }}>{/* dive3 m15: on phones the dialog sits above the tab bar */}
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div ref={trap} role="dialog" aria-modal="true" className="relative card p-0 w-full max-h-[90vh] max-md:max-h-[calc(100dvh-6.25rem-env(safe-area-inset-bottom))] flex flex-col" style={{ maxWidth: `min(${width}px, calc(100vw - 2rem))` }} initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ type: 'spring', damping: 28, stiffness: 380 }}>
            <div className="flex items-start gap-3 px-6 pt-6 pb-2">
              <div className="flex-1"><div className="display text-xl font-semibold">{title}</div>{sub && <div className="text-sm text-muted mt-1">{sub}</div>}</div>
              <IconBtn label="Close" onClick={onClose}><X className="size-5" /></IconBtn>
            </div>
            <div className="overflow-y-auto scroll-thin px-6 pb-6 pt-2">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ---- promise-based confirm with N options (used for every Dispatch-confirmed destructive change) ----
type ConfirmOpt<V> = { label: string; value: V; tone?: BtnVariant; hint?: string }
type ConfirmReq = { title: string; body?: ReactNode; options: ConfirmOpt<unknown>[]; checkbox?: string; resolve: (v: { value: unknown; checked: boolean } | null) => void }
let pushConfirm: ((r: ConfirmReq) => void) | null = null
export function confirmChoice<V>(title: string, body: ReactNode, options: ConfirmOpt<V>[], checkbox?: string): Promise<{ value: V; checked: boolean } | null> {
  return new Promise(resolve => pushConfirm ? pushConfirm({ title, body, options: options as ConfirmOpt<unknown>[], checkbox, resolve: resolve as ConfirmReq['resolve'] }) : resolve(null))
}
export function ConfirmHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null)
  const [checked, setChecked] = useState(true)
  useEffect(() => { pushConfirm = r => { setChecked(true); setReq(r) }; return () => { pushConfirm = null } }, [])
  const done = (v: unknown | null) => { req?.resolve(v === null ? null : { value: v, checked }); setReq(null) }
  return (
    <Modal open={!!req} onClose={() => done(null)} title={req?.title} width={500} z={90}>
      {req && (
        <div className="flex flex-col gap-4">
          {req.body && <div className="text-[15px] text-muted leading-relaxed">{req.body}</div>}
          {req.checkbox && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="size-4 accent-[var(--accent)]" />{req.checkbox}</label>}
          <div className="flex flex-col gap-2">
            {req.options.map((o, i) => (
              <button key={i} onClick={() => done(o.value)} className={cn('w-full text-left rounded-2xl px-4 py-3 transition border', o.tone === 'primary' ? 'bg-accent text-accent-ink border-transparent' : o.tone === 'danger' ? 'bg-bad/10 text-bad border-bad/30' : 'bg-surface-2 border-line hover:bg-surface-3')}>
                <div className="font-semibold">{o.label}</div>
                {o.hint && <div className={cn('text-xs mt-0.5', o.tone === 'primary' ? 'opacity-80' : 'text-muted')}>{o.hint}</div>}
              </button>
            ))}
            <button onClick={() => done(null)} className="text-sm text-muted py-2 hover:text-ink">Cancel — change nothing</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export function Collapsible({ title, children, defaultOpen = false, count, right }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; count?: number; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b hairline last:border-0">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 py-3 text-left">
        <span className={cn('transition text-faint inline-block', open && 'rotate-90')}>›</span>
        <span className="font-semibold text-sm flex-1">{title}</span>
        {count != null && <span className="text-xs text-muted num">{count}</span>}
        {right}
      </button>
      <AnimatePresence initial={false}>
        {open && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="pb-3">{children}</div></motion.div>}
      </AnimatePresence>
    </div>
  )
}

export function DemoTag({ className }: { className?: string }) {
  return <span data-demo-tag className={cn('inline-flex items-center rounded-md border border-warn/40 bg-warn/10 px-1.5 py-px text-[10px] font-bold tracking-wider text-warn', className)}>DEMO</span>
}

export function Row({ children, onClick, className }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return <div onClick={onClick} className={cn('flex items-center gap-3 px-4 py-3 border-b hairline last:border-0', onClick && 'cursor-pointer hover:bg-surface-2 transition', className)}>{children}</div>
}

export function Kv({ k, v, className }: { k: ReactNode; v: ReactNode; className?: string }) {
  return <div className={cn('flex items-baseline justify-between gap-4 py-2 border-b hairline last:border-0 text-sm', className)}><span className="text-muted shrink-0">{k}</span><span className="text-right font-medium min-w-0">{v}</span></div>
}
