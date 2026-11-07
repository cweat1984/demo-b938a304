// Parts requests: requesters ask; the inventory person approves, picks and checks out.
import { useKeep } from '../lib/keep'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type * as T from '../data/types'
import { useStore } from '../data/store'
import { byId } from '../data/logic'
import { cn, fmtDate, fmtTs, today } from '../lib/util'
import { PageHeader, Button, Badge, Modal } from '../components/ui'
import { RequestForm, MyRequests, reqTone, Tip } from '../components/inv/Purchasing'
import { targetLabel } from '../data/invcore'

export default function Requests() {
  const db = useStore(s => s.db); const role = useStore(s => s.session!.role); const open = useStore(s => s.open)
  const desk = ['inventory', 'ops', 'owner', 'branch'].includes(role)
  const from: T.PartsRequest['from'] = role === 'shop' ? 'Shop' : role === 'sales' ? 'Sales' : 'Office'
  const [st, setSt] = useKeep<'todo' | T.PartsRequest['status'] | 'all'>('requests:st', 'todo')
  const [form, setForm] = useState(false)
  const all = db.partsRequests ?? []
  if (!desk) return <div className="max-w-2xl mx-auto" data-testid="requests">
    <PageHeader eyebrow="Inventory" title="Request parts" sub="Ask the stockroom for anything on the shelf. You’ll see it here when it’s approved and ready." />
    <div className="card p-5 mb-6"><RequestForm from={from} /></div>
    <div className="label mb-2">My requests</div><MyRequests />
  </div>
  const list = all.filter(r => st === 'all' || (st === 'todo' ? r.status === 'Waiting' || r.status === 'Approved' : r.status === st))
  return <div className="max-w-[1200px] mx-auto" data-testid="requests">
    <PageHeader eyebrow="Inventory" title="Parts requests" sub="From the field, the shop and sales. Approve → pick → check out." actions={<Button icon={<Plus className="size-4" />} onClick={() => setForm(true)} data-testid="new-request">New request</Button>} />
    <Tip id="req-why" className="mb-4">Requests keep the counter calm: people ask from their phone, you pull it when you’re ready, and every item still gets checked out to a person and a job — so nothing walks off untracked.</Tip>
    <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">{(['todo', 'Waiting', 'Approved', 'Checked out', 'Denied', 'all'] as const).map(s => <button key={s} onClick={() => setSt(s)} className={cn('shrink-0 rounded-full px-3 h-8 text-xs font-semibold', st === s ? 'bg-ink text-surface' : 'bg-surface-2 text-muted hover:text-ink')}>{s === 'todo' ? 'To do' : s === 'all' ? 'All' : s} <span className="opacity-60">{s === 'all' ? all.length : s === 'todo' ? all.filter(r => r.status === 'Waiting' || r.status === 'Approved').length : all.filter(r => r.status === s).length}</span></button>)}</div>
    <div className="card p-0 overflow-hidden">{list.map(r => <button key={r.id} onClick={() => open({ type: 'request', id: r.id })} className="w-full flex items-center gap-3 px-5 py-3 border-b hairline last:border-0 text-left hover:bg-surface-2" data-testid="req-row">
      <span className="flex-1 min-w-0"><span className="block text-sm font-semibold truncate">{r.byName} · {r.lines.map(l => `${l.qty} × ${byId(db.items, l.itemId)?.name ?? ''}`).join(', ')}</span><span className="block text-xs text-muted truncate">{r.no} · {r.from} · {r.target ? targetLabel(db, r.target) : '—'} · {r.reason} · {fmtTs(r.at)}</span></span>
      {r.status !== 'Checked out' && r.status !== 'Denied' && <span className={cn('text-xs', r.needBy <= today() ? 'text-bad font-semibold' : 'text-muted')}>need {r.needBy <= today() ? 'today' : fmtDate(r.needBy)}</span>}
      <Badge tone={reqTone(r.status) as 'warn'}>{r.status}</Badge>
    </button>)}{!list.length && <div className="p-6 text-sm text-muted">Nothing here.</div>}</div>
    <Modal open={form} onClose={() => setForm(false)} title="New parts request" sub="On behalf of yourself or someone at the counter" width={600}><RequestForm from="Office" onDone={() => setForm(false)} /></Modal>
  </div>
}
