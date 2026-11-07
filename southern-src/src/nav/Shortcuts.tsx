/** One-tap shortcuts on each role's home screen: the everyday tasks that used to take 3+ taps. */
import { useStore } from '../data/store'
import { roleDef, type PageKey } from '../data/roles'
import { ICONS } from '../components/icons'
import type { RoleKey } from '../data/types'

type SC = { label: string; icon: string; page?: PageKey; run?: () => void; need?: PageKey }
const job = (): SC => ({ label: 'New job', icon: 'FilePlus2', need: 'jobs', run: () => useStore.getState().setUI({ jobBuilder: {} }) })
const MAP: Partial<Record<RoleKey, SC[]>> = {
  owner: [{ label: 'Approve time', icon: 'Clock', page: 'time' }, { label: 'Who’s where today', icon: 'CalendarRange', page: 'dispatch' }, { label: 'Money owed to us', icon: 'HandCoins', page: 'receivables' }, { label: 'Losing money?', icon: 'LineChart', page: 'analytics' }],
  branch: [{ label: 'Approve time', icon: 'Clock', page: 'time' }, { label: 'Who’s where today', icon: 'CalendarRange', page: 'dispatch' }, { label: 'Crane availability', icon: 'GanttChart', page: 'forecast' }, { label: 'Losing money?', icon: 'LineChart', page: 'analytics' }],
  ops: [job(), { label: 'Dispatch board', icon: 'CalendarRange', page: 'dispatch' }, { label: 'Job costs', icon: 'LineChart', page: 'analytics' }, { label: 'Crane availability', icon: 'GanttChart', page: 'forecast' }],
  dispatch: [{ label: 'Field tickets', icon: 'FileSignature', page: 'tickets' }, { label: 'Crane availability', icon: 'GanttChart', page: 'forecast' }, { label: 'Crews', icon: 'Network', page: 'allocations' }, { label: 'Permits', icon: 'Route', page: 'permits' }],
  accounting: [{ label: 'Bills to code', icon: 'Receipt', page: 'payables' }, { label: 'Invoices & collections', icon: 'HandCoins', page: 'receivables' }, { label: 'Job costs', icon: 'LineChart', page: 'analytics' }, { label: 'Fuel & IFTA', icon: 'Fuel', page: 'fuel' }],
  payroll: [{ label: 'Approve time', icon: 'Clock', page: 'time' }, { label: 'Time off', icon: 'CalendarDays', page: 'pto' }, { label: 'Union locals', icon: 'HardHat', page: 'union' }, { label: 'Expenses', icon: 'Receipt', page: 'expenses' }],
  hr: [{ label: 'New hires', icon: 'UserPlus', page: 'onboarding' }, { label: 'Time off', icon: 'CalendarDays', page: 'pto' }, { label: 'Cert tracker', icon: 'BadgeCheck', page: 'certtracker' }, { label: 'Union locals', icon: 'HardHat', page: 'union' }],
  safety: [{ label: 'Cert tracker', icon: 'BadgeCheck', page: 'certtracker' }, { label: 'Rigging inspections', icon: 'Anchor', page: 'rigging' }, { label: 'Site recon', icon: 'ClipboardCheck', page: 'recon' }, { label: 'Documents', icon: 'FolderOpen', page: 'vault' }],
  shop: [{ label: 'Parts requests', icon: 'ClipboardList', page: 'requests' }, { label: 'Equipment', icon: 'Truck', page: 'equipment' }, { label: 'Parts on hand', icon: 'Boxes', page: 'inventory' }, { label: 'Fuel log', icon: 'Fuel', page: 'fuel' }],
  sales: [{ label: 'Crane availability', icon: 'GanttChart', page: 'forecast' }, job(), { label: 'Wind farms', icon: 'Wind', page: 'windfarms' }, { label: 'Site notes', icon: 'ClipboardCheck', page: 'recon' }],
  inventory: [{ label: 'Order parts', icon: 'ShoppingCart', page: 'purchasing' }, { label: 'Parts requests', icon: 'ClipboardList', page: 'requests' }, { label: 'Stock list', icon: 'Boxes', page: 'inventory' }, { label: 'Rigging', icon: 'Anchor', page: 'rigging' }],
  frontdesk: [{ label: 'People', icon: 'Users', page: 'people' }, { label: 'Jobs', icon: 'Briefcase', page: 'jobs' }, { label: 'Messages', icon: 'MessagesSquare', page: 'messages' }, { label: 'Time off', icon: 'CalendarDays', page: 'pto' }],
}
export default function Shortcuts({ compact }: { compact?: boolean }) {
  const role = useStore(s => s.session?.role); const go = useStore(s => s.go)
  if (!role) return null
  const rd = roleDef(role)
  const list = (MAP[role] ?? []).filter(s => (s.page ? rd.pages.includes(s.page) && s.page !== rd.home : !s.need || rd.pages.includes(s.need))).slice(0, 4)
  if (!list.length) return null
  return (
    <div className={compact ? 'mb-4 grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-wrap lg:justify-end gap-2 lg:shrink-0 lg:max-w-[52%]' : 'max-w-[1500px] mx-auto mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2'} data-testid="shortcuts" data-compact={compact ? '1' : undefined}>
      {list.map(s => { const I = ICONS[s.icon] ?? ICONS.FileText; return (
        <button key={s.label} data-shortcut={s.page ?? s.label} onClick={() => (s.run ? s.run() : go(s.page!))} className={(compact ? 'min-h-14 lg:min-h-0 lg:h-11 ' : 'min-h-14 ') + 'rounded-2xl bg-surface-2 hover:bg-surface-3 active:scale-[.98] transition px-3 flex items-center gap-2.5 text-left text-[14px] font-semibold'}>
          <span className={(compact ? 'lg:size-7 ' : '') + 'size-9 shrink-0 rounded-xl bg-accent/15 text-accent grid place-items-center'}><I className="size-[18px]" /></span><span className="leading-tight">{s.label}</span></button>) })}
    </div>
  )
}
