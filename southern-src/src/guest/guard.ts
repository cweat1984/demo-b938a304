/** Guest read-only guard for the side stores (permits, pickups, tickets, site library, moves, bids…).
 *  The main store's commit() is guarded in GuestLayer; these stores write with their own actions/setState
 *  and persist to localStorage, so a guest's click must be undone in memory AND never saved. */
import type { StoreApi } from 'zustand'

type Api = Pick<StoreApi<Record<string, unknown>>, 'getState' | 'setState'>
let isGuest: () => boolean = () => false
let blocked: () => void = () => {}

/** Actions that only load/seed demo data or change what's on screen — allowed (kept in memory only). */
const SAFE_ACTION = /^(seed|seeded|ensure|init|load|hydrate|select|reveal|open\w*|read\w*|say|bubbles|list|get\w*|is\w*|has\w*)$/
/** localStorage keys a guest may still write: session, UI prefs/tips, the guest pass itself, suggestions/design notes. */
const KEY_OK = /^sc-(session|prefs|present|nav-v1|tips?|inv-tips|cmd-q|certhub-tab|fbdock-y|feedback-v1|keep|guest$|guest-hint|guest-device|guest-locked|gp-|brief|role-brief|tour)/

/** Wrap every mutating action: run it, and if it changed the store for a guest, put the state back. */
function guardActions(api: Api) {
  const patch: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(api.getState())) {
    if (typeof v !== 'function' || SAFE_ACTION.test(k)) continue
    const fn = v as (...a: unknown[]) => unknown
    patch[k] = (...a: unknown[]) => {
      if (!isGuest()) return fn(...a)
      const before = api.getState(); const r = fn(...a)
      if (api.getState() !== before) { api.setState(before, true); blocked() }
      return r
    }
  }
  api.setState(patch)
}
/** Stores changed from outside (usePickup.setState(...)): block guest changes to the data keys (or all keys). */
function guardSetState(api: Api, keys?: string[]) {
  const orig = api.setState.bind(api) as Api['setState']
  ;(api as { setState: Api['setState'] }).setState = ((p: unknown, r?: boolean) => {
    if (isGuest()) {
      const cur = api.getState()
      const next = typeof p === 'function' ? (p as (s: unknown) => Record<string, unknown>)(cur) : p as Record<string, unknown>
      const touched = next ? Object.keys(next).filter(k => next[k] !== cur[k]) : []
      if (touched.length && (!keys || touched.some(k => keys.includes(k)))) { blocked(); return }
      return orig(next as never, r as never)
    }
    return orig(p as never, r as never)
  }) as Api['setState']
}
let storageWrapped = false
function guardStorage() {
  if (storageWrapped) return; storageWrapped = true
  const set = Storage.prototype.setItem, rm = Storage.prototype.removeItem
  Storage.prototype.setItem = function (k: string, v: string) {
    if (this === localStorage && isGuest() && k.startsWith('sc-') && !KEY_OK.test(k)) return
    return set.call(this, k, v)
  }
  Storage.prototype.removeItem = function (k: string) {
    if (this === localStorage && isGuest() && k.startsWith('sc-') && !KEY_OK.test(k)) return
    return rm.call(this, k)
  }
}

let done = false
export async function guardGuestWrites(guest: () => boolean, onBlocked: () => void) {
  isGuest = guest; blocked = onBlocked
  guardStorage()
  if (done) return; done = true
  const [g, b3, b4, l2, npt, da, rig, dq, nc, un, unN, tc, pk, mv, bd, wx] = await Promise.all([
    import('../gapb/gstore'), import('../batch3b/b3store'), import('../batch4/b4store'), import('../launch2/l2store'),
    import('../gapA/npt'), import('../gapA/drug'), import('../gapA/rigging'), import('../gapA/dq'), import('../gapA/nccco'),
    import('../union/ustore'), import('../union/unionNotes'), import('../union/turbine'),
    import('../batch3/pickupData'), import('../data/moves'), import('../batch3/bidsData'), import('../batch3/weatherData'),
  ])
  for (const s of [g.useG, b3.useB3, b4.useB4, l2.useL2, npt.useNpt, da.useDa, rig.useRig, dq.useDq, nc.useNccco, un.useUnion, unN.useUnionNotes, tc.useTurbineCounty]) guardActions(s as unknown as Api)
  guardSetState(pk.usePickup as unknown as Api, ['assigned', 'pickups'])
  guardSetState(mv.useMoves as unknown as Api)
  guardSetState(bd.useBids as unknown as Api)
  guardSetState(wx.useWx as unknown as Api, ['standdowns'])
}

/** A guest's in-memory copy of the database: no personal details ever; no pay/AP/AR/time detail unless the pass is full-app.
 *  (Never saved or broadcast — store.commit skips both for guests.) */
export function scrubDb<D extends Record<string, unknown>>(db: D, scope?: string): D {
  const full = scope === 'all'
  const d = { ...db, __guest: true } as Record<string, unknown> // marked: a guest copy is never saved
  d.employees = ((db.employees as Record<string, unknown>[]) ?? []).map(e => ({
    ...e, phone: '', email: '', address: undefined, mailingAddress: undefined, emergencyContact: undefined, emergencyContacts: undefined,
    veteran: undefined, sizes: undefined, shirt: undefined, boot: undefined, ...(full ? {} : { rate: 0 }),
  }))
  // outside crane rates / POs are money: never in a guest's copy unless the pass is 'all'
  if (!full && Array.isArray(d.jobs)) d.jobs = (d.jobs as Record<string, unknown>[]).map(j => Array.isArray(j.outside) ? { ...j, outside: (j.outside as Record<string, unknown>[]).map(o => ({ ...o, rate: undefined, po: undefined })) } : j)
  // job values, stock costs, PO lines and shop labor/parts are money: zeroed in a guest copy unless the pass is 'all'
  if (!full) {
    const z = (k: string, f: (x: Record<string, unknown>) => Record<string, unknown>) => { if (Array.isArray(d[k])) d[k] = (d[k] as Record<string, unknown>[]).map(f) }
    z('jobs', j => ({ ...j, extras: Array.isArray(j.extras) ? (j.extras as Record<string, unknown>[]).map(x => ({ ...x, rate: 0, cost: 0 })) : j.extras, dayRate: 0, quote: j.quote ? { ...(j.quote as object), revenue: 0, costBudget: 0, mobDemob: 0 } : j.quote }))
    z('items', it => ({ ...it, cost: 0 }))
    d.billingReview = []
    z('pos', p => ({ ...p, lines: ((p.lines as Record<string, unknown>[]) ?? []).map(l => ({ ...l, cost: 0 })), credits: ((p.credits as Record<string, unknown>[]) ?? []).map(c => ({ ...c, amount: 0 })) }))
    z('workOrders', w => ({ ...w, laborRate: 0, parts: ((w.parts as Record<string, unknown>[]) ?? []).map(x => ({ ...x, cost: 0 })) }))
  }
  for (const k of ['infoChanges', 'audit']) if (Array.isArray(d[k])) d[k] = []
  if (!full) for (const k of ['time', 'timeRecs', 'bills', 'invoices', 'pto', 'hires', 'costs']) if (Array.isArray(d[k])) d[k] = []
  return d as D
}
