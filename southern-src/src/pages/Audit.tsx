import Linkify from '../components/Linkify'
import { useKeep } from '../lib/keep'
import { useMemo, useState } from 'react'
import { Search, Download, ShieldCheck, ChevronDown } from 'lucide-react'
import { useStore } from '../data/store'
import { fmtTs, downloadCsv, ctStamp } from '../lib/util'
import { PageHeader, Button, Badge, Empty } from '../components/ui'
import { auditVisible } from '../lib/auditScope'

export default function Audit() {
  const all = useStore(s => s.db.audit); const me = useStore(s => s.session?.role)
  // the whole company log is the owner's; everyone else sees their own module's entries
  const audit = useMemo(() => all.filter(a => auditVisible(a, me)), [all, me])
  const [q, setQ] = useKeep('audit:q', '')
  const [role, setRole] = useState('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useMemo(() => audit.slice().sort((a, b) => b.at.localeCompare(a.at)).filter(a => (role === 'all' || a.role === role) && (!q || `${a.actor} ${a.action} ${a.entity} ${a.detail}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 400), [audit, q, role])
  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader eyebrow={<span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5" />Change history</span>} title="Audit log" sub={`${audit.length} events · every change records who, what, when — approvals, removals and exports included`} actions={<Button icon={<Download className="size-4" />} onClick={() => downloadCsv('audit-log.csv', [['When (CT)', 'Who', 'Role', 'Action', 'Record', 'Detail'], ...audit.map(a => [ctStamp(a.at), a.actor, a.role, a.action, a.entity, a.detail])])}>Export</Button>} />
      <div className="flex flex-wrap gap-3 mb-4"><div className="relative w-full sm:w-80"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input pl-9" placeholder="Search actor, action, record" value={q} onChange={e => setQ(e.target.value)} /></div><select className="input w-48" value={role} onChange={e => setRole(e.target.value)}>{['all', 'owner', 'dispatch', 'ops', 'field', 'shop', 'safety', 'payroll', 'hr', 'accounting'].map(r => <option key={r} value={r}>{r === 'all' ? 'All roles' : r}</option>)}</select></div>
      {!list.length && <div className="card p-8 text-center" data-testid="audit-empty"><div className="font-semibold">Nothing in the log matches “{q}”</div><div className="text-sm text-muted mt-1">Try a person’s name, an action like “Signed in”, or a job number.</div>{q && <button onClick={() => setQ('')} className="mt-3 h-10 px-4 rounded-full bg-surface-2 text-sm font-semibold">Clear search</button>}</div>}
      <div className="card p-0 overflow-hidden">{list.map(a => (
        <div key={a.id} className="border-b hairline last:border-0">
        <button onClick={() => setOpenId(openId === a.id ? null : a.id)} data-testid="audit-row" className="w-full text-left flex items-center gap-4 px-5 py-2.5 text-sm hover:bg-surface-2 transition">
          <span className="w-36 text-xs text-muted num shrink-0">{fmtTs(a.at)}</span>
          <Linkify text={a.actor} className="w-36 font-medium truncate" />
          <Badge>{a.role}</Badge>
          <span className="flex-1 min-w-0 truncate"><b className="font-semibold">{a.action}</b> · <Linkify text={a.entity} /> <Linkify text={a.detail} className="text-muted" /></span>
          {a.diff?.length ? <span className="text-xs text-accent font-semibold shrink-0">{a.diff.length} change{a.diff.length === 1 ? '' : 's'}</span> : null}
          <ChevronDown className={`size-4 text-muted shrink-0 transition ${openId === a.id ? 'rotate-180' : ''}`} />
        </button>
        {openId === a.id && <div className="px-5 pb-4 pt-1 text-sm" data-testid="audit-diff">
          {a.diff?.length ? <div className="rounded-xl bg-surface-2 overflow-hidden">{a.diff.map(d => <div key={d.field} className="grid grid-cols-[140px_1fr_1fr] gap-3 px-4 py-2 border-b hairline last:border-0"><span className="text-muted">{d.field}</span><span className="text-bad line-through decoration-1">{d.from}</span><span className="text-ok font-semibold">{d.to}</span></div>)}</div> : <div className="text-muted">No field changes — {a.detail || a.action}.</div>}
          <div className="text-xs text-muted mt-2">Event {a.id} · {new Date(a.at).toLocaleString()} · recorded by {a.actor} ({a.role})</div>
        </div>}
        </div>))}{!list.length && <Empty title="No events match" />}</div>
    </div>
  )
}
