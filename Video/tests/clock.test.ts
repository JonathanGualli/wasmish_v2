import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clockBetween } from '../src/lib/clock.ts'

test('clockBetween va de una hora a otra pasando por la medianoche', () => {
  assert.equal(clockBetween('22:10', '08:35', 0), '22:10')
  assert.equal(clockBetween('22:10', '08:35', 1), '08:35')
  // 625 minutos en total: a la mitad, las 03:23, no una hora de la tarde.
  assert.equal(clockBetween('22:10', '08:35', 0.5), '03:23')
  assert.equal(clockBetween('22:10', '08:35', 2), '08:35')
})
