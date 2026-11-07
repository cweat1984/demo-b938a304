import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useOrgLabel } from './OrgFilter'
import { useCompany, storeLabel } from '../data/brand'
import { Command } from 'cmdk'
import { motion, AnimatePresence } from 'motion/react'
import { createPortal } from 'react-dom'
import { Sparkles, ArrowRight, User, Truck, Briefcase, Package, Plus, Siren, CornerDownLeft, FileText } from 'lucide-react'
import { useStore } from '../data/store'
import { roleDef, PAGES } from '../data/roles'
import { ask, askSuggestions } from '../data/ask'
import { eqLabel, fullName, customerOf, siteOf } from '../data/logic'
import { ICONS } from './icons'
import { cn } from '../lib/util'
import { matchTasks, runTask } from '../gapA/tasks'
import { useDestinations, goDest } from '../nav/MoreSheet'
import { searchDests, didYouMean, defineTerm } from '../nav/search'

export default function CommandBar() {
  const company = useCompany()
  const open = useStore(s => s.ui.cmdOpen)
  const setUI = useStore(s => s.setUI)
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const session = useStore(s => s.session)!
  const go = useStore(s => s.go)
  const openRef = useStore(s => s.open)
  const [q, setQ] = useState('')
  const rd = roleDef(session.role)
  const answer = useMemo(() => ask(db, q, f), [db, q, f])
  const orgLabel = useOrgLabel()
  const close = () => { setUI({ cmdOpen: false }); setQ('') }
  useEffect(() => { if (!open) return; const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setUI({ cmdOpen: false }); setQ('') } }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h) }, [open, setUI])
  const can = (p: string) => rd.pages.includes(p as never)
  const dests = useDestinations()
  // when the assistant answers, still show direct record matches (job #, crane/truck unit, person) so a number never dead-ends
  const recHits = useMemo(() => { const t = q.trim().toLowerCase().replace(/^(job|crane|truck|unit)\s*#?\s*/, ''); if (t.length < 2) return []
    const out: { k: string; label: string; sub: string; icon: ReactNode; ref: Parameters<typeof openRef>[0] }[] = []
    db.jobs.filter(j => String(j.jobNo).toLowerCase().includes(t)).slice(0, 4).forEach(j => out.push({ k: 'j' + j.id, label: `#${j.jobNo}`, sub: `${customerOf(db, j).name} · ${j.name}`, icon: <Briefcase className="size-4 text-muted" />, ref: { type: 'job', id: j.id } }))
    db.equipment.filter(e => String(e.unit).toLowerCase() === t || `${e.unit} ${e.make} ${e.model}`.toLowerCase().includes(t)).slice(0, 4).forEach(e => out.push({ k: 'e' + e.id, label: eqLabel(e), sub: `${e.make} ${e.model}`, icon: <Truck className="size-4 text-muted" />, ref: { type: 'equipment', id: e.id } }))
    // customer or city names → their jobs ("red river", "who is in midland")
    const place = t.replace(/^(who('| i)?s|who is|what('| i)?s|jobs?|work)\s+(in|at|near)\s+|^(in|at|near)\s+/, '').trim()
    if (place.length >= 3 && !out.length) db.jobs.filter(j => j.stage !== 'Paid' && (customerOf(db, j).name.toLowerCase().includes(place) || siteOf(db, j).city.toLowerCase() === place || siteOf(db, j).name.toLowerCase().includes(place))).sort((a, b) => (b.startDate > a.startDate ? 1 : -1)).slice(0, 4).forEach(j => out.push({ k: 'c' + j.id, label: `#${j.jobNo} ${customerOf(db, j).name}`, sub: `${siteOf(db, j).city} · ${j.name} · ${j.status}`, icon: <Briefcase className="size-4 text-muted" />, ref: { type: 'job', id: j.id } }))
    db.employees.filter(e => `${e.first} ${e.last}`.toLowerCase().includes(t)).slice(0, 4).forEach(e => out.push({ k: 'p' + e.id, label: fullName(e), sub: e.craft, icon: <User className="size-4 text-muted" />, ref: { type: 'employee', id: e.id } }))
    return out.slice(0, 8) }, [db, q])
  const pageHits = useMemo(() => searchDests(dests, q).slice(0, 5), [dests, q])
  useEffect(() => { const h = (e: Event) => setQ(String((e as CustomEvent).detail ?? '')); window.addEventListener('sc-cmd-q', h); return () => window.removeEventListener('sc-cmd-q', h) }, [])
  const item = 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm cursor-pointer data-[selected=true]:bg-surface-2 aria-selected:bg-surface-2'
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[8vh] px-4">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ type: 'spring', damping: 30, stiffness: 400 }} className="relative w-full max-w-2xl">
            <Command label={`Ask ${company.assistantName}`} className="card p-0 overflow-hidden" shouldFilter={!answer} loop>
              <div className="flex items-center gap-3 px-5 h-16 border-b hairline">
                <Sparkles className="size-5 text-accent shrink-0" />
                <Command.Input autoFocus value={q} onValueChange={setQ} placeholder="Ask anything or jump to a crane, person, job, item…" className="flex-1 bg-transparent outline-none text-[17px] placeholder:text-faint" data-testid="ask-input" />
                <kbd className="text-[11px] text-faint border hairline rounded px-1.5 py-0.5">esc</kbd>
              </div>
              <Command.List className="max-h-[62vh] overflow-y-auto scroll-thin p-2">
                {q && defineTerm(q) && <div className="mx-2 mb-2 rounded-xl border border-accent/30 bg-accent/5 px-3 py-2 text-sm" data-testid="cmd-define"><b className="text-accent">{defineTerm(q)!.term}</b> — {defineTerm(q)!.means}</div>}
                {q && pageHits.length > 0 && (
                  <Command.Group heading={<span className="label px-2">Go to</span>} data-testid="cmd-pages" forceMount>
                    {pageHits.map(h => { const I = ICONS[h.icon] ?? FileText; return <Command.Item key={h.key} forceMount value={`page ${h.label} ${h.why ?? ''}`} data-page={h.key} onSelect={() => { close(); goDest(h) }} className={item}><I className="size-4 text-accent" /><span className="font-medium">{h.label}</span>{(h.why || h.hint) && <span className="text-xs text-muted truncate">{h.why ? `matches: ${h.why}` : ''}{h.why && h.hint ? ' · ' : ''}{h.hint ?? ''}</span>}<ArrowRight className="size-4 ml-auto text-faint shrink-0" /></Command.Item> })}
                  </Command.Group>
                )}
                {q && matchTasks(q, session.role).length > 0 && (
                  <Command.Group heading={<span className="label px-2">Do it</span>} data-testid="cmd-tasks">
                    {matchTasks(q, session.role).slice(0, 4).map(t => <Command.Item key={t.id} value={`${q} task ${t.label}`} data-task={t.id} onSelect={() => { close(); runTask(t, q) }} className={item}><span className="rounded-md bg-accent/15 text-accent text-[10px] font-bold px-1.5 py-0.5 w-16 text-center">{t.verb}</span><span className="font-medium">{t.label}</span><CornerDownLeft className="size-3.5 ml-auto text-faint" /></Command.Item>)}
                  </Command.Group>
                )}
                {(answer || recHits.some(r => r.k[0] === 'c')) && recHits.length > 0 && (
                  <Command.Group heading={<span className="label px-2">Records</span>} data-testid="cmd-records" forceMount>
                    {recHits.map(r => <Command.Item key={r.k} forceMount value={`rec ${r.k}`} onSelect={() => { close(); openRef(r.ref) }} className={item}>{r.icon}<span className="font-medium">{r.label}</span><span className="text-muted truncate">{r.sub}</span><ArrowRight className="size-4 ml-auto text-faint shrink-0" /></Command.Item>)}
                  </Command.Group>
                )}
                {answer && (
                  <div className="m-1 mb-3 rounded-2xl bg-gradient-to-br from-accent/12 to-transparent border border-accent/25 p-4" data-testid="ask-answer">
                    <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-accent"><Sparkles className="size-3.5" /><span className="uppercase">{company.assistantName} answers</span><span data-testid="ask-scope" className="ml-auto rounded-full bg-surface-2 text-muted px-2 py-0.5 normal-case tracking-normal font-semibold">{orgLabel}</span></div>
                    <div className="display text-xl font-semibold mt-2 leading-snug">{answer.headline}</div>
                    {answer.detail && <div className="text-sm text-muted mt-1">{answer.detail}</div>}
                    {answer.items.length > 0 && (
                      <div className="mt-3 flex flex-col">
                        {answer.items.slice(0, 12).map((it, i) => (
                          <Command.Item key={i} value={`ans-${i}-${it.label}`} onSelect={() => { if (it.ref) { close(); openRef(it.ref) } }} className={item}>
                            <span className={cn('size-2 rounded-full shrink-0', it.tone === 'bad' ? 'bg-bad' : it.tone === 'warn' ? 'bg-warn' : it.tone === 'ok' ? 'bg-ok' : 'bg-info')} />
                            <span className="font-medium">{it.label}</span><span className="text-muted truncate">{it.sub}</span>
                            <ArrowRight className="size-4 ml-auto text-faint shrink-0" />
                          </Command.Item>
                        ))}
                        {answer.items.length > 12 && <div className="text-xs text-muted px-3 pt-1">+{answer.items.length - 12} more</div>}
                      </div>
                    )}
                    {answer.page && can(answer.page) && <button onClick={() => { close(); go(answer.page as never) }} className="mt-3 text-xs font-semibold text-accent inline-flex items-center gap-1">Open {PAGES.find(p => p.key === answer.page)?.label}<ArrowRight className="size-3.5" /></button>}
                  </div>
                )}
                {!answer && (
                  <>
                    <Command.Empty className="py-8 text-center text-sm text-muted" data-testid="cmd-empty">No match for “{q}”.{q && <span className="block mt-3">Did you mean: {didYouMean(dests, q).map((d, i) => <button key={d.key} onClick={() => { close(); goDest(d) }} data-testid="cmd-dym" className="mx-1 rounded-full bg-surface-2 px-3 py-1.5 text-ink font-semibold">{d.label}</button>)}</span>}</Command.Empty>
                    {!q && (
                      <Command.Group heading={<span className="label px-2">Try asking</span>}>
                        <div className="flex flex-wrap gap-2 px-2 py-2">
                          {askSuggestions().map(s => <button key={s} onClick={() => setQ(s)} className="rounded-full bg-surface-2 hover:bg-surface-3 px-3 py-1.5 text-[13px]">{s}</button>)}
                        </div>
                      </Command.Group>
                    )}
                    <Command.Group heading={<span className="label px-2">Actions</span>}>
                      {can('jobs') && <Command.Item className={item} onSelect={() => { close(); setUI({ jobBuilder: {} }) }}><Plus className="size-4 text-accent" />New job (Job Builder)<CornerDownLeft className="size-3.5 ml-auto text-faint" /></Command.Item>}
                      {rd.emergency && <Command.Item className={item} onSelect={() => { close(); setUI({ breakdownOpen: true }) }}><Siren className="size-4 text-bad" />Report breakdown / emergency</Command.Item>}
                      {PAGES.filter(p => can(p.key)).map(p0 => { const p = p0.key === 'store' ? { ...p0, label: storeLabel() } : p0; const I = ICONS[p.icon]; return <Command.Item key={p.key} value={`go ${p.label}`} className={item} onSelect={() => { close(); go(p.key) }}><I className="size-4 text-muted" />Go to {p.label}</Command.Item> })}
                    </Command.Group>
                    {q.length > 0 && (
                      <>
                        <Command.Group heading={<span className="label px-2">Equipment</span>}>
                          {db.equipment.map(e => <Command.Item key={e.id} value={`${e.unit} ${e.code} ${e.make} ${e.model} ${e.type}`} className={item} onSelect={() => { close(); openRef({ type: 'equipment', id: e.id }) }}><Truck className="size-4 text-muted" /><span className="font-medium">{eqLabel(e)}</span><span className="text-muted truncate">{e.make} {e.model} · {e.status}</span></Command.Item>)}
                        </Command.Group>
                        <Command.Group heading={<span className="label px-2">People</span>}>
                          {db.employees.map(e => <Command.Item key={e.id} value={`${e.first} ${e.last} ${e.craft} ${e.empNo}`} className={item} onSelect={() => { close(); openRef({ type: 'employee', id: e.id }) }}><User className="size-4 text-muted" /><span className="font-medium">{fullName(e)}</span><span className="text-muted">{e.craft} · {e.empNo}</span></Command.Item>)}
                        </Command.Group>
                        <Command.Group heading={<span className="label px-2">Jobs</span>}>
                          {db.jobs.map(j => <Command.Item key={j.id} value={`${j.jobNo} ${customerOf(db, j).name} ${j.name} ${siteOf(db, j).city}`} className={item} onSelect={() => { close(); openRef({ type: 'job', id: j.id }) }}><Briefcase className="size-4 text-muted" /><span className="font-medium">#{j.jobNo}</span><span className="text-muted truncate">{customerOf(db, j).name} · {siteOf(db, j).city}</span></Command.Item>)}
                        </Command.Group>
                        <Command.Group heading={<span className="label px-2">Inventory</span>}>
                          {db.items.map(i => <Command.Item key={i.id} value={`${i.sku} ${i.name} ${i.category}`} className={item} onSelect={() => { close(); openRef({ type: 'item', id: i.id }) }}><Package className="size-4 text-muted" /><span className="font-medium truncate">{i.name}</span><span className="text-muted">{i.onHand} on hand</span></Command.Item>)}
                        </Command.Group>
                        <Command.Group heading={<span className="label px-2">Invoices</span>}>
                          {db.invoices.slice(0, 60).map(i => <Command.Item key={i.id} value={`${i.invNo} invoice`} className={item} onSelect={() => { close(); openRef({ type: 'invoice', id: i.id }) }}><FileText className="size-4 text-muted" />{i.invNo}</Command.Item>)}
                        </Command.Group>
                      </>
                    )}
                  </>
                )}
              </Command.List>
            </Command>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
