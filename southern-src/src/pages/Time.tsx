import { EmpRef, JobRef } from '../components/bits'
import { useKeep } from '../lib/keep'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Check, Download, Flag, ChevronLeft, ChevronRight } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions, scopeFor } from '../data/store'
import { inScope, byId, fullName } from '../data/logic'
import { cn, fmtDate, today, addDays, startOfWeek, downloadCsv, dow, money } from '../lib/util'
import { PageHeader, Segmented, Badge, Button, Card, Empty, Avatar, confirmChoice } from '../components/ui'
import { PER_DIEM_RATES } from '../data/seed'
import { ReconQueue } from '../components/TimeRecon'
import { reconDays } from '../data/recon'
import { timeConflicts } from '../data/timeChecks'

export default function Time() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const role = useStore(s => s.session!.role)
  const [wk, setWk] = useState(startOfWeek(today()))
  const [view, setView] = useState<'cards' | 'recon'>(() => { const v = sessionStorage.getItem('page-sub:time'); sessionStorage.removeItem('page-sub:time'); return v === 'recon' || new URLSearchParams(location.search).get('recon') ? 'recon' : 'cards' })
  useEffect(() => { const h = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.page === 'time' && d.hash === 'recon') { sessionStorage.removeItem('page-sub:time'); setView('recon') } }; window.addEventListener('page-sub', h); return () => window.removeEventListener('page-sub', h) }, [])
  const [tab, setTab] = useKeep<'review' | 'approved' | 'exported' | 'all'>('time:tab', 'review')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const end = addDays(wk, 6)
  const entries = useMemo(() => db.time.filter(t => t.date >= wk && t.date <= end && inScope(byId(db.employees, t.employeeId), f)), [db, wk, end, f])
  const pick = (t: T.TimeEntry) => tab === 'all' || (tab === 'review' ? t.status === 'Submitted' || t.status === 'Flagged' : tab === 'approved' ? t.status === 'Approved' : t.status === 'Exported')
  const shown = entries.filter(pick)
  const conflicts = useMemo(() => timeConflicts(entries, id => byId(db.jobs, id)?.jobNo ?? ''), [entries, db.jobs])
  const clean = shown.filter(t => t.status === 'Submitted' && !conflicts.has(t.id)), held = shown.filter(t => t.status === 'Submitted' && conflicts.has(t.id)).length
  const byEmp = new Map<string, T.TimeEntry[]>()
  shown.forEach(t => byEmp.set(t.employeeId, [...(byEmp.get(t.employeeId) ?? []), t]))
  const hrs = entries.reduce((s, t) => s + t.hours, 0)
  const perDiem = entries.reduce((s, t) => s + t.perDiems.reduce((x, p) => x + PER_DIEM_RATES[p], 0), 0)
  const flagged = entries.filter(t => t.status === 'Flagged').length
  const canApprove = role === 'payroll' || role === 'owner' || role === 'ops' || role === 'dispatch'
  const toggle = (id: string) => { const n = new Set(sel); n.has(id) ? n.delete(id) : n.add(id); setSel(n) }
  const approve = (ids: string[]) => { actions.approveTime(ids); toast.success(`${ids.length} entries approved`, { description: 'Hours posted to job costing' }); setSel(new Set()) }
  /** dive3 acct m7: Paychex Flex payroll-import layout — one line per worker per pay component (Hourly / Overtime / Per Diem) for the
   *  week's exported (locked) time, all branches you run payroll for. Builds a file only; nothing is re-sent or re-locked. */
  const paychexNow = () => {
    const session = useStore.getState().session!, auth = scopeFor(db, session.role, session.employeeId)
    const authBranches = auth.branchId === 'all' ? db.branches : db.branches.filter(b => b.id === auth.branchId)
    const done = db.time.filter(t => t.date >= wk && t.date <= end && t.status === 'Exported' && authBranches.some(b => b.id === byId(db.employees, t.employeeId)?.branchId))
    if (!done.length) { toast('Export the week first', { description: 'The Paychex file only carries locked (exported) time' }); return }
    const per = new Map<string, { reg: number; ot: number; pd: number; jobs: Set<string> }>(), wkH = new Map<string, number>()
    for (const t of [...done].sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start))) { const h0 = wkH.get(t.employeeId) ?? 0, reg = Math.max(0, Math.min(t.hours, 40 - h0)); wkH.set(t.employeeId, h0 + t.hours)
      const a = per.get(t.employeeId) ?? { reg: 0, ot: 0, pd: 0, jobs: new Set<string>() }; a.reg += reg; a.ot += t.hours - reg; a.pd += t.perDiems.reduce((x, p) => x + PER_DIEM_RATES[p], 0); const jn = byId(db.jobs, t.jobId)?.jobNo; if (jn) a.jobs.add(jn); per.set(t.employeeId, a) }
    const r2 = (n: number) => Math.round(n * 100) / 100, client = 'DEMO-CLIENT'
    const rows: (string | number)[][] = []
    per.forEach((a, id) => { const e = byId(db.employees, id)!; const rate = e.rate ?? 0, job = [...a.jobs].join(' ')
      if (a.reg > 0) rows.push([client, e.empNo, fullName(e), 'Hourly', r2(a.reg), rate, r2(a.reg * rate), end, job])
      if (a.ot > 0) rows.push([client, e.empNo, fullName(e), 'Overtime', r2(a.ot), r2(rate * 1.5), r2(a.ot * rate * 1.5), end, job])
      if (a.pd > 0) rows.push([client, e.empNo, fullName(e), 'Per Diem', '', '', r2(a.pd), end, job]) })
    rows.push(['DEMO — unverified', 'DEMO-CLIENT is a placeholder. Hourly, Overtime, and Per Diem are not a confirmed Paychex company mapping. Do not import into payroll until that mapping is confirmed.'])
    downloadCsv(`paychex-flex-${wk}.csv`, [['Client ID', 'Worker ID', 'Worker Name', 'Pay Component', 'Hours', 'Rate', 'Amount', 'Check Date / Period End', 'Job Number'], ...rows])
    toast.success(`Demo Paychex file · unverified · ${per.size} workers · ${rows.length - 1} lines`, { description: 'Placeholder client DEMO-CLIENT. Pay components Hourly, Overtime, Per Diem must be confirmed against the real Paychex company before use.' })
  }
  const exportNow = async () => {
    // dive3 B3: payroll covers every branch this person is authorized for — never just what the screen happens to show.
    const session = useStore.getState().session!, auth = scopeFor(db, session.role, session.employeeId)
    const authBranches = auth.branchId === 'all' ? db.branches : db.branches.filter(b => b.id === auth.branchId)
    const inAuth = (t: T.TimeEntry) => { const e = byId(db.employees, t.employeeId); return !!e && authBranches.some(b => b.id === e.branchId) }
    const weekAll = db.time.filter(t => t.date >= wk && t.date <= end && inAuth(t))
    const narrowed = f.branchId !== 'all' && authBranches.length > 1 || f.divisionId !== 'all'
    let scopeBranches = authBranches, list = weekAll
    const weekOpen = today() <= end
    if (narrowed || weekOpen) {
      const shownB = db.branches.find(b => b.id === f.branchId)
      const r = await confirmChoice('Export payroll for which people?', <>{weekOpen && <div className="mb-2 font-semibold text-warn" data-testid="pay-week-open">The week isn’t over yet (it ends {fmtDate(end)}). Exported records lock — later time for these days needs a correction.</div>}
        {narrowed ? <>The screen is filtered to {shownB ? shownB.code : 'one division'}. Payroll normally goes out for everyone you run payroll for: {authBranches.map(b => b.code).join(', ')}.</> : <>This exports {authBranches.map(b => b.code).join(', ')}.</>}</>,
        [{ label: 'Cancel', value: '', tone: 'ghost' }, ...(narrowed ? [{ label: `Only ${shownB?.code ?? 'what’s shown'}`, value: 'shown' }] : []), { label: `All ${authBranches.length > 1 ? `${authBranches.length} branches` : authBranches[0]?.code ?? ''}`, value: 'all', tone: 'primary' as const }])
      if (!r?.value) return
      if (r.value === 'shown') { list = entries; scopeBranches = shownB ? [shownB] : authBranches }
    }
    const scopeLabel = scopeBranches.length === db.branches.length ? `All branches (${scopeBranches.map(b => b.code).join(', ')})` : scopeBranches.map(b => b.code).join(', ')
    const ids = list.filter(t => t.status === 'Approved').map(t => t.id)
    const again = !ids.length && list.some(t => t.status === 'Exported') // re-download the batch already sent
    if (!ids.length && !again) { toast('Nothing approved to export', { description: scopeLabel }); return }
    const entriesX = list
    // payable rows + flagged rows (held, clearly marked, not in the totals) so the file reconciles to the page header
    const pay = entriesX.filter(t => t.status === (again ? 'Exported' : 'Approved')), held = entriesX.filter(t => t.status === 'Flagged' || t.status === 'Submitted') // nothing silently dropped: unapproved rows are listed as held
    const pd = (t: T.TimeEntry) => t.perDiems.reduce((x, p) => x + PER_DIEM_RATES[p], 0)
    // dive3 m7: REG / OT (over 40 h in the week, per person, in date order), rate and gross wages so the file loads into Paychex/ADP
    const split = new Map<string, { reg: number; ot: number }>(), wkH = new Map<string, number>()
    for (const t of [...pay].sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start))) { const h0 = wkH.get(t.employeeId) ?? 0, reg = Math.max(0, Math.min(t.hours, 40 - h0)); split.set(t.id, { reg: Math.round(reg * 100) / 100, ot: Math.round((t.hours - reg) * 100) / 100 }); wkH.set(t.employeeId, h0 + t.hours) }
    const gross = (t: T.TimeEntry) => { const e = byId(db.employees, t.employeeId), r = e?.rate ?? 0, sp = split.get(t.id) ?? { reg: t.hours, ot: 0 }; return Math.round((sp.reg * r + sp.ot * r * 1.5) * 100) / 100 }
    const row = (t: T.TimeEntry, st: string) => { const e = byId(db.employees, t.employeeId)!; const sp = st === 'Pay' ? split.get(t.id) : undefined; return [e.empNo, fullName(e), t.date, t.activity, byId(db.jobs, t.jobId)?.jobNo ?? '', t.start, t.end, t.mealMin, t.hours, sp ? sp.reg : '', sp ? sp.ot : '', 0, e.rate ?? '', sp ? gross(t) : '', t.perDiems.join('+'), pd(t), st, t.note ?? ''] }
    const slug = scopeBranches.length === db.branches.length ? 'all-branches' : scopeBranches.map(b => b.code.toLowerCase()).join('-')
    downloadCsv(`payroll-${wk}-${slug}${again ? '-copy' : ''}.csv`, [['Employee #', 'Name', 'Date', 'Activity', 'Job', 'Start', 'End', 'Meal', 'Hours', 'REG', 'OT (over 40/wk)', 'DT', 'Rate', 'Gross wages', 'Per diems', 'Per diem $', 'Status', 'Flag / note'], ...pay.map(t => row(t, 'Pay')), ...held.map(t => row(t, t.status === 'Flagged' ? 'FLAGGED - hold, do not pay' : 'HELD - not approved, do not pay')), ['TOTAL PAYABLE', '', '', '', '', '', '', '', Math.round(pay.reduce((s, t) => s + t.hours, 0) * 100) / 100, Math.round(pay.reduce((s, t) => s + (split.get(t.id)?.reg ?? 0), 0) * 100) / 100, Math.round(pay.reduce((s, t) => s + (split.get(t.id)?.ot ?? 0), 0) * 100) / 100, 0, '', Math.round(pay.reduce((s, t) => s + gross(t), 0) * 100) / 100, '', pay.reduce((s, t) => s + pd(t), 0), `${pay.length} entries`, held.length ? `${held.length} entries held for review (${Math.round(held.reduce((s, t) => s + t.hours, 0) * 100) / 100} h) — not exported` : ''], ['SCOPE', scopeLabel, `Week ${wk} to ${end}`, `Exported by ${session.name}`]])
    if (again) { toast.success('Exported batch downloaded again', { description: 'Same locked records — nothing re-sent' }); return }
    actions.exportTime(ids); toast.success(`${ids.length} entries exported · ${scopeLabel}`, { description: `Records locked · payroll CSV downloaded${held.length ? ` · ${held.length} held for review (${Math.round(held.reduce((s, t) => s + t.hours, 0) * 10) / 10} h) — not exported` : ''}` })
  }
  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader eyebrow="Timekeeping & payroll" title="Time" sub={`${hrs.toFixed(1)} hours · ${money(perDiem)} per diem · ${flagged} flagged`} actions={<>
        <div className="flex items-center gap-1"><button className="btn-icon" onClick={() => setWk(addDays(wk, -7))} aria-label="Previous week"><ChevronLeft className="size-5" /></button><span className="text-sm font-semibold w-36 text-center">{fmtDate(wk)} – {fmtDate(end)}</span><button className="btn-icon" onClick={() => setWk(addDays(wk, 7))} aria-label="Next week"><ChevronRight className="size-5" /></button></div>
        {canApprove && entries.some(t => t.status === 'Exported') && <span className="inline-flex items-center gap-2 flex-wrap"><Button variant="secondary" icon={<Download className="size-4" />} onClick={paychexNow} data-testid="time-paychex">Paychex file</Button><Badge tone="warn" data-testid="paychex-demo">Demo · unverified</Badge></span>}
        {canApprove && <Button variant="primary" icon={<Download className="size-4" />} onClick={() => void exportNow()} data-testid="time-export">{!entries.some(t => t.status === 'Approved') && entries.some(t => t.status === 'Exported') ? 'Download exported batch' : 'Export to payroll'}</Button>}
      </>} />
      <Segmented className="mb-4" value={view} onChange={setView} options={[{ value: 'cards', label: 'Timecards' }, { value: 'recon', label: 'Ticket reconciliation', count: reconDays(db).filter(d => d.status === 'red').length }]} />
      {view === 'recon' ? <ReconQueue /> : <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Segmented value={tab} onChange={v => { setTab(v); setSel(new Set()) }} options={[{ value: 'review', label: 'Needs approval', count: entries.filter(t => t.status === 'Submitted' || t.status === 'Flagged').length }, { value: 'approved', label: 'Approved', count: entries.filter(t => t.status === 'Approved').length }, { value: 'exported', label: 'Exported' }, { value: 'all', label: 'All' }]} />
        {tab === 'review' && canApprove && <div className="ml-auto flex gap-2 sticky top-20 z-20">{sel.size > 0 && <Button variant="ok" icon={<Check className="size-4" />} onClick={() => approve([...sel])}>Approve {sel.size}</Button>}<Button data-testid="approve-clean" title={held ? `${held} overlapping / over-${16} h entr${held === 1 ? 'y is' : 'ies are'} held for review` : undefined} onClick={() => { if (!clean.length) { toast('Nothing clean to approve', { description: held ? `${held} held — overlaps or over 16 h` : undefined }); return } approve(clean.map(t => t.id)); if (held) toast.warning(`${held} held back`, { description: 'Overlapping times or over 16 h in a day — review them one by one' }) }}>Approve all clean{held ? ` · ${held} held` : ''}</Button></div>}
      </div>
      {!shown.length ? <Empty title="All caught up" body="Nothing in this view for the week." /> : <div className="flex flex-col gap-3">
        {[...byEmp.entries()].sort((a, b) => Number(b[1].some(t => t.status === 'Flagged')) - Number(a[1].some(t => t.status === 'Flagged')) || fullName(byId(db.employees, a[0])).localeCompare(fullName(byId(db.employees, b[0])))).map(([eid, list]) => { const e = byId(db.employees, eid)!; const wkHrs = entries.filter(t => t.employeeId === eid).reduce((s, t) => s + t.hours, 0); const hasFlag = list.some(t => t.status === 'Flagged' || (t.status === 'Submitted' && conflicts.has(t.id))); const isOpen = hasFlag !== expanded.has(eid); return (
          <Card key={eid} pad={false} className="overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b hairline cursor-pointer" onClick={ev => { if ((ev.target as HTMLElement).closest('a,button[data-ref],.ref-link')) return; const n = new Set(expanded); n.has(eid) ? n.delete(eid) : n.add(eid); setExpanded(n) }} data-testid="time-emp"><ChevronRight className={cn('size-4 text-muted transition shrink-0', isOpen && 'rotate-90')} /><Avatar name={fullName(e)} size={32} /><div className="flex-1"><div className="font-semibold"><EmpRef id={e.id} /></div><div className="text-xs text-muted">{e.craft} · #{e.empNo}</div></div><div className="text-right"><div className="font-semibold num">{wkHrs.toFixed(1)}h</div>{wkHrs > 40 && <div className="text-[11px] text-warn font-semibold">{(wkHrs - 40).toFixed(1)}h OT</div>}</div></div>
            {!isOpen && <div className="px-5 py-2 text-xs text-muted">{list.length} entr{list.length === 1 ? 'y' : 'ies'} · {[...new Set(list.map(t => t.jobId).filter(Boolean))].map((id, i) => <span key={id}>{i ? ', ' : ''}<JobRef id={id} /></span>)}{hasFlag ? ' · flagged' : ''} — tap to expand</div>}
            {isOpen && list.sort((a, b) => a.date.localeCompare(b.date)).map(t => (
              <div key={t.id} className={cn('flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0 text-sm', t.status === 'Flagged' && 'bg-bad/[.05]')}>
                {tab === 'review' && canApprove && <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={sel.has(t.id)} onChange={() => toggle(t.id)} aria-label="Select" />}
                <span className="w-20 text-muted">{dow(t.date)} {fmtDate(t.date)}</span>
                <span className="flex-1 min-w-0 truncate">{t.activity}{t.jobId ? <span className="text-muted"> · #{byId(db.jobs, t.jobId)?.jobNo}</span> : ''}{t.note ? <span className={cn('ml-2 text-xs', t.status === 'Flagged' ? 'text-bad' : 'text-muted')}>{t.note}</span> : ''}{conflicts.has(t.id) && t.status !== 'Exported' ? <span className="ml-2 text-xs text-bad font-semibold" data-testid="time-conflict">⚠ {conflicts.get(t.id)}</span> : ''}</span>
                <span className="hidden md:block w-28 num text-muted">{t.start}–{t.end}</span>
                <span className="hidden md:block w-40 text-xs text-muted truncate">{t.perDiems.join(', ')}</span>
                <span className="w-14 text-right num font-semibold">{t.hours}h</span>
                <Badge tone={t.status === 'Flagged' ? 'bad' : t.status === 'Approved' ? 'ok' : t.status === 'Exported' ? 'neutral' : 'info'}>{t.status}</Badge>
                {tab === 'review' && canApprove && <><button className="btn-icon size-8" title="Approve" onClick={() => approve([t.id])}><Check className="size-4 text-ok" /></button>{t.status !== 'Flagged' && <button className="btn-icon size-8" title="Flag" onClick={() => { actions.flagTime(t.id, 'Flagged by payroll — call employee'); toast('Flagged') }}><Flag className="size-4" /></button>}</>}
              </div>
            ))}
          </Card>) })}
      </div>}
      </>}
    </div>
  )
}
