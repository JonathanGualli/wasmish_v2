import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacitacion as story } from '../src/story/capacitacion.ts'
import { checkScenes, totalFrames } from '../src/lib/timeline.ts'
import { checkSubtitles } from '../src/lib/subtitles.ts'
import type { VideoChatItem } from '../src/story/types.ts'
import { sceneCues } from '../src/story/cues.ts'

const textOf = (item: VideoChatItem) => ('text' in item ? item.text : '')
const timeOf = (item: VideoChatItem) => ('time' in item ? item.time : '')

test('las escenas, los subtítulos y la duración cuadran', () => {
  assert.deepEqual(checkScenes(story.scenes), [])
  assert.deepEqual(checkSubtitles(story.subtitles, story.scenes), [])
  assert.equal(totalFrames(story.scenes), 2160)
})

test('cada cue cae dentro de la escena que nombra', () => {
  for (const [name, seconds] of Object.entries(story.cues)) {
    const scene = story.scenes.find((s) => s.id === name.split('.')[0])
    assert.ok(scene, `${name}: no hay una escena con ese nombre`)
    assert.ok(seconds >= scene.from && seconds < scene.to, `${name} (${seconds} s) queda fuera de ${scene.id}`)
  }
})

// Corrección 1 del storyboard: Mónica respondía a las 09:46, después de
// asignarle el chat a Gabriela, y la escena 3 dice que sigue Gabriela.
test('Mónica responde antes de asignar, y Gabriela sigue desde la app', () => {
  const thread = story.kevin.thread
  const reply = thread.findIndex((item) => item.kind === 'out' && item.who === 'Mónica')
  const event = thread.findIndex((item) => item.kind === 'event')
  const fromApp = thread.findIndex((item) => item.kind === 'out-app')
  assert.ok(reply >= 0 && event > reply && fromApp > event)
  assert.ok(timeOf(thread[reply]) < timeOf(thread[event]) && timeOf(thread[event]) < timeOf(thread[fromApp]))
})

// Corrección 2: el bot pone primero la respuesta de la palabra clave y después
// la de fuera de horario (decideAutoReply), y Gabriela no responde antes de que
// abra el centro (8:30).
test('de noche, el bot responde los requisitos y después el horario', () => {
  const bot = story.afterHours.thread.find((item) => item.kind === 'out' && item.who === 'Bot')
  assert.ok(bot)
  const text = textOf(bot)
  assert.ok(text.indexOf('Para inscribirse') >= 0 && text.indexOf('Para inscribirse') < text.indexOf('Atendemos'))
  const gabriela = story.afterHours.thread.find((item) => item.kind === 'out' && item.who === 'Gabriela')
  assert.ok(gabriela && timeOf(gabriela) >= '08:30')
})

// Corrección 3: en la demostración responde Tatiana, no Carolina.
test('el aviso a un grupo cuadra con la demostración', () => {
  const { broadcast } = story
  assert.equal(broadcast.reply.name, 'Tatiana')
  assert.ok(broadcast.read <= broadcast.delivered && broadcast.delivered <= broadcast.sent)
})

// Corrección 4: el número de Kevin era de relleno (+593 98 000 0000).
test('Kevin tiene un número con forma real', () => {
  assert.doesNotMatch(story.kevin.contact.phone, /000 0000$/)
  assert.match(story.kevin.contact.phone, /^\+593 9\d \d{3} \d{4}$/)
})

// Lo que el video no dice (guion): ni IA ni precios.
test('ningún texto habla de IA ni de precios', () => {
  const all = JSON.stringify(story)
  assert.doesNotMatch(all, /\bIA\b/)
  assert.doesNotMatch(all, /chatbot/i)
  assert.doesNotMatch(all, /USD|\$/)
})

test('sceneCues da los cues de una escena en sus cuadros, y falla con un nombre que no existe', () => {
  const at = sceneCues(story, 'recap')
  assert.equal(at('question'), 24)
  assert.throws(() => at('nada'), /recap\.nada/)
})

test('las frases que se marcan están en sus textos', () => {
  const back = story.kevin.thread.find((item) => item.id === 'back')
  assert.ok(back && textOf(back).includes(story.kevin.hookMark))
  assert.ok(story.kevin.note.text.includes(story.kevin.note.highlight))
})
