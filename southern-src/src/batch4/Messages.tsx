import { useEffect, useMemo, useRef, useState } from 'react'
import { Send, Camera, Hash, User, Bell, Wind, ShieldAlert, Truck, FileSignature, Plus, Users, Building2 } from 'lucide-react'
import { PageHeader, Card, Button, Toggle, Badge, Avatar } from '../components/ui'
import { useStore } from '../data/store'
import { cn, timeAgo } from '../lib/util'
import { useB4, type RuleKey } from './b4store'

const RICON: Record<string, typeof Wind> = { wind: Wind, cert: ShieldAlert, load: Truck, ticket: FileSignature, mention: Hash, message: Bell }
const DEMO: Record<RuleKey, [string, string]> = {
  wind: ['Wind over limit — Sweetwater T-14', 'Gust 29 mph at 120 m vs 25 mph limit. Lifts paused; standby logged.'],
  cert: ['Cert expiring — H2S, Bryce Turner', 'Expires in 21 days; the job runs past it. Class suggested for Tue.'],
  load: ['Load 5 delivered — Weatherford', 'Superlift tray checked in by Samsara geofence 2:14 PM.'],
  ticket: ['Ticket signed — Rick Dawson', 'Plains Wind signed today’s ticket by text link.'],
}
export default function Messages() {
  const db = useStore(s => s.db), me = useStore(s => s.session?.name) ?? 'Chad Weathers'
  const { chats, rules, feed } = useB4()
  useEffect(() => { useB4.getState().seed(db) }, [db])
  const [cid, setCid] = useState<string | null>(null)
  const chat = chats.find(c => c.id === cid) ?? chats[0]
  const [text, setText] = useState(''), [photo, setPhoto] = useState<string>()
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => { if (chat) useB4.getState().read(chat.id); end.current?.scrollIntoView({ block: 'end' }) }, [chat?.id, chat?.msgs.length])
  const at = text.match(/@(\w*)$/)
  const sugg = at && chat ? chat.members.filter(n => n !== me && n.toLowerCase().startsWith(at[1].toLowerCase())).slice(0, 5) : []
  const people = useMemo(() => db.employees.filter(e => e.status === 'Active').map(e => `${e.first} ${e.last}`), [db.employees])
  const [dmPick, setDmPick] = useState(false)
  const [dmQ, setDmQ] = useState('')
  const send = () => { if (!chat || (!text.trim() && !photo)) return; useB4.getState().send(chat.id, { from: me, text: text.trim(), photo }); setText(''); setPhoto(undefined) }
  return <div className="flex flex-col gap-5" data-testid="messages">
    <PageHeader eyebrow="Office" title="Messages & alerts" sub="A chat for every job, DMs, photos and @mentions — plus the alerts that matter." />
    <div className="grid lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_320px] gap-4 items-start [&>*]:min-w-0">
      <Card pad={false}><div className="px-4 py-3 border-b hairline flex items-center"><span className="font-semibold flex-1">Chats</span><Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDmPick(!dmPick)} data-testid="dm-new">DM</Button></div>
        {dmPick && <div className="p-2 border-b hairline"><input data-testid="dm-search" value={dmQ} onChange={e => setDmQ(e.target.value)} placeholder="Search people" className="input mb-2 h-10" /><div className="max-h-48 overflow-auto">{people.filter(p => p !== me && p.toLowerCase().includes(dmQ.trim().toLowerCase())).map(p => <button key={p} data-testid="dm-person" onClick={() => { setCid(useB4.getState().openDm(me, p)); setDmPick(false); setDmQ('') }} className="w-full text-left px-2 py-1.5 text-sm rounded-lg hover:bg-surface-2">{p}</button>)}</div></div>}
        <div className="max-h-[620px] overflow-auto">{chats.map(c => { const unread = c.msgs.length - c.lastRead; const last = c.msgs[c.msgs.length - 1]
          return <button key={c.id} data-testid="chat-item" onClick={() => setCid(c.id)} className={cn('w-full text-left px-4 py-3 flex gap-3 hover:bg-surface-2 border-b hairline', chat?.id === c.id && 'bg-surface-2')}>
            <span className="size-9 rounded-xl bg-surface-3 grid place-items-center shrink-0">{c.kind === 'job' ? <Hash className="size-4" /> : <User className="size-4" />}</span>
            <span className="flex-1 min-w-0"><span className="flex items-center gap-1"><span className="font-semibold text-sm truncate flex-1">{c.title}</span>{unread > 0 && <span className="rounded-full bg-accent text-accent-ink text-[10px] font-bold px-1.5">{unread}</span>}</span><span className="block text-xs text-muted truncate">{last ? `${last.from.split(' ')[0]}: ${last.photo ? '📷 ' : ''}${last.text}` : 'No messages yet'}</span></span></button> })}</div></Card>
      {chat ? <Card pad={false} className="flex flex-col h-[700px]" data-testid="thread">
        <div className="px-5 py-3 border-b hairline"><div className="font-semibold">{chat.title}</div><div className="text-xs text-muted flex items-center gap-1 flex-wrap"><Users className="size-3" />{chat.members.length} members{chat.customer && <span className="inline-flex items-center gap-1 ml-2 text-info"><Building2 className="size-3" />Customer: {chat.customer}</span>}</div></div>
        <div className="flex-1 overflow-auto px-5 py-4 flex flex-col gap-3">{chat.msgs.map(m => m.system ? <div key={m.id} className="text-center text-xs text-muted">{m.text}</div> : <div key={m.id} className={cn('flex gap-2 max-w-[80%]', m.from === me && 'self-end flex-row-reverse')} data-testid="msg">
          <Avatar name={m.from} size={28} /><div><div className={cn('rounded-2xl px-3.5 py-2 text-sm', m.from === me ? 'bg-accent text-accent-ink' : 'bg-surface-2')}>{m.photo && <img src={m.photo} className="rounded-xl max-h-48 mb-1.5" />}{m.text.split(/(@\w+)/).map((p, i) => p.startsWith('@') ? <b key={i} className="underline decoration-dotted">{p}</b> : p)}</div><div className={cn('text-[10px] text-muted mt-0.5', m.from === me && 'text-right')}>{m.from} · {timeAgo(m.at)}</div></div></div>)}<div ref={end} /></div>
        {sugg.length > 0 && <div className="px-5 flex gap-1.5 flex-wrap">{sugg.map(n => <button key={n} data-testid="mention-sugg" onClick={() => setText(text.replace(/@\w*$/, '@' + n.split(' ')[0] + ' '))} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs">@{n}</button>)}</div>}
        <div className="p-3 border-t hairline flex gap-2 items-center">{photo && <img src={photo} className="size-10 rounded-lg object-cover" />}
          <label className="size-10 rounded-xl bg-surface-2 grid place-items-center cursor-pointer shrink-0"><Camera className="size-4" /><input data-testid="msg-photo" type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setPhoto(r.result as string); r.readAsDataURL(f) } }} /></label>
          <input data-testid="msg-input" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Message — type @ to mention" className="flex-1 h-10 rounded-xl bg-surface-2 px-3 text-sm outline-none" />
          <Button variant="primary" icon={<Send className="size-4" />} onClick={send} data-testid="msg-send">Send</Button></div>
      </Card> : <Card>No chats.</Card>}
      <div className="flex flex-col gap-4 lg:col-span-2 2xl:col-span-1">
        <Card data-testid="alert-rules"><div className="font-semibold mb-2">Alert rules</div>{rules.map(r => { const I = RICON[r.key]; return <div key={r.key} className="py-2 border-b hairline last:border-0"><div className="flex items-center gap-2"><I className="size-4 text-muted" /><span className="flex-1 text-sm font-semibold">{r.label}</span><Toggle checked={r.on} onChange={v => useB4.getState().setRule(r.key, { on: v })} /></div><div className="text-xs text-muted mt-0.5">{r.detail}</div>
          <div className="flex gap-3 mt-1.5 text-xs"><label className="flex items-center gap-1"><input type="checkbox" checked={r.push} onChange={e => useB4.getState().setRule(r.key, { push: e.target.checked })} />Push</label><label className="flex items-center gap-1"><input type="checkbox" checked={r.sms} onChange={e => useB4.getState().setRule(r.key, { sms: e.target.checked })} />Text</label><button data-testid={`alert-test-${r.key}`} onClick={() => useB4.getState().fire(r.key, ...DEMO[r.key], 'messages')} className="ml-auto text-accent font-semibold">Test</button></div></div> })}</Card>
        <Card data-testid="alert-feed"><div className="flex items-center mb-2"><span className="font-semibold flex-1">Recent alerts</span><Badge tone="accent">{feed.filter(f => !f.read).length} new</Badge></div>{feed.slice(0, 8).map(f => { const I = RICON[f.rule] ?? Bell; return <div key={f.id} className="py-2 flex gap-2 text-sm"><I className="size-4 mt-0.5 text-muted" /><div className="flex-1"><div className={cn(!f.read && 'font-semibold')}>{f.title}</div><div className="text-xs text-muted">{f.body} · {timeAgo(f.at)}</div></div></div> })}<Button size="sm" className="mt-2" onClick={() => useB4.getState().readFeed()}>Mark all read</Button></Card>
      </div>
    </div>
  </div>
}
