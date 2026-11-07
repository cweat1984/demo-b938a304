import { applyManifest } from './branding/manifest'
import { guestContext } from './guest/pass'
import GuestLayer from './guest/GuestLayer'
import { useEffect } from 'react'
import { useAppName, useCompany } from './data/brand'
import { Toaster, toast } from 'sonner'
import SyncDemo from './shell/SyncDemo'
import CustomerStatus from './shell/CustomerStatus'
import { CertSharePage } from './components/CertSend'
import { useStore, EMBED_ROLE, actions } from './data/store'
import { ConfirmHost } from './components/ui'
import Login from './shell/Login'
import Shell from './shell/Shell'
import FieldApp from './field/FieldApp'
import { GuestSwitchSheet, GuestHint } from './guest/GuestSwitch'
import Splash from './shell/Splash'
import FeedbackDock from './feedback/FeedbackDock'
import OfflineLayer from './batch5/OfflineLayer'
import Tour from './batch6/Tour'
import Portal from './launch2/Portal'
import Welcome from './launch2/Welcome'
import PhoneCapture from './batch3b/PhoneCapture'
import SignPage from './batch4/TextTicket'
import PhoneInspect from './batch4/PhoneInspect'
import { tokens, resolvePalette, applyTokens, resolveKey } from './data/themes'
import { useBranding, brandPalette } from './data/branding'
import { useSchedColors } from './data/schedColors'
import { userKey } from './nav/prefs'
import BrandBackground from './branding/BrandBackground'

