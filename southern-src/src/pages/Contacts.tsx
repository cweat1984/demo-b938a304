import { EmpRef, JobRef } from '../components/bits'
import Linkify from '../components/Linkify'
import { useStore } from '../data/store'
import { PageHeader, CallButton, Card, DemoTag, Button } from '../components/ui'
import { byId } from '../data/logic'
import { Mail } from 'lucide-react'

export default function Contacts() {
  const db = useStore(s => s.db)
  const go = useStore(s => s.go)
  const session = useStore(s => s.session)!
  const groups = Array.from(new Set(db.contacts.map(c => c.group)))
  const sales = db.jobs.filter(j => j.stage === 'In Progress').map(j => j.quote.salesId).filter((x, i, a) => x && a.indexOf(x) === i).map(id => byId(db.employees, id)!).filter(Boolean)
  return (
    <div className="max-w-[1100px] mx-auto">
      <PageHeader eyebrow={<span className="inline-flex gap-2 items-center">Quick contacts <DemoTag /></span>} title="Call the office" sub="One tap to call. Numbers are editable in Settings." actions={['owner', 'dispatch', 'hr'].includes(session.role) && <Button onClick={() => go('settings')}>Edit numbers</Button>} />
      <div className="grid gap-3 md:grid-cols-2">{groups.flatMap(g => db.contacts.filter(c => c.group === g)).map(c => (
        <Card key={c.id} className="flex items-center gap-4"><div className="flex-1 min-w-0"><div className="text-xs text-muted">{c.group}</div><div className="font-semibold text-lg">{c.label}</div><div className="text-sm text-muted truncate"><Linkify text={c.name} /> · <span className="num">{c.phone}</span></div></div><CallButton phone={c.phone} label="Call" size="lg" variant={c.group === 'Emergency' ? 'danger' : c.primary ? 'ok' : 'secondary'} className="rounded-2xl gap-2 px-5" /></Card>
      ))}</div>
      {sales.length > 0 && <><div className="font-semibold mt-8 mb-3">Sales — by active project</div><div className="grid gap-3 md:grid-cols-2">{sales.map(e => <Card key={e.id} className="flex items-center gap-4"><div className="flex-1"><EmpRef id={e.id} className="font-semibold" /><div className="text-sm text-muted flex flex-wrap gap-x-2">{db.jobs.filter(j => j.stage === 'In Progress' && j.quote.salesId === e.id).slice(0, 5).map(j => <JobRef key={j.id} id={j.id} />)}</div></div><a href={`mailto:${e.email}`} className="btn-icon" aria-label="Email"><Mail className="size-5" /></a><CallButton phone={e.phone} label="Call" /></Card>)}</div></>}
    </div>
  )
}
