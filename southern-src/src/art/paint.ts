import type { TruckPaint } from './peterbilt'
import type { Palette, ThemeKey } from '../data/themes'
import { SLH_BRAND } from '../data/themes'

/** Show-truck paint jobs per theme. Paint = the truck, so it stays the same in light and dark variants. */
export const PAINT: Partial<Record<ThemeKey, TruckPaint>> = {
  slh: { body: SLH_BRAND.craneGray, lower: SLH_BRAND.black, pin: SLH_BRAND.chevronRed, pin2: SLH_BRAND.white },
  jen: { body: '#0b0b0c', lower: '#1c1c1e', pin: '#3a3a3c', pin2: '#8e8e93', letter: '#8e8e93' },
  miami: { body: '#ec9462', lower: '#f4e6cc', pin: '#1fc4c4', pin2: '#1fc4c4', letter: '#1fc4c4' },
  cotton: { body: '#ffb3d6', lower: '#c3aef0', pin: '#5fd6d3', pin2: '#ffffff', letter: '#7c5fc4' },
  purple: { body: '#6a3dd1', lower: '#2a1650', pin: '#c4cad3', pin2: '#cbb9ff', letter: '#e6e9ee' },
  ivy: { body: '#1d5233', lower: '#0a0d0b', pin: '#d4af37', pin2: '#d4af37', letter: '#d4af37' },
  artillery: { body: '#4b4735', lower: '#121312', pin: '#121312', pin2: '#8b9298', letter: '#c9cbc4' },
}
export function paintFor(key: ThemeKey | undefined, p: Palette): TruckPaint {
  if (key === 'light') return { body: '#f4f5f7', lower: p.primary, pin: '#111214', pin2: p.primary, letter: p.primary }
  return (key && PAINT[key]) || { body: p.primary, lower: p.secondary, pin: p.accent }
}

