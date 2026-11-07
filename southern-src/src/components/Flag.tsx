import { companyOf } from '../data/brand'
/** Understated US flag mark. Proportions follow the 10:19 flag; muted palette by default so it reads as a quiet emblem. */
export function FlagMark({ width = 22, muted = true, className }: { width?: number; muted?: boolean; className?: string }) {
  const red = muted ? '#9e2f3c' : '#b22234', blue = muted ? '#1d2c55' : '#3c3b6e'
  const h = (width * 10) / 19
  return (
    <svg width={width} height={h} viewBox="0 0 190 100" className={className} role="img" aria-label="American flag">
      <rect width="190" height="100" rx="4" fill="#f5f5f2" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * (100 / 6.5)} width="190" height={100 / 13} fill={red} />)}
      <rect width="76" height={(100 / 13) * 7} fill={blue} />
      {Array.from({ length: 5 }, (_, r) => Array.from({ length: r % 2 ? 5 : 6 }, (_, c) => <circle key={`${r}-${c}`} cx={(r % 2 ? 13 : 6.5) + c * 12.7} cy={6 + r * 10.4} r="2.4" fill="#f5f5f2" />))}
    </svg>
  )
}

const lastMonday = (y: number, m: number) => { const d = new Date(y, m + 1, 0); while (d.getDay() !== 1) d.setDate(d.getDate() - 1); return d.getDate() }
/** Patriotic observances shown on the home dashboard on the day. */
export function observance(iso: string): { title: string; body: string } | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (m === 5 && d === lastMonday(y, 4)) return { title: 'Memorial Day', body: 'Remembering those who gave everything in service to our country.' }
  if (m === 7 && d === 4) return { title: 'Independence Day', body: `Happy Fourth of July from ${companyOf().name}. Stay safe out there.` }
  if (m === 11 && d === 11) return { title: 'Veterans Day', body: 'Thank you to every veteran on our crews and in our community.' }
  if (m === 6 && d === 14) return { title: 'Flag Day', body: 'Fly it proud.' }
  return null
}
export function ObservanceBanner({ date }: { date: string }) {
  const o = observance(date)
  if (!o) return null
  return (
    <div className="card p-4 flex items-center gap-4" data-testid="observance">
      <FlagMark width={44} muted={false} />
      <div><div className="font-semibold">{o.title}</div><div className="text-sm text-muted">{o.body}</div></div>
    </div>
  )
}
