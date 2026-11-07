/** "My union history" — an employee's hours and benefits under every IUOE local for their whole time at Southern.
 *  Employees see only their own (My Info); office / HR / payroll open anyone's from the employee record. Guests never. */
import { useMemo, useState } from 'react'
import { Download, Printer, ChevronRight, ChevronDown, HardHat, X } from 'lucide-react'
import { useStore } from '../data/store'
import { fullName } from '../data/logic'
import { money, fmtDate } from '../lib/util'
import { Badge, Button, Modal } from '../components/ui'
import { useLocals } from '../union/UnionPage'
import { useUnion } from '../union/ustore'
import { localColor } from '../union/UnionMap'
import { buildHistory, agg, historyCsv, NO_LOCAL, HISTORY_VIEWERS, type HRow, type History } from '../union/unionHistory'

const n1 = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 1 })
const colOf = (k: string) => k === NO_LOCAL ? '#94a3b8' : localColor(k)

export function useCanSeeHistory(empId: string) {
  const s = useStore(x => x.session), db = useStore(x => x.db)
  if (!s || s.role === 'guest') return false
  const me = db.employees.find(e => e.id === s.employeeId) ?? db.employees.find(e => fullName(e) === s.name)
  return me?.id === empId || HISTORY_VIEWERS.includes(s.role)
}

