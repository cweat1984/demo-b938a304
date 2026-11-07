import { appName } from '../data/brand'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Fingerprint, Laptop, Smartphone, LogOut, Trash2, Timer, Eye, EyeOff, Lock, Check, Search, WifiOff, Download, ShieldCheck } from 'lucide-react'
import { useStore } from '../data/store'
import { ROLES, PAGES } from '../data/roles'
import { Card, Button, Badge, Segmented, confirmChoice, Toggle } from '../components/ui'
import { passkeys, removePasskey, registerPasskey, platformAvailable, useSec, sec, CAN_REVEAL, sensitiveFor, deviceLabel } from './security'
import { useQueue, setSimulatedOffline } from './offline'
import { fullName } from '../data/logic'
import { cn, timeAgo } from '../lib/util'
import { auditVisible } from '../lib/auditScope'

export default function SecurityCenter() {
  return (
    <div className="grid lg:grid-cols-2 gap-5" data-testid="security-center">
      <div data-testid="signin-methods"><SignInMethods /></div><Devices /><SessionCard /><div data-testid="offline-card"><OfflineCard /></div>
      <SensitiveGate />
      <div className="lg:col-span-2"><Matrix /></div>
      <div className="lg:col-span-2"><AuditViewer /></div>
    </div>
  )
}

function SignInMethods() {
  const session = useStore(s => s.session)!
  const [list, setList] = useState(passkeys()); const [avail, setAvail] = useState<boolean | null>(null)
  useEffect(() => { platformAvailable().then(setAvail) }, [])
  return <Card><div className="flex items-center gap-2 font-semibold mb-1"><Fingerprint className="size-4" />Sign-in methods</div><div className="text-sm text-muted mb-3">Signed in via <b className="text-ink">{session.method}</b>{session.mfa ? ' · MFA verified' : ''}.</div>
    {list.map(p => <div key={p.credId} className="card-flat p-3 flex items-center gap-3 mb-2 text-sm" data-testid="passkey-row"><Fingerprint className="size-5 text-ok" /><div className="flex-1 min-w-0"><div className="font-semibold">{p.label} · {p.name}</div><div className="text-xs text-muted truncate">Passkey · created {timeAgo(p.created)} · id {p.credId.slice(0, 10)}…</div></div><Button size="sm" variant="ghost" onClick={() => { removePasskey(p.credId); setList(passkeys()); sec.log('Removed passkey', 'Security', p.label) }}>Remove</Button></div>)}
    {!list.length && <div className="text-sm text-muted mb-2">No passkey on this device yet.</div>}
    <Button size="sm" disabled={avail === false} onClick={async () => { try { await registerPasskey(session.role, session.name); setList(passkeys()); sec.log('Added passkey', 'Security', deviceLabel()); toast.success('Passkey added') } catch { toast.error('Passkey not created') } }} data-testid="add-passkey">{avail === false ? 'No platform authenticator here' : `Add fingerprint / Face ID for ${session.name.split(' ')[0]}`}</Button>
    <div className="text-[11px] text-muted mt-2">Two-step verification is required for office roles · passkeys count as two factors.</div></Card>
}

function Devices() {
  const devices = useSec(s => s.devices)
  return <Card><div className="flex items-center gap-2 font-semibold mb-3"><Laptop className="size-4" />Devices signed in</div>
    <div className="flex flex-col gap-2" data-testid="devices">{devices.map(d => <div key={d.id} className="card-flat p-3 flex items-center gap-3 text-sm" data-testid="device-row">{/iPhone|Galaxy|Android/.test(d.label) ? <Smartphone className="size-5 text-muted" /> : <Laptop className="size-5 text-muted" />}<div className="flex-1 min-w-0"><div className="font-semibold truncate">{d.label}</div><div className="text-xs text-muted">{d.where} · {d.current ? 'this device · active now' : `last active ${timeAgo(d.last)}`}</div></div>{d.current ? <Badge tone="ok">This device</Badge> : <Button size="sm" variant="outline" icon={<LogOut className="size-3.5" />} data-testid="remote-signout" onClick={() => { sec.remoteSignOut(d.id); toast.success(`Signed out ${d.label}`, { description: 'Its session and offline data are revoked (demo).' }) }}>Sign out</Button>}</div>)}</div></Card>
}

