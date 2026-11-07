import { storeLabel } from '../data/brand'
import { useState } from 'react'
import { ShoppingBag, Gift, Settings2, Tag, Package } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader, Card, Button, Badge, Sheet } from '../components/ui'
import { useStore } from '../data/store'
import { canSeeMoney } from '../data/roles'
import { cn } from '../lib/util'
import { useL2, type StoreItem } from './l2store'

const SECTIONS = ['New Arrivals', 'Field Gear', 'Family', 'Limited Drops', 'Overstock & Sale'] as const
export default function Store() {
  const { items, credits, orders, rules } = useL2()
  const role = useStore(s => s.session?.role)
  const who = useStore(s => s.session?.name) ?? 'Me'
  const [cart, setCart] = useState<{ it: StoreItem; size: string; color: string }[]>([])
  const [pick, setPick] = useState<StoreItem | null>(null)
  const [size, setSize] = useState(''), [color, setColor] = useState('')
  const [cfg, setCfg] = useState(false)
  const nm = !canSeeMoney(role) // guests: merch prices / credits hidden
  const hrish = role === 'hr' || role === 'owner' || role === 'inventory'
  const total = cart.reduce((s, c) => s + c.it.price, 0)
  return <div className="flex flex-col gap-6" data-testid="store">
    <PageHeader eyebrow={storeLabel()} title="Wear it with pride." sub="Swag, field gear and family pieces. Paid with credits you earn." actions={<>{hrish && <Button icon={<Settings2 className="size-4" />} onClick={() => setCfg(true)} data-testid="store-rules">Credit rules</Button>}<Button variant="primary" icon={<ShoppingBag className="size-4" />} data-testid="store-checkout" disabled={!cart.length} onClick={() => { useL2.getState().order({ who, lines: cart.map(c => ({ sku: c.it.sku, name: c.it.name, size: c.size, color: c.color, qty: 1, price: c.it.price })), total }); setCart([]); toast.success('Order placed', { description: 'Pulled from swag stock — inventory updated.' }) }}>Checkout{cart.length ? ` · ${cart.length} · $${total}` : ''}</Button></>} />
    <div className="grid md:grid-cols-3 gap-3">
      <Card className="bg-gradient-to-br from-accent/20 to-transparent"><div className="label flex items-center gap-1.5"><Gift className="size-3.5" />Credit balance</div><div className="display text-4xl font-semibold mt-1" data-testid="credit-balance">{nm ? '—' : `$${credits - total}`}</div><div className="text-xs text-muted mt-1">Onboarding · Birthday · 1-yr anniversary (demo values)</div></Card>
      <Card><div className="label">Your sizes</div><div className="text-sm mt-2">Shirt XL · Jacket XL · Cap L/XL</div><div className="text-xs text-muted mt-1">From onboarding — shown first.</div></Card>
      <Card><div className="label flex items-center gap-1.5"><Package className="size-3.5" />Recent orders</div>{orders.length ? orders.slice(0, 3).map(o => <div key={o.id} className="text-sm mt-1.5 flex justify-between" data-testid="store-order"><span>{o.id} · {o.lines.length} item(s)</span><Badge tone="info">{o.status}</Badge></div>) : <div className="text-sm text-muted mt-2">No orders yet.</div>}</Card>
    </div>
    {SECTIONS.map(sec => <section key={sec}>
      <h2 className={cn('text-xl font-semibold mb-3 flex items-center gap-2', sec === 'Overstock & Sale' && 'text-bad')}>{sec === 'Overstock & Sale' && <Tag className="size-5" />}{sec}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{items.filter(i => i.section === sec).map(it => { const left = Object.values(it.stock).reduce((a, b) => a + b, 0)
        return <button key={it.sku} data-testid="store-item" onClick={() => { setPick(it); setSize(it.sizes.find(s => it.stock[s]) ?? it.sizes[0]); setColor(it.colors[0]) }} className="card p-0 overflow-hidden text-left hover:border-faint/50 transition group">
          <div className="aspect-square relative grid place-items-center" style={{ background: `radial-gradient(circle at 50% 35%, ${it.hue}cc, ${it.hue} 70%)` }}><ShirtArt /><span className="absolute top-2 left-2 text-[10px] font-bold text-white/80 tracking-widest">SOUTHERN</span>{it.was && <span className="absolute top-2 right-2 rounded-full bg-bad text-white text-[10px] font-bold px-2 py-0.5">SALE</span>}</div>
          <div className="p-3"><div className="font-semibold text-sm leading-snug">{it.name}</div><div className="text-sm mt-1" data-testid="store-price">{nm ? <span className="text-muted">View only</span> : `$${it.price}`}{!nm && it.was && <span className="text-muted line-through ml-1.5 text-xs">${it.was}</span>}</div><div className="text-[11px] text-muted mt-0.5">{left} in stock · {it.colors.length} color{it.colors.length > 1 ? 's' : ''}</div></div>
        </button> })}</div>
    </section>)}
    <Sheet open={!!pick} onClose={() => setPick(null)} title={pick?.name} sub={pick?.blurb}>
      {pick && <div className="flex flex-col gap-5">
        <div className="aspect-[4/3] rounded-2xl grid place-items-center" style={{ background: pick.hue }}><ShirtArt big /></div>
        <div><div className="label mb-2">Size</div><div className="flex flex-wrap gap-2">{pick.sizes.map(s => <button key={s} data-testid="store-size" disabled={!pick.stock[s]} onClick={() => setSize(s)} className={cn('h-10 min-w-12 px-3 rounded-xl border text-sm', size === s ? 'bg-ink text-bg border-ink' : 'hairline', !pick.stock[s] && 'opacity-30 line-through')}>{s}<span className="text-[10px] ml-1 opacity-60">{pick.stock[s] ?? 0}</span></button>)}</div></div>
        <div><div className="label mb-2">Style</div><div className="flex flex-wrap gap-2">{pick.colors.map(c => <button key={c} onClick={() => setColor(c)} className={cn('h-10 px-3 rounded-xl border text-sm', color === c ? 'bg-ink text-bg border-ink' : 'hairline')}>{c}</button>)}</div></div>
        <Button variant="primary" size="lg" data-testid="store-add" onClick={() => { setCart([...cart, { it: pick, size, color }]); setPick(null); toast(`Added ${pick.name} (${size})`) }}>Add to bag{nm ? '' : ` · $${pick.price}`}</Button>
      </div>}
    </Sheet>
    <Sheet open={cfg} onClose={() => setCfg(false)} title="Store & Recognition" sub="Amounts are blank until HR decides — the store runs with credits off. Demo values shown in grey.">
      <div className="flex flex-col gap-3" data-testid="credit-rules">{rules.map((r, i) => <div key={r.event} className="card p-4 flex items-center gap-3"><div className="flex-1"><div className="font-semibold text-sm">{r.event}</div><div className="text-xs text-muted">{r.eligibility}</div></div><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm">$</span><input data-testid="rule-amount" value={r.amount} placeholder={`${r.demo} demo`} onChange={e => useL2.getState().setRule(i, { amount: e.target.value.replace(/[^0-9]/g, '') })} className="h-10 w-32 rounded-xl bg-surface-2 pl-6 pr-3 text-sm outline-none" /></div></div>)}
        <div className="text-xs text-muted">Also configurable: eligibility by division, spot-credit limits, approval above $X, expiry, budget caps (alert at 80%), taxable-fringe flag for Paychex. Changes apply going forward and are logged.</div></div>
    </Sheet>
  </div>
}
const ShirtArt = ({ big }: { big?: boolean }) => <svg viewBox="0 0 100 100" className={big ? 'w-40' : 'w-24'}><path d="M30 18 L42 12 Q50 20 58 12 L70 18 L88 32 L78 46 L70 40 L70 88 L30 88 L30 40 L22 46 L12 32 Z" fill="#fff" fillOpacity=".14" stroke="#fff" strokeOpacity=".35" /><text x="50" y="56" textAnchor="middle" fontSize="7" fill="#fff" fillOpacity=".8" fontWeight="700" letterSpacing="1">SLH</text></svg>
