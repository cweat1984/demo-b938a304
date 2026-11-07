import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { money } from '../lib/util'

export function Sparkline({ data, color = 'var(--accent)', height = 40, width = 140, fill = true }: { data: number[]; color?: string; height?: number; width?: number; fill?: boolean }) {
  if (!data.length) return null
  const max = Math.max(...data, 1), min = Math.min(...data, 0)
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * width, height - ((v - min) / (max - min || 1)) * (height - 4) - 2])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      {fill && <path d={`${d}L${width},${height}L0,${height}Z`} fill={color} opacity={0.12} />}
      <motion.path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
    </svg>
  )
}

/** Grouped monthly bars, one series per year. */
export function YearBars({ series, labels, colors, height = 240, curMonth, onBar, mtdLabel }: { series: { name: string; values: (number | null)[] }[]; labels: string[]; colors: string[]; height?: number; curMonth?: number; onBar?: (series: number, i: number) => void; mtdLabel?: boolean }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...series.flatMap(s => s.values.map(v => v ?? 0)))
  const n = labels.length
  return (
    <div className="relative">
      <div className="flex items-end gap-1.5 md:gap-2.5" style={{ height }}>
        {labels.map((l, i) => (
          <div key={l} className={`flex-1 h-full flex flex-col justify-end items-center gap-1 ${onBar ? 'cursor-pointer' : 'cursor-default'}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="flex items-end gap-[2px] w-full h-full justify-center">
              {series.map((s, k) => { const v = s.values[i]; if (v == null || (v === 0 && curMonth != null && i > curMonth && k === series.length - 1)) return <div key={k} className="flex-1 max-w-[18px]" />; return (
                <motion.div key={k} data-bar={`${k}-${i}`} onClick={() => onBar?.(k, i)} className={`flex-1 max-w-[18px] rounded-t-[4px] ${onBar ? 'hover:brightness-125' : ''}`} style={{ background: colors[k], opacity: hover == null || hover === i ? 1 : 0.35 }}
                  initial={{ height: 0 }} animate={{ height: v ? `${(v / max) * 100}%` : 2 }} transition={{ duration: 0.8, delay: i * 0.03 + k * 0.05, ease: 'easeOut' }} />
              ) })}
            </div>
            <div className={`text-[10px] font-semibold ${curMonth === i ? 'text-accent' : 'text-faint'}`}>{l}{mtdLabel && curMonth === i ? ' MTD' : ''}</div>
          </div>
        ))}
      </div>
      {hover != null && (
        <div className="absolute top-0 card px-3 py-2 text-xs pointer-events-none z-10" style={{ left: `min(calc(${(hover / n) * 100}% ), calc(100% - 160px))` }}>
          <div className="font-semibold mb-1">{labels[hover]}{onBar && <span className="text-faint font-normal"> · click a bar for jobs</span>}</div>
          {series.map((s, k) => <div key={k} className="flex items-center gap-2 num"><span className="size-2 rounded-full" style={{ background: colors[k] }} />{s.name}<span className="ml-auto pl-4 font-semibold">{s.values[hover] ? money(s.values[hover]!, true) : '—'}</span></div>)}
        </div>
      )}
    </div>
  )
}

export function HBar({ value, max, color = 'var(--accent)', height = 8 }: { value: number; max: number; color?: string; height?: number }) {
  return <div className="w-full rounded-full bg-surface-3 overflow-hidden" style={{ height }}><motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${Math.max(0, Math.min(100, (value / (max || 1)) * 100))}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} /></div>
}

export function Donut({ value, size = 120, stroke = 12, color = 'var(--accent)', label, sub }: { value: number; size?: number; stroke?: number; color?: string; label?: string; sub?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--surface-3)" strokeWidth={stroke} fill="none" />
        <motion.circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }} transition={{ duration: 1.2, ease: 'easeOut' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><div className="display text-3xl font-semibold num leading-none">{label ?? `${Math.round(value * 100)}%`}</div>{sub && <div className="text-[10px] text-muted mt-1 uppercase tracking-wider font-semibold">{sub}</div>}</div>
      </div>
    </div>
  )
}

/** Count-up number for hero metrics. */
export function CountUp({ value, format = (n: number) => Math.round(n).toLocaleString(), duration = 1200 }: { value: number; format?: (n: number) => string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const from = useRef(0)
  useEffect(() => {
    const start = performance.now(), a = from.current, b = value
    let raf = 0
    const tick = (t: number) => { const p = Math.min(1, (t - start) / duration); const e = 1 - Math.pow(1 - p, 3); if (ref.current) ref.current.textContent = format(a + (b - a) * e); if (p < 1) raf = requestAnimationFrame(tick); else from.current = b }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, format])
  return <span ref={ref} className="num">{format(0)}</span>
}
