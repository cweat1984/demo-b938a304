import { useEffect, useMemo, useState } from 'react'
import { Fuel as FuelIcon, Plug, AlertTriangle, MapPin, Car, Navigation, Check } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Segmented, DemoTag } from '../components/ui'
import { useStore } from '../data/store'
import { cn, today, addDays } from '../lib/util'
import { useL2 } from '../launch2/l2store'
import { useG, iftaSummary, quarterOf, type FuelNet, type Trip } from './gstore'

const IRS = 0.70
export default function FuelPage() {
  const db = useStore(s => s.db), who = useStore(s => s.session?.name) ?? 'Chad Weathers'
  const { fuelConn, fuel, trips } = useG()
  const [tab, setTab] = useState<'feed' | 'ifta' | 'mileage'>('feed')
  const [onlyFlags, setOnlyFlags] = useState(false)
  const live = fuel.filter(t => fuelConn[t.net])
  const q = quarterOf(new Date().toISOString())
  const ifta = useMemo(() => iftaSummary(live.filter(t => quarterOf(t.at) === q)), [live, q])
  useEffect(() => { if (!trips.length) { const js = db.jobs.filter(j => j.status !== 'Complete').slice(0, 4); useG.getState().setTrips(js.map((j, i) => { const s = db.sites.find(x => x.id === j.siteId); return { id: 'tp-' + i, who, date: addDays(today(), -i), from: i % 2 ? 'Home (Edmond)' : 'OKC yard', to: s ? `${s.name}, ${s.city}` : j.name, miles: 38 + i * 47, jobNo: j.jobNo, source: 'Phone GPS' as const, added: false } })) } }, [db, trips.length, who])
  const rows = (onlyFlags ? live.filter(t => t.flags.length) : live).slice(0, 40)
  return <div className="flex flex-col gap-5" data-testid="fuel-page">
    <PageHeader eyebrow={<span className="inline-flex gap-2 items-center">Fleet <DemoTag /></span>} title="Fuel cards, IFTA & mileage" sub="Every gallon matched to truck, driver and job — and rolled into the quarterly IFTA return." />
    <div className="grid md:grid-cols-3 gap-3">{(['WEX', 'Comdata', 'Coast'] as FuelNet[]).map(n => <Card key={n} className="flex items-center gap-3" data-testid={`fuel-conn-${n}`}><span className={cn('size-11 rounded-xl grid place-items-center font-bold text-white text-sm', n === 'WEX' ? 'bg-[#d0202e]' : n === 'Comdata' ? 'bg-[#00539b]' : 'bg-[#0f766e]')}>{n.slice(0, 3).toUpperCase()}</span><div className="flex-1"><div className="font-semibold">{n}</div><div className="text-xs text-muted">{fuelConn[n] ? `${fuel.filter(t => t.net === n).length} transactions · live` : 'Not connected'}</div></div><Button size="sm" variant={fuelConn[n] ? 'secondary' : 'primary'} icon={<Plug className="size-3.5" />} data-testid={`fuel-connect-${n}`} onClick={() => { useG.getState().connectFuel(n, !fuelConn[n], db); toast.success(fuelConn[n] ? `${n} disconnected` : `${n} connected (simulated) — transactions streaming`) }}>{fuelConn[n] ? 'Disconnect' : 'Connect'}</Button></Card>)}</div>
    <Segmented value={tab} onChange={setTab} options={[{ value: 'feed', label: 'Fuel feed', count: live.length }, { value: 'ifta', label: `IFTA ${q}` }, { value: 'mileage', label: 'GPS mileage' }]} />
    {tab === 'feed' && <Card pad={false}><div className="px-5 py-3 border-b hairline flex items-center gap-3"><FuelIcon className="size-4" /><span className="font-semibold flex-1">Transactions</span><Badge tone="bad">{live.filter(t => t.flags.length).length} flagged</Badge><label className="text-xs flex items-center gap-1"><input type="checkbox" data-testid="fuel-only-flags" checked={onlyFlags} onChange={e => setOnlyFlags(e.target.checked)} />Flags only</label></div>
      {!live.length ? <div className="p-10 text-center text-muted text-sm">Connect a fuel card network above to stream transactions.</div> : <div className="divide-y hairline">{rows.map(t => <div key={t.id} className={cn('px-5 py-3 flex items-center gap-3 flex-wrap text-sm', t.flags.length && 'bg-bad/[.04]')} data-testid="fuel-row">
        <Badge>{t.net}</Badge><div className="w-48 min-w-0"><div className="font-medium truncate">{t.station}</div><div className="text-xs text-muted">{new Date(t.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · {t.state}</div></div>
        <div className="flex-1 min-w-48"><div>Unit {t.unit} · {t.driver}{t.jobNo && <b className="text-accent"> · Job {t.jobNo}</b>}</div><div className="text-xs text-muted">{t.how}</div>{t.flags.map(f => <div key={f} className="text-xs text-bad flex items-center gap-1" data-testid="fuel-flag"><AlertTriangle className="size-3" />{f}</div>)}</div>
        <div className="text-right tabular-nums"><div className="font-semibold">${(t.gallons * t.price).toFixed(2)}</div><div className="text-xs text-muted">{t.gallons} gal @ ${t.price}</div></div></div>)}</div>}</Card>}
    {tab === 'ifta' && <Card data-testid="ifta"><div className="flex items-center gap-3 flex-wrap"><div className="font-semibold flex-1">IFTA quarterly summary · {q}</div><span className="text-sm text-muted">{ifta.totalMi.toLocaleString()} mi · {Math.round(ifta.totalGal).toLocaleString()} gal · fleet {ifta.mpg.toFixed(2)} MPG</span></div>
      <table className="w-full text-sm mt-3"><thead><tr className="text-xs text-muted text-left"><th className="py-2">State</th><th>Miles (ELD / GPS)</th><th>Taxable gal</th><th>Tax-paid gal (cards)</th><th>Rate</th><th className="text-right">Net tax (due / credit)</th></tr></thead>
        <tbody className="divide-y hairline">{ifta.rows.map(r => <tr key={r.state} data-testid="ifta-row"><td className="py-2 font-semibold">{r.state}</td><td>{r.miles.toLocaleString()}</td><td>{r.taxable.toLocaleString()}</td><td>{r.gallons.toLocaleString()}</td><td>${r.rate.toFixed(3)}</td><td className={cn('text-right font-semibold', r.net > 0 ? 'text-bad' : 'text-ok')}>{r.net > 0 ? '' : '−'}${Math.abs(r.net).toFixed(2)}</td></tr>)}</tbody>
        <tfoot><tr className="border-t hairline"><td className="py-2 font-semibold" colSpan={5}>Net due with return</td><td className="text-right font-semibold">${ifta.rows.reduce((a, r) => a + r.net, 0).toFixed(2)}</td></tr></tfoot></table>
      <div className="text-xs text-muted mt-2">Miles from Samsara/ELD when connected (optional), otherwise app GPS on the driver’s phone. Gallons from fuel cards. Demo tax rates.</div></Card>}
    {tab === 'mileage' && <Card pad={false} data-testid="mileage"><div className="px-5 py-3 border-b hairline flex items-center gap-2"><Car className="size-4" /><span className="font-semibold flex-1">Personal-vehicle trips (phone GPS)</span><span className="text-xs text-muted">IRS rate ${IRS.toFixed(2)}/mi</span></div>
      <div className="divide-y hairline">{trips.map((t: Trip) => <div key={t.id} className="px-5 py-3 flex items-center gap-3 text-sm" data-testid="trip-row"><Navigation className="size-4 text-muted" /><div className="flex-1"><div className="font-medium">{t.from} → {t.to}</div><div className="text-xs text-muted">{t.date} · {t.miles} mi tracked · Job {t.jobNo}</div></div><span className="font-semibold">${(t.miles * IRS).toFixed(2)}</span>
        {t.added ? <Badge tone="ok"><Check className="size-3" />In expenses</Badge> : <Button size="sm" data-testid="trip-add" onClick={() => { useL2.getState().addExpense({ source: 'mileage', merchant: `Mileage — ${t.from} → ${t.to}`, date: t.date, amount: Math.round(t.miles * IRS * 100) / 100, miles: t.miles, category: 'Mileage', who, status: 'Submitted', jobNo: t.jobNo, rule: 'GPS', why: `Phone GPS trip ${t.miles} mi on ${t.date}; dispatched to ${t.jobNo}.`, confidence: 100 }); useG.getState().setTrips(trips.map(x => x.id === t.id ? { ...x, added: true } : x)); toast.success('Mileage filed to expenses') }}>File it</Button>}</div>)}</div>
      <div className="px-5 py-2.5 border-t hairline text-xs text-muted flex items-center gap-1"><MapPin className="size-3" />Tracking runs only while clocked in and driving a personal vehicle; the employee confirms each trip.</div></Card>}
  </div>
}
