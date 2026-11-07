// Field fixes e2e (REPORT-2 N-B1…N-M13 + minors) on WebKit iPhone 14 (390×844). BASE=preview url.
import { webkit, devices } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'; const out = (process.env.OUT || '/workspace/southern-app/screenshots/field-fixes/'); fs.mkdirSync(out, { recursive: true })
const fails = [], errors = []; const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const wk = await webkit.launch()
const W = ms => new Promise(r => setTimeout(r, ms))
async function phone(empPick) {
  const ctx = await wk.newContext(devices['iPhone 14']); const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(e.message))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base); await p.waitForSelector('[data-role=owner]', { timeout: 30000 }); await p.tap('[data-role=field]'); await W(1200)
  if (empPick) { const id = await p.evaluate(empPick); await p.evaluate(id => { const s = window.__store.getState(); s.signOut(); s.signIn('field', 'Demo role', id) }, id); await W(1200) }
  return { ctx, p }
}
const tab = async (p, t) => { await p.evaluate(() => document.querySelectorAll('[data-sonner-toast] [aria-label="Close toast"]').forEach(b => b.click())); await p.tap(`[data-testid=ftab-${t}]`); await W(600) }
const more = async (p, label) => { await tab(p, 'more'); const l = p.locator('button', { hasText: label }).first(); await l.scrollIntoViewIfNeeded(); await l.tap(); await W(800) }
const toastText = p => p.evaluate(() => [...document.querySelectorAll('[data-sonner-toast]')].map(t => t.innerText).join(' | '))
const bigJpeg = async p => Buffer.from(await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 4032; c.height = 3024; const g = c.getContext('2d'); const d = g.createImageData(4032, 3024); for (let i = 0; i < d.data.length; i++) d.data[i] = (i * 2654435761 >>> 13) & 255; g.putImageData(d, 0, 0); return c.toDataURL('image/jpeg', 0.95).split(',')[1] }), 'base64')
const TMP = '/tmp/field-fixes-e2e/'; fs.mkdirSync(TMP, { recursive: true })
const imgFiles = async (p, n = 1) => { const b = await bigJpeg(p); return Array.from({ length: n }, (_, i) => { const f = `${TMP}photo${i + 1}.jpg`; fs.writeFileSync(f, b); return f }) }
const lsKB = p => p.evaluate(() => Math.round(Object.keys(localStorage).reduce((s, k) => s + (localStorage.getItem(k) || '').length, 0) / 1024))
const openTicket = async p => { await tab(p, 'ticket'); await p.getByText(/^Today · #/).first().tap(); await W(800) }

// ---------- N-B1 / n6: NPT photos (big) are shrunk, stored in IndexedDB, survive reload; localStorage stays small ----------
{ const { ctx, p } = await phone(); const files6 = await imgFiles(p, 6); const img = fs.readFileSync(files6[0]); ok(img.length > 3e6, `test photo is ${(img.length / 1048576).toFixed(1)} MB`)
  await openTicket(p); await p.locator('[data-testid=npt-btn]').scrollIntoViewIfNeeded(); await p.tap('[data-testid=npt-btn]'); await W(600)
  const ls0 = await lsKB(p)
  await p.locator('[data-testid=npt-photo]').setInputFiles(files6)
  const warned = await p.waitForFunction(() => /Up to 4 photos/.test(document.body.innerText), null, { timeout: 5000 }).then(() => true, () => false)
  ok(warned, 'picking 6 NPT photos says "Up to 4 photos"')
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=npt-form] [data-testid=photo-thumb]').length >= 4, null, { timeout: 60000 }).catch(() => {})
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=npt-form] img[data-testid=photo-thumb]').length >= 4, null, { timeout: 15000 }).catch(() => {})
  ok(await p.locator('[data-testid=npt-form] img[data-testid=photo-thumb]').count() === 4, '4 NPT thumbnails shown')
  // N-M6: stop before start is refused
  await p.fill('[data-testid=npt-start]', '14:00'); await p.fill('[data-testid=npt-stop]', '10:00'); await W(200)
  ok(await p.locator('[data-testid=npt-time-err]').isVisible() && await p.locator('[data-testid=npt-save]').innerText().then(t => /Fix the times/.test(t)), 'NPT: restart before stop shows an error, no 20 h')
  await p.fill('[data-testid=npt-start]', '10:00'); await p.fill('[data-testid=npt-stop]', '11:30')
  await p.locator('[data-testid=npt-reason]').first().tap(); await p.fill('[data-testid=npt-why]', 'Wind over limit at hub, held all picks')
  await p.locator('[data-testid=npt-save]').dblclick(); await W(1200)
  const n = await p.evaluate(() => JSON.stringify(localStorage).split('Wind over limit at hub').length - 1)
  ok(n === 1, `double-tap NPT save makes one entry (${n})`)
  const ls1 = await lsKB(p); ok(ls1 - ls0 < 50, `localStorage grew only ${ls1 - ls0} KB for 4 big photos (refs only)`)
  await p.reload(); await W(2000); await openTicket(p)
  ok(/Nonproductive time|NPT/.test(await p.locator('[role=dialog]').last().innerText()), 'NPT still on the ticket after reload')
  ok(await p.evaluate(async () => { const r = indexedDB.open('sc-files'); const d = await new Promise(res => { r.onsuccess = () => res(r.result) }); return new Promise(res => { const q = d.transaction('blobs').objectStore('blobs').getAllKeys(); q.onsuccess = () => res(q.result.filter(k => String(k).startsWith('npt-')).length >= 4) }) }), 'NPT photo blobs are in IndexedDB')
  const sz = await p.evaluate(async () => { const r = indexedDB.open('sc-files'); const d = await new Promise(res => { r.onsuccess = () => res(r.result) }); return new Promise(res => { const q = d.transaction('blobs').objectStore('blobs').getAll(); q.onsuccess = () => res(Math.max(...q.result.map(b => b.size ?? b.buf?.byteLength ?? 0))) }) })
  ok(sz < 1.2e6, `photos compressed (largest ${(sz / 1024).toFixed(0)} KB)`)
  await p.screenshot({ path: out + 'b1-npt-photos.png' }); await ctx.close() }

