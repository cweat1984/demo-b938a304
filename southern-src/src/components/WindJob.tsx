import { useMemo, useState } from 'react'
import { Navigation, Building2, Wind, MapPin, Pencil } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { useWind, mft, type WTurbine } from '../data/wind'
import { TurbineMap } from './WindMaps'
import { TurbinePicker } from './WindPick'
import { navUrl } from '../field/kit'
import { cn } from '../lib/util'
import { useLocals } from '../union/UnionPage'
import { countyOfJobTurbine, localOf, useTurbineCounty } from '../union/turbine'

/** Turbines + O&M check-in for a wind job. Used in the job drawer and the field app's Current Job. */
export default function WindJobCard({ job, field }: { job: T.Job; field?: boolean }) {
  const ws = useStore(s => (job.windFarmId ? s.db.windSites?.[job.windFarmId] : undefined))
  const setUI = useStore(s => s.setUI), go = useStore(s => s.go)
  const w = useWind()
  const farm = job.windFarmId ? w?.byId.get(job.windFarmId) : undefined
  const [pick, setPick] = useState(false)
  const om = ws?.pins.find(p => p.kind === 'O&M')
  const gate = ws?.pins.find(p => p.kind === 'Gate')
  const tt = job.turbines ?? []
  const asW = useMemo(() => tt.map(t => [t.caseId, t.faaOrs ?? '', t.lng, t.lat, 0] as WTurbine), [tt])
  const sel = useMemo(() => new Set(tt.map(t => t.caseId)), [tt])
  const lbl = useMemo(() => (t: WTurbine) => tt.find(x => x.caseId === t[0])?.label ?? `#${t[0]}`, [tt])
  const locals = useLocals(); useTurbineCounty(s => s.ov)
  const site = useStore(s => s.db.sites.find(x => x.id === job.siteId))
  const tu = (t: T.JobTurbine) => { const c = countyOfJobTurbine(t, site?.state ?? ''); const l = localOf(locals, c); return c ? `${c.county} Co. · ${l ? `Local ${l.local}` : 'no local'}${c.src === 'Admin override' ? ' (override)' : ''}` : '' }
  if (!job.windFarmId) return null
  const row = field ? 'min-h-14 rounded-2xl bg-surface-2 px-4' : 'min-h-11 rounded-xl bg-surface-2 px-3'
  const go_ = field ? 'h-11 px-4 rounded-full text-sm' : 'h-8 px-3 rounded-lg text-xs'
  return (
    <div className={cn(field ? 'flex flex-col gap-2' : 'card p-5 flex flex-col gap-2')} data-testid="wind-job">
      {!field && <div className="flex items-center gap-2"><Wind className="size-4 text-accent" /><div className="font-semibold">{farm?.name ?? 'Wind farm'}</div><span className="text-xs text-muted">{farm ? `${farm.models[0]?.manu} ${farm.models[0]?.model} · hub ${mft(farm.models[0]?.hh)}` : ''}</span>
        <button className="ml-auto text-xs font-semibold text-accent" onClick={() => useStore.getState().open({ type: 'windfarm', id: job.windFarmId! })}>Open farm</button></div>}
      {farm && tt.length > 0 && <TurbineMap farm={farm} turbines={asW} labels={lbl} selected={sel} pins={ws?.pins ?? []} height={field ? 190 : 220} satellite compact />}
      {om && <div className={cn('flex items-center gap-3', row)} data-testid="om-checkin"><Building2 className="size-5 text-info shrink-0" /><div className="flex-1 min-w-0"><div className="font-semibold text-sm">Check in at O&M</div><div className="text-xs text-muted truncate">{om.label}</div></div><a href={navUrl(om.lat, om.lng)} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1.5 bg-info-solid text-white font-semibold', go_)}><Navigation className="size-4" />Go</a></div>}
      {gate && <div className={cn('flex items-center gap-3', row)}><MapPin className="size-5 text-warn shrink-0" /><div className="flex-1 min-w-0"><div className="font-semibold text-sm">{gate.label}</div></div><a href={navUrl(gate.lat, gate.lng)} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1.5 bg-surface-3 font-semibold', go_)}><Navigation className="size-4" />Go</a></div>}
      {tt.map(t => <div key={t.caseId} className={cn('flex items-center gap-3', row)} data-testid="job-turbine"><Wind className="size-5 text-accent shrink-0" /><div className="flex-1 min-w-0"><div className="font-semibold">Turbine {t.label}{tu(t) && <span className="ml-2 text-xs font-normal text-muted" data-testid="job-turbine-union">{tu(t)}</span>}</div><div className="text-xs text-muted truncate num">{t.model ? `${t.model} · ` : ''}{t.hh ? `hub ${mft(t.hh)} · ` : ''}{t.lat.toFixed(5)}, {t.lng.toFixed(5)}</div></div><a href={navUrl(t.lat, t.lng)} target="_blank" rel="noreferrer" className={cn('inline-flex items-center gap-1.5 bg-accent text-accent-ink font-semibold', go_)}><Navigation className="size-4" />Go</a></div>)}
      {!field && <div className="flex gap-2"><button className="text-xs font-semibold text-muted inline-flex items-center gap-1.5 hover:text-ink" onClick={() => setPick(true)} data-testid="edit-turbines"><Pencil className="size-3.5" />{tt.length ? 'Change turbines' : 'Pick turbines'}</button>{!om && <span className="text-xs text-faint">No O&M pin yet. Drop one on the farm map.</span>}</div>}
      {!field && <TurbinePicker farm={farm} open={pick} initial={tt} onClose={() => setPick(false)} onDone={t => actions.setJobTurbines(job.id, job.windFarmId, t)} />}
    </div>
  )
}
