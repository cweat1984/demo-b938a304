/** Guest passes (dive3 B1/M2 rework).
 *  • Links are ?guest=<claims>.<ECDSA P-256 signature>. Only the PUBLIC key ships in a guest's page, so a guest can't mint
 *    or stretch a pass. The private key ships only in the owner app, wrapped with the owner PIN (PBKDF2 600k) — it's unwrapped
 *    in memory when the owner unlocks Guest Passes.
 *  • In production a guest link points at the separate guest-only build (/g/, its own StatiCrypt key, no staff role picker,
 *    no owner data). The owner app's site key never appears in a guest link, and the owner app refuses ?guest= links.
 *  • "Everything" passes carry the key for the money dataset; Demo / Operations passes can't decrypt it.
 *  • Revoke: the guest build re-checks ./revoked.json (published with the site) on load and every few minutes.
 *  Honest limits: still a static site — the guest page's code runs in the guest's browser. Expiry and scope are signed and
 *  can't be forged, but revoke needs the revocation list published (see GuestPasses). */
import { DEV_GUEST_KEYS } from './devkeys'
const enc = new TextEncoder()
type Keys = { pub: JsonWebKey; wrap?: { s: string; iv: string; it: number; ct: string }; allKey?: string }
const parseEnv = (v: unknown): Keys | null => { try { return v ? JSON.parse(String(v)) as Keys : null } catch { return null } }
/** owner build: pub + wrapped private key + all-data key · guest build: pub only · local/E2E: dev keys */
const KEYS: Keys = parseEnv(import.meta.env.VITE_GUEST_KEYS) ?? (import.meta.env.VITE_GUEST_ONLY ? { pub: DEV_GUEST_KEYS.pub } : DEV_GUEST_KEYS)
/** production: absolute URL of the guest-only build + its StatiCrypt key; unset in local/E2E builds (links stay same-page) */
const GUEST_URL = (import.meta.env.VITE_GUEST_URL as string | undefined) || ''
const GUEST_SITE_KEY = (import.meta.env.VITE_GUEST_SITE_KEY as string | undefined) || ''
/** This is the guest-only build (no staff sign-in at all). */
export const GUEST_ONLY = !!import.meta.env.VITE_GUEST_ONLY
/** This owner app hands guests a separate build, so a ?guest= link opened here is an old/forwarded one → refuse. */
export const GUEST_ELSEWHERE = !!GUEST_URL && !GUEST_ONLY
export interface GuestClaims { i: string; n: string; e: number; c: number; o?: string; /** page scope: show | ops | all */ s?: 'show' | 'ops' | 'all'; /** "all" passes: key for the money dataset */ k?: string }
export interface PassRec extends GuestClaims { url: string; revoked?: boolean; by: string }
export const b64u = (b: ArrayBuffer | Uint8Array) => { const a = new Uint8Array(b as ArrayBuffer); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0))
let pubP: Promise<CryptoKey> | null = null
const pubKey = () => pubP ??= crypto.subtle.importKey('jwk', KEYS.pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
let privKey: CryptoKey | null = null
const PRIV_SS = 'sc-gp-k'
/** Unwrap the signing key with the owner PIN (slow on purpose). true = right PIN. */
export async function unlockSigning(pin: string): Promise<boolean> {
  const w = KEYS.wrap; if (!w) return false
  try {
    const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
    const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64u(w.s), iterations: w.it, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const jwk = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(w.iv) }, k, unb64u(w.ct)))
    privKey = await crypto.subtle.importKey('jwk', JSON.parse(jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
    try { sessionStorage.setItem(PRIV_SS, jwk) } catch { /* */ }
    return true
  } catch { return false }
}
const signingKey = async () => { if (privKey) return privKey; const j = sessionStorage.getItem(PRIV_SS); if (!j) throw new Error('Guest passes are locked — enter the owner PIN'); privKey = await crypto.subtle.importKey('jwk', JSON.parse(j), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']); return privKey }
export const forgetSigning = () => { privKey = null; try { sessionStorage.removeItem(PRIV_SS) } catch { /* */ } }
export async function signPass(c: GuestClaims) {
  const claims = c.s === 'all' && KEYS.allKey ? { ...c, k: KEYS.allKey } : c
  const body = b64u(enc.encode(JSON.stringify(claims)))
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(), enc.encode(body)); return `${body}.${b64u(sig)}`
}
/** Revocation list published next to the guest build: { ids: [...], before?: epoch ms } (passes made before `before` are off). */
let revoked: { ids: string[]; before?: number } = { ids: [] }
export async function refreshRevoked() {
  if (!GUEST_ONLY) return
  try { const r = await fetch(`./revoked.json?t=${Date.now()}`, { cache: 'no-store' }); if (r.ok) { const j = await r.json(); revoked = { ids: Array.isArray(j.ids) ? j.ids.map(String) : [], before: Number(j.before) || undefined } } } catch { /* offline: keep the last list */ }
}
const isRevoked = (c: GuestClaims) => revoked.ids.includes(c.i) || (!!revoked.before && c.c < revoked.before) || localRevokedIds().includes(c.i) || passes().some(p => p.i === c.i && p.revoked)
export async function verifyPass(tok: string): Promise<{ ok: true; c: GuestClaims } | { ok: false; why: 'bad' | 'expired' | 'revoked' | 'moved'; c?: GuestClaims }> {
  if (GUEST_ELSEWHERE) return { ok: false, why: 'moved' }
  try {
    const [body, sig] = tok.split('.'); if (!body || !sig || tok.length > 4000) return { ok: false, why: 'bad' }
    const good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pubKey(), unb64u(sig), enc.encode(body)); if (!good) return { ok: false, why: 'bad' }
    const c = JSON.parse(new TextDecoder().decode(unb64u(body))) as GuestClaims
    if (typeof c.e !== 'number' || typeof c.c !== 'number' || c.e - c.c > 31 * 864e5) return { ok: false, why: 'bad' }
    await refreshRevoked()
    if (isRevoked(c)) return { ok: false, why: 'revoked', c }
    if (Date.now() >= c.e) return { ok: false, why: 'expired', c }
    return { ok: true, c }
  } catch { return { ok: false, why: 'bad' } }
}
/** Production: the guest-only build + its own key in the #fragment. Local/E2E: this page (no key). */
export const passUrl = (tok: string) => GUEST_URL ? `${GUEST_URL}?guest=${tok}${GUEST_SITE_KEY ? `#staticrypt_pwd=${GUEST_SITE_KEY}` : ''}` : `${location.origin}${location.pathname}?guest=${tok}`
/** A StatiCrypt key in the address bar (?staticrypt_pwd= or #staticrypt_pwd=, ?remember_me) */
export const urlHasSiteKey = () => { try { return /staticrypt_pwd=|remember_me/.test(location.search) || /staticrypt_pwd=/.test(location.hash) } catch { return false } }
export const DURATIONS = [{ k: '1h', label: '1 hour', ms: 36e5 }, { k: '2h', label: '2 hours', ms: 72e5 }, { k: '24h', label: '24 hours', ms: 864e5 }, { k: '3d', label: '3 days', ms: 3 * 864e5 }, { k: '7d', label: '7 days', ms: 7 * 864e5 }, { k: 'custom', label: 'Custom', ms: 0 }] as const
export const DEFAULT_DURATION = '2h'
const LIST = 'sc-guest-passes'
/** Ids only. A guest page may read this so a revoke in this browser is honored, and may not write it or see the signed links. */
const REV_LOCAL = 'sc-guest-revoked'
export const localRevokedIds = (): string[] => { try { const v = JSON.parse(localStorage.getItem(REV_LOCAL) || '[]'); return Array.isArray(v) ? v.map(String) : [] } catch { return [] } }
export const passes = (): PassRec[] => { try { return JSON.parse(localStorage.getItem(LIST) || '[]') } catch { return [] } }
export const savePasses = (l: PassRec[]) => { localStorage.setItem(LIST, JSON.stringify(l)); try { localStorage.setItem(REV_LOCAL, JSON.stringify(l.filter(p => p.revoked).map(p => p.i))) } catch { /* quota */ } }
export const GUEST_KEY = 'sc-guest'           // sessionStorage: the active guest token
export const DEVICE_KEY = 'sc-guest-device'   // localStorage: this browser opened a guest pass → no role picker here
export const LOCK_KEY = 'sc-guest-locked'      // localStorage: this browser used a pass that ended

/** Guest lock for this browser: set when a valid guest pass opens, kept in localStorage AND a cookie (deleting one key doesn't
 *  clear it). While locked: no ?as= embeds, no staff sign-in, no early routes. Cleared only through the owner-PIN staff path. */
const LOCK_COOKIE = 'sc_gd'
export const setGuestLock = () => { try { localStorage.setItem(DEVICE_KEY, '1'); document.cookie = `${LOCK_COOKIE}=1; max-age=${60 * 864e2}; path=/; SameSite=Strict` } catch { /* */ } }
export const clearGuestLock = () => { try { localStorage.removeItem(DEVICE_KEY); document.cookie = `${LOCK_COOKIE}=; max-age=0; path=/` } catch { /* */ } }
export const guestDeviceLocked = () => { try { return localStorage.getItem(DEVICE_KEY) === '1' || document.cookie.split('; ').includes(`${LOCK_COOKIE}=1`) } catch { return false } }
/** This tab is (or is about to be) a guest tab: a ?guest= link, a live guest token, or a guest-locked browser. */
export const guestContext = () => { if (GUEST_ONLY) return true; try { return new URLSearchParams(location.search).has('guest') || !!sessionStorage.getItem(GUEST_KEY) || guestDeviceLocked() } catch { return true } }
