import { create } from 'zustand'
import { useStore } from '../data/store'
import type { PageKey } from '../data/roles'
import { useSec } from '../batch5/security'
import { setSimulatedOffline } from '../batch5/offline'
import { fb } from '../data/feedback'
import { guestContext } from '../guest/pass'

export interface Step { id: string; kicker: string; title: string; say: string; page?: PageKey; frame?: string; spot?: string; prep?: () => Promise<void> | void; leave?: () => void }
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const q = (s: string) => document.querySelector<HTMLElement>(s)
async function until(sel: string, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { const el = q(sel); if (el) return el; await wait(80) } return null }
async function clickText(text: string, scope = 'main') { for (let i = 0; i < 40; i++) { const b = [...document.querySelectorAll<HTMLElement>(`${scope} button`)].find(x => x.textContent?.trim().startsWith(text)); if (b) { b.click(); return } await wait(80) } }

export const STEPS: Step[] = [
  { id: 'packs', kicker: '1 · Crane moves', title: 'The crane that packs itself', say: 'Every counterweight, block and pin knows where it is. Untick a piece — the trucks re-plan instantly and it tells you what you saved.', page: 'moves', spot: '[data-testid=loadout]', prep: async () => { await clickText('Load-out list') } },
  { id: 'samsara', kicker: '2 · Delivery check-in', title: 'The delivery nobody checked in', say: 'Southern trailers check themselves in when they cross the job geofence. Samsara optional — third-party loads check in from the crew’s phone with GPS, time and a photo.', page: 'moves', spot: '[data-testid=move-board]', prep: async () => { await clickText('Move board'); const b = await until('[data-testid=sim-geofence]'); await wait(500); b?.click() } },
  { id: 'pickup', kicker: '3 · Smart dispatch', title: 'The driver who was picked for you', say: 'Hours left, deadhead miles, time off, endorsements and certs — ranked, with the reasons. One tap plans all of Thursday.', page: 'pickup', spot: '[data-testid=pickup-list]', prep: async () => { (await until('[data-testid=plan-thursday]'))?.click() } },
  { id: 'expense', kicker: '4 · Expenses', title: 'The receipt that codes itself', say: 'Snap a receipt. It reads it, matches the job from where you were and who dispatched you, and tells you why.', page: 'expenses', spot: '[data-testid=expenses]' },
  { id: 'wind', kicker: '5 · Weather log', title: 'The wind log that won the argument', say: 'Hourly wind at every height against the crane’s limit. On a no-work day it writes the standby proof and the customer PDF.', page: 'weather', spot: '[data-testid=wx-chart]' },
  { id: 'portal', kicker: '6 · Customer portal', title: 'Your customers see what you see', say: 'Live job status, tickets to sign, change orders and hazard reports — on their phone, without calling you.', frame: '?portal=1' },
  { id: 'newhire', kicker: '7 · Onboarding', title: 'The first day that feels like joining a team', say: 'A new hire opens a link: welcome video, paperwork, sizes for their gear, who to call — done before day one.', frame: '?welcome=nh-2' },
  { id: 'store', kicker: '8 · Southern Store', title: 'Gear with the logo on it', say: 'Boots, hoodies and hard-hat stickers with points earned for safety and suggestions.', page: 'store', spot: 'main' },
  { id: 'shipped', kicker: '9 · Suggest', title: 'The idea that shipped', say: 'Anyone can suggest from any screen. When it ships, the person who asked gets the thank-you.', page: 'suggest', spot: 'div:has(> [data-sug=sg-3])', prep: () => { fb.setStatus('sg-3', 'Shipped') } },
  { id: 'passkey', kicker: '10 · Security', title: 'Sign in with your fingerprint', say: 'Real passkeys — Face ID, Touch ID, Windows Hello. Nothing to remember, nothing to phish. Sensitive fields are masked and every reveal is logged.', page: 'settings', spot: '[data-testid=signin-methods]', prep: async () => { await clickText('Security center') } },
  { id: 'offline', kicker: '11 · Offline', title: 'No signal? Keep working.', say: 'Out at the turbine with no bars: everything saves on the phone and sends itself when signal comes back.', page: 'settings', spot: '[data-testid=offline-card]', prep: async () => { await clickText('Security center'); setSimulatedOffline(true) }, leave: () => setSimulatedOffline(false) },
  { id: 'mgmt', kicker: '12 · Management', title: 'The whole company on one screen', say: 'Revenue, utilization, safety, cash — every tile opens the records behind it.', page: 'mgmt', spot: '[data-testid=mgmt-dash]' },
]

interface TS { on: boolean; i: number; prevTimeout?: number }
export const useTour = create<TS>(() => ({ on: false, i: -1 }))
export function startTour() {
  const st = useStore.getState()
  // dive3 M14: the tour never turns a signed-in role into Owner — only the sign-in screen (no session yet) starts it as Owner
  if (st.session && st.session.role !== 'owner') return
  if (guestContext()) return
  if (!st.session) st.signIn('owner')
  const prev = useSec.getState().timeoutMin
  useSec.setState({ timeoutMin: 480 })
  try { sessionStorage.setItem('sc-tour-prev-timeout', String(prev)) } catch { /* */ }
  useTour.setState({ on: true, i: -1, prevTimeout: prev })
}
export function endTour() {
  const s = useTour.getState(); STEPS[s.i]?.leave?.()
  useSec.setState({ timeoutMin: s.prevTimeout ?? 30 }); try { sessionStorage.removeItem('sc-tour-prev-timeout') } catch { /* */ }
  useTour.setState({ on: false, i: -1 })
}
export async function goStep(i: number) {
  const s = useTour.getState(); STEPS[s.i]?.leave?.()
  useTour.setState({ i })
  const st = STEPS[i]; if (!st) return
  if (st.page) { useStore.getState().go(st.page); await wait(450) }
  await st.prep?.()
}

// m12: an abandoned tour (tab closed / reloaded mid-way) puts the idle timeout back
try { const p = sessionStorage.getItem('sc-tour-prev-timeout'); if (p && !useTour.getState().on) { useSec.setState({ timeoutMin: Number(p) || 30 }); sessionStorage.removeItem('sc-tour-prev-timeout') } } catch { /* */ }
