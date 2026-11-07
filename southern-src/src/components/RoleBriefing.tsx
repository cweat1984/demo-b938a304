import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Play, Sparkles, X, ChevronRight, Square } from 'lucide-react'
import * as Icons from 'lucide-react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { byId, fullName } from '../data/logic'
import { today, cn } from '../lib/util'
import { buildBriefing, type BriefItem, type BriefTo } from '../data/briefing'
import { useCompany } from '../data/brand'
import { SdsSheet } from './inv/Sds'
import FleetMap from './FleetMap'

/** Morning briefing for any role: same typed + spoken card as the owner's, plus every item tappable. Auto-offered once a day. */
export default function RoleBriefing({ role, onItem, compact }: { role: T.RoleKey; onItem?: (to: BriefTo) => boolean; compact?: boolean }) {
  const db = useStore(s => s.db)
  const session = useStore(s => s.session)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const company = useCompany()
  const me = useMemo(() => byId(db.employees, session?.employeeId) ?? db.employees.find(e => fullName(e) === session?.name), [db.employees, session])
  const brief = useMemo(() => buildBriefing(db, role, me, f), [db, role, me, f])
  const key = `brief-offer:${role}:${today()}`
  const [offer, setOffer] = useState(() => { try { return !localStorage.getItem(key) } catch { return false } })
  const [playing, setPlaying] = useState(false)
  const [shown, setShown] = useState(false)
  const [typed, setTyped] = useState('')
  const [sds, setSds] = useState<string | null>(null)
  const iv = useRef<number | undefined>(undefined)
  useEffect(() => () => { window.clearInterval(iv.current); try { window.speechSynthesis?.cancel() } catch { /* */ } }, [])
  const dismissOffer = () => { setOffer(false); try { localStorage.setItem(key, '1') } catch { /* */ } }
  const play = () => {
    dismissOffer(); setShown(true); setPlaying(true); setTyped('')
    let i = 0; window.clearInterval(iv.current)
    iv.current = window.setInterval(() => { i += 2; setTyped(brief.text.slice(0, i)); if (i >= brief.text.length) { window.clearInterval(iv.current); setPlaying(false) } }, 24)
    try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(brief.text); u.rate = 1.02; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u) } } catch { /* no voice */ }
  }
  const stop = () => { window.clearInterval(iv.current); setTyped(brief.text); setPlaying(false); try { window.speechSynthesis?.cancel() } catch { /* */ } }
  const close = () => { stop(); setShown(false) }
  const go = (to?: BriefTo) => {
    if (!to) return
    if (onItem?.(to)) return
    if ('ref' in to) open(to.ref)
    else if ('page' in to) { if (to.hash) { sessionStorage.setItem('page-sub:' + to.page, to.hash); window.dispatchEvent(new CustomEvent('page-sub', { detail: to })) } location.hash = '/' + to.page }
    else if ('sds' in to) setSds(to.sds)
    else if ('href' in to) { if (to.href.startsWith('tel:')) location.href = to.href; else window.open(to.href, '_blank', 'noopener') }
    else if ('fieldJob' in to) open({ type: 'job', id: to.fieldJob })
  }
  const count = brief.sections.reduce((s, x) => s + x.items.length, 0)
  const urgent = brief.sections.reduce((s, x) => s + x.items.filter(i => i.tone === 'bad').length, 0)
  const sdsDoc = sds ? byId(db.sds, sds) : undefined
  return (
    <div className={cn('flex flex-col gap-3', !compact && 'max-w-[1500px] mx-auto mb-6')} data-testid="role-briefing">
      {!shown && (offer ? (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="card p-4 sm:p-5 flex items-center gap-4 accent-glow border-accent/40" data-testid="briefing-offer">
          <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Sparkles className="size-5" /></span>
          <div className="flex-1 min-w-0"><div className="font-semibold">Your {new Date().getHours() < 12 ? 'morning' : 'daily'} briefing is ready</div><div className="text-sm text-muted truncate">{count} things for today{urgent ? ` · ${urgent} need you` : ''} · about a minute</div></div>
          <button onClick={dismissOffer} className="text-sm text-muted hover:text-ink hidden sm:block">Not now</button>
          <button onClick={play} className="h-11 px-5 rounded-full bg-accent text-accent-ink font-semibold inline-flex items-center gap-2 press" data-testid="role-briefing-btn"><Play className="size-4" />Play</button>
        </motion.div>
      ) : (
        <button onClick={play} className="self-start h-11 px-5 rounded-full border hairline bg-surface hover:bg-surface-2 font-semibold inline-flex items-center gap-2 press text-sm" data-testid="role-briefing-btn"><Play className="size-4 text-accent" />{new Date().getHours() < 12 ? 'Morning' : 'Daily'} briefing{urgent ? <span className="ml-1 rounded-full bg-bad-solid text-white text-[11px] px-2 h-5 inline-flex items-center">{urgent}</span> : null}</button>
      ))}
      <AnimatePresence>{shown && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card p-4 sm:p-5 flex flex-col gap-4 accent-glow border-accent/40" data-testid="role-briefing-card">
          <div className="flex items-start gap-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-ink"><Sparkles className="size-5" /></span>
            <div className="flex-1 min-w-0"><div className="label mb-1">Ask {company.assistantName} · {brief.title} briefing</div><div className="text-lg leading-snug" data-testid="briefing-text">{typed}{playing && <span className="blink">▍</span>}</div></div>
            <div className="flex gap-1">{playing ? <button onClick={stop} className="size-9 grid place-items-center rounded-full hover:bg-surface-2" aria-label="Stop"><Square className="size-4" /></button> : <button onClick={play} className="size-9 grid place-items-center rounded-full hover:bg-surface-2" aria-label="Replay"><Play className="size-4" /></button>}<button onClick={close} className="size-9 grid place-items-center rounded-full hover:bg-surface-2" aria-label="Close"><X className="size-4" /></button></div>
          </div>
          {brief.map && <div className="rounded-2xl overflow-hidden border hairline isolate"><FleetMap units={[]} branches={false} height={170} center={[brief.map.lat, brief.map.lng]} zoom={11} sites={[{ lat: brief.map.lat, lng: brief.map.lng, label: brief.map.label }]} /></div>}
          <div className={cn('grid gap-3', !compact && 'md:grid-cols-2 xl:grid-cols-3')}>
            {brief.sections.map(s => { const I = ((Icons as unknown as Record<string, Icons.LucideIcon>)[s.icon] ?? Icons.Circle); return (
              <div key={s.title} className="rounded-2xl bg-surface-2/60 p-3" data-testid="brief-section">
                <div className="flex items-center gap-2 px-1 mb-1.5 text-xs font-bold uppercase tracking-wide text-muted"><I className="size-4" />{s.title}{s.items.length > 0 && <span className="ml-auto font-semibold normal-case tracking-normal">{s.items.length}</span>}</div>
                {s.items.length ? s.items.slice(0, 8).map((it, k) => <Item key={k} it={it} onClick={() => go(it.to)} />) : <div className="px-1 py-1.5 text-sm text-muted">{s.empty}</div>}
                {s.items.length > 8 && <div className="px-1 text-xs text-muted">+{s.items.length - 8} more</div>}
              </div>) })}
          </div>
        </motion.div>
      )}</AnimatePresence>
      {sdsDoc && <SdsSheet sds={sdsDoc} open onClose={() => setSds(null)} />}
    </div>
  )
}

function Item({ it, onClick }: { it: BriefItem; onClick: () => void }) {
  const dot = it.tone === 'bad' ? 'bg-bad' : it.tone === 'warn' ? 'bg-warn' : it.tone === 'ok' ? 'bg-ok' : it.tone === 'info' ? 'bg-info' : 'bg-faint'
  const inner = <><span className={cn('size-2 rounded-full shrink-0 mt-1.5', dot)} /><span className="flex-1 min-w-0"><span className="block text-sm font-semibold leading-snug">{it.label}</span>{it.sub && <span className="block text-xs text-muted leading-snug line-clamp-2">{it.sub}</span>}</span>{it.to && <ChevronRight className="size-4 text-faint shrink-0 mt-0.5" />}</>
  return it.to ? <button onClick={onClick} className="w-full flex items-start gap-2.5 text-left rounded-xl px-1 py-1.5 hover:bg-surface press" data-testid={it.testid ?? 'brief-item'}>{inner}</button> : <div className="flex items-start gap-2.5 px-1 py-1.5" data-testid="brief-info">{inner}</div>
}
