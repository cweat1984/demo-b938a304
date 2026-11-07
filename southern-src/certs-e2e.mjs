// Send my certs (email PDF / text link), cert wallet QR, offline queue, crew certs, logs. DEMO — nothing leaves the device.
import { chromium } from 'playwright'
import fs from 'fs'
const base = process.env.BASE || 'http://localhost:4173/'
const shots = '/workspace/southern-app/screenshots/'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const errors = []; const fail = m => errors.push('FAIL ' + m); const ok = m => console.log('ok', m)
const external = []
async function ctxFor(role, vp = { width: 1500, height: 950 }, mobile = false) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 3 : 1.25, isMobile: mobile, hasTouch: mobile, acceptDownloads: true })
  const p = await ctx.newPage()
  p.on('pageerror', e => errors.push(`${role} pageerror: ${e.message}`))
  p.on('console', m => { if (m.type() === 'error' && !/tile|arcgis|Failed to load resource/i.test(m.text())) errors.push(`${role} console: ${m.text()}`) })
  p.on('request', r => { const u = r.url(); if (r.method() === 'POST' && !u.startsWith(base)) external.push(u) })
  await p.goto(base); await p.waitForSelector(`[data-role="${role}"]`, { timeout: 15000 }); await p.click(`[data-role="${role}"]`); await p.waitForTimeout(900)
  return { p, ctx }
}
const readDb = async p => { await p.waitForTimeout(1000); return readDb0(p) }
const readDb0 = p => p.evaluate(() => new Promise(res => { const r = indexedDB.open('southern-command', 1); r.onsuccess = () => { const g = r.result.transaction('kv', 'readonly').objectStore('kv').get('db'); g.onsuccess = () => res(g.result) } }))
const wait = (p, ms = 600) => p.waitForTimeout(ms)

// ---------- field phone ----------
const { p, ctx } = await ctxFor('field', { width: 390, height: 844 }, true)
await p.locator('[data-testid=ftab-more]').dispatchEvent('click'); await wait(p, 400)
await p.click('[data-testid=tile-certs]'); await p.waitForSelector('[data-testid=my-certs]')
await p.click('[data-testid=send-my-certs]'); await p.waitForSelector('[data-testid=send-certs]'); await wait(p)
let db = await readDb(p)
const me = db.employees.find(e => e.first === 'John' && e.last === 'Smith')
const rows = await p.$$('[data-testid=sc-cert]')
for (const r of rows) { const exp = await r.getAttribute('data-expired'); const chk = await (await r.$('input')).isChecked(); if (exp && chk) fail('expired cert should be unchecked by default'); if (!exp && !chk) fail('valid cert should be checked by default') }
const to = await p.inputValue('[data-testid=sc-to]'); if (!to.includes('@')) fail('recipient not prefilled from the job site contacts: ' + to)
await p.screenshot({ path: shots + 'certs-send-mobile.png' })
await p.fill('[data-testid=sc-note]', 'Here for the 7 AM pick at the O&M building')
await p.click('[data-testid=sc-send]'); await p.waitForSelector('[data-testid=sc-sent][data-status=Sent]')
db = await readDb(p)
let s = db.certShares[0]
if (!s || s.channel !== 'Email' || !s.demo || !s.jobId || s.employeeIds[0] !== me.id || !s.certIds.length || s.status !== 'Sent') fail('email send not logged correctly ' + JSON.stringify(s))
ok(`email send logged: ${s.certIds.length} certs → ${s.to.name} <${s.to.email}> job ${db.jobs.find(j => j.id === s.jobId)?.jobNo}`)
const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=sc-pdf]')])
await dl.saveAs('/tmp/packet.pdf'); const path = await dl.path(); const buf = fs.readFileSync(path)
if (!buf.slice(0, 4).toString().startsWith('%PDF') || buf.length < 4000) fail('PDF packet invalid, bytes=' + buf.length)
ok(`PDF packet downloaded: ${dl.suggestedFilename()} (${Math.round(buf.length / 1024)} KB)`)
await p.click('text=Done'); await wait(p)
// text link
await p.click('[data-testid=send-my-certs]'); await p.waitForSelector('[data-testid=send-certs]')
await p.click('[data-testid=sc-ch-Text]'); await p.fill('[data-testid=sc-to]', 'not a phone')
if (!(await p.isDisabled('[data-testid=sc-send]'))) fail('invalid phone should block send')
await p.fill('[data-testid=sc-to]', '(580) 555-0199'); await p.click('[data-testid=sc-send]'); await p.waitForSelector('[data-testid=sc-sent]')
db = await readDb(p); s = db.certShares[0]
if (s.channel !== 'Text' || s.to.phone !== '(580) 555-0199') fail('text send not logged')
const days = (new Date(s.expires) - new Date(s.at)) / 864e5; if (Math.round(days) !== 7) fail('share link should expire in 7 days, got ' + days)
const share = await ctx.newPage(); share.on('pageerror', e => errors.push('share pageerror: ' + e.message))
await share.goto(base + '?certs=' + s.token); await share.waitForSelector('[data-testid=cert-share]')
const st = await share.textContent('[data-testid=cert-share]'); if (!st.includes('John Smith')) fail('share page missing employee')
await share.goto(base + '?certs=nope123'); await share.waitForSelector('[data-testid=cert-share-expired]'); await share.close()
ok('text link → read-only cert page (bad token shows expired)')
await p.click('text=Done'); await wait(p)
// offline queue
await ctx.setOffline(true); await wait(p, 300)
await p.click('[data-testid=send-my-certs]'); await p.waitForSelector('[data-testid=send-certs]')
if ((await p.textContent('[data-testid=sc-send]')).indexOf('Queue') < 0) fail('offline: button should say Queue')
await p.click('[data-testid=sc-send]'); await p.waitForSelector('[data-testid=sc-sent][data-status=Queued]')
db = await readDb(p); if (db.certShares[0].status !== 'Queued') fail('offline send should queue')
await ctx.setOffline(false); await wait(p, 1200)
db = await readDb(p); if (db.certShares[0].status !== 'Sent') fail('queued send did not go out when signal returned')
ok('offline → queued → sent when back online')
await p.click('text=Done'); await wait(p)
// wallet
await p.click('[data-testid=show-wallet]'); await p.waitForSelector('[data-testid=cert-wallet] img[data-qr]'); await wait(p, 600)
const qr = await p.getAttribute('[data-testid=cert-wallet] img[data-qr]', 'data-qr'); if (!qr.includes('?certs=')) fail('wallet QR should point at share page')
if ((await p.$$('[data-testid=wallet-card]')).length < 1) fail('wallet has no cards')
await p.screenshot({ path: shots + 'certs-wallet-mobile.png' })
await p.click('[data-testid=wallet-close]'); ok('wallet: full-screen cards + QR')
const w = await p.evaluate(() => document.documentElement.scrollWidth); if (w > 392) fail('mobile overflow ' + w)
if ((await p.$$('[data-testid=cert-log-row]')).length < 4) fail('sent history not shown on my certs')
await ctx.close()

