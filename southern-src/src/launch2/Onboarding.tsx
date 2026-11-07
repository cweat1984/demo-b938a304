import { DIVISIONS, BRANCHES } from '../data/seed'
import { useEffect, useState } from 'react'
import { UserPlus, Mail, ExternalLink, Check, Shirt } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Toggle, Badge, Modal, Field, Progress, confirmChoice } from '../components/ui'
import { useStore, actions } from '../data/store'
import { fullName } from '../data/logic'
import type * as T from '../data/types'
import { useCompany } from '../data/brand'
import { cn, addDays, today } from '../lib/util'
import { useDa } from '../gapA/drug'
import { audit } from '../gapA/util'
import { useL2, HIRE_STAGES, stageOf, pctOf, gearReady, workEmail, type NewHire } from './l2store'

const inp = 'h-10 w-full rounded-xl bg-surface-2 px-3 text-sm outline-none'
export const welcomeLink = (h: NewHire) => `${location.origin}${location.pathname}?welcome=${h.id}`

// ---- One onboarding list: this tracker (welcome flow, gear, trainings) is linked 1:1 to the HR record in db.hires.
// Hires made here get an employee # in the real system; hires made in People → New hire show up here; "Activate" puts them on the roster.
const CORE_TO_L2: Record<string, string> = { account: 'welcome', profile: 'personal', id: 'ids', emergency: 'emergency', training: 'training', sizes: 'gear' }
export const craftOf = (pos: string): T.Craft => /operat/i.test(pos) ? 'Operator' : /rigg/i.test(pos) ? 'Rigger' : /oiler/i.test(pos) ? 'Oiler' : /cdl|driver|truck/i.test(pos) ? 'Truck Driver' : /super|foreman/i.test(pos) ? 'Supervisor' : /uptower|tower|wind/i.test(pos) ? 'Uptower Tech' : /millwright/i.test(pos) ? 'Millwright' : /mech/i.test(pos) ? 'Mechanic' : 'Rigger'
let syncing = false
export function syncHires() {
  const db = useStore.getState().db
  if (syncing || !db?.hires) return
  syncing = true
  try {
    const L = () => useL2.getState(), linked = (id: string) => L().hires.some(h => h.coreId === id)
    // relink by name (e.g. after the demo data refreshed and ids changed)
    for (const h of L().hires) if (h.hired && !h.activated && (!h.coreId || !db.hires.some(c => c.id === h.coreId))) { const m = db.hires.find(c => c.first === h.first && c.last === h.last && !linked(c.id)); if (m) L().patchHire(h.id, { coreId: m.id }) }
    // HR record without a tracker row → add one
    for (const c of db.hires) if (!linked(c.id)) {
      const steps: Record<string, boolean> = {}; Object.entries(c.steps).forEach(([k, v]) => { if (v && CORE_TO_L2[k]) steps[CORE_TO_L2[k]] = true })
      L().addHire({ first: c.first, last: c.last, personalEmail: '', phone: c.phone, division: db.divisions.find(d => d.id === (c.divisionId ?? 'div-slh'))?.name ?? 'SLH Cranes', branch: db.branches.find(b => b.id === (c.branchId ?? 'br-okc'))?.city ?? 'Oklahoma City', position: c.craft, start: c.start, supervisor: fullName(db.employees.find(e => e.id === c.supervisorId)) || '—', temp: false, coreId: c.id, rate: c.rate, steps, hired: true })
    }
    // tracker hire marked hired but no HR record → create it (employee #, work email) with branch/division/rate
    for (const h of L().hires) if (h.hired && !h.activated && (!h.coreId || !useStore.getState().db.hires.some(c => c.id === h.coreId))) {
      const b = db.branches.find(x => x.city === h.branch), d = db.divisions.find(x => x.name === h.division)
      const r = actions.createHire({ first: h.first.trim(), last: h.last.trim(), craft: craftOf(h.position), phone: h.phone, start: h.start, supervisorId: db.employees.find(e => fullName(e) === h.supervisor)?.id, branchId: b?.id, divisionId: d?.id, rate: h.rate })
      L().patchHire(h.id, { coreId: r.hire.id })
    }
  } finally { syncing = false }
}

