// Demo My Info data: sizes, extra emergency contacts, a few recent self-service changes for HR to review.
import type * as T from './types'
import { rng, addDays } from '../lib/util'

export function seedMyInfo(T0: string, employees: T.Employee[]): T.InfoChange[] {
  const r = rng(9191)
  const S = ['S', 'M', 'L', 'XL', '2XL', '3XL']
  employees.forEach((e, i) => {
    if (e.emergencyContact) e.emergencyContacts = [e.emergencyContact]
    if (e.shirt) e.sizes = { shirt: e.shirt, hoodie: e.shirt, jacket: e.shirt, boots: e.boot ? String(e.boot) : undefined, hat: 'Flexfit L/XL', gloves: 'XL' }
    else if (r.next() < 0.75) { const s = r.pick(S.slice(1)); e.sizes = { shirt: s, hoodie: s, jacket: r.pick([s, S[Math.min(S.length - 1, S.indexOf(s) + 1)]]), hat: r.pick(['Snapback', 'Flexfit L/XL']), boots: r.pick(['9', '10', '10.5', '11', '11.5', '12']) + (r.next() < 0.2 ? ' W' : ''), gloves: r.pick(['L', 'XL', 'XL', '2XL']) } }
    if (i % 9 === 4 && e.emergencyContacts?.length) e.emergencyContacts.push({ name: `${r.pick(['Ray', 'Glenda', 'Mike', 'Pam'])} ${e.last}`, relation: 'Parent', phone: e.phone.replace(/\d{4}$/, String(r.int(1000, 9999))) })
    if (i % 13 === 6) e.mailingAddress = `PO Box ${r.int(100, 9999)}, ${(e.address ?? '').split(', ').slice(1).join(', ')}`
  })
  const at = (d: number, h: number) => `${addDays(T0, -d)}T${h}:12:00.000Z`
  const pick = (k: number) => employees.filter(e => e.status === 'Active')[k]
  const out: T.InfoChange[] = []
  const a = pick(7), b = pick(15), c = pick(23)
  if (a) { const old = a.address ?? ''; a.address = `${r.int(100, 9999)} SW 59th St, Oklahoma City, OK 73119`; out.push({ id: 'ic-s1', employeeId: a.id, at: at(1, 14), by: `${a.first} ${a.last}`, field: 'address', label: 'Home address', from: old, to: a.address, payroll: true }) }
  if (b) { const old = b.phone; b.phone = b.phone.replace(/\d{4}$/, '0147'); out.push({ id: 'ic-s2', employeeId: b.id, at: at(2, 16), by: `${b.first} ${b.last}`, field: 'phone', label: 'Cell phone', from: old, to: b.phone }) }
  if (c) { const from = c.sizes?.shirt ?? ''; c.sizes = { ...(c.sizes ?? {}), shirt: '2XL' }; out.push({ id: 'ic-s3', employeeId: c.id, at: at(3, 13), by: `${c.first} ${c.last}`, field: 'shirt', label: 'Shirt', from, to: '2XL', hrSeen: true }) }
  return out
}

/** A few past cert sends so Safety / HR logs aren't empty (all marked demo). */
export function seedCertShares(T0: string, employees: T.Employee[], certs: T.Cert[], assignments: T.Assignment[]): T.CertShare[] {
  const out: T.CertShare[] = []
  const recent = assignments.filter(a => a.date >= addDays(T0, -5) && a.date < T0)
  const seen = new Set<string>()
  for (const a of recent) {
    if (out.length >= 4 || seen.has(a.employeeId)) continue
    const e = employees.find(x => x.id === a.employeeId); const cs = certs.filter(c => c.employeeId === a.employeeId && c.expires >= T0)
    if (!e || !cs.length) continue
    seen.add(e.id)
    const at = `${a.date}T12:${String(10 + out.length * 7).padStart(2, '0')}:00.000Z`
    const text = out.length % 2 === 1
    out.push({ id: `cs-seed-${out.length + 1}`, token: `demo${out.length + 1}${e.empNo.replace(/\D/g, '')}`, employeeIds: [e.id], certIds: cs.map(c => c.id), jobId: a.jobId, to: text ? { name: 'Gate security', phone: '(580) 555-0142' } : { name: 'Site safety rep', email: 'safety@customer.example.com' }, channel: text ? 'Text' : 'Email', note: text ? undefined : 'Crane operator for the morning pick', by: `${e.first} ${e.last}`, byId: e.id, at, status: 'Sent', sentAt: at, expires: new Date(new Date(at).getTime() + 7 * 864e5).toISOString(), demo: true })
  }
  return out
}
