// Batch 4: maintenance & inspections, messaging & alerts, text tickets, accounting sync. Own persisted slice.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { toast } from 'sonner'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { jobCosting } from '../data/logic'
import { addDays, today, diffDays } from '../lib/util'

export type RAG = 'red' | 'amber' | 'green'
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)
export interface PmLine { kind: 'Hours' | 'Miles' | 'Days'; label: string; due: string; left: string; rag: RAG }
/** PM schedule per unit: hours (250-hr service), miles (10k), days (90-day / annual). */
export function pmFor(u: T.Equipment): PmLine[] {
  const h = hash(u.id), out: PmLine[] = []
  if (u.hours != null) { const next = u.nextServiceAt && u.category === 'Crane' ? u.nextServiceAt : Math.ceil((u.hours + 1) / 250) * 250; const left = next - u.hours; out.push({ kind: 'Hours', label: '250-hr service', due: `${next.toLocaleString()} hrs`, left: `${left} hrs`, rag: left <= 0 ? 'red' : left <= 40 ? 'amber' : 'green' }) }
  if (u.miles != null) { const next = Math.ceil((u.miles + 1) / 10000) * 10000; const left = next - u.miles; out.push({ kind: 'Miles', label: 'Oil & lube (10k mi)', due: `${next.toLocaleString()} mi`, left: `${left.toLocaleString()} mi`, rag: left <= 0 ? 'red' : left <= 1000 ? 'amber' : 'green' }) }
  const d = diffDays(u.nextServiceDate, today()); out.push({ kind: 'Days', label: '90-day service', due: u.nextServiceDate, left: `${d} days`, rag: d < 0 ? 'red' : d <= 14 ? 'amber' : 'green' })
  void h
  return out
}
/** Annual / third-party inspection due (cranes: annual OSHA 1926.1412 + third-party cert). */
// dive2 shop M7: one source — the annual date on the unit record (Equipment page / drawer), no separate made-up date
export const annualDue = (u: T.Equipment) => u.annualInspection || addDays(today(), (hash(u.id) % 200) - 25)
export const ragOf = (u: T.Equipment, insp: Inspection[]): RAG => {
  const lines = pmFor(u).map(l => l.rag); const ad = diffDays(annualDue(u), today())
  if (u.category === 'Crane') lines.push(ad < 0 ? 'red' : ad <= 30 ? 'amber' : 'green')
  if (insp.some(i => i.unitId === u.id && i.items.some(x => x.ok === false && !x.woId))) lines.push('red')
  return lines.includes('red') ? 'red' : lines.includes('amber') ? 'amber' : 'green'
}
export const CHECKLISTS: Record<InspKind, string[]> = {
  Daily: ['Walk-around: leaks, damage', 'Wire rope & hook / latch', 'Load moment indicator test', 'Anti-two-block function', 'Outriggers & pads', 'Tires / tracks', 'Lights, horn, alarms', 'Fluid levels', 'Fire extinguisher'],
  Monthly: ['Boom sections & welds', 'Sheaves & bearings', 'Hydraulic hoses & cylinders', 'Brakes & clutches', 'Wire rope — full length measured', 'Counterweight pins', 'Load chart & decals present', 'Documentation current'],
  Annual: ['Structural inspection (NDT where required)', 'Swing bearing & bolts', 'Hoist drums & pawls', 'Boom & jib pins', 'Load test witnessed', 'LMI calibration', 'Third-party certificate issued'],
}
export type InspKind = 'Daily' | 'Monthly' | 'Annual'
export interface InspItem { k: string; ok: boolean | null; note?: string; photo?: string; woId?: string }
export interface Inspection { id: string; unitId: string; kind: InspKind; at: string; by: string; items: InspItem[] }

