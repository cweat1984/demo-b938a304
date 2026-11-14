import { downscaleImage } from '../lib/image'
import { useState } from 'react'
import { useKeep } from '../lib/keep'
import { toast } from 'sonner'
import { ArrowUp, ArrowDown, Eye, EyeOff, Lock, RotateCcw, Plus, Trash2, ShieldCheck, LogOut } from 'lucide-react'
import type * as T from '../data/types'
import { useStore, actions } from '../data/store'
import { roleDef, PAGES, LOCKED_PAGES, type PageKey } from '../data/roles'
import { localRepository } from '../data/repo'
import { fmtTs, uid, cn } from '../lib/util'
import { PageHeader, Segmented, Card, Button, Field, Badge, confirmChoice, DemoTag } from '../components/ui'
import ThemePicker from '../components/ThemePicker'
import { Toggle } from '../components/ui'
import { useFeedback, fb } from '../data/feedback'
import { exportAllNotes } from '../feedback/FeedbackDock'
import { useCompany, useAppName, VENDOR_BRAND } from '../data/brand'
import { PoweredBy } from '../components/PoweredBy'
import { Logo } from '../shell/Splash'
import SecurityCenter from '../batch5/SecurityCenter'
import { startTour } from '../batch6/tour'
import { usePresent } from '../lib/present'
import { BriefingVoiceCard } from '../components/BriefVoice'

export default function Settings() {
  const session = useStore(s => s.session)!
  const admin = ['owner', 'dispatch', 'hr'].includes(session.role)
  const [tab, setTab] = useKeep<'look' | 'nav' | 'contacts' | 'org' | 'account' | 'security'>('settings:tab', 'look')
  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader eyebrow="Settings" title="Make it yours" sub="Personalization is visual only — mandatory safety and dispatch alerts always show." actions={session.role === 'owner' ? <Button variant="primary" onClick={startTour} data-testid="settings-tour">Show me — owner tour</Button> : undefined} />
      <Segmented className="mb-6" value={tab} onChange={setTab} options={[{ value: 'look', label: 'Appearance' }, { value: 'nav', label: 'Navigation' }, ...(admin ? [{ value: 'contacts' as const, label: 'Company phone numbers' }, { value: 'org' as const, label: 'Company & branches' }] : []), { value: 'security', label: 'Security center' }, { value: 'account', label: 'Account & demo' }]} />
      {tab === 'look' && <Look />}
      {tab === 'nav' && <Nav />}
      {tab === 'contacts' && admin && <ContactsEdit />}
      {tab === 'org' && admin && <Org />}
      {tab === 'account' && <Account />}
      {tab === 'security' && <SecurityCenter />}
    </div>
  )
}

function DesignModeCard() {
  const on = useFeedback(s => s.designMode)
  return <Card><div className="flex flex-wrap items-center gap-4"><div className="flex-1 min-w-[220px]"><div className="font-semibold mb-1">Design mode</div><div className="text-sm text-muted">Shows the notepad tab on every page — Love it / Hate it / Ideas, autosaved per page, with Export all notes.</div></div><Toggle checked={on} onChange={v => { fb.setDesignMode(v); toast(v ? 'Design mode on — notepad tab on every page' : 'Design mode off') }} label={<span data-testid="design-mode">{on ? 'On' : 'Off'}</span>} /><Button variant="secondary" onClick={exportAllNotes} data-testid="settings-export-notes">Export all notes</Button></div></Card>
}

function PresentCard() {
  const on = usePresent(s => s.on)
  return <Card><div className="flex flex-wrap items-center gap-4"><div className="flex-1 min-w-[220px]"><div className="font-semibold mb-1">Presentation mode</div><div className="text-sm text-muted">For projectors and screen-sharing — bigger text, stronger contrast, hides demo tags and the notepad. Shortcut: Shift + P.</div></div><Toggle checked={on} onChange={v => { usePresent.getState().set(v); toast(v ? 'Presentation mode on' : 'Presentation mode off') }} label={<span data-testid="present-toggle">{on ? 'On' : 'Off'}</span>} /></div></Card>
}

function Look() {
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  return (
    <div className="flex flex-col gap-6">
      <PresentCard />
      <Card><div className="font-semibold mb-1">Theme</div><div className="text-sm text-muted mb-4">Paint jobs from Southern Transport’s favorite rigs — plus the SLH crane gray.</div><ThemePicker /></Card>
      <Card className="grid md:grid-cols-2 gap-6">
        <div><div className="font-semibold mb-3">Text size</div><Segmented value={prefs.fontSize} onChange={v => setPrefs({ fontSize: v })} options={(['S', 'M', 'L', 'XL'] as const).map(v => ({ value: v, label: v }))} /></div>
        <div><div className="font-semibold mb-3">Font</div><Segmented value={prefs.font} onChange={v => setPrefs({ font: v })} options={(['Inter', 'Barlow', 'System'] as const).map(v => ({ value: v, label: v }))} /></div>
      </Card>
      <DesignModeCard />
      <BriefingVoiceCard />
    </div>
  )
}