export default function Onboarding({ embedded }: { embedded?: boolean } = {}) {
  const all = useL2(s => s.hires), { patchHire, addHire } = useL2.getState()
  const ready = useStore(s => s.ready), coreHires = useStore(s => s.db?.hires), role = useStore(s => s.session?.role)
  useEffect(() => { if (ready) syncHires() }, [ready, coreHires, all])
  const hires = all.filter(h => !h.activated)
  const [adding, setAdding] = useState(false)
  const [mail, setMail] = useState<NewHire | null>(null)
  const [f, setF] = useState({ first: '', last: '', personalEmail: '', phone: '', division: 'SLH Cranes', branch: 'Oklahoma City', position: 'Rigger', start: addDays(today(), 7), supervisor: 'Wade Parker', temp: false, rate: '30' })
  return <div className="flex flex-col gap-5" data-testid="onboarding">
    {embedded ? <div className="flex justify-between items-center"><div className="text-sm text-muted">One list for every new hire — activate when they're field-ready.</div><Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)} data-testid="hire-new">New hire</Button></div> : <PageHeader eyebrow="People" title="New hire onboarding" sub="Mark someone hired, send the welcome, and watch them get field-ready." actions={<Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setAdding(true)} data-testid="hire-new">New hire</Button>} />}
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">{HIRE_STAGES.map(st => <Card key={st} className="!p-3"><div className="text-[11px] text-muted">{st}</div><div className="text-2xl font-semibold">{hires.filter(h => h.hired && stageOf(h) === st).length}</div></Card>)}</div>
    <div className="flex flex-col gap-3">{hires.map(h => { const st = stageOf(h), gr = gearReady(h)
      return <Card key={h.id} className="flex flex-col md:flex-row md:items-center gap-4" >
        <div className="flex-1 min-w-0" data-testid="hire-row"><div className="font-semibold">{h.first} {h.last} <span className="text-muted font-normal text-sm">· {h.position} · {h.division} · {h.branch}</span></div>
          <div className="flex items-center gap-1 mt-2">{HIRE_STAGES.map((s, i) => <div key={s} title={s} className={cn('h-1.5 flex-1 rounded-full', i <= HIRE_STAGES.indexOf(st) && h.hired ? 'bg-accent' : 'bg-surface-3')} />)}</div>
          <div className="text-xs text-muted mt-1.5">{h.hired ? `${st} · ${pctOf(h)}% · starts ${h.start}` : 'Candidate — not marked hired'} · {coreHires?.find(c => c.id === h.coreId)?.email ?? workEmail(h)}{coreHires?.find(c => c.id === h.coreId) && <span data-testid="hire-empno"> · {coreHires.find(c => c.id === h.coreId)!.empNo}</span>}{h.rate ? ` · $${h.rate}/hr` : ''}</div></div>
        <div className="flex items-center gap-3 flex-wrap">
          <Badge tone={gr ? 'ok' : 'warn'}><Shirt className="size-3" />{gr ? 'Gear ready' : 'Gear sizes needed'}</Badge>
          <Toggle checked={h.hired} onChange={v => { patchHire(h.id, { hired: v }); if (v) toast.success(`${h.first} marked hired`, { description: `Employee ID created · ${workEmail(h)}` }) }} label="Hired" />
          <div className="flex rounded-lg bg-surface-2 p-0.5 text-xs" data-testid="temp-toggle">{(['Temp', 'Long-term'] as const).map(x => <button key={x} onClick={() => { patchHire(h.id, { temp: x === 'Temp' }); toast(x === 'Temp' ? 'Temp: required PPE only' : 'Long-term: full uniform, swag credits and benefits unlocked — store notified') }} className={cn('px-2.5 h-7 rounded-md', (x === 'Temp') === h.temp && 'bg-surface font-semibold shadow')}>{x}</button>)}</div>
          <Button size="sm" icon={<Mail className="size-3.5" />} onClick={() => setMail(h)} data-testid="welcome-preview">Welcome email</Button>
          <a href={welcomeLink(h)} target="_blank" className="h-8 px-3 rounded-lg text-[13px] bg-surface-2 inline-flex items-center gap-1.5" data-testid="open-welcome"><ExternalLink className="size-3.5" />Open as hire</a>
          {h.hired && h.coreId && role !== 'field' && <Button size="sm" variant={st === 'Field-ready' ? 'primary' : 'secondary'} data-testid="hire-activate" onClick={async () => {
            if (st !== 'Field-ready') { const r = await confirmChoice(`Activate ${h.first} before onboarding is done?`, `${h.first} is at ${st} (${pctOf(h)}%). Activating puts them on the roster and the dispatch board now — Dispatch still checks certs.`, [{ label: 'Activate now', value: true, tone: 'primary' }]); if (!r) return }
            // dive2: DOT gate — a CDL/driver hire needs a negative pre-employment drug test + full Clearinghouse query on file (§382.301, §382.701)
            let noDrive: string | undefined
            if (/cdl|driver/i.test(h.position)) { const da = useDa.getState(); const q = da.queries.some(x => x.empId === h.id && x.kind === 'Full (pre-employment)'), t = da.tests.some(x => x.empId === h.id && x.kind === 'Pre-employment' && x.result === 'Negative')
              if (!q || !t) { const missing = [!t && 'negative pre-employment drug test', !q && 'full Clearinghouse query'].filter(Boolean).join(' and ')
                const r = await confirmChoice(`${h.first} isn’t DOT-cleared to drive`, `Not on file: ${missing}. A CDL driver can’t do safety-sensitive work until the DER logs both. Override only for non-driving work, with a reason.`, [{ label: 'Override with a reason', value: true, tone: 'danger' }]); if (!r) return
                const why = (window.prompt(`Reason for activating ${h.first} without DOT clearance (logged):`) ?? '').trim(); if (why.length < 5) { toast.error('Not activated — a reason is required'); return }
                audit('DOT clearance override', `${h.first} ${h.last}`, `${missing} missing · ${why.slice(0, 120)}`); noDrive = why.slice(0, 120) } }
            const newId = actions.activateHire(h.coreId!, noDrive ? { noDrive } : undefined); if (newId) { useDa.getState().relink(h.id, newId); if (h.coreId) useDa.getState().relink(h.coreId, newId) } patchHire(h.id, { activated: true }); toast.success(`${h.first} is on the roster`, { description: noDrive ? 'Non-driving until DOT cleared — the DER logs the test + Clearinghouse query' : 'Now available to Dispatch' })
          }}>Activate</Button>}
        </div>
      </Card> })}</div>
    <Modal open={adding} onClose={() => setAdding(false)} title="New hire" sub="One screen. We create the employee ID and Microsoft 365 work email.">
      <div className="grid grid-cols-2 gap-3">
        {([['first', 'First name'], ['last', 'Last name'], ['personalEmail', 'Personal email'], ['phone', 'Phone'], ['position', 'Position'], ['start', 'Start date'], ['supervisor', 'Supervisor']] as const).map(([k, l]) => <Field key={k} label={l}><input data-testid={`nh-${k}`} type={k === 'start' ? 'date' : 'text'} className={inp} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} /></Field>)}
        <Field label="Branch"><select className={inp} data-testid="nh-branch" value={f.branch} onChange={e => setF({ ...f, branch: e.target.value })}>{BRANCHES.map(b => <option key={b.id}>{b.city}</option>)}</select></Field>
        <Field label="Division"><select className={inp} value={f.division} onChange={e => setF({ ...f, division: e.target.value })}>{DIVISIONS.map(d => <option key={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Pay rate ($/hr)"><input data-testid="nh-rate" inputMode="decimal" className={inp} value={f.rate} onChange={e => setF({ ...f, rate: e.target.value })} /></Field>
        <Field label="Employment"><Toggle checked={!f.temp} onChange={v => setF({ ...f, temp: !v })} label={f.temp ? 'Temp — PPE only' : 'Long-term — full uniform'} /></Field>
      </div>
      <div className="flex justify-end gap-2 mt-5"><Button onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" data-testid="nh-save" onClick={() => { if (!/[a-z]/i.test(f.first) || !/[a-z]/i.test(f.last) || !f.personalEmail.includes('@')) return toast.error('Name and personal email are required'); if (!(Number(f.rate) > 0)) return toast.error('Pay rate must be a positive $/hr'); const id = addHire({ ...f, first: f.first.trim(), last: f.last.trim(), rate: Number(f.rate) }); setAdding(false); setMail(useL2.getState().hires.find(h => h.id === id)!) }}>Mark hired & preview welcome</Button></div>
    </Modal>
    {mail && <WelcomeEmail h={mail} onClose={() => setMail(null)} />}
  </div>
}

function WelcomeEmail({ h, onClose }: { h: NewHire; onClose: () => void }) {
  const c = useCompany()
  return <Modal open onClose={onClose} title="Welcome email preview" sub={`To ${h.personalEmail} · personal inbox`} width={600}>
    <div className="rounded-2xl overflow-hidden border hairline bg-white text-[#111]" data-testid="welcome-email">
      <div className="bg-[#0b0f17] text-white p-5"><div className="text-xs text-white/50">From hr@slh-demo.example</div><div className="text-xl font-semibold mt-1">Welcome to {c.name}, {h.first}!</div></div>
      <div className="p-5 text-sm leading-relaxed flex flex-col gap-3">
        <p>We’re glad you’re here. You start <b>{new Date(h.start + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</b> as {/^[aeiou]/i.test(h.position) ? 'an' : 'a'} <b>{h.position}</b> with {h.division} in {h.branch}, reporting to {h.supervisor}.</p>
        <div className="rounded-xl bg-[#f4f4f5] p-4"><div className="text-xs text-[#666]">Your work email</div><div className="font-semibold">{workEmail(h)}</div><div className="text-xs text-[#666] mt-2">First login: use the one-time setup link below to choose your password and set up Microsoft Authenticator. We never email passwords.</div></div>
        <ol className="list-decimal pl-5 flex flex-col gap-1"><li>Tap <b>Set up my account</b> (link expires in 72 hours).</li><li>Open the {c.name} app and sign in with your work email.</li><li>Finish your day-one paperwork, badge photo and gear sizes — about 20 minutes.</li></ol>
        <div className="flex gap-2"><a href={welcomeLink(h)} target="_blank" className="h-11 px-5 rounded-xl bg-[#ef3b3b] text-white font-semibold grid place-items-center">Set up my account</a><div className="h-11 px-4 rounded-xl border grid place-items-center text-xs text-[#555]">App link: southern.app/get</div></div>
        <p className="text-xs text-[#888]">{h.temp ? 'Temp position — required PPE will be issued on day one.' : 'Long-term position — your full uniform package and store credit are waiting.'} {h.phone ? <> A text with the app link was also sent to {h.phone}.</> : ' Add a phone number to also text them the app link.'}</p>
      </div>
    </div>
    <div className="flex justify-end gap-2 mt-4"><Button onClick={onClose}>Close</Button><Button variant="primary" icon={<Check className="size-4" />} onClick={() => { toast.success('Welcome email + text queued (demo — nothing sent)'); onClose() }}>Send (demo)</Button></div>
  </Modal>
}
