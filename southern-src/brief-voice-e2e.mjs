// Briefing speech uses the browser voice list. No microphone and no network speech service.
import { chromium } from 'playwright'
const base = process.env.BASE || 'http://127.0.0.1:4196/'
const fails = []
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m) }
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] })

async function page() {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  const p = await ctx.newPage()
  await p.addInitScript(() => {
    const state = { voices: [], spoken: [], cancelled: 0, listeners: [] }
    window.__speech = state
    const Orig = window.SpeechSynthesisUtterance
    window.SpeechSynthesisUtterance = class extends Orig {
      constructor(text) { super(text); this.__uri = '' }
      set voice(v) { this.__uri = v?.voiceURI || '' }
      get voice() { return { voiceURI: this.__uri } }
    }
    const synth = window.speechSynthesis
    synth.getVoices = () => state.voices
    synth.cancel = () => { state.cancelled += 1 }
    synth.speak = (u) => {
      const rec = { text: u.text, uri: u.voice?.voiceURI || '', rate: u.rate }
      state.spoken.push(rec)
      setTimeout(() => { try { u.onend?.() } catch { /* */ } }, 20)
    }
    const add = synth.addEventListener.bind(synth)
    synth.addEventListener = (name, fn, opts) => {
      if (name === 'voiceschanged') state.listeners.push(fn)
      else add(name, fn, opts)
    }
    window.__loadVoices = (list) => {
      state.voices = list.map(v => ({ name: v.name, lang: v.lang, voiceURI: v.voiceURI, localService: v.localService !== false, default: false }))
      state.listeners.forEach(fn => fn())
    }
  })
  await p.addInitScript(() => localStorage.setItem('sc-tour-seen', '1'))
  return { ctx, p }
}

{
  const { ctx, p } = await page()
  await p.goto(base)
  await p.click('[data-role=owner]')
  await p.waitForSelector('[data-testid=briefing]')
  await p.waitForTimeout(400)
  ok((await p.evaluate(() => window.__speech.spoken.length)) === 0, 'opening the app does not speak')
  await p.click('[data-testid=briefing]')
  await p.waitForTimeout(200)
  const first = await p.evaluate(() => window.__speech.spoken.length)
  ok(first > 0, 'play speaks only after the button')
  await p.click('[data-testid=briefing]')
  await p.waitForTimeout(250)
  const cancelled = await p.evaluate(() => window.__speech.cancelled)
  ok(cancelled >= 1, 'a second play cancels the one already speaking')
  await p.click('[data-testid=briefing-close]')
  const afterStop = await p.evaluate(() => window.__speech.spoken.length)
  await p.waitForTimeout(300)
  const stayed = await p.evaluate(() => window.__speech.spoken.length)
  ok(stayed === afterStop, 'close stops further sentences')
  await ctx.close()
}

{
  const { ctx, p } = await page()
  await p.addInitScript(() => localStorage.setItem('sc-brief-voice', JSON.stringify({ voiceURI: 'gone-voice', rate: 0.9 })))
  await p.goto(base)
  await p.click('[data-role=owner]')
  await p.waitForSelector('[data-testid=brief-voice]')
  await p.click('[data-testid=brief-voice]')
  ok(await p.locator('[data-testid=brief-voice-loading]').count() === 1 || await p.locator('[data-testid=brief-voice-none]').count() === 1, 'voice list can still be empty when the sheet opens')
  await p.evaluate(() => window.__loadVoices([
    { name: 'Google US English', lang: 'en-US', voiceURI: 'google-remote', localService: false },
    { name: 'English United States', lang: 'en-US', voiceURI: 'local-plain', localService: true },
    { name: 'Samantha (Enhanced)', lang: 'en-US', voiceURI: 'samantha', localService: true },
  ]))
  await p.waitForSelector('[data-testid=brief-voice-option]')
  ok(await p.locator('[data-testid=brief-voice-missing]').count() === 1, 'a saved voice that is not installed is called out')
  const checked = await p.locator('[data-testid=brief-voice-option]:checked').getAttribute('data-uri')
  ok(checked === 'samantha', `the fallback is the local natural voice (${checked})`)
  ok(await p.getByText('More natural').count() >= 1, 'an enhanced local voice is labeled')
  await p.locator('[data-testid=brief-voice-option][data-uri=local-plain]').check()
  await p.click('[data-testid=brief-voice-sample]')
  await p.waitForTimeout(200)
  const sample = await p.evaluate(() => window.__speech.spoken.at(-1))
  ok(sample?.text?.startsWith('Good morning') && sample.uri === 'local-plain', 'listen uses the voice just chosen')
  await ctx.close()
}

await b.close()
console.log(fails.length ? `FAILED ${fails.length}\n` + fails.join('\n') : 'ALL PASS')
process.exit(fails.length ? 1 : 0)