function Nav() {
  const session = useStore(s => s.session)!
  const prefs = useStore(s => s.prefs)
  const setPrefs = useStore(s => s.setPrefs)
  const rd = roleDef(session.role)
  const order = [...(prefs.navOrder[session.role] ?? rd.pages).filter(k => rd.pages.includes(k)), ...rd.pages.filter(k => !(prefs.navOrder[session.role] ?? rd.pages).includes(k))]
  const hidden = new Set(prefs.hidden[session.role] ?? [])
  const move = (i: number, d: number) => { const n = [...order]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setPrefs({ navOrder: { ...prefs.navOrder, [session.role]: n } }) }
  const toggle = (k: PageKey) => { const h = new Set(hidden); h.has(k) ? h.delete(k) : h.add(k); setPrefs({ hidden: { ...prefs.hidden, [session.role]: [...h] } }) }
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="px-5 py-4 border-b hairline text-sm text-muted">Reorder or hide menu items for <b className="text-ink">{rd.label}</b>. Locked items stay visible because they carry mandatory alerts.</div>
      {order.map((k, i) => { const p = PAGES.find(x => x.key === k); if (!p) return null; const locked = LOCKED_PAGES.includes(k); return (
        <div key={k} className={cn('flex items-center gap-3 px-5 py-2.5 border-b hairline last:border-0', hidden.has(k) && 'opacity-50')}>
          <span className="flex-1 font-medium">{p.label}</span>
          {locked && <Badge><Lock className="size-3" />Required</Badge>}
          <button className="btn-icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Up"><ArrowUp className="size-4" /></button>
          <button className="btn-icon" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Down"><ArrowDown className="size-4" /></button>
          <button className="btn-icon" disabled={locked} onClick={() => toggle(k)} aria-label="Toggle">{hidden.has(k) ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button>
        </div>) })}
      <div className="px-5 py-3"><Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => setPrefs({ navOrder: { ...prefs.navOrder, [session.role]: undefined as never }, hidden: { ...prefs.hidden, [session.role]: [] } })}>Reset menu</Button></div>
    </Card>
  )
}

function ContactsEdit() {
  const contacts = useStore(s => s.db.contacts)
  const [rows, setRows] = useState<T.Contact[]>(contacts)
  const set = (i: number, p: Partial<T.Contact>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)))
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="px-5 py-4 border-b hairline text-sm text-muted flex items-center gap-2">These numbers power every Call button (field app, directory, job cards). <DemoTag /></div>
      {rows.map((c, i) => (
        <div key={c.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_170px_140px_auto] gap-2 px-5 py-3 border-b hairline items-center">
          <input className="input" value={c.label} onChange={e => set(i, { label: e.target.value })} aria-label="Label" />
          <input className="input" value={c.name} onChange={e => set(i, { name: e.target.value })} aria-label="Name" />
          <input className="input num" value={c.phone} onChange={e => set(i, { phone: e.target.value })} aria-label="Phone" />
          <select className="input" value={c.group} onChange={e => set(i, { group: e.target.value as T.Contact['group'] })}>{['Dispatch', 'Office', 'Shop', 'Safety', 'HR', 'Payroll', 'Sales', 'Emergency'].map(g => <option key={g}>{g}</option>)}</select>
          <div className="flex gap-1"><Button size="sm" variant="primary" onClick={() => { actions.updateContact(c); toast.success(`${c.label} saved`) }}>Save</Button><button className="btn-icon" aria-label="Remove" onClick={() => { actions.removeContact(c.id); setRows(rows.filter(r => r.id !== c.id)) }}><Trash2 className="size-4" /></button></div>
        </div>))}
      <div className="px-5 py-3"><Button size="sm" icon={<Plus className="size-4" />} onClick={() => setRows([...rows, { id: uid('ct'), label: 'New contact', name: '', phone: '(405) 555-0000', group: 'Office' }])}>Add contact</Button></div>
    </Card>
  )
}

