import { afterBack, FRAMED, setHash, memPages } from '../lib/backstack'
import { clearUndo, noteRosterChange } from '../lib/undo'
import { guestContext } from '../guest/pass'
import { freshPage, clearKeep } from '../lib/keep'
import type { ThemeKey, Mode, Palette } from './themes'
import { THEMES } from './themes'
import { create } from 'zustand'
import type * as T from './types'
import type { PageKey } from './roles'
import { roleDef, ROLES, setGuestView, currentGuestScope } from './roles'
import { scrubDb } from '../guest/guard'
import { localRepository } from './repo'
import { uid, today, addDays, range, hoursBetween, diffDays, csvHooks, dateOf } from '../lib/util'
import { realHours, elapsedHours, entriesOverlap, isoOffset, localDate, hhmmOf, deviceTz, MAX_SHIFT_H } from './timemath'
import { byId, fullName, requiredPositions, isLive, type OrgFilter } from './logic'
import { jobCranes, firstClash } from './rig'
import { emailFor, seed as freshSeed } from './seed'
import { inspectionDays } from './certValidity'
import { openQty, isOpen, isReturnable, targetLabel, postInvCost, shelfOf } from './invcore'
import { rateFor, extraLabel, extraEnd, isOnTicketDates, EXTRA_EDITORS, customerExtraLines } from './extras'
import { MYINFO_FIELDS, getPath, setPath, emergencyOf } from './myinfo'
import { useBranding, setBrandingAudit } from './branding'

export type Theme = ThemeKey | 'system'
/** Scroll position per page, so Back returns you to where you were. */
const SCROLL: Record<string, number> = {}
function restoreScroll(y: number) { [60, 300, 600].forEach(ms => setTimeout(() => { if (Math.abs(window.scrollY - y) > 4) window.scrollTo({ top: y }) }, ms)) }
export interface Prefs { theme: Theme; mode?: Mode; custom?: Palette; accent: string; fontSize: 'S' | 'M' | 'L' | 'XL'; font: 'Inter' | 'Barlow' | 'System'; navOrder: Partial<Record<T.RoleKey, PageKey[]>>; hidden: Partial<Record<T.RoleKey, PageKey[]>>; density: 'comfortable' | 'compact'; myColor?: Record<string, string> }
export const DEFAULT_PREFS: Prefs = { theme: 'slh', accent: '#d62f2f', fontSize: 'M', font: 'Inter', navOrder: {}, hidden: {}, density: 'comfortable' }
export interface Session { role: T.RoleKey; name: string; employeeId?: string; /** guest pass: whose view the guest is looking at (Switch role) */ view?: string; mfa: boolean; signedInAt: string; method: 'Demo role' | 'Microsoft Entra ID (demo)' | 'Passkey (this device)' | '2FA code (demo)' | 'Guest pass' }

interface UI {
  page: PageKey
  /** A page the user tried to open by address but can't: shown as a friendly no-access card. */
  denied?: PageKey | null
  drawer: T.EntityRef | null
  drawerStack: T.EntityRef[]
  filter: OrgFilter
  cmdOpen: boolean
  askQuery: string | null
  breakdownOpen: boolean
  breakdownUnit?: string
  jobBuilder: null | { prefill?: Partial<T.Job> }
  windFarm: string | null
  online: boolean
}

interface State {
  ready: boolean
  db: T.DB
  session: Session | null
  prefs: Prefs
  ui: UI
  init(): Promise<void>
  signIn(role: T.RoleKey, method?: Session['method'], asEmployeeId?: string): void
  /** Guest pass: look at the app as another role (still view-only, scrubbed data, only pages the pass allows). */
  guestSwitch(view: string): void
  signOut(): void
  go(page: PageKey): void
  /** Header back arrow: previous page (real history, or in-memory inside a demo frame). */
  pageBack(): void
  open(ref: T.EntityRef | null): void
  back(): void
  setUI(p: Partial<UI>): void
  setPrefs(p: Partial<Prefs>): void
  resetDemo(): Promise<void>
  /** Generic mutation with audit trail. */
  commit(action: string, entity: string, detail: string, recipe: (db: T.DB) => void, opts?: { silent?: boolean; diff?: T.AuditEvent['diff'] }): void
}

