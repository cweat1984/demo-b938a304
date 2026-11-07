// "My Info" self-service schema. To add a field, add ONE line to MYINFO_FIELDS (path = where it lives on the employee).
import type * as T from './types'

export interface InfoField { key: string; label: string; section: InfoSection; path: string; type?: 'text' | 'tel' | 'email' | 'select' | 'textarea'; options?: string[]; placeholder?: string; /** Changing it flags payroll / tax (e.g. address → state withholding). */ payroll?: boolean }
export type InfoSection = 'Contact' | 'Home address' | 'Mailing address' | 'Swag & uniform sizes'
export const INFO_SECTIONS: InfoSection[] = ['Contact', 'Home address', 'Mailing address', 'Swag & uniform sizes']
const SHIRT = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL']
export const MYINFO_FIELDS: InfoField[] = [
  { key: 'phone', label: 'Cell phone', section: 'Contact', path: 'phone', type: 'tel' },
  { key: 'email', label: 'Email', section: 'Contact', path: 'email', type: 'email' },
  { key: 'address', label: 'Home address', section: 'Home address', path: 'address', type: 'textarea', placeholder: 'Street, city, state, ZIP', payroll: true },
  { key: 'mailing', label: 'Mailing address (if different)', section: 'Mailing address', path: 'mailingAddress', type: 'textarea', placeholder: 'Leave blank if same as home', payroll: true },
  { key: 'shirt', label: 'Shirt', section: 'Swag & uniform sizes', path: 'sizes.shirt', type: 'select', options: SHIRT },
  { key: 'hoodie', label: 'Hoodie', section: 'Swag & uniform sizes', path: 'sizes.hoodie', type: 'select', options: SHIRT },
  { key: 'jacket', label: 'Jacket', section: 'Swag & uniform sizes', path: 'sizes.jacket', type: 'select', options: SHIRT },
  { key: 'hat', label: 'Hat', section: 'Swag & uniform sizes', path: 'sizes.hat', type: 'select', options: ['Snapback', 'Flexfit S/M', 'Flexfit L/XL', 'Flexfit XL/XXL'] },
  { key: 'boots', label: 'Boots', section: 'Swag & uniform sizes', path: 'sizes.boots', type: 'select', options: ['7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '13', '14', '15'].flatMap(s => [s, `${s} W`]) },
  { key: 'gloves', label: 'Gloves', section: 'Swag & uniform sizes', path: 'sizes.gloves', type: 'select', options: ['S', 'M', 'L', 'XL', '2XL'] },
]
export const RELATIONS = ['Spouse', 'Partner', 'Parent', 'Sibling', 'Child', 'Friend', 'Other']

export function getPath(e: T.Employee, path: string): string {
  const v = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], e)
  return v == null ? '' : String(v)
}
export function setPath(e: T.Employee, path: string, v: string) {
  const ks = path.split('.'); let o = e as unknown as Record<string, unknown>
  ks.slice(0, -1).forEach(k => { o[k] = (o[k] as Record<string, unknown>) ?? {}; o = o[k] as Record<string, unknown> })
  o[ks[ks.length - 1]] = v || undefined
}
export const emergencyOf = (e: T.Employee): T.EmergencyContact[] => e.emergencyContacts ?? (e.emergencyContact ? [e.emergencyContact] : [])
export const sizeFor = (e: T.Employee | undefined, item: { name: string; category: string }): string | undefined => {
  if (!e?.sizes) return undefined
  const n = item.name.toLowerCase()
  const k = /hood/.test(n) ? 'hoodie' : /jacket|coat|vest/.test(n) ? 'jacket' : /hat|cap|beanie/.test(n) ? 'hat' : /boot/.test(n) ? 'boots' : /glove/.test(n) ? 'gloves' : /shirt|tee|polo/.test(n) ? 'shirt' : undefined
  return k ? e.sizes[k] && `${MYINFO_FIELDS.find(f => f.key === k)!.label} ${e.sizes[k]}` : undefined
}
