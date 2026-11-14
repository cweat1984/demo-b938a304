// The isolated preview must open in Chromium and Firefox (and WebKit when it launches).
// A startup throw used to leave #root empty on the dark page after the password.
import { chromium, firefox, webkit } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'dist-standalone')
const fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf' }
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://127.0.0.1')
    const file = path.join(root, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    const body = await readFile(file)
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' })
    res.end(body)
  } catch {
    res.writeHead(404); res.end('missing')
  }
})
await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port
const base = `http://127.0.0.1:${port}/`
console.log('serving', base)

async function unlock(browser, name) {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(base)
  await page.waitForSelector('[data-role=owner]', { timeout: 20000 })
  const boot = await page.locator('[data-testid=boot-error]').count()
  const text = (await page.locator('#root').innerText()).trim()
  const storage = await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('sc-probe', '1')
    localStorage.setItem('other', '2')
    const keys = Object.keys(localStorage)
    const len = localStorage.length
    const got = localStorage.getItem('sc-probe')
    const raw = []
    for (let i = 0; i < localStorage.length; i++) raw.push(localStorage.key(i))
    return { keys, len, got, raw, marker: document.documentElement.dataset.previewIsolate || '' }
  })
  ok(boot === 0, `${name}: no boot error`)
  ok(text.length > 20, `${name}: #root has text (${text.length} chars)`)
  ok(errors.length === 0, `${name}: no page errors${errors.length ? ' — ' + errors[0] : ''}`)
  ok(storage.marker === '1', `${name}: isolation is on`)
  ok(storage.got === '1', `${name}: prefixed read returns the value`)
  ok(storage.len === storage.raw.filter(Boolean).length, `${name}: length matches visible keys (${storage.len})`)
  ok(!storage.keys.includes('getItem') && !storage.keys.includes('setItem') && !storage.keys.includes('length'), `${name}: Object.keys has no storage methods (${storage.keys.join(',')})`)
  ok(storage.raw.every(k => k && k.startsWith('sc-preview-')), `${name}: only preview keys are visible (${storage.raw.join(',')})`)
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.click('[data-role=owner]')
  await page.waitForSelector('[data-testid=bell]', { timeout: 20000 })
  const after = (await page.locator('#root').innerText()).trim()
  ok(after.length > 40 && (await page.locator('[data-testid=boot-error]').count()) === 0, `${name}: signed in and #root stayed filled`)
  await page.click('[data-hub=jobs]')
  await page.waitForSelector('input[placeholder*="Job #"]', { timeout: 15000 })
  const jobNo = (await page.locator('span.w-16.num').first().innerText()).trim()
  ok(/^#\d+/.test(jobNo), `${name}: jobs list shows a job (${jobNo})`)
  await page.locator('button', { hasText: jobNo }).first().click()
  await page.waitForSelector('[data-testid=job-dates]', { timeout: 15000 })
  ok((await page.locator('[data-testid=job-dates]').innerText()).includes('→'), `${name}: a job opens`)
  await page.keyboard.press('Escape')
  await page.click('[data-hub=people]')
  await page.click('[data-nav=time]')
  await page.waitForSelector('[data-testid=time-export], [data-testid=time-emp]', { timeout: 15000 })
  ok(await page.locator('[data-testid=time-export], [data-testid=time-emp]').count() > 0, `${name}: time cards open`)
  ok(errors.length === 0, `${name}: no page errors through the key flow${errors.length ? ' — ' + errors[0] : ''}`)
  await page.close()
}

const results = []
async function run(name, launch) {
  const before = fails.length
  let browser
  try {
    browser = await launch()
    await unlock(browser, name)
    results.push(`${name}: ${fails.length === before ? 'PASS' : 'FAIL'}`)
  } catch (e) {
    const msg = String(e && e.message || e).split('\n')[0]
    if (fails.length === before) fails.push(`${name} threw: ${msg}`)
    results.push(`${name}: FAIL ${msg}`)
    console.log('FAIL ' + name + ' ' + msg)
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}

await run('chromium', () => chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] }))
await run('firefox', () => firefox.launch())
await run('webkit', () => webkit.launch())

server.close()
console.log('--- browsers ---')
for (const line of results) console.log(line)
console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASSED')
process.exit(fails.length ? 1 : 0)
