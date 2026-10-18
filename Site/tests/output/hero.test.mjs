import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read } from './helpers.mjs'

// Sin JavaScript (WhatsApp, Google, quien lo tenga apagado) la historia del
// hero se lee entera; con JavaScript, el CSS esconde lo marcado `data-later`
// hasta que la animación lo muestra.
test('el hero trae la conversación completa en el HTML', () => {
  const html = read('index.html')
  assert.match(html, /<div class="hero-demo[^"]*"[^>]*data-story="still"/)
  for (const text of ['Hola, ¿tienen la silla Oslo?', 'Catálogo sillas 2026.pdf', 'USD 567 en total', 'Quiere 3 unidades.']) {
    assert.ok(html.includes(text), `Falta en el hero: ${text}`)
  }
  // Lo que llega después de la primera fase se esconde con CSS mientras arranca la animación.
  assert.ok((html.match(/data-later/g) ?? []).length >= 7)
  // La barra de pasos solo se ve si hay animación.
  assert.match(html, /data-motion-only/)
})

test('el botón de la demostración y el enlace a la app', () => {
  const html = read('index.html')
  assert.match(html, /Pedir una demostración/)
  assert.match(html, /Demostración de 15 minutos · Sin compromiso · Le atiende Jonathan/)
  assert.match(html, /href="https:\/\/app\.wasmish\.com\/login"/)
})

test('las legales también llevan cabecera y pie', () => {
  for (const file of ['privacidad.html', 'terminos.html', '404.html']) {
    const html = read(file)
    assert.match(html, /href="\/#precio"/, file)
    assert.match(html, /WhatsApp es una marca de Meta Platforms/, file)
  }
})
