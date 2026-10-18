import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'

// Si el patrón de `npm test` no encuentra archivos, Node los salta sin avisar:
// el PR #93 pasó el CI con solo los tests unitarios, porque tests/dist/ estaba
// ignorado por el .gitignore de la raíz y nunca llegó al repo. Este test lo vigila.
test('los tests del HTML generado están en el repo', () => {
  for (const file of ['helpers.mjs', 'pages.test.mjs', 'pending.test.mjs', 'hero.test.mjs', 'content.test.mjs']) {
    assert.ok(existsSync(new URL(`../output/${file}`, import.meta.url)), `Falta tests/output/${file}`)
  }
})
