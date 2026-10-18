import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allHtmlFiles, read } from './helpers.mjs'
import { LAUNCHED } from '../../src/site.ts'

// El chequeo de huecos: hasta el lanzamiento solo avisa; desde que LAUNCHED es
// true, una página con un dato pendiente hace fallar el CI y no se publica.
test('ningún hueco en lo publicado (desde el lanzamiento)', () => {
  const pending = allHtmlFiles().filter((file) => read(file).includes('data-pending'))
  if (LAUNCHED) assert.deepEqual(pending, [], `Páginas con huecos: ${pending.join(', ')}`)
  else if (pending.length) console.warn(`Aviso: ${pending.length} páginas con huecos (no bloquea hasta el lanzamiento): ${pending.join(', ')}`)
})

test('ningún hueco del Markdown queda sin convertir', () => {
  for (const file of allHtmlFiles()) assert.doesNotMatch(read(file), /\[pendiente:/, file)
})
