// Shop-report minors still open after S1: m2 search vs chip, m3 field Back, m7 guest partition,
// m8 44px targets, m11 trimmed-link picker not focusable, m13 hint points at the chip.
import { chromium, webkit, devices } from 'playwright'
const base = process.env.BASE || 'http://localhost:4174/'
const fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const cr = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const wk = await webkit.launch()

// m2 + m13 + m8 on phones / tablet
{
  const ctx = await wk.newContext(devices['iPhone 14'])
  const p = await ctx.newPage()
  const errors = []
  p.on('pageerror', e => errors.push(e.message))
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(() => window.__store.getState().signIn('guest', 'Demo role'))
  await p.waitForTimeout(800)
  const search = await p.evaluate(() => {
    const el = [...document.querySelectorAll('[data-testid=ask] span')].find(s => getComputedStyle(s).display !== 'none')
    if (!el) return null
    return { text: el.textContent || '', full: el.scrollWidth <= el.clientWidth + 1 }
  })
  ok(!!search && search.text.includes('Ask or search') && search.full, `m2 iPhone search shows “Ask or search” without clipping (${search && search.text})`)
  await ctx.close()
}
{
  const ctx = await wk.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true })
  const p = await ctx.newPage()
  await p.addInitScript(() => { localStorage.setItem('sc-tour-seen', '1'); localStorage.removeItem('sc-guest-hint') })
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(() => window.__store.getState().signIn('guest', 'Demo role'))
  await p.waitForSelector('[data-testid=guest-hint]', { timeout: 8000 })
  const aim = await p.evaluate(() => {
    const hint = document.querySelector('[data-testid=guest-hint]').getBoundingClientRect()
    const chip = document.querySelector('[data-testid=guest-switch]').getBoundingClientRect()
    const bell = document.querySelector('[data-testid=bell]').getBoundingClientRect()
    const hx = hint.left + hint.width / 2, cx = chip.left + chip.width / 2, bx = bell.left + bell.width / 2
    return { closerToChip: Math.abs(hx - cx) < Math.abs(hx - bx), belowChip: hint.top >= chip.bottom - 4 }
  })
  ok(aim.closerToChip && aim.belowChip, 'm13 hint sits under the Switch role chip, not the bell')
  await ctx.close()
}
{
  const ctx = await wk.newContext(devices['iPhone 14'])
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(() => window.__store.getState().signIn('owner', 'Demo role'))
  await p.waitForTimeout(600)
  const measure = async (page) => p.evaluate(pg => { window.__store.getState().go(pg); return pg }, page).then(() => p.waitForTimeout(500)).then(() => p.evaluate(() => {
    const main = document.querySelector('main')
    const els = [...main.querySelectorAll('button, a, [role=tab]')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0 })
    const smallEls = els.filter(el => { const r = el.getBoundingClientRect(); return r.height < 43 || r.width < 43 })
    return { n: els.length, small: smallEls.length, sample: smallEls.slice(0, 8).map(el => `${el.tagName}.${(el.className || '').toString().slice(0, 80)} ${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`) }
  }))
  const eq = await measure('equipment')
  const st = await measure('settings')
  const pm = await measure('maint')
  ok(eq.small === 0, `m8 Equipment visible targets ≥44px (${eq.small}/${eq.n} small) ${eq.sample.join(' | ')}`)
  ok(st.small === 0, `m8 Settings visible targets ≥44px (${st.small}/${st.n} small) ${st.sample.join(' | ')}`)
  ok(pm.small === 0, `m8 Maintenance visible targets ≥44px (${pm.small}/${pm.n} small) ${pm.sample.join(' | ')}`)
  await ctx.close()
}

