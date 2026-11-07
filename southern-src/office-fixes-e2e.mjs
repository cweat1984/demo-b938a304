// Office fixes (review/office/REPORT-2.md): PO receiving damaged → credit, bill validation, no negative stock,
// rate profile validation, CSV numbers / contents / CT times, exports audited, AR + AP payments (partial + undo),
// overlapping time held from "Approve all clean", vault big files + company docs, inventory/purchasing branch,
// unique job numbers, invoice preview + Accounting Sync. Run: BASE=http://localhost:4193/ node office-fixes-e2e.mjs
import { chromium } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'; const out = '/workspace/southern-app/screenshots/office-fixes/'; fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const login = async (role, vp = { width: 1920, height: 1080 }) => { const c = await b.newContext({ viewport: vp, acceptDownloads: true }); const p = await c.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1')); await p.goto(base); await p.click(`[data-role=${role}]`); await p.waitForTimeout(1200); return { c, p } }
const go = (p, k) => p.evaluate(k => window.__store.getState().go(k), k).then(() => p.waitForTimeout(700))
const S = (p, fn, arg) => p.evaluate(fn, arg)
const toasts = p => p.locator('[data-sonner-toast]').allInnerTexts().then(t => t.join(' | '))
const closeDrawer = async p => { await S(p, () => window.__store.getState().open(null)); await p.waitForTimeout(500) }
const setBranch = (p, br) => S(p, br => { const s = window.__store.getState(); window.__store.setState({ ui: { ...s.ui, filter: { ...s.ui.filter, branchId: br } } }) }, br)
const dl = async (p, click) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), click()]); const f = out + d.suggestedFilename(); await d.saveAs(f); return { name: d.suggestedFilename(), text: fs.readFileSync(f, 'utf8').replace(/^\ufeff/, '') } }
const csvRows = t => t.split('\r\n').map(l => { const r = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += ch } else if (ch === '"') q = true; else if (ch === ',') { r.push(cur); cur = '' } else cur += ch } r.push(cur); return r })

