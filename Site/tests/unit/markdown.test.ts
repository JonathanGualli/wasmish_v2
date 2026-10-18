import { test } from 'node:test'
import assert from 'node:assert/strict'
import { markdownToHtml } from '../../src/lib/markdown.ts'

// Con una entrada de prueba, no con el contenido real: cuando se llenen los
// huecos de Privacidad, este test tiene que seguir pasando (revisión de Codex, PR #92).
test('markdownToHtml convierte los huecos y el Markdown', () => {
  const html = markdownToHtml('Lo guardamos [pendiente: 30] días.\n\n## Título\n\nVer [la política](/privacidad).')
  assert.match(html, /<span data-pending>30<\/span>/)
  assert.doesNotMatch(html, /\[pendiente:/)
  assert.match(html, /<h2[^>]*>Título<\/h2>/)
  assert.match(html, /<a href="\/privacidad">la política<\/a>/)
})
