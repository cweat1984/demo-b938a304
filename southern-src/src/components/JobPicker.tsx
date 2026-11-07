import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { byId, customerOf, siteOf } from '../data/logic'
import { cn } from '../lib/util'

/** Searchable job combobox: type a job #, customer, site or city. Replaces 140-option selects. */
export default function JobPicker({ value, jobs, onPick, className, placeholder = 'Code to job…' }: { value?: string; jobs: T.Job[]; onPick: (id: string) => void; className?: string; placeholder?: string }) {
  const db = useStore(s => s.db)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h)
  }, [open])
  const cur = byId(db.jobs, value)
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase()
    return jobs.map(j => ({ j, s: `#${j.jobNo} ${customerOf(db, j).name} ${siteOf(db, j).name} ${siteOf(db, j).city} ${j.name}`.toLowerCase() })).filter(x => !t || t.split(/\s+/).every(w => x.s.includes(w))).slice(0, 8)
  }, [q, jobs, db])
  return (
    <div ref={box} className={cn('relative', className)}>
      <button type="button" data-testid="code-job" onClick={() => setOpen(!open)} className="input h-9 py-1 text-sm w-full flex items-center gap-2 text-left">
        <span className={cn('flex-1 truncate', !cur && 'text-muted')}>{cur ? `#${cur.jobNo} · ${customerOf(db, cur).name}` : placeholder}</span><ChevronDown className="size-4 opacity-60" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-[340px] right-0 rounded-2xl border hairline bg-surface shadow-2xl p-2">
          <div className="flex items-center gap-2 px-2 h-10 rounded-xl bg-surface-2"><Search className="size-4 text-muted" /><input autoFocus value={q} onChange={e => { setQ(e.target.value); setHi(0) }} onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, hits.length - 1)) } else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(0, h - 1)) } else if (e.key === 'Enter') { e.preventDefault(); const x = hits[hi] ?? hits[0]; if (x) { onPick(x.j.id); setOpen(false); setQ('') } } else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) } }} placeholder="Job #, customer, site, city" className="flex-1 bg-transparent outline-none text-sm" data-testid="job-search" /></div>
          <div className="mt-1 max-h-72 overflow-y-auto">
            {hits.map(({ j }, i) => (
              <button key={j.id} type="button" onClick={() => { onPick(j.id); setOpen(false); setQ('') }} onMouseEnter={() => setHi(i)} data-hi={i === hi ? '1' : undefined} className={cn('w-full text-left px-3 py-2 rounded-xl hover:bg-surface-2', (j.id === value || i === hi) && 'bg-surface-2', i === hi && 'ring-1 ring-accent/50')}>
                <div className="text-sm font-semibold">#{j.jobNo} · {customerOf(db, j).name}</div>
                <div className="text-xs text-muted truncate">{siteOf(db, j).name} · {siteOf(db, j).city}, {siteOf(db, j).state} · {j.status}</div>
              </button>
            ))}
            {!hits.length && <div className="text-sm text-muted p-3">No matching job</div>}
          </div>
        </div>
      )}
    </div>
  )
}