export default function MyUnionHistory({ empId, mine }: { empId: string; mine?: boolean }) {
  const db = useStore(s => s.db), locals = useLocals(), { profiles, classOv } = useUnion(), allowed = useCanSeeHistory(empId)
  const e = db.employees.find(x => x.id === empId)
  const h = useMemo(() => e && locals && allowed ? buildHistory(db, locals, profiles, e, classOv[e.id]) : null, [db, locals, profiles, e, classOv, allowed])
  const [drill, setDrill] = useState<string | null>(null), [yr, setYr] = useState<number | null>(null)
  if (!allowed || !e) return null
  if (!h) return <div className="text-sm text-muted p-4">Loading union history…</div>
  const name = fullName(e), t = agg(h.rows)
  const byLocal = [...new Set(h.rows.map(r => r.local))].map(k => { const rs = h.rows.filter(r => r.local === k); return { k, name: rs[0].localName, rows: rs, a: agg(rs), years: [...new Set(rs.map(r => r.year))].sort() } }).sort((a, b) => (a.k === NO_LOCAL ? 1 : 0) - (b.k === NO_LOCAL ? 1 : 0) || b.a.hrs - a.a.hrs)
  const years = [...new Set(h.rows.map(r => r.year))].sort()
  const csv = () => { const b = new Blob([historyCsv(name, h)], { type: 'text/csv' }), u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = `union-history-${name.replace(/\s+/g, '-').toLowerCase()}.csv`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000) }
  const d = drill ? byLocal.find(x => x.k === drill) : null
  return <div className="space-y-4" data-testid="union-history">
    <div className="flex items-start gap-3 flex-wrap">
      <div className="flex-1 min-w-0"><div className="display text-lg font-semibold flex items-center gap-2"><HardHat className="size-5" style={{ color: '#c4581c' }} />{mine ? 'My union history' : `Union history · ${name}`}</div>
        <div className="text-sm text-muted">Hired {fmtDate(h.hire, { month: 'short', day: 'numeric', year: 'numeric' })}{h.homeLocal ? ` · home local IUOE ${h.homeLocal}` : ''} · {h.rows.length ? `${years[0]}–${years[years.length - 1]}` : 'no hours'}</div></div>
      <div className="flex gap-2"><Button size="sm" icon={<Download className="size-4" />} onClick={csv} data-testid="uh-csv" className="min-h-11 sm:min-h-0">CSV</Button><Button size="sm" icon={<Printer className="size-4" />} className="min-h-11 sm:min-h-0" onClick={() => printHistory(name, h)} data-testid="uh-print">Print / PDF</Button></div>
    </div>
    {/* field fixes (n14): on a phone the dev note sits behind an (i) */}
    <details className="sm:hidden text-xs text-muted" data-testid="uh-demo-more"><summary className="min-h-11 flex items-center cursor-pointer">ⓘ Demo data — how these numbers are made</summary><div className="rounded-xl p-3 mt-1" style={{ background: '#fef3c7', color: '#78350f' }}>Hours before your first app time entry are generated demo history. Fringe $ = hours × the local's published DOL fringe rate.</div></details>
    <div className="rounded-xl p-3 text-xs gap-2 items-start hidden sm:flex" style={{ background: '#fef3c7', color: '#78350f' }} data-testid="uh-demo-note"><Badge tone="warn">DEMO DATA</Badge><span>{h.demoTo ? <>Hours from {fmtDate(h.hire)} to {fmtDate(h.demoTo)} are <b>generated demo history</b> (seeded per employee) using real Southern sites and the payroll county → local rules. </> : null}{h.firstReal ? <>From {fmtDate(h.firstReal)} on, hours come from real app time entries.</> : 'No app time entries yet.'} Fringe $ = hours × the local's published DOL fringe rate, only for hours on/after that rate's effective date.</span></div>
    {!h.rows.length ? <div className="text-sm text-muted">No union hours on record{!h.homeLocal ? ' — not a union-represented craft' : ''}.</div> : <>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2" data-testid="uh-totals">
        {([['Total hours', n1(t.hrs)], ['Regular', n1(t.reg)], ['Overtime', n1(t.ot)], ['Night', n1(t.night)], ['Travel', n1(t.travel)], ['Fringe credited', money(t.fringe)], ['Per diem + job pay', money(t.perDiem + t.jobPay)]] as const).map(([k, v]) =>
          <div key={k} className="rounded-xl border hairline p-2.5"><div className="text-[11px] uppercase text-muted">{k}</div><div className="num font-semibold text-lg">{v}</div></div>)}
      </div>
      <YearChart h={h} years={years} locals={byLocal.map(x => x.k)} onPick={y => setYr(y === yr ? null : y)} sel={yr} />
      <div className="sm:hidden flex flex-col gap-2" data-testid="uh-local-cards">{byLocal.map(x => <button key={x.k} onClick={() => setDrill(x.k)} className="rounded-xl border hairline p-3 text-left min-h-11" data-testid="uh-local-card"><div className="flex items-center gap-2 font-semibold"><span className="size-3 rounded-sm" style={{ background: colOf(x.k) }} />{x.k === NO_LOCAL ? 'Open shop' : `Local ${x.k}`}<span className="text-xs text-muted font-normal">{x.years[0]}–{x.years[x.years.length - 1]}</span><span className="ml-auto num">{n1(x.a.hrs)} h</span><ChevronRight className="size-4 text-muted" /></div><div className="text-sm text-muted mt-1 num">{n1(x.a.reg)} reg · {n1(x.a.ot)} OT{x.k === NO_LOCAL ? '' : ` · fringe ${money(x.a.fringe)}`}</div></button>)}</div>
      <div className="hidden sm:block overflow-auto rounded-xl border hairline" data-testid="uh-locals">
        <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th className="p-2">Local</th><th>Years</th><th className="text-right">Reg</th><th className="text-right">OT</th><th className="text-right">Night</th><th className="text-right">Travel</th><th className="text-right">Total h</th><th className="text-right">Fringe credited</th><th className="text-right">Per diem</th><th className="text-right pr-2">Job pay</th></tr></thead><tbody>
          {byLocal.map(x => <tr key={x.k} data-testid="uh-local" onClick={() => setDrill(x.k)} className="border-t hairline cursor-pointer hover:bg-black/5">
            <td className="p-2"><span className="inline-flex items-center gap-2 font-semibold"><span className="size-3 rounded-sm" style={{ background: colOf(x.k) }} />{x.k === NO_LOCAL ? 'Open shop' : `Local ${x.k}`}<ChevronRight className="size-3.5 text-muted" /></span></td>
            <td className="text-xs">{x.years[0]}–{x.years[x.years.length - 1]}</td><td className="num text-right">{n1(x.a.reg)}</td><td className="num text-right">{n1(x.a.ot)}</td><td className="num text-right">{n1(x.a.night)}</td><td className="num text-right">{n1(x.a.travel)}</td><td className="num text-right font-semibold">{n1(x.a.hrs)}</td>
            <td className="num text-right">{x.k === NO_LOCAL ? '—' : money(x.a.fringe)}{x.k !== NO_LOCAL && x.a.fringeUnpriced > 0.5 && <div className="text-[10px] text-warn">{n1(x.a.fringeUnpriced)} h rate not on file</div>}</td><td className="num text-right">{money(x.a.perDiem)}</td><td className="num text-right pr-2">{money(x.a.jobPay)}</td></tr>)}
          <tr className="border-t-2 font-semibold"><td className="p-2">All locals</td><td /><td className="num text-right">{n1(t.reg)}</td><td className="num text-right">{n1(t.ot)}</td><td className="num text-right">{n1(t.night)}</td><td className="num text-right">{n1(t.travel)}</td><td className="num text-right">{n1(t.hrs)}</td><td className="num text-right">{money(t.fringe)}</td><td className="num text-right">{money(t.perDiem)}</td><td className="num text-right pr-2">{money(t.jobPay)}</td></tr>
        </tbody></table>
      </div>
      {yr && <YearJobs rows={h.rows.filter(r => r.year === yr)} title={`${yr} — every job`} onClose={() => setYr(null)} />}
    </>}
    <Modal open={!!d} onClose={() => setDrill(null)} width={820} title={<span data-testid="uh-drill-title">{d ? (d.k === NO_LOCAL ? 'Open shop (no IUOE local)' : `IUOE Local ${d.k}`) : ''}</span>} sub={d ? `${name} · ${n1(d.a.hrs)} h · ${d.years[0]}–${d.years[d.years.length - 1]}` : ''}>
      {d && <LocalDrill rows={d.rows} />}
    </Modal>
  </div>
}

