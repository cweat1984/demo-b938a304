import { toast } from 'sonner'
import { usePresent } from '../lib/present'
import { Presentation } from 'lucide-react'
import BrandingPage from '../branding/BrandingPage'
import GuestPasses from '../guest/GuestPasses'
import { GuestSwitchChip } from '../guest/GuestSwitch'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import RoleBriefing from '../components/RoleBriefing'
import { PoweredBy } from '../components/PoweredBy'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useAppName, useCompany, CRANE_PAGES, storeLabel } from '../data/brand'
import { useBranding } from '../data/branding'
import { motion, AnimatePresence } from 'motion/react'
import { Bell, Search, Siren, LogOut, Menu, WifiOff, ChevronDown, ChevronLeft, Sparkles, Check } from 'lucide-react'
import UndoBar from '../components/UndoBar'
import { useStore } from '../data/store'
import { PAGES, roleDef, GATED_PAGES, type PageKey } from '../data/roles'
import { ICONS } from '../components/icons'
import { Avatar, Sheet, DemoTag } from '../components/ui'
import { cn } from '../lib/util'
import { Logo } from './Splash'
import { FlagMark } from '../components/Flag'
import CommandBar from '../components/CommandBar'
import MoreSheet from '../nav/MoreSheet'
import { useNavPrefs, userKey } from '../nav/prefs'
import EntityDrawer from '../components/EntityDrawer'
import { SyncChip } from '../batch5/OfflineLayer'
import BreakdownSheet from '../components/Breakdown'
import JobBuilder from '../components/JobBuilder'
import Notifications, { useAlerts } from '../components/Notifications'
import OrgFilter from '../components/OrgFilter'
import Command from '../pages/Command'
import Dispatch from '../pages/Dispatch'
import Jobs from '../pages/Jobs'
import Forecast from '../pages/Forecast'
import Tickets from '../pages/Tickets'
import Equipment from '../pages/Equipment'
import Configs from '../pages/Configs'
import Shop from '../pages/Shop'
import Inventory from '../pages/Inventory'
import People from '../pages/People'
import Allocations from '../pages/Allocations'
import Safety from '../pages/Safety'
import Time from '../pages/Time'
import Analytics from '../pages/Analytics'
import Receivables from '../pages/Receivables'
import Payables from '../pages/Payables'
import Contacts from '../pages/Contacts'
import Integrations from '../pages/Integrations'
import Audit from '../pages/Audit'
import Settings from '../pages/Settings'
import WindFarms from '../pages/WindFarms'
import Quotes from '../pages/Quotes'
import Lifts from '../pages/Lifts'
import Vault from '../pages/Vault'
import MyInfo from '../pages/MyInfo'
import InvCommand from '../pages/InvCommand'
import Purchasing from '../pages/Purchasing'
import Requests from '../pages/Requests'
import InvGuide from '../pages/InvGuide'
import Moves from '../pages/Moves'
import Suggest from '../pages/Suggest'
import Pickup from '../batch3/Pickup'
import Bids from '../batch3/Bids'
import Weather from '../batch3/Weather'
import Onboarding from '../launch2/Onboarding'
import Store from '../launch2/Store'
import Expenses from '../launch2/Expenses'
import ReconPage from '../batch3b/Recon'
import ChangeOrders from '../batch3b/ChangeOrders'
import { SiteDataPage } from '../batch3b/SiteMemory'
import Maintenance from '../batch4/Maintenance'
import Messages from '../batch4/Messages'
import Dashboard from '../batch4/Dashboard'
import AcctSync from '../batch4/AcctSync'
import FuelPage from '../gapb/Fuel'
import PtoPage from '../gapb/Pto'
import Permits from '../gapb/Permits'
import UnionPage from '../union/UnionPage'
import CertHub from '../gapA/CertHub'
import RiggingPage from '../gapA/Rigging'
import DrugAlcohol from '../gapA/DrugAlcohol'
import AskHero from '../gapA/AskHero'
import Shortcuts from '../nav/Shortcuts'
import { termTip } from '../nav/search'

