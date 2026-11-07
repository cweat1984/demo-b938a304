import { appName, VENDOR_BRAND } from '../data/brand'
// Union Locals admin: IUOE locals (search, county map/list, sourced rate tables), job rate profiles, union-aware time entries.
import { useEffect, useMemo, useState } from 'react'
import { Search, ExternalLink, MapPin, HardHat, Receipt, Plus, Trash2, Info } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Modal, Segmented, Field } from '../components/ui'
import FleetMap from '../components/FleetMap'
import { useStore } from '../data/store'
import { money, fmtDate } from '../lib/util'
import { useUnion } from './ustore'
import UnionMap, { MAP_STATES } from './UnionMap'
import { LocalContact, LocalPayScale, LocalFringes, LocalRules } from './LocalExtras'
import { useKeep } from '../lib/keep'
import { computeEmployee, countyOf, localsForCounty, type ULocal, type Calc, type RateProfile, type UClass } from './payroll'
import { cityCounty } from './cities'

const NAVY = '#0f2d52', ORANGE = '#c4581c'
let cache: ULocal[] | null = null
export function useLocals() {
  const [d, setD] = useState<ULocal[] | null>(cache)
  useEffect(() => { if (!cache) import('./locals.json').then(m => { cache = m.default as unknown as ULocal[]; setD(cache) }) }, [])
  return d
}

export default function UnionPage() {
  const [tab, setTab] = useState<'locals' | 'profiles' | 'time'>('locals')
  const locals = useLocals()
  return (
    <div className="space-y-4" data-testid="union-page">
      <PageHeader eyebrow={<span style={{ color: ORANGE }}>Payroll · Union</span>} title="Union Locals" sub={<span className="hidden sm:inline">IUOE locals, county jurisdiction, and published wage scales — applied automatically to time entries.</span>} actions={<Segmented value={tab} onChange={setTab} options={[{ value: 'locals', label: 'Locals' }, { value: 'profiles', label: 'Job rate profiles' }, { value: 'time', label: 'Union time' }]} />} />
      {!locals ? <Card>Loading IUOE dataset…</Card> : tab === 'locals' ? <LocalsTab locals={locals} /> : tab === 'profiles' ? <ProfilesTab locals={locals} /> : <TimeTab locals={locals} />}
      <div className="text-[11px] text-muted text-center pt-2">{appName()} · {VENDOR_BRAND.poweredBy} · Sources: iuoe.org local finder, DOL Davis-Bacon wage determinations (SAM.gov), published CBAs. Rates not found are marked MISSING — never estimated.</div>
    </div>
  )
}