function Org() {
  const db = useStore(s => s.db)
  const [dn, setDn] = useState(''), [ds, setDs] = useState(''), [dc, setDc] = useState('#38bdf8')
  const [bc, setBc] = useState(''), [bcity, setBcity] = useState(''), [bst, setBst] = useState('TX'), [bdiv, setBdiv] = useState<string[]>(['div-slh'])
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <CompanyCard />
      <Card><div className="font-semibold mb-3">Divisions</div>{db.divisions.map(d => <div key={d.id} className="flex items-center gap-3 py-2 border-b hairline last:border-0"><span className="size-3 rounded-full" style={{ background: d.color }} /><span className="flex-1 font-medium">{d.name}</span><span className="text-xs text-muted">{db.jobs.filter(j => j.divisionId === d.id).length} jobs · {db.employees.filter(e => e.divisionId === d.id).length} people</span></div>)}
        <div className="grid grid-cols-[1fr_90px_44px] gap-2 mt-4"><input className="input" placeholder="Division name" value={dn} onChange={e => setDn(e.target.value)} /><input className="input" placeholder="Short" value={ds} onChange={e => setDs(e.target.value)} /><input type="color" className="h-11 w-11 rounded-xl" value={dc} onChange={e => setDc(e.target.value)} /></div>
        <Button className="mt-2" size="sm" variant="primary" disabled={!dn} onClick={() => { actions.addDivision({ id: uid('div'), name: dn, short: ds || dn.slice(0, 8), color: dc, tagline: '' }); setDn(''); setDs(''); toast.success('Division added — available in every filter') }}>Add division</Button>
      </Card>
      <Card><div className="font-semibold mb-3">Branches</div>{db.branches.map(b => <div key={b.id} className="flex items-center gap-3 py-2 border-b hairline last:border-0"><span className="font-semibold w-20">{b.code}</span><span className="flex-1 text-sm">{b.city}, {b.state}{b.hq ? ' · HQ' : ''}</span><span className="text-xs text-muted">{b.divisionIds.map(id => db.divisions.find(d => d.id === id)?.short).join(', ')}</span></div>)}
        <div className="grid grid-cols-3 gap-2 mt-4"><input className="input" placeholder="Code (SLH-ABI)" value={bc} onChange={e => setBc(e.target.value)} /><input className="input" placeholder="City" value={bcity} onChange={e => setBcity(e.target.value)} /><input className="input" placeholder="State" value={bst} onChange={e => setBst(e.target.value)} /></div>
        <Field label="Divisions served" className="mt-2"><div className="flex flex-wrap gap-1.5">{db.divisions.map(d => <button key={d.id} onClick={() => setBdiv(bdiv.includes(d.id) ? bdiv.filter(x => x !== d.id) : [...bdiv, d.id])} className={cn('rounded-full px-3 py-1 text-xs font-semibold border', bdiv.includes(d.id) ? 'bg-accent text-accent-ink border-transparent' : 'border-line')}>{d.short}</button>)}</div></Field>
        <Button className="mt-3" size="sm" variant="primary" disabled={!bc.trim() || !bcity.trim() || !/^[A-Za-z]{2}$/.test(bst.trim())} data-testid="branch-add" onClick={() => {
          const code = bc.trim().toUpperCase(), city = bcity.trim(), st = bst.trim().toUpperCase()
          if (db.branches.some(b => b.code.toUpperCase() === code)) { toast.error(`Branch code ${code} is already used`); return }
          // place the pin at a known site in that city, else the state's center — never a fixed spot
          const site = db.sites.find(s => s.city.toLowerCase() === city.toLowerCase() && s.state.toUpperCase() === st)
          const C: Record<string, [number, number]> = { OK: [35.5, -97.5], TX: [31.2, -99.3], NM: [34.4, -106.1], LA: [31.0, -92.0], KS: [38.5, -98.4], AR: [34.9, -92.4], CO: [39.0, -105.5], WY: [43.0, -107.5], ND: [47.5, -100.5], MS: [32.7, -89.7], AL: [32.8, -86.8], NE: [41.5, -99.8] }
          const [lat, lng] = site ? [site.lat, site.lng] : C[st] ?? [db.branches.reduce((s, b) => s + b.lat, 0) / db.branches.length, db.branches.reduce((s, b) => s + b.lng, 0) / db.branches.length]
          actions.addBranch({ id: uid('br'), code, name: `${city}, ${st}`, city, state: st, lat, lng, divisionIds: bdiv }); setBc(''); setBcity(''); toast.success('Branch added', { description: site ? `Pinned at ${site.name}` : `Map pin placed at the center of ${st} (no site on file in ${city})` })
        }}>Add branch</Button>
      </Card>
    </div>
  )
}

