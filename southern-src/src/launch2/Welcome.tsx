import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Play, ArrowRight, Check, Camera, Upload, ShieldCheck, Heart, PiggyBank, Plane, Sun, Award, PartyPopper, Flag as FlagIcon, ChevronLeft, FileSignature, Landmark, IdCard, Users, Shirt } from 'lucide-react'
import { toast } from 'sonner'
import { useCompany } from '../data/brand'
import { Logo } from '../shell/Splash'
import { PoweredBy } from '../components/PoweredBy'
import { cn } from '../lib/util'
import { useL2, GEAR, PPE_TEMP, workEmail, type NewHire } from './l2store'

const STORY = [
  { y: '1987', t: 'One truck, one crane', b: 'Started in an Oklahoma City yard with a 40-ton hydraulic and a handshake.' },
  { y: 'Today', t: 'Four divisions', b: 'SLH Cranes · Southern Transport · Southern Uptower · Southern Machine Moving.' },
  { y: 'Branches', t: 'Across the Southwest', b: 'Oklahoma City, Tulsa, Amarillo, Midland, Fort Worth and Kilgore.' },
  { y: 'Pride', t: 'Built by the crew', b: 'Zero-harm safety culture, record wind lifts, and people who stay for decades.' },
  { y: '🇺🇸', t: 'Flag & military', b: 'Veteran-owned roots. We hire veterans, fly the flag on every crane, and back Guard families.' },
]
const FLOW = ['personal', 'w4', 'deposit', 'i9', 'handbook', 'emergency', 'badge', 'ids', 'training', 'benefits', 'gear'] as const
const LABEL: Record<string, string> = { personal: 'About you', w4: 'W-4', deposit: 'Direct deposit', i9: 'I-9 documents', handbook: 'Handbook', emergency: 'Emergency contacts', badge: 'Badge photo', ids: 'ID photos', training: 'Prior training', benefits: 'Benefits', gear: 'Gear sizes' }
const PAYCHEX = ['w4', 'deposit', 'i9']

/** dive2 E M7: every field is kept (saved on the hire as you go) and checked before Continue. */
const Paper = createContext<{ v: Record<string, string>; set: (k: string, x: string) => void } | null>(null)
const In = ({ label, defaultValue, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) => { const c = useContext(Paper); const val = c?.v[label] ?? (defaultValue as string | undefined) ?? ''
  return <label className="block"><span className="text-xs text-white/50">{label}</span><input {...p} data-field={label} value={val} onChange={e => c?.set(label, e.target.value)} className="mt-1.5 w-full h-12 rounded-xl bg-white/5 border border-white/10 px-3.5 outline-none focus:border-white/30" /></label> }
const digits = (x?: string) => (x ?? '').replace(/\D/g, '')
function checkStep(k: string, v: Record<string, string>): string | null {
  if (k === 'personal') { if (!v['Legal name']?.trim()) return 'Enter your legal name.'; if ((v['Home address'] ?? '').trim().length < 6) return 'Enter your home address (street, city, state, ZIP).'; if (digits(v['Personal phone']).length !== 10) return 'Phone needs 10 digits.'; if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v['Personal email'] ?? '')) return 'That email doesn’t look right.' }
  if (k === 'deposit') { if (digits(v['Routing number']).length !== 9) return 'Routing number is 9 digits.'; const a = digits(v['Account number']); if (!(a.length >= 4 && a.length <= 17) && !v['Account last 4']) return 'Account number is 4–17 digits.' }
  if (k === 'handbook') { if ((v['Type your full name to sign'] ?? '').trim().split(/\s+/).length < 2) return 'Type your first and last name to sign.' }
  if (k === 'emergency') { if (!v['Contact 1 — name & relation']?.trim()) return 'Add at least one emergency contact.'; if (digits(v['Phone']).length !== 10) return 'Emergency contact phone needs 10 digits.' }
  return null
}
const readFile = (f: File) => new Promise<string>(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(f) })

