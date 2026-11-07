import { useState } from 'react'
import { Copy, Link2, Ban, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Badge, Button, Field } from '../components/ui'
import { useStore } from '../data/store'
import { cn } from '../lib/util'
import PinGate, { gpLock } from './PinGate'
import { Lock } from 'lucide-react'
import { GUEST_SCOPES, type GuestScope } from '../data/roles'
const MAX_PASS_H = 30 * 24
import { signPass, passUrl, passes, savePasses, DURATIONS, DEFAULT_DURATION, type PassRec } from './pass'

/** Owner-only, PIN-gated: make, copy and revoke guest passes. */
export default function GuestPasses() {
  const role = useStore(s => s.session?.role)
  if (role !== 'owner') return <Card className="max-w-lg mx-auto mt-16 text-center">Guest passes are owner-only.</Card>
  return <PinGate><GuestPassesInner /></PinGate>
}
function GuestPassesInner() {
  const who = useStore(s => s.session?.name) ?? 'Owner', role = useStore(s => s.session?.role)
  const [list, setList] = useState<PassRec[]>(passes)
  const [name, setName] = useState(''), [dur, setDur] = useState<string>(DEFAULT_DURATION), [hours, setHours] = useState(4), [note, setNote] = useState('')
  const [last, setLast] = useState<string | null>(null)
  const [scope, setScope] = useState<GuestScope>('show')
  if (role !== 'owner') return <Card className="max-w-lg mx-auto mt-16 text-center">Guest passes are owner-only.</Card>
  const create = async () => {
    if (!name.trim()) { toast.error('Add the guest’s name'); return }
    const ms = dur === 'custom' ? Math.min(MAX_PASS_H, Math.max(0.25, Number.isFinite(hours) ? hours : 0.25)) * 36e5 : DURATIONS.find(d => d.k === dur)!.ms // custom passes are capped at 30 days
    const c = { i: Math.random().toString(36).slice(2, 10), n: name.trim(), e: Date.now() + ms, c: Date.now(), s: scope, ...(note.trim() ? { o: note.trim() } : {}) }
    let url = ''; try { url = passUrl(await signPass(c)) } catch (e) { gpLock(); toast.error((e as Error).message); return }
    const l = [{ ...c, url, by: who }, ...list]; savePasses(l); setList(l); setLast(url); setName(''); setNote('')
    useStore.getState().commit('Guest pass created', c.n, `${DURATIONS.find(d => d.k === dur)?.label ?? ''}${dur === 'custom' ? ` ${hours} h` : ''} · expires ${new Date(c.e).toLocaleString()}`, () => {}, { silent: true })
    navigator.clipboard?.writeText(url).then(() => toast.success('Link copied'), () => toast.success('Pass created'))
  }
  const revoke = (i: string) => { const l = list.map(p => p.i === i ? { ...p, revoked: true } : p); savePasses(l); setList(l); toast('Pass revoked in this browser', { description: 'Publish guest revocations to cut it off on their device too.' }) }
  const copy = (u: string) => navigator.clipboard?.writeText(u).then(() => toast.success('Link copied'), () => toast.error('Copy failed — select the link'))
  const now = Date.now()
  return <div className="max-w-[900px] mx-auto flex flex-col gap-5" data-testid="guest-passes">
    <PageHeader eyebrow="Office · owner only" title="Guest passes" sub="A view-only link for a visitor or prospect. It opens without the site password and stops working when it expires." actions={<Button variant="secondary" onClick={() => { gpLock(); toast('Guest passes locked') }} data-testid="gp-lock" icon={<Lock className="size-4" />}>Lock</Button>} />
    <Card className="flex flex-col gap-4" data-testid="guest-new">
      <div className="grid sm:grid-cols-2 gap-3"><Field label="Guest name"><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Pat Morgan · Valley Wind" data-testid="guest-name" /></Field><Field label="Note (optional)"><input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Board meeting demo" data-testid="guest-note" /></Field></div>
      <div><div className="label mb-2">Lasts</div><div className="flex flex-wrap gap-2">{DURATIONS.map(d => <button key={d.k} onClick={() => setDur(d.k)} data-testid={`guest-dur-${d.k}`} data-selected={dur === d.k} className={cn('rounded-full px-4 h-10 text-sm font-semibold', dur === d.k ? 'bg-accent text-accent-ink' : 'bg-surface-2')}>{d.label}</button>)}
        {dur === 'custom' && <label className="inline-flex items-center gap-2 text-sm"><input type="number" min={0.25} max={MAX_PASS_H} step={0.25} value={hours} onChange={e => setHours(Number(e.target.value))} className="input w-24" data-testid="guest-hours" />hours{hours > MAX_PASS_H && <span className="text-xs text-warn" data-testid="guest-hours-cap">max 30 days ({MAX_PASS_H} h) — will be capped</span>}</label>}</div></div>
      <div data-testid="guest-scope"><div className="label mb-2">What they can see</div><div className="grid sm:grid-cols-3 gap-2">{GUEST_SCOPES.map(o => <button key={o.k} onClick={() => setScope(o.k)} data-testid={`guest-scope-${o.k}`} data-selected={scope === o.k} className={cn('rounded-xl p-3 text-left border', scope === o.k ? 'border-accent bg-accent/10' : 'hairline bg-surface-2')}><div className="text-sm font-semibold">{o.label}</div><div className="text-xs text-muted mt-0.5">{o.sub}</div></button>)}</div></div>
      <div className="flex items-center gap-3 flex-wrap"><Button variant="primary" icon={<Plus className="size-4" />} onClick={create} data-testid="guest-create">Create pass & copy link</Button><span className="text-xs text-muted">View-only: nothing a guest taps is saved. They can still leave suggestions and design notes.</span></div>
      {last && <div className="rounded-xl bg-surface-2 p-3 text-xs break-all" data-testid="guest-link">{last}</div>}
    </Card>
    {list.some(p => p.revoked && p.e > now) && <div className="flex items-center gap-2 text-xs text-muted" data-testid="guest-revoke-list"><span className="flex-1">Revoked passes stop in this browser now. To stop them on the guest’s device too, publish the revoke list.</span><Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => copy(list.filter(p => p.revoked && p.e > now).map(p => p.i).join(' '))}>Copy revoke list</Button></div>}
    <Card pad={false} className="divide-y hairline" data-testid="guest-list">
      {list.length ? list.map(p => { const st = p.revoked ? 'Revoked' : p.e <= now ? 'Expired' : 'Active'; const left = p.e - now
        return <div key={p.i} className="p-3.5 flex items-center gap-3 flex-wrap text-sm" data-testid="guest-row" data-status={st}>
          <Link2 className="size-4 text-muted" /><div className="flex-1 min-w-48"><b>{p.n}</b>{p.o && <span className="text-muted"> · {p.o}</span>}<div className="text-xs text-muted">{GUEST_SCOPES.find(o => o.k === (p.s ?? 'show'))?.label} · Made by {p.by} {new Date(p.c).toLocaleString()} · {st === 'Active' ? `ends in ${left >= 864e5 ? Math.round(left / 864e5) + ' d' : Math.floor(left / 36e5) + ' h ' + Math.round(left % 36e5 / 6e4) + ' m'}` : `ended ${new Date(p.e).toLocaleString()}`}</div></div>
          <Badge tone={st === 'Active' ? 'ok' : st === 'Revoked' ? 'bad' : 'neutral'}>{st}</Badge>
          {st === 'Active' && <><Button size="sm" icon={<Copy className="size-3.5" />} onClick={() => copy(p.url)} data-testid="guest-copy">Copy link</Button><Button size="sm" icon={<Ban className="size-3.5" />} onClick={() => revoke(p.i)} data-testid="guest-revoke">Revoke</Button></>}
        </div> }) : <div className="p-4 text-sm text-muted">No guest passes yet.</div>}
    </Card>
    <div className="text-xs text-muted leading-relaxed" data-testid="guest-how">How it works: a guest link opens a <b>separate guest-only copy</b> of the app with its own key — not this app, and never this site’s password. It has no staff sign-in, no role picker and no pay, phones or addresses; Demo and Operations passes can’t open any money figures at all. The pass’s expiry and scope are signed with a key that only this owner app holds (unlocked by your PIN), so a guest can’t stretch or upgrade it. <b>Limits:</b> it’s still a static site — revoking here stops the link in this browser right away; to cut it off on the guest’s own device, the revocation list has to be published with the site (ask for “publish guest revocations”). A technical guest with an “Everything” pass can keep the demo figures they were shown.</div>
  </div>
}
