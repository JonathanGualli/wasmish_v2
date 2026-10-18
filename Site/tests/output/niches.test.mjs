import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read, title } from './helpers.mjs'

// Cada página de venta lleva su nicho en el texto del botón (medición sin
// cookies) o, mientras no hay número, el botón como hueco.
for (const [file, label] of [['index.html', 'web'], ['capacitacion.html', 'capacitación'], ['imprentas.html', 'imprentas']]) {
  test(`${file}: el botón dice de qué página viene`, () => {
    const html = read(file)
    assert.ok(html.includes(encodeURIComponent(`Wasmish (${label})`)) || /<button type="button" disabled=""/.test(html))
  })
}

test('cada nicho cuenta su caso', () => {
  const imprentas = read('imprentas.html')
  const capacitacion = read('capacitacion.html')
  assert.notEqual(title('imprentas.html'), title('capacitacion.html'))
  assert.match(imprentas, /qué se le cotizó/)
  assert.match(imprentas, /Cotización volantes A5\.pdf/)
  assert.match(imprentas, /hasta 16 MB/)          // el límite de archivos (brief, § 3.3)
  assert.match(imprentas, /AI o PSD/)
  assert.match(imprentas, /caso de su <!-- -->imprenta|caso de su imprenta/)
  assert.match(capacitacion, /qué se le ofreció/)
  assert.match(capacitacion, /Temario Contabilidad básica\.pdf/)
  assert.match(capacitacion, />horario</)             // su palabra clave
  assert.match(capacitacion, /caso de su <!-- -->centro|caso de su centro/)
})
