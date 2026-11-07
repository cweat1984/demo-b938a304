import { useMemo, Fragment } from 'react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { Ref } from './bits'

/** Turns free text into links: "#10125", "Crane 28", "T-204", employee / customer / vendor names, INV-/WO- numbers. */
function useTermIndex() {
  const db = useStore(s => s.db)
  return useMemo(() => {
    const m = new Map<string, T.EntityRef>()
    db.employees.forEach(e => m.set(`${e.first} ${e.last}`, { type: 'employee', id: e.id }))
    db.customers.forEach(c => m.set(c.name, { type: 'customer', id: c.id }))
    db.vendors.forEach(v => m.set(v.name, { type: 'vendor', id: v.id }))
    db.jobs.forEach(j => m.set(`#${j.jobNo}`, { type: 'job', id: j.id }))
    db.invoices.forEach(i => m.set(i.invNo, { type: 'invoice', id: i.id }))
    db.workOrders.forEach(w => m.set(w.woNo, { type: 'workorder', id: w.id }))
    db.bills.forEach(b => m.set(b.billNo, { type: 'bill', id: b.id }))
    db.equipment.forEach(e => { m.set(e.category === 'Crane' ? `Crane ${e.unit}` : e.unit, { type: 'equipment', id: e.id }); if (e.category === 'Crane') m.set(`Unit ${e.unit}`, { type: 'equipment', id: e.id }) })
    const keys = [...m.keys()].filter(k => k.length >= 4).sort((a, b) => b.length - a.length)
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = keys.length ? new RegExp(`(${keys.map(esc).join('|')})(?![0-9A-Za-z])`, 'g') : null
    return { m, re }
  }, [db.employees, db.customers, db.vendors, db.jobs, db.invoices, db.workOrders, db.bills, db.equipment])
}
export default function Linkify({ text, className }: { text: string; className?: string }) {
  const { m, re } = useTermIndex()
  if (!re || !text) return <span className={className}>{text}</span>
  const parts: React.ReactNode[] = []; let last = 0; re.lastIndex = 0; let x: RegExpExecArray | null
  while ((x = re.exec(text))) { if (x.index > last) parts.push(text.slice(last, x.index)); const r = m.get(x[1])!; parts.push(<Ref key={x.index} to={r} className="font-medium">{x[1]}</Ref>); last = x.index + x[1].length }
  if (last < text.length) parts.push(text.slice(last))
  return <span className={className}>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</span>
}
