import { ChevronLeft } from 'lucide-react'
import { useStore } from '../data/store'
import { PoweredBy } from '../components/PoweredBy'
import { InspectionForm } from './Maintenance'

export default function PhoneInspect({ unitId }: { unitId: string }) {
  const db = useStore(s => s.db)
  const u = db.equipment.find(e => e.id === unitId) ?? db.equipment.find(e => e.category === 'Crane')
  if (!u) return null
  return <div className="min-h-screen bg-bg text-ink" data-testid="phone-inspect"><div className="max-w-md mx-auto px-4 py-4 flex flex-col gap-4">
    <button onClick={() => { location.href = location.pathname }} className="self-start -ml-2 mt-[env(safe-area-inset-top)] h-11 min-w-11 pr-4 pl-2 rounded-full bg-surface-2 text-sm font-semibold flex items-center gap-1" data-testid="back-to-app"><ChevronLeft className="size-5" />Back to app</button>
    <InspectionForm unitId={u.id} onDone={() => setTimeout(() => { location.href = location.pathname }, 1200)} />
    <div className="flex justify-center py-4"><PoweredBy /></div></div></div>
}
