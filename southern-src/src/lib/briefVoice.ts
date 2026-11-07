/** Browser speech for the daily briefing. Uses voices already installed on this device.
 *  Does not download voices, open the microphone, or call a speech server of our own.
 *  A voice with localService false may be sent to the browser vendor; those are never the default. */

export const BRIEF_VOICE_KEY = 'sc-brief-voice'
export const BRIEF_SAMPLE = 'Good morning. Here is how the daily briefing will sound.'
const DEFAULT_RATE = 0.96

export type ListedVoice = {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
  natural: boolean
}

export type VoicePref = { voiceURI: string; rate: number }

const NATURAL = /\b(enhanced|premium|natural|neural|samantha|daniel|karen|moira|tessa|serena|allison|ava|nicky|aaron|arthur|siri)\b/i

export function clampRate(n: number) {
  if (!Number.isFinite(n)) return DEFAULT_RATE
  return Math.min(1.1, Math.max(0.85, Math.round(n * 100) / 100))
}

export function describeVoice(v: { name: string; lang: string; localService: boolean }, navLang = 'en'): ListedVoice {
  const lang = v.lang || ''
  const localService = v.localService !== false
  return {
    voiceURI: (v as { voiceURI?: string }).voiceURI || v.name,
    name: v.name,
    lang,
    localService,
    natural: localService && NATURAL.test(v.name) && /en/i.test(lang || navLang),
  }
}

export function listVoices(raw: { name: string; lang: string; localService: boolean; voiceURI?: string }[], navLang = 'en'): ListedVoice[] {
  const seen = new Set<string>()
  const out: ListedVoice[] = []
  for (const v of raw) {
    const row = describeVoice(v, navLang)
    if (!row.voiceURI || seen.has(row.voiceURI)) continue
    seen.add(row.voiceURI)
    out.push(row)
  }
  return out.sort((a, b) => rank(b, navLang) - rank(a, navLang) || a.name.localeCompare(b.name))
}

export function rank(v: ListedVoice, navLang: string) {
  const want = (navLang || 'en').toLowerCase().slice(0, 2)
  const lang = v.lang.toLowerCase()
  let score = 0
  if (v.localService) score += 100
  if (lang.startsWith(want)) score += 40
  else if (lang.startsWith('en')) score += 20
  if (v.natural) score += 30
  return score
}

/** Highest-ranked voice that stays on the device. Null when this browser has no local voice. */
export function pickDefault(voices: ListedVoice[], navLang: string): ListedVoice | null {
  const locals = voices.filter(v => v.localService)
  if (!locals.length) return null
  return [...locals].sort((a, b) => rank(b, navLang) - rank(a, navLang))[0]
}

export function resolveVoice(voices: ListedVoice[], pref: VoicePref | null, navLang: string): { voice: ListedVoice | null; missing: boolean } {
  if (pref?.voiceURI) {
    const found = voices.find(v => v.voiceURI === pref.voiceURI)
    if (found) return { voice: found, missing: false }
    if (!voices.length) return { voice: null, missing: true }
    return { voice: pickDefault(voices, navLang), missing: true }
  }
  return { voice: pickDefault(voices, navLang), missing: false }
}

export function loadPref(): VoicePref {
  try {
    const v = JSON.parse(localStorage.getItem(BRIEF_VOICE_KEY) || 'null') as Partial<VoicePref> | null
    if (!v || typeof v !== 'object') return { voiceURI: '', rate: DEFAULT_RATE }
    return { voiceURI: typeof v.voiceURI === 'string' ? v.voiceURI : '', rate: clampRate(v.rate ?? DEFAULT_RATE) }
  } catch { return { voiceURI: '', rate: DEFAULT_RATE } }
}

export function savePref(p: VoicePref) {
  try { localStorage.setItem(BRIEF_VOICE_KEY, JSON.stringify({ voiceURI: p.voiceURI, rate: clampRate(p.rate) })) } catch { /* private mode */ }
}

/** Speak one sentence at a time so the browser can pause the way a person would. */
export function sentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
}

let token = 0

export function stopBriefingSpeech() {
  token += 1
  try { window.speechSynthesis?.cancel() } catch { /* this browser has no speech */ }
}

export function speakBriefing(text: string, voice: SpeechSynthesisVoice | null, rate: number, onEnd?: () => void) {
  stopBriefingSpeech()
  const mine = token
  if (typeof window === 'undefined' || !window.speechSynthesis) { onEnd?.(); return }
  const parts = sentences(text)
  if (!parts.length) { onEnd?.(); return }
  let i = 0
  const step = () => {
    if (mine !== token) return
    if (i >= parts.length) { onEnd?.(); return }
    const u = new SpeechSynthesisUtterance(parts[i])
    u.rate = clampRate(rate)
    if (voice) { u.voice = voice; if (voice.lang) u.lang = voice.lang }
    u.onend = () => {
      i += 1
      if (mine !== token) return
      window.setTimeout(step, 160)
    }
    u.onerror = () => { if (mine === token) onEnd?.() }
    try { window.speechSynthesis.speak(u) } catch { if (mine === token) onEnd?.() }
  }
  // Chrome drops an utterance that starts in the same turn as cancel().
  window.setTimeout(step, 40)
}

export function systemVoice(listed: ListedVoice | null): SpeechSynthesisVoice | null {
  if (!listed || typeof window === 'undefined' || !window.speechSynthesis) return null
  return window.speechSynthesis.getVoices().find(v => (v.voiceURI || v.name) === listed.voiceURI) ?? null
}
