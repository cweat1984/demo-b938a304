import { companyOf } from '../data/brand'
import { useEffect, useLayoutEffect, useState } from 'react'
import { Clock, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../data/store'
import { setGuestScope, setGuestView } from '../data/roles'
import { guardGuestWrites, scrubDb } from './guard'
import { verifyPass, setGuestLock, guestContext, urlHasSiteKey, GUEST_ONLY, GUEST_KEY, LOCK_KEY, type GuestClaims } from './pass'
import { fullSeed } from '../data/seed'

/** Writes a guest may make: suggestions and design notes. Everything else is read-only. */
const GUEST_OK = /^(Signed in|Suggestion|Suggest|Feedback|Design note|Note|Upvote|Comment)/i
let wrapped = false
/** Success toasts a guest may still see (they describe something that really happened). */
const GUEST_TOAST_OK = /copied|suggest|thank|note|feedback|signed in|vote|comment|link/i
const VIEW_ONLY = () => toast('View-only demo', { id: 'guest-ro', description: 'Nothing was changed. Guests can leave suggestions and design notes from the side tabs.' })
function readOnly() {
  if (wrapped) return; wrapped = true
  document.documentElement.dataset.guest = '1'
  // side stores (permits, pickups, tickets, site library, moves…) and localStorage: undo + never save guest edits
  void guardGuestWrites(() => useStore.getState().session?.role === 'guest' || guestContext(), VIEW_ONLY)
  // a blocked action must never also claim success: swap guest success toasts for one "View-only demo" notice
  const t = toast as unknown as Record<string, (m: unknown, o?: unknown) => unknown>
  for (const k of ['success', 'info', 'message']) {
    const orig = t[k]; if (typeof orig !== 'function') continue
    t[k] = (m: unknown, o?: unknown) => ((useStore.getState().session?.role === 'guest' || guestContext()) && !GUEST_TOAST_OK.test(String(m)) ? VIEW_ONLY() : orig(m, o))
  }
  const orig = useStore.getState().commit
  useStore.setState({ commit: ((a: string, e: string, d: string, r: never, o: never) => {
    if ((useStore.getState().session?.role === 'guest' || guestContext()) && !GUEST_OK.test(a)) { VIEW_ONLY(); return }
    orig(a, e, d, r, o)
  }) as typeof orig })
}
const lock = (c?: GuestClaims) => { localStorage.setItem(LOCK_KEY, JSON.stringify({ at: Date.now(), n: c?.n ?? '' })); delete document.documentElement.dataset.guest; sessionStorage.removeItem(GUEST_KEY); const s = useStore.getState(); if (s.session?.role === 'guest') s.signOut() }

/** Bootstraps ?guest= links, shows the countdown, and enforces expiry on load, on every route change and by a 1-second timer. */
export default function GuestLayer() {
  const ready = useStore(s => s.ready), session = useStore(s => s.session)
  const [claims, setClaims] = useState<GuestClaims | null>(null)
  const [locked, setLocked] = useState<{ n: string; why: string } | null>(() => { try { const v = JSON.parse(localStorage.getItem(LOCK_KEY) || 'null'); return v ? { n: v.n, why: 'expired' } : null } catch { return null } })
  const [now, setNow] = useState(Date.now())
  // on load: a ?guest= link, or a restored guest session
  useEffect(() => {
    if (!ready) return
    const qs = new URLSearchParams(location.search), fresh = qs.get('guest')
    const tok = fresh || sessionStorage.getItem(GUEST_KEY)
    const isGuest = useStore.getState().session?.role === 'guest'
    // the site key in the #fragment without a guest token = someone trimmed a guest link to get in as staff → refuse
    // dive3 B1: the site key in the address (#… or ?staticrypt_pwd= / ?remember_me) without a guest token = a trimmed or
    // edited guest link → refuse. A key in the query string is refused even with a token (StatiCrypt links use # only).
    if ((!tok && urlHasSiteKey()) || /staticrypt_pwd=|remember_me/.test(location.search)) { setGuestLock(); try { localStorage.removeItem('staticrypt_passphrase'); localStorage.removeItem('staticrypt_expiration') } catch { /* */ } lock(); setLocked({ n: '', why: 'bad' }); return }
    if (!tok) { if (isGuest || GUEST_ONLY) { lock(); setLocked({ n: '', why: GUEST_ONLY && !isGuest ? 'none' : 'expired' }) } return }
    verifyPass(tok).then(r => {
      if (fresh) { qs.delete('guest'); history.replaceState(null, '', `${location.pathname}${qs.toString() ? '?' + qs : ''}${location.hash.includes('staticrypt') ? '' : location.hash}`) }
      if (!r.ok) { if (r.why === 'moved') setGuestLock(); lock(r.c); setLocked({ n: r.c?.n ?? '', why: r.why }); return }
      localStorage.removeItem(LOCK_KEY); setLocked(null)
      setGuestScope(r.c.s); setGuestView(useStore.getState().session?.role === 'guest' ? useStore.getState().session?.view : null)
      sessionStorage.setItem(GUEST_KEY, tok); setGuestLock(); readOnly(); setClaims(r.c)
      const st = useStore.getState()
      if (st.session?.role !== 'guest') st.signIn('guest', 'Guest pass')
      useStore.setState(s => ({ session: s.session ? { ...s.session, name: r.c.n } : s.session, db: scrubDb(s.db as never, r.c.s) }))
      sessionStorage.setItem('sc-session', JSON.stringify(useStore.getState().session))
      // guest-only build: an "Everything" pass carries the key to the money dataset (other passes can't open it)
      if (r.c.s === 'all' && r.c.k) void fullSeed(r.c.k).then(full => { if (full) useStore.setState({ db: scrubDb(full as never, 'all') }) })
    })
  }, [ready])
  // timer + each route change
  useEffect(() => {
    if (!claims) return
    const check = () => { setNow(Date.now()); if (Date.now() >= claims.e) { lock(claims); setClaims(null); setLocked({ n: claims.n, why: 'expired' }) } }
    // revoked passes: re-check the published list every 3 minutes (guest-only build)
    const recheck = () => { const tok = sessionStorage.getItem(GUEST_KEY); if (tok) void verifyPass(tok).then(r => { if (!r.ok) { lock(claims); setClaims(null); setLocked({ n: claims.n, why: r.why }) } }) }
    const t = setInterval(check, 1000), rv = GUEST_ONLY ? setInterval(recheck, 18e4) : 0; window.addEventListener('hashchange', check); check()
    return () => { clearInterval(t); if (rv) clearInterval(rv); window.removeEventListener('hashchange', check) }
  }, [claims])
  useLayoutEffect(() => {
    if (!locked) return
    const lockEl = document.querySelector('[data-testid=guest-locked]')
    const touched: HTMLElement[] = []
    const mark = (el: Element) => {
      for (const child of [...el.children]) {
        if (!(child instanceof HTMLElement)) continue
        if (lockEl && child === lockEl) continue
        if (lockEl && child.contains(lockEl)) { mark(child); continue }
        child.inert = true
        touched.push(child)
      }
    }
    mark(document.body)
    return () => { for (const el of touched) el.inert = false }
  }, [locked])
  if (locked) return <div className="fixed inset-0 z-[300] bg-bg grid place-items-center p-6" data-testid="guest-locked"><div className="max-w-md text-center"><div className="size-14 rounded-2xl bg-surface-2 grid place-items-center mx-auto"><Lock className="size-6 text-muted" /></div>
    <div className="display text-3xl font-semibold mt-4">{locked.why === 'revoked' ? 'This guest pass was turned off' : locked.why === 'bad' ? 'This link isn’t valid' : locked.why === 'moved' ? 'This guest link was replaced' : locked.why === 'none' ? 'This page opens from a guest link' : 'Your guest pass has ended'}</div>
    <div className="text-muted mt-2">{locked.n ? `Thanks for looking around, ${locked.n.split(' ')[0]}. ` : ''}Ask {companyOf().name} for a new link if you’d like more time.</div></div></div>
  if (!claims || session?.role !== 'guest') return null
  const left = Math.max(0, claims.e - now), hh = Math.floor(left / 36e5), mm = Math.floor(left % 36e5 / 6e4), ss = Math.floor(left % 6e4 / 1e3)
  // dive3 M3: from 640px up the countdown sits bottom-right (it used to cover the Switch role chip); it has nothing to tap
  return <div className="fixed max-sm:top-0 max-sm:inset-x-0 sm:bottom-3 sm:right-3 z-[90] pointer-events-none flex justify-center max-sm:pt-[env(safe-area-inset-top)] max-sm:bg-[#0b0d10]" data-testid="guest-banner">
    <div className={`pointer-events-none sm:rounded-full px-3.5 h-[22px] sm:h-8 text-[11px] sm:text-xs font-semibold inline-flex items-center gap-2 sm:shadow-lg max-sm:w-full max-sm:justify-center ${left < 6e5 ? 'bg-warn text-black' : 'bg-[#0b0d10] text-white sm:border border-white/15'}`}>
      <Clock className="size-3.5" />Guest pass · {claims.n} · view-only · <span className="tabular-nums" data-testid="guest-countdown">{hh > 0 ? `${hh}h ` : ''}{String(mm).padStart(2, '0')}m {String(ss).padStart(2, '0')}s</span> left</div></div>
}