// m3 field Back
{
  const ctx = await cr.newContext({ ...devices['Pixel 7'], viewport: { width: 412, height: 915 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(() => { const s = window.__store.getState(); s.signIn('owner', 'Demo role'); s.go('dispatch') })
  await p.waitForTimeout(400)
  await p.evaluate(() => { const s = window.__store.getState(); s.signOut(); s.signIn('field', 'Demo role') })
  await p.waitForTimeout(700)
  const active = () => p.evaluate(() => [...document.querySelectorAll('[data-testid^=ftab-]')].find(el => el.className.includes('text-accent'))?.getAttribute('data-testid') || '')
  await p.tap('[data-testid=ftab-time]'); await p.waitForTimeout(300)
  await p.tap('[data-testid=ftab-ticket]'); await p.waitForTimeout(300)
  await p.goBack(); await p.waitForTimeout(400)
  ok(await active() === 'ftab-time', 'm3 Back from Ticket returns to Time')
  await p.goBack(); await p.waitForTimeout(400)
  ok(await active() === 'ftab-home', 'm3 Back from Time returns to Job')
  await p.goBack(); await p.waitForTimeout(500)
  const after = await p.evaluate(() => ({ hash: location.hash, field: !!document.querySelector('[data-testid=field-app]') }))
  ok(after.field && !/dispatch/.test(after.hash) && after.hash.length > 1, `m3 further Back stays in the field app (${after.hash})`)
  await ctx.close()
}

// m11 trimmed link
{
  const ctx = await cr.newContext({ viewport: { width: 1280, height: 800 } })
  const p = await ctx.newPage()
  await p.goto(base + '?staticrypt_pwd=trimmed-demo')
  await p.waitForSelector('[data-testid=guest-locked]', { timeout: 20000 })
  const gate = await p.evaluate(() => {
    const roles = document.querySelectorAll('[data-role]').length
    const btn = document.querySelector('[data-testid=guest-device-staff]')
    let inert = false
    let n = btn
    while (n) { if (n.inert || n.hasAttribute('inert')) { inert = true; break } n = n.parentElement }
    return { roles, inert }
  })
  ok(gate.roles === 0 && gate.inert, `m11 staff role picker is not in the tab order under the lock (roles ${gate.roles}, staff inert ${gate.inert})`)
  await ctx.close()
}

// m7 shared-device partition
{
  const ctx = await cr.newContext()
  const p = await ctx.newPage()
  await p.goto(base)
  await p.waitForSelector('[data-role=owner]')
  await p.evaluate(async () => {
    await new Promise((res, rej) => {
      const r = indexedDB.open('sc-backgrounds', 1)
      r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('photos')) r.result.createObjectStore('photos', { keyPath: 'id' }) }
      r.onsuccess = () => {
        const tx = r.result.transaction('photos', 'readwrite')
        tx.objectStore('photos').put({ id: 'staff-photo', name: 'staff' })
        tx.oncomplete = () => res()
        tx.onerror = () => rej(tx.error)
      }
      r.onerror = () => rej(r.error)
    })
    localStorage.setItem('sc-rig-v1', JSON.stringify([{ tag: 'RG-STAFF' }]))
    localStorage.setItem('sc-gapb', JSON.stringify({ state: { permits: [{ key: 'staff-permit' }] }, version: 1 }))
    localStorage.setItem('sc-guest-device', '1')
  })
  await p.reload()
  await p.waitForSelector('[data-testid=guest-device]', { timeout: 20000 })
  const hidden = await p.evaluate(async () => {
    const rig = localStorage.getItem('sc-rig-v1')
    const gap = localStorage.getItem('sc-gapb')
    localStorage.setItem('sc-rig-v1', '[]')
    const photos = await new Promise(res => {
      const r = indexedDB.open('sc-backgrounds')
      r.onsuccess = () => {
        try {
          const tx = r.result.transaction('photos')
          const g = tx.objectStore('photos').getAll()
          g.onsuccess = () => res((g.result || []).map(x => x.id))
          g.onerror = () => res(['err'])
        } catch { res(['nostore']) }
      }
      r.onerror = () => res(['open-err'])
    })
    return { rig, gap, photos }
  })
  ok(hidden.rig == null && (hidden.gap == null || !/staff-permit/.test(hidden.gap)), 'm7 guest page does not read staff rigging or permits')
  ok(!hidden.photos.includes('staff-photo'), `m7 guest page does not read staff background photos (${hidden.photos.join(',')})`)
  await p.evaluate(() => localStorage.removeItem('sc-guest-device'))
  await p.reload()
  await p.waitForSelector('[data-role=owner]', { timeout: 20000 })
  const kept = await p.evaluate(async () => {
    const rig = localStorage.getItem('sc-rig-v1')
    const photos = await new Promise(res => {
      const r = indexedDB.open('sc-backgrounds')
      r.onsuccess = () => {
        const g = r.result.transaction('photos').objectStore('photos').getAll()
        g.onsuccess = () => res((g.result || []).map(x => x.id))
      }
    })
    return { rig, photos }
  })
  ok(/RG-STAFF/.test(kept.rig || '') && kept.photos.includes('staff-photo'), 'm7 staff rigging and photos are still there after the guest visit')
  await ctx.close()
}

await cr.close(); await wk.close()
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS')
process.exit(fails.length ? 1 : 0)
