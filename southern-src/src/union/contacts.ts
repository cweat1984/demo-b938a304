/** Who to call at each IUOE local. Hall addresses/phones come from the official IUOE local finder (iuoe.org, retrieved 2026-10-16);
 *  officers/staff only where the local's own website lists them (retrieved 2026-10-24). Nothing here is guessed — unknowns stay null
 *  and the sheet shows "Not on file, add contact". Admin edits are saved separately in ./unionNotes (localStorage). */
import halls from './geo/halls.json'

export interface Hall { name: string; addr: string | null; phone: string | null; hours?: string; src: string }
export interface Person { role: string; name: string; src: string }
export interface Rule { key: RuleKey; text: string; src: string }
export type RuleKey = 'dispatch' | 'travel' | 'ot' | 'holidays' | 'showup' | 'perdiem'
export const RULES: { key: RuleKey; label: string }[] = [
  { key: 'dispatch', label: 'Dispatch / hall call-out' }, { key: 'travel', label: 'Travel / zone pay' }, { key: 'ot', label: 'Overtime, night & shift' },
  { key: 'holidays', label: 'Holidays' }, { key: 'showup', label: 'Show-up pay' }, { key: 'perdiem', label: 'Per diem / subsistence' },
]
export interface Fringe { hw?: number; pension?: number; annuity?: number; training?: number; other?: { label: string; v: number }[]; src: string; eff?: string }
export interface Contact { halls: Hall[]; people: Person[]; website: string | null; websiteSrc?: string; rules: Rule[]; fringe?: Fringe; verified: string[] }

const IUOE_FINDER = 'https://www.iuoe.org/find-an-iuoe-local-union/'
const fmtPhone = (p: string | null) => { if (!p) return null; const d = p.replace(/\D/g, ''); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p }

/** Verified on the locals' own websites, 2026-10-24. */
const VERIFIED: Record<string, Partial<Contact>> = {
  '627': {
    halls: [
      { name: 'Local 627 · District I (Tulsa)', addr: '12109 E Skelly Dr, Tulsa, OK 74128', phone: '(918) 437-0370', hours: 'Mon–Fri 8am–5pm', src: 'https://www.iuoelocal627.org/' },
      { name: 'Local 627 · District II (Oklahoma City)', addr: '9412 N Robinson Ave, Oklahoma City, OK 73114', phone: '(405) 848-7400', hours: 'Mon–Fri 8am–5pm', src: 'https://www.iuoelocal627.org/' },
    ],
    people: [
      { role: 'Business Manager / Recording-Corresponding Secretary', name: 'Michael L. Stark Jr.', src: 'https://www.iuoelocal627.org/officers-and-staff.html' },
      { role: 'President · District I Business Agent (Tulsa)', name: 'Justin Evans', src: 'https://www.iuoelocal627.org/officers-and-staff.html' },
      { role: 'District I Business Agent (Tulsa)', name: 'Frank Sanchez', src: 'https://www.iuoelocal627.org/officers-and-staff.html' },
      { role: 'Treasurer · District II Business Agent (OKC)', name: 'Garner Dollar', src: 'https://www.iuoelocal627.org/officers-and-staff.html' },
    ],
    website: 'https://www.iuoelocal627.org/', websiteSrc: 'https://www.iuoelocal627.org/',
  },
  '178': {
    halls: [{ name: 'Local 178 · Fort Worth (North Richland Hills)', addr: '4025 Rufe Snow Dr, Fort Worth, TX 76180', phone: '(817) 284-1191', src: 'https://www.local178.org/en/information/contact-us' },
      { name: 'Local 178 · toll-free', addr: null, phone: '(800) 633-6028', src: 'https://www.local178.org/' }],
    people: [
      { role: 'Business Manager', name: 'Robert Teran', src: 'https://www.local178.org/' },
      { role: 'West Texas Business Agent', name: 'Ricky Twombly', src: 'https://www.local178.org/' },
      { role: 'Business Agent', name: 'Robert Hilty', src: 'https://www.local178.org/' },
      { role: 'Apprenticeship Coordinator', name: 'Nick Webb', src: 'https://www.local178.org/' },
    ],
    website: 'https://www.local178.org/', websiteSrc: 'https://www.local178.org/',
  },
  '450': {
    halls: [
      { name: 'Local 450 · Headquarters (Dayton)', addr: '13315 Hwy 146 S, Dayton, TX 77535 (mail: PO Box 1410, Mont Belvieu, TX 77580)', phone: '(936) 258-5516 ext. 101', hours: 'Mon–Fri 7:30am–4:30pm', src: 'https://iuoelocal450.org/about-us/' },
      { name: 'Local 450 · Beaumont office', addr: '745 W Cardinal Dr, Beaumont, TX 77705', phone: '(936) 258-5516 ext. 102', src: 'https://iuoelocal450.org/about-us/' },
      { name: 'Local 450 · Clute office', addr: '200 Brazosport Blvd, Clute, TX 77531', phone: '(936) 258-5516 ext. 132', src: 'https://iuoelocal450.org/about-us/' },
    ],
    people: [], website: 'https://iuoelocal450.org/', websiteSrc: 'https://iuoelocal450.org/',
  },
}
/** Published CBA terms (only Local 302 has a public agreement in our dataset — NWCOA 2024-2028). */
const CBA_302 = 'https://www.iuoe302.org/Contracts/Western%20Washington/2024-2027/NWCOA%202024-2028.pdf'
const VERIFIED_RULES: Record<string, Rule[]> = {
  '302': [
    { key: 'ot', text: '1.5× over 8/day (10 on 4×10s) or 40/wk, outside 5am–6pm, all Saturday; 2× 6pm Sat–5am Mon, holidays, >12 h/shift (Art. 17 §1). Second/special shift: base + $2.00/h.', src: CBA_302 },
  ],
}
const VERIFIED_FRINGE: Record<string, Fringe> = {
  '302': { hw: 10.72, pension: 16.8, training: 1.05, other: [{ label: 'Contract admin', v: 0.04 }], src: CBA_302, eff: '2026' },
}

const H = halls as unknown as Record<string, { city: string; st: string; addr: string | null; zip: string | null; phone: string | null; web: string | null; url: string }[]>
export function baseContact(local: string | number): Contact {
  const k = String(local), v = VERIFIED[k], offices = H[k] ?? []
  const verified: string[] = []
  const fromFinder: Hall[] = offices.map(o => ({ name: `Local ${k} · ${o.city}`, addr: o.addr ? `${o.addr}, ${o.city}, ${o.st}${o.zip ? ' ' + o.zip : ''}` : null, phone: fmtPhone(o.phone), src: o.url || IUOE_FINDER }))
  if (v) verified.push('halls', 'website'); if (v?.people?.length) verified.push('people'); else if (fromFinder.length) verified.push('halls')
  return {
    halls: v?.halls ?? fromFinder, people: v?.people ?? [], website: v?.website ?? offices.find(o => o.web)?.web ?? null, websiteSrc: v?.websiteSrc ?? offices[0]?.url,
    rules: VERIFIED_RULES[k] ?? [], fringe: VERIFIED_FRINGE[k], verified,
  }
}