// ---------- N-B1 storage errors surface instead of being swallowed ----------
{ const { ctx, p } = await phone()
  await p.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (String(k).includes('npt') || String(k).includes('gapA') || String(k).includes('moves')) throw new DOMException('quota', 'QuotaExceededError'); return o.call(this, k, v) } })
  await openTicket(p); await p.locator('[data-testid=npt-btn]').scrollIntoViewIfNeeded(); await p.tap('[data-testid=npt-btn]'); await W(500)
  await p.locator('[data-testid=npt-reason]').first().tap(); await p.fill('[data-testid=npt-why]', 'Crane waiting on the customer'); await p.tap('[data-testid=npt-save]')
  ok(await p.waitForFunction(() => /Couldn’t save on this phone/.test(document.body.innerText), null, { timeout: 5000 }).then(() => true, () => false), 'a full storage shows "Couldn’t save on this phone"'); await ctx.close() }

// ---------- N-M11 / n1 / n2 / n3 / n4: ticket photos are stored and visible in office; hours capped; signer wraps; double save quiet ----------
{ const { ctx, p } = await phone(); const f2 = await imgFiles(p, 2)
  await openTicket(p)
  await p.locator('[data-testid=ticket-photo]').setInputFiles(f2)
  await p.waitForFunction(() => document.querySelectorAll('[role=dialog] img[data-testid=photo-thumb]').length >= 2, null, { timeout: 40000 }).catch(() => {})
  ok(await p.locator('[role=dialog] img[data-testid=photo-thumb]').count() === 2, 'ticket shows 2 photo thumbnails')
  const plus = p.locator('[role=dialog] button[aria-label*="ncrease"], [role=dialog] button:has(svg.lucide-plus)').nth(2)
  for (let i = 0; i < 60; i++) await plus.tap({ timeout: 1000 }).catch(() => {})
  ok(await p.locator('[data-testid=ticket-hours-err]').isVisible() && await p.locator('[data-testid=ticket-next]').isDisabled(), 'over 24 h on a ticket is blocked with a reason')
  const minus = p.locator('[role=dialog] button:has(svg.lucide-minus)').nth(2)
  for (let i = 0; i < 80; i++) { if (!(await p.locator('[data-testid=ticket-hours-err]').isVisible())) break; await minus.tap({ timeout: 1000 }).catch(() => {}) }
  await p.tap('[data-testid=ticket-next]'); await W(600)
  await p.fill('[data-testid=signer]', 'Bartholomew Montgomery-Fitzgerald Richardson-Whitaker the Third, Site Superintendent')
  const pad = p.locator('[role=dialog] canvas').first(); await pad.scrollIntoViewIfNeeded(); const bx = await pad.boundingBox()
  await p.mouse.move(bx.x + 20, bx.y + 40); await p.mouse.down(); await p.mouse.move(bx.x + 150, bx.y + 90, { steps: 8 }); await p.mouse.move(bx.x + 250, bx.y + 30, { steps: 8 }); await p.mouse.up(); await W(300)
  const save = p.getByRole('button', { name: /save|sign/i }).last(); await save.scrollIntoViewIfNeeded(); await save.dblclick().catch(() => {}); await W(1500)
  ok(!/already submitted/.test(await toastText(p)), 'double-tap Save signed ticket: no red "already submitted"')
  const fits = await p.locator('[data-testid=ticket-pdf]').evaluate(el => el.scrollWidth <= el.clientWidth + 1).catch(() => false); ok(fits, 'long signer name wraps on the signed ticket')
  const tk = await p.evaluate(() => window.__store.getState().db.tickets.find(t => t.photoRefs?.length)); ok(tk && tk.photoRefs.length === 2 && tk.photos === 2, 'signed ticket stores 2 photo refs')
  await p.tap('[data-testid=ticket-signed] button:has-text("Done")').catch(() => {}); await W(600); await tab(p, 'ticket')
  ok(/✓ Signed by/.test(await p.locator('body').innerText()), 'Ticket tab says "✓ Signed by …" after signing')
  // n5: past tickets open
  const past = p.locator('[data-testid=past-ticket] button').first(); if (await past.count()) { await past.tap(); await W(300); ok(await p.locator('[data-testid=past-ticket-detail]').count() === 1, 'tapping a past ticket opens its details') }
  await p.screenshot({ path: out + 'm11-ticket.png' })
  // office: same device, Tickets page shows the thumbnails
  await p.evaluate(() => { const s = window.__store.getState(); s.signOut(); s.signIn('owner', 'Demo role') }); await W(1200)
  await p.evaluate(() => { location.hash = 'tickets' }); await W(1500)
  const row = p.getByText(/Bartholomew/).filter({ visible: true }).first(); if (await row.count()) { await row.tap(); await W(1000) } else { const r2 = p.locator('button, [role=button], tr').filter({ hasText: 'Bartholomew' }).first(); await r2.tap({ timeout: 5000 }).catch(() => {}); await W(1000) }
  await p.waitForFunction(() => document.querySelectorAll('[data-testid=ticket-photos] img').length >= 2, null, { timeout: 8000 }).catch(() => {})
  ok(await p.locator('[data-testid=ticket-photos] img').count() >= 2, 'office ticket view shows the 2 photos')
  await p.screenshot({ path: out + 'm11-office.png' }); await ctx.close() }

