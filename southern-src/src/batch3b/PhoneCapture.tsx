import { ChevronLeft } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from '../data/store'
import { PoweredBy } from '../components/PoweredBy'
import { ReconForm, defaultJob } from './Recon'
import SiteMemory, { SiteForm } from './SiteMemory'
import { useB3 } from './b3store'

/** Standalone phone screens: ?recon=<jobId> and ?sitedata=<siteId>. */
export default function PhoneCapture() {
  const db = useStore(s => s.db)
  useEffect(() => { useB3.getState().seed(db, defaultJob(db)?.id) }, [db])
  const qs = new URLSearchParams(location.search)
  const job = db.jobs.find(j => j.id === qs.get('recon')) ?? (qs.has('recon') ? defaultJob(db) : undefined)
  const siteId = qs.get('sitedata') || defaultJob(db)?.siteId || db.sites[0].id
  const back = () => { location.href = location.pathname }
  return <div className="min-h-screen bg-bg text-ink" data-testid="phone-capture">
    <div className="max-w-md mx-auto px-4 py-4 flex flex-col gap-4">
      <button onClick={back} className="self-start -ml-2 mt-[env(safe-area-inset-top)] h-11 min-w-11 pr-4 pl-2 rounded-full bg-surface-2 text-sm font-semibold flex items-center gap-1" data-testid="back-to-app"><ChevronLeft className="size-5" />Back to app</button>
      {job ? <ReconForm job={job} onSaved={() => setTimeout(back, 900)} /> : <><div><div className="label">Site notes</div><div className="text-xl font-semibold">{db.sites.find(s => s.id === siteId)?.name}</div></div><SiteForm siteId={siteId} /><SiteMemory siteId={siteId} compact /></>}
      <div className="flex justify-center py-4"><PoweredBy /></div>
    </div>
  </div>
}
