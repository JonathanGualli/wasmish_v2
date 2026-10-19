import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDemoHref, demoHref, demoMessage, formatPhone } from '../../src/lib/links.ts'
import { WHATSAPP_NUMBER } from '../../src/site.ts'

test('demoMessage dice de qué página viene', () => {
  assert.equal(demoMessage('capacitación'), 'Hola, quiero ver una demostración de Wasmish (capacitación)')
})

// Sin número, el botón sería un hueco y el CI fallaría desde el lanzamiento.
test('el botón lleva al número de la página', () => {
  assert.ok(WHATSAPP_NUMBER)
  assert.equal(demoHref('web'), buildDemoHref(WHATSAPP_NUMBER, 'web'))
})

// El pie de página y la implementación lo escribían distinto.
test('formatPhone separa el código del país y los grupos', () => {
  assert.equal(formatPhone('593984152777'), '+593 98 415 2777')
})

// Las tildes y los paréntesis tienen que llegar exactos al WhatsApp de Jonathan.
test('buildDemoHref codifica el texto exacto', () => {
  const href = buildDemoHref('593999999999', 'capacitación')
  assert.match(href, /^https:\/\/wa\.me\/593999999999\?text=/)
  assert.equal(new URL(href).searchParams.get('text'), 'Hola, quiero ver una demostración de Wasmish (capacitación)')
})
