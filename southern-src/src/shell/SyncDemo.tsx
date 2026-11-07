import { useEffect, useRef, useState } from 'react'
import { Smartphone, Monitor, Radio, RotateCcw, ArrowLeft } from 'lucide-react'
import { Logo } from './Splash'

/** "One program, live": the field phone and the office side by side, same data, synced in real time. */
export default function SyncDemo() {
  const stage = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.7)
  const [page, setPage] = useState<'command' | 'dispatch' | 'tickets'>('dispatch')
  const [k, setK] = useState(0)
  useEffect(() => {
    const fit = () => { const el = stage.current; if (!el) return; const w = el.clientWidth - 360 - 48, h = el.clientHeight - 24; setScale(Math.max(0.4, Math.min(1, w / 1280, h / 820))) }
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit)
  }, [])
  const base = location.pathname
  return (
    <div className="h-screen w-screen flex flex-col bg-[radial-gradient(ellipse_at_top,var(--surface-3),var(--bg))] text-ink overflow-hidden" data-testid="sync-demo">
      <header className="flex items-center gap-4 px-6 py-4">
        <a href={base} className="btn-icon" aria-label="Back"><ArrowLeft className="size-5" /></a>
        <Logo size={30} />
        <div className="flex-1 min-w-0">
          <div className="display text-2xl font-semibold tracking-tight">One program. Live.</div>
          <div className="text-sm text-muted">Do something on the phone — sign a ticket, clock out, report a breakdown — and watch the office update instantly.</div>
        </div>
        <span className="hidden md:inline-flex items-center gap-2 rounded-full bg-ok/15 text-ok px-3 py-1.5 text-xs font-bold"><Radio className="size-3.5 blink" />Live sync</span>
        <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm font-semibold">
          {(['command', 'dispatch', 'tickets'] as const).map(p => <button key={p} onClick={() => setPage(p)} className={`rounded-full px-3 py-1.5 capitalize ${page === p ? 'bg-surface-3 text-ink shadow' : 'text-muted hover:text-ink'}`}>{p === 'tickets' ? 'Field tickets' : p}</button>)}
        </div>
        <button className="btn-icon" title="Reload both" onClick={() => setK(k + 1)}><RotateCcw className="size-5" /></button>
      </header>
      <div ref={stage} className="flex-1 min-h-0 flex items-center justify-center gap-12 px-6 pb-6">
        <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="label flex items-center gap-2"><Smartphone className="size-4" />John Smith · operator's phone</div>
          <div className="phone-frame" style={{ width: 360, height: Math.min(760, (stage.current?.clientHeight ?? 820) - 40) }}>
            <div className="phone-screen h-full w-full"><iframe key={`f${k}`} title="Field app" src={`${base}?as=field`} className="w-full h-full border-0" data-testid="sync-phone" /></div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3 min-w-0">
          <div className="label flex items-center gap-2"><Monitor className="size-4" />The office · owner view</div>
          <div className="rounded-2xl border hairline shadow-2xl overflow-hidden bg-bg" style={{ width: 1280 * scale, height: 820 * scale }}>
            <iframe key={`o${k}${page}`} title="Office" src={`${base}?as=owner#/${page}`} className="border-0 origin-top-left" style={{ width: 1280, height: 820, transform: `scale(${scale})` }} data-testid="sync-office" />
          </div>
        </div>
      </div>
    </div>
  )
}
