import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsonLdBlocks, read } from './helpers.mjs'

// El JSON-LD del inicio y la página dicen el mismo precio (los dos salen de content/price.ts).
test('el inicio lleva sus datos estructurados', () => {
  const home = read('index.html')
  const blocks = jsonLdBlocks(home)
  assert.equal(blocks[0]['@type'], 'Organization')
  const app = blocks.find((b) => b['@type'] === 'SoftwareApplication')
  assert.ok(app, 'Falta el SoftwareApplication')
  assert.deepEqual(app.offers.map((o) => o.price).sort(), ['20', '30'])
  assert.ok(app.offers.every((o) => o.priceCurrency === 'USD'))
  assert.match(home, /USD 20/)
  assert.match(home, /USD 30(<!-- -->)? al mes/)   // React separa los textos contiguos con <!-- -->
  // Las legales no lo llevan.
  assert.equal(jsonLdBlocks(read('privacidad.html')).length, 0)
})

// Las preguntas se abren sin JavaScript, en el orden del brief.
test('las preguntas frecuentes', () => {
  const home = read('index.html')
  assert.equal((home.match(/<details/g) ?? []).length, 10)
  assert.ok(home.indexOf('¿Tengo que dejar la app de WhatsApp Business?') < home.indexOf('¿Responde solo?'))
  // La asignación (1.0.33), justo después de la primera.
  assert.ok(home.indexOf('¿Tengo que dejar la app de WhatsApp Business?') < home.indexOf('¿Cómo se reparten las conversaciones?'))
  assert.ok(home.indexOf('¿Cómo se reparten las conversaciones?') < home.indexOf('¿Puedo escribirle a un cliente cuando quiera?'))
  // Lo que decidió Jonathan al cancelar, no el borrador del diseño.
  assert.match(home, /se los entregamos en Excel/)
})

// Las secciones a las que bajan «Precio» y «Qué cambia».
test('las anclas de la página existen', () => {
  const home = read('index.html')
  assert.match(home, /<section id="precio"/)
  assert.match(home, /<section id="cambios"/)
})

// Las cuatro formas del bot, con «Si no entiende», y un ejemplo de «Probar» que la usa.
test('las respuestas automáticas', () => {
  const home = read('index.html')
  for (const form of ['Bienvenida', 'Fuera de horario', 'Palabras clave', 'Si no entiende']) assert.ok(home.includes(form), form)
  assert.match(home, /aria-pressed="true"/)
})