// ---------- dispatch: crew certs from the job drawer; safety + HR logs ----------
{
  const { p, ctx } = await ctxFor('dispatch')
  await p.click('[data-testid=role-briefing-btn] >> nth=0'); await p.waitForSelector('[data-testid=role-briefing-card]')
  await p.locator('[data-testid=brief-section]').filter({ hasText: 'Today’s moves' }).locator('[data-testid=brief-item]').first().click(); await wait(p, 900)
  await p.locator('[role=dialog] button', { hasText: /^Crew$/ }).first().click(); await wait(p)
  await p.click('[data-testid=job-crew-certs]'); await p.waitForSelector('[data-testid=send-certs]')
  const people = await p.$$eval('[data-testid=send-certs] .label + div > div', els => els.length)
  if (people < 2) fail('crew packet should include several people, got ' + people)
  await p.click('[data-testid=sc-send]'); await p.waitForSelector('[data-testid=sc-sent]')
  const db = await readDb(p); const s = db.certShares[0]
  if (s.employeeIds.length < 2) fail('crew send should include all crew')
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid=sc-pdf]')]); await dl.saveAs('/tmp/crew-packet.pdf'); const b = fs.readFileSync(await dl.path()); if (!b.slice(0, 4).toString().startsWith('%PDF')) fail('crew PDF invalid')
  ok(`crew certs: ${s.employeeIds.length} people, ${s.certIds.length} certs in one packet`)
  // desktop My Info → my certs
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await wait(p, 300)
  await p.evaluate(() => { location.hash = '/myinfo' }); await p.waitForSelector('[data-testid=my-certs]')
  ok('desktop My Info shows My certs + Send')
  await ctx.close()
}
{
  const { p, ctx } = await ctxFor('safety')
  await p.evaluate(() => { location.hash = '/safety' }); await p.waitForSelector('[data-testid=safety-cert-sends]')
  if ((await p.$$('[data-testid=safety-cert-sends] [data-testid=cert-log-row]')).length < 3) fail('Safety cert-send log empty')
  if (!(await p.textContent('[data-testid=safety-cert-sends]')).includes('Demo')) fail('log not marked demo')
  ok('Safety sees the cert-send log (marked demo)')
  await ctx.close()
}
if (external.length) fail('external POSTs made: ' + external.join(', '))
await browser.close()
if (errors.length) { console.log(errors.join('\n')); process.exit(1) } else console.log('CERTS E2E: all passed')
