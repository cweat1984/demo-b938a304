/** Phone "More" page: search by any word people use, pinned + recent, clear sections (A–Z inside), or one A–Z list. */
import { GuestSwitchRow } from '../guest/GuestSwitch'
import { guestViews } from '../data/roles'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Search, Star, ChevronRight, LogOut, X, PanelBottom, Pencil, Check, Clock, Sparkles } from 'lucide-react'
import { useStore } from '../data/store'
import { roleDef, type PageKey } from '../data/roles'
import { ICONS } from '../components/icons'
import { Sheet } from '../components/ui'
import { PoweredBy } from '../components/PoweredBy'
import { cn } from '../lib/util'
import { useNav, useHubs } from '../shell/Shell'
import { useNavPrefs, userKey } from './prefs'
import { destinations, searchDests, didYouMean, defineTerm, type Dest, type Hit } from './search'

export function useDestinations() {
  const nav = useNav(); const hubs = useHubs()
  return useMemo(() => { const sec = (k: PageKey) => hubs.find(h => h.items.some(p => p.key === k))?.label; return destinations(nav, sec) }, [nav, hubs])
}
export function goDest(d: Dest) {
  const st = useStore.getState(); st.go(d.page)
  if (d.hint) toast(d.label, { description: `Opened ${d.hint}` })
}
export function openGlobalSearch(q: string) { useStore.getState().setUI({ cmdOpen: true }); setTimeout(() => window.dispatchEvent(new CustomEvent('sc-cmd-q', { detail: q })), 30) }

