// Accounting / sales break tests. Each case asserts the behavior the books should have.
// They fail on the current app; that failure is the bug. No app code is changed here.
// Run: BASE=http://127.0.0.1:4174/ node tests/accounting-sales-break.mjs
import { chromium, devices } from 'playwright'
import { readFileSync } from 'node:fs'

const base = process.env.BASE || 'http://127.0.0.1:4174/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })

async function fresh(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts })
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  if (opts.clock) await page.clock.install({ time: opts.clock })
  await page.goto(base)
  await page.waitForSelector('[data-role=owner]')
  await page.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  await page.waitForTimeout(250)
  return { ctx, page }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg) }
const dollars = (s) => [...String(s).matchAll(/-?\$[\d,]+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/[$,]/g, '')))

const tests = []
const bug = (name, fn) => tests.push([name, fn])

bug('1 displayed cents do not add up to the invoice or the job-cost category', async () => {
  const { ctx, page } = await fresh()
  const inv = await page.evaluate(() => {
    const db = window.__store.getState().db
    const job = db.jobs.find((j) => !j.invoiceNo && !db.invoices.some((i) => i.jobId === j.id) && j.stage !== 'Quote')
    const made = window.__actions.createInvoice(job.id, { lines: [{ description: 'Mats A', qty: 1, rate: 10.4 }, { description: 'Mats B', qty: 1, rate: 10.4 }, { description: 'Mats C', qty: 1, rate: 10.4 }] })
    const row = window.__store.getState().db.invoices.find((i) => i.invNo === made.invNo)
    window.__store.getState().open({ type: 'invoice', id: row.id })
    return { id: row.id, no: row.invNo, amount: row.amount, jobId: job.id }
  })
  await page.waitForTimeout(300)
  const shown = await page.evaluate(() => {
    const root = document.body.innerText
    return root
  })
  expect(inv.amount === 31.2, `setup: invoice amount should be 31.20, got ${inv.amount}`)
  // The open invoice the accountant is looking at.
  expect(shown.includes('$31.20'), `invoice ${inv.no} total should show $31.20 (3 × $10.40). Screen text has no $31.20`)
  expect((shown.match(/\$10\.40/g) || []).length >= 3, `each $10.40 line should show $10.40, not a rounded dollar`)

  await page.evaluate((id) => {
    const j = window.__store.getState().db.jobs.find((x) => x.id === id)
    for (const n of [1, 2, 3]) window.__actions.addCost({ jobId: id, date: j.startDate, category: 'Materials', description: `Cent mat ${n}`, amount: 10.4, source: 'Manual', by: 'Break test' })
    window.__store.getState().open({ type: 'job', id })
  }, inv.jobId)
  await page.getByRole('tab', { name: 'Job cost' }).click()
  await page.getByText('Materials', { exact: true }).first().click()
  await page.waitForTimeout(200)
  const costText = await page.locator('body').innerText()
  const shownCents = (costText.match(/\$10\.40/g) || []).length
  expect(shownCents >= 3, `job-cost should show each $10.40 material line in cents. Saw ${shownCents} of them.`)
  await ctx.close()
})

bug('2 three $10.10 payments never mark a $30.30 invoice paid', async () => {
  const { ctx, page } = await fresh()
  const inv = await page.evaluate(() => {
    const db = window.__store.getState().db
    const job = db.jobs.find((j) => !j.invoiceNo && !db.invoices.some((i) => i.jobId === j.id) && j.stage !== 'Quote')
    const made = window.__actions.createInvoice(job.id, { lines: [{ description: 'Day', qty: 3, rate: 10.1 }] })
    const row = window.__store.getState().db.invoices.find((i) => i.invNo === made.invNo)
    return { id: row.id, date: row.date, amount: row.amount }
  })
  expect(inv.amount === 30.3, `setup amount ${inv.amount}`)
  for (let n = 0; n < 3; n++) {
    await page.evaluate((id) => window.__store.getState().open({ type: 'invoice', id }), inv.id)
    await page.waitForSelector('[data-testid=pay-amount]')
    await page.locator('[data-testid=pay-method]').selectOption('ACH')
    await page.locator('[data-testid=pay-amount]').fill('10.10')
    await page.locator('[data-testid=pay-submit]').click()
    await page.waitForTimeout(200)
  }
  const after = await page.evaluate((id) => {
    const i = window.__store.getState().db.invoices.find((x) => x.id === id)
    return { status: i.status, paid: i.paid, amount: i.amount, n: i.payments.length, remain: i.amount - i.paid }
  }, inv.id)
  expect(after.n === 3, `expected 3 payments, got ${after.n}`)
  expect(after.status === 'Paid', `invoice should be Paid after $10.10 × 3 = $30.30. status=${after.status} paid=${after.paid} remain=${after.remain}`)
  expect(Math.abs(after.paid - 30.3) < 0.001, `paid should be 30.30 exactly, got ${after.paid}`)
  await ctx.close()
})

