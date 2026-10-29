import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkScenes, localFrame, sceneFrames, toFrames, totalFrames } from '../src/lib/timeline.ts'

test('toFrames pasa segundos a cuadros a 30 fps', () => {
  assert.equal(toFrames(0.5), 15)
  assert.equal(toFrames(72), 2160)
})

test('sceneFrames da el inicio y la duración de cada escena en cuadros', () => {
  const scenes = [{ id: 'hook', from: 0, to: 6 }, { id: 'recap', from: 6, to: 25 }]
  assert.deepEqual(sceneFrames(scenes), [
    { id: 'hook', from: 0, durationInFrames: 180 },
    { id: 'recap', from: 180, durationInFrames: 570 },
  ])
  assert.equal(totalFrames(scenes), 750)
})

test('checkScenes encuentra huecos, solapes y un inicio que no es 0', () => {
  const gap = checkScenes([{ id: 'hook', from: 0, to: 6 }, { id: 'recap', from: 7, to: 25 }])
  assert.equal(gap.length, 1)
  assert.match(gap[0], /hook/)
  assert.match(gap[0], /recap/)
  assert.equal(checkScenes([{ id: 'hook', from: 0, to: 6 }, { id: 'recap', from: 5, to: 25 }]).length, 1)
  assert.equal(checkScenes([{ id: 'hook', from: 1, to: 6 }]).length, 1)
  assert.deepEqual(checkScenes([{ id: 'hook', from: 0, to: 6 }, { id: 'recap', from: 6, to: 25 }]), [])
})

// Los cues son segundos desde el inicio del video; cada escena los usa en
// cuadros de su propio <Sequence> (revisión de Codex del plan: mezclar las dos
// unidades hacía aparecer las cosas antes de tiempo).
test('localFrame pasa un cue a cuadros de su escena', () => {
  assert.equal(localFrame(6.8, { id: 'recap', from: 6, to: 25 }), 24)
})
