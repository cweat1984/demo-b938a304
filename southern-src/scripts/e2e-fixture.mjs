// Writes a throwaway guest signing key for local tests only. Not the production key.
// Output files are gitignored. The PIN is never printed.
import { webcrypto as crypto } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const pin = String(1000 + (crypto.getRandomValues(new Uint8Array(2))[0] % 9000)).padStart(4, '0')
const enc = new TextEncoder()
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const priv = await crypto.subtle.exportKey('jwk', pair.privateKey)
const pub = await crypto.subtle.exportKey('jwk', pair.publicKey)
const salt = crypto.getRandomValues(new Uint8Array(16))
const iv = crypto.getRandomValues(new Uint8Array(12))
const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
const aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aes, enc.encode(JSON.stringify(priv)))
const keys = { pub, wrap: { s: b64u(salt), iv: b64u(iv), it: 600000, ct: b64u(ct) }, allKey: b64u(crypto.getRandomValues(new Uint8Array(32))) }

fs.writeFileSync(path.join(root, '.e2e-pin'), pin + '\n', { mode: 0o600 })
fs.writeFileSync(path.join(root, '.e2e-keys.json'), JSON.stringify(keys), { mode: 0o600 })
const env = `VITE_E2E=1\nVITE_GUEST_KEYS=${JSON.stringify(JSON.stringify(keys))}\n`
fs.writeFileSync(path.join(root, '.env.e2e'), env, { mode: 0o600 })
console.log('wrote gitignored .e2e-pin, .e2e-keys.json, .env.e2e (synthetic PIN, not printed)')
