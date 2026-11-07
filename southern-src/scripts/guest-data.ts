// Builds the guest-only dataset: the demo seed with phones/addresses/pay stripped (scrubDb), money stripped for Demo /
// Operations passes, and the "Everything" copy AES-GCM-encrypted with the all-scope key (only "Everything" passes carry it).
// usage: GUEST_ALLKEY=<b64url> tsx scripts/guest-data.ts <out.json>
import fs from 'fs'
import { webcrypto as C } from 'crypto'
import { seed } from '../src/data/seed'
import { scrubDb } from '../src/guest/guard'
const out = process.argv[2]; const kb = process.env.GUEST_ALLKEY
if (!kb) throw new Error('GUEST_ALLKEY missing')
const db = seed() as unknown as Record<string, unknown>
const MONEY = /^(rate|dayRate|hourlyRate|billRate|revenue|cost|costBudget|amount|price|unitPrice|total|margin|mobDemob|laborRate|budget|value|wage|salary|balance|creditLimit|paid|tax|fee|fuelCost|perDiem|listPrice|msrp|replacementCost|purchasePrice|bookValue|costDay|unitCost|dayCost|hourCost|costPerHour|costPerDay|costMile|downAmount)$/i
// belt and braces for the Demo/Operations copy: every money-looking number is zeroed (the UI hides them anyway)
const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, typeof x === 'number' && MONEY.test(k) ? 0 : strip(x)])) : v
const base = strip(scrubDb(db, 'ops')), full = scrubDb(db, 'all')
const key = await C.subtle.importKey('raw', Buffer.from(kb, 'base64url'), 'AES-GCM', false, ['encrypt'])
const iv = C.getRandomValues(new Uint8Array(12))
const ct = await C.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(full)))
const day = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
fs.writeFileSync(out, JSON.stringify({ day, base, all: { iv: Buffer.from(iv).toString('base64url'), ct: Buffer.from(ct).toString('base64url') } }))
console.log('guest data', day, Math.round(fs.statSync(out).size / 1024) + ' KB')
