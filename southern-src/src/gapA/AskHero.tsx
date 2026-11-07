import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, ArrowRight, User, Briefcase, Truck, Package, CheckCircle2 } from 'lucide-react'
import { useStore } from '../data/store'
import { fullName } from '../data/logic'
import { cn } from '../lib/util'
import { matchTasks, runTask, myTodos, words, TASKS, type Task } from './tasks'
import { useRig } from './rigging'
import { ask } from '../data/ask'
import { roleDef } from '../data/roles'
import { useDq } from './dq'

/** The big "What do you need to do?" bar + this person's tasks. Sits on every role's home screen. */
export default function AskHero({ compact }: { compact?: boolean }) {
  const db = useStore(s => s.db), role = useStore(s => s.session!.role)
  const [q, setQ] = useState('')
  useRig(s => s.pieces); useDq(s => s.over)
  const tasks = useMemo(() => matchTasks(q, role), [q, role])
  const ents = useMemo(() => {
    const ws = words(q); if (!ws.length || role === 'field') return []
    const m = (s: string) => ws.every(w => s.toLowerCase().includes(w))
    return [
      ...db.employees.filter(e => m(`${e.first} ${e.last} ${e.craft}`)).slice(0, 3).map(e => ({ k: 'employee' as const, id: e.id, label: fullName(e), sub: e.craft, I: User })),
      ...db.jobs.filter(j => m(`${j.jobNo} ${j.name}`)).slice(0, 3).map(j => ({ k: 'job' as const, id: j.id, label: `#${j.jobNo}`, sub: j.name, I: Briefcase })),
      ...db.equipment.filter(e => m(`crane ${e.unit} ${e.model} ${e.type}`) && (ws.some(w => w === e.unit.toLowerCase()) || ws.length > 1 || !/^\d+$/.test(ws[0]))).slice(0, 3).map(e => ({ k: 'equipment' as const, id: e.id, label: `${e.category === 'Crane' ? 'Crane ' : ''}${e.unit}`, sub: `${e.make} ${e.model}`, I: Truck })),
      ...db.items.filter(i => m(`${i.sku} ${i.name}`)).slice(0, 3).map(i => ({ k: 'item' as const, id: i.id, label: i.name, sub: `${i.onHand} on hand`, I: Package })),
    ].slice(0, 6)
  }, [db, q, role])
  const scope = useStore(s => s.ui.filter)
  const todos = useMemo(() => myTodos(db, role), [db, role, scope]) // eslint-disable-line react-hooks/exhaustive-deps
  // dive2 M9: office roles get the same answers as ⌘K ("which cranes are free Thursday?") before any task
  const answer = useMemo(() => role === 'field' || words(q).length < 2 ? null : ask(db, q, scope), [db, q, role, scope])
  const run = (t: Task) => { runTask(t, q); setQ('') }
  const openAnswer = () => { if (!answer) return; const pg = answer.page && roleDef(role).pages.includes(answer.page as never) ? answer.page : null; if (answer.items[0]?.ref && !pg) useStore.getState().open(answer.items[0].ref); else if (pg) { useStore.getState().go(pg as never); toast(answer.headline, { description: [answer.detail, answer.items.slice(0, 4).map(i => i.label).join(' · ')].filter(Boolean).join(' — ') }) } setQ('') } // dive3 dispatch m3: the answer travels with you
  const old = tasks.find(t => t.old && words(q).some(w => t.old!.toLowerCase().startsWith(w)))
  return <div className={cn('mb-6', compact ? 'mb-4' : 'max-w-[1500px] mx-auto')} data-testid="ask-hero">
    <div className="relative">
      <Sparkles className="size-5 text-accent absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { const t0 = tasks[0], full = t0 && words(q).every(w => `${t0.label} ${t0.keys}`.toLowerCase().includes(w)), jobAns = answer?.items[0]?.ref?.type === 'job' && /\b1\d{4}\b/.test(q); if (!jobAns && (full || !answer)) { if (t0) run(t0) } else openAnswer() } if (e.key === 'Escape') setQ('') }}
        placeholder="What do you need to do?" aria-label="What do you need to do?" data-testid="ask-hero-input"
        className={cn('w-full rounded-2xl bg-surface border hairline pl-12 pr-4 outline-none focus:ring-2 ring-accent/50 placeholder:text-faint shadow-sm', compact ? 'h-14 text-base' : 'h-16 text-lg')} />
      {q && <div className="absolute z-30 inset-x-0 top-full mt-2 rounded-2xl bg-surface border hairline shadow-2xl p-2 max-h-[60vh] overflow-auto" data-testid="ask-hero-results">
        {old && <div className="m-1 mb-2 rounded-xl bg-info/10 text-info text-sm px-3 py-2" data-testid="ask-hero-moved">{old.old} lives here now: <b>{old.label}</b>.</div>}
        {answer && <div className="m-1 mb-2 rounded-xl bg-accent/10 border border-accent/25 p-3" data-testid="ask-hero-answer"><div className="font-semibold">{answer.headline}</div>{answer.detail && <div className="text-sm text-muted">{answer.detail}</div>}
          {answer.items.slice(0, 6).map((it, i) => <button key={i} onClick={() => { if (it.ref) useStore.getState().open(it.ref); setQ('') }} className="w-full text-left text-sm min-h-[40px] rounded-lg px-2 hover:bg-surface-2 flex items-center gap-2" data-testid="ask-hero-answer-item"><span className="font-semibold">{it.label}</span>{it.sub && <span className="text-muted truncate">{it.sub}</span>}</button>)}
          {answer.items.length > 6 && <div className="text-xs text-muted px-2">+{answer.items.length - 6} more</div>}</div>}
        {tasks.slice(0, answer ? 3 : 5).map((t, i) => <button key={t.id} onClick={() => run(t)} className={cn('w-full text-left rounded-xl px-3 py-3 flex items-center gap-3 hover:bg-surface-2', i === 0 && !answer && 'bg-surface-2')} data-testid="ask-hero-task" data-task={t.id}>
          <span className="rounded-lg bg-accent/15 text-accent text-[11px] font-bold px-2 py-1 w-[68px] text-center shrink-0">{t.verb}</span><span className="font-semibold flex-1">{t.label}</span><ArrowRight className="size-4 text-faint" /></button>)}
        {ents.map(e => <button key={e.k + e.id} onClick={() => { useStore.getState().open({ type: e.k, id: e.id }); setQ('') }} className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3 hover:bg-surface-2 text-sm" data-testid="ask-hero-ent"><e.I className="size-4 text-muted" /><b>{e.label}</b><span className="text-muted truncate">{e.sub}</span></button>)}
        {!answer && !tasks.length && !ents.length && <div className="px-3 py-4 text-sm text-muted">Nothing yet — try “turn in a receipt”, “request PTO” or “report a broken shackle”.</div>}
      </div>}
    </div>
    <div className="mt-3 flex flex-wrap gap-2" data-testid="my-tasks">
      {todos.length ? todos.map(t => <button key={t.id} data-testid="my-task" onClick={() => { const tk = TASKS.find(x => x.id === t.task); if (tk) run(tk); else if (t.page) useStore.getState().go(t.page) }} className={cn('rounded-full px-3.5 h-9 text-sm font-semibold inline-flex items-center gap-2 border', t.tone === 'bad' ? 'bg-bad/10 text-bad border-bad/25' : t.tone === 'warn' ? 'bg-warn/10 text-warn border-warn/25' : 'bg-surface-2 text-ink border-transparent')}><span className="size-1.5 rounded-full bg-current" />{t.label}</button>)
        : <span className="text-sm text-muted inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-ok" />You’re all set.</span>}
    </div>
  </div>
}