function SessionCard() {
  const min = useSec(s => s.timeoutMin)
  return <Card><div className="flex items-center gap-2 font-semibold mb-1"><Timer className="size-4" />Session timeout</div><div className="text-sm text-muted mb-3">Sign out automatically after no activity. A warning shows one minute before.</div>
    <Segmented value={String(min)} onChange={v => { sec.setTimeout(+v); toast.success(`Idle sign-out: ${+v >= 60 ? `${+v / 60} h` : `${v} min`}`) }} options={[15, 30, 60, 240, 480].map(m => ({ value: String(m), label: m >= 60 ? `${m / 60} h` : `${m} m` }))} />
    <div className="border-t hairline mt-5 pt-4"><div className="flex items-center gap-2 font-semibold mb-1 text-bad"><Trash2 className="size-4" />Wipe app data on this device</div><div className="text-sm text-muted mb-3">Removes every saved record, photo, queued action, passkey and offline copy from this browser, then signs out.</div>
      <Button variant="danger" data-testid="wipe" onClick={async () => { const r = await confirmChoice('Wipe this device?', 'Everything stored by the app on this device is deleted. Data already synced is safe on the server.', [{ label: 'Cancel', value: false }, { label: 'Wipe and sign out', value: true, tone: 'danger' as const }]); if (r?.value) sec.wipe() }}>Wipe this device</Button></div></Card>
}

function OfflineCard() {
  const { simulated, items, lastSync } = useQueue()
  const [prompt, setPrompt] = useState<(Event & { prompt?: () => void }) | null>(null)
  useEffect(() => { const h = (e: Event) => { e.preventDefault(); setPrompt(e) }; window.addEventListener('beforeinstallprompt', h); return () => window.removeEventListener('beforeinstallprompt', h) }, [])
  return <Card><div className="flex items-center gap-2 font-semibold mb-1"><WifiOff className="size-4" />Offline field mode</div><div className="text-sm text-muted mb-3">Jobs, tickets, forms, SDS and certs stay on the phone. Changes made without signal are queued and sent automatically.</div>
    <Toggle checked={simulated} onChange={v => { setSimulatedOffline(v); toast(v ? 'Offline (simulated) — try a check-in or a ticket' : 'Reconnected') }} label={<span data-testid="sim-offline">Simulate no signal</span>} />
    <div className="mt-3 text-sm"><b className="num">{items.filter(i => i.state === 'queued').length}</b> queued{lastSync && <span className="text-muted"> · last sync {timeAgo(lastSync)}</span>}</div>
    <div className="mt-2 flex flex-col gap-1 max-h-28 overflow-y-auto">{items.map(i => <div key={i.id} className="text-xs flex gap-2"><Badge tone={i.state === 'sent' ? 'ok' : 'warn'}>{i.kind}</Badge><span className="truncate text-muted">{i.label}</span></div>)}</div>
    <div className="border-t hairline mt-4 pt-3 text-sm"><div className="font-semibold mb-1 flex items-center gap-2"><Download className="size-4" />Install as an app</div>{prompt ? <Button size="sm" onClick={() => prompt.prompt?.()}>Install {appName()}</Button> : <div className="text-muted text-xs">iPhone: Share → Add to Home Screen. Android / Chrome: menu → Install app. It opens full-screen with the Arrowline icon and works without signal.</div>}</div></Card>
}

export function Masked({ empId, field, name }: { empId: string; field: 'ssn' | 'account' | 'routing'; name: string }) {
  const role = useStore(s => s.session?.role)
  const [show, setShow] = useState(false)
  const v = sensitiveFor(empId)[field]
  useEffect(() => { if (!show) return; const t = setTimeout(() => setShow(false), 10000); return () => clearTimeout(t) }, [show])
  const label = field === 'ssn' ? 'SSN' : field === 'account' ? 'Bank account' : 'Routing'
  const tap = () => {
    if (show) { setShow(false); return }
    if (!role || !CAN_REVEAL.includes(role)) { sec.log('Denied sensitive reveal', name, `${label} — role ${role}`); toast.error(`Not permitted — ${label} is limited to HR, Payroll and Owners`, { description: 'The attempt was logged.' }); return }
    sec.log('Revealed sensitive field', name, `${label} (auto-hides in 10 s)`); setShow(true)
  }
  return <button onClick={tap} data-testid={`mask-${field}`} className="inline-flex items-center gap-1.5 font-mono text-[13px] rounded-lg px-2 py-1 bg-surface-2 hover:bg-surface-3">{show ? v : `•••${field === 'ssn' ? '-••-' : '••••'}${v.slice(-4)}`}{show ? <EyeOff className="size-3.5 text-muted" /> : <Eye className="size-3.5 text-muted" />}</button>
}

