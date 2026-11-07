import { useState } from 'react'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { useStore } from '../data/store'
import { Sheet } from './ui'
import { cn } from '../lib/util'

export function useOrgLabel() {
  const f = useStore(s => s.ui.filter)
  const db = useStore(s => s.db)
  const d = db.divisions.find(x => x.id === f.divisionId)
  const b = db.branches.find(x => x.id === f.branchId)
  return f.divisionId === 'all' && f.branchId === 'all' ? 'All Company' : [d?.short, b?.code].filter(Boolean).join(' · ')
}

export default function OrgFilter() {
  const [open, setOpen] = useState(false)
  const f = useStore(s => s.ui.filter)
  const db = useStore(s => s.db)
  const setUI = useStore(s => s.setUI)
  const label = useOrgLabel()
  const d = db.divisions.find(x => x.id === f.divisionId)
  const set = (p: Partial<typeof f>) => setUI({ filter: { ...f, ...p } })
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="org-filter" aria-label={`Company view: ${label}`} className={cn('shrink-0 inline-flex items-center gap-2 h-10 px-2.5 sm:px-3.5 rounded-full border hairline text-sm font-semibold hover:bg-surface-2 transition', label !== 'All Company' && 'border-accent/50 text-accent')}>
        {d ? <span className="size-2.5 rounded-full" style={{ background: d.color }} /> : <Building2 className="size-4" />}
        <span className="max-w-[160px] truncate hidden sm:inline">{label}</span>
        <ChevronDown className="size-4 opacity-60 hidden sm:block" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Company view" sub="Every screen, number and report follows this filter." width={440}>
        <div className="label mb-2">Division</div>
        <div className="flex flex-col gap-1.5">
          {[{ id: 'all', name: 'All Company', short: 'ALL', color: 'var(--text)', tagline: 'Every division and branch' }, ...db.divisions].map(x => (
            <button key={x.id} onClick={() => set({ divisionId: x.id, branchId: x.id === 'all' ? f.branchId : db.branches.find(b => b.id === f.branchId)?.divisionIds.includes(x.id) ? f.branchId : 'all' })} className={cn('flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition border', f.divisionId === x.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-surface-2')}>
              <span className="size-3 rounded-full" style={{ background: x.color }} />
              <span className="flex-1"><span className="font-semibold block">{x.name}</span><span className="text-xs text-muted">{x.tagline}</span></span>
              {f.divisionId === x.id && <Check className="size-5 text-accent" />}
            </button>
          ))}
        </div>
        <div className="label mb-2 mt-6">Branch</div>
        <div className="flex flex-col gap-1.5">
          {[{ id: 'all', code: 'All branches', name: 'OKC · Midland · Kilgore', divisionIds: db.divisions.map(x => x.id) }, ...db.branches].filter(b => f.divisionId === 'all' || b.divisionIds.includes(f.divisionId)).map(b => (
            <button key={b.id} onClick={() => set({ branchId: b.id })} className={cn('flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition border', f.branchId === b.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-surface-2')}>
              <span className="flex-1"><span className="font-semibold block cond tracking-wide">{b.code}</span><span className="text-xs text-muted">{b.name}</span></span>
              {f.branchId === b.id && <Check className="size-5 text-accent" />}
            </button>
          ))}
        </div>
        <div className="text-xs text-muted mt-6">Admins add divisions and branches in Settings → Company.</div>
      </Sheet>
    </>
  )
}
