/** Extra sections for the local detail sheet: who to contact, pay scale by classification, fringe benefits, working rules.
 *  Only sourced facts are shown as facts; everything else says so and offers an editable field (admins only). */
import { useMemo, useState } from 'react'
import { ExternalLink, MapPin, Phone, UserRound, Pencil, Check, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button } from '../components/ui'
import { useStore } from '../data/store'
import type { ULocal, URate } from './payroll'
import { baseContact, RULES, type RuleKey } from './contacts'
import { useUnionNotes, UNION_ADMIN } from './unionNotes'

const ORANGE = '#c4581c'
const host = (u: string) => { try { return new URL(u).host.replace(/^www\./, '') } catch { return u } }
const Src = ({ u, label }: { u: string; label?: string }) => <a href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[11px]" style={{ color: ORANGE }}>{label ?? host(u)}<ExternalLink className="size-2.5" /></a>
const tel = (p: string) => `tel:${p.replace(/ext.*$/i, '').replace(/[^0-9+]/g, '')}`
export const useUnionAdmin = () => { const r = useStore(s => s.session?.role); return !!r && UNION_ADMIN.includes(r) }

function Editable({ value, placeholder, onSave, testid, multiline, canEdit }: { value?: string; placeholder: string; onSave: (v: string) => void; testid: string; multiline?: boolean; canEdit: boolean }) {
  const [ed, setEd] = useState(false), [v, setV] = useState(value ?? '')
  if (!canEdit) return value ? <div className="whitespace-pre-wrap" data-testid={testid}>{value} <Badge tone="warn">Entered by office · unverified</Badge></div> : <div className="text-muted italic" data-testid={testid}>{placeholder}</div>
  if (!ed) return <button type="button" data-testid={testid} onClick={() => { setV(value ?? ''); setEd(true) }} className="w-full text-left rounded-lg border border-dashed hairline px-2.5 py-2 hover:bg-black/5 min-h-11 flex items-start gap-2">
    <Pencil className="size-3.5 mt-0.5 text-muted shrink-0" />{value ? <span className="whitespace-pre-wrap flex-1">{value} <Badge tone="warn">office entry</Badge></span> : <span className="text-muted flex-1">{placeholder}</span>}</button>
  return <div className="flex gap-2 items-start">
    {multiline ? <textarea autoFocus data-testid={testid + '-input'} value={v} onChange={e => setV(e.target.value)} rows={3} className="flex-1 rounded-lg border hairline bg-transparent px-2 py-1.5 text-[16px] sm:text-sm" />
      : <input autoFocus data-testid={testid + '-input'} value={v} onChange={e => setV(e.target.value)} className="flex-1 h-11 rounded-lg border hairline bg-transparent px-2 text-[16px] sm:text-sm" />}
    <Button size="sm" variant="primary" data-testid={testid + '-save'} icon={<Check className="size-4" />} onClick={() => { onSave(v.trim()); setEd(false); toast.success('Saved on this device') }}>Save</Button>
  </div>
}