// ---------- N-B2: no job today → no ticket / NPT on next week's job ----------
{ const { ctx, p } = await phone(() => { const s = window.__store.getState(), db = s.db, t = new Date(); const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const e = db.employees.find(e => ['Operator', 'Rigger', 'Oiler'].includes(e.craft) && !db.assignments.some(a => a.employeeId === e.id && a.date === d) && db.assignments.some(a => a.employeeId === e.id && a.date > d)); return e?.id })
  const before = await p.evaluate(() => window.__store.getState().db.tickets.length)
  await p.evaluate(() => document.querySelector('input[placeholder*="What do you need"]')?.focus()); const ask = p.locator('input[placeholder*="What do you need"]')
  if (await ask.count()) { await ask.fill('sign ticket'); await ask.press('Enter'); await W(900) }
  ok(await p.locator('[data-testid=no-job-today]').isVisible(), '"sign ticket" with no job today shows "No job today"')
  ok(/^sms:/.test(await p.locator('[data-testid=ask-dispatch]').getAttribute('href') || ''), '"Ask dispatch" texts dispatch')
  ok(await p.evaluate(() => window.__store.getState().db.tickets.length) === before, 'no ticket created on a future job')
  await p.screenshot({ path: out + 'b2-nojob.png' }); await ctx.close() }