bug('3 the same check number can be posted twice against one invoice', async () => {
  const { ctx, page } = await fresh()
  const inv = await page.evaluate(() => {
    const db = window.__store.getState().db
    const job = db.jobs.find((j) => !j.invoiceNo && !db.invoices.some((i) => i.jobId === j.id) && j.stage !== 'Quote')
    const made = window.__actions.createInvoice(job.id, { lines: [{ description: 'Crane', qty: 1, rate: 500 }] })
    const row = window.__store.getState().db.invoices.find((i) => i.invNo === made.invNo)
    window.__store.getState().open({ type: 'invoice', id: row.id })
    return { id: row.id }
  })
  for (let n = 0; n < 2; n++) {
    await page.waitForSelector('[data-testid=pay-amount]')
    await page.locator('[data-testid=pay-method]').selectOption('Check')
    await page.locator('[data-testid=pay-amount]').fill('100.00')
    await page.locator('[data-testid=pay-ref]').fill('1008')
    await page.locator('[data-testid=pay-submit]').click()
    await page.waitForTimeout(250)
  }
  const pays = await page.evaluate((id) => window.__store.getState().db.invoices.find((i) => i.id === id).payments.map((p) => ({ amount: p.amount, ref: p.ref })), inv.id)
  const dupes = pays.filter((p) => p.ref === '1008')
  expect(dupes.length === 1, `check 1008 for $100 should be rejected the second time. Posted ${dupes.length} times: ${JSON.stringify(pays)}`)
  await ctx.close()
})

bug('4 quote cost lines do not add up to the cost budget', async () => {
  const { ctx, page } = await fresh()
  await page.evaluate(() => window.__store.getState().go('quotes'))
  await page.locator('[data-testid=quote-card]').first().click()
  await page.waitForSelector('[data-testid=quote-sheet]')
  const parsed = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid=quote-sheet]')
    const blocks = [...sheet.querySelectorAll('.rounded-2xl.bg-surface-2')]
    const rows = (el) => [...el.querySelectorAll('.flex.justify-between')].map((r) => r.innerText.replace(/\s+/g, ' '))
    return { price: rows(blocks[0]), cost: rows(blocks[1]) }
  })
  const nums = (rows) => rows.map((r) => dollars(r).at(-1))
  const cost = nums(parsed.cost)
  const budget = cost.at(-1)
  const sum = cost.slice(0, -1).reduce((s, n) => s + n, 0)
  expect(Number.isFinite(budget) && cost.length > 2, `could not read cost lines: ${parsed.cost.join(' | ')}`)
  expect(sum === budget, `cost lines sum to $${sum.toLocaleString()} but the budget row is $${budget.toLocaleString()} (${parsed.cost.join(' | ')})`)
  await ctx.close()
})

