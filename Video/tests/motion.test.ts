import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cameraAt, countUp, dropOffset, DROP_FROM, MAX_BOUNCE, progress, valueAt } from '../src/lib/motion.ts'

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

test('valueAt va de una llave a la siguiente en 30 cuadros, desde donde estaba', () => {
  const scroll = [{ at: 0, value: 420 }, { at: 10, value: 0 }, { at: 60, value: 110 }]
  assert.equal(valueAt(5, scroll), 420)
  assert.equal(valueAt(40, scroll), 0)
  assert.equal(valueAt(90, scroll), 110)
  // Una llave que llega antes de que termine la anterior arranca desde el punto intermedio.
  const early = [{ at: 0, value: 420 }, { at: 10, value: 0 }, { at: 25, value: 110 }]
  const atEarlyKey = valueAt(25, early)
  assert.ok(atEarlyKey > 0 && atEarlyKey < 420)
  assert.equal(valueAt(55, early), 110)
})

// Revisión de Codex (PR «Video 1»): con las llaves desordenadas, valueAt se
// quedaba en la primera; sin llaves, fallaba con un TypeError sin explicación.
test('valueAt ordena las llaves y pide al menos una', () => {
  const unordered = [{ at: 0, value: 1 }, { at: 120, value: 3 }, { at: 60, value: 2 }]
  assert.equal(valueAt(90, unordered), 2)
  assert.throws(() => valueAt(10, []), /al menos una llave/)
  assert.throws(() => cameraAt(10, []), /al menos una llave/)
})

test('dropOffset cae desde arriba, rebota sin pasarse de 20 px y se asienta en su sitio', () => {
  assert.equal(dropOffset(0, 10, 30), -DROP_FROM)
  assert.equal(dropOffset(10, 10, 30), -DROP_FROM)
  const after = Array.from({ length: 60 }, (_, i) => dropOffset(10 + i, 10, 30))
  assert.ok(Math.max(...after) > 0, 'tiene que rebotar')
  assert.ok(Math.max(...after) <= MAX_BOUNCE)
  assert.ok(Math.abs(dropOffset(10 + 30, 10, 30)) < 1, 'en 1 s ya está en su sitio')
})

test('countUp cuenta en enteros de 0 al total', () => {
  assert.equal(countUp(0, 10, 12, 48), 0)
  assert.equal(countUp(22, 10, 12, 48), 48)
  assert.ok(Number.isInteger(countUp(15, 10, 12, 31)))
})