{ const { c, p } = await login('owner')
  // #5 unique job numbers
  const dupes = await S(p, () => { const n = window.__store.getState().db.jobs.map(j => j.jobNo); return n.filter((x, i) => n.indexOf(x) !== i) })
  ok(dupes.length === 0, `every job number is unique (dupes: ${dupes.join(',') || 'none'})`)

  // #1 PO receive: damaged capped at what's open, never billed, vendor credit requested
  await go(p, 'purchasing'); await p.click('main button:has-text("Purchase orders")'); await p.waitForTimeout(400)
  const poNo = (await p.locator('[data-testid=po-receive-row]').first().locator('xpath=ancestor::*[contains(@class,"card")][1]').innerText().catch(() => '')).match(/PO-\d+/)?.[0]
  await p.locator('[data-testid=po-receive-row]').first().click(); await p.waitForSelector('[data-testid=receive-modal]')
  const m = p.locator('[data-testid=receive-modal]')
  await m.locator('[data-testid=recv-damaged]').first().fill('999'); await p.waitForTimeout(150)
  const dmgV = Number(await m.locator('[data-testid=recv-damaged]').first().inputValue()), goodV = Number(await m.locator('[data-testid=recv-qty]').first().inputValue())
  const info = await m.locator('text=/\\d+\\/\\d+ in/').first().innerText(); const [, rcv, qty] = info.match(/(\d+)\/(\d+) in/).map(Number)
  ok(dmgV <= qty - rcv && dmgV + goodV <= qty - rcv, `receive: damaged 999 is capped at the open qty (${dmgV} damaged + ${goodV} good ≤ ${qty - rcv})`)
  await m.locator('[data-testid=recv-damaged]').first().fill('1'); await p.waitForTimeout(100)
  const pos0 = await S(p, () => window.__store.getState().db.pos.map(x => ({ id: x.id, poNo: x.poNo, billIds: x.billIds ?? [] })))
  await p.click('[data-testid=recv-confirm]'); await p.waitForTimeout(700)
  const r1 = await S(p, pos0 => { const db = window.__store.getState().db; const po = db.pos.find(x => { const o = pos0.find(y => y.id === x.id); return (x.billIds ?? []).length > o.billIds.length }); if (!po) return null; const bill = db.bills.find(b => b.id === po.billIds.at(-1)); return { po: po.poNo, credits: po.credits ?? [], lines: po.lines, inv: bill.invoiceLines, amt: bill.lines.reduce((s, l) => s + l.amount, 0) } }, pos0)
  ok(!!r1, `receive created a bill (${r1?.po ?? poNo})`)
  if (r1) {
    const billedQty = r1.inv.reduce((s, l) => s + l.qty, 0), goodQty = r1.lines.reduce((s, l) => s + l.received, 0)
    ok(r1.credits.length === 1 && r1.credits[0].qty === 1 && r1.credits[0].status === 'Credit requested', `receive: 1 damaged → vendor credit requested (${JSON.stringify(r1.credits.map(x => x.qty))})`)
    ok(r1.lines.every(l => l.received + (l.damaged ?? 0) <= l.qty), 'receive: good + damaged never exceeds ordered on any line')
    ok(billedQty === goodQty && Math.abs(r1.amt - r1.inv.reduce((s, l) => s + l.qty * l.price, 0)) < 0.01, `receive: bill covers good items only (${billedQty} billed = ${goodQty} good, $${r1.amt})`)
  }

  // #10 Enter bill validation
  await go(p, 'payables'); await p.click('main button:has-text("Enter bill")'); await p.waitForTimeout(500)
  await p.fill('[data-testid=bill-no]', '   '); await p.fill('[data-testid=bill-amount]', '100'); ok(await p.locator('[data-testid=bill-save]').isDisabled(), 'enter bill: whitespace-only bill # is blocked')
  await p.fill('[data-testid=bill-no]', 'T-NEG-1'); await p.fill('[data-testid=bill-amount]', '-500'); ok(await p.locator('[data-testid=bill-save]').isDisabled() && await p.locator('[data-testid=bill-amt-err]').count() === 1, 'enter bill: negative amount is blocked with a message')
  await p.fill('[data-testid=bill-amount]', '999999999999'); ok(await p.locator('[data-testid=bill-amt-err]').count() === 1, 'enter bill: $999,999,999,999 shows an over-max warning')
  const n0 = await S(p, () => window.__store.getState().db.bills.length); if (!(await p.locator('[data-testid=bill-save]').isDisabled())) await p.click('[data-testid=bill-save]'); await p.waitForTimeout(400)
  ok(await S(p, () => window.__store.getState().db.bills.length) === n0, 'enter bill: huge amount is not saved')
  const exist = await S(p, () => { const db = window.__store.getState().db; const v = db.vendors[0].id; return db.bills.find(b => b.vendorId === v)?.billNo })
  if (exist) { await p.fill('[data-testid=bill-no]', ' ' + exist.toLowerCase() + '  '); await p.fill('[data-testid=bill-amount]', '120'); await p.click('[data-testid=bill-save]'); await p.waitForTimeout(400); ok(/Duplicate/.test(await toasts(p)) && await S(p, () => window.__store.getState().db.bills.length) === n0, `enter bill: " ${exist.toLowerCase()} " is caught as a duplicate`) }
  await p.keyboard.press('Escape'); await p.waitForTimeout(1100)

  // #4 AP: pay a bill partially, then the rest, then undo
  const billId = await S(p, () => window.__store.getState().db.bills.find(b => b.status === 'Approved')?.id)
  await S(p, id => window.__store.getState().open({ type: 'bill', id }), billId); await p.waitForSelector('[data-testid=ap-pay]')
  const btot = await S(p, id => window.__store.getState().db.bills.find(b => b.id === id).lines.reduce((s, l) => s + l.amount, 0), billId)
  const half = Math.round(btot / 2 * 100) / 100
  await p.fill('[data-testid=ap-pay] [data-testid=pay-amount]', String(half)); await p.selectOption('[data-testid=ap-pay] [data-testid=pay-method]', 'Check')
  ok(await p.locator('[data-testid=ap-pay] [data-testid=pay-submit]').isDisabled(), 'pay bill: Check needs a check # first')
  await p.fill('[data-testid=ap-pay] [data-testid=pay-amount]', String(btot + 1000)); await p.fill('[data-testid=ap-pay] [data-testid=pay-ref]', '10442'); ok(await p.locator('[data-testid=ap-pay] [data-testid=pay-submit]').isDisabled(), 'pay bill: can’t pay more than the open balance')
  await p.fill('[data-testid=ap-pay] [data-testid=pay-amount]', String(half)); await p.click('[data-testid=ap-pay] [data-testid=pay-submit]'); await p.waitForTimeout(500)
  let bs = await S(p, id => { const b = window.__store.getState().db.bills.find(b => b.id === id); return { st: b.status, pays: b.payments ?? [] } }, billId)
  ok(bs.st === 'Approved' && bs.pays.length === 1 && bs.pays[0].ref === '10442' && bs.pays[0].method === 'Check', `pay bill: partial check payment recorded, bill stays open (${bs.st}, ${bs.pays.length} payment)`)
  await p.screenshot({ path: out + 'ap-partial.png' })
  await p.fill('[data-testid=ap-pay] [data-testid=pay-ref]', '10443'); await p.click('[data-testid=ap-pay] [data-testid=pay-submit]'); await p.waitForTimeout(500)
  bs = await S(p, id => { const b = window.__store.getState().db.bills.find(b => b.id === id); return { st: b.status, pays: b.payments ?? [], paidOn: b.paidOn } }, billId)
  ok(bs.st === 'Paid' && bs.pays.length === 2 && !!bs.paidOn, 'pay bill: second payment for the rest marks it Paid')
  await p.locator('[data-testid=pay-undo]').last().click(); await p.waitForTimeout(500)
  bs = await S(p, id => { const b = window.__store.getState().db.bills.find(b => b.id === id); return { st: b.status, pays: b.payments ?? [] } }, billId)
  ok(bs.st === 'Approved' && bs.pays.length === 1, 'pay bill: Undo removes the payment and reopens the bill')
  await closeDrawer(p)

  // #2 AR: partial payment with method / ref / date, then undo
  const invId = await S(p, () => window.__store.getState().db.invoices.find(i => i.amount - i.paid > 1000 && i.status !== 'Paid')?.id)
  await S(p, id => window.__store.getState().open({ type: 'invoice', id }), invId); await p.waitForSelector('[data-testid=ar-pay]')
  const i0 = await S(p, id => { const i = window.__store.getState().db.invoices.find(x => x.id === id); return { open: i.amount - i.paid, n: i.payments.length, st: i.status } }, invId)
  await p.fill('[data-testid=ar-pay] [data-testid=pay-amount]', '1000'); await p.selectOption('[data-testid=ar-pay] [data-testid=pay-method]', 'ACH'); await p.fill('[data-testid=ar-pay] [data-testid=pay-ref]', 'TRC-7781')
  await p.click('[data-testid=ar-pay] [data-testid=pay-submit]'); await p.waitForTimeout(500)
  let i1 = await S(p, id => { const i = window.__store.getState().db.invoices.find(x => x.id === id); return { open: i.amount - i.paid, n: i.payments.length, st: i.status, last: i.payments.at(-1) } }, invId)
  ok(Math.abs(i0.open - 1000 - i1.open) < 0.01 && i1.st === 'Partial' && i1.last.ref === 'TRC-7781' && i1.last.method === 'ACH', `AR: $1,000 partial ACH payment recorded (open ${i0.open} → ${i1.open}, ${i1.st})`)
  await p.screenshot({ path: out + 'ar-partial.png' })
  await p.locator('[data-testid=pay-undo]').last().click(); await p.waitForTimeout(500)
  i1 = await S(p, id => { const i = window.__store.getState().db.invoices.find(x => x.id === id); return { open: i.amount - i.paid, n: i.payments.length, st: i.status } }, invId)
  ok(Math.abs(i1.open - i0.open) < 0.01 && i1.n === i0.n && i1.st === i0.st, `AR: Undo restores the balance and status (${i0.st} → ${i1.st})`)
  ok(await p.locator('[data-testid=inv-print]').count() === 1, 'AR: invoice has Print / PDF')
  await closeDrawer(p)

  // #3 invoice preview → edit → send → queued in Accounting Sync
  await go(p, 'receivables'); await p.click('main button:has-text("Ready to invoice")'); await p.waitForTimeout(400)
  if (await p.locator('[data-testid=inv-create]').count()) {
    const n0i = await S(p, () => window.__store.getState().db.invoices.length)
    await p.locator('[data-testid=inv-create]').first().click(); await p.waitForSelector('[data-testid=inv-preview]')
    ok(await S(p, () => window.__store.getState().db.invoices.length) === n0i, 'invoice: Create opens a preview — nothing sent yet')
    await p.click('[data-testid=inv-add-line]'); await p.locator('[data-testid=inv-line-rate]').last().fill('850'); await p.fill('[data-testid=inv-po]', 'PO-55-881'); await p.fill('[data-testid=inv-tax]', '8.25'); await p.waitForTimeout(200)
    const shown = Number((await p.textContent('[data-testid=inv-total]')).replace(/[^0-9.]/g, ''))
    await p.screenshot({ path: out + 'invoice-preview.png' })
    await p.click('[data-testid=inv-send]'); await p.waitForTimeout(600)
    const ni = await S(p, () => window.__store.getState().db.invoices[0])
    ok(ni.lines.length >= 3 && ni.customerPo === 'PO-55-881' && Math.abs(ni.amount - shown) < 1 && ni.lines.some(l => /Sales tax/.test(l.description)), `invoice: sent with edited lines, PO and tax (${ni.invNo} $${ni.amount} = preview $${shown})`)
    await go(p, 'acctsync'); await p.waitForTimeout(500)
    ok(await S(p, n => (window.__b4?.getState?.() ?? JSON.parse(localStorage.getItem('sc-batch4') || '{"state":{}}').state).sync?.some(s => s.ref === n && s.status === 'Queued') ?? (document.body.innerText.includes(n)), ni.invNo) || (await p.textContent('main')).includes(ni.invNo), `Accounting Sync queues the new invoice ${ni.invNo}`)
  } else ok(true, 'invoice: no job ready to invoice in this seed (skipped)')

  // #9 inventory + purchasing follow the branch filter
  await setBranch(p, 'br-mid'); await go(p, 'inventory'); const ih = await p.textContent('main')
  ok(/items at MID/.test(ih), `inventory header follows the branch (${ih.match(/\d+ items at \w+/)?.[0]})`)
  await go(p, 'purchasing'); ok(/open POs at SLH-MID/.test(await p.textContent('main')), 'purchasing header is scoped to the branch')
  await setBranch(p, 'br-okc'); await go(p, 'inventory'); ok(/items at OKC/.test(await p.textContent('main')), 'inventory back to OKC')

  // #11 adjust stock can't go negative
  await p.getByRole('tab', { name: 'Stock', exact: true }).click().catch(() => {}); await p.waitForTimeout(300)
  await p.click('[data-testid=stock-row] >> nth=0 >> button >> nth=0'); await p.waitForSelector('[data-testid=item-view]'); await p.click('[data-testid=item-adjust]')
  const before = await S(p, () => window.__store.getState().db.items.map(i => i.onHand).join())
  await p.fill('[data-testid=adj-qty]', '-5'); await p.fill('[data-testid=adj-reason]', 'test negative'); await p.click('[data-testid=adj-save]'); await p.waitForTimeout(500)
  ok(/negative/i.test(await toasts(p)) && await S(p, () => window.__store.getState().db.items.map(i => i.onHand).join()) === before && await S(p, () => window.__store.getState().db.items.every(i => i.onHand >= 0)), 'adjust stock: -5 is refused, on-hand unchanged')
  await p.keyboard.press('Escape'); await p.waitForTimeout(1100); await closeDrawer(p)

  // #14 #16 #15 exports: negatives numeric, CT times, codes not ids, audited
  await go(p, 'inventory'); await p.getByRole('tab', { name: 'Ledger', exact: true }).click().catch(() => {}); await p.waitForTimeout(400)
  const led = await dl(p, () => p.locator('main button:has-text("CSV")').first().click()); const lr = csvRows(led.text)
  ok(!led.text.includes("'-") && lr.slice(1).some(r => /^-\d/.test(r[4])), `ledger CSV: negative qty stays numeric (${lr.slice(1).filter(r => /^-\d/.test(r[4])).length} negatives, 0 "'-")`)
  ok(/CT$/.test(lr[1][0]) && !/Z$/.test(lr[1][0]), `ledger CSV: Central time stamps (${lr[1][0]})`)
  const inj = await S(p, () => { const a = document.createElement('a'); return 1 })
  void inj
  await go(p, 'audit'); const au = await dl(p, () => p.locator('main button', { hasText: /CSV|Export/ }).first().click()); const ar = csvRows(au.text)
  ok(/CT$/.test(ar[1][0]), `audit CSV: Central time (${ar[1][0]})`)
  ok(ar.some(r => r[3] === 'Exported CSV' && /inventory-ledger\.csv/.test(r[4])), 'audit log records the ledger export (who / file / rows)')
  await go(p, 'integrations'); const emp = await dl(p, () => p.locator('main button:has-text("Export employees")').click()); const er = csvRows(emp.text)
  ok(er.slice(1).every(r => !/^div-|^br-/.test(r[6]) && !/^br-/.test(r[7])) && er.slice(1).some(r => r[7] === 'SLH-OKC'), `employees CSV: division/branch names & codes (${er[1][6]} / ${er[1][7]})`)
  const ps = await dl(p, () => p.locator('main button:has-text("Sample export")').click()); const pr = csvRows(ps.text)
  ok(pr.length < 2 || (/^SLH-|^\w+-\d/.test(pr[1][0]) && !/^emp-/.test(pr[1][0]) && pr[0].includes('Per diem $') && /^\d+(\.\d+)?$/.test(pr[1][5])), `payroll sample: Emp # ${pr[1]?.[0]}, per diem $ ${pr[1]?.[5]}`)

  // #12 rate profile validation
  await go(p, 'union'); await p.click('main button:has-text("Job rate profiles")'); await p.waitForTimeout(500)
  await p.fill('[data-testid=rp-base]', '-25'); await p.fill('[data-testid=rp-otMult]', '0'); await p.fill('[data-testid=rp-perDiem]', '-100')
  const jobSel = await p.inputValue('[data-testid=rp-job]')
  await p.click('[data-testid=rp-save]'); await p.waitForTimeout(400)
  const saved = await S(p, j => { try { return JSON.stringify(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /union/i.test(k)) || '{}'))).includes(`"${j}"`) && JSON.stringify(JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /union/i.test(k)) || '{}'))).includes('-25') } catch { return false } }, jobSel)
  ok(/Fix the rate profile/.test(await toasts(p)) && !saved, 'rate profile: base -$25, OT 0, per diem -$100 are refused')
  await c.close() }

