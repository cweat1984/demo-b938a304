/** Design notepad + Suggest board (Blueprint 5.20). Local-only store ('sc-feedback-v1'), separate from the main db. */
import { create } from 'zustand'
import { useStore } from './store'
import { uid } from '../lib/util'
import type { RoleKey } from './types'

export interface PageNote { love: string; hate: string; ideas: string; updated?: string }
export type SugStatus = 'New' | 'Planned' | 'Building' | 'Shipped' | "Won't do"
export const SUG_STATUSES: SugStatus[] = ['New', 'Planned', 'Building', 'Shipped', "Won't do"]
export interface Suggestion { id: string; kind: 'Bug' | 'Idea'; title: string; details: string; page: string; screenshot?: string; by: string; role: RoleKey; at: string; votes: string[]; status: SugStatus; comments: { by: string; at: string; text: string }[] }
export interface Inbox { id: string; to: string; title: string; body: string; at: string; read: boolean; sugId: string }
interface FState { designMode: boolean; notes: Record<string, PageNote>; suggestions: Suggestion[]; inbox: Inbox[]; v: number }
const KEY = 'sc-feedback-v1'
const ago = (h: number) => new Date(Date.now() - h * 3600e3).toISOString()
const SEED: Suggestion[] = [
  { id: 'sg-1', kind: 'Idea', title: 'Show crane mats on the load-out by default', details: 'Every move we forget to count mats. Put them on the list automatically when the site is soft ground.', page: 'moves', by: 'Lori Haynes', role: 'dispatch', at: ago(70), votes: ['Lori Haynes', 'Chad Weathers', 'Wade Parker', 'John Smith', 'Robert Adams'], status: 'Planned', comments: [{ by: 'Chad Weathers', at: ago(60), text: 'Yes — tie it to the site recon soil note.' }] },
  { id: 'sg-2', kind: 'Bug', title: 'Ticket signature pad is tiny on small phones', details: 'On my iPhone SE the pad is cut off at the bottom.', page: 'field', by: 'John Smith', role: 'field', at: ago(50), votes: ['John Smith', 'Cale Smith'], status: 'Building', comments: [] },
  { id: 'sg-3', kind: 'Idea', title: 'Text me when my load is 30 minutes out', details: 'Crew on site wants a heads-up so we can have the assist crane ready.', page: 'moves', by: 'John Smith', role: 'field', at: ago(40), votes: ['John Smith', 'Lori Haynes', 'Wade Parker'], status: 'New', comments: [] },
  { id: 'sg-4', kind: 'Idea', title: 'Per diem auto-fill from hotel receipts', details: 'If I upload the hotel folio, fill the per diem nights for me.', page: 'time', by: 'Karen Ortiz', role: 'payroll', at: ago(120), votes: ['Karen Ortiz', 'Greg Lindsey'], status: 'Shipped', comments: [{ by: 'Chad Weathers', at: ago(30), text: 'Shipped in the expenses module.' }] },
  { id: 'sg-5', kind: 'Bug', title: 'Dispatch board scrolls back to Monday after a drag', details: 'After dropping a crew on Thursday it jumps to the start of the week.', page: 'dispatch', by: 'Lori Haynes', role: 'dispatch', at: ago(26), votes: ['Lori Haynes'], status: 'New', comments: [] },
  { id: 'sg-6', kind: 'Idea', title: 'Barcode the counterweight slabs', details: 'Stencil + QR on every slab so the yard can scan them onto a trailer.', page: 'moves', by: 'Robert Adams', role: 'shop', at: ago(90), votes: ['Robert Adams', 'Brian Morris', 'Chad Weathers', 'Wade Parker'], status: 'Planned', comments: [] },
  { id: 'sg-7', kind: 'Idea', title: 'Spanish language toggle on the phone', details: 'Half my riggers would use it more in Spanish.', page: 'field', by: 'Cale Smith', role: 'safety', at: ago(200), votes: ['Cale Smith', 'Dana Whitfield', 'John Smith', 'Tammy Rhodes', 'Lori Haynes', 'Wade Parker'], status: 'Building', comments: [] },
  { id: 'sg-8', kind: 'Idea', title: 'Dark mode for the shop tablets', details: 'Bright white screens in the shop at 5 a.m. are rough.', page: 'shop', by: 'Robert Adams', role: 'shop', at: ago(300), votes: ['Robert Adams', 'John Smith'], status: 'Shipped', comments: [{ by: 'Chad Weathers', at: ago(250), text: 'Jen Mode is live — Settings → Theme.' }] },
  { id: 'sg-9', kind: 'Idea', title: 'Let customers see the move board', details: 'Red River Refining keeps calling to ask how many loads have landed.', page: 'moves', by: 'Chris Ramos', role: 'sales', at: ago(12), votes: ['Chris Ramos'], status: 'New', comments: [] },
  { id: 'sg-10', kind: 'Idea', title: 'Swag store points for safety observations', details: 'Reward near-miss reports with store credit.', page: 'safety', by: 'Dana Whitfield', role: 'hr', at: ago(160), votes: ['Dana Whitfield', 'Cale Smith', 'Tammy Rhodes'], status: "Won't do", comments: [{ by: 'Chad Weathers', at: ago(140), text: 'Not now — we don\u2019t want to incentivize volume over quality.' }] },
]
const fresh = (): FState => ({ designMode: true, notes: {}, suggestions: SEED, inbox: [], v: 1 })
const load = (): FState => { try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s?.v === 1) return s } catch { /* */ } return fresh() }
export const useFeedback = create<FState>(() => load())
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(useFeedback.getState())) } catch { /* quota: drop screenshots? */ } }
const mut = (fn: (s: FState) => void) => { const s = structuredClone(useFeedback.getState()); fn(s); useFeedback.setState(s); save() }
const me = () => useStore.getState().session