bug('5 repricing a quote makes the invoice miss the accepted price', async () => {
  const { ctx, page } = await fresh()
  await page.evaluate(() => window.__store.getState().go('quotes'))
  await page.locator('[data-testid=quote-card]').first().click()
  await page.waitForSelector('[data-testid=margin-slider]')
  const setMargin = async (n) => {
    await page.locator('[data-testid=margin-slider]').evaluate((el, n) => {
      const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      proto.set.call(el, String(n))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, n)
    await page.waitForTimeout(100)
  }
  await setMargin(13)
  if (!(await page.locator('[data-testid=margin-apply]').count())) await setMargin(40)
  await page.locator('[data-testid=margin-apply]').click()
  await page.waitForTimeout(300)
  const cmp = await page.evaluate(async () => {
    const util = await import('/src/lib/util.ts')
    const no = (document.body.innerText.match(/Quote Q-(\d+)/) || [])[1]
    const job = window.__store.getState().db.jobs.find((x) => x.jobNo === no)
    const days = util.diffDays(job.endDate, job.startDate) + 1
    const invoiced = Math.round((job.dayRate * days + job.quote.mobDemob) * 100) / 100
    return { no: job.jobNo, price: job.quote.revenue, dayRate: job.dayRate, days, mob: job.quote.mobDemob, invoiced }
  })
  expect(cmp.invoiced === cmp.price, `accepted price $${cmp.price} on Q-${cmp.no} bills as $${cmp.invoiced} (day rate $${cmp.dayRate} × ${cmp.days} days + mob $${cmp.mob})`)
  await ctx.close()
})

bug('6 extras are billed for the whole job, not the signed ticket days', async () => {
  const { ctx, page } = await fresh()
  const setup = await page.evaluate(() => {
    const db = window.__store.getState().db
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const span = (j) => Math.round((new Date(j.endDate + 'T12:00') - new Date(j.startDate + 'T12:00')) / 86400000) + 1
    const signedDays = (j) => new Set(db.tickets.filter((t) => t.jobId === j.id && (t.signedAt || t.signerName)).map((t) => t.date)).size
    const job = db.jobs.find((j) => j.stage === 'In Progress' && !j.invoiceNo && signedDays(j) > 0 && signedDays(j) < span(j))
    const signed = signedDays(job)
    const r = window.__actions.addExtra(job.id, { kind: 'equipment', role: 'Manlift', qty: 1, billable: true, again: true, from: job.startDate, reason: 'break test manlift' })
    window.__store.setState((s) => ({
      db: {
        ...s.db,
        jobs: s.db.jobs.map((j) => j.id === job.id ? { ...j, stage: 'Complete', status: 'Complete', invoiceNo: undefined } : j),
        tickets: s.db.tickets.map((t) => t.jobId === job.id ? { ...t, signedAt: t.signedAt || new Date().toISOString(), signerName: t.signerName || 'Pat Customer' } : t),
        invoices: s.db.invoices.filter((i) => i.jobId !== job.id),
      },
    }))
    return { id: job.id, no: job.jobNo, signed, span: span(job), extraOk: r.ok, today }
  })
  expect(setup.extraOk, 'could not add the manlift')
  await page.evaluate(() => window.__store.getState().go('receivables'))
  await page.getByRole('tab', { name: /Ready to invoice/ }).click()
  const ready = await page.locator('[data-testid=inv-create]').count()
  const card = page.locator('.card', { has: page.locator('[data-testid=inv-create]') }).filter({ hasText: `#${setup.no}` })
  expect(await card.count() === 1, `job #${setup.no} should be ready to invoice (${setup.signed} signed days of ${setup.span}). Create-invoice buttons on screen: ${ready}`)
  await card.locator('[data-testid=inv-create]').click()
  await page.waitForSelector('[data-testid=inv-preview]')
  const line = await page.evaluate(() => [...document.querySelectorAll('[data-testid=inv-line]')].map((r) => ({
    desc: r.querySelector('[data-testid=inv-line-desc]')?.value || '',
    qty: r.querySelector('[data-testid=inv-line-qty]')?.value || '',
  })))
  const day = line.find((l) => /day rate/.test(l.desc))
  const man = line.find((l) => /Manlift/.test(l.desc))
  expect(Number(day?.qty) === setup.signed, `day rate should bill ${setup.signed} signed days. Lines: ${JSON.stringify(line)}`)
  expect(Number(man?.qty) === setup.signed, `manlift should bill the ${setup.signed} signed ticket days, not the ${setup.span}-day span. Line: ${JSON.stringify(man)}`)
  await ctx.close()
})

bug('7 support equipment stays on the ticket the day it is picked up', async () => {
  const { ctx, page } = await fresh()
  const setup = await page.evaluate(() => {
    const db = window.__store.getState().db
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const job = db.jobs.find((j) => j.stage === 'In Progress' && j.startDate <= today && j.endDate >= today && !db.tickets.some((t) => t.jobId === j.id && t.date === today))
    const t = { id: 'tk-break-light', jobId: job.id, date: today, supervisorId: job.supervisorId || db.employees[0].id, crewIds: [db.employees[0].id], hours: { 'Lifting & Hoisting': 8 }, work: 'PROBE LIGHT TOWER TICKET', equipmentIn: '', equipmentOut: '', delays: '', pctComplete: 40, expectedFinish: job.endDate, status: 'Signed', photos: 0, submittedAt: new Date().toISOString(), signerName: 'Pat Customer', signerTitle: 'Super', signedAt: new Date().toISOString() }
    window.__actions.saveTicket(t)
    const added = window.__actions.addExtra(job.id, { kind: 'equipment', role: 'Light tower', qty: 1, billable: true, again: true, from: today, reason: 'break test tower' })
    return { jobId: job.id, extraId: added.id, no: job.jobNo, ok: added.ok }
  })
  expect(setup.ok, 'could not add the light tower')
  await page.evaluate(() => window.__store.getState().go('tickets'))
  await page.locator('button', { hasText: `#${setup.no}` }).first().click()
  await page.waitForSelector('[data-testid=ticket-extra]')
  const read = () => page.locator('[data-testid=ticket-extra]').allInnerTexts()
  const before = await read()
  expect(before.some((t) => /Light tower/.test(t)), `tower should be on the ticket before pickup. Saw: ${before.join(' | ')}`)
  for (const step of ['Requested', 'Acknowledged', 'Pickup scheduled']) {
    await page.evaluate(({ jobId, extraId, step }) => window.__actions.calloff(jobId, extraId, step), { ...setup, step })
    await page.waitForTimeout(100)
    const mid = await read()
    expect(mid.some((t) => /Light tower/.test(t)), `tower must stay on the ticket at "${step}". Saw: ${mid.join(' | ') || 'nothing'}`)
  }
  await page.evaluate((s) => window.__actions.calloff(s.jobId, s.extraId, 'Picked up'), setup)
  await page.waitForTimeout(200)
  const after = await read()
  expect(!after.some((t) => /Light tower/.test(t)), `picked up today, so the tower should be off today's ticket. Still shows: ${after.join(' | ')}`)
  await ctx.close()
})

bug('8 a credit left on the customer account is missing from AR', async () => {
  const { ctx, page } = await fresh()
  const cr = await page.evaluate(() => {
    const A = window.__actions
    const paid = window.__store.getState().db.invoices.find((i) => i.status === 'Paid' && !i.kind && i.amount > 2000)
    const job = window.__store.getState().db.jobs.find((j) => j.id === paid.jobId)
    const add = A.addExtra(job.id, { kind: 'equipment', role: 'Generator', qty: 1, billable: true, again: true, from: job.startDate, to: job.startDate, reason: 'break credit' })
    const sup = A.billChange(job.id)
    const supInv = window.__store.getState().db.invoices.find((i) => i.invNo === sup.invNo)
    A.recordPayment(supInv.id, supInv.amount, 'ACH', 'PAY-SUP', supInv.date)
    A.removeExtra(job.id, add.id)
    const memo = A.billChange(job.id)
    return { memo, addOk: add.ok }
  })
  expect(cr.addOk && cr.memo.ok && cr.memo.onAccount === 210, `setup credit: ${JSON.stringify(cr)}`)
  await page.evaluate(() => window.__store.getState().go('receivables'))
  await page.waitForTimeout(300)
  const text = await page.locator('body').innerText()
  expect(text.includes(cr.memo.invNo), `${cr.memo.invNo} is a $210 credit on account and should appear in open AR. It is not on the receivables screen.`)
  const books = await page.evaluate((no) => {
    const inv = window.__store.getState().db.invoices
    const memo = inv.find((i) => i.invNo === no)
    const open = inv.filter((i) => Math.abs(i.amount - i.paid) > 0.005)
    const listed = open.some((i) => i.id === memo.id)
    const ar = Math.round(open.reduce((s, i) => s + i.amount - i.paid, 0) * 100) / 100
    return { listed, amount: memo.amount, paid: memo.paid, status: memo.status, ar }
  }, cr.memo.invNo)
  expect(books.listed, `credit ${cr.memo.invNo} (${books.amount} paid ${books.paid}, ${books.status}) should be in open AR ($${books.ar})`)
  await ctx.close()
})

bug('9 QuickBooks queue drops a second ACH payment and keeps an undone one', async () => {
  const { ctx, page } = await fresh()
  await page.evaluate(() => window.__store.getState().go('acctsync'))
  await page.waitForSelector('[data-testid=acct-sync]')
  await page.waitForTimeout(400)
  const info = await page.evaluate(() => {
    const bill = window.__store.getState().db.bills.find((b) => b.status === 'Approved' && !(b.payments || []).length)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const date = bill.date <= today ? today : bill.date
    window.__actions.payBill(bill.id, { amount: 25.5, date, method: 'ACH', ref: '' })
    return { id: bill.id, no: bill.billNo, date }
  })
  await page.waitForTimeout(500)
  await page.evaluate((info) => window.__actions.payBill(info.id, { amount: 25.5, date: info.date, method: 'ACH', ref: '' }), info)
  await page.waitForTimeout(500)
  const rows = async () => page.locator('[data-testid=sync-row]').evaluateAll((els, no) => els.map((e) => e.innerText.replace(/\s+/g, ' ')).filter((t) => t.includes(no)), info.no)
  const queued = await rows()
  const sum = queued.flatMap((t) => dollars(t)).reduce((s, n) => s + n, 0)
  await page.evaluate((id) => { window.__actions.undoBillPayment(id, 1); window.__actions.undoBillPayment(id, 0) }, info.id)
  await page.waitForTimeout(400)
  const left = await rows()
  const problems = []
  if (sum !== 51) problems.push(`two $25.50 ACH payments on ${info.no} queued $${sum} instead of $51.00 (${queued.join(' || ') || 'nothing'})`)
  if (left.length) problems.push(`undoing both payments left ${left.length} QuickBooks row(s): ${left.join(' || ')}`)
  expect(problems.length === 0, problems.join('; '))
  await ctx.close()
})

// Bug 10 (two tabs overwriting each other) is owned by the dispatch fixer on PR #7. Not run here.
void async function skippedTwoTab() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const prep = async (page) => {
    await page.addInitScript(() => {
      localStorage.setItem('sc-tour-seen', '1')
      const Orig = window.BroadcastChannel
      window.BroadcastChannel = class extends Orig {
        constructor(name) {
          super(name)
          const post = this.postMessage.bind(this)
          this.postMessage = (data) => setTimeout(() => post(data), 400)
        }
      }
    })
    await page.goto(base)
    await page.waitForSelector('[data-role=owner]')
    await page.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  }
  const a = await ctx.newPage()
  const b = await ctx.newPage()
  await prep(a)
  await prep(b)
  await a.waitForTimeout(400)
  const inv = await a.evaluate(() => {
    const i = window.__store.getState().db.invoices.find((x) => !x.kind && x.amount - x.paid > 2000)
    return { id: i.id, paid: i.paid, amount: i.amount, date: i.date }
  })
  await Promise.all([
    a.evaluate((x) => window.__actions.recordPayment(x.id, 111.11, 'ACH', 'TAB-A', x.date), inv),
    b.evaluate((x) => window.__actions.recordPayment(x.id, 222.22, 'Wire', 'TAB-B', x.date), inv),
  ])
  await a.waitForTimeout(1200)
  const after = []
  for (const pg of [a, b]) after.push(await pg.evaluate((id) => {
    const i = window.__store.getState().db.invoices.find((x) => x.id === id)
    return { paid: Math.round(i.paid * 100) / 100, refs: i.payments.map((p) => p.ref) }
  }, inv.id))
  const expectBoth = (label, row) => {
    expect(row.refs.includes('TAB-A') && row.refs.includes('TAB-B'), `${label} should show both TAB-A ($111.11) and TAB-B ($222.22). Got ${JSON.stringify(row)}`)
    expect(Math.abs(row.paid - (inv.paid + 111.11 + 222.22)) < 0.02, `${label} paid should be ${(inv.paid + 333.33).toFixed(2)}, got ${row.paid}`)
  }
  expectBoth('tab A', after[0])
  expectBoth('tab B', after[1])
  await ctx.close()
}