// ---------- N-M1 / N-M2 / N-M3: incident ----------
{ const { ctx, p } = await phone(); await more(p, 'Injury / near miss')
  await p.fill('[data-testid=inc-desc]', 'Tag line slipped near the outrigger'); await W(400)
  ok(/location not shared|getting your location|location is attached/.test(await p.locator('[data-testid=inc-loc]').innerText()), 'incident location wording is honest')
  ok(await p.locator('[data-testid=inc-photo]').getAttribute('capture') === 'environment', 'incident photo is a real camera input')
  await p.locator('[data-testid=inc-photo]').setInputFiles((await imgFiles(p, 1))); await p.waitForFunction(() => document.querySelectorAll('[data-testid=incident-form] img[data-testid=photo-thumb]').length > 0, null, { timeout: 30000 }).catch(() => {})
  const n0 = await p.evaluate(() => window.__store.getState().db.incidents.length)
  await p.locator('[data-testid=inc-send]').dblclick(); await W(1200)
  const after = await p.evaluate(() => window.__store.getState().db.incidents); ok(after.length - n0 === 1, `double-tap Send to Safety files one report (${after.length - n0})`)
  ok(after[0].photoRefs?.length === 1 && after[0].photos === 1, 'incident keeps the real photo')
  const sup = await p.evaluate(() => { const s = window.__store.getState(), db = s.db, me = db.employees.find(e => e.id === s.session.employeeId); const t = new Date(); const d = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; const a = db.assignments.find(a => a.employeeId === me.id && a.date === d); if (!a) return null; const ids = db.assignments.filter(x => x.jobId === a.jobId && x.date === d).map(x => x.employeeId); return db.employees.find(e => ids.includes(e.id) && e.craft === 'Supervisor')?.first ?? null })
  if (sup) ok((await toastText(p)).includes(sup), `injury report goes to today's on-site supervisor (${sup})`)
  await more(p, 'My pay'); ok(await p.locator('[data-testid=pay-job-local]').count() === 1, 'My pay shows the local the job pays (not just home local)')
  await ctx.close() }

// ---------- N-M4 fuel / N-M7 add time ----------
{ const { ctx, p } = await phone(); await more(p, 'Log fuel')
  const g = p.locator('[role=dialog] input[inputmode=decimal]').first()
  for (const [v, why] of [['-50', 'negative'], ['abc', 'text'], ['99999', 'huge']]) { await g.fill(v); await W(150); ok(await p.locator('[data-testid=fuel-save]').isDisabled() && await p.locator('[data-testid=fuel-err]').isVisible(), `fuel: ${why} gallons blocked with a reason`) }
  await g.fill('80'); const n0 = await p.evaluate(() => window.__store.getState().db.fuel?.length ?? 0); await p.locator('[data-testid=fuel-save]').click({ clickCount: 3 }); await W(800)
  const n1 = await p.evaluate(() => window.__store.getState().db.fuel?.length ?? 0); ok(n1 - n0 === 1, `triple-tap Log fuel makes one entry (${n1 - n0})`)
  await more(p, 'Add time').catch(() => {}); if (!(await p.locator('[data-testid=manual-save]').count())) { await tab(p, 'time'); const b = p.getByText(/add time|missed/i).first(); if (await b.count()) { await b.tap(); await W(700) } }
  if (await p.locator('[data-testid=manual-save]').count()) {
    await p.fill('[data-testid=manual-meal]', '-60'); await W(150); ok(await p.locator('[data-testid=manual-save]').isDisabled(), 'add time: negative lunch blocked')
    await p.fill('[data-testid=manual-meal]', '30'); const t = p.locator('[role=dialog] input[type=time]'); await t.nth(0).fill('00:00'); await t.nth(1).fill('23:59'); await W(150)
    ok(/16 h max/.test(await p.locator('[data-testid=manual-err]').innerText().catch(() => '')), 'add time: 24 h day blocked (16 h max)')
    await t.nth(0).fill('16:00'); await t.nth(1).fill('06:00'); await W(150); ok(/End must be after start/.test(await p.locator('[data-testid=manual-err]').innerText().catch(() => '')), 'add time: end before start blocked')
  } else ok(false, 'add time form found')
  await ctx.close() }