function useTheme() {
  const prefs = useStore(s => s.prefs)
  const session = useStore(s => s.session)
  const brand = useBranding(s => s.b)
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const base = brandPalette(resolvePalette(prefs, matchMedia('(prefers-color-scheme: dark)').matches), brand)
      const mine = prefs.myColor?.[userKey(session)] // a person's own main color wins over the theme/company color on their screen
      const t = tokens(mine && /^#[0-9a-f]{6}$/i.test(mine) ? { ...base, primary: mine, accent: mine } : base)
      root.style.setProperty('--brand-primary', brand.primary); root.style.setProperty('--brand-accent', brand.accent); root.style.setProperty('--brand-secondary', brand.secondary ?? brand.primary)
      applyTokens(t, root, resolveKey(prefs, matchMedia('(prefers-color-scheme: dark)').matches))
      const dark = t.dark
      root.style.setProperty('--fs', { S: '14px', M: '15px', L: '16.5px', XL: '18px' }[prefs.fontSize])
      root.style.setProperty('--font-ui', prefs.font === 'Barlow' ? '"Barlow", system-ui, sans-serif' : prefs.font === 'System' ? 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' : '"Inter Variable", system-ui, sans-serif')
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', t.bg); void dark
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [prefs, brand, session])
  return prefs
}

export default function App() {
  const companyName = useCompany().name, appNm = useAppName()
  useEffect(() => { document.title = `${appNm} · ${companyName}`; applyManifest(appNm, companyName) }, [companyName, appNm])
  const ready = useStore(s => s.ready)
  const session = useStore(s => s.session)
  const init = useStore(s => s.init)
  const prefs = useTheme()
  useEffect(() => { init() }, [init])
  const companyColors = useStore(s => s.db?.company?.schedColors)
  useEffect(() => { useSchedColors.getState().adopt(companyColors) }, [companyColors]) // dive3 dispatch M7
  useEffect(() => {
    // live updates from another window (phone ↔ office): a small pulse so the room sees it happen
    if (!EMBED_ROLE && new URLSearchParams(location.search).has('sync')) return
    const on = (e: Event) => { const m = (e as CustomEvent).detail as { action: string; entity: string; detail: string; actor: string }; toast(`Live · ${m.actor}`, { description: `${m.action} — ${m.entity}${m.detail ? ` · ${m.detail}` : ''}`, duration: 5000 }) }
    window.addEventListener('southern-live', on); return () => window.removeEventListener('southern-live', on)
  }, [])
  // offline cert sends: flush the queue when signal returns
  useEffect(() => useStore.subscribe((s, p) => { if (s.ready && s.ui.online && (!p.ui.online || !p.ready)) { const n = actions.certFlushQueue(); if (n) toast.success(`Back online — ${n} queued cert packet${n === 1 ? '' : 's'} sent (demo)`) } }), [])
  useEffect(() => {
    const on = (e: Event) => { const d = (e as CustomEvent<{ jobId: string; n: number }>).detail; toast(`Job complete — ${d.n} item${d.n === 1 ? '' : 's'} still checked out`, { description: 'Return leftovers to credit the job', action: { label: 'Return leftovers', onClick: () => useStore.getState().open({ type: 'job', id: d.jobId }) }, duration: 9000 }) }
    window.addEventListener('inv-leftovers', on); return () => window.removeEventListener('inv-leftovers', on)
  }, [])
  useEffect(() => { const h = (e: Event) => toast.error(`${(e as CustomEvent).detail} is not cleared for work`, { description: 'Held after a post-accident / reasonable-suspicion test until a negative return-to-duty result. Contact the DER.' }); window.addEventListener('sc-held', h); return () => window.removeEventListener('sc-held', h) }, [])
  const dark = tokens(resolvePalette(prefs, matchMedia('(prefers-color-scheme: dark)').matches)).dark
  const gctx = guestContext() // a guest-pass browser never gets the side routes (portal, inspect, sync…): they skip the guest guard
  const statusNo = new URLSearchParams(location.search).get('status')
  const certTok = new URLSearchParams(location.search).get('certs')
  if (!gctx && certTok) return <><CertSharePage token={certTok} /><Toaster theme={dark ? 'dark' : 'light'} position="top-center" /></>
  const qs = new URLSearchParams(location.search)
  if (!gctx && qs.has('portal')) return <><Portal /><Toaster theme={dark ? 'dark' : 'light'} position="top-center" /></>
  if (!gctx && qs.get('sign')) return <><SignPage ticketId={qs.get('sign')!} /><Toaster theme={dark ? 'dark' : 'light'} position="top-center" /></>
  if (!gctx && ready && qs.has('inspect')) return <><PhoneInspect unitId={qs.get('inspect')!} /><Toaster theme={dark ? 'dark' : 'light'} position="top-center" offset="calc(env(safe-area-inset-top) + 12px)" /></>
  if (!gctx && ready && (qs.get('recon') || qs.get('sitedata'))) return <><PhoneCapture /><Toaster theme={dark ? 'dark' : 'light'} position="top-center" offset="calc(env(safe-area-inset-top) + 12px)" /></>
  if (!gctx && qs.get('welcome')) return <><Welcome hireId={qs.get('welcome')!} /><Toaster theme="dark" position="top-center" /></>
  if (!gctx && statusNo) return <><CustomerStatus jobNo={statusNo} /><Toaster theme={dark ? 'dark' : 'light'} position="top-center" /></>
  if (!gctx && !EMBED_ROLE && new URLSearchParams(location.search).has('sync')) return <><SyncDemo /><Toaster theme={dark ? 'dark' : 'light'} position="top-center" /></>
  return (
    <>
      {!ready ? <Splash /> : !session ? (import.meta.env.VITE_GUEST_ONLY ? <Splash /> : <Login />) : session.role === 'field' || (session.role === 'guest' && (session.view === 'field' || session.view === 'supervisor')) ? <FieldApp /> : <Shell />}
      {ready && session?.role === 'guest' && <><GuestSwitchSheet /><GuestHint /></>}
      <ConfirmHost />
      {ready && <BrandBackground />}
      {ready && session && <FeedbackDock />}
      {ready && <OfflineLayer />}
      {ready && !import.meta.env.VITE_GUEST_ONLY && <Tour />}
      <GuestLayer />
      <Toaster theme={dark ? 'dark' : 'light'} position="top-center" offset={session?.role === 'field' ? 'calc(env(safe-area-inset-top) + 12px)' : undefined} mobileOffset={{ top: session?.role === 'guest' ? 'calc(env(safe-area-inset-top) + 92px)' : session?.role === 'field' ? 'calc(env(safe-area-inset-top) + 12px)' : 'calc(env(safe-area-inset-top) + 72px)' }} richColors closeButton toastOptions={{ style: { borderRadius: 16 }, ...(session?.role === 'field' ? { duration: 2600 } : {}) }} />
    </>
  )
}