const VIEWS: Partial<Record<PageKey, () => ReactNode>> = {
  command: Command, dispatch: Dispatch, jobs: Jobs, forecast: Forecast, tickets: Tickets, equipment: Equipment, configs: Configs, shop: Shop,
  inventory: Inventory, people: People, allocations: Allocations, safety: Safety, time: Time, analytics: Analytics, receivables: Receivables,
  payables: Payables, windfarms: WindFarms, contacts: Contacts, integrations: Integrations, audit: Audit, settings: Settings, quotes: Quotes, lifts: Lifts, vault: Vault, myinfo: MyInfo,
  invhome: InvCommand, purchasing: Purchasing, requests: Requests, invguide: InvGuide, moves: Moves, suggest: Suggest, pickup: Pickup, bids: Bids, weather: Weather,
  onboarding: Onboarding, store: Store, expenses: Expenses,
  recon: ReconPage, changeorders: ChangeOrders, certtracker: CertHub, sitedata: SiteDataPage,
  maint: Maintenance, messages: Messages, mgmt: Dashboard, acctsync: AcctSync,
  fuel: FuelPage, pto: PtoPage, permits: Permits, union: UnionPage,
  rigging: RiggingPage, drugalc: DrugAlcohol, guests: GuestPasses, branding: BrandingPage,
}

/** Hubs keep the sidebar to ~7 rows; related screens become tabs inside the hub. */
export const HUBS: { key: string; label: string; icon: string; pages: PageKey[] }[] = [
  { key: 'command', label: 'Command', icon: 'Radar', pages: ['command', 'mgmt'] },
  { key: 'dispatch', label: 'Dispatch', icon: 'CalendarRange', pages: ['dispatch', 'pickup', 'forecast', 'tickets', 'allocations'] },
  { key: 'jobs', label: 'Jobs', icon: 'Briefcase', pages: ['jobs', 'quotes', 'bids', 'weather', 'lifts', 'windfarms', 'recon', 'changeorders', 'sitedata'] },
  { key: 'fleet', label: 'Equipment & Shop', icon: 'Truck', pages: ['equipment', 'moves', 'configs', 'shop', 'maint', 'fuel', 'permits'] },
  { key: 'inventory', label: 'Inventory', icon: 'Boxes', pages: ['invhome', 'inventory', 'purchasing', 'requests', 'invguide'] },
  { key: 'people', label: 'People', icon: 'Users', pages: ['people', 'myinfo', 'onboarding', 'time', 'pto', 'union', 'store'] },
  { key: 'safety', label: 'Safety', icon: 'ShieldCheck', pages: ['safety', 'certtracker', 'rigging', 'drugalc'] },
  { key: 'money', label: 'Money', icon: 'LineChart', pages: ['analytics', 'receivables', 'payables', 'expenses', 'acctsync'] },
  { key: 'office', label: 'Office & Settings', icon: 'Settings', pages: ['messages', 'contacts', 'vault', 'settings', 'branding', 'guests', 'integrations', 'audit', 'suggest'] },
]
export function useHubs() {
  const nav = useNav()
  return useMemo(() => {
    const allowed = new Set(nav.map(p => p.key))
    const seen = new Set<PageKey>()
    const hubs = HUBS.map(h => ({ ...h, items: h.pages.filter(k => allowed.has(k)).map(k => { seen.add(k); return nav.find(p => p.key === k)! }) })).filter(h => h.items.length)
    // anything a role has that isn't in a hub still gets its own row
    nav.filter(p => !seen.has(p.key)).forEach(p => hubs.push({ key: p.key, label: p.label, icon: p.icon, pages: [p.key], items: [p] }))
    // a hub with one screen takes that screen's name and icon (e.g. HR sees "Time & Payroll")
    return hubs.map(h => h.items.length === 1 ? { ...h, label: h.key === 'command' || (h.key === 'inventory' && h.items[0].key === 'inventory') ? h.label : h.items[0].label, icon: h.key === 'inventory' && h.items[0].key === 'inventory' ? h.icon : h.items[0].icon } : h).sort((a, b) => nav.findIndex(p => p.key === a.items[0].key) - nav.findIndex(p => p.key === b.items[0].key))
  }, [nav])
}