bug('11 pipeline column total counts jobs the column does not show', async () => {
  const { ctx, page } = await fresh()
  await page.evaluate(() => window.__store.getState().go('jobs'))
  await page.getByRole('tab', { name: 'Pipeline' }).click()
  await page.waitForTimeout(300)
  const cols = await page.evaluate(() => [...document.querySelectorAll('.w-72.shrink-0')].map((c) => ({
    head: c.querySelector('div')?.innerText.replace(/\s+/g, ' ') || '',
    cards: c.querySelectorAll('button.card').length,
    more: /more|showing/i.test(c.innerText),
  })))
  const scheduled = cols.find((c) => c.head.startsWith('Scheduled'))
  expect(scheduled, `no Scheduled column in ${JSON.stringify(cols)}`)
  const count = Number((scheduled.head.match(/Scheduled\s+(\d+)/) || [])[1])
  expect(scheduled.cards === count, `Scheduled header says ${count} jobs (${scheduled.head}) but only ${scheduled.cards} cards render, and there is no "more" control`)
  await ctx.close()
})

bug('12 a manual job cost of a trillion dollars is accepted', async () => {
  const { ctx, page } = await fresh()
  const jobId = await page.evaluate(() => {
    const j = window.__store.getState().db.jobs.find((x) => x.stage === 'In Progress')
    window.__store.getState().open({ type: 'job', id: j.id })
    return j.id
  })
  await page.getByRole('tab', { name: 'Job cost' }).click()
  await page.locator('button', { hasText: /^Cost$/ }).last().click()
  await page.getByPlaceholder('e.g. City street-use permit').fill('Probe huge cost')
  await page.getByLabel('Amount ($)').fill('999999999999')
  await page.getByRole('button', { name: 'Post cost' }).click()
  await page.waitForTimeout(200)
  const stored = await page.evaluate((id) => window.__store.getState().db.costs.filter((c) => c.jobId === id && c.description === 'Probe huge cost').map((c) => c.amount), jobId)
  expect(stored.length === 0, `a $${stored[0]} manual cost should be rejected the way a vendor bill over $2,000,000 is. It was saved.`)
  await ctx.close()
})