export default function Welcome({ hireId }: { hireId: string }) {
  const company = useCompany()
  const hire = useL2(s => s.hires.find(h => h.id === hireId) ?? s.hires[0])
  const { step, patchHire } = useL2.getState()
  const [phase, setPhase] = useState<'intro' | 'story' | 'flow' | 'done'>('intro')
  const [i, setI] = useState(0)
  const [s, setS] = useState(0)
  const [vals, setVals] = useState<Record<string, string>>(() => ({ 'Legal name': hire ? `${hire.first} ${hire.last}` : '', 'Personal phone': hire?.phone ?? '', 'Personal email': hire?.personalEmail ?? '', ...(hire?.paper ?? {}) }))
  const [err, setErr] = useState<string | null>(null)
  if (!hire) return null
  const k = FLOW[i]
  const setVal = (key: string, x: string) => { setErr(null); setVals(v => ({ ...v, [key]: x })) }
  const next = () => {
    const why = checkStep(k, vals); if (why) { setErr(why); return }
    const keep = { ...vals }; const acct = digits(keep['Account number']); delete keep['Account number']; if (acct) keep['Account last 4'] = acct.slice(-4)
    patchHire(hire.id, { paper: keep }); setVals(keep); step(hire.id, k); setErr(null); if (i + 1 >= FLOW.length) { setPhase('done') } else setI(i + 1)
  }
  return (
    <div className="min-h-screen bg-[#05070b] text-white" data-testid="welcome">
      <AnimatePresence mode="wait">
        {phase === 'intro' && <motion.div key="intro" exit={{ opacity: 0 }} className="min-h-screen flex flex-col items-center justify-center px-6 text-center relative overflow-hidden">
          <motion.div initial={{ scale: 1.3, opacity: 0 }} animate={{ scale: 1, opacity: .35 }} transition={{ duration: 2.4 }} className="absolute inset-0" style={{ background: 'radial-gradient(60% 50% at 50% 40%, #ef3b3b55, transparent), radial-gradient(40% 40% at 70% 80%, #0f2d52, transparent)' }} />
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .4, duration: 1 }} className="relative"><Logo size={56} /></motion.div>
          <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 1 }} className="relative text-5xl md:text-6xl font-semibold tracking-tight mt-8">Welcome to the crew,<br />{hire.first}.</motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }} className="relative text-white/55 mt-4 max-w-md">{hire.position} · {hire.division} · {hire.branch}. Starts {new Date(hire.start + 'T12:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}.</motion.p>
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.2 }} data-testid="welcome-video" onClick={() => toast('Owner welcome video', { description: 'Placeholder — the owner’s 90-second video plays here.' })} className="relative mt-10 w-full max-w-md aspect-video rounded-3xl border border-white/10 bg-white/[.04] grid place-items-center group">
            <span className="size-16 rounded-full bg-white text-black grid place-items-center group-hover:scale-105 transition"><Play className="size-7 ml-1" /></span><span className="absolute bottom-3 left-4 text-xs text-white/60">A word from the owner · 1:32</span></motion.button>
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.6 }} data-testid="welcome-start" onClick={() => { step(hire.id, 'welcome'); setPhase('story') }} className="relative mt-8 h-14 px-8 rounded-2xl bg-white text-black font-semibold flex items-center gap-2">The Southern story <ArrowRight className="size-4" /></motion.button>
        </motion.div>}
        {phase === 'story' && <motion.div key="story" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="min-h-screen flex flex-col px-6 py-10 max-w-lg mx-auto">
          <div className="flex gap-1.5">{STORY.map((_, j) => <div key={j} className={cn('h-1 flex-1 rounded-full', j <= s ? 'bg-white' : 'bg-white/15')} />)}</div>
          <AnimatePresence mode="wait"><motion.div key={s} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="flex-1 flex flex-col justify-center">
            <div className="text-7xl font-semibold tracking-tight text-[#ef3b3b]">{STORY[s].y}</div>
            <div className="text-3xl font-semibold mt-4 flex items-center gap-3">{s === 4 && <FlagIcon className="size-7" />}{STORY[s].t}</div>
            <p className="text-white/60 text-lg mt-3">{STORY[s].b}</p>
          </motion.div></AnimatePresence>
          <button data-testid="story-next" onClick={() => s + 1 < STORY.length ? setS(s + 1) : setPhase('flow')} className="h-14 rounded-2xl bg-white text-black font-semibold">{s + 1 < STORY.length ? 'Next' : 'Start day-one paperwork'}</button>
        </motion.div>}
        {phase === 'flow' && <motion.div key="flow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen max-w-lg mx-auto px-5 py-6 flex flex-col">
          <div className="flex items-center gap-3"><button aria-label="Back" onClick={() => { setErr(null); i ? setI(i - 1) : setPhase('story') }} className="size-9 grid place-items-center rounded-xl bg-white/5"><ChevronLeft className="size-4" /></button><div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden"><motion.div className="h-full bg-[#ef3b3b]" animate={{ width: `${(i + 1) / FLOW.length * 100}%` }} /></div><span className="text-xs text-white/50">{i + 1}/{FLOW.length}</span></div>
          <div className="mt-6 flex items-center gap-2"><h2 className="text-3xl font-semibold tracking-tight">{LABEL[k]}</h2>{PAYCHEX.includes(k) && <span data-testid="paychex-badge" className="ml-auto rounded-full bg-[#0058a3]/30 text-[#7cc0ff] text-[11px] font-bold px-2.5 py-1">→ Paychex Flex</span>}</div>
          <div className="flex-1 mt-5"><Paper.Provider value={{ v: vals, set: setVal }}><Step k={k} hire={hire} patch={p => patchHire(hire.id, p)} /></Paper.Provider>{k === 'deposit' && vals['Account last 4'] && !vals['Account number'] && <div className="text-xs text-white/55 mt-2" data-testid="acct-saved">Account ending {vals['Account last 4']} saved.</div>}</div>
          {err && <div role="alert" data-testid="flow-error" className="mt-4 rounded-xl bg-red-500/15 text-red-200 text-sm p-3">{err}</div>}
          <button data-testid="flow-next" onClick={next} className="mt-6 h-14 rounded-2xl bg-white text-black font-semibold flex items-center justify-center gap-2">{i + 1 < FLOW.length ? 'Continue' : 'Finish'} <ArrowRight className="size-4" /></button>
          <div className="mt-6 flex justify-center"><PoweredBy tone="dark" /></div>
        </motion.div>}
        {phase === 'done' && <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen flex flex-col items-center justify-center text-center px-6 relative overflow-hidden" data-testid="welcome-done">
          {Array.from({ length: 40 }, (_, j) => <motion.span key={j} initial={{ y: -40, x: 0, opacity: 1 }} animate={{ y: 900, x: (j % 2 ? 1 : -1) * (j * 7 % 120), rotate: j * 40 }} transition={{ duration: 2.5 + (j % 5) * .4, delay: (j % 10) * .08 }} className="absolute top-0 size-2.5 rounded-sm" style={{ left: `${(j * 37) % 100}%`, background: ['#ef3b3b', '#fff', '#3b82f6', '#fbbf24'][j % 4] }} />)}
          <PartyPopper className="size-16 text-[#fbbf24]" />
          <h1 className="text-5xl font-semibold tracking-tight mt-6">You’re all set, {hire.first}.</h1>
          <p className="text-white/60 mt-3 max-w-md">Paperwork is done and sent to Paychex. Your badge prints tonight and your gear will be bagged with your name on it. See you {new Date(hire.start + 'T12:00').toLocaleDateString('en-US', { weekday: 'long' })} at the {hire.branch} yard, 6:30 AM.</p>
          <div className="mt-8"><Badge hire={hire} company={company.name} /></div>
        </motion.div>}
      </AnimatePresence>
    </div>
  )
}