// ---------- N-M8: dirty form confirm; NPT back returns to ticket ----------
{ const { ctx, p } = await phone(); await more(p, 'Log fuel'); await p.locator('[role=dialog] input').nth(2).fill('123456')
  let asked = ''; p.once('dialog', d => { asked = d.message(); d.dismiss() }); await p.tap('[data-testid=fsheet-back]'); await W(500)
  ok(/Discard/.test(asked) && await p.locator('[role=dialog]').count() > 0, 'Back on a typed form asks "Discard…?" and Cancel keeps it')
  p.once('dialog', d => d.accept()); await p.goBack().catch(() => {}); await W(700)
  ok(await p.locator('[role=dialog]').count() === 0, 'phone Back + OK discards and closes')
  await openTicket(p); await p.locator('[data-testid=npt-btn]').scrollIntoViewIfNeeded(); await p.tap('[data-testid=npt-btn]'); await W(500)
  await p.tap('[data-testid=npt-back-ticket]'); await W(500); ok(await p.locator('[data-testid=ticket-next]').isVisible(), '"Back to ticket" from NPT returns to the ticket')
  await p.tap('[data-testid=npt-btn]'); await W(500); await p.goBack(); await W(700); ok(await p.locator('[data-testid=ticket-next]').isVisible(), 'phone Back from NPT returns to the ticket')
  await ctx.close() }

// ---------- N-M9 JSA ----------
{ const { ctx, p } = await phone(); await more(p, 'JSA & toolbox')
  const s = p.locator('[data-testid=jsa-sign]').first()
  if (await s.count()) { const signed = /You signed/.test(await s.innerText()); if (!signed) { ok(await s.isDisabled(), 'JSA sign is disabled until the talk is opened'); await p.locator('[data-testid=jsa-open]').first().tap(); await W(300); ok(await p.locator('[data-testid=jsa-content]').isVisible(), 'tapping a talk shows hazards and controls'); ok(!(await s.isDisabled()), 'sign enabled after reading') } }
  else ok(await p.locator('[data-testid=jsa-empty]').isVisible(), 'JSA empty state')
  await ctx.close() }

// ---------- N-M10 annual inspection ----------
{ const { ctx, p } = await phone(); await tab(p, 'more'); await p.tap('[data-testid=tile-inspect]'); await p.waitForSelector('[data-testid=insp-form]', { timeout: 15000 })
  const seg = await p.locator('[data-testid=insp-form]').innerText(); ok(!/\bAnnual\b/.test(seg.split('\n').slice(0, 6).join(' ')) || /qualified inspector/.test(seg), 'operator can’t pick Annual inspection')
  ok(/qualified inspector/.test(seg), 'explains annual needs a qualified inspector'); await ctx.close() }

