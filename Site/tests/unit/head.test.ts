import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderHead } from '../../src/lib/head.ts'

test('renderHead escapa los textos y usa direcciones completas', () => {
  const head = renderHead({
    path: '/imprentas',
    title: 'Wasmish · «Cotice» & "responda"',
    description: 'a < b',
    ogImage: '/og-imprentas-1.png',
  })
  assert.match(head, /<title>Wasmish · «Cotice» &amp; &quot;responda&quot;<\/title>/)
  assert.match(head, /<meta name="description" content="a &lt; b">/)
  assert.match(head, /<link rel="canonical" href="https:\/\/wasmish\.com\/imprentas">/)
  assert.match(head, /<meta property="og:image" content="https:\/\/wasmish\.com\/og-imprentas-1\.png">/)
  assert.match(head, /<meta property="og:locale" content="es_EC">/)
  assert.doesNotMatch(head, /noindex/)
})

test('renderHead marca noindex', () => {
  const head = renderHead({ path: '/404', title: 'x', description: 'y', ogImage: '/og-inicio-1.png', noindex: true })
  assert.match(head, /<meta name="robots" content="noindex">/)
})

// Un </script> dentro de un texto del JSON-LD no puede cerrar el bloque antes de tiempo.
test('renderHead escribe el JSON-LD sin que un texto lo rompa', () => {
  const head = renderHead({
    path: '/', title: 'x', description: 'y', ogImage: '/og-inicio-1.png',
    jsonLd: [{ name: 'a</script><b>' }],
  })
  assert.equal(head.match(/<\/script>/g)?.length, 1)
  const block = head.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)
  assert.ok(block)
  assert.equal(JSON.parse(block[1]).name, 'a</script><b>')
})