export function LocalContact({ l }: { l: ULocal }) {
  const k = String(l.local), c = useMemo(() => baseContact(k), [k])
  const notes = useUnionNotes(s => s.notes[k]), save = useUnionNotes(s => s.save), who = useStore(s => s.session?.name), canEdit = useUnionAdmin()
  return <div data-testid="union-contact" className="rounded-xl border hairline p-3 space-y-2">
    <div className="font-semibold flex items-center gap-2"><Phone className="size-4" style={{ color: ORANGE }} />Who to contact {c.verified.length ? <Badge tone="ok">Verified · public sources</Badge> : <Badge tone="warn">Not verified</Badge>}</div>
    {c.halls.length ? c.halls.map((h, i) => <div key={i} className="flex flex-wrap sm:flex-nowrap gap-2 items-start py-1.5 border-t hairline first:border-0" data-testid="union-contact-hall">
      <MapPin className="size-4 text-muted mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0"><div className="font-medium">{h.name}</div>{h.addr ? <a className="text-muted break-words" href={`https://maps.apple.com/?q=${encodeURIComponent(h.addr)}`} target="_blank" rel="noreferrer">{h.addr}</a> : null}{h.hours && <div className="text-xs text-muted">{h.hours}</div>}<div><Src u={h.src} label={'Source: ' + host(h.src)} /></div></div>
      {h.phone && <a href={tel(h.phone)} className="shrink-0 font-semibold rounded-lg border hairline px-3 h-11 inline-flex items-center justify-center gap-1 w-full sm:w-auto" style={{ color: ORANGE }}><Phone className="size-3.5" />{h.phone}</a>}
    </div>) : <div className="text-warn">No hall address on file</div>}
    {c.website && <div className="text-sm">Website: <a href={c.website} target="_blank" rel="noreferrer" style={{ color: ORANGE }} className="break-all">{c.website}</a></div>}
    <div className="border-t hairline pt-2 space-y-1">
      <div className="text-[11px] uppercase text-muted">Business manager / agents</div>
      {c.people.map(p => <div key={p.name} className="flex items-center gap-2 flex-wrap" data-testid="union-contact-person"><UserRound className="size-3.5 text-muted" /><b>{p.name}</b><span className="text-muted">{p.role}</span><Src u={p.src} /></div>)}
      {!c.people.length && <div className="text-muted text-xs">Not listed on the local's public website.</div>}
      <div className="text-[11px] uppercase text-muted pt-1">Business manager / dispatcher — office notes</div>
      <Editable canEdit={canEdit} testid="union-contact-edit" value={notes?.dispatcher} placeholder={c.people.length ? 'Dispatcher not on file — add contact' : 'Not on file, add contact'} onSave={v => save(k, { dispatcher: v }, who)} multiline />
    </div>
  </div>
}

/** De-duplicated pay scale for the local, grouped by WD, most valuable first. */
export function LocalPayScale({ l }: { l: ULocal }) {
  const [all, setAll] = useState(false)
  const rows = useMemo(() => { const seen = new Set<string>(); return [...l.rates].sort((a, b) => Number(b.cr) - Number(a.cr) || b.b - a.b).filter(r => { const k = r.c + r.b + r.wd; if (seen.has(k)) return false; seen.add(k); return true }) }, [l])
  const shown = all ? rows : rows.filter(r => r.cr || r.oi).slice(0, 14)
  return <div data-testid="union-payscale">
    <div className="font-semibold mb-1 flex items-center gap-2 flex-wrap">Pay scale by classification <span className="text-muted font-normal">({rows.length} lines)</span>{rows.length > 0 && <button className="text-xs underline" style={{ color: ORANGE }} onClick={() => setAll(!all)}>{all ? 'Crane & oiler only' : 'Show all classifications'}</button>}</div>
    {rows.length ? <div className="overflow-auto -mx-1"><table className="w-full text-sm"><thead><tr className="text-left text-muted text-xs"><th className="py-1 px-1">Classification</th><th>Base</th><th>Fringe</th><th>Package</th><th>Source (WD · effective)</th></tr></thead><tbody>
      {shown.map((r: URate, i) => <tr key={i} className="border-t hairline align-top"><td className="py-1.5 px-1 min-w-36 break-words text-[13px]">{r.cr && <Badge tone="accent">Crane</Badge>} {r.oi && <Badge tone="info">Oiler</Badge>} {r.c}<div className="text-[11px] text-muted">{r.st} · {r.ct}</div></td><td className="num font-semibold">${r.b.toFixed(2)}</td><td className="num">{r.f != null ? '$' + r.f.toFixed(2) : r.ft}</td><td className="num">{r.f != null ? '$' + (r.b + r.f).toFixed(2) : '—'}</td><td className="text-xs"><a href={r.u} target="_blank" rel="noreferrer" style={{ color: ORANGE }}>{r.wd}</a><div className="text-muted">eff. {r.eff}</div></td></tr>)}
    </tbody></table></div> : <div className="text-warn font-semibold text-sm">No published scale — not in any 2026 Davis-Bacon determination. Get from the hall's agreement.</div>}
    <div className="text-[11px] text-muted mt-1">Source: U.S. DOL Davis-Bacon wage determinations on SAM.gov (retrieved 2026-10-16). Public-works minimums; private CBA rates may be higher.</div>
  </div>
}

export function LocalFringes({ l }: { l: ULocal }) {
  const k = String(l.local), c = useMemo(() => baseContact(k), [k]), notes = useUnionNotes(s => s.notes[k]), save = useUnionNotes(s => s.save), who = useStore(s => s.session?.name), canEdit = useUnionAdmin()
  const totals = useMemo(() => { const m = new Map<string, { f: number; wd: string; u: string; eff: string; st: string }>(); l.rates.filter(r => r.f != null && (r.cr || r.oi)).forEach(r => { const key = r.wd + r.f; if (!m.has(key)) m.set(key, { f: r.f!, wd: r.wd, u: r.u, eff: r.eff, st: r.st }) }); return [...m.values()].sort((a, b) => b.f - a.f).slice(0, 6) }, [l])
  const f = c.fringe
  const cell = (label: string, v?: number) => <div className="rounded-lg border hairline p-2"><div className="text-[11px] uppercase text-muted">{label}</div>{v != null ? <div className="num font-semibold">${v.toFixed(2)}/h</div> : <div className="text-warn text-xs font-semibold">Get from the hall's agreement</div>}</div>
  return <div data-testid="union-fringes" className="space-y-2">
    <div className="font-semibold">Fringe benefits</div>
    {totals.length ? <div className="text-sm space-y-0.5">{totals.map(t => <div key={t.wd + t.f} className="flex gap-2 flex-wrap items-center"><b className="num">${t.f.toFixed(2)}/h total fringe</b><span className="text-muted">{t.st}</span><Src u={t.u} label={`${t.wd} · eff. ${t.eff}`} /></div>)}</div> : <div className="text-warn text-sm">No total fringe published for crane/oiler lines.</div>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{cell('Health & welfare', f?.hw)}{cell('Pension', f?.pension)}{cell('Annuity', f?.annuity)}{cell('Training', f?.training)}</div>
    {f ? <div className="text-xs">Breakdown source: <Src u={f.src} label="published CBA" /> {f.eff && `(${f.eff})`}</div> : <div className="text-xs text-muted">DOL determinations publish one combined fringe figure; the split between funds comes from the local's agreement.</div>}
    <Editable canEdit={canEdit} testid="union-fringe-note" value={notes?.fringeNote} placeholder="Fringe split not on file — add from the agreement (e.g. H&W $9.50, pension $7.00, annuity $2.00, training $0.55)" onSave={v => save(k, { fringeNote: v }, who)} multiline />
  </div>
}

export function LocalRules({ l }: { l: ULocal }) {
  const k = String(l.local), c = useMemo(() => baseContact(k), [k]), notes = useUnionNotes(s => s.notes[k]), save = useUnionNotes(s => s.save), who = useStore(s => s.session?.name), canEdit = useUnionAdmin()
  const cba = l.cba as Record<string, unknown>
  return <div data-testid="union-rules" className="space-y-2">
    <div className="font-semibold flex items-center gap-2"><BookOpen className="size-4" style={{ color: ORANGE }} />Working in this local</div>
    {typeof cba.jurisdiction_note === 'string' && <div className="text-xs rounded-lg p-2" style={{ background: '#0f2d520f' }}>{cba.jurisdiction_note}</div>}
    {RULES.map(r => { const v = c.rules.find(x => x.key === r.key); const note = notes?.rules?.[r.key as RuleKey]
      return <div key={r.key} className="rounded-lg border hairline p-2.5" data-testid={'union-rule-' + r.key}>
        <div className="text-[11px] uppercase text-muted mb-1">{r.label}</div>
        {v ? <div>{v.text} <Badge tone="ok">Sourced</Badge> <Src u={v.src} label="agreement" /></div> : <div className="text-warn text-xs font-semibold mb-1">Get from the hall's agreement</div>}
        <Editable canEdit={canEdit} testid={'union-rule-' + r.key + '-note'} value={note} placeholder="Add notes from the agreement…" onSave={x => save(k, { rules: { [r.key]: x } }, who)} multiline />
      </div> })}
    {notes?.updatedAt && <div className="text-[11px] text-muted">Office notes last edited {new Date(notes.updatedAt).toLocaleString()}{notes.updatedBy ? ` by ${notes.updatedBy}` : ''} · saved on this device</div>}
  </div>
}
