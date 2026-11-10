/** Shared Playwright helpers for the break tests. Expects `npm run dev` (default http://localhost:5199/). */
import { chromium, webkit, devices } from 'playwright'

export const base = process.env.BASE || 'http://localhost:5199/'

export async function launch() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  return browser
}

export async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(base)
  await page.waitForSelector('[data-role=owner]', { timeout: 30000 })
  return { ctx, page }
}

export async function signIn(page, role) {
  await page.click(`[data-role=${role}]`)
  await page.waitForSelector('[data-testid=bell], [data-testid=field-app]')
}

/** Pick a branch from the company-view sheet. `code` is the branch code, e.g. SLH-MID. */
export async function pickBranch(page, code) {
  await page.click('[data-testid=org-filter]')
  await page.locator('[role=dialog]').getByRole('button', { name: new RegExp(code) }).click()
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(250)
}

export function digits(s) {
  return String(s || '').replace(/\D/g, '')
}

/** How many tappable phone links point at an employee record. Does not return the numbers. */
export async function employeeTelCount(page) {
  return page.evaluate(() => {
    const db = window.__store.getState().db
    const dig = s => String(s || '').replace(/\D/g, '')
    const nums = new Set(db.employees.map(e => dig(e.phone)).filter(n => n.length >= 7))
    return [...document.querySelectorAll('a[href^="tel:"]')].filter(a => nums.has(dig(a.getAttribute('href')))).length
  })
}

export const phone = {
  iphone: devices['iPhone 14'],
  pixel: devices['Pixel 7'],
}

export async function withWebKit(fn) {
  let browser
  try { browser = await webkit.launch({ headless: true }) }
  catch (e) { console.log('SKIP webkit (' + e.message.split('\n')[0] + ')') ; return }
  try { await fn(browser) }
  finally { await browser.close() }
}
