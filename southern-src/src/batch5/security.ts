import { appName } from '../data/brand'
/** Security UX for the demo (Blueprint §7). Real WebAuthn platform passkeys; credential IDs stored on this device only.
 *  NOTE: a production build verifies the assertion on the server — the demo only proves the authenticator ceremony. */
import { create } from 'zustand'
import type { RoleKey } from '../data/types'
import { ROLES } from '../data/roles'
import { useStore } from '../data/store'

export interface Passkey { credId: string; role: RoleKey; name: string; created: string; label: string }
const PK = 'sc-passkeys'
const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0))
const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n))
export const passkeys = (): Passkey[] => { try { return JSON.parse(localStorage.getItem(PK) || '[]') } catch { return [] } }
const savePk = (l: Passkey[]) => localStorage.setItem(PK, JSON.stringify(l))
export async function platformAvailable() { try { return !!window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false } }
export const deviceLabel = () => { const u = navigator.userAgent; return /iPhone/.test(u) ? 'iPhone · Face ID' : /iPad/.test(u) ? 'iPad · Touch ID' : /Android/.test(u) ? 'Android · fingerprint' : /Mac/.test(u) ? 'Mac · Touch ID' : /Windows/.test(u) ? 'Windows Hello' : 'This device' }

/** WebAuthn rejects a numeric host (127.0.0.1). localhost and real domains work. */
export function passkeyHostOk(host = location.hostname) {
  return !!host && !/^\d+\.\d+\.\d+\.\d+$/.test(host) && !host.includes(':')
}
/** The role is written into the authenticator user handle at registration. A later edit of localStorage cannot change it. */
function userIdForRole(role: string) {
  const name = new TextEncoder().encode(role)
  const id = new Uint8Array(32)
  id[0] = name.length
  id.set(name, 1)
  crypto.getRandomValues(id.subarray(1 + name.length))
  return id
}
function roleFromUserId(buf: ArrayBuffer | null): RoleKey | null {
  if (!buf) return null
  const bytes = new Uint8Array(buf)
  const n = bytes[0]
  if (!n || 1 + n > bytes.length) return null
  const role = new TextDecoder().decode(bytes.slice(1, 1 + n))
  return ROLES.some(r => r.key === role && r.key !== 'guest') ? role as RoleKey : null
}
export async function registerPasskey(role: RoleKey, name: string) {
  if (role === 'guest') throw new Error('Guest uses a signed pass, not a passkey')
  if (!passkeyHostOk()) throw new Error('Passkeys need a hostname such as localhost, not a numeric address')
  const cred = await navigator.credentials.create({ publicKey: {
    challenge: rand(32), rp: { name: appName() }, user: { id: userIdForRole(role), name: `${name.toLowerCase().replace(/\s+/g, '.')}@southern.example`, displayName: name },
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' }, timeout: 60000, attestation: 'none',
  } }) as PublicKeyCredential | null
  if (!cred) throw new Error('cancelled')
  const pk: Passkey = { credId: b64u(cred.rawId), role, name, created: new Date().toISOString(), label: deviceLabel() }
  savePk([pk, ...passkeys().filter(p => p.role !== role)])
  return pk
}
export async function signInWithPasskey(): Promise<Passkey> {
  if (!passkeyHostOk()) throw new Error('Passkeys need a hostname such as localhost, not a numeric address')
  const list = passkeys(); if (!list.length) throw new Error('none')
  const a = await navigator.credentials.get({ publicKey: { challenge: rand(32), allowCredentials: list.map(p => ({ type: 'public-key' as const, id: unb64u(p.credId), transports: ['internal' as AuthenticatorTransport] })), userVerification: 'required', timeout: 60000 } }) as PublicKeyCredential | null
  if (!a) throw new Error('cancelled')
  const id = b64u(a.rawId); const pk = list.find(p => p.credId === id); if (!pk) throw new Error('unknown credential')
  const bound = roleFromUserId((a.response as AuthenticatorAssertionResponse).userHandle)
  if (!bound) throw new Error('This passkey’s role does not match the one created with it')
  if (pk.role !== bound) savePk(list.map(p => p.credId === id ? { ...p, role: bound } : p))
  return { ...pk, role: bound }
}
export const removePasskey = (credId: string) => savePk(passkeys().filter(p => p.credId !== credId))