export function useNav() {
  const session = useStore(s => s.session)!
  const prefs = useStore(s => s.prefs)
  const crane = useCompany().modules.craneRigging
  const brand = useBranding(s => s.b)
  return useMemo(() => {
    const rd = roleDef(session.role)
    const order = prefs.navOrder[session.role] ?? rd.pages
    const hidden = new Set(prefs.hidden[session.role] ?? [])
    const keys = [...order.filter(k => rd.pages.includes(k)), ...rd.pages.filter(k => !order.includes(k))]
    return keys.filter(k => !hidden.has(k) && (crane || !(CRANE_PAGES as readonly string[]).includes(k))).map(k => PAGES.find(p => p.key === k)!).filter(Boolean).map(p => !crane && p.key === 'forecast' ? { ...p, label: 'Equipment Forecast' } : p.key === 'store' ? { ...p, label: storeLabel(brand) } : p)
  }, [session.role, session.view, prefs, crane, brand])
}

export default function Shell() {
  const appNm = useAppName()
  const company = useCompany()
  const brandF = useStore(s => s.ui.filter)
  const brandBranch = brandF.branchId !== 'all' ? (useStore.getState().db.branches.find(b => b.id === brandF.branchId)?.city ?? '') : 'All branches'
  const page = useStore(s => s.ui.page)
  const session = useStore(s => s.session)!
  const go = useStore(s => s.go)
  const setUI = useStore(s => s.setUI)
  const online = useStore(s => s.ui.online)
  const signOut = useStore(s => s.signOut)
  const nav = useNav()
  const rd = roleDef(session.role)
  const [bell, setBell] = useState(false)
  const [more, setMore] = useState(false)
  const [menu, setMenu] = useState(false)
  const alerts = useAlerts()
  const unread = alerts.filter(a => !a.read).length
  const blocked = !rd.pages.includes(page) && page !== rd.home && (session.role === 'guest' || GATED_PAGES.includes(page))
  const View = (blocked ? undefined : VIEWS[page]) ?? VIEWS[rd.home]!
  const denied = useStore(s => s.ui.denied) ?? (blocked ? page : null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setUI({ cmdOpen: true }) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [setUI])

  const hubs = useHubs()
  ;(window as unknown as { __scNav?: string[] }).__scNav = nav.map(p => p.key) // QA hook: the pages this role can open
  const hub = hubs.find(h => h.items.some(p => p.key === page))
  const defaultTabs = nav.slice(0, 4).map(p => p.key)
  const uKey = userKey(session)
  const myTabs = useNavPrefs(st => st.tabs[uKey])
  const mobileTabs = (myTabs ?? defaultTabs).map(k => nav.find(p => p.key === k)).filter(Boolean) as typeof nav
  useEffect(() => { useNavPrefs.getState().visit(uKey, page) }, [uKey, page])

  return (
    <div className="min-h-full flex overflow-x-clip">
      {/* keyboard: first Tab stop jumps past the sidebar + header */}
      <a href="#main-content" data-testid="skip-link" onClick={e => { e.preventDefault(); document.getElementById('main-content')?.focus() }} className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-xl focus:bg-accent focus:text-accent-ink focus:px-4 focus:py-2 focus:font-semibold">Skip to content</a>
      {/* sidebar */}
      <aside className="hidden lg:flex w-[232px] shrink-0 flex-col border-r hairline bg-surface/60 backdrop-blur sticky top-0 h-screen">
        <button onClick={() => go(rd.home)} className="flex items-center gap-2.5 px-5 min-h-16 py-2 shrink-0">
          <Logo size={30} />
          <div className="text-left"><div className="display font-semibold leading-none">{appNm}</div><div className="text-[10px] text-faint mt-1 tracking-wide flex items-center gap-1.5 uppercase">{company.shortName} · {brandBranch} <FlagMark width={13} /></div></div>
        </button>
        <nav className="flex-1 overflow-y-auto no-scrollbar px-3 pb-4 pt-2 flex flex-col gap-1">
          {hubs.map(h => {
            const Icon = ICONS[h.icon]
            const on = h.items.some(p => p.key === page)
            return (
              <div key={h.key}>
                <button onClick={() => go(h.items[0].key)} data-nav={h.items[0].key} data-hub={h.key} className={cn('relative w-full flex items-center gap-3 h-11 px-3 rounded-xl text-[14.5px] font-semibold transition', on ? 'text-ink' : 'text-muted hover:text-ink hover:bg-surface-2')}>
                  {on && <motion.span layoutId="nav-on" className="absolute inset-0 rounded-xl bg-surface-2 border hairline" transition={{ type: 'spring', bounce: 0.15, duration: 0.45 }} />}
                  <Icon className={cn('relative size-5', on && 'text-accent')} />
                  <span className="relative flex-1 text-left">{h.label}</span>
                  {h.items.length > 1 && <span className="relative text-[11px] text-muted font-medium num">{h.items.length}</span>}
                </button>
                {on && h.items.length > 1 && <div className="ml-6 pl-3 border-l hairline my-1 flex flex-col">{h.items.map(p => <button key={p.key} title={termTip(p.label)} onClick={() => go(p.key)} data-nav={p.key} className={cn('text-left h-8 px-2 rounded-lg text-[13px] transition', p.key === page ? 'text-ink font-semibold' : 'text-muted hover:text-ink')}>{p.label}</button>)}</div>}
              </div>
            )
          })}
        </nav>
        <div className="p-3 border-t hairline">
          <button onClick={() => setMenu(true)} className="w-full flex items-center gap-3 rounded-xl p-2 hover:bg-surface-2 transition">
            <Avatar name={session.name} size={34} />
            <div className="text-left min-w-0 flex-1"><div className="text-sm font-semibold truncate">{session.name}</div><div className="text-[11px] text-muted truncate">{rd.label}</div></div>
            <ChevronDown className="size-4 text-faint" />
          </button>
          <div className="mt-2 flex justify-center"><PoweredBy size={12} /></div>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col overflow-x-clip">
        {/* top bar */}
        <header className="sticky top-0 z-40 h-[calc(4rem+env(safe-area-inset-top))] landscape-short:h-[calc(3rem+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)] flex items-center gap-2 sm:gap-3 px-3 md:px-6 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] border-b hairline bg-bg/80 backdrop-blur-xl">
          {page !== rd.home
            ? <button className="lg:hidden shrink-0 -ml-1 size-[44px] grid place-items-center rounded-full active:bg-surface-2" data-testid="page-back" aria-label="Back" onClick={() => useStore.getState().pageBack()}><ChevronLeft className="size-7" /></button>
            : <button className="lg:hidden shrink-0 h-[44px] w-[44px] grid place-items-center -ml-2 rounded-xl" onClick={() => setMore(true)} aria-label="Menu" data-testid="hamburger"><Menu className="size-6" /></button>}
          <div className="lg:hidden shrink-0 hidden min-[420px]:block"><Logo size={28} /></div>
          <button onClick={() => setUI({ cmdOpen: true })} data-testid="ask" aria-label={`Ask ${company.assistantName} or search`} className="flex-1 min-w-0 max-w-xl flex items-center gap-3 h-10 px-3 sm:px-4 rounded-full bg-surface-2 border hairline text-muted hover:text-ink hover:border-faint/40 transition text-sm">
            <Sparkles className="size-4 text-accent" />
            <span className="truncate hidden sm:inline">Ask {company.assistantName} — “{company.modules.craneRigging ? 'which cranes are free Thursday?' : 'what equipment is free Thursday?'}”</span>
            <span className="truncate sm:hidden">Ask or search</span>
            <span className="ml-auto hidden md:flex items-center gap-1 text-[11px] text-faint"><kbd className="rounded border hairline px-1.5 py-0.5 font-mono">⌘</kbd><kbd className="rounded border hairline px-1.5 py-0.5 font-mono">K</kbd></span>
            <Search className="size-4 md:hidden ml-auto max-[420px]:hidden" />
          </button>
          <GuestSwitchChip />
          <div className="flex-1 hidden md:block" />
          {session.role !== 'guest' && <OrgFilter />}
          {!online && <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-warn"><WifiOff className="size-4" />Offline — changes saved on device</span>}
          <SyncChip />
          {rd.emergency && (
            <button onClick={() => setUI({ breakdownOpen: true })} aria-label="Emergency" className="shrink-0 inline-flex items-center gap-2 h-10 px-3 md:px-4 rounded-full bg-bad-solid text-white text-sm font-semibold hover:brightness-110 shadow-[0_8px_24px_-10px_#ef4444]" data-testid="emergency">
              <Siren className="size-4" /><span className="hidden md:inline">Emergency</span>
            </button>
          )}
          <PresentBtn />
          <UndoBar />
          <button onClick={() => setBell(true)} className="relative shrink-0 grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Notifications" data-testid="bell">
            <Bell className="size-5" />
            {unread > 0 && <span className="absolute top-1.5 right-1.5 min-w-4 h-4 px-1 rounded-full bg-bad text-[10px] font-bold text-white grid place-items-center num">{unread}</span>}
          </button>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 min-w-0 px-4 md:px-8 pl-[max(16px,env(safe-area-inset-left))] pr-[max(16px,env(safe-area-inset-right))] pt-6 md:pt-8 pb-[calc(7rem+env(safe-area-inset-bottom))] landscape-short:pb-10 lg:pb-10 outline-none">
          <AnimatePresence mode="wait">
            <motion.div key={page} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.22 }}>
              {hub && hub.items.length > 1 && (
                <div className="max-w-[1500px] mx-auto -mt-2 mb-5 flex gap-1 overflow-x-auto no-scrollbar" data-testid="hub-tabs">
                  {hub.items.map(p => <button key={p.key} title={termTip(p.label)} onClick={() => go(p.key)} className={cn('hub-tab shrink-0 rounded-full px-3.5 h-9 text-sm font-semibold transition', p.key === page ? 'bg-surface-3 text-ink border hairline' : 'text-muted hover:text-ink hover:bg-surface-2')}>{p.label}</button>)}
                </div>
              )}
              {/* work-surface homes (dispatch board, timecards, AR…): ask bar + shortcuts share one row on desktop so the work starts higher */}
              {/* dive3 dispatch M12: on phones the dispatch board comes first; ask bar, shortcuts and briefing follow it */}
              <div className="flex flex-col">
              {page === rd.home && (rd.home !== 'command'
                ? <div className={cn('max-w-[1500px] w-full mx-auto lg:flex lg:items-start lg:gap-3', page === 'dispatch' && 'max-md:order-2 max-md:mt-6')} data-testid="home-strip"><div className="lg:flex-1 min-w-0"><AskHero compact /></div><Shortcuts compact /></div>
                : <><AskHero /><Shortcuts /></>)}
              {page === rd.home && session.role !== 'owner' && session.role !== 'guest' && <div className={cn(page === 'dispatch' && 'max-md:order-3')}><RoleBriefing role={session.role} /></div>}
              <div className="min-w-0">{denied ? <NoAccess page={denied} home={rd.home} guest={session.role === 'guest'} /> : <ErrorBoundary key={page} section={page} label={PAGES.find(p => p.key === page)?.label}><View /></ErrorBoundary>}</div>
              </div>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* mobile tab bar */}
        <nav className="lg:hidden landscape-short:hidden fixed bottom-0 inset-x-0 z-40 border-t hairline bg-surface/90 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] px-[env(safe-area-inset-left)]">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))` }} data-testid="tabbar">
            {mobileTabs.map(p => { const Icon = ICONS[p.icon]; return (
              <button key={p.key} data-tab={p.key} onClick={() => go(p.key)} className={cn('flex flex-col items-center gap-1 py-2.5 min-h-[52px] text-[10px] font-semibold', p.key === page ? 'text-accent' : 'text-muted')}><Icon className="size-5" />{p.short ?? p.label.split(' ')[0]}</button>
            ) })}
            <button onClick={() => setMore(true)} data-testid="more-btn" className="flex flex-col items-center gap-1 py-2.5 min-h-[52px] text-[10px] font-semibold text-muted"><Menu className="size-5" />More</button>
          </div>
        </nav>
      </div>

      <MoreSheet open={more} onClose={() => setMore(false)} defaultTabs={defaultTabs} />
      <Sheet open={menu} onClose={() => setMenu(false)} title={session.name} sub={rd.label} width={420}>
        <div className="flex flex-col gap-2">
          <div className="card-flat p-4 text-sm flex items-center gap-2"><Check className="size-4 text-ok" />Signed in via {session.method}{session.mfa && ' · MFA verified'}</div>
          <button onClick={() => { setMenu(false); go('settings') }} className="card-flat p-4 text-left font-semibold">Settings & personalization</button>
          {session.role !== 'guest' && <button onClick={signOut} className="card-flat p-4 text-left font-semibold flex items-center gap-2"><LogOut className="size-4" />Switch role / sign out</button>}
          <div className="text-xs text-muted mt-3 flex items-center gap-2"><DemoTag />All data is fictional sample data.</div>
          <div className="mt-4 flex justify-center"><PoweredBy size={13} /></div>
        </div>
      </Sheet>
      <Notifications open={bell} onClose={() => setBell(false)} />
      <CommandBar />
      <EntityDrawer />
      <BreakdownSheet />
      <JobBuilder />
    </div>
  )
}

/** Projector button (desktop/tablet): bigger type, stronger contrast, no feedback tabs. Shift+P also toggles. */
function PresentBtn() {
  const on = usePresent(s => s.on), set = usePresent(s => s.set)
  return <button onClick={() => { set(!on); toast(on ? 'Presentation mode off' : 'Presentation mode on', { description: on ? undefined : 'Bigger type, stronger contrast, feedback tabs hidden · Shift+P to toggle' }) }} aria-pressed={on} aria-label="Presentation mode" title="Presentation mode (Shift+P)" data-testid="present-btn"
    className={cn('hidden md:grid relative shrink-0 size-10 place-items-center rounded-full hover:bg-surface-2', on && 'bg-accent text-accent-ink hover:bg-accent')}><Presentation className="size-5" /></button>
}

/** Friendly stop instead of a silent bounce when an address points at a page this role can't open. */
function NoAccess({ page, home, guest }: { page: PageKey; home: PageKey; guest: boolean }) {
  const go = useStore(s => s.go); const label = PAGES.find(p => p.key === page)?.label ?? 'That page'
  return <div className="max-w-md mx-auto mt-16 text-center rounded-3xl border hairline bg-surface p-8" data-testid="no-access" data-page={page}>
    <div className="display text-2xl font-semibold">{guest ? 'That page isn’t part of this guest pass' : `You don’t have access to ${label}`}</div>
    <div className="text-sm text-muted mt-2">{guest ? 'This guest pass shows a demo of daily operations. Pay, HR and money pages aren’t part of it.' : 'Your role doesn’t include this page. Ask the office manager or owner if you need it.'}</div>
    <button className="mt-5 h-11 px-5 rounded-xl bg-accent text-accent-ink font-semibold" data-testid="no-access-home" onClick={() => go(home)}>Go to my home page</button>
  </div>
}