bug('13 win rate treats old losses as this year and drops closed-out wins', async () => {
  const todayCtx = await fresh()
  await todayCtx.page.evaluate(() => window.__store.getState().go('quotes'))
  await todayCtx.page.getByText('Win rate', { exact: true }).waitFor()
  const todayCard = (await todayCtx.page.getByText('Win rate', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]').innerText()).replace(/\s+/g, ' ')
  const today = await todayCtx.page.evaluate((card) => {
    const y0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 4) + '-01-01'
    const db = window.__store.getState().db
    const shownWon = Number((card.match(/(\d+)\s+won/) || [])[1])
    const shownLost = Number((card.match(/won\D+(\d+)\s+lost/) || [])[1])
    const wonYtd = db.jobs.filter((j) => !j.quoteLost && j.stage !== 'Quote' && j.quote.quotedAt >= y0).length
    const lostYtd = db.jobs.filter((j) => j.quoteLost && j.quoteLost.at >= y0).length
    return { sub: card, shownWon, shownLost, wonYtd, lostYtd }
  }, todayCard)
  const problems = []
  if (today.shownWon !== today.wonYtd) problems.push(`win rate says ${today.shownWon} won but ${today.wonYtd} quotes were won this year (closed-out jobs are missing). ${today.sub.slice(0, 220)}`)
  if (today.shownLost !== today.lostYtd) problems.push(`win rate says ${today.shownLost} lost YTD but ${today.lostYtd} losses are dated this year`)
  await todayCtx.ctx.close()

  const next = await fresh({ clock: new Date('2027-01-01T18:00:00Z') })
  await next.page.evaluate(() => window.__store.getState().go('quotes'))
  await next.page.getByText('Win rate', { exact: true }).waitFor()
  const janCard = (await next.page.getByText('Win rate', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]').innerText()).replace(/\s+/g, ' ')
  const jan = await next.page.evaluate((card) => {
    const y0 = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }).slice(0, 4) + '-01-01'
    const db = window.__store.getState().db
    const shownLost = Number((card.match(/won\D+(\d+)\s+lost/) || [])[1])
    const lostYtd = db.jobs.filter((j) => j.quoteLost && j.quoteLost.at >= y0).length
    const lostPrior = db.jobs.filter((j) => j.quoteLost && j.quoteLost.at < y0).length
    return { sub: card, y0, shownLost, lostYtd, lostPrior }
  }, janCard)
  if (jan.y0 !== '2027-01-01') problems.push(`clock did not move the business date (y0=${jan.y0})`)
  else if (jan.shownLost !== jan.lostYtd) problems.push(`on ${jan.y0} the win rate still counts ${jan.shownLost} losses, including ${jan.lostPrior} from before this year. YTD losses are ${jan.lostYtd}. ${jan.sub.slice(0, 180)}`)
  await next.ctx.close()
  expect(problems.length === 0, problems.join(' | '))
})

