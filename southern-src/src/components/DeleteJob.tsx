/** dive3 B2: delete a quote / job made by mistake (confirm + Undo). Refused with the reason when it already has history. */
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button, confirmChoice } from './ui'
import { useStore, actions } from '../data/store'
import type * as T from '../data/types'

export function DeleteJobButton({ job, onDone, size = 'md' }: { job: T.Job; onDone?: () => void; size?: 'sm' | 'md' }) {
  const role = useStore(s => s.session?.role)
  if (!['owner', 'ops', 'sales', 'dispatch', 'branch'].includes(role ?? '')) return null
  const quote = job.stage === 'Quote' || job.stage === 'Awarded'
  return <Button variant="ghost" size={size} icon={<Trash2 className="size-4" />} data-testid="job-delete" onClick={async () => {
    const can = actions.canDeleteJob(job.id); if (!can.ok) { toast.error(can.reason); return }
    const r = await confirmChoice(quote ? `Delete quote Q-${job.jobNo}?` : `Delete job #${job.jobNo}?`, <>Use this for a duplicate or a mistake. It leaves the pipeline and the win rate (a lost quote should be marked lost instead). The audit log keeps a record.</>,
      [{ label: 'Cancel', value: '', tone: 'ghost' }, { label: 'Duplicate — delete', value: 'Duplicate', tone: 'danger' }, { label: 'Mistake — delete', value: 'Entered by mistake', tone: 'danger' }])
    if (!r?.value) return
    const res = actions.deleteJob(job.id, r.value); if (!res.ok) { toast.error(res.reason); return }
    onDone?.(); toast.success(`${res.label} deleted`, { duration: 10000, action: { label: 'Undo', onClick: () => { actions.restoreJob(res.snap); toast.success(`${res.label} restored`) } } })
  }}>{quote ? 'Delete quote' : 'Delete job'}</Button>
}
