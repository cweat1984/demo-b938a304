// Product + tenant branding. Rename the product in ONE place: PRODUCT_NAME.
import type * as T from './types'
import { useStore } from './store'
import { useBranding, branding, customName } from './branding'
import vendorMarkWhite from '../assets/vendor/arrowline_mark_white.svg'
import vendorMarkNavy from '../assets/vendor/arrowline_mark_navy.svg'
import vendorMarkPdf from '../assets/vendor/arrowline_mark_navy_pdf.png'

/** Default product name. UI should use appName()/useAppName() — the owner can white-label it in Company branding. */
export const PRODUCT_NAME = 'Southern Command'
export const appName = () => branding().appName || PRODUCT_NAME
/** 'Southern Store' for Southern; '<Short name> Store' once the app is white-labelled. */
export const storeLabel = (b = branding()) => (b.name === 'Southern Lifting & Hoisting' ? 'Southern Store' : `${b.shortName || 'Company'} Store`)
export const useAppName = () => useBranding(s => s.b.appName) || PRODUCT_NAME

/** Single tenant today. Every DB snapshot carries tenantId; a multi-company backend scopes all reads/writes by it. */
export const DEFAULT_TENANT_ID = 'tenant-slh'

export const DEFAULT_COMPANY: T.CompanyProfile = {
  id: DEFAULT_TENANT_ID,
  name: 'Southern Lifting & Hoisting',
  shortName: 'SLH',
  assistantName: 'Southern',
  phone: '(405) 555-0100',
  logo: undefined,
  modules: { craneRigging: true },
}

/** Tenant profile = seeded DB profile, with the owner's browser-stored branding on top (name, short name, logo). */
export const companyOf = (db?: T.DB, b = branding()): T.CompanyProfile => {
  const base = { ...DEFAULT_COMPANY, ...(db?.company ?? {}) }
  // dive3 M14: a renamed company gets its own assistant name ("Ask BMM") and phone, unless the owner set them in Settings
  const assistantName = customName(b) && base.assistantName === DEFAULT_COMPANY.assistantName ? (b.shortName || base.assistantName) : base.assistantName
  return { ...base, name: b.name || base.name, shortName: b.shortName || base.shortName, assistantName, phone: b.phone?.trim() || base.phone, logo: b.logo ?? base.logo, modules: { ...DEFAULT_COMPANY.modules, ...(db?.company?.modules ?? {}) } }
}
export const useCompany = () => { const b = useBranding(s => s.b); return companyOf(useStore(s => s.db), b) }
/** Pages that only make sense for crane & rigging companies (hidden when the module is off). */
export const CRANE_PAGES = ['configs', 'lifts', 'windfarms', 'moves'] as const

// ── Vendor (platform) brand ────────────────────────────────────────────────
// Separate from the tenant above: the tenant (Southern) owns the product name, logo and
// colors; the vendor is the company that builds/licenses the platform and shows up only as
// a small "Powered by" credit. Swap this block to rebrand the top level for another vendor.

export const VENDOR_NAME = 'Arrowline'
export const VENDOR_BRAND = {
  name: VENDOR_NAME,
  wordmark: 'ARROWLINE',
  poweredBy: `Powered by ${VENDOR_NAME}`,
  about: `This app is built and supported by ${VENDOR_NAME}, which makes operations software for crane, rigging and heavy-haul companies. Your company's name, logo and data stay yours.`,
  colors: { navy: '#0f2d52', orange: '#c4581c' },
  font: "'Arrowline Cinzel', 'Cinzel', Georgia, serif",
  /** Mark-only logos. `onDark` = white mark (dark themes), `onLight` = navy mark (light themes). */
  logo: { onDark: vendorMarkWhite, onLight: vendorMarkNavy, pdfPng: vendorMarkPdf, aspect: 4099.2 / 2936.2 },
} as const