// #6 overlapping time entries held out of "Approve all clean"; #16 payroll CSV with flagged rows + re-download
{ const { c, p } = await login('payroll')
  await go(p, 'time'); await p.waitForTimeout(400)
  const conf = await p.locator('[data-testid=time-conflict]').count()
  ok(conf >= 2, `time: overlapping entries are flagged on screen (${conf})`)
  const sub0 = await S(p, () => window.__store.getState().db.time.filter(t => t.status === 'Submitted').length)
  if (await p.locator('[data-testid=approve-clean]').count()) {
    const lbl = await p.textContent('[data-testid=approve-clean]'); await p.screenshot({ path: out + 'time-overlaps.png' })
    await p.click('[data-testid=approve-clean]'); await p.waitForTimeout(600)
    const left = await S(p, () => window.__store.getState().db.time.filter(t => t.status === 'Submitted').length)
    ok(/held/.test(lbl) && left > 0 && left < sub0, `time: "Approve all clean" leaves overlaps for review (${lbl.trim()}; ${sub0} → ${left} submitted)`)
  } else ok(false, 'approve-clean button visible')
  const exp = async () => { await p.click('[data-testid=time-export]'); await p.waitForTimeout(400); const b = p.getByRole('button', { name: /^All / }); if (await b.count()) await b.last().click() }
  const f1 = await dl(p, exp); const r1 = csvRows(f1.text)
  ok(r1[0].includes('Status') && r1.some(r => r[0] === 'TOTAL PAYABLE') && r1.at(-1)[0] === 'SCOPE', `payroll CSV: status column + totals row (${r1.length - 2} rows)`)
  const hasFlag = await S(p, () => window.__store.getState().db.time.some(t => t.status === 'Flagged'))
  ok(!hasFlag || r1.some(r => /FLAGGED/.test(r[r1[0].indexOf('Status')] ?? '')), 'payroll CSV: flagged entries are listed as held')
  await p.waitForTimeout(800)
  const f2 = await dl(p, exp).catch(() => null)
  ok(!!f2 && /-copy\.csv$/.test(f2.name) && csvRows(f2.text).length === r1.length, `payroll CSV: exported batch can be downloaded again (${f2?.name})`)
  await c.close() }

