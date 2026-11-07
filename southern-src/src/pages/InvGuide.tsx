// "How inventory works" — a first-timer's guide in plain English, written for a crane / heavy-haul yard.
import { useState, type ReactNode } from 'react'
import { ChevronDown, ScanLine, Gauge, PackageCheck, ClipboardCheck, Layers, ShieldCheck, FlaskConical, CalendarCheck, BookOpen, ShoppingCart, RotateCcw, Lightbulb } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../data/store'
import { cn } from '../lib/util'
import { Button } from '../components/ui'
import { resetTips, deepLink } from '../components/inv/Purchasing'

export default function InvGuide() {
  const go = useStore(s => s.go)
  return <div className="max-w-3xl mx-auto flex flex-col gap-5" data-testid="inv-guide">
    <div>
      <div className="text-sm text-muted flex items-center gap-2"><BookOpen className="size-4" />5-minute read · plain English</div>
      <h1 className="display text-3xl sm:text-4xl font-semibold tracking-tight mt-1">How inventory works</h1>
      <p className="text-muted mt-2">You don’t need to have done this before. Inventory is four habits: <b>everything has a home</b>, <b>everything leaves by a scan</b>, <b>order before you run out</b>, and <b>count a little every week</b>. This app does the math; you do the habits.</p>
    </div>

    <div className="grid sm:grid-cols-2 gap-3">
      {[[<ScanLine className="size-5" />, 'Scan it out, scan it in', 'Who, what, how many, used on what, why.'], [<Gauge className="size-5" />, 'Min / max', 'Order at min, fill up to max.'], [<PackageCheck className="size-5" />, 'Receive what you count', 'Not what the packing slip says.'], [<ClipboardCheck className="size-5" />, 'Count one shelf a week', 'Small counts beat one big count a year.']].map(([i, t, s]) => <div key={t as string} className="card p-4 flex gap-3"><span className="size-10 rounded-xl bg-accent/12 text-accent grid place-items-center shrink-0">{i}</span><span><span className="block font-semibold">{t}</span><span className="block text-sm text-muted">{s}</span></span></div>)}
    </div>

    <Section icon={<ScanLine className="size-5" />} title="Why everything gets checked out" open>
      <p>If it leaves the shelf, it gets scanned — even a box of gloves. Not because we don’t trust people, but because the scan is what makes everything else work:</p>
      <ul>
        <li><b>Job costing.</b> Cribbing checked out to Job #10125 shows up on that job’s P&L the second it’s scanned. Leftovers checked back in credit the job. No scan = the job looks more profitable than it was.</li>
        <li><b>Finding gear.</b> “Who has the 50-ton load cell?” is one search, not ten phone calls.</li>
        <li><b>Reordering.</b> The shelf count is only right if removals are recorded. Wrong counts = surprise stock-outs on a Saturday.</li>
        <li><b>Rigging & safety records.</b> A sling’s history (which job, which crew, when it came back damaged) lives with its serial number.</li>
        <li><b>Swag.</b> Hats and koozies are real money. Checking them out to a salesperson + customer shows what each customer relationship costs.</li>
      </ul>
      <p className="text-muted">Tip: tools and rigging are <i>returnable</i> (they get a due-back date). Consumables are checked out to the job and anything left over comes back in.</p>
    </Section>

    <Section icon={<Gauge className="size-5" />} title="Min and max, in plain English">
      <p><b>Min</b> (reorder point) — when the shelf gets down to this number, it’s time to order. <b>Max</b> — order enough to bring the shelf back up to this number.</p>
      <div className="rounded-2xl bg-surface-2 p-4 text-sm">
        <div className="font-semibold mb-1">Example: impact gloves (size L)</div>
        <div>You use about <b>10 pairs a day</b>. Sooner Safety takes <b>2 days</b> to deliver → you burn 20 pairs while you wait. Add a cushion for a big job week (say 40) → <b>min = 60</b>.</div>
        <div className="mt-1">You want to order about once a week (≈ 70 pairs) → <b>max = 60 + 72 = 132</b>. When the shelf hits 60, the app suggests ordering 72.</div>
      </div>
      <ul>
        <li><b>Min ≈ daily use × vendor lead time + a cushion.</b> Fast vendor or cheap item → smaller cushion. Long lead time or “we can’t work without it” (DEF, filters, shackles) → bigger cushion.</li>
        <li><b>Max ≈ min + one normal order.</b> Bigger max = fewer orders but more cash sitting on shelves.</li>
        <li>Each location (OKC, Midland, Kilgore) has its own min/max. Set them in <button className="text-accent font-semibold" onClick={() => { deepLink.purch = 'minmax'; go('purchasing') }}>Purchasing → Min / max</button>.</li>
        <li>Revisit min/max every quarter. If you keep running out, raise min. If dust collects, lower max.</li>
      </ul>
    </Section>

    <Section icon={<ShoppingCart className="size-5" />} title="Ordering: the purchase order (PO)">
      <p>A PO is your written “please send us this, at this price.” It’s how AP knows a bill is legit later.</p>
      <ol>
        <li><b>Draft</b> — the app builds it for you from the reorder list (one PO per vendor). Change quantities, add a job number if it’s for one job.</li>
        <li><b>Sent</b> — the vendor has it. The app expects it back in the vendor’s lead time.</li>
        <li><b>Partially received</b> — some of it showed up. The rest stays “on order” so you don’t double-order.</li>
        <li><b>Received</b> — everything is in.</li>
        <li><b>Closed</b> — invoice matched and paid, or you cancelled what never came (“close short”).</li>
      </ol>
      <p className="text-muted">Bought for a specific job? Put the job on the PO. When it arrives it’s checked straight out to that job, so the cost hits the job instead of shop stock.</p>
    </Section>

    <Section icon={<PackageCheck className="size-5" />} title="Receiving (when the truck shows up)">
      <ol>
        <li>Open the PO (scan its number or tap <i>Receive</i> on your Today list).</li>
        <li><b>Count what’s actually in front of you.</b> Scan each item or type the count. Don’t trust the packing slip.</li>
        <li>Anything broken, wrong or missing a tag goes in <b>Damaged</b>. It isn’t added to stock, and AP will ask the vendor for credit.</li>
        <li>Put it away in its bin right away (the bin is shown on each line). Stuff sitting in receiving is invisible stuff.</li>
      </ol>
      <p><b>3-way match:</b> when the vendor’s invoice comes in, Payables compares <b>what we ordered (PO)</b> vs <b>what we received in good shape (receipt)</b> vs <b>what they billed (invoice)</b>. If all three agree, it’s OK to pay. If they billed for the two cracked shackles you set aside, the bill is put on hold until they send a credit.</p>
    </Section>

    <Section icon={<ClipboardCheck className="size-5" />} title="Cycle counts: one shelf a week">
      <p>Instead of shutting down for a giant year-end count, count <b>one shelf a week</b>. The app picks the shelf that was counted longest ago and puts it on your Today list.</p>
      <ul>
        <li><b>Blind count.</b> You don’t see the expected number until you enter yours — so you count, not confirm.</li>
        <li>If your number doesn’t match, pick a <b>reason</b> (taken without scanning, miscounted, found in wrong bin, damaged, never logged…). Never “just fix the number” — the reason is how you find the leak.</li>
        <li>Every count and adjustment is written to the ledger and the audit log with who, when and why. The Shrink report adds up the money.</li>
        <li>Count high-value and fast-moving shelves (rigging, filters, radios) more often.</li>
      </ul>
    </Section>

    <Section icon={<Layers className="size-5" />} title="Three kinds of stuff">
      <div className="grid sm:grid-cols-3 gap-3 not-prose">
        <Kind t="Consumables" e="Gloves, DEF, filters, cribbing, marking paint, tag lines" r="Checked out to a job, unit or person. Used up. Leftovers come back and credit the job." />
        <Kind t="Tools & returnables" e="Radios, impact guns, torque wrenches, mats, outrigger pads" r="Get a due-back date. Overdue list on your Today screen. Check-in condition: good / damaged." />
        <Kind t="Serialized" e="Slings, shackles 1½″+, spreader bars, load cells, gas monitors, harnesses" r="Tracked one by one by serial number, with cert and inspection dates. Can be tagged out of service." />
      </div>
    </Section>

    <Section icon={<ShieldCheck className="size-5" />} title="Crane & heavy-haul yard best practices">
      <ul>
        <li><b>Rigging tags are non-negotiable.</b> Every sling needs a legible ID tag (maker, size/type, rated load). <b>No tag or can’t read it → it doesn’t leave the loft.</b> Tag it out of service in the app and put it in the red quarantine bin.</li>
        <li><b>Inspect before every use, and on a schedule.</b> The person using a sling checks it before each shift; a competent person does a documented periodic inspection at least once a year (more often for hard service). The app shows inspection-due dates on each item and in Reports. Follow ASME B30.9 (slings) and B30.26 (hardware) and your safety manager’s program.</li>
        <li><b>Check rigging in, not just out.</b> On return, look for cuts, crushed wire rope, stretched or bent chain links, heat damage, and missing tags. Damaged → tag out; don’t restock it.</li>
        <li><b>Mats, pads and cribbing are money.</b> A hardwood crane mat is ~$1,450. Check them out to the job, count them at the end, and chase the ones still on site.</li>
        <li><b>Radios and batteries</b> walk off more than anything. Issue them to a person, not a truck.</li>
        <li><b>Truck kits:</b> keep a standard list per truck (binders, chains, straps, flags, fire extinguisher, spill kit) and check them out to the truck so DVIR defects can pull replacements fast.</li>
        <li><b>First in, first out</b> for anything with a shelf life — calibration gas, sealants, fluids.</li>
        <li><b>Swag</b> is checked out to the salesperson with the customer it’s for. It shows up in “Swag by salesperson / customer.”</li>
      </ul>
    </Section>

    <Section icon={<FlaskConical className="size-5" />} title="Chemicals and SDS">
      <ul>
        <li>Every chemical you stock (oils, DEF, coolant, aerosols, paint, cal gas) needs its <b>Safety Data Sheet (SDS)</b> on file — the app won’t let you add a chemical without one.</li>
        <li>Under OSHA’s Hazard Communication rule, employees must be able to get to the SDS for anything they work with, every shift. Field crews can pull them up in the field app (works offline) or scan the container.</li>
        <li>Every container — including a spray bottle you filled from a drum — needs a label saying what’s in it.</li>
        <li>Flammables (brake cleaner, PB Blaster, WD-40, paint) live in the flammable cabinet; drums go on secondary containment.</li>
        <li>SDS older than 3 years get flagged — ask the vendor for the current one.</li>
      </ul>
    </Section>

    <Section icon={<CalendarCheck className="size-5" />} title="Your week">
      <div className="grid sm:grid-cols-3 gap-3 not-prose">
        <Kind t="Every day" e="Open Inventory Command" r="Approve & pick requests · receive trucks and put away · chase overdue returns · glance at reorder." />
        <Kind t="Every week" e="Monday / Thursday" r="Send POs from the reorder list · do the cycle-count shelf · check inspection-due rigging." />
        <Kind t="Every month" e="Reports" r="Shrink (what went missing) · slow movers (cash on shelves) · swag spend · min/max tune-up." />
      </div>
    </Section>

    <Section icon={<BookOpen className="size-5" />} title="Words you’ll hear">
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm not-prose">{[
        ['SKU', 'The item’s ID / part number. Printed on its QR label.'], ['Bin', 'The exact spot it lives: building › aisle › shelf › bin.'], ['On hand', 'What’s on the shelf right now (not what’s checked out).'], ['On order', 'Ordered but not here yet.'], ['Lead time', 'Days from sending a PO to it showing up.'], ['Shrink', 'Stock that disappeared without a check-out.'], ['Variance', 'Difference between what you counted and what the system expected.'], ['Back-order', 'Vendor shipped part; the rest comes later.'], ['WLL', 'Working load limit — the most a sling or shackle is rated to lift.'], ['3-way match', 'PO vs receipt vs invoice must agree before paying.'],
      ].map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>)}</dl>
    </Section>

    <div className="flex flex-wrap gap-2 justify-center pb-6">
      <Button variant="primary" icon={<ScanLine className="size-4" />} onClick={() => go('invhome')}>Go to Inventory Command</Button>
      <Button icon={<RotateCcw className="size-4" />} onClick={() => { resetTips(); toast.success('Tips will show again') }} data-testid="tips-reset">Show tips again</Button>
    </div>
    <div className="text-xs text-faint text-center -mt-4 pb-4 flex items-center justify-center gap-1.5"><Lightbulb className="size-3.5" />General guidance for a demo — follow your safety manager’s rigging and HazCom programs.</div>
  </div>
}

function Section({ icon, title, children, open: o = false }: { icon: ReactNode; title: string; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(o)
  return <div className="card p-0 overflow-hidden" data-testid="guide-section">
    <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-surface-2"><span className="size-9 rounded-xl bg-surface-2 grid place-items-center">{icon}</span><span className="flex-1 font-semibold text-[15px]">{title}</span><ChevronDown className={cn('size-5 text-muted transition', open && 'rotate-180')} /></button>
    {open && <div className="px-5 pb-5 text-[14.5px] leading-relaxed flex flex-col gap-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:flex [&_ol]:flex-col [&_ol]:gap-1.5">{children}</div>}
  </div>
}
function Kind({ t, e, r }: { t: string; e: string; r: string }) {
  return <div className="rounded-2xl bg-surface-2 p-4"><div className="font-semibold">{t}</div><div className="text-xs text-muted mt-0.5">{e}</div><div className="text-sm mt-2">{r}</div></div>
}