// ---------------- session / devices ----------------
export interface Device { id: string; label: string; who: string; where: string; last: string; current?: boolean }
interface Sec { timeoutMin: number; devices: Device[] }
const SK = 'sc-security'
const ago = (m: number) => new Date(Date.now() - m * 60e3).toISOString()
const seedDevices = (): Device[] => [
  { id: 'dv-this', label: `${deviceLabel()} · ${/Chrome/.test(navigator.userAgent) ? 'Chrome' : /Safari/.test(navigator.userAgent) ? 'Safari' : 'Browser'}`, who: 'You', where: 'Oklahoma City, OK', last: new Date().toISOString(), current: true },
  { id: 'dv-2', label: `iPhone 15 · ${appName()} app`, who: 'You', where: 'Ardmore, OK', last: ago(42) },
  { id: 'dv-3', label: 'Surface Pro · Edge', who: 'You', where: 'OKC office', last: ago(60 * 26) },
  { id: 'dv-4', label: 'Galaxy S23 · company phone (MDM)', who: 'You', where: 'Midland, TX', last: ago(60 * 24 * 6) },
]
const loadSec = (): Sec => { try { const s = JSON.parse(localStorage.getItem(SK) || 'null'); if (s) return s } catch { /* */ } return { timeoutMin: 30, devices: seedDevices() } }
export const useSec = create<Sec>(() => loadSec())
const saveSec = () => localStorage.setItem(SK, JSON.stringify(useSec.getState()))
const log = (action: string, entity: string, detail: string) => useStore.getState().commit(action, entity, detail, () => {}, { silent: true })
export const sec = {
  setTimeout(m: number) { useSec.setState({ timeoutMin: m }); saveSec(); log('Changed session timeout', 'Security', `Idle sign-out → ${m} min`) },
  remoteSignOut(id: string) { const d = useSec.getState().devices.find(x => x.id === id); useSec.setState(s => ({ devices: s.devices.filter(x => x.id !== id) })); saveSec(); log('Remote sign-out', 'Device', d?.label ?? id) },
  async wipe() {
    try { localStorage.clear(); sessionStorage.clear(); if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k); const regs = await navigator.serviceWorker?.getRegistrations?.(); regs?.forEach(r => r.unregister()); indexedDB?.databases && (await indexedDB.databases()).forEach(d => d.name && indexedDB.deleteDatabase(d.name)) } catch { /* best effort */ }
    location.href = location.pathname
  },
  log,
}

// ---------------- sensitive fields ----------------
export const CAN_REVEAL: RoleKey[] = ['owner', 'hr', 'payroll']
const h = (s: string) => { let x = 7; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 1e9; return x }
export function sensitiveFor(empId: string) { const n = h(empId); return { ssn: `${String(400 + n % 300)}-${String(10 + n % 89)}-${String(1000 + n % 8999)}`, routing: `1030${String(10000 + n % 89999)}`, account: `${String(100000 + (n * 7) % 899999)}${String(n % 9973).padStart(4, '0')}`, bank: ['BancFirst', 'Arvest Bank', 'Frost Bank', 'Tinker FCU'][n % 4] } }

/** What the platform calls its biometric unlock — "Face ID" on iPhone, "Touch ID" on Mac, "fingerprint" on Android, "Windows Hello" on PCs. */
export function bioName(ua = navigator.userAgent): string {
  if (/iPhone|iPod/.test(ua) || (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'Face ID'
  if (/Macintosh/.test(ua)) return 'Touch ID'
  if (/Android/.test(ua)) return 'fingerprint'
  if (/Windows/.test(ua)) return 'Windows Hello'
  return 'fingerprint'
}
