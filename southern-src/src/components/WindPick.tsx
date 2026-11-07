import { useMemo, useState, useCallback } from 'react'
import { Wind, Search, X, MapPin } from 'lucide-react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { useWind, useTurbines, turbineLabel, mft, type WFarm, type WTurbine } from '../data/wind'
import { Modal, Button } from './ui'
import { TurbineMap } from './WindMaps'
import { cn } from '../lib/util'

export function searchFarms(farms: WFarm[], q: string, limit = 8) {
  const ql = q.trim().toLowerCase(); if (!ql) return []
  const home = (st: string) => (st === 'OK' || st === 'TX' ? 0 : 1)
  return farms.filter(f => `${f.name} ${f.county} ${f.st} ${f.models.map(m => `${m.manu} ${m.model}`).join(' ')}`.toLowerCase().includes(ql))
    .sort((a, b) => home(a.st) - home(b.st) || Number(!a.name.toLowerCase().startsWith(ql)) - Number(!b.name.toLowerCase().startsWith(ql)) || b.mw - a.mw).slice(0, limit)
}

/** "Pick wind farm" — autocompletes from the USWTDB directory. */
export function FarmAutocomplete({ value, onPick, placeholder = 'Pick wind farm — name, county or turbine model' }: { value?: string; onPick: (f: WFarm | null) => void; placeholder?: string }) {
  const w = useWind()
  const [q, setQ] = useState(''), [open, setOpen] = useState(false)
  const cur = value ? w?.byId.get(value) : undefined
  const hits = useMemo(() => (w ? searchFarms(w.farms, q) : []), [w, q])
  if (cur) return (
    <div className="input flex items-center gap-2 h-12" data-testid="farm-picked"><Wind className="size-4 text-accent shrink-0" /><span className="font-semibold truncate">{cur.name}</span><span className="text-xs text-muted truncate">{cur.county} Co., {cur.st} · {cur.n} turbines · {cur.models[0]?.manu} {cur.models[0]?.model}</span><button className="ml-auto btn-icon !size-8" onClick={() => onPick(null)} aria-label="Clear"><X className="size-4" /></button></div>
  )
  return (
    <div className="relative">
      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input className="input pl-9 h-12" value={q} placeholder={w ? placeholder : 'Loading wind farm directory…'} onChange={e => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 180)} data-testid="farm-search" />
      {open && hits.length > 0 && <div className="absolute z-30 left-0 right-0 mt-1 card p-1 max-h-80 overflow-auto shadow-2xl">
        {hits.map(f => <button key={f.id} onMouseDown={e => e.preventDefault()} onClick={() => { onPick(f); setQ(''); setOpen(false) }} className="w-full text-left rounded-xl px-3 py-2 hover:bg-surface-2 flex items-center gap-3" data-testid="farm-hit">
          <Wind className="size-4 text-muted shrink-0" /><span className="min-w-0 flex-1"><span className="block font-semibold truncate">{f.name}</span><span className="block text-xs text-muted truncate">{f.county} Co., {f.st} · {f.n} turbines · {Math.round(f.mw)} MW · {f.models[0]?.manu} {f.models[0]?.model} · hub {mft(f.models[0]?.hh)}</span></span></button>)}
      </div>}
    </div>
  )
}

/** Multi-select turbines on the farm map (USWTDB coordinates). */
export function TurbinePicker({ farm, open, initial, onClose, onDone }: { farm: WFarm | undefined; open: boolean; initial: T.JobTurbine[]; onClose: () => void; onDone: (t: T.JobTurbine[]) => void }) {
  const ws = useStore(s => (farm ? s.db.windSites?.[farm.id] : undefined))
  const turbines = useTurbines(open ? farm : null)
  const [sel, setSel] = useState<Set<number>>(new Set(initial.map(t => t.caseId)))
  const [sat, setSat] = useState(true)
  const labelOf = useCallback((t: WTurbine, i: number) => turbineLabel(ws, t, i), [ws])
  const toggle = useCallback((t: WTurbine) => setSel(s => { const n = new Set(s); n.has(t[0]) ? n.delete(t[0]) : n.add(t[0]); return n }), [])
  if (!farm) return null
  const chosen = (turbines ?? []).map((t, i) => ({ t, i })).filter(x => sel.has(x.t[0]))
  return (
    <Modal open={open} onClose={onClose} title={`Pick turbines · ${farm.name}`} sub="Tap pins to select. Positions are USWTDB turbine coordinates." width={980}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm"><button className={cn('rounded-full px-3 h-8 border text-xs font-semibold', sat ? 'bg-surface-3 border-accent' : 'border-line')} onClick={() => setSat(!sat)}>Satellite</button><span className="text-muted">{turbines ? `${turbines.length} turbines` : 'Loading turbines…'}</span><span className="ml-auto font-semibold">{sel.size} selected</span></div>
        {turbines && <TurbineMap farm={farm} turbines={turbines} labels={labelOf} selected={sel} onToggle={toggle} pins={ws?.pins ?? []} height={460} satellite={sat} />}
        <div className="flex flex-wrap gap-2 min-h-9">{chosen.map(({ t, i }) => <span key={t[0]} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 pl-3 pr-1 h-8 text-sm font-semibold"><MapPin className="size-3.5 text-accent" />{labelOf(t, i)}<span className="text-[11px] text-muted font-normal">#{t[0]}</span><button className="btn-icon !size-6" onClick={() => toggle(t)} aria-label="Remove"><X className="size-3" /></button></span>)}</div>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" data-testid="turbines-done" onClick={() => { onDone(chosen.map(({ t, i }) => { const m = farm.models[t[4]]; return { caseId: t[0], faaOrs: t[1] || undefined, county: (t as unknown as string[])[5], countySt: (t as unknown as string[])[6], label: labelOf(t, i), lat: t[3], lng: t[2], model: m ? `${m.manu} ${m.model}` : undefined, hh: m?.hh } })); onClose() }}>Attach {sel.size || ''} turbine{sel.size === 1 ? '' : 's'}</Button></div>
      </div>
    </Modal>
  )
}