bug('14 Paychex overtime does not match job cost for the same hours', async () => {
  const { ctx, page } = await fresh()
  const setup = await page.evaluate(() => {
    const db = window.__store.getState().db
    const week = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']
    const emp = db.employees.find((e) => e.status === 'Active' && e.rate > 0 && !db.time.some((t) => t.employeeId === e.id && t.date >= week[0] && t.date <= '2026-11-08'))
    const jobs = db.jobs.filter((j) => j.stage === 'In Progress').slice(0, 2)
    const ids = []
    week.forEach((date, i) => {
      const r = window.__actions.submitTime({ employeeId: emp.id, jobId: jobs[i === 4 ? 1 : 0].id, date, activity: 'Lifting & Hoisting', start: '06:00', end: '16:00', mealMin: 0, perDiems: [] })
      if (!r.ok) throw new Error(r.reason)
    })
    const mine = window.__store.getState().db.time.filter((t) => t.employeeId === emp.id && week.includes(t.date))
    window.__actions.approveTime(mine.map((t) => t.id))
    window.__actions.exportTime(mine.map((t) => t.id))
    return { emp: `${emp.first} ${emp.last}`, rate: emp.rate, ids: mine.map((t) => t.id), jobs: jobs.map((j) => j.jobNo), hours: mine.reduce((s, t) => s + t.hours, 0) }
  })
  expect(setup.hours === 50, `expected 50 hours submitted, got ${setup.hours}`)
  await page.evaluate(() => window.__store.getState().go('time'))
  await page.getByRole('button', { name: 'Previous week' }).click()
  await page.waitForTimeout(300)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-testid=time-paychex]').click(),
  ])
  const csv = readFileSync(await download.path(), 'utf8')
  const lines = csv.split(/\r?\n/).filter((l) => l.includes(setup.emp.split(' ')[0]) && l.includes('Overtime'))
  // Hours is the 5th column. Job Number is the last.
  const ot = lines.reduce((s, l) => s + Number(l.split(',')[4]), 0)
  const jobCell = lines.map((l) => l.split(',').at(-1)).join(' ')
  const costOt = await page.evaluate(async (ids) => {
    const logic = await import('/src/data/logic.ts')
    const db = window.__store.getState().db
    const mine = ids.map((id) => db.time.find((t) => t.id === id)).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
    let h0 = 0, weeklyOt = 0
    for (const t of mine) { const reg = Math.max(0, Math.min(t.hours, 40 - h0)); weeklyOt += t.hours - reg; h0 += t.hours }
    const jobs = [...new Set(mine.map((t) => t.jobId))]
    const labor = jobs.reduce((s, jobId) => {
      const c = logic.jobCosting(db, db.jobs.find((j) => j.id === jobId))
      return s + c.lines.filter((l) => l.category === 'Labor' && ids.includes(l.refId)).reduce((a, l) => a + l.amount, 0)
    }, 0)
    const rate = db.employees.find((e) => e.id === mine[0].employeeId)?.rate ?? 0
    const expected = Math.round(((mine.reduce((s, t) => s + t.hours, 0) - weeklyOt) * rate + weeklyOt * rate * 1.5) * 1.32 * 100) / 100
    return { weeklyOt, labor: Math.round(labor * 100) / 100, expected }
  }, setup.ids)
  const jobCells = lines.map((l) => l.split(',').at(-1).trim())
  expect(Math.abs(ot - costOt.weeklyOt) < 0.01, `Paychex overtime should be the weekly-after-40 hours (${costOt.weeklyOt}), got ${ot}. Lines:\n${lines.join('\n')}`)
  expect(jobCells.every((j) => j && !/\s/.test(j)), `each Paychex row should name one job. Overtime job cells: ${jobCells.join(' | ')}`)
  expect(Math.abs(costOt.labor - costOt.expected) < 0.05, `job-cost labor $${costOt.labor} should include the weekly OT premium ($${costOt.expected})`)
  await ctx.close()
})