export const fb = {
  setDesignMode(v: boolean) { mut(s => { s.designMode = v }) },
  setNote(page: string, patch: Partial<PageNote>) { mut(s => { s.notes[page] = Object.assign({ love: '', hate: '', ideas: '' }, s.notes[page], patch, { updated: new Date().toISOString() }) }) },
  add(p: Pick<Suggestion, 'kind' | 'title' | 'details' | 'page' | 'screenshot'>) { const ss = me(); const id = uid('sg'); mut(s => { s.suggestions.unshift({ ...p, id, by: ss?.name ?? 'Demo user', role: ss?.role ?? 'owner', at: new Date().toISOString(), votes: [ss?.name ?? 'Demo user'], status: 'New', comments: [] }) }); return id },
  vote(id: string) { const n = me()?.name ?? 'Demo user'; mut(s => { const g = s.suggestions.find(x => x.id === id)!; g.votes = g.votes.includes(n) ? g.votes.filter(v => v !== n) : [...g.votes, n] }) },
  comment(id: string, text: string) { mut(s => { s.suggestions.find(x => x.id === id)!.comments.push({ by: me()?.name ?? 'Demo user', at: new Date().toISOString(), text }) }) },
  setStatus(id: string, status: SugStatus) {
    const g = useFeedback.getState().suggestions.find(x => x.id === id)!
    mut(s => {
      const x = s.suggestions.find(y => y.id === id)!; x.status = status
      if (status === 'Shipped') s.inbox.unshift({ id: uid('ib'), to: x.by, sugId: id, title: 'Your idea shipped 🎉', body: `“${x.title}” is live. Thanks for making the app better.`, at: new Date().toISOString(), read: false })
    })
    if (status === 'Shipped' && g.status !== 'Shipped') {
      // also lands in the main notification bell for the submitter's role
      useStore.getState().commit('Suggestion shipped', 'Suggest board', g.title, db => { db.notices.unshift({ id: uid('n'), at: new Date().toISOString(), severity: 'Info', title: `Your idea shipped — “${g.title}”`, body: `Suggested by ${g.by}. Thanks for making the app better.`, mandatory: false, roles: [g.role], read: false }) }, { silent: true })
    }
  },
  readInbox(name: string) { mut(s => { s.inbox.forEach(i => { if (i.to === name) i.read = true }) }) },
  reset() { localStorage.removeItem(KEY); useFeedback.setState(fresh()) },
}
export const canAdmin = (role?: RoleKey) => role === 'owner' || role === 'ops' || role === 'branch'

export function exportNotes(): { md: string; json: string } {
  const s = useFeedback.getState()
  const entries = Object.entries(s.notes).filter(([, n]) => n.love || n.hate || n.ideas)
  const lines: string[] = [`# Design notes — ${new Date().toLocaleString()}`, '']
  for (const [p, n] of entries) {
    lines.push(`## ${p === '_app' ? 'Whole app' : p}`, '')
    if (n.love) lines.push(`**Love it:** ${n.love}`, '')
    if (n.hate) lines.push(`**Hate it:** ${n.hate}`, '')
    if (n.ideas) lines.push(`**Ideas:** ${n.ideas}`, '')
  }
  if (!entries.length) lines.push('_No notes yet._')
  const md = lines.join('\n')
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), by: me()?.name, notes: Object.fromEntries(entries) }, null, 2)
  return { md, json }
}
