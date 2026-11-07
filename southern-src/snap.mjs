import { chromium } from 'playwright'
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })
const p = await (await b.newContext({ viewport: { width: Number(process.argv[4] ?? 1280), height: 400 }, deviceScaleFactor: Number(process.argv[5] ?? 1) })).newPage()
await p.goto('file://' + (process.argv[2] ?? '/tmp/truck.html')); await p.screenshot({ path: process.argv[3] ?? '/tmp/truck.png', fullPage: true }); await b.close()