function LocalsTab({ locals }: { locals: ULocal[] }) {
  const [q, setQ] = useState(''), [sheet, setSheet] = useState<ULocal | null>(null), [st, setSt] = useState('PRI'), [sel, setSel] = useState<ULocal | null>(null), [view, setView] = useState<'rates' | 'counties'>('rates')
  const db = useStore(s => s.db)
  const PRI = ['OK', 'TX', 'NM', 'KS', 'AR', 'LA', 'CO']
  const list = useMemo(() => locals.filter(l => {
    const ss = new Set([l.hq_state, ...l.counties.map(c => c[1]), ...l.offices.map(o => o.state)])
    if (st === 'PRI' && !PRI.some(p => ss.has(p))) return false
    if (st !== 'PRI' && st !== 'ALL' && !ss.has(st)) return false
    if (!q.trim()) return true // dive3: spaces only = no filter
    const t = q.trim().toLowerCase()
    return String(l.local) === t || l.name.toLowerCase().includes(t) || (l.hq_city ?? '').toLowerCase().includes(t) || l.counties.some(([c]) => c.toLowerCase().includes(t)) || ((cc => !!cc && l.counties.some(([c, s]) => s === cc[1] && c.toLowerCase() === cc[0].toLowerCase()))(cityCounty(t))) // dive2: city names (Kilgore → Gregg Co.)
  }), [locals, q, st])
  const [mode, setMode] = useKeep<'map' | 'list'>('union:mode', 'map')
  // Default to Chad's home local (627, statewide OK) — not whatever sorts first (was Local 1, CO, no rates).
  const cur = sel ?? list.find(l => String(l.local) === '627') ?? list[0]
  const mapSt = MAP_STATES.includes(st) ? st : 'ALL'
  const pins = useMemo(() => [
    ...locals.filter(l => list.includes(l)).flatMap(l => l.offices.map(o => ({ lat: (o as unknown as { lat: number }).lat, lng: (o as unknown as { lng: number }).lng, label: `Local ${l.local} · ${o.city} — tap for details`, tone: l === cur ? ORANGE : NAVY, onClick: () => { setSel(l); setSheet(l) } }))),
    ...db.sites.slice(0, 40).map(s => { const c = countyOf(s); const l = localsForCounty(locals, c, s.state)[0]; return { lat: s.lat, lng: s.lng, label: `${s.name} · ${c ?? '?'} Co. → ${l ? 'Local ' + l.local : 'no local'}`, tone: '#64748b' } }),
  ].filter(p => p.lat), [locals, list, cur, db.sites])
  const states = [...new Set(locals.flatMap(l => l.counties.map(c => c[1])))].sort()
  return (
    <div className="space-y-3">
    <div className="flex items-center gap-2 flex-wrap" data-testid="union-mode"><Segmented value={mode} onChange={setMode} options={[{ value: 'map', label: 'Map' }, { value: 'list', label: 'List' }]} />
      {mode === 'map' && <select data-testid="union-map-state" value={mapSt} onChange={e => setSt(e.target.value === 'ALL' ? 'PRI' : e.target.value)} className="h-10 rounded-lg border hairline bg-transparent px-2 text-[16px] sm:text-sm"><option value="ALL">All our region</option>{MAP_STATES.map(s => <option key={s} value={s}>{s}</option>)}</select>}</div>
    <div className={'grid gap-4 ' + (mode === 'map' ? 'lg:grid-cols-[320px_1fr]' : 'lg:grid-cols-[360px_1fr]')}>
      <Card pad={false} className={'overflow-hidden ' + (mode === 'map' ? 'hidden lg:block' : '')}>
        <div className="p-3 border-b hairline space-y-2">
          <div className="flex items-center gap-2 rounded-xl border hairline px-3 h-10"><Search className="size-4 text-muted" /><input data-testid="union-search" value={q} onChange={e => setQ(e.target.value)} placeholder="Local #, city, or county" className="bg-transparent outline-none flex-1 text-sm" /></div>
          <select data-testid="union-state" value={st} onChange={e => setSt(e.target.value)} className="w-full h-9 rounded-lg border hairline bg-transparent px-2 text-sm"><option value="PRI">Our states (OK TX NM KS AR LA CO)</option><option value="ALL">All states</option>{states.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <div className="text-xs text-muted">{list.length} locals{(cc => cc ? ` · ${q.trim()} is in ${cc[0]} Co., ${cc[1]}` : '')(cityCounty(q))}</div>
        </div>
        <div className="max-h-[640px] overflow-auto">
          {list.map(l => <button key={String(l.local)} data-testid="union-local" onClick={() => { setSel(l); setSheet(l) }} className={'w-full text-left px-4 py-3 border-b hairline hover:bg-black/5 ' + (cur === l ? 'bg-black/5' : '')}>
            <div className="flex items-center gap-2"><b>Local {l.local}</b><span className="text-sm text-muted">{l.hq_city ?? 'HQ MISSING'}{l.hq_state ? `, ${l.hq_state}` : ''}</span></div>
            <div className="flex gap-1 mt-1 flex-wrap"><Badge>{l.designation}</Badge><Badge tone={l.counties.length ? 'info' : 'warn'}>{l.counties.length} counties</Badge><Badge tone={l.nr ? 'ok' : 'warn'}>{l.nr ? `${l.nr} rates` : 'rates MISSING'}</Badge></div>
          </button>)}
        </div>
      </Card>
      <div className="space-y-4 min-w-0">
        {mode === 'map' ? <Card pad={false} className="p-2 sm:p-4" data-testid="union-map-card"><UnionMap locals={locals} st={mapSt} onOpenLocal={l => { setSel(l); setSheet(l) }} /></Card> : <Card pad={false} className="overflow-hidden"><FleetMap units={[]} sites={pins} height={300} branches /></Card>}
        <LocalSheet l={sheet} locals={locals} onClose={() => setSheet(null)} />
        {cur && <Card data-testid="union-detail">
          <div className="flex items-start gap-3 flex-wrap">
            <div className="flex-1"><div className="text-xl font-bold text-ink">{cur.name}</div><div className="text-sm text-muted">{cur.offices.map(o => `${o.city}, ${o.state}${o.phone ? ' · ' + o.phone : ''}`).join(' | ') || 'No office listed on iuoe.org'}</div></div>
            {cur.website && <a href={cur.website} target="_blank" rel="noreferrer" className="text-sm inline-flex items-center gap-1" style={{ color: ORANGE }}>Website <ExternalLink className="size-3.5" /></a>}
          </div>
          {typeof cur.cba.jurisdiction_note === 'string' && <div className="mt-3 text-sm rounded-lg p-3" style={{ background: '#0f2d520f' }}><b>Jurisdiction:</b> {cur.cba.jurisdiction_note}</div>}
          <div className="mt-3 grid sm:grid-cols-4 gap-2 text-sm" data-testid="union-cba">
            {(['overtime', 'night_differential', 'travel_subsistence', 'agreement_effective'] as const).map(k => <div key={k} className="rounded-lg border hairline p-2"><div className="text-[11px] uppercase text-muted">{k.replace('_', ' ')}</div><div className={String(cur.cba[k]).startsWith('MISSING') ? 'text-warn font-semibold' : ''}>{String(cur.cba[k] ?? 'MISSING')}</div></div>)}
          </div>
          {typeof cur.cba.source_url === 'string' && <a className="text-xs mt-1 inline-block" style={{ color: ORANGE }} href={cur.cba.source_url} target="_blank" rel="noreferrer">CBA source ({String(cur.cba.retrieved)})</a>}
          <div className="mt-4" data-testid="union-view"><Segmented size="sm" value={view} onChange={setView} options={[{ value: 'rates', label: 'Rate table', count: cur.rates.length }, { value: 'counties', label: 'Counties', count: cur.counties.length }]} /></div>
          {view === 'rates' ? (cur.rates.length ? <div className="mt-3 overflow-auto"><table className="w-full text-sm" data-testid="union-rates"><thead><tr className="text-left text-muted text-xs"><th className="py-1">Classification</th><th>Base</th><th>Fringe</th><th>Eff.</th><th>Type</th><th>Source</th></tr></thead><tbody>
            {cur.rates.map((r, i) => <tr key={i} className="border-t hairline align-top"><td className="py-1.5 pr-2">{r.cr && <Badge tone="accent">Crane</Badge>} {r.oi && <Badge tone="info">Oiler</Badge>} {r.c}</td><td className="num font-semibold">${r.b.toFixed(2)}</td><td className="num">{r.ft}</td><td>{r.eff}</td><td className="text-xs">{r.st} · {r.ct}</td><td><a href={r.u} target="_blank" rel="noreferrer" className="text-xs" style={{ color: ORANGE }}>{r.wd}</a><div className="text-[10px] text-ok">VERIFIED · DOL WD · 2026-10-16</div></td></tr>)}
          </tbody></table></div> : <div className="mt-3 text-sm text-warn font-semibold">Rates MISSING — no IUOE line in any 2026 Davis-Bacon determination and no public CBA found.</div>)
            : <div className="mt-3 grid sm:grid-cols-3 gap-1 text-sm max-h-80 overflow-auto" data-testid="union-counties">{cur.counties.map(([c, s]) => <div key={c + s} className="flex items-center gap-1"><MapPin className="size-3 text-muted" />{c}, {s}</div>)}{!cur.counties.length && <div className="text-warn">Counties MISSING</div>}<div className="col-span-full text-[11px] text-muted mt-2">County list inferred from DOL wage-determination coverage (UNVERIFIED vs. the local’s CBA).</div></div>}
        </Card>}
      </div>
    </div>
    </div>
  )
}

const blank = (jobId: string, name: string): RateProfile => ({ jobId, name, otMult: 1.5, dtMult: 2, custom: [] })
// Office fixes: rate profiles feed payroll — block negative pay and OT multipliers under 1.
const RP_LABEL: Record<string, string> = { base: 'Base wage', night: 'Night wage', otMult: 'OT multiplier', travelRate: 'Travel time', travelHrs: 'Travel hours', perDiem: 'Per diem', subsistence: 'Subsistence', showUp: 'Show-up pay', dtAfter: 'Double time after', dtMult: 'Double time ×' }
function rateProfileErrors(p: RateProfile): string[] {
  const e: string[] = []
  if (!p.name.trim()) e.push('Profile name is required')
  for (const k of ['base', 'night', 'travelRate', 'travelHrs', 'perDiem', 'subsistence', 'showUp'] as const) { const v = p[k]; if (v !== undefined && (!Number.isFinite(v) || v < 0)) e.push(`${RP_LABEL[k]} can’t be negative`) }
  if (p.base !== undefined && p.base > 500) e.push('Base wage over $500/h — check the number')
  if (p.travelHrs !== undefined && p.travelHrs > 24) e.push('Travel hours can’t exceed 24')
  if (!Number.isFinite(p.otMult) || p.otMult < 1 || p.otMult > 4) e.push('OT multiplier must be between 1 and 4')
  if (p.dtAfter !== undefined && (!Number.isFinite(p.dtAfter) || p.dtAfter < 1 || p.dtAfter > 24)) e.push('Double time after must be 1–24 hours a day')
  if (p.dtAfter !== undefined && p.dtMult !== undefined && (!Number.isFinite(p.dtMult) || p.dtMult < Math.max(1, p.otMult || 1) || p.dtMult > 4)) e.push('Double time × must be at least the OT multiplier and at most 4')
  if (p.custom.some(c => !Number.isFinite(c.amount) || c.amount < 0)) e.push('Custom lines can’t be negative')
  return e
}
function ProfilesTab({ locals }: { locals: ULocal[] }) {
  const db = useStore(s => s.db)
  const { profiles, setProfile, removeProfile } = useUnion()
  const jobs = useMemo(() => [...db.jobs].sort((a, b) => b.startDate.localeCompare(a.startDate)), [db.jobs])
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '')
  const job = db.jobs.find(j => j.id === jobId), site = job && db.sites.find(s => s.id === job.siteId)
  const [p, setP] = useState<RateProfile>(() => profiles[jobId] ?? blank(jobId, ''))
  useEffect(() => { setP(profiles[jobId] ?? blank(jobId, job ? `#${job.jobNo} rates` : '')) }, [jobId]) // eslint-disable-line
  const county = countyOf(site), loc = site ? localsForCounty(locals, county, site.state)[0] : undefined
  const num = (k: keyof RateProfile) => <input data-testid={`rp-${k}`} type="number" min={k === 'otMult' ? 1 : 0} step="0.01" aria-invalid={rateProfileErrors({ ...p }).some(e => e.startsWith(RP_LABEL[k as string] ?? '~'))} value={(p[k] as number | undefined) ?? ''} onChange={e => setP({ ...p, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} className="w-full h-9 rounded-lg border hairline bg-transparent px-2 num" />
  return (
    <div className="grid lg:grid-cols-[1fr_360px] gap-4">
      <Card data-testid="rp-editor">
        <Field label="Job"><select data-testid="rp-job" value={jobId} onChange={e => setJobId(e.target.value)} className="w-full h-10 rounded-lg border hairline bg-transparent px-2">{jobs.map(j => <option key={j.id} value={j.id}>#{j.jobNo} · {j.name}{profiles[j.id] ? ' ★' : ''}</option>)}</select></Field>
        {site && <div className="text-sm mt-2 flex items-center gap-2 flex-wrap"><MapPin className="size-4" />{site.city}, {site.state} · <b>{county ?? 'county unknown'} Co.</b> → {loc ? <Badge tone="accent">IUOE Local {loc.local}</Badge> : <Badge tone="warn">No local scale</Badge>} {job?.shift === 'Night' && <Badge tone="info">Night shift</Badge>}</div>}
        <div className="grid sm:grid-cols-3 gap-3 mt-4">
          <Field label="Profile name"><input data-testid="rp-name" value={p.name} onChange={e => setP({ ...p, name: e.target.value })} className="w-full h-9 rounded-lg border hairline bg-transparent px-2" /></Field>
          <Field label="Base wage $/h">{num('base')}</Field><Field label="Night wage $/h">{num('night')}</Field>
          <Field label="OT multiplier">{num('otMult')}</Field><Field label="Travel time $/h">{num('travelRate')}</Field><Field label="Travel hours / day">{num('travelHrs')}</Field>
          <Field label="Per diem $/day (set rate, not GSA)">{num('perDiem')}</Field><Field label="Subsistence $/day">{num('subsistence')}</Field><Field label="Show-up pay $">{num('showUp')}</Field>
          <Field label="Double time after (h/day, blank = none)">{num('dtAfter')}</Field><Field label="Double time ×">{num('dtMult')}</Field>
          <div className="text-xs text-muted self-end pb-2" data-testid="rp-dt-help">{p.dtAfter ? `Hours past ${p.dtAfter} in one day pay ×${p.dtMult || 2} (never below the assigned rate).` : 'No double time unless you set the hours.'}</div>
        </div>
        <div className="mt-4 space-y-2">
          <div className="text-sm font-semibold">Custom lines</div>
          {p.custom.map((c, i) => <div key={c.id} className="flex gap-2"><input value={c.label} onChange={e => { const n = [...p.custom]; n[i] = { ...c, label: e.target.value }; setP({ ...p, custom: n }) }} className="flex-1 h-9 rounded-lg border hairline bg-transparent px-2" /><input type="number" value={c.amount} onChange={e => { const n = [...p.custom]; n[i] = { ...c, amount: Number(e.target.value) }; setP({ ...p, custom: n }) }} className="w-24 h-9 rounded-lg border hairline bg-transparent px-2 num" /><select value={c.per} onChange={e => { const n = [...p.custom]; n[i] = { ...c, per: e.target.value as 'day' }; setP({ ...p, custom: n }) }} className="h-9 rounded-lg border hairline bg-transparent px-1"><option value="day">/day</option><option value="hour">/hour</option><option value="job">/entry</option></select><Button size="sm" onClick={() => setP({ ...p, custom: p.custom.filter(x => x !== c) })}><Trash2 className="size-4" /></Button></div>)}
          <Button size="sm" data-testid="rp-addline" icon={<Plus className="size-4" />} onClick={() => setP({ ...p, custom: [...p.custom, { id: Math.random().toString(36).slice(2, 7), label: 'Remote site bonus', amount: 25, per: 'day' }] })}>Add line</Button>
        </div>
        <div className="flex gap-2 mt-5"><Button variant="primary" data-testid="rp-save" onClick={() => { const bad = rateProfileErrors(p); if (bad.length) { toast.error('Fix the rate profile first', { description: bad.join(' · ') }); return } setProfile({ ...p, jobId }); toast.success(`Rate profile saved — applies to everyone on #${job?.jobNo} automatically`) }}>Save profile</Button>{profiles[jobId] && <Button data-testid="rp-remove" onClick={() => { removeProfile(jobId); toast('Profile removed') }}>Remove</Button>}</div>
        <div className="text-xs text-muted mt-3 flex gap-1"><Info className="size-3.5 shrink-0 mt-0.5" />A profile applies only to time entries on this job. When a worker moves to another job their pay reverts to that job’s rules — nothing to change back by hand.</div>
      </Card>
      <Card><div className="font-semibold mb-2">Active profiles</div>{Object.values(profiles).length ? Object.values(profiles).map(x => { const j = db.jobs.find(y => y.id === x.jobId); return <button key={x.jobId} onClick={() => setJobId(x.jobId)} className="w-full text-left py-2 border-b hairline text-sm" data-testid="rp-active"><b>#{j?.jobNo}</b> {x.name}<div className="text-xs text-muted">{x.base ? `base $${x.base}` : ''}{x.night ? ` · night $${x.night}` : ''}{x.perDiem ? ` · per diem $${x.perDiem}/day` : ''} · OT ×{x.otMult}</div></button> }) : <div className="text-sm text-muted">None yet.</div>}</Card>
    </div>
  )
}

function TimeTab({ locals }: { locals: ULocal[] }) {
  const db = useStore(s => s.db)
  const { profiles, classOv, setClass } = useUnion()
  const [open, setOpen] = useState<Calc | null>(null)
  const emps = useMemo(() => db.employees.filter(e => (e.craft === 'Operator' || e.craft === 'Oiler') && db.time.some(t => t.employeeId === e.id && t.jobId)).map(e => ({ e, n: new Set(db.time.filter(t => t.employeeId === e.id && t.jobId).slice(-40).map(t => t.jobId)).size })).sort((a, b) => b.n - a.n).slice(0, 30).map(x => x.e), [db])
  const [empId, setEmpId] = useState(emps[0]?.id ?? '')
  const emp = db.employees.find(e => e.id === empId)
  const calcs = useMemo(() => emp ? computeEmployee(db, locals, profiles, emp, db.time.filter(t => t.employeeId === emp.id).slice(-40), classOv[emp.id]).reverse() : [], [db, locals, profiles, emp, classOv])
  return (
    <div className="space-y-3">
      <Card className="flex gap-3 flex-wrap items-end">
        <Field label="Worker"><select data-testid="ut-emp" value={empId} onChange={e => setEmpId(e.target.value)} className="h-10 rounded-lg border hairline bg-transparent px-2">{emps.map(e => <option key={e.id} value={e.id}>{e.first} {e.last} · {e.craft}</option>)}</select></Field>
        <Field label="Union class"><select data-testid="ut-class" value={classOv[empId] ?? ''} onChange={e => setClass(empId, (e.target.value || undefined) as UClass | undefined)} className="h-10 rounded-lg border hairline bg-transparent px-2"><option value="">Auto (by craft & crane size)</option>{(['Crane — large (≥100 t)', 'Crane — standard', 'Oiler', 'None'] as UClass[]).map(c => <option key={c}>{c}</option>)}</select></Field>
        {emp && <div className="text-sm">Assigned rate <b className="num">${emp.rate.toFixed(2)}</b>/h · Effective = max(assigned, local scale, job profile)</div>}
      </Card>
      <Card pad={false}>
        {calcs.map(c => <button key={c.entry.id} data-testid="ut-row" onClick={() => setOpen(c)} className="w-full text-left px-4 py-3 border-b hairline hover:bg-black/5 flex items-center gap-3">
          <div className="w-16 text-sm">{fmtDate(c.entry.date)}</div>
          <div className="flex-1 min-w-0"><div className="font-medium truncate">{c.job ? `#${c.job.jobNo} · ${c.job.name}` : c.entry.activity}</div>
            <div className="flex gap-1 mt-1 flex-wrap text-xs">{c.local ? <Badge tone="accent" ><HardHat className="size-3 inline" /> Local {c.local.local}</Badge> : <Badge>No local</Badge>}{c.turbine && <span data-testid="ut-turbine"><Badge tone="info">Turbine {c.turbine} · {c.county} Co.</Badge></span>}<Badge tone={c.profile ? 'info' : 'neutral'} >{c.ruleSet}</Badge><span className="text-muted">{c.county ? `${c.county} Co., ${c.state}` : ''}</span></div></div>
          <div className="text-right"><div className="num font-semibold">{money(c.total)}</div><div className="text-xs text-muted num">{c.entry.hours}h @ ${c.baseRate.toFixed(2)}</div></div>
        </button>)}
        {!calcs.length && <div className="p-6 text-sm text-muted">No time entries.</div>}
      </Card>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `Pay breakdown · ${fmtDate(open.entry.date)}` : ''} sub={open?.job ? `#${open.job.jobNo} · ${open.job.name}` : ''}>
        {open && <div className="space-y-3 text-sm" data-testid="ut-breakdown">
          <div className="rounded-lg p-3" style={{ background: '#0f2d520f' }}><div><b>Local:</b> {open.localWhy}</div><div><b>Class:</b> {open.cls}</div><div><b>Rule set:</b> {open.ruleSet}</div><div><b>Rate chosen:</b> ${open.baseRate.toFixed(2)} — {open.rule}</div></div>
          <div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-lg border hairline p-2"><div className="text-[11px] text-muted">Assigned</div><div className="num">${open.empRate.toFixed(2)}</div></div><div className="rounded-lg border hairline p-2"><div className="text-[11px] text-muted">Local scale</div><div className="num">{open.scale ? `$${open.scale.b.toFixed(2)}` : 'MISSING'}</div></div><div className="rounded-lg border hairline p-2"><div className="text-[11px] text-muted">Job profile</div><div className="num">{open.profile?.base ? `$${open.profile.base.toFixed(2)}` : '—'}</div></div></div>
          {open.scale && <div className="text-xs text-muted">Scale line: “{open.scale.c}” · fringe {open.scale.ft} · eff. {open.scale.eff} · <a href={open.scale.u} target="_blank" rel="noreferrer" style={{ color: ORANGE }}>{open.scale.wd}</a></div>}
          <table className="w-full"><tbody>{open.lines.map((l, i) => <tr key={i} className="border-t hairline"><td className="py-1.5">{l.label}<div className="text-[11px] text-muted">{l.why}</div></td><td className="num text-right">{l.qty.toFixed(2)} × ${l.rate.toFixed(2)}</td><td className="num text-right font-semibold">{money(l.amount)}</td></tr>)}<tr className="border-t-2"><td className="py-2 font-bold">Total</td><td /><td className="num text-right font-bold" style={{ color: ORANGE }}>{money(open.total)}</td></tr></tbody></table>
          <div className="text-[11px] text-muted flex gap-1"><Receipt className="size-3.5" />Fringes shown for reference; payroll export posts them to benefit funds separately.</div>
        </div>}
      </Modal>
    </div>
  )
}

/** Full detail for one local — opened from a list row or a map pin; a bottom sheet on phones. */
function LocalSheet({ l, locals, onClose }: { l: ULocal | null; locals: ULocal[]; onClose: () => void }) {
  const db = useStore(s => s.db), open = useStore(s => s.open)
  const jobs = useMemo(() => !l ? [] : db.jobs.filter(j => !['Complete', 'Completed', 'Closed', 'Cancelled', 'Invoiced'].includes(String(j.status))).map(j => ({ j, s: db.sites.find(x => x.id === j.siteId) })).filter(({ s }) => { const c = countyOf(s); return !!c && !!s && localsForCounty(locals, c, s.state).some(x => x === l) }), [l, db, locals])
  if (!l) return null
  const crane = l.rates.filter(r => r.cr), oiler = l.rates.filter(r => r.oi), cba = l.cba as Record<string, unknown>
  const Rates = ({ title, rows, id }: { title: string; rows: ULocal['rates']; id: string }) => <div data-testid={id}><div className="font-semibold text-sm mb-1">{title} <span className="text-muted font-normal">({rows.length})</span></div>
    {rows.length ? <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted text-xs"><th className="py-1">Classification</th><th>Base</th><th>Fringe</th><th>Effective</th><th>Source</th></tr></thead><tbody>
      {rows.map((r, i) => <tr key={i} className="border-t hairline align-top"><td className="py-1.5 pr-2 min-w-40 break-words">{r.c}</td><td className="num font-semibold">${r.b.toFixed(2)}</td><td className="num">{r.ft}</td><td className="num">{r.eff}</td><td>{r.u ? <a href={r.u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: ORANGE }}>{r.wd}<ExternalLink className="size-3" /></a> : '—'}<div className="mt-0.5">{r.u && r.wd ? <Badge tone="ok">Verified · DOL WD</Badge> : <Badge tone="warn">Unverified</Badge>}</div></td></tr>)}
    </tbody></table></div> : <div className="text-sm text-warn font-semibold">MISSING — no published {title.toLowerCase()} found <Badge tone="warn">Unverified</Badge></div>}</div>
  return <Modal open onClose={onClose} width={760} title={<span data-testid="union-sheet-title">Local {l.local}</span>} sub={l.name}>
    <div className="space-y-4 text-sm" data-testid="union-sheet">
      <div className="grid sm:grid-cols-2 gap-2">
        <div className="rounded-lg border hairline p-2.5"><div className="text-[11px] uppercase text-muted">Headquarters</div><b>{l.hq_city ? `${l.hq_city}, ${l.hq_state ?? ''}` : 'HQ MISSING'}</b> <Badge>{l.designation}</Badge></div>
        <div className="rounded-lg border hairline p-2.5"><div className="text-[11px] uppercase text-muted">Website</div>{l.website ? <a href={l.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all" style={{ color: ORANGE }}>{l.website}<ExternalLink className="size-3" /></a> : <span className="text-warn">Not listed</span>}</div>
      </div>
      <div data-testid="union-sheet-halls"><LocalContact l={l} /></div>
      <div className="flex gap-1 flex-wrap">{l.rates.length ? <Badge tone="ok">Rates verified from {new Set(l.rates.map(r => r.wd)).size} DOL determination(s)</Badge> : <Badge tone="warn">Rates unverified</Badge>}{typeof cba.source_url === 'string' ? <Badge tone="ok">CBA verified</Badge> : <Badge tone="warn">CBA terms unverified</Badge>}{l.counties.length ? <Badge tone="info">{l.counties.length} counties</Badge> : <Badge tone="warn">Counties MISSING</Badge>}</div>
      {typeof cba.source_url === 'string' && <a className="text-xs inline-flex items-center gap-1" style={{ color: ORANGE }} href={cba.source_url} target="_blank" rel="noreferrer">CBA source · retrieved {String(cba.retrieved ?? '—')}<ExternalLink className="size-3" /></a>}
      <Rates title="Crane operator rates" rows={crane} id="union-sheet-crane" />
      <Rates title="Oiler rates" rows={oiler} id="union-sheet-oiler" />
      <LocalPayScale l={l} />
      <LocalFringes l={l} />
      <LocalRules l={l} />
      <div data-testid="union-sheet-jobs"><div className="font-semibold mb-1">Our open jobs in its counties ({jobs.length})</div>{jobs.length ? jobs.map(({ j, s }) => <button key={j.id} onClick={() => { onClose(); open({ type: 'job', id: j.id } as never) }} className="w-full text-left flex items-center gap-2 py-1.5 border-t hairline"><HardHat className="size-3.5 text-muted" /><b>#{j.jobNo}</b><span className="truncate flex-1">{j.name}</span><span className="text-muted text-xs">{s?.city}, {s?.state} · {countyOf(s)} Co.</span></button>) : <div className="text-muted">No open jobs in this local’s counties.</div>}</div>
      <div data-testid="union-sheet-counties"><div className="font-semibold mb-1">Counties covered</div>{l.counties.length ? <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-auto">{l.counties.map(([c, s]) => <div key={c + s}>{c}, {s}</div>)}</div> : <div className="text-warn">Not published</div>}</div>
    </div>
  </Modal>
}
