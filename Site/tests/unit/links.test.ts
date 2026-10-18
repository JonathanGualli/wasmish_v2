import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDemoHref, demoHref, demoMessage } from '../../src/lib/links.ts'

test('demoMessage dice de qué página viene', () => {
  assert.equal(demoMessage('capacitación'), 'Hola, quiero ver una demostración de Wasmish (capacitación)')
})

test('sin número, el botón no tiene enlace (hueco)', () => {
  assert.equal(demoHref('web'), null)
})

// Las tildes y los paréntesis tienen que llegar exactos al WhatsApp de Jonathan.
test('buildDemoHref codifica el texto exacto', () => {
  const href = buildDemoHref('593999999999', 'capacitación')
  assert.match(href, /^https:\/\/wa\.me\/593999999999\?text=/)
  assert.equal(new URL(href).searchParams.get('text'), 'Hola, quiero ver una demostración de Wasmish (capacitación)')
})
