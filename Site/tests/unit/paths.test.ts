import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePath } from '../../src/lib/paths.ts'

// Cloudflare Pages puede recibir la misma página como /imprentas, /imprentas/ o
// /imprentas.html: las tres tienen que hidratar la de imprentas, no el inicio.
test('normalizePath: una sola forma por página', () => {
  assert.equal(normalizePath('/'), '/')
  assert.equal(normalizePath('/imprentas'), '/imprentas')
  assert.equal(normalizePath('/imprentas/'), '/imprentas')
  assert.equal(normalizePath('/imprentas.html'), '/imprentas')
  assert.equal(normalizePath('/index.html'), '/')
  assert.equal(normalizePath('/Imprentas'), '/imprentas')
})
