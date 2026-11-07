import { companyOf } from '../data/brand'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CloudSun, FileDown, Wind, ShieldAlert, Wifi, WifiOff, CheckCircle2 } from 'lucide-react'
import { useStore } from '../data/store'
import { PROJECTS, HEIGHTS, useWx, fetchLive, dayData, verdict, recordStanddown, compass, WORK, type WxProject, type WxHour } from './weatherData'
import { PageHeader, Badge, Button, Card, Segmented } from '../components/ui'
import { cn, today, addDays } from '../lib/util'

export default function Weather() {
  const [pid, setPid] = useState(PROJECTS[0].id)
  const [date, setDate] = useState(addDays(today(), -1))
  const wx = useWx()
  const session = useStore(s => s.session)
  const p = PROJECTS.find(x => x.id === pid)!
  useEffect(() => { if (wx.source === 'auto') fetchLive(p) }, [p, wx.source])
  const { rows, src } = useMemo(() => dayData(p, date), [p, date, wx.live, wx.source]) // eslint-disable-line react-hooks/exhaustive-deps
  const v = verdict(p, rows)
  const days = Array.from({ length: 10 }, (_, i) => addDays(today(), i - 7))
  const key = `${p.id}:${date}`
  const sd = wx.standdowns[key]
  const st = wx.status[p.id]
  return (
    <div className="max-w-[1500px] mx-auto" data-testid="weather-page">
      <PageHeader eyebrow="Jobs · Weather log" title="Daily Weather Log" sub="Hourly wind by height on every project — proof for the no-work days." actions={<Button variant="primary" icon={<FileDown className="size-4" />} onClick={() => pdf(p, date, rows, v, sd)} data-testid="wx-pdf">Customer PDF</Button>} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className="input !w-auto" value={pid} onChange={e => setPid(e.target.value)} data-testid="wx-project">{PROJECTS.map(x => <option key={x.id} value={x.id}>#{x.jobNo} · {x.name}</option>)}</select>
        <Segmented size="sm" value={wx.source} onChange={s => useWx.setState({ source: s })} options={[{ value: 'auto', label: 'Open-Meteo (live)' }, { value: 'sim', label: 'Simulated' }]} />
        <Badge tone={src === 'Open-Meteo' ? 'ok' : 'neutral'} className="gap-1">{src === 'Open-Meteo' ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}{src}{wx.source === 'auto' && st === 'offline' ? ' · API unreachable — seeded fallback' : st === 'loading' ? ' · loading…' : ''}</Badge>
      </div>
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-5" data-testid="wx-days">{days.map(d => { const vv = verdict(p, dayData(p, d).rows); return <button key={d} onClick={() => setDate(d)} data-testid="wx-day" data-standby={vv.standby} className={cn('shrink-0 rounded-2xl border hairline px-3 py-2 text-left w-[92px]', d === date ? 'bg-surface-3' : 'bg-surface')}><div className="text-[11px] text-muted">{new Date(d + 'T12:00').toLocaleDateString([], { weekday: 'short' })}{d === today() ? ' · today' : ''}</div><div className="font-semibold num text-sm">{d.slice(5)}</div><div className={cn('text-[10px] font-bold mt-0.5', vv.standby ? 'text-bad' : 'text-ok')}>{vv.standby ? 'STANDBY' : 'Workable'}</div></button> })}</div>
      <div className="grid xl:grid-cols-[1fr_360px] gap-5">
        <Card>
          <div className="flex flex-wrap items-center gap-3 mb-2"><div className="font-semibold">Wind by height · {new Date(date + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</div><div className="flex-1" />{HEIGHTS.map(h => <span key={h.k} className="text-xs flex items-center gap-1"><span className="w-3 h-0.5 rounded" style={{ background: h.color }} />{h.label}</span>)}<span className="text-xs flex items-center gap-1 text-bad"><span className="w-3 border-t-2 border-dashed border-bad" />Limit {p.limitMph} mph @ {HEIGHTS.find(h => h.k === p.limitHeight)!.label}</span></div>
          <Chart p={p} rows={rows} />
          <div className="overflow-x-auto mt-4"><table className="w-full text-xs num" data-testid="wx-table"><thead><tr className="label text-left"><th className="p-1.5">Hour</th>{HEIGHTS.map(h => <th key={h.k} className="p-1.5">{h.label}</th>)}<th className="p-1.5">Gust 10 m</th><th className="p-1.5">Dir</th><th className="p-1.5">Temp</th></tr></thead><tbody>
            {rows.filter((_, i) => i >= 5 && i <= 19).map(r => { const over = (r[p.limitHeight] as number) > p.limitMph; return <tr key={r.t} className={cn('border-t hairline', over && 'bg-bad/10')}><td className="p-1.5 font-semibold">{r.t.slice(11, 16)}</td>{HEIGHTS.map(h => <td key={h.k} className={cn('p-1.5', h.k === p.limitHeight && over && 'text-bad font-bold')}>{r[h.k] as number}</td>)}<td className="p-1.5">{r.gust}</td><td className="p-1.5">{compass(r.dir)} {r.dir}°</td><td className="p-1.5">{r.temp}°F</td></tr> })}
          </tbody></table><div className="text-[11px] text-muted mt-2">mph · 60 m is interpolated from 10 m and 80 m (power law). Heights 100 m+ shown at 120 m and 180 m.</div></div>
        </Card>
        <div className="flex flex-col gap-4">
          <Card className={cn(v.standby && 'border-bad/50')}>
            <div className="flex items-center gap-2">{v.standby ? <ShieldAlert className="size-5 text-bad" /> : <CloudSun className="size-5 text-ok" />}<span className="font-semibold text-lg" data-testid="wx-verdict">{v.standby ? 'Weather standby day' : 'Within limits during work hours'}</span></div>
            <div className="text-sm text-muted mt-1">{v.over.length} of {WORK[1] - WORK[0]} work hours over {p.limitMph} mph at {HEIGHTS.find(h => h.k === p.limitHeight)!.label} · peak {v.peak[p.limitHeight] as number} mph at {v.peak.t.slice(11, 16)} · gusts to {v.peakGust} mph</div>
            <div className="text-xs text-muted mt-2">{p.crane} · {p.boomTip}</div>
            {v.standby && <div className="mt-4" data-testid="standby-report">
              <div className="label mb-1.5">Standby proof (auto)</div>
              <div className="card-flat p-3 text-sm leading-relaxed">Job #{p.jobNo} — weather standby {date}. Sustained wind exceeded the {p.limitMph} mph lift-plan limit at {HEIGHTS.find(h => h.k === p.limitHeight)!.label} for {v.over.length} work hours ({v.over[0]?.t.slice(11, 16)}–{v.over[v.over.length - 1]?.t.slice(11, 16)}). Crew and {p.crane.split(' · ')[0]} on standby per contract.</div>
              {sd ? <div className="mt-2 text-sm text-ok flex items-center gap-1.5"><CheckCircle2 className="size-4" />Stand-down recorded by {sd.by} · {new Date(sd.at).toLocaleString()}</div> : <Button className="w-full mt-2" variant="danger" data-testid="record-standdown" onClick={() => { recordStanddown(key, session?.name ?? 'Lift director', 'Wind over limit'); toast.success('Weather stand-down recorded', { description: 'Standby line drafted for the daily ticket' }) }}>Record weather stand-down</Button>}
            </div>}
          </Card>
          <Card><div className="flex items-center gap-2 text-sm"><Wind className="size-4 text-muted" /><span className="text-muted">The app never says "safe to lift". It shows the data and the limits; the lift director makes the call.</span></div></Card>
        </div>
      </div>
    </div>
  )
}

function Chart({ p, rows }: { p: WxProject; rows: WxHour[] }) {
  const W = 760, H = 260, L = 34, B = 24
  const max = Math.max(p.limitMph + 6, ...rows.map(r => r.w180)) * 1.08
  const x = (i: number) => L + (i / 23) * (W - L - 8), y = (v: number) => H - B - (v / max) * (H - B - 8)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" data-testid="wx-chart">
      <rect x={x(WORK[0])} y={0} width={x(WORK[1]) - x(WORK[0])} height={H - B} fill="var(--surface-2)" opacity=".6" />
      {[0, 10, 20, 30, 40, 50].filter(v => v < max).map(v => <g key={v}><line x1={L} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{v}</text></g>)}
      {[0, 3, 6, 9, 12, 15, 18, 21].map(hh => <text key={hh} x={x(hh)} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">{hh === 0 ? '12a' : hh < 12 ? `${hh}a` : hh === 12 ? '12p' : `${hh - 12}p`}</text>)}
      {rows.map((r, i) => (r[p.limitHeight] as number) > p.limitMph && <rect key={i} x={x(i) - 6} y={0} width={12} height={H - B} fill="var(--bad)" opacity=".1" />)}
      {HEIGHTS.map(h => <polyline key={h.k} fill="none" stroke={h.color} strokeWidth={h.k === p.limitHeight ? 3 : 1.8} points={rows.map((r, i) => `${x(i)},${y(r[h.k] as number)}`).join(' ')} />)}
      <polyline fill="none" stroke="var(--muted)" strokeDasharray="2 3" strokeWidth={1.2} points={rows.map((r, i) => `${x(i)},${y(r.gust)}`).join(' ')} />
      <line x1={L} x2={W} y1={y(p.limitMph)} y2={y(p.limitMph)} stroke="var(--bad)" strokeWidth={2} strokeDasharray="7 5" data-testid="wx-limit" />
      <text x={W - 6} y={y(p.limitMph) - 5} fontSize="11" fontWeight="700" textAnchor="end" fill="var(--bad)">Crane limit {p.limitMph} mph</text>
    </svg>
  )
}

async function pdf(p: WxProject, date: string, rows: WxHour[], v: ReturnType<typeof verdict>, sd?: { by: string; at: string }) {
  const { jsPDF } = await import('jspdf')
  const d = new jsPDF({ unit: 'pt', format: 'letter' }); const W = 612
  d.setFont('helvetica', 'bold'); d.setFontSize(18); d.text(`${companyOf().name} — Daily Weather Log`, 40, 50)
  d.setFont('helvetica', 'normal'); d.setFontSize(10.5); d.text(`Job #${p.jobNo} · ${p.name} · ${p.crane} · ${date}`, 40, 68)
  d.text(`Lift-plan wind limit: ${p.limitMph} mph sustained at ${HEIGHTS.find(h => h.k === p.limitHeight)!.label} (${p.boomTip})`, 40, 83)
  // chart
  const cx = 50, cy = 100, cw = W - 90, ch = 210, max = Math.max(p.limitMph + 6, ...rows.map(r => r.w180)) * 1.08
  const X = (i: number) => cx + (i / 23) * cw, Y = (val: number) => cy + ch - (val / max) * ch
  d.setDrawColor(220); d.setFillColor(244, 245, 247); d.rect(X(WORK[0]), cy, X(WORK[1]) - X(WORK[0]), ch, 'F'); d.rect(cx, cy, cw, ch)
  d.setFontSize(8); for (let val = 0; val < max; val += 10) { d.setDrawColor(230); d.line(cx, Y(val), cx + cw, Y(val)); d.text(String(val), cx - 14, Y(val) + 3) }
  for (let hh = 0; hh < 24; hh += 3) d.text(`${hh}:00`, X(hh) - 8, cy + ch + 12)
  const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)] as const
  HEIGHTS.forEach((h, k) => { d.setDrawColor(...hex(h.color)); d.setLineWidth(h.k === p.limitHeight ? 2 : 1); for (let i = 1; i < 24; i++) d.line(X(i - 1), Y(rows[i - 1][h.k] as number), X(i), Y(rows[i][h.k] as number)); d.setFillColor(...hex(h.color)); d.rect(cx + k * 70, cy + ch + 22, 10, 4, 'F'); d.setTextColor(60); d.text(h.label, cx + k * 70 + 14, cy + ch + 27) })
  d.setDrawColor(220, 38, 38); d.setLineWidth(1.5); d.setLineDashPattern([5, 4], 0); d.line(cx, Y(p.limitMph), cx + cw, Y(p.limitMph)); d.setLineDashPattern([], 0); d.setTextColor(220, 38, 38); d.text(`Limit ${p.limitMph} mph`, cx + cw - 50, Y(p.limitMph) - 4); d.setTextColor(0)
  // verdict
  let yy = cy + ch + 52
  d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text(v.standby ? 'WEATHER STANDBY DAY' : 'Within limits during work hours', 40, yy); d.setFont('helvetica', 'normal'); d.setFontSize(10)
  yy += 16; d.text(d.splitTextToSize(`${v.over.length} of ${WORK[1] - WORK[0]} work hours (${WORK[0]}:00–${WORK[1]}:00) exceeded the limit. Peak ${v.peak[p.limitHeight]} mph at ${v.peak.t.slice(11, 16)}; gusts at 10 m up to ${v.peakGust} mph.${sd ? ` Stand-down recorded by ${sd.by} at ${new Date(sd.at).toLocaleString()}.` : ''}`, W - 80), 40, yy)
  yy += 34
  // table
  const cols = ['Hour', ...HEIGHTS.map(h => h.label), 'Gust', 'Dir', 'Temp']
  d.setFont('helvetica', 'bold'); cols.forEach((c, i) => d.text(c, 40 + i * 58, yy)); d.setFont('helvetica', 'normal')
  rows.filter((_, i) => i >= 5 && i <= 19).forEach(r => { yy += 13; const over = (r[p.limitHeight] as number) > p.limitMph; if (over) { d.setFillColor(254, 226, 226); d.rect(36, yy - 9, W - 72, 12, 'F') } ;[r.t.slice(11, 16), ...HEIGHTS.map(h => String(r[h.k])), String(r.gust), `${compass(r.dir)}`, `${r.temp}°F`].forEach((c, i) => d.text(c, 40 + i * 58, yy)) })
  d.setFontSize(8); d.setTextColor(120); d.text('Wind in mph. Source: Open-Meteo hourly model (or Southern simulated log in demo). This report shows data and limits; the lift director makes the call.', 40, 760)
  d.save(`weather-log-${p.jobNo}-${date}.pdf`); toast.success('Customer PDF downloaded')
}
