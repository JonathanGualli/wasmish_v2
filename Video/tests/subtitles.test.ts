import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSubtitles, splitHighlight, subtitleAt } from '../src/lib/subtitles.ts'

const scenes = [{ id: 'hook', from: 0, to: 6 }, { id: 'recap', from: 6, to: 25 }]
const a = { text: 'Un interesado vuelve a escribir.', from: 0.5, to: 3 }
const b = { text: '¿Su equipo sabe qué le ofrecieron?', highlight: 'qué le ofrecieron', from: 3, to: 5.6 }

test('subtitleAt incluye el inicio y excluye el final', () => {
  assert.equal(subtitleAt([a, b], 0.5), a)
  assert.equal(subtitleAt([a, b], 3), b)
  assert.equal(subtitleAt([a, b], 5.6), null)
  assert.equal(subtitleAt([a, b], 0.2), null)
})

test('checkSubtitles acepta subtítulos bien puestos', () => {
  assert.deepEqual(checkSubtitles([a, b], scenes), [])
})

test('checkSubtitles encuentra lo que se vería mal', () => {
  // Cruza de una escena a la otra: el corte lo partiría.
  assert.equal(checkSubtitles([{ text: 'x', from: 5, to: 7 }], scenes).length, 1)
  // Se pisan.
  assert.equal(checkSubtitles([a, { text: 'y', from: 2, to: 4 }], scenes).length, 1)
  // La frase clave no está en el texto: no habría qué marcar.
  assert.equal(checkSubtitles([{ text: 'Sin empezar de nuevo', highlight: 'cero', from: 7, to: 8 }], scenes).length, 1)
  // Más de 60 caracteres: no cabe en dos líneas a 48 px.
  assert.equal(checkSubtitles([{ text: 'x'.repeat(61), from: 7, to: 8 }], scenes).length, 1)
})

test('splitHighlight parte el texto alrededor de la frase clave', () => {
  assert.deepEqual(splitHighlight('Sin empezar de cero.', 'de cero'), ['Sin empezar ', 'de cero', '.'])
  assert.deepEqual(splitHighlight('Sin empezar de cero.'), ['Sin empezar de cero.', '', ''])
  assert.deepEqual(splitHighlight('Sin empezar de cero.', 'nada'), ['Sin empezar de cero.', '', ''])
})
