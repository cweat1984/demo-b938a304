import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, X, Play } from 'lucide-react'
import { useTour, STEPS, goStep, endTour } from './tour'
import { useStore } from '../data/store'

const BASE = import.meta.env.BASE_URL
function useRect(sel?: string, key?: unknown) {
  const [r, setR] = useState<DOMRect | null>(null)
  useEffect(() => {
    if (!sel) { setR(null); return }
    let n = 0; let done = false
    let scrolled = false
    const tick = () => { const el = document.querySelector(sel); if (el) { const phone = innerWidth < 640
        // On a phone the caption covers the bottom ~40%, so park the target near the top instead of the centre
        if (!scrolled || n === 3) { scrolled = true; if (phone) { (el as HTMLElement).style.scrollMarginTop = '96px'; el.scrollIntoView({ block: 'start', behavior: 'smooth' }) } else el.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
        const b = el.getBoundingClientRect(); const y = Math.max(8, b.y - 10); const maxH = phone ? Math.max(80, innerHeight * .58 - y) : innerHeight * .62
        setR(new DOMRect(Math.max(8, b.x - 10), y, Math.min(innerWidth - 16, b.width + 20), Math.min(maxH, b.height + 20))) } n++; if (!done) t = setTimeout(tick, n < 12 ? 120 : 600) }
    let t = setTimeout(tick, 120)
    return () => { done = true; clearTimeout(t) }
  }, [sel, key])
  return r
}

export default function Tour() {
  const { on, i } = useTour()
  const session = useStore(s => s.session)
  const st = STEPS[i]
  const rect = useRect(on && st && !st.frame ? st.spot : undefined, i)
  useEffect(() => {
    if (!on) return
    const h = (e: KeyboardEvent) => { if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); next() } if (e.key === 'ArrowLeft') back(); if (e.key === 'Escape') endTour() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  if (!on || !session) return null
  const next = () => { if (i + 1 >= STEPS.length) useTour.setState({ i: STEPS.length }); else goStep(i + 1) }
  const back = () => { if (i <= 0) useTour.setState({ i: -1 }); else goStep(i - 1) }
  const card = i === -1 || i >= STEPS.length
  return (
    <div className="fixed inset-0 z-[120] pointer-events-none" data-testid="tour" data-feedback-ui>
      {/* letterbox */}
      <motion.div className="absolute top-0 inset-x-0 h-6 md:h-10 bg-black pointer-events-auto" initial={{ y: -40 }} animate={{ y: 0 }} />
      <AnimatePresence mode="wait">
        {card ? <TitleCard key={i < 0 ? 'open' : 'close'} closing={i >= 0} onNext={() => i < 0 ? goStep(0) : endTour()} onBack={() => i >= 0 && goStep(STEPS.length - 1)} />
          : st.frame ? <motion.div key={st.id} className="absolute inset-0 bg-black/80 backdrop-blur-sm pointer-events-auto grid place-items-center pt-8 pb-48 md:pb-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div initial={{ scale: .92, y: 20 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', bounce: .2 }} className="rounded-[44px] border-[10px] border-neutral-800 bg-black shadow-2xl overflow-hidden" style={{ width: 'min(390px, 88vw)', height: 'min(720px, 62vh)' }}>
                <iframe title={st.title} src={`${BASE}${st.frame}`} className="w-full h-full bg-white" data-testid="tour-frame" />
              </motion.div></motion.div>
            : <motion.div key={st.id + 'spot'} className="absolute rounded-3xl pointer-events-none" initial={false} animate={rect ? { left: rect.x, top: rect.y, width: rect.width, height: rect.height, opacity: 1 } : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0, opacity: 1 }} transition={{ type: 'spring', damping: 30, stiffness: 220 }} style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,.62), 0 0 0 3px var(--accent), 0 0 40px 8px color-mix(in oklab, var(--accent) 45%, transparent)' }} data-testid="tour-spot" />}
      </AnimatePresence>
      {!card && <motion.div key={st.id + 'cap'} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .15 }} className="absolute bottom-4 md:bottom-8 inset-x-3 md:left-1/2 md:-translate-x-1/2 md:w-[720px] pointer-events-auto rounded-3xl bg-[#0b0d10] text-white border border-white/10 shadow-2xl p-5 md:p-6" data-testid="tour-caption">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[.18em] text-white/50"><span className="text-[#ef3b3b] font-bold">{st.kicker}</span><span className="ml-auto num">{i + 1} / {STEPS.length}</span></div>
        <div className="display text-2xl md:text-3xl font-semibold mt-1.5 leading-tight">{st.title}</div>
        <div className="text-white/70 mt-2 text-[15px] leading-relaxed">{st.say}</div>
        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1 flex-1">{STEPS.map((_, k) => <span key={k} className={`h-1 rounded-full transition-all ${k === i ? 'w-6 bg-[#ef3b3b]' : k < i ? 'w-2.5 bg-white/50' : 'w-2.5 bg-white/15'}`} />)}</div>
          <button onClick={endTour} className="h-10 px-3 rounded-xl text-white/60 hover:text-white text-sm" data-testid="tour-exit">Exit</button>
          <button onClick={back} className="h-10 w-10 rounded-xl bg-white/10 grid place-items-center" aria-label="Back" data-testid="tour-back"><ChevronLeft className="size-5" /></button>
          <button onClick={next} className="h-10 px-5 rounded-xl bg-[#ef3b3b] font-semibold flex items-center gap-1" data-testid="tour-next">Next<ChevronRight className="size-4" /></button>
        </div>
      </motion.div>}
    </div>
  )
}

function TitleCard({ closing, onNext, onBack }: { closing: boolean; onNext: () => void; onBack: () => void }) {
  return (
    <motion.div className="absolute inset-0 bg-[#05070a] text-white pointer-events-auto grid place-items-center overflow-hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-testid={closing ? 'tour-close' : 'tour-open'}>
      <img src={`${BASE}hero-wind.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 grayscale" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#05070a] via-[#05070a]/70 to-[#05070a]/40" />
      <div className="relative text-center px-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .2, duration: .8 }} className="text-[12px] uppercase tracking-[.3em] text-white/50">{closing ? 'That’s the tour' : 'Owner preview'}</motion.div>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .4, duration: .9 }} className="display text-5xl md:text-7xl font-semibold mt-4 leading-[.95]">{closing ? <>One program.<br /><span className="text-[#ef3b3b]">The whole company.</span></> : <>Southern Command</>}</motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: .8 }} className="mt-6 flex items-center justify-center gap-3 text-white/60"><span className="text-sm tracking-wide">powered by</span><img src={`${BASE}arrowline-wordmark-white.svg`} alt="Arrowline" className="h-7" /></motion.div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="mt-4 text-white/55 text-[15px]">{closing ? 'Built around how Southern actually works — cranes, crews, customers and cash. Questions? Let’s pick what ships first.' : '12 moments, on the real screens, with real demo data.'}</motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.8 }} className="mt-10 flex justify-center gap-3">
          {closing && <button onClick={onBack} className="h-12 px-5 rounded-2xl bg-white/10 font-semibold">Back</button>}
          <button onClick={onNext} className="h-12 px-7 rounded-2xl bg-[#ef3b3b] font-semibold flex items-center gap-2" data-testid={closing ? 'tour-finish' : 'tour-begin'}>{closing ? 'Finish' : <><Play className="size-4" />Begin</>}</button>
          {!closing && <button onClick={endTour} className="h-12 px-5 rounded-2xl bg-white/10 font-semibold">Skip</button>}
        </motion.div>
      </div>
    </motion.div>
  )
}
