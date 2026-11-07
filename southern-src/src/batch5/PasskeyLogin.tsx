import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Fingerprint, KeyRound, Smartphone, ShieldCheck } from 'lucide-react'
import { useStore } from '../data/store'
import { ROLES } from '../data/roles'
import type { RoleKey } from '../data/types'
import { Modal, Button } from '../components/ui'
import { passkeys, platformAvailable, registerPasskey, signInWithPasskey, deviceLabel, bioName } from './security'
const BIO = bioName()
import { cn } from '../lib/util'

export function PasskeyButton() {
  const signIn = useStore(s => s.signIn)
  const [avail, setAvail] = useState<boolean | null>(null)
  const [setup, setSetup] = useState(false)
  const [code, setCode] = useState(false)
  const [busy, setBusy] = useState(false)
  const [role, setRole] = useState<RoleKey>('ops')
  const has = passkeys()
  useEffect(() => { platformAvailable().then(setAvail) }, [])
  const go = async () => {
    if (!has.length) { setSetup(true); return }
    setBusy(true)
    try { const pk = await signInWithPasskey(); toast.success(`Welcome back, ${pk.name.split(' ')[0]}`, { description: `Signed in with ${pk.label}` }); signIn(pk.role, 'Passkey (this device)') }
    catch { toast('Fingerprint didn’t work — use a code instead'); setCode(true) }
    finally { setBusy(false) }
  }
  const create = async () => {
    const r = ROLES.find(x => x.key === role)!
    setBusy(true)
    try { await registerPasskey(role, r.who); toast.success(`${BIO[0].toUpperCase() + BIO.slice(1)} sign-in is set up on this device`, { description: 'Your passkey never leaves this device.' }); setSetup(false); signIn(role, 'Passkey (this device)') }
    catch { toast.error('Passkey not created', { description: 'Cancelled or not supported here — use a code instead.' }) }
    finally { setBusy(false) }
  }
  return (
    <>
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button onClick={go} disabled={busy} data-testid="passkey-btn" className="h-14 rounded-2xl border border-white/15 bg-white/[.06] hover:bg-white/[.1] font-semibold flex items-center justify-center gap-3 transition">
          <Fingerprint className={cn('size-5', busy && 'animate-pulse')} />{has.length ? `Sign in with ${BIO} · ${has[0].name.split(' ')[0]}` : `Sign in with ${BIO}`}
        </button>
        <button onClick={() => setCode(true)} data-testid="code-btn" title="Use a code instead" className="h-14 w-14 rounded-2xl border border-white/15 bg-white/[.06] hover:bg-white/[.1] grid place-items-center"><KeyRound className="size-5" /></button>
      </div>
      <Modal open={setup} onClose={() => setSetup(false)} title={`Set up ${BIO} sign-in`} sub={`Creates a passkey on ${deviceLabel()} — nothing to remember, nothing to phish.`}>
        <div className="flex flex-col gap-3" data-testid="passkey-setup">
          <div className="grid place-items-center py-3"><div className="grid size-20 place-items-center rounded-full bg-accent/15 text-accent"><Fingerprint className="size-10" /></div></div>
          <label className="text-sm font-semibold">Who's signing in?<select className="input mt-1.5" value={role} onChange={e => setRole(e.target.value as RoleKey)} data-testid="passkey-role">{ROLES.map(r => <option key={r.key} value={r.key}>{r.who} · {r.label}</option>)}</select></label>
          {avail === false && <div className="text-sm text-warn">This browser has no fingerprint / Face ID / Windows Hello available. Use a code instead.</div>}
          <Button variant="primary" size="lg" disabled={busy || avail === false} onClick={create} data-testid="passkey-create">{busy ? `Waiting for ${BIO}…` : 'Create passkey'}</Button>
          <Button variant="ghost" onClick={() => { setSetup(false); setCode(true) }}>Use a code instead</Button>
          <div className="text-[11px] text-muted">Demo: the passkey is real (WebAuthn, platform authenticator). The credential ID is stored on this device; a production server would verify each sign-in.</div>
        </div>
      </Modal>
      <TwoFactor open={code} onClose={() => setCode(false)} onOk={r => { setCode(false); signIn(r, '2FA code (demo)') }} />
    </>
  )
}

/** Desktop 2FA step preview: password done → 6-digit authenticator code (or number match on the phone). */
export function TwoFactor({ open, onClose, onOk }: { open: boolean; onClose: () => void; onOk: (r: RoleKey) => void }) {
  const [digits, setDigits] = useState(['', '', '', '', '', ''])
  const [mode, setMode] = useState<'code' | 'push'>('code')
  const [role, setRole] = useState<RoleKey>('ops')
  const refs = useRef<(HTMLInputElement | null)[]>([])
  useEffect(() => { if (open) { setDigits(['', '', '', '', '', '']); setTimeout(() => refs.current[0]?.focus(), 200) } }, [open])
  const code = digits.join(''); const good = code === '482913'
  const set = (i: number, v: string) => { const d = [...digits]; d[i] = v.replace(/\D/g, '').slice(-1); setDigits(d); if (d[i] && i < 5) refs.current[i + 1]?.focus() }
  return (
    <Modal open={open} onClose={onClose} title="Two-step verification" sub="Step 2 of 2 · your password was accepted">
      <div className="flex flex-col gap-4" data-testid="twofa">
        <label className="text-sm font-semibold">Account<select className="input mt-1.5" value={role} onChange={e => setRole(e.target.value as RoleKey)}>{ROLES.map(r => <option key={r.key} value={r.key}>{r.who} · {r.label}</option>)}</select></label>
        <div className="flex gap-1.5 p-1 rounded-xl bg-surface-2 text-sm font-semibold">{(['code', 'push'] as const).map(m => <button key={m} onClick={() => setMode(m)} className={cn('flex-1 h-9 rounded-lg', mode === m && 'bg-surface-3')}>{m === 'code' ? 'Authenticator code' : 'Approve on phone'}</button>)}</div>
        {mode === 'code' ? <>
          <div className="flex justify-center gap-2" onPaste={e => { const t = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); if (t.length === 6) { setDigits(t.split('')); e.preventDefault() } }}>
            {digits.map((d, i) => <input key={i} ref={el => { refs.current[i] = el }} value={d} inputMode="numeric" maxLength={1} data-testid="otp" onChange={e => set(i, e.target.value)} onKeyDown={e => { if (e.key === 'Backspace' && !d && i) refs.current[i - 1]?.focus() }} className={cn('w-12 h-14 rounded-xl text-center text-2xl font-semibold num bg-surface-2 border', code.length === 6 ? (good ? 'border-ok' : 'border-bad') : 'border-line')} />)}
          </div>
          <div className="text-center text-xs text-muted">Demo code: <b className="num text-ink">482 913</b></div>
          <Button variant="primary" size="lg" disabled={!good} onClick={() => onOk(role)} data-testid="otp-verify" icon={<ShieldCheck className="size-5" />}>Verify</Button>
        </> : <>
          <div className="text-center"><Smartphone className="size-10 mx-auto text-accent" /><div className="text-sm text-muted mt-2">Tap the number shown here on your phone</div><div className="display text-6xl font-semibold num mt-1">27</div></div>
          <Button variant="primary" size="lg" onClick={() => onOk(role)} data-testid="push-approve">Simulate phone approval</Button>
        </>}
        <div className="text-[11px] text-muted text-center">Remember this browser for 30 days · Lost your phone? Call IT at the OKC office.</div>
      </div>
    </Modal>
  )
}