export default function MoreSheet({ open, onClose, defaultTabs }: { open: boolean; onClose: () => void; defaultTabs: PageKey[] }) {
  const session = useStore(s => s.session)!; const page = useStore(s => s.ui.page); const signOut = useStore(s => s.signOut)
  const rd = roleDef(session.role); const u = userKey(session)
  const hubs = useHubs(); const dests = useDestinations()
  const np = useNavPrefs(); const pins = np.pins[u] ?? []; const recent = (np.recent[u] ?? []).filter(k => k !== page); const tabs = np.tabs[u] ?? defaultTabs
  const [q, setQ] = useState(''); const [edit, setEdit] = useState(false)
  const close = () => { setQ(''); setEdit(false); onClose() }
  const pick = (d: Dest) => { close(); goDest(d) }
  const byKey = (k: string) => dests.find(d => d.key === k)
  const hits = useMemo(() => searchDests(dests, q), [dests, q])
  const dym = useMemo(() => (q && !hits.length ? didYouMean(dests, q) : []), [dests, q, hits.length])
  const az = [...dests].sort((a, b) => a.label.localeCompare(b.label))
  const sections = hubs.map(h => ({ key: h.key, label: h.label, items: dests.filter(d => d.section === h.label && !d.hint).sort((a, b) => a.label.localeCompare(b.label)) })).filter(s => s.items.length)

  const Row = ({ d, why }: { d: Dest | Hit; why?: string }) => { const Icon = ICONS[d.icon] ?? ICONS.FileText; const pinned = pins.includes(d.key); const inBar = tabs.includes(d.page) && !d.hint; return (
    <div className={cn('flex items-center min-h-12', d.page === page && !d.hint && 'text-accent')}>
      <button data-testid="more-item" data-key={d.key} onClick={() => pick(d)} className="flex-1 min-w-0 flex items-center gap-3 min-h-12 px-3 text-left active:bg-surface-2 rounded-xl">
        <span className="size-9 shrink-0 grid place-items-center rounded-xl bg-surface-2"><Icon className="size-[18px]" /></span>
        <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold truncate">{d.label}</span>
          {(why || d.hint) && <span className="block text-[12px] text-muted truncate" data-testid="more-why">{why ? `matches: ${why}` : ''}{why && d.hint ? ' · ' : ''}{d.hint ?? ''}</span>}</span>
        {!edit && <ChevronRight className="size-4 text-faint shrink-0" />}
      </button>
      {edit && <>
        <button onClick={() => np.togglePin(u, d.key)} aria-pressed={pinned} aria-label={`${pinned ? 'Unpin' : 'Pin'} ${d.label}`} data-testid="pin-btn" className={cn('size-11 grid place-items-center rounded-xl', pinned ? 'text-warn' : 'text-faint')}><Star className={cn('size-5', pinned && 'fill-current')} /></button>
        {!d.hint && <button onClick={() => { const r = np.toggleTab(u, d.page, defaultTabs); if (r === 'full') toast('Bottom bar holds 4', { description: 'Remove one first (tap its bar icon again).' }) }} aria-pressed={inBar} aria-label={`${inBar ? 'Remove from' : 'Add to'} bottom bar: ${d.label}`} data-testid="tab-btn" className={cn('size-11 grid place-items-center rounded-xl', inBar ? 'text-accent' : 'text-faint')}><PanelBottom className="size-5" /></button>}
      </>}
    </div>) }

  const Chips = ({ title, icon, keys, testid }: { title: string; icon: React.ReactNode; keys: string[]; testid: string }) => { const ds = keys.map(byKey).filter(Boolean) as Dest[]; if (!ds.length) return null; return (
    <div className="mb-4" data-testid={testid}><div className="label mb-2 flex items-center gap-1.5 px-1">{icon}{title}</div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">{ds.map(d => { const Icon = ICONS[d.icon] ?? ICONS.FileText; return <button key={d.key} onClick={() => pick(d)} data-key={d.key} className="shrink-0 w-[84px] min-h-[76px] rounded-2xl bg-surface-2 flex flex-col items-center justify-center gap-1.5 px-1.5 text-[12px] font-semibold text-center leading-tight active:scale-[.97] transition"><Icon className="size-5" /><span className="line-clamp-2">{d.label}</span></button> })}</div></div>) }

  return (
    <Sheet open={open} onClose={close} title="Go to" sub={session.role === 'guest' ? `${session.name} · viewing as ${guestViews().find(v => v.k === (session.view ?? 'owner'))?.label ?? 'Owner overview'} · view-only` : `${session.name} · ${rd.label}`} data-testid="more-sheet" actions={<button onClick={() => setEdit(e => !e)} data-testid="more-edit" aria-pressed={edit} className={cn('h-10 px-3.5 rounded-full text-sm font-semibold inline-flex items-center gap-1.5', edit ? 'bg-accent text-accent-ink' : 'bg-surface-2')}>{edit ? <><Check className="size-4" />Done</> : <><Pencil className="size-4" />Edit</>}</button>}>
      <div data-testid="more-page" className="min-h-[72dvh]">
        <GuestSwitchRow onOpen={close} />
        <div className="sticky -top-1 z-10 bg-surface pb-3 pt-1">
          <label className="relative block"><Search className="size-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input data-testid="more-search" type="text" inputMode="search" enterKeyHint="go" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const d = hits[0] ?? dym[0]; if (d) pick(d) } }} placeholder="Search, e.g. “paycheck” or “crane”" className="input !h-12 !pl-11 !pr-10 !rounded-2xl !text-[16px] w-full" autoComplete="off" autoCorrect="off" spellCheck={false} />
            {q && <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 size-9 grid place-items-center text-faint"><X className="size-4" /></button>}</label>
        </div>
        {edit && <div className="mb-4 rounded-2xl border border-accent/40 bg-accent/5 p-3 text-[13px]" data-testid="more-edit-help"><b>Customize:</b> tap <Star className="inline size-3.5 -mt-0.5" /> to pin a favorite, and <PanelBottom className="inline size-3.5 -mt-0.5" /> to put it in the bottom bar (up to 4).
          <div className="mt-2 flex items-center gap-2 flex-wrap"><span className="text-muted">Bottom bar:</span>{tabs.map(k => <span key={k} className="rounded-full bg-surface-2 px-2.5 py-1 font-semibold" data-testid="bar-chip">{byKey(k)?.label ?? k}</span>)}<button onClick={() => np.resetTabs(u)} className="text-accent font-semibold ml-auto">Reset</button></div></div>}

        {q ? (
          <div data-testid="more-results">
            {(() => { const g = defineTerm(q); if (!g) return null; const d = g.page ? byKey(g.page) : undefined; return (
              <div className="mb-3 rounded-2xl border border-accent/30 bg-accent/5 p-3.5" data-testid="more-define"><div className="text-[13px] font-bold text-accent">{g.term} means…</div><div className="text-[14px] mt-0.5">{g.means}</div>
                {d && <button onClick={() => pick(d)} className="mt-2 text-[13px] font-semibold text-accent inline-flex items-center gap-1">Open {d.label}<ChevronRight className="size-3.5" /></button>}</div>) })()}
            {hits.length > 0 ? <div className="card-flat p-1 flex flex-col">{hits.slice(0, 12).map(h => <Row key={h.key} d={h} why={h.why} />)}</div> : (
              <div data-testid="more-noresult"><div className="text-sm text-muted px-1 mb-2">No page called “{q}”. <b className="text-ink">Did you mean…</b></div>
                <div className="card-flat p-1 flex flex-col" data-testid="more-dym">{dym.map(h => <Row key={h.key} d={h} />)}</div></div>)}
            <button onClick={() => { const v = q; close(); openGlobalSearch(v) }} data-testid="more-global" className="mt-3 w-full min-h-12 rounded-2xl bg-surface-2 px-4 flex items-center gap-3 text-left text-sm font-semibold"><Sparkles className="size-4 text-accent shrink-0" /><span className="flex-1 min-w-0 truncate">Search people, jobs, cranes &amp; trucks for “{q}”</span><ChevronRight className="size-4 text-faint" /></button>
          </div>
        ) : <>
          <Chips title="Pinned" icon={<Star className="size-3.5" />} keys={pins} testid="more-pinned" />
          <Chips title="Recent" icon={<Clock className="size-3.5" />} keys={recent} testid="more-recent" />
          {!pins.length && !edit && <div className="text-[12.5px] text-muted mb-4 px-1">Tip: tap <b>Edit</b> to pin favorites and choose your bottom-bar tabs.</div>}
          <div className="flex rounded-xl bg-surface-2 p-1 mb-4" role="tablist">{(['sections', 'az'] as const).map(v => <button key={v} role="tab" aria-selected={np.view === v} data-testid={`more-view-${v}`} onClick={() => np.setView(v)} className={cn('flex-1 h-10 rounded-lg text-sm font-semibold transition', np.view === v ? 'bg-surface text-ink shadow-sm' : 'text-muted')}>{v === 'az' ? 'A–Z' : 'By section'}</button>)}</div>
          {np.view === 'az' ? <div className="card-flat p-1 flex flex-col" data-testid="more-az">{az.map(d => <Row key={d.key} d={d} />)}</div>
            : <div className="flex flex-col gap-4" data-testid="more-sections">{sections.map(s => <section key={s.key} data-section={s.key}><div className="label mb-1.5 px-1">{s.label}</div><div className="card-flat p-1 flex flex-col">{s.items.map(d => <Row key={d.key} d={d} />)}</div></section>)}</div>}
        </>}
        {session.role !== 'guest' && <button onClick={() => { close(); signOut() }} className="mt-6 w-full h-12 rounded-2xl bg-surface-2 font-semibold flex items-center justify-center gap-2"><LogOut className="size-4" />Switch role</button>}
        <div className="mt-5 flex justify-center"><PoweredBy size={13} /></div>
      </div>
    </Sheet>
  )
}