let saveTimer: number | undefined
let initStarted = false
const REV_KEY = 'sc-db-rev'
const PENDING_KEY = 'sc-db-pending'
/** Remember the latest edit synchronously. IndexedDB may not finish before a reload; the rev says which copy is newer. */
function remember(db: T.DB) {
  try {
    if (db.savedRev) localStorage.setItem(REV_KEY, String(db.savedRev))
    localStorage.setItem(PENDING_KEY, JSON.stringify(db))
  } catch { /* quota: the debounced IndexedDB save still runs */ }
}
function dropPendingIfCurrent(rev: number | undefined) {
  try { if (rev && localStorage.getItem(REV_KEY) === String(rev)) localStorage.removeItem(PENDING_KEY) } catch { /* */ }
}
function readPending(): T.DB | null {
  try { const raw = localStorage.getItem(PENDING_KEY); if (!raw) return null; const pend = JSON.parse(raw) as T.DB; return pend && typeof pend === 'object' ? pend : null } catch { return null }
}
/** Pending wins when it is the same demo set and at least as new as IndexedDB. A different seed (after Reset) does not come back. */
function preferDb(base: T.DB, pend: T.DB | null): T.DB {
  if (!pend || pend.version !== base.version || pend.seededAt !== base.seededAt) return base
  if ((pend.savedRev ?? 0) >= (base.savedRev ?? 0)) return pend
  return base
}
const loadPrefs = (): Prefs => { try { const p: Prefs = { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem('sc-prefs') || '{}') }; if (p.theme !== 'system' && !THEMES.some(t => t.key === p.theme)) p.theme = 'slh'; return p } catch { return DEFAULT_PREFS } }
/** `?as=field` embeds a signed-in role without touching this tab's session (used by the side-by-side live demo). */
// only inside the live-demo frame (never a top-level tab), and never on a browser that opened a guest pass
/** ?as= embeds (the Phone + office demo) — only inside a SAME-ORIGIN ?sync page, never a guest context or another site's frame. */
const syncParent = () => { try { return window.top !== window.self && window.parent.location.origin === location.origin && new URLSearchParams(window.parent.location.search).has('sync') } catch { return false } }
export const EMBED_ROLE = (!import.meta.env.VITE_GUEST_ONLY && syncParent() && !guestContext() ? new URLSearchParams(location.search).get('as') || null : null) as T.RoleKey | null
/** Guest writes allowed (suggestions / design notes). Everything else is view-only — enforced here, not only in GuestLayer. */
const GUEST_WRITE_OK = /^(Signed in|Suggestion|Suggest|Feedback|Design note|Note|Upvote|Comment)/i
const guestTab = () => useStore.getState().session?.role === 'guest' || guestContext()
/** Every change is broadcast to other open windows (phone + office stay in sync, live). */
const live: BroadcastChannel | null = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('southern-live') : null
const payKey = (p: { date: string; amount: number; method: string; ref: string }) => `${p.date}|${p.amount}|${p.method}|${p.ref}`
/** A tab that saved from an older copy sends the whole database. Keep crew, invoices, and payments this tab already added. */
function keepLocalAdds(local: T.DB, incoming: T.DB): T.DB {
  const db: T.DB = { ...incoming }
  const asgIds = new Set(incoming.assignments.map(a => a.id))
  const keptAsg = local.assignments.filter(a => !asgIds.has(a.id))
  if (keptAsg.length) db.assignments = [...incoming.assignments, ...keptAsg.map(a => ({ ...a }))]
  if (local.invoices && incoming.invoices) {
    const invoices = incoming.invoices.map(i => ({ ...i, payments: [...(i.payments ?? [])] }))
    const byId = new Map(invoices.map(i => [i.id, i]))
    let touched = false
    for (const li of local.invoices) {
      const cur = byId.get(li.id)
      if (!cur) { invoices.push({ ...li, payments: [...(li.payments ?? [])] }); touched = true; continue }
      const have = new Set(cur.payments.map(payKey))
      const extra = (li.payments ?? []).filter(p => !have.has(payKey(p)))
      if (!extra.length) continue
      cur.payments = [...cur.payments, ...extra.map(p => ({ ...p }))]
      touched = true
      if (cur.kind === 'Credit') continue
      const paid = Math.min(cur.amount, Math.round(cur.payments.reduce((s, p) => s + p.amount, 0) * 100) / 100)
      cur.paid = paid
      if (paid >= cur.amount - 0.005) {
        cur.status = 'Paid'; cur.collections = 'Paid'
        const j = db.jobs.find(x => x.id === cur.jobId)
        if (j && j.invoiceNo === cur.invNo && j.stage !== 'Paid') db.jobs = db.jobs.map(x => x.id === j.id ? { ...x, stage: 'Paid' as const } : x)
      } else if (paid > 0 && cur.status !== 'Overdue') cur.status = 'Partial'
    }
    if (touched) db.invoices = invoices
  }
  if (local.bills && incoming.bills) {
    const bills = incoming.bills.map(b => ({ ...b, payments: [...(b.payments ?? [])] }))
    const byId = new Map(bills.map(b => [b.id, b]))
    let touched = false
    for (const lb of local.bills) {
      const cur = byId.get(lb.id)
      if (!cur) { bills.push({ ...lb, payments: [...(lb.payments ?? [])] }); touched = true; continue }
      const ids = new Set((cur.payments ?? []).map(p => p.id))
      const extra = (lb.payments ?? []).filter(p => p.id && !ids.has(p.id))
      if (!extra.length) continue
      cur.payments = [...(cur.payments ?? []), ...extra.map(p => ({ ...p }))]
      touched = true
      const tot = cur.lines.reduce((s, l) => s + l.amount, 0)
      if (cur.payments.reduce((s, p) => s + p.amount, 0) >= tot - 0.005) { cur.status = 'Paid'; cur.paidOn = cur.paidOn ?? extra[extra.length - 1].date }
    }
    if (touched) db.bills = bills
  }
  return db
}
const loadSession = (): Session | null => { if (EMBED_ROLE) return null; try { const s = JSON.parse(sessionStorage.getItem('sc-session') || 'null'); return s && typeof s === 'object' && ROLES.some(r => r.key === s.role) && (s.role === 'guest' || !guestContext()) ? s : null } catch { return null } } // unknown role → sign-in screen, not a white screen
const pageFromHash = (): PageKey | null => (location.hash.replace(/^#\/?/, '').split('?')[0] as PageKey) || null

/** dive2 shop M8: the rigging tag program (gapA/rigging) registers here so checkout/check-in respect QR-tagged pieces without a circular import. */
export const rigHooks: { guard?: (db: T.DB, itemId: string, qty: number) => string | null; pick?: (db: T.DB, itemId: string, qty: number, tags?: string[]) => { tags?: string[]; error?: string }; out?: (tags: string[], checkoutId: string) => void; back?: (tags: string[]) => void; damaged?: (itemId: string, qty: number, by: string, note?: string, tags?: string[]) => void } = {}
/** dive3 B3/M1: the branch filter belongs to one sign-in. Company-wide roles open on All Company; everyone else on their own
 *  branch. Kept for a reload of the same sign-in (sessionStorage, tied to signedInAt), never carried to the next person. */
const WIDE_ROLES = ['owner', 'accounting', 'payroll', 'hr']
export function scopeFor(db: T.DB | null, role: string, employeeId?: string): OrgFilter {
  if (WIDE_ROLES.includes(role)) return { divisionId: 'all', branchId: 'all' }
  const home = db?.employees.find(e => e.id === employeeId)?.branchId
  return { divisionId: 'all', branchId: home && db?.branches.some(b => b.id === home) ? home : (db?.branches.find(b => b.hq)?.id ?? db?.branches[0]?.id ?? 'all') }
}
const FILTER_KEY = 'sc-filter'
const saveFilter = (s: Session | null, f: OrgFilter) => { try { if (s) sessionStorage.setItem(FILTER_KEY, JSON.stringify({ at: s.signedInAt, f })) } catch { /* */ } }
const loadFilter = (s: Session | null): OrgFilter | null => { try { const v = JSON.parse(sessionStorage.getItem(FILTER_KEY) ?? 'null'); return s && v && v.at === s.signedInAt && v.f?.branchId ? v.f : null } catch { return null } }
export const useStore = create<State>((set, get) => ({
  ready: false,
  db: null as unknown as T.DB,
  session: loadSession(),
  prefs: loadPrefs(),
  ui: { page: 'command', drawer: null, drawerStack: [], filter: { divisionId: 'all', branchId: 'br-okc' }, cmdOpen: false, askQuery: null, breakdownOpen: false, jobBuilder: null, windFarm: null, online: navigator.onLine },
  async init() {
    // React Strict Mode mounts twice in dev. A second init must not load an older snapshot over edits the first one already showed.
    if (initStarted) return
    initStarted = true
    // a guest tab never reads or writes the device's saved data: fresh demo data, in memory only
    let db = guestContext() ? freshSeed() : await localRepository.load()
    // an edit flushed synchronously at pagehide (IndexedDB can't finish during unload) wins if it belongs to the same data set.
    // A reload can read IndexedDB before that write commits and can also see the pending key already cleared, so a rev that is still ahead is retried once.
    if (!guestContext()) {
      db = preferDb(db, readPending())
      const rev = Number(localStorage.getItem(REV_KEY) || 0)
      if (rev && (db.savedRev ?? 0) < rev) {
        await new Promise(r => setTimeout(r, 150))
        try { db = preferDb(await localRepository.load(), readPending()) } catch { /* keep the first copy */ }
      }
      const pend = readPending()
      if (pend && pend.savedRev && pend.savedRev === db.savedRev) void localRepository.save(db)
    }
    // schema check: any collection that isn't the right shape falls back to fresh seed data (per collection), never a white screen
    try { const ref = freshSeed() as unknown as Record<string, unknown>, cur = db as unknown as Record<string, unknown>; const bad = Object.keys(ref).filter(k => Array.isArray(ref[k]) ? !Array.isArray(cur[k]) || (typeof (ref[k] as unknown[])[0] === 'object' && (cur[k] as unknown[]).some(x => !x || typeof x !== 'object')) : ref[k] && typeof ref[k] === 'object' ? !cur[k] || typeof cur[k] !== 'object' : false); if (bad.length) { bad.forEach(k => { cur[k] = ref[k] }); void localRepository.save(db); setTimeout(() => window.dispatchEvent(new CustomEvent('sc-data-reset', { detail: bad })), 1500) } } catch { /* keep what loaded */ }
    // flush a pending debounced save when the tab is hidden, reloaded or closed (no 350 ms window of lost edits)
    const flush = () => { if (guestTab() || (get().db as unknown as { __guest?: boolean })?.__guest) { clearTimeout(saveTimer); saveTimer = undefined; return } if (saveTimer !== undefined) { clearTimeout(saveTimer); saveTimer = undefined; const snap = get().db; remember(snap); void localRepository.save(snap).then(() => dropPendingIfCurrent(snap.savedRev)) } }
    window.addEventListener('pagehide', flush); window.addEventListener('beforeunload', flush); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
    const s = get().session
    const hp = pageFromHash()
    const page = s ? (hp && roleDef(s.role).pages.includes(hp) ? hp : roleDef(s.role).home) : 'command'
    const filter = s ? (loadFilter(s) ?? scopeFor(db, s.role, s.employeeId)) : get().ui.filter
    // dive3 F5: a separation dated in the future takes effect once its last day has passed
    for (const e of db.employees) if (e.term && e.status !== 'Inactive' && e.term.lastDay < today()) { e.status = 'Inactive'; e.supervisorId = undefined; stopPunch(db, e.id, 'Clock stopped at separation — payroll to review') }
    set({ db, ready: true, ui: { ...get().ui, page, filter, denied: s && hp && hp !== page ? hp : null } })
    if (EMBED_ROLE && !get().session) { get().signIn(EMBED_ROLE); if (hp && roleDef(EMBED_ROLE).pages.includes(hp)) get().go(hp) }
    if (live) live.onmessage = (ev: MessageEvent) => {
      const m = ev.data as { db: T.DB; baseRev?: number; action: string; entity: string; detail: string; actor: string; quiet?: boolean }
      if (!m?.db || get().session?.role === 'guest') return // a guest tab keeps its scrubbed copy
      let db = m.db
      const local = get().db
      if (local?.assignments && (m.baseRev ?? 0) < (local.savedRev ?? 0)) db = keepLocalAdds(local, db)
      set({ db })
      clearUndo()
      clearTimeout(saveTimer); saveTimer = undefined
      if (db.savedRev) remember(db)
      if (!m.quiet) window.dispatchEvent(new CustomEvent('southern-live', { detail: m }))
    }
    window.addEventListener('online', () => set({ ui: { ...get().ui, online: true } }))
    window.addEventListener('offline', () => set({ ui: { ...get().ui, online: false } }))
    window.addEventListener('hashchange', () => {
      const s2 = get().session
      const p = pageFromHash()
      // Field phone: Back must not surface the previous office URL (or an empty one) while the field app is still open.
      const fieldPhone = !!s2 && (s2.role === 'field' || (s2.role === 'guest' && (s2.view === 'field' || s2.view === 'supervisor')))
      if (fieldPhone && p !== 'field') { history.replaceState({ ...(history.state ?? {}), scDepth: 0, scField: 1 }, '', `${location.pathname}${location.search}#/field`); return }
      if (p && s2 && roleDef(s2.role).pages.includes(p) && p !== get().ui.page) { SCROLL[get().ui.page] = window.scrollY; set({ ui: { ...get().ui, page: p, denied: null, drawer: null, drawerStack: [] } }); restoreScroll(SCROLL[p] ?? 0) } else if (p && s2 && !roleDef(s2.role).pages.includes(p) && p !== roleDef(s2.role).home) set({ ui: { ...get().ui, denied: p } })
    })
  },
  signIn(role, method = 'Demo role', asEmployeeId?: string) {
    // A guest session exists only after a signed pass is verified. The role picker, a code, and a passkey cannot open the staff database as Guest.
    if (role === 'guest') {
      let pass = false
      try { pass = method === 'Guest pass' && !!sessionStorage.getItem('sc-guest') } catch { pass = false }
      if (!pass) return
    }
    clearUndo()
    if (role !== 'guest' && guestContext()) { console.warn('Staff sign-in is off on a guest-pass browser'); return }
    const rd = roleDef(role)
    const emp = asEmployeeId ? get().db.employees.find(e => e.id === asEmployeeId) : rd.empName ? get().db.employees.find(e => `${e.first} ${e.last}` === rd.empName) : undefined
    const session: Session = { role, name: asEmployeeId && emp ? `${emp.first} ${emp.last}` : rd.who, employeeId: emp?.id, mfa: method !== 'Demo role', signedInAt: new Date().toISOString(), method }
    clearKeep(); sessionStorage.removeItem('sc-gp-unlocked'); if (!EMBED_ROLE) sessionStorage.setItem('sc-session', JSON.stringify(session)) // PIN unlock never carries over to a new sign-in
    // company-wide roles open on All Company; everyone else on their home branch
    const scope = scopeFor(get().db, role, session.employeeId); saveFilter(session, scope)
    set({ session, ui: { ...get().ui, page: rd.home, drawer: null, drawerStack: [], filter: scope } }); window.scrollTo({ top: 0 }); requestAnimationFrame(() => window.scrollTo({ top: 0 }))
    if (role === 'guest') set({ db: scrubDb(get().db as unknown as Record<string, unknown>, currentGuestScope()) as unknown as T.DB })
    setHash(`/${rd.home}`)
    get().commit('Signed in', asEmployeeId && emp ? `${rd.label} · ${emp.craft}` : rd.label, `${session.name} · ${method}`, () => {}, { silent: true })
  },
  guestSwitch(view) {
    clearUndo()
    const s = get().session; if (s?.role !== 'guest') return
    const r = setGuestView(view)
    const emp = r.view === 'supervisor' ? get().db.employees.find(e => e.id === 'emp-2001') ?? get().db.employees.find(e => e.craft === 'Supervisor')
      : r.view === 'field' ? get().db.employees.find(e => `${e.first} ${e.last}` === roleDef('field').empName) : undefined
    const session: Session = { ...s, view: r.view ?? undefined, employeeId: emp?.id }
    clearKeep(); try { sessionStorage.setItem('sc-session', JSON.stringify(session)) } catch { /* */ }
    set({ session, ui: { ...get().ui, page: r.home, drawer: null, drawerStack: [], cmdOpen: false, denied: null } }); setHash(`/${r.home}`); window.scrollTo({ top: 0 })
  },
  signOut() { clearUndo(); sessionStorage.removeItem('sc-session'); sessionStorage.removeItem(FILTER_KEY); sessionStorage.removeItem('sc-gp-unlocked'); clearKeep(); set({ session: null, ui: { ...get().ui, drawer: null, cmdOpen: false } }); setHash('') },
  go(page) { const from = get().ui.page; if (from === page) { set({ ui: { ...get().ui, denied: null, drawer: null, drawerStack: [], windFarm: null, cmdOpen: false } }); window.scrollTo({ top: 0 }); return } SCROLL[from] = window.scrollY; freshPage(page); set({ ui: { ...get().ui, page, denied: null, drawer: null, drawerStack: [], windFarm: null, cmdOpen: false } }); const depth = Number(history.state?.scDepth ?? 0) + 1; if (FRAMED) memPages.push(from); afterBack(() => setHash(`/${page}`, { scDepth: depth })); window.scrollTo({ top: 0 }) },
  pageBack() {
    const home = roleDef(get().session?.role ?? 'owner').home
    if (!FRAMED) { if (Number(history.state?.scDepth ?? 0) > 0) history.back(); else get().go(home); return }
    const prev = memPages.pop() as PageKey | undefined; const s2 = get().session
    if (!prev || !s2 || !roleDef(s2.role).pages.includes(prev)) { memPages.length = 0; get().go(home); memPages.length = 0; return }
    SCROLL[get().ui.page] = window.scrollY; set({ ui: { ...get().ui, page: prev, drawer: null, drawerStack: [], windFarm: null, cmdOpen: false } })
    setHash(`/${prev}`, { scDepth: Math.max(0, Number(history.state?.scDepth ?? 1) - 1) }); restoreScroll(SCROLL[prev] ?? 0)
  },
  open(ref) { if (ref?.type === 'windfarm') { set({ ui: { ...get().ui, page: 'windfarms', windFarm: ref.id, drawer: null, drawerStack: [], cmdOpen: false } }); location.hash = '/windfarms'; return } const u = get().ui; const same = (a: T.EntityRef | null, b: T.EntityRef | null) => !!a && !!b && a.type === b.type && a.id === b.id
    if (!ref) { set({ ui: { ...u, drawer: null, drawerStack: [], cmdOpen: false } }); return }
    if (same(ref, u.drawer)) return
    const i = u.drawerStack.findIndex(x => same(x, ref))
    set({ ui: { ...u, drawer: ref, drawerStack: i >= 0 ? u.drawerStack.slice(0, i) : u.drawer ? [...u.drawerStack, u.drawer].slice(-12) : [], cmdOpen: false } }) },
  back() { const u = get().ui; const st = [...u.drawerStack]; const prev = st.pop() ?? null; set({ ui: { ...u, drawer: prev, drawerStack: st } }) },
  setUI(p) { if (p.filter) saveFilter(get().session, p.filter); set({ ui: { ...get().ui, ...p } }) },
  setPrefs(p) { const prefs = { ...get().prefs, ...p }; localStorage.setItem('sc-prefs', JSON.stringify(prefs)); set({ prefs }) },
  async resetDemo() { if (guestContext() || get().session?.role === 'guest') { console.warn('Reset demo is off for guests'); return } clearUndo(); clearTimeout(saveTimer); saveTimer = undefined; try { localStorage.removeItem(PENDING_KEY); localStorage.removeItem(REV_KEY) } catch { /* */ } const db = await localRepository.reset(); set({ db, ui: { ...get().ui, drawer: null } })
    // dive3 S12: side stores (drug tests, rigging, moves, bids, NCCCO, union, offline queue, drafts…) live under their own sc-* keys — clear them too; keep this browser's settings (branding, security, passkeys, prefs)
    const KEEP = ['sc-prefs', 'sc-branding-v1', 'sc-brand-presets-v1', 'sc-security', 'sc-passkeys', 'sc-gp-lock', 'sc-guest-passes', 'sc-backgrounds', 'sc-sched-colors-v1', 'sc-nav-v1', 'sc-fbdock-y', 'sc-data-reset', 'sc-guest', 'sc-guest-locked']
    try { for (const st of [localStorage, sessionStorage]) for (const k of Object.keys(st)) if (k.startsWith('sc-') && !KEEP.includes(k) && k !== 'sc-session' && !k.startsWith('sc-db')) st.removeItem(k) } catch { /* private mode */ }
  },
  commit(action, entity, detail, recipe, opts) {
    if (guestTab() && !GUEST_WRITE_OK.test(action)) return // view-only guest: no data change, whatever calls it
    const baseRev = get().db.savedRev ?? 0
    const db = structuredClone(get().db)
    recipe(db)
    const s = get().session
    const arrow = detail.match(/^(?:(.*?):\s*)?(.+?)\s*→\s*(.+)$/)
    const diff = opts?.diff ?? (arrow ? [{ field: arrow[1] || action.replace(/^(Updated|Changed|Moved) /, ''), from: arrow[2], to: arrow[3] }] : undefined)
    db.audit.unshift({ id: uid('au'), at: new Date().toISOString(), actor: s?.name ?? 'System', role: s?.role ?? 'owner', action, entity, detail, diff })
    if (db.audit.length > 600) db.audit.length = 600
    db.savedRev = Date.now()
    set({ db })
    if (guestTab()) return // guest copy is scrubbed + view-only: never broadcast or save it
    if (live && action !== 'Signed in' && action !== 'Read notification') { try { live.postMessage({ db, baseRev, action, entity, detail, actor: s?.name ?? 'System', quiet: !!opts?.silent && action !== 'Clocked out' }) } catch { /* ignore */ } }
    clearTimeout(saveTimer)
    if (guestTab() || (get().db as unknown as { __guest?: boolean }).__guest) return
    // Durable even if the tab is killed before the debounced IndexedDB write. pagehide also flushes.
    remember(db)
    const rev = db.savedRev
    saveTimer = window.setTimeout(() => { saveTimer = undefined; if (guestTab() || (get().db as unknown as { __guest?: boolean }).__guest) return; const snap = get().db; void localRepository.save(snap).then(() => dropPendingIfCurrent(snap.savedRev ?? rev)) }, 350)
  },
}))

// ---------------- domain actions (all go through commit → audit) ----------------
/** Crew notifications (in-app): the people dispatch adds, moves or removes hear about it on their phone. */
function crewNote(db: T.DB, empId: string, title: string, body: string, jobId?: string) {
  db.notices.unshift({ id: uid('nt'), at: new Date().toISOString(), severity: 'Upcoming', title, body, mandatory: false, roles: ['field'], empIds: [empId], read: false, ...(jobId ? { ref: { type: 'job', id: jobId } as T.EntityRef } : {}) })
  if (db.notices.length > 400) db.notices.length = 400
}
/** Tell everyone on a job's crew (today or later) about a schedule change. */
/** Req H: every change that moves money on a job lands on the office review list; signed / invoiced tickets are flagged. */
/** dive3 B3/M4: a hold or separation that lands mid-shift stops the clock at that moment, flagged for the supervisor/payroll. */
/** dive3 B4/M3: limits on a job's dates — shared by Reschedule (UI + store) and Job Builder. */
export function rescheduleError(j: { startDate: string; endDate: string }, start: string, end: string) {
  const now = today()
  if (!start || !end) return 'Pick both dates'
  if (end < start) return 'End is before start'
  if (diffDays(end, start) + 1 > 365) return 'A job can’t be longer than 365 days — check the dates'
  if (j.startDate < now && start !== j.startDate) return 'This job has started — only the end date can change (or end it and make a new job)'
  if (end < now) return 'The new end date is in the past'
  if (start < now && start !== j.startDate) return 'The new start date is in the past'
  return ''
}
/** dive3 S13: can this person be put on the board for that day? (Active and not past a scheduled last day) */
function schedulable(db: T.DB, empId: string, date: string) { const e = byId(db.employees, empId); return !!e && e.status !== 'Inactive' && !(e.term && date > e.term.lastDay) }
/** dive3 shop M7: a crane past its annual inspection is locked out of dispatch until certified. */
export const annualExpired = (u: T.Equipment) => u.category === 'Crane' && !!u.annualInspection && u.annualInspection < today()
/** dive3 shop M9: one quantity rule for every inventory action — positive, finite, whole numbers unless the unit is measured. */
export const measuredUnit = (unit?: string) => /^(ft|in|m|gal|qt|pt|l|lb|lbs|oz|hr|hrs|yd|roll)$/i.test(unit ?? '')
export function qtyProblem(it: { unit?: string; onHand: number }, n: number, max?: number): string | null {
  if (!Number.isFinite(n) || n <= 0) return 'Enter a quantity above 0'
  if (!measuredUnit(it.unit) && !Number.isInteger(n)) return `Whole numbers only for "${it.unit ?? 'ea'}"`
  if (max != null && n > max) return `Only ${max} ${it.unit ?? ''} available`.trim()
  return null
}
function stopPunch(db: T.DB, empId: string, why: string) {
  const c = db.clocks.find(x => x.employeeId === empId); if (!c) return false
  const d = new Date(c.inAt), now = new Date(), br = c.breakMin + (c.breakStart ? Math.round((now.getTime() - new Date(c.breakStart).getTime()) / 60000) : 0)
  db.time.push({ id: uid('te'), employeeId: empId, jobId: c.jobId, date: localDate(d), activity: c.jobId ? 'Lifting & Hoisting' : 'Yard / Shop', start: hhmmOf(d), end: hhmmOf(now), mealMin: br, hours: Math.max(0, Math.round(elapsedHours(d, now, br) * 100) / 100), perDiems: [], status: 'Flagged', note: why, inAt: isoOffset(d), tz: deviceTz(), submittedAt: now.toISOString() } as T.TimeEntry)
  db.clocks = db.clocks.filter(x => x.employeeId !== empId); return true
}
function billingReviewAdd(db: T.DB, j: T.Job, what: string, reason: string | undefined, from: string, to: string, flagChange = false) {
  const flags: ('signed' | 'invoiced')[] = []
  if (isOnTicketDates(db, j.id, from, to)) flags.push('signed')
  if (j.invoiceNo || db.invoices.some(i => i.jobId === j.id)) flags.push('invoiced')
  db.billingReview = [{ id: uid('br'), jobId: j.id, at: new Date().toISOString(), by: useStore.getState().session?.name ?? 'System', what: flagChange && flags.length ? `${what} (after ${flags.join(' & ')})` : what, reason, flags, status: 'Open' }, ...(db.billingReview ?? [])]
}
const jobCranesOf = (j: T.Job) => [...new Set([j.craneId, ...(j.craneIds ?? [])].filter(Boolean) as string[])]
function notifyJobCrew(db: T.DB, jobId: string, title: string, body: string) {
  const now = today() // dive3 M13: Chicago date, not the device's
  ;[...new Set(db.assignments.filter(a => a.jobId === jobId && a.date >= now).map(a => a.employeeId))].forEach(e => crewNote(db, e, title, body, jobId))
}
const jobLine = (db: T.DB, j: T.Job) => { const s = byId(db.sites, j.siteId); const c = byId(db.customers, j.customerId); return `${c?.name ?? 'Customer'} · ${s ? `${s.city}, ${s.state}` : ''}` }
const addDaysIso = (d: string, n: number) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const dayLabel = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const S = () => useStore.getState()
/** Office fixes: sanity cap on a single vendor bill (typos like $999,999,999,999). */
export const BILL_MAX = 2_000_000
/** dive3 M10: bills above this need a second person — whoever entered it can't approve it. */
export const SELF_APPROVE_MAX = 5_000
// every CSV export is written to the audit log
csvHooks.onExport = (name, rows) => { if (S().session) S().commit('Exported CSV', name, `${rows} row${rows === 1 ? '' : 's'}`, () => {}, { silent: true }) }
setBrandingAudit((a, e, d) => S().commit(a, e, d, () => {}))
const emp = (db: T.DB, id: string) => fullName(byId(db.employees, id))
const jobNo = (db: T.DB, id: string) => byId(db.jobs, id)?.jobNo

export const actions = {
  updateCompany(patch: Partial<T.CompanyProfile>) {
    // name / short name / logo are branding — keep the browser-stored branding in sync so they survive the daily demo reseed
    const bp: Record<string, unknown> = {}; if (patch.name) bp.name = patch.name; if (patch.shortName) bp.shortName = patch.shortName; if ('logo' in patch) bp.logo = patch.logo
    if (Object.keys(bp).length) useBranding.setState(st => ({ b: { ...st.b, ...bp } }))
    const cur = S().db.company
    S().commit('Updated company profile', 'Company', Object.keys(patch).filter(k => k !== 'logo').join(', ') || 'logo', db => { db.company = { ...(db.company ?? cur!), ...patch, modules: { ...(db.company?.modules ?? { craneRigging: true }), ...(patch.modules ?? {}) } } as T.CompanyProfile })
  },
  assign(jobId: string, date: string, empId: string, position: T.CrewPosition, opts: { restOfJob?: boolean; fromJobId?: string; source?: T.Assignment['source'] } = {}) {
    const db0 = S().db
    const j = byId(db0.jobs, jobId)!
    // anyone held after a post-accident / reasonable-suspicion test can't be scheduled until cleared (any employee, not only CDL)
    if (byId(db0.employees, empId)?.ssHold) { window.dispatchEvent(new CustomEvent('sc-held', { detail: emp(db0, empId) })); return }
    if (!schedulable(db0, empId, date)) return // dive3 S13: the store refuses Inactive / past-last-day too, not only the UI
    const before = db0.assignments.map(a => ({ ...a }))
    const label = `${opts.fromJobId ? 'Move' : 'Assign'} ${emp(db0, empId)} · ${position} · ${date}`
    S().commit(opts.fromJobId ? 'Moved employee (Dispatch confirmed)' : 'Assigned employee', `Job #${j.jobNo}`, `${emp(db0, empId)} → ${position}${opts.fromJobId ? ` (from Job #${jobNo(db0, opts.fromJobId)})` : ''}${opts.restOfJob ? ' · rest of job' : ` · ${date}`}`, db => {
      const dates = (opts.restOfJob ? range(date, j.endDate) : [date]).filter(d => schedulable(db, empId, d))
      dates.forEach(d => {
        if (opts.fromJobId) db.assignments = db.assignments.filter(a => !(a.employeeId === empId && a.date === d && a.jobId === opts.fromJobId))
        // a later day already on another job stays there — rest-of-job must not double-book
        if (db.assignments.some(a => a.employeeId === empId && a.date === d && a.jobId !== jobId)) return
        if (!db.assignments.some(a => a.employeeId === empId && a.date === d && a.jobId === jobId))
          db.assignments.push({ id: uid('asg'), jobId, date: d, employeeId: empId, position, source: opts.source ?? 'Dispatch' })
      })
      db.travel = db.travel.filter(t => !(t.employeeId === empId && dates.includes(t.date) && t.direction !== 'To Site'))
      crewNote(db, empId, `You’re on Job #${j.jobNo} — ${position}`, `${jobLine(db, j)} · ${opts.restOfJob ? `from ${dayLabel(date)} to the end of the job` : dayLabel(date)}${j.startTime ? ` · start ${j.startTime}` : ''}${opts.fromJobId ? ` · moved from Job #${jobNo(db, opts.fromJobId)}` : ''}`, j.id)
    })
    noteRosterChange(label, before)
  },
  replaceCrew(jobId: string, fromEmp: string, toEmp: string, position: T.CrewPosition, dates: string[]) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!
    if (byId(db0.employees, toEmp)?.ssHold || dates.some(d => !schedulable(db0, toEmp, d))) return // dive3 S13
    const before = db0.assignments.map(a => ({ ...a }))
    S().commit('Replaced crew member (Dispatch confirmed)', `Job #${j.jobNo}`, `${emp(db0, fromEmp)} → ${emp(db0, toEmp)} · ${position} · ${dates.length} day${dates.length > 1 ? 's' : ''}`, db => {
      db.assignments = db.assignments.filter(a => !(a.jobId === jobId && a.employeeId === fromEmp && dates.includes(a.date)))
      dates.forEach(d => { if (!db.assignments.some(a => a.employeeId === toEmp && a.date === d && a.jobId === jobId)) db.assignments.push({ id: uid('asg'), jobId, date: d, employeeId: toEmp, position, source: 'Dispatch' }) })
      crewNote(db, toEmp, `You’re on Job #${j.jobNo} — ${position}`, `${jobLine(db, j)} · ${dates.length > 1 ? `${dates.length} days from ${dayLabel(dates[0])}` : dayLabel(dates[0])}`, j.id)
      crewNote(db, fromEmp, `Change: you’re off Job #${j.jobNo}`, `${dates.length > 1 ? `${dates.length} days from ${dayLabel(dates[0])}` : dayLabel(dates[0])} · dispatch will call with your next job`, j.id)
    })
    noteRosterChange(`Replace ${emp(db0, fromEmp)} with ${emp(db0, toEmp)}`, before)
  },
  unassign(jobId: string, date: string, empId: string, restOfJob = false) {
    const db0 = S().db
    const j = byId(db0.jobs, jobId)!
    const before = db0.assignments.map(a => ({ ...a }))
    S().commit('Removed employee (Dispatch confirmed)', `Job #${j.jobNo}`, `${emp(db0, empId)} removed${restOfJob ? ' for rest of job' : ` on ${date}`} — returned to available pool`, db => {
      db.assignments = db.assignments.filter(a => !(a.jobId === jobId && a.employeeId === empId && (restOfJob ? a.date >= date : a.date === date)))
      crewNote(db, empId, `Change: you’re off Job #${j.jobNo}`, `${restOfJob ? `from ${dayLabel(date)} on` : dayLabel(date)} · dispatch will call with your next job`, j.id)
    })
    noteRosterChange(`Remove ${emp(db0, empId)} · ${date}`, before)
  },
  setCrane(jobId: string, craneId: string, crewDecisions: { empId: string; position: T.CrewPosition; decision: 'move' | 'keep' }[], date: string) {
    const db0 = S().db
    const j = byId(db0.jobs, jobId)!
    const c = byId(db0.equipment, craneId)!
    if (annualExpired(c)) return { skipped: [] as string[], blocked: `${c.unit} annual inspection expired — certify it first` } // dive3 shop M7: past its annual = locked out of dispatch until certified
    const oldId = j.craneId, oldCfg = db0.configs.find(x => x.id === j.configId), cfg = db0.configs.find(x => x.craneId === craneId)
    // dive3 B3: keep the units dispatch added by hand; only swap the config trailers, and skip any that are busy on another job
    const handUnits = j.trailerIds.filter(t => !(oldCfg?.trailerIds ?? []).includes(t))
    const busyT = (t: string) => db0.jobs.some(o => o.id !== jobId && isLive(o) && o.trailerIds.includes(t) && o.startDate <= j.endDate && date <= o.endDate)
    const cfgT = (cfg?.trailerIds ?? []).filter(t => !handUnits.includes(t)), addT = cfgT.filter(t => !busyT(t)), skipT = cfgT.filter(busyT)
    const trailers = [...handUnits, ...addT]
    const unitName = (id: string) => byId(db0.equipment, id)?.unit ?? id
    const moved = crewDecisions.filter(d => d.decision === 'move' && !byId(db0.employees, d.empId)?.ssHold)
    S().commit('Swapped crane', `Job #${j.jobNo}`, `Crane ${byId(db0.equipment, oldId)?.unit ?? '—'} → ${c.unit} · ${moved.length} crew moved with crane (confirmed individually) · units: ${trailers.map(unitName).join(', ') || 'none'}${skipT.length ? ` · not added (busy): ${skipT.map(unitName).join(', ')}` : ''}`, db => {
      const job = byId(db.jobs, jobId)!
      job.craneId = craneId
      job.configId = cfg?.id; job.trailerIds = trailers
      // the old crane's rig plan and hours move to the new crane (otherwise the old crane stays booked)
      if (oldId) {
        if (job.rig?.some(p => p.craneId === oldId) && !job.rig.some(p => p.craneId === craneId)) job.rig = job.rig.map(p => p.craneId === oldId ? { ...p, craneId } : p)
        if (job.craneHours?.[oldId]) { const h = job.craneHours[oldId]; const { [oldId]: _drop, ...rest } = job.craneHours; void _drop; job.craneHours = { ...rest, [craneId]: h } }
        if (job.craneIds?.includes(craneId)) job.craneIds = job.craneIds.filter(x => x !== craneId)
      }
      const days = range(date, job.endDate)
      moved.forEach(d => {
        if (byId(db.employees, d.empId)?.ssHold) return
        days.forEach(dd => {
          // only the board day was confirmed — on later days, don't pull someone off another job
          const other = db.assignments.find(a => a.employeeId === d.empId && a.date === dd && a.jobId !== jobId)
          if (other && dd !== date) return
          db.assignments = db.assignments.filter(a => !(a.employeeId === d.empId && a.date === dd))
          // the old crane's permanent crew in the same seat step aside (no two operators on one crane)
          db.assignments = db.assignments.filter(a => !(a.jobId === jobId && a.date === dd && a.position === d.position && a.employeeId !== d.empId && oldId && byId(db.employees, a.employeeId)?.homeCraneId === oldId))
          db.assignments.push({ id: uid('asg'), jobId, date: dd, employeeId: d.empId, position: d.position, source: 'Crane crew' })
        })
        crewNote(db, d.empId, `You’re on Job #${j.jobNo} with crane ${c.unit}`, `${jobLine(db, job)} · from ${dayLabel(date)}`, jobId)
      })
      if (oldId) db.employees.filter(e => e.homeCraneId === oldId && db0.assignments.some(a => a.jobId === jobId && a.employeeId === e.id && a.date >= date) && !db.assignments.some(a => a.jobId === jobId && a.employeeId === e.id && a.date >= date)).forEach(e => crewNote(db, e.id, `Change: you’re off Job #${j.jobNo}`, `Crane ${c.unit} replaced ${byId(db.equipment, oldId)?.unit ?? ''} with its own crew · dispatch will call`, jobId))
      notifyJobCrew(db, jobId, `Job #${j.jobNo}: crane is now ${c.unit}`, `${byId(db.equipment, oldId)?.unit ?? '—'} → ${c.unit} from ${dayLabel(date)}`)
    })
    clearUndo() // crane, trailers, and crew moved together — a roster redo must not put the old seat back on top
    return { skipped: skipT.map(unitName) }
  },
  setJobStatus(jobId: string, status: T.JobStatus) {
    const j = byId(S().db.jobs, jobId)!
    S().commit('Updated job status', `Job #${j.jobNo}`, `${j.status} → ${status}`, db => { const x = byId(db.jobs, jobId)!; x.status = status; if (status === 'Complete' && x.stage === 'In Progress') x.stage = 'Complete' })
    if (status === 'Complete') { const n = S().db.checkouts.filter(c => c.jobId === jobId && isOpen(c)).length; if (n) window.dispatchEvent(new CustomEvent('inv-leftovers', { detail: { jobId, n } })) }
  },
  setStage(jobId: string, stage: T.JobStage) {
    const j = byId(S().db.jobs, jobId)!
    S().commit('Moved job in pipeline', `Job #${j.jobNo}`, `${j.stage} → ${stage}`, db => { byId(db.jobs, jobId)!.stage = stage })
  },
  addCompanyDoc(d: NonNullable<T.DB['companyDocs']>[number]) { S().commit('Uploaded company document', d.name, d.kind, db => { db.companyDocs = [d, ...(db.companyDocs ?? [])] }) },
  updateJob(jobId: string, patch: Partial<T.Job>, what = 'Edited job') {
    const j = byId(S().db.jobs, jobId)!
    const show = (v: unknown) => v == null ? '—' : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : Object.entries(v as Record<string, unknown>).filter(([, x]) => typeof x !== 'object').map(([k, x]) => `${k} ${x}`).join(' · ').slice(0, 80)) : String(v)
    const diff = Object.keys(patch).map(k => ({ field: k, from: show((j as unknown as Record<string, unknown>)[k]), to: show((patch as Record<string, unknown>)[k]) })).filter(d => d.from !== d.to)
    S().commit(what, `Job #${j.jobNo}`, Object.keys(patch).join(', '), db => { Object.assign(byId(db.jobs, jobId)!, patch) }, { diff })
  },
  createJob(job: T.Job, crew: { empId: string; position: T.CrewPosition }[]) {
    if (S().db.jobs.some(j => j.id === job.id || j.jobNo === job.jobNo)) return // dive3 B2: a repeated submit never makes a second job
    crew = crew.filter(c => !byId(S().db.employees, c.empId)?.ssHold && schedulable(S().db, c.empId, job.startDate)) // dive3 S13
    // dive3 dispatch m6: a double-booked crane (main or "+ Also") is written into the audit line
    const clashes = jobCranes(job).map(cid => { const x = firstClash(S().db, job, cid, job.startDate, job.endDate); return x ? `crane ${byId(S().db.equipment, cid)?.unit ?? cid} double-booked with #${x.job.jobNo} on ${x.d} (${x.why})` : '' }).filter(Boolean)
    S().commit('Created job', `Job #${job.jobNo}`, `${job.name} · ${crew.length} crew auto-assigned${clashes.length ? ` · ⚠ ${clashes.join('; ')}` : ''}`, db => {
      db.jobs.push(job)
      if (job.stage === 'Scheduled' || job.stage === 'In Progress')
        range(job.startDate, job.endDate).forEach(d => {
          const need = requiredPositions(job, d)
          crew.filter(c => need.includes(c.position)).forEach(c => { if (!db.assignments.some(a => a.employeeId === c.empId && a.date === d)) db.assignments.push({ id: uid('asg'), jobId: job.id, date: d, employeeId: c.empId, position: c.position, source: byId(db.employees, c.empId)?.homeCraneId === job.craneId ? 'Crane crew' : 'Dispatch' }) })
        })
      // dive2 M8: crew booked through Job Builder hear about it
      if (job.stage === 'Scheduled' || job.stage === 'In Progress') [...new Set(crew.map(c => c.empId))].forEach(e => { const c = crew.find(x => x.empId === e)!; crewNote(db, e, `You’re on Job #${job.jobNo} — ${c.position}`, `${jobLine(db, job)} · ${dayLabel(job.startDate)} → ${dayLabel(job.endDate)} · start ${job.startTime}`, job.id) })
    })
  },
  /** dive3 B2: delete a quote / job made by mistake (duplicate, test). Only while nothing real hangs off it — field tickets,
   *  time, invoices or costs mean it has history: mark it lost / complete instead. Returns a snapshot for Undo. */
  canDeleteJob(jobId: string): { ok: true } | { ok: false; reason: string } {
    const db = S().db, j = byId(db.jobs, jobId); if (!j) return { ok: false, reason: 'Job not found' }
    const role = S().session?.role; if (!['owner', 'ops', 'sales', 'dispatch', 'branch'].includes(role ?? '')) return { ok: false, reason: 'Your role can’t delete jobs' }
    if (db.invoices.some(i => i.jobId === jobId)) return { ok: false, reason: `Job #${j.jobNo} has an invoice — void the invoice first` }
    if (db.tickets.some(t => t.jobId === jobId)) return { ok: false, reason: `Job #${j.jobNo} has field tickets — mark it complete or lost instead` }
    if (db.time.some(t => t.jobId === jobId)) return { ok: false, reason: `Job #${j.jobNo} has time on it — mark it complete or lost instead` }
    if (db.costs.some(c => c.jobId === jobId) || db.bills.some(b => b.lines.some(l => l.jobId === jobId))) return { ok: false, reason: `Job #${j.jobNo} has costs posted — mark it complete or lost instead` }
    return { ok: true }
  },
  deleteJob(jobId: string, reason: string) {
    const ok = actions.canDeleteJob(jobId); if (!ok.ok) return ok
    const db0 = S().db, j = byId(db0.jobs, jobId)!; const snap = { job: structuredClone(j), asg: db0.assignments.filter(a => a.jobId === jobId).map(a => structuredClone(a)) }
    const label = j.stage === 'Quote' || j.stage === 'Awarded' ? `Quote Q-${j.jobNo}` : `Job #${j.jobNo}`
    S().commit(j.stage === 'Quote' ? 'Deleted quote' : 'Deleted job', label, `${j.name} · ${reason}`, db => { db.jobs = db.jobs.filter(x => x.id !== jobId); db.assignments = db.assignments.filter(a => a.jobId !== jobId) })
    if (S().ui.drawer?.type === 'job' && S().ui.drawer?.id === jobId) S().setUI({ drawer: null, drawerStack: [] })
    return { ok: true as const, snap, label }
  },
  restoreJob(snap: { job: T.Job; asg: T.Assignment[] }) {
    if (S().db.jobs.some(j => j.id === snap.job.id)) return
    S().commit('Restored job', `Job #${snap.job.jobNo}`, 'Undo delete', db => { db.jobs.push(snap.job); db.assignments.push(...snap.asg.filter(a => !db.assignments.some(b => b.employeeId === a.employeeId && b.date === a.date))) })
  },
  /** Reschedule a job (customer moved it): new start/end/start time, optionally shift rig plans per crane and the crew days.
   *  Notifies crew, dispatch, ops/PM and safety in-app; the customer note is only a draft in the UI (never sent). */
  // ----- Req H: extra / removed people & support equipment, billable vs non-billable, billing review, field call-off -----
  addExtra(jobId: string, x: { kind: T.ExtraKind; role: string; qty: number; action?: 'add' | 'remove'; from?: string; fromTime?: string; to?: string; reason?: string; billable?: boolean; again?: boolean }): { ok: true; id: string } | { ok: false; reason: string; dupe?: true } {
    if (!EXTRA_EDITORS.includes(S().session?.role as T.RoleKey)) return { ok: false as const, reason: 'Only dispatch, ops, branch managers or the owner can change crew/equipment on a job' } // dive3 m16
    const db0 = S().db, j = byId(db0.jobs, jobId); if (!j) return { ok: false as const, reason: 'No job' }
    const qty = Math.round(Number(x.qty)); if (!(qty >= 1 && qty <= 99)) return { ok: false as const, reason: 'Quantity 1–99' }
    // dive3 m11: a forgotten extra on a finished job defaults to its last day (edit the dates after); dates stay inside the job
    const t0 = today(), from = x.from || (t0 < j.startDate ? j.startDate : t0 > j.endDate ? j.endDate : t0); if (from > j.endDate) return { ok: false as const, reason: 'Start is after the job ends' }
    if (from < j.startDate) return { ok: false as const, reason: `Start is before the job starts (${j.startDate})` }
    if (x.to && x.to > j.endDate) return { ok: false as const, reason: `End is after the job ends (${j.endDate})` }
    if (x.to && x.to < from) return { ok: false as const, reason: 'End is before start' }
    // dive3 M5: a second tap on the same role within 3 s asks first; remove only what's on the job
    const act = x.action ?? 'add'
    if (!x.again && (j.extras ?? []).some(e => e.role === x.role && e.kind === x.kind && (e.action ?? 'add') === act && Date.now() - new Date(e.at).getTime() < 3000)) return { ok: false as const, reason: `${act === 'remove' ? 'Removed' : 'Added'} a ${x.role} a moment ago`, dupe: true as const }
    if (act === 'remove') {
      const on = (j.extras ?? []).filter(e => e.role === x.role && e.kind === x.kind && e.from <= from && extraEnd(j, e) >= from).reduce((s, e) => s + ((e.action ?? 'add') === 'remove' ? -e.qty : e.qty), 0)
        + (x.kind === 'person' ? db0.assignments.filter(a => a.jobId === jobId && a.date === from && a.position === x.role).length : 0)
      if (on < qty) return { ok: false as const, reason: on > 0 ? `Only ${on} ${x.role} on this job that day` : `No ${x.role} on this job to remove` }
    }
    const r = rateFor(x.kind, x.role), ses = S().session
    const e: T.JobExtra = { id: uid('jx'), kind: x.kind, role: x.role, qty, action: x.action ?? 'add', from, fromTime: x.fromTime || undefined, to: x.to || undefined, reason: x.reason?.trim() || undefined, billable: x.billable ?? true, rate: r.rate, cost: r.cost, at: new Date().toISOString(), by: ses?.name ?? 'System' }
    const what = `${extraLabel(e)} from ${from}${e.fromTime ? ` ${e.fromTime}` : ''}${e.to ? ` to ${e.to}` : ''} · ${e.billable ? 'billable' : 'non-billable (absorbed)'}`
    const beforeCrew = e.action === 'remove' && e.kind === 'person' ? db0.assignments.map(a => ({ ...a })) : undefined
    S().commit(e.action === 'remove' ? 'Removed from job' : 'Added to job', `Job #${j.jobNo}`, `${what}${e.reason ? ` · ${e.reason}` : ''}`, db => {
      const jj = byId(db.jobs, jobId)!; jj.extras = [...(jj.extras ?? []), e]
      if (e.action === 'remove' && e.kind === 'person') {
        const end = extraEnd(jj, e)
        for (const d of range(from, end)) {
          const hits = db.assignments.filter(a => a.jobId === jobId && a.date === d && a.position === e.role).slice(0, e.qty)
          if (!hits.length) continue
          const ids = new Set(hits.map(a => a.id))
          db.assignments = db.assignments.filter(a => !ids.has(a.id))
        }
      }
      billingReviewAdd(db, jj, what, e.reason, from, extraEnd(jj, e))
      db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Info', title: `Job #${j.jobNo}: ${extraLabel(e)}`, body: `${what}. Tickets ${e.billable ? (e.action === 'remove' ? 'credit' : 'charge') + ' the customer' : 'unchanged — absorbed cost'}.`, mandatory: false, roles: ['dispatch', 'ops', 'accounting', 'branch'], ref: { type: 'job', id: jobId }, read: false })
    })
    if (beforeCrew) noteRosterChange(`Remove ${e.role}`, beforeCrew)
    return { ok: true as const, id: e.id }
  },
  updateExtra(jobId: string, id: string, patch: Partial<Pick<T.JobExtra, 'qty' | 'from' | 'fromTime' | 'to' | 'reason' | 'billable'>>) {
    if (!EXTRA_EDITORS.includes(S().session?.role as T.RoleKey)) return false // dive3 m16
    const j = byId(S().db.jobs, jobId); const x0 = j?.extras?.find(x => x.id === id); if (!j || !x0) return false
    if ((patch.from && (patch.from < j.startDate || patch.from > j.endDate)) || (patch.to && (patch.to > j.endDate || patch.to < (patch.from ?? x0.from)))) return false // dive3 m11: stay inside the job
    const parts = Object.entries(patch).filter(([k, v]) => (x0 as unknown as Record<string, unknown>)[k] !== v).map(([k, v]) => k === 'billable' ? `${x0.billable ? 'billable' : 'non-billable'} → ${v ? 'billable' : 'non-billable'}` : `${k} ${(x0 as unknown as Record<string, unknown>)[k] ?? '—'} → ${v ?? '—'}`)
    if (!parts.length) return true
    S().commit('Changed job extra', `Job #${j.jobNo}`, `${extraLabel(x0)} · ${parts.join(' · ')}`, db => {
      const jj = byId(db.jobs, jobId)!; const x = jj.extras!.find(y => y.id === id)!; Object.assign(x, patch)
      billingReviewAdd(db, jj, `${extraLabel(x)} · ${parts.join(' · ')}`, patch.reason ?? x.reason, x.from, extraEnd(jj, x), 'billable' in patch)
    })
    return true
  },
  removeExtra(jobId: string, id: string) {
    if (!EXTRA_EDITORS.includes(S().session?.role as T.RoleKey)) return // dive3 m16
    const j = byId(S().db.jobs, jobId); const x0 = j?.extras?.find(x => x.id === id); if (!j || !x0) return
    S().commit('Undid job extra', `Job #${j.jobNo}`, extraLabel(x0), db => { const jj = byId(db.jobs, jobId)!; jj.extras = (jj.extras ?? []).filter(x => x.id !== id); billingReviewAdd(db, jj, `Undid ${extraLabel(x0)}`, undefined, x0.from, extraEnd(jj, x0)) })
  },
  /** Field call-off of support equipment (admin setting, default OFF): Requested → Acknowledged → Pickup scheduled → Picked up. Off the ticket only once Picked up. */
  calloff(jobId: string, id: string, status: T.CalloffStatus) {
    const db0 = S().db, j = byId(db0.jobs, jobId); const x0 = j?.extras?.find(x => x.id === id); if (!j || !x0 || x0.kind !== 'equipment' || x0.action !== 'add') return { ok: false as const, reason: 'Not support equipment' }
    const role = S().session?.role
    if (status === 'Requested' && role === 'field' && !db0.company?.modules.fieldCalloff) return { ok: false as const, reason: 'Field call-off is turned off in Settings' }
    if (status !== 'Requested' && !EXTRA_EDITORS.includes(role as T.RoleKey)) return { ok: false as const, reason: 'Only dispatch / ops can move a call-off along' }
    const order: T.CalloffStatus[] = ['Requested', 'Acknowledged', 'Pickup scheduled', 'Picked up']
    const cur = x0.calloff ? order.indexOf(x0.calloff.status) : -1; if (order.indexOf(status) !== cur + 1) return { ok: false as const, reason: `Next step is ${order[cur + 1] ?? 'none'}` }
    const by = S().session?.name ?? 'System', at = new Date().toISOString()
    S().commit(`Call-off ${status.toLowerCase()}`, `Job #${j.jobNo}`, `${x0.role} ×${x0.qty}`, db => {
      const jj = byId(db.jobs, jobId)!; const x = jj.extras!.find(y => y.id === id)!
      x.calloff = { status, at, by, history: [...(x.calloff?.history ?? []), { status, at, by }] }
      if (status === 'Requested') db.notices.unshift({ id: uid('n'), at, severity: 'Action Required', title: `Call-off: ${x.role} on Job #${j.jobNo}`, body: `${by} asked to release ${x.qty} × ${x.role}. It stays on the ticket until it is picked up.`, mandatory: false, roles: ['dispatch', 'ops', 'branch'], ref: { type: 'job', id: jobId }, read: false })
      if (status === 'Picked up') billingReviewAdd(db, jj, `${x.qty} × ${x.role} picked up — off the ticket from ${dateOf(at)}`, 'Field call-off', dateOf(at), jj.endDate)
    })
    return { ok: true as const }
  },
  reviewBilling(id: string) { const r = S().db.billingReview?.find(x => x.id === id); if (!r) return; S().commit('Reviewed billing change', `Job #${byId(S().db.jobs, r.jobId)?.jobNo}`, r.what, db => { const x = db.billingReview!.find(y => y.id === id)!; x.status = 'Reviewed'; x.reviewedBy = S().session?.name }) },
  rescheduleJob(jobId: string, r: { start: string; end: string; time?: string; shiftRig?: string[]; shiftCrew?: boolean; shiftUnits?: boolean; reason?: string }) {
    const db0 = S().db; const j = byId(db0.jobs, jobId); if (!j || !r.start || !r.end || r.end < r.start) return false
    if (rescheduleError(j, r.start, r.end)) return false // dive3 B4/M3
    const delta = diffDays(r.start, j.startDate)
    const parts = [`${j.startDate} → ${r.start}`, `end ${j.endDate} → ${r.end}`, r.time && r.time !== j.startTime ? `start ${j.startTime} → ${r.time}` : '', r.shiftRig?.length ? `rig plans shifted ${delta >= 0 ? '+' : ''}${delta} d (${r.shiftRig.length} crane${r.shiftRig.length > 1 ? 's' : ''})` : '', r.shiftCrew ? 'crew days shifted' : '', r.reason ? `reason: ${r.reason}` : ''].filter(Boolean)
    S().commit('Rescheduled job', `Job #${j.jobNo}`, parts.join(' · '), db => {
      const jj = byId(db.jobs, jobId)!
      jj.startDate = r.start; jj.endDate = r.end; if (r.time) jj.startTime = r.time
      if (delta && r.shiftRig?.length) {
        jj.rig = (jj.rig ?? []).map(p => !r.shiftRig!.includes(p.craneId) ? p : { ...p, hookReady: addDaysIso(p.hookReady, delta), downStart: addDaysIso(p.downStart, delta), plannedMoveIn: p.plannedMoveIn ? addDaysIso(p.plannedMoveIn, delta) : p.plannedMoveIn, upDates: p.upDates?.map(d => addDaysIso(d, delta)) })
      }
      // dive3 B2: hired outside cranes and truck/trailer days move with the job (their own checkbox, on by default) — with or without a rig plan
      if (delta && r.shiftUnits !== false) {
        jj.outside = (jj.outside ?? []).map(o => ({ ...o, from: addDaysIso(o.from, delta), to: addDaysIso(o.to, delta) }))
        if (jj.unitDays) jj.unitDays = Object.fromEntries(Object.entries(jj.unitDays).map(([k, v]) => [k, { from: addDaysIso(v.from, delta), to: addDaysIso(v.to, delta) }]))
      }
      const now = today()
      if (r.shiftCrew && delta) db.assignments = db.assignments.map(a => {
        if (a.jobId !== jobId || a.date < now) return a
        const nd = addDaysIso(a.date, delta)
        const clash = db.assignments.some(x => x.id !== a.id && x.employeeId === a.employeeId && x.date === nd && x.jobId !== jobId)
        return clash ? a : { ...a, date: nd }
      })
      // dive3 M2: anyone dropped because their days fall outside the new dates hears about it
      const dropped = db.assignments.filter(a => a.jobId === jobId && a.date >= now && (a.date < r.start || a.date > r.end))
      db.assignments = db.assignments.filter(a => a.jobId !== jobId || a.date < now || (a.date >= r.start && a.date <= r.end))
      ;[...new Set(dropped.map(a => a.employeeId))].forEach(id => { const ds = dropped.filter(a => a.employeeId === id).map(a => a.date).sort(); crewNote(db, id, `Change: you’re off Job #${j.jobNo}`, `${ds.length} day${ds.length > 1 ? 's' : ''} from ${dayLabel(ds[0])} — the job moved to ${dayLabel(r.start)} → ${dayLabel(r.end)}. Dispatch will call.`, jobId) })
      const body = `${dayLabel(r.start)} → ${dayLabel(r.end)}${r.time ? ` · start ${r.time}` : ''}${r.reason ? ` · ${r.reason}` : ''}`
      if (delta && (r.shiftCrew || r.shiftUnits !== false) && jj.extras?.length) jj.extras = jj.extras.map(x => ({ ...x, from: addDaysIso(x.from, delta), to: x.to ? addDaysIso(x.to, delta) : x.to }))
      notifyJobCrew(db, jobId, `Job #${j.jobNo} rescheduled`, body)
      // Req H: supervisor and PM always hear about it, even if not on the crew list yet
      const told = new Set(db.assignments.filter(a => a.jobId === jobId && a.date >= now).map(a => a.employeeId))
      ;[jj.supervisorId, jj.pmId].forEach(id => { if (id && !told.has(id) && byId(db.employees, id)) crewNote(db, id, `Job #${j.jobNo} rescheduled`, body, jobId) })
      const hasEquip = !!(jobCranesOf(jj).length || jj.trailerIds.length || jj.extras?.some(x => x.kind === 'equipment'))
      const billing = !!(jj.extras?.length || jj.invoiceNo || db.tickets.some(t => t.jobId === jobId && (t.signedAt || t.signerName)))
      db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Info', title: `Job #${j.jobNo} rescheduled`, body: `${jobLine(db, jj)} · ${body}`, mandatory: false, roles: ['dispatch', 'ops', 'safety', 'branch', ...(hasEquip ? ['shop' as const] : []), ...(billing ? ['accounting' as const] : [])], ref: { type: 'job', id: jobId }, read: false } as T.Notice)
      if (billing) billingReviewAdd(db, jj, `Dates ${j.startDate}–${j.endDate} → ${r.start}–${r.end}`, r.reason, r.start < j.startDate ? r.start : j.startDate, r.end > j.endDate ? r.end : j.endDate)
    })
    return true
  },
  nextJobNo() { return String(Math.max(...S().db.jobs.map(j => Number(j.jobNo))) + 1) },
  addAbsence(empId: string, from: string, to: string, kind: T.AbsenceKind, note?: string) {
    S().commit('Added day off', emp(S().db, empId), `${kind} ${from}${to !== from ? ` → ${to}` : ''}`, db => { db.absences.push({ id: uid('abs'), employeeId: empId, from, to, kind, note }) })
  },
  removeAbsence(id: string) { S().commit('Removed day off', 'Absence', id, db => { db.absences = db.absences.filter(a => a.id !== id) }) },

  // ----- time -----
  submitTime(e: Omit<T.TimeEntry, 'id' | 'hours' | 'status' | 'submittedAt'>, o?: { hours?: number; flag?: string }): { ok: boolean; reason?: string } {
    const wall = (t: string) => { const [hh, mm] = (t || '0:0').split(':').map(Number); return (hh || 0) * 60 + (mm || 0) }
    // A shift that runs past midnight is two calendar days: the hours before midnight stay on the start date.
    if (e.start && e.end && wall(e.end) > 0 && wall(e.end) < wall(e.start)) {
      const flag = o?.flag ? { flag: o.flag } : undefined
      const head = actions.submitTime({ ...e, end: '00:00', mealMin: 0 }, flag)
      const tail = actions.submitTime({ ...e, date: addDays(e.date, 1), start: '00:00' }, flag)
      return { ok: !!(head.ok && tail.ok), reason: head.reason ?? tail.reason }
    }
    const db0 = S().db
    const dup = db0.time.find(t => t.employeeId === e.employeeId && t.date === e.date && t.jobId === e.jobId && t.activity === e.activity && t.start === e.start)
    if (dup) return { ok: false, reason: 'Duplicate — this exact entry was already submitted.' }
    const overlap = db0.time.find(t => t.employeeId === e.employeeId && Math.abs(diffDays(t.date, e.date)) <= 1 && entriesOverlap(t, e)) // real spans: works for overnight shifts
    const hours = o?.hours ?? realHours(e.date, e.start, e.end, e.mealMin) // DST-correct; end ≤ start = ran past midnight
    const over = hours > MAX_SHIFT_H // same 16 h line as the field form
    const flagged = !!(overlap || over || o?.flag)
    const why = o?.flag ?? (overlap ? 'Overlaps another entry — review' : over ? `Over ${MAX_SHIFT_H} h — verify` : e.note)
    S().commit('Submitted time', emp(db0, e.employeeId), `${e.date} · ${hours}h · ${e.activity}${e.jobId ? ` · Job #${jobNo(db0, e.jobId)}` : ''}`, db => {
      db.time.push({ ...e, id: uid('te'), hours, status: flagged ? 'Flagged' : 'Submitted', note: why, submittedAt: new Date().toISOString() })
    })
    // A shift between 14 h and 16 h is still filed, and the person is told a supervisor will look at it. Over 16 h is flagged.
    return { ok: true, reason: flagged ? (o?.flag ?? (overlap ? 'Overlaps another entry — review' : `Flagged — over ${MAX_SHIFT_H} hours`)) : hours > 14 ? 'Long shift held for review' : undefined }
  },
  /** Employee/supervisor explains an over/under day. Cost of the extra hours lands on the unit, job or overhead. */
  timeReason(o: { employeeId: string; date: string; reason: string; note?: string; unitId?: string; jobId?: string }) {
    const who = S().session?.name ?? 'Unknown'
    S().commit('Explained time variance', emp(S().db, o.employeeId), `${o.date} · ${o.reason}${o.note ? ` — ${o.note}` : ''}`, db => {
      db.timeRecs = db.timeRecs ?? []
      const ex = db.timeRecs.find(r => r.employeeId === o.employeeId && r.date === o.date)
      if (ex) Object.assign(ex, { ...o, by: who, at: new Date().toISOString(), status: 'Pending', question: undefined })
      else db.timeRecs.push({ id: uid('trec'), ...o, by: who, at: new Date().toISOString(), status: 'Pending' })
    })
  },
  timeReconApprove(items: { employeeId: string; date: string; overHrs: number }[]) {
    const who = S().session?.name ?? 'Unknown'
    S().commit('Approved time reconciliation', `${items.length} employee-day${items.length === 1 ? '' : 's'}`, items.map(i => `${emp(S().db, i.employeeId)} ${i.date}`).slice(0, 4).join(', '), db => {
      db.timeRecs = db.timeRecs ?? []
      items.forEach(i => {
        let r = db.timeRecs!.find(x => x.employeeId === i.employeeId && x.date === i.date)
        if (!r) { r = { id: uid('trec'), employeeId: i.employeeId, date: i.date, reason: 'Within tickets + travel', by: 'Auto', at: new Date().toISOString(), status: 'Approved' }; db.timeRecs!.push(r) }
        r.status = 'Approved'; r.approvedBy = who; r.approvedAt = new Date().toISOString()
        const e = byId(db.employees, i.employeeId)
        if (i.overHrs > 0 && e && !r.costPosted) {
          const amt = Math.round(i.overHrs * e.rate * 1.32 * 100) / 100
          if (r.jobId) { db.costs.push({ id: uid('co'), jobId: r.jobId, date: i.date, category: 'Labor', description: `Extra time — ${r.reason} (${i.overHrs}h, ${fullName(e)})`, amount: amt, qty: i.overHrs, unit: 'hr', source: 'Time Entry', by: who }); r.costPosted = 'job' }
          else if (r.unitId) {
            let w = db.workOrders.find(x => x.unitId === r!.unitId && x.status !== 'Closed')
            if (!w) { const n = 7300 + db.workOrders.length + 1; w = { id: uid('wo'), woNo: `WO-${n}`, unitId: r.unitId, title: r.reason, complaint: r.note ?? r.reason, priority: 'Normal', status: 'Closed', opened: i.date, due: i.date, parts: [], laborHrs: 0, laborRate: Math.round(e.rate * 1.32), source: 'Driver Report' }; db.workOrders.push(w) }
            w.laborHrs += i.overHrs; r.costPosted = 'unit'
          } else r.costPosted = 'overhead'
        }
      })
      db.time.forEach(t => { if (items.some(i => i.employeeId === t.employeeId && i.date === t.date) && (t.status === 'Submitted' || t.status === 'Flagged')) { t.status = 'Approved'; t.approvedBy = who } })
    })
  },
  timeReconAsk(employeeId: string, date: string, question: string) {
    S().commit('Asked about time', emp(S().db, employeeId), `${date} · ${question}`, db => {
      db.timeRecs = db.timeRecs ?? []
      const r = db.timeRecs.find(x => x.employeeId === employeeId && x.date === date)
      if (r) { r.status = 'Asked'; r.question = question } else db.timeRecs.push({ id: uid('trec'), employeeId, date, reason: '', by: S().session?.name ?? '', at: new Date().toISOString(), status: 'Asked', question })
    })
  },
  setReconRules(r: { min: number; max: number; perMiles: number }) { S().commit('Updated travel allowance rule', 'Time reconciliation', `${r.min}–${r.max} h each way, 1 h per ${r.perMiles} mi`, db => { db.reconRules = r }) },
  /** Self-service profile update (My Info). Records each changed field; HR is notified, address changes flag payroll/tax. */
  updateMyInfo(empId: string, values: Record<string, string>, contacts?: T.EmergencyContact[]): number {
    const db0 = S().db; const e0 = byId(db0.employees, empId); if (!e0) return 0
    const who = S().session?.name ?? fullName(e0)
    const changes: T.InfoChange[] = []
    MYINFO_FIELDS.forEach(f => { if (!(f.key in values)) return; const from = getPath(e0, f.path), to = (values[f.key] ?? '').trim(); if (from !== to) changes.push({ id: uid('ic'), employeeId: empId, at: new Date().toISOString(), by: who, field: f.key, label: f.label, from, to, payroll: f.payroll }) })
    if (contacts) { const a = JSON.stringify(emergencyOf(e0)), b = JSON.stringify(contacts); if (a !== b) changes.push({ id: uid('ic'), employeeId: empId, at: new Date().toISOString(), by: who, field: 'emergency', label: 'Emergency contacts', from: emergencyOf(e0).map(c => `${c.name} (${c.relation}) ${c.phone}`).join('; '), to: contacts.map(c => `${c.name} (${c.relation}) ${c.phone}`).join('; ') }) }
    if (!changes.length) return 0
    S().commit('Updated My Info', fullName(e0), changes.map(c => c.label).join(', ') + (changes.some(c => c.payroll) ? ' · payroll/tax review flagged' : ''), db => {
      const e = byId(db.employees, empId)!
      changes.forEach(c => { const f = MYINFO_FIELDS.find(x => x.key === c.field); if (f) setPath(e, f.path, c.to) })
      if (contacts) { e.emergencyContacts = contacts; e.emergencyContact = contacts[0] }
      db.infoChanges = [...changes, ...(db.infoChanges ?? [])]
    })
    return changes.length
  },
  hrSeenInfo(ids: string[]) { S().commit('Reviewed profile changes', `${ids.length} change${ids.length === 1 ? '' : 's'}`, '', db => { (db.infoChanges ?? []).forEach(c => { if (ids.includes(c.id)) c.hrSeen = true }) }) },
  /** DEMO send: records the packet; if offline it queues and goes out when signal returns. Nothing leaves the device. */
  certSend(o: { employeeIds: string[]; certIds: string[]; jobId?: string; to: T.CertShare['to']; channel: 'Email' | 'Text'; note?: string }): T.CertShare {
    const st = S(); const online = st.ui.online && (typeof navigator === 'undefined' || navigator.onLine !== false)
    const me = st.db.employees.find(e => fullName(e) === st.session?.name)
    const now = new Date()
    const share: T.CertShare = { id: uid('cs'), token: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), ...o, by: st.session?.name ?? 'Unknown', byId: me?.id, at: now.toISOString(), status: online ? 'Sent' : 'Queued', sentAt: online ? now.toISOString() : undefined, expires: new Date(now.getTime() + 7 * 864e5).toISOString(), demo: true }
    const names = o.employeeIds.map(id => emp(st.db, id)).join(', ')
    st.commit(online ? `Sent certs (${o.channel}, demo)` : `Queued certs (${o.channel}, offline)`, names, `${o.certIds.length} cert${o.certIds.length === 1 ? '' : 's'} → ${o.to.name ?? ''} ${o.to.email ?? o.to.phone ?? ''}${o.jobId ? ` · Job #${jobNo(st.db, o.jobId)}` : ''}`, db => { db.certShares = [share, ...(db.certShares ?? [])] })
    return share
  },
  certFlushQueue(): number {
    const q = (S().db.certShares ?? []).filter(x => x.status === 'Queued'); if (!q.length) return 0
    S().commit('Sent queued certs (demo)', `${q.length} packet${q.length === 1 ? '' : 's'}`, 'Signal back — queued sends went out', db => { (db.certShares ?? []).forEach(x => { if (x.status === 'Queued') { x.status = 'Sent'; x.sentAt = new Date().toISOString() } }) })
    return q.length
  },
  /** Wallet QR: reuse today's live wallet link for these certs or mint one. */
  certWallet(empId: string, certIds: string[], jobId?: string): T.CertShare {
    const st = S(); const nowIso = new Date().toISOString()
    const ex = (st.db.certShares ?? []).find(x => x.channel === 'Wallet' && x.employeeIds[0] === empId && x.expires > nowIso && x.at.slice(0, 10) === nowIso.slice(0, 10) && x.certIds.join() === certIds.join())
    if (ex) return ex
    const share: T.CertShare = { id: uid('cs'), token: Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4), employeeIds: [empId], certIds, jobId, to: { name: 'Shown on phone (gate)' }, channel: 'Wallet', by: st.session?.name ?? 'Unknown', byId: empId, at: nowIso, status: 'Shown', expires: new Date(Date.now() + 7 * 864e5).toISOString(), demo: true }
    st.commit('Showed cert wallet', emp(st.db, empId), `${certIds.length} certs · QR link valid 7 days`, db => { db.certShares = [share, ...(db.certShares ?? [])] })
    return share
  },
  approveTime(ids: string[]) {
    S().commit('Approved time', `${ids.length} entries`, 'Payroll approval', db => { db.time.forEach(t => { if (ids.includes(t.id) && (t.status === 'Submitted' || t.status === 'Flagged')) { t.status = 'Approved'; t.approvedBy = S().session?.name } }) })
  },
  flagTime(id: string, note: string) { S().commit('Flagged time', 'Time entry', note, db => { const t = byId(db.time, id)!; t.status = 'Flagged'; t.note = note }) },
  exportTime(ids: string[]) { S().commit('Exported to payroll', `${ids.length} entries`, 'Payroll export (CSV) — records locked', db => { db.time.forEach(t => { if (ids.includes(t.id)) t.status = 'Exported' }) }) },
  clockIn(empId: string, jobId?: string): { ok: boolean; reason?: string } { const e0 = byId(S().db.employees, empId); if (e0?.status === 'Inactive') return { ok: false, reason: 'Your access has ended — you can’t clock in.' } // dive2: separated employees can't clock in
    if (e0?.ssHold) return { ok: false, reason: 'You’re not cleared for work right now — contact the DER before clocking in.' } // dive3 B3
    S().commit('Clocked in', emp(S().db, empId), jobId ? `Job #${jobNo(S().db, jobId)}` : 'No job', db => {
    // an earlier shift never clocked out → keep it as a flagged 0 h entry for the supervisor instead of silently dropping it
    const prev = db.clocks.find(c => c.employeeId === empId)
    if (prev) { const d = new Date(prev.inAt); db.time.push({ id: uid('te'), employeeId: empId, jobId: prev.jobId, date: localDate(d), activity: prev.jobId ? 'Lifting & Hoisting' : 'Yard / Shop', start: hhmmOf(d), end: hhmmOf(d), mealMin: 0, hours: 0, perDiems: [], status: 'Flagged', note: 'Missing clock-out — supervisor to set the end time', inAt: isoOffset(d), tz: deviceTz(), submittedAt: new Date().toISOString() }) }
    db.clocks = db.clocks.filter(c => c.employeeId !== empId); db.clocks.push({ employeeId: empId, jobId, inAt: isoOffset(new Date()), breakMin: 0 }) }); return { ok: true } },
  toggleBreak(empId: string) {
    S().commit('Break', emp(S().db, empId), '', db => {
      const c = db.clocks.find(x => x.employeeId === empId); if (!c) return
      if (c.breakStart) { c.breakMin += Math.round((Date.now() - new Date(c.breakStart).getTime()) / 60000); c.breakStart = undefined } else c.breakStart = new Date().toISOString()
    })
  },
  discardPunch(empId: string) { if (!S().db.clocks.some(c => c.employeeId === empId)) return; S().commit('Discarded punch', emp(S().db, empId), 'clocked out within a minute — no time saved', db => { db.clocks = db.clocks.filter(c => c.employeeId !== empId) }) },
  clockOut(empId: string, activity: T.Activity, perDiems: T.PerDiem[], note?: string) {
    const c = S().db.clocks.find(x => x.employeeId === empId); if (!c) return { ok: false, reason: 'Not clocked in' }
    const inD = new Date(c.inAt), out = new Date()
    const hhmm = hhmmOf
    const br = c.breakMin + (c.breakStart ? Math.round((Date.now() - new Date(c.breakStart).getTime()) / 60000) : 0)
    // real elapsed time (DST-correct, no 24 h wrap); dated to the shift START day so overnight hours land in the right OT week
    const hours = elapsedHours(inD, out, br), long = (out.getTime() - inD.getTime()) / 36e5 > MAX_SHIFT_H
    const res = actions.submitTime({ employeeId: empId, jobId: c.jobId, date: localDate(inD), activity, start: hhmm(inD), end: hhmm(out) === hhmm(inD) ? hhmm(new Date(out.getTime() + 60000)) : hhmm(out), mealMin: br, perDiems, note, inAt: isoOffset(inD), outAt: isoOffset(out), tz: deviceTz() },
      { hours, flag: long ? `Over ${MAX_SHIFT_H} h on the clock (${hours} h) — possible missed clock-out, supervisor to review` : undefined })
    if (!res.ok) return res // keep the clock running so the shift isn't lost
    S().commit('Clocked out', emp(S().db, empId), '', db => { db.clocks = db.clocks.filter(x => x.employeeId !== empId) }, { silent: true })
    return long ? { ok: true, reason: `Over ${MAX_SHIFT_H} h — sent to your supervisor for review` } : res
  },

  // ----- tickets -----
  saveTicket(t: T.EodTicket) {
    const db0 = S().db
    const exists = db0.tickets.some(x => x.id === t.id)
    if (!exists && db0.tickets.some(x => x.jobId === t.jobId && x.date === t.date && x.status !== 'Draft')) return { ok: false, reason: 'A ticket for this job and date was already submitted.' }
    S().commit(t.status === 'Signed' ? 'Customer signed ticket' : t.status === 'Submitted' ? 'Submitted EOD ticket' : 'Saved ticket draft', `Job #${jobNo(db0, t.jobId)}`, `${t.date}${t.signerName ? ` · signed by ${t.signerName}` : ''}`, db => {
      db.tickets = db.tickets.filter(x => x.id !== t.id); db.tickets.push(t)
      const job = byId(db.jobs, t.jobId); if (job && t.pctComplete >= 100 && job.status !== 'Complete') { /* PM decides closeout — notify only */ db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Action Required', title: `Field reports 100% complete — Job #${job.jobNo}`, body: 'Review closeout & invoice.', mandatory: false, roles: ['ops', 'dispatch', 'accounting', 'owner'], ref: { type: 'job', id: job.id }, read: false }) }
    })
    return { ok: true }
  },
  reviewTicket(id: string, status: T.EodTicket['status']) { S().commit('Reviewed ticket', 'EOD ticket', status, db => { byId(db.tickets, id)!.status = status }) },

  // ----- breakdowns / shop -----
  reportBreakdown(b: Omit<T.Breakdown, 'id' | 'reportedAt' | 'status' | 'workOrderId'>) {
    const db0 = S().db
    const recent = db0.breakdowns.find(x => x.unitId === b.unitId && x.status !== 'Resolved' && Date.now() - new Date(x.reportedAt).getTime() < 30 * 60000)
    if (recent) return { ok: false, reason: 'This unit already has an open breakdown report from the last 30 minutes. Shop has it.' }
    const u = byId(db0.equipment, b.unitId)!
    const woId = uid('wo')
    // dive2 M11: which jobs this unit is on (today forward) — the schedule impact goes in the alert
    const hit = db0.jobs.filter(j => j.endDate >= today() && j.stage !== 'Quote' && !['Complete', 'Invoiced', 'Paid'].includes(j.stage) && ((j.craneId === b.unitId || (j.craneIds ?? []).includes(b.unitId) || (j.rig ?? []).some(p => p.craneId === b.unitId)) || j.trailerIds.includes(b.unitId)))
    S().commit('Reported breakdown', `Unit ${u.unit}`, `${b.kind} · ${b.severity}`, db => {
      const n = Math.max(...db.workOrders.map(w => Number(w.woNo.split('-')[1]))) + 1
      db.workOrders.unshift({ id: woId, woNo: `WO-${n}`, unitId: b.unitId, title: `${b.kind} — field breakdown`, complaint: b.notes || b.kind, priority: b.severity.startsWith('Down') ? 'Critical' : 'High', status: 'Open', opened: today(), due: today(), parts: [], laborHrs: 0, laborRate: 115, source: 'Breakdown' })
      db.breakdowns.unshift({ ...b, id: uid('bd'), reportedAt: new Date().toISOString(), status: 'New', workOrderId: woId })
      const eq = byId(db.equipment, b.unitId)!; if (b.severity.startsWith('Down')) { eq.status = 'Out of Service'; eq.route = undefined } ; eq.lat = b.lat; eq.lng = b.lng
      hit.forEach(j => notifyJobCrew(db, j.id, `${u.category} ${u.unit} broke down`, `${b.kind}${b.severity.startsWith('Down') ? ' — out of service' : ''}. Dispatch is finding a replacement.`))
      db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Urgent', title: `Breakdown: ${u.unit} — ${b.kind}`, body: `${b.locationText} · contact ${b.contactName} ${b.contactPhone}${hit.length ? ` · On ${hit.map(j => `Job #${j.jobNo} (${j.startDate.slice(5)}–${j.endDate.slice(5)})`).join(', ')} — find a replacement or hire outside` : ''}`, mandatory: true, roles: ['owner', 'dispatch', 'shop', 'ops', 'safety'], ref: { type: 'equipment', id: b.unitId }, read: false }) // dive3 M14: Safety is told too
    })
    return { ok: true, jobs: hit.map(j => j.id) }
  },
  setBreakdown(id: string, status: T.Breakdown['status']) { S().commit('Updated breakdown', 'Breakdown', status, db => { byId(db.breakdowns, id)!.status = status }) },
  updateWO(id: string, patch: Partial<T.WorkOrder>) { const w = byId(S().db.workOrders, id)!; S().commit('Updated work order', w.woNo, Object.entries(patch).map(([k, v]) => `${k}: ${typeof v === 'object' ? '…' : v}`).join(', '), db => { Object.assign(byId(db.workOrders, id)!, patch) }) },
  createWO(w: Omit<T.WorkOrder, 'id' | 'woNo'>) {
    // one open PM per unit: a second PM on the same unit is refused (finish or close the open one first)
    const isPm = (x: { title: string; source?: string }) => /\bPM\b|PM-[A-Z]/i.test(x.title) || (x.source === 'Service Plan' && /\bservice\b/i.test(x.title))
    const dup = isPm(w) && S().db.workOrders.find(x => x.unitId === w.unitId && x.status !== 'Closed' && isPm(x))
    if (dup) return { ok: false as const, reason: `${dup.woNo} “${dup.title}” is already open on this unit — add to it or close it first.` }
    S().commit('Created work order', byId(S().db.equipment, w.unitId)!.unit, `${w.title}${w.priority === 'Critical' ? ' · Critical — unit tagged out' : ''}`, db => { const n = Math.max(...db.workOrders.map(x => Number(x.woNo.split('-')[1]))) + 1; db.workOrders.unshift({ ...w, id: uid('wo'), woNo: `WO-${n}` })
      // dive3 shop M5: a Critical work order takes the unit out of service and tells dispatch + the crews on it (same as a not-safe DVIR)
      if (w.priority === 'Critical') { const u = byId(db.equipment, w.unitId)!; u.status = 'Out of Service'; const now = today()
        const hit = db.jobs.filter(j => j.status !== 'Complete' && j.startDate <= now && j.endDate >= now && (j.craneId === u.id || (j.craneIds ?? []).includes(u.id) || j.trailerIds.includes(u.id)))
        hit.forEach(j => notifyJobCrew(db, j.id, `${u.category} ${u.unit} TAGGED OUT`, `Critical shop work order: ${w.title.slice(0, 80)}. Don't run it — dispatch is on it.`))
        db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Urgent', title: `TAGGED OUT: ${u.category} ${u.unit} — Critical work order`, body: `WO-${n}: ${w.title.slice(0, 120)}${hit.length ? ` · On ${hit.map(j => `Job #${j.jobNo}`).join(', ')} — swap or hire outside` : ''}`, mandatory: true, roles: ['dispatch', 'ops', 'safety', 'shop', 'branch', 'owner'], read: false }) } }); return { ok: true as const } },
  /** dive2 shop M6: release closes the one work order being released (others stay open and are listed), the unit goes back
   *  "On Job" if a live job uses it today (else Available), and a PM work order resets the service counters. */
  releaseToService(unitId: string, woId?: string, reading?: number) {
    const db0 = S().db, u = byId(db0.equipment, unitId)!, t = today()
    const open0 = db0.workOrders.filter(w => w.unitId === unitId && w.status !== 'Closed')
    // dive3 B2: only a work order the shop marked "Ready for Release" is ever closed here — Open / In Progress / Waiting Parts
    // work is never auto-closed — and a unit with any other Critical work order still open stays out of service.
    const closing = woId ? open0.filter(w => w.id === woId && w.status === 'Ready for Release') : open0.filter(w => w.status === 'Ready for Release')
    const left = open0.filter(w => !closing.some(c => c.id === w.id))
    const no = (reason: string) => ({ ok: false as const, reason, status: u.status, closed: [] as string[], left: left.map(w => w.woNo) })
    if (woId && !closing.length) return no('That work order isn’t marked Ready for Release yet.')
    if (!closing.length && open0.length) return no(`Finish the open work first: ${open0.map(w => `${w.woNo} (${w.status})`).join(', ')}. Only a work order marked Ready for Release can be released.`)
    const crit = left.filter(w => w.priority === 'Critical')
    if (crit.length) return no(`Still out of service: Critical ${crit.map(w => `${w.woNo} ${w.title} (${w.status})`).join(', ')} is open.`)
    const isPm = (x: { title: string; source?: string; pm?: boolean }) => x.pm === true || /\bPM\b|PM-[A-Z]/i.test(x.title)
    const live = db0.jobs.find(j => j.status !== 'Complete' && j.startDate <= t && j.endDate >= t && (j.craneId === unitId || (j.craneIds ?? []).includes(unitId) || j.trailerIds.includes(unitId)))
    S().commit('Released to service', `Unit ${u.unit}`, `Authorized Shop release${closing[0] ? ` — ${closing[0].woNo} closed` : ''}${left.length ? ` · still open: ${left.map(w => w.woNo).join(', ')}` : ''}`, db => {
      const e = byId(db.equipment, unitId)!; e.status = live ? 'On Job' : 'Available'
      db.workOrders.forEach(w => { if (closing.some(c => c.id === w.id)) w.status = 'Closed' })
      if (closing.some(isPm)) { const mi = e.category !== 'Crane' && e.miles != null; if (reading != null && Number.isFinite(reading) && reading >= (mi ? e.miles ?? 0 : e.hours ?? 0)) { if (mi) e.miles = reading; else e.hours = reading } e.nextServiceAt = mi ? (e.miles ?? 0) + 15000 : (e.hours ?? 0) + 250; e.nextServiceDate = addDays(t, 90) } // dive3 shop M6: next service from the reading taken at release
      db.breakdowns.forEach(b => { if (b.unitId === unitId && b.status !== 'Resolved' && (!b.workOrderId || closing.some(c => c.id === b.workOrderId))) b.status = 'Resolved' })
      db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Info', title: `${u.unit} released to service`, body: `${live ? `Back on Job #${live.jobNo}.` : 'Available for dispatch.'}${left.length ? ` Still open on this unit: ${left.map(w => `${w.woNo} ${w.title}`).join('; ')}.` : ''}`, mandatory: false, roles: ['dispatch', 'owner', 'shop', 'ops'], ref: { type: 'equipment', id: unitId }, read: false })
    })
    return { ok: true as const, status: live ? 'On Job' as const : 'Available' as const, closed: closing.map(c => c.woNo), left: left.map(w => w.woNo) }
  },
  tagOut(unitId: string, reason: string) { const u = byId(S().db.equipment, unitId)!; S().commit('Tagged out of service', `Unit ${u.unit}`, reason, db => { byId(db.equipment, unitId)!.status = 'Out of Service' }) },
  submitDvir(d: Omit<T.Dvir, 'id' | 'at' | 'workOrderId'>) {
    const db0 = S().db
    // dive3 M2: a re-inspection is allowed once the work order from today's earlier pre-trip is closed (repair, then re-check)
    const prevD = db0.dvirs.filter(x => x.unitId === d.unitId && x.date === d.date && x.employeeId === d.employeeId).sort((a, b) => b.at.localeCompare(a.at))[0]
    if (prevD && !(prevD.workOrderId && ['Complete', 'Closed', 'Done'].includes(String(byId(db0.workOrders, prevD.workOrderId)?.status)))) return { ok: false, reason: prevD.workOrderId ? 'Pre-trip already submitted for this unit today — a re-inspection opens when the shop closes the work order.' : 'Pre-trip already submitted for this unit today.' }
    const u = byId(db0.equipment, d.unitId)!
    S().commit('Submitted pre-trip (DVIR)', `Unit ${u.unit}`, d.safeToOperate ? 'No defects' : `Defects: ${d.defects}`, db => {
      let woId: string | undefined
      if (!d.safeToOperate || Object.values(d.items).includes('defect')) {
        woId = uid('wo'); const n = Math.max(...db.workOrders.map(x => Number(x.woNo.split('-')[1]))) + 1
        db.workOrders.unshift({ id: woId, woNo: `WO-${n}`, unitId: d.unitId, title: `DVIR defect — ${Object.entries(d.items).filter(([, v]) => v === 'defect').map(([k]) => k).join(', ')}`, complaint: d.defects, priority: d.safeToOperate ? 'Normal' : 'Critical', status: 'Open', opened: today(), due: addDays(today(), d.safeToOperate ? 3 : 0), parts: [], laborHrs: 0, laborRate: 115, source: 'Driver Report' })
        if (!d.safeToOperate) {
          byId(db.equipment, d.unitId)!.status = 'Out of Service'
          // dive2 field M3: a NOT-safe pre-trip alerts dispatch, safety, the shop and the crews on that unit
          const who = emp(db, d.employeeId); const now = today()
          const hit = db.jobs.filter(j => j.startDate <= now && j.endDate >= now && (j.craneId === d.unitId || (j.craneIds ?? []).includes(d.unitId) || j.trailerIds.includes(d.unitId)))
          hit.forEach(j => notifyJobCrew(db, j.id, `${u.category} ${u.unit} TAGGED OUT`, `Not safe to operate (pre-trip by ${who}). Don't run it — dispatch is on it.`))
          db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Urgent', title: `TAGGED OUT: ${u.category} ${u.unit} — not safe to operate`, body: `Pre-trip by ${who}: ${d.defects.slice(0, 120)}${hit.length ? ` · On ${hit.map(j => `Job #${j.jobNo}`).join(', ')} — swap or hire outside` : ''}`, mandatory: true, roles: ['dispatch', 'ops', 'safety', 'shop', 'branch', 'owner'], read: false })
        }
      }
      db.dvirs.unshift({ ...d, id: uid('dv'), at: new Date().toISOString(), workOrderId: woId })
    })
    return { ok: true }
  },
  logFuel(f: Omit<T.FuelLog, 'id'>) { S().commit('Logged fuel', byId(S().db.equipment, f.unitId)!.unit, `${f.gallons} gal${f.jobId ? ` → Job #${jobNo(S().db, f.jobId)}` : ''}`, db => { db.fuel.push({ ...f, id: uid('fu') }) }) },

  // ----- inventory (every movement → immutable ledger + audit) -----
  /** WHO = signed-in user, or the badge picked at the kiosk. */
  invWho(override?: string) {
    const db = S().db, ses = S().session
    const id = override ?? ses?.employeeId ?? db.employees.find(e => fullName(e) === ses?.name)?.id ?? ''
    return { id, name: id ? emp(db, id) : (ses?.name ?? 'Unknown') }
  },
  invCheckout(o: { itemId: string; qty: number; target: T.InvTarget; reason: string; due?: string; signature?: string; whoId?: string; tags?: string[] }) {
    const db0 = S().db; const it = byId(db0.items, o.itemId)!
    if (!o.reason.trim()) throw new Error('Reason required')
    { const why = qtyProblem(it, o.qty); if (why) throw new Error(why) } // dive3 shop M9
    if (o.qty > it.onHand) throw new Error('Not enough on the shelf')
    if (isReturnable(it) && o.due && o.due < today()) throw new Error('Due back can’t be in the past')
    // dive3 shop M10: tagged rigging goes out by tag — picked (or the in-date ones, oldest first); overdue/removed/wrong-colour/already-out tags refused
    const pk = rigHooks.pick?.(db0, it.id, o.qty, o.tags); if (pk?.error) throw new Error(pk.error)
    const who = actions.invWho(o.whoId); const at = new Date().toISOString(); const id = uid('chk')
    const jobId = o.target.kind === 'job' ? o.target.id : undefined
    const ret = isReturnable(it)
    S().commit('Checked out', it.name, `${o.qty} ${it.unit} → ${targetLabel(db0, o.target)} · by ${who.name} · ${o.reason}`, db => {
      const c: T.Checkout = { id, itemId: it.id, qty: o.qty, employeeId: who.id, byName: who.name, jobId, target: o.target, reason: o.reason.trim(), unitCost: it.cost, returnable: ret, signature: o.signature, tags: pk?.tags, at, out: today(), due: ret ? (o.due ?? addDays(today(), 7)) : today() }
      db.checkouts.unshift(c)
      byId(db.items, it.id)!.onHand -= o.qty
      db.invLedger.unshift({ id: uid('mv'), at, itemId: it.id, kind: 'Check-out', qty: -o.qty, by: who.id, byName: who.name, branchId: it.branchId ?? 'br-okc', unitCost: it.cost, target: o.target, jobId, reason: o.reason.trim(), checkoutId: id, bin: it.bin })
      postInvCost(db, c, o.qty, today(), who.name, id)
    })
    if (pk?.tags?.length) rigHooks.out?.(pk.tags, id)
    return id
  },
  /** Check-in (any item, partial OK). Good → back on the shelf + cost credited; Damaged → credited but removed from stock; Used up → closes remainder, no credit. */
  invCheckin(o: { checkoutId: string; qty: number; condition: 'Good' | 'Damaged' | 'Used up'; whoId?: string; bin?: string; note?: string }) {
    const db0 = S().db; const c0 = byId(db0.checkouts, o.checkoutId)!; const it = byId(db0.items, c0.itemId)!
    if (qtyProblem(it, o.qty)) return // dive3 shop M9: no negative / NaN / fractional-each returns
    const q = Math.min(o.qty, openQty(c0)); if (q <= 0) return
    const who = actions.invWho(o.whoId); const at = new Date().toISOString()
    S().commit(o.condition === 'Used up' ? 'Marked used up' : 'Checked in', it.name, `${q} ${it.unit} from ${targetLabel(db0, c0.target)} · ${o.condition}${o.bin && o.bin !== it.bin ? ` → bin ${o.bin}` : ''} · by ${who.name}`, db => {
      const c = byId(db.checkouts, o.checkoutId)!; const item = byId(db.items, c.itemId)!
      if (o.condition === 'Used up') c.usedUp = (c.usedUp ?? 0) + q
      else {
        c.returnedQty = (c.returnedQty ?? 0) + q
        if (o.condition === 'Good') { item.onHand += q; if (o.bin) item.bin = o.bin }
        postInvCost(db, c, -q, today(), who.name, uid('icr'))
        db.invLedger.unshift({ id: uid('mv'), at, itemId: item.id, kind: 'Return', qty: o.condition === 'Good' ? q : 0, by: who.id, byName: who.name, branchId: item.branchId ?? 'br-okc', unitCost: c.unitCost ?? item.cost, target: c.target, jobId: c.jobId, reason: o.note || (o.condition === 'Damaged' ? `Returned damaged (${q})` : 'Returned'), checkoutId: c.id, condition: o.condition, bin: o.bin ?? item.bin })
        if (o.condition === 'Damaged') db.invLedger.unshift({ id: uid('mv'), at, itemId: item.id, kind: 'Write-off', qty: 0, by: who.id, byName: who.name, branchId: item.branchId ?? 'br-okc', unitCost: c.unitCost ?? item.cost, reason: `Damaged on return — ${q} ${item.unit} scrapped`, checkoutId: c.id })
      }
      if (openQty(c) === 0) { c.returned = today(); c.condition = o.condition }
    })
    { const done = (c0.returnedQty ?? 0) + (c0.usedUp ?? 0); const tg = (c0.tags ?? []).slice(done, done + q) // dive3 shop M10: the same tags come back
      if (o.condition === 'Damaged') rigHooks.damaged?.(it.id, q, who.name, o.note, tg.length ? tg : undefined); else if (tg.length) rigHooks.back?.(tg) }
  },
  invAdjust(itemId: string, newOnHand: number, reason: string, kind: 'Adjust' | 'Count' | 'Write-off' = 'Adjust') {
    if (!reason.trim()) throw new Error('Reason required')
    if (!Number.isFinite(newOnHand) || newOnHand < 0 || !Number.isInteger(newOnHand)) throw new Error('On-hand can’t be negative or a fraction — count what’s on the shelf (0 or more)')
    if (newOnHand > 1_000_000) throw new Error('That count looks wrong — over 1,000,000')
    const it = byId(S().db.items, itemId)!; const who = actions.invWho(); const d = newOnHand - it.onHand
    S().commit(kind === 'Count' ? 'Cycle count' : kind === 'Write-off' ? 'Wrote off stock' : 'Adjusted stock', it.name, `${it.onHand} → ${newOnHand} · ${reason}`, db => {
      const x = byId(db.items, itemId)!; x.onHand = newOnHand; if (kind === 'Count') x.countedAt = today()
      db.invLedger.unshift({ id: uid('mv'), at: new Date().toISOString(), itemId, kind, qty: d, by: who.id, byName: who.name, branchId: x.branchId ?? 'br-okc', unitCost: x.cost, reason: reason.trim(), bin: x.bin })
    }, { diff: [{ field: 'On hand', from: String(it.onHand), to: String(newOnHand) }] })
  },
  invTransfer(itemId: string, qty: number, toBranchId: string, reason: string) {
    const db0 = S().db; const it = byId(db0.items, itemId)!; const who = actions.invWho()
    const to = byId(db0.branches, toBranchId)!
    { const why = qtyProblem(it, qty, it.onHand); if (why) throw new Error(why) } // dive3 shop M9
    if ((it.branchId ?? 'br-okc') === toBranchId) throw new Error('Pick a different branch')
    if (!reason.trim()) throw new Error('Reason required')
    S().commit('Transferred stock', it.name, `${qty} ${it.unit} → ${to.code} · ${reason}`, db => {
      const x = byId(db.items, itemId)!; x.onHand -= qty
      let y = db.items.find(i => i.sku === x.sku && (i.branchId ?? 'br-okc') === toBranchId)
      if (!y) { y = { ...x, id: uid('itm'), branchId: toBranchId, onHand: 0, bin: `${to.code.replace('SLH-', '')}-RCV`, loc: { building: 'Shop', aisle: 'Receiving', shelf: '—', bin: 'RCV' } }; db.items.push(y) }
      y.onHand += qty
      const at = new Date().toISOString()
      db.invLedger.unshift({ id: uid('mv'), at, itemId: x.id, kind: 'Transfer', qty: -qty, by: who.id, byName: who.name, branchId: x.branchId ?? 'br-okc', unitCost: x.cost, toBranchId, reason })
      db.invLedger.unshift({ id: uid('mv'), at, itemId: y.id, kind: 'Transfer', qty, by: who.id, byName: who.name, branchId: toBranchId, unitCost: x.cost, reason: `From ${x.branchId ?? 'br-okc'} · ${reason}` })
    })
  },
  invSetOos(itemId: string, reason: string | null) {
    const it = byId(S().db.items, itemId)!; const who = actions.invWho()
    S().commit(reason ? 'Tagged out of service' : 'Returned to service', it.name, reason ?? 'Inspected OK', db => { const x = byId(db.items, itemId)!; x.oos = reason ? { at: today(), by: who.name, reason } : undefined; if (!reason) { x.certDate = today(); x.inspectionDue = addDays(today(), 365) } })
  },
  invAddItem(item: Omit<T.InventoryItem, 'id'>, sds?: Omit<T.Sds, 'id'>) {
    if (!item.photo) throw new Error('Photo required')
    if (!item.loc) throw new Error('Location required')
    if (item.chemical && !sds?.pdf) throw new Error('SDS PDF required for chemicals')
    const who = actions.invWho(); const id = uid('itm')
    S().commit('Added inventory item', item.name, `${item.sku} · ${item.onHand} ${item.unit} · bin ${item.bin}${sds ? ' · SDS on file' : ''}`, db => {
      let sdsId = item.sdsId
      if (sds) { sdsId = uid('sds'); db.sds.push({ ...sds, id: sdsId }) }
      db.items.push({ ...item, id, sdsId })
      if (item.onHand) db.invLedger.unshift({ id: uid('mv'), at: new Date().toISOString(), itemId: id, kind: 'Receive', qty: item.onHand, by: who.id, byName: who.name, branchId: item.branchId ?? 'br-okc', unitCost: item.cost, reason: 'New item received', bin: item.bin })
    })
    return id
  },
  invAttachSds(itemId: string, sds: Omit<T.Sds, 'id'>) {
    const it = byId(S().db.items, itemId)!
    S().commit('Attached SDS', it.name, `${sds.product} rev ${sds.revised}`, db => { const id = uid('sds'); db.sds.push({ ...sds, id }); db.items.filter(i => i.sku === it.sku).forEach(i => { i.sdsId = id }) })
  },
  invUpdateItem(itemId: string, patch: Partial<T.InventoryItem>, what = 'Edited item') { const it = byId(S().db.items, itemId)!; S().commit(what, it.name, Object.keys(patch).join(', '), db => { Object.assign(byId(db.items, itemId)!, patch) }) },
  /** Draft PO per vendor from the suggested reorder list (one tap per vendor or all at once). */
  invDraftPOs(lines: { itemId: string; qty: number; jobId?: string }[], o: { jobId?: string; note?: string; requestId?: string } = {}) {
    const db0 = S().db; const who = actions.invWho()
    const byVendor = new Map<string, T.PurchaseOrder['lines']>()
    lines.filter(l => { const it = byId(db0.items, l.itemId); return !!it && !qtyProblem(it, l.qty) }).forEach(l => { /* dive3 shop M9: no 0.3-each lines */ const it = byId(db0.items, l.itemId)!; const v = it.vendorId ?? 'ven-10'; byVendor.set(v, [...(byVendor.get(v) ?? []), { itemId: it.id, qty: l.qty, received: 0, cost: it.cost, jobId: l.jobId ?? o.jobId }]) })
    const n0 = Math.max(4100, ...db0.pos.map(p => Number(p.poNo.replace(/\D/g, '')) || 0)); const ids: string[] = []
    S().commit('Drafted purchase orders', `${byVendor.size} PO${byVendor.size === 1 ? '' : 's'}`, `${lines.length} lines${o.jobId ? ` for Job #${jobNo(db0, o.jobId)}` : ' from reorder list'}`, db => {
      ;[...byVendor.entries()].forEach(([vendorId, ls], k) => { const id = uid('po'); ids.push(id); db.pos.unshift({ id, poNo: `PO-${n0 + k + 1}`, vendorId, branchId: 'br-okc', created: today(), by: who.name, status: 'Draft', lines: ls, jobId: o.jobId, note: o.note, requestId: o.requestId }) })
    })
    return ids
  },
  invUpdatePO(poId: string, patch: Partial<Pick<T.PurchaseOrder, 'lines' | 'note' | 'jobId' | 'expected'>>) {
    const p = byId(S().db.pos, poId)!
    S().commit('Edited purchase order', p.poNo, Object.keys(patch).join(', '), db => { const x = byId(db.pos, poId)!; Object.assign(x, patch); if (patch.jobId !== undefined) x.lines.forEach(l => { l.jobId = patch.jobId || undefined }) })
  },
  importItems(rows: Omit<T.InventoryItem, 'id'>[]) {
    const skus = new Set(S().db.items.map(i => i.sku.toLowerCase()))
    const fresh = rows.filter(r => !skus.has(r.sku.toLowerCase()))
    S().commit('Imported inventory (CSV)', `${fresh.length} items`, `${rows.length - fresh.length} duplicates skipped`, db => { fresh.forEach(r => db.items.push({ ...r, id: uid('itm') })) })
    return { added: fresh.length, skipped: rows.length - fresh.length }
  },
  invSendPO(poId: string) {
    const p = byId(S().db.pos, poId)!; const v = byId(S().db.vendors, p.vendorId)
    S().commit('Sent purchase order', p.poNo, `${v?.name ?? ''}${v?.email ? ` · ${v.email}` : ''} · Draft → Sent`, db => { const x = byId(db.pos, poId)!; x.status = 'Sent'; x.sentAt = today(); x.expected = addDays(today(), v?.leadDays ?? 3) })
  },
  /** Close a PO: finished, or "close short" when the rest will never ship. */
  invClosePO(poId: string, why = 'Complete') {
    const p = byId(S().db.pos, poId)!
    S().commit('Closed purchase order', p.poNo, `${p.status} → Closed · ${why}`, db => { const x = byId(db.pos, poId)!; x.status = 'Closed'; x.closedAt = today(); x.note = why === 'Complete' ? x.note : `${x.note ? x.note + ' · ' : ''}Closed short: ${why}` })
  },
  /** Receive against a PO: good units into stock (ledger 'Receive'), damaged set aside, job lines checked straight out to the job,
   *  and the vendor's invoice lands in AP (Pending Approval) for the 3-way match. */
  invReceive(poId: string, recv: Record<string, number>, damaged: Record<string, number> = {}, note?: string) {
    const db0 = S().db; const p = byId(db0.pos, poId)!; const who = actions.invWho()
    // good + damaged can never exceed what is still open on the line; damaged is credited, never billed
    const shipped = p.lines.map(l => { const open = Math.max(0, l.qty - l.received); const q = Math.min(open, Math.max(0, Math.floor(Number(recv[l.itemId]) || 0))); return { l, q, d: Math.min(open - q, Math.max(0, Math.floor(Number(damaged[l.itemId]) || 0))) } }).filter(x => x.q || x.d)
    if (!shipped.length) throw new Error('Nothing to receive')
    const total = shipped.reduce((s2, x) => s2 + x.q * x.l.cost, 0)
    const dmg = shipped.reduce((s2, x) => s2 + x.d, 0)
    S().commit('Received against PO', p.poNo, `${shipped.reduce((a2, x) => a2 + x.q, 0)} good${dmg ? ` · ${dmg} damaged` : ''} · $${total.toFixed(2)}`, db => {
      const po = byId(db.pos, poId)!; const at = new Date().toISOString()
      shipped.forEach(({ l: l0, q, d }) => {
        const l = po.lines.find(x => x.itemId === l0.itemId)!; const it = byId(db.items, l.itemId)!
        l.received += q; if (d) l.damaged = (l.damaged ?? 0) + d
        if (q) { it.onHand += q; db.invLedger.unshift({ id: uid('mv'), at, itemId: it.id, kind: 'Receive', qty: q, by: who.id, byName: who.name, branchId: it.branchId ?? 'br-okc', unitCost: l.cost, poId, reason: `Received on ${po.poNo}`, bin: it.bin }) }
        if (d) db.invLedger.unshift({ id: uid('mv'), at, itemId: it.id, kind: 'Write-off', qty: 0, by: who.id, byName: who.name, branchId: it.branchId ?? 'br-okc', unitCost: l.cost, poId, reason: `${d} arrived damaged on ${po.poNo} — not stocked, vendor credit requested` })
        // bought for a job → check it straight out to that job so the cost lands on the job P&L
        const jobId = l.jobId ?? po.jobId
        if (q && jobId) {
          const cid = uid('chk'); const ret = isReturnable(it)
          const c: T.Checkout = { id: cid, itemId: it.id, qty: q, employeeId: who.id, byName: who.name, jobId, target: { kind: 'job', id: jobId }, reason: `Bought for job on ${po.poNo}`, unitCost: l.cost, returnable: ret, at, out: today(), due: ret ? addDays(today(), 14) : today() }
          db.checkouts.unshift(c); it.onHand -= q
          db.invLedger.unshift({ id: uid('mv'), at, itemId: it.id, kind: 'Check-out', qty: -q, by: who.id, byName: who.name, branchId: it.branchId ?? 'br-okc', unitCost: l.cost, target: c.target, jobId, reason: c.reason, checkoutId: cid, poId })
          postInvCost(db, c, q, today(), who.name, cid)
        }
      })
      po.receipts = [...(po.receipts ?? []), { id: uid('rcv'), at, by: who.name, lines: shipped.map(x => ({ itemId: x.l.itemId, qty: x.q, damaged: x.d })), note }]
      const cr = shipped.filter(x => x.d).map(x => ({ id: uid('vc'), at, itemId: x.l.itemId, qty: x.d, amount: Math.round(x.d * x.l.cost * 100) / 100, status: 'Credit requested' as const }))
      if (cr.length) po.credits = [...(po.credits ?? []), ...cr]
      po.status = po.lines.every(l => l.received >= l.qty) ? 'Received' : 'Partially Received'
      if (total > 0) {
        const billId = uid('bill'); const v = byId(db.vendors, po.vendorId)
        db.bills.unshift({ id: billId, vendorId: po.vendorId, billNo: `${po.poNo}-R${(po.billIds?.length ?? 0) + 1}`, date: today(), due: addDays(today(), v?.terms ?? 30), branchId: po.branchId, status: 'Pending Approval', poId: po.id, invoiceLines: shipped.filter(x => x.q).map(x => ({ itemId: x.l.itemId, qty: x.q, price: x.l.cost })), lines: [{ id: uid('bl'), category: 'Materials', description: `Stock received on ${po.poNo}${po.jobId ? ` (for Job #${byId(db.jobs, po.jobId)?.jobNo})` : ''}${dmg ? ` · ${dmg} damaged returned for vendor credit (not billed)` : ''}`, amount: Math.round(total * 100) / 100 }] })
        po.billIds = [...(po.billIds ?? []), billId]
      }
    })
  },
  invSetMinMax(itemId: string, min: number, max: number) {
    const it = byId(S().db.items, itemId)!
    S().commit('Set reorder point', it.name, `min ${it.min} → ${min} · max ${it.max ?? '—'} → ${max}`, db => { const x = byId(db.items, itemId)!; x.min = min; x.max = max; x.reorderQty = Math.max(1, max - min) }, { diff: [{ field: 'Min', from: String(it.min), to: String(min) }, { field: 'Max', from: String(it.max ?? '—'), to: String(max) }] })
  },
  addVendor(v: Omit<T.Vendor, 'id'>) { const id = uid('ven'); S().commit('Added vendor', v.name, v.kind ?? v.category, db => { db.vendors.push({ ...v, id }) }); return id },
  updateVendor(id: string, patch: Partial<T.Vendor>) { const v = byId(S().db.vendors, id)!; S().commit('Edited vendor', v.name, Object.keys(patch).join(', '), db => { Object.assign(byId(db.vendors, id)!, patch) }) },

  // ----- parts requests (field / shop / sales → inventory person) -----
  invRequest(o: { lines: { itemId: string; qty: number }[]; target?: T.InvTarget; reason: string; needBy: string; from: T.PartsRequest['from']; whoId?: string }) {
    if (!o.lines.length) throw new Error('Add at least one item')
    if (!o.reason.trim()) throw new Error('Tell us what it’s for')
    const db0 = S().db; const who = actions.invWho(o.whoId)
    const no = `RQ-${1200 + (db0.partsRequests?.length ?? 0) + 1}`; const id = uid('req')
    S().commit('Requested parts', no, `${who.name} · ${o.lines.map(l => `${l.qty} × ${byId(db0.items, l.itemId)?.name}`).join(', ')}`, db => {
      db.partsRequests = [{ id, no, at: new Date().toISOString(), byId: who.id, byName: who.name, from: o.from, lines: o.lines, target: o.target, reason: o.reason.trim(), needBy: o.needBy, status: 'Waiting' }, ...(db.partsRequests ?? [])]
      db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Action Required', title: `Parts request ${no}`, body: `${who.name} needs ${o.lines.length} item${o.lines.length === 1 ? '' : 's'} by ${o.needBy}`, mandatory: false, roles: ['inventory', 'ops'], ref: { type: 'request', id }, read: false })
    })
    return id
  },
  invDecideRequest(id: string, status: 'Approved' | 'Denied', note?: string) {
    const r = (S().db.partsRequests ?? []).find(x => x.id === id)!
    S().commit(status === 'Approved' ? 'Approved parts request' : 'Denied parts request', r.no, `${r.byName}${note ? ` · ${note}` : ''} · ${r.status} → ${status}`, db => { const x = db.partsRequests!.find(y => y.id === id)!; x.status = status; x.decidedBy = S().session?.name; x.decidedAt = new Date().toISOString(); if (note) x.note = note })
  },
  /** Picked off the shelf → one check-out per line, WHO = the requester, used on = the request's target. */
  invFulfillRequest(id: string) {
    const db0 = S().db; const r = (db0.partsRequests ?? []).find(x => x.id === id)!
    const short = r.lines.filter(l => (byId(db0.items, l.itemId)?.onHand ?? 0) < l.qty)
    if (short.length) throw new Error(`Not enough on the shelf: ${short.map(l => byId(db0.items, l.itemId)?.name).join(', ')}`)
    const target = r.target ?? (r.byId ? { kind: 'employee' as const, id: r.byId } : undefined)
    if (!target) throw new Error('Request has no “used on”')
    const ids = r.lines.map(l => actions.invCheckout({ itemId: l.itemId, qty: l.qty, target, reason: `${r.no}: ${r.reason}`, whoId: r.byId || undefined }))
    S().commit('Filled parts request', r.no, `${r.lines.length} line${r.lines.length === 1 ? '' : 's'} checked out to ${r.byName} · ${r.status} → Checked out`, db => { const x = db.partsRequests!.find(y => y.id === id)!; x.status = 'Checked out'; x.checkoutIds = ids; if (!x.decidedBy) { x.decidedBy = S().session?.name; x.decidedAt = new Date().toISOString() } })
    return ids
  },

  // ----- cycle counts (blind count of one shelf, weekly) -----
  invPostCount(o: { countId?: string; shelf: string; label: string; lines: { itemId: string; counted: number; reason?: string; note?: string }[] }) {
    const db0 = S().db; const who = actions.invWho()
    const rows = o.lines.map(l => { const it = byId(db0.items, l.itemId)!; return { ...l, it, d: l.counted - it.onHand } })
    const vari = rows.filter(x => x.d !== 0)
    if (vari.some(x => !x.reason?.trim())) throw new Error('Every variance needs a reason')
    const $ = vari.reduce((s2, x) => s2 + x.d * x.it.cost, 0)
    S().commit('Cycle count', `Shelf ${o.shelf}`, `${rows.length} items · ${vari.length} variance${vari.length === 1 ? '' : 's'} · ${$ >= 0 ? '+' : '−'}$${Math.abs($).toFixed(2)}`, db => {
      const at = new Date().toISOString()
      rows.forEach(x => {
        const it = byId(db.items, x.itemId)!; it.countedAt = today()
        if (x.d !== 0) { it.onHand = x.counted; db.invLedger.unshift({ id: uid('mv'), at, itemId: it.id, kind: 'Count', qty: x.d, by: who.id, byName: who.name, branchId: it.branchId ?? 'br-okc', unitCost: it.cost, reason: `${x.reason}${x.note ? ` — ${x.note}` : ''}`, bin: it.bin }) }
      })
      const rec: T.CycleCount = { id: o.countId ?? uid('cc'), shelf: o.shelf, label: o.label, due: today(), status: 'Done', countedBy: who.name, countedAt: at, lines: rows.map(x => ({ itemId: x.itemId, expected: x.it.onHand, counted: x.counted, reason: x.d ? x.reason : undefined, note: x.note, unitCost: x.it.cost })) }
      const list = db.cycleCounts ?? []
      const i = o.countId ? list.findIndex(c => c.id === o.countId) : -1
      if (i >= 0) list[i] = { ...list[i], ...rec, due: list[i].due }; else list.unshift(rec)
      // schedule next week's shelf: the one counted longest ago
      if (!list.some(c => c.status === 'Due')) {
        const shelves = [...new Set(db.items.filter(it => (it.branchId ?? 'br-okc') === 'br-okc').map(shelfOf))]
        const age = (sh: string) => db.items.filter(it => shelfOf(it) === sh).reduce((m, it) => (it.countedAt ?? '') < m ? (it.countedAt ?? '') : m, '9999')
        const next = shelves.filter(sh => sh !== o.shelf).sort((a2, b2) => age(a2).localeCompare(age(b2)))[0]
        const ni = next ? db.items.find(it => shelfOf(it) === next) : undefined
        if (next && ni) list.unshift({ id: uid('cc'), shelf: next, label: ni.loc ? `${ni.loc.building} · ${ni.loc.aisle} · ${ni.loc.shelf}` : next, due: addDays(today(), 7), status: 'Due' })
      }
      db.cycleCounts = list
    }, { diff: vari.map(x => ({ field: x.it.name, from: String(x.it.onHand), to: `${x.counted} (${x.reason})` })) })
  },

  // ----- safety -----
  addCert(c: Omit<T.Cert, 'id'>) { S().commit('Added certification', emp(S().db, c.employeeId), `${c.type} exp ${c.expires}`, db => { db.certs.push({ ...c, id: uid('cert') }) }) },
  verifyCert(id: string, v: T.Cert['verified']) { const c = byId(S().db.certs, id)!; S().commit('Reviewed certification', emp(S().db, c.employeeId), `${c.type}: ${v}`, db => { const x = byId(db.certs, id)!; x.verified = v; if (x.pendingExpires) { if (v === 'Verified') { x.issued = today(); x.expires = x.pendingExpires; if (x.pendingProof) x.proof = x.pendingProof } if (v !== 'Needs Review') { delete x.pendingExpires; delete x.pendingProof; if (v === 'Rejected') x.verified = 'Verified' } } }) }, // dive2: a renewal only takes effect once verified; rejecting it keeps the old card
  renewCert(id: string, expires: string, proof?: string) { const c = byId(S().db.certs, id)!; S().commit('Renewal logged (pending verification)', emp(S().db, c.employeeId), `${c.type} → ${expires}${proof ? ` · proof ${proof}` : ''}`, db => { const x = byId(db.certs, id)!; x.pendingExpires = expires; x.pendingProof = proof; x.verified = 'Needs Review' }) }, // dive2: printed expiry waits for verification; current date stays in force
  addIncident(i: Omit<T.Incident, 'id' | 'no'>) {
    const involved = [...new Set([i.employeeId].filter((id): id is string => !!id && !!byId(S().db.employees, id)))]
    S().commit('Reported incident', i.kind, i.description.slice(0, 60), db => { const yr = (i.date || today()).slice(0, 4), n = Math.max(0, ...db.incidents.filter(x => x.no.startsWith(`INC-${yr}-`)).map(x => Number(x.no.split('-')[2]) || 0)) + 1; db.incidents.unshift({ ...i, id: uid('inc'), no: `INC-${yr}-${String(n).padStart(3, '0')}` }); /* dive3 T3b: numbers restart each year */ db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: i.severity === 'High' ? 'Urgent' : 'Action Required', title: `${i.kind} reported`, body: i.description.slice(0, 80), mandatory: true, roles: ['safety', 'owner', 'ops'], read: false }); if (i.kind === 'Recordable' || i.kind === 'Vehicle') db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Urgent', title: `${i.kind} — decide on a DOT post-accident test`, body: 'Alcohol within 8 h, drugs within 32 h (§382.303). Order it on Drug & Alcohol → Tests.', mandatory: true, roles: ['der'], read: false }) })
    // Anyone named on the report is off the board until the DER clears them. Do not touch setCrane or assign here.
    for (const id of involved) if (!byId(S().db.employees, id)?.ssHold) actions.ssHold(id, true)
  },
  updateIncident(id: string, patch: Partial<T.Incident>): boolean { const cur = byId(S().db.incidents, id)!; const nx = { ...cur, ...patch } // dive2: a Recordable can't be closed without a root cause + corrective action
    if (patch.status === 'Closed' && (nx.kind === 'Recordable' ? (!nx.correctiveAction?.trim() || !nx.rootCause?.trim()) : !nx.correctiveAction?.trim())) return false // dive3: every kind needs a corrective action to close
    S().commit('Updated incident', cur.no, Object.keys(patch).join(', '), db => { Object.assign(byId(db.incidents, id)!, patch, patch.status === 'Closed' ? { closedBy: S().session?.name } : {}) }); return true },
  /** Each person signs their own JSA (Chad: no signing on someone else's behalf). */
  signTalk(id: string, empId: string) { S().commit('Signed JSA', byId(S().db.talks, id)!.title, emp(S().db, empId), db => { const t = byId(db.talks, id)!; if (!t.attendeeIds.includes(empId)) t.attendeeIds.push(empId); t.signed = true }) },
  addTalk(t: Omit<T.SafetyTalk, 'id'>) { if (S().db.talks.some(x => x.kind === t.kind && x.title.trim() === t.title.trim() && (x.jobId ?? '') === (t.jobId ?? '') && x.date === t.date)) return // dive3 J2: a double tap on Publish doesn't post it twice
    S().commit(`Created ${t.kind}`, t.title, `${t.attendeeIds.length} attendees`, db => { db.talks.unshift({ ...t, id: uid('jsa') }) }) },
  recordInspection(id: string, result: T.Inspection['result'], notes?: string, inspectorId?: string) { S().commit('Recorded inspection', byId(S().db.inspections, id)!.kind, `${result}${notes ? ` · ${notes}` : ''}`, db => { const x = byId(db.inspections, id)!; const by = inspectorId ?? S().session?.employeeId ?? x.inspectorId // dive2: keep history + defect notes, stamp the inspector, interval per type
    x.history = [...(x.history ?? (x.result !== 'Due' ? [{ date: x.date, result: x.result as 'Pass' | 'Fail', notes: x.notes, by: x.inspectorId }] : [])), { date: today(), result: result as 'Pass' | 'Fail', notes, by }]
    x.result = result; x.notes = notes || (result === 'Fail' ? x.notes : undefined); x.date = today(); x.inspectorId = by; if (result === 'Pass') { x.due = addDays(today(), inspectionDays(x.kind)); if (x.kind === 'Crane Annual' && x.unitId) byId(db.equipment, x.unitId)!.annualInspection = addDays(today(), 365) } /* dive3 shop M7: a passed annual certifies the crane */ if (result === 'Fail' && x.unitId) {
      // dive3 S4: a failed inspection tags out AND opens a Critical work order, alerting dispatch/shop/safety and the crews on it
      const u = byId(db.equipment, x.unitId)!; u.status = 'Out of Service'
      const n = Math.max(...db.workOrders.map(w => Number(w.woNo.split('-')[1]) || 0)) + 1, now = today()
      if (!db.workOrders.some(w => w.unitId === u.id && w.status !== 'Closed' && w.title.startsWith(`Failed ${x.kind}`))) db.workOrders.unshift({ id: uid('wo'), woNo: `WO-${n}`, unitId: u.id, title: `Failed ${x.kind} inspection`, complaint: notes || 'Failed inspection', priority: 'Critical', status: 'Open', opened: now, due: now, parts: [], laborHrs: 0, laborRate: 115, source: 'Inspection' } as T.WorkOrder)
      const hit = db.jobs.filter(j => j.startDate <= now && j.endDate >= now && (j.craneId === u.id || (j.craneIds ?? []).includes(u.id) || j.trailerIds.includes(u.id)))
      hit.forEach(j => notifyJobCrew(db, j.id, `${u.category} ${u.unit} TAGGED OUT`, `Failed ${x.kind} inspection. Don't run it — dispatch is on it.`))
      db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Urgent', title: `TAGGED OUT: ${u.category} ${u.unit} — failed ${x.kind} inspection`, body: `${(notes ?? '').slice(0, 120)}${hit.length ? ` · On ${hit.map(j => `Job #${j.jobNo}`).join(', ')} — swap or hire outside` : ''}`, mandatory: true, roles: ['dispatch', 'ops', 'safety', 'shop', 'branch', 'owner'], read: false })
    } }) },

  // ----- HR -----
  createHire(h: Omit<T.Hire, 'id' | 'email' | 'empNo' | 'steps' | 'created'>) {
    const db0 = S().db
    const dupe = [...db0.employees.map(e => `${e.first} ${e.last}`.toLowerCase()), ...db0.hires.map(x => `${x.first} ${x.last}`.toLowerCase())].includes(`${h.first} ${h.last}`.toLowerCase())
    const dupePhone = db0.employees.some(e => e.phone === h.phone)
    let email = emailFor(h.first, h.last)
    let k = 2
    while (k < 1000 && [...db0.employees, ...db0.hires].some(x => x.email === email)) email = emailFor(h.first, h.last).replace('@', String(k++) + '@') // dive2 fix: emailFor strips digits, so suffix after cleaning (was an infinite loop on duplicate names)
    const maxNo = Math.max(...[...db0.employees, ...db0.hires].map(x => Number(x.empNo.split('-')[1])).filter(n => n < 9000)) // dive3: 9000-band numbers are office/front-desk staff — new hires continue the field sequence (SLH-2004, not SLH-9054)
    const hire: T.Hire = { ...h, id: uid('hire'), email, empNo: `SLH-${maxNo + 1}`, steps: { account: true, profile: false, id: false, emergency: false, sizes: false, training: false, sds: false }, created: new Date().toISOString() }
    S().commit('Created new hire', `${h.first} ${h.last}`, `${hire.empNo} · ${email}`, db => { db.hires.unshift(hire) })
    return { hire, warn: dupe ? 'An employee or hire with this name already exists — confirm this is a different person.' : dupePhone ? 'Phone number matches an existing employee.' : undefined }
  },
  hireStep(id: string, step: string, v: boolean) { S().commit('Onboarding step', byId(S().db.hires, id)!.first, `${step}: ${v ? 'done' : 'open'}`, db => { byId(db.hires, id)!.steps[step] = v }) },
  activateHire(id: string, opt?: { noDrive?: string; certs?: { type: string }[] }): string | undefined {
    const h = byId(S().db.hires, id)
    if (!h || !h.steps?.training) return
    const newId = uid('emp')
    S().commit('Activated employee', `${h.first} ${h.last}`, `${h.empNo} moved to active roster${opt?.noDrive ? ' · non-driving until DOT cleared' : ''}`, db => {
      db.hires = db.hires.filter(x => x.id !== id)
      db.employees.push({ ...(opt?.noDrive ? { noDrive: opt.noDrive } : {}), id: newId, empNo: h.empNo, first: h.first, last: h.last, craft: h.craft, phone: h.phone, email: h.email, supervisorId: h.supervisorId, status: 'Active', perDiemBlocked: [], hireDate: h.start, city: byId(db.branches, h.branchId ?? 'br-okc')?.city ?? 'Oklahoma City', rate: h.rate ?? 28, divisionId: h.divisionId ?? 'div-slh', branchId: h.branchId ?? 'br-okc' })
      for (const c of opt?.certs ?? []) db.certs.push({ id: uid('cert'), employeeId: newId, type: c.type as T.CertType, credentialNo: 'TRAIN', provider: 'Orientation', issued: today(), expires: addDays(today(), 365), verified: 'Verified' })
    })
    return newId
  },
  requestPto(p: Omit<T.PtoRequest, 'id' | 'status' | 'requestedAt'>) {
    // Guard every entry point (office + field app): reversed dates are swapped; hours = 10 × (Mon–Fri + scheduled weekend days), never negative.
    if (p.to < p.from) p = { ...p, from: p.to, to: p.from }
    const asg0 = S().db.assignments
    let bd = 0; for (let d = new Date(p.from + 'T12:00:00'), end = new Date(p.to + 'T12:00:00'); d <= end; d.setDate(d.getDate() + 1)) if (d.getDay() % 6 !== 0 || asg0.some(a => a.employeeId === p.employeeId && a.date === d.toISOString().slice(0, 10))) bd++
    p = { ...p, hours: bd * 10 }
    // double-submit / duplicate guard: an open request for the same person, kind and overlapping dates isn't added twice
    const dupe = S().db.pto.find(x => x.employeeId === p.employeeId && x.kind === p.kind && (x.status === 'Pending' || x.status === 'Approved') && x.from <= p.to && x.to >= p.from)
    if (dupe) return { ok: false, reason: `Already requested — ${dupe.kind} ${dupe.from} → ${dupe.to} is ${dupe.status.toLowerCase()}` }
    S().commit('Requested PTO', emp(S().db, p.employeeId), `${p.kind} ${p.from} → ${p.to}`, db => { db.pto.unshift({ ...p, id: uid('pto'), status: 'Pending', requestedAt: new Date().toISOString() }) })
    return { ok: true } },
  decidePto(id: string, status: 'Approved' | 'Denied', note?: string) {
    const p = byId(S().db.pto, id)!
    S().commit(`${status} PTO`, emp(S().db, p.employeeId), `${p.from} → ${p.to}`, db => {
      const x = byId(db.pto, id)!; x.status = status; x.decidedBy = S().session?.name; x.note = note
      if (status === 'Approved') {
        db.absences.push({ id: uid('abs'), employeeId: x.employeeId, from: x.from, to: x.to, kind: 'Vacation / PTO', note: 'Approved PTO' })
        const conflicts = db.assignments.filter(a => a.employeeId === x.employeeId && a.date >= x.from && a.date <= x.to)
        if (conflicts.length) db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Action Required', title: `PTO conflicts with ${conflicts.length} scheduled day(s)`, body: `${fullName(byId(db.employees, x.employeeId))} — Dispatch must pick a replacement (nobody was moved automatically).`, mandatory: true, roles: ['dispatch', 'ops'], ref: { type: 'employee', id: x.employeeId }, read: false })
      }
    })
  },
  addHrRecord(r: Omit<T.HrRecord, 'id'>) { S().commit(`Added ${r.kind}`, emp(S().db, r.employeeId), r.title, db => { db.hrRecords.unshift({ ...r, id: uid('hr') }) }) },
  setSupervisor(empId: string, supId: string | undefined) {
    const db0 = S().db
    S().commit('Field allocation change', emp(db0, empId), supId ? `→ team ${emp(db0, supId)}` : 'Returned to unassigned pool', db => { byId(db.employees, empId)!.supervisorId = supId })
  },
  updateEmployee(id: string, patch: Partial<T.Employee>, what = 'Updated employee') { S().commit(what, emp(S().db, id), Object.keys(patch).join(', '), db => { Object.assign(byId(db.employees, id)!, patch) }) },
  /** dive2: separation — Inactive, off every job after the last day, off the supervisor's team, field sign-in blocked (FieldApp checks status). */
  terminateEmployee(id: string, t: { lastDay: string; reason: string; rehire: boolean }) {
    const e0 = byId(S().db.employees, id)!; const by = S().session?.name ?? 'HR'
    const cut = t.lastDay < today() ? today() : addDays(t.lastDay, 1)
    const n = S().db.assignments.filter(a => a.employeeId === id && a.date >= cut).length
    S().commit('Separated employee', emp(S().db, id), `last day ${t.lastDay} · ${t.reason} · rehire ${t.rehire ? 'yes' : 'no'} · removed from ${n} scheduled day(s)`, db => {
      // dive3 F5: a future last day keeps them working (and clocking in) through that day; the lock-out runs the day after
      const e = byId(db.employees, id)!; e.term = { ...t, by, at: new Date().toISOString(), checklist: e.term?.checklist ?? {} }
      if (t.lastDay <= today()) { stopPunch(db, id, 'Clock stopped at separation — payroll to review'); e.status = 'Inactive'; e.supervisorId = undefined }
      db.assignments = db.assignments.filter(a => !(a.employeeId === id && a.date >= cut))
      if (n) db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Action Required', title: `${fullName(e0)} separated — ${n} scheduled day(s) need a replacement`, body: `Last day ${t.lastDay}. Removed from the dispatch board after that.`, mandatory: true, roles: ['dispatch', 'ops'], read: false })
    })
    return n
  },
  offboardStep(id: string, step: string, v: boolean) { S().commit('Offboarding step', emp(S().db, id), `${step}: ${v ? 'done' : 'open'}`, db => { const e = byId(db.employees, id)!; if (e.term) e.term.checklist = { ...(e.term.checklist ?? {}), [step]: v } }) },
  /** dive2: DER-only — not cleared for safety-sensitive work. Off future jobs + blocked on the board; the reason is never stored in the shared db. */
  ssHold(id: string, on: boolean) {
    const e0 = byId(S().db.employees, id); if (!e0) return 0
    const n = on ? S().db.assignments.filter(a => a.employeeId === id && a.date >= today()).length : 0
    S().commit('Restriction changed', emp(S().db, id), on ? `not available for dispatch · removed from ${n} scheduled day(s) · contact the DER` : 'available for dispatch again', db => {
      const e = byId(db.employees, id)!
      if (on) { stopPunch(db, id, 'Clock stopped when a work restriction was placed — supervisor to review'); e.ssHold = today(); db.assignments = db.assignments.filter(a => !(a.employeeId === id && a.date >= today())); db.absences = db.absences.filter(a => a.id !== 'abs-ss-' + id); db.absences.push({ id: 'abs-ss-' + id, employeeId: id, from: today(), to: '2099-12-31', kind: 'Unavailable', note: 'Not cleared — contact the DER' })
        db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Urgent', title: `${fullName(e0)} not available for safety-sensitive work`, body: n ? `Removed from ${n} scheduled day(s). Pick a replacement. Questions go to the DER.` : 'Do not dispatch. Questions go to the DER.', mandatory: true, roles: ['dispatch', 'ops'], read: false }) }
      else { delete e.ssHold; db.absences = db.absences.filter(a => a.id !== 'abs-ss-' + id) }
    })
    return n
  },

  // ----- AP / AR -----
  codeBillLine(billId: string, lineId: string, jobId: string, category: T.CostCategory) {
    const b = byId(S().db.bills, billId)!
    S().commit('Coded bill to job', b.billNo, `→ Job #${jobNo(S().db, jobId)} · ${category}`, db => { const x = byId(db.bills, billId)!; const l = x.lines.find(y => y.id === lineId)!; l.jobId = jobId; l.category = category; if (x.status === 'Needs Coding' && x.lines.every(y => y.jobId)) x.status = 'Pending Approval' })
  },
  setBillStatus(billId: string, status: T.VendorBill['status']) {
    const b = byId(S().db.bills, billId)!
    if (status === 'Approved' && !b.poId && b.lines.some(l => !l.jobId)) return { ok: false, reason: 'Every line must be coded to a job before approval.' }
    const se = S().session, amt = b.lines.reduce((t, l) => t + l.amount, 0)
    if (status === 'Approved' && amt > SELF_APPROVE_MAX && ((b.enteredById && b.enteredById === se?.employeeId) || (b.enteredBy && b.enteredBy === se?.name))) return { ok: false, reason: `You entered this bill — someone else has to approve bills over $${SELF_APPROVE_MAX.toLocaleString()}.` }
    S().commit(`Bill ${status.toLowerCase()}`, b.billNo, `${byId(S().db.vendors, b.vendorId)?.name}`, db => { const x = byId(db.bills, billId)!; x.status = status; if (status === 'Approved') x.approvedBy = S().session?.name; if (status === 'Paid') x.paidOn = today() })
    return { ok: true }
  },
  addBill(b: Omit<T.VendorBill, 'id'>) {
    const db0 = S().db
    const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()
    b = { ...b, billNo: b.billNo.trim().replace(/\s+/g, ' ') }
    if (!b.billNo) return { ok: false, reason: 'Bill # is required.' }
    const amt = b.lines.reduce((s, l) => s + l.amount, 0)
    if (b.lines.some(l => !Number.isFinite(l.amount) || l.amount <= 0)) return { ok: false, reason: 'Amount must be more than $0 (enter vendor credits as a credit, not a negative bill).' }
    if (amt > BILL_MAX) return { ok: false, reason: `Amount over $${BILL_MAX.toLocaleString()} — check the number.` }
    if (db0.bills.some(x => x.vendorId === b.vendorId && norm(x.billNo) === norm(b.billNo))) return { ok: false, reason: 'Duplicate — this vendor bill number is already entered.' }
    if (b.date && !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return { ok: false, reason: 'Bill date is not a date.' }
    if (b.due < b.date) return { ok: false, reason: 'Due date is before the bill date.' }
    b = { ...b, enteredBy: S().session?.name, enteredById: S().session?.employeeId }
    S().commit('Entered vendor bill', b.billNo, `${byId(db0.vendors, b.vendorId)?.name} · $${b.lines.reduce((s, l) => s + l.amount, 0).toLocaleString()}`, db => { db.bills.unshift({ ...b, id: uid('bill') }) })
    return { ok: true }
  },
  /** Default invoice lines for a job (day rate from signed tickets + mob/demob) — shown in the preview before anything is sent. */
  invoiceDraft(jobId: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!
    const tickets = db0.tickets.filter(t => t.jobId === jobId && (t.signerName || t.signedAt))
    // Bill what the customer signed: one day per distinct signed-ticket date (fallback to scheduled days only when nothing is signed).
    const signedDates = new Set(tickets.map(t => t.date))
    const signedDays = signedDates.size
    const days = signedDays || Math.min(diffDays(j.endDate, j.startDate) + 1, Math.max(1, diffDays(today(), j.startDate) + 1))
    return [{ description: `${j.craneId ? 'Crane & crew' : 'Crew & equipment'} day rate — ${days} days (${signedDays ? `${signedDays} signed ticket days` : 'no signed tickets — verify'})`, qty: days, rate: j.dayRate }, ...(j.quote.mobDemob ? [{ description: 'Mobilization / demobilization', qty: 1, rate: j.quote.mobDemob }] : []), ...customerExtraLines(j, undefined, signedDays ? signedDates : undefined)]
  },
  createInvoice(jobId: string, o?: { lines?: T.Invoice['lines']; customerPo?: string }) {
    const db0 = S().db
    const j = byId(db0.jobs, jobId)!
    if (db0.invoices.some(i => i.jobId === jobId && (i.lines[0]?.description.includes('day rate') || i.id.includes('_')))) return { ok: false, reason: `Job #${j.jobNo} already has an invoice.` }
    const lines = (o?.lines ?? actions.invoiceDraft(jobId)).filter(l => l.description.trim() && Number.isFinite(l.qty) && Number.isFinite(l.rate) && l.qty * l.rate !== 0)
    if (!lines.length) return { ok: false, reason: 'Add at least one line.' }
    const amount = Math.round(lines.reduce((s, l) => s + l.qty * l.rate, 0) * 100) / 100
    if (amount <= 0) return { ok: false, reason: 'Invoice total must be more than $0.' }
    const n = Math.max(...db0.invoices.map(i => Number(i.invNo.split('-')[1]))) + 1
    S().commit('Created invoice', `INV-${n}`, `Job #${j.jobNo} · $${amount.toLocaleString()}`, db => {
      db.invoices.unshift({ id: uid('inv'), invNo: `INV-${n}`, jobId, customerId: j.customerId, date: today(), due: addDays(today(), 30), lines, amount, paid: 0, status: 'Sent', collections: 'Current', payments: [], ...(o?.customerPo?.trim() ? { customerPo: o.customerPo.trim() } : {}) })
      const x = byId(db.jobs, jobId)!; x.invoiceNo = `INV-${n}`; x.stage = 'Invoiced'
    })
    return { ok: true, invNo: `INV-${n}` }
  },
  /** dive3 M4: what the job's extras come to now vs what its invoices already billed (per extra line, days ignored). */
  billChangeLines(jobId: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId); if (!j) return []
    const key = (d: string) => d.replace(/^(Supplemental|Credit memo) — /, '').replace(/ · \d+ days? from /, ' from ')
    const isX = (d: string) => /^(Supplemental — |Credit memo — )?(Added|Credit — removed) /.test(d)
    const billed = new Map<string, { amt: number; desc: string }>()
    for (const inv of db0.invoices.filter(i => i.jobId === jobId)) for (const l of inv.lines) if (isX(l.description)) { const k = key(l.description), b = billed.get(k) ?? { amt: 0, desc: l.description.replace(/^(Supplemental|Credit memo) — /, '') }; b.amt += l.qty * l.rate; billed.set(k, b) }
    const out: T.Invoice['lines'] = []
    const seen = new Set<string>()
    for (const l of customerExtraLines(j)) { const k = key(l.description); seen.add(k); const d = Math.round((l.qty * l.rate - (billed.get(k)?.amt ?? 0)) * 100) / 100; if (Math.abs(d) >= 0.01) out.push({ description: `${d > 0 ? 'Supplemental' : 'Credit memo'} — ${l.description}`, qty: 1, rate: d }) }
    for (const [k, b] of billed) if (!seen.has(k) && Math.abs(b.amt) >= 0.01) out.push({ description: `${b.amt > 0 ? 'Credit memo' : 'Supplemental'} — ${b.desc} (no longer on the job)`, qty: 1, rate: -Math.round(b.amt * 100) / 100 })
    return out
  },
  /** dive3 M4: "Bill this change" — a supplemental invoice (net more) or a credit memo applied to the job's open invoice (net less). */
  billChange(jobId: string): { ok: boolean; reason?: string; invNo?: string; amount?: number; onAccount?: number } {
    const role = S().session?.role; if (!role || !['owner', 'accounting'].includes(role)) return { ok: false, reason: 'Only accounting or the owner can bill a change.' }
    const db0 = S().db; const j = byId(db0.jobs, jobId); if (!j) return { ok: false, reason: 'Job not found' }
    const invs = db0.invoices.filter(i => i.jobId === jobId); if (!invs.length) return { ok: false, reason: 'Not invoiced yet — the change goes on the first invoice.' }
    const lines = actions.billChangeLines(jobId)
    const amount = Math.round(lines.reduce((s, l) => s + l.qty * l.rate, 0) * 100) / 100
    const n = Math.max(...db0.invoices.map(i => Number(i.invNo.split('-')[1]) || 0)) + 1, invNo = `INV-${n}`
    const markDone = (db: T.DB, on?: string) => { for (const r of db.billingReview ?? []) if (r.jobId === jobId && r.status === 'Open' && r.flags.includes('invoiced')) { r.status = 'Reviewed'; r.reviewedBy = S().session?.name; if (on) r.billedOn = on } }
    if (!lines.length || Math.abs(amount) < 0.01) { S().commit('Reviewed billing change', `Job #${j.jobNo}`, 'Nothing left to bill', db => markDone(db)); return { ok: true, amount: 0 } }
    const orig = invs.find(i => i.invNo === j.invoiceNo) ?? invs[invs.length - 1]
    if (amount > 0) {
      S().commit('Created supplemental invoice', invNo, `Job #${j.jobNo} · $${amount.toLocaleString()} · changes after ${orig.invNo}`, db => {
        db.invoices.unshift({ id: uid('inv'), invNo, jobId, customerId: j.customerId, date: today(), due: addDays(today(), 30), lines, amount, paid: 0, status: 'Sent', collections: 'Current', payments: [], kind: 'Supplemental', ofInvNo: orig.invNo, ...(orig.customerPo ? { customerPo: orig.customerPo } : {}) })
        markDone(db, invNo)
      })
      return { ok: true, invNo, amount }
    }
    const credit = -amount; const target = invs.find(i => i.amount - i.paid > 0.005 && !i.kind) ?? invs.find(i => i.amount - i.paid > 0.005)
    const applied = target ? Math.min(credit, Math.round((target.amount - target.paid) * 100) / 100) : 0
    S().commit('Created credit memo', invNo, `Job #${j.jobNo} · −$${credit.toLocaleString()}${target && applied ? ` · applied to ${target.invNo}` : ' · credit on account'}`, db => {
      db.invoices.unshift({ id: uid('inv'), invNo, jobId, customerId: j.customerId, date: today(), due: today(), lines, amount, paid: -applied, status: applied >= credit - 0.005 ? 'Paid' : 'Sent', collections: applied >= credit - 0.005 ? 'Paid' : 'Current', payments: [], kind: 'Credit', ofInvNo: target?.invNo ?? orig.invNo })
      if (target && applied > 0) { const x = byId(db.invoices, target.id)!; x.payments.push({ date: today(), amount: applied, method: 'Credit memo', ref: invNo }); x.paid = Math.round((x.paid + applied) * 100) / 100; x.status = x.paid >= x.amount - 0.005 ? 'Paid' : 'Partial'; if (x.status === 'Paid') x.collections = 'Paid' }
      markDone(db, invNo)
    })
    return { ok: true, invNo, amount, onAccount: Math.round((credit - applied) * 100) / 100 }
  },
  recordPayment(invId: string, amount: number, method: string, ref: string, date: string = today()) {
    const i = byId(S().db.invoices, invId)!
    const refKey = ref.trim().toLowerCase()
    if (refKey && i.payments.some(p => p.method === method && p.ref.trim().toLowerCase() === refKey)) return
    const open = Math.round((i.amount - i.paid) * 100) / 100
    amount = Math.round(Math.min(amount, open) * 100) / 100
    if (!(amount > 0)) return
    S().commit('Recorded payment', i.invNo, `$${amount.toLocaleString()} ${method} ${ref}`, db => {
      const x = byId(db.invoices, invId)!
      x.payments.push({ date, amount, method, ref })
      x.paid = Math.round(Math.min(x.amount, x.payments.reduce((s, q) => s + q.amount, 0)) * 100) / 100
      x.status = x.paid >= x.amount - 0.005 ? 'Paid' : 'Partial'; if (x.status === 'Paid') { x.paid = x.amount; x.collections = 'Paid'; const j = byId(db.jobs, x.jobId); if (j && j.invoiceNo === x.invNo) j.stage = 'Paid' }
    })
  },
  undoPayment(invId: string, idx: number) {
    const i = byId(S().db.invoices, invId)!; const p = i.payments[idx]; if (!p) return
    S().commit('Undid payment', i.invNo, `−$${p.amount.toLocaleString()} ${p.method} ${p.ref}`, db => {
      const x = byId(db.invoices, invId)!; x.payments.splice(idx, 1); x.paid = Math.max(0, Math.round(x.payments.reduce((s, q) => s + q.amount, 0) * 100) / 100)
      x.status = x.paid >= x.amount - 0.005 ? 'Paid' : x.paid > 0 ? 'Partial' : x.due < today() ? 'Overdue' : 'Sent'
      if (x.status === 'Paid') x.paid = x.amount
      if (x.status !== 'Paid') { if (x.collections === 'Paid') x.collections = 'Current'; const j = byId(db.jobs, x.jobId); if (j && j.invoiceNo === x.invNo && j.stage === 'Paid') j.stage = 'Invoiced' }
    })
  },
  payBill(billId: string, p: { amount: number; date: string; method: string; ref: string }) {
    const b = byId(S().db.bills, billId)!; const tot = Math.round(b.lines.reduce((s, l) => s + l.amount, 0) * 100) / 100; const paid = Math.round((b.payments ?? []).reduce((s, q) => s + q.amount, 0) * 100) / 100
    const refKey = p.ref.trim().toLowerCase()
    if (refKey && (b.payments ?? []).some(q => q.method === p.method && q.ref.trim().toLowerCase() === refKey)) return { ok: false, reason: 'That reference is already on this bill.' }
    const amount = Math.round(Math.min(p.amount, tot - paid) * 100) / 100
    if (!(amount > 0)) return { ok: false, reason: 'Nothing left to pay' }
    S().commit('Paid bill', b.billNo, `$${amount.toLocaleString()} ${p.method} ${p.ref}${amount < tot - paid - 0.005 ? ' (partial)' : ''}`, db => {
      const x = byId(db.bills, billId)!; x.payments = [...(x.payments ?? []), { id: uid('bp'), ...p, amount, by: S().session?.name }]
      if (x.payments.reduce((s, q) => s + q.amount, 0) >= tot - 0.005) { x.status = 'Paid'; x.paidOn = p.date }
    })
    return { ok: true }
  },
  undoBillPayment(billId: string, idx: number) {
    const b = byId(S().db.bills, billId)!; const p = (b.payments ?? [])[idx]; if (!p) return
    S().commit('Undid bill payment', b.billNo, `−$${p.amount.toLocaleString()} ${p.method} ${p.ref}`, db => {
      const x = byId(db.bills, billId)!; x.payments = (x.payments ?? []).filter((_, i) => i !== idx); if (x.status === 'Paid') { x.status = 'Approved'; x.paidOn = undefined }
    })
  },
  setCollections(invId: string, c: T.Invoice['collections']) { S().commit('Collections status', byId(S().db.invoices, invId)!.invNo, c, db => { byId(db.invoices, invId)!.collections = c }) },
  addCost(c: Omit<T.JobCost, 'id'>) {
    const amount = Math.round(Number(c.amount) * 100) / 100
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false as const, reason: 'Amount must be more than $0.' }
    if (amount > BILL_MAX) return { ok: false as const, reason: `Amount over $${BILL_MAX.toLocaleString()} — check the number.` }
    S().commit('Posted job cost', `Job #${jobNo(S().db, c.jobId)}`, `${c.category} $${amount.toLocaleString()}`, db => { db.costs.push({ ...c, amount, id: uid('co') }) })
    return { ok: true as const }
  },

  // ----- configs -----
  saveConfig(c: T.CraneConfig) { S().commit('Saved crane configuration', byId(S().db.equipment, c.craneId)!.unit, c.name, db => { db.configs = db.configs.filter(x => x.id !== c.id); db.configs.push(c) }) },
  deleteConfig(id: string) { S().commit('Deleted crane configuration', 'Config', byId(S().db.configs, id)?.name ?? id, db => { db.configs = db.configs.filter(x => x.id !== id) }) },
  applyConfig(jobId: string, configId: string) {
    const db0 = S().db
    const j = byId(db0.jobs, jobId)!; const c = byId(db0.configs, configId)!
    const same = db0.jobs.filter(x => x.craneId === j.craneId && x.jobNo === j.jobNo)
    S().commit('Applied crane configuration', `Job #${j.jobNo}`, `${c.name} · ${c.trailerIds.length} trailers → ${same.length} matching record(s), all days`, db => { db.jobs.forEach(x => { if (x.craneId === j.craneId && x.jobNo === j.jobNo) { x.configId = configId; x.trailerIds = [...c.trailerIds] } }) })
  },

  // ----- misc -----
  /** Trucks & trailers on a job (dispatch). A conflict (unit busy or down) is allowed but recorded in the audit line. */
  setJobUnits(jobId: string, ids: string[], conflict?: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!; const unit = (id: string) => byId(db0.equipment, id)?.unit ?? id
    const add = ids.filter(x => !j.trailerIds.includes(x)), rm = j.trailerIds.filter(x => !ids.includes(x))
    S().commit('Updated trucks & trailers', `Job #${j.jobNo}`, [add.length ? `added ${add.map(unit).join(', ')}` : '', rm.length ? `removed ${rm.map(unit).join(', ')}` : '', conflict ? `⚠ ${conflict}` : ''].filter(Boolean).join(' · '), db => { byId(db.jobs, jobId)!.trailerIds = [...new Set(ids)]
      // the driver assigned to a truck / pickup hears about it
      add.forEach(id => { const u = byId(db.equipment, id); if (u?.assignedTo) crewNote(db, u.assignedTo, `Your ${u.category.toLowerCase()} ${u.unit} is on Job #${j.jobNo}`, `${jobLine(db, j)} · ${dayLabel(j.startDate)} → ${dayLabel(j.endDate)}`, jobId) }) })
  },
  setRigPlan(jobId: string, plan: T.RigPlan, warn?: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!; const unit = byId(db0.equipment, plan.craneId)?.unit ?? plan.craneId
    const had = (j.rig ?? []).some(p => p.craneId === plan.craneId)
    const up = plan.upMode === 'dates' ? `${(plan.upDates ?? []).length} rig-up date(s)` : `${plan.upDays} rig-up day(s)`
    const down = plan.downUnit === 'h' ? `${plan.downAmount} h` : `${plan.downAmount} d`
    S().commit(had ? 'Updated rig plan' : 'Added rig plan', `Job #${j.jobNo} · Crane ${unit}`, [`hook ready ${plan.hookReady}`, `${plan.travelDays} travel day(s)`, up, `rig-down ${plan.downStart} ${down}`, warn ? `⚠ ${warn}` : ''].filter(Boolean).join(' · '), db => {
      const jj = byId(db.jobs, jobId)!; jj.rig = [...(jj.rig ?? []).filter(p => p.craneId !== plan.craneId), plan]
      notifyJobCrew(db, jobId, `Rig schedule ${had ? 'changed' : 'set'}: Job #${j.jobNo} · Crane ${unit}`, `Start moving in by ${dayLabel(addDaysIso(plan.upMode === 'dates' ? [...(plan.upDates ?? [plan.hookReady])].sort()[0] : addDaysIso(plan.hookReady, -plan.upDays), -plan.travelDays))} · Hook ready ${dayLabel(plan.hookReady)} · rig down ${dayLabel(plan.downStart)} (${down})`)
    })
  },
  addJobCrane(jobId: string, craneId: string, conflict?: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!
    { const u = byId(db0.equipment, craneId); if (u && (u.status === 'Maintenance' || u.status === 'Out of Service')) return; if (u && annualExpired(u)) return } // dive3 M1 + shop M7: down or past-annual cranes can't be added
    S().commit('Added crane to job', `Job #${j.jobNo}`, [`crane ${byId(db0.equipment, craneId)?.unit ?? craneId}`, conflict ? `⚠ ${conflict}` : ''].filter(Boolean).join(' · '), db => { const jj = byId(db.jobs, jobId)!; if (!jj.craneId) jj.craneId = craneId; else if (jj.craneId !== craneId) jj.craneIds = [...new Set([...(jj.craneIds ?? []), craneId])]
      notifyJobCrew(db, jobId, `Job #${j.jobNo}: crane ${byId(db0.equipment, craneId)?.unit ?? ''} added`, 'Dispatch added this crane to the job — check the rig days.') }) // dive3 M14
  },
  removeJobCrane(jobId: string, craneId: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!
    const snap = { craneIds: j.craneIds, rig: j.rig, craneHours: j.craneHours } // dive3 M9: kept for Undo
    S().commit('Removed crane from job', `Job #${j.jobNo}`, `crane ${byId(db0.equipment, craneId)?.unit ?? craneId}`, db => { const jj = byId(db.jobs, jobId)!; jj.craneIds = (jj.craneIds ?? []).filter(x => x !== craneId); jj.rig = (jj.rig ?? []).filter(p => p.craneId !== craneId); if (jj.craneHours?.[craneId]) { const { [craneId]: _x, ...rest } = jj.craneHours; void _x; jj.craneHours = rest }
      notifyJobCrew(db, jobId, `Job #${j.jobNo}: crane ${byId(db0.equipment, craneId)?.unit ?? ''} removed`, 'Dispatch took this crane off the job.') })
    return snap
  },
  restoreJobCranes(jobId: string, snap: { craneIds?: string[]; rig?: T.RigPlan[]; craneHours?: T.Job['craneHours'] }) {
    const j = byId(S().db.jobs, jobId); if (!j) return
    S().commit('Undid crane removal', `Job #${j.jobNo}`, 'crane and rig plan restored', db => { const jj = byId(db.jobs, jobId)!; jj.craneIds = snap.craneIds; jj.rig = snap.rig; jj.craneHours = snap.craneHours })
  },
  setUnitDays(jobId: string, unitId: string, days: { from: string; to: string } | null) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!; const u = byId(db0.equipment, unitId)
    S().commit('Set unit days', `Job #${j.jobNo} · ${u?.category ?? ''} ${u?.unit ?? unitId}`, days ? `${days.from} → ${days.to}` : 'whole job', db => { const jj = byId(db.jobs, jobId)!; const m = { ...(jj.unitDays ?? {}) }; if (days) m[unitId] = days; else delete m[unitId]; jj.unitDays = m })
  },
  setCraneHours(jobId: string, craneId: string, hours: { from: string; to: string } | null, note?: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!
    S().commit('Set crane hours', `Job #${j.jobNo} · Crane ${byId(db0.equipment, craneId)?.unit ?? craneId}`, [hours ? `${hours.from}–${hours.to}` : 'all day', note ? `⚠ ${note}` : ''].filter(Boolean).join(' · '), db => { const jj = byId(db.jobs, jobId)!; const m = { ...(jj.craneHours ?? {}) }; if (hours) m[craneId] = hours; else delete m[craneId]; jj.craneHours = m
      notifyJobCrew(db, jobId, `Crane hours changed: Job #${j.jobNo}`, `Crane ${byId(db0.equipment, craneId)?.unit ?? ''} on this job: ${hours ? `${hours.from}–${hours.to}` : 'all day'}`) })
  },
  saveCraneVendor(v: T.CraneVendor) {
    const had = (S().db.craneVendors ?? []).some(x => x.id === v.id)
    S().commit(had ? 'Updated crane vendor' : 'Added crane vendor', v.name, [v.contact, v.phone].filter(Boolean).join(' · '), db => { db.craneVendors = [...(db.craneVendors ?? []).filter(x => x.id !== v.id), v] })
  },
  saveOutsideCrane(jobId: string, oc: T.OutsideCrane) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!; const had = (j.outside ?? []).some(x => x.id === oc.id); const vn = (db0.craneVendors ?? []).find(v => v.id === oc.vendorId)?.name ?? 'Vendor'
    S().commit(had ? 'Updated outside crane' : 'Added outside crane', `Job #${j.jobNo} · ${vn} ${oc.size}`, [oc.role, `${oc.from} → ${oc.to}`, oc.hours ? `${oc.hours.from}–${oc.hours.to}` : '', oc.status].filter(Boolean).join(' · '), db => { const jj = byId(db.jobs, jobId)!; jj.outside = [...(jj.outside ?? []).filter(x => x.id !== oc.id), oc]
      notifyJobCrew(db, jobId, `Job #${j.jobNo}: outside ${oc.size} ${had ? 'changed' : 'hired'}`, `${vn} · ${oc.role} · ${oc.from} → ${oc.to}${oc.hours ? ` · ${oc.hours.from}–${oc.hours.to}` : ''}`) }) // dive3 M14
  },
  removeOutsideCrane(jobId: string, id: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!; const oc = (j.outside ?? []).find(x => x.id === id)
    S().commit('Removed outside crane', `Job #${j.jobNo}`, oc ? `${(db0.craneVendors ?? []).find(v => v.id === oc.vendorId)?.name ?? ''} ${oc.size} · ${oc.role}` : id, db => { const jj = byId(db.jobs, jobId)!; jj.outside = (jj.outside ?? []).filter(x => x.id !== id); if (oc) notifyJobCrew(db, jobId, `Job #${j.jobNo}: outside ${oc.size} cancelled`, 'Dispatch removed the hired crane from this job.') })
  },
  removeRigPlan(jobId: string, craneId: string) {
    const db0 = S().db; const j = byId(db0.jobs, jobId)!
    S().commit('Removed rig plan', `Job #${j.jobNo} · Crane ${byId(db0.equipment, craneId)?.unit ?? craneId}`, '', db => { const jj = byId(db.jobs, jobId)!; jj.rig = (jj.rig ?? []).filter(p => p.craneId !== craneId) })
  },
  markRead(id: string) { S().commit('Read notification', 'Notice', id, db => { const n = byId(db.notices, id); if (n) n.read = true }, { silent: true }) },
  updateContact(c: T.Contact) { S().commit('Updated company contact', c.label, c.phone, db => { db.contacts = db.contacts.map(x => (x.id === c.id ? c : x)); if (!db.contacts.some(x => x.id === c.id)) db.contacts.push(c) }) },
  removeContact(id: string) { S().commit('Removed company contact', 'Contact', id, db => { db.contacts = db.contacts.filter(x => x.id !== id) }) },
  addDivision(d: T.Division) { S().commit('Added division', d.name, d.short, db => { db.divisions.push(d) }) },
  /** dive3 M9: quote a brand-new customer / site straight from the Job Builder. */
  addCustomer(c: { name: string; contact?: string; phone?: string; industry?: string }) {
    const name = c.name.trim().slice(0, 80); if (name.length < 2) return { ok: false as const, reason: 'Customer name is required' }
    const dup = S().db.customers.find(x => x.name.trim().toLowerCase() === name.toLowerCase()); if (dup) return { ok: true as const, id: dup.id, existed: true }
    const id = uid('cust'); S().commit('Added customer', name, [c.contact, c.phone].filter(Boolean).join(' · ') || 'new customer', db => { db.customers.push({ id, name, contact: c.contact?.trim() ?? '', phone: c.phone?.trim() ?? '', industry: c.industry?.trim() || 'Industrial' }) })
    return { ok: true as const, id, existed: false }
  },
  addSite(x: { name: string; city: string; state: string }) {
    const name = x.name.trim().slice(0, 80), st = x.state.trim().toUpperCase().slice(0, 2); if (name.length < 2) return { ok: false as const, reason: 'Site name is required' }
    if (!/^[A-Z]{2}$/.test(st)) return { ok: false as const, reason: 'State: 2 letters, e.g. OK' }
    const db0 = S().db, near = db0.branches.find(b => b.state === st) ?? db0.branches.find(b => b.hq) ?? db0.branches[0]
    const id = uid('site'); S().commit('Added site', name, `${x.city.trim()}, ${st}`, db => { db.sites.push({ id, name, city: x.city.trim(), state: st, lat: near.lat, lng: near.lng }) })
    return { ok: true as const, id }
  },
  ensureWindSite(f: { id: string; name: string; st: string; county: string; lat: number; lng: number }): string {
    const ex = S().db.sites.find(x => x.windFarmId === f.id); if (ex) return ex.id
    const id = uid('site'); S().commit('Added wind farm site', f.name, `${f.county}, ${f.st}`, db => { db.sites.push({ id, name: /wind/i.test(f.name) ? f.name : `${f.name} Wind`, city: `${f.county} Co.`, state: f.st, lat: f.lat, lng: f.lng, windFarmId: f.id, gate: db.windSites?.[f.id]?.gate }) }); return id
  },
  windSite(farmId: string, name: string, patch: Partial<T.WindSite>, what = 'Updated wind farm notes') { S().commit(what, name, Object.keys(patch).join(', '), db => { db.windSites ??= {}; const cur = db.windSites[farmId] ?? { farmId, pins: [], labels: {} }; db.windSites[farmId] = { ...cur, ...patch, updatedAt: new Date().toISOString(), updatedBy: S().session?.name } }) },
  addSitePin(farmId: string, name: string, pin: Omit<T.SitePin, 'id'>) { S().commit('Dropped site pin', name, `${pin.kind}: ${pin.label}`, db => { db.windSites ??= {}; const cur = db.windSites[farmId] ?? { farmId, pins: [], labels: {} }; cur.pins = [...cur.pins, { ...pin, id: uid('pin'), by: S().session?.name, at: new Date().toISOString() }]; db.windSites[farmId] = cur }) },
  moveSitePin(farmId: string, pinId: string, patch: Partial<T.SitePin>) { S().commit('Edited site pin', farmId, Object.keys(patch).join(', '), db => { const p = db.windSites?.[farmId]?.pins.find(x => x.id === pinId); if (p) Object.assign(p, patch, { demo: false }) }) },
  removeSitePin(farmId: string, pinId: string) { S().commit('Removed site pin', farmId, pinId, db => { const w = db.windSites?.[farmId]; if (w) w.pins = w.pins.filter(x => x.id !== pinId) }) },
  labelTurbine(farmId: string, caseId: number, label: string) { S().commit('Labeled turbine', `USWTDB ${caseId}`, label, db => { db.windSites ??= {}; const cur = db.windSites[farmId] ?? { farmId, pins: [], labels: {} }; cur.labels = { ...cur.labels, [String(caseId)]: label }; db.windSites[farmId] = cur; db.jobs.forEach(j => j.turbines?.forEach(t => { if (t.caseId === caseId) t.label = label })) }) },
  setJobTurbines(jobId: string, farmId: string | undefined, turbines: T.JobTurbine[]) { S().commit('Attached turbines', `Job #${jobNo(S().db, jobId)}`, turbines.map(t => t.label ?? t.caseId).join(', ') || 'none', db => { const j = byId(db.jobs, jobId)!; j.windFarmId = farmId; j.turbines = turbines }) },
  addBranch(b: T.Branch) { S().commit('Added branch', b.code, b.city, db => { db.branches.push(b) }) },
}

// Test hook: lets automated QA (scripts/link-scan) read entity names. Read-only usage.
// test hooks: dev / e2e builds, or ?qa=1 (store-level guest guards still apply)
// dive3 M1: console/test hooks only in dev and E2E test builds — never in production (?qa no longer turns them on)
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') {
  ;(window as unknown as { __sc?: typeof useStore }).__sc = useStore
  ;(window as unknown as { __store: typeof useStore }).__store = useStore
}
if (import.meta.env.DEV || import.meta.env.VITE_E2E === '1') (window as unknown as { __actions: typeof actions }).__actions = actions // e2e hook (like __store)
