import { test } from 'node:test'
import assert from 'node:assert/strict'
import { capacitacion as story } from '../src/story/capacitacion.ts'
import { checkScenes, totalFrames } from '../src/lib/timeline.ts'
import { checkSubtitles } from '../src/lib/subtitles.ts'
import type { VideoChatItem } from '../src/story/types.ts'
import { sceneCues } from '../src/story/cues.ts'
import { capacitacionVoice } from '../src/story/capacitacion.voice.ts'
import { DEFAULT_HOLD } from '../src/story/resolve.ts'
import { TYPING_CHARS_PER_SECOND } from '../src/scenes/shared.ts'

const textOf = (item: VideoChatItem) => ('text' in item ? item.text : '')
const timeOf = (item: VideoChatItem) => ('time' in item ? item.time : '')

test('las escenas y los subtítulos cuadran', () => {
  assert.deepEqual(checkScenes(story.scenes), [])
  assert.deepEqual(checkSubtitles(story.subtitles, story.scenes), [])
})

// La duración sale de la voz: cada escena, su última palabra más el respiro.
test('la duración sale de la voz', () => {
  const frames = totalFrames(story.scenes)
  assert.ok(frames >= 1860 && frames <= 2010, `${frames} cuadros`)
  for (const scene of story.scenes) {
    const hold = scene.to - scene.from - capacitacionVoice[scene.id].end
    assert.ok(hold >= DEFAULT_HOLD - 0.01, `${scene.id}: respiro de ${hold.toFixed(2)} s`)
  }
})

const sceneEnd = (id: string) => story.scenes.find((s) => s.id === id)?.to ?? NaN

// Las animaciones que duran tienen que alcanzar a terminar con la voz.
test('Mónica termina de escribir antes de enviar', () => {
  const reply = story.kevin.thread.find((item) => item.id === 'reply')
  assert.ok(reply)
  const typing = textOf(reply).length / TYPING_CHARS_PER_SECOND
  assert.ok(story.cues['recap.send'] - story.cues['recap.reply'] >= typing, `escribe en ${typing.toFixed(1)} s`)
})

test('las cifras del aviso cuentan antes de que responda Tatiana', () => {
  assert.ok(story.cues['broadcast.reply'] - story.cues['broadcast.stats'] >= 1.2)
})

test('la línea del cambio se ve al menos 0,8 s antes del corte a la pantalla bloqueada', () => {
  assert.ok(story.cues['assign.lock'] - (story.cues['assign.event'] + 0.5) >= 0.8)
})

test('el aviso se queda al menos 2 s en la pantalla bloqueada', () => {
  assert.ok(sceneEnd('assign') - story.cues['assign.notification'] >= 2)
})

test('el logo queda quieto 3 s al final', () => {
  assert.ok(sceneEnd('closing') - (story.cues['closing.logo'] + 0.6) >= 3)
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
  const recap = story.scenes.find((s) => s.id === 'recap')
  assert.ok(recap)
  assert.equal(at('question'), Math.round(story.cues['recap.question'] * 30) - Math.round(recap.from * 30))
  assert.throws(() => at('nada'), /recap\.nada/)
})

test('las frases que se marcan están en sus textos', () => {
  const back = story.kevin.thread.find((item) => item.id === 'back')
  assert.ok(back && textOf(back).includes(story.kevin.hookMark))
  assert.ok(story.kevin.note.text.includes(story.kevin.note.highlight))
})
