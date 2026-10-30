import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findWord, normalizeWord, parseAlignment, type VoiceWord } from '../src/lib/voice.ts'

test('parseAlignment descarta los espacios, redondea a centésimas y toma el fin de la última palabra', () => {
  const json = { words: [{ text: 'Si', start: 0.261, end: 0.38 }, { text: ' ', start: 0.38, end: 0.4 }, { text: 'debe', start: 0.4, end: 0.584 }] }
  assert.deepEqual(parseAlignment(json), {
    words: [{ text: 'Si', start: 0.26, end: 0.38 }, { text: 'debe', start: 0.4, end: 0.58 }],
    end: 0.58,
  })
})

test('parseAlignment falla sin words', () => {
  assert.throws(() => parseAlignment({}), /words/)
  assert.throws(() => parseAlignment({ words: [] }), /words/)
})

test('normalizeWord ignora mayúsculas, tildes y signos', () => {
  assert.equal(normalizeWord('«quizá'), 'quiza')
  assert.equal(normalizeWord('¿Su'), 'su')
  assert.equal(normalizeWord('WhatsApp.'), 'whatsapp')
  assert.equal(normalizeWord('más».'), 'mas')
})

test('findWord encuentra la n-ésima, y null si no está', () => {
  const words: VoiceWord[] = ['Si', 'debe', 'seguir', 'Gabriela,', 'Mónica', 'se', 'lo', 'asigna,', 'y', 'a', 'Gabriela', 'le', 'llega']
    .map((text, i) => ({ text, start: i, end: i + 0.5 }))
  assert.equal(findWord(words, 'Gabriela')?.start, 3)
  assert.equal(findWord(words, 'gabriela', 2)?.start, 10)
  assert.equal(findWord(words, 'Gabriela', 3), null)
  assert.equal(findWord(words, 'Kevin'), null)
})