export interface Msg { id: string; from: string; text: string; photo?: string; at: string; mentions: string[]; system?: boolean }
export interface Chat { id: string; kind: 'job' | 'dm'; jobId?: string; title: string; members: string[]; customer?: string; msgs: Msg[]; lastRead: number }
export type RuleKey = 'wind' | 'cert' | 'load' | 'ticket'
export interface AlertRule { key: RuleKey; label: string; detail: string; on: boolean; push: boolean; sms: boolean }
export interface FeedAlert { id: string; at: string; rule: RuleKey | 'mention' | 'message'; title: string; body: string; read: boolean; page?: string }
export interface SyncItem { id: string; kind: 'Invoice' | 'Approved expense' | 'Job cost' | 'Bill' | 'Payroll hours'; ref: string; amount: number; target: 'QuickBooks' | 'Paychex'; status: 'Queued' | 'Synced' | 'Failed'; error?: string; attempts: number; at: string }
export interface TextSend { ticketId: string; phone: string; name: string; at: string; signedAt?: string }

const rid = () => Math.random().toString(36).slice(2, 8)
const RULES: AlertRule[] = [
  { key: 'wind', label: 'Wind over the limit', detail: 'Forecast or live gust above the crane’s limit at boom tip', on: true, push: true, sms: true },
  { key: 'cert', label: 'Cert expiring', detail: '60 / 30 / 7 days before; the person and their supervisor', on: true, push: true, sms: false },
  { key: 'load', label: 'Load delivered', detail: 'Samsara geofence or driver check-in at the site', on: true, push: true, sms: false },
  { key: 'ticket', label: 'Ticket signed', detail: 'Customer signs the daily ticket (app, portal or text link)', on: true, push: true, sms: false },
]
interface B4 {
  inspections: Inspection[]; chats: Chat[]; rules: AlertRule[]; feed: FeedAlert[]; sync: SyncItem[]; conn: { qb: boolean; paychex: boolean }; texts: TextSend[]; seeded: boolean
  seed: (db: T.DB) => void
  saveInspection: (i: Inspection) => void
  send: (chatId: string, m: Omit<Msg, 'id' | 'at' | 'mentions'>) => void
  openDm: (me: string, other: string) => string
  read: (chatId: string) => void
  setRule: (k: RuleKey, p: Partial<AlertRule>) => void
  fire: (rule: FeedAlert['rule'], title: string, body: string, page?: string) => void
  readFeed: () => void
  connect: (k: 'qb' | 'paychex', v: boolean) => void
  runSync: () => void
  retry: (id: string) => void
  retryAll: () => void
  textTicket: (t: TextSend) => void
  markSigned: (ticketId: string) => void
}
/** dive3 m8: payroll weeks run Mon–Sun (same as the Time screen) — the last finished week ends on a Sunday. */
const lastSunday = () => { const t = today(), d = new Date(t + 'T12:00:00').getDay(); return addDays(t, -(d === 0 ? 7 : d)) }
export const useB4 = create<B4>()(persist((set, get) => ({
  inspections: [], chats: [], rules: RULES, feed: [], sync: [], conn: { qb: false, paychex: false }, texts: [], seeded: false,
  seed(db) {
    if (get().seeded || !db.jobs.length) return
    const name = (id?: string) => { const e = db.employees.find(x => x.id === id); return e ? `${e.first} ${e.last}` : '' }
    const active = db.jobs.filter(j => j.status === 'On Site' || j.status === 'En Route' || j.status === 'Confirmed').slice(0, 8)
    const now = Date.now()
    const chats: Chat[] = active.map((j, i) => {
      const crew = [...new Set(db.assignments.filter(a => a.jobId === j.id).map(a => name(a.employeeId)))].filter(Boolean).slice(0, 6)
      const cust = db.customers.find(c => c.id === j.customerId)
      const members = [...new Set(['Chad Weathers', 'Lori Haynes', name(j.supervisorId), name(j.pmId), ...crew])].filter(Boolean)
      const sup = name(j.supervisorId) || crew[0] || 'Crew lead'
      return { id: 'job-' + j.id, kind: 'job', jobId: j.id, title: `#${j.jobNo} · ${j.name}`, members, customer: i % 2 === 0 ? cust?.contact : undefined, lastRead: i < 2 ? 1 : 3, msgs: [
        { id: rid(), from: 'Southern', text: `Project chat created for Job #${j.jobNo}. Crew, PM and dispatch added automatically.`, at: new Date(now - (10 - i) * 36e5).toISOString(), mentions: [], system: true },
        { id: rid(), from: sup, text: i % 3 === 0 ? 'On site, gate 2. Pad looks good — setting outriggers now.' : 'Running 20 min behind, construction on US-287.', at: new Date(now - (6 - i * .3) * 36e5).toISOString(), mentions: [] },
        { id: rid(), from: 'Lori Haynes', text: `@${sup.split(' ')[0]} copy. Customer notified.`, at: new Date(now - (5 - i * .3) * 36e5).toISOString(), mentions: [sup] },
      ] }
    })
    chats.push({ id: 'dm-lori', kind: 'dm', title: 'Lori Haynes', members: ['Chad Weathers', 'Lori Haynes'], lastRead: 0, msgs: [{ id: rid(), from: 'Lori Haynes', text: 'Can you approve the extra rigger for Sweetwater tomorrow?', at: new Date(now - 18e5).toISOString(), mentions: [] }] })
    const sync: SyncItem[] = [
      ...db.invoices.slice(0, 4).map((inv, i) => ({ id: rid(), kind: 'Invoice' as const, ref: inv.invNo, amount: inv.amount, target: 'QuickBooks' as const, status: 'Queued' as const, error: undefined, attempts: 0, at: new Date(Math.min(now, new Date(inv.date + 'T17:00:00').getTime())).toISOString() })), // dive3 m8: the invoice's own date, not its list position
      // approved expenses are queued by Accounting Sync itself (one row per expense id, never twice)
      ...db.jobs.filter(j => j.status === 'On Site').slice(0, 2).map(j => ({ id: rid(), kind: 'Job cost' as const, ref: `Job #${j.jobNo} costs to date`, amount: Math.round(jobCosting(db, j).cost), target: 'QuickBooks' as const, status: 'Queued' as const, attempts: 0, at: new Date().toISOString() })),
      { id: rid(), kind: 'Bill', ref: 'Maxim Crane rental · PO 55102', amount: 18400, target: 'QuickBooks', status: 'Queued', attempts: 0, at: new Date().toISOString() },
      { id: rid(), kind: 'Payroll hours', ref: 'Week ending Sun ' + lastSunday(), amount: (() => { const we = lastSunday(), ws = addDays(we, -6); return Math.round(db.time.filter(t => t.date >= ws && t.date <= we).reduce((sum, t) => sum + t.hours * (db.employees.find(e => e.id === t.employeeId)?.rate ?? 0), 0)) })(), target: 'Paychex', status: 'Queued', attempts: 0, at: new Date().toISOString() },
    ]
    const feed: FeedAlert[] = [
      { id: rid(), at: new Date(now - 9e5).toISOString(), rule: 'wind', title: 'Wind over limit — Sweetwater', body: 'Gusts 31 mph at 120 m; limit 25 mph. Crew standing down.', read: false, page: 'messages' },
      { id: rid(), at: new Date(now - 72e5).toISOString(), rule: 'load', title: 'Load 4 delivered', body: 'Counterweight load checked in at the site (Samsara).', read: false, page: 'messages' },
    ]
    set({ seeded: true, chats, sync, feed })
  },
  saveInspection(i) { set({ inspections: [i, ...get().inspections.filter(x => x.id !== i.id)] }) },
  send(chatId, m) {
    const chat = get().chats.find(c => c.id === chatId); if (!chat) return
    const mentions = chat.members.filter(n => new RegExp('@' + n.split(' ')[0] + '\\b', 'i').test(m.text))
    const msg: Msg = { ...m, id: rid(), at: new Date().toISOString(), mentions }
    set({ chats: get().chats.map(c => c.id === chatId ? { ...c, msgs: [...c.msgs, msg], lastRead: c.msgs.length + 1 } : c) })
    mentions.forEach(n => get().fire('mention', `${m.from} mentioned ${n}`, `${chat.title}: ${m.text.slice(0, 80)}`, 'messages'))
  },
  openDm(me, other) { const ex = get().chats.find(c => c.kind === 'dm' && c.members.includes(other) && c.members.includes(me)); if (ex) return ex.id; const id = 'dm-' + rid(); set({ chats: [...get().chats, { id, kind: 'dm', title: other, members: [me, other], msgs: [], lastRead: 0 }] }); return id },
  read(chatId) { set({ chats: get().chats.map(c => c.id === chatId ? { ...c, lastRead: c.msgs.length } : c) }) },
  setRule(k, p) { set({ rules: get().rules.map(r => r.key === k ? { ...r, ...p } : r) }) },
  fire(rule, title, body, page) {
    const r = get().rules.find(x => x.key === rule); if (r && !r.on) return
    set({ feed: [{ id: rid(), at: new Date().toISOString(), rule, title, body, read: false, page }, ...get().feed].slice(0, 60) })
    if (!r || r.push) toast(title, { description: body + (r?.sms ? ' · also texted' : ''), duration: 6000, className: 'push-toast' })
  },
  readFeed() { set({ feed: get().feed.map(f => ({ ...f, read: true })) }) },
  connect(k, v) { set({ conn: { ...get().conn, [k]: v } }) },
  runSync() {
    const c = get().conn
    set({ sync: get().sync.map(s => s.status !== 'Queued' ? s : (s.target === 'QuickBooks' ? c.qb : c.paychex) ? { ...s, status: 'Synced', attempts: s.attempts + 1, at: new Date().toISOString() } : { ...s, status: 'Failed', attempts: s.attempts + 1, error: `${s.target} not connected` }) })
  },
  retryAll() { for (const s of get().sync.filter(x => x.status === 'Failed')) get().retry(s.id) },
  retry(id) { const c = get().conn; set({ sync: get().sync.map(s => s.id !== id ? s : (s.target === 'QuickBooks' ? c.qb : c.paychex) ? { ...s, status: 'Synced', error: undefined, attempts: s.attempts + 1, at: new Date().toISOString() } : { ...s, status: 'Failed', attempts: s.attempts + 1, error: `${s.target} not connected` }) }) },
  textTicket(t) { set({ texts: [t, ...get().texts.filter(x => x.ticketId !== t.ticketId)] }) },
  markSigned(ticketId) { set({ texts: get().texts.map(x => x.ticketId === ticketId ? { ...x, signedAt: new Date().toISOString() } : x) }) },
}), { name: 'sc-batch4', version: 1 }))

/** Open a work order from an inspection defect (main DB, audited). */
export function defectToWorkOrder(unitId: string, item: string, note: string | undefined, kind: InspKind): string {
  const s = useStore.getState(); const db = s.db
  const n = Math.max(7300, ...db.workOrders.map(w => Number(w.woNo.split('-')[1]) || 0)) + 1
  const id = 'wo-insp-' + rid()
  const unit = db.equipment.find(e => e.id === unitId)
  s.commit('Opened work order from inspection', `Unit ${unit?.unit ?? ''}`, `${kind} inspection defect: ${item}`, d => {
    d.workOrders.unshift({ id, woNo: `WO-${n}`, unitId, title: `${kind} inspection: ${item}`, complaint: note || item, priority: /two-block|LMI|brake|structural|wire rope/i.test(item) ? 'Critical' : 'High', status: 'Open', opened: today(), due: today(), parts: [], laborHrs: 0, laborRate: 115, source: 'Inspection' })
  })
  return `WO-${n}`
}
