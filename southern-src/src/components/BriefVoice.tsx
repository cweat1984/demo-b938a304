import { useEffect, useState } from 'react'
import { AudioLines } from 'lucide-react'
import { Sheet } from './ui'
import { BRIEF_SAMPLE, listVoices, loadPref, pickDefault, resolveVoice, savePref, speakBriefing, stopBriefingSpeech, systemVoice, type ListedVoice, type VoicePref } from '../lib/briefVoice'

export function useBriefSpeech() {
  const [voices, setVoices] = useState<ListedVoice[]>([])
  const [loaded, setLoaded] = useState(false)
  const [pref, setPref] = useState<VoicePref>(loadPref)
  useEffect(() => {
    const synth = window.speechSynthesis
    if (!synth) { setLoaded(true); return }
    let stop = false
    const read = () => {
      if (stop) return
      const next = listVoices(synth.getVoices(), navigator.language || 'en')
      setVoices(next)
      if (next.length) setLoaded(true)
    }
    read()
    synth.addEventListener?.('voiceschanged', read)
    const giveUp = window.setTimeout(() => setLoaded(true), 1500)
    return () => { stop = true; window.clearTimeout(giveUp); synth.removeEventListener?.('voiceschanged', read) }
  }, [])
  const nav = typeof navigator === 'undefined' ? 'en' : navigator.language || 'en'
  const resolved = resolveVoice(voices, pref.voiceURI ? pref : null, nav)
  const update = (next: VoicePref) => { setPref(next); savePref(next) }
  return {
    voices,
    loaded,
    pref,
    resolved,
    choose: (voiceURI: string) => update({ ...pref, voiceURI }),
    setRate: (rate: number) => update({ ...pref, rate }),
    speak: (text: string, onEnd?: () => void) => {
      const choice = resolveVoice(voices.length ? voices : listVoices(window.speechSynthesis?.getVoices?.() ?? [], nav), pref.voiceURI ? pref : null, nav).voice
      speakBriefing(text, systemVoice(choice), pref.rate, onEnd)
    },
    stop: stopBriefingSpeech,
    hasSpeech: typeof window !== 'undefined' && 'speechSynthesis' in window,
    naturalDefault: pickDefault(voices, nav)?.natural ?? false,
  }
}

/** Chooses among voices this device already has. Nothing is downloaded and the microphone is not used. */
export default function BriefVoiceButton({ speech }: { speech: ReturnType<typeof useBriefSpeech> }) {
  const [open, setOpen] = useState(false)
  const { voices, loaded, pref, resolved, choose, setRate, hasSpeech } = speech
  const chosen = pref.voiceURI && voices.some(v => v.voiceURI === pref.voiceURI) ? pref.voiceURI : (resolved.voice?.voiceURI ?? '')
  return (
    <>
      <button type="button" data-testid="brief-voice" aria-label="Briefing voice" title="Briefing voice" onClick={() => setOpen(true)} className="size-[44px] grid place-items-center rounded-full hover:bg-surface-2"><AudioLines className="size-5" /></button>
      <Sheet open={open} onClose={() => { speech.stop(); setOpen(false) }} title="Briefing voice" sub="Uses a voice already on this device. Nothing is downloaded, and the microphone stays off.">
        <div className="flex flex-col gap-4 text-sm" data-testid="brief-voice-sheet">
          {!hasSpeech && <p data-testid="brief-voice-none">This browser cannot speak. The briefing stays on screen.</p>}
          {hasSpeech && !loaded && <p data-testid="brief-voice-loading">Looking for voices on this device…</p>}
          {hasSpeech && loaded && !voices.length && <p data-testid="brief-voice-none">No voice is installed in this browser. The briefing stays on screen. You can add a voice in the device settings, then come back.</p>}
          {resolved.missing && <p data-testid="brief-voice-missing">The saved voice isn’t on this device anymore. A voice that is installed here is used instead.</p>}
          {!!voices.length && (
            <div role="radiogroup" aria-label="Voices on this device" className="flex flex-col gap-1">
              {voices.map(v => (
                <label key={v.voiceURI} className="flex items-center gap-3 min-h-[44px] rounded-xl px-2 hover:bg-surface-2">
                  <input type="radio" name="brief-voice" className="size-4" checked={chosen === v.voiceURI} onChange={() => choose(v.voiceURI)} data-testid="brief-voice-option" data-uri={v.voiceURI} />
                  <span className="flex-1 min-w-0"><span className="block font-semibold truncate">{v.name}</span><span className="block text-xs text-muted">{v.lang || 'Language not listed'} · {v.localService ? 'On this device' : 'Online — the browser may send these words to its voice service'}</span></span>
                  {v.natural && <span className="text-[11px] font-semibold text-ok">More natural</span>}
                </label>
              ))}
            </div>
          )}
          <label className="flex items-center gap-3">
            <span className="w-16 text-muted">Speed</span>
            <input data-testid="brief-voice-rate" type="range" min={0.85} max={1.1} step={0.01} value={pref.rate} onChange={e => setRate(Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
            <span className="num w-10 text-right">{pref.rate.toFixed(2)}</span>
          </label>
          <button type="button" data-testid="brief-voice-sample" className="self-start h-11 px-4 rounded-full bg-surface-2 font-semibold" onClick={() => speech.speak(BRIEF_SAMPLE)}>Listen</button>
          <p className="text-xs text-muted">A truly human voice on every phone needs a speech service. This page only uses what the device already offers, and it does not promise the same voice on every browser.</p>
        </div>
      </Sheet>
    </>
  )
}