/** Employee PII (SSN / bank last 4) is HR / Payroll / Owner business only. */
function SensitiveGate() { const role = useStore(s => s.session?.role); return role === 'owner' || role === 'hr' || role === 'payroll' ? <div className="lg:col-span-2"><Sensitive /></div> : null }
function Sensitive() {
  const db = useStore(s => s.db); const role = useStore(s => s.session?.role)
  const emps = db.employees.filter(e => e.status === 'Active').slice(0, 6)
  return <Card pad={false} className="overflow-hidden"><div className="p-5 pb-3"><div className="flex items-center gap-2 font-semibold"><Lock className="size-4" />Sensitive fields</div><div className="text-sm text-muted">Masked everywhere by default. Tap to reveal — only HR, Payroll and Owners, and every reveal is logged. {role && CAN_REVEAL.includes(role) ? <Badge tone="ok">You can reveal</Badge> : <Badge tone="warn">Your role can’t reveal</Badge>}</div></div>
    <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="sensitive-table"><thead><tr className="label text-left"><th className="px-5 py-2">Employee</th><th className="px-5 py-2">SSN</th><th className="px-5 py-2">Bank</th><th className="px-5 py-2">Routing</th><th className="px-5 py-2">Account</th></tr></thead><tbody>{emps.map(e => <tr key={e.id} className="border-t hairline"><td className="px-5 py-2 font-semibold">{fullName(e)}</td><td className="px-5 py-2"><Masked empId={e.id} field="ssn" name={fullName(e)} /></td><td className="px-5 py-2 text-muted">{sensitiveFor(e.id).bank}</td><td className="px-5 py-2"><Masked empId={e.id} field="routing" name={fullName(e)} /></td><td className="px-5 py-2"><Masked empId={e.id} field="account" name={fullName(e)} /></td></tr>)}</tbody></table></div></Card>
}

function Matrix() {
  const groups = ['Run', 'Assets', 'People', 'Money', 'System'] as const
  return <Card pad={false} className="overflow-hidden"><div className="p-5 pb-3"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4" />Role-based access</div><div className="text-sm text-muted">Who can open what. Data inside each screen is further limited by division and branch.</div></div>
    <div className="overflow-auto max-h-[520px]"><table className="text-xs" data-testid="access-matrix"><thead className="sticky top-0 bg-surface z-10"><tr><th className="text-left px-4 py-2 sticky left-0 bg-surface">Screen</th>{ROLES.map(r => <th key={r.key} className="px-2 py-2 font-semibold whitespace-nowrap [writing-mode:vertical-rl] rotate-180 h-28 text-left">{r.label}</th>)}</tr></thead>
      <tbody>{groups.flatMap(g => [<tr key={g}><td colSpan={ROLES.length + 1} className="px-4 pt-3 pb-1 label">{g}</td></tr>, ...PAGES.filter(p => p.group === g).map(p => <tr key={p.key} className="border-t hairline"><td className="px-4 py-1.5 whitespace-nowrap sticky left-0 bg-surface">{p.label}</td>{ROLES.map(r => <td key={r.key} className="text-center px-2">{r.pages.includes(p.key) ? <Check className="size-3.5 text-ok inline" /> : <span className="text-faint">·</span>}</td>)}</tr>)])}</tbody></table></div></Card>
}

function AuditViewer() {
  const all = useStore(s => s.db.audit); const me = useStore(s => s.session?.role)
  const audit = useMemo(() => all.filter(a => auditVisible(a, me)), [all, me])
  const [q, setQ] = useState(''); const [role, setRole] = useState('all'); const [kind, setKind] = useState<'all' | 'security'>('all')
  const rows = useMemo(() => audit.filter(a => (role === 'all' || a.role === role) && (kind === 'all' || /reveal|passkey|sign|wipe|timeout|override|device/i.test(a.action)) && (!q || `${a.actor} ${a.action} ${a.entity} ${a.detail}`.toLowerCase().includes(q.toLowerCase()))).slice(0, 80), [audit, q, role, kind])
  return <Card pad={false} className="overflow-hidden"><div className="p-5 pb-3 flex flex-wrap items-center gap-3"><div className="font-semibold flex-1">Audit log</div>
    <div className="relative"><Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-faint" /><input className="input !pl-9 !py-2 !w-56" placeholder="Search actor, action, record" value={q} onChange={e => setQ(e.target.value)} data-testid="audit-search" /></div>
    <select className="input !w-auto !py-2" value={role} onChange={e => setRole(e.target.value)} data-testid="audit-role"><option value="all">All roles</option>{ROLES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
    <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'all', label: 'Everything' }, { value: 'security', label: 'Security events' }]} /></div>
    <div className="max-h-[420px] overflow-y-auto" data-testid="audit-rows">{rows.map(a => <div key={a.id} className={cn('px-5 py-2 border-t hairline text-sm flex gap-3', /reveal|denied/i.test(a.action) && 'bg-warn/5')} data-testid="audit-row"><span className="text-xs text-muted w-24 shrink-0">{timeAgo(a.at)}</span><span className="font-semibold w-36 shrink-0 truncate">{a.actor}</span><span className="flex-1 min-w-0 truncate"><b>{a.action}</b> · {a.entity} <span className="text-muted">{a.detail}</span></span></div>)}{!rows.length && <div className="p-6 text-center text-sm text-muted">No events match.</div>}</div></Card>
}
