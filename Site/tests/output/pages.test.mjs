import { test } from 'node:test'
import assert from 'node:assert/strict'
import { read } from './helpers.mjs'

// Cada página publicada: su archivo, con el <head> escrito para WhatsApp y Google.
const PAGES = [
  ['index.html', '/'],
  ['privacidad.html', '/privacidad'],
  ['terminos.html', '/terminos'],
]

for (const [file, path] of PAGES) {
  test(`${file}: HTML completo con su head`, () => {
    const html = read(file)
    assert.match(html, /<html lang="es-EC">/)
    assert.match(html, new RegExp(`<link rel="canonical" href="https://wasmish\\.com${path}">`))
    assert.match(html, /<meta name="description" content="[^"]{40,}">/)
    assert.match(html, /<meta property="og:image" content="https:\/\/wasmish\.com\/og-[a-z]+-\d+\.png">/)
    assert.doesNotMatch(html, /<!--(head|app)-->/)
    assert.doesNotMatch(html, /<meta name="robots"/)
  })
}

test('la 404 no se indexa y no hidrata', () => {
  const html = read('404.html')
  assert.match(html, /<meta name="robots" content="noindex">/)
  assert.doesNotMatch(html, /<script type="module"/)
})

// Las legales no cargan JavaScript; las de venta sí, para animarse.
test('solo las páginas de venta hidratan', () => {
  assert.doesNotMatch(read('privacidad.html'), /<script type="module"|rel="modulepreload"/)
  assert.doesNotMatch(read('terminos.html'), /<script type="module"|rel="modulepreload"/)
  assert.match(read('index.html'), /<script type="module"/)
  // El CSS sí va en todas.
  assert.match(read('privacidad.html'), /<link rel="stylesheet"[^>]*href="\/assets\//)
})

test('sitemap.xml y robots.txt', () => {
  const sitemap = read('sitemap.xml')
  assert.match(sitemap, /<loc>https:\/\/wasmish\.com\/<\/loc>/)
  assert.match(sitemap, /<loc>https:\/\/wasmish\.com\/privacidad<\/loc>/)
  assert.doesNotMatch(sitemap, /404/)
  assert.match(read('robots.txt'), /Sitemap: https:\/\/wasmish\.com\/sitemap\.xml/)
})

test('_headers: las direcciones de Pages no se indexan', () => {
  assert.match(read('_headers'), /https:\/\/:project\.pages\.dev\/\*\n\s+X-Robots-Tag: noindex/)
})
