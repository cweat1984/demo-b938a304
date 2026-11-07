/** Owner PIN gate for Guest Passes. No PIN hash ships: the PIN unwraps the guest signing key (PBKDF2-SHA256, 600k iterations,
 *  salted, AES-GCM) — a right PIN is one that decrypts it. Offline guessing of a 4-digit PIN is slow (~0.3 s a try) but not
 *  impossible for someone holding the owner page; the owner page itself is behind the site password. Unlock lasts for this browser session;
 *  5 wrong tries → 60-second lockout. Client-side only: it keeps casual hands off, it is not a server-enforced control. */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Lock, Delete } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../lib/util'

import { unlockSigning, forgetSigning } from './pass'
const UNLOCK = 'sc-gp-unlocked', TRIES = 'sc-gp-tries'
export const gpUnlocked = () => sessionStorage.getItem(UNLOCK) === '1'
export const gpLock = () => { sessionStorage.removeItem(UNLOCK); forgetSigning(); window.dispatchEvent(new Event('sc-gp-lock')) }
/** Failed attempts are a list of timestamps kept in three places (localStorage, sessionStorage, a cookie) and merged on read,
 *  so deleting one key doesn't reset the lockout. Lockout is derived from the list: 5 misses → 60 s, each further 5 → doubled
 *  (max 15 min). Still client-side (clearing all site data resets it) — it slows guessing, it isn't a server control. */
const COOKIE = 'sc_gp_t'
const readList = (raw: string | null): number[] => { try { const v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [] } catch { return [] } }
const readCookie = () => decodeURIComponent(document.cookie.split('; ').find(c => c.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1) ?? '[]')
const attempts = (): number[] => { const day = Date.now() - 864e5; return [...new Set([...readList(localStorage.getItem(TRIES)), ...readList(sessionStorage.getItem(TRIES)), ...readList(readCookie())])].filter(t => t > day).sort((a, b) => a - b) }
const writeAttempts = (l: number[]) => { const v = JSON.stringify(l.slice(-50)); try { localStorage.setItem(TRIES, v); sessionStorage.setItem(TRIES, v); document.cookie = `${COOKIE}=${encodeURIComponent(v)}; max-age=86400; path=/; SameSite=Strict` } catch { /* */ } }
const clearAttempts = () => { try { localStorage.removeItem(TRIES); sessionStorage.removeItem(TRIES); document.cookie = `${COOKIE}=; max-age=0; path=/` } catch { /* */ } }
const readTries = (): { n: number; until: number } => { const l = attempts(), n = l.length; if (n < 5) return { n, until: 0 }; const lvl = Math.floor(n / 5) - 1; return { n: n % 5, until: l[n - 1 - (n % 5)] + Math.min(15 * 6e4, 6e4 * 2 ** lvl) } }

export default function PinGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(gpUnlocked)
  const [pin, setPin] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState(''), [tries, setTries] = useState(readTries), [now, setNow] = useState(Date.now())
  const inp = useRef<HTMLInputElement>(null)
  useEffect(() => { const h = () => { setOk(false); setPin(''); setErr('') }; window.addEventListener('sc-gp-lock', h); return () => window.removeEventListener('sc-gp-lock', h) }, [])
  const lockedFor = Math.max(0, Math.ceil((tries.until - now) / 1000))
  useEffect(() => { if (!lockedFor) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [lockedFor])
  if (ok) return <>{children}</>
  const submit = async (p: string) => {
    if (lockedFor || busy) return
    setBusy(true); const right = await unlockSigning(p); setBusy(false)
    if (right) { sessionStorage.setItem(UNLOCK, '1'); clearAttempts(); setPin(''); setOk(true); toast.success('Guest passes unlocked for this session'); return }
    writeAttempts([...attempts(), Date.now()]); const t = readTries(), n = t.until > Date.now() ? 5 : t.n
    setTries(t); setNow(Date.now()); setPin('')
    setErr(n >= 5 ? `Too many tries. Locked for ${Math.ceil((t.until - Date.now()) / 1000)} seconds.` : `Wrong PIN · ${5 - n} ${5 - n === 1 ? 'try' : 'tries'} left`)
  }
  const press = (d: string) => { if (lockedFor || busy) return; setErr(''); const p = (pin + d).slice(0, 4); setPin(p); if (p.length === 4) void submit(p) }
  return (
    <div className="max-w-sm mx-auto mt-6 md:mt-14 card p-6 text-center" data-testid="gp-pin-gate">
      <div className="size-14 rounded-2xl bg-surface-2 grid place-items-center mx-auto"><Lock className="size-6 text-accent" /></div>
      <h1 className="display text-2xl font-semibold mt-3">Guest passes are locked</h1>
      <div className="text-sm text-muted mt-1">Enter the owner PIN to make or revoke guest links.</div>
      <div className="flex justify-center gap-3 my-5" aria-hidden>{[0, 1, 2, 3].map(i => <span key={i} className={cn('size-3.5 rounded-full border-2 border-ink/50 transition', i < pin.length && 'bg-ink border-ink')} />)}</div>
      <input ref={inp} data-testid="pin-input" type="password" inputMode="numeric" pattern="[0-9]*" autoComplete="off" maxLength={4} aria-label="Owner PIN" value={pin} disabled={!!lockedFor}
        onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 4); setErr(''); setPin(v); if (v.length === 4) void submit(v) }} className="sr-only" />
      <div className={cn('min-h-5 text-sm font-semibold', lockedFor ? 'text-bad' : 'text-bad')} data-testid="pin-msg" role="status">{lockedFor ? `Too many tries. Try again in ${lockedFor}s.` : busy ? <span className="text-muted">Checking…</span> : err}</div>
      <div className="grid grid-cols-3 gap-2.5 mt-3" data-testid="pin-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k, i) => k === '' ? <span key={i} /> : (
          <button key={i} type="button" disabled={!!lockedFor} data-pin={k} aria-label={k === 'del' ? 'Delete' : k} onClick={() => (k === 'del' ? setPin(p => p.slice(0, -1)) : press(k))}
            className="h-16 rounded-2xl bg-surface-2 active:bg-surface-3 text-2xl font-semibold disabled:opacity-40 grid place-items-center">{k === 'del' ? <Delete className="size-6" /> : k}</button>))}
      </div>
      <button type="button" onClick={() => inp.current?.focus()} className="mt-4 text-xs text-muted underline">Use keyboard</button>
    </div>
  )
}
