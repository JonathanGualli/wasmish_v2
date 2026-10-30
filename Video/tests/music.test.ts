import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MUSIC_FADE_IN, MUSIC_LEVELS, MUSIC_RAMP, musicVolume } from '../src/lib/music.ts'

const gain = (db: number) => 10 ** (db / 20)
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)
// Dos tramos de voz con una pausa larga en medio; la música empieza en 0.
const speech = [{ from: 1, to: 4 }, { from: 6, to: 9 }]

test('musicVolume: debajo de la voz, en las pausas y al final', () => {
  close(musicVolume(2, speech, 0), gain(MUSIC_LEVELS.underVoice))
  close(musicVolume(5, speech, 0), gain(MUSIC_LEVELS.between))
  close(musicVolume(9 + MUSIC_RAMP + 1, speech, 0), gain(MUSIC_LEVELS.ending))
})

test('musicVolume: sube y baja en rampa (en dB) junto a cada tramo de voz', () => {
  const halfway = (MUSIC_LEVELS.underVoice + MUSIC_LEVELS.between) / 2
  close(musicVolume(4 + MUSIC_RAMP / 2, speech, 0), gain(halfway))
  close(musicVolume(6 - MUSIC_RAMP / 2, speech, 0), gain(halfway))
  close(musicVolume(9 + MUSIC_RAMP / 2, speech, 0), gain((MUSIC_LEVELS.underVoice + MUSIC_LEVELS.ending) / 2))
})

test('musicVolume: nada antes de empezar y entrada suave', () => {
  assert.equal(musicVolume(0.5, speech, 1), 0)
  // Empieza en 0,1 s, lejos de la voz (antes del primer tramo, en una pausa).
  close(musicVolume(0.1 + MUSIC_FADE_IN / 2, [{ from: 5, to: 6 }], 0.1), gain(MUSIC_LEVELS.between) / 2)
})

test('musicVolume: la voz siempre manda sobre la música', () => {
  for (let t = 0; t < 12; t += 0.05) assert.ok(musicVolume(t, speech, 0) <= gain(MUSIC_LEVELS.ending) + 1e-9)
  assert.ok(MUSIC_LEVELS.underVoice <= -18)
})
