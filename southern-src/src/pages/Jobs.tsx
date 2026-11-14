import { useMemo, useState } from 'react'
import { canSeeMoney } from '../data/roles'
import { useKeep } from '../lib/keep'
import { Plus, Search } from 'lucide-react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { inScope, jobCosting, customerOf, siteOf, byId, crewOn, absenceOn } from '../data/logic'
import { requiredPositions } from '../data/seed'
import { money, fmtDate, cn, today } from '../lib/util'
import { PageHeader, Button, Segmented, Badge, Empty } from '../components/ui'
import { HealthPill } from '../components/JobCost'
import { JOB_STATUS_TONE, DivisionChip } from '../components/bits'

const STAGES: T.JobStage[] = ['Quote', 'Awarded', 'Scheduled', 'In Progress', 'Complete', 'Invoiced', 'Paid']

export default function Jobs() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const open = useStore(s => s.open)
  const setUI = useStore(s => s.setUI)
  const [view, setView] = useKeep<'list' | 'pipeline'>('jobs:view', 'list')
  const [stage, setStage] = useKeep<'active' | T.JobStage | 'all'>('jobs:stage', 'active')
  const t = today()
  const [q, setQ] = useKeep('jobs:q', '')
  const jobs = useMemo(() => db.jobs.filter(j => inScope(j, f) && !j.quoteLost).map(j => ({ j, c: jobCosting(db, j) })), [db, f])
  const ql = q.toLowerCase()
  const match = (j: T.Job) => !q || `${j.jobNo} ${j.name} ${customerOf(db, j).name} ${siteOf(db, j).city} ${byId(db.equipment, j.craneId)?.unit ?? ''}`.toLowerCase().includes(ql)
  const list = jobs.filter(({ j }) => match(j) && (stage === 'all' || (stage === 'active' ? ['Scheduled', 'In Progress'].includes(j.stage) : j.stage === stage))).sort((a, b) => stage === 'active' ? (Number(b.j.stage === 'In Progress') - Number(a.j.stage === 'In Progress')) || a.j.startDate.localeCompare(b.j.startDate) : b.j.startDate.localeCompare(a.j.startDate))
  const pipeValue = jobs.filter(x => x.j.stage === 'Quote' || x.j.stage === 'Awarded').reduce((s, x) => s + x.j.quote.revenue, 0)
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader eyebrow="Quote → job → invoice" title="Jobs" sub={canSeeMoney(useStore.getState().session?.role) ? `${jobs.length} jobs · ${money(pipeValue, true)} in quotes & awarded work` : `${jobs.length} jobs`} actions={<>
        <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'pipeline', label: 'Pipeline' }]} />
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setUI({ jobBuilder: {} })}>New job</Button>
      </>} />
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="relative w-full sm:w-80"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Job #, customer, city, crane" value={q} onChange={e => setQ(e.target.value)} /></div>
        {view === 'list' && <Segmented size="sm" value={stage} onChange={setStage} options={[{ value: 'active', label: 'Active' }, ...STAGES.map(s => ({ value: s, label: s, count: jobs.filter(x => x.j.stage === s).length })), { value: 'all', label: 'All' }]} />}
      </div>
      {view === 'list' ? (
        list.length ? <div className="card p-0 overflow-hidden">
          {list.map(({ j, c }) => (
            <button key={j.id} onClick={() => open({ type: 'job', id: j.id })} className="w-full flex items-center gap-4 px-5 py-4 border-b hairline last:border-0 hover:bg-surface-2 transition text-left">
              <span className="w-16 text-sm font-bold num text-muted">#{j.jobNo}</span>
              <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{customerOf(db, j).name}</span><span className="block text-xs text-muted truncate">{j.name} · {siteOf(db, j).city}, {siteOf(db, j).state}</span></span>
              <span className="hidden md:block w-24"><DivisionChip id={j.divisionId} /></span>
              <span className="hidden lg:block w-24 text-sm">{byId(db.equipment, j.craneId) ? `Crane ${byId(db.equipment, j.craneId)!.unit}` : j.type}</span>
              <span className="hidden xl:block w-20">{(() => { if (j.stage !== 'In Progress' && j.stage !== 'Scheduled') return null; const d = j.startDate > t ? j.startDate : t; const need = requiredPositions(j, d).length; const have = crewOn(db, j.id, d).filter(a => !absenceOn(db, a.employeeId, d)).length; return <span className={cn('text-xs font-semibold num', have >= need ? 'text-ok' : 'text-warn')} title="Crew filled">{have}/{need} crew</span> })()}</span>
              <span className="hidden md:block w-32 text-xs text-muted">{fmtDate(j.startDate)} – {fmtDate(j.endDate)}</span>
              <span className="w-24"><Badge tone={JOB_STATUS_TONE[j.status]}>{j.stage === 'In Progress' || j.stage === 'Scheduled' ? j.status : j.stage}</Badge></span>
              <span className="hidden sm:block w-36 text-right">{c.health === 'pending' ? <span className="text-sm num font-semibold">{money(j.quote.revenue, true)}</span> : <HealthPill health={c.health} />}</span>
            </button>
          ))}
        </div> : <Empty title="No jobs match" body="Try another stage or search." />
      ) : (
        <div className="flex gap-3 overflow-x-auto scroll-thin pb-4">
          {STAGES.map(s => { const col = jobs.filter(x => x.j.stage === s && match(x.j)); return (
            <div key={s} className="w-72 shrink-0">
              <div className="flex items-center justify-between px-1 mb-2"><span className="font-semibold">{s}</span><span className="text-xs text-muted num">{col.length} · {money(col.reduce((t, x) => t + x.j.quote.revenue, 0), true)}</span></div>
              <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto scroll-thin">
                {col.map(({ j, c }) => (
                  <button key={j.id} onClick={() => open({ type: 'job', id: j.id })} className="card p-4 text-left hover:-translate-y-0.5 transition">
                    <div className="flex items-center justify-between"><span className="text-xs font-bold num text-muted">#{j.jobNo}</span><DivisionChip id={j.divisionId} /></div>
                    <div className="font-semibold mt-1 truncate">{customerOf(db, j).name}</div>
                    <div className="text-xs text-muted truncate">{j.name}</div>
                    <div className="flex items-center justify-between mt-3"><span className="text-sm font-semibold num">{money(j.quote.revenue, true)}</span>{c.health !== 'pending' && <HealthPill health={c.health} />}</div>
                  </button>
                ))}
              </div>
            </div>) })}
        </div>
      )}
      <div className={cn('hidden')} />
    </div>
  )
}