// Controls that held up. A failure here is a regression, not one of the bugs above.
const passes = []
const pass = (name, fn) => passes.push([name, fn])

pass('non-billable extra reduces profit and stays off the invoice', async () => {
  const { ctx, page } = await fresh()
  const r = await page.evaluate(async () => {
    const logic = await import('/src/data/logic.ts')
    const db = window.__store.getState().db
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
    const job = db.jobs.find((j) => j.stage === 'In Progress' && j.startDate <= today)
    const before = logic.jobCosting(db, job)
    const add = window.__actions.addExtra(job.id, { kind: 'equipment', role: 'Forklift', qty: 1, billable: false, again: true, from: job.startDate, reason: 'absorbed' })
    const job2 = window.__store.getState().db.jobs.find((j) => j.id === job.id)
    const after = logic.jobCosting(window.__store.getState().db, job2)
    const draft = window.__actions.invoiceDraft(job.id).filter((l) => /Forklift/.test(l.description))
    return { ok: add.ok, rev: after.revenue - before.revenue, cost: after.cost - before.cost, profit: after.profit - before.profit, lines: draft.length }
  })
  expect(r.ok, 'extra was rejected')
  expect(r.lines === 0, 'non-billable forklift appeared on the invoice draft')
  expect(r.rev === 0, `revenue changed by ${r.rev}`)
  expect(r.cost > 0 && r.profit < 0 && Math.abs(r.profit + r.cost) < 0.02, `cost delta ${r.cost} profit delta ${r.profit}`)
  await ctx.close()
})

