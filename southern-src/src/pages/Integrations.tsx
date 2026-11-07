import { useState } from 'react'
import { toast } from 'sonner'
import { Database, Radio, KeyRound, FileSpreadsheet, Wallet, Plug, Check, Loader2 } from 'lucide-react'
import { useStore } from '../data/store'
import { localRepository } from '../data/repo'
import { downloadCsv, fullNameSafe } from './_helpers'
import { PER_DIEM_RATES } from '../data/seed'
import { PageHeader, Card, Badge, Button, DemoTag } from '../components/ui'

const ADAPTERS = [
  { k: 'quickbase', name: 'Quickbase', icon: Database, what: 'Sync jobs, customers and equipment tables both ways. Keeps existing Quickbase apps alive during rollout.', fields: ['Realm hostname', 'User token', 'App ID'], demo: ['southernlifting.quickbase.com', '•••• 7C1D', 'bq4•••9z'], sync: 'Last sync 6 min ago', recs: (db: any) => `${db.jobs.length} jobs · ${db.customers.length} customers · ${db.equipment.length} units` },
  { k: 'samsara', name: 'Samsara', icon: Radio, what: 'Live GPS, engine hours, odometer, HOS and DVIRs for every truck and crane carrier. Powers the live fleet map.', fields: ['API token', 'Org ID'], demo: ['samsara_api_•••• 4F2A', '•••• 8812'], sync: 'Last ping 38 sec ago · streaming', recs: (db: any) => `${db.equipment.filter((e: any) => e.samsaraId).length} vehicles reporting · ${db.dvirs.length} DVIRs` },
  { k: 'entra', name: 'Microsoft 365 / Entra ID', icon: KeyRound, what: 'Single sign-on with MFA (number match), groups → roles, Outlook calendar & Teams alerts.', fields: ['Tenant ID', 'Client ID', 'Redirect URI'], demo: ['•••• -e41b', '•••• -90ac', 'https://ops.southernlifting.com/auth'], sync: 'Directory sync 22 min ago', recs: (db: any) => `${db.employees.length} users · 9 role groups mapped` },
  { k: 'payroll', name: 'Payroll export', icon: Wallet, what: 'Approved time + per diems export as ADP / Paychex / generic CSV. Exported records lock automatically.', fields: ['Provider', 'Company code'], demo: ['Paychex Flex', 'SLH-•••• 31'], sync: 'Last export Fri 4:12 PM', recs: (db: any) => `${db.time.filter((t: any) => t.status === 'Approved').length} approved entries ready` },
  { k: 'excel', name: 'Excel import / export', icon: FileSpreadsheet, what: 'CSV/XLSX import for inventory, employees and equipment with duplicate checks; one-click exports everywhere.', fields: [], demo: [], sync: 'Last import Oct 2 · inventory.xlsx', recs: (db: any) => `${db.items.length} inventory items` },
]

export default function Integrations() {
  const db = useStore(s => s.db)
  const [testing, setTesting] = useState<string | null>(null)
  const [ok, setOk] = useState<Set<string>>(new Set(['samsara', 'entra', 'quickbase', 'payroll', 'excel']))
  const test = (k: string) => { setTesting(k); setTimeout(() => { setTesting(null); setOk(new Set([...ok, k])); toast.success('Demo adapter responded', { description: 'Mock connection — no real data sent' }) }, 1200) }
  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader eyebrow={<span className="inline-flex gap-2 items-center">Ready to connect <DemoTag /></span>} title="Integrations" sub="Adapters are mocked for the demo and clearly marked. Swapping in real credentials is configuration, not a rebuild." />
      <div className="grid gap-4 md:grid-cols-2">{ADAPTERS.map(a => (
        <Card key={a.k}>
          <div className="flex items-start gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-surface-2"><a.icon className="size-5" /></div><div className="flex-1"><div className="font-semibold flex items-center gap-2">{a.name}{ok.has(a.k) ? <Badge tone="ok"><Check className="size-3" />Demo connected</Badge> : <Badge>Not connected</Badge>}</div><div className="text-sm text-muted mt-1">{a.what}</div></div></div>
          {a.fields.length > 0 && <div className="grid grid-cols-2 gap-2 mt-4">{a.fields.map((f, i) => <label key={f} className="block"><span className="text-[11px] text-muted font-semibold">{f}</span><input className="input text-sm num" value={ok.has(a.k) ? a.demo[i] : ''} placeholder={f} readOnly /></label>)}</div>}
          {ok.has(a.k) && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" data-testid="int-sync"><span className="inline-flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-ok" />{a.sync}</span><span>{a.recs(db)}</span></div>}
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={() => test(a.k)} disabled={testing === a.k} icon={testing === a.k ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}>Test demo connection</Button>
            {a.k === 'excel' && <Button size="sm" variant="ghost" onClick={() => downloadCsv('employees.csv', [['Emp #', 'First', 'Last', 'Craft', 'Phone', 'Email', 'Division', 'Branch'], ...db.employees.map(e => [e.empNo, e.first, e.last, e.craft, e.phone, e.email, db.divisions.find(d => d.id === e.divisionId)?.name ?? e.divisionId, db.branches.find(b => b.id === e.branchId)?.code ?? e.branchId])])}>Export employees</Button>}
            {a.k === 'payroll' && <Button size="sm" variant="ghost" onClick={() => downloadCsv('payroll-sample.csv', [['Emp #', 'Name', 'Date', 'Hours', 'Per diems', 'Per diem $'], ...db.time.filter(t => t.status === 'Approved').slice(0, 50).map(t => [db.employees.find(e => e.id === t.employeeId)?.empNo ?? t.employeeId, fullNameSafe(db, t.employeeId), t.date, t.hours, t.perDiems.join('+'), t.perDiems.reduce((x, p) => x + PER_DIEM_RATES[p], 0)])])}>Sample export</Button>}
          </div>
        </Card>))}</div>
      <Card className="mt-4"><div className="font-semibold">Data layer</div><div className="text-sm text-muted mt-1">Current repository: <b className="text-ink">{localRepository.name}</b>. The app talks to a <code>DataRepository</code> interface; a REST adapter (<code>restRepository</code>) is stubbed so a real backend + database can replace on-device storage without touching screens.</div></Card>
    </div>
  )
}
