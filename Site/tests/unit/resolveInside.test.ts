import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error: módulo JavaScript de scripts/, sin tipos
import { resolveInside } from '../../scripts/resolveInside.mjs'

// El servidor de las imágenes de vista previa solo entrega archivos de dist/
// (revisión de Codex, PR #96).
test('resolveInside: solo archivos dentro de la carpeta', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'og-'))
  const dist = join(tmp, 'dist')
  mkdirSync(dist)
  mkdirSync(join(tmp, 'dist-private'))
  writeFileSync(join(dist, 'og-inicio.html'), 'ok')
  writeFileSync(join(tmp, 'dist-private', 'secret.txt'), 'no')
  symlinkSync(join(tmp, 'dist-private', 'secret.txt'), join(dist, 'enlace.txt'))

  assert.equal(resolveInside(dist, '/og-inicio.html'), join(dist, 'og-inicio.html'))
  assert.equal(resolveInside(dist, '/..%2fdist-private/secret.txt'), null)   // la carpeta vecina
  assert.equal(resolveInside(dist, '/../dist-private/secret.txt'), null)
  assert.equal(resolveInside(dist, '/enlace.txt'), null)                       // un enlace que sale de dist/
  assert.equal(resolveInside(dist, '/no-existe.html'), null)
  assert.equal(resolveInside(dist, '/'), null)                                 // una carpeta no es un archivo
  assert.equal(resolveInside(dist, '/%ZZ'), null)                              // URL mal formada: no lanza
})