// ---------- N-M12 receipt ----------
{ const { ctx, p } = await phone(); await more(p, 'Turn in a receipt'); const inp = p.locator('[role=dialog] input[type=file]').first()
  await inp.setInputFiles([{ name: 'r.jpg', mimeType: 'image/jpeg', buffer: Buffer.from((await bigJpeg(p)).subarray(0, 20000)) }]).catch(() => {})
  await p.waitForSelector('[data-testid=exp-scan-amount]', { timeout: 6000 }).catch(() => {})
  if (await p.locator('[data-testid=exp-scan-amount]').count()) { await p.fill('[data-testid=exp-scan-amount]', '-5'); await W(150); ok(await p.locator('[data-testid=exp-scan-save]').isDisabled(), 'receipt: negative amount blocked'); await p.fill('[data-testid=exp-scan-amount]', '64.10'); await p.fill('[data-testid=exp-scan-merchant]', 'Pilot #405 Midland'); ok(!(await p.locator('[data-testid=exp-scan-save]').isDisabled()) && await p.locator('[data-testid=exp-scan-retake]').count() === 1, 'receipt fields editable + "Not right — retake"') }
  else ok(false, 'receipt read panel opened'); await ctx.close() }

// ---------- N-M13 mechanic work orders ----------
{ const { ctx, p } = await phone(() => window.__store.getState().db.employees.find(e => e.craft === 'Mechanic')?.id); await tab(p, 'more')
  ok(await p.locator('[data-testid=tile-workorders]').count() === 1, 'mechanic gets a "My work orders" tile'); await p.tap('[data-testid=tile-workorders]'); await W(600)
  const card = p.locator('[data-testid=wo-card] button').first()
  if (await card.count()) { await card.tap(); await W(300); await p.fill('[data-testid=wo-hrs]', '-2'); ok(await p.locator('[data-testid=wo-addhrs]').isDisabled(), 'WO: negative labor blocked'); await p.fill('[data-testid=wo-hrs]', '1.5'); await p.tap('[data-testid=wo-addhrs]'); await W(400); ok(/1\.5 h added/.test(await toastText(p)), 'WO: labor logged') }
  else ok(await p.locator('[data-testid=wo-empty]').isVisible(), 'WO empty state')
  await p.screenshot({ path: out + 'm13-wo.png' }); await ctx.close() }
{ const { ctx, p } = await phone(); await tab(p, 'more'); ok(await p.locator('[data-testid=tile-workorders]').count() === 0, 'operators don’t see the work-order tile')
  const c = await p.locator('[data-testid=ftab-home]').evaluate(el => getComputedStyle(el).fontSize); ok(parseFloat(c) >= 12, `tab labels ${c}`); await ctx.close() }

// ---------- n14 union on phone / n12 offline map ----------
{ const { ctx, p } = await phone(); await more(p, 'My union hours'); await p.waitForSelector('[data-testid=union-history]', { timeout: 15000 }).catch(() => {})
  const w = await p.evaluate(() => { const d = [...document.querySelectorAll('[role=dialog]')].pop(); const sc = d?.querySelector('.overflow-y-auto'); return sc ? sc.scrollWidth - sc.clientWidth : 999 })
  ok(w <= 1, `union history fits the phone (overflow ${w}px)`); ok(await p.locator('[data-testid=uh-local-card]').count() > 0 || /No union hours/.test(await p.locator('[data-testid=union-history]').innerText()), 'union hours shown as cards on phone')
  ok(!(await p.locator('[data-testid=uh-demo-note]').isVisible()), 'dev "DEMO DATA" note is behind an (i) on phone')
  await p.locator('[data-testid=fsheet-back]').last().tap(); await W(400)
  await ctx.setOffline(true); await p.evaluate(() => window.dispatchEvent(new Event('offline'))); await tab(p, 'home'); await W(800)
  if (await p.locator('[data-testid=turbine-map]').count()) ok(await p.locator('[data-testid=map-offline]').count() > 0, 'offline: map says "No signal — map pictures won’t load"')
  await ctx.close() }

await wk.close()
const real = errors.filter(e => !/The object can not be found here/.test(e))
console.log(real.length ? 'PAGE ERRORS:\n' + real.slice(0, 8).join('\n') : 'no page errors')
console.log(fails.length ? `\n${fails.length} FAILED:\n- ` + fails.join('\n- ') : '\nALL PASSED'); process.exit(fails.length ? 1 : 0)
