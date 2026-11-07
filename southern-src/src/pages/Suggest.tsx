import { useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { ChevronUp, MessageSquare, Bug, Lightbulb, RotateCcw } from 'lucide-react'
import { useStore } from '../data/store'
import { useFeedback, fb, SUG_STATUSES, canAdmin, type SugStatus, type Suggestion } from '../data/feedback'
import { PageHeader, Badge, Button, Card, Segmented, Sheet, Avatar } from '../components/ui'
import { pageLabel, SuggestForm } from '../feedback/FeedbackDock'
import { cn, timeAgo } from '../lib/util'

const TONE: Record<SugStatus, 'neutral' | 'info' | 'accent' | 'ok' | 'ghost'> = { New: 'neutral', Planned: 'info', Building: 'accent', Shipped: 'ok', "Won't do": 'ghost' }

export default function Suggest() {
  const list = useFeedback(s => s.suggestions)
  const session = useStore(s => s.session)!
  const admin = canAdmin(session.role)
  const [status, setStatus] = useKeep<'All' | SugStatus>('suggest:status', 'All')
  const [kind, setKind] = useState<'All' | 'Bug' | 'Idea'>('All')
  const [sort, setSort] = useKeep<'top' | 'new'>('suggest:sort', 'top')
  const [sel, setSel] = useState<string | null>(null)
  const [add, setAdd] = useState(false)
  const rows = list.filter(s => (status === 'All' || s.status === status) && (kind === 'All' || s.kind === kind)).sort((a, b) => sort === 'top' ? b.votes.length - a.votes.length : b.at.localeCompare(a.at))
  const cur = list.find(s => s.id === sel)
  return (
    <div className="max-w-[1100px] mx-auto" data-testid="suggest-page">
      <PageHeader eyebrow="Office · Feedback" title="Suggest board" sub="Ideas and bugs from the whole crew. Upvote what matters; owners move it along." actions={<>{admin && <Button variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => { fb.reset(); toast('Suggest board reset') }}>Reset demo</Button>}<Button variant="primary" onClick={() => setAdd(true)} data-testid="board-new">New suggestion</Button></>} />
      <div className="flex flex-wrap gap-2 mb-5">
        <Segmented size="sm" value={status} onChange={setStatus} options={[{ value: 'All', label: 'All', count: list.length }, ...SUG_STATUSES.map(s => ({ value: s, label: s, count: list.filter(x => x.status === s).length }))]} />
        <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'All', label: 'Both' }, { value: 'Idea', label: 'Ideas' }, { value: 'Bug', label: 'Bugs' }]} />
        <Segmented size="sm" value={sort} onChange={setSort} options={[{ value: 'top', label: 'Top' }, { value: 'new', label: 'Newest' }]} />
      </div>
      <div className="flex flex-col gap-3">
        {rows.map(s => <Row key={s.id} s={s} me={session.name} onOpen={() => setSel(s.id)} />)}
        {!rows.length && <Card className="text-center text-muted">Nothing matches these filters.</Card>}
      </div>
      <Sheet open={!!cur} onClose={() => setSel(null)} title={cur?.title} sub={cur && `${cur.kind} · ${pageLabel(cur.page)} · ${cur.by}`}>{cur && <Detail s={cur} admin={admin} />}</Sheet>
      <SuggestForm open={add} onClose={() => setAdd(false)} page="suggest" shot={null} />
    </div>
  )
}

function Row({ s, me, onOpen }: { s: Suggestion; me: string; onOpen: () => void }) {
  const voted = s.votes.includes(me)
  return (
    <Card pad={false} className="p-4 flex items-start gap-4 cursor-pointer hover:border-faint/50 transition" onClick={onOpen}>
      <button onClick={e => { e.stopPropagation(); fb.vote(s.id) }} data-testid="upvote" className={cn('shrink-0 w-14 rounded-2xl border hairline py-2 flex flex-col items-center', voted ? 'bg-accent/15 text-accent border-accent/40' : 'hover:bg-surface-2')} aria-label="Upvote"><ChevronUp className="size-5" /><span className="font-semibold num text-sm" data-testid="votes">{s.votes.length}</span></button>
      <div className="min-w-0 flex-1" data-testid="sug-row" data-sug={s.id}>
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{s.title}</span><Badge tone={TONE[s.status]} dot>{s.status}</Badge></div>
        <div className="text-sm text-muted line-clamp-2 mt-0.5">{s.details}</div>
        <div className="text-[11.5px] text-faint mt-1.5 flex flex-wrap items-center gap-3">{s.kind === 'Bug' ? <span className="flex items-center gap-1 text-bad"><Bug className="size-3.5" />Bug</span> : <span className="flex items-center gap-1 text-warn"><Lightbulb className="size-3.5" />Idea</span>}<span>{pageLabel(s.page)}</span><span>{s.by}</span><span>{timeAgo(s.at)}</span>{s.comments.length > 0 && <span className="flex items-center gap-1"><MessageSquare className="size-3.5" />{s.comments.length}</span>}</div>
      </div>
      {s.screenshot && <img src={s.screenshot} alt="" className="hidden sm:block w-24 h-16 object-cover object-top rounded-lg border hairline" />}
    </Card>
  )
}

function Detail({ s, admin }: { s: Suggestion; admin: boolean }) {
  const [txt, setTxt] = useState('')
  return (
    <div className="flex flex-col gap-4" data-testid="sug-detail">
      <div className="text-[15px] whitespace-pre-wrap">{s.details || <span className="text-muted">No details.</span>}</div>
      {s.screenshot && <img src={s.screenshot} alt="Screenshot" className="rounded-xl border hairline" />}
      <div><div className="label mb-2">Status {admin ? '' : '(owners set this)'}</div>
        <div className="flex flex-wrap gap-1.5">{SUG_STATUSES.map(st => <button key={st} disabled={!admin} data-testid={`status-${st}`} onClick={() => { fb.setStatus(s.id, st); toast.success(`Marked ${st}`, { description: st === 'Shipped' ? `${s.by} was notified: “Your idea shipped”` : undefined }) }} className={cn('rounded-full px-3 h-8 text-xs font-semibold border hairline disabled:cursor-default', s.status === st ? 'bg-accent text-accent-ink border-transparent' : 'text-muted enabled:hover:bg-surface-2')}>{st}</button>)}</div></div>
      <div className="text-sm text-muted">{s.votes.length} upvote{s.votes.length === 1 ? '' : 's'}: {s.votes.join(', ')}</div>
      <div><div className="label mb-2">Comments</div>
        <div className="flex flex-col gap-3">{s.comments.map((c, i) => <div key={i} className="flex gap-2.5"><Avatar name={c.by} size={28} /><div><div className="text-xs"><b>{c.by}</b> <span className="text-faint">{timeAgo(c.at)}</span></div><div className="text-sm">{c.text}</div></div></div>)}{!s.comments.length && <div className="text-sm text-faint">No comments yet.</div>}</div>
        <div className="flex gap-2 mt-3"><input className="input" value={txt} onChange={e => setTxt(e.target.value)} placeholder="Add a comment" data-testid="comment-input" onKeyDown={e => { if (e.key === 'Enter' && txt.trim()) { fb.comment(s.id, txt.trim()); setTxt('') } }} /><Button disabled={!txt.trim()} onClick={() => { fb.comment(s.id, txt.trim()); setTxt('') }} data-testid="comment-send">Post</Button></div>
      </div>
    </div>
  )
}
