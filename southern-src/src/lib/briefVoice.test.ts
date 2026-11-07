import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listVoices, pickDefault, resolveVoice, sentences, clampRate } from './briefVoice.ts'

const voices = listVoices([
  { name: 'Google US English', lang: 'en-US', localService: false, voiceURI: 'google-remote' },
  { name: 'English United States', lang: 'en-US', localService: true, voiceURI: 'local-plain' },
  { name: 'Samantha (Enhanced)', lang: 'en-US', localService: true, voiceURI: 'samantha' },
], 'en-US')

test('default stays on the device and prefers a natural local voice', () => {
  const picked = pickDefault(voices, 'en-US')
  assert.equal(picked?.voiceURI, 'samantha')
  assert.equal(picked?.localService, true)
})

test('a missing saved voice falls back and is reported', () => {
  const r = resolveVoice(voices, { voiceURI: 'gone-voice', rate: 1 }, 'en-US')
  assert.equal(r.missing, true)
  assert.equal(r.voice?.voiceURI, 'samantha')
})

test('an online voice is not the default even if its name sounds natural', () => {
  const onlyRemote = listVoices([{ name: 'Neural Online', lang: 'en-US', localService: false, voiceURI: 'net' }], 'en-US')
  assert.equal(pickDefault(onlyRemote, 'en-US'), null)
  assert.equal(onlyRemote[0].natural, false)
})

test('sentences keep the pauses between briefing lines', () => {
  assert.deepEqual(sentences('Good morning. Three jobs are running. Crane 12 is down.'), [
    'Good morning.',
    'Three jobs are running.',
    'Crane 12 is down.',
  ])
})

test('rate stays in a spoken range', () => {
  assert.equal(clampRate(4), 1.1)
  assert.equal(clampRate(0.1), 0.85)
  assert.equal(clampRate(Number.NaN), 0.96)
})
