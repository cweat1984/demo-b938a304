import { FlagMark } from '../components/Flag'
import { useAppName, useCompany } from '../data/brand'
import { useBranding, brandHot, customName } from '../data/branding'
import { useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, MonitorSmartphone, Fingerprint, ShieldCheck, WifiOff } from 'lucide-react'
import { useStore } from '../data/store'
import { ROLES } from '../data/roles'
import { ICONS } from '../components/icons'
import { Modal, DemoTag } from '../components/ui'
import { Logo } from './Splash'
import { PasskeyButton } from '../batch5/PasskeyLogin'
import { startTour } from '../batch6/tour'
import { Play } from 'lucide-react'
import { PoweredBy } from '../components/PoweredBy'
import { LOCK_KEY, clearGuestLock, guestDeviceLocked, urlHasSiteKey } from '../guest/pass'
import PinGate from '../guest/PinGate'
import { useEffect, useState as useS } from 'react'
import { jobsOn } from '../data/logic'
import { today } from '../lib/util'
import type { RoleKey } from '../data/types'

/** A browser that opened a guest pass never gets the staff role picker; staff can clear it, which asks for the site password again. */
function StaffClear() { useEffect(() => { clearGuestLock(); [LOCK_KEY, 'staticrypt_passphrase', 'staticrypt_expiration'].forEach(k => localStorage.removeItem(k)); sessionStorage.clear(); location.replace(location.pathname) }, []); return <div className="text-sm text-muted">Opening staff sign-in…</div> }
function GuestDevice() {
  const [pin, setPin] = useS(false)
  const staff = () => setPin(true)
  return <div className="min-h-screen grid place-items-center p-6 bg-bg" data-testid="guest-device"><div className="max-w-md text-center">
    <div className="mx-auto w-fit"><Logo size={44} /></div>
    <div className="display text-3xl font-semibold mt-4">This browser is using a guest pass</div>
    <div className="text-muted mt-2">Open the guest link you were sent to keep looking around, or ask for a new one.</div>
    {pin ? <div className="mt-6" data-testid="guest-device-pin"><div className="text-sm text-muted mb-3">Owner PIN required to turn this browser back into a staff browser.</div><PinGate><StaffClear /></PinGate></div> : <button onClick={staff} data-testid="guest-device-staff" className="mt-6 h-12 px-5 rounded-2xl bg-surface-2 font-semibold">Staff sign-in (owner PIN, then the site password)</button>}
    <div className="mt-6 flex justify-center"><PoweredBy size={13} /></div></div></div>
}

