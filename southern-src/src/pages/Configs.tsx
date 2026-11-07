import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2, Container } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { inScope, byId } from '../data/logic'
import { uid } from '../lib/util'
import { PageHeader, Button, Modal, Field, Card, confirmChoice } from '../components/ui'

export default function Configs() {
  const db = useStore(s => s.db)
  const f = useStore(s => s.ui.filter)
  const [edit, setEdit] = useState<T.CraneConfig | null>(null)
  const cranes = db.equipment.filter(e => e.category === 'Crane' && inScope(e, f)).sort((a, b) => (b.capacity ?? 0) - (a.capacity ?? 0))
  return (
    <div className="max-w-[1300px] mx-auto">
      <PageHeader eyebrow="Job Builder presets" title="Crane configurations" sub="Each config is a real load list: our trailers haul what they can, third-party haulers carry the rest. Pick one in Job Builder and it all attaches." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cranes.map(c => { const cfgs = db.configs.filter(x => x.craneId === c.id); return (
        <Card key={c.id}>
          <div className="flex items-start justify-between"><div><div className="display text-2xl font-semibold num">{c.unit}</div><div className="text-xs text-muted">{c.capacity}t {c.make} {c.model}</div></div><Button size="sm" variant="ghost" icon={<Plus className="size-4" />} onClick={() => setEdit({ id: uid('cfg'), craneId: c.id, name: 'New configuration', trailerIds: [] })}>Add</Button></div>
          <div className="mt-3 flex flex-col gap-2">{cfgs.map(x => (
            <button key={x.id} onClick={() => setEdit(x)} className="rounded-2xl bg-surface-2 p-3 text-left hover:bg-surface-3 transition">
              <div className="font-semibold text-sm">{x.name}</div>
              {x.loads && <div className="mt-1 flex items-baseline gap-2"><span className="display text-xl font-semibold num">{x.loads.reduce((s, l) => s + l.n, 0)}</span><span className="text-xs text-muted">loads · {x.trailerIds.length} ours + {Math.max(0, x.loads.reduce((s, l) => s + l.n, 0) - x.trailerIds.length)} third-party</span></div>}
              {x.loads && <div className="text-[11px] text-muted mt-0.5">{x.loads.map(l => `${l.n}× ${l.kind.toLowerCase()}`).join(' · ')}</div>}
              <div className="text-xs text-muted flex items-center gap-1.5 mt-1"><Container className="size-3.5" />{x.trailerIds.map(t => byId(db.equipment, t)?.unit).join(' · ') || 'No company trailers'}</div>
            </button>))}{!cfgs.length && <div className="text-sm text-muted">No saved configurations.</div>}</div>
        </Card>) })}</div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title="Configuration">{edit && <Editor c={edit} onClose={() => setEdit(null)} />}</Modal>
    </div>
  )
}
function Editor({ c, onClose }: { c: T.CraneConfig; onClose: () => void }) {
  const db = useStore(s => s.db)
  const [name, setName] = useState(c.name), [tr, setTr] = useState<string[]>(c.trailerIds), [notes, setNotes] = useState(c.notes ?? '')
  const trailers = db.equipment.filter(e => e.category === 'Trailer')
  return (
    <div className="flex flex-col gap-4">
      <Field label="Name"><input className="input" value={name} onChange={e => setName(e.target.value)} /></Field>
      <div><div className="text-xs font-semibold text-muted mb-2">Trailers</div><div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto scroll-thin">{trailers.map(t => <label key={t.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm cursor-pointer"><input type="checkbox" className="accent-[var(--accent)]" checked={tr.includes(t.id)} onChange={e => setTr(e.target.checked ? [...tr, t.id] : tr.filter(x => x !== t.id))} />{t.unit} · {t.type}</label>)}</div></div>
      <Field label="Notes"><input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Full counterweight, luffing jib" /></Field>
      <div className="flex gap-2"><Button variant="primary" size="lg" className="flex-1" onClick={() => { actions.saveConfig({ ...c, name, trailerIds: tr, notes }); toast.success('Configuration saved'); onClose() }}>Save</Button>
        {db.configs.some(x => x.id === c.id) && <Button size="lg" variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { const r = await confirmChoice('Delete configuration?', 'Jobs already built keep their trailers.', [{ label: 'Delete', value: 1, tone: 'danger' }]); if (r) { actions.deleteConfig(c.id); onClose() } }}>Delete</Button>}</div>
    </div>
  )
}
