import { useCallback, useEffect, useMemo, useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { Wind, Search, ArrowLeft, Navigation, MapPin, Plus, Trash2, Pencil, Info, Building2, Map as MapIcon, List, Phone, Briefcase, SlidersHorizontal, X } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { useWind, useTurbines, turbineLabel, mft, ft, maxHub, suggestCrane, nacelleTons, type WFarm, type WTurbine } from '../data/wind'
import { PageHeader, Segmented, Card, Button, Field, Badge, Empty, Toggle, Stat, Modal } from '../components/ui'
import { FarmClusterMap, TurbineMap, PIN_COLORS } from '../components/WindMaps'
import { useLocals } from '../union/UnionPage'
import { TurbineUnion, useFarmUnion } from '../union/TurbineUnion'
import { JobRef } from '../components/bits'
import { nextWindow, byId } from '../data/logic'
import { distMiles } from '../data/seed'
import { navUrl } from '../field/kit'
import { cn, num, fmtDate } from '../lib/util'

const PIN_KINDS: T.SitePinKind[] = ['O&M', 'Gate', 'Laydown', 'Substation', 'Other']

export default function WindFarms() {
  const id = useStore(s => s.ui.windFarm)
  const w = useWind()
  if (!w) return <div className="max-w-[1400px] mx-auto"><PageHeader eyebrow="Sales · wind farm directory" title="Wind Farms" sub="Loading the U.S. Wind Turbine Database…" /><div className="card h-96 animate-pulse" /></div>
  const farm = id ? w.byId.get(id) : undefined
  return farm ? <FarmDetail farm={farm} /> : <Directory />
}

function Directory() {
  const w = useWind()!
  const db = useStore(s => s.db)
  const setUI = useStore(s => s.setUI)
  const [view, setView] = useKeep<'list' | 'map'>('windfarms:view', 'list')
  const [q, setQ] = useKeep('windfarms:q', ''), [st, setSt] = useKeep('windfarms:st', 'home'), [manu, setManu] = useKeep('windfarms:manu', ''), [model, setModel] = useKeep('windfarms:model', '')
  const [hhMin, setHhMin] = useState(''), [hhMax, setHhMax] = useState(''), [yr, setYr] = useState(''), [mw, setMw] = useState(''), [ours, setOurs] = useState(false)
  const [sheet, setSheet] = useState(false)
  const [sort, setSort] = useKeep<'mw' | 'hh' | 'year' | 'name'>('windfarms:sort', 'mw'), [limit, setLimit] = useState(60)
  const states = useMemo(() => [...new Set(w.farms.map(f => f.st))].sort(), [w])
  const manus = useMemo(() => [...new Set(w.farms.flatMap(f => f.models.map(m => m.manu)))].filter(m => m !== 'Unknown').sort(), [w])
  const jobFarms = useMemo(() => { const m = new Map<string, number>(); db.jobs.forEach(j => j.windFarmId && m.set(j.windFarmId, (m.get(j.windFarmId) ?? 0) + 1)); return m }, [db.jobs])
  const list = useMemo(() => {
    const ql = q.toLowerCase(), ml = model.toLowerCase()
    return w.farms.filter(f => (st === 'all' || (st === 'home' ? f.st === 'OK' || f.st === 'TX' : f.st === st))
      && (!ql || `${f.name} ${f.county}`.toLowerCase().includes(ql))
      && (!manu || f.models.some(m => m.manu === manu)) && (!ml || f.models.some(m => m.model.toLowerCase().includes(ml)))
      && (!hhMin || (maxHub(f) ?? 0) >= Number(hhMin)) && (!hhMax || (maxHub(f) ?? 999) <= Number(hhMax))
      && (!yr || (f.year ?? 0) >= Number(yr)) && (!mw || f.mw >= Number(mw)) && (!ours || jobFarms.has(f.id)))
      .sort((a, b) => sort === 'mw' ? b.mw - a.mw : sort === 'hh' ? (maxHub(b) ?? 0) - (maxHub(a) ?? 0) : sort === 'year' ? (b.year ?? 0) - (a.year ?? 0) : a.name.localeCompare(b.name))
  }, [w, q, st, manu, model, hhMin, hhMax, yr, mw, ours, sort, jobFarms])
  useEffect(() => setLimit(60), [list])
  const tot = list.reduce((s, f) => ({ n: s.n + f.n, mw: s.mw + f.mw }), { n: 0, mw: 0 })
  const open = (id: string) => setUI({ windFarm: id })
  const chips = [
    manu && { k: 'manu', label: manu, clear: () => setManu('') }, model && { k: 'model', label: `Model ${model}`, clear: () => setModel('') },
    hhMin && { k: 'hhMin', label: `Hub ≥ ${hhMin} m`, clear: () => setHhMin('') }, hhMax && { k: 'hhMax', label: `Hub ≤ ${hhMax} m`, clear: () => setHhMax('') },
    yr && { k: 'yr', label: `Since ${yr}`, clear: () => setYr('') }, mw && { k: 'mw', label: `≥ ${mw} MW`, clear: () => setMw('') }, ours && { k: 'ours', label: 'Our job sites', clear: () => setOurs(false) },
  ].filter(Boolean) as { k: string; label: string; clear: () => void }[]
  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHeader eyebrow="Sales · wind farm directory" title="Wind Farms" sub={`${num(list.length)} farms · ${num(tot.n)} turbines · ${num(Math.round(tot.mw))} MW in view`} actions={<Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'List' }, { value: 'map', label: 'Map' }]} />} />
      <div className="flex gap-2 items-center mb-3">
        <div className="relative flex-1 sm:flex-none sm:w-80"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Farm or county" value={q} onChange={e => setQ(e.target.value)} data-testid="wf-search" /></div>
        <button onClick={() => setSheet(true)} data-testid="wf-filters" className="shrink-0 inline-flex items-center gap-2 rounded-full px-4 h-11 text-sm font-semibold border border-line hover:bg-surface-2"><SlidersHorizontal className="size-4" />Filters{chips.length > 0 && <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-ink text-[11px] num">{chips.length}</span>}</button>
        <button onClick={() => setOurs(!ours)} className={cn('shrink-0 rounded-full px-4 h-11 text-sm font-semibold border hidden sm:inline-flex items-center gap-1.5', ours ? 'bg-surface-3 border-accent' : 'border-line')}>Our job sites <span className="num text-muted">{jobFarms.size}</span></button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4 min-h-7">
        <button onClick={() => setSheet(true)} className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-3 h-7 pointer-coarse:h-10 text-xs font-semibold">{st === 'home' ? 'OK + TX' : st === 'all' ? 'All states' : st}</button>
        {chips.map(c => <button key={c.k} onClick={c.clear} className="inline-flex items-center gap-1 rounded-full bg-accent/12 text-accent px-3 h-7 text-xs font-semibold">{c.label}<X className="size-3" /></button>)}
        {chips.length > 1 && <button onClick={() => chips.forEach(c => c.clear())} className="text-xs text-muted px-2 hover:text-ink">Clear all</button>}
      </div>
      <Modal open={sheet} onClose={() => setSheet(false)} title="Filter wind farms" width={520}>
        <div className="grid grid-cols-2 gap-3" data-testid="wf-sheet">
          <Field label="State"><select className="input" value={st} onChange={e => setSt(e.target.value)} aria-label="State" data-testid="wf-state"><option value="home">OK + TX</option><option value="all">All states</option>{states.map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Manufacturer"><select className="input" value={manu} onChange={e => setManu(e.target.value)} aria-label="Manufacturer"><option value="">Any manufacturer</option>{manus.map(m => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Model"><input className="input" placeholder="e.g. V150" value={model} onChange={e => setModel(e.target.value)} /></Field>
          <Field label="Online since"><input className="input" inputMode="numeric" placeholder="Year" value={yr} onChange={e => setYr(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Hub height ≥ (m)"><input className="input" inputMode="numeric" value={hhMin} onChange={e => setHhMin(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Hub height ≤ (m)"><input className="input" inputMode="numeric" value={hhMax} onChange={e => setHhMax(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Farm size ≥ (MW)"><input className="input" inputMode="numeric" value={mw} onChange={e => setMw(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="Only"><button onClick={() => setOurs(!ours)} className={cn('input text-left', ours && 'border-accent')}>{ours ? '✓ ' : ''}Our job sites ({jobFarms.size})</button></Field>
        </div>
        <Button variant="primary" className="w-full mt-5" onClick={() => setSheet(false)}>Show {num(list.length)} farms</Button>
      </Modal>
      {view === 'map' ? <FarmClusterMap farms={list} onOpen={open} height={600} /> : list.length ? (
        <Card pad={false} className="overflow-hidden">
          <div className="hidden md:grid grid-cols-[1fr_90px_90px_70px_1fr_150px] gap-3 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-faint border-b hairline">
            <button className="text-left" onClick={() => setSort('name')}>Farm</button><span>Turbines</span><button className="text-left" onClick={() => setSort('mw')}>MW {sort === 'mw' && '↓'}</button><button className="text-left" onClick={() => setSort('year')}>Online {sort === 'year' && '↓'}</button><span>Main model</span><button className="text-left" onClick={() => setSort('hh')}>Tallest hub {sort === 'hh' && '↓'}</button>
          </div>
          {list.slice(0, limit).map(f => (
            <button key={f.id} onClick={() => open(f.id)} className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[1fr_90px_90px_70px_1fr_150px] gap-3 px-5 py-3.5 border-b hairline last:border-0 hover:bg-surface-2 text-left items-center" data-testid="wf-row">
              <span className="min-w-0"><span className="font-semibold flex items-center gap-2">{f.name}{jobFarms.has(f.id) && <Badge tone="accent">{jobFarms.get(f.id)} jobs</Badge>}</span><span className="block text-xs text-muted truncate">{f.county} Co., {f.st}</span></span>
              <span className="num hidden md:block">{num(f.n)}</span><span className="num hidden md:block">{Math.round(f.mw)}</span><span className="num hidden md:block">{f.year ?? '—'}</span>
              <span className="hidden md:block text-sm truncate">{f.models[0]?.manu} {f.models[0]?.model}{f.models.length > 1 && <span className="text-muted"> +{f.models.length - 1}</span>}</span>
              <span className="num text-sm text-right md:text-left">{mft(maxHub(f))}</span>
            </button>))}
          {list.length > limit && <div className="p-3 text-center"><Button size="sm" onClick={() => setLimit(limit + 120)}>Show more ({num(list.length - limit)} left)</Button></div>}
        </Card>) : <Empty icon={<Wind className="size-6" />} title="No farms match" body="Loosen a filter or switch to All states." />}
      <Attribution />
    </div>
  )
}

function Attribution() {
  const w = useWind()!
  return <div className="mt-6 text-xs text-muted flex items-start gap-2" data-testid="uswtdb-attribution"><Info className="size-4 shrink-0" /><span>Data: {w.meta.source}, v{w.meta.version} ({fmtDate(w.meta.date, { month: 'long', day: 'numeric', year: 'numeric' })}), {w.meta.license.toLowerCase()} · <a className="underline" href={w.meta.doi} target="_blank" rel="noreferrer">doi.org/10.5066/F7TX3DN0</a>. Onshore projects only. Notes, contacts, site pins and turbine numbers are our own and stay in Southern Command.</span></div>
}

function FarmDetail({ farm }: { farm: WFarm }) {
  const db = useStore(s => s.db)
  const setUI = useStore(s => s.setUI)
  const ws = db.windSites?.[farm.id]
  const turbines = useTurbines(farm)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [sat, setSat] = useState(true)
  const [drop, setDrop] = useState<T.SitePinKind | null>(null)
  const [focus, setFocus] = useState<[number, number] | null>(null)
  const pins = ws?.pins ?? []
  const om = pins.find(p => p.kind === 'O&M')
  const jobs = db.jobs.filter(j => j.windFarmId === farm.id).sort((a, b) => b.startDate.localeCompare(a.startDate))
  const labelOf = useCallback((t: WTurbine, i: number) => turbineLabel(ws, t, i), [ws])
  const toggle = useCallback((t: WTurbine) => setSel(s => { const n = new Set(s); n.has(t[0]) ? n.delete(t[0]) : n.add(t[0]); return n }), [])
  const onDrop = useCallback((lat: number, lng: number) => { if (!drop) return; const label = window.prompt(`Label for this ${drop} pin`, drop === 'O&M' ? 'O&M building' : drop === 'Gate' ? 'Main gate' : drop === 'Laydown' ? 'Laydown yard' : drop === 'Substation' ? 'Substation' : 'Site pin'); if (label) { actions.addSitePin(farm.id, farm.name, { kind: drop, label, lat: +lat.toFixed(6), lng: +lng.toFixed(6) }); toast.success(`${drop} pin saved for everyone`) } setDrop(null) }, [drop, farm])
  const onMovePin = useCallback((pid: string, lat: number, lng: number) => { actions.moveSitePin(farm.id, pid, { lat: +lat.toFixed(6), lng: +lng.toFixed(6) }); toast.success('Pin moved') }, [farm.id])
  const chosen = (turbines ?? []).map((t, i) => ({ t, i })).filter(x => sel.has(x.t[0]))
  const locals = useLocals(), fu = useFarmUnion(farm, turbines, locals)
  const asJobTurbines = (): T.JobTurbine[] => chosen.map(({ t, i }) => { const m = farm.models[t[4]]; return { caseId: t[0], faaOrs: t[1] || undefined, county: (t as unknown as string[])[5], countySt: (t as unknown as string[])[6], label: labelOf(t, i), lat: t[3], lng: t[2], model: m ? `${m.manu} ${m.model}` : undefined, hh: m?.hh } })
  const main = farm.models[0]
  const hint = suggestCrane(main, db.equipment)
  const openJobs = db.jobs.filter(j => (j.type === 'Wind' || j.type === 'Uptower') && j.stage !== 'Paid' && j.stage !== 'Invoiced' && j.stage !== 'Complete')
  const [attachTo, setAttach] = useState('')
  const newJob = () => {
    const siteId = actions.ensureWindSite(farm)
    const tt = asJobTurbines()
    setUI({ jobBuilder: { prefill: { siteId, windFarmId: farm.id, turbines: tt, type: 'Wind', name: `${tt.length ? 'Main component exchange' : 'Wind service'}${tt.length ? ` — ${tt.map(t => t.label).join(' & ')}` : ''}`, notes: `${main ? `${main.manu} ${main.model} · hub ${mft(main.hh)}` : ''}` } } })
  }
  return (
    <div className="max-w-[1400px] mx-auto flex flex-col gap-5" data-testid="farm-detail">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <button className="text-sm text-muted inline-flex items-center gap-1.5 mb-2 hover:text-ink" onClick={() => setUI({ windFarm: null })}><ArrowLeft className="size-4" />All wind farms</button>
          <h1 className="display text-3xl md:text-4xl font-semibold tracking-tight">{farm.name}</h1>
          <div className="text-muted mt-1">{farm.county} County, {farm.st} · {farm.lat.toFixed(4)}, {farm.lng.toFixed(4)}{farm.eia && <> · EIA plant {farm.eia}</>}</div>
          {fu && <div className="mt-2 flex flex-wrap gap-1.5 items-center" data-testid="farm-union">{fu.counties > 1 && <span data-testid="farm-spans"><Badge tone="warn">Spans {fu.counties} counties · {fu.locals} local{fu.locals > 1 ? 's' : ''}</Badge></span>}{fu.groups.map(g => <Badge key={g.key} tone={g.local ? 'info' : 'neutral'}>{g.county} Co. → {g.local ? `Local ${g.local}` : 'no local'} · {g.n}</Badge>)}</div>}
        </div>
        <a className="inline-flex items-center justify-center gap-2 font-semibold transition-all bg-surface-2 text-ink hover:bg-surface-3 h-11 px-5 rounded-full text-sm" href={navUrl(farm.lat, farm.lng)} target="_blank" rel="noreferrer"><Navigation className="size-4" />Navigate to site</a>
        {om && <a className="inline-flex items-center justify-center gap-2 font-semibold transition-all bg-surface-2 text-ink hover:bg-surface-3 h-11 px-5 rounded-full text-sm" href={navUrl(om.lat, om.lng)} target="_blank" rel="noreferrer" data-testid="om-nav"><Building2 className="size-4" />Check in at O&M</a>}
        <Button variant="primary" icon={<Plus className="size-4" />} onClick={newJob} data-testid="farm-new-job">New job{sel.size ? ` · ${sel.size} turbine${sel.size > 1 ? 's' : ''}` : ''}</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Turbines" value={num(farm.n)} />
        <Stat label="Capacity" value={`${Math.round(farm.mw)} MW`} />
        <Stat label="Online" value={farm.year ?? '—'} />
        <Stat label="Tallest hub" value={maxHub(farm) ? `${Math.round(maxHub(farm)!)} m` : '—'} sub={maxHub(farm) ? `${ft(maxHub(farm))} ft` : undefined} />
        <Stat label="Our jobs here" value={jobs.length} />
      </div>

      <Card pad={false} className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b hairline">
          <button className={cn('rounded-full px-3 h-9 border text-xs font-semibold', sat ? 'bg-surface-3 border-accent' : 'border-line')} onClick={() => setSat(!sat)}>Satellite</button>
          <input className="input !h-9 !w-36 text-xs" placeholder="Find turbine (T-14)" data-testid="turbine-find" onKeyDown={e => { if (e.key !== 'Enter' || !turbines) return; const v = (e.target as HTMLInputElement).value.trim().toLowerCase(); const i = turbines.findIndex((t, k) => labelOf(t, k).toLowerCase() === v || String(t[0]) === v); if (i < 0) { toast.error('No turbine ' + v); return } const t = turbines[i]; setSel(s => new Set(s).add(t[0])); setFocus([t[3], t[2]]); (e.target as HTMLInputElement).value = '' }} />
          <span className="text-xs text-muted">{drop ? `Tap the map to drop the ${drop} pin` : 'Tap turbines to select · drag site pins to move'}</span>
          <span className="ml-auto text-xs font-semibold text-muted mr-1">Drop pin</span>
          {PIN_KINDS.map(k => <button key={k} onClick={() => setDrop(drop === k ? null : k)} data-testid={`drop-${k}`} className={cn('rounded-full px-3 h-9 border text-xs font-semibold inline-flex items-center gap-1.5', drop === k ? 'border-accent bg-surface-3' : 'border-line')}><span className="size-2.5 rounded-full" style={{ background: PIN_COLORS[k] }} />{k}</button>)}
        </div>
        {turbines ? <TurbineMap farm={farm} turbines={turbines} labels={labelOf} info={fu?.info} selected={sel} onToggle={toggle} pins={pins} dropKind={drop} onDrop={onDrop} onMovePin={onMovePin} height={540} satellite={sat} focus={focus} /> : <div className="h-[540px] animate-pulse bg-surface-2" />}
        {chosen.length > 0 && <div className="px-4 py-3 border-t hairline flex flex-wrap items-center gap-2" data-testid="turbine-selection">
          {chosen.map(({ t, i }) => <span key={t[0]} className="inline-flex items-center gap-1 rounded-full bg-surface-2 pl-3 pr-1 h-9 text-sm font-semibold"><MapPin className="size-3.5 text-accent" />{labelOf(t, i)}<span className="text-[11px] text-muted font-normal ml-1">USWTDB {t[0]}{fu ? ` · ${fu.info(t)}` : ''}</span>
            <button className="btn-icon !size-7" aria-label="Rename" onClick={() => { const v = window.prompt('Site turbine number (as painted on the tower)', labelOf(t, i)); if (v) actions.labelTurbine(farm.id, t[0], v.trim()) }}><Pencil className="size-3.5" /></button>
            <a className="btn-icon !size-7" aria-label="Navigate" href={navUrl(t[3], t[2])} target="_blank" rel="noreferrer"><Navigation className="size-3.5" /></a></span>)}
          <span className="ml-auto flex items-center gap-2">
            <select className="input !h-9 !w-64 text-sm" value={attachTo} onChange={e => setAttach(e.target.value)} aria-label="Attach to job"><option value="">Attach to job…</option>{[...jobs.filter(j => !['Paid', 'Invoiced', 'Complete'].includes(j.stage)), ...openJobs.filter(j => j.windFarmId !== farm.id)].map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {j.name.slice(0, 34)}</option>)}</select>
            <Button size="sm" variant="primary" disabled={!attachTo} data-testid="attach-turbines" onClick={() => { const j = db.jobs.find(x => x.id === attachTo)!; const merged = [...(j.windFarmId === farm.id ? j.turbines ?? [] : []).filter(x => !sel.has(x.caseId)), ...asJobTurbines()]; actions.setJobTurbines(j.id, farm.id, merged); if (j.windFarmId !== farm.id) actions.updateJob(j.id, { siteId: actions.ensureWindSite(farm) }, 'Moved job to wind farm'); toast.success(`Attached to Job #${j.jobNo}`, { description: merged.map(x => x.label).join(', ') }); setSel(new Set()) }}>Attach</Button>
            <Button size="sm" onClick={() => setSel(new Set())}>Clear</Button>
          </span>
        </div>}
        {chosen.length > 0 && <TurbineUnion farm={farm} chosen={chosen.map(({ t, i }) => ({ t, label: labelOf(t, i) }))} locals={locals} />}
      </Card>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <Card pad={false} className="overflow-hidden">
          <div className="px-5 py-4 font-semibold">Turbine models</div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wide text-faint text-left border-y hairline"><th className="px-5 py-2 font-semibold">Model</th><th className="font-semibold">Count</th><th className="font-semibold">Rated</th><th className="font-semibold">Hub height</th><th className="font-semibold">Rotor Ø</th><th className="font-semibold pr-5">Tip height</th></tr></thead>
            <tbody>{farm.models.map(m => <tr key={m.manu + m.model} className="border-b hairline last:border-0"><td className="px-5 py-3"><div className="font-semibold">{m.manu}</div><div className="text-xs text-muted">{m.model}</div></td><td className="num">{m.n}</td><td className="num">{m.kw ? `${num(m.kw)} kW` : '—'}</td><td className="num">{mft(m.hh)}</td><td className="num">{mft(m.rd)}</td><td className="num pr-5">{mft(m.th)}</td></tr>)}</tbody></table></div>
        </Card>
        <Card data-testid="crane-hint">
          <div className="flex items-center gap-2"><div className="font-semibold">Suggested crane</div><Badge tone="warn">Estimate</Badge></div>
          {hint ? <div className="mt-3 flex flex-col gap-2 text-sm">
            <div className="display text-xl font-semibold">{hint.label}</div><div className="text-muted">e.g. {hint.ex}</div>
            <div className="grid grid-cols-2 gap-2 mt-1"><div className="card-flat p-3"><div className="text-xs text-muted">Hook height needed</div><div className="font-semibold num">{mft(hint.hook)}</div></div><div className="card-flat p-3"><div className="text-xs text-muted">Nacelle weight (est.)</div><div className="font-semibold num">~{nacelleTons(main?.kw)} t</div></div></div>
            {hint.ours.length ? <div className="mt-2" data-testid="crane-matcher"><div className="label mb-2">Cranes that can do it here</div><div className="flex flex-col gap-1.5">{hint.ours.slice(0, 4).map(c => { const crawler = c.type === 'Crawler'; const need = crawler ? 10 : 6; const w = nextWindow(db, c.id, need); const b = byId(db.branches, c.branchId); const mi = b ? Math.round(distMiles([b.lat, b.lng], [farm.lat, farm.lng]) * 1.25) : 0; return (
              <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
                <button className="ref-link display text-xl font-semibold num w-12 text-left" onClick={() => useStore.getState().open({ type: 'equipment', id: c.id })}>{c.unit}</button>
                <div className="flex-1 min-w-0"><div className="font-semibold text-[13px] truncate">{c.capacity}t {c.make} {c.model}</div><div className="text-xs text-muted">{b?.code} · {mi} mi · {w ? <span className="text-ok font-semibold">free {fmtDate(w.start)}–{fmtDate(w.end)}</span> : 'booked solid 120 days'}</div></div>
                {w && <Button size="sm" variant="primary" data-testid="quote-it" onClick={() => { const siteId = actions.ensureWindSite(farm); const tt = asJobTurbines(); setUI({ jobBuilder: { prefill: { siteId, windFarmId: farm.id, turbines: tt, type: 'Wind', craneId: c.id, startDate: w.start, endDate: w.end, stage: 'Quote', name: `Main component exchange${tt.length ? ` — ${tt.map(t => t.label).join(' & ')}` : ''}`, notes: `${main ? `${main.manu} ${main.model} · hub ${mft(main.hh)}` : ''} · quoted with Crane ${c.unit}` } } }) }}>Quote it</Button>}
              </div>) })}</div></div> : <div className="mt-1 text-warn">No crane in our fleet reaches this class — sub-rent or partner.</div>}
            {hint.component.length > 0 && <div className="text-muted">Smaller main-component picks (gearbox, generator, blades) may fit {hint.component.map(c => `${c.unit} (${c.capacity}t)`).join(' or ')}.</div>}
            <div className="text-[11px] text-faint mt-1">Rule-based demo estimate from hub height and rated power. Not a lift plan. Confirm with the OEM component weights and engineering.</div>
          </div> : <div className="text-muted text-sm mt-2">No model data.</div>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <SiteInfo farm={farm} ws={ws} />
        <div className="flex flex-col gap-5">
          <Card>
            <div className="font-semibold mb-3">Site pins</div>
            {pins.length ? pins.map(p => <div key={p.id} className="flex items-center gap-3 py-2 border-b hairline last:border-0"><span className="size-3 rounded-full" style={{ background: PIN_COLORS[p.kind] }} /><button className="flex-1 text-left" onClick={() => setFocus([p.lat, p.lng])}><div className="font-medium">{p.label}{p.demo && <span className="ml-2"><Badge>demo</Badge></span>}</div><div className="text-xs text-muted num">{p.kind} · {p.lat.toFixed(5)}, {p.lng.toFixed(5)}{p.by ? ` · ${p.by}` : ''}</div></button><a className="btn-icon" href={navUrl(p.lat, p.lng)} target="_blank" rel="noreferrer" aria-label="Navigate"><Navigation className="size-4" /></a><button className="btn-icon" aria-label="Remove" onClick={() => actions.removeSitePin(farm.id, p.id)}><Trash2 className="size-4" /></button></div>)
              : <div className="text-sm text-muted">No pins yet. USWTDB doesn't include O&M buildings. Use "Drop pin → O&M" above, and the pin then shows on every job here as "Check in at O&M".</div>}
          </Card>
          <Card>
            <div className="font-semibold mb-3 flex items-center gap-2"><Briefcase className="size-4" />Job history here</div>
            {jobs.length ? jobs.map(j => <div key={j.id} className="flex items-center gap-3 py-2 border-b hairline last:border-0 text-sm"><JobRef id={j.id} long /><span className="ml-auto text-muted">{fmtDate(j.startDate)} · {j.stage}</span>{j.turbines?.length ? <Badge>{j.turbines.map(t => t.label).join(', ')}</Badge> : null}</div>) : <div className="text-sm text-muted">No jobs at this farm yet.</div>}
          </Card>
        </div>
      </div>
      <Attribution />
    </div>
  )
}

function SiteInfo({ farm, ws }: { farm: WFarm; ws?: T.WindSite }) {
  const [notes, setNotes] = useState(ws?.notes ?? ''), [gate, setGate] = useState(ws?.gate ?? '')
  const [contacts, setContacts] = useState(ws?.contacts ?? [])
  const [auto, setAuto] = useState(!!ws?.autoNumber)
  useEffect(() => { setNotes(ws?.notes ?? ''); setGate(ws?.gate ?? ''); setContacts(ws?.contacts ?? []); setAuto(!!ws?.autoNumber) }, [farm.id])
  return (
    <Card>
      <div className="font-semibold mb-1">Site info</div><div className="text-xs text-muted mb-4">Shared with sales, dispatch and the field crew.{ws?.updatedBy && ` Last edit: ${ws.updatedBy}.`}{ws?.demo && ' Seeded demo info.'}</div>
      <div className="flex flex-col gap-3">
        <Field label="Gate / access"><input className="input" value={gate} onChange={e => setGate(e.target.value)} placeholder="Gate code, entrance road, check-in rules" /></Field>
        <Field label="Notes"><textarea className="input min-h-24 py-2" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ground conditions, pad sizes, crane walk routes, owner preferences…" /></Field>
        <div><div className="text-xs font-semibold text-muted mb-2">Site contacts</div>
          {contacts.map((c, i) => <div key={i} className="grid grid-cols-[1fr_1fr_150px_auto] gap-2 mb-2"><input className="input" value={c.name} onChange={e => setContacts(contacts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Name" /><input className="input" value={c.role} onChange={e => setContacts(contacts.map((x, j) => j === i ? { ...x, role: e.target.value } : x))} placeholder="Role" /><input className="input num" value={c.phone} onChange={e => setContacts(contacts.map((x, j) => j === i ? { ...x, phone: e.target.value } : x))} placeholder="Phone" /><a className="btn-icon" href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} aria-label="Call"><Phone className="size-4" /></a></div>)}
          <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setContacts([...contacts, { name: '', role: '', phone: '' }])}>Add contact</Button>
        </div>
        <Toggle checked={auto} onChange={setAuto} label="Number turbines T-1… west to east (until site numbers are entered)" />
        <Button variant="primary" onClick={() => { actions.windSite(farm.id, farm.name, { notes, gate, contacts: contacts.filter(c => c.name || c.phone), autoNumber: auto }); toast.success('Site info saved for everyone') }} data-testid="save-site-info">Save site info</Button>
      </div>
    </Card>
  )
}
// MapIcon / List kept for future toggles
void MapIcon; void List