pass('zero and negative payments are refused', async () => {
  const { ctx, page } = await fresh()
  const r = await page.evaluate(() => {
    const inv = window.__store.getState().db.invoices.find((i) => i.amount - i.paid > 50)
    const n = inv.payments.length
    window.__actions.recordPayment(inv.id, 0, 'ACH', '', inv.date)
    window.__actions.recordPayment(inv.id, -25, 'ACH', 'NEG', inv.date)
    const i2 = window.__store.getState().db.invoices.find((x) => x.id === inv.id)
    return { n, after: i2.payments.length, paid: i2.paid, was: inv.paid }
  })
  expect(r.after === r.n && r.paid === r.was, `zero/negative payment changed the invoice (${JSON.stringify(r)})`)
  await ctx.close()
})

pass('a saved payment is still there after reload', async () => {
  const { ctx, page } = await fresh()
  const id = await page.evaluate(() => {
    const inv = window.__store.getState().db.invoices.find((i) => !i.kind && i.amount - i.paid > 100)
    window.__actions.recordPayment(inv.id, 40, 'ACH', 'RELOAD-40', inv.date)
    return inv.id
  })
  await page.reload()
  await page.waitForFunction(() => window.__store?.getState?.().ready === true)
  const still = await page.evaluate((id) => window.__store.getState().db.invoices.find((i) => i.id === id)?.payments.some((p) => p.ref === 'RELOAD-40'), id)
  expect(still, 'payment RELOAD-40 was gone after reload')
  await ctx.close()
})

pass('phone and tablet money pages do not scroll sideways', async () => {
  for (const [name, opts] of [['iPhone 14', devices['iPhone 14']], ['iPad', devices['iPad (gen 7)']]]) {
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await page.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
    await page.goto(base)
    await page.waitForSelector('[data-role=accounting]')
    await page.evaluate(() => window.__store.getState().signIn('accounting', 'Demo role'))
    for (const pg of ['receivables', 'payables', 'quotes', 'jobs']) {
      await page.evaluate((p) => window.__store.getState().go(p), pg)
      await page.waitForTimeout(250)
      const r = await page.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth + 2, sw: document.documentElement.scrollWidth, vw: innerWidth }))
      expect(!r.over, `${name} ${pg} overflows ${r.sw} > ${r.vw}`)
    }
    await ctx.close()
  }
})

pass('aging buckets are right on month-end and year-end', async () => {
  const { ctx, page } = await fresh()
  const r = await page.evaluate(async () => {
    const { agingBucket } = await import('/src/data/logic.ts')
    const inv = (due) => ({ paid: 0, amount: 100, due })
    return {
      jan31_mar2: agingBucket(inv('2026-01-31'), '2026-03-02'),
      jan31_mar3: agingBucket(inv('2026-01-31'), '2026-03-03'),
      dec31_jan30: agingBucket(inv('2026-12-31'), '2027-01-30'),
      dec31_jan31: agingBucket(inv('2026-12-31'), '2027-01-31'),
      dueDay: agingBucket(inv('2026-11-30'), '2026-11-30'),
      nextDay: agingBucket(inv('2026-11-30'), '2026-12-01'),
    }
  })
  expect(r.jan31_mar2 === '1–30', `Jan 31 to Mar 2 should be 1–30, got ${r.jan31_mar2}`)
  expect(r.jan31_mar3 === '31–60', `Jan 31 to Mar 3 should be 31–60, got ${r.jan31_mar3}`)
  expect(r.dec31_jan30 === '1–30', `Dec 31 to Jan 30 should be 1–30, got ${r.dec31_jan30}`)
  expect(r.dec31_jan31 === '31–60', `Dec 31 to Jan 31 should be 31–60, got ${r.dec31_jan31}`)
  expect(r.dueDay === 'Current' && r.nextDay === '1–30', `due date boundaries: ${JSON.stringify(r)}`)
  await ctx.close()
})

const failed = []
for (const [name, fn] of tests) {
  try {
    await fn()
    console.log('PASS ' + name)
  } catch (e) {
    console.log('FAIL ' + name + '\n  ' + e.message.split('\n')[0])
    failed.push(name)
  }
}
console.log('--- controls ---')
for (const [name, fn] of passes) {
  try {
    await fn()
    console.log('PASS ' + name)
  } catch (e) {
    console.log('FAIL control ' + name + '\n  ' + e.message.split('\n')[0])
    failed.push('control: ' + name)
  }
}
await browser.close()
console.log(failed.length ? `\n${failed.length} failing` : '\nALL PASS')
process.exit(failed.length ? 1 : 0)