function Account() {
  const appNm = useAppName()
  const session = useStore(s => s.session)!
  const resetDemo = useStore(s => s.resetDemo)
  const signOut = useStore(s => s.signOut)
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card><div className="font-semibold mb-3 flex items-center gap-2"><ShieldCheck className="size-4" />Signed in</div>
        <div className="text-sm flex flex-col gap-1.5"><div><span className="text-muted">User:</span> {session.name}</div><div><span className="text-muted">Role:</span> {roleDef(session.role).label}</div><div><span className="text-muted">Method:</span> {session.method}</div><div><span className="text-muted">MFA:</span> {session.mfa ? 'Verified (number match)' : 'Not used — demo role'}</div><div><span className="text-muted">Since:</span> {fmtTs(session.signedInAt)}</div></div>
        <Button className="mt-4" icon={<LogOut className="size-4" />} onClick={signOut}>Sign out / switch role</Button>
      </Card>
      {(session.role === 'owner' || session.role === 'hr' || session.role === 'payroll') && <Card><div className="font-semibold mb-1">Demo data</div><div className="text-sm text-muted mb-4">Stored on this device ({localRepository.name}). Reset puts every job, crew, ticket and bill back to the starting demo.</div>
        <Button variant="danger" icon={<RotateCcw className="size-4" />} onClick={async () => { const r = await confirmChoice('Reset all demo data?', 'Everything you changed in this browser goes back to the original demo data.', [{ label: 'Reset demo', value: 1, tone: 'danger' }]); if (r) { await resetDemo(); toast.success('Demo reset — reloading'); setTimeout(() => location.reload(), 900) } }} data-testid="reset-demo">Reset demo</Button>
      </Card>}
      <div className="md:col-span-2" data-testid="about-vendor"><Card><div className="font-semibold mb-1">About</div>
        <div className="text-sm text-muted mb-3">{appNm} for {useCompany().name}. {VENDOR_BRAND.about}</div>
        <PoweredBy size={16} />
      </Card></div>
    </div>
  )
}

function CompanyCard() {
  const appNm = useAppName()
  const c = useCompany()
  const [f, setF] = useState({ name: c.name, shortName: c.shortName, assistantName: c.assistantName, phone: c.phone })
  const dirty = f.name !== c.name || f.shortName !== c.shortName || f.assistantName !== c.assistantName || f.phone !== c.phone
  const onLogo = (file?: File) => {
    if (!file) return
    void downscaleImage(file, 512).then(logo => { actions.updateCompany({ logo }); toast.success('Logo updated', { description: 'Resized on this device to fit.' }) }, () => toast.error('That file isn’t an image we can read — try a PNG, JPG or SVG'))
  }
  return (
    <div className="md:col-span-2" data-testid="company-profile"><Card>
      <div className="flex items-center gap-4 mb-4">
        <Logo size={52} />
        <div className="flex-1 min-w-0"><div className="font-semibold">Company profile</div><div className="text-sm text-muted">Shown on the sidebar, login, tickets, quotes and the customer status page. Product: {appNm} · tenant <span className="font-mono text-xs">{c.id}</span></div></div>
        <label className="btn inline-flex items-center h-10 px-4 rounded-xl bg-surface-2 font-semibold text-sm cursor-pointer">Upload logo<input type="file" accept="image/*" className="hidden" data-testid="logo-upload" onChange={e => onLogo(e.target.files?.[0])} /></label>
        {c.logo && <Button variant="ghost" onClick={() => actions.updateCompany({ logo: undefined })}>Reset</Button>}
        {useStore.getState().session?.role === 'owner' && <Button onClick={() => useStore.getState().go('branding')} data-testid="open-branding">Company branding & colors</Button>}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Company name"><input className="input" data-testid="company-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Short name"><input className="input" data-testid="company-short" value={f.shortName} onChange={e => setF({ ...f, shortName: e.target.value })} /></Field>
        <Field label="Assistant name" hint={`“Ask ${f.assistantName || '…'}”`}><input className="input" data-testid="company-assistant" value={f.assistantName} onChange={e => setF({ ...f, assistantName: e.target.value })} /></Field>
        <Field label="Primary contact phone"><input className="input" data-testid="company-phone" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-4">
        <Toggle checked={c.modules.craneRigging} onChange={v => { actions.updateCompany({ modules: { craneRigging: v } }); toast.success(v ? 'Crane & rigging module on' : 'Crane & rigging module off — Crane configs, Lift planning and Wind farms hidden') }} label={<span data-testid="module-crane"><b>Crane &amp; rigging</b> module <span className="text-muted">(configs, lift planning, wind farms)</span></span>} />
        <Toggle checked={!!c.modules.fieldCalloff} onChange={v => { actions.updateCompany({ modules: { ...c.modules, fieldCalloff: v } }); toast.success(v ? 'Field call-off on' : 'Field call-off off') }} label={<span data-testid="module-calloff"><b>Field call-off</b> of support equipment <span className="text-muted">(off by default — crews can ask dispatch to release a manlift, light tower…)</span></span>} />
        <div className="flex-1" />
        <Button variant="primary" disabled={!dirty || !f.name.trim() || !f.shortName.trim()} onClick={() => { actions.updateCompany({ name: f.name.trim(), shortName: f.shortName.trim(), assistantName: f.assistantName.trim() || f.shortName.trim(), phone: f.phone.trim() }); toast.success('Company profile saved') }}>Save profile</Button>
      </div>
    </Card></div>
  )
}