function Badge({ hire, company }: { hire: NewHire; company: string }) {
  return <div data-testid="id-badge" className="w-56 rounded-2xl bg-white text-black overflow-hidden shadow-2xl text-left">
    <div className="bg-[#0b0f17] text-white px-4 py-3 flex items-center gap-2"><Logo size={20} /><span className="text-[11px] font-semibold truncate">{company}</span></div>
    <div className="p-4"><div className="aspect-square rounded-xl bg-[#e5e7eb] overflow-hidden grid place-items-center">{hire.badgePhoto ? <img src={hire.badgePhoto} className="w-full h-full object-cover" /> : <Users className="size-12 text-[#9ca3af]" />}</div>
      <div className="font-bold text-lg mt-3 leading-tight">{hire.first} {hire.last}</div><div className="text-xs text-[#555]">{hire.position}</div><div className="text-[10px] text-[#888] mt-2 flex justify-between"><span>{hire.division}</span><span>#{hire.id.toUpperCase()}</span></div>
      <div className="mt-2 h-1.5 rounded-full" style={{ background: hire.temp ? '#f59e0b' : '#ef3b3b' }} /></div>
  </div>
}

function Step({ k, hire, patch }: { k: string; hire: NewHire; patch: (p: Partial<NewHire>) => void }) {
  const company = useCompany()
  const box = (c: ReactNode) => <div className="flex flex-col gap-3">{c}</div>
  if (k === 'personal') return box(<><In label="Legal name" defaultValue={`${hire.first} ${hire.last}`} /><In label="Home address" placeholder="Street, city, state, ZIP" /><In label="Personal phone" defaultValue={hire.phone} /><In label="Personal email" defaultValue={hire.personalEmail} /><div className="text-xs text-white/45">Your work email: <b className="text-white/80">{workEmail(hire)}</b></div></>)
  if (k === 'w4') return box(<><div className="grid grid-cols-2 gap-2">{['Single', 'Married filing jointly', 'Head of household'].map((x, j) => <button key={x} className={cn('h-12 rounded-xl border text-sm', j === 0 ? 'border-white bg-white/10' : 'border-white/10')}>{x}</button>)}</div><In label="Dependents amount ($)" placeholder="0" inputMode="numeric" /><In label="Extra withholding per check ($)" placeholder="0" inputMode="numeric" /><div className="text-xs text-white/45 flex gap-1.5"><Landmark className="size-3.5" />Plus the Oklahoma OW-4 — prefilled from this form.</div></>)
  if (k === 'deposit') return box(<><In label="Routing number" placeholder="9 digits" inputMode="numeric" /><In label="Account number" placeholder="Encrypted as you type" type="password" /><div className="rounded-xl bg-white/5 p-3 text-xs text-white/55">🔒 Bank details are encrypted on entry. We’ll send two micro-deposits to verify — fraud protection.</div></>)
  if (k === 'i9') return box(<><div className="text-sm text-white/60">Section 1 now; HR completes Section 2 with your physical documents on day one.</div>{['US Passport (List A)', 'Driver’s license + Social Security card (B + C)'].map((x, j) => <button key={x} className={cn('h-14 rounded-xl border text-left px-4 text-sm', j === 1 ? 'border-white bg-white/10' : 'border-white/10')}>{x}</button>)}<In label="SSN" placeholder="•••-••-••••" type="password" /></>)
  if (k === 'handbook') return box(<><div className="rounded-2xl bg-white/5 p-4 h-44 overflow-auto text-sm text-white/65 leading-relaxed">Employee Handbook 2026 — Safety first: stop-work authority belongs to everyone. Drug & alcohol policy. Per diem policy. PTO accrual. Equal opportunity. Phone & vehicle use. Harassment reporting…</div><In label="Type your full name to sign" placeholder={`${hire.first} ${hire.last}`} /><div className="text-xs text-white/45 flex gap-1.5"><FileSignature className="size-3.5" />E-signature, timestamped and stored in your file.</div></>)
  if (k === 'emergency') return box(<><In label="Contact 1 — name & relation" placeholder="Jane Reed, spouse" /><In label="Phone" placeholder="(405) 555-…" /><In label="Contact 2 (optional)" placeholder="Name, relation, phone" /></>)
  if (k === 'badge') return <BadgeCam hire={hire} patch={patch} company={company.name} />
  if (k === 'ids') return box(<>{(['idFront', 'idBack'] as const).map(f => <label key={f} className="h-32 rounded-2xl border border-dashed border-white/20 grid place-items-center cursor-pointer overflow-hidden">{hire[f] ? <img src={hire[f]} className="w-full h-full object-cover" /> : <span className="text-sm text-white/55 flex items-center gap-2"><IdCard className="size-5" />{f === 'idFront' ? 'ID front' : 'ID back'} — tap to snap</span>}<input data-testid={`upload-${f}`} type="file" accept="image/*" capture="environment" className="hidden" onChange={async e => { const fl = e.target.files?.[0]; if (fl) { patch({ [f]: await readFile(fl) }); toast.success('Read: name and DOB match — please confirm') } }} /></label>)}</>)
  if (k === 'training') return box(<>{['OSHA 10', 'OSHA 30', 'NCCCO Mobile', 'NCCCO Rigger', 'H2S', 'CPR / First Aid', 'TWIC', 'GWO Basic Safety'].map(t => { const v = hire.trainings[t] ?? 'none'
    return <div key={t} className="h-14 rounded-xl border border-white/10 px-4 flex items-center gap-3"><span className="flex-1 text-sm">{t}</span>{v === 'none' ? <label className="text-xs text-white/60 flex items-center gap-1 cursor-pointer"><Upload className="size-3.5" />Upload card<input data-testid="upload-training" type="file" accept="image/*,application/pdf" className="hidden" onChange={() => { patch({ trainings: { ...hire.trainings, [t]: 'pending' } }); toast(`${t} sent to Safety for verification`) }} /></label> : <span className={cn('text-[11px] font-bold rounded-full px-2 py-0.5', v === 'verified' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300')}>{v === 'verified' ? '✓ Verified' : 'Pending — Cale Smith'}</span>}</div> })}</>)
  if (k === 'benefits') { // dive3: pick coverage (or waive); union hands get benefits through the hall's fringe instead
    const ch = hire.paper?.benefits, union = hire.paper?.union === 'yes', setB = (v: Record<string, string>) => patch({ paper: { ...(hire.paper ?? {}), ...v } })
    return <div className="flex flex-col gap-3"><label className="flex items-center gap-2 text-sm text-white/70"><input type="checkbox" checked={union} data-testid="ben-union" onChange={e => setB({ union: e.target.checked ? 'yes' : 'no' })} />I’m dispatched from a union hall</label>
      {union ? <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/70" data-testid="ben-union-note">Your health, pension and annuity come through your local’s fringe — we pay it to the hall on every hour you work. Per diem and the safety bonus still apply.</div> : <><div className="grid grid-cols-2 gap-3">{[[Heart, 'Health · dental · vision', 'Family plan $86 / check'], [PiggyBank, '401(k)', '100% match to 4%'], [Sun, 'PTO', '80 hrs year one'], [Plane, 'Per diem', 'Paid on travel days'], [Award, 'Safety bonus', 'Quarterly, crew-based'], [ShieldCheck, 'Life & disability', 'Company-paid']].map(([I, t, b], j) => { const Ico = I as typeof Heart; return <motion.div key={j} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: j * .07 }} className="rounded-2xl bg-white/[.05] border border-white/10 p-4"><Ico className="size-6 text-[#ef3b3b]" /><div className="font-semibold mt-3 text-sm">{t as string}</div><div className="text-xs text-white/55 mt-1">{b as string}</div></motion.div> })}<div className="col-span-2 text-xs text-white/45">{hire.temp ? 'Temp role: benefits unlock if you move to long-term.' : 'Enroll in Paychex benefits within 30 days.'}</div></div>
      <div className="text-xs text-white/50">Medical coverage</div><div className="grid grid-cols-2 gap-2" data-testid="ben-choice">{['Employee only', 'Employee + spouse', 'Family', 'Waive'].map(x => <button key={x} className={cn('h-12 rounded-xl border text-sm', ch === x ? 'border-white bg-white/10' : 'border-white/10')} onClick={() => setB({ benefits: x })}>{x}</button>)}</div>
      {!ch && <div className="text-xs text-white/45">Pick one — you have 30 days from your start date to change it.</div>}</>}</div>
  }
  if (k === 'gear') return box(<>{hire.temp && <div className="rounded-xl bg-amber-500/15 text-amber-200 text-xs p-3">Temp hire: required PPE only. Full uniform unlocks at long-term.</div>}{GEAR.map(g => { const ok = !hire.temp || PPE_TEMP.includes(g.k); return <div key={g.k} className={cn(!ok && 'opacity-35 pointer-events-none')}><div className="text-xs text-white/50 mb-1.5 flex items-center gap-1.5"><Shirt className="size-3.5" />{g.label}{!ok && ' · not eligible'}</div><div className="flex flex-wrap gap-1.5">{g.opts.map(o => <button key={o} data-testid={`size-${g.k}`} onClick={() => patch({ sizes: { ...hire.sizes, [g.k]: o } })} className={cn('h-9 px-3 rounded-lg border text-sm', hire.sizes[g.k] === o ? 'bg-white text-black border-white' : 'border-white/15')}>{o}</button>)}</div></div> })}</>)
  return null
}

function BadgeCam({ hire, patch, company }: { hire: NewHire; patch: (p: Partial<NewHire>) => void; company: string }) {
  const v = useRef<HTMLVideoElement>(null)
  const [live, setLive] = useState(false)
  useEffect(() => () => { (v.current?.srcObject as MediaStream | null)?.getTracks().forEach(t => t.stop()) }, [])
  const start = async () => { try { const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } }); if (v.current) { v.current.srcObject = st; await v.current.play(); setLive(true) } } catch { toast('Camera not available — upload a photo instead') } }
  const snap = () => { const c = document.createElement('canvas'); const el = v.current!; c.width = 480; c.height = 480; const s = Math.min(el.videoWidth, el.videoHeight); c.getContext('2d')!.drawImage(el, (el.videoWidth - s) / 2, (el.videoHeight - s) / 2, s, s, 0, 0, 480, 480); patch({ badgePhoto: c.toDataURL('image/jpeg', .85) }); (el.srcObject as MediaStream).getTracks().forEach(t => t.stop()); setLive(false); toast.success('Good light, plain background — looks great') }
  return <div className="flex flex-col items-center gap-4">
    <div className="relative size-56 rounded-3xl overflow-hidden bg-white/5 grid place-items-center">{live ? <video ref={v} muted playsInline className="w-full h-full object-cover -scale-x-100" /> : hire.badgePhoto ? <img src={hire.badgePhoto} className="w-full h-full object-cover" /> : <><video ref={v} muted playsInline className="hidden" /><Users className="size-14 text-white/25" /></>}<div className="absolute inset-6 rounded-[50%] border-2 border-dashed border-white/40 pointer-events-none" /></div>
    <div className="flex gap-2">{live ? <button onClick={snap} className="h-11 px-5 rounded-xl bg-white text-black font-semibold flex items-center gap-2"><Camera className="size-4" />Capture</button> : <button data-testid="badge-camera" onClick={start} className="h-11 px-5 rounded-xl bg-white/10 font-semibold flex items-center gap-2"><Camera className="size-4" />Use camera</button>}
      <label className="h-11 px-5 rounded-xl bg-white/10 font-semibold flex items-center gap-2 cursor-pointer"><Upload className="size-4" />Upload<input data-testid="upload-badge" type="file" accept="image/*" className="hidden" onChange={async e => { const f = e.target.files?.[0]; if (f) patch({ badgePhoto: await readFile(f) }) }} /></label></div>
    <div className="text-xs text-white/45">Live badge preview</div>
    <Badge hire={hire} company={company} />
  </div>
}
