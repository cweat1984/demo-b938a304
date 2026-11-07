// dive3 M14: once the owner renames the company, division names follow the brand ("Southern Transport" → "BMM Transport").
// Display-only: derived from the seed names every time, so Reset branding (or the daily reseed) puts Southern back.
import { useStore } from './store'
import { useBranding, customName } from './branding'
import { DIVISIONS } from './seed'

const TAIL: Record<string, string> = Object.fromEntries(DIVISIONS.map(d => [d.id, d.name.replace(/^(Southern|SLH)\s+/, '')]))
const ORIG: Record<string, string> = Object.fromEntries(DIVISIONS.map(d => [d.id, d.name]))

function apply() {
  const st = useStore.getState(), db = st.db
  if (!db?.divisions) return
  const b = useBranding.getState().b
  // only rewrite names that still look seeded (an owner who typed their own division name keeps it)
  const prevShort = (prev ?? b).shortName
  const next = db.divisions.map(d => { if (!(d.id in TAIL)) return d; const seeded = d.name === ORIG[d.id] || d.name === `${prevShort} ${TAIL[d.id]}` || d.name === `${b.shortName} ${TAIL[d.id]}`; if (!seeded) return d; const n = customName(b) ? `${b.shortName.trim()} ${TAIL[d.id]}` : ORIG[d.id]; return n === d.name ? d : { ...d, name: n } })
  prev = b
  if (next.some((d, i) => d !== db.divisions[i])) useStore.setState({ db: { ...db, divisions: next } })
}
let prev: ReturnType<typeof useBranding.getState>['b'] | null = null
let started = false
export function startBrandSync() {
  if (started) return; started = true
  useBranding.subscribe(() => apply())
  useStore.subscribe((s, p) => { if (s.db !== p.db && s.db?.divisions !== p.db?.divisions) apply() })
  apply()
}
