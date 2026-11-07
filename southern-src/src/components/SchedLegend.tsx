/** Legend for schedule / forecast colors (uses the customer's chosen colors and patterns). */
import { SCHED_CATS, useSchedStyle, type SchedCat } from '../data/schedColors'
import { cn } from '../lib/util'
export function SchedLegend({ cats, className, size = 'sm' }: { cats?: SchedCat[]; className?: string; size?: 'sm' | 'md' }) {
  const st = useSchedStyle(); const list = SCHED_CATS.filter(c => !cats || cats.includes(c.id))
  return <div data-testid="sched-legend" className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-muted', size === 'sm' ? 'text-[11px]' : 'text-xs', className)}>
    {list.map(c => <span key={c.id} data-testid="sched-legend-item" data-cat={c.id} title={c.hint} className="inline-flex items-center gap-1.5"><i aria-hidden className={cn('rounded-[3px] border border-black/10', size === 'sm' ? 'size-3' : 'size-4')} style={st(c.id)} />{c.label}</span>)}
  </div>
}