function YearChart({ h, years, locals, onPick, sel }: { h: History; years: number[]; locals: string[]; onPick: (y: number) => void; sel: number | null }) {
  const data = years.map(y => ({ y, parts: locals.map(k => ({ k, v: h.rows.filter(r => r.year === y && r.local === k).reduce((a, r) => a + r.reg + r.ot, 0) })) }))
  const max = Math.max(1, ...data.map(d => d.parts.reduce((a, p) => a + p.v, 0)))
  return <div data-testid="uh-chart" className="rounded-xl border hairline p-3">
    <div className="text-sm font-semibold mb-2">Hours by year and local <span className="text-muted font-normal text-xs">· tap a year for its jobs</span></div>
    <div className="flex items-end gap-1 h-44 overflow-x-auto">{data.map(d => { const tot = d.parts.reduce((a, p) => a + p.v, 0); return <button key={d.y} data-testid="uh-year" onClick={() => onPick(d.y)} className={'flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end rounded ' + (sel === d.y ? 'bg-black/5' : '')} title={`${d.y}: ${Math.round(tot)} h`}>
      <div className="text-[10px] num text-muted">{tot >= 1000 ? (tot / 1000).toFixed(1) + 'k' : Math.round(tot)}</div>
      <div className="w-full max-w-10 flex flex-col-reverse rounded-t overflow-hidden" style={{ height: `${(tot / max) * 80}%` }}>{d.parts.filter(p => p.v > 0).map(p => <div key={p.k} style={{ height: `${(p.v / tot) * 100}%`, background: colOf(p.k) }} />)}</div>
      <div className="text-[10px] num">{String(d.y).slice(2)}’</div></button> })}</div>
    <div className="flex flex-wrap gap-3 mt-2 text-xs">{locals.map(k => <span key={k} className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm" style={{ background: colOf(k) }} />{k === NO_LOCAL ? 'Open shop' : `Local ${k}`}</span>)}</div>
  </div>
}

function LocalDrill({ rows }: { rows: HRow[] }) {
  const years = [...new Set(rows.map(r => r.year))].sort((a, b) => b - a)
  const [open, setOpen] = useState<number | null>(years[0] ?? null)
  const src = rows.find(r => r.fringeSrc)?.fringeSrc
  return <div className="space-y-2 text-sm" data-testid="uh-drill">
    {src ? <div className="text-xs rounded-lg p-2" style={{ background: '#0f2d520f' }}>Fringe rate source: <a href={src.u} target="_blank" rel="noreferrer" style={{ color: '#c4581c' }}>{src.wd}</a> · effective {fmtDate(src.eff)} · hours before that date are credited, $ not priced.</div> : rows[0]?.local !== NO_LOCAL ? <div className="text-xs text-warn">No published fringe rate for this local — hours credited, contributions not priced.</div> : <div className="text-xs text-muted">Open-shop hours — no union fringe.</div>}
    {years.map(y => { const rs = rows.filter(r => r.year === y), a = agg(rs); return <div key={y} className="rounded-xl border hairline overflow-hidden">
      <button onClick={() => setOpen(open === y ? null : y)} data-testid="uh-drill-year" className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-black/5">{open === y ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}<b>{y}</b><span className="text-muted text-xs">{rs.length} jobs · {a.days} days</span><span className="ml-auto num text-xs">{n1(a.reg)} reg · {n1(a.ot)} OT · {n1(a.night)} night · {n1(a.travel)} travel</span><b className="num">{n1(a.hrs)} h</b></button>
      {open === y && <YearJobs rows={rs} />}
    </div> })}
  </div>
}

function YearJobs({ rows, title, onClose }: { rows: HRow[]; title?: string; onClose?: () => void }) {
  return <div className={title ? 'rounded-xl border hairline' : ''} data-testid="uh-jobs">
    {title && <div className="flex items-center p-2.5 border-b hairline"><b className="flex-1">{title}</b>{onClose && <button aria-label="Close" onClick={onClose} className="size-9 grid place-items-center"><X className="size-4" /></button>}</div>}
    {/* dive2 n14: phones get one card per job instead of a 9-column table */}
    <div className="sm:hidden flex flex-col divide-y hairline" data-testid="uh-job-cards">{rows.map(r => <div key={r.key} className="p-2.5 text-xs" data-testid="uh-job-card"><div className="font-medium text-sm">{r.jobLabel}</div><div className="text-muted">{r.site} · {r.local === NO_LOCAL ? 'Open shop' : `Local ${r.local}`} · {fmtDate(r.from)}–{fmtDate(r.to)}</div><div className="flex flex-wrap gap-x-3 mt-1 num"><span>Reg {n1(r.reg)}</span><span>OT {n1(r.ot)}</span><span>Fringe {r.local === NO_LOCAL ? '—' : r.fringe != null ? money(r.fringe) : 'not on file'}</span><span>Per diem {money(r.perDiem)}</span></div></div>)}</div>
    <div className="overflow-auto hidden sm:block"><table className="w-full text-xs"><thead><tr className="text-left text-muted"><th className="p-2">Job</th><th>Local</th><th>Dates</th><th className="text-right">Reg</th><th className="text-right">OT</th><th className="text-right">Night</th><th className="text-right">Travel</th><th className="text-right">Fringe</th><th className="text-right">Per diem</th><th className="text-right pr-2">Job pay</th></tr></thead><tbody>
      {rows.map(r => <tr key={r.key} className="border-t hairline align-top"><td className="p-2 min-w-44"><div className="font-medium">{r.jobLabel}</div><div className="text-muted">{r.site}</div>{r.source === 'demo' ? <Badge tone="warn">demo</Badge> : <Badge tone="ok">app time</Badge>}</td>
        <td className="whitespace-nowrap">{r.local === NO_LOCAL ? 'Open shop' : r.local}</td><td className="whitespace-nowrap">{fmtDate(r.from)}–{fmtDate(r.to)}</td><td className="num text-right">{n1(r.reg)}</td><td className="num text-right">{n1(r.ot)}</td><td className="num text-right">{n1(r.night)}</td><td className="num text-right">{n1(r.travel)}</td>
        <td className="num text-right">{r.local === NO_LOCAL ? '—' : r.fringe != null ? money(r.fringe) : <span className="text-warn">not on file</span>}</td><td className="num text-right">{money(r.perDiem)}</td><td className="num text-right pr-2" title={r.jobPayWhy.join(', ')}>{money(r.jobPay)}</td></tr>)}
    </tbody></table></div>
  </div>
}

function printHistory(name: string, h: History) {
  const t = agg(h.rows), locs = [...new Set(h.rows.map(r => r.local))]
  const esc = (s: unknown) => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))
  const lrow = (k: string) => { const rs = h.rows.filter(r => r.local === k), a = agg(rs); return `<tr><td>${esc(rs[0].localName)}</td><td>${n1(a.reg)}</td><td>${n1(a.ot)}</td><td>${n1(a.night)}</td><td>${n1(a.travel)}</td><td><b>${n1(a.hrs)}</b></td><td>${k === NO_LOCAL ? '—' : money(a.fringe)}</td><td>${money(a.perDiem)}</td><td>${money(a.jobPay)}</td></tr>` }
  const years = [...new Set(h.rows.map(r => r.year))].sort((a, b) => b - a)
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Union history — ${esc(name)}</title><style>body{font:12px -apple-system,Segoe UI,Arial,sans-serif;color:#111;margin:24px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:18px 0 6px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ddd;padding:3px 5px;text-align:right}th:first-child,td:first-child{text-align:left}.demo{background:#fef3c7;padding:6px 8px;border-radius:6px;margin:10px 0}@media print{button{display:none}}</style></head><body>
<button onclick="print()" style="float:right;padding:8px 14px">Print / Save as PDF</button><h1>Union history — ${esc(name)}</h1><div>Southern Lifting &amp; Hoisting · hired ${esc(h.hire)} · printed ${new Date().toLocaleDateString()}</div>
<div class="demo"><b>DEMO DATA:</b> ${h.demoTo ? `hours ${esc(h.hire)} → ${esc(h.demoTo)} are generated demo history. ` : ''}${h.firstReal ? `From ${esc(h.firstReal)} hours come from app time entries.` : ''} Fringe $ = hours × published DOL WD fringe rate on/after its effective date.</div>
<h2>By local</h2><table><tr><th>Local</th><th>Reg</th><th>OT</th><th>Night</th><th>Travel</th><th>Total h</th><th>Fringe credited</th><th>Per diem</th><th>Job pay</th></tr>${locs.map(lrow).join('')}<tr><td><b>All</b></td><td>${n1(t.reg)}</td><td>${n1(t.ot)}</td><td>${n1(t.night)}</td><td>${n1(t.travel)}</td><td><b>${n1(t.hrs)}</b></td><td>${money(t.fringe)}</td><td>${money(t.perDiem)}</td><td>${money(t.jobPay)}</td></tr></table>
${years.map(y => `<h2>${y}</h2><table><tr><th>Job</th><th>Local</th><th>Reg</th><th>OT</th><th>Night</th><th>Travel</th><th>Fringe</th><th>Per diem</th><th>Job pay</th></tr>${h.rows.filter(r => r.year === y).map(r => `<tr><td>${esc(r.jobLabel)}${r.source === 'demo' ? ' (demo)' : ''}</td><td>${r.local === NO_LOCAL ? 'Open shop' : r.local}</td><td>${n1(r.reg)}</td><td>${n1(r.ot)}</td><td>${n1(r.night)}</td><td>${n1(r.travel)}</td><td>${r.local === NO_LOCAL ? '—' : r.fringe != null ? money(r.fringe) : 'n/a'}</td><td>${money(r.perDiem)}</td><td>${money(r.jobPay)}</td></tr>`).join('')}</table>`).join('')}
</body></html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print() } catch { /* */ } }, 400) }
  else { const b = new Blob([html], { type: 'text/html' }); location.href = URL.createObjectURL(b) }
}

/** Button on the employee record (office / HR / payroll). */
export function UnionHistoryButton({ empId }: { empId: string }) {
  const role = useStore(s => s.session?.role), [open, setOpen] = useState(false)
  if (!role || !HISTORY_VIEWERS.includes(role)) return null
  return <>
    <Button size="sm" variant="outline" icon={<HardHat className="size-4" />} onClick={() => setOpen(true)} data-testid="emp-union-history">Union history</Button>
    <Modal open={open} onClose={() => setOpen(false)} width={1000} title="Union history" sub="Every hour under every local, with fringe credited">{open && <MyUnionHistory empId={empId} />}</Modal>
  </>
}
