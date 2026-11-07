import { useCallback, useMemo, useState } from 'react'
import { HardHat, Pencil, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button } from '../components/ui'
import { useStore } from '../data/store'
import type { WFarm, WTurbine } from '../data/wind'
import type { ULocal } from './payroll'
import { useTurbineCounty, countyOfTurbine, localOf } from './turbine'

const ADMIN = ['owner', 'payroll', 'hr']
/** Farm-level roll-up: county + local per turbine, and whether the farm crosses a county line. */
export function useFarmUnion(farm: WFarm, turbines: WTurbine[] | null, locals: ULocal[] | null) {
  const ov = useTurbineCounty(s => s.ov)
  const per = useMemo(() => turbines ? new Map(turbines.map(t => { const c = countyOfTurbine(t, farm, ov); return [t[0], { c, l: localOf(locals, c) }] })) : null, [turbines, farm, ov, locals])
  const info = useCallback((t: WTurbine) => { const x = per?.get(t[0]); return x ? `${x.c.county ?? '?'} Co. · ${x.l ? `Local ${x.l.local}` : 'no local'}${x.c.src === 'Admin override' ? ' (override)' : ''}` : '' }, [per])
  if (!per) return null
  const g = new Map<string, { key: string; county: string; local?: string; n: number }>()
  per.forEach(({ c, l }) => { const k = `${c.county}|${c.st}`; const e = g.get(k) ?? { key: k, county: c.county ?? '?', local: l ? String(l.local) : undefined, n: 0 }; e.n++; g.set(k, e) })
  const groups = [...g.values()].sort((a, b) => b.n - a.n)
  return { per, info, groups, counties: groups.length, locals: new Set(groups.map(x => x.local ?? 'none')).size }
}

/** Turbine detail: county + local for each selected turbine, admin override with audit trail. */
export function TurbineUnion({ farm, chosen, locals }: { farm: WFarm; chosen: { t: WTurbine; label: string }[]; locals: ULocal[] | null }) {
  const ov = useTurbineCounty(s => s.ov), setOv = useTurbineCounty(s => s.setOv)
  const role = useStore(s => s.session?.role), audit = useStore(s => s.db.audit)
  const [edit, setEdit] = useState<number | null>(null), [pick, setPick] = useState(''), [why, setWhy] = useState('')
  const stateCounties = useMemo(() => [...new Set((locals ?? []).flatMap(l => l.counties.filter(([, s]) => s === farm.st).map(([c]) => c)))].sort(), [locals, farm.st])
  return <div className="px-4 py-3 border-t hairline flex flex-col gap-2" data-testid="turbine-union">
    <div className="text-xs font-semibold text-muted inline-flex items-center gap-1.5"><HardHat className="size-3.5" />Union jurisdiction — per turbine (county from the turbine’s own lat/lon, Census county boundaries)</div>
    {chosen.map(({ t, label }) => { const c = countyOfTurbine(t, farm, ov), l = localOf(locals, c), hist = audit.filter(a => a.entity === `Turbine ${label}` && /Turbine county/.test(a.action)).slice(0, 3)
      return <div key={t[0]} className="rounded-xl bg-surface-2 p-3 text-sm" data-testid="turbine-union-row">
        <div className="flex flex-wrap items-center gap-2"><b>{label}</b><span data-testid="turbine-county">{c.county ?? '?'} Co., {c.st}</span><span>→</span>{l ? <Badge tone="accent">IUOE Local {l.local}</Badge> : <Badge>No local (open shop)</Badge>}<Badge tone={c.src === 'Admin override' ? 'warn' : 'neutral'}>{c.src}</Badge>
          {role && ADMIN.includes(role) && <span className="ml-auto flex gap-1.5">{ov[t[0]] && <Button size="sm" icon={<RotateCcw className="size-3.5" />} onClick={() => { setOv(t[0], label, null); toast('County reset to Census boundary') }} data-testid="turbine-county-reset">Reset</Button>}<Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => { setEdit(t[0]); setPick(c.county ?? ''); setWhy('') }} data-testid="turbine-county-edit">Override county</Button></span>}</div>
        {edit === t[0] && <div className="mt-2 flex flex-wrap gap-2 items-center"><select className="input !h-9 !w-48" value={pick} onChange={e => setPick(e.target.value)} data-testid="turbine-county-pick">{stateCounties.map(x => <option key={x}>{x}</option>)}</select><input className="input !h-9 flex-1 min-w-40" placeholder="Reason (e.g. surveyed pad is across the line)" value={why} onChange={e => setWhy(e.target.value)} data-testid="turbine-county-why" />
          <Button size="sm" variant="primary" data-testid="turbine-county-save" onClick={() => { const base = countyOfTurbine(t, farm, {}); setOv(t[0], label, { county: pick, st: farm.st, was: `${base.county} Co.`, why: why.trim() || undefined }); setEdit(null); toast.success(`${label} → ${pick} Co. (audit-logged)`) }}>Save</Button><Button size="sm" onClick={() => setEdit(null)}>Cancel</Button></div>}
        {hist.length > 0 && <div className="mt-1.5 text-[11px] text-muted" data-testid="turbine-county-audit">{hist.map(a => <div key={a.id}>{new Date(a.at).toLocaleString()} · {a.actor}: {a.action} — {a.detail}</div>)}</div>}
      </div> })}
  </div>
}
