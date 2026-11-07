// dive3 M13: an approved expense coded to a job really lands in job cost (db.costs, source "Expense"),
// and comes back out if it's un-approved or rejected. Idempotent: one cost row per expense (refId exp:<id>).
import { useStore } from '../data/store'
import { useL2, type Expense } from './l2store'
import type * as T from '../data/types'

const POSTED = new Set(['Approved', 'In QuickBooks'])
export const expCategory = (c: string): T.CostCategory => /fuel|diesel|gas/i.test(c) ? 'Fuel' : /permit|escort/i.test(c) ? 'Permits & Escorts' : /lodg|hotel|meal|per ?diem/i.test(c) ? 'Per Diem' : /rent/i.test(c) ? 'Equipment Rental' : /material|part|supply/i.test(c) ? 'Materials' : 'Other'

export function syncExpenseCosts(exps: Expense[] = useL2.getState().expenses) {
  const st = useStore.getState(), db = st.db
  if (!db?.costs) return
  const want = new Map<string, { e: Expense; jobId: string }>()
  for (const e of exps) { if (!POSTED.has(e.status) || !e.jobNo) continue; const j = db.jobs.find(x => x.jobNo === e.jobNo); if (j) want.set('exp:' + e.id, { e, jobId: j.id }) }
  const have = db.costs.filter(c => c.source === 'Expense')
  const add = [...want].filter(([ref, w]) => { const c = have.find(x => x.refId === ref); return !c || c.amount !== w.e.amount || c.jobId !== w.jobId })
  const drop = have.filter(c => !want.has(c.refId ?? ''))
  if (!add.length && !drop.length) return
  st.commit('Posted expenses to job cost', add.length ? `${add.length} expense(s)` : `${drop.length} removed`, [...add.map(([, w]) => `${w.e.merchant} $${w.e.amount.toLocaleString()} → #${w.e.jobNo}`), ...drop.map(c => `removed ${c.description}`)].join(' · '), d => {
    const gone = new Set([...drop.map(c => c.refId), ...add.map(([r]) => r)])
    d.costs = d.costs.filter(c => !(c.source === 'Expense' && gone.has(c.refId)))
    for (const [ref, w] of add) d.costs.push({ id: 'co-' + ref.replace(':', '-'), jobId: w.jobId, date: w.e.date, category: expCategory(w.e.category), description: `Expense — ${w.e.merchant} (${w.e.who})`, amount: w.e.amount, source: 'Expense', refId: ref, by: w.e.who })
  }, { silent: true })
}

let started = false
export function startExpenseSync() {
  if (started) return; started = true
  useL2.subscribe((s, p) => { if (s.expenses !== p.expenses) syncExpenseCosts(s.expenses) })
  useStore.subscribe((s, p) => { if (s.db !== p.db && s.db?.seededAt !== p.db?.seededAt) syncExpenseCosts() })
  setTimeout(() => syncExpenseCosts(), 0)
}
