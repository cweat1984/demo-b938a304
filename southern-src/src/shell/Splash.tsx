import { motion } from 'motion/react'
import { useStore } from '../data/store'
import { useAppName, useCompany } from '../data/brand'
import { useBranding, brandHot, customName } from '../data/branding'
import { FlagMark } from '../components/Flag'
import { PoweredBy } from '../components/PoweredBy'
export function Logo({ size = 40 }: { size?: number }) {
  const custom = useCompany().logo
  if (custom) return <img src={custom} width={size} height={size} alt="" className="rounded-[22%] object-contain bg-white" style={{ width: size, height: size }} />
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ff4d4d" /><stop offset="1" stopColor="#b3121b" /></linearGradient></defs>
      <rect width="512" height="512" rx="112" fill="#0b0d10" />
      <path d="M120 392 L256 96 L392 392" fill="none" stroke="url(#lg)" strokeWidth="44" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M256 96 L256 300" stroke="#fff" strokeWidth="20" strokeLinecap="round" />
      <path d="M228 300 h56 v34 a28 28 0 0 1 -56 0z" fill="#fff" />
      <path d="M168 392 h176" stroke="#fff" strokeWidth="20" strokeLinecap="round" opacity=".5" />
    </svg>
  )
}
export default function Splash() {
  const appNm = useAppName(), brand = useBranding(x => x.b), hot = brandHot(brand), renamed = customName(brand)
  return (
    <div className="h-full grid place-items-center bg-[#07090c] text-white relative">
      <div className="absolute top-0 inset-x-0 h-1 chevrons opacity-70" />
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-5">
        <Logo size={72} />
        <div className="display text-2xl font-semibold tracking-tight">{appNm}</div>
        {renamed ? <div className="text-xs text-white/45 -mt-3">{brand.name}</div> : <div className="flex items-center gap-2 text-xs text-white/45 -mt-3"><FlagMark width={18} />Oklahoma City · Est. in America</div>}
        <div className="h-1 w-40 rounded-full bg-white/10 overflow-hidden"><motion.div className="h-full" style={{ background: hot }} initial={{ x: '-100%' }} animate={{ x: '100%' }} transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }} /></div>
      </motion.div>
      <div className="absolute bottom-6 inset-x-0 flex justify-center"><PoweredBy tone="dark" size={14} /></div>
    </div>
  )
}
