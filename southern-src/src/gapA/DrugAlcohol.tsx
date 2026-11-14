import { useEffect, useMemo, useState } from 'react'
import { Lock, Shuffle, EyeOff, Eye, CalendarPlus, Database, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Badge, Button, Segmented } from '../components/ui'
import { useStore, actions } from '../data/store'
import type * as T from '../data/types'
import { fmtDate, today, addDays, cn } from '../lib/util'
import { useDa, pool, chStatus, nameOf, quarterOf, RATES, SITES, siteFor, type DaTest } from './drug'
import { useL2 } from '../launch2/l2store'
import { audit } from './util'

/** Only the DER (Designated Employer Representative) role can open this screen. Everyone else sees a lock. */
export default function DrugAlcohol() {
  const session = useStore(s => s.session)
  if (session?.role !== 'der') return <div className="max-w-xl mx-auto mt-16" data-testid="da-locked"><Card className="text-center !p-10"><Lock className="size-8 mx-auto text-muted" /><div className="display text-2xl font-semibold mt-3">Restricted</div><div className="text-sm text-muted mt-2">Drug & alcohol records are visible only to the Designated Employer Representative (49 CFR 40.321). Ask the DER if you need something.</div></Card></div>
  return <DaInner />
}

function DaInner() {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'DER'
  const { tests, queries, selections } = useDa()
  useEffect(() => { useDa.getState().ensure(db); audit('D&A program opened', 'Drug & alcohol', `by ${who}`) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<'random' | 'tests' | 'ch' | 'pre'>('random')
  const [shown, setShown] = useState<Record<string, boolean>>({})
  const p = useMemo(() => pool(db), [db])
  const hires = useL2(s => s.hires).filter(h => /cdl|driver/i.test(h.position))
  const q = quarterOf(today()), cur = selections.find(s => s.quarter === q)
  const pending = tests.filter(t => t.result === 'Pending')
  const chRows = p.map(e => ({ e, s: chStatus(queries, e.id) })).sort((a, b) => a.s.due.localeCompare(b.s.due))
  const chDue = chRows.filter(r => r.s.tone !== 'ok')
  return <div className="max-w-[1200px] mx-auto flex flex-col gap-5" data-testid="da-page">
    <PageHeader eyebrow="Safety · DER only · 49 CFR 382" title="Drug & alcohol program" sub="Random pool, test scheduling, results and FMCSA Clearinghouse queries. Results are hidden until you choose to view one, and every view is logged." />
    <div className="rounded-2xl border border-warn/30 bg-warn/5 px-4 py-2.5 text-xs text-muted flex items-center gap-2"><Lock className="size-4 text-warn" />Confidential. Not in search, not on any other screen, not shown to supervisors. Audit log records who opened what.</div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="!p-4"><div className="text-xs text-muted">DOT random pool</div><div className="text-3xl font-semibold">{p.length}</div><div className="text-[11px] text-muted">CDL drivers + CDL operators</div></Card>
      <Card className="!p-4"><div className="text-xs text-muted">{q} selection</div><div className="text-3xl font-semibold">{cur ? 'Done' : 'Due'}</div><div className="text-[11px] text-muted">{Math.round(RATES.drug * 100)}% drug · {Math.round(RATES.alcohol * 100)}% alcohol / yr</div></Card>
      <Card className="!p-4"><div className="text-xs text-muted">Tests open</div><div className="text-3xl font-semibold text-warn">{pending.length}</div></Card>
      <Card className="!p-4"><div className="text-xs text-muted">Clearinghouse queries due</div><div className="text-3xl font-semibold text-bad" data-testid="da-ch-due">{chDue.length + hires.filter(hh => !queries.some(x => x.empId === hh.id)).length}</div></Card>
    </div>
    <Segmented value={tab} onChange={setTab} options={[{ value: 'random', label: 'Random selection' }, { value: 'tests', label: 'Tests & results', count: pending.length }, { value: 'ch', label: 'Clearinghouse' }, { value: 'pre', label: 'Pre-employment', count: hires.length }]} className="self-start max-w-full overflow-x-auto" />
    {tab === 'random' && <Card data-testid="da-random"><div className="flex items-center gap-3 flex-wrap"><div className="flex-1"><div className="font-semibold">Quarterly random selection</div><div className="text-sm text-muted">Every covered employee has an equal chance each quarter. The draw and its seed are logged so it can be reproduced for an auditor.</div></div>{(() => { const done = useDa.getState().selections.find(x => x.quarter === q); return done ? <div className="text-sm text-right" data-testid="da-select-locked"><div className="font-semibold">{q} drawn {done.at} — locked</div><div className="text-xs text-muted">Seed {done.seed} · one draw per quarter</div></div> : null })() ?? <Button variant="primary" icon={<Shuffle className="size-4" />} data-testid="da-select" onClick={() => { const s = useDa.getState().select(db, who); toast.success(`${s.quarter} selection: ${s.drug.length} drug, ${s.alcohol.length} alcohol`, { description: 'Schedule each test — notify the employee right before they go.' }); setTab('tests') }}>Run {q} selection</Button>}</div>
      <div className="mt-4 flex flex-col divide-y hairline">{selections.map(s => <div key={s.id} className="py-2.5 text-sm flex gap-3 flex-wrap" data-testid="da-sel"><b className="w-20">{s.quarter}</b><span className="flex-1">Pool {s.pool} · {s.drug.length} drug · {s.alcohol.length} alcohol · by {s.by} {fmtDate(s.at)}</span><span className="text-xs text-muted">seed {s.seed}</span></div>)}</div></Card>}
    {tab === 'tests' && <OrderTest db={db} who={who} pool={p} />}
    {tab === 'tests' && <Card pad={false} className="divide-y hairline" data-testid="da-tests">{tests.slice(0, 40).map(t => { const open = shown[t.id]
      return <div key={t.id} className="p-3.5 flex items-center gap-3 flex-wrap text-sm" data-testid="da-test">
        <div className="flex-1 min-w-48"><b>{nameOf(db, t.empId) || useL2.getState().hires.find(h => h.id === t.empId)?.first + ' (new hire)'}</b><div className="text-xs text-muted">{t.kind} · {t.panel} · selected {fmtDate(t.selectedAt)}{t.scheduled ? ` · ${fmtDate(t.scheduled.at.slice(0, 10))} ${t.scheduled.at.slice(11)} at ${t.scheduled.site}` : ''}</div></div>
        {!t.scheduled && <Button size="sm" icon={<CalendarPlus className="size-3.5" />} data-testid="da-schedule" onClick={() => { const n = new Date(), site = siteFor(db, t.empId); useDa.getState().schedule(t.id, `${today()}T${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`, site, who); toast.success(`Go now — ${site}`, { description: 'Notify the employee now; they proceed straight to collection (no advance notice).' }) }}>Send now</Button>}
        {t.scheduled && t.result === 'Pending' && <div className="flex gap-1">{(['Negative', 'Positive', 'Refusal', 'Cancelled'] as const).map(r => <Button key={r} size="sm" data-testid={`da-result-${r}`} onClick={() => { useDa.getState().record(t.id, r, who); setShown(s => ({ ...s, [t.id]: false })); if ((r === 'Positive' || r === 'Refusal') && db.employees.some(e => e.id === t.empId)) { const n = actions.ssHold(t.empId, true); toast.error('Removed from safety-sensitive work', { description: `Off ${n} scheduled day(s) and blocked on Dispatch + Smart Pickup until a negative return-to-duty test. Refer to a SAP and report the violation in the Clearinghouse.` }) } else if (r === 'Negative' && ['Return-to-duty', 'Post-accident', 'Reasonable suspicion'].includes(t.kind) && db.employees.find(e => e.id === t.empId)?.ssHold) {
          // dive3 B2: clear only when every hold-related test for this person since the hold is final-negative
          const since = db.employees.find(e => e.id === t.empId)!.ssHold!, still = useDa.getState().tests.filter(x => x.empId === t.empId && x.id !== t.id && (t.kind === 'Return-to-duty' ? x.kind === 'Return-to-duty' && x.result === 'Pending' : ['Post-accident', 'Reasonable suspicion'].includes(x.kind)) && x.selectedAt >= since && (x.result === 'Pending' || x.result === 'Positive' || x.result === 'Refusal'))
          if (still.length) toast('Negative recorded — still held', { description: `${still.length} other test${still.length > 1 ? 's are' : ' is'} ${still.some(x => x.result === 'Pending') ? 'still pending' : 'not negative'}. The hold lifts when every test for this event is negative.` })
          else { actions.ssHold(t.empId, false); toast.success(t.kind === 'Return-to-duty' ? 'Return-to-duty negative — cleared for dispatch' : `${t.kind} tests negative — cleared for dispatch`, { description: t.kind === 'Return-to-duty' ? 'Set up the SAP follow-up testing plan (at least 6 tests in the first 12 months).' : 'Every test ordered for this event came back negative. No SAP referral is needed.' }) } } else toast('Result recorded — hidden by default') }}>{r}</Button>)}</div>}
        {t.result !== 'Pending' && <button data-testid="da-reveal" onClick={() => { if (!open) useDa.getState().reveal(t.id, who); setShown(s => ({ ...s, [t.id]: !open })) }} className="inline-flex items-center gap-1.5 text-xs font-semibold rounded-full bg-surface-2 px-3 h-8">{open ? <><Eye className="size-3.5" /><span data-testid="da-result" className={cn(t.result === 'Negative' ? 'text-ok' : 'text-bad')}>{t.result}</span>{t.mro && <span className="text-muted">· {t.mro}</span>}</> : <><EyeOff className="size-3.5" />Result hidden · tap to view (logged)</>}</button>}
      </div> })}</Card>}
    {tab === 'ch' && <Card pad={false} className="divide-y hairline" data-testid="da-ch">{chRows.map(({ e, s }) => <div key={e.id} className="p-3.5 flex items-center gap-3 text-sm" data-testid="da-ch-row"><Database className={cn('size-4', s.tone === 'bad' ? 'text-bad' : s.tone === 'warn' ? 'text-warn' : 'text-ok')} /><div className="flex-1"><b>{nameOf(db, e.id)}</b><div className="text-xs text-muted">Annual limited query · consent on file · next due {fmtDate(s.due, { month: 'short', day: 'numeric', year: 'numeric' })}</div></div><Badge tone={s.tone === 'bad' ? 'bad' : s.tone === 'warn' ? 'warn' : 'ok'}>{s.label}</Badge>{s.tone !== 'ok' && <Button size="sm" data-testid="da-ch-log" onClick={() => { useDa.getState().query(e.id, 'Limited (annual)', who, nameOf(db, e.id)); toast.success('Clearinghouse query logged', { description: 'Run it at clearinghouse.fmcsa.dot.gov, then log it here (no live connection in the demo).' }) }}>Log query</Button>}</div>)}</Card>}
    {tab === 'pre' && <Card data-testid="da-pre"><div className="font-semibold">Pre-employment — from Onboarding</div><div className="text-sm text-muted">A CDL hire can’t drive until the full Clearinghouse query and a negative pre-employment drug test are on file (§382.701, §382.301).</div>
      <div className="mt-3 flex flex-col divide-y hairline">{hires.map(hh => { const q = queries.find(x => x.empId === hh.id), t = tests.find(x => x.empId === hh.id)
        return <div key={hh.id} className="py-3 flex items-center gap-3 flex-wrap text-sm" data-testid="da-pre-row"><UserPlus className="size-4 text-info" /><div className="flex-1"><b>{hh.first} {hh.last}</b> · {hh.position} · starts {fmtDate(hh.start)}</div>
          {q ? <Badge tone="ok">Full query logged {fmtDate(q.at)}</Badge> : <Button size="sm" data-testid="da-pre-query" onClick={() => { useDa.getState().query(hh.id, 'Full (pre-employment)', who, `${hh.first} ${hh.last}`); toast.success('Full pre-employment query logged') }}>Log full query</Button>}
          {t ? <Badge tone="warn">Drug test {t.scheduled ? 'scheduled' : 'ordered'}</Badge> : <Button size="sm" data-testid="da-pre-test" onClick={() => { useDa.setState(s => ({ tests: [{ id: 'pre-' + hh.id, empId: hh.id, kind: 'Pre-employment', panel: 'Drug (5-panel)', selectedAt: today(), result: 'Pending' }, ...s.tests] })); localStorage.setItem('sc-da-v1', JSON.stringify({ tests: useDa.getState().tests, queries: useDa.getState().queries, selections: useDa.getState().selections })); audit('D&A pre-employment test ordered', 'D&A record (confidential)', `by ${who}`); toast.success('Pre-employment test ordered') }}>Order drug test</Button>}
        </div> })}{!hires.length && <div className="py-3 text-sm text-muted">No CDL hires in onboarding.</div>}</div></Card>}
  </div>
}

/** dive2: order a post-accident / reasonable-suspicion / return-to-duty / follow-up test (go now, nearest branch site) and see who is held. */
function OrderTest({ db, who, pool: covered }: { db: T.DB; who: string; pool: T.Employee[] }) {
  const [emp, setEmp] = useState(''), [kind, setKind] = useState<DaTest['kind']>('Post-accident'), [panel, setPanel] = useState<DaTest['panel'] | 'Both'>('Drug (5-panel)'), [site, setSite] = useState(''), [note, setNote] = useState('')
  const held = db.employees.filter(e => e.ssHold)
  // post-accident / reasonable suspicion apply to ANY employee involved (company policy for non-DOT staff); DOT pool for random-type tests
  const anyone = kind === 'Post-accident' || kind === 'Reasonable suspicion' || kind === 'Return-to-duty' || kind === 'Follow-up'
  const list = anyone ? db.employees.filter(e => e.status === 'Active' || e.ssHold) : covered
  const st = site || (emp ? siteFor(db, emp) : SITES[0])
  return <Card data-testid="da-order"><div className="font-semibold">Order a test now</div><div className="text-sm text-muted">Post-accident: alcohol within 8 h, drugs within 32 h (§382.303). Reasonable suspicion needs a trained supervisor’s written observation (§382.307).</div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2 mt-3">
      <select className="input" data-testid="da-order-emp" value={emp} onChange={e => setEmp(e.target.value)}><option value="">Employee…</option>{list.map(e => <option key={e.id} value={e.id}>{e.first} {e.last}{covered.includes(e) ? '' : ' (non-DOT)'}{e.ssHold ? ' (held)' : ''}</option>)}</select>
      <select className="input" data-testid="da-order-kind" value={kind} onChange={e => setKind(e.target.value as DaTest['kind'])}>{(['Post-accident', 'Reasonable suspicion', 'Return-to-duty', 'Follow-up'] as const).map(k => <option key={k}>{k}</option>)}</select>
      <select className="input" value={panel} data-testid="da-order-panel" onChange={e => setPanel(e.target.value as DaTest['panel'] | 'Both')}><option>Drug (5-panel)</option><option>Alcohol (breath)</option><option value="Both">Drug + alcohol</option></select>
      <select className="input" data-testid="da-order-site" value={st} onChange={e => setSite(e.target.value)}>{SITES.map(s => <option key={s}>{s}</option>)}</select>
      <Button variant="primary" data-testid="da-order-go" disabled={!emp || (kind === 'Reasonable suspicion' && !note.trim())} onClick={ev => { const live = (ev.currentTarget.closest('[data-testid=da-order]')?.querySelector('[data-testid=da-order-panel]') as HTMLSelectElement | null)?.value; const choice = live === 'Both' || panel === 'Both' ? 'Both' : ((live || panel) as DaTest['panel']); for (const pn of choice === 'Both' ? ['Drug (5-panel)', 'Alcohol (breath)'] as const : [choice]) useDa.getState().order(emp, kind, pn, st, who, note); if (kind === 'Reasonable suspicion' || kind === 'Post-accident') { const n = actions.ssHold(emp, true); toast.success(`${kind} test ordered — go now`, { description: `${st}. Held from safety-sensitive work pending the result (off ${n} scheduled day(s)).` }) } else toast.success(`${kind} test ordered — go now`, { description: st }); setEmp(''); setNote(''); setSite('') }}>Order test</Button>
    </div>
    {kind === 'Reasonable suspicion' && <input className="input mt-2" data-testid="da-order-note" placeholder="Supervisor observation (required) — what was seen, when, by whom" value={note} onChange={e => setNote(e.target.value)} />}
    {held.length > 0 && <div className="mt-3 rounded-2xl bg-bad/5 border border-bad/30 p-3 text-sm" data-testid="da-held"><b>Not cleared for safety-sensitive work ({held.length})</b> — blocked on Dispatch and Smart Pickup. A negative return-to-duty test clears them.
      {held.map(e => <div key={e.id} className="flex items-center gap-2 mt-2"><span className="flex-1">{e.first} {e.last} · since {fmtDate(e.ssHold!)}</span><Button size="sm" data-testid="da-rtd" onClick={() => { useDa.getState().order(e.id, 'Return-to-duty', 'Drug (5-panel)', siteFor(db, e.id), who); toast.success('Return-to-duty test ordered', { description: 'Record a Negative result to clear them.' }) }}>Order return-to-duty</Button><Button size="sm" variant="ghost" data-testid="da-clear" onClick={() => { actions.ssHold(e.id, false); audit('D&A hold cleared', 'D&A record (confidential)', `by ${who}`); toast.success('Cleared for dispatch') }}>Clear</Button></div>)}</div>}
  </Card>
}