export default function Login() {
  // A trimmed guest link or a guest-locked browser never renders the staff role picker.
  // The lock overlay (GuestLayer) marks the page inert; this staff button stays clickable when that overlay is gone so the owner PIN can return the browser to staff sign-in.
  if (guestDeviceLocked() || sessionStorage.getItem('sc-guest') || urlHasSiteKey()) return <GuestDevice />
  return <LoginInner />
}
function LoginInner() {
  const company = useCompany(), appNm = useAppName()
  // dive3 M14: a re-branded company sees its own accent and wording, not Southern's red and wind-turbine hero
  const brand = useBranding(x => x.b), hot = brandHot(brand), renamed = customName(brand)
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'], w = (n: number) => words[n] ?? String(n)
  const signIn = useStore(s => s.signIn)
  const emps = useStore(s => s.db.employees)
  const db = useStore(s => s.db)
  const [mfa, setMfa] = useState<null | 'wait' | 'ok'>(null)
  const active = jobsOn(db, today()).length
  const cranes = db.equipment.filter(e => e.category === 'Crane').length
  const ms = () => { setMfa('wait'); setTimeout(() => setMfa('ok'), 1600); setTimeout(() => { setMfa(null); signIn('owner', 'Microsoft Entra ID (demo)') }, 2400) }
  return (
    <div className="dark min-h-full bg-[#07090c] text-white relative overflow-hidden">
      <div className="absolute inset-0 opacity-[.35] grid-bg [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]" />
      <div className="absolute inset-0 pointer-events-none">
        {!renamed && <img src={`${import.meta.env.BASE_URL}hero-wind.jpg`} alt="" className="h-full w-full object-cover object-[50%_42%] opacity-[.7] grayscale-[.35]" data-testid="login-hero" />}
        <div className="absolute inset-0 bg-gradient-to-r from-[#07090c]/95 via-[#07090c]/75 to-[#07090c]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090c] via-transparent to-[#07090c]/30" />
      </div>
      <div className="absolute top-0 inset-x-0 h-1.5 chevrons opacity-80" />
      <div className="absolute -top-40 -left-40 size-[620px] rounded-full opacity-[.10] blur-[120px]" style={{ background: hot }} />
      <div className="relative mx-auto max-w-7xl px-6 py-10 lg:py-16 grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center min-h-full">
        <div>
          <div className="flex items-center gap-3 mb-12"><Logo size={44} /><div><div className="display font-semibold text-lg leading-none">{appNm}</div><div className="text-xs text-white/50 mt-1 flex items-center gap-1.5">{company.name} <FlagMark width={16} /></div></div></div>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="display text-5xl md:text-7xl font-semibold leading-[.95] tracking-tight">
            One program.<br /><span style={{ color: hot }} data-testid="login-hot">The whole company.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="mt-6 text-lg text-white/60 max-w-lg leading-relaxed">
            Dispatch, cranes, trucks, crews, safety, shop, time, job costing, billing — {w(db.divisions.length)} {db.divisions.length === 1 ? 'division' : 'divisions'} and {w(db.branches.length)} {db.branches.length === 1 ? 'branch' : 'branches'}, live in one place.
          </motion.p>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-10 flex flex-wrap gap-8">
            {[[active, 'jobs running today'], [cranes, 'cranes tracked'], [db.employees.length, 'people'], [db.divisions.length, 'divisions']].map(([n, l]) => (
              <div key={l as string}><div className="display text-4xl font-semibold num">{n}</div><div className="text-xs text-white/50 mt-1">{l}</div></div>
            ))}
          </motion.div>
          <div className="mt-10 flex flex-wrap items-center gap-4 text-xs text-white/40">
            <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4" /> Role-based access · MFA-ready · full audit log</span>
            <span className="inline-flex items-center gap-1.5"><WifiOff className="size-4" /> Works offline in the field</span>
            <span className="inline-flex items-center gap-1.5"><FlagMark width={16} /> Proudly American · honoring those who served</span>
          </div>
        </div>

        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="rounded-[32px] border border-white/10 bg-white/[.03] backdrop-blur-xl p-6 md:p-8">
          <button onClick={ms} className="w-full h-14 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-3 hover:bg-white/90 transition">
            <svg width="20" height="20" viewBox="0 0 23 23"><path fill="#f35325" d="M1 1h10v10H1z" /><path fill="#81bc06" d="M12 1h10v10H12z" /><path fill="#05a6f0" d="M1 12h10v10H1z" /><path fill="#ffba08" d="M12 12h10v10H12z" /></svg>
            Sign in with Microsoft
            <DemoTag className="ml-1" />
          </button>
          <PasskeyButton />
          <button onClick={startTour} data-testid="tour-start" style={{ background: renamed || hot !== '#ef3b3b' ? hot : undefined }} className="mt-3 w-full h-12 rounded-2xl bg-gradient-to-r from-[#ef3b3b] to-[#b91c1c] text-white font-semibold flex items-center justify-center gap-2 hover:brightness-110 transition"><Play className="size-4" />Show me — 5-minute owner tour</button>
          <div className="flex items-center gap-3 my-6 text-xs text-white/60"><div className="h-px flex-1 bg-white/10" />or explore as<div className="h-px flex-1 bg-white/10" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {ROLES.filter(r => r.key !== 'guest').map((r, i) => {
              const Icon = ICONS[r.icon] ?? ICONS.Users
              return (
                <motion.button key={r.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.04 }}
                  onClick={() => signIn(r.key as RoleKey)} data-role={r.key}
                  className="group text-left rounded-2xl border border-white/10 bg-white/[.03] hover:bg-white/[.07] hover:border-white/20 p-4 transition flex gap-3 items-start">
                  <span className={`grid size-10 place-items-center rounded-xl shrink-0 ${r.key === 'owner' ? 'text-white' : 'bg-white/10 text-white/80'}`} style={r.key === 'owner' ? { background: hot } : undefined}><Icon className="size-5" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold text-[15px]">{r.label}<ArrowRight className="size-4 opacity-0 -translate-x-1 group-hover:opacity-60 group-hover:translate-x-0 transition" /></span>
                    <span className="block text-xs text-white/45 mt-0.5 leading-snug">{r.who} — {r.blurb}</span>
                  </span>
                </motion.button>
              )
            })}
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[.03] p-3" data-testid="sup-logins"><div className="text-xs text-white/55 mb-2">Field supervisor logins (field app, foreman tools)</div><div className="flex flex-wrap gap-2">
            {emps.filter(e => e.craft === 'Supervisor' && ['emp-2001', 'emp-2002', 'emp-2003'].includes(e.id)).map(e => <button key={e.id} data-sup={e.id} onClick={() => signIn('field', 'Demo role', e.id)} className="rounded-full px-3 h-9 text-sm font-semibold bg-white/10 hover:bg-white/20">{e.first} {e.last} · Supervisor</button>)}
          </div></div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <a href="?portal=1" data-testid="portal-link" data-role-preview="customer" className="rounded-2xl border border-white/10 bg-white/[.03] hover:bg-white/[.07] p-4 transition"><span className="block font-semibold text-[15px]">Customer (wind O&amp;M)</span><span className="block text-xs text-white/45 mt-0.5">Rick Dawson, Plains Wind — magic-link portal preview.</span></a>
            <a href="?welcome=nh-2" data-testid="newhire-link" className="rounded-2xl border border-white/10 bg-white/[.03] hover:bg-white/[.07] p-4 transition"><span className="block font-semibold text-[15px]">New hire — first open</span><span className="block text-xs text-white/45 mt-0.5">Kayla Brooks — welcome, paperwork, badge, gear.</span></a>
          </div>
          <a href="?sync=1" data-testid="sync-link" className="mt-3 flex items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[#ef3b3b]/20 to-transparent hover:from-[#ef3b3b]/30 p-4 transition">
            <span className="grid size-10 place-items-center rounded-xl bg-white/10 text-white"><MonitorSmartphone className="size-5" /></span>
            <span className="flex-1"><span className="block font-semibold text-[15px]">Live demo: phone + office side by side</span><span className="block text-xs text-white/55">Sign a ticket on the phone, watch the office update instantly.</span></span>
            <ArrowRight className="size-4 opacity-60" />
          </a>
          <div className="mt-6 text-[11px] text-white/55 leading-relaxed">Demo build — all people, customers, numbers and phone numbers are fictional sample data. Data stays on this device and resets from Settings.</div>
          <div className="mt-5 pt-4 border-t border-white/10 flex justify-center"><PoweredBy tone="dark" size={14} /></div>
        </motion.div>
      </div>
      <Modal open={!!mfa} onClose={() => setMfa(null)} title="Approve sign-in" sub="Microsoft Entra ID · multi-factor authentication (demo)">
        <div className="flex flex-col items-center gap-4 py-6">
          <div className={`grid size-20 place-items-center rounded-full ${mfa === 'ok' ? 'bg-ok/15 text-ok' : 'bg-accent/15 text-accent blink'}`}><Fingerprint className="size-10" /></div>
          <div className="text-center"><div className="text-sm text-muted">Open Authenticator and enter</div><div className="display text-6xl font-semibold num mt-2">42</div></div>
          <div className="text-sm text-muted">{mfa === 'ok' ? 'Approved — signing you in as Owner…' : 'Waiting for approval…'}</div>
        </div>
      </Modal>
    </div>
  )
}
