import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkSubtitles, splitHighlight, subtitleAt, timeSubtitles } from '../src/lib/subtitles.ts'
import { scenes as voiceScenes, voice, word } from './fixtures.ts'

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

test('timeSubtitles: cada frase empieza en su primera palabra y dura hasta la siguiente', () => {
  const subs = timeSubtitles([
    { scene: 'x', text: 'Si debe seguir Gabriela, Mónica se lo asigna,', highlight: 'se lo asigna' },
    { scene: 'x', text: 'y a Gabriela le llega el aviso al celular.' },
  ], voiceScenes, voice)
  assert.equal(subs[0].from, 10 + word('Si').start)
  assert.equal(subs[0].to, 10 + word('y').start)
  assert.equal(subs[0].highlight, 'se lo asigna')
  assert.equal(subs[1].to, Math.round((10 + word('celular').end + 0.3) * 100) / 100)
})

test('timeSubtitles: una frase seguida de palabras sin subtítulo termina 0,3 s después de su última palabra', () => {
  const [sub] = timeSubtitles([{ scene: 'x', text: 'Si debe seguir Gabriela,' }], voiceScenes, voice)
  assert.equal(sub.to, Math.round((10 + word('Gabriela').end + 0.3) * 100) / 100)
})

test('timeSubtitles falla nombrando la frase que no está en la voz', () => {
  assert.throws(() => timeSubtitles([{ scene: 'x', text: 'y a Kevin le llega el aviso' }], voiceScenes, voice), /a Kevin le llega/)
})
