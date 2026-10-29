import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameraAt, progress } from '../src/lib/motion.ts'

test('progress va de 0 a 1 en su tramo y se queda ahí', () => {
  assert.equal(progress(5, 10, 15), 0)
  assert.equal(progress(10, 10, 15), 0)
  assert.equal(progress(25, 10, 15), 1)
  assert.equal(progress(40, 10, 15), 1)
  // La curva de la cámara no es lineal.
  assert.notEqual(progress(17.5, 10, 15), 0.5)
})

const keys = [
  { at: 0, scale: 1, x: 540, y: 960 },
  { at: 60, scale: 1.45, x: 700, y: 900 },
  { at: 120, scale: 2, x: 600, y: 1100 },
]

test('cameraAt llega a cada llave en 30 cuadros', () => {
  assert.deepEqual(cameraAt(-10, keys), { scale: 1, x: 540, y: 960 })
  assert.deepEqual(cameraAt(45, keys), { scale: 1, x: 540, y: 960 })
  assert.deepEqual(cameraAt(90, keys), { scale: 1.45, x: 700, y: 900 })
  const mid = cameraAt(75, keys)
  assert.ok(mid.scale > 1 && mid.scale < 1.45)
})

test('cameraAt no acerca más de ×1,5', () => {
  assert.equal(cameraAt(200, keys).scale, 1.5)
})