// #13 documents vault: big file kept (IndexedDB) or refused, company-level docs
{ const { c, p } = await login('owner')
  await go(p, 'vault'); await p.click('[data-testid=vault-upload]'); await p.waitForTimeout(500)
  await p.selectOption('[data-testid=vault-scope]', 'company'); await p.selectOption('[data-testid=vault-ckind]', 'Insurance / COI')
  await p.setInputFiles('[role=dialog] input[type=file]', { name: 'COI-2026.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2_200_000, 65) })
  await p.click('[data-testid=vault-save]'); await p.waitForTimeout(1200)
  const cd = await S(p, () => window.__store.getState().db.companyDocs ?? [])
  ok(cd.length === 1 && cd[0].kind === 'Insurance / COI' && !!cd[0].blobId && !cd[0].dataUrl, `vault: 2.2 MB company COI saved to device storage (${cd[0]?.blobId ? 'blob' : 'none'})`)
  await p.waitForTimeout(800); await p.fill('[data-testid=vault-search]', 'COI-2026'); await p.waitForTimeout(300); await p.click('[data-testid=vault-doc] >> nth=0 >> button >> nth=1'); await p.waitForTimeout(800)
  ok(await p.locator('[data-testid=vault-download]').count() === 1, 'vault: big file previews with a real Download link (no “Demo file” placeholder)')
  await p.keyboard.press('Escape'); await p.waitForTimeout(1100)
  await p.click('[data-testid=vault-upload]'); await p.waitForTimeout(500)
  await p.setInputFiles('[role=dialog] input[type=file]', { name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(26 * 1024 * 1024, 66) })
  ok(await p.locator('[data-testid=vault-toobig]').count() === 1 && await p.locator('[data-testid=vault-save]').isDisabled(), 'vault: a 26 MB file is refused with the size limit shown')
  await c.close() }

// minors: future ledger rows, Reset demo owner-only, Bids at 1024, WO blank title, branch add, modal focus trap
{ const { c, p } = await login('inventory', { width: 1024, height: 768 })
  const fut = await S(p, () => window.__store.getState().db.invLedger.filter(m => new Date(m.at) > new Date(Date.now() + 60000)).length)
  ok(fut === 0, `inventory ledger has no future-dated rows (${fut})`)
  await go(p, 'bids'); await p.waitForTimeout(500)
  ok(await p.locator('main button:has-text("Reset demo")').count() === 0, 'Vendor Quotes: "Reset demo" hidden from the inventory role')
  const ov = await S(p, () => { const m = document.querySelector('main'); return [...m.querySelectorAll('*')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 2 && getComputedStyle(e).position !== 'fixed' && !e.closest('.overflow-x-auto,.overflow-auto,.no-scrollbar') }).length })
  await p.screenshot({ path: out + 'bids-1024.png' })
  ok(ov === 0, `Vendor Quotes at 1024×768: nothing runs off the right edge (${ov})`)
  await c.close() }
{ const { c, p } = await login('owner')
  await go(p, 'bids'); ok(await p.locator('main button:has-text("Reset demo")').count() === 1, 'owner still has Reset demo')
  await go(p, 'payables'); await p.click('main button:has-text("Enter bill")'); await p.waitForTimeout(400)
  const inDlg = await S(p, () => !!document.activeElement?.closest('[role=dialog]'))
  for (let i = 0; i < 25; i++) await p.keyboard.press('Tab')
  const stillIn = await S(p, () => !!document.activeElement?.closest('[role=dialog]'))
  ok(inDlg && stillIn, `modal: focus moves into the dialog and Tab stays inside (${inDlg}/${stillIn})`)
  await p.keyboard.press('Escape'); await p.waitForTimeout(1100)
  await go(p, 'settings'); await p.click('main button:has-text("Company & branches")'); await p.waitForTimeout(400)
  await p.fill('main input[placeholder^="Code"]', 'slh-okc'); await p.fill('main input[placeholder="City"]', 'Tulsa'); await p.fill('main input[placeholder="State"]', 'OK')
  const nb = await S(p, () => window.__store.getState().db.branches.length); await p.click('[data-testid=branch-add]'); await p.waitForTimeout(400)
  ok(await S(p, () => window.__store.getState().db.branches.length) === nb && /already used/.test(await toasts(p)), 'Add branch: duplicate code SLH-OKC is refused')
  await p.fill('main input[placeholder^="Code"]', 'SLH-TUL'); await p.fill('main input[placeholder="City"]', 'Tulsa'); await p.fill('main input[placeholder="State"]', 'OK'); await p.click('[data-testid=branch-add]'); await p.waitForTimeout(400)
  const tb = await S(p, () => window.__store.getState().db.branches.find(b => b.code === 'SLH-TUL'))
  ok(!!tb && !(tb.lat === 32.4 && tb.lng === -99.7) && tb.lat > 33 && tb.lat < 37.5, `Add branch: Tulsa, OK pinned in Oklahoma (${tb?.lat}, ${tb?.lng})`)
  await go(p, 'shop'); const nwo = p.locator('main button', { hasText: /Work order|New work order/ }).first()
  if (await nwo.count()) { await nwo.click(); await p.waitForTimeout(500); const t = p.locator('[role=dialog] input').first(); await t.fill('    '); ok(await p.locator('[data-testid=wo-save]').isDisabled(), 'Shop: whitespace-only work-order title is blocked'); await p.keyboard.press('Escape'); await p.waitForTimeout(1100) } else ok(false, 'Shop new work order button')
  await c.close() }

// leftovers: Enter bill branch, one low-stock number, Invoice-all preview, one open PM per unit, ARIA tabs, skip link
{ const { c, p } = await login('owner')
  await setBranch(p, 'br-mid'); await go(p, 'payables'); await p.click('main button:has-text("Enter bill")'); await p.waitForTimeout(500)
  ok(await p.inputValue('[data-testid=bill-branch]') === 'br-mid', 'Enter bill: branch defaults to the branch filter (SLH-MID)')
  await p.fill('[data-testid=bill-no]', 'MID-TEST-1'); await p.fill('[data-testid=bill-amount]', '250'); await p.click('[data-testid=bill-save]'); await p.waitForTimeout(500)
  ok(await S(p, () => window.__store.getState().db.bills.find(b => b.billNo === 'MID-TEST-1')?.branchId) === 'br-mid', 'Enter bill: saved to SLH-MID (not hard-coded OKC)')
  await setBranch(p, 'br-okc')
  // low stock: Inventory KPI = in-service items at/below min; Purchasing "To reorder" = Inventory Command queue
  await go(p, 'inventory'); const kl = await p.innerText('[data-testid=kpi-low]')
  const want = await S(p, () => window.__store.getState().db.items.filter(i => (i.branchId ?? 'br-okc') === 'br-okc' && i.onHand <= i.min && !i.oos).length)
  ok(Number(kl.match(/At or below min\s*(\d+)/i)?.[1]) === want && /At or below min/i.test(kl), `low stock: Inventory KPI "${kl.replace(/\s+/g, ' ').trim()}" = ${want}`)
  const tr = Number(kl.match(/(\d+) to reorder/)?.[1])
  await go(p, 'purchasing'); const pk = await p.locator('main', { hasText: 'To reorder' }).locator('text=/^To reorder$/').first().locator('xpath=..').innerText()
  await go(p, 'invhome'); const qn = await p.locator('[data-testid=q-reorder]').innerText().catch(() => '')
  ok(Number(pk.match(/\n(\d+)/)?.[1] ?? pk.match(/\d+/)?.[0]) === tr && (!qn || new RegExp(`\\b${tr}\\b`).test(qn)), `low stock: "to reorder" agrees on Inventory (${tr}), Purchasing (${pk.replace(/\s+/g, ' ').slice(0, 40)}) and Inventory Command`)
  // Invoice all → preview + confirm, nothing sent on Cancel
  await go(p, 'receivables'); await p.click('main button:has-text("Ready to invoice")'); await p.waitForTimeout(400)
  if (await p.locator('[data-testid=invoice-all]').count()) {
    const n0 = await S(p, () => window.__store.getState().db.invoices.length)
    await p.click('[data-testid=invoice-all]'); await p.waitForTimeout(600)
    ok(await p.locator('[data-testid=invoice-all-preview]').count() === 1 && await S(p, () => window.__store.getState().db.invoices.length) === n0, 'Invoice all: shows a preview of every invoice and waits for confirm')
    await p.screenshot({ path: out + 'invoice-all-preview.png' })
    await p.locator('[role=dialog] button:has-text("Cancel — change nothing")').click(); await p.waitForTimeout(500)
    ok(await S(p, () => window.__store.getState().db.invoices.length) === n0, 'Invoice all: Cancel sends nothing')
  } else ok(true, 'Invoice all: nothing ready (skipped)')
  // PMs: seed has at most one open PM per unit; a second PM is refused
  const dupPm = await S(p, () => { const m = {}; window.__store.getState().db.workOrders.filter(w => w.status !== 'Closed' && /\bPM\b|PM-[A-Z]/i.test(w.title)).forEach(w => { m[w.unitId] = (m[w.unitId] ?? 0) + 1 }); return Object.values(m).filter(n => n > 1).length })
  ok(dupPm === 0, `shop: no unit has two open PMs in the seed (${dupPm})`)
  const pmUnit = await S(p, () => window.__store.getState().db.workOrders.find(w => w.status !== 'Closed' && /\bPM\b|PM-[A-Z]/i.test(w.title))?.unitId)
  await go(p, 'shop'); await p.locator('main button', { hasText: /Work order|New work order/ }).first().click(); await p.waitForTimeout(500)
  const sel = p.locator('[role=dialog] select').first()
  if (pmUnit && await sel.locator(`option[value="${pmUnit}"]`).count()) {
    await sel.selectOption(pmUnit); await p.locator('[role=dialog] input').first().fill('PM-A service'); const w0 = await S(p, () => window.__store.getState().db.workOrders.length)
    await p.click('[data-testid=wo-save]'); await p.waitForTimeout(500)
    ok(await S(p, () => window.__store.getState().db.workOrders.length) === w0 && /already open/.test(await toasts(p)), 'shop: a second open PM on the same unit is refused')
  } else ok(false, 'shop: unit with an open PM is in the picker')
  await p.keyboard.press('Escape'); await p.waitForTimeout(1100)
  // ARIA tabs + arrow keys
  await go(p, 'inventory'); const tl = p.locator('main [role=tablist]').first()
  const t0 = await tl.locator('[role=tab][aria-selected=true]').innerText(); await tl.locator('[role=tab][aria-selected=true]').focus(); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(400)
  const t1 = await p.locator('main [role=tablist]').first().locator('[role=tab][aria-selected=true]').innerText(); const foc = await S(p, () => document.activeElement?.getAttribute('role') + '|' + document.activeElement?.getAttribute('aria-selected'))
  ok(t0 !== t1 && foc === 'tab|true', `tabs: role=tab + aria-selected; → moves from "${t0.trim()}" to "${t1.trim()}" and keeps focus`)
  ok(await tl.locator('[role=tab][tabindex="0"]').count() === 1, 'tabs: only the selected tab is in the Tab order')
  // skip link
  await p.reload(); await p.waitForTimeout(1500); await p.keyboard.press('Tab')
  const first = await S(p, () => document.activeElement?.getAttribute('data-testid')); await p.keyboard.press('Enter'); await p.waitForTimeout(200)
  ok(first === 'skip-link' && await S(p, () => document.activeElement?.id) === 'main-content', `skip link: first Tab stop is "Skip to content" and Enter lands in main (${first})`)
  await c.close() }

ok(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' / ')})`)
await b.close()
console.log(`\n${fails.length ? fails.length + ' FAILED' : 'ALL PASSED'}`); process.exit(fails.length ? 1 : 0)
