import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCues } from '../src/story/cues.ts'
import { scenes, voice, word } from './fixtures.ts'

const one = (anchor: Parameters<typeof resolveCues>[0][string], name = 'x.cue') => resolveCues({ [name]: anchor }, scenes, voice)[name]
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`)

test('resolveCues: una palabra, su final, un desplazamiento y la n-ésima', () => {
  close(one({ word: 'asigna' }), 10 + word('asigna').start)
  close(one({ word: 'asigna', edge: 'end', shift: 0.5 }), 10 + word('asigna').end + 0.5)
  close(one({ word: 'Gabriela', nth: 2 }), 10 + word('Gabriela', 2).start)
})

test('resolveCues: desde el inicio de la escena y antes de su final', () => {
  close(one({ at: 0.2 }), 10.2)
  close(one({ beforeEnd: 1 }), 15)
})

test('resolveCues falla con una palabra que no está o una escena que no existe', () => {
  assert.throws(() => one({ word: 'Kevin' }, 'x.nada'), /x\.nada.*Kevin/)
  assert.throws(() => one({ word: 'Gabriela', nth: 3 }, 'x.otra'), /x\.otra/)
  assert.throws(() => one({ at: 0 }, 'y.algo'), /y\.algo/)
})
