/** Branding page card: schedule / forecast colors with a live legend. Red is reserved for conflicts. */
import { useRef, useState } from 'react'
import { actions } from '../data/store'
import { toast } from 'sonner'
import { Card, Toggle, Button } from '../components/ui'
import { SCHED_CATS, useSchedColors, schedStyle, type SchedCat } from '../data/schedColors'
import { SchedLegend } from '../components/SchedLegend'
import { audit } from '../gapA/util'

export function SchedColorsCard() {
  const { colors, patterns, set, setPatterns, reset } = useSchedColors()
  const [err, setErr] = useState<{ cat: SchedCat; msg: string } | null>(null), [draft, setDraft] = useState<Partial<Record<SchedCat, string>>>({})
  // dive3 dispatch m4: dragging the native picker fires many changes — write ONE audit row per category after it settles
  const timers = useRef<Partial<Record<SchedCat, ReturnType<typeof setTimeout>>>>({})
  const save = () => actions.updateCompany({ schedColors: { ...useSchedColors.getState().colors } })
  const apply = (cat: SchedCat, hex: string) => { const v = hex.trim().startsWith('#') ? hex.trim() : '#' + hex.trim(); const p = set(cat, v)
    if (p) { setErr({ cat, msg: p }); return } setErr(null); setDraft(d => ({ ...d, [cat]: undefined }))
    save() // company palette has to be written before a reload; the audit line can wait
    clearTimeout(timers.current[cat]); timers.current[cat] = setTimeout(() => { audit('Schedule color changed', 'Company branding', `${SCHED_CATS.find(c => c.id === cat)!.label} → ${useSchedColors.getState().colors[cat].toUpperCase()}`) }, 700) }
  const sample: SchedCat[] = ['travel', 'moving', 'moving', 'working', 'working', 'working', 'outstate', 'outstate', 'moving', 'open', 'open', 'off', 'conflict', 'working']
  return <Card className="flex flex-col gap-3" data-testid="sched-colors">
    <div><div className="font-semibold">Schedule colors</div><div className="text-xs text-muted">Used on the crane forecast, 30-day strips and rig plans. Red always means a conflict — it can’t be used for anything else, and colors must be easy to tell apart. Saved for the whole company, so every screen matches.</div></div>
    <div className="flex flex-col gap-2">{SCHED_CATS.map(c => <div key={c.id} data-testid="sched-row" data-cat={c.id} className="flex items-center gap-2 min-h-11">
      <input type="color" aria-label={`${c.label} color`} data-testid="sched-color" data-cat={c.id} value={colors[c.id]} onChange={e => apply(c.id, e.target.value)} className="size-10 pointer-coarse:size-11 shrink-0 rounded-lg border hairline bg-transparent p-0.5 cursor-pointer" />
      <div className="flex-1 min-w-0"><div className="text-sm font-semibold">{c.label}</div><div className="text-[11px] text-muted truncate">{c.hint}</div></div>
      <input aria-label={`${c.label} hex`} data-testid="sched-hex" data-cat={c.id} className="input w-[6.5rem] num uppercase text-base" value={draft[c.id] ?? colors[c.id]} onChange={e => setDraft(d => ({ ...d, [c.id]: e.target.value }))} onBlur={e => { if (draft[c.id] != null) apply(c.id, e.target.value) }} onKeyDown={e => { if (e.key === 'Enter') apply(c.id, (e.target as HTMLInputElement).value) }} />
    </div>)}</div>
    {err && <div role="alert" data-testid="sched-error" className="text-sm font-semibold text-bad">{err.msg}</div>}
    <Toggle checked={patterns} onChange={v => { setPatterns(v); audit('Schedule patterns', 'Company branding', v ? 'on' : 'off') }} label={<span data-testid="sched-patterns">Patterns for color-blind safety (stripes, dots, cross-hatch)</span>} />
    <div data-testid="sched-sample" className="flex gap-[3px]">{sample.map((c, i) => <span key={i} data-cat={c} className="h-7 flex-1 rounded-[4px]" style={schedStyle(c, colors, patterns)} />)}</div>
    <SchedLegend size="md" />
    <div><Button variant="ghost" data-testid="sched-reset" onClick={() => { reset(); save(); setErr(null); setDraft({}); audit('Schedule colors reset', 'Company branding', 'Annual-sheet defaults'); toast.success('Schedule colors back to the Annual-sheet defaults') }}>Reset to Annual-sheet defaults</Button></div>
  </Card>
}
